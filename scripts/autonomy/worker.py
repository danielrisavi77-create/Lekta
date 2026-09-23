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

from .policy import PolicyError, billing_allowed, canonical_path, path_escapes_root

VERDICTS = ("needs_verification", "failed", "waiting_quota", "needs_login", "blocked")

SECRET_ENV_PREFIXES = ("ANTHROPIC_", "OPENAI_", "GITHUB_", "GH_", "NETLIFY_", "SUPABASE_", "LEMONSQUEEZY_", "AWS_", "AZURE_")
SECRET_ENV_EXACT = ("CLAUDE_CODE_OAUTH_TOKEN", "NPM_TOKEN", "NODE_AUTH_TOKEN")
API_KEY_ENV = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDE_API_KEY")

QUOTA_RE = re.compile(r"(?i)rate.?limit|usage limit|quota|too many requests|\b429\b|overloaded|capacity")
LOGIN_RE = re.compile(r"(?i)not logged in|login required|please (?:run|sign in|log in)|unauthori[sz]ed|\b401\b|invalid api key|authentication failed|session expired|token expired")
# Potpis NEUPOTREBLJIVE izvrsne okoline providera (Codex na Windowsu, izmjereno 2026-09-13 u zadatku 26ba9cf7):
# svaki `exec` je odbijen pa model ne procita NISTA, a ipak uredno posalje `turn.completed`. Bez ovoga faza
# plana prodje VAKUUMSKI kao `needs_verification`.
SANDBOX_RE = re.compile(r"(?i)apply deny-read ACLs|Failed to create unified exec process")
# Modelova PROZA u NDJSON izlazu: sto god model kaze, nije citanje ni izvrsavanje. Sluzi brojacu uspjesnih
# poziva alata; potpis kvara se trazi uze, samo u `error` stavkama (vidi `machine_stdout`).
PROSE_ITEM_TYPES = ("agent_message", "reasoning", "agent_reasoning", "todo_list")

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


def prepare_job_via_node(root: str, task_id: str, phase: str, agent: str, *, timeout: int = 60,
                         override_status: str | None = None, override_implementer: str | None = None) -> dict:
    """Priprema posla postojecim runnerom (scripts/agents/cli.mjs prepare). Ne poziva model.

    `override_status` i `override_implementer` postoje samo za fazu `review`: kontroler tvrdi fazu iz VLASTITE
    evidencije, jer `docs/agents/tasks.json` pise koordinator i kontroler ga nikad ne mijenja. Bez njih je argv
    bajt za bajt isti kao prije, pa rucni `npm run agents prepare/run` ostaje nepromijenjen.
    """
    argv = ["node", os.path.join(root, "scripts", "agents", "cli.mjs"), "prepare", task_id, "--phase", phase, "--agent", agent, "--subscription"]
    if override_status is not None:
        argv += ["--override-status", str(override_status)]
    if override_implementer is not None:
        argv += ["--override-implementer", str(override_implementer)]
    result = subprocess.run(
        argv,
        cwd=root, capture_output=True, text=True, timeout=timeout, shell=False, check=False, env=scrubbed_env(),
    )
    if result.returncode != 0:
        raise RuntimeError(f"prepare failed: {result.stderr.strip()[:300]}")
    job = json.loads(result.stdout)
    if not job.get("dryRun"):
        raise RuntimeError("prepare je vratio nesto sto nije priprema")
    return job


def ndjson_events(stdout: str) -> list[dict]:
    """Redci NDJSON izlaza koji su valjani JSON objekti; neispravan redak se preskace, ne rusi citanje."""
    events: list[dict] = []
    for line in (stdout or "").splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if isinstance(event, dict):
            events.append(event)
    return events


def machine_stdout(stdout: str) -> str:
    """Dijelovi NDJSON stdouta u kojima potpis kvara ima smisla traziti: GRESKE koje javlja sam CLI.

    Dvoje se namjerno preskace, i oba puta zbog istog razreda laznog pozitivnog nalaza. Modelova proza, jer
    model koji radi bas na tom kvaru frazu doslovno napise u svojoj poruci. IZLAZ NAREDBI, jer ovaj
    repozitorij frazu sada i SADRZI (runbook, ovi testovi, komentari), pa bi agent koji tijekom plana procita
    runbook okinuo gard na savrseno ispravnom radu. Sandbox koji odbija svaki exec ionako ne moze proizvesti
    izlaz naredbe: kvar se javlja kao greska CLI-ja, na stderru ili kao `error` stavka.
    """
    out = []
    for event in ndjson_events(stdout):
        item = event.get("item") if isinstance(event.get("item"), dict) else None
        if str((item or event).get("type") or "") == "error":
            out.append(json.dumps(item or event, ensure_ascii=False))
    return "\n".join(out)


def sandbox_unusable(stderr: str, stdout: str = "", command: str | None = None) -> bool:
    """Je li providerova izvrsna okolina odbila SVAKI poziv.

    Stderr se cita cijeli: ondje su `codex_core::tools::router` redci iz izmjerenog artefakta. Stdout se cita
    kao NDJSON i to samo `error` stavke (vidi `machine_stdout`), pa gard vidi i codex koji isti kvar prijavi
    strukturirano, bez ijednog retka na stderru. Claudeov `-p --output-format json` nije NDJSON nego jedan
    objekt s modelovim tekstom, pa se za njega stdout ne skenira uopce.
    """
    if SANDBOX_RE.search(stderr or ""):
        return True
    if command == "claude":
        return False
    return bool(SANDBOX_RE.search(machine_stdout(stdout)))


def successful_tool_calls(command: str, stdout: str) -> int | None:
    """Koliko je DOKAZANO uspjesnih citanja ili izvrsavanja provider zabiljezio u vlastitom izlazu.

    Vlastiti brojac mehanizma, ne nizvodna mjera: nula znaci da faza nije procitala ni izvrsila nista, ma sto
    pisalo u zavrsnoj poruci. `None` je NEPOZNATO i ne smije nista blokirati; Claude `-p --output-format json`
    vraca jedan sazetak bez popisa alata, pa se za njega broj ne moze izmjeriti.

    Popis je namjerno DENY (proza i greske), ne ALLOW (imena alata): allow lista bi na prvom preimenovanju
    stavke tiho pala na nulu i blokirala svaki ispravan rad, dakle gard koji gasi ono sto stiti.
    """
    if command == "claude":
        return None
    total = 0
    for event in ndjson_events(stdout):
        if str(event.get("type") or "") != "item.completed":
            continue
        item = event.get("item")
        if not isinstance(item, dict):
            continue
        kind = str(item.get("type") or "")
        if kind in PROSE_ITEM_TYPES or kind == "error":
            continue
        exit_code = item.get("exit_code")
        if exit_code is not None and exit_code != 0:
            continue
        if str(item.get("status") or "") == "failed":
            continue
        total += 1
    return total


def _git_output(repo: str, args: list[str]) -> tuple[int, str]:
    out = subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, check=False, shell=False, timeout=30)
    return out.returncode, out.stdout.strip()


def implementation_worktree_blocked(repo: str, *, git=None, dedicated: bool = False,
                                    require_clean: bool = True) -> str | None:
    """Razlog zasto se agent S PRAVOM PISANJA ne smije pokrenuti u `repo`, ili None.

    Ista tri preduvjeta koja `scripts/agents/cli.mjs run --execute` namece rucnom toku: vlastito radno stablo,
    feature grana, cisto stablo. Kontroler posao priprema kroz `prepare` (dakle BEZ `--execute`) i providera
    pokrece sam, pa bi bez ove provjere pisao modelom izravno u instalacijski checkout na masteru, koji dijeli
    s ljudskim radom. Do 2026-09-13 se to nije moglo dogoditi samo zato sto `implement` nikad nije bio dostizan.

    `dedicated` je operaterova tvrdnja da je `repo` zaseban radnikov checkout (postavljen `workerRepoPath` koji
    NIJE stablo iz kojeg kontroler radi). Bez nje se trazi povezan `git worktree`. Ta razlika je popravak
    krive osi: `--git-dir` naspram `--git-common-dir` odbija i ZASEBAN KLON na feature grani, koji je posve
    siguran i najprirodniji nacin da se `workerRepoPath` zadovolji.

    `require_clean` vrijedi za PRVU fazu posla, dok u stablu jos nema niceg sto je taj posao napisao. Poslije
    nje stablo prlja sam kontroler (implementacija pise datoteke), pa bi ista provjera oborila pregled
    VLASTITOG posla: izmjereno testom `TwoJobsInARowTest`, faza `reviewing` je zavrsavala kao
    `implement_unsafe: radno stablo nije cisto`. Preostala dva preduvjeta (vlastito stablo, feature grana)
    vrijede na svakoj fazi, jer se oni tijekom posla ne smiju promijeniti.
    """
    run = git or (lambda args: _git_output(repo, args))
    try:
        values = []
        for args in (["rev-parse", "--git-dir"], ["rev-parse", "--git-common-dir"],
                     ["branch", "--show-current"], ["status", "--porcelain"]):
            code, out = run(args)
            if code != 0:
                return f"implement_unsafe: git {' '.join(args)} nije uspio"
            values.append(out)
    except (OSError, subprocess.SubprocessError) as exc:
        return f"implement_unsafe: git nije dostupan ({type(exc).__name__})"
    git_dir, common_dir, branch, dirty = values
    if not dedicated and os.path.realpath(os.path.join(repo, git_dir)) == os.path.realpath(os.path.join(repo, common_dir)):
        return "implement_unsafe: nije zaseban git worktree ni deklariran workerRepoPath"
    if not branch or branch in ("master", "main"):
        return f"implement_unsafe: {branch or 'odvojena glava'} nije feature grana"
    if dirty and require_clean:
        return "implement_unsafe: radno stablo nije cisto"
    return None


WORKER_COMMIT_TRAILER = "Autor izmjene je autonomni kontroler; pregled i merge su odvojeni koraci."


class UnsafeCommitPaths(ValueError):
    """Staza koju kontroler ne smije commitati (apsolutna, izvan repozitorija, prazna)."""


def _safe_relative_paths(paths: list[str], *, repo: str | None = None) -> list[str]:
    """Normaliziraj popis staza i odbij sve sto izlazi iz radnikova stabla.

    Pravila su JEDNA kopija: string-provjere su `policy.canonical_path` (uz `reject_home=True`, jer ovaj
    popis ide u `git add`), a razrjesavanje veza je `policy.path_escapes_root`. Do 2026-09-21 su ovdje
    stajale vlastite kopije obiju provjera i vec su se bile razisle: NUL bajt je vidjela samo politika,
    `~` samo ovaj gard, a provjera veza se ovdje preskakala kad `repo` nije mapa. Parnost presuda cuva
    `tests/test_path_guard_parity.py`.

    Popis dolazi iz `git status --porcelain` istog stabla, pa bi u praksi uvijek bio relativan. Provjera
    svejedno stoji: pozivatelj je kontroler koji taj popis prosljedjuje u `git add`, a tiho prihvacena
    apsolutna staza ili `..` znaci pisanje izvan stabla za koje je gard dao dopustenje.

    Sve string-provjere su NEOVISNE O OS-U (ista presuda na Windowsu i na Linuxu); `os.path.isabs` je za
    tu svrhu kriv alat i zato ga u lancu nema (`C:x` ga promasuje i na Windowsu).
    """
    clean: list[str] = []
    for raw in paths:
        path = str(raw).strip().strip('"')
        try:
            rel = canonical_path(path, reject_home=True)
        except PolicyError as exc:
            raise UnsafeCommitPaths(str(exc)) from exc
        if repo is not None and path_escapes_root(str(repo), rel):
            raise UnsafeCommitPaths(f"staza vodi izvan stabla preko veze: {raw!r}")
        clean.append(rel)
    # Duplikati bi `git add` prihvatio, ali popis ide i u poruku dnevnika i u tvrdnje testova.
    return sorted(dict.fromkeys(clean))


def commit_worker_tree(repo: str, message: str, paths: list[str], *, run=None) -> dict:
    """Spremi TOCNO navedene staze kao commit u radnikovu stablu.

    Popis staza NIJE kozmetika nego cijela poanta ove funkcije. Do 2026-09-19 je ovdje stajao `git add -A` pa
    `git commit`, i to je commitalo sve sto je u stablu prljavo, ukljucivo rad koji kontroler nije napisao;
    izmjereno je da posao odbijen PRIJE ijedne faze tako commita tudje necommitane datoteke, u zadanoj
    konfiguraciji na master granu instalacijskog checkouta. `git add -A` i `git commit` bez `--only` su i
    oblik koji CLAUDE.md izricito zabranjuje i koji `~/.claude/hooks/lekta-git-guard.mjs` odbija ljudima, pa ga
    automat pogotovo ne smije koristiti.

    Pozivatelj (`DefaultAdapters.commit`) smije poslati samo staze iz snimke uzete NAKON sto je gard potvrdio
    da je stablo na pocetku posla bilo cisto: tek tada je sve prljavo djelo implementacije iz ovog posla.

    U `git add` ide samo ono sto U STABLU JOS POSTOJI, i to nije kozmetika nego popravak kvara izmjerenog
    2026-09-20: `git add -- <staza>` je za obrisanu datoteku i za STARU stranu preimenovanja pao s
    `fatal: pathspec ... did not match any files` (staze vise nema ni u stablu ni u indeksu), cijeli commit je
    izostao, stablo je ostalo prljavo i sljedeci posao bi se zakljucao na gardu cistog stabla. Izmjereno je i
    da `git commit --only -- <staza>` te oblike zna sam (brisanje i preimenovanje su vec poznati indeksu ili
    HEAD-u), dok NETRACKANA nova datoteka bez `git add` prolazi kroz `commit --only` s
    `error: pathspec ... did not match any file(s) known to git`. Dakle: `add` za ono sto postoji, `commit
    --only` za sve. Popis dolazi iz `git status` ISTOG stabla, pa staza koju git uopce ne poznaje ne moze
    upasti.
    """
    call = run or (lambda args: _git_output(repo, args))
    try:
        safe = _safe_relative_paths(list(paths or []), repo=repo)
    except UnsafeCommitPaths as exc:
        return {"status": "failed", "reason": f"nesigurna staza: {exc}"}
    if not safe:
        return {"status": "clean", "reason": "nista za spremiti"}
    present = [p for p in safe if os.path.exists(os.path.join(repo, p))]
    try:
        if present:
            code, out = call(["add", "--", *present])
            if code != 0:
                return {"status": "failed", "reason": "git add nije uspio"}
        code, out = call(["commit", "--only", "-m", message, "--", *safe])
        if code != 0:
            return {"status": "failed", "reason": f"git commit nije uspio: {out[:200]}"}
        code, sha = call(["rev-parse", "HEAD"])
        return {"status": "committed", "sha": sha if code == 0 else None, "paths": safe}
    except (OSError, subprocess.SubprocessError) as exc:
        return {"status": "failed", "reason": f"git nije dostupan ({type(exc).__name__})"}


def resolve_base_ref(repo: str, base_branch: str, *, run=None) -> str | None:
    """Lokalna referenca osnovice (`origin/master`, pa `master`), ili None kad je nema.

    None NIJE "nema promjena": pozivatelj mora fail-closed, jer bez osnovice ne moze reci sto sve grana nosi.
    """
    call = run or (lambda args: _git_output(repo, args))
    for ref in (f"origin/{base_branch}", str(base_branch)):
        if not base_branch:
            break
        code, out = call(["rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}"])
        if code == 0 and out.strip():
            return ref
    return None


def branch_changed_paths(repo: str, base_ref: str, *, run=None) -> list[str]:
    """Staze koje grana nosi iznad osnovice, dakle sve sto bi `git push` te grane objavio.

    Dokaz se racuna PO POSLU, a grana zivi duze od posla: bez ovoga klasifikacija i verifikacija vide samo
    ono sto je napisao TEKUCI posao, dok bi objava gurnula i svaki raniji commit na istoj grani, ukljucivo
    onaj koji je pregled odbio (izmjereno 2026-09-19: `.github/workflows/...` iz odbijenog posla proslo bi kao
    promjena bez kontrolnih datoteka).
    """
    call = run or (lambda args: _git_output(repo, args))
    code, out = call(["diff", "--name-only", f"{base_ref}...HEAD"])
    if code != 0:
        raise RuntimeError("git diff prema osnovici nije uspio")
    return [line.strip() for line in out.splitlines() if line.strip()]


def branch_changed_line_count(repo: str, base_ref: str, *, run=None) -> int:
    call = run or (lambda args: _git_output(repo, args))
    code, out = call(["diff", "--numstat", f"{base_ref}...HEAD"])
    if code != 0:
        return 0
    total = 0
    for line in out.splitlines():
        parts = line.split(chr(9))
        for p in parts[:2]:
            if p.isdigit():
                total += int(p)
    return total


def start_job_branch(repo: str, branch: str, base_ref: str, *, run=None) -> dict:
    """Postavi radnikovo stablo na VLASTITU granu ovog posla.

    Bez toga svi poslovi dijele jednu dugotrajnu granu: drugi posao naslijedi commite prvoga, `publish` ih sve
    gura u isti PR, a `open_pull_request` se poziva za glavu koja vec ima otvoren PR. Izmjereno 2026-09-19:
    `.github/workflows/...` iz posla koji je pregled ODBIO otisao bi u objavu drugog posla, a klasifikacija ga
    ne bi ni vidjela.

    Grana koja VEC postoji (isti zadatak, drugi pokusaj) se ne reze ponovo, nego preuzima: `checkout -B` bi
    tiho odbacio ono sto je raniji pokusaj vec spremio. Osnovica je tada zajednicki predak, pa dokaz i dalje
    pokriva sve sto bi objava gurnula.

    Stablo mora biti cisto (gard prve faze to trazi). Fail-closed: prljavo stablo se NE premjesta.
    """
    call = run or (lambda args: _git_output(repo, args))
    code, dirty = call(["status", "--porcelain"])
    if code != 0:
        return {"status": "failed", "reason": "git status nije uspio"}
    if dirty.strip():
        return {"status": "failed", "reason": "stablo nije cisto, grana posla se ne preuzima"}
    code, _ = call(["rev-parse", "--verify", "--quiet", f"refs/heads/{branch}"])
    if code == 0:
        code, out = call(["checkout", branch])
        if code != 0:
            return {"status": "failed", "reason": f"git checkout nije uspio: {out[:200]}"}
        code, base_sha = call(["merge-base", base_ref, "HEAD"])
        return {"status": "ok", "branch": branch, "base_sha": base_sha if code == 0 else None, "created": False}
    code, out = call(["checkout", "-b", branch, base_ref])
    if code != 0:
        return {"status": "failed", "reason": f"git checkout -b nije uspio: {out[:200]}"}
    code, sha = call(["rev-parse", "HEAD"])
    return {"status": "ok", "branch": branch, "base_sha": sha if code == 0 else None, "created": True}


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
        "candidate_sha": None, "launcher": None, "duration_s": 0.0, "successful_tool_calls": None,
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

    # PRIJE classify_stream i PRIJE parse_provider_output: providerov `turn.completed` uz odbijen exec je lazno
    # zeleno, ne uspjeh. Pokusaj se ne trosi jer poziv nije ni mogao poceti raditi.
    if sandbox_unusable(stderr, stdout, str(job.get("command"))):
        result["verdict"] = "blocked"
        result["reason"] = "provider_unusable: codex sandbox"
        result["attempt_spent"] = False
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
    # Opcenitije od potpisa sandboxa: plan i pregled su CITANJE, pa faza bez ijednog uspjesnog citanja ili
    # izvrsavanja nije uspjeh nego prazan hod, bez obzira na to kojom se porukom provider pravdao. Nula je
    # mjerodavna samo kad se broj MOZE izmjeriti; `None` (Claude) ne blokira nista.
    result["successful_tool_calls"] = successful_tool_calls(str(job.get("command")), stdout)
    if phase in ("plan", "review") and result["successful_tool_calls"] == 0:
        result["verdict"] = "blocked"
        result["reason"] = f"no_tool_use: faza {phase} bez ijednog uspjesnog citanja ili izvrsavanja"
        result["attempt_spent"] = False
        return result
    result["verdict"] = "needs_verification"
    result["reason"] = "CLI je zavrsio strukturiranim uspjehom; nista jos nije provjereno"
    return result


# --------------------------------------------------------------------------------------------
# Snapshot promjena u radnikovu stablu
# --------------------------------------------------------------------------------------------
def changed_paths(cwd: str) -> list[str]:
    """Promijenjene staze radnog stabla, DATOTEKA PO DATOTEKA.

    `--untracked-files=all` nije kozmetika: bez njega git nov, netrackan DIREKTORIJ sazme u jedan redak
    (`src/`), pa klasifikacija (`explain_change`) presudjuje po imenu mape i ne vidi ni kontrolnu datoteku ni
    stazu izvan dopustenih prefiksa u njoj. Izmjereno 2026-09-13 testom `TwoJobsInARowTest`.

    Preimenovanje (`R`/`C`) nosi DVIJE staze u `-z` izlazu, novu pa staru. Obje se vracaju: popis ide i u
    klasifikaciju (stara staza je obrisana, to je promjena) i u `git add`, koji bez stare staze ne bi zapisao
    brisanje. Do 2026-09-19 se druga staza citala kao da ima status u prva tri znaka, pa je u popis ulazila
    osakacena.
    """
    out = subprocess.run(["git", "status", "--porcelain", "-z", "--untracked-files=all"], cwd=cwd,
                         capture_output=True, text=True, check=False, shell=False)
    if out.returncode != 0:
        raise RuntimeError("git status nije uspio")
    fields = [f for f in out.stdout.split(chr(0))]
    paths: list[str] = []
    i = 0
    while i < len(fields):
        entry = fields[i]
        i += 1
        if len(entry) <= 3:
            continue
        status, path = entry[:2], entry[3:]
        paths.append(path)
        if status[0] in ("R", "C") or status[1] in ("R", "C"):
            if i < len(fields) and fields[i]:
                paths.append(fields[i])
                i += 1
    return paths


def _untracked_line_count(cwd: str) -> int:
    """Broj redaka u NETRACKANIM datotekama radnog stabla.

    `git diff --numstat HEAD` po konstrukciji ne vidi netrackanu datoteku, pa je prag redaka za `auto_low_risk`
    bio zaobidjen cim je posao stizao kao NOV modul: tisucu redaka novog koda brojalo se kao nula. Ignorirane
    datoteke (`--exclude-standard`) ostaju izvan, isto kao u `changed_paths`, pa se dvije mjere slazu.
    """
    out = subprocess.run(["git", "ls-files", "--others", "--exclude-standard", "-z"], cwd=cwd,
                         capture_output=True, text=True, check=False, shell=False)
    if out.returncode != 0:
        return 0
    total = 0
    for rel in out.stdout.split(chr(0)):
        rel = rel.strip()
        if not rel:
            continue
        try:
            with open(os.path.join(cwd, rel), "rb") as fh:
                last = b""
                while True:
                    chunk = fh.read(1 << 20)
                    if not chunk:
                        break
                    total += chunk.count(b"\n")
                    last = chunk[-1:]
                if last and last != b"\n":
                    total += 1
        except OSError:
            continue
    return total


def changed_line_count(cwd: str) -> int:
    out = subprocess.run(["git", "diff", "--numstat", "HEAD"], cwd=cwd, capture_output=True, text=True, check=False, shell=False)
    if out.returncode != 0:
        return -1
    total = 0
    for line in out.stdout.splitlines():
        parts = line.split(chr(9))
        if len(parts) >= 2:
            for p in parts[:2]:
                if p.isdigit():
                    total += int(p)
    return total + _untracked_line_count(cwd)


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
