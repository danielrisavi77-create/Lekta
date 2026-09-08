#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Preklapanje rada s referentnim dokumentom (uzorak, raniji rad, tuđi rad).

Zašto postoji: željezno pravilo 24 kaže da se obranjeni rad mjeri kao primjerak OBLIKA.
Kad taj rad dolazi s istog kolegija, on je ujedno i najbliži susjed po sadržaju, a to
nijedan gate ne mjeri. U rujnu 2026. rad građen po uzorku s ocjenom 5 imao je 2,1 %
zajedničkih 8-grama s tim uzorkom — sve u uvodu, metodama i ograničenjima, dakle u
dijelovima koji se pišu po obrascu. Mentor koji je oba rada čitao to vidi bez alata.

Mjeri se n-gramima nad riječima, ne rečenicama: rečenica se lako preformulira, a slijed od
osam riječi preživi parafrazu koja mijenja samo veznike.

    python3 slicnost.py rad.docx --uzorak uzorak.docx
    python3 slicnost.py rad.docx --uzorak uzorak.docx --n 8 --prikazi 30 --json out.json

Izlazni kod: 0 uvijek. Ovo je mjera, ne presuda — koliko je previše ovisi o tome je li
riječ o nazivu propisa (neizbježno) ili o rečenici iz uvoda (izbježno), a to čita čovjek.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# Granice tijela: mjeri se ono što je autor napisao, ne naslovnica ni popis literature.
POCETAK = re.compile(r"^\s*1\.?\s+UVOD\s*$", re.IGNORECASE)
KRAJ = re.compile(r"^\s*(POPIS LITERATURE|LITERATURA|POPIS IZVORA)\s*$", re.IGNORECASE)


def _odlomci(put):
    p = Path(put)
    if p.suffix.lower() == ".docx":
        import docx  # noqa: PLC0415
        return [x.text for x in docx.Document(str(p)).paragraphs]
    return p.read_text(encoding="utf-8").split("\n")


def tijelo(put):
    """Odlomci od „1. UVOD" do popisa literature; bez granica vraća sve."""
    red = _odlomci(put)
    i = next((k for k, x in enumerate(red) if POCETAK.match(x or "")), None)
    j = next((k for k, x in enumerate(red) if KRAJ.match(x or "")), None)
    if i is None:
        return red
    return red[i:j] if j and j > i else red[i:]


def rijeci(odlomci):
    return re.findall(r"\w+", " ".join(odlomci).lower(), re.UNICODE)


def ngrami(w, n):
    return {tuple(w[i:i + n]) for i in range(len(w) - n + 1)}


def _neizbjezno(fraza):
    """Naziv propisa, brojevi NN i točke standarda ponavljaju se nužno."""
    if re.search(r"\d", fraza):
        return True
    okidaci = ("zakon o", "pravilnik o", "narodne novine", "mrs", "hsfi",
               "međunarodni računovodstveni standard", "uredba komisije",
               "porez na dobit", "odluka o objavljivanju")
    return any(o in fraza for o in okidaci)


def main():
    a = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("rad")
    a.add_argument("--uzorak", required=True, action="append",
                   help="referentni dokument; ponovljivo")
    a.add_argument("--n", type=int, default=8, help="duljina n-grama (zadano 8)")
    a.add_argument("--prikazi", type=int, default=25)
    a.add_argument("--json", dest="kao_json")
    args = a.parse_args()

    W1 = rijeci(tijelo(args.rad))
    if len(W1) < args.n:
        print("rad je prekratak za mjerenje"); return 0

    print("=" * 74)
    print(f"PREKLAPANJE — {Path(args.rad).name}  ({len(W1)} riječi tijela)")
    print("=" * 74)

    izlaz = {"rad": args.rad, "rijeci_tijela": len(W1), "uzorci": []}
    for u in args.uzorak:
        W2 = rijeci(tijelo(u))
        zapis = {"uzorak": u, "rijeci_tijela": len(W2), "po_n": {}}
        for n in (6, args.n, 10):
            A, B = ngrami(W1, n), ngrami(W2, n)
            zaj = A & B
            udio = 100 * len(zaj) / len(A) if A else 0.0
            zapis["po_n"][n] = {"zajednickih": len(zaj), "udio_pct": round(udio, 2)}
            print(f"  {n:>2}-grami: {len(zaj):>4} od {len(A):>5} ({udio:5.2f} %)  {Path(u).name}")

        zaj = sorted(" ".join(g) for g in (ngrami(W1, args.n) & ngrami(W2, args.n)))
        izbjezive, nuzne = [], []
        vidjeno = set()
        for f in zaj:
            (nuzne if _neizbjezno(f) else izbjezive).append(f)
        print(f"\n  od {len(zaj)} dijeljenih {args.n}-grama: "
              f"{len(nuzne)} nužnih (nazivi propisa, brojevi), "
              f"{len(izbjezive)} IZBJEŽIVIH")
        if izbjezive:
            print("\n  IZBJEŽIVO — proza koja se poklapa, kandidat za prepisivanje:")
            for f in izbjezive[:args.prikazi]:
                if any(f[:22] in v for v in vidjeno):
                    continue
                vidjeno.add(f); print(f"    · {f}")
            if len(izbjezive) > len(vidjeno):
                print(f"    … još {len(izbjezive) - len(vidjeno)} (grupirano po početku)")
        zapis["izbjezivih"] = len(izbjezive)
        zapis["nuznih"] = len(nuzne)
        zapis["primjeri_izbjezivih"] = izbjezive[:args.prikazi]
        izlaz["uzorci"].append(zapis)

    print("\n" + "-" * 74)
    print("Prag nije propisan. Nužno preklapanje (naziv zakona, broj NN, oznaka točke\n"
          "standarda) ne smanjuje se i ne treba ga dirati. Izbježivo je gotovo uvijek u\n"
          "uvodu, metodama i ograničenjima, jer se ti dijelovi pišu po obrascu.")
    if args.kao_json:
        Path(args.kao_json).write_text(
            json.dumps(izlaz, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[json → {args.kao_json}]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
