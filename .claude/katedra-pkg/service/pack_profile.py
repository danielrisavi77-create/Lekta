"""Lektin katedra-pack profil (DoctrineProfileHint iz appa) -> katedra-lite resolved_profile.json.

Ustav §3: Katedra nema vlastitu bazu pravila. Zato se profil NE čita iz
katedra-lite/references/fakulteti nego se izvodi iz Lektine projekcije, i nosi
`status: nepotvrdeno` s izvorom "katedra-pack", da nijedan alat ne bi mogao tvrditi
usklađenost na temelju ovog profila. Format (font, margine) namjerno nije preuzet:
skripte forme su u servisu isključene (vidi app.py: ISKLJUCENI_KORACI).
"""
from __future__ import annotations

from typing import Any

CITATION_MAP = {
    "fpzg": "autor-godina", "autor-godina": "autor-godina", "apa": "apa", "apa-hr": "apa-hr",
    "efzg": "apa-hr", "harvard": "harvard", "ieee": "ieee", "vancouver": "vancouver",
    "legal-footnote": "legal-footnote", "legal": "legal-footnote",
}


def resolved_profile_from_hint(hint: dict[str, Any] | None, unit_id: str, tip: str) -> dict[str, Any]:
    hint = hint or {}
    stil = CITATION_MAP.get(str(hint.get("citation") or "").lower().strip(), "autor-godina")
    opseg: dict[str, Any] = {}
    if hint.get("wordMin") or hint.get("wordMax"):
        opseg["rijeci"] = [hint.get("wordMin") or 0, hint.get("wordMax") or 0]
    if hint.get("pageMin") or hint.get("pageMax"):
        opseg["stranice"] = [hint.get("pageMin") or 0, hint.get("pageMax") or 0]
    if hint.get("minReferences"):
        opseg["izvori_min"] = hint["minReferences"]
    return {
        "slug": unit_id.replace("/", "-").lower() or "nepoznato",
        "naziv": hint.get("label") or unit_id,
        "status": "nepotvrdeno",
        "izvor": {
            "dokument": "Lekta katedra-pack (informativna projekcija pravila)",
            "napomena_o_dohvatu": f"pack status: {hint.get('status') or 'nepoznat'}; forma se u servisu ne provjerava",
        },
        "citiranje": {"stil": stil},
        "format": {"lice": "trece-jednina"},
        "struktura": {
            "opseg": {tip: opseg} if opseg else {},
            "obvezni_dijelovi": list(hint.get("sections") or []),
        },
        "metodologija": {"type": "generic"},
        "provenance": {"default": "katedra-pack"},
        "napomene": list(hint.get("manualChecks") or [])[:10],
    }
