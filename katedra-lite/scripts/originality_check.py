#!/usr/bin/env python3
"""v1.1 (NEW-101) — Heuristička provjera preklapanja teksta rada s ingestiranim izvorima.

**Opseg i ograničenja (pročitaj prije upotrebe).** Ovo NIJE plagijat-detekcija
protiv interneta ni protiv Turnitina/iThenticate baze — takva usporedba
zahtijeva pristup tuđim korpusima koji ovaj alat nema. Provjerava se
isključivo preklapanje rada s onim izvorima koje je korisnik već ingestirao u
B12 evidence ledger (`evidence_ingest.py` → `.katedra/evidence.jsonl`). Alat
je svjesno **read-only i advisory**: nikad ne odlučuje je li nešto plagijat,
samo mjeri leksičko preklapanje i vraća ga na ljudsku provjeru. Doslovan citat
s navodnicima i točnom referencom je legitiman i OČEKIVANO će se prijaviti —
nalaz znači "provjeri je li ovo parafraza ili citat", ne "ovo je prepisano".

Metoda: 8-gram shingle preklapanje (rijeci bez dijakritika/interpunkcije) po
odlomku rada nasuprot svakom ingestiranom evidence passageu. Prijavljuje se
odlomak čiji udio shingleova nađenih doslovno u nekom izvoru prelazi prag.
Taj udio (`total_coverage`) je UNIJA pogodaka preko svih passagea — inače bi
doslovno prepisan odlomak razlomljen granicom passagea (prijelom PDF stranice,
mozaik iz više izvora) prošao kao čist. Uz njega se prijavljuje i
`overlap_ratio` najjačeg pojedinačnog izvora, jer je isti postotak na jednom
izvoru ozbiljniji nego razasut po dvadeset njih (v. references/predaja.md).

Uporaba:
  python3 <KATEDRA_SKILL>/scripts/originality_check.py rad.docx \
      --evidence .katedra/evidence.jsonl --json .katedra/originality.json

Izlazni kodovi:
  0  provjera izvršena (uključujući slučaj bez nalaza — ovo NIKAD ne blokira)
  2  ulazna datoteka/evidence ledger se ne mogu pročitati
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Any

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import hr_text as H  # noqa: E402
from evidence_model import read_jsonl  # noqa: E402

SHINGLE_N = 8
MIN_SHINGLES = 5


class GreskaUlaza(Exception):
    """Ulaz se ne može pročitati — izlazni kod 2."""


def _normalizirane_rijeci(tekst: str) -> list[str]:
    tekst = H.bez_dijakritika((tekst or "").lower())
    tekst = re.sub(r"[^a-z0-9\s]+", " ", tekst)
    return [w for w in tekst.split() if w]


def shingles(tekst: str, n: int = SHINGLE_N) -> set[str]:
    rijeci = _normalizirane_rijeci(tekst)
    if len(rijeci) < n:
        return set()
    return {" ".join(rijeci[i:i + n]) for i in range(len(rijeci) - n + 1)}


def _normalizirano_s_pozicijama(tekst: str) -> tuple[str, list[int]]:
    """Ista normalizacija kao `_normalizirane_rijeci()`, ali znak-po-znak, uz
    tablicu pozicija natrag u ORIGINALNI tekst.

    v1.1-advisory fix (nezavisna revizija, đ-prozor regresija): vraćeni niz
    sadrži isključivo [a-z0-9] i razmake — svaki drugi znak (uključujući đ/Đ,
    interpunkciju i sve što `re.sub(r"[^a-z0-9\\s]+", " ")` u
    `_normalizirane_rijeci()` briše) postaje jedan razmak, pa je tokenizacija
    identična onoj iz koje su građeni shingleovi. `pozicije[k]` je indeks u
    originalu iz kojeg je nastao k-ti znak, pa se pronađena pozicija može
    preslikati natrag bez pretpostavke o duljinskoj očuvanosti.
    """
    izlaz: list[str] = []
    pozicije: list[int] = []
    for i, ch in enumerate(tekst or ""):
        for c in H.bez_dijakritika(ch.lower()):
            if not ("a" <= c <= "z" or "0" <= c <= "9"):
                c = " "
            izlaz.append(c)
            pozicije.append(i)
    return "".join(izlaz), pozicije


def _prozor_oko_shinglea(original_tekst: str, shingle: str, sirina: int = 220) -> str:
    """Vrati prozor ORIGINALNOG (ne-normaliziranog) teksta oko mjesta gdje se
    zadani shingle stvarno preklapa, umjesto uvijek prvih `sirina` znakova
    izvora.

    v1.1-advisory fix (nezavisna revizija, bug #11): `matched_excerpt` je
    prije uvijek bio `text[:200]` — prvih 200 znakova evidence passagea.
    `evidence_ingest._passages()` za PDF-ove bez praznih redaka namjerno
    emitira CIJELE STRANICE kao jedan passage ("cijela stranica je
    najrobusniji passage"), pa je prikazani izvadak tipično vrh stranice,
    nepovezan sa stvarno preklapajućim shingleom. Za alat čija je svrha
    „vraćanje na ljudsku provjeru", pogrešnih 200 znakova poražava svrhu.

    v1.1-advisory fix (nezavisna revizija, đ-prozor regresija): pretraga se
    više ne oslanja na to da je `bez_dijakritika()` duljinski očuvana pa da se
    normalizirani tokeni mogu tražiti U NEnormaliziranom tekstu. Za riječi s
    đ/Đ to je vraćalo bug #11: `_normalizirane_rijeci()` briše đ (nije
    combining mark, pa ga `bez_dijakritika()` ne dira, ali ga substitucija
    ne-alfanumerika briše), pa se „Međunarodna" raspada na tokene „me" i
    „unarodna"; tražilo se `me\\W+unarodna` u tekstu koji i dalje sadrži đ, a
    đ JE Unicode word-znak, pa `\\W` ne može poklopiti i pretraga bi pala na
    fallback „vrh passagea". Sada se traži u ISTOJ normalizaciji iz koje su
    građeni shingleovi, a pozicija se preslikava natrag preko tablice
    pozicija. Ostaje ispravno i ako `bez_dijakritika()` počne sam preslikavati
    đ→d (nema vlastitog preslikavanja koje bi se dvaput primijenilo).
    """
    rijeci = shingle.split()
    if not rijeci:
        return (original_tekst or "")[:sirina]
    uzorak = r"\s+".join(re.escape(r) for r in rijeci)
    trazeni, pozicije = _normalizirano_s_pozicijama(original_tekst or "")
    m = re.search(uzorak, trazeni)
    if not m or not pozicije:
        return (original_tekst or "")[:sirina]
    poc = pozicije[m.start()]
    kraj = pozicije[m.end() - 1] + 1
    sredina = (poc + kraj) // 2
    pocetak = max(0, sredina - sirina // 2)
    return (original_tekst or "")[pocetak:pocetak + sirina].strip()


def ucitaj_odlomke(rad: str) -> list[str]:
    if not os.path.isfile(rad):
        raise GreskaUlaza(f"nema datoteke: {rad}")
    try:
        odlomci, _ = H.ucitaj(rad, samo_tijelo=True, ukljuci_tablice=True)
    except SystemExit as exc:  # hr_text.ucitaj zove sys.exit ako fali python-docx
        raise GreskaUlaza(str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — vanjska biblioteka, poruka ide korisniku
        raise GreskaUlaza(f"{rad} se ne može pročitati: {exc}") from exc
    return odlomci


def ucitaj_evidence(put: str) -> list[dict[str, Any]]:
    if not os.path.isfile(put):
        raise GreskaUlaza(
            f"nema evidence ledgera: {put}\n"
            f"   Što napraviti: prvo pokreni evidence_ingest.py za relevantne PDF/TXT/MD "
            f"izvore, ili preskoči ovu provjeru ako izvori nisu digitalno ingestirani."
        )
    try:
        return read_jsonl(put)
    except ValueError as exc:
        raise GreskaUlaza(f"{put}: {exc}") from exc


def analiziraj(
    odlomci: list[str],
    evidence: list[dict[str, Any]],
    prag: float,
) -> list[dict[str, Any]]:
    evid_shingles = [
        (e.get("evidence_id"), e.get("source_id"), e.get("text", ""), shingles(e.get("text", "")))
        for e in evidence
    ]
    nalazi = []
    for idx, odl in enumerate(odlomci):
        p_shingles = shingles(odl)
        if len(p_shingles) < MIN_SHINGLES:
            continue
        najbolji = None
        # v1.1-advisory fix (nezavisna revizija, unija-preklapanja): docstring
        # modula traži „udio shingleova nađenih doslovno u NEKOM izvoru", dakle
        # UNIJU pogodaka preko svih passagea, a računao se samo najbolji
        # pojedinačni passage. Doslovno prepisan odlomak razlomljen granicom
        # passagea (dva odlomka istog izvora, prijelom PDF stranice, ili mozaik
        # iz više izvora) tako nikad nije mogao doseći prag: za raspon od n
        # riječi podijeljen na k jednakih dijelova svaki dio nosi najviše
        # (n/k - 7) / (n - 7) shingleova, što je za k=2 uvijek < 0.5.
        unija: set[str] = set()
        for evidence_id, source_id, text, e_shingles in evid_shingles:
            if not e_shingles:
                continue
            presjek = p_shingles & e_shingles
            if not presjek:
                continue
            unija |= presjek
            omjer = len(presjek) / len(p_shingles)
            if najbolji is None or omjer > najbolji["overlap_ratio"]:
                # v1.1-advisory fix (bug #11): centriraj izvadak oko stvarno
                # preklapajućeg shinglea, ne uvijek prvih 200 znakova stranice.
                # sorted() čini izbor deterministički kad ima više shingleova
                # u presjeku (isti unos → isti prikazani izvadak svaki put).
                reprezentativni = sorted(presjek)[0]
                najbolji = {
                    "overlap_ratio": round(omjer, 3),
                    "evidence_id": evidence_id,
                    "source_id": source_id,
                    "matched_excerpt": _prozor_oko_shinglea(text, reprezentativni),
                }
        # Odluka o prijavi ide po UNIJI; `najbolji` i dalje služi samo za
        # imenovanje primarnog izvora i izvatka.
        ukupno = round(len(unija) / len(p_shingles), 3) if najbolji else 0.0
        if najbolji and ukupno >= prag:
            nalazi.append({
                "paragraph_index": idx,
                "excerpt": odl[:200],
                "total_coverage": ukupno,
                **najbolji,
            })
    nalazi.sort(key=lambda n: (n["total_coverage"], n["overlap_ratio"]), reverse=True)
    return nalazi


def spremi_json(put: str, podaci: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(put)) or ".", exist_ok=True)
    tmp = put + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(podaci, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, put)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Advisory heuristika: preklapanje odlomaka rada s ingestiranim evidence izvorima."
    )
    ap.add_argument("rad", help="ulazni .docx rad")
    ap.add_argument("--evidence", default=".katedra/evidence.jsonl",
                     help="B12 evidence JSONL (default .katedra/evidence.jsonl)")
    ap.add_argument("--prag", type=float, default=0.5,
                     help="minimalni udio shingleova koji se smatra visokim preklapanjem, "
                          "razlomak u [0, 1] (default 0.5; NE postotak — 50%% je 0.5, ne 50)")
    ap.add_argument("--json", dest="json_out", metavar="PUT", help="zapiši nalaze u JSON")
    args = ap.parse_args(argv)

    # v1.1-advisory fix (nezavisna revizija, bug #4): --prag izvan [0, 1] je
    # prije bio tiho prihvaćen. "--prag 50" (prirodan pokušaj da se napiše
    # "50%") je značio da NIJEDAN nalaz nikad ne može doseći prag (omjer je
    # uvijek <= 1.0) — alat bi uvijek ispisao "✅ čisto" bez obzira na sadržaj,
    # i JSON izlaz bi kršio vlastitu shemu (originality_schema.json: prag
    # maximum 1).
    if not (0.0 <= args.prag <= 1.0):
        print(f"❌ --prag mora biti u rasponu [0, 1] (dobiveno: {args.prag}). "
              f"Ako si mislio postotak, upiši razlomak — 50% je 0.5, ne 50.",
              file=sys.stderr)
        return 2

    try:
        odlomci = ucitaj_odlomke(args.rad)
        evidence = ucitaj_evidence(args.evidence)
    except GreskaUlaza as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 2

    if not evidence:
        print("⚠️  evidence ledger je prazan — nema s čime usporediti; ovo NIJE dokaz "
              "originalnosti, samo znači da ništa nije ingestirano.")

    # v1.1-advisory fix (nezavisna revizija, bug #3): dokument bez ijednog
    # prepoznatog odlomka (npr. rimski brojevi umjesto "1. Uvod"/"UVOD" —
    # `hr_text.ucitaj(..., samo_tijelo=True)` tada nikad ne postavi
    # poceo-tijela) je prije tiho proizvodio "✅ čisto" nakon analize NULA
    # odlomaka — 100%-prepisan rad bi prošao bez ijednog upozorenja.
    if not odlomci:
        print("⚠️  0 odlomaka prepoznato u tijelu rada — ništa nije analizirano. "
              "Provjeri da rad koristi prepoznatu strukturu poglavlja (npr. "
              "„1. Uvod” ili „UVOD”); ovo NIJE dokaz originalnosti, samo znači "
              "da provjera nije mogla ući u tijelo rada.")

    nalazi = analiziraj(odlomci, evidence, args.prag)

    print("=" * 78)
    print(f"ORIGINALITY CHECK (advisory) — {os.path.basename(args.rad)}")
    print("=" * 78)
    print(f"odlomaka analizirano: {len(odlomci)} · evidence passagea: {len(evidence)} · "
          f"prag: {args.prag}")
    if nalazi:
        print(f"\n⚠️  {len(nalazi)} odlomak(a) s visokim leksičkim preklapanjem — "
              f"provjeri je li citat/parafraza korektno označen:\n")
        for n in nalazi[:20]:
            # v1.1-advisory fix (nezavisna revizija, unija-preklapanja): ukupno
            # preklapanje preko SVIH izvora je odlučujuća brojka; postotak na
            # jednom izvoru je ozbiljniji od istog postotka razasutog po
            # dvadeset njih (v. references/predaja.md), pa se prikazuju oba.
            print(f"  [#{n['paragraph_index']}] ukupno preklapanje "
                  f"{n['total_coverage']:.0%} · najjači izvor {n['source_id']} "
                  f"({n['overlap_ratio']:.0%})")
            print(f"      rad:   “{n['excerpt']}”")
            print(f"      izvor: “{n['matched_excerpt']}”\n")
        if len(nalazi) > 20:
            print(f"  … i još {len(nalazi) - 20} (svi su u --json izlazu)")
    elif not odlomci:
        pass  # upozorenje o 0 odlomaka već ispisano gore — ne dodaj lažni "✅ čisto"
    else:
        print("\n✅ nijedan odlomak ne prelazi prag preklapanja s ingestiranim izvorima "
              "(ne dokazuje odsutnost plagijata izvan ingestiranog materijala).")

    if args.json_out:
        spremi_json(args.json_out, {
            "schema_version": 1,
            "alat": "originality_check",
            "napomena": (
                "advisory heuristika ograničena na ingestirane B12 evidence izvore; "
                "nije zamjena za institucionalnu plagijat-detekciju (npr. Turnitin)"
            ),
            "rad": os.path.abspath(args.rad),
            "evidence_ledger": os.path.abspath(args.evidence) if os.path.isfile(args.evidence) else args.evidence,
            "prag": args.prag,
            "odlomaka": len(odlomci),
            "evidence_passagea": len(evidence),
            "nalazi": nalazi,
        })
        print(f"\n[originality → {args.json_out}]")

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        os._exit(0)
    except KeyboardInterrupt:
        sys.exit(130)
