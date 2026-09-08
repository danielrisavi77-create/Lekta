#!/usr/bin/env python3
"""Faza A4 — metapodaci .docx-a: što dokument o sebi govori kad ga nitko ne čita.

Uporaba:
  python3 provjeri_metapodatke.py rad.docx
  python3 provjeri_metapodatke.py rad.docx --autor "Ime Prezime" --naslov "…" --postavi
  python3 provjeri_metapodatke.py rad.docx --json .katedra/metapodaci.json

Zašto postoji
-------------
Cijeli lanac čita tekst, brojke, citate i polja. Nitko dosad nije pogledao
`docProps/`. Izmjereno na šest stvarnih radova, i nijedan nije bio čist:

* `cp:lastModifiedBy` = „Provenance Test Generator" u radu koji ide mentorici;
* `app.Company` = „HT" u studentskom seminarskom radu (ime poslodavca);
* `dc:creator` = „Student", `lastModifiedBy` = „PC" (ostavljeni predlošci);
* `app.Pages` = 1 u radu od 67 stranica (zastarjela statistika koju Word prikaže);
* `app.TotalTime` = 0 u diplomskom od 50 stranica, i 21 474 (358 sati) u drugom;
* `dc:title` prazan ili zaostao iz radne verzije („poglavlja 1–3" u gotovu radu).

Ovo su podaci koji putuju s dokumentom u repozitorij, na provjeru podudarnosti i
u mentoričin inbox. Nitko ih ne vidi u Wordu dok ne otvori Datoteka → Podaci.

Što alat radi i što NE radi
---------------------------
RADI: čita i prijavljuje, i s `--postavi` upisuje polja koja mu se izrijekom
zadaju (autor, naslov, tema, ključne riječi), te s `--ocisti-curenje` uklanja
ono što u radu nema što raditi: naziv tvrtke, upravitelja, naziv predloška koji
nije `Normal`, lokalne putanje i tragove alata iz `lastModifiedBy`.

NE RADI: ne dira `w:rsid` oznake, povijest praćenih izmjena ni autore komentara.
Te se stavke PRIJAVLJUJU da autor zna da postoje, i uklanjaju se prihvaćanjem
izmjena (`revizije.py prihvati`), ne brisanjem tragova. Alat koji bi ih brisao
služio bi jednoj svrsi: onemogućavanju provjere podrijetla dokumenta.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
import zipfile
from xml.etree import ElementTree as ET

NS = {
    "dc": "http://purl.org/dc/elements/1.1/",
    "cp": "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
    "dcterms": "http://purl.org/dc/terms/",
    "ep": "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties",
}
for k, v in NS.items():
    ET.register_namespace(k, v)

# Nizovi koji odaju alat ili radnu okolinu, a ne autora.
TRAGOVI_ALATA = re.compile(
    r"(?i)(generator|python|docx|script|test|template|admin|user\b|pc\b|laptop|"
    r"desktop|localhost|claude|gpt|openai|anthropic|bot\b)")
PLACEHOLDER = {"student", "pc", "user", "korisnik", "autor", "ime prezime",
               "ime i prezime", "n.n.", "unknown", "nepoznato"}


def _core(z):
    try:
        return ET.fromstring(z.read("docProps/core.xml"))
    except KeyError:
        return None


def _app(z):
    try:
        return ET.fromstring(z.read("docProps/app.xml"))
    except KeyError:
        return None


def _t(el):
    return (el.text or "").strip() if el is not None else ""


def procitaj(put: str) -> dict:
    out = {"core": {}, "app": {}, "tragovi": {}, "custom": False}
    with zipfile.ZipFile(put) as z:
        imena = z.namelist()
        c = _core(z)
        if c is not None:
            for polje, staza in [
                ("autor", "dc:creator"), ("zadnji_uredio", "cp:lastModifiedBy"),
                ("naslov", "dc:title"), ("tema", "dc:subject"),
                ("kljucne_rijeci", "cp:keywords"), ("opis", "dc:description"),
                ("kategorija", "cp:category"), ("revizija", "cp:revision"),
                ("nastalo", "dcterms:created"), ("mijenjano", "dcterms:modified"),
                ("zadnje_ispisano", "cp:lastPrinted"),
            ]:
                out["core"][polje] = _t(c.find(staza, NS))
        a = _app(z)
        if a is not None:
            for tag in ("Application", "AppVersion", "Company", "Manager", "Template",
                        "TotalTime", "Pages", "Words", "Characters"):
                out["app"][tag] = _t(a.find(f"ep:{tag}", NS))
        out["custom"] = "docProps/custom.xml" in imena
        doc = z.read("word/document.xml").decode("utf-8", "ignore")
        out["tragovi"] = {
            "autori_izmjena": sorted(set(re.findall(r'w:author="([^"]+)"', doc))),
            "rsid_sesija": len(set(re.findall(r'w:rsid[A-Za-z]*="([0-9A-Fa-f]{8})"', doc))),
            "ima_comments": "word/comments.xml" in imena,
            "ima_people": "word/people.xml" in imena,
        }
        putanje = []
        for dio in imena:
            if dio.endswith(".rels"):
                r = z.read(dio).decode("utf-8", "ignore")
                putanje += re.findall(r'Target="(file:[^"]+|[A-Za-z]:\\[^"]+)"', r)
        out["tragovi"]["lokalne_putanje"] = sorted(set(putanje))[:10]
    return out


def ime_s_naslovnice(put: str) -> str:
    """Ime koje rad SAM navodi kao autora, iz prvih odlomaka naslovnice."""
    try:
        from docx import Document
    except ImportError:
        return ""
    d = Document(put)
    redci = [p.text.strip() for p in d.paragraphs[:40] if p.text.strip()]
    for i, r in enumerate(redci):
        if re.fullmatch(r"(?i)(ime i prezime|student(ica)?|autor(ica)?)\s*:?", r) and i + 1 < len(redci):
            return redci[i + 1]
        m = re.match(r"(?i)^(?:student(?:ica)?|autor(?:ica)?)\s*:\s*(.+)$", r)
        if m:
            return m.group(1).strip()
    # inače: prvi redak od dvije do tri riječi s velikim početnim slovima
    for r in redci[:20]:
        rijeci = r.split()
        if 2 <= len(rijeci) <= 3 and all(w[:1].isupper() for w in rijeci) \
                and not re.search(r"(?i)sveučilište|fakultet|studij|zagreb|rijeka|osijek|split", r):
            return r
    return ""


def nalazi(m: dict, deklarirani_autor: str = "") -> list[tuple[str, str]]:
    """[(težina, poruka)]; težina je 'g' greška, 'u' upozorenje, 'o' granica."""
    n = []
    c, a, tr = m["core"], m["app"], m["tragovi"]

    for polje, opis in [("autor", "dc:creator"), ("zadnji_uredio", "cp:lastModifiedBy")]:
        v = c.get(polje, "")
        if not v:
            n.append(("u", f"{opis} je prazan — dokument ne navodi {opis.split(':')[1]}"))
            continue
        if v.strip().lower() in PLACEHOLDER:
            n.append(("g", f"{opis} = „{v}” je ostavljen predložak, ne ime"))
        elif TRAGOVI_ALATA.search(v):
            n.append(("g", f"{opis} = „{v}” odaje alat ili radnu okolinu, "
                           f"a ne autora rada"))

    if deklarirani_autor:
        aut = (c.get("autor") or "").strip()
        if aut and aut.lower() not in PLACEHOLDER and not TRAGOVI_ALATA.search(aut):
            prez_meta = {w.lower().strip(",.") for w in aut.split()}
            prez_nasl = {w.lower().strip(",.") for w in deklarirani_autor.split()}
            if not (prez_meta & prez_nasl):
                n.append(("g", f"dc:creator = „{aut}”, a naslovnica navodi "
                               f"„{deklarirani_autor}” — metapodatak i rad ne govore isto"))

    if not c.get("naslov"):
        n.append(("u", "dc:title je prazan — repozitoriji ga često preuzimaju kao naslov"))

    if a.get("Company"):
        n.append(("g", f"app.Company = „{a['Company']}” — naziv tvrtke nema što raditi "
                       f"u studentskom radu"))
    if a.get("Manager"):
        n.append(("g", f"app.Manager = „{a['Manager']}” — polje iz poslovnog predloška"))
    if a.get("Template") and a["Template"] != "Normal":
        n.append(("u", f"app.Template = „{a['Template']}” — odaje predložak iz kojeg je "
                       f"dokument nastao"))

    tt = a.get("TotalTime")
    if tt and tt.isdigit():
        minuta = int(tt)
        if minuta == 0:
            n.append(("u", "app.TotalTime = 0 — dokument tvrdi da nije uređivan ni minutu"))
        elif minuta > 20000:
            n.append(("u", f"app.TotalTime = {minuta} min ({minuta / 60:.0f} h) — "
                           f"brojač je zaglavljen, Word ga prikazuje u Podacima"))

    if a.get("Pages", "").isdigit() and int(a["Pages"]) <= 1:
        n.append(("u", f"app.Pages = {a['Pages']} — zastarjela statistika; osvježi je "
                       f"otvaranjem i spremanjem u Wordu"))

    if c.get("nastalo") and c.get("nastalo") == c.get("mijenjano"):
        n.append(("o", "dcterms:created = dcterms:modified — dokument je generiran, "
                       "ne uređivan; to je točan opis stanja, ne kvar"))

    if tr["autori_izmjena"]:
        n.append(("g", f"praćene izmjene ili komentari nose imena: "
                       f"{', '.join(tr['autori_izmjena'])} — prihvati izmjene "
                       f"(revizije.py prihvati) prije predaje"))
    if tr["ima_comments"] or tr["ima_people"]:
        n.append(("u", "dokument nosi komentare (word/comments.xml) — provjeri je li to "
                       "namjerno prije predaje"))
    if tr["lokalne_putanje"]:
        n.append(("g", f"lokalne putanje u relacijama: {tr['lokalne_putanje'][0]} "
                       f"(ukupno {len(tr['lokalne_putanje'])}) — odaju mapu s računala"))
    if m["custom"]:
        n.append(("u", "docProps/custom.xml postoji — prilagođena svojstva se rijetko "
                       "postavljaju namjerno"))
    return n


def postavi(put: str, izlaz: str, polja: dict, ocisti_curenje: bool) -> list[str]:
    """Upiši zadana polja i, po izboru, ukloni ono što curi. Vrati popis promjena."""
    promjene = []
    tmp = tempfile.mkdtemp(prefix="meta-")
    try:
        with zipfile.ZipFile(put) as z:
            z.extractall(tmp)
        core_put = os.path.join(tmp, "docProps", "core.xml")
        if os.path.exists(core_put):
            c = ET.parse(core_put)
            root = c.getroot()
            staze = {"autor": "dc:creator", "naslov": "dc:title", "tema": "dc:subject",
                     "kljucne_rijeci": "cp:keywords", "zadnji_uredio": "cp:lastModifiedBy"}
            for polje, vrijednost in polja.items():
                if vrijednost is None:
                    continue
                staza = staze.get(polje)
                el = root.find(staza, NS)
                if el is None:
                    pre, tag = staza.split(":")
                    el = ET.SubElement(root, f"{{{NS[pre]}}}{tag}")
                el.text = vrijednost
                promjene.append(f"{staza} = „{vrijednost}”")
            c.write(core_put, xml_declaration=True, encoding="UTF-8")

        app_put = os.path.join(tmp, "docProps", "app.xml")
        if ocisti_curenje and os.path.exists(app_put):
            a = ET.parse(app_put)
            root = a.getroot()
            for tag in ("Company", "Manager"):
                el = root.find(f"ep:{tag}", NS)
                if el is not None and (el.text or "").strip():
                    promjene.append(f"uklonjeno app.{tag} = „{el.text.strip()}”")
                    root.remove(el)
            el = root.find("ep:Template", NS)
            if el is not None and (el.text or "").strip() not in ("", "Normal"):
                promjene.append(f"app.Template „{el.text.strip()}” → Normal")
                el.text = "Normal"
            a.write(app_put, xml_declaration=True, encoding="UTF-8")

        if os.path.exists(izlaz):
            os.remove(izlaz)
        zf = zipfile.ZipFile(izlaz, "w", zipfile.ZIP_DEFLATED)
        for korijen, _d, fajlovi in os.walk(tmp):
            for fn in fajlovi:
                fp = os.path.join(korijen, fn)
                zf.write(fp, os.path.relpath(fp, tmp))
        zf.close()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return promjene


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Metapodaci .docx-a: pročitaj, prijavi, uskladi.")
    ap.add_argument("rad")
    ap.add_argument("--autor")
    ap.add_argument("--naslov")
    ap.add_argument("--tema")
    ap.add_argument("--kljucne-rijeci", dest="kljucne_rijeci")
    ap.add_argument("--postavi", action="store_true",
                    help="upiši zadana polja u NOVU datoteku (--izlaz)")
    ap.add_argument("--ocisti-curenje", dest="ocisti_curenje", action="store_true",
                    help="ukloni Company, Manager i naziv predloška")
    ap.add_argument("--izlaz", help="izlazna datoteka za --postavi (zadano: rad-meta.docx)")
    ap.add_argument("--json", dest="json_out")
    a = ap.parse_args(argv)

    if not os.path.isfile(a.rad):
        print(f"❌ nema datoteke: {a.rad}", file=sys.stderr)
        return 2

    m = procitaj(a.rad)
    deklarirani = ime_s_naslovnice(a.rad)
    n = nalazi(m, deklarirani)

    print("=" * 62)
    print("A4 — METAPODACI —", os.path.basename(a.rad))
    print("=" * 62)
    for polje, v in m["core"].items():
        if v:
            print(f"  {polje:16} {v[:80]}")
    for tag, v in m["app"].items():
        if v:
            print(f"  app.{tag:12} {v[:60]}")
    if deklarirani:
        print(f"  {'naslovnica':16} {deklarirani}")
    print(f"  {'rsid sesija':16} {m['tragovi']['rsid_sesija']}")

    greske = [x for t, x in n if t == "g"]
    upoz = [x for t, x in n if t == "u"]
    gran = [x for t, x in n if t == "o"]
    for naslov, popis, znak in [("PODACI KOJI NE SMIJU OTIĆI S RADOM", greske, "⚠"),
                                ("PROVJERI PRIJE PREDAJE", upoz, "⚠"),
                                ("GRANICE", gran, "ℹ️")]:
        if popis:
            print(f"\n{znak} {naslov} ({len(popis)}):")
            for x in popis:
                print(f"   • {x}")
    if not (greske or upoz):
        print("\n✅ metapodaci ne odaju ništa što rad ne bi trebao nositi")

    if a.json_out:
        with open(a.json_out, "w", encoding="utf-8") as fh:
            json.dump({**m, "naslovnica": deklarirani,
                       "nalazi": [{"tezina": t, "poruka": x} for t, x in n]},
                      fh, ensure_ascii=False, indent=2)

    if a.postavi or a.ocisti_curenje:
        izlaz = a.izlaz or (os.path.splitext(a.rad)[0] + "-meta.docx")
        if os.path.abspath(izlaz) == os.path.abspath(a.rad):
            print("❌ izlaz ne smije biti isti kao ulaz", file=sys.stderr)
            return 2
        polja = {"autor": a.autor, "naslov": a.naslov, "tema": a.tema,
                 "kljucne_rijeci": a.kljucne_rijeci}
        promjene = postavi(a.rad, izlaz, polja, a.ocisti_curenje)
        print(f"\n✔ {izlaz}")
        for p in promjene:
            print(f"   {p}")
        print("   Praćene izmjene, autori komentara i rsid oznake NISU dirane: "
              "one se rješavaju prihvaćanjem izmjena, ne brisanjem tragova.")
        return 0

    return 1 if greske else 0


if __name__ == "__main__":
    sys.exit(main())
