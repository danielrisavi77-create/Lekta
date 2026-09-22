import contextlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

from scripts.autonomy import cli
from scripts.autonomy.policy import is_control_path
from scripts.autonomy.store import Store
from scripts.autonomy.tests.test_worker import git_repo as worker_git_repo
from scripts.autonomy.worker import branch_changed_paths

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
                 extra=None, commit_result=None):
        self.calls = []
        self.verdicts = list(verdicts)
        self.complete = complete
        self.publish_status = publish_status
        self.change_class = change_class
        # Polja koja adapter tvrdi uz verdict (`attempt_spent`, `provider_called`); zadano ih nema, pa je
        # zateceno ponasanje nepromijenjeno.
        self.extra = dict(extra or {})
        # Radnikov commit: zadano uspjeh, jer git ovdje nitko ne dira.
        self.commit_result = dict(commit_result or {"status": "committed", "sha": SHA})

    def run_phase(self, task, phase, profile):
        self.calls.append(("run", phase))
        result = {"verdict": self.verdicts.pop(0), "reason": "fake", "provider": "fake", "requested_model": "x", "reported_models": ["x"]}
        result.update(self.extra)
        return result

    def commit(self, task):
        self.calls.append(("commit",))
        return dict(self.commit_result)

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
        self.assertEqual([c[0] for c in adapters.calls],
                         ["run", "run", "run", "commit", "classify", "verify", "publish"],
                         "commit ide POSLIJE pregleda a PRIJE klasifikacije: snimka promjena se uzima u njemu")
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

    def test_auto_routing_falls_back_only_to_already_authorized_providers(self):
        cfg = config(grokEnabled=True, implementerAgent="auto", providerFallback="authorized")
        grok_only = {
            "configuration_unchanged": True, "trusted_observation": True,
            "providers": {
                "codex": {"allowed": False, "approved_models": ["gpt-6-astra", "gpt-5.6-sol"]},
                "claude": {"allowed": False, "approved_models": ["sonnet", "opus"]},
                "grok": {"allowed": True, "approved_models": ["grok-4.6"]},
            },
        }
        self.assertEqual(cli._agent_for(cfg, "planning", {}, grok_only), "grok")
        self.assertEqual(cli._agent_for(cfg, "implementing", {}, grok_only), "build")
        self.assertIsNone(cli._agent_for(config(grokEnabled=False, implementerAgent="auto"), "planning", {}, grok_only))

        claude_only = {
            "configuration_unchanged": True, "trusted_observation": True,
            "providers": {
                "codex": {"allowed": False, "approved_models": ["gpt-6-astra"]},
                "claude": {"allowed": True, "approved_models": ["sonnet", "opus"]},
                "grok": {"allowed": False, "approved_models": ["grok-4.6"]},
            },
        }
        self.assertEqual(cli._agent_for(config(implementerAgent="auto"), "implementing", {}, claude_only), "sonnet")
        self.assertEqual(cli._agent_for(config(), "reviewing", {"implementationAgent": "sol"}, claude_only), "opus")

    def test_auto_review_uses_grok_only_when_its_provider_profile_is_allowed(self):
        cfg = config(grokEnabled=True)
        blocked_profile = {
            "configuration_unchanged": True, "trusted_observation": True,
            "providers": {
                "grok": {"allowed": False, "approved_models": ["grok-4.6"]},
                "claude": {"allowed": True, "approved_models": ["opus"]},
                "codex": {"allowed": True, "approved_models": ["gpt-6-astra"]},
            },
        }
        allowed_profile = {
            "configuration_unchanged": True, "trusted_observation": True,
            "providers": {
                "grok": {"allowed": True, "approved_models": ["grok-4.6"]},
                "claude": {"allowed": True, "approved_models": ["opus"]},
                "codex": {"allowed": True, "approved_models": ["gpt-6-astra"]},
            },
        }
        task = {"implementationAgent": "sol"}
        self.assertIsNone(cli._agent_for(cfg, "reviewing", task, blocked_profile),
                          "providerFallback=wait ne smije tiho trositi drugi provider")
        self.assertEqual(cli._agent_for(config(grokEnabled=True, providerFallback="authorized"),
                                        "reviewing", task, blocked_profile), "opus")
        self.assertEqual(cli._agent_for(cfg, "reviewing", task, allowed_profile), "grok")
        wrong_model = {
            "configuration_unchanged": True, "trusted_observation": True,
            "providers": {
                "grok": {"allowed": True, "approved_models": ["grok-other"]},
                "claude": {"allowed": True, "approved_models": ["opus"]},
            },
        }
        self.assertIsNone(cli._agent_for(cfg, "reviewing", task, wrong_model))
        self.assertEqual(cli._agent_for(config(grokEnabled=True, providerFallback="authorized"),
                                        "reviewing", task, wrong_model), "opus")
        self.assertEqual(cli._agent_for(cfg, "reviewing", {"implementationAgent": "build"}, allowed_profile), "astra")

    def test_auto_plan_and_implementation_fallback_are_opt_in(self):
        profile = {
            "configuration_unchanged": True, "trusted_observation": True,
            "providers": {
                "codex": {"allowed": False, "approved_models": ["gpt-6-astra", "gpt-5.6-sol"]},
                "claude": {"allowed": False, "approved_models": ["sonnet"]},
                "grok": {"allowed": True, "approved_models": ["grok-4.6"]},
            },
        }
        self.assertIsNone(cli._agent_for(config(grokEnabled=True), "planning", {}, profile))
        self.assertIsNone(cli._agent_for(config(grokEnabled=True), "implementing", {}, profile))
        fallback = config(grokEnabled=True, providerFallback="authorized")
        self.assertEqual(cli._agent_for(fallback, "planning", {}, profile), "grok")
        self.assertEqual(cli._agent_for(fallback, "implementing", {}, profile), "build")



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


def make_git_repo(tasks=None):
    """Radnikov repo kakav `workerRepoPath` mora biti: stvaran git, feature grana, cisto stablo."""
    repo = make_repo(tasks)

    def run(*args):
        out = subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, check=False, shell=False)
        assert out.returncode == 0, (args, out.stderr)

    run("init", "-q")
    # Ime zadane grane NIJE konstanta nego `init.defaultBranch` stroja, a ovi testovi tvrdo trebaju
    # `master` (osnovica posla, `rev-parse master`, objava). Bez ovoga cetiri testa mjere konfiguraciju
    # stroja umjesto koda i padaju na svakom stroju s `main`. Isto vrijedi za `core.autocrlf`.
    run("symbolic-ref", "HEAD", "refs/heads/master")
    run("config", "core.autocrlf", "false")
    run("config", "user.email", "radnik@lokalno")
    run("config", "user.name", "Radnik")
    run("config", "commit.gpgsign", "false")
    run("add", "-A")
    run("commit", "-qm", "red zadataka")
    run("checkout", "-qb", "wf/radnik")
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
        # Git okolina radnikova stabla se mjeri zasebno (WorktreeGateTest, ImplementWorktreeGuardTest);
        # fixture repo je obican direktorij, pa bi njezin izostanak ovdje prekrio ono sto se mjeri.
        with mock.patch.object(cli, "prepare_job_via_node", return_value=fake_job()) as prep, \
             mock.patch.object(cli, "implementation_worktree_blocked", return_value=None), \
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
             mock.patch.object(cli, "resolve_base_ref", return_value="master"), \
             mock.patch.object(cli, "start_job_branch", return_value={"status": "ok", "base_sha": SHA}), \
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

    def _start_job_branch(self, task):
        # Fixture repo je obican direktorij; granu posla mjeri `JobBranchTest` i `PerJobEvidenceTest`.
        return None

    def commit(self, task):
        return {"status": "clean", "reason": "fixture repo nije git"}

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

    def test_a_shared_checkout_blocks_before_the_plan_call_not_after_it(self):
        """Preduvjet radnikova stabla se mjeri PRIJE plana, ne tek u implementaciji (nalaz 2026-09-13).

        Posao koji ne moze proci kroz implementaciju ne smije prije toga platiti puni poziv modela i dnevni slot:
        uz `maxNewJobsPerDay=3` to je do tri uzaludna poziva dnevno dok covjek ne postavi `workerRepoPath`.
        Fixture repo nije git worktree, dakle tocno stanje instalacijskog checkouta na masteru.
        """
        out, prep = self.run_tick(inbox_source("T01"), worktree_ok=False)
        self.assertEqual(out["outcome"], "blocked", out)
        last = out["phases"][-1]
        self.assertEqual(last["phase"], "planning", "blokada mora doci prije ijedne pripreme")
        self.assertTrue(str(last["reason"]).startswith("implement_unsafe"), out["phases"])
        self.assertEqual(prep.call_count, 0, "nijedan poziv modela ne smije krenuti")
        task = self.store.get_task(out["claimed"])
        self.assertEqual(task["attempts"], 0, "blokada prije poziva ne trosi pokusaj")
        self.assertEqual(self.store.daily_counter("jobs", NOW), 0,
                         "poziv nije ni krenuo, pa se dnevni slot vraca")


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


class CommittingAdapters(GatedAdapters):
    """Kao GatedAdapters, ali sa STVARNIM commitom radnikova stabla: to je ono sto se ovdje mjeri."""

    commit = cli.DefaultAdapters.commit


class TwoJobsInARowTest(unittest.TestCase):
    """Kontroler se ne smije zakljucati poslije TOCNO jednog posla (nalaz 2026-09-13).

    Gard prije implementacije trazi cisto stablo, a klasifikacija, verifikacija i objava mjere upravo
    NECOMMITANE promjene; dok ih nitko nije spremio, drugi posao je zauvijek `implement_unsafe: radno stablo
    nije cisto`. Zato ovaj test vodi DVA uzastopna posla u ISTOM stvarnom git stablu, s pravim gardom (bez
    mocka) i pravim commitom, po pravilu "jednoprolazni gard je slijep".
    """

    def setUp(self):
        self.repo = make_git_repo()
        self.home = tempfile.mkdtemp()
        self.store = Store(os.path.join(self.home, "a.sqlite"))
        self.cfg = config(mode="propose", workerRepoPath=self.repo)

    def tearDown(self):
        self.store.close()

    def run_tick(self, symptom, now, adapters_cls=CommittingAdapters):
        """Jedan tick s implementacijom koja STVARNO pise u radnikovo stablo, kao sto to radi model."""
        adapters = adapters_cls(self.cfg, self.home)
        written = "src/autonomija/" + symptom.replace(" ", "-") + ".ts"

        def writing_run_phase(job, agent_phase, prof, **kwargs):
            if agent_phase == "implement":
                target = os.path.join(self.repo, written.replace("/", os.sep))
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with open(target, "w", encoding="utf-8") as fh:
                    fh.write("export const x = 1;" + chr(10))
            return {"verdict": "needs_verification", "reason": "fake"}

        with mock.patch.object(cli, "prepare_job_via_node", return_value=fake_job()), \
             mock.patch.object(cli, "run_phase", side_effect=writing_run_phase):
            out = cli.tick(self.cfg, now, False, store=self.store, home=self.home,
                           sources=inbox_source("T01", symptom=symptom), adapters=adapters, profile=profile())
        return out, adapters, written

    def dirty(self):
        return subprocess.run(["git", "status", "--porcelain"], cwd=self.repo, capture_output=True, text=True,
                              check=False).stdout.strip()

    def test_the_second_job_starts_because_the_first_one_was_committed(self):
        first, adapters, written = self.run_tick("prvi posao", NOW)
        self.assertEqual(first["outcome"], "proposed", first)
        self.assertEqual(self.dirty(), "", "posao mora zavrsiti s cistim stablom")
        head = subprocess.run(["git", "show", "--name-only", "--format=%s", "HEAD"], cwd=self.repo,
                              capture_output=True, text=True, check=False).stdout
        self.assertIn(written, head, "ono sto je implementacija napisala mora biti u commitu")
        self.assertIn("autonomija:", head.splitlines()[0])
        # Snimka je uzeta PRIJE commita, pa klasifikacija i verifikacija i dalje vide sto je promijenjeno.
        self.assertEqual(adapters._snapshot()["paths"], [written])

        second, _, written2 = self.run_tick("drugi posao", NOW + 1)
        self.assertEqual(second["outcome"], "proposed", second)
        self.assertEqual([p["phase"] for p in second["phases"]][:3], ["planning", "implementing", "reviewing"])
        self.assertEqual(self.dirty(), "")
        self.assertNotEqual(written, written2)

    def test_without_that_commit_the_second_job_is_blocked_before_it_starts(self):
        """MUTACIJA nad mehanizmom: isti tok, samo bez commita. Tocno stanje prije ovog popravka."""
        first, _, _ = self.run_tick("prvi posao", NOW, adapters_cls=GatedAdapters)
        self.assertEqual(first["outcome"], "proposed", first)
        self.assertNotEqual(self.dirty(), "", "bez commita stablo ostaje prljavo")
        second, _, _ = self.run_tick("drugi posao", NOW + 1, adapters_cls=GatedAdapters)
        self.assertEqual(second["outcome"], "blocked", second)
        self.assertIn("radno stablo nije cisto", str(second["phases"][-1]["reason"]))

    def test_a_job_that_dies_after_the_implementation_does_not_lock_the_next_one(self):
        """Isti razred kvara, druga vrata: posao koji padne POSLIJE implementacije.

        Bez spremanja nedovrsenog posla ostaje prljavo stablo, pa sljedeci posao gard odbija jednako kao u
        testu iznad. Objava se pritom ne smije dogoditi: commit je lokalan, `git push` radi samo izdavac.
        """
        adapters = CommittingAdapters(self.cfg, self.home)
        verdicts = {"plan": "needs_verification", "implement": "needs_verification", "review": "failed"}

        def writing_run_phase(job, agent_phase, prof, **kwargs):
            if agent_phase == "implement":
                target = os.path.join(self.repo, "src", "autonomija", "pao.ts")
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with open(target, "w", encoding="utf-8") as fh:
                    fh.write("export const x = 1;" + chr(10))
            return {"verdict": verdicts[agent_phase], "reason": "recenzent odbio"}

        with mock.patch.object(cli, "prepare_job_via_node", return_value=fake_job()), \
             mock.patch.object(cli, "run_phase", side_effect=writing_run_phase):
            out = cli.tick(self.cfg, NOW, False, store=self.store, home=self.home,
                           sources=inbox_source("T01", symptom="posao koji pada"), adapters=adapters,
                           profile=profile())
        self.assertEqual(out["outcome"], "failed", out)
        self.assertEqual(self.dirty(), "", "nedovrsen posao se sprema, inace zakljucava sljedeci")
        events = [e["event_type"] for e in self.store.events(out["claimed"])]
        self.assertEqual(events[-1], "status:failed", "razlog zaustavljanja mora ostati zadnji dogadaj")
        parked = json.loads([e for e in self.store.events(out["claimed"])
                             if e["event_type"] == "worker_commit"][-1]["sanitized_payload"])
        self.assertEqual(parked["status"], "committed")
        self.assertTrue(parked["unfinished"], parked)

        second, _, _ = self.run_tick("posao poslije pada", NOW + 1)
        self.assertEqual(second["outcome"], "proposed", second)

    def test_a_job_that_never_wrote_anything_parks_nothing(self):
        # KONTROLA: posao koji padne na PLANU nije ni pokrenuo implementaciju, pa kontroler nema sto spremiti
        # i ne smije ni pokusati. Ishod je `skipped`, dakle odbijanje, a ne `clean` (koji bi znacio da je
        # pogledao stablo i nasao ga praznim).
        adapters = CommittingAdapters(self.cfg, self.home)
        head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.repo, capture_output=True, text=True,
                              check=False).stdout.strip()
        with mock.patch.object(cli, "prepare_job_via_node", return_value=fake_job()), \
             mock.patch.object(cli, "run_phase", return_value={"verdict": "failed", "reason": "plan pao"}):
            out = cli.tick(self.cfg, NOW, False, store=self.store, home=self.home,
                           sources=inbox_source("T01", symptom="plan koji pada"), adapters=adapters,
                           profile=profile())
        self.assertEqual(out["outcome"], "failed", out)
        after = subprocess.run(["git", "rev-parse", "HEAD"], cwd=self.repo, capture_output=True, text=True,
                               check=False).stdout.strip()
        self.assertEqual(head, after, "prazan commit se ne stvara")
        parked = json.loads([e for e in self.store.events(out["claimed"])
                             if e["event_type"] == "worker_commit"][-1]["sanitized_payload"])
        self.assertEqual(parked["status"], "skipped")
        self.assertIn("implementacija nije pokrenuta", parked["reason"])

    def test_a_failed_commit_stops_the_job_instead_of_publishing_uncommitted_work(self):
        adapters = RecordingAdapters(commit_result={"status": "failed", "reason": "git commit nije uspio: hook"})
        out = cli.tick(config(mode="propose", publisherEnabled=True, workerRepoPath=self.repo), NOW, False,
                       store=self.store, home=self.home, sources=ci_source(), adapters=adapters, profile=profile())
        self.assertEqual(out["outcome"], "needs_human", out)
        self.assertNotIn("publish", [c[0] for c in adapters.calls], "neuspio commit ne smije zavrsiti objavom")
        payload = json.loads(self.store.events(out["claimed"])[-1]["sanitized_payload"])
        self.assertTrue(str(payload.get("reason", "")).startswith("commit_failed"), payload)


class RealTreeAdapters(cli.DefaultAdapters):
    """Sve sto dira radnikovo stablo je STVARNO: gard, grana posla, snimka, klasifikacija i commit.

    Lazni su samo potpisnik dokaza i izdavac, jer bi inace test vrtio `npm run release:check` i mrezu. Dokaz
    zato nosi bas one staze koje bi objava gurnula, a to je ono sto se ovdje mjeri.
    """

    def __init__(self, config, home):
        super().__init__(config, home)
        self.seen_evidence = None
        self.seen_class = None
        self.pushed_paths = None

    def verify(self, task):
        snap = self._snapshot()
        return {"complete": True, "staleness": {"verdict": "fresh"}, "candidateSha": SHA,
                "changedPaths": snap["paths"],
                "controlFilesChanged": sorted(q for q in snap["paths"] if is_control_path(q))}

    def publish(self, task, evidence, store, now, change_class):
        self.seen_evidence = evidence
        self.seen_class = change_class
        # Ono sto bi `git push` s ove grane STVARNO gurnuo, mjereno nad pravim gitom.
        self.pushed_paths = sorted(branch_changed_paths(self.repo, self._base_ref or "master"))
        return {"status": "proposed", "reason": "fake", "pr": 7}


class RealTreeCase(unittest.TestCase):
    """Zajednicka oprema za testove nad STVARNIM radnikovim stablom (pravi git, pravi gard, pravi commit)."""

    def setUp(self):
        self.repo = make_git_repo()
        self.home = tempfile.mkdtemp()
        self.store = Store(os.path.join(self.home, "a.sqlite"))
        self.cfg = config(mode="propose", workerRepoPath=self.repo)

    def tearDown(self):
        self.store.close()

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo, capture_output=True, text=True,
                              check=False).stdout.strip()

    def tree_state(self):
        return {"head": self.git("rev-parse", "HEAD"), "branch": self.git("branch", "--show-current"),
                "status": self.git("status", "--porcelain"), "branches": self.git("branch", "--format=%(refname)")}

    def run_tick(self, sources, now, writes=None, verdicts=None, adapters=None, extra_patches=()):
        """Jedan tick u kojem implementacija STVARNO pise u radnikovo stablo, kao sto to radi model."""
        adapters = adapters if adapters is not None else RealTreeAdapters(self.cfg, self.home)
        verdicts = verdicts or {}

        def writing_run_phase(job, agent_phase, prof, **kwargs):
            if agent_phase == "implement":
                for rel in (writes or []):
                    target = os.path.join(self.repo, rel.replace("/", os.sep))
                    os.makedirs(os.path.dirname(target), exist_ok=True)
                    with open(target, "w", encoding="utf-8") as fh:
                        fh.write("sadrzaj" + chr(10))
            return {"verdict": verdicts.get(agent_phase, "needs_verification"), "reason": "fake"}

        with contextlib.ExitStack() as stack:
            stack.enter_context(mock.patch.object(cli, "prepare_job_via_node", return_value=fake_job()))
            stack.enter_context(mock.patch.object(cli, "run_phase", side_effect=writing_run_phase))
            for patch in extra_patches:
                stack.enter_context(patch)
            out = cli.tick(self.cfg, now, False, store=self.store, home=self.home, sources=sources,
                           adapters=adapters, profile=profile())
        return out, adapters

    def worker_commit_events(self, task_id):
        return [json.loads(e["sanitized_payload"]) for e in self.store.events(task_id)
                if e["event_type"] == "worker_commit"]


class RejectedJobLeavesTheTreeAloneTest(RealTreeCase):
    """Zahtjev (d): radno stablo koje je gard odbio ostaje NETAKNUTO.

    Izmjereno 2026-09-19 na izvedbi koja je zbog toga odbacena: posao odbijen PRIJE ijedne faze prolazio je
    kroz `_park_worker_tree`, a `git add -A` je commitao covjekov necommitani rad pod kontrolerovom porukom.
    Gard bi se time sam izlijecio: sljedeci tick zatekne cisto stablo i prodje dalje.
    """

    def dirty_the_tree(self, name="tudje-biljeske.txt"):
        with open(os.path.join(self.repo, name), "w", encoding="utf-8") as fh:
            fh.write("covjekov necommitani rad" + chr(10))
        return name

    def test_a_signal_without_a_plan_task_touches_nothing(self):
        foreign = self.dirty_the_tree()
        before = self.tree_state()
        out, _ = self.run_tick(inbox_source(plan_task=None), NOW)
        self.assertEqual(out["outcome"], "needs_human", out)
        self.assertIn("no_ready_plan_task", str(out["phases"][-1]["reason"]))
        self.assertEqual(self.tree_state(), before, "odbijen posao ne smije dirati radnikovo stablo")
        self.assertIn(foreign, before["status"])
        parked = self.worker_commit_events(out["claimed"])
        self.assertEqual([q["status"] for q in parked], ["skipped"], parked)
        self.assertIn("nije bilo cisto", parked[0]["reason"])

    def test_a_second_identical_tick_still_touches_nothing(self):
        """Pravilo 'jednoprolazni gard je slijep': mjeri se i DRUGI prolaz.

        Stara steta se na drugom prolazu vise ne bi ni vidjela, jer je prvi vec ocistio stablo i gard nije
        imao na sto okinuti.
        """
        self.dirty_the_tree()
        before = self.tree_state()
        first, _ = self.run_tick(inbox_source(plan_task=None), NOW)
        second, _ = self.run_tick(inbox_source(plan_task=None, symptom="drugi prolaz"), NOW + 1)
        self.assertEqual(first["outcome"], "needs_human", first)
        self.assertEqual(second["outcome"], "needs_human", second)
        self.assertEqual(self.tree_state(), before, "ni drugi prolaz ne smije dirati stablo")

    def test_a_dirty_tree_blocks_and_stays_dirty(self):
        foreign = self.dirty_the_tree()
        before = self.tree_state()
        out, _ = self.run_tick(inbox_source("T01"), NOW, writes=["src/ui/nase.ts"])
        self.assertEqual(out["outcome"], "blocked", out)
        self.assertIn("radno stablo nije cisto", str(out["phases"][-1]["reason"]))
        self.assertEqual(self.tree_state(), before, "gard koji odbije stablo ne smije ga zatim commitati")
        self.assertIn(foreign, self.git("status", "--porcelain"))

    def test_mutation_without_the_fence_the_foreign_work_is_committed(self):
        """MUTACIJA: ista situacija, samo bez ograde. Tocno steta zbog koje je prethodni krug odbacen.

        Ograda su dvije zastavice (`_clean_at_start`, `_implemented`). Podmetnute kao ispunjene, commit
        prolazi i tudja datoteka zavrsi u povijesti, iako je kontroler nije napisao. Time je dokazano da
        stablo cuva ograda, a ne sreca da je popis staza kratak.
        """
        foreign = self.dirty_the_tree()
        adapters = RealTreeAdapters(self.cfg, self.home)
        before_head = self.git("rev-parse", "HEAD")
        self.assertEqual(adapters.commit({"id": "t", "signal": {}, "signal_key": "k"})["status"], "skipped")
        self.assertEqual(before_head, self.git("rev-parse", "HEAD"), "baseline: s ogradom se nista ne commita")
        adapters._changes = None
        adapters._clean_at_start = True
        adapters._implemented = True
        parked = adapters.commit({"id": "t", "signal": {"kind": "ci_failure"}, "signal_key": "k"})
        self.assertEqual(parked["status"], "committed", parked)
        self.assertNotEqual(before_head, self.git("rev-parse", "HEAD"))
        self.assertIn(foreign, self.git("show", "--name-only", "--format=", "HEAD"))

    def test_mutation_the_implement_flag_alone_is_not_enough(self):
        # Druga polovica ograde zasebno: implementacija je pokrenuta, ali stablo na pocetku nije bilo nase.
        self.dirty_the_tree()
        adapters = RealTreeAdapters(self.cfg, self.home)
        adapters._implemented = True
        out = adapters.commit({"id": "t", "signal": {}, "signal_key": "k"})
        self.assertEqual(out["status"], "skipped", out)
        self.assertIn("nije bilo cisto", out["reason"])

    def test_baseline_a_clean_tree_and_a_ready_task_still_goes_all_the_way(self):
        """KONTROLA protiv garda koji tiho ugasi ono sto stiti: normalan posao i dalje prolazi do kraja."""
        out, adapters = self.run_tick(inbox_source("T01"), NOW, writes=["src/ui/nase.ts"])
        self.assertEqual(out["outcome"], "proposed", out)
        self.assertEqual([q["phase"] for q in out["phases"]][:3], ["planning", "implementing", "reviewing"])
        self.assertEqual(self.git("status", "--porcelain"), "", "posao mora zavrsiti s cistim stablom")
        self.assertIn("src/ui/nase.ts", self.git("show", "--name-only", "--format=", "HEAD"))
        self.assertEqual([q["status"] for q in self.worker_commit_events(out["claimed"])], ["committed"])


class PerJobEvidenceTest(RealTreeCase):
    """Zahtjev (c): klasifikacija i dokaz pokrivaju sve sto bi objava gurnula, ne samo tekuci posao.

    Izmjereno 2026-09-19: posao 1 napise `.github/workflows/odbijen.yml`, pregled ga ODBIJE, a commit
    svejedno ostane na dijeljenoj grani. Posao 2 napise samo `src/ui/dobar.ts`; njegova snimka je bila
    `['src/ui/dobar.ts']`, `controlFilesChanged` prazan, a `git push` bi gurnuo oba commita, pa bi u nacinu
    `auto_low_risk` na master otisla kontrolna datoteka koju nijedan pregled nije prihvatio.
    """

    def first_job_is_rejected_after_writing_a_control_file(self):
        out, adapters = self.run_tick(inbox_source("T01", symptom="odbijen posao"), NOW,
                                      writes=[".github/workflows/odbijen.yml"], verdicts={"review": "failed"})
        self.assertEqual(out["outcome"], "failed", out)
        self.assertIn(".github/workflows/odbijen.yml", self.git("show", "--name-only", "--format=", "HEAD"))
        return out, adapters

    def test_the_next_job_publishes_only_its_own_work(self):
        self.first_job_is_rejected_after_writing_a_control_file()
        out, adapters = self.run_tick(inbox_source("T01", symptom="dobar posao"), NOW + 1,
                                      writes=["src/ui/dobar.ts"])
        self.assertEqual(out["outcome"], "proposed", out)
        self.assertEqual(adapters.pushed_paths, ["src/ui/dobar.ts"],
                         "grana koju objava gura smije nositi samo rad OVOG posla")
        self.assertEqual(sorted(adapters.seen_evidence["changedPaths"]), ["src/ui/dobar.ts"])
        self.assertEqual(adapters.seen_evidence["controlFilesChanged"], [])
        self.assertEqual(adapters.seen_class, "auto_low_risk", "cist nizak rizik mora ostati nizak rizik")
        self.assertNotEqual(adapters._job_branch, "wf/radnik", "posao mora dobiti vlastitu granu")

    def test_mutation_on_a_shared_branch_the_evidence_still_sees_the_control_file(self):
        """MUTACIJA: grana po poslu se ugasi, pa se vrati stara akumulacija.

        Druga crta obrane mora izdrzati: snimka se racuna prema OSNOVICI, ne samo iz radnog stabla, pa
        `.github/...` iz odbijenog posla ulazi u `controlFilesChanged` i klasa vise nije nizak rizik. Bez te
        druge crte je `promotion_allowed` (gate.py) vidio praznu listu.
        """
        self.first_job_is_rejected_after_writing_a_control_file()
        shared = self.git("branch", "--show-current")
        base_sha = self.git("rev-parse", "master")
        no_branch = mock.patch.object(cli, "start_job_branch",
                                      return_value={"status": "ok", "base_sha": base_sha, "created": False})
        out, adapters = self.run_tick(inbox_source("T01", symptom="dobar posao"), NOW + 1,
                                      writes=["src/ui/dobar.ts"], extra_patches=(no_branch,))
        self.assertEqual(self.git("branch", "--show-current"), shared, "mutacija: grana ostaje dijeljena")
        self.assertIn(".github/workflows/odbijen.yml", adapters.seen_evidence["controlFilesChanged"],
                      "dokaz mora vidjeti i ono sto grana vec nosi")
        self.assertIn(".github/workflows/odbijen.yml", adapters.pushed_paths)
        self.assertNotEqual(adapters.seen_class, "auto_low_risk",
                            "s kontrolnom datotekom na grani klasa ne smije biti nizak rizik")

    def test_mutation_an_unresolvable_base_is_never_low_risk(self):
        """MUTACIJA: osnovica se ne moze razrijesiti, pa se ne zna ni sto grana nosi.

        Fail-closed: klasifikacija tada vraca `needs_human`, nikad `auto_low_risk`. Tiha nula bi bila
        najgori ishod, jer bi izgledala kao prazna promjena bez kontrolnih datoteka.
        """
        adapters = RealTreeAdapters(self.cfg, self.home)
        self.assertIsNone(cli.resolve_base_ref(self.repo, "ne-postoji"))
        adapters._base_error = "base_unresolved: nema lokalne reference za ne-postoji"
        change_class, reasons = adapters.classify({"id": "t"})
        self.assertEqual(change_class, "needs_human")
        self.assertIn("base_unresolved", reasons[0])
        # BASELINE: bez te greske isto stablo (prazna promjena je i dalje needs_human, ali iz DRUGOG razloga).
        adapters._base_error = None
        adapters._changes = {"paths": ["src/ui/x.ts"], "worktree_paths": ["src/ui/x.ts"], "lines": 3}
        self.assertEqual(adapters.classify({"id": "t"})[0], "auto_low_risk")

    def test_a_retry_of_the_same_task_keeps_its_branch_and_its_evidence(self):
        """Isti zadatak, drugi pokusaj: grana se preuzima, a dokaz pokriva i raniji commit.

        `checkout -B` bi tiho odbacio ono sto je raniji pokusaj spremio, pa bi dokaz bio tocan a rad izgubljen.
        """
        out, adapters = self.run_tick(inbox_source("T01", symptom="prvi pokusaj"), NOW,
                                      writes=["src/ui/prvi.ts"], verdicts={"review": "failed"})
        self.assertEqual(out["outcome"], "failed", out)
        branch = self.git("branch", "--show-current")
        again = RealTreeAdapters(self.cfg, self.home)
        started = again._start_job_branch({"id": out["claimed"]})
        self.assertIsNone(started, "grana istog zadatka se preuzima, ne odbija")
        self.assertEqual(self.git("branch", "--show-current"), branch)
        self.assertEqual(again._snapshot()["paths"], ["src/ui/prvi.ts"],
                         "dokaz drugog pokusaja mora nositi i ono sto je prvi commitao")


class WorkerRepoStateTest(unittest.TestCase):
    """`doctor` mora reci da implementacija ne moze proci PRIJE nego prvi posao propadne (nalaz 2026-09-13).

    Isporucena instalacija nema `workerRepoPath` (`install-windows.ps1` pokrece zadatak s cwd = instalacijski
    checkout), pa je jedini nacin da operater to sazna bio `blocked` tick.
    """

    def test_a_declared_clean_feature_repo_is_reported_as_usable(self):
        repo = make_git_repo()
        state = cli._worker_repo_state(config(workerRepoPath=repo))
        self.assertEqual(state["path"], repo)
        self.assertTrue(state["declared"])
        self.assertTrue(state["dedicated"])
        self.assertIsNone(state["blocked"])

    def test_a_declared_non_repository_is_reported_as_blocked(self):
        state = cli._worker_repo_state(config(workerRepoPath=tempfile.mkdtemp()))
        self.assertTrue(state["declared"])
        self.assertIsNotNone(state["blocked"])
        self.assertTrue(str(state["blocked"]).startswith("implement_unsafe"), state)

    def test_an_undeclared_path_falls_back_to_the_installation_checkout(self):
        # Zadano `workerRepoPath: null` (tocno isporucena konfiguracija): stablo je cwd i NIJE deklarirano, pa
        # gard trazi povezan worktree. Ishod `blocked` ovisi o stroju, zato se ovdje mjeri samo deklaracija.
        state = cli._worker_repo_state(config())
        self.assertEqual(os.path.realpath(state["path"]), os.path.realpath(os.getcwd()))
        self.assertFalse(state["declared"])
        self.assertFalse(state["dedicated"])
        self.assertIn("blocked", state)

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

    def test_api_key_env_blocks_only_its_provider(self):
        doc = {
            "logins": {
                "codex": {"logged_in": True, "method": "chatgpt"},
                "claude": {"logged_in": True, "method": "subscription"},
            },
            "tools": {},
            "configFingerprint": "f", "observedAt": "t",
        }
        attest = {"extra_credits_disabled": True, "model_included": True, "models": ["gpt-6-astra", "sonnet"]}
        from scripts.autonomy.policy import billing_allowed, provider_billing_allowed

        old_anthropic = os.environ.get("ANTHROPIC_API_KEY")
        os.environ["ANTHROPIC_API_KEY"] = "sk-ant-test"
        try:
            prof = cli.build_billing_profile(doctor=doc, config=config(), attest=attest, previous={})
        finally:
            if old_anthropic is None:
                del os.environ["ANTHROPIC_API_KEY"]
            else:
                os.environ["ANTHROPIC_API_KEY"] = old_anthropic
        self.assertEqual(prof["effective_auth"], "api_key")
        self.assertTrue(billing_allowed(prof), "Codex account i dalje je dopusten")
        self.assertTrue(provider_billing_allowed(prof, "codex", "gpt-6-astra"))
        self.assertFalse(provider_billing_allowed(prof, "claude", "sonnet"))

        old_openai = os.environ.get("OPENAI_API_KEY")
        os.environ["OPENAI_API_KEY"] = "sk-openai-test"
        try:
            prof = cli.build_billing_profile(doctor=doc, config=config(), attest=attest, previous={})
        finally:
            if old_openai is None:
                del os.environ["OPENAI_API_KEY"]
            else:
                os.environ["OPENAI_API_KEY"] = old_openai
        self.assertFalse(provider_billing_allowed(prof, "codex", "gpt-6-astra"))
        self.assertTrue(provider_billing_allowed(prof, "claude", "sonnet"))

    def test_grok_needs_cli_config_attestation_and_no_api_key(self):
        doc = {
            "logins": {"codex": {}, "claude": {}},
            "tools": {"grok": {"available": True, "version": "grok 1.0.34"}},
            "configFingerprint": "fg", "observedAt": "t",
        }
        attest = {
            "extra_credits_disabled": False, "model_included": False, "models": [],
            "grok_included": True, "grok_models": ["grok-4.6"],
        }
        from scripts.autonomy.policy import billing_allowed, provider_billing_allowed
        prof = cli.build_billing_profile(doctor=doc, config=config(grokEnabled=True), attest=attest, previous={})
        self.assertTrue(billing_allowed(prof))
        self.assertTrue(provider_billing_allowed(prof, "grok", "grok-4.6"))
        self.assertFalse(provider_billing_allowed(prof, "codex", "gpt-6-astra"))

        old = os.environ.get("XAI_API_KEY")
        os.environ["XAI_API_KEY"] = "xai-test"
        try:
            blocked = cli.build_billing_profile(doctor=doc, config=config(grokEnabled=True), attest=attest, previous={})
        finally:
            if old is None:
                del os.environ["XAI_API_KEY"]
            else:
                os.environ["XAI_API_KEY"] = old
        self.assertFalse(provider_billing_allowed(blocked, "grok", "grok-4.6"))

        old_version_doc = {
            **doc,
            "tools": {"grok": {"available": True, "version": "grok 1.0.33 (old)"}},
            "configFingerprint": "fg-old",
        }
        old_version = cli.build_billing_profile(doctor=old_version_doc, config=config(grokEnabled=True), attest=attest, previous={})
        self.assertFalse(provider_billing_allowed(old_version, "grok", "grok-4.6"))
        self.assertFalse(old_version["providers"]["grok"]["cli_supported"])


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


class TestRepoBranchIsNotTheMachinesTest(unittest.TestCase):
    """Minor 3 iz PR #93, drugi krug: prvi popravak je zakrpao samo `test_worker.git_repo`, dok je
    `make_git_repo` iz ISTE grane ostao na `init.defaultBranch` stroja, pa su cetiri nova testa padala
    na svakom stroju s `main` (izmjereno: `Ran 200 tests ... FAILED (failures=4)`). Gard zato mjeri SVE
    pomocnike koji rade `git init`, i to IMENOVANO, da sljedeci pomocnik ne moze proci nepokriven."""

    HELPERS = {"test_cli.py": staticmethod(make_git_repo), "test_worker.py": staticmethod(worker_git_repo)}

    @staticmethod
    @contextlib.contextmanager
    def machine_prefers_main():
        """Stroj koji zadanu granu zove `main`. GIT_CONFIG_GLOBAL + NOSYSTEM, dakle bez dodirivanja
        korisnikove konfiguracije."""
        path = os.path.join(tempfile.mkdtemp(), "gitconfig")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("[init]" + chr(10) + "	defaultBranch = main" + chr(10))
        prev = {k: os.environ.get(k) for k in ("GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM")}
        os.environ["GIT_CONFIG_GLOBAL"] = path
        os.environ["GIT_CONFIG_NOSYSTEM"] = "1"
        try:
            yield
        finally:
            for key, value in prev.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    @staticmethod
    def branches(repo):
        out = subprocess.run(["git", "for-each-ref", "--format=%(refname:short)", "refs/heads"],
                             cwd=repo, capture_output=True, text=True, check=False, shell=False)
        return sorted(line.strip() for line in out.stdout.splitlines() if line.strip())

    def test_every_helper_pins_master_even_when_the_machine_prefers_main(self):
        with self.machine_prefers_main():
            for name, helper in sorted(self.HELPERS.items()):
                repo = helper.__func__()
                with self.subTest(helper=name):
                    self.assertIn("master", self.branches(repo), (name, self.branches(repo)))
                    self.assertNotIn("main", self.branches(repo), (name, self.branches(repo)))

    def test_mutation_without_the_pin_the_machine_wins(self):
        """Negativna kontrola: bez `symbolic-ref` isti stroj daje `main`. Bez nje bi gard bio vakuumski
        (prosao bi i na stroju na kojem podmetnuta konfiguracija uopce ne djeluje)."""
        with self.machine_prefers_main():
            repo = tempfile.mkdtemp()
            def run(*args):
                out = subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True,
                                     check=False, shell=False)
                self.assertEqual(out.returncode, 0, (args, out.stderr))
            run("init", "-q")
            run("config", "user.email", "radnik@lokalno")
            run("config", "user.name", "Radnik")
            run("config", "commit.gpgsign", "false")
            with open(os.path.join(repo, "a.txt"), "w", encoding="utf-8") as fh:
                fh.write("x" + chr(10))
            run("add", "a.txt")
            run("commit", "-qm", "pocetak")
            self.assertEqual(self.branches(repo), ["main"], self.branches(repo))

    def test_no_helper_escapes_the_guard(self):
        """Pokrivenost je IMENOVANA, ne prebrojana: svaka testna datoteka koja radi `git init` mora biti
        u HELPERS. Tocno taj razmak je i propustio prvi popravak."""
        here = os.path.dirname(os.path.abspath(__file__))
        initializers = set()
        for name in sorted(os.listdir(here)):
            if not name.startswith("test_") or not name.endswith(".py"):
                continue
            with open(os.path.join(here, name), encoding="utf-8") as fh:
                if 'run("init"' in fh.read():
                    initializers.add(name)
        self.assertEqual(initializers, set(self.HELPERS), (initializers, set(self.HELPERS)))


if __name__ == "__main__":
    unittest.main()
