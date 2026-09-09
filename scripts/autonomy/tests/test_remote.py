import json
import os
import tempfile
import unittest
from unittest import mock

from scripts.autonomy import remote
from scripts.autonomy.remote import GitHubRemote, NetlifyHosting, RemoteUnavailable, load_remotes, token_fingerprint

SHA = "b" * 40


class FakeHttp:
    """Snima pozive i vraca pripremljene odgovore po (metoda, sufiks URL-a)."""

    def __init__(self):
        self.calls = []
        self.routes = {}

    def __call__(self, method, url, token, body=None, accept=None):
        self.calls.append((method, url, body))
        assert token == "tok-publisher", "adapter mora slati bas token izdavaca"
        for (m, suffix), response in self.routes.items():
            if m == method and suffix in url:
                if isinstance(response, Exception):
                    raise response
                return response
        return 404, None


class GitHubRemoteTest(unittest.TestCase):
    def setUp(self):
        self.http = FakeHttp()
        self.patcher = mock.patch.object(remote, "_request", self.http)
        self.patcher.start()
        self.gh = GitHubRemote("danielrisavi77-create/Lekta", "tok-publisher")

    def tearDown(self):
        self.patcher.stop()

    def test_find_pull_request_matches_only_exact_marker(self):
        pr = {"number": 7, "head": {"sha": SHA, "ref": "autonomy/x"}, "base": {"sha": "a" * 40}, "merged": True,
              "merge_commit_sha": "m" * 40, "body": "text\n<!-- lekta-autonomy-key:abc123 -->", "state": "closed"}
        self.http.routes[("GET", "/search/issues")] = (200, {"items": [{"number": 7}]})
        self.http.routes[("GET", "/pulls/7")] = (200, pr)
        found = self.gh.find_pull_request("abc123")
        self.assertEqual((found["number"], found["merged"], found["merge_sha"]), (7, True, "m" * 40))
        self.assertIsNone(self.gh.find_pull_request("abc124"), "slican kljuc nije isti kljuc")

    def test_open_pull_request_embeds_marker(self):
        self.http.routes[("POST", "/pulls")] = (201, {"number": 9, "head": {"sha": SHA, "ref": "autonomy/x"}, "base": {"sha": "a" * 40}, "merged": False})
        out = self.gh.open_pull_request("autonomy/x", "master", "t", "body", "key1")
        self.assertEqual(out["number"], 9)
        body = self.http.calls[-1][2]["body"]
        self.assertIn("lekta-autonomy-key:key1", body)

    def test_pull_request_maps_check_runs_and_pending(self):
        self.http.routes[("GET", "/pulls/9")] = (200, {"number": 9, "head": {"sha": SHA}, "base": {"sha": "a" * 40}, "merged": False})
        self.http.routes[("GET", f"/commits/{SHA}/check-runs")] = (200, {"check_runs": [
            {"name": "check", "status": "completed", "conclusion": "success"},
            {"name": "ux-gate", "status": "in_progress", "conclusion": None}]})
        view = self.gh.pull_request(9)
        self.assertEqual(view["checks"], {"check": "success", "ux-gate": "pending"})

    def test_branch_protection_unreadable_is_not_available(self):
        self.assertFalse(self.gh.branch_protection("master")["available"])
        self.http.routes[("GET", "/branches/master/protection")] = (200, {"required_status_checks": {"contexts": ["check"], "strict": True}, "enforce_admins": {"enabled": False}})
        prot = self.gh.branch_protection("master")
        self.assertEqual((prot["available"], prot["required_checks"], prot["strict"]), (True, ["check"], True))

    def test_merge_sends_expected_sha_and_reports_refusal(self):
        self.http.routes[("PUT", "/pulls/9/merge")] = (200, {"merged": True, "sha": "m" * 40})
        out = self.gh.merge(9, SHA, "key")
        self.assertEqual(out, {"merged": True, "merge_sha": "m" * 40})
        self.assertEqual(self.http.calls[-1][2]["sha"], SHA)
        self.http.routes[("PUT", "/pulls/9/merge")] = (405, {"merged": False})
        self.assertEqual(self.gh.merge(9, SHA, "key")["merged"], False)

    def test_network_failure_propagates_as_unavailable(self):
        self.http.routes[("GET", "/git/ref/heads/master")] = RemoteUnavailable("net")
        with self.assertRaises(RemoteUnavailable):
            self.gh.base_head("master")


class NetlifyTest(unittest.TestCase):
    def test_deploy_views_and_restore(self):
        http = FakeHttp()
        http.routes[("GET", "/deploys/d1")] = (200, {"id": "d1", "state": "ready", "commit_ref": SHA})
        http.routes[("POST", "/deploys/d0/restore")] = (200, {"id": "d0"})
        with mock.patch.object(remote, "_request", http):
            nl = NetlifyHosting("site", "tok-publisher")
            self.assertEqual(nl.deployment("d1")["commit_sha"], SHA)
            self.assertIsNone(nl.deployment("missing"))
            self.assertEqual(nl.restore("d0"), {"ok": True, "id": "d0"})
            self.assertEqual(nl.restore("d9"), {"ok": False})


class LoadRemotesTest(unittest.TestCase):
    def test_missing_token_files_yield_no_adapters_with_reasons(self):
        home = tempfile.mkdtemp()
        out = load_remotes(home, {"repository": "o/r"})
        self.assertIsNone(out["remote"])
        self.assertIsNone(out["hosting"])
        self.assertEqual(len(out["reasons"]), 2)
        with open(os.path.join(home, "publisher-token"), "w") as fh:
            fh.write("ghp_x\n")
        out = load_remotes(home, {"repository": "o/r"})
        self.assertIsInstance(out["remote"], GitHubRemote)
        self.assertEqual(out["remote"].token, "ghp_x")
        self.assertIsNone(token_fingerprint(None))
        self.assertEqual(len(token_fingerprint("ghp_x")), 8)
        self.assertNotIn("ghp_x", json.dumps(token_fingerprint("ghp_x")))


if __name__ == "__main__":
    unittest.main()
