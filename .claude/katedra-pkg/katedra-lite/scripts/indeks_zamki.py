#!/usr/bin/env python3
"""Indeks kataloga zamki.

Zašto postoji: `references/zamke.md` ima ~90 KB. Agent koji traži je li neka
klasa pogreške već viđena mora ili učitati cijelu datoteku (skupo, pa to ne
radi) ili pogađati grep pojam. Indeks je jedna stranica: broj, naslov, mjesto u
kodu, ima li ogradu (regresijski test), redak. Generira se iz same datoteke, pa
se ne može raziću — `--provjeri` pada ako je zastario.

Naredbe:
    indeks_zamki.py                 ispiši indeks na stdout
    indeks_zamki.py --upisi         upiši references/zamke_indeks.md
    indeks_zamki.py --provjeri      izlazni kod 1 ako je upisani indeks zastario
    indeks_zamki.py --trazi POJAM   ispiši samo unose koji spominju POJAM
    indeks_zamki.py --bez-ograde    ispiši unose bez regresijskog testa
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

KORIJEN = Path(__file__).resolve().parent.parent
ZAMKE = KORIJEN / "references" / "zamke.md"
INDEKS = KORIJEN / "references" / "zamke_indeks.md"

# Oblik koji registar propisuje i koji `kvar.py --popravi-naslove` proizvodi:
#     "## 27. Naslov"   i   "## 80–86. Naslov"   (raspon je JEDAN unos)
# Uz njega se i dalje prima tuđi oblik ("## Kvar 58 — Naslov"), jer zakrpe ga
# stalno pišu i indeks nije mjesto na kojem se to kažnjava — to radi kvar.py.
#
# Kvar 122: raspon u KANONSKOM obliku ovdje je nedostajao, pa je jedanaest unosa
# ostajalo bez broja upravo nakon što ih kvar.py normalizira. Indeks je čitao
# tuđi oblik, a ne svoj.
BROJ_RE = re.compile(
    r"^(?:(?P<n1>\d+(?:\s*[–—-]\s*\d+)?)\.\s*"
    r"|Kvar(?:ovi)?\s+(?P<n2>\d+(?:\s*[–—-]\s*\d+)?)\s*[–—-]\s*)(?P<naslov>.+)$"
)
# putanja tipa katedra-lite/scripts/gate.py ili gate.py:384
PUTANJA_RE = re.compile(r"`([A-Za-zčćžšđ0-9_./-]+\.(?:py|md|json|sh|docx))(?::\d+)?`")
# Ograda se broji samo kad je tvrdnja da ograda POSTOJI. "Ograda koje nema" i
# "Ograda koja bi ga bila uhvatila" opisuju ogradu koja ne postoji — ne broje se.
# Kvar 132: uzorak je tražio „Ograda" samo na POČETKU RETKA, pa ju je
# propuštao kad rečenica stoji prije nje („…na krivca. Ograda: test_drift.py")
# ili kad unos ima nabrajanje („12. Ograda po pravilu 34: …"). Popis
# `--bez-ograde` time nije mjerio dug nego oblikovanje. Sidro je maknuto;
# veliko slovo i dalje razlikuje tvrdnju („Ograda: X") od proze („bez
# ograde"), a NIJE_OGRADA_RE i dalje odbija „Ograda koje nema".
OGRADA_RE = re.compile(
    r"(?:\*\*)?Ograd[ae]\b:?(?:\*\*)?\s*(?P<rep>.{0,40})", re.S
)
# „nema" bez razloga nije ograda ni deklaracija — ostaje dug (kvar 139).
NIJE_OGRADA_RE = re.compile(r"^\s*(?:koj[aei]|nema\b|\u2026|\.\.\.|protiv\s+ponavljanja[,:]?\s*$)")


# Kvar 139: „nema ogradu" spajalo je tri stanja u jedno — unos kojemu ograda
# nedostaje, unos kojemu ne pripada (mjerenje, bilješka o korpusu) i unos koji
# je već pokriven tuđim testom. Popis duga time nije bio popis posla. Unos
# sada smije REĆI da ograde nema i zašto: „Ograda: nema — <razlog>". Rečenica
# je obavezna; „Ograda: nema." bez razloga i dalje je dug, jer bi inače
# deklaracija bila način da se dug sakrije.
OGRADA_NEMA_RE = re.compile(
    r"(?:\*\*)?Ograd[ae]\b:?(?:\*\*)?\s*nema\b\s*[\u2014\u2013-]\s*(\S[^\n]{9,})"
)


def _stanje_ograde(tijelo: str) -> str:
    """„ima" | „deklarirano" | „nema"."""
    if OGRADA_NEMA_RE.search(tijelo):
        return "deklarirano"
    return "ima" if _ima_ogradu(tijelo) else "nema"


def _ima_ogradu(tijelo: str) -> bool:
    for m in OGRADA_RE.finditer(tijelo):
        rep = m.group("rep").lstrip()
        if NIJE_OGRADA_RE.match(rep):
            continue
        return True
    return False


def unosi() -> list[dict]:
    tekst = ZAMKE.read_text(encoding="utf-8")
    redci = tekst.split("\n")
    granice = [i for i, r in enumerate(redci) if r.startswith("## ")]
    granice.append(len(redci))
    out = []
    for k in range(len(granice) - 1):
        poc = granice[k]
        glava = redci[poc][3:].strip()
        tijelo = "\n".join(redci[poc:granice[k + 1]])
        m = BROJ_RE.match(glava)
        if m:
            broj = (m.group("n1") or m.group("n2") or "").replace(" ", "")
            naslov = m.group("naslov").strip()
        else:
            broj = ""
            naslov = glava
        putanje = []
        for p in PUTANJA_RE.findall(tijelo):
            ime = p.split("/")[-1]
            if ime not in putanje:
                putanje.append(ime)
        out.append({
            "broj": broj,
            "naslov": naslov,
            "redak": poc + 1,
            "putanje": putanje[:3],
            "ograda": _ima_ogradu(tijelo),
            "stanje": _stanje_ograde(tijelo),
            "tijelo": tijelo,
        })
    return out


def _sazmi(s: str, n: int = 88) -> str:
    s = s.replace("|", "\\|").replace("\n", " ").strip()
    return s if len(s) <= n else s[: n - 1] + "…"


def renderiraj(u: list[dict]) -> str:
    s_ogradom = sum(1 for x in u if x["stanje"] == "ima")
    deklarirano = sum(1 for x in u if x["stanje"] == "deklarirano")
    duguje = sum(1 for x in u if x["stanje"] == "nema")
    # Kvar 122: brojka mora značiti isto što i `kvar.py --provjeri`, inače dva
    # alata nad istom datotekom daju dva broja i nijedan se ne da provjeriti.
    # Numerirani unosi su katalog; nenumerirani odjeljci (bilješke o korpusu,
    # „što lanac NE provjerava") jesu u indeksu, ali se broje odvojeno.
    numerirani = sum(1 for x in u if x["broj"])
    odjeljci = len(u) - numerirani
    r = [
        "# Indeks kataloga zamki",
        "",
        "> Generirano iz `references/zamke.md` skriptom `scripts/indeks_zamki.py`.",
        "> **Ne uređuj ručno.** Nakon izmjene kataloga: `indeks_zamki.py --upisi`.",
        "> `bin/testovi.sh` pada ako je ovaj indeks zastario.",
        "",
        f"Unosa: **{numerirani}** (isti broj javlja `kvar.py --provjeri`)"
        + (f" · uz njih {odjeljci} nenumeriranih odjeljaka" if odjeljci else "")
        + f" · s ogradom: **{s_ogradom}** · ograda ne pripada (deklarirano): "
        f"**{deklarirano}** · **duguje ogradu: {duguje}**",
        "",
        "Traži bez učitavanja cijelog kataloga:",
        "",
        "```bash",
        "python3 katedra-lite/scripts/indeks_zamki.py --trazi 'gate'",
        "sed -n '844,880p' katedra-lite/references/zamke.md   # unos po retku",
        "```",
        "",
        "| # | Naslov | Dodiruje | Ograda | Redak |",
        "|---|--------|----------|--------|-------|",
    ]
    for x in u:
        r.append(
            f"| {x['broj'] or '—'} | {_sazmi(x['naslov'])} | "
            f"{', '.join('`%s`' % p for p in x['putanje']) or '—'} | "
            f"{ {'ima': '✅', 'deklarirano': '⚪'}.get(x['stanje'], '—') } | {x['redak']} |"
        )
    bez = [x for x in u if x["stanje"] == "nema"]
    if bez:
        r += [
            "",
            "## Unosi bez ograde",
            "",
            "Nemaju regresijski test i **nisu rekli zašto**. Unos kojemu ograda ne",
            "pripada (mjerenje, bilješka o korpusu) to smije reći rečenicom",
            "„Ograda: nema — <razlog>” i tada ovdje ne stoji; razlog je obavezan,",
            "jer bi inače deklaracija bila način da se dug sakrije. Ovaj popis je",
            "posao, ne stanje.",
            "",
        ]
        for x in bez:
            r.append(f"- {x['broj'] or '—'} — {_sazmi(x['naslov'], 100)} (redak {x['redak']})")
    return "\n".join(r) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--upisi", action="store_true")
    ap.add_argument("--provjeri", action="store_true")
    ap.add_argument("--trazi", metavar="POJAM")
    ap.add_argument("--bez-ograde", action="store_true")
    a = ap.parse_args()

    if not ZAMKE.exists():
        print(f"nema {ZAMKE}", file=sys.stderr)
        return 2
    u = unosi()
    # Kvar 122: i poruke broje ono što broji kvar.py — numerirane unose.
    n_kat = sum(1 for x in u if x["broj"])

    if a.trazi:
        p = a.trazi.lower()
        pog = [x for x in u if p in x["tijelo"].lower()]
        if not pog:
            print(f"nema unosa za „{a.trazi}”")
            return 0
        for x in pog:
            print(f"[{x['broj'] or '—'}] redak {x['redak']}  {'✅' if x['ograda'] else '  '}  {x['naslov']}")
        # Kvar 137: brojka mora značiti isto u SVAKOJ naredbi, ne samo u
        # zaglavlju. Prije ovoga `--trazi` i `--bez-ograde` dijelili su
        # brojem redaka indeksa (uključivo nenumerirani odjeljci), pa je
        # ista datoteka davala 84 ondje gdje `kvar.py` javlja 79.
        pog_odj = sum(1 for x in pog if not x["broj"])
        print(f"\n{len(pog) - pog_odj} od {n_kat} unosa"
              + (f" · uz njih {pog_odj} nenumeriranih odjeljaka" if pog_odj else "")
              + f". Čitaj: sed -n 'REDAK,+40p' {ZAMKE}")
        return 0

    if a.bez_ograde:
        bez = [x for x in u if x["stanje"] == "nema"]
        for x in bez:
            print(f"[{x['broj'] or '—'}] redak {x['redak']}  {x['naslov']}")
        bez_odj = sum(1 for x in bez if not x["broj"])
        print(f"\n{len(bez) - bez_odj} od {n_kat} unosa bez ograde"
              + (f" · uz njih {bez_odj} nenumeriranih odjeljaka" if bez_odj else "")
              + ".")
        return 0

    novi = renderiraj(u)

    if a.provjeri:
        if not INDEKS.exists():
            print("❌ zamke_indeks.md ne postoji — pokreni indeks_zamki.py --upisi")
            return 1
        if INDEKS.read_text(encoding="utf-8") != novi:
            print("❌ zamke_indeks.md je zastario — pokreni indeks_zamki.py --upisi")
            return 1
        print(f"✓ indeks je usklađen s katalogom ({n_kat} unosa)")
        return 0

    if a.upisi:
        INDEKS.write_text(novi, encoding="utf-8")
        print(f"✓ upisano {INDEKS} ({n_kat} unosa)")
        return 0

    sys.stdout.write(novi)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
