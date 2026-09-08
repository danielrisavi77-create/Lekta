#!/usr/bin/env python3
"""Versioned state helpers for ``.katedra/zamjerke.json``."""
from __future__ import annotations

import copy
import datetime as dt
import re

CURRENT_FEEDBACK_VERSION = 2
TIPOVI = ("sadrzaj", "struktura", "citiranje", "stil", "forma")


def _now() -> str:
    return dt.datetime.now().replace(microsecond=0).isoformat()


def _num(s):
    m = re.search(r"\d+", str(s or ""))
    return int(m.group()) if m else 0


def _key(z):
    return re.sub(r"\s+", " ", (z.get("tekst") or "")).strip().lower()


def _naslov(z):
    """Naslov (poglavlje) iz `mjesto` — dio prije „ · uz „citat"", bez navoda."""
    mjesto = re.sub(r"\s+", " ", (z.get("mjesto") or "")).strip()
    return mjesto.split(" · ")[0].strip().lower()


def _izvor(z):
    """Stabilan identitet zamjerke iz .docx-a (Word id komentara / izmjene)."""
    v = z.get("izvor_id")
    v = str(v).strip() if v is not None else ""
    return v or None


def migrate_feedback(data: dict | None) -> tuple[dict | None, bool]:
    if data is None:
        return None, False
    if not isinstance(data, dict) or not isinstance(data.get("zamjerke"), list):
        raise ValueError("zamjerke.json mora biti objekt s listom zamjerke")
    version = int(data.get("verzija", 1))
    if version > CURRENT_FEEDBACK_VERSION:
        raise ValueError(f"zamjerke.json je iz novije verzije ({version})")
    if version == CURRENT_FEEDBACK_VERSION:
        return data, False
    if version != 1:
        raise ValueError(f"nema migracije zamjerke v{version} → v{CURRENT_FEEDBACK_VERSION}")
    out = copy.deepcopy(data)
    out["verzija"] = 2
    out["revision"] = max(1, int(out.get("revision") or 1))
    out["source_artifact"] = {
        "path": out.get("izvor") or "",
        "artifact_id": None,
        "version_id": None,
        "sha256": None,
    }
    out["history"] = [{
        "revision": out["revision"], "event": "migrated", "from_version": 1,
        "to_version": 2, "at": _now(),
    }]
    for z in out["zamjerke"]:
        z.setdefault("introduced_revision", 1)
        z.setdefault("history", [{"revision": 1, "event": "migrated", "at": _now()}])
    return out, True


def merge_feedback(old: dict | None, new_items: list[dict], source_meta: dict) -> tuple[dict, dict]:
    old, _ = migrate_feedback(old)
    existing = old.get("zamjerke", []) if old else []
    # v1.1-ispravak D1: identitet zamjerke je izvor_id (Word id komentara ili
    # praćene izmjene), a NE tekst — mentor dva puta napiše „Izvor?" i to su
    # dvije različite zamjerke, ne jedna.
    by_izvor = {}
    for z in existing:
        iz = _izvor(z)
        if iz and iz not in by_izvor:
            by_izvor[iz] = z
    # Tekst je samo rezerva, i to isključivo za zapise od prije uvođenja
    # izvor_id-a; jednaki tekstovi se troše redom (pozicijski), da jedan zapis
    # ne pojede sve ostale s istim tekstom.
    by_text = {}
    for z in existing:
        if _izvor(z) is None:
            by_text.setdefault(_key(z), []).append(z)

    next_id = max([_num(z.get("id")) for z in existing] or [0]) + 1
    revision = (int(old.get("revision", 0)) + 1) if old else 1

    out, new_count, merged_count = [], 0, 0
    spojeni, zauzeti = set(), set()

    def _slobodan_id():
        nonlocal next_id
        while f"z{next_id}" in zauzeti:
            next_id += 1
        oznaka = f"z{next_id}"
        next_id += 1
        return oznaka

    for n in new_items:
        z = {k2: v for k2, v in n.items() if not k2.startswith("_")}
        iz = _izvor(n)
        prior = None
        if iz is not None:
            kandidat = by_izvor.get(iz)
            if kandidat is not None and id(kandidat) not in spojeni:
                prior = kandidat
        if prior is None:
            # v1.1-ispravak D1/2: rezervno spajanje po tekstu traži i isti naslov.
            # Bez toga je stari riješeni zapis („Izvor?" u 1. Uvodu) preuzimao
            # identitet posve nove mentorove zamjerke istoga teksta u drugom
            # poglavlju i ona je odmah bila „riješena" — a nitko je nije riješio.
            for kandidat in by_text.get(_key(n), []):
                if id(kandidat) not in spojeni and _naslov(kandidat) == _naslov(n):
                    prior = kandidat
                    break
        if prior is not None:
            spojeni.add(id(prior))
            oznaka = str(prior.get("id") or "")
            z["id"] = oznaka if oznaka and oznaka not in zauzeti else _slobodan_id()
            z["status"] = prior.get("status", "otvoreno")
            z["rijeseno_gdje"] = prior.get("rijeseno_gdje")
            z["introduced_revision"] = prior.get("introduced_revision", 1)
            z["history"] = copy.deepcopy(prior.get("history") or [])
            # v1.1-ispravak D1/2: isti izvor_id, promijenjen tekst = mentor je
            # zamjerku prepisao (ili je Word reciklirao id obrisanog komentara).
            # Zatvorena zamjerka se tada ponovno otvara — inače bi nova, nikad
            # obrađena primjedba naslijedila status „rijeseno".
            if z["status"] == "rijeseno" and _key(prior) != _key(n):
                z["status"] = "otvoreno"
                z["rijeseno_gdje"] = None
                z["history"].append({
                    "revision": revision, "event": "reopened_source_text_changed",
                    "at": _now(), "prijasnji_tekst": prior.get("tekst"),
                    "prijasnje_rijeseno_gdje": prior.get("rijeseno_gdje"),
                })
            if prior.get("tip") in TIPOVI and prior.get("tip") != z.get("tip"):
                z["tip"] = prior["tip"]
            merged_count += 1
        else:
            z["id"] = _slobodan_id()
            z["introduced_revision"] = revision
            z["history"] = [{
                "revision": revision, "event": "imported", "at": _now(),
                "source_version": source_meta.get("version_id"),
            }]
            new_count += 1
        zauzeti.add(z["id"])
        out.append(z)

    # zamjerke kojih više nema u izvoru ostaju zapisane (nisu tiho izbrisane)
    stale = []
    for z in existing:
        if id(z) in spojeni:
            continue
        kopija = copy.deepcopy(z)
        oznaka = str(kopija.get("id") or "")
        if not oznaka or oznaka in zauzeti:
            oznaka = _slobodan_id()
            kopija["id"] = oznaka
        zauzeti.add(oznaka)
        stale.append(kopija)
    out.extend(stale)

    # v1.1-ispravak D1: dvostruki id znači da --zatvori više ne može pogoditi
    # pravu zamjerku — zato ovdje pukni umjesto da se zapiše neispravno stanje.
    ids = [str(z.get("id")) for z in out]
    if len(set(ids)) != len(ids):
        dupli = sorted({i for i in ids if ids.count(i) > 1})
        raise ValueError(
            "id zamjerke nije jedinstven: " + ", ".join(dupli) + ". "
            "Što napraviti: preimenuj zamjerke.json i izvuci zamjerke ponovno "
            "iz .docx-a, pa ručno prepiši zatvorene zamjerke.")
    history = copy.deepcopy(old.get("history") or []) if old else []
    history.append({
        "revision": revision, "event": "source_imported", "at": _now(),
        "source_version": source_meta.get("version_id"), "sha256": source_meta.get("sha256"),
    })
    doc = {
        "verzija": 2,
        "revision": revision,
        "izvor": source_meta.get("path") or "",
        "source_artifact": source_meta,
        "history": history,
        "zamjerke": sorted(out, key=lambda z: (z.get("status") != "otvoreno", _num(z.get("id")))),
    }
    return doc, {"novih": new_count, "spojenih": merged_count, "zaostalih": len(stale)}


def resolve_feedback(data: dict, feedback_id: str, where: str) -> tuple[dict, bool]:
    data, _ = migrate_feedback(data)
    # v1.1-ispravak D1/2: shema `uniqueItems` hvata samo doslovne duplikate, pa
    # jedinstvenost `id`-a mora provjeriti kod — i to na SVAKOM putu zapisa, ne
    # samo pri spajanju. Zatvaranje pogađa prvi zapis s tim id-om, pa bi drugi
    # ostao neriješen, a student bi mislio da je zatvorio oba.
    ids = [str(z.get("id")) for z in data["zamjerke"]]
    if len(set(ids)) != len(ids):
        dupli = sorted({i for i in ids if ids.count(i) > 1})
        raise ValueError(
            "id zamjerke nije jedinstven: " + ", ".join(dupli) + ". "
            "Zatvaranje bi pogodilo samo prvu zamjerku s tim id-om. "
            "Što napraviti: izvuci zamjerke ponovno iz .docx-a "
            "(extract_comments.py rad.docx --out …), pa zatvori po novim id-evima.")
    out = copy.deepcopy(data)
    revision = int(out.get("revision", 0)) + 1
    found = False
    for z in out["zamjerke"]:
        if str(z.get("id")) == str(feedback_id):
            z["status"] = "rijeseno"
            z["rijeseno_gdje"] = where
            hist = z.setdefault("history", [])
            hist.append({"revision": revision, "event": "resolved", "at": _now(), "where": where})
            found = True
            break
    if found:
        out["revision"] = revision
        out.setdefault("history", []).append({
            "revision": revision, "event": "feedback_resolved", "at": _now(), "feedback_id": feedback_id,
        })
    return out, found
