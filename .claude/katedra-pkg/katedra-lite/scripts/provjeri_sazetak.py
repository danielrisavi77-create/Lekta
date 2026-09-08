# -*- coding: utf-8 -*-
"""Sažetak protiv rada: stoji li još ono što piše na prvoj stranici.

Zašto postoji (kvar 30)
-----------------------
Sažetak se piše rano i poslije se ne dira, a rad se u međuvremenu mijenja. Na
jednom je eseju sažetak tvrdio da se argument izlaže „u pet cjelina koje
zauzimaju šest poglavlja" — rad ih je imao osam. Isti je sažetak nudio terminal
za ukapljeni prirodni plin kao dokaz da anticipacija nije bila nemoguća, dok ga
je šesto poglavlje u međuvremenu razložilo u suprotno.

Mentor sažetak čita prvi. Aritmetička netočnost na prvoj stranici skuplja je od
bilo koje u tijelu rada, a nijedna postojeća provjera je nije mogla vidjeti:
sažetak je sam po sebi bio besprijekoran.

Što alat može, a što ne
-----------------------
Strojno se mogu provjeriti **činjenice o radu** koje sažetak iznosi: koliko rad
ima poglavlja, pojavljuju li se u tijelu pojmovi i brojke koje sažetak navodi,
ima li svaki nalaz iz sažetka parnjaka u zaključku.

Proturječje se strojno NE može utvrditi. Zato alat uz nalaze ispisuje i
**paritetnu tablicu**: svaka rečenica sažetka uz mjesto u tijelu koje govori o
istome. To je popis za oko, ne presuda — ali upravo bi na njemu tvrdnja o LNG-u
stajala do odlomka koji je opovrgava.

Uporaba
-------
    python3 provjeri_sazetak.py RAD.docx [--json out.json] [--tablica]
"""
import argparse
import json
import os
import re
import sys

import jezik as J  # noqa: E402
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    import docx
except ImportError:
    sys.exit("nedostaje python-docx")

import hr_text  # noqa: E402

NASLOV_SAZETAK = re.compile(r"^sa[žz]etak(\s+i\s+klju[čc]ne\s+rije[čc]i)?\s*:?\s*$", re.I)
KLJUCNE = re.compile(r"^klju[čc]ne\s+rije[čc]i\s*:?", re.I)
ZAVRSNI_APARAT = re.compile(
    r"^(literatura|popis\s+(literature|tablica|grafikona|slika|prikaza|ilustracija)|"
    r"prilog|prilozi|summary|abstract|životopis|sadr[žz]aj|izjava|sa[žz]etak)", re.I)
ZAKLJUCAK = re.compile(r"^\d*\.?\s*zaklju[čc]", re.I)

BROJEVI = {
    "jedan": 1, "jedno": 1, "jednu": 1, "dva": 2, "dvije": 2, "tri": 3,
    "četiri": 4, "pet": 5, "šest": 6, "sedam": 7, "osam": 8, "devet": 9,
    "deset": 10, "jedanaest": 11, "dvanaest": 12, "trinaest": 13,
    "četrnaest": 14, "petnaest": 15, "šesnaest": 16, "sedamnaest": 17,
    "osamnaest": 18, "devetnaest": 19, "dvadeset": 20,
}
CJELINA = r"(poglavlj\w*|cjelin\w*|dijel\w*|dio|odjelj\w*|potpoglavlj\w*)"

# Riječi koje nose nulu značenja pri usporedbi sažetka i tijela.
STOP = set("""
i ili te pa ali no nego već da se je su bio bila bilo biti nije nisu kao koji koja koje
kojih kojim kojoj kojega što tko gdje kada dok jer zbog radi prema preko kroz uz bez
od do na za po pri sa s u o iz nad pod među ovaj ova ovo taj ta to onaj ona ono svaki
svaka svako sve svi sva neki neka neko ovdje ondje tako takva takvo više manje vrlo
samo tek još ipak dakle time ovim tim njihov njezin njegov ovoga toga rada radu
analizira analiza polazi zaključuje izlaže prikazuje razmatra pokazuje
esej eseja eseju članak članka rad
""".split())

# Riječi kojima sažetak govori o SEBI, a ne o predmetu rada. U tijelu ih po
# prirodi stvari nema, pa bi svaka od njih dala lažan nalaz „pojma nema u radu".
META_SAZETKA = {"argument", "argumenta", "argumentu", "pravilu", "pravilom",
                "sažetak", "sažetku", "zaključuje", "polazi"}


# ── čitanje dokumenta ────────────────────────────────────────────────────────
def procitaj(put):
    """(odlomci, sazetak, kljucne, naslovi_h1, tijelo, zakljucak)."""
    if put.endswith(".docx"):
        d = docx.Document(put)
        redci = []
        for vrsta, blok in hr_text._blokovi_u_redoslijedu(d):
            if vrsta != "p":
                continue
            t = hr_text.tekst_odlomka(blok).strip()
            if not t:
                continue
            stil, je_naslov, je_h1 = hr_text._stil_i_razina(blok)
            redci.append({"t": t, "h1": bool(je_h1), "naslov": bool(je_naslov or je_h1)})
    else:
        redci = []
        for red in open(put, encoding="utf8"):
            t = red.strip()
            if not t:
                continue
            h1 = t.startswith("# ")
            naslov = t.startswith("#")
            redci.append({"t": re.sub(r"^#+\s*", "", t), "h1": h1, "naslov": naslov})

    # sažetak: od naslova „Sažetak" do „Ključne riječi" ili do sljedećeg naslova
    sazetak, kljucne = [], []
    for i, r in enumerate(redci):
        if not NASLOV_SAZETAK.match(r["t"]):
            continue
        for r2 in redci[i + 1:]:
            if KLJUCNE.match(r2["t"]):
                kljucne = [k.strip(" .;") for k in
                           KLJUCNE.sub("", r2["t"]).split(",") if k.strip(" .;")]
                break
            if r2["naslov"] or NASLOV_SAZETAK.match(r2["t"]):
                break
            sazetak.append(r2["t"])
        break

    # poglavlja tijela: H1 koji nisu prednji ni završni aparat
    naslovi = [r["t"] for r in redci if r["h1"] and not ZAVRSNI_APARAT.match(r["t"])]

    # tijelo: od prvog takvog naslova do završnog aparata
    tijelo, u_tijelu = [], False
    zakljucak = []
    u_zakljucku = False
    tekuce = ""
    for r in redci:
        if r["h1"]:
            if ZAVRSNI_APARAT.match(r["t"]):
                u_tijelu = False
                u_zakljucku = False
                tekuce = ""
                continue
            u_tijelu = True
            tekuce = r["t"]
            u_zakljucku = bool(ZAKLJUCAK.match(r["t"]))
            continue
        if u_tijelu:
            tijelo.append((r["t"], tekuce))
            if u_zakljucku:
                zakljucak.append(r["t"])
    return redci, sazetak, kljucne, naslovi, tijelo, zakljucak


# ── pomoćno ─────────────────────────────────────────────────────────────────
def _bez_dijakritika(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s)
                   if not unicodedata.combining(c))


# Duljina korijena je kompromis plaćen lažnim nalazima. Na 6 znakova „ratnoga"
# i „ratno" nisu ista riječ, pa je alat prijavljivao osam „pojmova kojih u
# tijelu nema" — svi su bili obični padeži. Na 5 znakova hrvatski nastavci
# otpadaju, a različite riječi i dalje ostaju različite.
KORIJEN = 5


def korijeni(tekst, min_duljina=5):
    """Grubo korjenovanje: hrvatski nastavci se mijenjaju, početak riječi ne.

    Bez ovoga „poglavlja" i „poglavljima" ne bi bile ista riječ, pa bi svaka
    usporedba sažetka i tijela ispala kao neslaganje.
    """
    out = set()
    for w in re.findall(r"[0-9A-Za-zČĆŽŠĐčćžšđ]+", tekst.lower()):
        if w in STOP or len(w) < min_duljina:
            continue
        out.add(_bez_dijakritika(w)[:KORIJEN])
    return out


def spominje_se(pojam, tijelo_tekst, tijelo_korijeni):
    """Je li pojam (i višerječni) prisutan u tijelu rada.

    Kratice i kratke riječi („NATO", „LNG") ne prolaze kroz korjenovanje jer su
    ispod praga duljine, pa se za njih traži doslovan pogodak. Bez toga je svaka
    ključna riječ kraća od pet znakova bila prijavljena kao da je nema.
    """
    znacajne = [w for w in re.findall(r"[0-9A-Za-zČĆŽŠĐčćžšđ]+", pojam)
                if w.lower() not in STOP]
    if not znacajne:
        return True
    for w in znacajne:
        if len(w) >= 5:
            if _bez_dijakritika(w.lower())[:KORIJEN] in tijelo_korijeni:
                continue
            return False
        # Kratka riječ („rat", „NATO") ne prolazi kroz korjenovanje, ali se u
        # hrvatskom svejedno sklanja: „rat" se u tijelu pojavljuje kao „rata"
        # ili „ratu". Doslovan pogodak je zato prestrog, a slobodan prefiks
        # prelabav („rat" bi hvatao „ratifikaciju"), pa se dopušta najviše tri
        # znaka nastavka.
        if re.search(r"\b" + re.escape(w) + r"\w{0,3}\b", tijelo_tekst, re.I):
            continue
        return False
    return True


def brojke(tekst):
    """Brojke iz teksta, bez godina i rednih brojeva poglavlja."""
    out = set()
    for m in re.finditer(r"\b\d[\d.,]*\s*(?:%|posto|milijun\w*|milijard\w*|tisuć\w*)?", tekst):
        s = m.group(0).strip()
        gol = re.sub(r"[^\d.,]", "", s).strip(".,")
        if not gol:
            continue
        if re.fullmatch(r"(1[89]|20)\d{2}", gol):        # godina
            continue
        if len(gol) <= 1:
            continue
        out.add(gol)
    return out


SPOJNICA = re.compile(r",\s+(?=(?:uz|a|ali|premda|dok|iako|no|pri\s+čemu|te)\b)", re.I)


def tvrdnje(recenica, prag_rijeci=22):
    """Duga rečenica sažetka nosi više tvrdnji; svaka traži svoje mjesto u radu.

    Rečenica „…nisku sposobnost anticipacije, uz iznimke poput terminala…" ima
    dvije tvrdnje, a druga je bila upravo ona koju je rad opovrgnuo. Traženo li
    se mjesto za rečenicu u cjelini, pogodak padne na prvu, frekventniju tvrdnju
    i druga nikad ne dođe pred oko.
    """
    yield recenica
    if len(re.findall(r"\S+", recenica)) < prag_rijeci:
        return
    dijelovi = [d.strip() for d in SPOJNICA.split(recenica) if d.strip()]
    if len(dijelovi) > 1:
        for d in dijelovi:
            if len(re.findall(r"\S+", d)) >= 5:
                yield d


def preklapanje(a, b):
    if not a:
        return 0.0
    return len(a & b) / len(a)


# ── provjere ────────────────────────────────────────────────────────────────
def provjeri(put):
    redci, sazetak, kljucne, naslovi, tijelo, zakljucak = procitaj(put)
    nalazi, obavijesti = [], []

    if not sazetak:
        return {"greska": "ne nalazim sažetak \u2014 traži se odlomak pod naslovom "
                          "\u201eSažetak\u201d ili \u201eSažetak i ključne riječi\u201d"}

    s_tekst = " ".join(sazetak)

    # C4 iz audita Znahor: alat je mjerio duljinu i ključne riječi, ali ne i
    # VRSTU sažetka. Prvi sažetak toga rada bio je niz brojki (M = 4,64; 73,8 %;
    # p = 0,322), a mentorica je tražila suprotno i imala pravo: sažetak
    # diplomskog opisuje O ČEMU je rad, s rezultatima u jednoj rečenici na kraju.
    # Mjeri se udio brojčanih tokena; na tom je radu bio ~9 %, poslije 0.
    tokeni = re.findall(r"\S+", s_tekst)
    brojcani = [t for t in tokeni
                if re.search(r"\d", t) and not re.fullmatch(r"\(?\d{4}\.?\)?[,.;]?", t)]
    udio_broj = round(len(brojcani) / len(tokeni), 3) if tokeni else 0.0
    if udio_broj > 0.06:
        nalazi.append(
            f"sažetak je STRUKTURIRAN, ne deskriptivan: {udio_broj * 100:.0f} % tokena "
            f"nosi brojku ({len(brojcani)} od {len(tokeni)}). Sažetak diplomskog opisuje "
            f"o čemu je rad; rezultati idu u JEDNU rečenicu na kraju, ne kroz cijeli "
            f"odlomak. Ako fakultet traži strukturirani sažetak (IMRAD), zanemari.")
    elif udio_broj > 0.03:
        obavijesti.append(f"udio brojčanih tokena u sažetku: {udio_broj * 100:.0f} % "
                          f"— na granici deskriptivnog i strukturiranog")
    # Naslovi poglavlja ulaze u usporedbu pojmova: „dugotrajna sigurnosna
    # agenda" stoji u naslovu trećega poglavlja, pa bi bez njih sažetak koji je
    # tu sintagmu preuzeo ispao kao da govori o nečemu čega u radu nema.
    t_tekst = " ".join([x[0] for x in tijelo] + naslovi)
    t_kor = korijeni(t_tekst)
    s_kor = korijeni(s_tekst)

    # 1. STRUKTURA — koliko poglavlja sažetak tvrdi da rad ima
    stvarno = len(naslovi)
    for m in re.finditer(r"\b(\d{1,2}|[a-zšđčćž]+)\s+" + CJELINA, s_tekst, re.I):
        rijec = m.group(1).lower()
        n = int(rijec) if rijec.isdigit() else BROJEVI.get(rijec)
        if n is None:
            continue
        pojam = m.group(2).lower()
        if not pojam.startswith(("poglavlj", "potpoglavlj")):
            continue                      # „pet cjelina" je autorska podjela, ne broj naslova
        if n != stvarno:
            nalazi.append({
                "vrsta": "struktura",
                "poruka": (f"sažetak tvrdi \u201e{m.group(0)}\u201d, "
                           f"a rad ima {stvarno} naslova prve razine"),
                "detalj": " · ".join(naslovi),
            })

    # 2. POJMOVI iz sažetka kojih u tijelu nema
    #
    # Prag duljine od sedam znakova nije proizvoljan: kraće riječi su u pravilu
    # gramatika („kasnio", „skupu"), a nalaz o njima je šum koji zatrpa jedini
    # nalaz koji vrijedi — pojam koji je sažetak zadržao, a rad ga je ispustio.
    primjeri = []
    for w in re.findall(r"[A-Za-zČĆŽŠĐčćžšđ]{7,}", s_tekst):
        if w.lower() in STOP or w.lower() in META_SAZETKA:
            continue
        if not spominje_se(w, t_tekst, t_kor):
            primjeri.append(w)
    if primjeri:
        nalazi.append({
            "vrsta": "pojam",
            "poruka": f"{len(set(primjeri))} pojmova iz sažetka ne pojavljuje se u tijelu",
            "detalj": ", ".join(sorted(set(primjeri))[:12]),
        })

    # 3. BROJKE iz sažetka kojih u tijelu nema
    s_br, t_br = brojke(s_tekst), brojke(t_tekst)
    visak = sorted(s_br - t_br)
    if visak:
        nalazi.append({
            "vrsta": "brojka",
            "poruka": "brojka iz sažetka ne pojavljuje se u tijelu rada",
            "detalj": ", ".join(visak),
        })

    # 4. KLJUČNE RIJEČI kojih u tijelu nema
    bez_potvrde = [k for k in kljucne if not spominje_se(k, t_tekst, t_kor)]
    if bez_potvrde:
        nalazi.append({
            "vrsta": "ključne riječi",
            "poruka": "ključna riječ ne pojavljuje se u tijelu rada",
            "detalj": ", ".join(bez_potvrde),
        })

    # 5. SAŽETAK ↔ ZAKLJUČAK — nalaz bez parnjaka
    z_kor = korijeni(" ".join(zakljucak))
    bez_parnjaka = []
    if zakljucak:
        for r in hr_text.recenice(s_tekst):
            k = korijeni(r)
            if len(k) < 4:
                continue
            if preklapanje(k, z_kor) < 0.30:
                bez_parnjaka.append(r)
    else:
        obavijesti.append("ne nalazim poglavlje zaključka — provjera parnjaka preskočena")
    if bez_parnjaka:
        nalazi.append({
            "vrsta": "zaključak",
            "poruka": f"{len(bez_parnjaka)} tvrdnji iz sažetka nema parnjaka u zaključku",
            "detalj": " || ".join(r[:110] for r in bez_parnjaka[:4]),
        })

    # 6. paritetna tablica za ručnu potvrdu
    t_recenice = [(rec, pog) for odl, pog in tijelo for rec in hr_text.recenice(odl)]
    parovi = []
    vidjeno = set()
    for recenica in hr_text.recenice(s_tekst):
        for r in tvrdnje(recenica):
            if r in vidjeno:
                continue
            vidjeno.add(r)
            k = korijeni(r)
            if len(k) < 4:
                continue
        # Dva najbliža mjesta, ne jedno. Duga rečenica sažetka nosi više tvrdnji,
        # a najbolji pogodak redovito padne na onu koja je najfrekventnija —
        # tvrdnja koja proturječi radu tako ostane izvan vidnog polja. Na
        # stvarnom radu rečenica o LNG terminalu poklopila se s tezom iz uvoda,
        # a odlomak koji je opovrgava bio je tek drugi po redu.
            rangirano = sorted(((preklapanje(k, korijeni(tr)), tr, pog)
                                for tr, pog in t_recenice),
                               key=lambda x: x[0], reverse=True)[:2]
            parovi.append({
                "sazetak": r,
                "tijelo": [{"tekst": tr, "poglavlje": pog, "poklapanje": round(pk, 2)}
                           for pk, tr, pog in rangirano],
            })

    return {
        "poglavlja": stvarno,
        "naslovi": naslovi,
        "rijeci_sazetka": len(hr_text.rijeci(s_tekst)),
        "kljucne_rijeci": kljucne,
        "nalazi": nalazi,
        "obavijesti": obavijesti,
        "parovi": parovi,
    }


def ispisi(r, tablica=False):
    print("=" * 74)
    print("SAŽETAK PROTIV RADA")
    print("=" * 74)
    if "greska" in r:
        print("❌ " + r["greska"])
        return 1
    print(f"poglavlja u radu: {r['poglavlja']} · riječi u sažetku: {r['rijeci_sazetka']} · "
          f"ključnih riječi: {len(r['kljucne_rijeci'])}")

    for o in r["obavijesti"]:
        print(f"ℹ️  {o}")

    if not r["nalazi"]:
        print("\n✅ sažetak se slaže s radom u svemu što se dade izmjeriti")
    else:
        print(f"\n❌ NALAZA: {len(r['nalazi'])}")
        for n in r["nalazi"]:
            print(f"   · [{n['vrsta']}] {n['poruka']}")
            if n.get("detalj"):
                print(f"       {n['detalj'][:300]}")

    if tablica:
        print("\n" + "-" * 74)
        print("PARITETNA TABLICA — svaka tvrdnja sažetka uz mjesto u tijelu")
        print("Proturječje se ne može izmjeriti; ovo je popis za oko.")
        print("-" * 74)
        for p in r["parovi"]:
            najbolje = p["tijelo"][0]["poklapanje"] if p["tijelo"] else 0.0
            oznaka = "  " if najbolje >= 0.30 else "⚠ "
            print(f"\n{oznaka}SAŽETAK  {p['sazetak'][:150]}")
            if not p["tijelo"]:
                print("  TIJELO   —")
            for m in p["tijelo"]:
                pog = (m.get("poglavlje") or "").split(".")[0]
                print(f"  {('pog. ' + pog) if pog else 'TIJELO':<8} "
                      f"({m['poklapanje']:.2f}) {m['tekst'][:140]}")

    print("\nProturječje između sažetka i tijela alat NE vidi. Za tvrdnje koje")
    print("sažetak iznosi kao nalaz pročitaj paritetnu tablicu (--tablica).")
    return 1 if r["nalazi"] else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("rad")
    ap.add_argument("--tablica", action="store_true",
                    help="ispiši paritetnu tablicu sažetak ↔ tijelo")
    ap.add_argument("--json", dest="json_out")
    ap.add_argument("--kat", help="putanja do .katedra/ (za jezik rada)")
    ap.add_argument("--project-root", dest="project_root")
    ap.add_argument("--profil", help="resolved_profile.json (za jezik rada)")
    a = ap.parse_args()

    import context as _c
    smije, _j, _iz = J.guard("provjeri_sazetak", ("hr",),
                             kat=a.kat or _c.resolve_state_dir(
                                 None, a.project_root),
                             profil=getattr(a, "profil", None))
    if not smije:
        return 0


    r = provjeri(a.rad)
    kod = ispisi(r, a.tablica)
    if a.json_out:
        json.dump(r, open(a.json_out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"\n✔ JSON: {a.json_out}")
    sys.exit(kod)


if __name__ == "__main__":
    main()
