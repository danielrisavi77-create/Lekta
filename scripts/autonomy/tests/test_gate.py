import copy
import json
import os
import tempfile
import unittest

from scripts.autonomy.gate import (
    build_manifest, directory_digest, load_evidence, promotion_allowed, proof_staleness, release_proof_checks,
    sign_manifest, tree_digest_from_ls_tree, verify_candidate,
)

REQUIRED = ["check", "conformance", "slow", "ux", "strict-open", "word", "word-worst"]
BASE = "a" * 40
CAND = "b" * 40
KEY = b"trusted-verifier-key"
LS_TREE = "\n".join([
    "100644 blob 1111111111111111111111111111111111111111\tsrc/ui/app.ts",
    "100644 blob 2222222222222222222222222222222222222222\tdocs/generated/RELEASE_PROOF.json",
    "100644 blob 3333333333333333333333333333333333333333\tpackage.json",
])
DIGEST = tree_digest_from_ls_tree(LS_TREE)


def proof(**over):
    p = {"commit": CAND, "dirtyWorkingTree": False, "complete": True, "missingRequired": [], "treeDigest": DIGEST,
         "results": [{"id": t, "status": "pass"} for t in REQUIRED]}
    p.update(over)
    return p


def runner_factory(release_exit=0, ls_tree=LS_TREE, ls_exit=0, calls=None):
    def runner(argv):
        if calls is not None:
            calls.append(argv)
        if argv[:3] == ["npm", "run", "release:check"]:
            return release_exit, ""
        if argv[:2] == ["git", "ls-tree"]:
            return ls_exit, ls_tree
        raise AssertionError(f"neocekivan poziv {argv}")
    return runner


def good_manifest(**over):
    m = verify_candidate({"candidateSha": CAND, "baseSha": BASE, "artifactHash": "art", "dependencyLockHash": "lock",
                          "changedPaths": ["docs/x.md"]}, {"requiredReleaseTiers": REQUIRED, "policyVersion": "p1"},
                         runner=runner_factory(), read_proof=lambda: proof(**over), signing_key=KEY, created_at="t")
    return m


def load(m, **exp):
    expected = {"sourceTreeHash": DIGEST, "artifactHash": "art", "dependencyLockHash": "lock"}
    expected.update(exp)
    return load_evidence(m, key=KEY, policy_version="p1", expected=expected)


class TreeDigestTest(unittest.TestCase):
    def test_only_the_proof_file_may_differ(self):
        other = LS_TREE.replace("2222222222222222222222222222222222222222", "9999999999999999999999999999999999999999")
        self.assertEqual(tree_digest_from_ls_tree(other), DIGEST)
        changed = LS_TREE.replace("1111111111111111111111111111111111111111", "9999999999999999999999999999999999999999")
        self.assertNotEqual(tree_digest_from_ls_tree(changed), DIGEST)
        self.assertEqual(tree_digest_from_ls_tree(LS_TREE.replace("\n", "\r\n")), DIGEST)
        self.assertIsNone(tree_digest_from_ls_tree(""))
        self.assertIsNone(tree_digest_from_ls_tree("garbage without tab"))

    def test_unknown_never_reads_as_fresh(self):
        self.assertEqual(proof_staleness(proof(), DIGEST)["verdict"], "fresh")
        self.assertEqual(proof_staleness(proof(), None)["verdict"], "unknown")
        self.assertEqual(proof_staleness(proof(treeDigest=None), DIGEST)["verdict"], "unknown")
        self.assertEqual(proof_staleness(None, DIGEST)["verdict"], "unknown")
        self.assertEqual(proof_staleness(proof(), "x" * 64)["verdict"], "stale")

    def test_release_check_status_mapping(self):
        checks = release_proof_checks(proof(results=[{"id": "check", "status": "pass"}, {"id": "ux", "status": "fail"},
                                                     {"id": "word", "status": "skipped"}]), REQUIRED)
        self.assertEqual(checks["check"], "pass")
        self.assertEqual(checks["ux"], "fail")
        self.assertEqual(checks["word"], "unknown")
        self.assertEqual(checks["conformance"], "unknown")


class VerifyCandidateTest(unittest.TestCase):
    def test_happy_path_is_promotable_only_through_trusted_loader(self):
        m = good_manifest()
        self.assertTrue(m["complete"])
        self.assertIn("signature", m)
        # Manifest kakav agent vrati NIJE dovoljan: polja pouzdanog loadera nedostaju.
        self.assertFalse(promotion_allowed(m, CAND, REQUIRED))
        ev = load(m)
        self.assertTrue(ev["signature_verified"] and ev["hashes_verified"] and ev["policy_current"])
        self.assertTrue(promotion_allowed(ev, CAND, REQUIRED))

    def test_failed_git_comparison_blocks_instead_of_passing(self):
        m = verify_candidate({"candidateSha": CAND, "baseSha": BASE, "artifactHash": "art", "dependencyLockHash": "lock"},
                             {"requiredReleaseTiers": REQUIRED, "policyVersion": "p1"},
                             runner=runner_factory(ls_exit=128, ls_tree="fatal: bad object"), read_proof=proof, signing_key=KEY)
        self.assertEqual(m["staleness"]["verdict"], "unknown")
        self.assertFalse(m["complete"])
        self.assertFalse(promotion_allowed(load(m), CAND, REQUIRED))

    def test_exit_zero_with_incomplete_proof_blocks(self):
        m = good_manifest(complete=False, missingRequired=["word"], results=[{"id": t, "status": "pass"} for t in REQUIRED if t != "word"])
        self.assertEqual(m["releaseCheckExitCode"], 0)
        self.assertFalse(m["complete"])
        self.assertFalse(promotion_allowed(load(m), CAND, REQUIRED))

    def test_skipped_word_tier_is_unknown_and_blocks(self):
        results = [{"id": t, "status": "pass"} for t in REQUIRED if t != "word-worst"] + [{"id": "word-worst", "status": "skipped"}]
        m = good_manifest(results=results)
        self.assertEqual(m["checks"]["word-worst"], "unknown")
        self.assertFalse(promotion_allowed(load(m), CAND, REQUIRED))

    def test_proof_for_another_commit_or_dirty_tree_blocks(self):
        self.assertFalse(good_manifest(commit="c" * 40)["complete"])
        self.assertFalse(good_manifest(dirtyWorkingTree=True)["complete"])
        self.assertFalse(good_manifest(treeDigest="f" * 64)["complete"])

    def test_control_file_change_cannot_self_approve(self):
        m = verify_candidate({"candidateSha": CAND, "baseSha": BASE, "artifactHash": "art", "dependencyLockHash": "lock",
                              "changedPaths": ["docs/x.md", "tests/gate-mutations.test.ts", "data/security/npm-audit-ratchet.json"]},
                             {"requiredReleaseTiers": REQUIRED, "policyVersion": "p1"}, runner=runner_factory(),
                             read_proof=proof, signing_key=KEY)
        self.assertEqual(m["controlFilesChanged"], ["data/security/npm-audit-ratchet.json", "tests/gate-mutations.test.ts"])
        self.assertTrue(m["complete"], "provjere su prosle, ali promocija svejedno pada")
        self.assertFalse(promotion_allowed(load(m), CAND, REQUIRED))

    def test_release_check_failure_exit_code_blocks(self):
        m = verify_candidate({"candidateSha": CAND, "baseSha": BASE, "artifactHash": "art", "dependencyLockHash": "lock"},
                             {"requiredReleaseTiers": REQUIRED, "policyVersion": "p1"}, runner=runner_factory(release_exit=1),
                             read_proof=proof, signing_key=KEY)
        self.assertFalse(m["complete"])

    def test_invalid_shas_are_rejected(self):
        with self.assertRaises(ValueError):
            verify_candidate({"candidateSha": "HEAD", "baseSha": BASE}, {"requiredReleaseTiers": REQUIRED}, runner=runner_factory(), read_proof=proof)


class TrustedLoaderTest(unittest.TestCase):
    def test_agent_written_trusted_fields_are_ignored(self):
        m = good_manifest()
        forged = dict(m, signature_verified=True, hashes_verified=True, policy_current=True, signature="00" * 32)
        ev = load(forged)
        self.assertFalse(ev["signature_verified"])
        self.assertFalse(promotion_allowed(ev, CAND, REQUIRED))

    def test_tampered_manifest_fails_signature(self):
        m = good_manifest()
        tampered = copy.deepcopy(m)
        tampered["checks"]["word"] = "pass"
        tampered["controlFilesChanged"] = []
        tampered["candidateSha"] = CAND
        tampered["complete"] = True
        tampered["checks"]["ux"] = "pass"
        tampered["createdAt"] = "later"
        self.assertFalse(load(tampered)["signature_verified"])
        self.assertFalse(load_evidence(m, key=b"other-key", policy_version="p1",
                                       expected={"sourceTreeHash": DIGEST, "artifactHash": "art", "dependencyLockHash": "lock"})["signature_verified"])

    def test_wrong_sha_artifact_policy_or_schema_block(self):
        m = good_manifest()
        self.assertFalse(promotion_allowed(load(m), "c" * 40, REQUIRED))
        self.assertFalse(load(m, artifactHash="tampered")["hashes_verified"])
        self.assertFalse(load(m, sourceTreeHash=None)["hashes_verified"])
        self.assertFalse(load_evidence(m, key=KEY, policy_version="p2",
                                       expected={"sourceTreeHash": DIGEST, "artifactHash": "art", "dependencyLockHash": "lock"})["policy_current"])
        old = dict(m, schemaVersion=0)
        ev = load(old)
        self.assertFalse(ev["signature_verified"])
        self.assertFalse(ev["complete"])
        self.assertFalse(promotion_allowed(load(m), CAND, []), "prazan popis obveznih provjera nije dokaz")

    def test_promotion_requires_every_named_check(self):
        ev = load(good_manifest())
        self.assertTrue(promotion_allowed(ev, CAND, REQUIRED))
        self.assertFalse(promotion_allowed(ev, CAND, REQUIRED + ["projections"]))
        broken = dict(ev, checks=dict(ev["checks"], word="unknown"))
        self.assertFalse(promotion_allowed(broken, CAND, REQUIRED))

    def test_directory_digest_is_content_bound(self):
        root = tempfile.mkdtemp()
        with open(os.path.join(root, "a.js"), "w") as fh:
            fh.write("1")
        d1 = directory_digest(root)
        with open(os.path.join(root, "a.js"), "w") as fh:
            fh.write("2")
        self.assertNotEqual(d1, directory_digest(root))
        self.assertIsNone(directory_digest(os.path.join(root, "missing")))

    def test_signature_ignores_only_trusted_fields(self):
        m = good_manifest()
        self.assertEqual(sign_manifest(m, KEY), sign_manifest(dict(m, signature_verified=True), KEY))
        self.assertNotEqual(sign_manifest(m, KEY), sign_manifest(dict(m, complete=False), KEY))
        json.dumps(m)  # serijalizabilan bez custom tipova


if __name__ == "__main__":
    unittest.main()
