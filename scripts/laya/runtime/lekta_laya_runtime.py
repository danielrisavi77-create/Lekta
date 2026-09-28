#!/usr/bin/env python3
"""Lekta Laya runtime (V2.1): omotac oko sluzbenog Python paketa `laya` (Convai Innovations).

Govori protokol iz docs/laya/RUNTIME_PROTOCOL.md: POST /v2/infer na 127.0.0.1. Pokrece se samo
na radnoj stanici (docs/laya/RADNA_STANICA.md). Ne logira tekst zapisa, ne slusa izvan loopbacka
i ne vraca prag ni politiku: prag dolazi iz Lektinog registra, nikad iz runtimea.

Upstream (provjereno 28. 9. 2026 u sdistu laya-0.3.21, SHA-256 a3ddc55d...f416):
    agent = laya.load("convaiinnovations/laya", subfolder="multilingual", revision=<commit>)
    result = agent.predict(state, {"ime": {"type": "choice", "instructions": ..., "criteria": {...}}})
    result["answers"]["ime"] -> {"choice", "probabilities", "confidence", "answer_confidence", ...}
Checkpoint cine `rl_agent_config.json`, `model.safetensors`, `tokenizer/*` i `encoder/*`
(agent.py:352). Upstream pri ucitavanju smije prepisati `tokenizer/tokenizer_config.json`
(`_fix_tokenizer_config`), pa se manifest hashira NAKON ucitavanja, nad istom mapom.
Nije pokretano s pravim modelom u razvojnoj okolini (Hugging Face nije bio dostupan).

Pokretanje:
    python scripts/laya/runtime/lekta_laya_runtime.py --model-revision <40-znamenkasti commit> \
        --calibration-revision cal-2026-10-1 [--subfolder multilingual] [--precision fp32] [--port 8765]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
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
COMMIT = re.compile(r"^[0-9a-f]{40}$")
# Isti allow_patterns kao upstream `Agent.__init__`; samo te datoteke model ucitava.
CHECKPOINT_PATTERNS = ("rl_agent_config.json", "model.safetensors", "tokenizer/*", "encoder/*")

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


def tree_sha256(root: str, rel_paths: list[str]) -> str:
    """Jedan SHA-256 za skup datoteka: sortirani retci `putanja NUL sha256(datoteke)`."""
    digest = hashlib.sha256()
    for rel in sorted(rel_paths):
        digest.update(rel.encode("utf-8") + b"\0" + sha256_file(os.path.join(root, *rel.split("/"))).encode("ascii") + b"\n")
    return digest.hexdigest()


def checkpoint_digests(checkpoint_dir: str) -> tuple[str, str]:
    """(weightsSha256, tokenizerSha256) za mapu checkpointa.

    Tezine pokrivaju `model.safetensors`, `rl_agent_config.json` i cijeli `encoder/`, jer model
    bez istog enkodera i konfiguracije nije isti model. Tokenizer pokriva cijeli `tokenizer/`.
    Skrivene datoteke (upstreamov `.tokenizer_config.*.tmp` usred zamjene) ne ulaze.
    """
    files = []
    for dirpath, dirnames, names in os.walk(checkpoint_dir):
        dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
        for name in names:
            if not name.startswith("."):
                files.append(os.path.relpath(os.path.join(dirpath, name), checkpoint_dir).replace(os.sep, "/"))
    weights = [f for f in files if f in ("model.safetensors", "rl_agent_config.json") or f.startswith("encoder/")]
    tokenizer = [f for f in files if f.startswith("tokenizer/")]
    if "model.safetensors" not in weights or "rl_agent_config.json" not in weights or not tokenizer:
        raise ValueError("mapa checkpointa nema model.safetensors, rl_agent_config.json i tokenizer/")
    return tree_sha256(checkpoint_dir, weights), tree_sha256(checkpoint_dir, tokenizer)


def locate_checkpoint(args: argparse.Namespace) -> str:
    """Mapa pinanog checkpointa u lokalnoj HF predmemoriji; bez mreze (local_files_only)."""
    from huggingface_hub import snapshot_download
    prefix = f"{args.subfolder}/" if args.subfolder else ""
    root = snapshot_download(args.model, revision=args.model_revision, local_files_only=True,
                             allow_patterns=[prefix + p for p in CHECKPOINT_PATTERNS])
    return os.path.join(root, args.subfolder) if args.subfolder else root


def build_manifest(args: argparse.Namespace, runtime_version: str, checkpoint_dir: str) -> dict[str, str]:
    model_id = check_id(f"{args.model.replace('/', ':')}:{args.subfolder}" if args.subfolder else args.model.replace("/", ":"), "modelId")
    weights, tokenizer = checkpoint_digests(checkpoint_dir)
    return {"backend": "laya-python", "modelId": model_id, "modelRevision": check_id(args.model_revision, "modelRevision"),
            "weightsSha256": weights, "tokenizerSha256": tokenizer,
            "calibrationRevision": check_id(args.calibration_revision, "calibrationRevision"),
            "runtimeVersion": check_id(runtime_version, "runtimeVersion"), "precision": args.precision}


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Lekta Laya runtime (lokalni, samo 127.0.0.1)")
    parser.add_argument("--model", default="convaiinnovations/laya")
    parser.add_argument("--subfolder", default="multilingual", help="multilingual za hrvatski; prazno za engleski checkpoint")
    parser.add_argument("--model-revision", required=True, help="40-znamenkasti commit Hugging Face repozitorija modela")
    parser.add_argument("--calibration-revision", required=True)
    parser.add_argument("--precision", default="fp32", choices=["fp32", "fp16", "bf16", "int8", "int4"])
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    return parser.parse_args(argv)


class StartError(Exception):
    """Runtime se ne smije pokrenuti; poruka ide operateru."""


def prepare(args: argparse.Namespace, load: Callable[..., Any], runtime_version: str,
            locate: Callable[[argparse.Namespace], str] = locate_checkpoint) -> LektaLayaRuntime:
    if args.host not in LOOPBACK:
        raise StartError("Runtime smije slusati samo na 127.0.0.1.")
    if not COMMIT.match(args.model_revision):
        raise StartError("--model-revision mora biti 40-znamenkasti commit (mala slova), ne grana ni oznaka.")
    agent = load(args.model, subfolder=args.subfolder or None, revision=args.model_revision)
    # Upstream biljezi commit na koji snapshot stvarno pokazuje; drugi commit znaci drugi model.
    loaded = getattr(agent, "revision", None)
    if loaded != args.model_revision:
        raise StartError(f"Ucitan je commit {loaded!r}, a trazen {args.model_revision}.")
    return LektaLayaRuntime(agent, build_manifest(args, runtime_version, locate(args)))


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        import laya  # sluzbeni paket: python -m pip install "laya"
        from importlib.metadata import version
        runtime = prepare(args, laya.load, version("laya"))
    except StartError as error:
        print(error, file=sys.stderr)
        return 2
    print(json.dumps({"slusa": f"http://{args.host}:{args.port}", "runtime": runtime.manifest}, indent=2))
    HTTPServer((args.host, args.port), make_handler(runtime)).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
