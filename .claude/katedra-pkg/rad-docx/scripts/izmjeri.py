#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Mjerenje gotovog dokumenta nad renderiranim PDF-om.

Daje dvije stvari koje Word zna samo nakon prijeloma, a dokument o njima ovisi:

  1. `toc.json`     — stranica na kojoj počinje svaki naslov, u numeraciji TIJELA rada
  2. `prelomi.json` — prikazi kojima natpis i redak „Izvor:" nisu na istoj stranici

Ulaz je PDF varijante sa STATIČNIM sadržajem. Nad PDF-om s živim poljem TOC mjerenje ne
radi, jer LibreOffice polje ne popunjava (v. references/zamke.md, kvar 3).

    python3 izmjeri.py rad.pdf --naslovi naslovi.json --blokovi blokovi.json \\
        --toc-out toc.json --prelomi-out prelomi.json [--pocetak-tijela 1]
"""

import argparse
import json
import re
import subprocess
import sys

IZVOR = "Izvor:"

# Crtice se u .docx-u i u PDF-u ne moraju poklapati (spojnica, en-crta, minus,
# nelomljiva spojnica), a autor ih usput mijenja. Za traženje se sve svode na
# jednu, a razlika se posebno prijavljuje jer je često znak zastarjelog sadržaja.
CRTICE = {"\u2010": "-", "\u2011": "-", "\u2012": "-", "\u2013": "-",
          "\u2014": "-", "\u2015": "-", "\u2212": "-"}
RAZMACI = {"\u00a0": " ", "\u2007": " ", "\u202f": " ", "\u200b": ""}


def norm(x):
    for a, b in {**CRTICE, **RAZMACI}.items():
        x = x.replace(a, b)
    return re.sub(r"\s+", " ", x).strip()


def stisni(x):
    """Bez ijednog razmaka. Naslov prelomljen preko dva retka u PDF-u dobiva
    razmak kojega u izvoru nema — `(1947.-\n1991.)` → `(1947.- 1991.)` — pa
    traženje po točnom nizu ne uspije. Stiskanjem se ta razlika briše."""
    return re.sub(r"\s+", "", norm(x))


def stranice(pdf):
    """Vrati (normalizirano, sirovo) po stranici.

    Oba su potrebna i nisu zamjenjiva. `norm` briše prijelome redaka, pa je dobar za
    traženje naslova prelomljenog preko dva retka, ali time uništava svaki uzorak vezan
    na kraj retka — a upravo takav je potpis navigacijske stranice (vodilica od točaka i
    broj na kraju retka). Sirovi tekst zato ostaje.
    """
    out = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True, encoding="utf-8", errors="replace")
    m = re.search(r"Pages:\s+(\d+)", out.stdout)
    if not m:
        sys.exit(f"❌ ne mogu pročitati broj stranica: {pdf}")
    n = int(m.group(1))
    tekst, sirovo = [], []
    for i in range(1, n + 1):
        r = subprocess.run(["pdftotext", "-f", str(i), "-l", str(i), "-layout", pdf, "-"],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        sirovo.append(r.stdout)
        tekst.append(norm(r.stdout))
    return tekst, sirovo


# Stranice na kojima naslovi stoje kao STAVKE, ne kao naslovi. Moraju izaći iz pretrage:
# inače prvi naslov bude „nađen" na sadržaju, a sekvencijalna pretraga onda sve ostale
# nađe na istoj stranici — mjerenje se sruši u jednu vrijednost i petlja se na njoj
# stabilizira. Vidi zamke.md, kvar 16.
NAVIGACIJA = ("sadržaj", "sadrzaj", "contents", "popis tablica", "popis slika",
              "popis grafikona", "popis prikaza", "popis priloga", "kazalo")

# Stilski neovisan potpis navigacijske stranice: red koji završava vodilicom od točaka i
# brojem stranice. Hvata i sadržaj koji nema nikakav naslov iznad sebe.
VODILICA = re.compile(r"\.{5,}\s*\d+\s*$", re.M)


def bez_navigacije(st, sirovo, igle=NAVIGACIJA, najmanje_vodilica=3):
    """Isprazni navigacijske stranice. Vraća njihove (fizičke) brojeve.

    Prepoznaje se dvojako, jer ni jedno samo nije dovoljno: naslov se piše i velikim i
    malim slovima („SADRŽAJ" / „Sadržaj"), a popis prikaza može biti bez naslova. Zato uz
    igle ide i potpis vodilice od točaka.

    Igla se traži kao **cijeli redak**, ne kao podniz stranice. „Sadržaj" je i obična
    riječ hrvatskog jezika („sadržaj rada", „sadržaj kolektivnog ugovora"), pa je pretraga
    po podnizu praznila stranice tijela rada — a to je gore od nepronalaženja, jer se
    naslovi s tih stranica onda mjere pogrešno.
    """
    nadene = []
    for i, t in enumerate(st):
        redovi = sirovo[i].splitlines()
        po_iglici = any(je_naslov_navigacije(norm(r).casefold(), igle) for r in redovi
                        if r.strip())
        po_vodilici = len(VODILICA.findall(sirovo[i])) >= najmanje_vodilica
        if not (po_iglici or po_vodilici):
            continue
        # Od navigacijske stranice zadržava se SAMO njezin naslov. „POPIS TABLICA I
        # GRAFIKONA" je i sam naslov kojemu treba izmjeriti stranicu, pa se stranica ne
        # smije isprazniti; sve ostalo na njoj su stavke i mora otići.
        #
        # Filtriranje „samo stavke" nije dovoljno: duga stavka se prelomi na dva retka, a
        # njezin prvi redak nema broj na kraju i preživi filtar — s punim tekstom naslova
        # u sebi. Zadržavanje bijele liste umjesto crne rješava to jednom za svagda.
        st[i] = norm(" ".join(r for r in redovi
                              if je_naslov_navigacije(norm(r).casefold(), igle)))
        nadene.append(i + 1)
    return nadene


def je_naslov_navigacije(red, igle, najduze=60):
    """Je li redak NASLOV navigacijskog dijela, a ne rečenica koja o njemu govori.

    Točna jednakost je preuska: „POPIS TABLICA I GRAFIKONA" je jedan naslov za oba popisa i
    ne poklapa se ni s jednom iglom. Podniz je preširok: hvata prozu. Sredina je naslovni
    oblik — kratak redak koji iglom **počinje** i ne završava rečeničnim znakom.
    """
    if red in igle:
        return True
    if len(red) > najduze or red[-1:] in (".", ",", ";", ":", "?", "!"):
        return False
    return any(red.startswith(g) for g in igle)


def provjeri_rasap(rez, ukupno, najmanje_udjela=0.5):
    """Naslovi moraju biti RAZASUTI po dokumentu.

    Ako se raspon od prvog do zadnjeg naslova stisne na mali dio dokumenta, mjerenje nije
    „neobično" nego pokvareno — najčešće je pretraga pala na navigacijsku stranicu. Bez
    ove ograde petlja izgradnje se uredno stabilizira na potpuno pogrešnim brojevima, što
    je gore od pada.
    """
    str_ = [r["str"] for r in rez if r["str"] is not None]
    if len(str_) < 3 or ukupno < 6:
        return None
    raspon = max(str_) - min(str_) + 1
    if raspon >= najmanje_udjela * ukupno:
        return None
    return (f"naslovi zauzimaju samo {raspon} od {ukupno} stranica "
            f"({raspon / ukupno:.0%}), a trebali bi biti razasuti po cijelom radu.\n"
            f"   Najčešći uzrok: stranica sadržaja ili popisa prikaza nije izbačena iz "
            f"pretrage, pa\n   su svi naslovi nađeni na njoj. Provjeri --igla-sadrzaja "
            f"i prepoznavanje vodilica.")


def pomak_numeracije(st, prvi_naslov_tijela, zadano=1):
    """Fizička stranica prvog naslova tijela minus njegov prikazani broj."""
    cilj = stisni(prvi_naslov_tijela)
    for i, t in enumerate(st):
        if cilj in stisni(t):
            return (i + 1) - zadano
    sys.exit(f"❌ ne nalazim prvi naslov tijela u PDF-u: {prvi_naslov_tijela}")


def mjeri_naslove(st, naslovi, pomak):
    """Naslovi se traže REDOM — isti tekst se može pojaviti i kao spomen u tekstu."""
    rez, zadnja, nenadeni = [], 0, []
    for h in naslovi:
        cilj, naden = stisni(h["t"]), None
        for i in range(zadnja, len(st)):
            if cilj in stisni(st[i]):
                naden, zadnja = i + 1, i
                break
        if naden is None:
            nenadeni.append(h["t"])
            rez.append({"lvl": h.get("lvl", 1), "t": h["t"], "str": None})
            continue
        rez.append({"lvl": h.get("lvl", 1), "t": h["t"], "str": naden - pomak})
    return rez, nenadeni


def mjeri_prelome(st, blokovi):
    """Blok se lomi ako natpis i prvi „Izvor:" nakon njega nisu na istoj stranici."""
    spojeno, granice = "", []
    for i, t in enumerate(st):
        sti = stisni(t)
        granice.append((len(spojeno), len(spojeno) + len(sti), i + 1))
        spojeno += sti + "\u241f"

    def stranica_na(idx):
        for a, b, s in granice:
            if a <= idx <= b:
                return s
        return None

    prelomi, nenadeni, natpisi = [], [], {}
    for b in blokovi:
        igla = stisni(b["natpis"])[:60]
        i = spojeno.find(igla)
        if i < 0:
            nenadeni.append(b["kljuc"])
            continue
        s1 = stranica_na(i)
        # Stranica natpisa je ulaz za popis tablica/slika/grafikona. Bez nje graditelj
        # popis ostavi kao neispunjeno polje, pa rad ide u predaju s praznim popisom
        # prikaza — a to LibreOffice ne popunjava ni pri pretvorbi (v. kvar 3).
        natpisi[b["kljuc"]] = s1
        j = spojeno.find(stisni(IZVOR), i)
        if j < 0:
            nenadeni.append(b["kljuc"])
            continue
        s2 = stranica_na(j)
        if s1 != s2:
            prelomi.append({"kljuc": b["kljuc"], "natpis_str": s1, "izvor_str": s2})
    return prelomi, nenadeni, natpisi


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("--naslovi", help="JSON: [{lvl, t}] redom kako stoje u radu")
    ap.add_argument("--blokovi", help="JSON: [{kljuc, natpis}] iz izgradnje")
    ap.add_argument("--toc-out", default="toc.json")
    ap.add_argument("--prelomi-out", default="prelomi.json")
    ap.add_argument("--natpisi-out", default="natpisi.json",
                    help="[{kljuc, natpis, str}] — stranica natpisa u numeraciji tijela; "
                         "ulaz za popis tablica/slika/grafikona. Namjerno SAMOOPISNO: "
                         "ključ je motorov, a graditelj kućnog stila ima svoj imenski "
                         "prostor sidara, pa prevođenje radi prilagodnik.")
    ap.add_argument("--pocetak-tijela", type=int, default=1,
                    help="broj koji nosi prva stranica tijela (zadano 1)")
    ap.add_argument("--igla-sadrzaja", default=",".join(NAVIGACIJA),
                    help="zarezom odvojene igle navigacijskih stranica (ne razlikuje "
                         "velika i mala slova)")
    ap.add_argument("--dopusti-nenadene", action="store_true",
                    help="prikaz bez para natpis/izvor u PDF-u ne obara mjerenje; "
                         "svjestan izuzetak, upisuje se u projekt")
    ap.add_argument("--dopusti-rasap", action="store_true",
                    help="ne padaj kad su naslovi stisnuti na mali dio dokumenta "
                         "(samo za rad koji to stvarno jest)")
    ap.add_argument("--json", action="store_true", help="ispiši sve kao JSON")
    a = ap.parse_args()

    st, sirovo = stranice(a.pdf)
    ukupno = len(st)
    igle = tuple(x.strip().casefold() for x in a.igla_sadrzaja.split(",") if x.strip())
    navigacijske = bez_navigacije(st, sirovo, igle or NAVIGACIJA)
    str_sadrzaja = navigacijske[0] if navigacijske else None

    toc, nenadeni_naslovi, rasap = [], [], None
    if a.naslovi:
        naslovi = json.load(open(a.naslovi, encoding="utf-8"))
        if not naslovi:
            sys.exit("❌ naslovi.json je prazan")
        pomak = pomak_numeracije(st, naslovi[0]["t"], a.pocetak_tijela)
        toc, nenadeni_naslovi = mjeri_naslove(st, naslovi, pomak)
        rasap = provjeri_rasap(toc, ukupno)
        if rasap and not a.dopusti_rasap:
            print(f"❌ {rasap}", file=sys.stderr)
            print(f"   izbačene navigacijske stranice: "
                  f"{navigacijske or 'nijedna'}", file=sys.stderr)
            sys.exit(2)
        json.dump(toc, open(a.toc_out, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)

    prelomi, nenadeni, natpisi = [], [], []
    if a.blokovi:
        blokovi = json.load(open(a.blokovi, encoding="utf-8"))
        prelomi, nenadeni, natpisi = mjeri_prelome(st, blokovi)
        json.dump([p["kljuc"] for p in prelomi],
                  open(a.prelomi_out, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        if a.naslovi:
            # bez pomaka bio bi to fizički broj stranice, a popis prikaza mora nositi
            # isti broj kao podnožje tijela
            po_kljucu = {b["kljuc"]: b["natpis"] for b in blokovi}
            natpisi = [{"kljuc": k, "natpis": po_kljucu.get(k, ""), "str": v - pomak}
                       for k, v in natpisi.items() if v is not None]
            json.dump(natpisi, open(a.natpisi_out, "w", encoding="utf-8"),
                      ensure_ascii=False, indent=1)
        elif natpisi:
            print("⚠️  bez --naslovi ne znam pomak numeracije, pa stranice natpisa "
                  "ne zapisujem", file=sys.stderr)

    if a.json:
        # Ispiši pa PADNI. Nenađeni naslov znači nepoznat broj stranice, a petlja
        # izgradnje čita upravo JSON — kad bi ovdje tiho uspjela, dokument bi izašao sa
        # stavkom sadržaja bez broja i nitko to ne bi vidio.
        print(json.dumps({"stranica": ukupno, "stranica_sadrzaja": str_sadrzaja,
                          "navigacijske": navigacijske, "toc": toc, "prelomi": prelomi,
                          "nenadeni": nenadeni, "nenadeni_naslovi": nenadeni_naslovi,
                          "natpisi": natpisi, "rasap": rasap},
                         ensure_ascii=False, indent=1))
        # Kvar 81: nenađen BLOK (prikaz kojemu natpis ili „Izvor:" nije nađen u
        # PDF-u) ispisivao se u JSON i to je bilo sve. Takav prikaz ispada i iz
        # prelomi.json (pa se lomi preko dvije stranice) i iz natpisi.json (pa
        # nema retka u popisu prikaza), a gradi.py javi „✅ stabilno".
        # Fiksna točka izračunata nad nepotpunim skupom nije fiksna točka.
        if nenadeni and not a.dopusti_nenadene:
            print(f"❌ blokova bez para natpis/izvor u PDF-u: {len(nenadeni)}",
                  file=sys.stderr)
            for t in nenadeni:
                print(f"   · {t}", file=sys.stderr)
            print("   Takav prikaz nema prisilni prijelom ni redak u popisu prikaza.",
                  file=sys.stderr)
            print("   Ako je to namjerno: --dopusti-nenadene", file=sys.stderr)
            sys.exit(1)
        if nenadeni_naslovi:
            print(f"❌ naslova koje ne nalazim u PDF-u: {len(nenadeni_naslovi)}",
                  file=sys.stderr)
            for t in nenadeni_naslovi:
                print(f"   · {t[:78]}", file=sys.stderr)
            sys.exit(1)
        return

    print(f"stranica: {ukupno}"
          + (f" · navigacijske izbačene: {navigacijske}" if navigacijske else
             " · ⚠️  nijedna navigacijska stranica nije prepoznata"))
    for r in toc:
        uvlaka = "    " if r["lvl"] == 2 else ""
        broj = "  ?" if r["str"] is None else f"{r['str']:>3}"
        print(f"  {broj}  {uvlaka}{r['t']}")
    if nenadeni_naslovi:
        print(f"\n❌ naslova koje ne nalazim u PDF-u: {len(nenadeni_naslovi)}")
        for t in nenadeni_naslovi:
            print(f"   · {t[:78]}")
        print("   Uzrok je obično razlika između naslova u dokumentu i u ispisu: "
              "izmijenjen\n   naslov uz neosvježen sadržaj, ili druga crtica. "
              "Provjeri oba mjesta.")
    if prelomi:
        print(f"\n⚠️  prikaza koji se lome: {len(prelomi)}")
        for p in prelomi:
            print(f"   · {p['kljuc']}: natpis str. {p['natpis_str']}, "
                  f"izvor str. {p['izvor_str']}")
    elif a.blokovi:
        print("\n✅ nijedan prikaz se ne lomi preko stranica")
    if nenadeni:
        print(f"\n❌ bez para natpis/izvor u PDF-u: {', '.join(nenadeni)}")
        print("   Takav prikaz se ne lomi kontrolirano i nema retka u popisu prikaza.")
    if nenadeni_naslovi or (nenadeni and not a.dopusti_nenadene):
        sys.exit(1)


if __name__ == "__main__":
    main()
