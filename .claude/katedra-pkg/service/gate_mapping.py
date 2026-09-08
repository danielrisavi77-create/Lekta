"""gate.json (katedra-lite gate.py) -> VerificationResultV1 (Katedra app lib/agents/contracts.ts).

Pravila preslikavanja (prolaz 3, §2):
  sažetak.blokira prazan i nepokrenuto prazan          -> verified
  blokirajući korak u stanju nalaz, attempt < max      -> needs_revision
  blokirajući korak u stanju nalaz, attempt >= max     -> blocked
  blokirajući korak u stanju pukao                     -> failed
  preskočeno (nema ulaza) blokirajuće                  -> blocked s issue code gate_step_skipped
Nikad tiho: svaki korak koji nije ok ide u issues, i savjetni.
Tekst rada u issues ne ide: message je naziv koraka + prvi redak izlaza skraćen na 200 znakova
i očišćen od redaka koji izgledaju kao citat iz rada (duži od 120 znakova).
"""
from __future__ import annotations

from typing import Any

MAX_ATTEMPTS = 3


def _kratko(izlaz: Any, limit: int = 240) -> str:
    """Do tri retka koji nose nalaz (❌ ✗ ⚠ →), inače prvi smisleni redak. Bez dugih redaka (citat iz rada)."""
    if not izlaz:
        return ""
    text = izlaz if isinstance(izlaz, str) else str(izlaz)
    lines = [ln.strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln and len(ln) <= 120 and not ln.startswith(("{", "[")) and any(c.isalpha() for c in ln)]
    nalazi = [ln for ln in lines if ln[:2].strip() in ("❌", "✗", "⚠", "⚠️", "→", "💥")]
    picked = nalazi[:3] if nalazi else lines[:1]
    return " · ".join(picked)[:limit]


def map_gate(gate: dict[str, Any], attempt: int = 1) -> dict[str, Any]:
    koraci = gate.get("koraci") or gate.get("rezultati") or []
    saz = gate.get("sazetak") or {}
    issues: list[dict[str, Any]] = []
    for k in koraci:
        st = k.get("stanje")
        if st == "ok":
            continue
        code = {"nalaz": "gate_finding", "pukao": "gate_step_failed", "preskoceno": "gate_step_skipped",
                "neprimjenjivo": "gate_step_not_applicable", "planirano": "gate_step_planned",
                "iskljuceno": "gate_step_excluded"}.get(st, "gate_finding")
        allowed = k.get("korak") in (saz.get("preskok_dopusten") or {})
        issues.append({
            "code": code,
            "step": k.get("korak"),
            "message": f"{k.get('naziv')}: {_kratko(k.get('izlaz') or k.get('razlog') or k.get('greska'))}".strip(": "),
            "blocking": bool(k.get("blokira")) and st != "iskljuceno" and not (st == "preskoceno" and allowed),
        })
    blocking_findings = [k for k in koraci if k.get("blokira") and k.get("stanje") == "nalaz"]
    blocking_failed = [k for k in koraci if k.get("blokira") and k.get("stanje") == "pukao"]
    blocking_skipped = [k for k in koraci if k.get("blokira") and k.get("stanje") == "preskoceno"
                        and k.get("korak") not in (saz.get("preskok_dopusten") or {})]
    if blocking_failed:
        status = "failed"
    elif blocking_skipped:
        status = "blocked"
    elif blocking_findings:
        status = "needs_revision" if attempt < MAX_ATTEMPTS else "blocked"
    else:
        status = "verified"
    return {
        "status": status,
        "issues": issues,
        "gate": {
            "faza": gate.get("faza"),
            "prolaz": status == "verified",
            "koraci": [{"korak": k.get("korak"), "naziv": k.get("naziv"), "stanje": k.get("stanje"), "blokira": bool(k.get("blokira"))} for k in koraci],
            "sazetak": {kk: saz.get(kk) for kk in ("ok", "nalaz", "preskoceno", "pukao", "blokira", "nepokrenuto", "iskljuceno")},
        },
    }
