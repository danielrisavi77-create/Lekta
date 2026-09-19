import json
import os
import sys
import tempfile
import time
import unittest

from scripts.autonomy.worker import (
    ProcessTree, classify_stream, diff_within_scope, model_matches, parse_provider_output, pid_alive,
    resolve_launcher, run_phase, scrubbed_env,
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
elif mode == "echo_prompt":
    assert "LEKTA task" in prompt
    print(json.dumps({"type": "turn.completed", "model": "gpt-5.6-sol"}))
'''


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
