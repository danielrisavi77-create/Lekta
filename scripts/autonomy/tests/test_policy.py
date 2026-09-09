import json
import os
import tempfile
import unittest

from scripts.autonomy.policy import (
    PolicyError, billing_allowed, canonical_path, classify_change, explain_change,
    load_config, validate_config,
)

EXAMPLE = os.path.join(os.path.dirname(__file__), "..", "..", "..", "config", "autonomy.example.json")


def good_profile():
    return dict(subscription_verified=True, extra_credits_disabled=True, effective_auth="subscription",
                model_included=True, configuration_unchanged=True, trusted_observation=True)


class BillingPolicyTest(unittest.TestCase):
    def test_unknown_and_api_auth_block_calls(self):
        self.assertFalse(billing_allowed({}))
        self.assertFalse(billing_allowed(None))
        profile = good_profile()
        self.assertTrue(billing_allowed(profile))
        profile["effective_auth"] = "api_key"
        self.assertFalse(billing_allowed(profile))

    def test_every_required_field_is_load_bearing(self):
        for key in ("subscription_verified", "extra_credits_disabled", "model_included",
                    "configuration_unchanged", "trusted_observation"):
            profile = good_profile()
            del profile[key]
            self.assertFalse(billing_allowed(profile), key)
            profile[key] = "true"  # string, not bool
            self.assertFalse(billing_allowed(profile), key)
            profile[key] = False
            self.assertFalse(billing_allowed(profile), key)


class PathPolicyTest(unittest.TestCase):
    def setUp(self):
        with open(EXAMPLE, encoding="utf-8") as fh:
            self.policy = json.load(fh)

    def test_example_config_is_valid(self):
        self.assertEqual(validate_config(self.policy), [])

    def test_small_documentation_change_is_low_risk(self):
        self.assertEqual(classify_change(["docs/agents/autonomy-runbook.md"], 20, self.policy), "auto_low_risk")

    def test_windows_separators_and_dot_segments_are_canonicalised(self):
        self.assertEqual(canonical_path("docs\\agents\\./x.md"), "docs/agents/x.md")
        self.assertEqual(classify_change(["src\\ui\\finding-view-model.ts"], 5, self.policy), "auto_low_risk")

    def test_traversal_and_absolute_paths_are_rejected_outright(self):
        for bad in ("../secret", "docs/../../x", "/etc/passwd", "C:\\Windows\\x", "\\\\server\\share", "", "a\x00b"):
            with self.assertRaises(PolicyError, msg=bad):
                canonical_path(bad)
            with self.assertRaises(PolicyError, msg=bad):
                classify_change([bad], 1, self.policy)

    def test_control_files_and_thresholds_need_a_human(self):
        for control in ("tests/gate-mutations.test.ts", "scripts/autonomy/policy.py", ".github/workflows/check.yml",
                        "package.json", "data/security/npm-audit-ratchet.json", "docs/generated/RELEASE_PROOF.json",
                        "config/autonomy.example.json", "supabase/functions/repair-docx/index.ts", "CLAUDE.md",
                        "tests/docx-golden.test.ts"):
            verdict, reasons = explain_change([control], 1, self.policy)
            self.assertEqual(verdict, "needs_human", control)
            self.assertTrue(any("kontrolna" in r for r in reasons), reasons)

    def test_scope_limits_are_enforced(self):
        many = [f"docs/a{i}.md" for i in range(6)]
        self.assertEqual(classify_change(many, 10, self.policy), "needs_human")
        self.assertEqual(classify_change(["docs/a.md"], 201, self.policy), "needs_human")
        self.assertEqual(classify_change(["docs/a.md"], -1, self.policy), "needs_human")
        self.assertEqual(classify_change([], 0, self.policy), "needs_human")
        self.assertEqual(classify_change(["src/repair/fixers.ts"], 1, self.policy), "needs_human")

    def test_link_escaping_the_tree_is_rejected(self):
        root = tempfile.mkdtemp()
        outside = tempfile.mkdtemp()
        os.makedirs(os.path.join(root, "docs"))
        link = os.path.join(root, "docs", "out")
        try:
            os.symlink(outside, link, target_is_directory=True)
        except (OSError, NotImplementedError):
            self.skipTest("symlink not permitted in this environment")
        with self.assertRaises(PolicyError):
            classify_change(["docs/out/x.md"], 1, self.policy, root=root)
        self.assertEqual(classify_change(["docs/in.md"], 1, self.policy, root=root), "auto_low_risk")

    def test_config_validation_refuses_billing_or_isolation_relaxation(self):
        for key, value in (("allowApiBilling", True), ("maxPaidActionsUsd", 5), ("fableEnabled", True),
                           ("billingMode", "api"), ("mode", "yolo"), ("maxConcurrentJobs", 2),
                           ("allowedRunnerClass", "larger"), ("autoLowRiskPathPrefixes", ["scripts/autonomy/"]),
                           ("requiredReleaseTiers", [])):
            cfg = dict(self.policy)
            cfg[key] = value
            self.assertTrue(validate_config(cfg), key)
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as fh:
            json.dump({**self.policy, "allowPaidCredits": True}, fh)
        with self.assertRaises(PolicyError):
            load_config(fh.name)
        self.assertEqual(load_config(EXAMPLE)["mode"], "observe")


if __name__ == "__main__":
    unittest.main()
