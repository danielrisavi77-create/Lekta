"""katedra-verifier: deterministički verifikator koraka za Katedra app.

Obrazac je isti kao Lekta workers/field-renderer: privatni HTTP servis, tajni header,
bez baze, bez trajnog stanja, bez modela. Jedan poziv = jedan privremeni projekt koji se
briše na kraju. Endpoints:
  GET  /v1/health
  POST /v1/verify         {runId, stepId, agent, attempt, manuscript, profile, agentResult?}
                          -> 202 {jobId}   (ili ?wait=1 -> 200 rezultat)
  GET  /v1/verify/{jobId} -> {status: queued|running|done, result?}
  POST /v1/build          {manuscript, profile} -> .docx (application/vnd...) iz rukopisa, kostur + poglavlja
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Query, Response
from pydantic import BaseModel, Field

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.environ.get("KATEDRA_PKG_HOME", os.path.abspath(os.path.join(HERE, "..")))
SCRIPTS = os.path.join(PKG, "katedra-lite", "scripts")
sys.path.insert(0, HERE)
from gate_mapping import map_gate  # noqa: E402
from manuscript_to_katedra import write_katedra  # noqa: E402
from claims_bridge import ingest_claims  # noqa: E402

TOKEN = os.environ.get("KATEDRA_VERIFIER_TOKEN", "")
MAX_BYTES = int(os.environ.get("KATEDRA_VERIFIER_MAX_BYTES", str(8 * 1024 * 1024)))
TIMEOUT_S = int(os.environ.get("KATEDRA_VERIFIER_TIMEOUT_S", "600"))
WORKERS = int(os.environ.get("KATEDRA_VERIFIER_WORKERS", "2"))

GATE_PHASE_FOR_AGENT = {"intake": "plan", "sources": "plan", "structure": "plan", "planning": "plan",
                        "writing": "pisanje", "citation": "pisanje", "review": "audit", "export": "predaja"}

# Koraci forme: Lektin posao (PRODUCT_CONSTITUTION §1, Katedra CLAUDE.md "no competing DOCX validator").
# Ostaju u Cowork paketu, u servisu se NE POKREĆU: gate.py --iskljuci (kvar 152). Isporučena
# inačica ih je slala kroz --dopusti-preskok, koji oprašta samo korak kojemu FALI ULAZ — s
# izgrađenim rad.docx forma se vrtjela, `literatura` je pukla i audit/predaja su bili `failed`.
ISKLJUCENI_KORACI = {
    "revizije": "ulaz je rukopis iz appa, ne Word datoteka s praćenim izmjenama",
    "pravila": "forma: Lekta", "odlomci": "forma: Lekta", "fusnote": "forma: Lekta",
    "literatura": "forma: Lekta", "prikazi": "forma: Lekta", "metapodaci": "forma: Lekta",
    "motor": "rad-audit A-G miješa formu i sadržaj; v1 izlaže samo faze B i C kroz engine.py",
    "motor_audit": "rad-audit A-G miješa formu i sadržaj; v1 izlaže samo faze B i C kroz engine.py",
    # privremeni projekt nema snimki: diff_versions.py bez dvije verzije izlazi s kodom 2 (izmjereno, predaja pukao=1)
    "izmjene": "privremeni projekt nema ranijih snimki; povijest verzija vodi app",
}
# Koraci kojima nedostaje ULAZ, pa smiju ostati nepokrenuti (gate.py --dopusti-preskok). Od v1 prazno:
# `evidence` dobiva ulaz iz claims_bridge (AgentResultV1.claims → claims.jsonl + evidence.jsonl).
# Zahtjev BEZ claims ostavlja korak preskočenim i on blokira — to je nalaz o zahtjevu, ne o servisu.
DOPUSTENI_PRESKOCI: dict[str, str] = {}

app = FastAPI(title="katedra-verifier", version="0.1.0")
_pool = ThreadPoolExecutor(max_workers=WORKERS)
_jobs: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()


class VerifyRequest(BaseModel):
    runId: str
    stepId: str = ""
    agent: str
    attempt: int = 1
    manuscript: dict[str, Any]
    profile: dict[str, Any] | None = None
    agentResult: dict[str, Any] | None = None
    phase: str | None = Field(default=None, description="prepiši fazu gatea; zadano po agentu")
    planApproved: bool = Field(default=False, description="iz appa: student je odobrio plan (planning korak verified)")
    plan: dict[str, Any] | None = Field(default=None, description="{thesis, question, perspectives:[{label,position,why}], chapters:[{sectionId,pages,content,sources}]} iz structure/planning koraka")
    mentorComments: list[dict[str, Any]] | None = Field(default=None, description="[{id,author,text,location,kind,resolved,resolvedWhere,date}]")
    sectionId: str | None = Field(default=None, description="opcionalno: chapter za claim ledger (sekcija koju je agent pisao)")


def _auth(token: str | None) -> None:
    if not TOKEN or token != TOKEN:
        raise HTTPException(status_code=401, detail="neispravan token")


def _run(cmd: list[str], cwd: str, timeout: int = TIMEOUT_S) -> subprocess.CompletedProcess:
    # encoding= je obavezan: bez njega Windows konzola (cp1250) sruši čitač izlaza, r.stdout
    # postane None i servis padne na `r.stdout + r.stderr` (katedra-lite kvar 119, izmjereno 7. 9.).
    env = {**os.environ, "KATEDRA_PROJECT_ROOT": cwd, "PYTHONDONTWRITEBYTECODE": "1", "PYTHONIOENCODING": "utf-8"}
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                          timeout=timeout, env=env)


def _set_stanje(root: str, *postavke: str) -> None:
    """`stanje_init.py --set k=v`, jedna postavka po pozivu; pad je greška verifikatora, ne tiho stanje."""
    for p in postavke:
        r = _run([sys.executable, os.path.join(SCRIPTS, "stanje_init.py"), "--project-root", root, "--set", p], root)
        if r.returncode != 0:
            raise RuntimeError(f"stanje_init.py --set {p} pao: {r.stdout[-400:]} {r.stderr[-400:]}")


def _neuspjeh(faza: str, poruka: str, conv: dict[str, Any] | None, docx_err: str | None, kod: int | None = None,
              ledger: dict[str, Any] | None = None) -> dict[str, Any]:
    """Rezultat kad verifikator NIJE proveo gate: failed, nikad verified (pravilo 20 paketa)."""
    return {"status": "failed",
            "issues": [{"code": "verifier_error", "step": "build_docx", "blocking": True, "message": poruka[:300]}],
            "gate": {"faza": faza, "prolaz": False, "koraci": [], "sazetak": {}}, "gateExitCode": kod,
            "conversion": {"poglavlja": len(conv["poglavlja"]) if conv else 0, "profil": conv["profil"] if conv else None,
                           "docxError": docx_err, "ledger": ledger}}


def _build_docx(root: str, manuscript: dict[str, Any], out: str) -> None:
    meta = manuscript.get("meta") or {}
    prof = os.path.join(root, ".katedra", "resolved_profile.json")
    tip = json.load(open(os.path.join(root, ".katedra", "stanje.json"), encoding="utf-8")).get("tip", "diplomski")
    cmd = [sys.executable, os.path.join(SCRIPTS, "build_docx.py"), "--profil", prof, "--tip", tip,
           "--tema", manuscript.get("title") or "(bez naslova)", "--autor", meta.get("author") or "Autor",
           "--mentor", meta.get("mentor") or "", "--project-root", root,
           "--rukopis", os.path.join(root, ".katedra", "poglavlja"), "--out", out, "--bez-prikaza"]
    r = _run(cmd, root)
    if r.returncode != 0 or not os.path.exists(out):
        raise RuntimeError(f"build_docx.py pao ({r.returncode}): {r.stdout[-600:]} {r.stderr[-600:]}")


def _verify_job(req: VerifyRequest) -> dict[str, Any]:
    root = tempfile.mkdtemp(prefix="katedra-verify-")
    try:
        faza = req.phase or GATE_PHASE_FOR_AGENT.get(req.agent, "pisanje")
        mod = {"plan": "novi-rad", "pisanje": "pisanje", "audit": "audit", "predaja": "predaja"}[faza]
        # mod=audit i mod=predaja traže da rad.docx POSTOJI (stanje_init: „mod=audit bez gotovog rada
        # nije stanje koje se može auditirati”), pa se u stanje upisuju tek nakon gradnje dokumenta.
        # Izmjereno 7. 9.: s mod= ovdje je agent `review` padao na svakom pozivu.
        mod_sada = mod if (faza == "plan" or (req.planApproved and faza == "pisanje")) else "novi-rad"
        conv = write_katedra(req.manuscript, root, req.profile, SCRIPTS, mod=mod_sada,
                             plan_approved=req.planApproved, plan=req.plan, mentor_comments=req.mentorComments)
        # claims iz appa → claims.jsonl + evidence.jsonl (ulaz strict evidence gatea); pad se prijavljuje, ne skriva
        try:
            ledger = ingest_claims(req.agentResult, root, SCRIPTS, section_hint=req.sectionId)
        except Exception as e:
            ledger = {"error": str(e)[:300]}
        rad = os.path.join(root, "rad.docx")
        docx_err = None
        if faza != "plan":
            try:
                _build_docx(root, req.manuscript, rad)
            except Exception as e:
                docx_err = str(e)
            if docx_err:
                # Bez dokumenta koraci nad rad.docx se preskaču, a u fazi pisanje su savjetni — rezultat
                # je bio `verified` uz 5 od 9 preskočenih koraka (izmjereno). Verifikator koji nije
                # provjerio ne smije reći da je provjerio.
                return _neuspjeh(faza, f"rad.docx nije izgrađen, gate nad rukopisom nije proveden: {docx_err}", conv, docx_err, ledger=ledger)
            if faza in ("audit", "predaja"):
                _set_stanje(root, "datoteke.rad_docx=true", f"mod={faza}")
        gate_json = os.path.join(root, ".katedra", "gate.json")
        base = [sys.executable, os.path.join(SCRIPTS, "gate.py"), "--faza", faza, "--project-root", root,
                "--rad", rad, "--profil", os.path.join(root, ".katedra", "resolved_profile.json"), "--json", gate_json]
        iskljuci, preskoci = dict(ISKLJUCENI_KORACI), dict(DOPUSTENI_PRESKOCI)
        for _ in range(3):  # gate odbija imena kojih u fazi nema; makni ih i ponovi
            cmd = list(base)
            for korak, razlog in iskljuci.items():
                cmd += ["--iskljuci", f"{korak}={razlog}"]
            for korak, razlog in preskoci.items():
                cmd += ["--dopusti-preskok", f"{korak}={razlog}"]
            r = _run(cmd, root)
            m = re.search(r"imenuje korake kojih u fazi nema: ([^\n]+)", (r.stdout or "") + (r.stderr or ""))
            if not m:
                break
            for k in m.group(1).split(","):
                iskljuci.pop(k.strip(), None)
                preskoci.pop(k.strip(), None)
        if not os.path.exists(gate_json):
            return {"status": "failed", "issues": [{"code": "verifier_error", "step": "gate", "blocking": True,
                                                    "message": f"gate.py nije zapisao izvještaj (izlaz {r.returncode}): {(r.stderr or r.stdout)[-300:]}"}],
                    "gate": {"faza": faza, "prolaz": False, "koraci": [], "sazetak": {}}, "gateExitCode": r.returncode,
                    "conversion": {"poglavlja": len(conv["poglavlja"]), "profil": conv["profil"], "docxError": docx_err, "ledger": ledger}}
        gate = json.load(open(gate_json, encoding="utf-8"))
        result = map_gate(gate, attempt=req.attempt)
        result["gateExitCode"] = r.returncode
        result["conversion"] = {"poglavlja": len(conv["poglavlja"]), "profil": conv["profil"], "docxError": docx_err, "ledger": ledger}
        return result
    finally:
        shutil.rmtree(root, ignore_errors=True)


@app.get("/v1/health")
def health() -> dict[str, Any]:
    ok = os.path.exists(os.path.join(SCRIPTS, "gate.py"))
    return {"ok": ok, "pkg": PKG, "workers": WORKERS}


@app.post("/v1/verify")
def verify(req: VerifyRequest, response: Response, wait: int = Query(default=0),
           x_katedra_worker_token: str | None = Header(default=None)) -> dict[str, Any]:
    _auth(x_katedra_worker_token)
    if len(json.dumps(req.manuscript)) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="rukopis prevelik")
    if wait:
        return {"jobId": None, "status": "done", "result": _verify_job(req)}
    job_id = str(uuid.uuid4())
    with _lock:
        _jobs[job_id] = {"status": "queued", "runId": req.runId, "stepId": req.stepId}

    def go() -> None:
        with _lock:
            _jobs[job_id]["status"] = "running"
        try:
            res = _verify_job(req)
            with _lock:
                _jobs[job_id].update(status="done", result=res)
        except Exception as e:
            with _lock:
                _jobs[job_id].update(status="done", result={"status": "failed", "issues": [{"code": "verifier_error", "message": str(e)[:300], "blocking": True}]})

    _pool.submit(go)
    response.status_code = 202
    return {"jobId": job_id, "status": "queued"}


@app.get("/v1/verify/{job_id}")
def verify_status(job_id: str, x_katedra_worker_token: str | None = Header(default=None)) -> dict[str, Any]:
    _auth(x_katedra_worker_token)
    with _lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="nepoznat job")
    return job


class BuildRequest(BaseModel):
    manuscript: dict[str, Any]
    profile: dict[str, Any] | None = None


@app.post("/v1/build")
def build(req: BuildRequest, x_katedra_worker_token: str | None = Header(default=None)) -> Response:
    _auth(x_katedra_worker_token)
    root = tempfile.mkdtemp(prefix="katedra-build-")
    try:
        write_katedra(req.manuscript, root, req.profile, SCRIPTS)
        out = os.path.join(root, "rad.docx")
        _build_docx(root, req.manuscript, out)
        data = open(out, "rb").read()
    finally:
        shutil.rmtree(root, ignore_errors=True)
    return Response(content=data, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
