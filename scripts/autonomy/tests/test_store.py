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

    def test_refund_attempt_is_explicit_and_does_not_change_old_targets(self):
        """Uzak refund za ciljeve izvan REFUND_STATUSES (tocka 1 i 3 nalaza 2026-09-13).

        BASELINE: blocked i needs_human bez zastavice i dalje TROSE pokusaj, kao i prije.
        MUTACIJA: ista prijelaza sa `refund_attempt: True` vracaju pokusaj.
        REGRESIJA: waiting_quota bez zastavice i dalje refundira PO DEFAULTU, a s `False` ne refundira.
        """
        task_id = self.store.enqueue(signal(), NOW)

        # BASELINE: stari put, bez zastavice; pokusaj ostaje potrosen.
        self.store.claim("A", NOW, max_attempts=9, max_new_per_day=99)
        self.assertEqual(self.store.get_task(task_id)["attempts"], 1)
        self.store.transition(task_id, "planning", "blocked", {"reason": "x"}, NOW + 1)
        self.assertEqual(self.store.get_task(task_id)["attempts"], 1, "blocked bez zastavice ne smije refundirati")
        self.store.transition(task_id, "blocked", "queued", {}, NOW + 2)

        self.store.claim("A", NOW + 3, max_attempts=9, max_new_per_day=99)
        self.assertEqual(self.store.get_task(task_id)["attempts"], 2)
        self.store.transition(task_id, "planning", "needs_human", {"reason": "dokaz nepotpun"}, NOW + 4)
        self.assertEqual(self.store.get_task(task_id)["attempts"], 2, "needs_human bez zastavice ne smije refundirati")
        self.store.transition(task_id, "needs_human", "queued", {}, NOW + 5)

        # MUTACIJA: eksplicitna tvrdnja da poziv nije ni poceo.
        self.store.claim("A", NOW + 6, max_attempts=9, max_new_per_day=99)
        self.assertEqual(self.store.get_task(task_id)["attempts"], 3)
        self.store.transition(task_id, "planning", "needs_human",
                              {"reason": "no_ready_plan_task: signal nema planTask", "refund_attempt": True}, NOW + 7)
        self.assertEqual(self.store.get_task(task_id)["attempts"], 2, "no_ready_plan_task ne smije trositi pokusaj")
        self.store.transition(task_id, "needs_human", "queued", {}, NOW + 8)

        self.store.claim("A", NOW + 9, max_attempts=9, max_new_per_day=99)
        self.assertEqual(self.store.get_task(task_id)["attempts"], 3)
        self.store.transition(task_id, "planning", "blocked",
                              {"reason": "provider_unusable: codex sandbox", "refund_attempt": True}, NOW + 10)
        self.assertEqual(self.store.get_task(task_id)["attempts"], 2, "provider_unusable ne smije trositi pokusaj")
        # Zastavica ne smije procuriti u dnevnik dogadjaja.
        last = self.store.events(task_id)[-1]
        self.assertNotIn("refund_attempt", json.loads(last["sanitized_payload"]))
        self.store.transition(task_id, "blocked", "queued", {}, NOW + 11)

        # REGRESIJA: stari REFUND_STATUSES put je netaknut u OBA smjera.
        self.store.claim("A", NOW + 12, max_attempts=9, max_new_per_day=99)
        before = self.store.get_task(task_id)["attempts"]
        self.store.transition(task_id, "planning", "waiting_quota", {}, NOW + 13)
        self.assertEqual(self.store.get_task(task_id)["attempts"], before - 1, "waiting_quota i dalje refundira po defaultu")
        self.store.transition(task_id, "waiting_quota", "queued", {}, NOW + 14)
        self.store.claim("A", NOW + 15, max_attempts=9, max_new_per_day=99)
        before = self.store.get_task(task_id)["attempts"]
        self.store.transition(task_id, "planning", "waiting_quota", {"refund_attempt": False}, NOW + 16)
        self.assertEqual(self.store.get_task(task_id)["attempts"], before, "izricito False i dalje gasi refund")

    def test_daily_job_slot_is_returned_only_when_the_caller_claims_it(self):
        """Dnevni slot je granica MODELSKE potrosnje (nalaz 2026-09-13).

        BASELINE: nijedan postojeci prijelaz ne dira brojac, ni onaj koji refundira pokusaj.
        MUTACIJA: `refund_daily_job: True` vraca slot.
        RUB: brojac ne ide ispod nule, i zastavica ne curi u dnevnik dogadjaja.
        """
        task_id = self.store.enqueue(signal(), NOW)
        self.store.claim("A", NOW, max_attempts=9, max_new_per_day=99)
        self.assertEqual(self.store.daily_counter("jobs", NOW), 1)

        self.store.transition(task_id, "planning", "needs_human", {"reason": "dokaz nepotpun"}, NOW + 1)
        self.assertEqual(self.store.daily_counter("jobs", NOW), 1, "bez zastavice slot ostaje potrosen")
        self.store.transition(task_id, "needs_human", "queued", {}, NOW + 2)
        self.store.claim("A", NOW + 3, max_attempts=9, max_new_per_day=99)
        self.store.transition(task_id, "planning", "waiting_quota", {}, NOW + 4)
        self.assertEqual(self.store.daily_counter("jobs", NOW), 2,
                         "refund POKUSAJA ne povlaci refund slota; to su dvije razlicite granice")
        self.store.transition(task_id, "waiting_quota", "queued", {}, NOW + 5)

        self.store.claim("A", NOW + 6, max_attempts=9, max_new_per_day=99)
        self.assertEqual(self.store.daily_counter("jobs", NOW), 3)
        self.store.transition(task_id, "planning", "needs_human",
                              {"reason": "no_ready_plan_task: signal nema planTask",
                               "refund_attempt": True, "refund_daily_job": True}, NOW + 7)
        self.assertEqual(self.store.daily_counter("jobs", NOW), 2, "poziv nije ni krenuo, slot se vraca")
        self.assertNotIn("refund_daily_job", json.loads(self.store.events(task_id)[-1]["sanitized_payload"]))

        # RUB: vise povrata nego sto je uzeto ne smije dati negativan brojac.
        for step, expected in ((8, 1), (10, 0), (12, 0)):
            self.store.transition(task_id, "needs_human", "queued", {}, NOW + step)
            self.store.transition(task_id, "queued", "needs_human", {"refund_daily_job": True}, NOW + step + 1)
            self.assertEqual(self.store.daily_counter("jobs", NOW), expected)

    def test_an_amended_signal_updates_the_task_and_wakes_it_from_needs_human(self):
        """Ponovljen signal s IZMIJENJENIM opsegom je operaterov ispravak (nalaz 2026-09-13 nad store.enqueue).

        BASELINE: identican signal samo broji pojave i nista ne mijenja.
        MUTACIJA: izmijenjen `scope` osvjezava zapis i vraca `needs_human` zadatak u red.
        KONTROLA: zadatak u `blocked` se NE budi, da ispravak ne postane zaobilazak zaustavljanja.
        """
        raw = dict(kind="ci_failure", location="check/ux-gate@master", symptom="ux-gate pada",
                   source_revision=SHA, observed_at=NOW, scope={"area": "ci"})
        task_id = self.store.enqueue(normalize_signal(raw), NOW)
        self.store.enqueue(normalize_signal(raw), NOW + 1)
        task = self.store.get_task(task_id)
        self.assertEqual(task["occurrences"], 2)
        self.assertEqual(task["status"], "queued")
        self.assertEqual([e["event_type"] for e in self.store.events(task_id)][-1], "signal_repeated")

        self.store.claim("A", NOW + 2)
        self.store.transition(task_id, "planning", "needs_human", {"reason": "no_ready_plan_task"}, NOW + 3)
        amended = dict(raw, scope={"area": "ci", "planTask": "T17"})
        self.assertEqual(self.store.enqueue(normalize_signal(amended), NOW + 4), task_id, "isti fingerprint")
        task = self.store.get_task(task_id)
        self.assertEqual(task["status"], "queued", "ispravak budi zadatak koji je cekao covjeka")
        self.assertEqual(task["signal"]["scope"]["planTask"], "T17", "zapis signala se osvjezava, ne zamrzava")
        self.assertEqual(task["scope"]["planTask"], "T17")
        self.assertIn("signal_amended", [e["event_type"] for e in self.store.events(task_id)])

        self.store.claim("A", NOW + 5)
        self.store.transition(task_id, "planning", "blocked", {"reason": "provider_unusable"}, NOW + 6)
        self.store.enqueue(normalize_signal(dict(raw, scope={"area": "ci", "planTask": "T18"})), NOW + 7)
        self.assertEqual(self.store.get_task(task_id)["status"], "blocked", "blokiran zadatak se ne budi sam")

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


class AmendedSignalWakeupTest(unittest.TestCase):
    """Ispravak signala budi SAMO zaustavljanje na koje odgovara, i vraca pokusaje na nulu.

    Nalaz 2026-09-13 nad prvom izvedbom ovog puta: budio je svaki `needs_human`, ukljucivo `PR ceka ljudski
    merge` i `dokaz nepotpun`, a `attempts` nije dirao. Oba kvara imaju cijenu: prvi vrti isti posao drugi
    put (tri nova poziva modela i drugi push), drugi stvara `queued` zadatak koji `claim` vise ne uzima
    (`attempts < max`) i koji nestane iz svakog upozorenja, jer `report.build_status` `queued` ne gleda.
    """

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.store = Store(os.path.join(self.dir, "autonomy.sqlite"))
        self.raw = dict(kind="ci_failure", location="check/ux-gate@master", symptom="ux-gate pada",
                        source_revision=SHA, observed_at=NOW, scope={"area": "ci"})

    def tearDown(self):
        self.store.close()

    def stop(self, reason, attempts=1, location=None):
        """Zadatak koji ceka covjeka iz zadanog razloga, nakon `attempts` pokusaja."""
        raw = dict(self.raw, location=location) if location else self.raw
        task_id = self.store.enqueue(normalize_signal(raw), NOW)
        for n in range(attempts):
            claimed = self.store.claim("A", NOW + n, max_attempts=9, max_new_per_day=99)
            self.assertIsNotNone(claimed)
            target = "needs_human" if n == attempts - 1 else "queued"
            self.store.transition(task_id, "planning", target, {"reason": reason} if target == "needs_human" else {}, NOW + n)
        return task_id

    def amend(self, task_id, plan_task="T17", at=NOW + 50, location=None):
        amended = dict(self.raw, scope={"area": "ci", "planTask": plan_task})
        if location:
            amended["location"] = location
        self.assertEqual(self.store.enqueue(normalize_signal(amended), at), task_id, "isti otisak, isti zadatak")
        return self.store.get_task(task_id)

    def test_baseline_an_answered_plan_task_wakes_the_task_and_clears_its_attempts(self):
        task_id = self.stop("no_ready_plan_task: signal nema planTask", attempts=2)
        self.assertEqual(self.store.get_task(task_id)["attempts"], 2)
        task = self.amend(task_id)
        self.assertEqual(task["status"], "queued")
        self.assertEqual(task["attempts"], 0, "covjek je odgovorio, pa je ovo nov posao za isti otisak")
        self.assertEqual(task["scope"]["planTask"], "T17")
        self.assertIsNotNone(self.store.claim("A", NOW + 51, max_attempts=2, max_new_per_day=99),
                             "bez nule pokusaja bi ovaj claim vratio None i zadatak bi bio trajno nepodizljiv")

    def test_a_task_waiting_for_a_human_merge_is_not_woken_by_a_scope_edit(self):
        # MUTACIJA: isti mehanizam, drugo zaustavljanje. Bez razlikovanja razloga bi dopisan `paths` unos u
        # inbox datoteci pokrenuo isti posao drugi put, uz tri nova poziva modela i drugi push.
        task_id = self.stop("PR ceka ljudski merge")
        task = self.amend(task_id)
        self.assertEqual(task["status"], "needs_human", "PR koji ceka covjeka se ne budi ispravkom opsega")
        self.assertEqual(task["scope"]["planTask"], "T17", "zapis signala se svejedno osvjezava")
        types = [e["event_type"] for e in self.store.events(task_id)]
        self.assertEqual(types[-1], "signal_amended_not_woken", types)
        payload = json.loads(self.store.events(task_id)[-1]["sanitized_payload"])
        self.assertEqual(payload["stop_reason"], "PR ceka ljudski merge")

    def test_an_incomplete_proof_and_an_unrecorded_reason_are_not_woken_either(self):
        for n, reason in enumerate(("dokaz nepotpun", "commit_failed: git commit nije uspio", "publisher_not_configured")):
            with self.subTest(reason=reason):
                where = f"check/w{n}@master"
                task_id = self.stop(reason, location=where)
                self.assertEqual(self.amend(task_id, location=where)["status"], "needs_human")
        # Zaustavljanje bez zapisanog razloga: fail-safe je NE buditi, jer se razlog ne moze provjeriti.
        task_id = self.store.enqueue(normalize_signal(dict(self.raw, location="check/drugi@master")), NOW)
        self.assertEqual(self.store.claim("A", NOW + 1, max_new_per_day=99)["id"], task_id)
        self.store.transition(task_id, "planning", "needs_human", {}, NOW + 2)
        amended = dict(self.raw, location="check/drugi@master", scope={"area": "ci", "planTask": "T17"})
        self.store.enqueue(normalize_signal(amended), NOW + 3)
        self.assertEqual(self.store.get_task(task_id)["status"], "needs_human")

    def test_snapshot_names_queued_tasks_that_no_claim_can_take(self):
        task_id = self.stop("no_ready_plan_task: signal nema planTask", attempts=2)
        self.amend(task_id)
        # BASELINE: nakon ispravka nema nikoga iznad stropa, jer su pokusaji vraceni na nulu.
        self.assertEqual(self.store.snapshot(NOW + 60, max_attempts=2)["queuedOverAttemptLimit"], [])
        # MUTACIJA: isti zadatak vracen u red BEZ nule pokusaja, dakle stanje koje je prva izvedba stvarala.
        self.store.conn.execute("UPDATE tasks SET attempts = 2 WHERE id = ?", (task_id,))
        self.store.conn.commit()
        snap = self.store.snapshot(NOW + 61, max_attempts=2)
        self.assertEqual([r["id"] for r in snap["queuedOverAttemptLimit"]], [task_id])
        self.assertIsNone(self.store.claim("A", NOW + 62, max_attempts=2, max_new_per_day=99), "upozorenje mora opisivati STVARNO stanje")
        self.assertEqual(snap["tasksByStatus"], {"queued": 1}, "brojac po statusu ga i dalje broji kao red")
        # Bez zadanog stropa (stari pozivatelji) popis je prazan i nista se ne mijenja.
        self.assertEqual(self.store.snapshot(NOW + 63)["queuedOverAttemptLimit"], [])


if __name__ == "__main__":
    unittest.main()
