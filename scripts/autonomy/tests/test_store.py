import json
import os
import subprocess
import sys
import tempfile
import time
import unittest

from scripts.autonomy.signals import normalize_signal
from scripts.autonomy.store import Store, TransitionConflict, utc_day

NOW = 1_800_000_000
SHA = "48c1fc9e85f50213e5b313bc67cfbc0a45a28607"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def signal(symptom="boom", kind="test_failure"):
    return normalize_signal(dict(kind=kind, location="tests/x.test.ts", symptom=symptom, source_revision=SHA, observed_at=NOW))


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = os.path.join(self.dir, "autonomy.sqlite")
        self.store = Store(self.path)

    def tearDown(self):
        self.store.close()

    def test_repeated_signal_is_one_task(self):
        a = self.store.enqueue(signal(), NOW)
        b = self.store.enqueue(signal(), NOW + 60)
        self.assertEqual(a, b)
        task = self.store.get_task(a)
        self.assertEqual(task["occurrences"], 2)
        self.assertEqual(task["status"], "queued")
        self.assertEqual(len(self.store.list_tasks()), 1)
        self.assertNotEqual(self.store.enqueue(signal("other"), NOW), a)

    def test_claim_is_conditional_and_exclusive_within_a_process(self):
        self.store.enqueue(signal(), NOW)
        self.store.enqueue(signal("second"), NOW)
        other = Store(self.path)
        try:
            first = self.store.claim("A", NOW)
            self.assertIsNotNone(first)
            self.assertEqual(first["status"], "planning")
            self.assertEqual(first["attempts"], 1)
            self.assertIsNone(other.claim("B", NOW), "drugi vlasnik ne smije dobiti posao dok traje lease")
            self.assertIsNone(self.store.claim("A", NOW), "isti vlasnik ne dobiva drugi aktivni posao")
        finally:
            other.close()

    def test_two_real_processes_claim_at_most_one_job(self):
        self.store.enqueue(signal(), NOW)
        self.store.enqueue(signal("second"), NOW)
        start_at = time.time() + 1.5
        script = (
            "import sys, time, json; sys.path.insert(0, sys.argv[1]);"
            "from scripts.autonomy.store import Store;"
            "s = Store(sys.argv[2]);"
            "time.sleep(max(0, float(sys.argv[4]) - time.time()));"
            f"t = s.claim(sys.argv[3], {NOW});"
            "print(json.dumps(t['id'] if t else None))"
        )
        procs = [subprocess.Popen([sys.executable, "-c", script, ROOT, self.path, owner, str(start_at)],
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for owner in ("P1", "P2")]
        outs = [p.communicate(timeout=60) for p in procs]
        for (out, err), p in zip(outs, procs):
            self.assertEqual(p.returncode, 0, err)
        claimed = [json.loads(out.strip().splitlines()[-1]) for out, _ in outs]
        self.assertEqual(sum(1 for c in claimed if c), 1, claimed)
        self.assertEqual(len(self.store.list_tasks("planning")), 1)

    def test_restart_after_claim_keeps_state_and_does_not_duplicate(self):
        task_id = self.store.enqueue(signal(), NOW)
        self.assertIsNotNone(self.store.claim("A", NOW, process_start_id="boot-1"))
        self.store.close()
        reopened = Store(self.path)
        try:
            self.assertEqual(reopened.get_task(task_id)["status"], "planning")
            self.assertEqual(reopened.lease()["owner_id"], "A")
            # Novi proces, drugi vlasnik: istekli lease bez dokaza smrti prethodnika NIJE dovoljan.
            later = NOW + 4 * 3600
            self.assertIsNone(reopened.claim("B", later))
            self.assertIsNone(reopened.claim("B", later, process_alive=lambda owner, start: True))
            # Aktivan zadatak i dalje blokira: prvo se rjesava on (transition), tek onda novi claim.
            self.assertIsNone(reopened.claim("B", later, process_alive=lambda owner, start: False))
            reopened.transition(task_id, "planning", "failed", {"reason": "process gone"}, later)
            self.assertIsNone(reopened.lease())
            reopened.enqueue(signal("next"), later)
            self.assertIsNotNone(reopened.claim("B", later, process_alive=lambda owner, start: False))
        finally:
            reopened.close()

    def test_transition_conflict_rolls_back_and_keeps_newer_state(self):
        task_id = self.store.enqueue(signal(), NOW)
        self.store.claim("A", NOW)
        self.store.transition(task_id, "planning", "implementing", {}, NOW + 1)
        with self.assertRaises(TransitionConflict):
            self.store.transition(task_id, "planning", "failed", {"reason": "stale writer"}, NOW + 2)
        task = self.store.get_task(task_id)
        self.assertEqual(task["status"], "implementing")
        self.assertIsNotNone(self.store.lease(), "neuspjela promjena ne smije obrisati lease")
        self.assertEqual([e["event_type"] for e in self.store.events(task_id)][-1], "status:implementing")
        with self.assertRaises(ValueError):
            self.store.transition(task_id, "implementing", "totally_done", {}, NOW + 3)

    def test_quota_and_login_outcomes_refund_the_attempt(self):
        task_id = self.store.enqueue(signal(), NOW)
        self.store.claim("A", NOW)
        self.assertEqual(self.store.get_task(task_id)["attempts"], 1)
        self.store.transition(task_id, "planning", "waiting_quota", {"next_run_at": NOW + 7200}, NOW + 5)
        task = self.store.get_task(task_id)
        self.assertEqual(task["attempts"], 0)
        self.assertEqual(task["next_run_at"], NOW + 7200)
        self.assertIsNone(self.store.lease())
        # Nije dospio: nema claima prije next_run_at. Pokusaj se nije potrosio jer je claim vracen u queued.
        self.store.transition(task_id, "waiting_quota", "queued", {}, NOW + 6)
        self.assertIsNone(self.store.claim("A", NOW + 10))
        self.assertIsNotNone(self.store.claim("A", NOW + 7200))

    def test_attempt_ceiling_and_daily_limit_reset_on_utc_day_not_on_restart(self):
        task_id = self.store.enqueue(signal(), NOW)
        for i in range(2):
            self.assertIsNotNone(self.store.claim("A", NOW + i, max_attempts=2))
            self.store.transition(task_id, "planning", "failed", {}, NOW + i)
            self.store.transition(task_id, "failed", "queued", {}, NOW + i)
        self.assertIsNone(self.store.claim("A", NOW + 5, max_attempts=2), "treci pokusaj je zabranjen")
        # Dnevni limit: tri claima, cetvrti pada; restart u istom danu ne resetira; novi UTC dan resetira.
        for n in range(3):
            self.store.enqueue(signal(f"d{n}"), NOW)
        self.assertEqual(self.store.daily_counter("jobs", NOW), 2)
        t = self.store.claim("A", NOW + 10, max_new_per_day=3)
        self.assertIsNotNone(t)
        self.store.transition(t["id"], "planning", "done", {}, NOW + 11)
        self.assertIsNone(self.store.claim("A", NOW + 12, max_new_per_day=3))
        self.store.close()
        self.store = Store(self.path)
        self.assertIsNone(self.store.claim("A", NOW + 13, max_new_per_day=3))
        self.assertEqual(self.store.daily_counter("jobs", NOW + 13), 3)
        next_day = NOW + 86_400
        self.assertNotEqual(utc_day(NOW), utc_day(next_day))
        self.assertEqual(self.store.daily_counter("jobs", next_day), 0)
        self.assertIsNotNone(self.store.claim("A", next_day, max_new_per_day=3))

    def test_pause_survives_a_new_store_process_and_blocks_claims(self):
        self.store.enqueue(signal(), NOW)
        self.store.set_paused(True, "owner")
        self.store.close()
        self.store = Store(self.path)
        self.assertTrue(self.store.is_paused())
        self.assertIsNone(self.store.claim("A", NOW))
        self.store.set_paused(False)
        self.assertIsNotNone(self.store.claim("A", NOW))

    def test_stored_payloads_are_redacted(self):
        token = "ghp_" + "Z" * 36
        task_id = self.store.enqueue(signal(), NOW)
        self.store.record_event(task_id, "note", {"log": f"token {token} here", "xml": "<w:p>tekst rada</w:p>"}, NOW)
        events = self.store.events(task_id)
        flat = json.dumps(events)
        self.assertNotIn(token, flat)
        self.assertNotIn("tekst rada", flat)
        with open(self.path, "rb") as fh:
            raw = fh.read()
        self.assertNotIn(token.encode(), raw)

    def test_snapshot_and_deployments(self):
        task_id = self.store.enqueue(signal(), NOW)
        self.store.claim("A", NOW)
        self.store.record_deployment("d1", SHA, "h1", "verified", NOW)
        self.store.set_deployment_status("d1", "verified", NOW + 1, verified=True)
        snap = self.store.snapshot(NOW + 2)
        self.assertEqual(snap["tasksByStatus"], {"planning": 1})
        self.assertEqual(snap["activeTask"]["id"], task_id)
        self.assertEqual(snap["jobsToday"], 1)
        self.assertEqual(snap["lastVerifiedDeployment"]["deployment_id"], "d1")
        self.assertFalse(snap["publishFrozen"])


if __name__ == "__main__":
    unittest.main()
