import json
import os
import sys
import tempfile
import time
import unittest

from unittest import mock

from scripts.autonomy.worker import (
    ProcessTree, classify_stream, diff_within_scope, model_matches, parse_provider_output, pid_alive,
    prepare_job_via_node, resolve_launcher, run_phase, sandbox_unusable, scrubbed_env,
)

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

    def test_the_same_phrase_in_model_prose_alone_is_not_blocked(self):
        # Potpis se trazi ISKLJUCIVO u stderru. Stdout ovdje sadrzi obje fraze, u modelovu tekstu.
        self.assertIn("apply deny-read ACLs", SANDBOX_STDOUT)
        self.assertIn("Failed to create unified exec process", SANDBOX_STDOUT)
        ok = self.replay(SANDBOX_STDOUT, BENIGN_STDERR)
        self.assertEqual(ok["verdict"], "needs_verification", ok)

    def test_nested_item_error_stays_benign(self):
        # Iz istog stvarnog loga: `item.completed` s ugnijezdjenim `item.type == "error"` (skraceni opisi
        # skillova). To NIJE greska poziva i ne smije promijeniti ni parser ni novi gard.
        self.assertIn('"type":"error"', SANDBOX_STDOUT)
        parsed = parse_provider_output("codex", SANDBOX_STDOUT, 0)
        self.assertTrue(parsed["ok"], "ugnijezdjeni item.type=error nije top-level greska")
        # Gard bi na OVOM tekstu pogodio, jer ga modelova proza sadrzi; zato ga run_phase zove iskljucivo
        # nad stderrom (dokazuje test iznad). Ovdje se to samo imenuje, da ogranicenje ne ostane precutno.
        self.assertTrue(sandbox_unusable(SANDBOX_STDOUT))

    def test_sandbox_signature_matches_both_known_forms_and_nothing_else(self):
        self.assertTrue(sandbox_unusable('Rejected("Failed to create unified exec process: x")'))
        self.assertTrue(sandbox_unusable("helper_unknown_error: apply deny-read ACLs"))
        self.assertTrue(sandbox_unusable("APPLY DENY-READ ACLS"))
        self.assertFalse(sandbox_unusable(""))
        self.assertFalse(sandbox_unusable("deny read acls"))
        self.assertFalse(sandbox_unusable("failed to create process"))

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


if __name__ == "__main__":
    unittest.main()
