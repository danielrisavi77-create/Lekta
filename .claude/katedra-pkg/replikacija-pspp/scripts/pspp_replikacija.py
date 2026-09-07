# -*- coding: utf-8 -*-
"""Pogon replikacije: sintaksa, pokretanje, izvlačenje vrijednosti, snimke sučelja.

Sve je vođeno jednom konfiguracijskom datotekom (`replikacija.json`). Skripta ne
zna ništa o pojedinom radu; zna samo kako se iz PSPP-ova ispisa dohvaća
vrijednost i kako se usporedi s onom koja u radu piše.

    python3 pspp_replikacija.py sintaksa   [--conf replikacija.json]
    python3 pspp_replikacija.py pokreni
    python3 pspp_replikacija.py izvuci
    python3 pspp_replikacija.py snimke
    python3 pspp_replikacija.py sve

Izlazi u mapi koju konfiguracija zove `izlaz` (zadano `replikacija/`):
    provjera.sps        sintaksa svih analiza
    izlaz.pdf           cjelovit ispis, spreman za prilaganje
    izlaz.csv           isti ispis u strojno čitljivom obliku
    baza.sav            podaci u obliku koji PSPP otvara izravno
    usporedba.csv       tablica rad naspram PSPP-a, s ocjenom slaganja
    snimke/*.png        prozori sučelja, jedan po analizi
"""
import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import time

# ── postavke okruženja ──────────────────────────────────────────────────────
# Bez UTF-8 lokalizacije sučelje hrvatske dijakritike ispisuje kao upitnike,
# iako ih ispis u datoteku prikazuje ispravno. Ovo je jedina postavka bez koje
# snimke izlaze neupotrebljive.
os.environ.setdefault("LANG", "C.UTF-8")
os.environ.setdefault("LC_ALL", "C.UTF-8")

ZASLON = os.environ.get("REPL_DISPLAY", ":99")
# Bez ovoga se sučelje ne pokreće, a ne javlja ni grešku: proces samo tiho
# odustane jer nema zaslona na koji bi crtao.
os.environ["DISPLAY"] = ZASLON
OKVIR_X, OKVIR_Y = 60, 50
VISINA_NASLOVA = 20
NAJVISI = 1800
ZASLON_SIRINA, ZASLON_VISINA = 1600, 1900


def ucitaj(put):
    with open(put, encoding="utf-8") as f:
        return json.load(f)


def zapisi_tekst(put, tekst):
    os.makedirs(os.path.dirname(put) or ".", exist_ok=True)
    with open(put, "w", encoding="utf-8") as f:
        f.write(tekst)


# ════════════════════════════════════════════════════════════════════════════
# 1. SINTAKSA
# ════════════════════════════════════════════════════════════════════════════
def gradi_sintaksu(k):
    """Sastavi .sps iz konfiguracije. Redoslijed analiza je redoslijed u ispisu."""
    zaglavlje = k.get("naslov", "replikacija izračuna")
    varijable = k.get("varijable")
    if not varijable:
        with open(k["baza"], encoding="utf-8") as f:
            varijable = next(csv.reader(f))
    popis = "\n    ".join(f"{v} F8.4" for v in varijable)

    # Samo varijable koje u bazi postoje. Oznake izvedenih varijabli (reziduali
    # i slično) deklariraju se u analizi koja ih stvara, jer ranije ne postoje.
    oznake = ""
    if k.get("oznake"):
        redci = "\n".join(f"  {ime} '{opis}'" for ime, opis in k["oznake"].items())
        oznake = f"\nVARIABLE LABELS\n{redci}.\n"

    dijelovi = [
        f"* {zaglavlje}.",
        "* Sintaksu je moguće pokrenuti jednom naredbom i svaki put daje isti ispis:",
        "*   pspp provjera.sps -o izlaz.pdf -O format=pdf",
        "",
        "GET DATA /TYPE=TXT /FILE='%s' /ARRANGEMENT=DELIMITED" % os.path.basename(k["baza"]),
        "  /DELIMITERS=',' /QUALIFIER='\"' /FIRSTCASE=2 /VARIABLES=",
        f"    {popis}.",
        "EXECUTE.",
        oznake,
        "SAVE OUTFILE='baza.sav'.",
        "",
    ]
    for a in k["analize"]:
        dijelovi.append(f"* {a.get('natpis', a['ime'])}.")
        dijelovi.append(a["sintaksa"].strip())
        dijelovi.append("")
    if k.get("priprema"):
        dijelovi.append("* Pomoćni korak; u prilog ne ide jer sam po sebi ništa ne tvrdi.")
        dijelovi.append(k["priprema"].strip())
        dijelovi.append("")
    return "\n".join(dijelovi)


# ════════════════════════════════════════════════════════════════════════════
# 2. POKRETANJE
# ════════════════════════════════════════════════════════════════════════════
def pspp(sps, izlaz, oblik, radna):
    r = subprocess.run(["pspp", os.path.basename(sps), "-o", izlaz, "-O", f"format={oblik}"],
                       capture_output=True, text=True, timeout=600, cwd=radna)
    greske = [l for l in (r.stderr or "").split("\n") if "error" in l.lower()]
    if greske:
        print("   PSPP javlja:", greske[0][:140])
    return r.returncode == 0


def pokreni(k, radna):
    sps = os.path.join(radna, "provjera.sps")
    zapisi_tekst(sps, gradi_sintaksu(k))
    baza = os.path.join(radna, os.path.basename(k["baza"]))
    if os.path.abspath(k["baza"]) != os.path.abspath(baza):
        shutil.copy(k["baza"], baza)
    ok = pspp(sps, "izlaz.pdf", "pdf", radna) and pspp(sps, "izlaz.csv", "csv", radna)
    if not ok:
        sys.exit("PSPP nije uspio pokrenuti sintaksu")
    print(f"   ispis: {radna}/izlaz.pdf i izlaz.csv")


# ════════════════════════════════════════════════════════════════════════════
# 3. IZVLAČENJE
# ════════════════════════════════════════════════════════════════════════════
class Ispis:
    """PSPP-ov ispis u strojno čitljivom obliku, razložen na tablice."""

    def __init__(self, put, oznake):
        self.oznake = oznake or {}
        self.tablice = []
        naslov, redci = None, []
        for red in csv.reader(open(put, encoding="utf-8")):
            prvi = red[0] if red else ""
            if prvi.startswith("Table: "):
                if naslov is not None:
                    self.tablice.append((naslov, redci))
                naslov, redci = prvi[7:], []
            elif naslov is not None and any(c.strip() for c in red):
                redci.append(red)
        if naslov is not None:
            self.tablice.append((naslov, redci))

    def o(self, ime):
        """Oznaka varijable kako je PSPP ispisuje; bez oznake vrijedi samo ime."""
        return self.oznake.get(ime, ime)

    def nadi(self, naslov, redom=0):
        pogodci = [r for n, r in self.tablice if n == naslov]
        if len(pogodci) <= redom:
            raise KeyError(f"nema tablice „{naslov}” br. {redom}")
        return pogodci[redom]

    def sve(self, naslov):
        return [r for n, r in self.tablice if n == naslov]


def broj(s):
    """PSPP piše .74, -3.53 i 51.9%; sve troje pretvori u decimalni broj."""
    s = (s or "").strip().replace("%", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _redak(redci, oznaka, stupac=0):
    for r in redci:
        if len(r) > stupac and r[stupac].strip() == oznaka:
            return r
    return None


def _zaglavlje_stupac(tab, naziv):
    stupci = [c.strip() for c in tab[0]]
    return stupci.index(naziv) if naziv in stupci else None


# ── pojedini tipovi izvora ──────────────────────────────────────────────────
def _deskriptiva(I, o):
    tab = I.nadi("Descriptive Statistics", o.get("redom", 0))
    j = _zaglavlje_stupac(tab, o.get("stupac", "Mean"))
    r = _redak(tab, I.o(o["varijabla"]))
    return broj(r[j]) if r and j is not None else None


def _statistike(I, o):
    tab = I.nadi("Statistics", o.get("redom", 0))
    r = _redak(tab, o.get("mjera", "Median"))
    return broj(r[-1]) if r else None


def _frekvencije(I, o):
    tab = I.nadi(I.o(o["varijabla"]), o.get("redom", 0))
    stupac = {"frekvencija": 2, "postotak": 3, "vazeci": 4, "kumulativno": 5}[
        o.get("stupac", "postotak")]
    for r in tab:
        if len(r) > stupac and r[1].strip().startswith(str(o["vrijednost"])):
            return broj(r[stupac])
    return None


def _pouzdanost(I, o):
    tab = I.nadi("Reliability Statistics", o.get("redom", 0))
    return broj(tab[1][0])


def _korelacija(I, o):
    """Traži po svim tablicama korelacija; ispis ih zna razbiti na više njih."""
    a, b = I.o(o["a"]), I.o(o["b"])
    kljuc = {"r": "Pearson Correlation", "p": "Sig. (2-tailed)", "N": "N"}[o.get("sto", "r")]
    for tab in I.sve("Correlations"):
        j = _zaglavlje_stupac(tab, b)
        if j is None:
            continue
        aktivan, nadeno = False, None
        for red in tab[1:]:
            if red[0].strip():
                aktivan = red[0].strip() == a
            if aktivan and len(red) > 1 and red[1].strip() == kljuc:
                nadeno = broj(red[j])
        if nadeno is not None:
            return nadeno
    return None


def _t_nezavisni(I, o):
    tab = I.nadi("Independent Samples Test", o.get("redom", 0))
    trazi = "not assumed" if o.get("welch", True) else "variances assumed"
    r = next((x for x in tab if trazi in " ".join(x)), None)
    if not r:
        return None
    stupac = {"t": 4, "df": 5, "p": 6, "razlika": 7}[o.get("sto", "t")]
    v = broj(r[stupac])
    return abs(v) if v is not None and o.get("apsolutno", True) and o.get("sto", "t") == "t" else v


def _skupna(I, o):
    tab = I.nadi("Group Statistics", o.get("redom", 0))
    redci = [r for r in tab if len(r) > 4 and broj(r[2]) is not None]
    r = redci[o.get("skupina", 0)]
    return broj(r[{"N": 2, "M": 3, "SD": 4}[o.get("stupac", "M")]])


def _cohen_d(I, o):
    """PSPP veličinu učinka ne ispisuje; računa se iz njegovih skupnih statistika."""
    tab = I.nadi("Group Statistics", o.get("redom", 0))
    redci = [r for r in tab if len(r) > 4 and broj(r[2]) is not None]
    if len(redci) < 2:
        return None
    n1, m1, s1 = broj(redci[0][2]), broj(redci[0][3]), broj(redci[0][4])
    n2, m2, s2 = broj(redci[1][2]), broj(redci[1][3]), broj(redci[1][4])
    sp = (((n1 - 1) * s1 ** 2 + (n2 - 1) * s2 ** 2) / (n1 + n2 - 2)) ** 0.5
    return abs(m2 - m1) / sp if sp else None


def _t_upareni(I, o):
    tab = I.nadi("Paired Samples Test", o.get("redom", 0))
    r = next((x for x in tab if o.get("par", "") in " ".join(x) and broj(x[-1]) is not None), None)
    if not r:
        return None
    return broj(r[{"t": 7, "df": 8, "p": 9, "razlika": 2}[o.get("sto", "t")]])


def _upareni_prosjek(I, o):
    tab = I.nadi("Paired Sample Statistics", o.get("redom", 0))
    for r in tab:
        if len(r) > 3 and r[1].strip() == o["varijabla"]:
            v = broj(r[3])
            return v * 100 if o.get("u_postotak") else v
    return None


def _anova(I, o):
    tab = I.nadi("ANOVA", o.get("redom", 0))
    r = next((x for x in tab if "Between Groups" in " ".join(x)), None)
    return broj(r[{"F": 5, "p": 6, "df": 3}[o.get("sto", "F")]]) if r else None


def _komponente(I, o):
    tab = I.nadi("Total Variance Explained", o.get("redom", 0))
    sv = [broj(r[1]) for r in tab[2:] if broj(r[1]) is not None]
    prag = o.get("prag", 1.0)
    koliko = sum(1 for x in sv if x > prag)
    sto = o.get("sto", "broj")
    if sto == "broj":
        return koliko
    if sto == "svojstvena":
        return sv[o.get("redni", 1) - 1]
    if sto == "kumulativno":
        return broj(tab[2 + koliko - 1][3])
    return None


IZVORI = {
    "deskriptiva": _deskriptiva, "statistike": _statistike, "frekvencije": _frekvencije,
    "pouzdanost": _pouzdanost, "korelacija": _korelacija, "t_nezavisni": _t_nezavisni,
    "t_upareni": _t_upareni, "upareni_prosjek": _upareni_prosjek, "skupna": _skupna,
    "cohen_d": _cohen_d, "anova": _anova, "komponente": _komponente,
}


def decimala(s):
    m = re.search(r"[.,](\d+)", s or "")
    return len(m.group(1)) if m else 0


def kao_broj(s):
    s = (s or "").replace("<", "").replace(">", "").replace("%", "").replace(",", ".").strip()
    m = re.search(r"-?\d+(\.\d+)?", s)
    return float(m.group()) if m else None


def hr(x, mj):
    return "" if x is None else f"{x:.{mj}f}".replace(".", ",")


def izvuci(k, radna):
    I = Ispis(os.path.join(radna, "izlaz.csv"),
              {**k.get("oznake", {}), **k.get("oznake_izvedene", {})})
    redci, slaze, promasaji, bez = [], 0, [], []

    for stavka in k["ocekivano"]:
        o = stavka.get("izvor") or {}
        tip = o.get("tip")
        mj = stavka.get("decimala", 3)
        try:
            v = IZVORI[tip](I, o) if tip in IZVORI else None
        except (KeyError, IndexError, TypeError) as e:
            v = None
            promasaji.append(f"{stavka['oznaka']}: {type(e).__name__} {e}")

        u_radu = kao_broj(stavka["u_radu"])
        if v is None:
            stanje, ispis = "ne ispisuje se", ""
            bez.append(stavka["oznaka"])
        else:
            ispis = hr(v, mj) + (" %" if "%" in stavka["u_radu"] else "")
            if "tolerancija" in stavka:
                tol = stavka["tolerancija"] + 1e-9
            else:
                # Dvije vrijednosti mogu biti ista veličina zapisana različitom
                # točnošću (24,5 i 24,51). Mjerodavna je grublja od dviju.
                tol = 0.5 * 10 ** (-min(decimala(stavka["u_radu"]), mj)) + 1e-9
            if stavka["u_radu"].strip().startswith("<"):
                ok = u_radu is not None and v <= u_radu + tol
            else:
                ok = u_radu is not None and abs(v - u_radu) <= tol
            stanje = "da" if ok else "NE"
            slaze += ok
            if not ok:
                promasaji.append(f"{stavka['oznaka']}: rad {stavka['u_radu']} | PSPP {ispis}")
        redci.append({
            "oznaka": stavka["oznaka"], "gdje_u_radu": stavka.get("gdje", ""),
            "statistika": stavka["statistika"], "vrijednost_u_radu": stavka["u_radu"],
            "pspp_naredba": stavka.get("naredba", ""), "vrijednost_iz_pspp": ispis,
            "poklapa_se": stanje})

    put = os.path.join(radna, "usporedba.csv")
    with open(put, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(redci[0]))
        w.writeheader()
        w.writerows(redci)

    ukupno = len(k["ocekivano"]) - len(bez)
    print(f"   usporedba: {slaze}/{ukupno} poklapa se  →  {put}")
    if bez:
        print("   PSPP ne ispisuje:", ", ".join(bez))
    for p in promasaji:
        print("   ❌", p)
    return not promasaji


# ════════════════════════════════════════════════════════════════════════════
# 4. SNIMKE SUČELJA
# ════════════════════════════════════════════════════════════════════════════
def sh(naredba):
    return subprocess.run(naredba, shell=True, capture_output=True, text=True).stdout.strip()


def prozori():
    return [l for l in sh("wmctrl -l").split("\n") if l.strip()]


def cekaj_prozor(igla, sekundi=45):
    for _ in range(sekundi):
        for l in prozori():
            if igla in l:
                return l.split()[0]
        time.sleep(1)
    return None


def okvir_prozora(klijent):
    """Prozor zajedno s naslovnom trakom koju crta upravitelj prozora."""
    m = re.search(r"0x[0-9a-f]+",
                  sh(f"xwininfo -id {klijent} -tree | grep -i 'Parent window id'"))
    return m.group(0) if m else klijent


def dno_sadrzaja(put, lijevo=200, dno_margina=10):
    """Zadnji redak u kojem ima išta osim bijelog.

    Donjih nekoliko redaka izostavlja se jer ondje je rub prozora, koji je taman
    pa bi se čitao kao sadržaj i prozor se nikad ne bi skratio.
    """
    from PIL import Image
    sl = Image.open(put)
    desno = max(lijevo + 10, sl.width - 30)
    px = (sl.convert("L").crop((lijevo, 0, desno, max(1, sl.height - dno_margina)))
          .point(lambda v: 255 if v < 240 else 0))
    okv = px.getbbox()
    return okv[3] if okv else 0


def pripremi_zaslon():
    if not sh("pgrep -x Xvfb"):
        subprocess.Popen(["setsid", "Xvfb", ZASLON, "-screen", "0",
                          f"{ZASLON_SIRINA}x{ZASLON_VISINA}x24", "-nolisten", "tcp"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(4)
    if not sh("pgrep -x openbox"):
        subprocess.Popen(["setsid", "openbox"], stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL)
        time.sleep(3)


def snimi_jednu(a, radna, mapa):
    ime, sirina = a["ime"], a.get("sirina", 1200)
    sh("pkill -x psppire")
    time.sleep(2)
    korak = f"korak_{ime}.sps"
    # Analiza u ispisu i analiza na snimci ne moraju biti ista stvar. Parcijalne
    # korelacije traže pet regresija koje u prilogu ništa ne znače, pa se one
    # obave u pripremi, a snima se samo tablica zbog koje se sve to radi.
    naredbe = a.get("sintaksa_snimka", a["sintaksa"]).strip()
    glava = "" if naredbe.startswith("GET FILE") else "GET FILE='baza.sav'.\n"
    zapisi_tekst(os.path.join(radna, korak), glava + naredbe + "\n")

    subprocess.Popen(["setsid", "psppire", korak], cwd=radna,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not cekaj_prozor("Syntax Editor"):
        return f"{ime}: sučelje se nije otvorilo"
    time.sleep(4)

    savjet = next((l.split()[0] for l in prozori() if "User Hint" in l), None)
    if savjet:
        sh(f"wmctrl -i -a {savjet}")
        sh("xdotool key --clearmodifiers Escape")
        time.sleep(1)

    syn = next(l.split()[0] for l in prozori() if "Syntax Editor" in l)
    sh(f"wmctrl -i -a {syn}")
    sh(f"wmctrl -i -r {syn} -e 0,60,50,900,500")
    time.sleep(2)
    sh("xdotool mousemove 400 250 click 1")
    time.sleep(1)
    sh("xdotool key --clearmodifiers ctrl+a")     # označi sve
    time.sleep(1)
    sh("xdotool key --clearmodifiers ctrl+r")     # Run → Selection

    izlaz = cekaj_prozor("Output Viewer")
    if not izlaz:
        return f"{ime}: nema prozora s rezultatima"
    time.sleep(5)

    okv = okvir_prozora(izlaz)
    sh(f"wmctrl -i -a {izlaz}")
    sh(f"wmctrl -i -r {izlaz} -e 0,{OKVIR_X},{OKVIR_Y},{sirina},{NAJVISI}")
    time.sleep(3)
    sh(f"xdotool mousemove {ZASLON_SIRINA - 10} {ZASLON_VISINA - 10}")
    time.sleep(1)
    subprocess.run(["import", "-window", okv, "/tmp/_mjera.png"], check=True)
    visina = min(NAJVISI, max(200, dno_sadrzaja("/tmp/_mjera.png") - VISINA_NASLOVA + 30))

    # Prozor se skrati na visinu sadržaja, jednako kao kad ga se povuče za rub.
    sh(f"wmctrl -i -r {izlaz} -e 0,{OKVIR_X},{OKVIR_Y},{sirina},{visina}")
    time.sleep(3)
    sh(f"xdotool mousemove {ZASLON_SIRINA - 10} {ZASLON_VISINA - 10}")
    time.sleep(1)
    subprocess.run(["import", "-window", okv, os.path.join(mapa, f"{ime}.png")], check=True)
    return None


def snimke(k, radna):
    if not shutil.which("psppire"):
        sys.exit("psppire nije instaliran; vidi references/okruzenje.md")
    pripremi_zaslon()
    mapa = os.path.join(radna, "snimke")
    os.makedirs(mapa, exist_ok=True)
    for f in os.listdir(mapa):
        os.remove(os.path.join(mapa, f))

    if k.get("priprema"):
        zapisi_tekst(os.path.join(radna, "priprema.sps"),
                     "GET FILE='baza.sav'.\n" + k["priprema"].strip() + "\n")
        subprocess.run(["pspp", "priprema.sps", "-o", "/dev/null", "-O", "format=txt"],
                       capture_output=True, timeout=300, cwd=radna)

    greske = []
    for a in k["analize"]:
        if a.get("bez_snimke"):
            continue
        g = snimi_jednu(a, radna, mapa)
        if g:
            greske.append(g)
            print("   ❌", g)
        else:
            print(f"   {a['ime']}")
    sh("pkill -x psppire")
    for f in os.listdir(radna):          # pomoćne datoteke ne idu uz rad
        if f.startswith("korak_") or f == "priprema.sps":
            os.remove(os.path.join(radna, f))
    print(f"   snimljeno: {len(os.listdir(mapa))} prozora u {mapa}/")
    return not greske


# ════════════════════════════════════════════════════════════════════════════
def main():
    p = argparse.ArgumentParser(description="replikacija izračuna u programu PSPP")
    p.add_argument("korak", choices=["sintaksa", "pokreni", "izvuci", "snimke", "sve"])
    p.add_argument("--conf", default="replikacija.json")
    args = p.parse_args()

    k = ucitaj(args.conf)
    radna = k.get("izlaz", "replikacija")
    os.makedirs(radna, exist_ok=True)

    if args.korak in ("sintaksa", "sve"):
        zapisi_tekst(os.path.join(radna, "provjera.sps"), gradi_sintaksu(k))
        print(f"   sintaksa: {radna}/provjera.sps")
    if args.korak in ("pokreni", "sve"):
        pokreni(k, radna)
    if args.korak in ("izvuci", "sve"):
        if not izvuci(k, radna) and not k.get("dopusti_neslaganje"):
            sys.exit(1)
    if args.korak in ("snimke", "sve"):
        if not snimke(k, radna):
            sys.exit(1)


if __name__ == "__main__":
    main()
