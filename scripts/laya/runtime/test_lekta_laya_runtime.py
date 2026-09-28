"""Testovi Lekta Laya runtimea bez pravog modela: lazni agent s istim oblikom odgovora kao laya.predict.

Pokretanje: python -m unittest discover -s scripts/laya/runtime -p "test_*.py"
"""
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import HTTPServer

sys.path.insert(0, os.path.dirname(__file__))
import lekta_laya_runtime as rt  # noqa: E402

DIGEST = "a" * 64
MANIFEST = {"backend": "laya-python", "modelId": "convaiinnovations:laya:multilingual", "modelRevision": "rev1",
            "weightsSha256": "b" * 64, "tokenizerSha256": "c" * 64, "calibrationRevision": "cal-1",
            "runtimeVersion": "0.3.21", "precision": "fp32"}


class FakeAgent:
    def __init__(self, probabilities=None, extra=None):
        self.calls = []
        self.probabilities = probabilities or {"finding_supported": 0.5, "possible_false_positive": 0.2,
                                               "extraction_uncertain": 0.2, "insufficient_evidence": 0.1}
        self.extra = extra or {}

    def predict(self, state, questions):
        self.calls.append((state, questions))
        top = max(self.probabilities, key=self.probabilities.get)
        return {"answers": {"nalaz": {"choice": top, "confidence": self.probabilities[top],
                                      "probabilities": dict(self.probabilities), **self.extra}}}


def request(**over):
    base = {"schemaVersion": 2, "taskId": rt.TASK_ID, "caseId": "laya:v2|x", "inputDigest": DIGEST,
            "modelInput": {"text": "Kovac, B. Clanak bez godine.", "language": "hr", "ruleEvidence": None},
            "labelOrder": list(rt.VERDICTS)}
    base.update(over)
    return base


class InferTest(unittest.TestCase):
    def test_odgovor_ima_tocno_oblik_protokola(self):
        agent = FakeAgent()
        out = rt.LektaLayaRuntime(agent, MANIFEST).infer(request())
        self.assertEqual(set(out), {"schemaVersion", "caseId", "inputDigest", "verdict", "probabilities", "answerConfidence", "runtime"})
        self.assertEqual((out["caseId"], out["inputDigest"], out["verdict"]), ("laya:v2|x", DIGEST, "finding_supported"))
        self.assertAlmostEqual(sum(out["probabilities"].values()), 1.0, places=6)
        self.assertEqual(out["runtime"], MANIFEST)
        self.assertNotIn("policy", out)

    def test_model_vidi_samo_tekst_i_jezik_a_kriteriji_prate_labelorder(self):
        agent = FakeAgent()
        order = list(reversed(rt.VERDICTS))
        rt.LektaLayaRuntime(agent, MANIFEST).infer(request(labelOrder=order))
        state, questions = agent.calls[0]
        self.assertEqual(set(state), {"zapis", "jezik"})
        self.assertNotIn(DIGEST, json.dumps(state))
        self.assertEqual(list(questions["nalaz"]["criteria"]), order)

    def test_normalizacija_i_answer_confidence(self):
        agent = FakeAgent({"finding_supported": 2, "possible_false_positive": 1, "extraction_uncertain": 1, "insufficient_evidence": 0},
                          extra={"answer_confidence": 0.42})
        out = rt.LektaLayaRuntime(agent, MANIFEST).infer(request())
        self.assertEqual(out["probabilities"]["finding_supported"], 0.5)
        self.assertEqual(out["answerConfidence"], 0.42)

    def test_neispravan_zahtjev_odbija(self):
        runtime = rt.LektaLayaRuntime(FakeAgent(), MANIFEST)
        for bad in [request(extra=1), request(taskId="drugo"), request(labelOrder=["finding_supported"]),
                    request(inputDigest="krivo"), request(modelInput={"text": "", "language": "hr", "ruleEvidence": None})]:
            with self.assertRaises(rt.RequestError):
                runtime.infer(bad)

    def test_nepotpuna_raspodjela_je_kvar_upstreama(self):
        with self.assertRaises(ValueError):
            rt.LektaLayaRuntime(FakeAgent({"finding_supported": 1.0}), MANIFEST).infer(request())


class ServerTest(unittest.TestCase):
    def test_http_200_400_404_i_bez_logiranja(self):
        server = HTTPServer(("127.0.0.1", 0), rt.make_handler(rt.LektaLayaRuntime(FakeAgent(), MANIFEST)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{server.server_address[1]}"

        def post(path, body):
            req = urllib.request.Request(base + path, data=json.dumps(body).encode(), headers={"content-type": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=5) as r:
                    return r.status, json.loads(r.read())
            except urllib.error.HTTPError as e:
                return e.code, json.loads(e.read())

        try:
            status, body = post("/v2/infer", request())
            self.assertEqual((status, body["verdict"]), (200, "finding_supported"))
            self.assertEqual(post("/v2/infer", {"x": 1}), (400, {}))
            self.assertEqual(post("/v1/systemone", request())[0], 404)
        finally:
            server.shutdown()


REV = "55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851"


def checkpoint(root):
    """Minimalna mapa checkpointa istog oblika kao upstream snapshot (agent.py:352)."""
    for rel, data in {"model.safetensors": b"tezine", "rl_agent_config.json": b"{}", "encoder/config.json": b"enc",
                      "tokenizer/tokenizer.json": b"tok", "tokenizer/tokenizer_config.json": b"{}"}.items():
        path = os.path.join(root, *rel.split("/"))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
    return root


class RevisionAgent(FakeAgent):
    def __init__(self, revision):
        super().__init__()
        self.revision = revision


class PrepareTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = checkpoint(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def args(self, *extra):
        return rt.parse_args(["--model-revision", REV, "--calibration-revision", "cal-1", *extra])

    def test_prolazi_i_trazi_pinani_commit_od_upstreama(self):
        calls = []
        def load(model, **kw):
            calls.append((model, kw))
            return RevisionAgent(REV)
        runtime = rt.prepare(self.args(), load, "0.3.21", locate=lambda a: self.dir)
        self.assertEqual(calls, [("convaiinnovations/laya", {"subfolder": "multilingual", "revision": REV})])
        self.assertEqual(runtime.manifest["modelRevision"], REV)
        self.assertEqual(runtime.manifest["modelId"], "convaiinnovations:laya:multilingual")

    def test_odbija_host_izvan_loopbacka_prije_ucitavanja(self):
        def load(*a, **k):
            raise AssertionError("model se ne smije ucitati")
        with self.assertRaises(rt.StartError):
            rt.prepare(self.args("--host", "0.0.0.0"), load, "t", locate=lambda a: self.dir)

    def test_odbija_granu_ili_skraceni_commit(self):
        for rev in ["main", REV[:12], REV.upper()]:
            args = rt.parse_args(["--model-revision", rev, "--calibration-revision", "c"])
            with self.assertRaises(rt.StartError):
                rt.prepare(args, lambda *a, **k: RevisionAgent(rev), "t", locate=lambda a: self.dir)

    def test_odbija_kad_je_ucitan_drugi_commit(self):
        for loaded in [None, "f" * 40]:
            with self.assertRaises(rt.StartError):
                rt.prepare(self.args(), lambda *a, **k: RevisionAgent(loaded), "t", locate=lambda a: self.dir)


class ManifestTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = checkpoint(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def digests(self):
        return rt.checkpoint_digests(self.dir)

    def change(self, rel, data=b"drugo"):
        with open(os.path.join(self.dir, *rel.split("/")), "wb") as f:
            f.write(data)

    def test_tezine_pokrivaju_model_konfiguraciju_i_enkoder(self):
        for rel in ["model.safetensors", "rl_agent_config.json", "encoder/config.json"]:
            before = self.digests()
            self.change(rel, rel.encode())
            after = self.digests()
            self.assertNotEqual(after[0], before[0], rel)
            self.assertEqual(after[1], before[1], rel)

    def test_tokenizer_pokriva_cijelu_mapu_i_prepisani_config(self):
        before = self.digests()
        self.change("tokenizer/tokenizer_config.json", b'{"tokenizer_class": "PreTrainedTokenizerFast"}')
        after = self.digests()
        self.assertEqual(after[0], before[0])
        self.assertNotEqual(after[1], before[1])

    def test_novi_enkoderski_fajl_mijenja_hash_a_skriveni_tmp_ne(self):
        before = self.digests()
        self.change(".tokenizer_config.x.tmp")
        os.makedirs(os.path.join(self.dir, "tokenizer"), exist_ok=True)
        self.change("tokenizer/.tokenizer_config.y.tmp")
        self.assertEqual(self.digests(), before)
        self.change("encoder/extra.bin")
        self.assertNotEqual(self.digests()[0], before[0])

    def test_nepotpun_checkpoint_se_odbija(self):
        os.remove(os.path.join(self.dir, "model.safetensors"))
        with self.assertRaises(ValueError):
            self.digests()

    def test_hash_se_racuna_nakon_ucitavanja(self):
        # Upstream pri ucitavanju prepise tokenizer_config.json; manifest mora opisati stanje poslije.
        def load(model, **kw):
            self.change("tokenizer/tokenizer_config.json", b'{"prepisano": true}')
            return RevisionAgent(REV)
        args = rt.parse_args(["--model-revision", REV, "--calibration-revision", "cal-1"])
        runtime = rt.prepare(args, load, "0.3.21", locate=lambda a: self.dir)
        self.assertEqual(runtime.manifest["tokenizerSha256"], self.digests()[1])


if __name__ == "__main__":
    unittest.main()
