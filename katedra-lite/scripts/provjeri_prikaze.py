#!/usr/bin/env python3
"""Slike i grafikoni kao SLIKE — rezolucija, širina, omjer, veličina pisma.

Zašto postoji
-------------
Katedra i `rad-docx` provjeravaju prikaz kao **strukturu**: ima li natpis iznad,
„Izvor:” ispod, spominje li se u tekstu, lomi li se preko stranica. Nijedan alat
nije gledao samu sliku. A upravo tamo su kvarovi koje mentor vidi prvi:

* grafikon izvezen na 6,1 in i umetnut na 12 cm — **svako pismo u njemu je
  manje za 23 %**, pa oznake osi od 9 pt izlaze kao 7 pt;
* slika razvučena jer je visina zadana neovisno o širini;
* screenshot od 480 px preko cijele širine teksta — 78 dpi, mutno u ispisu;
* slika kolabirana u tanku traku, klasičan simptom fiksnog proreda
  (`references/predaja.md` § 3).

Što ovaj alat NE radi
---------------------
**Ne crta grafikone i ne ocjenjuje je li grafikon dobro odabran.** Je li stupčasti
prikaz prikladniji od linijskog, je li os prevarantski odsječena, odgovara li
prikaz tvrdnji iz teksta — to su prosudbe koje traže podatke i kontekst, a ne
piksele. Alat mjeri ono što se dade izmjeriti iz datoteke, i to izrijekom kaže
(željezno pravilo 8).
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys

SKRIPTE = os.path.dirname(os.path.abspath(__file__))
if SKRIPTE not in sys.path:
    sys.path.insert(0, SKRIPTE)

OK, UPOZ, LOSE, PRESKOK = "✅", "⚠️", "❌", "➖"

EMU_PO_CM = 360000
EMU_PO_INCU = 914400

PRAGOVI = {
    "dpi_lose": 96,          # ispod = vidljivo mutno u ispisu
    "dpi_upozorenje": 150,   # ispod = granično za tisak
    "sirina_preko": 1.02,    # udio širine teksta preko kojega prikaz prelazi marginu
    "sirina_uska": 0.25,     # ispod = sumnjivo uska
    "omjer_odstupanje": 0.02,  # >2 % razlike izvornog i umetnutog omjera = razvučeno
    "visina_kolaps_cm": 0.7,   # ispod = kolabirano u traku
    "pismo_pad": 0.85,       # skaliranje ispod ovoga mijenja veličinu pisma osjetno
}


_NS_WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
_NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
_NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def _plutajuce(d, od_indeksa):
    """[(indeks, š_emu, v_emu, blob, partname)] za slike u <wp:anchor>.

    `python-docx` nema API za plutajuće slike: `inline_shapes` vraća samo
    <wp:inline>. Rad u kojem je autor sliku povukao mišem („Wrap text") nema
    nijedan inline oblik, pa je do zakrpe za ovaj alat izgledao kao rad bez
    slika. Zato se anchor čita izravno iz XML-a: <wp:extent> nosi mjere,
    <a:blip r:embed> nosi vezu na dio paketa.
    """
    out = []
    i = od_indeksa
    for anchor in d.element.body.iter(f"{{{_NS_WP}}}anchor"):
        try:
            extent = anchor.find(f"{{{_NS_WP}}}extent")
            blip = anchor.find(f".//{{{_NS_A}}}blip")
            if extent is None or blip is None:
                continue
            rid = blip.get(f"{{{_NS_R}}}embed")
            if not rid:
                continue
            dio = d.part.related_parts[rid]
            i += 1
            out.append((i, int(extent.get("cx") or 0), int(extent.get("cy") or 0),
                        dio.blob, dio.partname))
        except Exception:  # noqa: BLE001 — neprepoznat oblik nije slika
            continue
    return out


def _crteza_u_xml(d):
    """Koliko <w:drawing> elemenata dokument uopće ima — ograda protiv tihog nule."""
    ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    return sum(1 for _ in d.element.body.iter(f"{{{ns}}}drawing"))


def _slike(put):
    """[(indeks, širina_emu, visina_emu, blob, partname)] za inline I plutajuće slike."""
    import docx
    d = docx.Document(put)
    out = []
    for i, sh in enumerate(d.inline_shapes, start=1):
        try:
            rid = sh._inline.graphic.graphicData.pic.blipFill.blip.embed
            dio = d.part.related_parts[rid]
            out.append((i, sh.width, sh.height, dio.blob, dio.partname))
        except Exception:  # noqa: BLE001 — neprepoznat oblik nije slika
            continue
    out.extend(_plutajuce(d, len(out)))
    return d, out


def _sirina_teksta_cm(d):
    s = d.sections[0]
    try:
        return (s.page_width - s.left_margin - s.right_margin) / EMU_PO_CM
    except TypeError:
        return None



def _rub_odrezan(im, prag_piksela=3, tolerancija=240):
    """Ne-bijeli pikseli koji dodiruju rub platna: sadržaj je vjerojatno odrezan.

    Kvar 103 (audit Znahor, B1): grafikon iz matplotliba odsijeca sadržaj TIHO —
    bez upozorenja, bez iznimke, bez traga u datoteci. Na stvarnom radu je
    legenda „zeleno: unutar sigurnog prostora" izašla iz platna i u dokumentu je
    pisalo „zeleno: unutar sigurnog pros". Rad je prošao provjeri_prikaze.py,
    gate --faza audit, sve faze rad-audita i provjeri_predaju.py: **nijedan alat
    to nije vidio**, jer svi mjere sliku kao pravokutnik (dpi, širina, omjer,
    skala), a nijedan ne gleda što je U NJOJ. Nađeno je okom, slučajno.

    Vraća {rub: broj piksela}; prazan dict znači čisto.
    """
    import numpy as np
    a = np.asarray(im.convert("RGB"))
    if a.ndim != 3 or min(a.shape[:2]) < 3:
        return {}
    ne_bijelo = a.sum(axis=2) < tolerancija * 3
    rubovi = {"lijevo": ne_bijelo[:, 0].sum(), "desno": ne_bijelo[:, -1].sum(),
              "gore": ne_bijelo[0, :].sum(), "dolje": ne_bijelo[-1, :].sum()}
    return {k: int(v) for k, v in rubovi.items() if v >= prag_piksela}


def analiziraj(put, dopusti_rub=False):
    from PIL import Image
    d, slike = _slike(put)
    sirina_teksta = _sirina_teksta_cm(d)
    redci = []

    for idx, w_emu, h_emu, blob, ime in slike:
        r = {"redni": idx, "datoteka": str(ime), "nalazi": []}
        w_cm = (w_emu or 0) / EMU_PO_CM
        h_cm = (h_emu or 0) / EMU_PO_CM
        w_in = (w_emu or 0) / EMU_PO_INCU
        r["sirina_cm"] = round(w_cm, 2)
        r["visina_cm"] = round(h_cm, 2)

        try:
            im = Image.open(io.BytesIO(blob))
            px_w, px_h = im.size
            izvorni_dpi = (im.info.get("dpi") or (None, None))[0]
        except Exception as e:  # noqa: BLE001
            r["nalazi"].append((PRESKOK, f"slika se ne da otvoriti: {e}"))
            redci.append(r)
            continue

        r["piksela"] = f"{px_w}×{px_h}"
        r["izvorni_dpi"] = round(izvorni_dpi) if izvorni_dpi else None

        # 1) efektivna rezolucija u dokumentu
        if w_in > 0:
            dpi = px_w / w_in
            r["efektivni_dpi"] = round(dpi)
            if dpi < PRAGOVI["dpi_lose"]:
                r["nalazi"].append((LOSE, f"{dpi:.0f} dpi u dokumentu — mutno u ispisu "
                                          f"(prag {PRAGOVI['dpi_lose']})"))
            elif dpi < PRAGOVI["dpi_upozorenje"]:
                r["nalazi"].append((UPOZ, f"{dpi:.0f} dpi — granično za tisak "
                                          f"(preporuka ≥ {PRAGOVI['dpi_upozorenje']})"))

        # 2) širina naspram širine teksta
        if sirina_teksta and w_cm:
            udio = w_cm / sirina_teksta
            r["udio_sirine_teksta"] = round(udio, 2)
            if udio > PRAGOVI["sirina_preko"]:
                r["nalazi"].append((LOSE, f"širi od teksta ({w_cm:.1f} cm naspram "
                                          f"{sirina_teksta:.1f} cm) — prelazi marginu"))
            elif udio < PRAGOVI["sirina_uska"]:
                r["nalazi"].append((UPOZ, f"vrlo uzak ({w_cm:.1f} cm = "
                                          f"{udio:.0%} širine teksta) — provjeri je li "
                                          f"namjerno"))

        # 3) omjer — je li razvučeno
        if px_w and px_h and w_cm and h_cm:
            izvorni = px_h / px_w
            umetnuti = h_cm / w_cm
            odstupanje = abs(umetnuti - izvorni) / izvorni
            r["omjer_odstupanje"] = round(odstupanje, 3)
            if odstupanje > PRAGOVI["omjer_odstupanje"]:
                r["nalazi"].append((LOSE, f"razvučeno {odstupanje:.0%} — izvorni omjer "
                                          f"{izvorni:.3f}, umetnuti {umetnuti:.3f}. "
                                          f"Visinu izvedi iz širine: "
                                          f"visina = širina × h_px / w_px"))

        # 4) kolabirana slika
        if h_cm and h_cm < PRAGOVI["visina_kolaps_cm"]:
            r["nalazi"].append((LOSE, f"visina {h_cm:.2f} cm — slika je kolabirana u "
                                      f"traku; tipično fiksan prored u stilu odlomka"))

        # 5) skaliranje i posljedična veličina pisma u grafikonu
        if izvorni_dpi and w_in > 0:
            izvorna_sirina_in = px_w / izvorni_dpi
            skala = w_in / izvorna_sirina_in
            r["skala"] = round(skala, 3)
            if abs(skala - 1.0) > 0.02:
                pismo_10 = 10 * skala
                stanje = UPOZ if skala >= PRAGOVI["pismo_pad"] else LOSE
                r["nalazi"].append((stanje,
                                    f"umetnuto na {skala:.2f}× izvorne širine "
                                    f"({izvorna_sirina_in:.2f} in → {w_in:.2f} in) — "
                                    f"pismo od 10 pt u grafikonu izlazi kao "
                                    f"{pismo_10:.1f} pt. Izvezi na širinu umetanja "
                                    f"(1:1) ako je pismo bitno."))
            else:
                r["nalazi"].append((OK, "umetnuto 1:1 — pismo u grafikonu zadržava "
                                        "zadanu veličinu"))
        elif not izvorni_dpi:
            r["nalazi"].append((PRESKOK, "PNG nema zapisan dpi, pa se skaliranje i "
                                         "veličina pisma ne mogu izračunati — izvezi s "
                                         "`savefig(..., dpi=…)` da bi ovo bilo mjerljivo"))

        # nalaz 6: sadržaj odrezan rubom platna
        try:
            odrezano = _rub_odrezan(im)
        except Exception as e:  # noqa: BLE001
            odrezano = {}
            r["nalazi"].append((PRESKOK, f"rub platna nije izmjeren: {e}"))
        r["rub"] = odrezano
        if odrezano:
            gdje = ", ".join(f"{k} ({v} px)" for k, v in odrezano.items())
            stanje = PRESKOK if dopusti_rub else LOSE
            r["nalazi"].append((stanje,
                                f"sadržaj dodiruje rub platna: {gdje} — tekst ili crtež "
                                f"je vjerojatno odrezan. Provjeri bbox_inches='tight' "
                                f"ili subplots_adjust." +
                                (" (--dopusti-rub: prijavljeno kao granica)"
                                 if dopusti_rub else "")))
        redci.append(r)

    return {"sirina_teksta_cm": round(sirina_teksta, 2) if sirina_teksta else None,
            "prikaza": len(redci), "crteza_u_xml": _crteza_u_xml(d), "slike": redci}


def ispisi(r):
    print("PRIKAZI KAO SLIKE — rezolucija, širina, omjer, pismo")
    print("=" * 54)
    if r["sirina_teksta_cm"]:
        print(f"  širina teksta: {r['sirina_teksta_cm']} cm")
    print(f"  slika u dokumentu: {r['prikaza']}\n")
    losih = upoz = 0
    for s in r["slike"]:
        glava = (f"  slika {s['redni']}: {s.get('piksela','?')} px · "
                 f"{s.get('sirina_cm','?')}×{s.get('visina_cm','?')} cm")
        if s.get("efektivni_dpi"):
            glava += f" · {s['efektivni_dpi']} dpi"
        print(glava)
        if not s["nalazi"]:
            print(f"     {OK} bez nalaza")
        for stanje, poruka in s["nalazi"]:
            print(f"     {stanje} {poruka}")
            losih += int(stanje == LOSE)
            upoz += int(stanje == UPOZ)
    print(f"\n{losih} kršenja, {upoz} za provjeru")
    print("Alat NE ocjenjuje je li grafikon dobro odabran ni odgovara li podacima —")
    print("to traži podatke i kontekst. Mjeri se samo ono što stoji u datoteci.")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Slike i grafikoni: rezolucija, širina, omjer, veličina pisma.")
    ap.add_argument("rad", help=".docx")
    ap.add_argument("--json", dest="kao_json", metavar="PUT")
    ap.add_argument("--dopusti-rub", dest="dopusti_rub", action="store_true",
                    help="grafikon s namjernim punim ispunom preko cijelog platna "
                         "(heatmap, fotografija) pali provjeru ruba uvijek; ovime "
                         "ostaje deklarirana granica umjesto greške")
    args = ap.parse_args(argv)

    if not os.path.exists(args.rad):
        print(f"❌ nema datoteke: {args.rad}", file=sys.stderr)
        return 2
    if not args.rad.endswith(".docx"):
        print("❌ očekuje se .docx", file=sys.stderr)
        return 2
    try:
        r = analiziraj(args.rad, args.dopusti_rub)
    except ImportError as e:
        print(f"❌ nedostaje knjižnica: {e} (treba Pillow)", file=sys.stderr)
        return 2
    except Exception as e:  # noqa: BLE001
        print(f"❌ provjera nije uspjela: {type(e).__name__}: {e}", file=sys.stderr)
        return 2

    if not r["prikaza"]:
        crteza = r.get("crteza_u_xml", 0)
        if crteza:
            print(f"❌ dokument ima {crteza} crteža (<w:drawing>), a nijedan se ne da "
                  f"izmjeriti — NIJE provjereno, nije uredno.")
            print("   Vjerojatno su umetnuti kao ugniježđeni objekti, OLE ili "
                  "naslijeđeni <w:pict>, ne kao slike.")
            print("   Provjeri ručno: širinu, rezoluciju i natpis svakog prikaza.")
            return 1
        print("➖ dokument nema nijednu umetnutu sliku — nema što mjeriti. "
              "Ako rad ima grafikone, provjeri jesu li umetnuti kao slike, "
              "a ne kao ugniježđeni objekti.")
        return 0

    ispisi(r)
    if args.kao_json:
        with open(args.kao_json, "w", encoding="utf-8") as f:
            json.dump(r, f, ensure_ascii=False, indent=1)
    losih = sum(1 for s in r["slike"] for st, _ in s["nalazi"] if st == LOSE)
    return 1 if losih else 0


if __name__ == "__main__":
    sys.exit(main())
