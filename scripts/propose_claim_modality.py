"""
PRIJEDLOG modaliteta i opsega za bodovana pravila, deterministicki, bez modela.

    python scripts/propose_claim_modality.py [--json putanja]

Zasto postoji: FER pilot je oborio 4 od 5 tvrdnji, i nijedna nije pala na krivom prijepisu nego na
TUMACENJU - preporuka citana kao obveza, opis predloska kao propis, raspon kao jedna vrijednost.
Opovrgavajuci prolaz je zatim nasao da 12 od 20 tvrdnji ima krivo pripisan OPSEG. Ni modalitet ni
opseg dosad nisu bili zapisani nigdje, pa se ta dva kvara nisu mogla ni prijaviti ni sprijeciti.

SKRIPT NE ODLUCUJE. Predlaze i oznacava dvojbeno; upisuje covjek. Isti ugovor kao
`extract_rule_candidates.py` i `approve-profile.mjs`.

Jedinica rada je (izvor, citat, os), ne pravilo: ista recenica citira se za vise osi i vise profila,
pa se 1934 bodovana pravila svode na oko 1310 jedinica. Modalitet i opseg su svojstvo OSI unutar
recenice, ne recenice u cjelini: izmjereno na `fizri`, gdje ista recenica nosi `mora` za format
stranice i `preporuca se` za broj stranica.
"""

from __future__ import annotations

import glob
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def fold(text: str) -> str:
    """Bez dijakritike i bez velikih slova: profilni citati su redovito prosli kroz OCR."""
    decomposed = unicodedata.normalize("NFD", text or "")
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return stripped.lower().replace("đ", "d").replace("Đ", "d")


# --- MODALITET ---------------------------------------------------------------------------------
#
# Sest razina, i to je jedna vise nego sto se obicno trazi. Razlog je izmjeren, ne teorijski: FER
# dokument ima TRI razine (`mora`/`ne smije` : `treba` : `preporuceni`/`neka bude`) i nijedna od pet
# FER tvrdnji nije bila u najjacoj. Kad bi `treba` upalo u `obligation`, tocno taj nalaz bi nestao.
# Zato `directive` stoji zasebno: obvezujuca formulacija koja NIJE najjaca.
MODALITY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("prohibition", re.compile(r"\b(ne\s+smij\w*|zabranj\w*|nije\s+dopust\w*|ne\s+koristi\s+se)\b")),
    ("obligation", re.compile(r"\b(mora\w*|duzn\w*|obvez\w*|nuzno\s+je|obavezn\w*)\b")),
    ("condition", re.compile(r"\b(ukoliko|ako\s+se|u\s+slucaju|ovisno\s+o|po\s+dogovoru)\b")),
    ("recommendation", re.compile(r"\b(preporu\w*|pozeljno|u\s+pravilu|okvirno|obicno|neka\s+bude|primjerice|npr)\b")),
    ("permission", re.compile(r"\b(moze\w*|smije\w*|dopusteno\s+je)\b")),
    ("directive", re.compile(r"\b(treba\w*|potrebno\s+je|pise\s+se|pisu\s+se|koristi\s+se|iznosi|opremljen\w*)\b")),
]

# --- OPSEG -------------------------------------------------------------------------------------
#
# `naslovnic` MORA stajati prije `naslov`, inace naslovnica ispadne naslov. To nije sitnica: sva
# cetiri fakulteta iz opovrgavajuceg prolaza imaju naslovnicu kao tihu drugu vrijednost za font-size
# (efzg 14/16, unidu 14/18, ffos 14/16, adu 14/16), pa bi zamjena ta dva opsega upisala vrijednost
# naslovnice kao pravilo naslova u tijelu rada.
SCOPE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("title-page", re.compile(r"\b(naslovnic\w*|naslovn\w+\s+stranic\w*|koric\w*|omot\w*)\b")),
    ("footnote", re.compile(r"\b(biljesk\w*|fusnot\w*|podnozj\w*|podnozn\w*)\b")),
    ("bibliography", re.compile(r"\b(literatur\w*|bibliograf\w*|popis\s+izvor\w*)\b")),
    ("table", re.compile(r"\b(tablic\w*|tabel\w*)\b")),
    ("caption", re.compile(r"\b(natpis\w*|opis\s+slik\w*|potpis\s+slik\w*|legend\w*)\b")),
    ("code", re.compile(r"\b(programsk\w*\s+kod\w*|isjeck\w*\s+kod\w*|kod\s+programa)\b")),
    ("heading", re.compile(r"\b(naslov\w*|podnaslov\w*|poglavlj\w*)\b")),
    ("body", re.compile(r"\b(glavn\w+\s+tekst\w*|tijel\w+\s+rada|osnovn\w+\s+tekst\w*|tekst\s+rada)\b")),
]

# Os -> opseg koji ta os po svojoj naravi mjeri. Sluzi da se prepozna kad citat govori o DRUGOM
# dijelu rada nego sto os boduje: to je razred kvara koji je opovrgavajuci prolaz nasao 12 puta.
AXIS_NATURAL_SCOPE: dict[str, str] = {
    "font": "body",
    "font-size": "body",
    "line-spacing": "body",
    "justify": "body",
    "margins": "whole",
    "paper-size": "whole",
    "toc": "whole",
    "page-numbers": "whole",
    "page-count": "whole",
    "word-count": "whole",
    "required-sections": "whole",
    "footnote-font": "footnote",
    "footnote-size": "footnote",
    "footnote-spacing": "footnote",
    "heading-rules": "heading",
    "reference-count": "bibliography",
    "citation-style": "whole",
}

SENTENCE_SPLIT = re.compile(r"(?<=[.!?;])\s+")
NUM = re.compile(r"\d+(?:[.,]\d+)?")


def value_atoms(value) -> list[str]:
    """Brojevi i nazivi koje vrijednost pravila nosi, u obliku u kojem se traze u recenici."""
    out: list[str] = []
    if isinstance(value, dict):
        for v in value.values():
            out.extend(value_atoms(v))
    elif isinstance(value, list):
        for v in value:
            out.extend(value_atoms(v))
    elif isinstance(value, bool):
        pass
    elif value is not None:
        text = str(value)
        out.extend({text, text.replace(".", ","), text.replace(",", ".")})
    return [a for a in out if a]


def bearing_clauses(quote: str, value) -> list[str]:
    """Recenice citata koje NOSE vrijednost pravila.

    Bez ovog suzenja modalitet se cita iz krive recenice. Izmjereno u prethodnom krugu na `fizri`:
    "...MORA biti otisnut na papiru formata A4 ... PREPORUCA SE da diplomski rad ima najvise 100
    stranica. Glavni tekst MORA imati velicinu slova 12." Ublazavanje ondje veze SAMO broj stranica,
    a format i velicina nose `mora`. Ista pogreska u obrnutom smjeru dala je 35 laznih od 43 nalaza.
    """
    sentences = [s for s in SENTENCE_SPLIT.split(quote) if s.strip()]
    if not sentences:
        return []
    atoms = [fold(a) for a in value_atoms(value)]
    if not atoms:
        return sentences  # boolean pravilo: nema broja po kojem bi se recenica prepoznala
    bearing = [s for s in sentences if any(a in fold(s) for a in atoms)]
    return bearing or sentences


# Predlozak, ne propisna recenica. `mathos-predlozak-zavrsni-2026` citira LaTeX preambulu
# (`\LoadClass[a4paper...]`, `\usepackage[fontsize=12pt]`), iz koje se vrijednost doista moze
# ocitati, ali modalitet ne postoji: predlozak nista ne propisuje, on je vec postavljen. FER pilot je
# pao tocno na tom razlikovanju (`line-spacing = 1.2` bio je OPIS predloska, ne propis).
TEMPLATE_DUMP = re.compile(r"\\(loadclass|usepackage|documentclass|geometry|setlength)")


def propose_modality(quote: str, value) -> tuple[str | None, list[str]]:
    """Predlozen modalitet + svi biljezi nadjeni u recenicama koje nose vrijednost."""
    found: list[str] = []
    clauses = bearing_clauses(quote, value)
    for sentence in clauses:
        low = fold(sentence)
        for name, pattern in MODALITY_PATTERNS:
            if pattern.search(low) and name not in found:
                found.append(name)
    if not found:
        # GOLI INDIKATIV I NATUKNICNI POPIS. Izmjereno: 683 od 1310 jedinica nema nijedan modalni
        # biljeg, a citanje uzorka pokazuje da su to dva oblika iste stvari: stavka specifikacije
        # ("Font: Times New Roman", "Prored: 1,5 redak") i ravna izjava ("Radovi se pisu na papiru
        # formata A4", "Font slova u radu je Times New Roman"). Oboje IZRICE vrijednost bez
        # ublazavanja, pa je `directive`, ne `none` i ne `recommendation`.
        #
        # Zasto `directive`, a ne `obligation`: goli indikativ nije `mora`. Pogresno ojacanje boduje
        # rad po necemu sto izvor ne trazi, pa se u dvojbi bira slabija razina.
        atoms = [fold(a) for a in value_atoms(value)]
        localised = not atoms or any(any(a in fold(c) for a in atoms) for c in clauses)
        if localised:
            return "directive", ["bare-indicative"]
        return None, []
    # Redoslijed u MODALITY_PATTERNS je redoslijed jacine, pa prvi pogodak nije nuzno pravi: kad ih
    # ima vise, prijedlog je najslabiji nadjeni. Slabiji modalitet je sigurniji smjer, jer pogresno
    # ojacanje boduje rad po necemu sto izvor ne trazi.
    order = [name for name, _ in MODALITY_PATTERNS]
    weakest = max(found, key=lambda n: order.index(n))
    return weakest, found


def propose_scope(quote: str, value, check_id: str) -> tuple[str, list[str]]:
    """Predlozen opseg + svi dijelovi rada koje recenica imenuje."""
    named: list[str] = []
    for sentence in bearing_clauses(quote, value):
        low = fold(sentence)
        for name, pattern in SCOPE_PATTERNS:
            if pattern.search(low) and name not in named:
                named.append(name)
    natural = AXIS_NATURAL_SCOPE.get(check_id, "whole")
    if not named:
        return natural, []
    if natural in named:
        return natural, named
    if len(named) == 1:
        return named[0], named
    return natural, named


# IZVEDENI `scored`, isti uvjet kao `isRuleScored` u src/verification/verification-gate.ts.
# Pohranjena zastavica `scored` NIJE mjerodavna: 275 pravila zadovoljava izvedeni uvjet (dakle veze
# motor kroz computePublishedRules, demotiju i coverage matricu) a nema `scored: true` u podacima.
# Dok je izbor isao po zastavici, tih 275 pravila NIKAD nije ni dobilo prijedlog modaliteta, pa su
# trajno sjedila u zaostatku iako je dio njih strojno razrjesiv. Isti kvar je adversarijalni prolaz
# nasao u `claim-fields.test.ts` i `verify-source-hashes.mjs`; ovo je treca njegova pojava.
OFFICIAL_AUTHORITIES = {"binding", "program-page", "general"}


def rule_is_scored(entry: dict) -> bool:
    return (
        entry.get("status") == "verified"
        and entry.get("authority") in OFFICIAL_AUTHORITIES
        and entry.get("sourceId") is not None
        and entry.get("sourcePage") is not None
        and entry.get("quote") is not None
    )


def collect_scored() -> list[dict]:
    """Sva pravila koja VEZU MOTOR (izvedeni scored), s profilom uz svako."""
    rows: list[dict] = []
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "profiles", "*", "drafts", "*.json"))):
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception:
            continue
        groups = data["profiles"].items() if "profiles" in data else [(data.get("profileId"), data.get("entries", []))]
        for profile_id, entries in groups:
            for entry in entries or []:
                if rule_is_scored(entry):
                    rows.append({"profileId": profile_id, "entry": entry})
    return rows


def main() -> None:
    out_flag = sys.argv.index("--json") if "--json" in sys.argv else -1
    out_path = (
        sys.argv[out_flag + 1]
        if out_flag > -1
        else os.path.join(ROOT, "docs", "generated", "claim-modality-proposals.json")
    )

    rows = collect_scored()
    units: dict[tuple, dict] = {}
    for row in rows:
        entry = row["entry"]
        key = (entry.get("sourceId"), (entry.get("quote") or "").strip(), entry.get("checkId"))
        unit = units.setdefault(
            key,
            {
                "sourceId": entry.get("sourceId"),
                "checkId": entry.get("checkId"),
                "quote": entry.get("quote") or "",
                "value": entry.get("value"),
                "sourcePage": entry.get("sourcePage"),
                "ruleIds": [],
                "profileIds": [],
                "writtenSources": [],
            },
        )
        unit["ruleIds"].append(entry.get("ruleId"))
        unit["profileIds"].append(row["profileId"])
        # Sto je VEC upisano. Bez ovoga popis i dalje trazi covjeka za jedinicu koja je rijesena, pa
        # "382 ceka" znaci nesto drugo nego sto pise. Zapis ostaje u JSON-u (potpun trag), a iz
        # worklista ispada, jer worklist je POPIS POSLA, ne arhiva.
        if entry.get("modality"):
            unit["writtenSources"].append(entry.get("modalitySource") or "bez izvora")

    proposals = []
    stats = Counter()
    for unit in units.values():
        modality, marks = propose_modality(unit["quote"], unit["value"])
        scope, named = propose_scope(unit["quote"], unit["value"], unit["checkId"] or "")
        natural = AXIS_NATURAL_SCOPE.get(unit["checkId"] or "", "whole")

        reasons: list[str] = []
        # UBLAZAVANJE se NIKAD ne pripisuje strojno. Izmjereno na uzorku: `ferit-*` citat glasi
        # "Rad se pise na racunalu (preporuca se MS Word) uz prored od 1,5" - ublazavanje veze
        # PROGRAM, ne prored; `unizd-povijest` "na papiru formata A-4; preporuca se uporaba pisma
        # velicine 12" veze velicinu, ne format; `vhzk` "prored 1,5 (preporuceni oblici fonta su
        # Arial...)" veze font. To je isti razred na kojem je revizija vec izmjerila 35 laznih od 43
        # nalaza, i mehanika dalje ne ide: razlika izmedju "preporuca se X" i "preporuca se Y u istoj
        # recenici" je citanje, ne uzorak. Zato svaka pojava ublazavanja ide covjeku, u oba smjera:
        # ne upisuje se ni oslabljen modalitet (mogao bi demotirati valjano pravilo) ni ojacan.
        soft = [m for m in marks if m in ("recommendation", "permission", "condition")]
        if soft:
            reasons.append(f"ublazavanje u citatu ({', '.join(soft)}): pripisivanje osi je citanje, ne uzorak")
        if TEMPLATE_DUMP.search(fold(unit["quote"])):
            reasons.append("citat je PREDLOZAK (LaTeX preambula), ne propisna recenica: modalitet ne postoji")
        if modality is None:
            reasons.append("nema modalnog biljega, a vrijednost se ne moze smjestiti ni u jednu recenicu citata")
        elif marks == ["bare-indicative"]:
            pass  # goli indikativ je jednoznacan; razlog za covjeka mora doci od opsega ili predloska
        elif len(marks) > 1:
            reasons.append(f"vise modalnih biljega u istoj recenici: {', '.join(marks)}")
        if len(named) > 1:
            reasons.append(f"recenica imenuje vise dijelova rada: {', '.join(named)}")
        elif named and named[0] != natural:
            reasons.append(f"recenica imenuje '{named[0]}', a os po naravi mjeri '{natural}'")

        proposals.append(
            {
                **{k: unit[k] for k in ("sourceId", "checkId", "sourcePage", "value")},
                "quote": unit["quote"][:400],
                "ruleCount": len(unit["ruleIds"]),
                "profileIds": sorted(set(unit["profileIds"])),
                "ruleIds": sorted(unit["ruleIds"]),
                "proposedModality": modality,
                "proposedScope": scope,
                "modalityMarks": marks,
                "namedScopes": named,
                "writtenModality": {
                    "count": len(unit["writtenSources"]),
                    "sources": sorted(set(unit["writtenSources"])),
                },
                "resolved": len(unit["writtenSources"]) == len(unit["ruleIds"]),
                "needsHuman": bool(reasons),
                "reasons": reasons,
            }
        )
        stats["units"] += 1
        stats["needsHuman" if reasons else "unambiguous"] += 1
        stats[f"modality:{modality or 'none'}"] += 1
        stats[f"scope:{scope}"] += 1

    proposals.sort(key=lambda p: (p["sourceId"] or "", p["checkId"] or "", p["quote"]))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(
            {"schemaVersion": 1, "rules": len(rows), "units": len(units), "proposals": proposals},
            fh,
            ensure_ascii=False,
            indent=2,
        )
        fh.write("\n")

    # Radni popis za covjeka: grupiran po RAZLOGU, ne po profilu. Razlog je ono sto odredjuje kako se
    # slucaj cita, pa se citanjem jednog razreda rijesi cijela skupina odjednom. Isti postupak koji se
    # vec pokazao ispravnim (68 pravila = 53 jedinice, 43 = 8 jedinica).
    worklist = os.path.join(ROOT, "data", "verification", "modality-worklist.md")
    by_reason: dict[str, list[dict]] = {}
    resolved = 0
    for proposal in proposals:
        if not proposal["needsHuman"]:
            continue
        # Rijesena jedinica (SVA njezina pravila vec nose modalitet) ispada iz popisa posla. Zapis
        # ostaje u JSON-u: ovo je popis onoga sto CEKA, a ne arhiva onoga sto je razlog nekad bio.
        if proposal["resolved"]:
            resolved += 1
            continue
        key = proposal["reasons"][0].split(":")[0].split("(")[0].strip()
        by_reason.setdefault(key, []).append(proposal)
    lines = [
        "# Modalitet i opseg: sto ceka covjeka",
        "",
        "GENERIRANO (`npm run claim-modality`). Ne uredjuj rucno.",
        "",
        "Upisuje se u `ruleEntry`. Tri razine izvora: `mechanical` (strojni uzorak), `agent-read`",
        "(procitan citat, `npm run claim-scope`) i `human` (ljudski potpis). UBLAZEN modalitet",
        "(recommendation/permission/condition) smije upisati SAMO `human`, pa je sve ublazeno ovdje.",
        "",
        f"Jedinica: {sum(len(v) for v in by_reason.values())}. Grupirano po razlogu, jer razlog odredjuje kako se slucaj cita.",
        f"Jos {resolved} jedinica imalo je razlog za covjeka, ali su im sva pravila u medjuvremenu",
        "upisana, pa ne cekaju nista; ostaju u `docs/generated/claim-modality-proposals.json`.",
        "",
    ]
    for reason, group in sorted(by_reason.items(), key=lambda kv: -len(kv[1])):
        lines.append(f"## {reason} ({len(group)})")
        lines.append("")
        for proposal in group[:200]:
            lines.append(
                f"- **{proposal['checkId']}** `{proposal['sourceId']}` "
                f"(prijedlog: {proposal['proposedModality'] or 'nema'} / {proposal['proposedScope']}, "
                f"{proposal['ruleCount']} pravila)"
            )
            lines.append(f"  - citat: \"{proposal['quote'][:220]}\"")
            lines.append(f"  - razlozi: {'; '.join(proposal['reasons'])}")
        if len(group) > 200:
            lines.append(f"- ... jos {len(group) - 200} jedinica, vidi JSON")
        lines.append("")
    with open(worklist, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines) + "\n")

    print("=== Prijedlog modaliteta i opsega ===")
    print(f"bodovanih pravila: {len(rows)}  ->  jedinica (izvor, citat, os): {len(units)}")
    print(f"  jednoznacno (moze bulk potvrda): {stats['unambiguous']}")
    print(f"  trazi covjeka:                   {stats['needsHuman']}")
    print("modalitet:", {k.split(":", 1)[1]: v for k, v in sorted(stats.items()) if k.startswith("modality:")})
    print("opseg:    ", {k.split(":", 1)[1]: v for k, v in sorted(stats.items()) if k.startswith("scope:")})
    print("")
    print(f"zapisano: {os.path.relpath(out_path, ROOT)}")
    print(f"radni popis: {os.path.relpath(worklist, ROOT)}")
    print("SKRIPT NE ODLUCUJE: prijedlog se upisuje u ruleEntry tek nakon ljudske potvrde.")


if __name__ == "__main__":
    main()
