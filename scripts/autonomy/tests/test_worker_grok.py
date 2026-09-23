"""Grok u autonomnom lancu: presuda zrcala i zabrana xAI kljuca.

ZASTO POSTOJI. Presudu o ishodu posla u autonomiji ne donosi `parseResult` iz
`scripts/agents/core.mjs` nego njegovo python zrcalo `parse_provider_output` u
`scripts/autonomy/worker.py`. Zrcalo je do 2026-09-23 znalo samo za `claude` i codex oblik, pa je
SVAKI zivi Grok uspjeh presudjivalo kao pad. Testovi ispod rade nad istim commitanim snimcima s
kojima radi i JS strana (`tests/fixtures/agents/grok-success.json`, `grok-error.json`), da obje
strane zrcala budu vezane za isti dokaz.
"""
import json
import os
import unittest

from unittest import mock

from scripts.autonomy.worker import (
    GROK_API_KEY_ENV, GROK_COMMANDS, parse_provider_output, run_phase, scrubbed_env,
    successful_tool_calls,
)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
FIXTURES = os.path.join(REPO_ROOT, "tests", "fixtures", "agents")


def fixture(name: str) -> str:
    with open(os.path.join(FIXTURES, name), encoding="utf-8") as fh:
        return fh.read()


def profile(**over):
    base = dict(subscription_verified=True, extra_credits_disabled=True, effective_auth="subscription",
                model_included=True, configuration_unchanged=True, trusted_observation=True)
    base.update(over)
    return base


class GrokVerdictTest(unittest.TestCase):
    """Presuda nad ZIVIM snimcima, ne nad rucno pisanim nizovima."""

    def test_live_success_is_ok_for_both_aliases(self):
        success = fixture("grok-success.json")
        for command in GROK_COMMANDS:
            parsed = parse_provider_output(command, success, 0)
            self.assertTrue(parsed["ok"], (command, parsed))
            self.assertEqual(parsed["reported_models"], ["grok-4.6-build"], command)
            self.assertIsNone(parsed["reason"], command)

    def test_live_error_is_a_failure_even_on_exit_zero(self):
        failure = fixture("grok-error.json")
        self.assertFalse(parse_provider_output("grok", failure, 1)["ok"])
        # Cak i kad bi CLI pogresno izasao s 0, oblik greske sam po sebi nije uspjeh.
        zero = parse_provider_output("grok", failure, 0)
        self.assertFalse(zero["ok"], zero)

    def test_error_fixture_carries_the_whole_recording(self):
        """Snimak nosi JSON redak I plain-text rep koji CLI ispise uz njega.

        Rep je vazan jer je bas on razlog zasto `json.loads` nad CIJELIM izlazom pada, pa presuda ovisi
        o grani sa zadnjim retkom. Zadnji redak je proza, dakle ni on nije JSON, i ishod je pad.
        """
        failure = fixture("grok-error.json")
        lines = [line for line in failure.splitlines() if line.strip()]
        self.assertGreater(len(lines), 1, "fixture mora biti cijeli snimak, ne samo prvi redak")
        head = json.loads(lines[0])
        self.assertEqual(head["type"], "error")
        self.assertIn("XAI_API_KEY", head["message"])
        self.assertTrue(lines[-1].startswith("Alternatively,"))
        with self.assertRaises(ValueError):
            json.loads(failure)
        self.assertFalse(parse_provider_output("grok", failure, 0)["ok"])

    def test_mirror_requires_the_same_evidence_as_the_js_parser(self):
        base = json.loads(fixture("grok-success.json"))

        def verdict(**over):
            data = dict(base)
            data.update(over)
            return parse_provider_output("grok", json.dumps(data), 0)["ok"]

        self.assertTrue(verdict())
        self.assertFalse(verdict(text=""), "prazan odgovor nije uspjeh")
        self.assertFalse(verdict(text=None))
        self.assertFalse(verdict(stopReason="max_tokens"))
        self.assertFalse(verdict(num_turns=0))
        self.assertFalse(verdict(num_turns=True), "bool nije broj okreta")
        self.assertFalse(verdict(modelUsage={}), "prazan modelUsage ne prijavljuje nijedan model")
        self.assertFalse(verdict(is_error=True))
        self.assertFalse(verdict(ok=False))
        self.assertFalse(verdict(error="boom"))
        self.assertFalse(verdict(subtype="error_max_turns"))
        # Polje `model` se pribraja prijavljenim modelima, kao i u JS-u.
        merged = parse_provider_output("grok", json.dumps(dict(base, model="grok-4.6")), 0)
        self.assertEqual(merged["reported_models"], ["grok-4.6", "grok-4.6-build"])

    def test_non_object_and_empty_output_are_failures(self):
        for stdout in ("", "   ", "[]", '"tekst"', "42"):
            parsed = parse_provider_output("grok", stdout, 0)
            self.assertFalse(parsed["ok"], stdout)
            self.assertIsNotNone(parsed["reason"], stdout)
        self.assertFalse(parse_provider_output("grok", fixture("grok-success.json"), 1)["ok"])

    def test_trailing_prose_does_not_hide_a_real_success(self):
        """Grana sa zadnjim retkom: jednoredni uspjeh iza proze se i dalje vidi."""
        one_line = json.dumps(json.loads(fixture("grok-success.json")))
        noisy = "neka proza CLI-ja" + chr(10) + one_line + chr(10)
        parsed = parse_provider_output("grok", noisy, 0)
        self.assertTrue(parsed["ok"], parsed)
        self.assertEqual(parsed["reported_models"], ["grok-4.6-build"])

    def test_claude_and_codex_verdicts_are_unchanged(self):
        """Kontrola: nova grana ne dira postojece dvije."""
        claude = parse_provider_output(
            "claude", json.dumps({"subtype": "success", "is_error": False, "modelUsage": {"claude-opus-5": {}}}), 0)
        self.assertEqual((claude["ok"], claude["reported_models"]), (True, ["claude-opus-5"]))
        self.assertFalse(parse_provider_output(
            "claude", json.dumps({"subtype": "error_max_turns", "is_error": True}), 0)["ok"])
        self.assertTrue(parse_provider_output("codex", '{"type":"turn.completed"}', 0)["ok"])
        self.assertFalse(parse_provider_output("codex", '{"type":"turn.failed"}', 0)["ok"])
        self.assertFalse(parse_provider_output("codex", "", 0)["ok"])
        # Zivi Grok uspjeh kroz codex granu i dalje pada; to je bas kvar koji je nova grana popravila.
        self.assertFalse(parse_provider_output("codex", fixture("grok-success.json"), 0)["ok"])

    def test_known_remaining_gap_grok_reports_zero_tool_calls(self):
        """KARAKTERIZACIJA, ne tvrdnja da je ispravno.

        `successful_tool_calls` broji NDJSON stavke, a Grok `--output-format json` ih ne emitira, pa je
        broj 0. `run_phase` za faze plan i review nulu tumaci kao `no_tool_use` i blokira, bez trosenja
        pokusaja. Ovaj zadatak to NE mijenja; test biljezi zateceno ponasanje da se promjena vidi.
        """
        self.assertEqual(successful_tool_calls("grok", fixture("grok-success.json")), 0)
        self.assertIsNone(successful_tool_calls("claude", "{}"))


class GrokApiKeyGuardTest(unittest.TestCase):
    """Obrana u dubinu: radnik ne pokrece Grok ako je u okolini xAI kljuc."""

    def setUp(self):
        self.dir = os.path.dirname(os.path.abspath(__file__))

    def phase(self, command, env):
        job = {"command": command, "args": [], "prompt": "p", "requestedModel": "grok-4.6"}
        # Launcher se podmece da ishod ne ovisi o tome je li Grok CLI instaliran na ovom stroju.
        with mock.patch("scripts.autonomy.worker.resolve_launcher",
                        side_effect=lambda c: {"command": c, "path": None, "kind": "missing"}):
            return run_phase(job, "plan", profile(), cwd=self.dir, env=env)

    def test_key_blocks_both_aliases_before_any_process_starts(self):
        for command in GROK_COMMANDS:
            result = self.phase(command, {"PATH": os.environ.get("PATH", ""), "XAI_API_KEY": "xai-placeholder"})
            self.assertEqual(result["verdict"], "blocked", command)
            self.assertIn("api_key_present", result["reason"], command)
            self.assertIn("XAI_API_KEY", result["reason"], command)
            self.assertIsNone(result["exit_code"], command)

    def test_without_the_key_the_guard_does_not_fire(self):
        """Drugi smjer: bez kljuca posao prolazi gard i pada tek na nedostupnom launcheru."""
        for command in GROK_COMMANDS:
            result = self.phase(command, {"PATH": os.environ.get("PATH", "")})
            self.assertEqual(result["verdict"], "blocked", command)
            self.assertIn("launcher_missing", result["reason"], command)
            self.assertNotIn("api_key_present", result["reason"], command)
        # Prazan kljuc nije postavljen kljuc, isto kao u `prepareJob`.
        empty = self.phase("grok", {"PATH": os.environ.get("PATH", ""), "XAI_API_KEY": ""})
        self.assertIn("launcher_missing", empty["reason"])

    def test_the_guard_is_narrow(self):
        """Ne dira ne-Grok providere: xAI kljuc za codex nije razlog blokade."""
        result = self.phase("codex", {"PATH": os.environ.get("PATH", ""), "XAI_API_KEY": "xai-placeholder"})
        self.assertIn("launcher_missing", result["reason"])
        self.assertNotIn("api_key_present", result["reason"])

    def test_xai_prefix_is_scrubbed_from_the_child_environment(self):
        env = scrubbed_env({"PATH": "x", "HOME": "h", "XAI_API_KEY": "tajna", "xai_api_key": "tajna",
                            "XAI_BASE_URL": "https://example.invalid"})
        self.assertEqual(sorted(env), ["HOME", "PATH"])
        self.assertEqual(GROK_API_KEY_ENV, ("XAI_API_KEY",))


if __name__ == "__main__":
    unittest.main()
