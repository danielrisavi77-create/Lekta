"""AgentResultV1.claims (Katedra app) -> claim ledger paketa (claims.jsonl + evidence.jsonl), kroz skripte.

Oblik ulaza (lib/agents/contracts.ts, ClaimEvidence):
  claims: [{id, text, citationIds: [sourceId], support: [{citationId, quote, locator}]}]

Što se radi, redom:
  1. za svaki citationId koji ima support: odlomci (quote) idu u .katedra/gradja_app/<sourceId>.txt,
     jedan odlomak po praznom retku, pa evidence_ingest.py --source-id <sourceId> nad tom datotekom
     (source_id mora postojati u izvori.json, što manuscript_to_katedra jamči za app izvore);
  2. claim_ledger.py add po tvrdnji (chapter iz sectionId ako je poznat);
  3. claim_ledger.py link claim -> evidence (relation supports) tako da se evidence_id nađe po
     tekstu odlomka u evidence.jsonl (stabilan hash iz evidence_model).
Zašto ne pisati JSONL ručno: stanje_schema.md, "nijednu od njih ne piši ručno".

Poštenje prema gateu: quote koji je model sam napisao NIJE dokaz da izvor postoji ni da ga podupire.
Passage verification u appu (passage-verification.ts) to provjerava prije ovoga; ovdje se samo
prevodi u oblik koji strict evidence gate zna čitati. Tvrdnja bez supporta ostaje unsupported i blokira.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from typing import Any


def _run(cmd: list[str], what: str) -> subprocess.CompletedProcess:
    # encoding= je obavezan (katedra-lite kvar 119): isporučena inačica bez njega rušila je čitač
    # izlaza na cp1250 konzoli (bajt 0x90 iz evidence_ingest.py), r.stdout bi bio None.
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                       env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONDONTWRITEBYTECODE": "1"})
    if r.returncode != 0:
        raise RuntimeError(f"{what} pao ({r.returncode}): {r.stdout[-400:]} {r.stderr[-300:]}")
    return r


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip().lower()


def ingest_claims(agent_result: dict[str, Any] | None, project_root: str, scripts_dir: str,
                  section_hint: str | None = None) -> dict[str, Any]:
    kat = os.path.join(project_root, ".katedra")
    claims = [c for c in ((agent_result or {}).get("claims") or []) if isinstance(c, dict) and c.get("text")]
    if not claims:
        return {"claims": 0, "evidence": 0, "linked": 0, "skipped": "nema claims u agentResult"}

    izvori_path = os.path.join(kat, "izvori.json")
    known = set()
    if os.path.exists(izvori_path):
        known = {str(x.get("source_id")) for x in json.load(open(izvori_path, encoding="utf-8")).get("izvori", [])}

    # 1. građa iz supporta, po izvoru
    quotes_by_source: dict[str, list[str]] = {}
    for c in claims:
        for s in c.get("support") or []:
            sid, q = str(s.get("citationId") or ""), str(s.get("quote") or "").strip()
            if sid in known and q:
                quotes_by_source.setdefault(sid, []).append(q)
    gradja = os.path.join(kat, "gradja_app")
    os.makedirs(gradja, exist_ok=True)
    evidence_path = os.path.join(kat, "evidence.jsonl")
    for sid, quotes in quotes_by_source.items():
        path = os.path.join(gradja, f"{re.sub(r'[^A-Za-z0-9_-]', '_', sid)}.txt")
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n\n".join(dict.fromkeys(quotes)) + "\n")
        _run([sys.executable, os.path.join(scripts_dir, "evidence_ingest.py"), path, "--source-id", sid,
              "--source-verification", izvori_path, "--out", evidence_path], "evidence_ingest")

    evidence: list[dict[str, Any]] = []
    if os.path.exists(evidence_path):
        evidence = [json.loads(ln) for ln in open(evidence_path, encoding="utf-8") if ln.strip()]

    # 2. + 3. tvrdnje i veze
    claims_path = os.path.join(kat, "claims.jsonl")
    linked = 0
    for c in claims:
        cid = str(c.get("id") or "")
        cmd = [sys.executable, os.path.join(scripts_dir, "claim_ledger.py"), "add", "--project-root", project_root,
               "--claims", claims_path, "--text", str(c["text"])]
        if cid:
            cmd += ["--claim-id", cid]
        chapter = c.get("chapter") or section_hint
        if chapter:
            cmd += ["--chapter", str(chapter)]
        r = _run(cmd, "claim_ledger add")
        claim_id = cid or _claim_id_from(r.stdout, claims_path)
        for s in c.get("support") or []:
            sid, q = str(s.get("citationId") or ""), _norm(str(s.get("quote") or ""))
            if not q:
                continue
            ev = next((e for e in evidence if e.get("source_id") == sid and (q in _norm(e.get("text") or e.get("passage_text") or "") or _norm(e.get("text") or e.get("passage_text") or "") in q)), None)
            if not ev:
                continue
            _run([sys.executable, os.path.join(scripts_dir, "claim_ledger.py"), "link", "--project-root", project_root,
                  "--claims", claims_path, "--evidence", evidence_path, "--claim-id", claim_id,
                  "--evidence-id", str(ev["evidence_id"]), "--relation", "supports"], "claim_ledger link")
            linked += 1
    return {"claims": len(claims), "evidence": len(evidence), "linked": linked}


def _claim_id_from(stdout: str, claims_path: str) -> str:
    m = re.search(r"(clm_[A-Za-z0-9]+)", stdout)
    if m:
        return m.group(1)
    last = ""
    for ln in open(claims_path, encoding="utf-8"):
        if ln.strip():
            last = json.loads(ln).get("claim_id") or last
    return last
