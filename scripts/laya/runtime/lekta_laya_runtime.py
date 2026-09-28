#!/usr/bin/env python3
"""Lekta Laya runtime (V2.1): omotac oko sluzbenog Python paketa `laya` (Convai Innovations).

Govori protokol iz docs/laya/RUNTIME_PROTOCOL.md: POST /v2/infer na 127.0.0.1. Pokrece se samo
na radnoj stanici (docs/laya/RADNA_STANICA.md). Ne logira tekst zapisa, ne slusa izvan loopbacka
i ne vraca prag ni politiku: prag dolazi iz Lektinog registra, nikad iz runtimea.

Upstream (provjereno 27. 9. 2026 u README-u github.com/NandhaKishorM/laya, PyPI laya 0.3.21):
    agent = laya.load("convaiinnovations/laya", subfolder="multilingual")
    result = agent.predict(state, {"ime": {"type": "choice", "instructions": ..., "criteria": {...}}})
    result["answers"]["ime"] -> {"choice", "confidence", "probabilities"}
Nije pokretano s pravim modelom u razvojnoj okolini (Hugging Face nije bio dostupan).

Pokretanje:
    python scripts/laya/runtime/lekta_laya_runtime.py --model-revision <hf-commit> \
        --weights-file <putanja tezina> --tokenizer-file <putanja tokenizera> \
        --calibration-revision cal-2026-10-1 [--subfolder multilingual] [--precision fp32] [--port 8765]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any, Callable

SCHEMA_VERSION = 2
TASK_ID = "reference.completeness/finding-v2"
VERDICTS = ("finding_supported", "possible_false_positive", "extraction_uncertain", "insufficient_evidence")
MAX_REQUEST_BYTES = 16 * 1024
MAX_TEXT = 2000
ID_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._:+-]*$")
LOOPBACK = {"127.0.0.1"}

QUESTION = "nalaz"
INSTRUCTIONS = (
    "Lekta je deterministickom provjerom oznacila ovaj zapis iz popisa literature kao moguce nepotpun "
    "(nedostaje autor ili godina, ili je zapis prekratak). Procijeni je li taj nalaz stvaran. "
    "Lekta flagged this bibliography entry as possibly incomplete; judge whether the finding is real."
)
CRITERIA = {
    "finding_supported": "Zapis stvarno nije potpun: nedostaje autor, godina ili drugi obvezni element. The entry is really incomplete.",
    "possible_false_positive": "Zapis je potpun za svoju vrstu izvora (npr. propis, presuda, institucija kao autor, izvor bez godine s oznakom b.g.), pa je nalaz vjerojatno lazan. The entry is complete for its source type.",
    "extraction_uncertain": "Tekst ne izgleda kao jedan cijeli zapis (spojen s drugim zapisom, prekinut, naslov popisa). The text is not one whole entry.",
    "insufficient_evidence": "Iz samog teksta se ne moze odluciti. The text alone is not enough to decide.",
}


class RequestError(Exception):
    """Neispravan zahtjev; poruka nikad ne sadrzi vrijednosti iz zahtjeva."""


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def check_id(value: str, name: str) -> str:
    if not isinstance(value, str) or not ID_PATTERN.match(value) or len(value) > 128:
        raise ValueError(f"{name} nije valjan identifikator (dopusteno: slova, brojke, . _ : + -)")
    return value


def normalized(probabilities: dict[str, Any]) -> dict[str, float]:
    """Vjerojatnosti za sve cetiri oznake, zbroj tocno 1 nakon zaokruzivanja na 6 decimala."""
    raw: dict[str, float] = {}
    for label in VERDICTS:
        value = probabilities.get(label)
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value) or value < 0:
            raise ValueError("upstream nije vratio vjerojatnost za svaku oznaku")
        raw[label] = float(value)
    total = sum(raw.values())
    if total <= 0:
        raise ValueError("upstream je vratio nultu raspodjelu")
    rounded = {label: round(value / total, 6) for label, value in raw.items()}
    top = max(VERDICTS, key=lambda label: rounded[label])
    rounded[top] = round(rounded[top] + (1.0 - sum(rounded.values())), 6)
    return rounded


class LektaLayaRuntime:
    """Jedan zahtjev prema protokolu -> jedan poziv agent.predict -> LayaDecisionResultV2."""

    def __init__(self, agent: Any, manifest: dict[str, str]):
        self.agent = agent
        self.manifest = dict(manifest)

    def infer(self, request: Any) -> dict[str, Any]:
        expected = {"schemaVersion", "taskId", "caseId", "inputDigest", "modelInput", "labelOrder"}
        if not isinstance(request, dict) or set(request) != expected:
            raise RequestError("zahtjev nema tocno polja protokola")
        if request["schemaVersion"] != SCHEMA_VERSION or request["taskId"] != TASK_ID:
            raise RequestError("nepoznata verzija ili zadatak")
        case_id, input_digest = request["caseId"], request["inputDigest"]
        if not isinstance(case_id, str) or not isinstance(input_digest, str) or not re.fullmatch(r"[0-9a-f]{64}", input_digest):
            raise RequestError("caseId ili inputDigest nisu valjani")
        order = request["labelOrder"]
        if not isinstance(order, list) or sorted(order) != sorted(VERDICTS):
            raise RequestError("labelOrder nije permutacija oznaka")
        model_input = request["modelInput"]
        if not isinstance(model_input, dict) or set(model_input) != {"text", "language", "ruleEvidence"}:
            raise RequestError("modelInput nema tocno polja protokola")
        text = model_input["text"]
        if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
            raise RequestError("tekst zapisa nije valjan")

        state: dict[str, Any] = {"zapis": text, "jezik": model_input["language"]}
        rule = model_input["ruleEvidence"]
        if isinstance(rule, dict) and isinstance(rule.get("excerpt"), str):
            state["pravilo"] = rule["excerpt"]
        questions = {QUESTION: {"type": "choice", "instructions": INSTRUCTIONS,
                                "criteria": {label: CRITERIA[label] for label in order}}}
        answer = self.agent.predict(state, questions)["answers"][QUESTION]
        probabilities = normalized(answer["probabilities"])
        verdict = max(VERDICTS, key=lambda label: probabilities[label])
        # Upstream preporucuje odluke nad kalibriranom pouzdanoscu; bez nje koristi se vjerojatnost presude.
        confidence = answer.get("answer_confidence", answer.get("confidence", probabilities[verdict]))
        if not isinstance(confidence, (int, float)) or not math.isfinite(confidence) or not 0 <= confidence <= 1:
            confidence = probabilities[verdict]
        return {"schemaVersion": SCHEMA_VERSION, "caseId": case_id, "inputDigest": input_digest, "verdict": verdict,
                "probabilities": probabilities, "answerConfidence": round(float(confidence), 6), "runtime": dict(self.manifest)}


def make_handler(runtime: LektaLayaRuntime) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
            return  # nikad ne logira zahtjeve ni tekst zapisa

        def _send(self, status: int, body: dict[str, Any]) -> None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/v2/infer":
                self._send(404, {})
                return
            length = int(self.headers.get("content-length") or 0)
            if length <= 0 or length > MAX_REQUEST_BYTES:
                self._send(413, {})
                return
            try:
                request = json.loads(self.rfile.read(length).decode("utf-8"))
                self._send(200, runtime.infer(request))
            except (RequestError, json.JSONDecodeError, UnicodeDecodeError):
                self._send(400, {})
            except Exception:  # upstream kvar: Lekta ga vidi kao runtime_unavailable
                self._send(500, {})

    return Handler


def build_manifest(args: argparse.Namespace, runtime_version: str) -> dict[str, str]:
    model_id = check_id(f"{args.model.replace('/', ':')}:{args.subfolder}" if args.subfolder else args.model.replace("/", ":"), "modelId")
    return {"backend": "laya-python", "modelId": model_id, "modelRevision": check_id(args.model_revision, "modelRevision"),
            "weightsSha256": sha256_file(args.weights_file), "tokenizerSha256": sha256_file(args.tokenizer_file),
            "calibrationRevision": check_id(args.calibration_revision, "calibrationRevision"),
            "runtimeVersion": check_id(runtime_version, "runtimeVersion"), "precision": args.precision}


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Lekta Laya runtime (lokalni, samo 127.0.0.1)")
    parser.add_argument("--model", default="convaiinnovations/laya")
    parser.add_argument("--subfolder", default="multilingual", help="multilingual za hrvatski; prazno za engleski checkpoint")
    parser.add_argument("--model-revision", required=True, help="commit Hugging Face repozitorija modela")
    parser.add_argument("--weights-file", required=True)
    parser.add_argument("--tokenizer-file", required=True)
    parser.add_argument("--calibration-revision", required=True)
    parser.add_argument("--precision", default="fp32", choices=["fp32", "fp16", "bf16", "int8", "int4"])
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    return parser.parse_args(argv)


def main(argv: list[str], load: Callable[..., Any] | None = None) -> int:
    args = parse_args(argv)
    if args.host not in LOOPBACK:
        print("Runtime smije slusati samo na 127.0.0.1.", file=sys.stderr)
        return 2
    if load is None:
        import laya  # sluzbeni paket: python -m pip install "laya"
        from importlib.metadata import version
        load, runtime_version = laya.load, version("laya")
    else:
        runtime_version = "test"
    agent = load(args.model, subfolder=args.subfolder) if args.subfolder else load(args.model)
    runtime = LektaLayaRuntime(agent, build_manifest(args, runtime_version))
    print(json.dumps({"slusa": f"http://{args.host}:{args.port}", "runtime": runtime.manifest}, indent=2))
    HTTPServer((args.host, args.port), make_handler(runtime)).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
