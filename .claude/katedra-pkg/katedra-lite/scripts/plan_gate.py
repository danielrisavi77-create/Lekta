#!/usr/bin/env python3
"""Shared plan-approval gate for plan_state.py and stanje_init.py."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from perspective_map import BIG_WORKS, evaluate_map, load_map

# Tipovi rada koje ovaj skill poznaje; drži se usklađeno sa stanje_init.TIPOVI.
TIPOVI_RADA = ("seminarski", "zavrsni", "diplomski", "esej")

# Status čitanja stanje.json — „nema" i „neispravno" nisu ista stvar.
STANJE_NEMA = "nema"
STANJE_NEISPRAVNO = "neispravno"
STANJE_OK = "ok"
STANJE_NEPOZNAT_TIP = "nepoznat-tip"

# v1.1-advisory patch (Q10): rupa u planu koja se pravi da je sadržaj.
# Crtica, upitnik, „TBD" i „n/a" nisu planirani sadržaj ni planirani izvor.
#
# rep 2 (nedovršen popravak): prva verzija je uspoređivala CIJELU normaliziranu
# ćeliju s popisom doslovnih tokena, pa ju je probijala svaka interpunkcijska
# varijanta — „TBD.", „tbd,", „(TBD)", „todo:", „----", „- - -", „–––", „n / a",
# „?." sve su se brojale kao planiran sadržaj. Zato se odluka više ne donosi
# usporedbom s popisom nego strukturno: iz ćelije se izbaci sve što nije slovo ni
# znamenka, pa se gleda što je ostalo. Ostane li ništa, ćelija je bila samo
# interpunkcija; ostane li jedna od kratica ispod, riječ je o rezerviranom mjestu.
# Važno je jer plan gate na tim ćelijama odlučuje smije li se uopće početi pisati.
PLACEHOLDER_KORIJENI = frozenset({
    "x", "xx", "xxx", "tbd", "tba", "tbc", "todo",
    "na", "np", "nema", "nepoznato",
})

# Zadržano pod starim imenom radi pozivatelja izvan ove datoteke; sadržajno je
# to isti popis, samo sveden na oblik u kojem ga _korijen() vraća.
PLACEHOLDER_TOKENI = PLACEHOLDER_KORIJENI


def _korijen(vrijednost: Any) -> str:
    """Ćelija svedena na mala slova i znamenke — bez interpunkcije, zagrada i razmaka."""
    tekst = str(vrijednost if vrijednost is not None else "").casefold()
    return "".join(z for z in tekst if z.isalnum())


def je_sadrzajno(vrijednost: Any) -> bool:
    """True samo ako je vrijednost stvaran plan, a ne rupa i ne rezervirano mjesto."""
    tekst = re.sub(r"\s+", " ", str(vrijednost if vrijednost is not None else "")).strip()
    if not tekst:
        return False
    korijen = _korijen(tekst)
    if not korijen:
        return False  # sama interpunkcija: „—", „?", „----", „...", „- - -"
    return korijen not in PLACEHOLDER_KORIJENI


def izvori_planirani(izvori: Any) -> bool:
    """True ako je barem jedan planirani izvor stvarno naveden."""
    if isinstance(izvori, (list, tuple)):
        return any(je_sadrzajno(x) for x in izvori)
    return je_sadrzajno(izvori)


def load_plan(kat: str | Path) -> dict[str, Any] | None:
    try:
        with (Path(kat) / "plan.json").open(encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def load_state(kat: str | Path) -> dict[str, Any] | None:
    try:
        with (Path(kat) / "stanje.json").open(encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


# v1.1-advisory patch (D14b): „nema stanja" i „stanje se ne da pročitati" moraju se
# razlikovati. Prije je oboje davalo None, pa je pokvaren stanje.json tiho
# pretvarao diplomski u neograđeni seminarski.
def load_state_status(kat: str | Path) -> tuple[str, dict[str, Any] | None]:
    """Vrati (STANJE_NEMA | STANJE_NEISPRAVNO | STANJE_OK, stanje)."""
    put = Path(kat) / "stanje.json"
    if not put.is_file():
        return STANJE_NEMA, None
    try:
        data = json.loads(put.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return STANJE_NEISPRAVNO, None
    if not isinstance(data, dict):
        return STANJE_NEISPRAVNO, None
    return STANJE_OK, data


def work_type_status(kat: str | Path) -> tuple[str, Any]:
    """Vrati (status, tip). Nepoznat tip je jednako blokirajuć kao nečitljivo stanje."""
    status, state = load_state_status(kat)
    if status != STANJE_OK:
        return status, None
    tip = (state or {}).get("tip")
    if tip in TIPOVI_RADA:
        return STANJE_OK, tip
    return STANJE_NEPOZNAT_TIP, tip


def state_work_type(kat: str | Path) -> str | None:
    state = load_state(kat) or {}
    value = state.get("tip")
    return value if isinstance(value, str) else None


def state_plan_approved(kat: str | Path) -> bool:
    return bool((load_state(kat) or {}).get("plan_odobren"))


def evaluate_plan_gate(plan: dict[str, Any] | None, kat: str | Path,
                       work_type: str | None = None) -> dict[str, Any]:
    stanje_status, tip_iz_stanja = work_type_status(kat)
    izricit_tip = work_type is not None
    work_type = work_type or tip_iz_stanja
    reasons: list[str] = []
    checks: dict[str, Any] = {}

    # v1.1-advisory patch (D14b): nepoznat tip rada zatvara vrata, ne otvara ih.
    if not izricit_tip:
        if stanje_status == STANJE_NEISPRAVNO:
            checks["work_type"] = False
            reasons.append(
                ".katedra/stanje.json postoji, ali nije čitljiv — tip rada nije potvrđen; "
                "dok se ne popravi, radi se kao da je zabrana pisanja na snazi")
        elif stanje_status == STANJE_NEPOZNAT_TIP:
            checks["work_type"] = False
            reasons.append(
                f"stanje.json → tip „{tip_iz_stanja}\" nije jedan od: " + " ".join(TIPOVI_RADA))
        else:
            checks["work_type"] = True

    if not isinstance(plan, dict):
        reasons.append("plan.json ne postoji ili nije čitljiv")
        checks["plan"] = False
        return {"schema_version": 1, "passed": False, "work_type": work_type,
                "checks": checks, "blocking_reasons": reasons}
    checks["plan"] = True

    # v1.1-advisory patch (Q10, rep 2): teza se provjeravala samo s
    # bool(str(...).strip()), dakle blaže nego opisi potpoglavlja i planirani izvori.
    # Zato je teza „—", „?", „n/a" ili „TBD" prolazila gate, `odobri` je izdavao
    # otisak, a `next` otvarao pisanje — iako je „plan nema obranjivu tezu" upravo
    # središnja garancija ovog gatea. Teza sada prolazi isti sadržajni filtar.
    sirova_teza = plan.get("teza", "")
    thesis_ok = je_sadrzajno(sirova_teza)
    checks["thesis"] = thesis_ok
    if not thesis_ok:
        vidljiva = re.sub(r"\s+", " ", str(sirova_teza if sirova_teza is not None else "")).strip()
        if vidljiva:
            reasons.append(
                f"plan nema obranjivu tezu — „{vidljiva[:60]}\" je rezervirano mjesto, "
                "a ne tvrdnja koja se brani")
        else:
            reasons.append("plan nema obranjivu tezu")

    pairs = []
    for chapter in plan.get("poglavlja", []) if isinstance(plan.get("poglavlja"), list) else []:
        if isinstance(chapter, dict):
            for section in chapter.get("potpoglavlja", []) if isinstance(chapter.get("potpoglavlja"), list) else []:
                if isinstance(section, dict):
                    pairs.append(section)
    checks["outline"] = bool(pairs)
    if not pairs:
        reasons.append("plan nema uvezenu strukturu/potpoglavlja")

    missing_content = [str(x.get("broj", "?")) for x in pairs if not je_sadrzajno(x.get("sadrzaj"))]
    missing_sources = [str(x.get("broj", "?")) for x in pairs if not izvori_planirani(x.get("izvori"))]
    checks["content_complete"] = not missing_content
    checks["sources_planned"] = not missing_sources
    if missing_content:
        reasons.append("potpoglavlja bez opisa sadržaja: " + ", ".join(missing_content))
    if missing_sources:
        reasons.append("potpoglavlja bez planiranih izvora: " + ", ".join(missing_sources))

    perspective_report = evaluate_map(load_map(kat), work_type)
    perspective_required = work_type in BIG_WORKS
    perspective_ok = perspective_report["ready"] if perspective_required else True
    checks["perspective_map"] = perspective_ok
    if perspective_required and not perspective_ok:
        reasons.extend("perspective map: " + x for x in perspective_report["blocking_reasons"])

    return {
        "schema_version": 1,
        "passed": not reasons,
        "work_type": work_type,
        "checks": checks,
        "blocking_reasons": reasons,
        "perspective_map": perspective_report,
    }


# v1.1-advisory patch (D14a): odobrenje se veže na sadržaj, ne na goli boolean.
# Status i broj riječi namjerno NISU u otisku — pisanje poglavlja ne smije
# poništiti odobrenje; teza, struktura, opisi sadržaja, izvori i tip rada jesu.
OTISAK_KLJUC = "odobreno_otisak"


def approval_payload(plan: dict[str, Any] | None, work_type: Any) -> dict[str, Any]:
    """Kanonski dio plana na koji se odobrenje odnosi (+ otisak projekta: tip rada)."""
    poglavlja: list[dict[str, Any]] = []
    sirova = plan.get("poglavlja") if isinstance(plan, dict) else None
    for chapter in sirova if isinstance(sirova, list) else []:
        if not isinstance(chapter, dict):
            continue
        pot: list[dict[str, Any]] = []
        sirova_pot = chapter.get("potpoglavlja")
        for section in sirova_pot if isinstance(sirova_pot, list) else []:
            if not isinstance(section, dict):
                continue
            izvori = section.get("izvori")
            pot.append({
                "broj": str(section.get("broj", "")),
                "naslov": str(section.get("naslov", "")),
                "stranice": section.get("stranice"),
                "sadrzaj": str(section.get("sadrzaj", "")),
                "izvori": [str(x) for x in izvori] if isinstance(izvori, list) else str(izvori or ""),
            })
        poglavlja.append({
            "broj": str(chapter.get("broj", "")),
            "naslov": str(chapter.get("naslov", "")),
            "potpoglavlja": pot,
        })
    return {
        "teza": str((plan or {}).get("teza", "")),
        "tip": work_type,
        "poglavlja": poglavlja,
    }


def approval_hash(plan: dict[str, Any] | None, kat: str | Path | None = None,
                  work_type: Any = None) -> str:
    """Otisak odobrenog sadržaja; mijenja se čim se promijeni ono što je gate provjerio."""
    if work_type is None and kat is not None:
        work_type = work_type_status(kat)[1]
    sirovo = json.dumps(approval_payload(plan, work_type), ensure_ascii=False,
                        sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(sirovo.encode("utf-8")).hexdigest()


def approval_is_valid(kat: str | Path) -> tuple[bool, dict[str, Any]]:
    plan = load_plan(kat)
    report = evaluate_plan_gate(plan, kat)
    approved = bool(plan and plan.get("odobren"))
    if approved:
        ocekivano = (plan or {}).get(OTISAK_KLJUC)
        stvarno = approval_hash(plan, kat, work_type=report.get("work_type"))
        vezano = isinstance(ocekivano, str) and ocekivano == stvarno
        report["checks"]["approval_binding"] = vezano
        if not vezano:
            approved = False
            report["passed"] = False
            report["blocking_reasons"].append(
                "odobren=true, ali se odobrenje ne odnosi na sadašnji plan "
                "(teza, struktura, opisi, izvori ili tip rada promijenjeni su nakon odobrenja); "
                "ponovi plan_state.py odobri")
    return bool(report["passed"] and approved), report
