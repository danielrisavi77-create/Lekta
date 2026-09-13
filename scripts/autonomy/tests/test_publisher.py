import os
import tempfile
import unittest

from scripts.autonomy.publisher import idempotency_key, observe_deployment, publish_verified, rollback_verified
from scripts.autonomy.store import Store

NOW = 1_800_000_000
BASE = "a" * 40
CAND = "b" * 40
REQUIRED = ["check", "ux"]


def policy(**over):
    p = {"repository": "danielrisavi77-create/Lekta", "baseBranch": "master", "mode": "auto_low_risk", "publisherEnabled": True,
         "policyVersion": "p1", "requiredReleaseTiers": REQUIRED, "maxOpenAutonomyPrs": 2, "maxSuccessfulAutoDeploysPerDay": 1}
    p.update(over)
    return p


def evidence(**over):
    e = {"signature_verified": True, "hashes_verified": True, "policy_current": True, "candidateSha": CAND, "baseSha": BASE,
         "complete": True, "proofComplete": True, "staleness": {"verdict": "fresh"}, "controlFilesChanged": [],
         "checks": {t: "pass" for t in REQUIRED}}
    e.update(over)
    return e


class FakeRemote:
    def __init__(self):
        self.prs = {}
        self.by_key = {}
        self.next_number = 100
        self.protection = {"available": True, "required_checks": ["check", "ux-gate"], "enforce_admins": True}
        self.head = BASE
        self.checks = {"check": "success", "ux-gate": "success"}
        self.merge_calls = 0
        self.fail_after_merge = False
        self.unavailable = False

    def _guard(self):
        if self.unavailable:
            raise ConnectionError("api down")

    def find_pull_request(self, key):
        self._guard()
        return self.by_key.get(key)

    def open_pull_request(self, branch, base, title, body, key):
        self._guard()
        pr = {"number": self.next_number, "head_sha": CAND, "base_sha": base, "merged": False, "merge_sha": None, "branch": branch}
        self.next_number += 1
        self.prs[pr["number"]] = pr
        self.by_key[key] = pr
        return pr

    def pull_request(self, number):
        self._guard()
        pr = dict(self.prs[number])
        pr["checks"] = dict(self.checks)
        return pr

    def branch_protection(self, base):
        self._guard()
        return dict(self.protection)

    def base_head(self, base):
        self._guard()
        return self.head

    def merge(self, number, expected_head, key):
        self._guard()
        self.merge_calls += 1
        pr = self.prs[number]
        if pr["head_sha"] != expected_head:
            return {"merged": False}
        pr["merged"] = True
        pr["merge_sha"] = "m" * 40
        if self.fail_after_merge:
            raise ConnectionError("connection reset after merge")
        return {"merged": True, "merge_sha": pr["merge_sha"]}


class FakeHosting:
    def __init__(self):
        self.deploys = {"d0": {"id": "d0", "state": "ready", "commit_sha": BASE, "artifact_hash": "h0"},
                        "d1": {"id": "d1", "state": "ready", "commit_sha": CAND, "artifact_hash": "h1"}}
        self.restored = []
        self.unavailable = False
        self.refuse_restore = False

    def deployment(self, deployment_id):
        if self.unavailable:
            raise ConnectionError("netlify down")
        return self.deploys.get(deployment_id)

    def restore(self, deployment_id):
        if self.unavailable:
            raise ConnectionError("netlify down")
        if self.refuse_restore:
            return {"ok": False}
        self.restored.append(deployment_id)
        return {"ok": True, "id": deployment_id}


class PublisherTest(unittest.TestCase):
    def setUp(self):
        self.store = Store(os.path.join(tempfile.mkdtemp(), "a.sqlite"))
        self.remote = FakeRemote()
        self.candidate = {"candidateSha": CAND, "branch": "autonomy/x", "task_id": None, "title": "t", "body": "b", "openAutonomyPrs": 0}

    def tearDown(self):
        self.store.close()

    def publish(self, pol=None, ev=None, change_class="auto_low_risk", now=NOW):
        return publish_verified(self.candidate, ev or evidence(), pol or policy(), remote=self.remote, store=self.store, now=now, change_class=change_class)

    def test_publisher_disabled_or_observe_never_touches_remote(self):
        self.assertEqual(self.publish(policy(publisherEnabled=False))["status"], "blocked")
        self.assertEqual(self.publish(policy(mode="observe"))["reason"].split(":")[0], "mode_observe")
        self.assertEqual(self.remote.prs, {})

    def test_propose_opens_one_pr_and_does_not_merge(self):
        first = self.publish(policy(mode="propose"))
        self.assertEqual(first["status"], "proposed")
        second = self.publish(policy(mode="propose"))
        self.assertEqual(second["pr"], first["pr"], "isti kandidat = isti PR")
        self.assertEqual(len(self.remote.prs), 1)
        self.assertEqual(self.remote.merge_calls, 0)

    def test_auto_low_risk_happy_path_merges_exactly_once(self):
        out = self.publish()
        self.assertEqual(out["status"], "merged", out)
        self.assertEqual(self.remote.merge_calls, 1)
        again = self.publish()
        self.assertEqual(again["status"], "merged")
        self.assertEqual(self.remote.merge_calls, 1, "ponovljeni poziv ne ponavlja objavu")
        self.assertEqual(self.store.daily_counter("deploys", NOW), 1)

    def test_crash_after_remote_merge_before_local_record_is_recovered(self):
        self.remote.fail_after_merge = True
        out = self.publish()
        self.assertEqual(out["status"], "unknown")
        self.assertEqual(self.store.daily_counter("deploys", NOW), 0)
        self.remote.fail_after_merge = False
        self.remote.unavailable = False
        again = self.publish()
        self.assertEqual(again["status"], "merged")
        self.assertEqual(again["merge_sha"], "m" * 40)
        self.assertEqual(self.remote.merge_calls, 1, "drugi poziv nalazi postojeci merge, ne radi novi")

    def test_evidence_and_class_gates_block_merge_but_keep_pr(self):
        for ev, name in ((evidence(complete=False), "complete"), (evidence(signature_verified=False), "sig"),
                         (evidence(staleness={"verdict": "unknown"}), "unknown"), (evidence(controlFilesChanged=["package.json"]), "control"),
                         (evidence(checks={"check": "pass", "ux": "unknown"}), "ux")):
            self.assertEqual(self.publish(ev=ev)["status"], "blocked", name)
        self.assertEqual(self.publish(change_class="needs_human")["status"], "blocked")
        self.assertEqual(self.remote.merge_calls, 0)
        self.assertEqual(len(self.remote.prs), 1)

    def test_branch_protection_required_checks_and_master_drift(self):
        self.remote.checks["ux-gate"] = "failure"
        out = self.publish()
        self.assertIn("required_checks_not_green", out["reason"])
        self.remote.checks["ux-gate"] = "success"
        self.remote.head = "c" * 40
        self.assertIn("stale_base", self.publish()["reason"])
        self.remote.head = BASE
        self.remote.protection["available"] = False
        self.assertIn("branch_protection_unreadable", self.publish()["reason"])
        self.remote.protection.update(available=True, required_checks=[])
        self.assertIn("no_required_checks", self.publish()["reason"])
        self.assertEqual(self.remote.merge_calls, 0)

    def test_remote_outage_is_unknown_not_success(self):
        self.remote.unavailable = True
        out = self.publish()
        self.assertEqual(out["status"], "unknown")
        self.assertIn("remote_unavailable", out["reason"])

    def test_daily_deploy_limit_pause_and_freeze(self):
        self.store.bump_daily("deploys", NOW)
        self.assertIn("max_deploys_today", self.publish()["reason"])
        self.store.set_paused(True)
        self.assertEqual(self.publish()["reason"], "paused")
        self.store.set_paused(False)
        self.store.set_frozen(True, "test", NOW)
        self.assertIn("publish_frozen", self.publish()["reason"])

    def test_pr_head_moved_blocks(self):
        first = self.publish(policy(mode="propose"))
        self.remote.prs[first["pr"]]["head_sha"] = "d" * 40
        self.assertIn("pr_head_mismatch", self.publish()["reason"])

    def test_idempotency_key_is_stable_and_policy_bound(self):
        self.assertEqual(idempotency_key("r", CAND, "p1"), idempotency_key("r", CAND, "p1"))
        self.assertNotEqual(idempotency_key("r", CAND, "p1"), idempotency_key("r", CAND, "p2"))


class DeploymentTest(unittest.TestCase):
    def setUp(self):
        self.store = Store(os.path.join(tempfile.mkdtemp(), "a.sqlite"))
        self.hosting = FakeHosting()
        self.store.record_deployment("d0", BASE, "h0", "verified", NOW - 100)
        self.store.set_deployment_status("d0", "verified", NOW - 90, verified=True)
        self.store.record_deployment("d1", CAND, "h1", "published", NOW, previous_deployment_id="d0")

    def tearDown(self):
        self.store.close()

    def observe(self, smoke, **kw):
        return observe_deployment("d1", hosting=self.hosting, smoke=smoke, site_url="https://example.invalid", store=self.store, now=NOW, **kw)

    def test_healthy_failed_unknown(self):
        self.assertEqual(self.observe(lambda u: "pass", expected_commit=CAND, expected_artifact_hash="h1")["verdict"], "healthy")
        self.assertEqual(self.store.deployment("d1")["status"], "verified")
        self.assertEqual(self.observe(lambda u: "fail")["verdict"], "failed")
        self.assertEqual(self.observe(lambda u: "unknown")["verdict"], "unknown")
        self.assertEqual(self.observe(lambda u: "pass", expected_commit="e" * 40)["verdict"], "failed")
        self.hosting.unavailable = True
        self.assertEqual(self.observe(lambda u: "pass")["verdict"], "unknown")

    def test_single_rollback_then_freeze(self):
        out = rollback_verified("d1", hosting=self.hosting, smoke=lambda u: "pass", site_url="x", store=self.store, now=NOW)
        self.assertEqual(out["status"], "rolled_back")
        self.assertEqual(out["restored_deployment_id"], "d0")
        self.assertEqual(self.hosting.restored, ["d0"])
        self.assertTrue(self.store.is_frozen(), "nakon povrata objave su zamrznute do razjasnjenja")
        # Zamrznuto: druga objava se ne pokrece; nema drugog povrata bez covjeka.
        again = rollback_verified("d1", hosting=self.hosting, smoke=lambda u: "pass", site_url="x", store=self.store, now=NOW + 1)
        self.assertEqual(again["restored_deployment_id"], "d0")
        self.assertEqual(self.hosting.restored, ["d0", "d0"], "ponovni poziv je eksplicitan; frozen flag ga treba sprijeciti na razini ticka")

    def test_rollback_failure_modes(self):
        self.hosting.refuse_restore = True
        out = rollback_verified("d1", hosting=self.hosting, smoke=lambda u: "pass", site_url="x", store=self.store, now=NOW)
        self.assertEqual(out["status"], "failed")
        self.assertTrue(self.store.is_frozen())
        self.hosting.refuse_restore = False
        self.hosting.unavailable = True
        out = rollback_verified("d1", hosting=self.hosting, smoke=lambda u: "pass", site_url="x", store=self.store, now=NOW)
        self.assertEqual(out["status"], "unknown")
        self.hosting.unavailable = False
        out = rollback_verified("d1", hosting=self.hosting, smoke=lambda u: "unknown", site_url="x", store=self.store, now=NOW)
        self.assertEqual(out["status"], "unknown")

    def test_rollback_without_verified_previous_blocks(self):
        store = Store(os.path.join(tempfile.mkdtemp(), "b.sqlite"))
        try:
            store.record_deployment("d1", CAND, "h1", "published", NOW)
            out = rollback_verified("d1", hosting=self.hosting, smoke=lambda u: "pass", site_url="x", store=store, now=NOW)
            self.assertEqual(out["status"], "blocked")
            self.assertTrue(store.is_frozen())
        finally:
            store.close()


if __name__ == "__main__":
    unittest.main()
