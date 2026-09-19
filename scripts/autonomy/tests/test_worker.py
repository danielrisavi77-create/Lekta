import json
import os
import subprocess
import sys
import tempfile
import time
import unittest

from unittest import mock

from scripts.autonomy.worker import (
    ProcessTree, changed_paths, classify_stream, commit_worker_tree, diff_within_scope, implementation_worktree_blocked,
    machine_stdout, model_matches, parse_provider_output, pid_alive, prepare_job_via_node, resolve_launcher,
    run_phase, sandbox_unusable, scrubbed_env, successful_tool_calls,
)


def git_repo() -> str:
    """Stvaran git repozitorij na feature grani, s jednim commitom. Za testove koji mjere git, ne odluku."""
    repo = tempfile.mkdtemp()
    def run(*args):
        out = subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, check=False, shell=False)
        assert out.returncode == 0, (args, out.stderr)
    run("init", "-q")
    run("config", "user.email", "radnik@lokalno")
    run("config", "user.name", "Radnik")
    run("config", "commit.gpgsign", "false")
    with open(os.path.join(repo, "README.md"), "w", encoding="utf-8") as fh:
        fh.write("pocetak" + chr(10))
    run("add", "README.md")
    run("commit", "-qm", "pocetak")
    run("checkout", "-qb", "wf/radnik")
    return repo


# Uspjesno izvrsavanje u codex NDJSON-u. Oblik je GRADJEN prema shemi stavke (`item.completed` +
# `command_execution` s `exit_code`), a ne prepisan iz izmjerenog artefakta: taj artefakt je log KVARA i po
# definiciji nema nijedno uspjesno izvrsavanje. Ta razlika je zapisana i u izvjestaju, ne presucena.
TOOL_CALL_LINE = ('{"type":"item.completed","item":{"id":"item_t","type":"command_execution",'
                  '"command":"bash -lc \'sed -n 1,40p AGENTS.md\'","aggregated_output":"# AGENTS",'
                  '"exit_code":0,"status":"completed"}}')

FAKE_CLI = r'''
import json, os, subprocess, sys, time
mode = os.environ["FAKE_MODE"]
prompt = sys.stdin.read()
if mode == "hang":
    # dijete i unuce, pa svi spavaju; PID-ovi idu u datoteku da test moze provjeriti jesu li mrtvi
    child = subprocess.Popen([sys.executable, "-c",
        "import subprocess, sys, time, os; g = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(300)']);"
        " open(os.environ['PIDFILE'], 'a').write(str(g.pid) + '\\n'); time.sleep(300)"])
    with open(os.environ["PIDFILE"], "a") as fh:
        fh.write(str(os.getpid()) + "\n" + str(child.pid) + "\n")
    time.sleep(300)
elif mode == "codex_ok":
    print(json.dumps({"type": "turn.started", "model": "gpt-5.6-sol"}))
    # Uspjesan plan NESTO procita; bez toga bi ovaj mod opisivao prazan hod, a ne uspjeh.
    print(json.dumps({"type": "item.completed", "item": {"id": "item_t", "type": "command_execution",
                                                         "command": "bash -lc 'sed -n 1,40p AGENTS.md'",
                                                         "aggregated_output": "# AGENTS", "exit_code": 0,
                                                         "status": "completed"}}))
    print(json.dumps({"type": "turn.completed", "model": "gpt-5.6-sol"}))
elif mode == "codex_no_tools":
    # Uredan zavrsetak BEZ ijednog citanja ili izvrsavanja: tocno oblik vakuumskog zelenog.
    print(json.dumps({"type": "item.completed", "item": {"id": "item_1", "type": "agent_message",
                                                         "text": "Nisam mogao nista procitati."}}))
    print(json.dumps({"type": "turn.completed", "model": "gpt-5.6-sol"}))
elif mode == "codex_failed_tool":
    print(json.dumps({"type": "item.completed", "item": {"id": "item_t", "type": "command_execution",
                                                         "command": "bash -lc 'cat AGENTS.md'",
                                                         "exit_code": 1, "status": "failed"}}))
    print(json.dumps({"type": "turn.completed", "model": "gpt-5.6-sol"}))
elif mode == "codex_failed":
    print(json.dumps({"type": "turn.failed"}))
elif mode == "quota":
    sys.stderr.write("Error: rate limit exceeded, retry after 3600s\n")
    sys.exit(1)
elif mode == "login":
    sys.stderr.write("Not logged in. Please run codex login\n")
    sys.exit(1)
elif mode == "truncated":
    sys.stdout.write('{"type": "turn.compl')
elif mode == "wrong_model":
    print(json.dumps({"type": "turn.completed", "model": "gpt-4o-mini"}))
elif mode == "claude_ok":
    print(json.dumps({"subtype": "success", "is_error": False, "modelUsage": {"claude-sonnet-5": {}}}))
elif mode == "replay":
    # doslovan ponovni ispis snimljenog izlaza stvarnog providera (stdout i stderr iz artefakta)
    sys.stdout.buffer.write(open(os.environ["FAKE_STDOUT"], "rb").read())
    sys.stderr.buffer.write(open(os.environ["FAKE_STDERR"], "rb").read())
    sys.exit(int(os.environ.get("FAKE_EXIT", "0")))
elif mode == "echo_prompt":
    assert "LEKTA task" in prompt
    print(json.dumps({"type": "item.completed", "item": {"id": "item_t", "type": "command_execution",
                                                         "command": "bash -lc 'sed -n 1,5p AGENTS.md'",
                                                         "exit_code": 0, "status": "completed"}}))
    print(json.dumps({"type": "turn.completed", "model": "gpt-5.6-sol"}))
'''


# Doslovno prepisano iz %LOCALAPPDATA%\Lekta\autonomy\artifacts\26ba9cf7-321f-4598-af80-aad6c000ae31\
# planning-f8994dab\{stdout,stderr}.log (prvi propose tick, 2026-09-13). Ne parafrazirati: test bi inace
# mjerio oblik koji Codex CLI nikad ne proizvede.
SANDBOX_STDERR = '2026-09-13T12:13:21.734060Z ERROR codex_core::tools::router: error=timed out negotiating with the code-mode host\n2026-09-13T12:13:41.324028Z ERROR codex_core::tools::router: error=exec_command failed: CreateProcess { message: "Rejected(\\"Failed to create unified exec process: helper_unknown_error: apply deny-read ACLs\\")" }\n2026-09-13T12:13:41.324313Z ERROR codex_core::tools::router: error=exec_command failed: CreateProcess { message: "Rejected(\\"Failed to create unified exec process: helper_unknown_error: apply deny-read ACLs\\")" }\n2026-09-13T12:14:44.070935Z ERROR codex_core::tools::router: error=exec_command failed: CreateProcess { message: "Rejected(\\"Failed to create unified exec process: helper_unknown_error: apply deny-read ACLs\\")" }\n2026-09-13T12:16:22.498606Z ERROR codex_models_manager::manager: failed to refresh available models: timeout waiting for child process to exit\n'

SANDBOX_STDOUT = '{"type":"thread.started","thread_id":"01a09aae-63cd-7ed3-9d2c-4250ee2ff8a2"}\n{"type":"turn.started"}\n{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Skill descriptions were shortened to fit the skills context budget. Codex can still see every skill, but some descriptions are shorter. Disable unused skills or plugins to leave more room for the rest."}}\n{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Pročitat ću operativne upute i odjeljak T00, zatim usporediti zabilježeno polazište s trenutačnim kodom. Procjena ostaje samo za čitanje, uz jasno odvajanje potvrđenih nalaza od nepokrenutih provjera.\\n"}}\n{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"Lokalni alat ne uspijeva pokrenuti čitanje datoteka zbog pogreške sandboxa `apply deny-read ACLs`. Provjeravam još jednostavan poziv; zasad nisam mogao pročitati repo niti utvrditi HEAD, pa status `done` iz zadatka nije potvrđen ovom procjenom.\\n"}}\n{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"Procjena T00 blokirana je pristupom repozitoriju. Lokalni alat ponovljeno pada prije izvršavanja naredbe: `Failed to create unified exec process: helper_unknown_error: apply deny-read ACLs`.\\n\\n- **Base HEAD:** nije utvrđen. `48c1fc9e` je povijesno polazište iz dostavljene bilješke, nije potvrđen trenutačni HEAD.\\n- **Opseg:** read-only provjera T00, karte riješenih nalaza i njihove usklađenosti s trenutačnim kodom.\\n- **Nalazi/promjene:** nema izmjena ni potvrđenih nalaza o kodu. Dostavljene upute AGENTS.md jesu dostupne u poruci; lokalni CLAUDE.md, README i razvojni plan nisu pročitani.\\n- **Stvarno pokrenuti testovi:** nijedan. Nema novog dokaza za lokalni gate, master CI, produkciju ili Word provjeru.\\n- **Otvoreni rizik:** status `done` i dokumenti navedeni u bilješci mogu opisivati starije stanje; njihova aktualnost nije provjerena.\\n- **Preporučeni sljedeći korak:** ponoviti read-only procjenu nakon popravka lokalnog izvršnog alata. Utvrditi HEAD i razlike radnog stabla te povezati svaku tvrdnju iz [statusa plana](/C:/Users/PC/Lekta-autonomy/docs/quality/lekta-plan-status.md) i [polazišta](/C:/Users/PC/Lekta-autonomy/docs/agents/autonomy-baseline.md) s trenutačnim kodom i dokazom provjere.\\n\\nOva procjena ne potvrđuje dovršenost T00."}}\n{"type":"turn.completed","usage":{"input_tokens":217654,"cached_input_tokens":190976,"cache_write_input_tokens":0,"output_tokens":1014,"reasoning_output_tokens":30}}\n'

# Isti stdout, ali BEZ potpisa u stderru: model koji radi bas na ovom kvaru doslovno citira frazu u
# `agent_message`. To ne smije biti `blocked`, inace bi gard sam sebe okinuo na ispravnom radu.
BENIGN_STDERR = "2026-09-13T12:13:41.324028Z  INFO codex_core::tools::router: ok\n"

_SANDBOX_LINES = SANDBOX_STDOUT.strip().splitlines()
# Stvarni stdout uz JEDNO uspjesno izvrsavanje: tako brojac uspjesnih poziva ne okine, pa test koji slijedi
# mjeri ISKLJUCIVO potpis sandboxa, a ne prazan hod (dva razlicita mehanizma, dvije razlicite mjere).
SANDBOX_STDOUT_WITH_TOOL_USE = "\n".join(_SANDBOX_LINES[:2] + [TOOL_CALL_LINE] + _SANDBOX_LINES[2:]) + "\n"
# Isti oblik, ali je kvar prijavljen STRUKTURIRANO, u `item.type == "error"`, a poruka je doslovno preuzeta iz
# stvarnog stderr retka (`_ROUTER_MESSAGE` se iz njega i izvodi, da se ne prepisuje rucno). Codex u JSON nacinu
# dokazano emitira `error` stavke; kad tracing na stderr izostane, ovo je jedino mjesto na kojem se kvar vidi.
_ROUTER_MESSAGE = next(l for l in SANDBOX_STDERR.splitlines() if "apply deny-read ACLs" in l).split("error=", 1)[1]
SANDBOX_STDOUT_STRUCTURED = "\n".join(
    _SANDBOX_LINES[:2]
    + [TOOL_CALL_LINE,
       json.dumps({"type": "item.completed", "item": {"id": "item_0", "type": "error", "message": _ROUTER_MESSAGE}})]
    + _SANDBOX_LINES[3:]) + "\n"


def profile(**over):
    base = dict(subscription_verified=True, extra_credits_disabled=True, effective_auth="subscription",
                model_included=True, configuration_unchanged=True, trusted_observation=True)
    base.update(over)
    return base


class WorkerTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.cli = os.path.join(self.dir, "fake_cli.py")
        with open(self.cli, "w", encoding="utf-8") as fh:
            fh.write(FAKE_CLI)
        self.pidfile = os.path.join(self.dir, "pids.txt")

    def job(self, mode, command="codex", model="gpt-5.6-sol"):
        # Fake provider je python skripta; `command` je sys.executable pa launcher postoji na svakoj platformi.
        env = dict(os.environ, FAKE_MODE=mode, PIDFILE=self.pidfile)
        return {"command": sys.executable, "args": [self.cli], "prompt": "LEKTA task T00. Phase: plan.",
                "requestedModel": model, "_provider": command}, env

    def run_fake(self, mode, timeout=60, prof=None, model="gpt-5.6-sol", provider="codex"):
        job, env = self.job(mode, model=model)
        # run_phase odreduje parser po `command`; za fake dajemo eksplicitni provider preko args parsera
        job["command"] = sys.executable
        result = run_phase(job, "plan", prof or profile(), cwd=self.dir, timeout_seconds=timeout, env=env,
                           artifact_dir=os.path.join(self.dir, "art"))
        return result

    def test_timeout_kills_child_and_grandchild(self):
        result = self.run_fake("hang", timeout=4)
        self.assertEqual(result["verdict"], "failed", result)
        self.assertEqual(result["reason"], "timeout")
        self.assertTrue(result["process_tree_stopped"])
        self.assertTrue(result["isolated"])
        deadline = time.time() + 10
        pids = []
        while time.time() < deadline:
            if os.path.exists(self.pidfile):
                with open(self.pidfile, encoding="utf-8") as fh:
                    pids = [int(x) for x in fh.read().split()]
                if len(pids) >= 3:
                    break
            time.sleep(0.2)
        self.assertEqual(len(pids), 3, "fake CLI je trebao zapisati sebe, dijete i unuce")
        time.sleep(0.5)
        for pid in pids:
            self.assertFalse(pid_alive(pid), f"proces {pid} je jos ziv nakon timeouta")

    def test_success_is_only_needs_verification(self):
        result = self.run_fake("codex_ok")
        self.assertEqual(result["verdict"], "needs_verification", result)
        self.assertEqual(result["reported_models"], ["gpt-5.6-sol"])
        self.assertEqual(result["exit_code"], 0)
        self.assertTrue(any(p.endswith("stdout.log") for p in result["artifact_paths"]))
        self.assertTrue(any(p.endswith("prompt.md") for p in result["artifact_paths"]))

    def test_failed_turn_and_truncated_json_are_failures(self):
        self.assertEqual(self.run_fake("codex_failed")["verdict"], "failed")
        truncated = self.run_fake("truncated")
        self.assertEqual(truncated["verdict"], "failed")
        self.assertIn("JSON", truncated["reason"])

    def test_quota_and_login_do_not_consume_an_attempt(self):
        self.assertEqual(self.run_fake("quota")["verdict"], "waiting_quota")
        self.assertEqual(self.run_fake("login")["verdict"], "needs_login")

    def test_reported_model_must_match_request(self):
        result = self.run_fake("wrong_model")
        self.assertEqual(result["verdict"], "failed")
        self.assertIn("model_mismatch", result["reason"])
        self.assertTrue(model_matches("gpt-5.6-sol", ["gpt-5.6-sol"]))
        self.assertTrue(model_matches("sonnet", ["claude-sonnet-5"]))
        self.assertFalse(model_matches("opus", ["claude-sonnet-5"]))
        self.assertTrue(model_matches("opus", []), "prazna lista je nepoznato, ne neslaganje")

    def test_prompt_travels_over_stdin_not_argv(self):
        result = self.run_fake("echo_prompt")
        self.assertEqual(result["verdict"], "needs_verification", result)

    def test_billing_and_api_key_block_before_any_process_starts(self):
        job, env = self.job("codex_ok")
        blocked = run_phase(job, "plan", {}, cwd=self.dir, env=env)
        self.assertEqual(blocked["verdict"], "blocked")
        self.assertIn("billing_unknown", blocked["reason"])
        self.assertIsNone(blocked["exit_code"])
        job["command"] = "claude"
        env["ANTHROPIC_API_KEY"] = "sk-ant-test"
        api = run_phase(job, "plan", profile(), cwd=self.dir, env=env)
        self.assertEqual(api["verdict"], "blocked")
        self.assertIn("api_key_present", api["reason"])
        job["requestedModel"] = "fable"
        del env["ANTHROPIC_API_KEY"]
        fable = run_phase(job, "plan", profile(), cwd=self.dir, env=env)
        self.assertEqual(fable["verdict"], "blocked")
        self.assertIn("fable_disabled", fable["reason"])
        missing = run_phase({"command": "definitely-not-installed-xyz", "args": []}, "plan", profile(), cwd=self.dir, env=env)
        self.assertEqual(missing["verdict"], "blocked")
        self.assertIn("launcher_missing", missing["reason"])

    def test_child_env_has_no_secrets(self):
        env = scrubbed_env({"PATH": "x", "ANTHROPIC_API_KEY": "a", "GITHUB_TOKEN": "b", "gh_token": "c",
                            "SUPABASE_SERVICE_ROLE_KEY": "d", "NETLIFY_AUTH_TOKEN": "e", "HOME": "h", "NPM_TOKEN": "n"})
        self.assertEqual(sorted(env), ["HOME", "PATH"])

    def test_parsers_and_stream_classification(self):
        self.assertFalse(parse_provider_output("codex", "", 0)["ok"])
        self.assertFalse(parse_provider_output("codex", '{"type":"turn.completed"}', 1)["ok"])
        self.assertTrue(parse_provider_output("codex", '{"type":"turn.completed"}', 0)["ok"])
        claude = parse_provider_output("claude", json.dumps({"subtype": "success", "is_error": False, "modelUsage": {"claude-opus-5": {}}}), 0)
        self.assertEqual((claude["ok"], claude["reported_models"]), (True, ["claude-opus-5"]))
        self.assertFalse(parse_provider_output("claude", json.dumps({"subtype": "error_max_turns", "is_error": True}), 0)["ok"])
        self.assertEqual(classify_stream("HTTP 429 Too Many Requests"), "waiting_quota")
        self.assertEqual(classify_stream("session expired, please log in"), "needs_login")
        self.assertIsNone(classify_stream("all good"))

    def replay(self, stdout_text, stderr_text, exit_code=0):
        out = os.path.join(self.dir, "replay_stdout.log")
        err = os.path.join(self.dir, "replay_stderr.log")
        with open(out, "w", encoding="utf-8", newline="") as fh:
            fh.write(stdout_text)
        with open(err, "w", encoding="utf-8", newline="") as fh:
            fh.write(stderr_text)
        job, env = self.job("replay")
        env.update(FAKE_STDOUT=out, FAKE_STDERR=err, FAKE_EXIT=str(exit_code))
        return run_phase(job, "plan", profile(), cwd=self.dir, timeout_seconds=60, env=env,
                         artifact_dir=os.path.join(self.dir, "art-replay"))

    def test_unusable_sandbox_is_blocked_not_a_vacuous_success(self):
        """Tocka 3 nalaza: `turn.completed` uz odbijen exec nije uspjeh.

        BASELINE (negativna kontrola): isti stdout uz cist stderr i dalje daje `needs_verification`.
        MUTACIJA: stvarni stderr iz artefakta 26ba9cf7 daje `blocked` i ne trosi pokusaj.
        """
        blocked = self.replay(SANDBOX_STDOUT, SANDBOX_STDERR)
        self.assertEqual(blocked["verdict"], "blocked", blocked)
        self.assertIn("provider_unusable", blocked["reason"])
        self.assertFalse(blocked["attempt_spent"])
        self.assertEqual(blocked["exit_code"], 0, "provider je zavrsio uredno; upravo to je i bila zamka")
        self.assertTrue(any(p.endswith("stderr.log") for p in blocked["artifact_paths"]),
                        "dijagnostika kojom je kvar nadjen mora ostati zapisana")

    def test_structured_sandbox_error_on_stdout_alone_is_blocked(self):
        """Potpis se prepoznaje i kad ga codex prijavi SAMO strukturirano, u NDJSON-u, uz cist stderr.

        Bez ovoga bi build ili okolina koja tracing na stderr prigusi vratila upravo ono lazno zeleno zbog
        kojeg gard i postoji: `turn.completed`, prazan popis modela, `needs_verification`.
        """
        blocked = self.replay(SANDBOX_STDOUT_STRUCTURED, BENIGN_STDERR)
        self.assertEqual(blocked["verdict"], "blocked", blocked)
        self.assertIn("provider_unusable", blocked["reason"])
        self.assertFalse(blocked["attempt_spent"])
        # Kontrola da nalaz ne dolazi od drugog mehanizma: uspjesno izvrsavanje je prisutno, brojac nije nula.
        self.assertGreaterEqual(successful_tool_calls("codex", SANDBOX_STDOUT_STRUCTURED), 1)

    def test_the_same_phrase_in_model_prose_alone_is_not_blocked(self):
        # Negativna kontrola gore navedenog: obje fraze su u modelovu tekstu, nijedna u strojnoj stavci.
        # Model koji radi bas na ovom kvaru ih doslovno napise, pa ga gard ne smije blokirati.
        self.assertIn("apply deny-read ACLs", SANDBOX_STDOUT_WITH_TOOL_USE)
        self.assertIn("Failed to create unified exec process", SANDBOX_STDOUT_WITH_TOOL_USE)
        ok = self.replay(SANDBOX_STDOUT_WITH_TOOL_USE, BENIGN_STDERR)
        self.assertEqual(ok["verdict"], "needs_verification", ok)

    def test_nested_item_error_stays_benign(self):
        # Iz istog stvarnog loga: `item.completed` s ugnijezdjenim `item.type == "error"` (skraceni opisi
        # skillova). To NIJE greska poziva i ne smije promijeniti ni parser ni novi gard.
        self.assertIn('"type":"error"', SANDBOX_STDOUT)
        parsed = parse_provider_output("codex", SANDBOX_STDOUT, 0)
        self.assertTrue(parsed["ok"], "ugnijezdjeni item.type=error nije top-level greska")
        self.assertFalse(sandbox_unusable("", SANDBOX_STDOUT, "codex"), "benigna greska ne smije okinuti gard")
        self.assertTrue(sandbox_unusable("", SANDBOX_STDOUT_STRUCTURED, "codex"))

    def test_only_cli_errors_are_scanned_for_the_signature(self):
        machine = machine_stdout(SANDBOX_STDOUT)
        self.assertIn("Skill descriptions were shortened", machine, "greska CLI-ja ostaje u opsegu")
        self.assertNotIn("apply deny-read ACLs", machine, "modelova proza se ne skenira")
        self.assertIn("apply deny-read ACLs", machine_stdout(SANDBOX_STDOUT_STRUCTURED))
        # Izlaz naredbe se NE skenira, i to je nuzno: ovaj repozitorij frazu sada sadrzi (runbook, ovi
        # testovi), pa bi agent koji tijekom plana procita runbook inace bio proglasen blokiranim.
        read_the_runbook = json.dumps({"type": "item.completed", "item": {
            "id": "item_t", "type": "command_execution", "command": "bash -lc 'cat docs/agents/autonomy-runbook.md'",
            "aggregated_output": "potpis je `apply deny-read ACLs` i `Failed to create unified exec process`",
            "exit_code": 0, "status": "completed"}})
        self.assertFalse(sandbox_unusable("", read_the_runbook, "codex"),
                         "citanje dokumentacije o kvaru nije kvar")
        self.assertEqual(successful_tool_calls("codex", read_the_runbook), 1, "to je i dalje uspjesno citanje")
        # Claudeov izlaz je JEDAN objekt s modelovim tekstom, ne NDJSON; njegov stdout se ne skenira uopce.
        errorish = json.dumps({"type": "error", "message": "apply deny-read ACLs"})
        self.assertTrue(sandbox_unusable("", errorish, "codex"))
        self.assertFalse(sandbox_unusable("", errorish, "claude"))

    def test_sandbox_signature_matches_both_known_forms_and_nothing_else(self):
        self.assertTrue(sandbox_unusable('Rejected("Failed to create unified exec process: x")'))
        self.assertTrue(sandbox_unusable("helper_unknown_error: apply deny-read ACLs"))
        self.assertTrue(sandbox_unusable("APPLY DENY-READ ACLS"))
        self.assertFalse(sandbox_unusable(""))
        self.assertFalse(sandbox_unusable("deny read acls"))
        self.assertFalse(sandbox_unusable("failed to create process"))
        # GRANICA, imenovana a ne precutna: drugi oblik iste stete iz ISTOG stvarnog loga nema potpis.
        self.assertFalse(sandbox_unusable(
            "2026-09-13T12:13:21.734060Z ERROR codex_core::tools::router: error=timed out negotiating with the code-mode host"),
            "potpis pokriva samo dvije poznate fraze; ostatak hvata brojac uspjesnih poziva")

    def test_a_phase_that_read_nothing_is_never_needs_verification(self):
        """Opcenito pravilo, neovisno o potpisu: plan bez ijednog uspjesnog citanja nije uspjeh.

        BASELINE: `codex_ok` cita jednu datoteku i i dalje zavrsava kao `needs_verification`.
        MUTACIJA: `codex_no_tools` uredno posalje `turn.completed` bez ijednog poziva alata.
        """
        ok = self.run_fake("codex_ok")
        self.assertEqual(ok["verdict"], "needs_verification", ok)
        self.assertEqual(ok["successful_tool_calls"], 1)
        vacuous = self.run_fake("codex_no_tools")
        self.assertEqual(vacuous["verdict"], "blocked", vacuous)
        self.assertIn("no_tool_use", vacuous["reason"])
        self.assertFalse(vacuous["attempt_spent"])
        self.assertEqual(vacuous["successful_tool_calls"], 0)
        # Poziv alata koji je PAO nije uspjesan poziv; inace bi se gard dao zavarati samim pokusajem.
        failed_tool = self.run_fake("codex_failed_tool")
        self.assertEqual(failed_tool["verdict"], "blocked", failed_tool)
        self.assertIn("no_tool_use", failed_tool["reason"])
        # Ista mjera ne vrijedi za `implement`: promjena datoteka se dokazuje gateom, ne brojacem alata.
        job, env = self.job("codex_no_tools")
        impl = run_phase(job, "implement", profile(), cwd=self.dir, timeout_seconds=60, env=env)
        self.assertEqual(impl["verdict"], "needs_verification", impl)

    def test_tool_call_counter_is_unknown_for_claude_and_ignores_prose(self):
        self.assertIsNone(successful_tool_calls("claude", json.dumps({"subtype": "success"})),
                          "Claude ne prijavljuje popis alata; nepoznato ne smije blokirati")
        self.assertEqual(successful_tool_calls("codex", SANDBOX_STDOUT), 0, "tri poruke modela nisu citanje")
        self.assertEqual(successful_tool_calls("codex", ""), 0)
        self.assertEqual(successful_tool_calls("codex", TOOL_CALL_LINE), 1)



    def test_prepare_job_argv_is_unchanged_without_overrides(self):
        # Rucni tok mora ostati bajt za bajt isti; override se dodaje samo kad ga pozivatelj zada.
        seen = {}

        class Out:
            returncode = 0
            stdout = json.dumps({"dryRun": True, "command": "codex"})
            stderr = ""

        def fake_run(argv, **kwargs):
            seen["argv"] = argv
            return Out()

        with mock.patch("scripts.autonomy.worker.subprocess.run", fake_run):
            prepare_job_via_node(self.dir, "T17", "plan", "astra")
            self.assertEqual(seen["argv"][2:], ["prepare", "T17", "--phase", "plan", "--agent", "astra", "--subscription"])
            self.assertNotIn("--override-status", seen["argv"])
            self.assertNotIn("--override-implementer", seen["argv"])
            prepare_job_via_node(self.dir, "T17", "review", "astra", override_status="in_review", override_implementer="sonnet")
            argv = seen["argv"]
            self.assertEqual(argv[-4:], ["--override-status", "in_review", "--override-implementer", "sonnet"])
            self.assertEqual(argv[argv.index("--phase") + 1], "review")

    def test_launcher_resolution_reports_shims(self):
        info = resolve_launcher(os.path.basename(sys.executable))
        self.assertIn(info["kind"], ("native", "script", "cmd_shim"))
        self.assertEqual(resolve_launcher("definitely-not-installed-xyz")["kind"], "missing")

    def test_scope_check_rejects_out_of_scope_and_malformed_paths(self):
        ok, bad = diff_within_scope(["docs/a.md", "src/ui/x.ts"], ["docs/", "src/ui/x.ts"])
        self.assertTrue(ok, bad)
        ok, bad = diff_within_scope(["docs/a.md", "src/repair/fixers.ts", "../escape"], ["docs/"])
        self.assertFalse(ok)
        self.assertEqual(bad, ["src/repair/fixers.ts", "../escape"])

    def test_process_tree_without_start_is_trivially_stopped(self):
        self.assertTrue(ProcessTree().terminate_tree())


class ImplementWorktreeGuardTest(unittest.TestCase):
    """Agent s pravom pisanja ne smije se pokrenuti u dijeljenom stablu.

    `git` se ubrizgava, pa test mjeri ODLUKU, ne stanje stroja. BASELINE je uredna okolina; svaka mutacija
    je jedan od tri preduvjeta koje `scripts/agents/cli.mjs run --execute` namece rucnom toku.
    """

    HEALTHY = {("rev-parse", "--git-dir"): "/repo/.git/worktrees/wt",
               ("rev-parse", "--git-common-dir"): "/repo/.git",
               ("branch", "--show-current"): "wf/nesto",
               ("status", "--porcelain"): ""}

    def guard(self, **over):
        table = dict(self.HEALTHY)
        table.update({tuple(k.split(" ")): v for k, v in over.items()})
        return implementation_worktree_blocked("/repo", git=lambda args: (0, table[tuple(args)]))

    def test_baseline_clean_feature_worktree_is_allowed(self):
        self.assertIsNone(self.guard())

    def test_shared_checkout_is_refused(self):
        reason = self.guard(**{"rev-parse --git-dir": "/repo/.git"})
        self.assertIn("nije zaseban git worktree", reason)

    def test_master_and_detached_head_are_refused(self):
        self.assertIn("nije feature grana", self.guard(**{"branch --show-current": "master"}))
        self.assertIn("nije feature grana", self.guard(**{"branch --show-current": "main"}))
        self.assertIn("nije feature grana", self.guard(**{"branch --show-current": ""}))

    def test_dirty_worktree_is_refused(self):
        self.assertIn("nije cisto", self.guard(**{"status --porcelain": " M src/ui/app.ts"}))

    def test_git_failure_is_refused_not_ignored(self):
        self.assertIn("nije uspio", implementation_worktree_blocked("/repo", git=lambda args: (128, "")))

        def boom(args):
            raise OSError("git nema")

        self.assertIn("nije dostupan", implementation_worktree_blocked("/repo", git=boom))

    def test_a_real_temporary_directory_is_not_a_worktree(self):
        # Bez ubrizganog gita, nad stvarnim direktorijem: ovo je stanje u kojem kontroler zivi na ovom stroju
        # kad `workerRepoPath` pokazuje na instalacijski checkout ili na nesto sto uopce nije repozitorij.
        self.assertIsNotNone(implementation_worktree_blocked(tempfile.mkdtemp()))


class DeclaredWorkerRepoTest(unittest.TestCase):
    """Deklarirano radnikovo stablo (`workerRepoPath`) smije biti i ZASEBAN KLON, ne samo povezan worktree.

    Nalaz 2026-09-13: gard je usporedivao `--git-dir` s `--git-common-dir`, pa je odbijao klon na feature
    grani, koji je posve siguran i najprirodniji nacin da se `workerRepoPath` zadovolji. Ostala dva
    preduvjeta (feature grana, cisto stablo) `dedicated` NE smije ugasiti; to je mutacija ispod.
    """

    CLONE = {("rev-parse", "--git-dir"): "/klon/.git",
             ("rev-parse", "--git-common-dir"): "/klon/.git",
             ("branch", "--show-current"): "wf/nesto",
             ("status", "--porcelain"): ""}

    def guard(self, *, dedicated, **over):
        table = dict(self.CLONE)
        table.update({tuple(k.split(" ")): v for k, v in over.items()})
        return implementation_worktree_blocked("/klon", git=lambda args: (0, table[tuple(args)]), dedicated=dedicated)

    def test_baseline_an_undeclared_clone_is_still_refused(self):
        reason = self.guard(dedicated=False)
        self.assertIn("nije zaseban git worktree ni deklariran workerRepoPath", reason)

    def test_a_declared_clone_on_a_feature_branch_is_allowed(self):
        self.assertIsNone(self.guard(dedicated=True))

    def test_declaration_does_not_switch_off_the_other_two_preconditions(self):
        # MUTACIJA: da `dedicated` preskace ostatak provjere, ova dva bi presutno prosla.
        self.assertIn("nije feature grana", self.guard(dedicated=True, **{"branch --show-current": "master"}))
        self.assertIn("nije cisto", self.guard(dedicated=True, **{"status --porcelain": " M src/ui/app.ts"}))


class CommitWorkerTreeTest(unittest.TestCase):
    """Bez commita se kontroler zakljuca poslije TOCNO jednog posla (nalaz 2026-09-13).

    Gard prije implementacije trazi cisto stablo, a nizvodni lanac (klasifikacija, verifikacija, objava)
    mjeri upravo NECOMMITANE promjene, pa ih nitko nikad nije spremio. Ovdje se mjeri git STVARNO, a greske
    se mjere ubrizganim `run`-om.
    """

    def test_a_real_dirty_tree_becomes_a_commit_and_the_tree_is_clean_after(self):
        repo = git_repo()
        before = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo, capture_output=True, text=True, check=False).stdout.strip()
        with open(os.path.join(repo, "novo.txt"), "w", encoding="utf-8") as fh:
            fh.write("implementacija" + chr(10))
        with open(os.path.join(repo, "README.md"), "a", encoding="utf-8") as fh:
            fh.write("dopuna" + chr(10))
        out = commit_worker_tree(repo, "autonomija: proba" + chr(10) * 2 + "tijelo")
        self.assertEqual(out["status"], "committed", out)
        after = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo, capture_output=True, text=True, check=False).stdout.strip()
        self.assertEqual(out["sha"], after)
        self.assertNotEqual(before, after, "commit mora stvarno pomaknuti HEAD")
        dirty = subprocess.run(["git", "status", "--porcelain"], cwd=repo, capture_output=True, text=True, check=False).stdout.strip()
        self.assertEqual(dirty, "", "stablo mora ostati cisto, inace je sljedeci posao blokiran")
        files = subprocess.run(["git", "show", "--name-only", "--format=", "HEAD"], cwd=repo, capture_output=True, text=True, check=False).stdout.split()
        self.assertEqual(sorted(files), ["README.md", "novo.txt"], "i NETRACKANA datoteka mora uci u commit")

    def test_the_guard_accepts_the_tree_again_only_because_of_that_commit(self):
        # MUTACIJA nad mehanizmom: isto stablo, isti gard, bez commita. Tocno stanje koje je kontroler imao
        # prije ovog popravka, i razlog zasto drugi posao nikad nije krenuo.
        repo = git_repo()
        with open(os.path.join(repo, "novo.txt"), "w", encoding="utf-8") as fh:
            fh.write("implementacija" + chr(10))
        self.assertIn("nije cisto", implementation_worktree_blocked(repo, dedicated=True))
        self.assertEqual(commit_worker_tree(repo, "autonomija: proba")["status"], "committed")
        self.assertIsNone(implementation_worktree_blocked(repo, dedicated=True))

    def test_a_clean_tree_is_reported_as_clean_and_creates_no_commit(self):
        repo = git_repo()
        before = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo, capture_output=True, text=True, check=False).stdout.strip()
        out = commit_worker_tree(repo, "autonomija: nista")
        self.assertEqual(out["status"], "clean", out)
        after = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo, capture_output=True, text=True, check=False).stdout.strip()
        self.assertEqual(before, after, "prazan commit se ne stvara")

    def test_every_git_failure_is_reported_not_swallowed(self):
        # Svaki od tri koraka pada zasebno: tiho progutan pad bi ostavio prljavo stablo uz tvrdnju da je
        # spremljeno, dakle isti kvar samo bez traga u dnevniku.
        calls = []

        def failing(step):
            def run(args):
                calls.append(args[0])
                if args[0] == step:
                    return 1, "puklo"
                return 0, " M x" if args[0] == "status" else ""
            return run

        for step, marker in (("status", "git status nije uspio"), ("add", "git add nije uspio"),
                             ("commit", "git commit nije uspio")):
            out = commit_worker_tree("/repo", "poruka", run=failing(step))
            self.assertEqual(out["status"], "failed", (step, out))
            self.assertIn(marker, out["reason"])

        def boom(args):
            raise OSError("git nema")

        out = commit_worker_tree("/repo", "poruka", run=boom)
        self.assertEqual(out["status"], "failed")
        self.assertIn("nije dostupan", out["reason"])


class CleanlinessOnlyOnTheFirstPhaseTest(unittest.TestCase):
    """Cistoca je preduvjet POCETKA posla, ne svake faze.

    Popravak 2026-09-13 (`require_clean`) ima cijenu koju treba prikovati: nakon prve faze stablo prlja sam
    kontroler, pa bi ista provjera oborila pregled VLASTITOG posla. Preostala dva preduvjeta ne smiju pasti
    s njom, inace gard postane rupa kroz koju se pise u dijeljeno stablo.
    """

    DIRTY = {("rev-parse", "--git-dir"): "/repo/.git/worktrees/wt",
             ("rev-parse", "--git-common-dir"): "/repo/.git",
             ("branch", "--show-current"): "wf/nesto",
             ("status", "--porcelain"): " M src/ui/app.ts"}

    def guard(self, *, require_clean, **over):
        table = dict(self.DIRTY)
        table.update({tuple(k.split(" ")): v for k, v in over.items()})
        return implementation_worktree_blocked("/repo", git=lambda args: (0, table[tuple(args)]),
                                               require_clean=require_clean)

    def test_baseline_the_default_still_refuses_a_dirty_tree(self):
        self.assertIn("nije cisto", self.guard(require_clean=True))

    def test_later_phases_may_see_what_the_implementation_wrote(self):
        self.assertIsNone(self.guard(require_clean=False))

    def test_dropping_the_cleanliness_check_does_not_drop_the_other_two(self):
        # MUTACIJA: da `require_clean=False` gasi cijeli gard, ova dva bi presutno prosla.
        self.assertIn("nije zaseban git worktree", self.guard(require_clean=False,
                                                              **{"rev-parse --git-dir": "/repo/.git"}))
        self.assertIn("nije feature grana", self.guard(require_clean=False,
                                                       **{"branch --show-current": "master"}))


class ChangedPathsTest(unittest.TestCase):
    """Klasifikacija presudjuje po STAZAMA, pa staza mora biti datoteka, ne mapa.

    `git status --porcelain` nov netrackan direktorij sazme u jedan redak (`src/`). Dok kontroler nije sam
    commitao, to je bio tih detalj; otkako commita i objavljuje, po tom popisu se odlucuje je li promjena
    `auto_low_risk`, pa bi kontrolna datoteka u novoj mapi prosla neprimijecena.
    """

    def setUp(self):
        self.repo = git_repo()
        os.makedirs(os.path.join(self.repo, "src", "autonomija"))
        for name in ("a.ts", "b.ts"):
            with open(os.path.join(self.repo, "src", "autonomija", name), "w", encoding="utf-8") as fh:
                fh.write("export const x = 1;" + chr(10))

    def test_a_new_untracked_directory_is_listed_file_by_file(self):
        self.assertEqual(sorted(changed_paths(self.repo)),
                         ["src/autonomija/a.ts", "src/autonomija/b.ts"])

    def test_without_the_flag_git_collapses_the_directory(self):
        # KONTROLA nad mehanizmom: ovo je ono sto je popis bio prije popravka, i razlog zasto je flag nuzan.
        raw = subprocess.run(["git", "status", "--porcelain"], cwd=self.repo, capture_output=True, text=True,
                             check=False).stdout.split()
        self.assertEqual(raw, ["??", "src/"])

if __name__ == "__main__":
    unittest.main()
