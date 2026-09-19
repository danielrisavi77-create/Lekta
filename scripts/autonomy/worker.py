"""Radnik: jedan izolirani poziv providera, strojno citljiv rezultat, prekid CIJELOG stabla procesa.

Ugovor (plan, Zadatak 4): `run_phase(job, phase, profile) -> dict` s poljima `verdict`, `base_sha`,
`candidate_sha`, `requested_model`, `reported_model(s)`, `exit_code`, `process_tree_stopped`, `artifact_paths`.
Verdict je `needs_verification`, `failed`, `waiting_quota`, `needs_login` ili `blocked`. CLI uspjeh nikad
nije `done`; modelova tvrdnja o testu nije gate rezultat.

Poziv je argv niz + stdin, `shell=False`. Tajne (API kljucevi, GitHub/Netlify/Supabase tokeni) se brisu iz
okoline djeteta; prisutan `ANTHROPIC_API_KEY` uz claude poziv je `blocked`, jer bi CLI tada naplacivao API.
"""
from __future__ import annotations

import ctypes
import json
import os
import re
import shutil
import subprocess
import sys
import time
from typing import Iterable

from .policy import PolicyError, billing_allowed, canonical_path

VERDICTS = ("needs_verification", "failed", "waiting_quota", "needs_login", "blocked")

SECRET_ENV_PREFIXES = ("ANTHROPIC_", "OPENAI_", "GITHUB_", "GH_", "NETLIFY_", "SUPABASE_", "LEMONSQUEEZY_", "AWS_", "AZURE_")
SECRET_ENV_EXACT = ("CLAUDE_CODE_OAUTH_TOKEN", "NPM_TOKEN", "NODE_AUTH_TOKEN")
API_KEY_ENV = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_API_KEY")

QUOTA_RE = re.compile(r"(?i)rate.?limit|usage limit|quota|too many requests|\b429\b|overloaded|capacity")
LOGIN_RE = re.compile(r"(?i)not logged in|login required|please (?:run|sign in|log in)|unauthori[sz]ed|\b401\b|invalid api key|authentication failed|session expired|token expired")

_IS_WINDOWS = os.name == "nt"


# --------------------------------------------------------------------------------------------
# Stablo procesa
# --------------------------------------------------------------------------------------------
class ProcessTree:
    """Pokrece dijete tako da se cijelo stablo moze pouzdano ugasiti. Windows: Job Object s
    KILL_ON_JOB_CLOSE; POSIX: nova sesija pa killpg. Ako dodjela u Job ne uspije, `isolated` je False i
    pozivatelj to tretira kao `blocked` (plan 5.2: "ako ciscenje nije dokazano, blocked")."""

    def __init__(self):
        self.job = None
        self.isolated = False
        self.popen: subprocess.Popen | None = None

    def start(self, argv: list[str], *, cwd: str, env: dict, stdin_text: str) -> subprocess.Popen:
        kwargs: dict = dict(cwd=cwd, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False)
        if _IS_WINDOWS:
            CREATE_SUSPENDED = 0x00000004
            kwargs["creationflags"] = CREATE_SUSPENDED
        else:
            kwargs["start_new_session"] = True
        self.popen = subprocess.Popen(argv, **kwargs)
        if _IS_WINDOWS:
            self.isolated = self._assign_job(self.popen)
            self._resume(self.popen)
        else:
            self.isolated = True
        return self.popen

    # -- Windows Job Object -------------------------------------------------------------------
    def _assign_job(self, popen: subprocess.Popen) -> bool:
        try:
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)  # type: ignore[attr-defined]
            job = kernel32.CreateJobObjectW(None, None)
            if not job:
                return False

            class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
                _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64),
                            ("LimitFlags", ctypes.c_uint32), ("MinimumWorkingSetSize", ctypes.c_size_t),
                            ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", ctypes.c_uint32),
                            ("Affinity", ctypes.c_size_t), ("PriorityClass", ctypes.c_uint32), ("SchedulingClass", ctypes.c_uint32)]

            class IO_COUNTERS(ctypes.Structure):
                _fields_ = [(n, ctypes.c_uint64) for n in ("ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
                                                           "ReadTransferCount", "WriteTransferCount", "OtherTransferCount")]

            class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
                _fields_ = [("BasicLimitInformation", JOBOBJECT_BASIC_LIMIT_INFORMATION), ("IoInfo", IO_COUNTERS),
                            ("ProcessMemoryLimit", ctypes.c_size_t), ("JobMemoryLimit", ctypes.c_size_t),
                            ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]

            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000
            JobObjectExtendedLimitInformation = 9
            info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            if not kernel32.SetInformationJobObject(job, JobObjectExtendedLimitInformation, ctypes.byref(info), ctypes.sizeof(info)):
                kernel32.CloseHandle(job)
                return False
            if not kernel32.AssignProcessToJobObject(job, int(popen._handle)):  # type: ignore[attr-defined]
                kernel32.CloseHandle(job)
                return False
            self.job = job
            self._kernel32 = kernel32
            return True
        except Exception:  # noqa: BLE001
            return False

    def _resume(self, popen: subprocess.Popen) -> None:
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)  # type: ignore[attr-defined]
        THREAD_SUSPEND_RESUME = 0x0002
        TH32CS_SNAPTHREAD = 0x00000004

        class THREADENTRY32(ctypes.Structure):
            _fields_ = [("dwSize", ctypes.c_uint32), ("cntUsage", ctypes.c_uint32), ("th32ThreadID", ctypes.c_uint32),
                        ("th32OwnerProcessID", ctypes.c_uint32), ("tpBasePri", ctypes.c_int32), ("tpDeltaPri", ctypes.c_int32),
                        ("dwFlags", ctypes.c_uint32)]

        snap = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0)
        entry = THREADENTRY32()
        entry.dwSize = ctypes.sizeof(THREADENTRY32)
        ok = kernel32.Thread32First(snap, ctypes.byref(entry))
        while ok:
            if entry.th32OwnerProcessID == popen.pid:
                handle = kernel32.OpenThread(THREAD_SUSPEND_RESUME, False, entry.th32ThreadID)
                if handle:
                    kernel32.ResumeThread(handle)
                    kernel32.CloseHandle(handle)
            ok = kernel32.Thread32Next(snap, ctypes.byref(entry))
        kernel32.CloseHandle(snap)

    # -- prekid --------------------------------------------------------------------------------
    def terminate_tree(self) -> bool:
        """Ugasi cijelo stablo. True samo kad je metoda za koju znamo da hvata potomke uspjela."""
        if self.popen is None:
            return True
        if _IS_WINDOWS:
            if self.job is not None:
                ok = bool(self._kernel32.TerminateJobObject(self.job, 137))
                try:
                    self.popen.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    return False
                return ok
            # Bez Joba: taskkill /T je najbolje sto imamo, ali ne dokazuje unucad; javljamo False.
            subprocess.run(["taskkill", "/T", "/F", "/PID", str(self.popen.pid)], capture_output=True, check=False)
            return False
        import signal as _signal
        try:
            os.killpg(os.getpgid(self.popen.pid), _signal.SIGKILL)
        except ProcessLookupError:
            return True
        except Exception:  # noqa: BLE001
            return False
        try:
            self.popen.wait(timeout=10)
        except subprocess.TimeoutExpired:
            return False
        return True

    def close(self) -> None:
        if _IS_WINDOWS and self.job is not None:
            self._kernel32.CloseHandle(self.job)
            self.job = None


def pid_alive(pid: int) -> bool:
    """Postoji li proces s tim PID-om (bez psutil-a)."""
    if _IS_WINDOWS:
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)  # type: ignore[attr-defined]
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        STILL_ACTIVE = 259
        handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, int(pid))
        if not handle:
            return False
        code = ctypes.c_uint32()
        ok = kernel32.GetExitCodeProcess(handle, ctypes.byref(code))
        kernel32.CloseHandle(handle)
        return bool(ok) and code.value == STILL_ACTIVE
    try:
        os.kill(int(pid), 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


# --------------------------------------------------------------------------------------------
# Okolina i pokretac
# --------------------------------------------------------------------------------------------
def scrubbed_env(base: dict | None = None) -> dict:
    env = dict(os.environ if base is None else base)
    for key in list(env):
        upper = key.upper()
        if upper in SECRET_ENV_EXACT or upper.startswith(SECRET_ENV_PREFIXES):
            del env[key]
    return env


def resolve_launcher(command: str) -> dict:
    """Stvarna izvrsna datoteka za naredbu; na Windowsu .cmd shim je zabiljezen, ne pretpostavljen."""
    path = shutil.which(command)
    if not path:
        return {"command": command, "path": None, "kind": "missing"}
    ext = os.path.splitext(path)[1].lower()
    kind = "cmd_shim" if ext in (".cmd", ".bat") else ("script" if ext in (".ps1", ".py", ".mjs", ".js") else "native")
    return {"command": command, "path": path, "kind": kind}


def prepare_job_via_node(root: str, task_id: str, phase: str, agent: str, *, timeout: int = 60) -> dict:
    """Priprema posla postojecim runnerom (scripts/agents/cli.mjs prepare). Ne poziva model."""
    result = subprocess.run(
        ["node", os.path.join(root, "scripts", "agents", "cli.mjs"), "prepare", task_id, "--phase", phase, "--agent", agent, "--subscription"],
        cwd=root, capture_output=True, text=True, timeout=timeout, shell=False, check=False, env=scrubbed_env(),
    )
    if result.returncode != 0:
        raise RuntimeError(f"prepare failed: {result.stderr.strip()[:300]}")
    job = json.loads(result.stdout)
    if not job.get("dryRun"):
        raise RuntimeError("prepare je vratio nesto sto nije priprema")
    return job


def classify_stream(text: str) -> str | None:
    if LOGIN_RE.search(text or ""):
        return "needs_login"
    if QUOTA_RE.search(text or ""):
        return "waiting_quota"
    return None


def parse_provider_output(command: str, stdout: str, exit_code: int | None) -> dict:
    """Zrcalo `parseResult` iz scripts/agents/core.mjs: uspjeh trazi strukturiran dokaz, ne samo exit 0."""
    out = {"ok": False, "reported_models": [], "reason": None}
    if exit_code != 0:
        out["reason"] = f"exit_code={exit_code}"
        return out
    try:
        if command == "claude":
            data = json.loads(stdout)
            out["ok"] = data.get("subtype") == "success" and data.get("is_error") is False
            out["reported_models"] = sorted((data.get("modelUsage") or {}).keys())
            if not out["ok"]:
                out["reason"] = f"claude subtype={data.get('subtype')}"
            return out
        events = [json.loads(line) for line in stdout.strip().splitlines() if line.strip()]
        types = {e.get("type") for e in events}
        out["ok"] = "turn.completed" in types and not ({"turn.failed", "error"} & types)
        out["reported_models"] = sorted({e["model"] for e in events if isinstance(e.get("model"), str)})
        if not out["ok"]:
            out["reason"] = "codex bez turn.completed ili s greskom"
        return out
    except (ValueError, TypeError, AttributeError):
        out["reason"] = "neispravan ili truncirani JSON"
        return out


def model_matches(requested: str | None, reported: list[str]) -> bool:
    if not reported:
        return True  # nepoznato; zabiljezeno kao prazna lista, gate to vidi
    req = (requested or "").lower()
    return any(req and (req in m.lower() or m.lower() in req) for m in reported)


def run_phase(job: dict, phase: str, profile: dict, *, cwd: str, timeout_seconds: int = 1800,
              artifact_dir: str | None = None, env: dict | None = None, now: float | None = None) -> dict:
    """Jedan poziv providera. Nikad ne baca zbog ponasanja djeteta; svaki ishod je verdict."""
    started = time.time() if now is None else now
    result = {
        "verdict": "blocked", "reason": None, "phase": phase, "provider": job.get("command"),
        "requested_model": job.get("requestedModel"), "reported_models": [], "exit_code": None,
        "process_tree_stopped": True, "isolated": None, "artifact_paths": [], "base_sha": job.get("baseSha"),
        "candidate_sha": None, "launcher": None, "duration_s": 0.0,
    }
    if phase not in ("plan", "implement", "review"):
        result["reason"] = f"nepoznata faza: {phase}"
        return result
    if not billing_allowed(profile):
        result["reason"] = "billing_unknown: profil naplate nije potvrdjen"
        return result
    base_env = scrubbed_env(env)
    parent_env = os.environ if env is None else env
    if job.get("command") == "claude" and any(parent_env.get(k) for k in API_KEY_ENV):
        result["reason"] = "api_key_present: ANTHROPIC_API_KEY bi prebacio naplatu na API"
        return result
    if job.get("command") == "claude" and str(job.get("requestedModel", "")).lower().startswith("fable") and not profile.get("fable_enabled"):
        result["reason"] = "fable_disabled: model nije u autonomnom profilu"
        return result
    launcher = resolve_launcher(str(job.get("command")))
    result["launcher"] = launcher
    if launcher["path"] is None:
        result["reason"] = f"launcher_missing: {job.get('command')}"
        return result
    argv = [launcher["path"], *[str(a) for a in job.get("args") or []]]
    if any("\n" in a or "\x00" in a for a in argv):
        result["reason"] = "argv sadrzi kontrolne znakove"
        return result
    if artifact_dir:
        os.makedirs(artifact_dir, exist_ok=True)
        prompt_path = os.path.join(artifact_dir, "prompt.md")
        with open(prompt_path, "w", encoding="utf-8") as fh:
            fh.write(str(job.get("prompt") or ""))
        result["artifact_paths"].append(prompt_path)

    tree = ProcessTree()
    stdout = stderr = ""
    timed_out = False
    try:
        popen = tree.start(argv, cwd=cwd, env=base_env, stdin_text=str(job.get("prompt") or ""))
        result["isolated"] = tree.isolated
        if not tree.isolated:
            tree.terminate_tree()
            result["reason"] = "isolation_unproven: proces nije mogao uci u Job Object"
            result["process_tree_stopped"] = False
            return result
        try:
            stdout, stderr = popen.communicate(input=str(job.get("prompt") or "").encode("utf-8"), timeout=timeout_seconds)
            stdout = stdout.decode("utf-8", "replace")
            stderr = stderr.decode("utf-8", "replace")
        except subprocess.TimeoutExpired:
            timed_out = True
            result["process_tree_stopped"] = tree.terminate_tree()
            try:
                out_b, err_b = popen.communicate(timeout=5)
                stdout, stderr = out_b.decode("utf-8", "replace"), err_b.decode("utf-8", "replace")
            except Exception:  # noqa: BLE001
                pass
        result["exit_code"] = popen.returncode
    finally:
        tree.close()
        result["duration_s"] = round(time.time() - started, 3) if now is None else 0.0

    if artifact_dir:
        for name, text in (("stdout.log", stdout), ("stderr.log", stderr)):
            path = os.path.join(artifact_dir, name)
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(text)
            result["artifact_paths"].append(path)

    if timed_out:
        result["verdict"] = "failed" if result["process_tree_stopped"] else "blocked"
        result["reason"] = "timeout" if result["process_tree_stopped"] else "timeout: stablo procesa NIJE dokazano ugaseno"
        return result

    stream_verdict = classify_stream(stderr) or classify_stream(stdout if result["exit_code"] != 0 else "")
    if stream_verdict:
        result["verdict"] = stream_verdict
        result["reason"] = "provider javio limit ili prijavu; pokusaj se ne trosi"
        return result

    parsed = parse_provider_output(str(job.get("command")), stdout, result["exit_code"])
    result["reported_models"] = parsed["reported_models"]
    if not parsed["ok"]:
        result["verdict"] = "failed"
        result["reason"] = parsed["reason"]
        return result
    if not model_matches(result["requested_model"], parsed["reported_models"]):
        result["verdict"] = "failed"
        result["reason"] = f"model_mismatch: trazen {result['requested_model']}, prijavljen {parsed['reported_models']}"
        return result
    result["verdict"] = "needs_verification"
    result["reason"] = "CLI je zavrsio strukturiranim uspjehom; nista jos nije provjereno"
    return result


# --------------------------------------------------------------------------------------------
# Snapshot promjena u radnikovu stablu
# --------------------------------------------------------------------------------------------
def changed_paths(cwd: str) -> list[str]:
    out = subprocess.run(["git", "status", "--porcelain", "-z"], cwd=cwd, capture_output=True, text=True, check=False, shell=False)
    if out.returncode != 0:
        raise RuntimeError("git status nije uspio")
    paths: list[str] = []
    for entry in out.stdout.split("\x00"):
        if len(entry) > 3:
            paths.append(entry[3:])
    return paths


def changed_line_count(cwd: str) -> int:
    out = subprocess.run(["git", "diff", "--numstat", "HEAD"], cwd=cwd, capture_output=True, text=True, check=False, shell=False)
    if out.returncode != 0:
        return -1
    total = 0
    for line in out.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            for p in parts[:2]:
                if p.isdigit():
                    total += int(p)
    return total


def diff_within_scope(changed: Iterable[str], allowed: Iterable[str]) -> tuple[bool, list[str]]:
    """Sve promijenjene staze moraju biti unutar dopustenih (datoteka ili prefiks). Vraca (ok, prekrsitelji)."""
    allow = [canonical_path(a) for a in allowed]
    bad: list[str] = []
    for path in changed:
        try:
            rel = canonical_path(path)
        except PolicyError:
            bad.append(path)
            continue
        if not any(rel == a or rel.startswith(a.rstrip("/") + "/") for a in allow):
            bad.append(rel)
    return (not bad), bad
