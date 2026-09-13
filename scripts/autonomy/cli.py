"""CLI kontrolera: doctor | status | tick [--dry-run] | pause | resume | report (plan, odjeljak 8, Zadatak 7).

Pokrece se iz POUZDANE instalacije (`python -m scripts.autonomy.cli ...`), ne iz kandidatova worktreea.
Stanje zivi izvan repozitorija: `LEKTA_AUTONOMY_HOME` (zadano %LOCALAPPDATA%\\Lekta\\autonomy odnosno
~/.lekta-autonomy). Konfiguracija: `LEKTA_AUTONOMY_CONFIG` ili `<home>/autonomy.json`; bez nje `tick`
odbija raditi (nema zadane politike koja bi nesto dopustila).

`tick` je deterministicki: skupi signale (bez modela), upisi ih u red, pa u `observe` nacinu stane. U
`propose`/`auto_low_risk` uzima najvise jedan posao i vodi ga kroz faze preko ubrizganih adaptera; svaka faza
se biljezi prije i poslije. `--dry-run` ne poziva model, ne uzima lease, ne otvara PR i ne objavljuje.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import glob
import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
import time
import uuid
from typing import Callable

from .gate import verify_candidate
from .policy import PolicyError, billing_allowed, explain_change, load_config
from .publisher import publish_verified
from .remote import load_remotes, token_fingerprint
from .report import write_report
from .signals import collect
from .store import Store
from .worker import API_KEY_ENV, changed_line_count, changed_paths, prepare_job_via_node, resolve_launcher, run_phase, scrubbed_env

PHASE_ORDER = ("planning", "implementing", "reviewing", "verifying", "ready_to_publish", "publishing")
PHASE_TO_AGENT_PHASE = {"planning": "plan", "implementing": "implement", "reviewing": "review"}
_ATTEST_FIELDS = ("extra_credits_disabled", "model_included")


# --------------------------------------------------------------------------------------------
# Staze i konfiguracija
# --------------------------------------------------------------------------------------------
def home_dir() -> str:
    env = os.environ.get("LEKTA_AUTONOMY_HOME")
    if env:
        return env
    if os.name == "nt":
        return os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "Lekta", "autonomy")
    return os.path.join(os.path.expanduser("~"), ".lekta-autonomy")


def config_path() -> str:
    return os.environ.get("LEKTA_AUTONOMY_CONFIG") or os.path.join(home_dir(), "autonomy.json")


def load_effective_config() -> tuple[dict | None, list[str]]:
    path = config_path()
    if not os.path.isfile(path):
        return None, [f"konfiguracija ne postoji: {path} (predlozak: config/autonomy.example.json)"]
    try:
        return load_config(path), []
    except (PolicyError, ValueError) as exc:
        return None, [f"konfiguracija neispravna: {exc}"]


def open_store(home: str | None = None) -> Store:
    home = home or home_dir()
    os.makedirs(home, exist_ok=True)
    return Store(os.path.join(home, "autonomy.sqlite"))


def load_billing_profile(home: str | None = None) -> dict:
    path = os.path.join(home or home_dir(), "billing-profile.json")
    try:
        with open(path, encoding="utf-8") as fh:
            profile = json.load(fh)
    except (OSError, ValueError):
        return {}
    return profile if isinstance(profile, dict) else {}


def now_ts() -> int:
    return int(time.time())


# --------------------------------------------------------------------------------------------
# doctor
# --------------------------------------------------------------------------------------------
def _version(cmd: str, args: tuple[str, ...] = ("--version",), timeout: int = 20) -> dict:
    info = resolve_launcher(cmd)
    if not info["path"]:
        return {"available": False, "version": None, "launcher": info}
    try:
        out = subprocess.run([info["path"], *args], capture_output=True, text=True, timeout=timeout, shell=False, check=False, env=scrubbed_env())
        text = (out.stdout or out.stderr or "").strip().splitlines()
        return {"available": out.returncode == 0, "version": text[0][:80] if text else None, "launcher": info}
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"available": False, "version": None, "launcher": info, "error": type(exc).__name__}


def _login_status(cmd: str, args: tuple[str, ...], ok_markers: tuple[str, ...]) -> dict:
    info = resolve_launcher(cmd)
    if not info["path"]:
        return {"logged_in": None, "detail": "cli missing"}
    try:
        out = subprocess.run([info["path"], *args], capture_output=True, text=True, timeout=25, shell=False, check=False, env=scrubbed_env())
        text = f"{out.stdout}\n{out.stderr}"
        # Claude Code `auth status` je JSON: loggedIn, authMethod (claude.ai = pretplata), subscriptionType.
        try:
            data = json.loads(out.stdout)
        except ValueError:
            data = None
        if isinstance(data, dict) and "loggedIn" in data:
            method = "subscription" if data.get("authMethod") == "claude.ai" else ("api" if data.get("authMethod") else "unknown")
            return {"logged_in": bool(data.get("loggedIn")), "method": method, "plan": data.get("subscriptionType")}
        logged = out.returncode == 0 and any(m.lower() in text.lower() for m in ok_markers)
        method = "chatgpt" if "chatgpt" in text.lower() else ("api" if "api key" in text.lower() else "unknown")
        return {"logged_in": bool(logged), "method": method}
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"logged_in": None, "detail": type(exc).__name__}


def _word_available() -> dict:
    if os.name != "nt":
        return {"available": False, "detail": "nije Windows"}
    ps = shutil.which("powershell")
    if not ps:
        return {"available": False, "detail": "powershell missing"}
    script = "try { $w = New-Object -ComObject Word.Application; Write-Output ('Word ' + $w.Version); $w.Quit() } catch { Write-Output 'unavailable' }"
    try:
        out = subprocess.run([ps, "-NoProfile", "-Command", script], capture_output=True, text=True, timeout=40, check=False)
        line = (out.stdout or "").strip().splitlines()[-1] if out.stdout.strip() else "unavailable"
        return {"available": line.startswith("Word "), "version": line if line.startswith("Word ") else None}
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"available": False, "detail": type(exc).__name__}


def _resources() -> dict:
    out: dict = {}
    try:
        usage = shutil.disk_usage(home_dir() if os.path.isdir(home_dir()) else os.path.expanduser("~"))
        out["diskFreeGb"] = round(usage.free / 1e9, 1)
    except OSError:
        out["diskFreeGb"] = None
    if os.name == "nt":
        try:
            import ctypes

            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [("dwLength", ctypes.c_uint32), ("dwMemoryLoad", ctypes.c_uint32), ("ullTotalPhys", ctypes.c_uint64),
                            ("ullAvailPhys", ctypes.c_uint64), ("ullTotalPageFile", ctypes.c_uint64), ("ullAvailPageFile", ctypes.c_uint64),
                            ("ullTotalVirtual", ctypes.c_uint64), ("ullAvailVirtual", ctypes.c_uint64), ("ullAvailExtendedVirtual", ctypes.c_uint64)]

            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))  # type: ignore[attr-defined]
            out["ramFreeGb"] = round(stat.ullAvailPhys / 1e9, 2)
        except Exception:  # noqa: BLE001
            out["ramFreeGb"] = None
    return out


def _repo_visibility(repository: str | None) -> dict:
    if not repository or not resolve_launcher("gh")["path"]:
        return {"visibility": None, "detail": "gh missing ili repo nepoznat"}
    try:
        out = subprocess.run([resolve_launcher("gh")["path"], "repo", "view", repository, "--json", "visibility,defaultBranchRef"],
                             capture_output=True, text=True, timeout=25, check=False, shell=False)
        if out.returncode != 0:
            return {"visibility": None, "detail": "gh repo view nije uspio"}
        data = json.loads(out.stdout)
        return {"visibility": str(data.get("visibility", "")).lower(), "defaultBranch": (data.get("defaultBranchRef") or {}).get("name")}
    except (OSError, subprocess.TimeoutExpired, ValueError) as exc:
        return {"visibility": None, "detail": type(exc).__name__}


def _publisher_state(home: str, config: dict | None) -> dict:
    """Postoji li odvojen identitet izdavaca. Samo otisak tokena, nikad vrijednost."""
    from .remote import read_secret_file
    gh = read_secret_file(home, "publisher-token")
    nl = read_secret_file(home, "netlify-token")
    site = read_secret_file(home, "netlify-site")
    return {"githubTokenPresent": bool(gh), "githubTokenFingerprint": token_fingerprint(gh),
            "netlifyTokenPresent": bool(nl), "netlifySiteConfigured": bool(site),
            "enabled": bool((config or {}).get("publisherEnabled")),
            "note": "token mora pripadati ODVOJENOM GitHub identitetu s pravima samo na ovaj repo; radnik ga nikad ne dobiva u okolinu"}


def _config_fingerprint(config: dict | None, tools: dict) -> str:
    payload = {"config": config, "tools": {k: v.get("version") for k, v in tools.items()}}
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


def build_billing_profile(*, doctor: dict, config: dict | None, attest: dict, previous: dict) -> dict:
    """Profil pise ISKLJUCIVO doctor, iz opazanja i vlasnikovih izricitih potvrda. Nedostajuce = zabrana.

    `extra_credits_disabled` i `model_included` se ne mogu procitati programski (nema univerzalnog billing
    API-ja), pa ih vlasnik potvrdjuje zastavicama; bez toga ostaju False i nema modelskog poziva.
    """
    api_env = any(os.environ.get(k) for k in API_KEY_ENV)
    codex = doctor["logins"].get("codex", {})
    claude = doctor["logins"].get("claude", {})
    subscription = bool(codex.get("logged_in") and codex.get("method") == "chatgpt") or bool(claude.get("logged_in") and claude.get("method") == "subscription")
    fingerprint = doctor["configFingerprint"]
    unchanged = previous.get("config_fingerprint") == fingerprint if previous else True
    return {
        "effective_auth": "api_key" if api_env else ("subscription" if subscription else "unknown"),
        "subscription_verified": subscription and not api_env,
        "extra_credits_disabled": bool(attest.get("extra_credits_disabled")),
        "model_included": bool(attest.get("model_included")),
        "configuration_unchanged": bool(unchanged),
        "trusted_observation": True,
        "fable_enabled": bool((config or {}).get("fableEnabled")),
        "approved_models": list(attest.get("models") or previous.get("approved_models") or []),
        "config_fingerprint": fingerprint,
        "observed_at": doctor["observedAt"],
    }


def doctor(*, config: dict | None, config_problems: list[str], write_profile: bool = False, attest: dict | None = None,
           home: str | None = None) -> dict:
    home = home or home_dir()
    tools = {name: _version(name) for name in ("git", "node", "npm", "python", "deno", "codex", "claude", "gh")}
    logins = {
        "codex": _login_status("codex", ("login", "status"), ("logged in",)),
        "claude": _login_status("claude", ("auth", "status"), ("logged in", "authenticated")),
        "gh": _login_status("gh", ("auth", "status"), ("logged in",)),
    }
    report = {
        "observedAt": _dt.datetime.now(tz=_dt.timezone.utc).isoformat(timespec="seconds"),
        "platform": platform.platform(),
        "home": home,
        "configPath": config_path(),
        "configValid": not config_problems,
        "configProblems": config_problems,
        "mode": (config or {}).get("mode"),
        "tools": tools,
        "logins": logins,
        "apiKeyEnvPresent": [k for k in API_KEY_ENV if os.environ.get(k)],
        "word": _word_available(),
        "resources": _resources(),
        "repository": _repo_visibility((config or {}).get("repository")),
        "osIsolation": {"proven": False, "detail": "radnik i izdavac dijele OS korisnika dok se ne postavi zaseban identitet; produkcijska objava ostaje blokirana (plan 4)"},
        "publisher": _publisher_state(home, config),
    }
    report["configFingerprint"] = _config_fingerprint(config, tools)
    previous = load_billing_profile(home)
    profile = build_billing_profile(doctor=report, config=config, attest=attest or {}, previous=previous)
    report["billing"] = {"allowed": billing_allowed(profile), "profile": {k: v for k, v in profile.items() if k != "config_fingerprint"}}
    if write_profile:
        os.makedirs(home, exist_ok=True)
        with open(os.path.join(home, "billing-profile.json"), "w", encoding="utf-8") as fh:
            json.dump(profile, fh, indent=2)
        report["billing"]["written"] = True
    if report["apiKeyEnvPresent"]:
        report["billing"]["warning"] = "API kljuc u okolini: poziv bi isao na API naplatu; blokirano"
    return report


# --------------------------------------------------------------------------------------------
# Zadani adapteri za tick (svi zamjenjivi u testovima)
# --------------------------------------------------------------------------------------------
def default_sources(config: dict, home: str) -> list[dict]:
    sources: list[dict] = []
    for src in config.get("signalSources") or []:
        kind = src.get("kind")
        if kind == "inbox":
            inbox = os.path.join(home, "inbox")
            if not os.path.isdir(inbox):
                sources.append({"id": src.get("id", "inbox"), "kind": "inbox", "items": []})
                continue

            def load_inbox(path=inbox):
                items = []
                for f in sorted(glob.glob(os.path.join(path, "*.json"))):
                    with open(f, encoding="utf-8") as fh:
                        data = json.load(fh)
                    items.extend(data if isinstance(data, list) else [data])
                return items

            sources.append({"id": src.get("id", "inbox"), "kind": "inbox", "loader": load_inbox})
        elif kind == "github_ci":
            gh = resolve_launcher("gh")["path"]
            if not gh:
                sources.append({"id": src.get("id", "ci"), "kind": "github_ci", "unavailable": "gh CLI nije dostupan"})
                continue

            def load_ci(gh=gh, repo=config["repository"], branch=config["baseBranch"], workflows=tuple(src.get("workflows") or ())):
                out = subprocess.run([gh, "run", "list", "--repo", repo, "--branch", branch, "--limit", "40", "--json",
                                      "databaseId,workflowName,headSha,conclusion,status,updatedAt,url,headBranch"],
                                     capture_output=True, text=True, timeout=40, check=False, shell=False, env=scrubbed_env())
                if out.returncode != 0:
                    raise RuntimeError("gh run list nije uspio")
                items = []
                for run in json.loads(out.stdout):
                    if workflows and run.get("workflowName") not in workflows:
                        continue
                    if run.get("status") != "completed":
                        continue
                    ts = run.get("updatedAt")
                    completed = int(_dt.datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()) if ts else None
                    items.append({"repository": repo, "branch": run.get("headBranch"), "workflow": run.get("workflowName"), "job": "",
                                  "sha": run.get("headSha"), "conclusion": run.get("conclusion"), "completed_at": completed,
                                  "url": run.get("url"), "job_id": run.get("databaseId")})
                return items

            sources.append({"id": src.get("id", "ci"), "kind": "github_ci", "repository": config["repository"], "branch": config["baseBranch"], "loader": load_ci})
    return sources


def _agent_for(config: dict, phase: str, task: dict) -> str:
    # Zadani autonomni raspored bez Fablea (plan 3.2): Codex vodi plan i pregled Claude implementacije,
    # Sonnet implementira; kad je implementator Sol, pregled radi Claude (drugi provider), ali nikad Fable.
    if phase == "planning":
        return "astra"
    if phase == "implementing":
        return str(config.get("implementerAgent") or "sonnet")
    implementer = task.get("implementationAgent") or str(config.get("implementerAgent") or "sonnet")
    return "astra" if implementer in ("opus", "sonnet") else "opus"


class DefaultAdapters:
    """Stvarni adapteri: node runner za pripremu posla, worker za poziv, gate za provjeru; izdavac je BLOKIRAN
    dok vlasnik ne konfigurira `remote` s odvojenim identitetom (plan 4: publisherEnabled=false zadano)."""

    def __init__(self, config: dict, home: str):
        self.config = config
        self.home = home
        self.repo = config.get("workerRepoPath") or os.getcwd()

    def run_phase(self, task: dict, phase: str, profile: dict) -> dict:
        agent_phase = PHASE_TO_AGENT_PHASE[phase]
        agent = _agent_for(self.config, phase, task)
        try:
            job = prepare_job_via_node(self.repo, task["signal"].get("scope", {}).get("planTask") or "T00", agent_phase, agent)
        except (RuntimeError, ValueError, OSError) as exc:
            return {"verdict": "blocked", "reason": f"prepare_failed: {type(exc).__name__}", "provider": None}
        art = os.path.join(self.home, "artifacts", task["id"], f"{phase}-{uuid.uuid4().hex[:8]}")
        return run_phase(job, agent_phase, profile, cwd=self.repo, timeout_seconds=int(self.config.get("agentTimeoutMinutes", 30)) * 60, artifact_dir=art)

    def verify(self, task: dict) -> dict:
        def runner(argv):
            out = subprocess.run(argv, cwd=self.repo, capture_output=True, text=True, shell=False, check=False,
                                 timeout=int(self.config.get("gateTimeoutMinutes", 120)) * 60, env=scrubbed_env())
            return out.returncode, out.stdout

        def read_proof():
            try:
                with open(os.path.join(self.repo, "docs", "generated", "RELEASE_PROOF.json"), encoding="utf-8") as fh:
                    return json.load(fh)
            except (OSError, ValueError):
                return None

        head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.repo, capture_output=True, text=True, check=False).stdout.strip()
        paths = changed_paths(self.repo)
        candidate = {"candidateSha": head, "baseSha": task.get("base_sha") or head, "changedPaths": paths}
        key_path = os.path.join(self.home, "verifier.key")
        key = open(key_path, "rb").read() if os.path.isfile(key_path) else b""
        return verify_candidate(candidate, self.config, runner=runner, read_proof=read_proof, signing_key=key or None,
                                created_at=_dt.datetime.now(tz=_dt.timezone.utc).isoformat(timespec="seconds"))

    def classify(self, task: dict) -> tuple[str, list[str]]:
        return explain_change(changed_paths(self.repo), changed_line_count(self.repo), self.config, root=self.repo)

    def publish(self, task: dict, evidence: dict, store: Store, now: int, change_class: str) -> dict:
        # Izdavac postoji samo uz token ODVOJENOG GitHub identiteta u LEKTA_AUTONOMY_HOME/publisher-token; radnikova
        # okolina ga nikad ne vidi (worker.scrubbed_env). Bez njega je odgovor blokada s razlogom, ne tiho nista.
        remotes = load_remotes(self.home, self.config)
        if remotes["remote"] is None:
            return {"status": "blocked", "reason": "publisher_not_configured: " + "; ".join(remotes["reasons"])}
        branch = subprocess.run(["git", "branch", "--show-current"], cwd=self.repo, capture_output=True, text=True, check=False).stdout.strip()
        head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.repo, capture_output=True, text=True, check=False).stdout.strip()
        if not branch or branch in ("master", "main"):
            return {"status": "blocked", "reason": "kandidat nije na zasebnoj grani"}
        push = subprocess.run(["git", "push", "-u", "origin", branch], cwd=self.repo, capture_output=True, text=True, check=False, env=scrubbed_env())
        if push.returncode != 0:
            return {"status": "unknown", "reason": "git push nije uspio ili je ishod nepoznat"}
        signal = task.get("signal") or {}
        candidate = {"candidateSha": head, "branch": branch, "task_id": task["id"],
                     "title": f"autonomy: {signal.get('kind', 'zadatak')} {signal.get('location', '')[:60]}".strip(),
                     "body": f"Automatski pripremljena promjena za signal `{task.get('signal_key')}`.\n\nDokaz: complete={evidence.get('complete')}, "
                             f"staleness={(evidence.get('staleness') or {}).get('verdict')}, klasa={change_class}.\n\nRunner nije proglasio nista `done`: pregled i merge su odvojeni koraci.",
                     "openAutonomyPrs": 0}
        return publish_verified(candidate, evidence, self.config, remote=remotes["remote"], store=store, now=now, change_class=change_class)


# --------------------------------------------------------------------------------------------
# tick
# --------------------------------------------------------------------------------------------
def tick(config: dict, now: int, dry_run: bool, *, store: Store, home: str | None = None, sources: list[dict] | None = None,
         adapters=None, profile: dict | None = None, owner_id: str | None = None) -> dict:
    home = home or home_dir()
    summary: dict = {"now": now, "mode": config.get("mode"), "dryRun": dry_run, "paused": store.is_paused(),
                     "signals": 0, "enqueued": [], "unavailable": [], "rejected": 0, "claimed": None, "phases": [], "outcome": None}
    store.set_policy_version(str(config.get("policyVersion")))
    if summary["paused"]:
        summary["outcome"] = "paused"
        return summary
    src = sources if sources is not None else default_sources(config, home)
    known = {t["signal_key"] for t in store.list_tasks()}
    collected = collect(src, now, dedupe=lambda key: key in known and dry_run)
    summary["signals"] = len(collected.signals)
    summary["unavailable"] = collected.unavailable
    summary["rejected"] = collected.rejected
    if dry_run:
        summary["enqueued"] = [s["signal_key"] for s in collected.signals if s["signal_key"] not in known]
        summary["outcome"] = "dry_run: nista upisano, nista pozvano"
        return summary
    for signal in collected.signals:
        task_id = store.enqueue(signal, now)
        summary["enqueued"].append({"task": task_id, "signal_key": signal["signal_key"]})
    if config.get("mode") == "observe":
        summary["outcome"] = "observe: signali zabiljezeni, nema modelskih ni udaljenih akcija"
        return summary

    profile = profile if profile is not None else load_billing_profile(home)
    if not billing_allowed(profile):
        store.record_event(None, "billing_unknown", {"reason": "profil naplate nije potvrdjen"}, now)
        summary["outcome"] = "billing_unknown: nema modelskih poziva"
        return summary
    adapters = adapters or DefaultAdapters(config, home)
    owner = owner_id or f"{platform.node()}:{os.getpid()}"
    task = store.claim(owner, now, process_start_id=str(os.getpid()), max_new_per_day=int(config["maxNewJobsPerDay"]),
                       max_attempts=int(config["maxAttemptsPerTask"]), lease_seconds=int(config.get("gateTimeoutMinutes", 120)) * 60 + 3600)
    if task is None:
        summary["outcome"] = "idle: nema dospjelog posla ili je limit dosegnut"
        return summary
    summary["claimed"] = task["id"]
    summary["outcome"] = _drive_task(task, config, store, adapters, profile, now, summary)
    return summary


def _drive_task(task: dict, config: dict, store: Store, adapters, profile: dict, now: int, summary: dict) -> str:
    task_id = task["id"]
    status = "planning"
    for phase in ("planning", "implementing", "reviewing"):
        store.record_event(task_id, f"phase_start:{phase}", {}, now)
        result = adapters.run_phase(task, phase, profile)
        store.record_run(task_id, phase, result, now, now)
        summary["phases"].append({"phase": phase, "verdict": result.get("verdict"), "reason": result.get("reason")})
        verdict = result.get("verdict")
        if verdict in ("waiting_quota", "needs_login"):
            store.transition(task_id, status, verdict, {"reason": result.get("reason"), "next_run_at": now + 3600}, now)
            return verdict
        if verdict == "blocked":
            store.transition(task_id, status, "blocked", {"reason": result.get("reason")}, now)
            return "blocked"
        if verdict != "needs_verification":
            store.transition(task_id, status, "failed", {"reason": result.get("reason")}, now)
            return "failed"
        nxt = {"planning": "implementing", "implementing": "reviewing", "reviewing": "verifying"}[phase]
        store.transition(task_id, status, nxt, {}, now)
        status = nxt
    change_class, reasons = adapters.classify(task)
    store.record_event(task_id, "classified", {"class": change_class, "reasons": reasons}, now)
    evidence = adapters.verify(task)
    store.record_event(task_id, "verified", {"complete": evidence.get("complete"), "staleness": evidence.get("staleness"), "controlFilesChanged": evidence.get("controlFilesChanged")}, now)
    summary["phases"].append({"phase": "verifying", "complete": evidence.get("complete"), "class": change_class})
    if not evidence.get("complete"):
        store.transition(task_id, "verifying", "needs_human", {"reason": "dokaz nepotpun", "staleness": evidence.get("staleness")}, now)
        return "needs_human"
    store.transition(task_id, "verifying", "ready_to_publish", {"class": change_class}, now)
    store.transition(task_id, "ready_to_publish", "publishing", {}, now)
    published = adapters.publish(task, evidence, store, now, change_class)
    summary["phases"].append({"phase": "publishing", **{k: published.get(k) for k in ("status", "reason", "pr")}})
    if published.get("status") == "merged":
        store.transition(task_id, "publishing", "monitoring", {"pr": published.get("pr"), "merge_sha": published.get("merge_sha")}, now)
        return "monitoring"
    if published.get("status") == "proposed":
        store.transition(task_id, "publishing", "needs_human", {"pr": published.get("pr"), "reason": "PR ceka ljudski merge"}, now)
        return "proposed"
    if published.get("status") == "unknown":
        store.transition(task_id, "publishing", "blocked", {"reason": published.get("reason")}, now)
        return "unknown"
    store.transition(task_id, "publishing", "needs_human", {"reason": published.get("reason")}, now)
    return "needs_human"


# --------------------------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m scripts.autonomy.cli", description="Lekta autonomni kontroler")
    sub = parser.add_subparsers(dest="command", required=True)
    d = sub.add_parser("doctor", help="verzije alata, prijave, naplata, Word, resursi; ne poziva model")
    d.add_argument("--write-profile", action="store_true", help="zapisi billing-profile.json iz opazanja i potvrda")
    d.add_argument("--attest-extra-credits-disabled", action="store_true", help="vlasnik potvrdjuje da su dodatni krediti iskljuceni")
    d.add_argument("--attest-models", default="", help="modeli potvrdjeni unutar pretplate, odvojeni zarezom")
    sub.add_parser("status")
    t = sub.add_parser("tick")
    t.add_argument("--dry-run", action="store_true")
    p = sub.add_parser("pause")
    p.add_argument("--reason", default="")
    sub.add_parser("resume")
    sub.add_parser("report")
    args = parser.parse_args(argv)

    home = home_dir()
    config, problems = load_effective_config()
    if args.command == "doctor":
        attest = {"extra_credits_disabled": args.attest_extra_credits_disabled, "model_included": bool(args.attest_models),
                  "models": [m.strip() for m in args.attest_models.split(",") if m.strip()]}
        report = doctor(config=config, config_problems=problems, write_profile=args.write_profile, attest=attest, home=home)
        os.makedirs(home, exist_ok=True)
        with open(os.path.join(home, "doctor.json"), "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2, ensure_ascii=False)
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return 0
    store = open_store(home)
    try:
        now = now_ts()
        if args.command == "pause":
            store.set_paused(True, args.reason)
            print("paused")
            return 0
        if args.command == "resume":
            store.set_paused(False)
            print("resumed (needs_login, billing_unknown i blokade politike ostaju dok ih doctor ne razrijesi)")
            return 0
        doctor_report = None
        try:
            with open(os.path.join(home, "doctor.json"), encoding="utf-8") as fh:
                doctor_report = json.load(fh)
        except (OSError, ValueError):
            pass
        if args.command in ("status", "report"):
            last = None
            try:
                with open(os.path.join(home, "last-tick.json"), encoding="utf-8") as fh:
                    last = json.load(fh)
            except (OSError, ValueError):
                pass
            status = write_report(store, home, config=config, now=now, last_tick=last, doctor=doctor_report)
            print(json.dumps(status, indent=2, ensure_ascii=False) if args.command == "status" else f"zapisano: {os.path.join(home, 'status.md')}")
            return 0
        if args.command == "tick":
            if config is None:
                print("tick odbijen: " + "; ".join(problems), file=sys.stderr)
                return 2
            summary = tick(config, now, args.dry_run, store=store, home=home)
            with open(os.path.join(home, "last-tick.json"), "w", encoding="utf-8") as fh:
                json.dump(summary, fh, indent=2, ensure_ascii=False)
            write_report(store, home, config=config, now=now, last_tick=summary, doctor=doctor_report)
            print(json.dumps(summary, indent=2, ensure_ascii=False))
            return 0
    finally:
        store.close()
    return 1


if __name__ == "__main__":
    sys.exit(main())
