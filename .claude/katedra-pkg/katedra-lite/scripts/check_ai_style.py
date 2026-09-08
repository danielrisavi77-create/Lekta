#!/usr/bin/env python3
"""
check_ai_style.py — mjeri tragove generiranog teksta u hrvatskoj akademskoj prozi.

NE traži samo zabranjene fraze. Mjeri četiri neovisne dimenzije koje se pri
popravljanju međusobno kvare, pa svaka ima vlastiti prag:

  1. KOHEZIJA   gustoća i raznolikost veznih sredstava
  2. RITAM      raspodjela duljine rečenica
  3. POČETCI    ponavljanje prvih dviju riječi rečenice
  4. ATRIBUCIJA ponavljanje glagola uvođenja izvora
  + FRAZE       katalog tikova

Zašto četiri odvojene dimenzije: uklanjanje fraza obara koheziju, dodavanje
kohezije diže duljinu rečenice. Jedna zbirna ocjena to sakriva. Vidi
references/stil_pipeline.md.

    python3 <KATEDRA_SKILL>/scripts/check_ai_style.py rad.docx [--json] [--po-poglavljima]
"""
import argparse
import json
import re
import statistics as st
import sys
from collections import Counter

sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import hr_text as H
import jezik as J

# --------------------------------------------------------------------- pragovi
PRAGOVI = {
    "kohezija_na_1000": (15.0, 22.0),      # ispod = niz nepovezanih tvrdnji
    "razlicitih_veznika_min": 20,          # malo različitih = mehanički šavovi
    "udio_jednog_veznika_max": 2.5,        # na 1000 riječi
    "udio_jednog_veznika_min_broj": 4,     # Q6d: bez poda 1 pojava na <400 riječi pali pravilo
    "medijan_recenice": (20, 24),
    "sd_recenice_min": 8.0,                # mala varijanca = pisano po kalupu
    "recenica_max_rijeci": 45,
    "udio_dugih_max": 0.18,                # >=35 riječi
    "udio_kratkih_max": 0.15,              # <=10 riječi
    "isti_pocetak_max": 3,                 # po poglavlju
    "isti_glagol_atribucije_max": 4,       # po poglavlju
}

VEZNICI = [
    "jer", "budući da", "s obzirom na to da", "zbog toga", "zbog čega", "stoga",
    "tako da", "pa", "naime", "utoliko", "upravo zato", "prema tome",
    "međutim", "no", "ipak", "doduše", "nasuprot tome", "s druge strane",
    "za razliku od toga", "premda", "iako", "dok", "umjesto toga",
    "pritom", "ujedno", "istodobno", "usto", "povrh toga", "zauzvrat",
    "dakle", "čime", "time", "doista", "štoviše", "čim", "otkako",
]

GLAGOLI_ATRIBUCIJE = [
    "navodi", "navode", "pokazuje", "pokazuju", "utvrđuje", "utvrđuju",
    "upozorava", "upozoravaju", "tvrdi", "tvrde", "ističe", "ističu",
    "zaključuje", "zaključuju", "smatra", "smatraju", "razlikuje", "razlikuju",
    "predlaže", "predlažu", "prikazuje", "prikazuju", "objašnjava", "objašnjavaju",
]

FRAZE = {
    "Riječ je o": r"\bRiječ je o\b",
    "Time se": r"(?:^|\.\s+)Time se\b",
    "Iz toga proizlazi/slijedi": r"\bIz toga (?:proizlazi|slijedi)\b",
    "pokazna zamjenica + je + imenica": r"(?:^|\.\s+)(?:Taj|Ta|To) je [a-zčćžšđ]+\b",
    "što upućuje na to da": r"\bšto upućuje na to da\b",
    "čime se objašnjava": r"\bčime se objašnjava\b",
    "X se očituje u": r"\bse očituje u\b",
    "Nadalje / Osim toga / Također (prazni šav)": r"(?:^|\.\s+)(?:Nadalje|Osim toga|Također)\b",
    "U današnje vrijeme / U suvremenom svijetu": r"\bU (?:današnje vrijeme|suvremenom svijetu)\b",
    "igra ključnu ulogu": r"\bigra ključnu ulogu\b",
    "od iznimne je važnosti": r"\bod iznimne je važnosti\b",
    "ne samo da ... nego i (>2×)": r"\bne samo da\b",
}


def izbroji(uzorak, tekst):
    return len(re.findall(uzorak, tekst, re.IGNORECASE | re.MULTILINE))


# ------------------------------------------------------- Q6c: podjela na poglavlja
# Zastavica --po-poglavljima prije je bila razglašena, a nije radila ništa:
# pragovi za početke rečenica i glagole atribucije vrijede PO POGLAVLJU
# (references/pisanje.md), pa je bez segmentacije ta razina bila nedostupna.
# Filtri su isti kao u hr_text.ucitaj, da zbroj poglavlja odgovara cijelom radu.

def po_poglavljima(putanja):
    """Vrati [(naslov, [odlomci])] po poglavljima (Heading 1 / „# " u markdownu)."""
    p = str(putanja)
    if p.endswith(".docx"):
        return _poglavlja_docx(p)
    with open(p, encoding="utf8") as f:
        return _poglavlja_markdown(f.read())


def _poglavlja_markdown(tekst):
    pog = [("(prije prvog poglavlja)", [])]
    for red in tekst.split("\n"):
        t = red.strip()
        if not t:
            continue
        if re.match(r"^#\s+\S", t):
            pog.append((t.lstrip("#").strip(), []))
        elif t.startswith(H.STRUKTURNI):
            continue
        else:
            pog[-1][1].append(t)
    return [(n, o) for n, o in pog if o]


def _poglavlja_docx(putanja):
    try:
        from docx import Document
    except ImportError:
        sys.exit("Treba python-docx:  pip install python-docx --break-system-packages")
    d = Document(putanja)
    pog = [("(prije prvog poglavlja)", [])]
    poceo, u_literaturi = False, False
    for p in d.paragraphs:
        t = (p.text or "").strip()
        if not t:
            continue
        try:
            stil = p.style.name or ""
        except Exception:
            stil = ""
        if not poceo:
            if re.match(r"^\s*1\.?\s+\S", t) or re.match(r"^\s*(1\.?\s*)?UVOD\s*$", t, re.I):
                poceo = True
                pog.append((t, []))
            continue
        if H.NASLOV_LIT.match(t):
            u_literaturi = True
            continue
        if u_literaturi:
            continue
        if stil.startswith("Heading"):
            if re.match(r"(?i)^heading\s*1$", stil.strip()):
                pog.append((t, []))
            continue
        if H.NATPIS.match(t) or H.IZVOR.match(t):
            continue
        if len(t) < 40 and not t.endswith((".", "!", "?")):
            continue
        pog[-1][1].append(t)
    return [(n, o) for n, o in pog if o]


def analiza(odlomci, naziv="cijeli rad"):
    tekst = " ".join(odlomci)
    rijeci_uk = len(H.rijeci(tekst))
    rec = [r for o in odlomci for r in H.recenice(o)]
    L = [len(H.rijeci(r)) for r in rec] or [0]

    vez = {v: izbroji(r"\b" + re.escape(v) + r"\b", tekst) for v in VEZNICI}
    vez = {k: v for k, v in vez.items() if v}
    uk_vez = sum(vez.values())
    na1000 = uk_vez / rijeci_uk * 1000 if rijeci_uk else 0

    pocetci = Counter(" ".join(H.rijeci(r)[:2]).lower() for r in rec if len(H.rijeci(r)) >= 2)
    glagoli = {g: izbroji(r"\b" + g + r"\b", tekst) for g in GLAGOLI_ATRIBUCIJE}
    glagoli = {k: v for k, v in glagoli.items() if v}
    fraze = {k: izbroji(u, tekst) for k, u in FRAZE.items()}
    fraze = {k: v for k, v in fraze.items() if v}

    return {
        "naziv": naziv,
        "rijeci": rijeci_uk,
        "odlomaka": len(odlomci),
        "recenica": len(rec),
        "kohezija_na_1000": round(na1000, 1),
        "veznika_ukupno": uk_vez,
        "razlicitih_veznika": len(vez),
        "veznici": dict(sorted(vez.items(), key=lambda x: -x[1])),
        "medijan": st.median(L),
        "prosjek": round(st.mean(L), 1),
        "sd": round(st.pstdev(L), 1),
        "najduza": max(L),
        "udio_dugih": round(sum(1 for x in L if x >= 35) / len(L), 3),
        "udio_kratkih": round(sum(1 for x in L if x <= 10) / len(L), 3),
        "najduze_recenice": sorted(rec, key=lambda r: -len(H.rijeci(r)))[:3],
        "pocetci": dict(pocetci.most_common(8)),
        "glagoli": dict(sorted(glagoli.items(), key=lambda x: -x[1])),
        "fraze": fraze,
    }


def nalazi(a):
    """Vrati listu (razina, poruka, savjet). razina: 'x' greška, '!' upozorenje."""
    out = []
    lo, hi = PRAGOVI["kohezija_na_1000"]
    if a["kohezija_na_1000"] < lo:
        out.append(("x", f"kohezija {a['kohezija_na_1000']}/1000 (prag {lo})",
                    "Rečenice stoje kao nepovezane tvrdnje. Korak 2 pipelinea: poveži "
                    "uzročno i suprotno, ne dodavanjem 'Nadalje' nego stvarnim vezama."))
    elif a["kohezija_na_1000"] > hi:
        out.append(("!", f"kohezija {a['kohezija_na_1000']}/1000 (gornji prag {hi})",
                    "Previše veznika zna značiti i predugačke rečenice — provjeri medijan."))
    if a["razlicitih_veznika"] < PRAGOVI["razlicitih_veznika_min"]:
        out.append(("!", f"samo {a['razlicitih_veznika']} različitih veznih sredstava",
                    "Malo različitih znači mehaničke šavove. Cilj: najmanje "
                    f"{PRAGOVI['razlicitih_veznika_min']}."))
    for v, n in a["veznici"].items():
        udio = n / a["rijeci"] * 1000
        # Q6d-zakrpa: „jedan veznik dominira" traži i apsolutni pod. Bez njega
        # jedna jedina pojava na tekstu kraćem od 400 riječi prelazi 2,5/1000,
        # pa alat prijavlja dominaciju ondje gdje se ništa ne ponavlja.
        if (udio > PRAGOVI["udio_jednog_veznika_max"]
                and n >= PRAGOVI["udio_jednog_veznika_min_broj"]):
            out.append(("!", f"vezno sredstvo „{v}\" {n}× ({udio:.1f}/1000)",
                        "Jedan veznik dominira — zamijeni dio istoznačnicama."))

    mlo, mhi = PRAGOVI["medijan_recenice"]
    if a["medijan"] < mlo:
        out.append(("x", f"medijan rečenice {a['medijan']} riječi (prag {mlo}–{mhi})",
                    "Staccato. Spoji susjedne rečenice koje izvode isti potez."))
    elif a["medijan"] > mhi:
        out.append(("x", f"medijan rečenice {a['medijan']} riječi (prag {mlo}–{mhi})",
                    "Zadihana proza. Korak 3 pipelinea: prelomi rečenice preko 40 riječi."))
    if a["sd"] < PRAGOVI["sd_recenice_min"]:
        out.append(("!", f"sd duljine rečenice {a['sd']} (prag ≥{PRAGOVI['sd_recenice_min']})",
                    "Sve rečenice slične duljine = pisano po kalupu. Traži namjernu varijaciju."))
    if a["najduza"] > PRAGOVI["recenica_max_rijeci"]:
        out.append(("!", f"najdulja rečenica {a['najduza']} riječi (prag {PRAGOVI['recenica_max_rijeci']})",
                    "Prelomi je na mjestu prelaska s jedne tvrdnje na drugu."))
    if a["udio_dugih"] > PRAGOVI["udio_dugih_max"]:
        out.append(("!", f"rečenica ≥35 riječi: {a['udio_dugih']*100:.0f} % "
                         f"(prag {PRAGOVI['udio_dugih_max']*100:.0f} %)", ""))
    if a["udio_kratkih"] > PRAGOVI["udio_kratkih_max"]:
        out.append(("!", f"rečenica ≤10 riječi: {a['udio_kratkih']*100:.0f} % "
                         f"(prag {PRAGOVI['udio_kratkih_max']*100:.0f} %)", ""))

    skala = max(1, round(a["rijeci"] / 3000))   # pragovi vrijede po poglavlju (~3000 riječi)
    for p, n in a["pocetci"].items():
        if n > PRAGOVI["isti_pocetak_max"] * skala:
            out.append(("!", f"početak rečenice „{p}…\" {n}×",
                        "Variraj: priložna oznaka, zavisna rečenica ili objekt na početku."))
    for g, n in a["glagoli"].items():
        if n > PRAGOVI["isti_glagol_atribucije_max"] * skala:
            out.append(("!", f"glagol uvođenja izvora „{g}\" {n}×",
                        "Variraj: prema…, u analizi dolazi do zaključka, nalaz glasi, "
                        "ili premjesti citat u zagradu na kraj rečenice."))
    for f, n in a["fraze"].items():
        prag = (2 if "pokazna" in f or "upućuje" in f else 1) * skala
        if n > prag:
            out.append(("x" if n > prag + 2 else "!", f"fraza „{f}\" {n}×",
                        "Tik generiranog teksta. Preoblikuj."))
    return out


def ispis(a, nal):
    print("=" * 72)
    print(f"STIL — {a['naziv']}")
    print("=" * 72)
    print(f"riječi {a['rijeci']} | odlomaka {a['odlomaka']} | rečenica {a['recenica']}")
    print(f"\nKOHEZIJA  {a['kohezija_na_1000']}/1000 riječi, "
          f"{a['razlicitih_veznika']} različitih veznih sredstava")
    top = list(a["veznici"].items())[:8]
    print("          " + " · ".join(f"{k} {v}" for k, v in top))
    print(f"\nRITAM     medijan {a['medijan']} | prosjek {a['prosjek']} | sd {a['sd']} | "
          f"najdulja {a['najduza']}")
    print(f"          ≥35 riječi {a['udio_dugih']*100:.0f} %   ≤10 riječi {a['udio_kratkih']*100:.0f} %")
    if a["fraze"]:
        print("\nFRAZE     " + " · ".join(f"{k} {v}×" for k, v in a["fraze"].items()))
    print()
    if not nal:
        print("  ✓ sve dimenzije unutar pragova")
    for razina, poruka, savjet in nal:
        print(f"  {'✗' if razina == 'x' else '⚠'} {poruka}")
        if savjet:
            print(f"      → {savjet}")
    if a["najduza"] > PRAGOVI["recenica_max_rijeci"]:
        print("\n  najduže rečenice:")
        for r in a["najduze_recenice"]:
            print(f"      [{len(H.rijeci(r))}] {r[:110]}…")
    print()
    return sum(1 for r, *_ in nal if r == "x")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("rad")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--po-poglavljima", action="store_true",
                    help="mjeri svako poglavlje zasebno (pragovi za početke i glagole vrijede po poglavlju)")
    ap.add_argument("--kat", help="putanja do .katedra/ (za jezik rada)")
    ap.add_argument("--project-root", dest="project_root")
    ap.add_argument("--profil", help="resolved_profile.json (za jezik rada)")
    args = ap.parse_args()

    import context as _c
    smije, _j, _iz = J.guard("check_ai_style", ("hr",),
                             kat=args.kat or _c.resolve_state_dir(
                                 None, args.project_root),
                             profil=getattr(args, "profil", None))
    if not smije:
        return 0


    odl, _ = H.ucitaj(args.rad)
    if not odl:
        sys.exit("Nije pronađen prozni tekst. Za .docx provjeri koriste li se stilovi Heading.")

    a = analiza(odl)
    nal = nalazi(a)

    # Q6c-zakrpa: --po-poglavljima sada doista segmentira po Heading 1 i mjeri
    # svako poglavlje zasebno, uz zbirnu ocjenu za cijeli rad.
    dijelovi = []
    if args.po_poglavljima:
        for naslov, odlomci in po_poglavljima(args.rad):
            ap_ = analiza(odlomci, naslov)
            dijelovi.append((ap_, nalazi(ap_)))

    # Q6e-zakrpa: nalazi se broje PRIJE grananja na ispis, pa --json i tekstualni
    # izlaz vraćaju isti izlazni kod. Prije je --json uvijek vraćao 0.
    greske = sum(1 for r, *_ in nal if r == "x")
    greske += sum(1 for _, n in dijelovi for r, *_ in n if r == "x")

    if args.json:
        izlaz = {"mjere": a, "nalazi": nal}
        if args.po_poglavljima:
            izlaz["poglavlja"] = [{"mjere": m, "nalazi": n} for m, n in dijelovi]
        print(json.dumps(izlaz, ensure_ascii=False, indent=1))
        return 1 if greske else 0

    for m, n in dijelovi:
        ispis(m, n)
    ispis(a, nal)
    return 1 if greske else 0


if __name__ == "__main__":
    sys.exit(main())
