import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

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
    def __init__(self, verdicts=("needs_verification",) * 3, complete=True, publish_status="proposed", change_class="auto_low_risk",
                 extra=None):
        self.calls = []
        self.verdicts = list(verdicts)
        self.complete = complete
        self.publish_status = publish_status
        self.change_class = change_class
        # Polja koja adapter tvrdi uz verdict (`attempt_spent`, `provider_called`); zadano ih nema, pa je
        # zateceno ponasanje nepromijenjeno.
        self.extra = dict(extra or {})

    def run_phase(self, task, phase, profile):
        self.calls.append(("run", phase))
        result = {"verdict": self.verdicts.pop(0), "reason": "fake", "provider": "fake", "requested_model": "x", "reported_models": ["x"]}
        result.update(self.extra)
        return result

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

    def test_blocked_without_a_started_call_refunds_only_the_attempt(self):
        """Spoj koji je nedostajao: `attempt_spent` iz radnika mora stici do baze i kroz granu `blocked`.

        BASELINE: blocked bez te tvrdnje i dalje trosi pokusaj (staro ponasanje).
        MUTACIJA: uz tvrdnju se pokusaj vraca, ali dnevni slot NE, jer je poziv providera vec krenuo.
        """
        base = RecordingAdapters(verdicts=("blocked",))
        out = cli.tick(config(mode="propose"), NOW, False, store=self.store, home=self.home, sources=ci_source(),
                       adapters=base, profile=profile())
        self.assertEqual(out["outcome"], "blocked")
        self.assertEqual(self.store.get_task(out["claimed"])["attempts"], 1, "bez tvrdnje pokusaj ostaje potrosen")
        self.store.transition(out["claimed"], "blocked", "queued", {}, NOW + 1)

        adapters = RecordingAdapters(verdicts=("blocked",), extra={"attempt_spent": False,
                                                                   "reason": "provider_unusable: codex sandbox"})
        out = cli.tick(config(mode="propose"), NOW + 2, False, store=self.store, home=self.home, sources=ci_source(),
                       adapters=adapters, profile=profile())
        self.assertEqual(out["outcome"], "blocked")
        task = self.store.get_task(out["claimed"])
        self.assertEqual(task["attempts"], 1, "drugi claim je vracen; ostaje samo pokusaj iz prvog ticka")
        self.assertEqual(self.store.daily_counter("jobs", NOW + 2), 2,
                         "provider JE pokrenut u oba ticka, pa dnevni slot ostaje potrosen")

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



QUEUE_FIXTURE = [
    {"id": "T00", "title": "gotov zadatak", "status": "done", "dependsOn": []},
    {"id": "T01", "title": "spreman bez ovisnosti", "status": "ready", "dependsOn": []},
    {"id": "T02", "title": "spreman uz nedovrsenu ovisnost", "status": "ready", "dependsOn": ["T01"]},
    {"id": "T03", "title": "spreman uz dovrsenu ovisnost", "status": "ready", "dependsOn": ["T00"]},
    {"id": "T04", "title": "blokiran", "status": "blocked", "dependsOn": []},
]


def make_repo(tasks=None):
    """Minimalan radnikov repo: samo koordinatorov red. Kontroler ga cita, nikad ne pise."""
    repo = tempfile.mkdtemp()
    agents = os.path.join(repo, "docs", "agents")
    os.makedirs(agents)
    with open(os.path.join(agents, "tasks.json"), "w", encoding="utf-8") as fh:
        json.dump({"tasks": tasks if tasks is not None else QUEUE_FIXTURE}, fh)
    return repo


def inbox_source(plan_task="T01", symptom="ux-gate pada"):
    scope = {"area": "ci"}
    if plan_task is not None:
        scope["planTask"] = plan_task
    return [{"id": "inbox", "kind": "inbox", "items": [dict(kind="ci_failure", location="check/ux-gate@master",
                                                            symptom=symptom, source_revision=SHA, observed_at=NOW - 60,
                                                            scope=scope)]}]


def fake_job(command="codex"):
    return {"command": command, "args": ["exec"], "prompt": "LEKTA task", "requestedModel": "m", "dryRun": True}


class PlanTaskGateTest(unittest.TestCase):
    """Tocka 1 nalaza 2026-09-13: ciljni zadatak se razrjesava PRIJE ijednog poziva modela.

    BASELINE dokazuje da ispravan `ready` zadatak i dalje prolazi (gard koji sve gasi nije gard).
    MUTACIJE su tri oblika promasaja iz zivog ticka 26ba9cf7.
    """

    def setUp(self):
        self.repo = make_repo()
        self.home = tempfile.mkdtemp()
        self.adapters = cli.DefaultAdapters(config(workerRepoPath=self.repo), self.home)

    def task(self, plan_task, task_id="task-1"):
        scope = {} if plan_task is None else {"planTask": plan_task}
        return {"id": task_id, "signal": {"scope": scope}}

    def drive(self, task, phase="planning"):
        with mock.patch.object(cli, "prepare_job_via_node", return_value=fake_job()) as prep, \
             mock.patch.object(cli, "run_phase", return_value={"verdict": "needs_verification", "reason": "fake"}) as call:
            result = self.adapters.run_phase(task, phase, profile())
        return result, prep, call

    def test_baseline_ready_task_still_reaches_the_provider(self):
        result, prep, call = self.drive(self.task("T01"))
        self.assertEqual(result["verdict"], "needs_verification", result)
        self.assertEqual(result["plan_task"], "T01")
        self.assertEqual(result["agent"], "astra")
        self.assertEqual(prep.call_count, 1)
        self.assertEqual(prep.call_args.args[1], "T01", "prepare mora dobiti razrijesen zadatak, ne T00")
        self.assertEqual(call.call_count, 1)

    def test_baseline_ready_task_with_finished_dependency_passes(self):
        result, prep, _ = self.drive(self.task("T03"))
        self.assertEqual(result["verdict"], "needs_verification", result)
        self.assertEqual(prep.call_args.args[1], "T03")

    def test_signal_without_plan_task_never_calls_a_provider(self):
        result, prep, call = self.drive(self.task(None))
        self.assertEqual(result["verdict"], "needs_human")
        self.assertTrue(result["reason"].startswith("no_ready_plan_task"), result["reason"])
        self.assertFalse(result["attempt_spent"])
        self.assertEqual(prep.call_count, 0)
        self.assertEqual(call.call_count, 0)

    def test_done_task_never_calls_a_provider(self):
        # Tocno zivi tick 26ba9cf7: fallback na T00, koji je u redu `done`.
        result, prep, call = self.drive(self.task("T00"))
        self.assertEqual(result["verdict"], "needs_human")
        self.assertIn("T00 je done", result["reason"])
        self.assertEqual((prep.call_count, call.call_count), (0, 0))

    def test_unfinished_dependency_never_calls_a_provider(self):
        result, prep, call = self.drive(self.task("T02"))
        self.assertEqual(result["verdict"], "needs_human")
        self.assertIn("ovisnost T01 nije done", result["reason"])
        self.assertEqual((prep.call_count, call.call_count), (0, 0))

    def test_unknown_task_and_unreadable_queue_never_call_a_provider(self):
        result, prep, _ = self.drive(self.task("T99"))
        self.assertEqual(result["verdict"], "needs_human")
        self.assertIn("T99 nije u redu", result["reason"])
        self.assertEqual(prep.call_count, 0)
        os.remove(os.path.join(self.repo, "docs", "agents", "tasks.json"))
        result, prep, _ = self.drive(self.task("T01"))
        self.assertEqual(result["verdict"], "needs_human")
        self.assertIn("nije citljiv", result["reason"])
        self.assertEqual(prep.call_count, 0)

    def test_gate_holds_on_every_phase_and_on_a_repeated_tick(self):
        # Jednoprolazni gard je slijep: drugi identican prolaz mora dati isti ishod, i dalje bez poziva.
        for phase in ("planning", "implementing", "reviewing"):
            for attempt in (1, 2):
                result, prep, call = self.drive(self.task("T00"), phase=phase)
                self.assertEqual(result["verdict"], "needs_human", (phase, attempt))
                self.assertTrue(result["reason"].startswith("no_ready_plan_task"), (phase, attempt, result["reason"]))
                self.assertEqual((prep.call_count, call.call_count), (0, 0), (phase, attempt))


class ReviewWithoutQueueWriteTest(unittest.TestCase):
    """Tocka 2 nalaza: pregled prolazi bez ijedne izmjene `docs/agents/tasks.json`."""

    def setUp(self):
        self.repo = make_repo()
        self.home = tempfile.mkdtemp()
        self.queue_path = os.path.join(self.repo, "docs", "agents", "tasks.json")
        with open(self.queue_path, "rb") as fh:
            self.queue_before = fh.read()
        self.adapters = cli.DefaultAdapters(config(workerRepoPath=self.repo), self.home)
        self.task = {"id": "task-1", "signal": {"scope": {"planTask": "T01"}}}

    def run_phase(self, phase, prep):
        # Git okolina se mjeri zasebno (ImplementWorktreeGuardTest i TickPlanTaskTest); ovdje bi njezin izostanak
        # samo maskirao ono sto se mjeri, jer je fixture repo obican direktorij, ne worktree.
        with mock.patch.object(cli, "prepare_job_via_node", prep), \
             mock.patch.object(cli, "implementation_worktree_blocked", return_value=None), \
             mock.patch.object(cli, "run_phase", return_value={"verdict": "needs_verification", "reason": "fake"}):
            return self.adapters.run_phase(self.task, phase, profile())

    def test_review_uses_the_implementer_recorded_in_this_tick(self):
        prep = mock.Mock(return_value=fake_job())
        self.assertEqual(self.run_phase("implementing", prep)["agent"], "sonnet")
        result = self.run_phase("reviewing", prep)
        self.assertEqual(result["verdict"], "needs_verification", result)
        self.assertEqual(result["agent"], "astra", "recenzent mora biti drugi provider od implementatora")
        kwargs = prep.call_args.kwargs
        self.assertEqual(kwargs["override_status"], "in_review")
        self.assertEqual(kwargs["override_implementer"], "sonnet")
        with open(self.queue_path, "rb") as fh:
            self.assertEqual(fh.read(), self.queue_before, "kontroler ne smije dirati koordinatorov red")

    def test_review_without_a_recorded_implementer_is_blocked_not_guessed(self):
        # MUTACIJA: pregled bez prethodne implementacije u ovom ticku. Pogadjanje bi moglo dati istog
        # providera kao recenzent, cime bi pravilo o drugom provideru tiho otislo.
        prep = mock.Mock(return_value=fake_job())
        result = self.run_phase("reviewing", prep)
        self.assertEqual(result["verdict"], "blocked")
        self.assertIn("implementer_unknown", result["reason"])
        self.assertFalse(result["attempt_spent"])
        self.assertEqual(prep.call_count, 0)

    def test_implement_phase_never_sends_an_override(self):
        # Override ne smije postati rupa kroz koju se zaobilazi provjera spremnosti iz tocke 1.
        prep = mock.Mock(return_value=fake_job())
        self.run_phase("implementing", prep)
        self.assertIsNone(prep.call_args.kwargs["override_status"])
        self.assertIsNone(prep.call_args.kwargs["override_implementer"])

    def test_plan_phase_never_sends_an_override(self):
        prep = mock.Mock(return_value=fake_job())
        self.run_phase("planning", prep)
        self.assertIsNone(prep.call_args.kwargs["override_status"])
        self.assertIsNone(prep.call_args.kwargs["override_implementer"])


class GatedAdapters(cli.DefaultAdapters):
    """Pravi `run_phase` (ono sto se mjeri), lazna verifikacija i objava (ne diramo git ni mrezu)."""

    def classify(self, task):
        return "auto_low_risk", []

    def verify(self, task):
        return {"complete": True, "staleness": {"verdict": "fresh"}, "controlFilesChanged": [], "candidateSha": SHA}

    def publish(self, task, evidence, store, now, change_class):
        return {"status": "proposed", "reason": "fake", "pr": 7}


class TickPlanTaskTest(unittest.TestCase):
    """Isti kvar na razini cijelog ticka, s pravim redom i pravim `_drive_task`-om."""

    def setUp(self):
        self.repo = make_repo()
        self.home = tempfile.mkdtemp()
        self.store = Store(os.path.join(self.home, "a.sqlite"))

    def tearDown(self):
        self.store.close()

    def run_tick(self, sources, now=NOW, cfg=None, worktree_ok=True):
        cfg = cfg or config(mode="propose", workerRepoPath=self.repo)
        adapters = GatedAdapters(cfg, self.home)
        prep = mock.Mock(return_value=fake_job())
        guard = mock.patch.object(cli, "implementation_worktree_blocked", return_value=None) if worktree_ok \
            else mock.patch.object(cli, "implementation_worktree_blocked", wraps=cli.implementation_worktree_blocked)
        with mock.patch.object(cli, "prepare_job_via_node", prep), guard, \
             mock.patch.object(cli, "run_phase", return_value={"verdict": "needs_verification", "reason": "fake"}):
            out = cli.tick(cfg, now, False, store=self.store,
                           home=self.home, sources=sources, adapters=adapters, profile=profile())
        return out, prep

    def test_signal_without_plan_task_costs_no_call_and_no_attempt(self):
        out, prep = self.run_tick(ci_source())
        self.assertEqual(out["outcome"], "needs_human")
        self.assertEqual(prep.call_count, 0, "nijedan poziv providera ne smije krenuti")
        task = self.store.get_task(out["claimed"])
        self.assertEqual(task["attempts"], 0, "pokusaj se ne trosi kad poziv nije ni poceo")
        self.assertTrue(task["status"] == "needs_human")
        payload = json.loads(self.store.events(task["id"])[-1]["sanitized_payload"])
        self.assertTrue(str(payload.get("reason", "")).startswith("no_ready_plan_task"), payload)

    def test_repeated_tick_repeats_the_verdict_without_spending_attempts(self):
        first, prep = self.run_tick(ci_source())
        self.assertEqual(first["outcome"], "needs_human")
        self.store.transition(first["claimed"], "needs_human", "queued", {}, NOW + 1)
        second, prep2 = self.run_tick(ci_source(), now=NOW + 2)
        self.assertEqual(second["outcome"], "needs_human")
        self.assertEqual(second["claimed"], first["claimed"])
        self.assertEqual(prep2.call_count, 0)
        self.assertEqual(self.store.get_task(first["claimed"])["attempts"], 0)

    def test_ready_plan_task_drives_all_three_phases(self):
        # BASELINE nad cijelim tickom: ispravan signal i dalje prolazi plan -> implement -> review.
        out, prep = self.run_tick(inbox_source("T01"))
        self.assertEqual(out["outcome"], "proposed", out)
        self.assertEqual([p["phase"] for p in out["phases"]][:3], ["planning", "implementing", "reviewing"])
        self.assertEqual([p.get("agent") for p in out["phases"]][:3], ["astra", "sonnet", "astra"])
        self.assertEqual(prep.call_count, 3)
        self.assertEqual([c.args[1] for c in prep.call_args_list], ["T01", "T01", "T01"])

    def test_implement_never_starts_a_writing_agent_in_a_shared_checkout(self):
        """Popravak tocke 1 je fazu `implement` prvi put ucinio DOSTIZNOM, pa preduvjeti moraju postojati i ovdje.

        Kontroler posao priprema kroz `prepare`, dakle bez `--execute`, i providera pokrece sam: tri provjere iz
        `scripts/agents/cli.mjs` ga inace nikad ne dotaknu. Fixture repo nije git worktree, sto je tocno stanje
        instalacijskog checkouta na masteru.
        """
        out, prep = self.run_tick(inbox_source("T01"), worktree_ok=False)
        self.assertEqual(out["outcome"], "blocked", out)
        last = out["phases"][-1]
        self.assertEqual(last["phase"], "implementing")
        self.assertTrue(str(last["reason"]).startswith("implement_unsafe"), out["phases"])
        self.assertEqual(prep.call_count, 1, "priprema je izvedena samo za plan; implementacija nije ni krenula")
        task = self.store.get_task(out["claimed"])
        self.assertEqual(task["attempts"], 0, "blokada prije poziva ne trosi pokusaj")
        self.assertEqual(self.store.daily_counter("jobs", NOW), 1,
                         "plan JE pozvao model, pa se dnevni slot NE vraca")


class DailyJobSlotTest(unittest.TestCase):
    """Signali bez ciljnog zadatka ne smiju pojesti dan (nalaz 2026-09-13 nad cli.py).

    Izmjereno prije popravka: izvor `ci` prati tri workflowa; kad su sva tri crvena, tri ticka zavrse kao
    `needs_human` bez ijednog poziva modela, ali svaki potrosi jedan od tri dnevna slota, pa cetvrti tick javi
    `idle: ... limit dosegnut` i signal s ispravnim `planTask` toga dana nikad ne dodje na red.
    """

    def setUp(self):
        self.repo = make_repo()
        self.home = tempfile.mkdtemp()
        self.store = Store(os.path.join(self.home, "a.sqlite"))
        self.cfg = config(mode="propose", workerRepoPath=self.repo, maxNewJobsPerDay=3)

    def tearDown(self):
        self.store.close()

    def sources(self):
        # Tri crvena workflowa (prioritet 40, bez planTask) i jedan rucni signal s ispravnim ciljem (prioritet
        # 25), dakle POSLJEDNJI u redu. Tocno raspored iz izmjerenog slucaja.
        red = [dict(kind="ci_failure", location=f"check/w{n}@master", symptom=f"w{n} conclusion=failure",
                    source_revision=SHA, observed_at=NOW - 60, scope={"area": "ci"}) for n in range(3)]
        ready = dict(kind="manual", location="inbox/t01", symptom="pokreni T01", source_revision=SHA,
                     observed_at=NOW - 60, scope={"area": "repo", "planTask": "T01"})
        return [{"id": "inbox", "kind": "inbox", "items": red + [ready]}]

    def run_tick(self, now):
        adapters = GatedAdapters(self.cfg, self.home)
        prep = mock.Mock(return_value=fake_job())
        with mock.patch.object(cli, "prepare_job_via_node", prep), \
             mock.patch.object(cli, "implementation_worktree_blocked", return_value=None), \
             mock.patch.object(cli, "run_phase", return_value={"verdict": "needs_verification", "reason": "fake"}):
            return cli.tick(self.cfg, now, False, store=self.store, home=self.home, sources=self.sources(),
                            adapters=adapters, profile=profile()), prep

    def test_three_signals_without_a_plan_task_do_not_starve_the_one_that_would_pass(self):
        for n in range(3):
            out, prep = self.run_tick(NOW + n)
            self.assertEqual(out["outcome"], "needs_human", out)
            self.assertEqual(prep.call_count, 0, "nijedan poziv modela nije krenuo")
            self.assertEqual(self.store.daily_counter("jobs", NOW + n), 0,
                             "slot koji nije potrosio model mora se vratiti")
        out, prep = self.run_tick(NOW + 3)
        self.assertEqual(out["outcome"], "proposed", out)
        self.assertEqual(prep.call_count, 3, "sve tri faze ispravnog zadatka su izvedene")
        self.assertEqual(self.store.daily_counter("jobs", NOW + 3), 1, "tek ovaj posao je potrosio slot")

    def test_without_the_slot_refund_the_fourth_tick_is_idle(self):
        """MUTACIJA nad mehanizmom: kad `refund_daily_job` nestane, cetvrti tick vise ne dobije posao.

        Time je dokazano da zelenilo iznad dolazi bas od povrata slota, a ne od necega uzvodno.
        """
        real = Store.transition

        def without_refund(store, task_id, expected, target, payload=None, now=None):
            payload = dict(payload or {})
            payload.pop("refund_daily_job", None)
            return real(store, task_id, expected, target, payload, now)

        with mock.patch.object(Store, "transition", without_refund):
            for n in range(3):
                self.assertEqual(self.run_tick(NOW + n)[0]["outcome"], "needs_human")
            self.assertEqual(self.store.daily_counter("jobs", NOW + 2), 3)
            out, prep = self.run_tick(NOW + 3)
        self.assertIn("idle", out["outcome"])
        self.assertEqual(prep.call_count, 0)


class AmendedSignalTest(unittest.TestCase):
    """Operaterov ispravak inbox datoteke mora stici do zadatka (nalaz 2026-09-13 nad signals.py/store.py)."""

    def setUp(self):
        self.repo = make_repo()
        self.home = tempfile.mkdtemp()
        self.store = Store(os.path.join(self.home, "a.sqlite"))
        self.cfg = config(mode="propose", workerRepoPath=self.repo)

    def tearDown(self):
        self.store.close()

    def run_tick(self, sources, now):
        adapters = GatedAdapters(self.cfg, self.home)
        prep = mock.Mock(return_value=fake_job())
        with mock.patch.object(cli, "prepare_job_via_node", prep), \
             mock.patch.object(cli, "implementation_worktree_blocked", return_value=None), \
             mock.patch.object(cli, "run_phase", return_value={"verdict": "needs_verification", "reason": "fake"}):
            return cli.tick(self.cfg, now, False, store=self.store, home=self.home, sources=sources,
                            adapters=adapters, profile=profile()), prep

    def test_a_corrected_plan_task_reaches_the_task_on_the_next_tick(self):
        """BASELINE: krivo napisan `planTask` je needs_human uz razlog koji IMENUJE oblik.

        MUTACIJA (operaterov ispravak): ista datoteka s ispravnim `T01`, isti fingerprint, i zadatak se vraca
        u red pa prolazi. Prije popravka je `signal_json` bio zamrznut na prvom upisu, zadatak je zauvijek
        ostajao `needs_human`, a jedini izlaz je bio rucni zahvat u SQLite.
        """
        out, prep = self.run_tick(inbox_source("T7"), NOW)
        self.assertEqual(out["outcome"], "needs_human")
        self.assertEqual(prep.call_count, 0)
        task_id = out["claimed"]
        payload = json.loads(self.store.events(task_id)[-1]["sanitized_payload"])
        self.assertIn("nije u obliku Tnn", payload["reason"], payload)
        self.assertIn("T7", payload["reason"], "poruka mora reci STO je operater napisao")

        out, prep = self.run_tick(inbox_source("T01"), NOW + 1)
        self.assertEqual(out["claimed"], task_id, "ispravak ne stvara novi zadatak")
        self.assertEqual(out["outcome"], "proposed", out)
        self.assertEqual(prep.call_count, 3)
        self.assertEqual([c.args[1] for c in prep.call_args_list], ["T01"] * 3)

    def test_a_missing_plan_task_says_so_and_a_repeated_identical_signal_stays_put(self):
        out, _ = self.run_tick(inbox_source(None), NOW)
        payload = json.loads(self.store.events(out["claimed"])[-1]["sanitized_payload"])
        self.assertIn("signal nema planTask", payload["reason"])
        # NEGATIVNA KONTROLA: isti signal jos jednom, bez ijedne promjene, ne smije vratiti zadatak u red.
        again, prep = self.run_tick(inbox_source(None), NOW + 1)
        self.assertIn("idle", again["outcome"], again)
        self.assertEqual(prep.call_count, 0)
        self.assertEqual(self.store.get_task(out["claimed"])["status"], "needs_human")


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
