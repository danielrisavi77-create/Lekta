"""Status koji sam covjek cita: ono sto se ne pojavi u `warnings` ne postoji.

Nalaz 2026-09-13: zadatak koji je u `queued` a iznad stropa pokusaja nijedan tick ne uzme, a nijedno
upozorenje ga ne spominje, jer `build_status` gleda needs_login/waiting_quota/needs_human/blocked. Isto
vrijedi za instalaciju u kojoj implementacija ne moze proci jer `workerRepoPath` nije postavljen: prije ovog
popravka se to saznavalo tek iz `blocked` zadatka, dakle nakon sto je posao vec propao.
"""
import json
import os
import tempfile
import unittest

from scripts.autonomy.report import build_status
from scripts.autonomy.signals import normalize_signal
from scripts.autonomy.store import Store

NOW = 1_800_000_000
SHA = "48c1fc9e85f50213e5b313bc67cfbc0a45a28607"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def config(**over):
    with open(os.path.join(ROOT, "config", "autonomy.example.json"), encoding="utf-8") as fh:
        cfg = json.load(fh)
    cfg.update(over)
    return cfg


def signal(symptom="boom"):
    return normalize_signal(dict(kind="test_failure", location="tests/x.test.ts", symptom=symptom,
                                 source_revision=SHA, observed_at=NOW))


def healthy_doctor(**over):
    doc = {"billing": {"allowed": True}, "word": {"available": True}, "logins": {},
           "workerRepo": {"path": "/wt", "declared": True, "dedicated": True, "blocked": None}}
    doc.update(over)
    return doc


class StatusWarningsTest(unittest.TestCase):
    def setUp(self):
        self.store = Store(os.path.join(tempfile.mkdtemp(), "a.sqlite"))

    def tearDown(self):
        self.store.close()

    def test_baseline_a_healthy_installation_warns_about_nothing(self):
        status = build_status(self.store, config(), NOW, None, healthy_doctor())
        self.assertEqual(status["warnings"], [], status)
        self.assertEqual(status["queuedOverAttemptLimit"], [])

    def test_a_queued_task_above_the_attempt_ceiling_is_named(self):
        # MUTACIJA stanja: zadatak koji je u redu, a `claim` ga vise ne uzima. Bez ovog upozorenja nestaje iz
        # svakog pogleda koji covjek ima.
        task_id = self.store.enqueue(signal(), NOW)
        self.store.conn.execute("UPDATE tasks SET attempts = 2 WHERE id = ?", (task_id,))
        self.store.conn.commit()
        status = build_status(self.store, config(maxAttemptsPerTask=2), NOW, None, healthy_doctor())
        self.assertEqual(status["queuedOverAttemptLimit"], [task_id])
        self.assertIn("queued iznad stropa pokusaja: 1", status["warnings"])
        self.assertIsNone(self.store.claim("A", NOW + 1, max_attempts=2), "upozorenje opisuje stvarno stanje")
        # KONTROLA: isti zadatak ispod stropa nije upozorenje, inace bi gard vristao na uredan red.
        self.store.conn.execute("UPDATE tasks SET attempts = 1 WHERE id = ?", (task_id,))
        self.store.conn.commit()
        status = build_status(self.store, config(maxAttemptsPerTask=2), NOW, None, healthy_doctor())
        self.assertEqual(status["queuedOverAttemptLimit"], [])
        self.assertEqual(status["warnings"], [])

    def test_a_blocked_worker_repo_is_a_warning_before_the_first_job_fails(self):
        blocked = healthy_doctor(workerRepo={"path": os.getcwd(), "declared": False, "dedicated": False,
                                             "blocked": "implement_unsafe: nije zaseban git worktree ni deklariran workerRepoPath"})
        status = build_status(self.store, config(), NOW, None, blocked)
        self.assertEqual(len(status["warnings"]), 1, status["warnings"])
        self.assertTrue(status["warnings"][0].startswith("implementacija blokirana: implement_unsafe"), status["warnings"])

    def test_a_missing_attempt_ceiling_does_not_break_the_status(self):
        # Stari pozivatelj bez `maxAttemptsPerTask` (i `build_status` bez doctora) mora i dalje proci.
        cfg = config()
        cfg.pop("maxAttemptsPerTask", None)
        status = build_status(self.store, cfg, NOW)
        self.assertEqual(status["queuedOverAttemptLimit"], [])
        self.assertEqual(status["warnings"], [])


if __name__ == "__main__":
    unittest.main()
