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


class MainTest(unittest.TestCase):
    def test_odbija_host_izvan_loopbacka(self):
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(b"w")
        args = ["--model-revision", "r", "--weights-file", f.name, "--tokenizer-file", f.name, "--calibration-revision", "c", "--host", "0.0.0.0"]
        self.assertEqual(rt.main(args, load=lambda *a, **k: FakeAgent()), 2)
        os.unlink(f.name)

    def test_manifest_hashira_stvarne_datoteke(self):
        with tempfile.TemporaryDirectory() as d:
            w, t = os.path.join(d, "w.bin"), os.path.join(d, "t.json")
            open(w, "wb").write(b"tezine")
            open(t, "wb").write(b"tokenizer")
            args = rt.parse_args(["--model-revision", "r1", "--weights-file", w, "--tokenizer-file", t, "--calibration-revision", "cal-1"])
            m = rt.build_manifest(args, "0.3.21")
            self.assertEqual(m["weightsSha256"], rt.sha256_file(w))
            self.assertNotEqual(m["weightsSha256"], m["tokenizerSha256"])
            self.assertEqual(m["modelId"], "convaiinnovations:laya:multilingual")


if __name__ == "__main__":
    unittest.main()
