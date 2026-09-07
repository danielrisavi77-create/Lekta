#!/usr/bin/env python3
"""Rukopis: markdown je izvor istine, .docx je izvedeni artefakt.

Odluka koja stoji iza ovoga: rad se piše u `.katedra/poglavlja/*.md`, a `.docx` se
iz njega SASTAVLJA. Obrnuti smjer (Word kao izvor istine) znači da svaki AI upis
mora naći mjesto u tuđem XML-u i pritom ne razbiti unakrsne reference — a to puca
na svakom ručnom oblikovanju. Ovako je upis običan zapis datoteke, verzioniranje
je git, a diff se vidi.

Cijena je poštena i treba ju reći studentu: **ono što dotjeraš rukom u Wordu
izgubit ćeš pri sljedećem sastavljanju.** Word je za čitanje i mentora; pisanje
ide kroz rukopis.

Konvencije su NAMJERNO iste kao u skillu `fpzg-diplomski` (`[[PB]]`, `[[SEC]]`,
poglavlje po datoteci), pa se isti rukopis može predati i njemu — on zna kućni
stil, Katedrin generator je rezerva. Dvije konvencije za istu stvar bile bi dvije
verzije istine.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from context import atomic_write_text, resolve_state_dir  # noqa: E402

MARKER_PRIJELOM = "[[PB]]"      # prijelom stranice
MARKER_SEKCIJA = "[[SEC]]"      # prijelom sekcije (odavde kreće numeracija tijela)

RE_NASLOV = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")
RE_POPIS = re.compile(r"^\s*[-*+]\s+(.*)$")
RE_POPIS_BROJ = re.compile(r"^\s*\d+[.)]\s+(.*)$")
RE_CITAT = re.compile(r"^\s*>\s?(.*)$")
RE_TABLICA = re.compile(r"^\s*\|.*\|\s*$")
RE_TABLICA_CRTA = re.compile(r"^\s*\|[\s:|-]+\|\s*$")
RE_NATPIS = re.compile(r"^\s*(Tablica|Slika|Grafikon|Shema|Prilog)\s+\d+(?:\.\d+)*\s*[.:]",
                       re.IGNORECASE)
RE_IZVOR = re.compile(r"^\s*(Izvor|Napomena)\s*:", re.IGNORECASE)

# Redoslijed poglavlja dolazi iz imena datoteke: „01-uvod.md". Broj je jedini
# nositelj redoslijeda — bez njega bi abecedni poredak stavio „zakljucak" prije
# „uvoda", a to je tiha greška koju nitko ne primijeti dok ne otvori dokument.
RE_IME = re.compile(r"^(\d+)[-_ ]+(.+)\.md$", re.IGNORECASE)


class GreskaRukopisa(Exception):
    """Rukopis se ne može pročitati; poruka je za korisnika."""


# ------------------------------------------------------------- markdown → blokovi

def _inline(tekst):
    """Podijeli redak na dijelove s oznakama podebljano/kurziv.

    Vraća popis (tekst, podebljano, kurziv). Namjerno pokriva samo ta dva:
    akademski tekst ih koristi, a sve preko toga (linkovi, kod) u radu je rijetko
    i bolje ga je ne izmišljati nego krivo prikazati.
    """
    dijelovi, i, n = [], 0, len(tekst)
    trenutni, podebljano, kurziv = "", False, False
    while i < n:
        if tekst.startswith("**", i):
            if trenutni:
                dijelovi.append((trenutni, podebljano, kurziv))
                trenutni = ""
            podebljano = not podebljano
            i += 2
            continue
        if tekst[i] == "*" and not tekst.startswith("**", i):
            if trenutni:
                dijelovi.append((trenutni, podebljano, kurziv))
                trenutni = ""
            kurziv = not kurziv
            i += 1
            continue
        trenutni += tekst[i]
        i += 1
    if trenutni:
        dijelovi.append((trenutni, podebljano, kurziv))
    return dijelovi or [("", False, False)]


def _tablica_redak(red):
    return [c.strip() for c in red.strip().strip("|").split("|")]


def parsiraj(tekst):
    """Markdown → popis blokova koje generator zna složiti u .docx.

    Blokovi: ('naslov', razina, tekst) · ('odlomak', dijelovi) ·
    ('popis', stavke, uredjen) · ('citat', dijelovi) ·
    ('tablica', redci, natpis, izvor) · ('prijelom',) · ('sekcija',)
    """
    redci = (tekst or "").replace("\r\n", "\n").split("\n")
    blokovi, i, n = [], 0, len(redci)
    while i < n:
        red = redci[i]
        gol = red.strip()

        if not gol:
            i += 1
            continue
        if gol == MARKER_PRIJELOM:
            blokovi.append(("prijelom",))
            i += 1
            continue
        if gol == MARKER_SEKCIJA:
            blokovi.append(("sekcija",))
            i += 1
            continue

        m = RE_NASLOV.match(red)
        if m:
            blokovi.append(("naslov", len(m.group(1)), m.group(2)))
            i += 1
            continue

        if RE_TABLICA.match(red):
            # Natpis stoji IZNAD tablice, izvor ISPOD — isti sklop koji provjerava
            # `check_rules.provjeri_prikaze`. Ako ih generator ne pokupi ovdje,
            # ostanu obični odlomci i rad dobije „prikaz bez natpisa".
            natpis = None
            if blokovi and blokovi[-1][0] == "odlomak":
                prosli = "".join(d[0] for d in blokovi[-1][1])
                if RE_NATPIS.match(prosli):
                    natpis = prosli
                    blokovi.pop()
            redci_tab = []
            while i < n and RE_TABLICA.match(redci[i]):
                if not RE_TABLICA_CRTA.match(redci[i]):
                    redci_tab.append(_tablica_redak(redci[i]))
                i += 1
            izvor = None
            j = i
            while j < n and not redci[j].strip():
                j += 1
            if j < n and RE_IZVOR.match(redci[j]):
                izvor = redci[j].strip()
                i = j + 1
            blokovi.append(("tablica", redci_tab, natpis, izvor))
            continue

        m = RE_CITAT.match(red)
        if m:
            dijelovi_citata = [m.group(1)]
            i += 1
            while i < n and RE_CITAT.match(redci[i]):
                dijelovi_citata.append(RE_CITAT.match(redci[i]).group(1))
                i += 1
            blokovi.append(("citat", _inline(" ".join(dijelovi_citata).strip())))
            continue

        if RE_POPIS.match(red) or RE_POPIS_BROJ.match(red):
            uredjen = bool(RE_POPIS_BROJ.match(red))
            stavke = []
            while i < n:
                mm = (RE_POPIS_BROJ if uredjen else RE_POPIS).match(redci[i])
                if not mm:
                    break
                stavke.append(_inline(mm.group(1).strip()))
                i += 1
            blokovi.append(("popis", stavke, uredjen))
            continue

        # obični odlomak: skupi susjedne retke do prazne linije
        odlomak = [gol]
        i += 1
        while i < n and redci[i].strip() and not (
                RE_NASLOV.match(redci[i]) or RE_TABLICA.match(redci[i])
                or RE_CITAT.match(redci[i]) or RE_POPIS.match(redci[i])
                or RE_POPIS_BROJ.match(redci[i])
                or redci[i].strip() in (MARKER_PRIJELOM, MARKER_SEKCIJA)):
            odlomak.append(redci[i].strip())
            i += 1
        blokovi.append(("odlomak", _inline(" ".join(odlomak))))
    return blokovi


# ---------------------------------------------------------------- rukopis na disku

def mapa_rukopisa(project_root=None, kat=None):
    return os.path.join(resolve_state_dir(kat, project_root), "poglavlja")


def poglavlja(mapa):
    """Poglavlja po redoslijedu iz imena datoteke („01-uvod.md")."""
    if not os.path.isdir(mapa):
        raise GreskaRukopisa(
            f"nema mape rukopisa: {mapa}\n"
            "   Što napraviti: pokreni `rukopis.py init --plan .katedra/plan.json`")
    nadjeno = []
    for ime in sorted(os.listdir(mapa)):
        m = RE_IME.match(ime)
        if not m:
            continue
        put = os.path.join(mapa, ime)
        with open(put, encoding="utf-8") as f:
            tekst = f.read()
        nadjeno.append({
            "redni": int(m.group(1)),
            "kljuc": m.group(2),
            "datoteka": ime,
            "put": put,
            "rijeci": len(re.findall(r"\S+", tekst)),
            "naslov": (RE_NASLOV.match(tekst.lstrip().split("\n")[0]).group(2)
                       if RE_NASLOV.match(tekst.lstrip().split("\n")[0]) else None),
        })
    nadjeno.sort(key=lambda p: p["redni"])
    return nadjeno


def _slug(naslov):
    import hr_text as H
    s = H.bez_dijakritika(str(naslov or "").lower())
    s = re.sub(r"^\s*\d+(\.\d+)*\.?\s*", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "poglavlje"


def init_iz_plana(plan_put, mapa, prazno=True):
    """Napravi kostur rukopisa iz `plan.json` — jedan .md po poglavlju."""
    try:
        with open(plan_put, encoding="utf-8") as f:
            plan = json.load(f)
    except (OSError, ValueError) as exc:
        raise GreskaRukopisa(f"plan se ne može pročitati ({plan_put}): {exc}") from exc
    pogl = plan.get("poglavlja") or []
    if not pogl:
        raise GreskaRukopisa("plan nema nijedno poglavlje — prvo mod 1 (plan i program)")
    os.makedirs(mapa, exist_ok=True)
    napravljeno = []
    for i, p in enumerate(pogl, 1):
        naslov = str(p.get("naslov") or f"Poglavlje {i}").strip()
        ime = f"{i:02d}-{_slug(naslov)}.md"
        put = os.path.join(mapa, ime)
        if os.path.exists(put):
            continue
        sadrzaj = f"# {naslov}\n"
        opis = str(p.get("sadrzaj") or "").strip()
        if opis and prazno:
            sadrzaj += f"\n<!-- iz plana: {opis} -->\n"
        atomic_write_text(put, sadrzaj)
        napravljeno.append(ime)
    return napravljeno


def status(mapa, prag_rijeci=80):
    pogl = poglavlja(mapa)
    for p in pogl:
        p["napisano"] = p["rijeci"] >= prag_rijeci
    return {
        "mapa": mapa,
        "poglavlja": pogl,
        "ukupno_rijeci": sum(p["rijeci"] for p in pogl),
        "napisanih": sum(1 for p in pogl if p["napisano"]),
        "ukupno": len(pogl),
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Rukopis rada u markdownu (izvor istine).")
    pod = ap.add_subparsers(dest="naredba", required=True)

    i = pod.add_parser("init", help="napravi kostur poglavlja iz plana")
    i.add_argument("--plan", default=None)
    i.add_argument("--project-root")
    i.add_argument("--kat")

    s = pod.add_parser("status", help="koliko je napisano")
    s.add_argument("--project-root")
    s.add_argument("--kat")
    s.add_argument("--json", dest="kao_json", action="store_true")

    a = ap.parse_args(argv)
    mapa = mapa_rukopisa(getattr(a, "project_root", None), getattr(a, "kat", None))

    try:
        if a.naredba == "init":
            plan = a.plan or os.path.join(
                resolve_state_dir(a.kat, a.project_root), "plan.json")
            novo = init_iz_plana(plan, mapa)
            print(f"✅ rukopis → {mapa}")
            for ime in novo:
                print(f"   + {ime}")
            if not novo:
                print("   (sva poglavlja iz plana već postoje — ništa nije pregaženo)")
            print("\nMarkdown je izvor istine: .docx se sastavlja iz ovih datoteka")
            print("(`build_docx.py --rukopis`). Ručno dotjerivanje u Wordu se gubi")
            print("pri sljedećem sastavljanju.")
            return 0

        st = status(mapa)
        if a.kao_json:
            print(json.dumps(st, ensure_ascii=False, indent=2))
            return 0
        print(f"RUKOPIS — {st['napisanih']}/{st['ukupno']} poglavlja, "
              f"{st['ukupno_rijeci']} riječi")
        print("-" * 60)
        for p in st["poglavlja"]:
            znak = "✅" if p["napisano"] else "·"
            print(f" {znak} {p['datoteka']:34} {p['rijeci']:6d} riječi")
        return 0
    except GreskaRukopisa as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
