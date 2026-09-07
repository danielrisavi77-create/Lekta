#!/usr/bin/env python3
"""Hrvatski pravopis i gramatika u akademskoj prozi.

Zašto postoji
-------------
Do v1.5 skill je mjerio ritam, koheziju, prazne fraze i tipografiju — i **nijednu
pravopisnu ni gramatičku pogrešku**. Rad je mogao proći svih 27 dijelova, imati
pojas 5 i tezu koja stoji, pa se vratiti jer je na tri mjesta „sa” umjesto „s” i
jedna rečenica počinje enklitikom. To je ono što mentor zaokruži crvenim, i
jedina kategorija pogreške koju cijeli lanac nije vidio.

Zašto pravila, a ne rječnik
---------------------------
Rječnička provjera nad hrvatskim akademskim tekstom prijavi svaki stručni termin,
svako prezime iz literature i svaku kraticu. Na radu s tristo termina to je
nekoliko stotina lažnih nalaza, a lažni nalaz je kvar jednake težine kao
promašeni (željezno pravilo 18): korisnik nauči ignorirati crvenu boju.

Jezgra su zato **pravila visoke preciznosti** za pogreške koje se u akademskom
hrvatskom stvarno ponavljaju i koje se dadu odlučiti bez rječnika. Rječnik je
neobavezan sloj (`--rjecnik`), uvijek savjetodavan, i kad ga nema to se **kaže**,
ne prešuti.

Podjela nalaza
--------------
❌ pravopis i gramatika — norma, ne ukus.
⚠️ registar i stil — administrativizmi i konstrukcije koje akademski hrvatski
   izbjegava, ali koje nisu pogreška.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

SKRIPTE = os.path.dirname(os.path.abspath(__file__))
if SKRIPTE not in sys.path:
    sys.path.insert(0, SKRIPTE)

import hr_text as H  # noqa: E402
import jezik as J  # noqa: E402

OK, UPOZ, LOSE, PRESKOK = "✅", "⚠️", "❌", "➖"

# Enklitike koje na početku rečenice NIKAD nisu ispravne. Popis je namjerno
# kraći od pune liste enklitika:
#   „sam”  — „Sam rad pokazuje…” je ispravno (zamjenica, ne enklitika);
#   „te”   — „Te godine…” je ispravno (pokazna zamjenica);
#   „me/ju/nas/vas” — previše dvoznačno da bi nalaz bio pouzdan.
# Lažni nalaz je kvar jednake težine kao promašeni (pravilo 18).
ENKLITIKE = (r"je|su|smo|ste|bi|bih|bismo|biste|ću|ćeš|će|ćemo|ćete|"
             r"se|ga|mu|joj|ih|im")

# Glagoli uz koje „da + prezent” zamjenjuje infinitiv (utjecaj koji hrvatska
# norma u pisanom akademskom tekstu ne prihvaća).
MODALNI = r"mora|moraju|može|mogu|treba|trebaju|želi|žele|počinje|počinju|nastoji|nastoje"

PRAVILA = [
    # ---------- ❌ pravopis / gramatika ----------
    dict(id="sa_umjesto_s", stanje=LOSE,
         uzorak=r"\b[Ss]a\s+(?![sšzžSŠZŽ]|ks|ps|mnom\b|svim\b|sv[ie]\w*\b)([a-zčćžšđ])",
         poruka="„sa” se piše samo pred s, š, z, ž, ks, ps i pred „mnom”",
         popravak=lambda m: f"s {m.group(1)}"),
    dict(id="s_umjesto_sa", stanje=LOSE,
         uzorak=r"(?<![A-Za-zČĆŽŠĐčćžšđ])[Ss]\s+([sšzžSŠZŽ][a-zčćžšđ]{2,})",
         poruka="pred riječju na s/š/z/ž ide „sa”",
         popravak=lambda m: f"sa {m.group(1)}"),
    dict(id="ne_spojeno", stanje=LOSE,
         uzorak=r"\b(neznam|nemogu|nesmije|netreba|nemože|nepostoji|neradi|"
                r"nezna|nemoraju|nemogucnost)\b",
         poruka="niječnica „ne” piše se odvojeno od glagola"),
    dict(id="da_li", stanje=LOSE,
         uzorak=r"\bda\s+li\b",
         poruka="u hrvatskom standardu upitna čestica je „je li”, ne „da li”"),
    dict(id="da_prezent", stanje=LOSE,
         uzorak=rf"\b({MODALNI})\s+da\s+(?:se\s+)?\w+",
         poruka="uz modalni glagol ide infinitiv, ne „da + prezent” "
                "(„treba napraviti”, ne „treba da se napravi”)"),
    dict(id="obzirom", stanje=LOSE,
         uzorak=r"(?<!s )\bobzirom\s+na\b",
         poruka="„s obzirom na”, ne „obzirom na”"),
    dict(id="u_vezi_bez_s", stanje=LOSE,
         uzorak=r"\bu\s+vezi\s+(?!s\b|sa\b)(toga|tога|ovoga|njega|čega|toga)\b",
         poruka="„u vezi s tim/time”, ne „u vezi toga”"),
    dict(id="enklitika_pocetak", stanje=LOSE,
         # Prvo slovo je na početku rečenice veliko, pa alternacija ide pod
         # (?i:…); ono što slijedi MORA biti malo slovo, jer je to signal da je
         # riječ o nastavku rečenice, a ne o novoj. „Je li…” i „Bi li…” su
         # ispravni upitni počeci i izuzimaju se.
         # Početak rečenice se prepoznaje SAMO po prethodnoj rečeničnoj
         # interpunkciji, ne po početku retka: u markdownu prelomljena rečenica
         # („…pitanje\nje na koje…”) inače daje lažni nalaz na svakom prijelomu.
         # Cijena je da se enklitika odmah iza naslova ne uhvati — rjeđi slučaj,
         # i jeftiniji od lažnog nalaza (pravilo 18).
         uzorak=rf"(?:\A|(?<=[.!?]\s))(?i:{ENKLITIKE})\s+(?!li\b)[a-zčćžšđ]",
         poruka="rečenica ne počinje enklitikom"),
    dict(id="redni_broj_bez_tocke", stanje=LOSE,
         uzorak=r"\bu\s+(\d{1,2})\s+(stoljeć\w+|razred\w+|poglavlj\w+)\b",
         poruka="redni broj piše se s točkom („u 20. stoljeću”)"),
    dict(id="datum_bez_razmaka", stanje=LOSE,
         uzorak=r"\b\d{1,2}\.\d{1,2}\.\d{4}\.?",
         poruka="u datumu iza točke ide razmak („12. 9. 2026.”)"),
    dict(id="razmak_pred_interpunkcijom", stanje=LOSE,
         uzorak=r"\s+[,;:!?](?=\s|$)",
         poruka="razmak ne stoji ispred zareza, točke sa zarezom ni dvotočke"),
    dict(id="dvostruki_razmak", stanje=LOSE,
         uzorak=r"(?<=\S)  +(?=\S)",
         poruka="dvostruki razmak"),
    dict(id="ravni_navodnici", stanje=LOSE,
         uzorak=r'"[^"\n]{2,}"',
         poruka="hrvatski navodnici su „ i ”, ne ravni"),
    dict(id="spojnica_u_rasponu", stanje=LOSE,
         uzorak=r"\b(\d{1,4})\s*-\s*(\d{1,4})\b",
         poruka="u rasponu brojeva ide en crtica (–), ne spojnica (-)"),
    dict(id="postotaka", stanje=LOSE,
         uzorak=r"\b\d+([,.]\d+)?\s+postotaka\b",
         poruka="uz broj ide „posto” ili znak %, a razlika dviju stopa "
                "izražava se u „postotnim bodovima”"),

    # ---------- ⚠️ registar i stil ----------
    dict(id="od_strane", stanje=UPOZ,
         uzorak=r"\bod\s+strane\s+\w+",
         poruka="„od strane X” je administrativizam; napiši aktivnom rečenicom "
                "ili „X je + glagol”"),
    dict(id="isti_kao_zamjenica", stanje=UPOZ,
         uzorak=r"(?:^|(?<=[.!?]\s))(Isti|Ista|Isto|Iste)\s+(?:je|su|se)\b",
         poruka="„isti” kao zamjenica je uredski stil; ponovi imenicu"),
    dict(id="vrsiti", stanje=UPOZ,
         uzorak=r"\b(vrši\w*|vrše\w*|vršen\w*|izvršava\w*)\s+\w+",
         poruka="„vršiti analizu” → „analizirati”; glagol umjesto perifraze"),
    dict(id="putem", stanje=UPOZ,
         uzorak=r"\bputem\s+\w+",
         poruka="„putem” je često suvišno; provjeri može li stajati "
                "instrumental ili „preko”"),
    dict(id="postotak_bez_razmaka", stanje=UPOZ,
         uzorak=r"\b\d+([,.]\d+)?%",
         poruka="između broja i znaka % ide razmak (5 %) — ako kućni stil "
                "traži drukčije, zanemari"),
    dict(id="radi_toga_sto", stanje=UPOZ,
         uzorak=r"\bradi\s+toga\s+što\b",
         poruka="uzrok je „zbog”, namjera je „radi”"),
]


# Pravila koja OVISE o velikom slovu ne smiju dobiti IGNORECASE: „Isti je” je
# nalaz samo na početku rečenice, a enklitika se prepoznaje po tome što slijedi
# malo slovo. Ostalima veliko slovo na početku rečenice ne mijenja ništa, pa bi
# bez IGNORECASE „Treba da se napravi” prošlo neopaženo.
OSJETLJIVA_NA_VELIKO = {"enklitika_pocetak", "isti_kao_zamjenica",
                        "s_umjesto_sa", "sa_umjesto_s"}


def _kompajliraj():
    for p in PRAVILA:
        zastavice = re.MULTILINE
        if p["id"] not in OSJETLJIVA_NA_VELIKO:
            zastavice |= re.IGNORECASE
        p["re"] = re.compile(p["uzorak"], zastavice)
    return PRAVILA


def _kontekst(tekst, poc, kraj, sirina=38):
    a = max(0, poc - sirina)
    b = min(len(tekst), kraj + sirina)
    isj = tekst[a:b].replace("\n", " ")
    rel_p, rel_k = poc - a, kraj - a
    return (isj[:rel_p] + "»" + isj[rel_p:rel_k] + "«" + isj[rel_k:]).strip()


def rjecnicki_prolaz(tekst, put_rjecnika):
    """Neobavezan sloj. Vraća (nepoznate_rijeci, poruka)."""
    try:
        from spylls.hunspell import Dictionary
    except ImportError:
        return None, ("spylls nije instaliran — rječnički prolaz preskočen "
                      "(`pip install spylls`)")
    try:
        d = Dictionary.from_files(put_rjecnika)
    except Exception as e:  # noqa: BLE001
        return None, f"rječnik se ne da učitati ({put_rjecnika}): {e}"
    nepoznate = {}
    for w in re.findall(r"[^\W\d_]{3,}", tekst, re.UNICODE):
        if w[0].isupper():
            continue          # vlastita imena i prezimena iz literature
        if w.lower() in nepoznate:
            continue
        try:
            if not d.lookup(w.lower()):
                nepoznate[w.lower()] = nepoznate.get(w.lower(), 0) + 1
        except Exception:  # noqa: BLE001
            continue
    return sorted(nepoznate), None


def provjeri(tekst, rjecnik=None):
    nalazi = []
    for p in _kompajliraj():
        for m in p["re"].finditer(tekst):
            nalazi.append({
                "pravilo": p["id"],
                "stanje": p["stanje"],
                "poruka": p["poruka"],
                "nadjeno": m.group(0).strip(),
                "kontekst": _kontekst(tekst, m.start(), m.end()),
            })
    rj, poruka_rj = (None, "rječnički prolaz nije tražen")
    if rjecnik:
        rj, poruka_rj = rjecnicki_prolaz(tekst, rjecnik)
    return {"nalazi": nalazi, "rjecnik": rj, "rjecnik_poruka": poruka_rj,
            "znakova": len(tekst)}


def ispisi(r, ogranicenje=6):
    print("HRVATSKI JEZIK — pravopis, gramatika i registar")
    print("=" * 48)
    po_pravilu = {}
    for n in r["nalazi"]:
        po_pravilu.setdefault((n["stanje"], n["pravilo"], n["poruka"]), []).append(n)

    losi = [k for k in po_pravilu if k[0] == LOSE]
    upoz = [k for k in po_pravilu if k[0] == UPOZ]
    for skup, naslov in ((losi, "PRAVOPIS I GRAMATIKA"), (upoz, "REGISTAR I STIL")):
        if not skup:
            continue
        print(f"\n— {naslov}")
        for kljuc in sorted(skup, key=lambda k: -len(po_pravilu[k])):
            stanje, pid, poruka = kljuc
            pojave = po_pravilu[kljuc]
            print(f"{stanje} {poruka}  ({len(pojave)}×)")
            for n in pojave[:ogranicenje]:
                print(f"     … {n['kontekst']}")
            if len(pojave) > ogranicenje:
                print(f"     … još {len(pojave) - ogranicenje}")

    n_lose = sum(len(v) for k, v in po_pravilu.items() if k[0] == LOSE)
    n_upoz = sum(len(v) for k, v in po_pravilu.items() if k[0] == UPOZ)
    print(f"\n{n_lose} pravopisnih/gramatičkih, {n_upoz} stilskih nalaza")

    if r["rjecnik"] is not None:
        print(f"\n{UPOZ} rječnik: {len(r['rjecnik'])} riječi izvan rječnika "
              f"(stručni termini su očekivani — pregledaj, ne ispravljaj slijepo):")
        print("     " + ", ".join(r["rjecnik"][:25]))
    else:
        print(f"\n{PRESKOK} {r['rjecnik_poruka']}")
        print("     Pravilna jezgra radi bez rječnika i namjerno je uska: "
              "rječnik nad\n     akademskim tekstom prijavi svaki stručni termin i "
              "svako prezime.")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Hrvatski pravopis, gramatika i registar u akademskoj prozi.")
    ap.add_argument("rad", help=".docx ili .md")
    ap.add_argument("--rjecnik", help="put do hunspell rječnika bez nastavka "
                                      "(npr. /usr/share/hunspell/hr_HR) — neobavezno")
    ap.add_argument("--json", dest="kao_json", metavar="PUT")
    ap.add_argument("--sve", action="store_true", help="ispiši sve pojave, bez rezanja")
    ap.add_argument("--kat", help="putanja do .katedra/ (za jezik rada)")
    ap.add_argument("--project-root", dest="project_root")
    args = ap.parse_args(argv)

    smije, _j, _izvor = J.guard("provjeri_jezik", ("hr",),
                                kat=getattr(args, "kat", None) or
                                    __import__("context").resolve_state_dir(
                                        None, getattr(args, "project_root", None)),
                                profil=getattr(args, "profil", None))
    if not smije:
        return 0


    if not os.path.exists(args.rad):
        print(f"❌ nema datoteke: {args.rad}", file=sys.stderr)
        return 2
    try:
        # `ucitaj` vraća (odlomci, markeri) — markeri su naslovi i natpisi
        # prikaza i NE ulaze u jezičnu provjeru: natpis „Tablica 1." nije
        # rečenica, a pravilo o enklitici na početku rečenice bi na njemu palo.
        odlomci, _markeri = H.ucitaj(args.rad, samo_tijelo=True,
                                     bez_nabrajanja=False)
    except Exception as e:  # noqa: BLE001
        print(f"❌ tekst se ne da pročitati: {type(e).__name__}: {e}", file=sys.stderr)
        return 2
    tekst = "\n".join(str(o) for o in odlomci)
    if not tekst.strip():
        # Dokument bez proze u tijelu (npr. samo popis literature) nije kvar
        # alata nego rad na kojem nema što mjeriti. Izlazni kod 2 ovdje bi ga
        # `gate.py` prijavio kao „alat pukao" — a to je stanje rezervirano za
        # provjeru koja se SRUŠILA, ne za onu koja nema ulaza (pravilo 20).
        print("➖ dokument nema proze u tijelu — nema što provjeriti. "
              "Ako rad ima tekst,\n   provjeri jesu li odlomci u stilu Normal, "
              "a ne u naslovima ili tablicama.")
        return 0

    r = provjeri(tekst, args.rjecnik)
    ispisi(r, ogranicenje=10**6 if args.sve else 6)
    if args.kao_json:
        with open(args.kao_json, "w", encoding="utf-8") as f:
            json.dump(r, f, ensure_ascii=False, indent=1)
    return 1 if any(n["stanje"] == LOSE for n in r["nalazi"]) else 0


if __name__ == "__main__":
    sys.exit(main())
