import json
import os
import subprocess
import sys
import tempfile
import unittest

from scripts.autonomy import cli
from scripts.autonomy.store import Store

NOW = 1_800_000_000
SHA = "48c1fc9e85f50213e5b313bc67cfbc0a45a28607"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
EXAMPLE = os.path.join(ROOT, "config", "autonomy.example.json")


def config(**over):
    with open(EXAMPLE, encoding="utf-8") as fh:
        cfg = json.load(fh)
    cfg.update(over)
    return cfg


def profile():
    return dict(subscription_verified=True, extra_credits_disabled=True, effective_auth="subscription",
                model_included=True, configuration_unchanged=True, trusted_observation=True)


def ci_source(conclusion="failure"):
    return [{"id": "ci", "kind": "github_ci", "items": [dict(repository="danielrisavi77-create/Lekta", branch="master", workflow="check",
                                                            job="ux-gate", sha=SHA, conclusion=conclusion, completed_at=NOW - 60)]}]


class RecordingAdapters:
    def __init__(self, verdicts=("needs_verification",) * 3, complete=True, publish_status="proposed", change_class="auto_low_risk"):
        self.calls = []
        self.verdicts = list(verdicts)
        self.complete = complete
        self.publish_status = publish_status
        self.change_class = change_class

    def run_phase(self, task, phase, profile):
        self.calls.append(("run", phase))
        return {"verdict": self.verdicts.pop(0), "reason": "fake", "provider": "fake", "requested_model": "x", "reported_models": ["x"]}

    def classify(self, task):
        self.calls.append(("classify",))
        return self.change_class, []

    def verify(self, task):
        self.calls.append(("verify",))
        return {"complete": self.complete, "staleness": {"verdict": "fresh" if self.complete else "unknown"}, "controlFilesChanged": [], "candidateSha": SHA}

    def publish(self, task, evidence, store, now, change_class):
        self.calls.append(("publish", change_class))
        return {"status": self.publish_status, "reason": "fake", "pr": 7}


class TickTest(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp()
        self.store = Store(os.path.join(self.home, "a.sqlite"))

    def tearDown(self):
        self.store.close()

    def test_dry_run_touches_nothing(self):
        adapters = RecordingAdapters()
        out = cli.tick(config(mode="auto_low_risk"), NOW, True, store=self.store, home=self.home, sources=ci_source(), adapters=adapters, profile=profile())
        self.assertEqual(out["signals"], 1)
        self.assertEqual(len(out["enqueued"]), 1)
        self.assertEqual(self.store.list_tasks(), [], "dry-run ne upisuje u red")
        self.assertIsNone(self.store.lease())
        self.assertEqual(adapters.calls, [])
        self.assertIsNone(out["claimed"])

    def test_observe_records_signals_without_any_call(self):
        adapters = RecordingAdapters()
        out = cli.tick(config(mode="observe"), NOW, False, store=self.store, home=self.home, sources=ci_source(), adapters=adapters, profile=profile())
        self.assertEqual(len(self.store.list_tasks("queued")), 1)
        self.assertEqual(adapters.calls, [])
        self.assertIn("observe", out["outcome"])
        again = cli.tick(config(mode="observe"), NOW + 3600, False, store=self.store, home=self.home, sources=ci_source(), adapters=adapters, profile=profile())
        self.assertEqual(len(self.store.list_tasks()), 1, "isti signal u drugom pollu ne stvara novi zadatak")
        self.assertEqual(self.store.list_tasks()[0]["occurrences"], 2)
        self.assertEqual(again["claimed"], None)

    def test_billing_unknown_blocks_model_calls(self):
        adapters = RecordingAdapters()
        out = cli.tick(config(mode="propose"), NOW, False, store=self.store, home=self.home, sources=ci_source(), adapters=adapters, profile={})
        self.assertIn("billing_unknown", out["outcome"])
        self.assertEqual(adapters.calls, [])
        self.assertEqual(self.store.list_tasks("queued")[0]["attempts"], 0)

    def test_propose_drives_one_task_to_pr_and_needs_human(self):
        adapters = RecordingAdapters(publish_status="proposed")
        out = cli.tick(config(mode="propose", publisherEnabled=True), NOW, False, store=self.store, home=self.home, sources=ci_source(), adapters=adapters, profile=profile())
        self.assertEqual(out["outcome"], "proposed")
        self.assertEqual([c[0] for c in adapters.calls], ["run", "run", "run", "classify", "verify", "publish"])
        task = self.store.get_task(out["claimed"])
        self.assertEqual(task["status"], "needs_human")
        self.assertIsNone(self.store.lease())
        events = [e["event_type"] for e in self.store.events(task["id"])]
        self.assertIn("phase_start:planning", events)
        self.assertIn("run:reviewing", events)
        self.assertIn("status:ready_to_publish", events)

    def test_quota_pauses_task_without_spending_attempt(self):
        adapters = RecordingAdapters(verdicts=("waiting_quota",))
        out = cli.tick(config(mode="propose"), NOW, False, store=self.store, home=self.home, sources=ci_source(), adapters=adapters, profile=profile())
        self.assertEqual(out["outcome"], "waiting_quota")
        task = self.store.get_task(out["claimed"])
        self.assertEqual(task["attempts"], 0)
        self.assertEqual(task["next_run_at"], NOW + 3600)

    def test_incomplete_evidence_never_reaches_publisher(self):
        adapters = RecordingAdapters(complete=False)
        out = cli.tick(config(mode="auto_low_risk", publisherEnabled=True), NOW, False, store=self.store, home=self.home, sources=ci_source(), adapters=adapters, profile=profile())
        self.assertEqual(out["outcome"], "needs_human")
        self.assertNotIn(("publish", "auto_low_risk"), adapters.calls)

    def test_failed_phase_and_blocked_phase(self):
        adapters = RecordingAdapters(verdicts=("needs_verification", "failed"))
        out = cli.tick(config(mode="propose"), NOW, False, store=self.store, home=self.home, sources=ci_source(), adapters=adapters, profile=profile())
        self.assertEqual(out["outcome"], "failed")
        self.assertEqual(self.store.get_task(out["claimed"])["status"], "failed")
        store2 = Store(os.path.join(self.home, "b.sqlite"))
        try:
            adapters = RecordingAdapters(verdicts=("blocked",))
            out = cli.tick(config(mode="propose"), NOW, False, store=store2, home=self.home, sources=ci_source(), adapters=adapters, profile=profile())
            self.assertEqual(out["outcome"], "blocked")
        finally:
            store2.close()

    def test_paused_store_does_nothing(self):
        self.store.set_paused(True)
        adapters = RecordingAdapters()
        out = cli.tick(config(mode="propose"), NOW, False, store=self.store, home=self.home, sources=ci_source(), adapters=adapters, profile=profile())
        self.assertEqual(out["outcome"], "paused")
        self.assertEqual(self.store.list_tasks(), [])

    def test_no_signals_is_idle_without_calls(self):
        adapters = RecordingAdapters()
        out = cli.tick(config(mode="propose"), NOW, False, store=self.store, home=self.home, sources=[], adapters=adapters, profile=profile())
        self.assertIn("idle", out["outcome"])
        self.assertEqual(adapters.calls, [])

    def test_default_agent_schedule_has_no_fable(self):
        cfg = config()
        for phase in ("planning", "implementing", "reviewing"):
            self.assertNotEqual(cli._agent_for(cfg, phase, {}), "fable")
        self.assertEqual(cli._agent_for(cfg, "reviewing", {"implementationAgent": "sol"}), "opus")
        self.assertEqual(cli._agent_for(cfg, "reviewing", {"implementationAgent": "sonnet"}), "astra")


class BillingProfileTest(unittest.TestCase):
    def test_profile_is_conservative_without_attestation(self):
        doc = {"logins": {"codex": {"logged_in": True, "method": "chatgpt"}, "claude": {"logged_in": None}},
               "configFingerprint": "f1", "observedAt": "t"}
        prof = cli.build_billing_profile(doctor=doc, config=config(), attest={}, previous={})
        self.assertEqual(prof["effective_auth"], "subscription")
        self.assertTrue(prof["subscription_verified"])
        self.assertFalse(prof["extra_credits_disabled"])
        self.assertFalse(prof["model_included"])
        from scripts.autonomy.policy import billing_allowed
        self.assertFalse(billing_allowed(prof))
        attested = cli.build_billing_profile(doctor=doc, config=config(), attest={"extra_credits_disabled": True, "model_included": True, "models": ["gpt-5.6-sol"]}, previous={})
        self.assertTrue(billing_allowed(attested))
        changed = cli.build_billing_profile(doctor=doc, config=config(), attest={"extra_credits_disabled": True, "model_included": True}, previous={"config_fingerprint": "old"})
        self.assertFalse(changed["configuration_unchanged"])
        self.assertFalse(billing_allowed(changed))

    def test_api_key_env_forces_api_auth(self):
        doc = {"logins": {"codex": {"logged_in": True, "method": "chatgpt"}, "claude": {}}, "configFingerprint": "f", "observedAt": "t"}
        old = os.environ.get("ANTHROPIC_API_KEY")
        os.environ["ANTHROPIC_API_KEY"] = "sk-ant-test"
        try:
            prof = cli.build_billing_profile(doctor=doc, config=config(), attest={"extra_credits_disabled": True, "model_included": True}, previous={})
        finally:
            if old is None:
                del os.environ["ANTHROPIC_API_KEY"]
            else:
                os.environ["ANTHROPIC_API_KEY"] = old
        self.assertEqual(prof["effective_auth"], "api_key")
        from scripts.autonomy.policy import billing_allowed
        self.assertFalse(billing_allowed(prof))


class CliProcessTest(unittest.TestCase):
    def run_cli(self, *args, home, config_path=None):
        env = dict(os.environ, LEKTA_AUTONOMY_HOME=home)
        env["LEKTA_AUTONOMY_CONFIG"] = config_path or os.path.join(home, "missing.json")
        return subprocess.run([sys.executable, "-m", "scripts.autonomy.cli", *args], cwd=ROOT, capture_output=True, text=True, env=env, timeout=120)

    def test_tick_without_config_is_refused_and_pause_survives_processes(self):
        home = tempfile.mkdtemp()
        out = self.run_cli("tick", "--dry-run", home=home)
        self.assertEqual(out.returncode, 2, out.stderr)
        self.assertIn("konfiguracija", out.stderr)
        cfg_path = os.path.join(home, "autonomy.json")
        with open(cfg_path, "w", encoding="utf-8") as fh:
            json.dump(config(mode="observe", signalSources=[{"id": "inbox", "kind": "inbox"}]), fh)
        out = self.run_cli("tick", "--dry-run", home=home, config_path=cfg_path)
        self.assertEqual(out.returncode, 0, out.stderr)
        summary = json.loads(out.stdout)
        self.assertEqual(summary["signals"], 0)
        self.assertTrue(summary["dryRun"])
        self.assertEqual(self.run_cli("pause", "--reason", "test", home=home, config_path=cfg_path).returncode, 0)
        out = self.run_cli("tick", home=home, config_path=cfg_path)
        self.assertEqual(json.loads(out.stdout)["outcome"], "paused")
        status = json.loads(self.run_cli("status", home=home, config_path=cfg_path).stdout)
        self.assertTrue(status["paused"])
        self.assertIn("paused", status["warnings"])
        self.assertEqual(self.run_cli("resume", home=home, config_path=cfg_path).returncode, 0)
        out = self.run_cli("tick", home=home, config_path=cfg_path)
        self.assertIn("observe", json.loads(out.stdout)["outcome"])
        self.assertTrue(os.path.isfile(os.path.join(home, "status.md")))
        self.assertTrue(os.path.isfile(os.path.join(home, "status.json")))
        with open(os.path.join(home, "status.md"), encoding="utf-8") as fh:
            self.assertNotIn("USD", fh.read())


if __name__ == "__main__":
    unittest.main()
