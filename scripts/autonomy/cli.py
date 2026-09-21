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
from .worker import (API_KEY_ENV, WORKER_COMMIT_TRAILER, branch_changed_line_count, branch_changed_paths,
                     changed_line_count, changed_paths, commit_worker_tree, implementation_worktree_blocked,
                     prepare_job_via_node, resolve_base_ref, resolve_launcher, run_phase, scrubbed_env,
                     start_job_branch)

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


def _worker_repo_state(config: dict | None) -> dict:
    """Moze li implementacija uopce krenuti u ovoj instalaciji, i zasto ne.

    Bez ovoga je jedini nacin da operater sazna da `workerRepoPath` nije postavljen bio tick koji zavrsi kao
    `blocked`, a do 2026-09-13 ni to: `implement` nije bio dostizan pa se preduvjet nikad nije ni mjerio.
    """
    cfg = config or {}
    declared = cfg.get("workerRepoPath")
    repo = declared or os.getcwd()
    dedicated = bool(declared) and os.path.realpath(repo) != os.path.realpath(os.getcwd())
    return {"path": repo, "declared": bool(declared), "dedicated": dedicated,
            "blocked": implementation_worktree_blocked(repo, dedicated=dedicated)}


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
        "workerRepo": _worker_repo_state(config),
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


def _resolve_ready_plan_task(repo: str, task: dict) -> tuple[str | None, str]:
    """Ciljni zadatak iz koordinatorova reda, ili razlog zasto ga nema.

    Cita `docs/agents/tasks.json` SAMO za citanje; kontroler taj red nikad ne mijenja. Do 2026-09-13 je
    `run_phase` slao `planTask or "T00"` bez ijedne provjere, pa je faza plana trosila poziv modela nad
    zadatkom koji je `done` (T00), a `implement` je odmah padao u prepareJob na `T00 must be ready`.
    Zato se ovo razrjesava PRIJE ijednog poziva modela, a promasaj je `needs_human`, ne potrosen pokusaj.
    """
    scope = (task.get("signal") or {}).get("scope") or {}
    plan_task = scope.get("planTask")
    if not isinstance(plan_task, str) or not plan_task:
        # Razlika je vazna operateru: nenapisan kljuc trazi dopunu inbox datoteke, a odbijen oblik ispravak.
        # Jedna poruka za oba slucaja salje ga da trazi ono sto je vec napisao.
        rejected = scope.get("planTaskRejected")
        if rejected:
            return None, f"no_ready_plan_task: planTask '{rejected}' nije u obliku Tnn"
        return None, "no_ready_plan_task: signal nema planTask"
    try:
        with open(os.path.join(repo, "docs", "agents", "tasks.json"), encoding="utf-8") as fh:
            queue = json.load(fh)
        by_id = {t["id"]: t for t in queue["tasks"]}
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        return None, f"no_ready_plan_task: red zadataka nije citljiv ({type(exc).__name__})"
    target = by_id.get(plan_task)
    if target is None:
        return None, f"no_ready_plan_task: {plan_task} nije u redu"
    if target.get("status") != "ready":
        return None, f"no_ready_plan_task: {plan_task} je {target.get('status')}, ne ready"
    for dependency in target.get("dependsOn") or []:
        if (by_id.get(dependency) or {}).get("status") != "done":
            return None, f"no_ready_plan_task: ovisnost {dependency} nije done"
    return plan_task, ""


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
        # Je li radnikovo stablo OPERATER deklarirao. Prazan `workerRepoPath` znaci instalacijski checkout
        # (`install-windows.ps1` pokrece zadatak s cwd = checkout), a to je stablo iz kojeg kontroler radi i u
        # koje agent s pravom pisanja ne smije pisati. Deklaracija koja pokazuje bas na to stablo se ne priznaje.
        self.repo_declared = (bool(config.get("workerRepoPath"))
                              and os.path.realpath(self.repo) != os.path.realpath(os.getcwd()))
        # Tko je implementirao koji zadatak U OVOM ticku. Zivi koliko i adapter (jedan `_drive_task` prolaz) i
        # zamjenjuje `task.implementationAgent` iz `docs/agents/tasks.json`, koji kontroler ne smije pisati.
        self._implementer_by_task: dict[str, str] = {}
        # Snimka promjena radnikova stabla, uzeta PRIJE commita. Klasifikacija i verifikacija mjere ono sto je
        # implementacija napisala, pa ne smiju citati `git status` nakon sto ga commit isprazni.
        self._changes: dict | None = None
        # Je li u OVOM poslu ijedna faza vec prosla gard. Nakon prve, prljavo stablo je djelo samog kontrolera.
        self._phase_started = False
        # Je li gard PRVE faze potvrdio da je stablo bilo CISTO. To je jedini razlog zbog kojeg kontroler
        # smije reci da je prljavo stablo na kraju posla njegovo djelo. Kad je posao odbijen prije toga
        # (nema ciljnog zadatka, stablo nije cisto, priprema pala), stablo nije njegovo i ostaje NETAKNUTO.
        self._clean_at_start = False
        # Je li faza `implement` stvarno pokrenula providera u ovom poslu. Bez nje kontroler nije napisao ni
        # bajt, pa nema sto spremiti; svako spremanje bi bilo commit tudjeg rada.
        self._implemented = False
        # Grana i osnovica OVOG posla. Grana se reze prije implementacije, pa ono sto `publish` gura sadrzi
        # tocno ono sto je ovaj posao napisao, a ne i commite ranijih (i odbijenih) poslova.
        self._job_branch: str | None = None
        self._base_ref: str | None = None
        self._base_sha: str | None = None
        self._base_error: str | None = None

    def run_phase(self, task: dict, phase: str, profile: dict) -> dict:
        agent_phase = PHASE_TO_AGENT_PHASE[phase]
        # PRVO red, pa tek onda model. Bez razrjesivog `ready` zadatka ne krece nijedan poziv i pokusaj ostaje.
        plan_task, reason = _resolve_ready_plan_task(self.repo, task)
        if plan_task is None:
            return {"verdict": "needs_human", "reason": reason, "provider": None,
                    "attempt_spent": False, "provider_called": False}
        # Radnikovo stablo se provjerava na SVAKOJ fazi, dakle i prije plana. Posao koji ne moze proci kroz
        # implementaciju ne smije prije toga potrositi poziv modela i dnevni slot: bez toga svaki tick placa puni
        # plan pa padne na `implement_unsafe`, a uz `maxNewJobsPerDay=3` to je do tri uzaludna poziva dnevno.
        # CISTOCA se trazi samo na PRVOJ fazi posla: poslije nje stablo prlja sam kontroler, pa bi ista provjera
        # oborila pregled vlastitog posla (izmjereno: `reviewing` je zavrsavao kao `radno stablo nije cisto`).
        first_phase = not self._phase_started
        unsafe = implementation_worktree_blocked(self.repo, dedicated=self.repo_declared,
                                                 require_clean=first_phase)
        if unsafe:
            return {"verdict": "blocked", "reason": unsafe, "provider": None,
                    "attempt_spent": False, "provider_called": False}
        if first_phase:
            # Gard je upravo potvrdio da je stablo CISTO. Tek od ove tocke sve prljavo u njemu pripada ovom
            # poslu, i tek od nje kontroler uopce smije pomisljati na spremanje. Posao odbijen prije toga
            # ostavlja stablo netaknutim.
            self._clean_at_start = True
        self._phase_started = True
        override_status = override_implementer = None
        lookup_task = task
        if agent_phase == "review":
            # Recenzenta bira IMPLEMENTATOR iz ovog ticka, ne tasks.json. Bez zapisa nema pogadjanja: pogodjen
            # implementator moze slucajno biti isti provider kao recenzent, cime bi pravilo o drugom provideru
            # tiho otislo. Blokada je fail-safe i ne trosi pokusaj.
            implementer = self._implementer_by_task.get(task["id"])
            if implementer is None:
                return {"verdict": "blocked", "reason": "implementer_unknown: ovaj tick nema zapis o implementatoru",
                        "provider": None, "attempt_spent": False, "provider_called": False}
            lookup_task = {**task, "implementationAgent": implementer}
            override_status, override_implementer = "in_review", implementer
        agent = _agent_for(self.config, phase, lookup_task)
        try:
            job = prepare_job_via_node(self.repo, plan_task, agent_phase, agent,
                                       override_status=override_status, override_implementer=override_implementer)
        except (RuntimeError, ValueError, OSError) as exc:
            # Priprema je node poziv bez modela; kad padne, ni jedan token nije potrosen, pa ni pokusaj ni
            # dnevni slot ne smiju biti potroseni. Zadatak ostaje `blocked` i ceka covjeka, dakle ne vrti se u krug.
            return {"verdict": "blocked", "reason": f"prepare_failed: {type(exc).__name__}", "provider": None,
                    "attempt_spent": False, "provider_called": False}
        if agent_phase == "implement":
            self._implementer_by_task[task["id"]] = agent
            if self._job_branch is None:
                # Grana se reze neposredno prije JEDINE faze koja pise, i nad jos cistim stablom. Ranije
                # (npr. u planu) bi svaki posao koji padne prije implementacije bez razloga premjestio
                # radnikovo stablo na novu granu; kasnije bi commit vec bio na dijeljenoj grani.
                started = self._start_job_branch(task)
                if started is not None:
                    return started
        art = os.path.join(self.home, "artifacts", task["id"], f"{phase}-{uuid.uuid4().hex[:8]}")
        result = run_phase(job, agent_phase, profile, cwd=self.repo, timeout_seconds=int(self.config.get("agentTimeoutMinutes", 30)) * 60, artifact_dir=art)
        if agent_phase == "implement":
            # Od ovog trenutka u stablu moze biti nesto sto je NAPISAO ovaj posao, pa ga kontroler smije
            # spremiti. Zastavica se postavlja i kad verdict nije uspjeh: model je vec mogao pisati datoteke.
            self._implemented = True
        result["agent"] = agent
        result["plan_task"] = plan_task
        return result

    def _start_job_branch(self, task: dict) -> dict | None:
        """Odrezi granu OVOG posla od osnovice. Vrati blokadu kad to ne uspije, inace None.

        Dokaz se racuna po poslu, pa i grana mora biti po poslu. Dok su svi poslovi dijelili jednu granu,
        `verify` je mjerio samo svoju snimku, a `publish` je gurao i commite ranijih, ukljucivo odbijenih
        poslova; `controlFilesChanged` ih tako nikad nije vidio (izmjereno 2026-09-19).
        """
        base_branch = str(self.config.get("baseBranch") or "master")
        base_ref = resolve_base_ref(self.repo, base_branch)
        if base_ref is None:
            # Fail-closed: bez osnovice se ne moze reci ni sto grana nosi ni od cega bi se rezala.
            self._base_error = f"base_unresolved: nema lokalne reference za {base_branch}"
            return {"verdict": "blocked", "reason": self._base_error, "provider": None,
                    "attempt_spent": False, "provider_called": False}
        branch = f"autonomy/{str(task.get('id'))[:8]}"
        started = start_job_branch(self.repo, branch, base_ref)
        if started.get("status") != "ok":
            return {"verdict": "blocked", "reason": f"job_branch_failed: {started.get('reason')}",
                    "provider": None, "attempt_spent": False, "provider_called": False}
        self._job_branch = branch
        self._base_ref = base_ref
        self._base_sha = started.get("base_sha")
        return None

    def _snapshot(self) -> dict:
        """Sve sto bi objava gurnula: promjene radnog stabla PLUS commite grane iznad osnovice.

        Dvije liste su namjerno odvojene. `worktree_paths` je jedino sto se smije commitati (to je napisala
        implementacija ovog posla), a `paths` je ono sto klasifikacija i verifikacija moraju vidjeti, jer
        `publish` gura CIJELU granu, ne samo zadnji commit.
        """
        if self._changes is None:
            worktree = changed_paths(self.repo)
            lines = changed_line_count(self.repo)
            branch_paths: list[str] = []
            if self._base_ref:
                try:
                    branch_paths = branch_changed_paths(self.repo, self._base_ref)
                    lines += branch_changed_line_count(self.repo, self._base_ref)
                except (RuntimeError, OSError, subprocess.SubprocessError) as exc:
                    self._base_error = f"base_diff_failed: {type(exc).__name__}"
            elif self._base_error is None:
                self._base_error = "base_unresolved: osnovica grane nije poznata"
            self._changes = {"worktree_paths": worktree,
                             "paths": sorted(dict.fromkeys([*worktree, *branch_paths])),
                             "lines": lines}
        return self._changes

    def commit(self, task: dict) -> dict:
        """Spremi ono sto je IMPLEMENTACIJA OVOG POSLA napisala, i nista drugo.

        Tri uvjeta su kumulativna i svaki je pokriven mutacijom: gard prve faze je potvrdio cisto stablo,
        faza `implement` je stvarno pokrenuta, i commitaju se samo staze iz snimke. Do 2026-09-19 nijedan
        nije stajao: posao odbijen PRIJE ijedne faze isao je kroz isti put, a `git add -A` je commitao tudji
        necommitani rad, u zadanoj konfiguraciji na master granu instalacijskog checkouta.
        """
        if not self._clean_at_start:
            return {"status": "skipped", "reason": "stablo nije bilo cisto na pocetku posla; nije nase"}
        if not self._implemented:
            return {"status": "skipped", "reason": "implementacija nije pokrenuta; nema sto spremiti"}
        snap = self._snapshot()
        paths = snap["worktree_paths"]
        if not paths:
            return {"status": "clean", "reason": "implementacija nije nista promijenila"}
        signal = task.get("signal") or {}
        title = f"autonomija: {signal.get('kind', 'zadatak')} {str(signal.get('location') or '')[:60]}".strip()
        body = f"Signal: {task.get('signal_key')}"
        message = title + "\n\n" + body + "\n" + WORKER_COMMIT_TRAILER
        return commit_worker_tree(self.repo, message, paths)

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
        # `paths` nosi i commite grane iznad osnovice, ne samo radno stablo: dokaz mora pokrivati sve sto bi
        # `publish` gurnuo, inace `controlFilesChanged` ne vidi kontrolnu datoteku iz ranijeg commita.
        paths = self._snapshot()["paths"]
        candidate = {"candidateSha": head, "baseSha": self._base_sha or task.get("base_sha") or head,
                     "changedPaths": paths}
        key_path = os.path.join(self.home, "verifier.key")
        key = open(key_path, "rb").read() if os.path.isfile(key_path) else b""
        return verify_candidate(candidate, self.config, runner=runner, read_proof=read_proof, signing_key=key or None,
                                created_at=_dt.datetime.now(tz=_dt.timezone.utc).isoformat(timespec="seconds"))

    def classify(self, task: dict) -> tuple[str, list[str]]:
        snap = self._snapshot()
        if self._base_error:
            # Klasifikacija bez poznate osnovice ne zna sto grana nosi, pa ne smije tvrditi nizak rizik.
            return "needs_human", [self._base_error]
        return explain_change(snap["paths"], snap["lines"], self.config, root=self.repo)

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


def _park_worker_tree(adapters, task: dict, store: Store, task_id: str, now: int) -> None:
    """Spremi ono sto je implementacija OVOG POSLA vec napisala kad posao zavrsi PRIJE kraja.

    Inace se kvar iz nalaza 2026-09-13 vraca kroz druga vrata: posao koji padne na pregledu ostavlja prljavo
    stablo, a sljedeci posao gard odbija s `implement_unsafe: radno stablo nije cisto` i kontroler se opet
    zakljuca. Commit je lokalan; objava ide iskljucivo kroz izdavaca i nju ovaj put nikad ne dosegne.

    GRANICA, i to je cijela razlika prema izvedbi od 2026-09-19 koja je odbacena: odluku donosi
    `adapters.commit`, koji odbija sve sto kontroler nije sam napisao. Posao odbijen PRIJE ijedne faze (nema
    ciljnog zadatka, stablo nije cisto, priprema pala) tako prolazi ovuda bez ijedne git naredbe koja pise, i
    stablo ostaje netaknuto. Prethodna izvedba je na tom istom putu radila `git add -A` i commitala tudji
    necommitani rad, u zadanoj konfiguraciji na master granu instalacijskog checkouta.

    Zove se PRIJE prijelaza, pa `status:<verdict>` ostaje zadnji dogadaj zadatka: po njemu `Store.enqueue`
    prepoznaje razlog zaustavljanja, a dnevnik i dalje cita kao prije.
    """
    try:
        parked = adapters.commit(task)
    except (OSError, subprocess.SubprocessError, RuntimeError) as exc:
        parked = {"status": "failed", "reason": f"{type(exc).__name__}"}
    store.record_event(task_id, "worker_commit", {"status": parked.get("status"), "sha": parked.get("sha"),
                                                  "reason": parked.get("reason"), "unfinished": True}, now)


def _drive_task(task: dict, config: dict, store: Store, adapters, profile: dict, now: int, summary: dict) -> str:
    task_id = task["id"]
    status = "planning"
    # Je li OVAJ posao ikad pokrenuo providera. Dnevni slot je po POSLU, ne po fazi: kad je plan vec potrosio
    # poziv modela, slot je potrosen i kasnija blokada u implementaciji ga ne smije vratiti.
    provider_ever_called = False
    for phase in ("planning", "implementing", "reviewing"):
        store.record_event(task_id, f"phase_start:{phase}", {}, now)
        result = adapters.run_phase(task, phase, profile)
        provider_ever_called = provider_ever_called or bool(result.get("provider_called", True))
        store.record_run(task_id, phase, result, now, now)
        summary["phases"].append({"phase": phase, "verdict": result.get("verdict"), "reason": result.get("reason"),
                                  "agent": result.get("agent")})
        verdict = result.get("verdict")
        if verdict in ("waiting_quota", "needs_login"):
            _park_worker_tree(adapters, task, store, task_id, now)
            store.transition(task_id, status, verdict, {"reason": result.get("reason"), "next_run_at": now + 3600}, now)
            return verdict
        if verdict in ("blocked", "needs_human"):
            # `attempt_spent: False` tvrdi adapter, i to samo kad poziv nije ni poceo (nema ciljnog zadatka,
            # providerova izvrsna okolina odbija sve). Bez te tvrdnje ponasanje je staro: pokusaj je potrosen.
            payload: dict = {"reason": result.get("reason")}
            if not result.get("attempt_spent", True):
                payload["refund_attempt"] = True
                # Dnevni slot se vraca samo kad provider nije NI POKRENUT. Inace bi pokvaren provider (sandbox,
                # prazan hod) vrtio model u krug bez ijedne granice. Kad poziv nije ni krenuo, slot mora natrag:
                # tri CI signala bez ciljnog zadatka inace potrose sva tri dnevna slota i izgladne posao koji bi
                # prosao (izmjereno 2026-09-13 nad pravim `ci` izvorom iz config/autonomy.example.json).
                if not provider_ever_called:
                    payload["refund_daily_job"] = True
            _park_worker_tree(adapters, task, store, task_id, now)
            store.transition(task_id, status, verdict, payload, now)
            return verdict
        if verdict != "needs_verification":
            _park_worker_tree(adapters, task, store, task_id, now)
            store.transition(task_id, status, "failed", {"reason": result.get("reason")}, now)
            return "failed"
        nxt = {"planning": "implementing", "implementing": "reviewing", "reviewing": "verifying"}[phase]
        store.transition(task_id, status, nxt, {}, now)
        status = nxt
    # Radnikovo stablo se ISPRAZNI prije nego posao zavrsi: snimka promjena je uzeta unutar `commit`, pa je
    # klasifikacija i verifikacija i dalje vide, a sljedeci posao zatekne cisto stablo. Bez ovoga se kontroler
    # zakljuca poslije tocno jednog posla, jer gard prije implementacije trazi cisto stablo (nalaz 2026-09-13).
    committed = adapters.commit(task)
    store.record_event(task_id, "worker_commit", {"status": committed.get("status"), "sha": committed.get("sha"),
                                                  "reason": committed.get("reason")}, now)
    if committed.get("status") in ("failed", "skipped"):
        # `skipped` znaci da kontroler nije smio spremiti (stablo nije bilo njegovo, ili implementacija nije
        # ni pokrenuta). To nije uspjeh nego stanje u kojem se ne smije nastaviti prema objavi.
        store.transition(task_id, "verifying", "needs_human",
                         {"reason": f"commit_failed: {committed.get('reason')}"}, now)
        return "needs_human"
    change_class, reasons = adapters.classify(task)
    store.record_event(task_id, "classified", {"class": change_class, "reasons": reasons}, now)
    evidence = adapters.verify(task)
    store.record_event(task_id, "verified", {"complete": evidence.get("complete"), "staleness": evidence.get("staleness"), "controlFilesChanged": evidence.get("controlFilesChanged")}, now)
    summary["phases"].append({"phase": "verifying", "complete": evidence.get("complete"), "class": change_class,
                              "commit": committed.get("status")})
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
