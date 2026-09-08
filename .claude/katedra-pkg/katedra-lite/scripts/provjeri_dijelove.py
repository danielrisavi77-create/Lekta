#!/usr/bin/env python3
"""Opseg i ustroj rada PO DIJELOVIMA — provjera .docx-a prema profilu (nalaz 9, v1.9).

Do v1.9 profil je nosio samo ukupni opseg (`struktura.opseg.<tip>.stranice|rijeci`), a
pravila tipa „Uvod najmanje 3000 riječi i ne više od trećine teksta" živjela su u
`napomene` i provjeravala se ručno pisanom skriptom za jedan fakultet
(`provjeri_hks_fzs.py`). Od v1.9 ta pravila nosi `struktura.opseg.<tip>.dijelovi`
(`_schema.json`, definicija `dioOpsega`) i `format.odlomak.razmak_pt`, a ova skripta
ih čita iz razriješenog profila i provjerava za BILO KOJI fakultet.

Podjela posla prema `provjeri_hks_fzs.py` (koja ostaje kao fakultetska skripta):
  OVDJE (iz profila):   broj riječi po dijelu (rijeci_min/max), udio u tijelu teksta
                        (udio_min/max), broj znakova (znakovi_max, npr. sažetak),
                        obaveznost dijela, redoslijed dijelova, propisane podsekcije
                        i njihov redoslijed, razmak iza odlomka (razmak_pt).
  OSTAJE u provjeri_hks_fzs.py (shema to ne nosi): font i veličina u ćelijama tablica,
                        „Tablica N." s točkom u tekstu, Vancouver interpunkcija (citat
                        prije zareza, „i sur." nakon 6 autora), N u prvoj rečenici
                        Rezultata sažetka, broj ključnih riječi, redni brojevi u
                        Zaključku, upućivanje na tablice u Raspravi, životopis u
                        natuknicama, PAGE polje u podnožju.

Prepoznavanje dijelova: naslovi sa stilom Heading 1 ili kratki odlomci pisani VELIKIM
SLOVIMA (s numeracijom ili bez nje, npr. „SAŽETAK", „1. UVOD"), mapirani na slugove
preko `SINONIMI_DIJELOVA` (UVOD; METODE/ISPITANICI I METODE/MATERIJALI I METODE;
REZULTATI; RASPRAVA; ZAKLJUČAK/ZAKLJUČCI; SAŽETAK; SUMMARY; LITERATURA/POPIS (CITIRANE)
LITERATURE; ŽIVOTOPIS …). Podsekcije: Heading 2/3 pod dijelom ili, kad dio nema
podnaslova sa stilom (sažetak), početak odlomka („Metode: …").

Tijelo teksta (za udio) = svi dijelovi od Uvoda do popisa literature (isključivo),
bez naslova; tekst u tablicama se ne broji (kao ni u provjeri_hks_fzs.py).

Pravilo 18: ako profil ima status `nepotvrdeno` (ili nalazi=advisory sa samostojnog
puta resolvera), kršenje je ⚠️ [za potvrdu], ne ❌, i izlazni kod je 0.

Uporaba:
  python3 scripts/provjeri_dijelove.py rad.docx [--profil .katedra/resolved_profile.json]
                                       [--tip diplomski] [--json .katedra/dijelovi_opseg.json]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata

try:
    from docx import Document
except ImportError:  # pragma: no cover
    Document = None

# ----------------------------------------------------------------- sinonimi

# slug → korijeni naslova (normalizirani: bez dijakritika, mala slova). Prvi pogodak
# po redoslijedu popisa vrijedi, zato specifičniji korijeni stoje prije općih.
SINONIMI_DIJELOVA: dict[str, list[str]] = {
    "tdk": ["temeljna dokumentacijska"],
    "bdc": ["basic documentation"],
    "izjava": ["izjava o akademskoj", "izjava o izvornosti", "izjava o autorstvu", "izjava"],
    "zahvala": ["zahval"],
    "sazetak": ["sazetak"],
    "summary": ["summary", "abstract"],
    "sadrzaj": ["sadrzaj", "kazalo"],
    "kratice": ["popis kratica", "kratice", "popis oznaka"],
    "popis-tablica": ["popis tablica"],
    "popis-slika": ["popis slika", "popis grafikona", "popis ilustracija"],
    "uvod": ["uvod"],
    "cilj": ["cilj", "ciljevi", "svrha"],
    "hipoteze": ["hipotez"],
    "metode": ["ispitanici i metod", "materijali i metod", "materijal i metod",
               "metodolog", "metod"],
    "rezultati": ["rezultat"],
    "rasprava": ["rasprav", "diskusij"],
    "zakljucak": ["zakljuc"],
    "literatura": ["popis citirane literature", "popis literature", "literatur",
                   "popis izvora", "bibliograf", "referenc"],
    "prilozi": ["prilozi", "prilog"],
    "zivotopis": ["zivotopis", "curriculum vitae"],
    "naslovnica": ["naslovnica"],
}

# rimska numeracija samo s točkom („IV. ”), inače „Cilj” gubi „cil”; arapska s točkom ili bez
# dijelovi bez vlastitog naslova — izostanak se ne prijavljuje kao nalaz (kao check_rules.NEPROVJERLJIVO)
NEPROVJERLJIVI = ("naslovnica",)

_RE_NUMERACIJA = re.compile(r"^\s*(?:[ivxlc]+\.|\d+(?:\.\d+)*\.?)\s+")


def bez_dijakritika(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s or ""))
    return "".join(ch for ch in s if not unicodedata.combining(ch)).replace("đ", "d").replace("Đ", "D")


def norm(s: str) -> str:
    """Bez dijakritika, mala slova, bez numeracije i interpunkcije."""
    s = bez_dijakritika(s).lower()
    s = _RE_NUMERACIJA.sub(" ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def slugify(s: str) -> str:
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", norm(s))).strip("-")


def prepoznaj_dio(naslov: str) -> str | None:
    """Slug dijela iz naslova ili None ako naslov nije naslov dijela."""
    n = norm(naslov)
    if not n or len(n.split()) > 8:
        return None
    for slug, korijeni in SINONIMI_DIJELOVA.items():
        for k in korijeni:
            if " " in k:
                if n.startswith(k) or f" {k}" in f" {n}":
                    return slug
            else:
                for i, rijec in enumerate(n.split()):
                    # korijen na početku naslova ili kao samostalna riječ s ≤3 znaka nastavka
                    if rijec.startswith(k) and len(rijec) - len(k) <= 3 and (i == 0 or len(n.split()) <= 4):
                        return slug
    return None


# -------------------------------------------------------------- struktura

def _je_velikim_slovima(t: str) -> bool:
    slova = [c for c in t if c.isalpha()]
    return bool(slova) and all(c.isupper() for c in slova)


def _razina(p) -> int | None:
    """1 = naslov dijela, 2 = podnaslov, None = tijelo."""
    st = (p.style.name or "").lower() if p.style is not None else ""
    t = p.text.strip()
    if not t:
        return None
    if st.startswith("heading 1") or st == "title":
        return 1
    if st.startswith("heading 2") or st.startswith("heading 3"):
        return 2
    # numerirani ili nenumerirani naslov VELIKIM SLOVIMA u običnom stilu
    if len(t.split()) <= 8 and _je_velikim_slovima(t) and prepoznaj_dio(t) is not None:
        return 1
    return None


_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _iter_blokovi(doc):
    """(paragraf | 'toc') redoslijedom tijela. Wordov automatski Sadržaj je <w:sdt> blok
    koji python-docx `doc.paragraphs` preskače, pa bi dio „sadrzaj" lažno nedostajao."""
    from docx.text.paragraph import Paragraph
    for el in doc.element.body:
        if el.tag == _W + "p":
            yield Paragraph(el, doc)
        elif el.tag == _W + "sdt":
            xml = el.xml if hasattr(el, "xml") else ""
            try:
                from lxml import etree
                xml = etree.tostring(el, encoding="unicode")
            except Exception:  # pragma: no cover
                pass
            if "Table of Contents" in xml or " TOC " in xml or 'TOC \\' in xml:
                yield "toc"
            else:
                for pel in el.iter(_W + "p"):
                    yield Paragraph(pel, doc)


def dijelovi_dokumenta(doc) -> list[dict]:
    """Popis dijelova redoslijedom u dokumentu: slug, naslov, odlomci tijela, podnaslovi."""
    dijelovi: list[dict] = []
    tekuci = None
    for i, p in enumerate(_iter_blokovi(doc)):
        if p == "toc":
            tekuci = {"slug": "sadrzaj", "naslov": "(Sadržaj — automatsko TOC polje)", "idx": i,
                      "odlomci": [], "podnaslovi": [], "razina_stil": "sdt"}
            dijelovi.append(tekuci)
            continue
        r = _razina(p)
        t = p.text.strip()
        if r == 1:
            tekuci = {"slug": prepoznaj_dio(t), "naslov": t, "idx": i, "odlomci": [], "podnaslovi": [],
                      "razina_stil": (p.style.name or "") if p.style is not None else ""}
            dijelovi.append(tekuci)
        elif tekuci is None:
            continue
        elif r == 2:
            tekuci["podnaslovi"].append(t)
        elif t:
            tekuci["odlomci"].append(p)
    return dijelovi


def rijeci(txt: str) -> int:
    return len(re.findall(r"\S+", txt))


def tekst_dijela(d: dict) -> str:
    return "\n".join(p.text for p in d["odlomci"])


def kandidati_podsekcija(d: dict) -> list[str]:
    """Podnaslovi sa stilom; ako ih nema, početak svakog odlomka (npr. „Metode: …")."""
    if d["podnaslovi"]:
        return d["podnaslovi"]
    out = []
    for p in d["odlomci"]:
        t = p.text.strip()
        glava = t.split(":", 1)[0] if ":" in t[:60] else " ".join(t.split()[:4])
        out.append(glava)
    return out


def _bez_broja(t: str) -> str:
    return re.sub(r"^[0-9.]+\s*", "", t)


def _korijen(slug: str) -> str:
    """Prva 4 slova prve riječi sluga: „etika" → „etik" pogađa i „Etička načela"."""
    prva = slug.split("-")[0]
    return prva[:4] if len(prva) >= 4 else prva


def nadji_podsekciju(slug: str, kandidati: list[str]) -> int | None:
    """Indeks kandidata koji nosi podsekciju; 4-slovni korijen pa, ako ne pogodi, 3-slovni
    („etika" ↔ „Etička načela": č→c ruši 4-slovni korijen)."""
    n = [norm(c) for c in kandidati]
    k4 = _korijen(slug)
    for k in (k4, k4[:3]):
        for i, c in enumerate(n):  # 1. prolaz: prva riječ
            if c.split() and c.split()[0].startswith(k):
                return i
        for i, c in enumerate(n):  # 2. prolaz: bilo koja riječ
            if any(w.startswith(k) for w in c.split()):
                return i
    return None


# ------------------------------------------------------------------ analiza

def _profil_tip(profil: dict, tip: str | None) -> str:
    if tip:
        return tip
    if profil.get("tip"):
        return str(profil["tip"])
    tipovi = profil.get("tipovi_radova") or []
    if len(tipovi) == 1:
        return tipovi[0]
    opseg = (profil.get("struktura") or {}).get("opseg") or {}
    s_dijelovima = [t for t, v in opseg.items() if isinstance(v, dict) and v.get("dijelovi")]
    if len(s_dijelovima) == 1:
        return s_dijelovima[0]
    raise SystemExit("❌ navedi --tip: profil pokriva više vrsta rada (" + ", ".join(tipovi or opseg) + ")")


def analiza(put: str, profil: dict, tip: str | None = None) -> dict:
    if Document is None:
        raise SystemExit("❌ nedostaje python-docx (pip install python-docx)")
    doc = Document(put)
    tip = _profil_tip(profil, tip)
    savjetodavno = (str(profil.get("status") or "").lower() != "potvrdeno"
                    or str(profil.get("nalazi") or "").lower() == "advisory")
    opseg = ((profil.get("struktura") or {}).get("opseg") or {}).get(tip) or {}
    pravila: dict = opseg.get("dijelovi") or {}
    razmak_pt = ((profil.get("format") or {}).get("odlomak") or {}).get("razmak_pt")

    nalazi: list[dict] = []

    def nalaz(dio, poruka, ok, mjera=None, provjerljivo=True):
        nalazi.append({"dio": dio, "ok": bool(ok), "poruka": poruka, "mjera": mjera,
                       "razina": "ok" if ok else ("za_potvrdu" if savjetodavno else "krsenje"),
                       "provjerljivo": provjerljivo})

    if not pravila and razmak_pt is None:
        nalaz("profil", f"profil ne propisuje ni struktura.opseg.{tip}.dijelovi ni format.odlomak.razmak_pt — nema što provjeriti",
              True, provjerljivo=False)
        return {"datoteka": put, "tip": tip, "savjetodavno": savjetodavno, "profil_status": profil.get("status"),
                "nalazi": nalazi, "dijelovi": [], "brojke": {}}

    D = dijelovi_dokumenta(doc)
    po_slugu: dict[str, dict] = {}
    for d in D:
        if d["slug"] and d["slug"] not in po_slugu:
            po_slugu[d["slug"]] = d

    # tijelo teksta: od uvoda do literature (isključivo)
    i_uvod = next((i for i, d in enumerate(D) if d["slug"] == "uvod"), None)
    i_lit = next((i for i, d in enumerate(D) if d["slug"] == "literatura"), None)
    if i_uvod is None:
        i_uvod = next((i for i, d in enumerate(D) if d["razina_stil"].lower().startswith("heading")), 0)
    tijelo_dijelovi = D[i_uvod:(i_lit if i_lit is not None and i_lit > i_uvod else len(D))]
    tijelo_r = sum(rijeci(tekst_dijela(d)) for d in tijelo_dijelovi)
    brojke = {"tijelo_rijeci": tijelo_r,
              "tijelo_dijelovi": [d["naslov"] for d in tijelo_dijelovi]}

    # ---- po dijelovima, redoslijedom iz profila
    redoslijed_profila = sorted(pravila.items(), key=lambda kv: (kv[1].get("redoslijed") is None, kv[1].get("redoslijed") or 0, kv[0]))
    for slug, pr in redoslijed_profila:
        d = po_slugu.get(slug)
        if d is None:
            if slug in NEPROVJERLJIVI:
                nalaz(slug, f"dio „{slug}\" nema vlastiti naslov pa se iz teksta ne može prepoznati — provjeriti ručno", True, provjerljivo=False)
                continue
            if pr.get("obavezan"):
                nalaz(slug, f"dio „{slug}\" nije nađen u radu (obavezan)", False)
            else:
                nalaz(slug, f"dio „{slug}\" nije nađen (nije obavezan) — pravila za taj dio nisu provjerena", True, provjerljivo=False)
            continue
        txt = tekst_dijela(d)
        r = rijeci(txt)
        if pr.get("obavezan"):
            nalaz(slug, f"dio nađen: „{d['naslov'][:50]}\"", True)
        if pr.get("rijeci_min") is not None:
            nalaz(slug, f"{r} riječi (traženo ≥ {pr['rijeci_min']})", r >= pr["rijeci_min"], mjera=r)
        if pr.get("rijeci_max") is not None:
            nalaz(slug, f"{r} riječi (traženo ≤ {pr['rijeci_max']})", r <= pr["rijeci_max"], mjera=r)
        if (pr.get("udio_min") is not None or pr.get("udio_max") is not None):
            if tijelo_r:
                udio = r / tijelo_r
                if pr.get("udio_max") is not None:
                    nalaz(slug, f"udio u tijelu teksta {udio:.0%} (traženo ≤ {pr['udio_max']:.0%}; tijelo {tijelo_r} riječi)",
                          udio <= pr["udio_max"] + 1e-9, mjera=round(udio, 3))
                if pr.get("udio_min") is not None:
                    nalaz(slug, f"udio u tijelu teksta {udio:.0%} (traženo ≥ {pr['udio_min']:.0%})",
                          udio >= pr["udio_min"] - 1e-9, mjera=round(udio, 3))
            else:
                nalaz(slug, "udio se ne može izračunati: tijelo teksta ima 0 riječi", True, provjerljivo=False)
        if pr.get("znakovi_max") is not None:
            znak = len(re.sub(r"\s+", " ", txt).strip())
            nalaz(slug, f"{znak} znakova (traženo ≤ {pr['znakovi_max']})", znak <= pr["znakovi_max"], mjera=znak)
        if pr.get("podsekcije"):
            kand = kandidati_podsekcija(d)
            poz = [nadji_podsekciju(s, kand) for s in pr["podsekcije"]]
            nedostaju = [s for s, p_ in zip(pr["podsekcije"], poz) if p_ is None]
            nadjene = [p_ for p_ in poz if p_ is not None]
            uredno = nadjene == sorted(nadjene)
            cisti = [_bez_broja(k)[:35] for k in kand][:8]
            if nedostaju:
                nalaz(slug, "podsekcije nedostaju: " + ", ".join(nedostaju) + f"  |  nađeno u radu: {cisti}", False)
            else:
                nalaz(slug, "sve propisane podsekcije nađene: " + ", ".join(pr["podsekcije"]), True)
            if len(nadjene) > 1:
                stvarni = [_bez_broja(kand[p_])[:30] for p_ in sorted(nadjene)]  # redoslijedom u radu
                nalaz(slug, ("redoslijed podsekcija u skladu s profilom" if uredno else "redoslijed podsekcija NIJE po profilu")
                      + ": " + " → ".join(stvarni) + "  |  propisano: " + " → ".join(pr["podsekcije"]), uredno)

    # ---- redoslijed dijelova u dokumentu
    videni: set[str] = set()
    slijed: list[tuple[str, int]] = []
    for d in D:
        s = d["slug"]
        if s in pravila and pravila[s].get("redoslijed") is not None and s not in videni:
            videni.add(s)
            slijed.append((s, pravila[s]["redoslijed"]))
    if len(slijed) > 1:
        ok = all(slijed[i][1] <= slijed[i + 1][1] for i in range(len(slijed) - 1))
        krivi = [f"{slijed[i][0]}→{slijed[i + 1][0]}" for i in range(len(slijed) - 1) if slijed[i][1] > slijed[i + 1][1]]
        nalaz("redoslijed", ("redoslijed dijelova po profilu: " if ok else "redoslijed dijelova ODSTUPA: ")
              + " → ".join(s for s, _ in slijed) + (f"  |  krivo: {', '.join(krivi)}" if krivi else ""), ok)

    # ---- razmak iza odlomka
    if razmak_pt is not None:
        try:
            pf = doc.styles["Normal"].paragraph_format
            sa = pf.space_after.pt if pf.space_after is not None else 0.0
        except KeyError:
            sa = None
        if sa is None:
            nalaz("format", "stil Normal ne postoji u dokumentu — razmak odlomaka nije provjeren", True, provjerljivo=False)
        else:
            drukciji: list[str] = []
            ukupno = 0
            for d in tijelo_dijelovi:
                for p in d["odlomci"]:
                    ukupno += 1
                    s = p.paragraph_format.space_after
                    if s is not None and abs(s.pt - float(razmak_pt)) > 0.5:
                        drukciji.append(f"{s.pt:g} pt: „{p.text.strip()[:40]}…\"")
            nalaz("format", f"razmak iza odlomka u stilu Normal: {sa:g} pt (traženo {razmak_pt:g} pt)",
                  abs(sa - float(razmak_pt)) <= 0.5, mjera=sa)
            if drukciji:
                # izričiti razmak na odlomku nadjačava stil; to je obavijest, ne kršenje —
                # popisi, natpisi i prazni razmaci legitimno odstupaju
                nalaz("format", f"odlomaka tijela s izričito drukčijim razmakom: {len(drukciji)}/{ukupno} — provjeriti ručno, npr. "
                      + "; ".join(drukciji[:3]), True, provjerljivo=False)

    nepoznati = [d["naslov"][:40] for d in D if d["slug"] is None and d["razina_stil"].lower().startswith("heading")]
    return {"datoteka": put, "tip": tip, "savjetodavno": savjetodavno,
            "profil_status": profil.get("status"), "nalazi": nalazi,
            "dijelovi": [{"slug": d["slug"], "naslov": d["naslov"], "rijeci": rijeci(tekst_dijela(d)),
                          "podnaslovi": len(d["podnaslovi"])} for d in D],
            "neprepoznati_naslovi": nepoznati, "brojke": brojke}


# ------------------------------------------------------------------- ispis

def ispisi(r: dict) -> None:
    oznaka = "⚠️" if r["savjetodavno"] else "❌"
    print(f"DIJELOVI RADA — {r['datoteka']}   [tip {r['tip']}, profil {r.get('profil_status') or '?'}"
          + (", nalazi savjetodavni — pravilo 18" if r["savjetodavno"] else "") + "]")
    print("=" * 64)
    dio = None
    for x in r["nalazi"]:
        if x["dio"] != dio:
            dio = x["dio"]; print(f"\n{dio.upper()}")
        znak = "✅" if x["ok"] and x["provjerljivo"] else ("ℹ️ " if x["ok"] else oznaka)
        print(f"  {znak} {x['poruka']}")
    if r.get("neprepoznati_naslovi"):
        print("\nnaslovi razine 1 bez slug-a (broje se u tijelo, ne provjeravaju se): " + "; ".join(r["neprepoznati_naslovi"]))
    ok = sum(1 for x in r["nalazi"] if x["ok"])
    print(f"\n{ok}/{len(r['nalazi'])} u skladu" + (" · ostalo [za potvrdu] — profil nije potvrđen (pravilo 18: ⚠️, ne ❌)." if r["savjetodavno"] else "."))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Opseg i ustroj rada po dijelovima prema profilu (nalaz 9).")
    ap.add_argument("rad", help="rad.docx")
    ap.add_argument("--profil", default=".katedra/resolved_profile.json", help="razriješeni profil (profile_resolver.py --profile-out)")
    ap.add_argument("--tip", help="vrsta rada (zadano: iz profila)")
    ap.add_argument("--json", dest="kao_json", help="zapiši nalaze kao JSON")
    a = ap.parse_args(argv)
    try:
        profil = json.load(open(a.profil, encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"❌ profil se ne može pročitati ({a.profil}): {exc}", file=sys.stderr)
        return 2
    r = analiza(a.rad, profil, a.tip)
    ispisi(r)
    if a.kao_json:
        with open(a.kao_json, "w", encoding="utf-8") as fh:
            json.dump(r, fh, ensure_ascii=False, indent=1)
    if r["savjetodavno"]:
        return 0
    return 1 if any(not x["ok"] for x in r["nalazi"]) else 0


if __name__ == "__main__":
    sys.exit(main())
