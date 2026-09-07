#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Izgradnja do fiksne točke: rukopis → predajni .docx + provjereni pregled.

Dva prolaza nisu dovoljna, jer umetanje prijeloma mijenja paginaciju svega ispod.
Zato se vrti petlja dok se `toc.json` i `prelomi.json` ne prestanu mijenjati.

    python3 gradi.py --profil .katedra/resolved_profile.json
                     [--rukopis rukopis/] [--model model.json]
                     [--graditelj "python3 .../build_docx.py"]
                     [--izlaz "rad.docx"] [--krugova 6]

Korak izrade .docx-a delegira se `--graditelj` naredbi (pandoc + injektor polja).
Motor time ostaje neutralan i na kućni stil i na to koja ga skripta gradi:
danas `fpzg-diplomski/scripts/build_docx.py`, sutra vlastita.

Graditelj dobiva u okolini:
    RAD_MD, RAD_DOCX, RAD_PROFIL, RAD_TOC, RAD_PRELOMI, RAD_SADRZAJ (zivi|staticni)
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

TU = Path(__file__).resolve().parent
MODEL_UZORAK = re.compile(r"\{\{\s*model\.(.+?)\s*\}\}")
# Ne-pohlepno do „}}", jer ključ smije imati razmake i dijakritike
# („osjetljivost.Trajanje nedostupnosti"). Uz to se nakon zamjene
# provjerava da nijedan „{{" nije preživio — tiho propušten placeholder
# inače otputuje u predani rad.


def run(cmd, env=None, tiho=True):
    r = subprocess.run(cmd, shell=isinstance(cmd, str), capture_output=True,
                       text=True, encoding="utf-8", errors="replace", env=env)
    if r.returncode and not tiho:
        print(r.stdout, r.stderr, file=sys.stderr)
    return r


def hr(x, dec=2):
    return f"{float(x):.{dec}f}".replace(".", ",")


def iz_putanje(model, putanja):
    """`scenariji[1].gubitak` ili `ale/A` → vrijednost iz model.json."""
    cvor = model
    for dio in re.split(r"[./]", putanja):
        if not dio:
            continue
        m = re.match(r"^([A-Za-z0-9_-]*)\[(\d+)\]$", dio)
        if m:
            if m.group(1):
                cvor = cvor[m.group(1)]
            cvor = cvor[int(m.group(2))]
        else:
            cvor = cvor[dio]
    return cvor


# Datoteke koje izgradnja SAMA proizvodi. Bez ovoga glob ih pokupi i rad se
# udvostruči — na prihvatnom testu 113 stranica umjesto 57.
GENERIRANO = {"rad_predaja.md", "_rad.md"}


def popis_dijelova(rukopis, zadani):
    """Redoslijed dijelova rada. Abecedni glob NIJE redoslijed dokumenta —
    `literatura.md` po abecedi dolazi prije `pog1_uvod.md`. Zato je eksplicitan
    popis pravilo, a glob samo zadnja mogućnost, uz upozorenje."""
    kandidati = [zadani] if zadani else []
    kandidati += [Path(rukopis) / "dijelovi.json", Path(rukopis) / "rad.json",
                  Path(rukopis) / "dijelovi.txt"]
    for k in kandidati:
        k = Path(k)
        if not k.exists():
            continue
        if k.suffix == ".txt":
            redovi = [r.strip() for r in k.read_text(encoding="utf-8").splitlines()]
            return [r for r in redovi if r and not r.startswith("#")], str(k)
        d = json.loads(k.read_text(encoding="utf-8"))
        popis = d.get("dijelovi") if isinstance(d, dict) else d
        if popis:
            return popis, str(k)
    nadeno = sorted(x.name for x in Path(rukopis).glob("*.md")
                    if x.name not in GENERIRANO and not x.name.startswith("_"))
    if nadeno:
        print("⚠️  nema popisa dijelova (dijelovi.json / rad.json / dijelovi.txt) —\n"
              "    uzimam *.md po ABECEDI, što gotovo sigurno nije redoslijed rada.\n"
              f"    redoslijed: {', '.join(nadeno)}", file=sys.stderr)
    return nadeno, "(abecedni glob)"


def sastavi(rukopis, model, izlaz_md, popis_put=None):
    """Poglavlja u jedan markdown + zamjena {{model.*}}. Vraća popis nerazrješenih."""
    imena, odakle = popis_dijelova(rukopis, popis_put)
    if not imena:
        sys.exit(f"❌ nema dijelova rada u {rukopis}")
    komadi, nedostaju = [], []
    for ime in imena:
        if ime.strip() in ("[[SEC]]", "[[PB]]"):
            komadi.append(ime.strip())
            continue
        put = Path(rukopis) / ime
        if not put.exists():
            nedostaju.append(ime)
            continue
        komadi.append(put.read_text(encoding="utf-8").strip())
    if nedostaju:
        sys.exit("❌ dijelovi navedeni u popisu, a ne postoje:\n   · "
                 + "\n   · ".join(nedostaju))
    print(f"popis dijelova: {odakle} ({len(imena)} stavki)")
    tekst = "\n\n".join(komadi)

    nerazrjeseni = []

    def zamijeni(m):
        putanja = m.group(1)
        if model is None:
            nerazrjeseni.append(putanja)
            return m.group(0)
        try:
            v = iz_putanje(model, putanja)
        except (KeyError, IndexError, TypeError):
            nerazrjeseni.append(putanja)
            return m.group(0)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            s = repr(round(float(v), 6)).rstrip("0").rstrip(".")
            dec = len(s.split(".")[1]) if "." in s else 0
            return hr(v, max(dec, 0))
        return str(v)

    tekst = MODEL_UZORAK.sub(zamijeni, tekst)
    for ostatak in re.findall(r"\{\{[^}]{0,60}", tekst):
        nerazrjeseni.append(f"neprepoznat oblik: {ostatak.strip()}")
    Path(izlaz_md).write_text(tekst, encoding="utf-8")
    return sorted(set(nerazrjeseni)), len(imena)


# Inline markdown u naslovu. Word ga renderira kao oblikovanje, PDF nema ni jedan od tih
# znakova, pa naslov s `*brownfield*` nikad nije nađen u ispisu — a to znači stavku
# sadržaja bez broja stranice.
OZNAKE = [(re.compile(r"\*\*(.+?)\*\*"), r"\1"), (re.compile(r"\*(.+?)\*"), r"\1"),
          (re.compile(r"__(.+?)__"), r"\1"), (re.compile(r"(?<!\w)_(.+?)_(?!\w)"), r"\1"),
          (re.compile(r"`(.+?)`"), r"\1"), (re.compile(r"~~(.+?)~~"), r"\1"),
          (re.compile(r"\[(.+?)\]\([^)]*\)"), r"\1"),
          (re.compile(r"\s*\{#[^}]*\}\s*$"), "")]


def bez_oznaka(t):
    for uzorak, zamjena in OZNAKE:
        t = uzorak.sub(zamjena, t)
    return t.strip()


def naslovi_iz_md(put_md, izlaz):
    """Naslovi razine 1 i 2 redom kako stoje — ulaz za mjerenje stranica."""
    n = []
    for red in Path(put_md).read_text(encoding="utf-8").splitlines():
        m = re.match(r"^(#{1,2})\s+(.+?)\s*$", red)
        if m:
            n.append({"lvl": len(m.group(1)), "t": bez_oznaka(m.group(2))})
    json.dump(n, open(izlaz, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return n


def u_pdf(docx, pdf):
    if os.path.exists(pdf):
        os.remove(pdf)
    soffice = "/root/.claude/skills/docx/scripts/office/soffice.py"
    cmd = ([sys.executable, soffice] if os.path.exists(soffice) else ["soffice"]) + \
          ["--headless", "--convert-to", "pdf", docx]
    run(cmd)
    dobiveno = os.path.splitext(docx)[0] + ".pdf"
    if dobiveno != pdf and os.path.exists(dobiveno):
        shutil.move(dobiveno, pdf)
    return os.path.exists(pdf)


def stranica(pdf):
    m = re.search(r"Pages:\s+(\d+)", run(["pdfinfo", pdf]).stdout)
    return int(m.group(1)) if m else None


def zapisi_ako_drukcije(put, podatak):
    novo = json.dumps(podatak, ensure_ascii=False, indent=1)
    staro = Path(put).read_text(encoding="utf-8") if os.path.exists(put) else None
    if staro != novo:
        Path(put).write_text(novo, encoding="utf-8")
        return True
    return False


def izgradi(graditelj, md, docx_out, profil, sadrzaj):
    env = dict(os.environ, RAD_MD=md, RAD_DOCX=docx_out,
               RAD_PROFIL=profil or "", RAD_TOC="toc.json",
               RAD_PRELOMI="prelomi.json", RAD_SADRZAJ=sadrzaj)
    r = run(graditelj, env=env, tiho=False)
    if r.returncode or not os.path.exists(docx_out):
        sys.exit(f"❌ graditelj nije proizveo {docx_out}\n{r.stdout}\n{r.stderr}")
    # nedjeljivi blokovi + prijelomi + blokovi.json
    # Kvar 83: povratna vrijednost se nije gledala. Kad prikazi.py padne,
    # blokovi.json ostane od PROŠLE izgradnje i mjeri se pogrešan skup blokova,
    # a petlja se uredno „stabilizira" na tuđim brojevima.
    r = run([sys.executable, str(TU / "prikazi.py"), docx_out,
             "--prelomi", "prelomi.json", "--blokovi-out", "blokovi.json"])
    if r.returncode:
        sys.exit(f"❌ prikazi.py nije prošao (kod {r.returncode})\n{r.stdout}\n{r.stderr}")
    if os.path.exists("blokovi.json") and os.path.exists(docx_out) \
            and os.path.getmtime("blokovi.json") < os.path.getmtime(docx_out):
        sys.exit("❌ blokovi.json je stariji od dokumenta — zaostao je iz ranije "
                 "izgradnje. Obriši ga i pokreni ponovno.")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rukopis", default="rukopis")
    ap.add_argument("--dijelovi", help="JSON/TXT s redoslijedom dijelova rada; "
                                       "zadano se traži rukopis/dijelovi.json ili rad.json")
    ap.add_argument("--model", default="model.json")
    ap.add_argument("--profil")
    ap.add_argument("--graditelj", required=True,
                    help="naredba koja iz RAD_MD pravi RAD_DOCX (pandoc + polja)")
    ap.add_argument("--izlaz", default="rad.docx")
    ap.add_argument("--krugova", type=int, default=6)
    ap.add_argument("--zadrzi-stanje", dest="zadrzi_stanje", action="store_true",
                    help="ne premještaj toc/prelomi/natpisi iz ranije izgradnje "
                         "(samo za namjeran nastavak, nikad za novu izgradnju)")
    ap.add_argument("--provjeri", action="store_true",
                    help="samo provjeri zavisnosti i izađi")
    a = ap.parse_args()

    # ── zavisnosti ──
    stanje = {}
    for alat, obavezan in (("pandoc", True), ("soffice", False),
                           ("pdfinfo", False), ("pdftotext", False)):
        stanje[alat] = shutil.which(alat) is not None
    if a.provjeri:
        for alat, ima in stanje.items():
            print(f"  {'✅' if ima else '❌'} {alat}")
        print("\nbez LibreOffice/Poppler: nema mjerenja prijeloma ni brojeva u sadržaju "
              "— smanjeni opseg, deklarira se korisniku")
        return
    mjerenje = all(stanje[x] for x in ("soffice", "pdfinfo", "pdftotext"))

    # Kvar 84: toc.json, prelomi.json i natpisi.json nisu se brisali na početku,
    # pa je prvi krug mogao dati tri „=" i poruku „stabilno" uspoređujući novo
    # mjerenje sa zaostalim stanjem prethodne izgradnje — brojevi stranica koji
    # pripadaju drugom dokumentu. Fiksna točka mora se dosegnuti u OVOM prolazu.
    if not a.zadrzi_stanje:
        staro = "_stanje_prosli"
        os.makedirs(staro, exist_ok=True)
        for f in ("toc.json", "prelomi.json", "natpisi.json"):
            if os.path.exists(f):
                shutil.move(f, os.path.join(staro, f))
        print(f"stanje petlje iz ranije izgradnje premješteno u {staro}/")

    profil_json = {}
    if a.profil and os.path.exists(a.profil):
        try:
            profil_json = json.load(open(a.profil, encoding="utf-8"))
        except (OSError, ValueError):
            profil_json = {}
    pocetak_tijela = int(
        (profil_json.get("format", {}).get("numeracija", {}) or {})
        .get("tijelo_pocinje_od", 1) or 1)

    model = json.load(open(a.model, encoding="utf-8")) if os.path.exists(a.model) else None
    md = "_rad.md"
    nerazrjeseni, n_pogl = sastavi(a.rukopis, model, md, a.dijelovi)
    if nerazrjeseni:
        sys.exit("❌ nerazrješeni {{model.*}} ključevi:\n   · "
                 + "\n   · ".join(nerazrjeseni))
    naslovi = naslovi_iz_md(md, "naslovi.json")
    print(f"rukopis: {n_pogl} dijelova · naslova 1–2: {len(naslovi)}"
          f" · model: {'da' if model else 'ne'}")

    if not mjerenje:
        # Kvar 82: ovdje se vraćalo bez izlaznog koda, dakle 0, pa je svaki
        # nadređeni alat vidio uspjeh. Predajni .docx je nastajao bez ijednog
        # izmjerenog broja stranice i bez prisilnih prijeloma, a gate je bio zelen.
        # Kod 4 gate.py već zna preslikati u „preskočeno" za satelite, dakle u
        # deklariranu granicu umjesto u tihi prolaz.
        print("⚠️  nema LibreOffice/Poppler — gradim bez mjerenja (SMANJENI OPSEG)")
        izgradi(a.graditelj, md, a.izlaz, a.profil, "zivi")
        print(f"⚠️  {a.izlaz} — brojevi u sadržaju ostaju na Wordu, prikazi NEPROVJERENI")
        print("   Ovo NIJE dovršena izgradnja: izlazni kod 4 (smanjeni opseg).")
        return 4

    # ── petlja do fiksne točke ──
    for krug in range(1, a.krugova + 1):
        print(f"\n── krug {krug} ──")
        izgradi(a.graditelj, md, "_pregled.docx", a.profil, "staticni")
        if not u_pdf("_pregled.docx", "_pregled.pdf"):
            sys.exit("❌ pretvorba pregleda u PDF nije uspjela")
        # Kvar 85: gradi.py nikad nije prosljeđivao --pocetak-tijela, pa je
        # izmjeri.py pomak računao od PRVOG naslova rukopisa. U FPZG strukturi
        # prvi je dio predtekst.md, dakle naslov prednjeg dijela: svi brojevi u
        # sadržaju i popisima bili su pomaknuti za konstantu, a ograda protiv
        # rasapa to ne vidi jer raspon ostaje netaknut.
        r = run([sys.executable, str(TU / "izmjeri.py"), "_pregled.pdf",
                 "--naslovi", "naslovi.json", "--blokovi", "blokovi.json",
                 "--pocetak-tijela", str(pocetak_tijela),
                 "--toc-out", "_toc_novo.json", "--prelomi-out", "_prelomi_novo.json",
                 "--natpisi-out", "_natpisi_novo.json", "--json"])
        if r.returncode:
            sys.exit(f"❌ mjerenje nije uspjelo\n{r.stdout}\n{r.stderr}")
        mj = json.loads(r.stdout)
        p1 = zapisi_ako_drukcije("toc.json", mj["toc"])
        p2 = zapisi_ako_drukcije("prelomi.json", [p["kljuc"] for p in mj["prelomi"]])
        # Stranice natpisa su treće stanje petlje. Bez njih graditelj popis prikaza
        # ostavi kao neispunjeno polje, a to nitko ne popuni prije predaje.
        p3 = zapisi_ako_drukcije("natpisi.json", mj.get("natpisi") or [])
        print(f"  stranica: {mj['stranica']} · lome se: {len(mj['prelomi'])}"
              f" · sadržaj {'⟳' if p1 else '='} · prijelomi {'⟳' if p2 else '='}"
              f" · natpisi {'⟳' if p3 else '='}")
        if not p1 and not p2 and not p3:
            print("✅ stabilno")
            break
    else:
        sys.exit(f"❌ nije se stabiliziralo u {a.krugova} krugova — "
                 "v. references/postupak.md, „što kad ne konvergira\"")

    # ── predajna varijanta + assert ──
    print("\n── predajna verzija (živa Wordova polja) ──")
    izgradi(a.graditelj, md, a.izlaz, a.profil, "zivi")
    if not u_pdf(a.izlaz, "_isporuka.pdf"):
        sys.exit("❌ pretvorba predajne verzije u PDF nije uspjela")
    sp, si = stranica("_pregled.pdf"), stranica("_isporuka.pdf")
    print(f"  stranica u pregledu: {sp} · u predajnoj: {si}", end="  ")
    if sp != si:
        sys.exit("❌ RAZLIKA — statični sadržaj se prelio, brojevi u sadržaju "
                 "ne bi valjali. Suzi statični popis (prored 1,0, 11 pt).")
    print("✅ isto")
    shutil.copy("_pregled.pdf", os.path.splitext(a.izlaz)[0] + ".pdf")
    print(f"\n✅ {a.izlaz}  ·  pregled s popunjenim sadržajem: "
          f"{os.path.splitext(a.izlaz)[0]}.pdf")
    print("Sljedeće: python3 provjeri_predaju.py " + f'"{a.izlaz}" --profil … --model …')


if __name__ == "__main__":
    # Kvar 82: main() je vraćao 4 za smanjeni opseg, a ulaz ga je zvao bez
    # sys.exit, pa je izlazni kod ostajao 0.
    sys.exit(main() or 0)
