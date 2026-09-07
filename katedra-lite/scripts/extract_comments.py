#!/usr/bin/env python3
"""Komentari mentora i praćene izmjene iz .docx-a → trajna checklista zamjerki.

python-docx ne izlaže komentare, pa se `word/comments.xml` čita izravno iz zipa,
a praćene izmjene (`w:ins` / `w:del`) iz `word/document.xml`. Za svaki komentar
skripta traži na koji se tekst odnosi (raspon `commentRangeStart`…`commentRangeEnd`)
i najbliži naslov iznad njega — to je `mjesto`.

Komentar mentora koji se spomene u intakeu pa zaboravi je najskuplja greška u
procesu. Zato zamjerke žive u `.katedra/zamjerke.json`, ne u razgovoru, i
zatvaraju se tek kad je u tekstu vidljivo riješeno (`--zatvori` uz `--gdje`).

Oblik zapisa je ugovor iz `references/stanje_schema.md`. Ponovno pokretanje nad
istim `--out` NE gubi ručno zatvorene zamjerke — spaja se po `izvor_id` (Word id
komentara odnosno praćene izmjene), a tekst služi samo kao rezerva za zapise od
prije uvođenja tog polja. Dva jednaka komentara („Izvor?" u 1. i u 2. poglavlju)
ostaju dvije zamjerke.

Klasifikacija `tip` (sadrzaj/struktura/citiranje/stil/forma) je HEURISTIKA po
ključnim riječima komentara. Pogrešnu oznaku ispravi ručno u JSON-u ili je
jednostavno zanemari — bitan je tekst zamjerke, ne etiketa.

Uporaba:
  python3 <KATEDRA_SKILL>/scripts/extract_comments.py ./rad.docx --out ./.katedra/zamjerke.json
  python3 <KATEDRA_SKILL>/scripts/extract_comments.py ./rad.docx --pregled
  python3 <KATEDRA_SKILL>/scripts/extract_comments.py ./rad.docx --zatvori z3 --gdje "3.2, prepisan odlomak"
  python3 <KATEDRA_SKILL>/scripts/extract_comments.py --otvorene ./.katedra/zamjerke.json

Izlazni kodovi:
  0  gotovo, nema otvorenih zamjerki
  1  gotovo, ima otvorenih zamjerki (self-check prije isporuke ih mora proći)
  2  datoteka se ne može pročitati, ili je zahtjev nedosljedan (npr. --zatvori bez --gdje)
"""
import argparse
import json
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import hr_text as H  # noqa: E402
from context import (NesigurnaPutanja, atomic_write_json, resolve_project_root,  # noqa: E402
                     resolve_state_file)
from artifact_state import record_artifact  # noqa: E402
from mentor_feedback_state import (CURRENT_FEEDBACK_VERSION, merge_feedback, migrate_feedback,
                                   resolve_feedback)  # noqa: E402

_DEFAULT_STATE = "__KATEDRA_PROJECT_STATE__"

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
# v1.1-ispravak D1: paraId komentara (w14) i njegov zapis u commentsExtended (w15)
W14 = "{http://schemas.microsoft.com/office/word/2010/wordml}"
W15 = "{http://schemas.microsoft.com/office/word/2012/wordml}"
VERZIJA = CURRENT_FEEDBACK_VERSION
TIPOVI = ("sadrzaj", "struktura", "citiranje", "stil", "forma")

# Redoslijed je namjeran: specifičnije kategorije prije općenitih.
PRAVILA = [
    ("citiranje", r"(?i)\b(citat|citir|izvor|referenc|literatur|bibliograf|doi|"
                  r"parafraz|navod|plagij|prepisan|str\.|stranic|fusnot|"
                  r"nije\s+navedeno\s+odakle|odakle\s+ovo)"),
    ("forma", r"(?i)\b(font|margin|prored|razmak|poravnan|numeracij|paginacij|"
              r"naslovnic|prijelom|tablic\w*\s+(?:nije|nema|treba)|natpis|"
              r"format|stil\s+naslova|sadržaj\s+se\s+ne\s+ažurira|velika\s+slova)"),
    ("struktura", r"(?i)\b(struktur|poglavlj|potpoglavlj|redoslijed|premjesti|"
                  r"ne\s+pripada\s+ovdje|prebaci|razdvoj|spoji|uvod\s+je|"
                  r"zaključak\s+(?:ne|je)|organizacij|slijed)"),
    ("stil", r"(?i)\b(stil|ton|rečenic|izraz|formulacij|nezgrapno|nejasno\s+napisano|"
             r"gramat|pravopis|tipfeler|predugačk\w*\s+rečenic|kolokvijaln|"
             r"publicistič|preopširno)"),
    ("sadrzaj", r"(?i)\b(nedostaje|objasni|razrad|argument|kritič|dokaz|netočno|"
                r"nije\s+točno|produbi|analiz|površno|nema\s+podloge|obrazloži|"
                r"proširi|zašto)"),
]


# ------------------------------------------------------------------- .docx

# v1.1-ispravak Q19: .docx je zip, a zip zna lagati o svojoj veličini. Dijelovi su
# se dosad čitali golim z.read(), pa je namjerno napuhan (ili samo pokvaren)
# document.xml od nekoliko kilobajta na disku razmotao 2 GB u memoriju i srušio
# sesiju studenta usred provjere.
#
# 2. krug (nedovršen popravak): prvi popravak je granicu provjeravao nad
# `ZipInfo.file_size`, a to je DEKLARIRANA veličina iz zaglavlja zipa — polje koje
# upisuje onaj tko pravi datoteku. Dovoljno je bilo prepisati ta 4 bajta u „5000"
# i arhiva od 1,5 MB prošla je kroz stražu, a pri z.read() narasla na 2 GB RSS i
# završila golim traceback-om (BadZipFile „Bad CRC-32" nije se hvatao). Strop zato
# stoji nad STVARNO pročitanim bajtovima: dio se dekompresira u komadima i čitanje
# staje čim zbroj prijeđe granicu, pa potrošnja memorije ne ovisi o tome što
# arhiva o sebi tvrdi. Prag je ~150× veći od `word/document.xml` stvarnog EFZG
# završnog rada (400 kB), pa ne može odbiti pravi rukopis.
MAX_XML_BAJTOVA = 64 * 1024 * 1024


def _procitaj_dio(z, ime):
    """(sadržaj, poruka) — poruka je None kad je čitanje uspjelo.

    (None, None) znači „dijela nema" i to je uobičajen ulaz (rad bez komentara),
    pa se o njemu ne javlja ništa. (None, poruka) znači da dio postoji, ali se ne
    može sigurno pročitati — ili je iznad stropa ili je zapis u zipu oštećen.
    Razlog se namjerno ne razdvaja u dvije poruke: obje strane laganog zaglavlja
    izgledaju isto do trenutka kad bi ih razlikovanje već koštalo memorije, a
    savjet studentu je u oba slučaja isti.
    """
    try:
        z.getinfo(ime)
    except KeyError:
        return None, None
    sadrzaj = H.procitaj_dio_zipa(z, ime, MAX_XML_BAJTOVA)
    if sadrzaj is None:
        return None, (f"{ime} se ne može sigurno pročitati: raspakiran prelazi "
                      f"{MAX_XML_BAJTOVA // (1024 * 1024)} MB ili je zapis u zipu oštećen")
    return sadrzaj, None


def otvori(put):
    if not os.path.isfile(put):
        print(f"❌ nema datoteke: {put}\n"
              f"   Što napraviti: provjeri putanju (skripta se pokreće iz scripts/, "
              f"rad je obično ./rad.docx).", file=sys.stderr)
        return None
    try:
        z = zipfile.ZipFile(put)
    except zipfile.BadZipFile:
        print(f"❌ {os.path.basename(put)} nije valjan .docx (zip se ne otvara).\n"
              f"   Što napraviti: otvori ga u Wordu i spremi kao .docx, ili provjeri "
              f"je li to preimenovani .doc / oštećen prijenos.", file=sys.stderr)
        return None
    except OSError as e:
        print(f"❌ {put} se ne može otvoriti: {e}", file=sys.stderr)
        return None
    if "word/document.xml" not in z.namelist():
        z.close()
        print(f"❌ {os.path.basename(put)} nema word/document.xml — to nije Word dokument.",
              file=sys.stderr)
        return None
    _, poruka = _procitaj_dio(z, "word/document.xml")
    if poruka:
        z.close()
        print(f"❌ {os.path.basename(put)}: {poruka} — to nije rad nego oštećen ili "
              f"namjerno napuhan zip.\n"
              f"   Što napraviti: uzmi datoteku koju ti je mentor stvarno poslao, "
              f"ili je otvori u Wordu i spremi ponovno kao .docx.", file=sys.stderr)
        return None
    return z


def _xml(z, ime):
    sadrzaj, poruka = _procitaj_dio(z, ime)
    if poruka:
        print(f"⚠️  {poruka} — preskačem taj dio.", file=sys.stderr)
        return None
    if sadrzaj is None:
        return None
    try:
        return ET.fromstring(sadrzaj)
    except ET.ParseError as e:
        print(f"⚠️  {ime} je oštećen XML ({e}) — preskačem taj dio.", file=sys.stderr)
        return None


def _kontekst(tekst_p):
    """Mjesto za izmjenu koja stoji prije prvog naslova — bolje išta nego „nije utvrđeno"."""
    if not tekst_p:
        return None
    return "prije prvog naslova, odlomak \u201e" + tekst_p[:45] + "\u2026\u201c"


def tekst_elementa(el, delovi=False):
    oznaka = f"{W}delText" if delovi else f"{W}t"
    return "".join(t.text or "" for t in el.iter(oznaka))


def _para_id_ovi(z):
    """paraId-evi iz word/commentsExtended.xml (w15) — stabilni ključevi komentara."""
    korijen = _xml(z, "word/commentsExtended.xml")
    if korijen is None:
        return set()
    return {c.get(f"{W15}paraId") for c in korijen.iter(f"{W15}commentEx")
            if c.get(f"{W15}paraId")}


def procitaj_komentare(z):
    """{id: {autor, datum, tekst, para_id}} iz word/comments.xml."""
    korijen = _xml(z, "word/comments.xml")
    if korijen is None:
        return {}
    prosireni = _para_id_ovi(z)
    out = {}
    for c in korijen.iter(f"{W}comment"):
        cid = c.get(f"{W}id")
        if cid is None:
            continue
        # v1.1-ispravak D1: paraId zadnjeg odlomka komentara je isti ključ koji
        # commentsExtended koristi; preživi preslagivanje id-eva pri spremanju.
        para_id = ""
        for p in c.iter(f"{W}p"):
            pid = p.get(f"{W14}paraId")
            if pid:
                para_id = pid
        if para_id and prosireni and para_id not in prosireni:
            para_id = ""
        out[cid] = {
            "autor": (c.get(f"{W}author") or "").strip() or "nepoznat",
            "datum": c.get(f"{W}date") or "",
            "tekst": re.sub(r"\s+", " ", tekst_elementa(c)).strip(),
            "para_id": para_id,
        }
    return out


def je_naslov(p):
    pr = p.find(f"{W}pPr")
    if pr is None:
        return False
    if pr.find(f"{W}outlineLvl") is not None:
        return True
    st = pr.find(f"{W}pStyle")
    val = (st.get(f"{W}val") or "") if st is not None else ""
    return bool(re.match(r"(?i)^(heading|naslov|title|podnaslov|hea?d)", val))


def prodji_dokument(z):
    """Vrati (rasponi, promjene, naslovi_po_rednom_broju).

    rasponi:  {id komentara: {"tekst": obuhvaćeni tekst, "naslov": najbliži naslov iznad}}
    promjene: popis {"id", "vrsta": ins|del|moveFrom|moveTo|pPrChange|rPrChange,
                     "autor", "datum", "tekst", "naslov"}
    """
    korijen = _xml(z, "word/document.xml")
    if korijen is None:
        return {}, []
    rasponi, promjene = {}, []
    aktivni = {}          # id → [dijelovi teksta]
    zadnji_naslov = None
    naslov_pri_pocetku = {}

    for p in korijen.iter(f"{W}p"):
        tekst_p = re.sub(r"\s+", " ", tekst_elementa(p)).strip()
        naslov_ovdje = je_naslov(p) and tekst_p
        # v1.1-ispravak Q8(e): komentar sidren NA naslovu pripada tom naslovu,
        # a ne prethodnome — mjesto se računa prije nego što naslov postane
        # „zadnji naslov" za odlomke ispod njega.
        naslov_ovog_p = tekst_p if naslov_ovdje else zadnji_naslov

        for el in p.iter():
            tag = el.tag
            if tag == f"{W}commentRangeStart":
                cid = el.get(f"{W}id")
                if cid is not None:
                    aktivni.setdefault(cid, [])
                    naslov_pri_pocetku[cid] = naslov_ovog_p
            elif tag == f"{W}commentRangeEnd":
                cid = el.get(f"{W}id")
                if cid in aktivni:
                    rasponi[cid] = {
                        "tekst": re.sub(r"\s+", " ", "".join(aktivni.pop(cid))).strip(),
                        "naslov": naslov_pri_pocetku.get(cid) or naslov_ovog_p,
                    }
            elif tag == f"{W}commentReference":
                cid = el.get(f"{W}id")
                if cid is not None and cid not in rasponi and cid not in aktivni:
                    # komentar bez raspona: vezan uz odlomak u kojem stoji sidro
                    rasponi[cid] = {"tekst": tekst_p, "naslov": naslov_ovog_p}
            elif tag == f"{W}t":
                t = el.text or ""
                for v in aktivni.values():
                    v.append(t)

        # izmjena prije prvog naslova (npr. u samom naslovu) i dalje treba
        # mjesto — tada služi početak odlomka u kojem stoji
        mjesto_izmjene = naslov_ovog_p or _kontekst(tekst_p)

        def _dodaj(el, vrsta, tekst):
            promjene.append({
                "id": el.get(f"{W}id") or f"bez-id-{len(promjene)}",
                "vrsta": vrsta,
                "autor": (el.get(f"{W}author") or "").strip() or "nepoznat",
                "datum": el.get(f"{W}date") or "",
                "tekst": tekst,
                "naslov": mjesto_izmjene,
            })

        for el in p.iter():
            # v1.1-ispravak Q8(b): premještanje teksta (moveFrom/moveTo) je
            # praćena izmjena kao i svaka druga — prije se uopće nije čitala.
            vrsta = {f"{W}ins": "ins", f"{W}del": "del",
                     f"{W}moveFrom": "moveFrom", f"{W}moveTo": "moveTo"}.get(el.tag)
            if vrsta is None:
                continue
            delovi = vrsta in ("del", "moveFrom")
            t = re.sub(r"\s+", " ", tekst_elementa(el, delovi=delovi)).strip()
            if not t:
                continue
            _dodaj(el, vrsta, t)

        # v1.1-ispravak Q8(b): promjene oblikovanja (pPrChange/rPrChange) nemaju
        # vlastiti tekst, pa se bilježe uz tekst na koji se odnose.
        pr = p.find(f"{W}pPr")
        ppc = pr.find(f"{W}pPrChange") if pr is not None else None
        if ppc is not None:
            _dodaj(ppc, "pPrChange", tekst_p)
        for r in p.iter(f"{W}r"):
            rpr = r.find(f"{W}rPr")
            rpc = rpr.find(f"{W}rPrChange") if rpr is not None else None
            if rpc is not None:
                _dodaj(rpc, "rPrChange", re.sub(r"\s+", " ", tekst_elementa(r)).strip())

        if naslov_ovdje:
            zadnji_naslov = tekst_p

    # raspon koji nikad nije zatvoren (oštećen dokument) — spasi što se može
    for cid, dijelovi in aktivni.items():
        rasponi[cid] = {"tekst": re.sub(r"\s+", " ", "".join(dijelovi)).strip(),
                        "naslov": naslov_pri_pocetku.get(cid)}
    return rasponi, promjene


# --------------------------------------------------------------- zamjerke

def klasificiraj(tekst):
    for tip, uzorak in PRAVILA:
        if re.search(uzorak, tekst or ""):
            return tip
    return "sadrzaj"


def skrati(s, n=90):
    s = re.sub(r"\s+", " ", s or "").strip()
    return s if len(s) <= n else s[:n - 1] + "…"


def mjesto_od(naslov, citat):
    dijelovi = []
    if naslov:
        dijelovi.append(skrati(naslov, 60))
    if citat:
        dijelovi.append(f"uz „{skrati(citat, 50)}\"")
    return " · ".join(dijelovi) if dijelovi else "nije utvrđeno"


OPIS_VRSTE = {
    "ins": "ubačeno",
    "del": "obrisano",
    "moveFrom": "premješteno odavde",
    "moveTo": "premješteno ovamo",
    "pPrChange": "promijenjeno oblikovanje odlomka",
    "rPrChange": "promijenjeno oblikovanje teksta",
}
BEZ_TEKSTA = "Komentar bez teksta (vjerojatno slika ili ručna bilješka) — otvori ga u Wordu."


def _jedinstven(oznaka, zauzeti):
    """Dva zapisa ne smiju dijeliti izvor_id, inače se opet slijepe pri spajanju."""
    kandidat, n = oznaka, 1
    while kandidat in zauzeti:
        n += 1
        kandidat = f"{oznaka}#{n}"
    zauzeti.add(kandidat)
    return kandidat


def iz_dokumenta(put):
    """Vrati (zamjerke_bez_ida, broj_komentara, promjene) ili None pri grešci."""
    z = otvori(put)
    if z is None:
        return None
    try:
        komentari = procitaj_komentare(z)
        rasponi, promjene = prodji_dokument(z)
    finally:
        z.close()

    nove, izvori = [], set()
    for cid, k in sorted(komentari.items(), key=lambda kv: _num(kv[0])):
        r = rasponi.get(cid, {})
        # v1.1-ispravak Q8(d): komentar bez tekstualnog runa se prije brojao u
        # zaglavlju, a nestajao iz popisa — sada dobiva vidljiv redak.
        tekst = k["tekst"] or BEZ_TEKSTA
        # v1.1-ispravak D1: izvor_id je stabilan identitet komentara — paraId ako
        # postoji, inače Word id uz par autor+datum.
        if k.get("para_id"):
            oznaka = f"komentar:paraId:{k['para_id']}"
        else:
            oznaka = f"komentar:id:{cid}@{k['autor']}|{k['datum']}"
        nove.append({
            "autor": k["autor"],
            "mjesto": mjesto_od(r.get("naslov"), r.get("tekst")),
            "tekst": tekst,
            "tip": klasificiraj(k["tekst"]),
            "status": "otvoreno",
            "rijeseno_gdje": None,
            "izvor_id": _jedinstven(oznaka, izvori),
            "_datum": k["datum"],
        })

    # v1.1-ispravak Q8(a): jedna zamjerka po praćenoj izmjeni, s CIJELIM tekstom
    # izmjene. Prije su se sve izmjene jednog autora pod istim naslovom slijevale
    # u jedan zapis skraćen na 90 znakova, pa je npr. obrisani plagijat ispadao
    # iz zamjerki. Kraćenje je sada isključivo stvar ispisa.
    for pr in promjene:
        opis = OPIS_VRSTE.get(pr["vrsta"], pr["vrsta"])
        tekst = f"Praćena izmjena — {opis}: „{pr['tekst']}\"" if pr["tekst"] \
            else f"Praćena izmjena — {opis}"
        # v1.1-ispravak Q8(c): tip se klasificira iz teksta izmjene; brisanje
        # više nije automatski „stil". Promjena oblikovanja je po naravi „forma".
        tip = "forma" if pr["vrsta"] in ("pPrChange", "rPrChange") else klasificiraj(pr["tekst"])
        nove.append({
            "autor": pr["autor"],
            "mjesto": mjesto_od(pr["naslov"], None),
            "tekst": tekst,
            "tip": tip,
            "status": "otvoreno",
            "rijeseno_gdje": None,
            "izvor_id": _jedinstven(f"izmjena:{pr['vrsta']}:{pr['id']}@{pr['autor']}", izvori),
            "_datum": pr.get("datum", ""),
        })
    return nove, len(komentari), promjene


def _num(s):
    m = re.search(r"\d+", str(s))
    return int(m.group()) if m else 0


# ------------------------------------------------------------- JSON sloj

def ucitaj_json(put):
    if not os.path.isfile(put):
        return None
    try:
        with open(put, encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"❌ {put} nije čitljiv JSON: {e}\n"
              f"   Što napraviti: preimenuj datoteku i pokreni izvlačenje ponovno; "
              f"ručno zatvorene zamjerke tada prepiši u novu.", file=sys.stderr)
        return "GRESKA"
    if not isinstance(d, dict) or not isinstance(d.get("zamjerke"), list):
        print(f"❌ {put} nema očekivani oblik (ključ „zamjerke\").", file=sys.stderr)
        return "GRESKA"
    try:
        d, _ = migrate_feedback(d)
    except ValueError as e:
        print(f"❌ {put}: {e}", file=sys.stderr)
        return "GRESKA"
    return d

def spremi_json(put, podaci):
    """v1.1-ispravak Q14: zapis kroz zajednički atomarni helper.

    Fiksni „zamjerke.json.tmp" se slijedio kroz unaprijed podmetnutu simboličku
    poveznicu, pa je checklista mentorovih zamjerki — jedini trag o tome što je
    ostalo neriješeno — završila izvan projekta, a zamjerke.json ostao poveznica.
    Isti obrazac je i pucao kad dvije naredbe pišu istodobno.
    """
    atomic_write_json(put, podaci)


def _zapisi(put, podaci):
    """Zapis uz razumljivu poruku umjesto stack tracea; vraća je li uspjelo."""
    try:
        spremi_json(put, podaci)
    except NesigurnaPutanja as e:
        print(f"❌ zamjerke nisu zapisane: {e}", file=sys.stderr)
        return False
    except OSError as e:
        print(f"❌ zamjerke nisu zapisane ({e}).", file=sys.stderr)
        print("   Što napraviti: provjeri prava pisanja nad .katedra/ pa ponovi naredbu.",
              file=sys.stderr)
        return False
    return True


# `kljuc_teksta` (spajanje zamjerki po normaliziranom tekstu komentara) obrisan
# je s posljednjim pozivateljem: to je bio uzrok najtežeg nalaza audita — dva
# mentorova komentara istog teksta („Izvor?") kolabirala su u jedan zapis, pa je
# zatvaranje jednoga označavalo oba riješenima. Spajanje ide po `w:comment/@w:id`.


def spoji(stare, nove, izvor, source_meta=None):
    """Versioned merge uz očuvanje statusa i povijesti mentorovih zamjerki."""
    if source_meta is None:
        source_meta = {"path": os.path.basename(izvor), "artifact_id": None,
                       "version_id": None, "sha256": None}
    return merge_feedback(stare, nove, source_meta)

def _redoslijed(zs):
    return sorted(zs, key=lambda z: (z.get("status") != "otvoreno", _num(z.get("id"))))


# ------------------------------------------------------------------ ispis

def ispis_zamjerki(zs, naslov, samo_otvorene=False):
    izbor = [z for z in zs if not samo_otvorene or z.get("status") == "otvoreno"]
    print("=" * 78)
    print(naslov)
    print("=" * 78)
    if not izbor:
        print("  nema zamjerki za prikaz")
        return 0
    for z in izbor:
        znak = "☐" if z.get("status") == "otvoreno" else "☑"
        print(f"{znak} [{z.get('id')}] {z.get('tip', '?'):<10} {z.get('autor', '?')}")
        print(f"    mjesto: {z.get('mjesto', 'nije utvrđeno')}")
        # v1.1-ispravak Q8(a): puni tekst živi u zapisu, krati se tek ovdje.
        # Tekst je doslovan navod iz tuđeg dokumenta, pa ide u jasno omeđen
        # blok — nije uputa alata i ne smije se čitati kao naredba.
        print("    ⟨tekst mentora⟩")
        print(f"      {skrati(z.get('tekst'), 200)}")
        print("    ⟨/tekst mentora⟩")
        if z.get("status") != "otvoreno":
            print(f"    riješeno: {z.get('rijeseno_gdje') or '(nije zapisano gdje)'}")
    otvorenih = sum(1 for z in izbor if z.get("status") == "otvoreno")
    print()
    print(f"ukupno {len(izbor)} · otvorenih {otvorenih}")
    po_tipu = {}
    for z in izbor:
        if z.get("status") == "otvoreno":
            po_tipu[z.get("tip", "?")] = po_tipu.get(z.get("tip", "?"), 0) + 1
    if po_tipu:
        print("otvorene po tipu: " + " · ".join(f"{k} {v}" for k, v in sorted(po_tipu.items())))
    return otvorenih


# ------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(
        description="Komentari i praćene izmjene iz .docx-a → .katedra/zamjerke.json")
    ap.add_argument("rad", nargs="?", help="rad.docx (ili zamjerke.json uz --zatvori)")
    ap.add_argument("--out", metavar="PUT", help="gdje spremiti zamjerke.json")
    ap.add_argument("--project-root", default=None,
                    help="korijen rada za zadani .katedra state; inače env ili trenutni direktorij")
    ap.add_argument("--pregled", action="store_true", help="samo ispiši, ne piši datoteku")
    ap.add_argument("--zatvori", metavar="ID", help="zatvori zamjerku (traži --gdje)")
    ap.add_argument("--gdje", metavar="OPIS", help="gdje je i kako zamjerka riješena")
    ap.add_argument("--otvorene", metavar="ZAMJERKE.JSON", nargs="?",
                    const=_DEFAULT_STATE, help="ispiši samo otvorene zamjerke")
    a = ap.parse_args()
    zadani_out = resolve_state_file("zamjerke.json", project_root=a.project_root)
    if a.otvorene == _DEFAULT_STATE:
        a.otvorene = zadani_out

    # --- samo ispis otvorenih -------------------------------------------------
    if a.otvorene is not None:
        d = ucitaj_json(a.otvorene)
        if d == "GRESKA":
            return 2
        if d is None:
            print(f"Nema {a.otvorene} — zamjerke još nisu izvučene.\n"
                  f"Što napraviti: python3 <KATEDRA_SKILL>/scripts/extract_comments.py ./rad.docx --out {a.otvorene}")
            return 0
        n = ispis_zamjerki(d["zamjerke"], f"OTVORENE ZAMJERKE — {d.get('izvor', '?')}",
                           samo_otvorene=True)
        if n:
            print("\nSelf-check prije isporuke: svaka od njih mora biti vidljivo riješena "
                  "u tekstu, pa zatvorena s --zatvori <id> --gdje \"…\".")
        return 1 if n else 0

    # --- zatvaranje zamjerke --------------------------------------------------
    if a.zatvori:
        put = a.out or (a.rad if a.rad and a.rad.endswith(".json") else zadani_out)
        if not a.gdje:
            print("❌ --zatvori traži --gdje \"gdje je riješeno\".\n"
                  "   Zamjerka bez zapisa gdje je riješena nije zatvorena nego zaboravljena.",
                  file=sys.stderr)
            return 2
        d = ucitaj_json(put)
        if d == "GRESKA":
            return 2
        if d is None:
            print(f"❌ nema {put}. Prvo izvuci zamjerke:\n"
                  f"   python3 <KATEDRA_SKILL>/scripts/extract_comments.py ./rad.docx --out {put}", file=sys.stderr)
            return 2
        # v1.1-ispravak D1/2: dvostruki id se ne zaobilazi tiho — pukni glasno.
        try:
            d, nadena = resolve_feedback(d, a.zatvori, a.gdje)
        except ValueError as e:
            print(f"❌ {put}: {e}", file=sys.stderr)
            return 2
        if not nadena:
            print(f"❌ nema zamjerke s id-om „{a.zatvori}\" u {put}.\n"
                  f"   Postojeći id-evi: {', '.join(str(z.get('id')) for z in d['zamjerke']) or '—'}",
                  file=sys.stderr)
            return 2
        d["zamjerke"] = _redoslijed(d["zamjerke"])
        if not _zapisi(put, d):
            return 2
        otvorenih = sum(1 for z in d["zamjerke"] if z.get("status") == "otvoreno")
        print(f"✅ {a.zatvori} zatvorena: {a.gdje}")
        print(f"   otvorenih preostalo: {otvorenih}  → {put}")
        return 1 if otvorenih else 0

    # --- izvlačenje iz .docx --------------------------------------------------
    if not a.rad:
        ap.print_usage()
        print("\nTreba rad.docx. Primjer:\n"
              "  python3 <KATEDRA_SKILL>/scripts/extract_comments.py ./rad.docx --out ./.katedra/zamjerke.json",
              file=sys.stderr)
        return 2

    rez = iz_dokumenta(a.rad)
    if rez is None:
        return 2
    nove, broj_komentara, promjene = rez

    print("=" * 78)
    print(f"KOMENTARI I IZMJENE — {os.path.basename(a.rad)}")
    print("=" * 78)
    if not broj_komentara and not promjene:
        print("Nema komentara ni praćenih izmjena u dokumentu.")
        print("Ako ih očekuješ: provjeri je li mentor slao .docx (a ne PDF ili "
              "Google Docs izvoz) i jesu li komentari razriješeni prije spremanja.")
        if a.out and not a.pregled:
            print(f"\n{a.out} nije mijenjan.")
        else:
            print(f"\nNijedna datoteka nije zapisana ni promijenjena "
                  f"({a.out or zadani_out} nije diran).")
        return 0
    print(f"komentara: {broj_komentara} · praćenih izmjena: {len(promjene)} "
          f"(ubačeno {sum(1 for p in promjene if p['vrsta'] == 'ins')}, "
          f"obrisano {sum(1 for p in promjene if p['vrsta'] == 'del')}, "
          f"premješteno {sum(1 for p in promjene if p['vrsta'] in ('moveFrom', 'moveTo'))}, "
          f"oblikovanje {sum(1 for p in promjene if p['vrsta'] in ('pPrChange', 'rPrChange'))})")
    print("tip je heuristika po ključnim riječima — provjeri okom, po potrebi ispravi u JSON-u")
    print()

    if a.pregled or not a.out:
        privremene = []
        for i, n in enumerate(nove, 1):
            z = {k: v for k, v in n.items() if not k.startswith("_")}
            z["id"] = f"z{i}"
            privremene.append(z)
        ispis_zamjerki(privremene, "PREGLED (ništa nije zapisano)")
        # Q19: bez --out se NIŠTA ne zapisuje — reci to izrijekom i ponudi
        # točnu naredbu s istom zadanom putanjom koju koristi --otvorene.
        odrediste = a.out or zadani_out
        print(f"\nNijedna datoteka nije zapisana ni promijenjena ({odrediste} nije diran).")
        print("Što napraviti (trajna checklista koju --otvorene poslije čita):\n"
              f"  python3 <KATEDRA_SKILL>/scripts/extract_comments.py {a.rad} --out {odrediste}")
        return 1 if privremene else 0

    stare = ucitaj_json(a.out)
    if stare == "GRESKA":
        return 2
    project_root = resolve_project_root(a.project_root)
    try:
        _, artifact_rec = record_artifact(project_root, a.rad, kind="mentor_review")
    except (OSError, ValueError) as e:
        print(f"❌ mentor source artifact nije moguće verzionirati: {e}", file=sys.stderr)
        return 2
    source_meta = {
        "path": os.path.basename(a.rad),
        "artifact_id": artifact_rec.get("artifact_id"),
        "version_id": artifact_rec.get("version_id"),
        "sha256": artifact_rec.get("sha256"),
    }
    try:
        dok, stat = spoji(stare, nove, a.rad, source_meta)
    except ValueError as e:
        print(f"❌ {a.out}: {e}", file=sys.stderr)
        return 2
    if not _zapisi(a.out, dok):
        return 2
    otvorenih = ispis_zamjerki(dok["zamjerke"], f"ZAMJERKE → {a.out}")
    print(f"novih {stat['novih']} · zadržano iz prijašnjeg zapisa {stat['spojenih']} "
          f"· zamjerki iz starijih verzija {stat['zaostalih']}")
    # v1.1-ispravak D1/2: ponovno otvorena zamjerka mora biti vidljiva, inače
    # student misli da je taj redak odavno zatvorio.
    ponovno = [z for z in dok["zamjerke"]
               if any(h.get("event") == "reopened_source_text_changed"
                      and h.get("revision") == dok["revision"] for h in z.get("history") or [])]
    if ponovno:
        print(f"⚠️  ponovno otvoreno {len(ponovno)}: mentor je promijenio tekst zamjerke "
              f"({', '.join(str(z.get('id')) for z in ponovno)}).")
        print("   Što napraviti: pročitaj novi tekst — prijašnje zatvaranje se na njega "
              "ne odnosi — pa zatvori ponovno s --zatvori <id> --gdje \"…\".")
    if stat["spojenih"] or stat["zaostalih"]:
        print("Ručno zatvorene zamjerke su sačuvane (spajanje po izvornom id-u "
              "komentara/izmjene, tekst samo za starije zapise).")
    return 1 if otvorenih else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        # ispis presječen (npr. `| head`) — to nije greška, samo tiho izađi
        os._exit(0)
    except KeyboardInterrupt:
        sys.exit(130)
