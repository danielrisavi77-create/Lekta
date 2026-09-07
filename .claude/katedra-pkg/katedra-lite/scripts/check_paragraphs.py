#!/usr/bin/env python3
"""
check_paragraphs.py — geometrija odlomaka u STVARNOM prijelomu.

Zašto ne po broju znakova: procjena „znakova / 90" pogriješi na granici.
U ovom radu odlomci od 361 i 364 znaka prelomili su se u 4 retka, a onaj od
368 znakova u 5. Prag fakulteta („odlomak najmanje 5 redaka") ne može se
provjeriti bez rendera.

Mjeri tri stvari:
  1. odlomci ISPOD minimuma (tvrdo kršenje pravila fakulteta)
  2. odlomci IZNAD maksimuma (stranica mora primiti barem 2–3 odlomka)
  3. UJEDNAČENOST raspodjele — ako jedna duljina drži >25 % odlomaka,
     vidi se da su pisani po kalupu, jednako kao i AI-fraze

    python3 <KATEDRA_SKILL>/scripts/check_paragraphs.py rad.docx --profil <KATEDRA_SKILL>/references/fakulteti/efzg.json [--json]
    python3 <KATEDRA_SKILL>/scripts/check_paragraphs.py rad.docx --min MIN --max MAX  # eksplicitni override bez profila
    python3 <KATEDRA_SKILL>/scripts/check_paragraphs.py rad.docx --pdf rad.pdf --profil profil.json
"""
import argparse
import contextlib
import json
import math
import os
import re
import statistics
import subprocess
import sys
import tempfile
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hr_text as H
from profile_rules import ProfileRuleError, load_profile, resolve_paragraph_thresholds

SOFFICE = "/mnt/skills/public/docx/scripts/office/soffice.py"


@contextlib.contextmanager
def u_pdf(docx):
    """Renderiraj .docx u .pdf. Kontekst daje putanju ili None.

    Q13-zakrpa: privremeni direktorij se briše na izlazu iz konteksta —
    render rada ne smije ostati u /tmp nakon što alat završi.
    """
    with tempfile.TemporaryDirectory() as izlaz:
        cmd = ([sys.executable, SOFFICE] if os.path.exists(SOFFICE) else ["soffice"])
        try:
            subprocess.run(cmd + ["--headless", "--convert-to", "pdf",
                                  "--outdir", izlaz, os.path.abspath(docx)],
                           capture_output=True, timeout=180)
        except Exception:
            yield None
            return
        pdf = os.path.join(izlaz, os.path.splitext(os.path.basename(docx))[0] + ".pdf")
        yield pdf if os.path.exists(pdf) else None


def retci_i_stranice(pdf):
    """Retci prijeloma i redni broj stranice za svaki redak.

    Rep audita (2. krug): detekcija opreme oslanjala se isključivo na duljinu
    retka, a duljina je slabo obilježje (dugo tekuće zaglavlje je duže od
    medijana). Broj stranice iz pdftotexta je obilježje koje s duljinom nema
    veze: „\\f" stoji ispred prvog retka nove stranice. Sam popis redaka ostaje
    znak po znak isti kao prije (strip briše i „\\f"), pa pozivatelji koji
    stranice ne traže ne vide nikakvu razliku.
    """
    t = subprocess.run(["pdftotext", "-layout", pdf, "-"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
    retci, stranice, stranica = [], [], 0
    for red in t.split("\n"):
        stranica += len(red) - len(red.lstrip("\f"))
        retci.append(red.strip())
        stranice.append(stranica)
    return retci, stranice


def retci_pdfa(pdf):
    return retci_i_stranice(pdf)[0]


NORM = lambda s: re.sub(r"[^0-9a-zčćžšđ]", "", s.lower())

# D12-zakrpa: rimski broj stranice (i, ii, iv, xii…). Strogi oblik da hrvatske
# riječi sastavljene od istih slova (npr. „civil") ne prođu kao broj.
RIMSKI = re.compile(r"^m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$")


# D12-zakrpa (2. krug): tekuće zaglavlje najčešće NOSI broj stranice u sebi
# („Sveučilište u Zagrebu — Fakultet političkih znanosti      7"), pa je na
# svakoj stranici drukčije i ne ponavlja se doslovno. Za usporedbu se zato
# odbija broj s ruba retka; ostatak je isti na svim stranicama.
BROJ_NA_RUBU = (re.compile(r"^\d{1,4}"), re.compile(r"\d{1,4}$"))


def _bez_broja_stranice(red):
    """D12-zakrpa (2. krug): redak bez vodećeg i završnog broja stranice."""
    poc, kraj = BROJ_NA_RUBU
    return kraj.sub("", poc.sub("", red))


RUB_STRANICE = 3   # koliko punih redaka od vrha i dna stranice broji kao rub


def _rub_stranica(N, stranice):
    """Za svaki redak: na koliko se RAZLIČITIH stranica pojavljuje pri vrhu ili dnu.

    Rep audita (2. krug): stari uvjet tražio je da oprema bude KRAĆA od medijana
    retka. Duljina je krivo obilježje: tekuće zaglavlje s punim nazivom
    sveučilišta, studija i godine duže je od medijana (izmjereno 117 prema 82),
    pa nije prepoznato, ulazilo je u `buf` i brojilo se kao redak odlomka —
    dokument s dugim zaglavljem dobivao je drukčije mjerenje od bajt-identičnog
    dokumenta s kratkim (10 prema 9 odlomaka ispod praga).

    Obilježje koje ne ovisi o duljini: POLOŽAJ i PONAVLJANJE preko stranica.
    Položaj se ne mjeri „prvih n redaka" (na kratkoj stranici to proguta i prvu
    rečenicu odlomka), nego strukturno: zaglavlje je blok punih redaka na vrhu
    stranice DO prve prazne linije, podnožje isto takav blok na dnu. Tijelo
    teksta dolazi iza te prazne linije, pa u blok ne može upasti. Proza uz to ne
    ispunjava drugi uvjet — rečenica s vrha jedne stranice ne pojavljuje se
    doslovno na vrhu druge.
    """
    po_stranici = {}
    for i, x in enumerate(N):
        po_stranici.setdefault(stranice[i], []).append(x)
    na_rubu = Counter()
    for retci in po_stranici.values():
        blok = _blok(retci) | _blok(list(reversed(retci)))
        for x in blok:
            na_rubu[x] += 1                      # najviše jednom po stranici
    return na_rubu


def _blok(retci):
    """Puni retci od ruba stranice do prve prazne linije (najviše RUB_STRANICE)."""
    out = set()
    for x in retci:
        if not x:
            if out:
                break
            continue                             # vodeće prazne linije preskoči
        out.add(x)
        if len(out) >= RUB_STRANICE:
            break
    return out


def _okolina_stranice(N, stranice=None):
    """D12-zakrpa: (skup ponavljajućih zaglavlja/podnožja, medijan duljine retka).

    Zaglavlje i podnožje ponavljaju se na svakoj stranici; kad su poznate
    granice stranica, dovoljno je da se ponavljaju NA RUBU stranice (v.
    `_oprema_po_polozaju`). Kad granice nisu poznate (pozivatelj je predao samo
    popis redaka), ostaje stari, uži uvjet uz duljinu — bez podatka o stranici
    ponavljanje samo po sebi ne razlikuje zaglavlje od retka proze koji se u
    radu doista ponavlja.
    """
    duljine = [len(x) for x in N if x]
    if not duljine:
        return set(), 0.0
    medijan = float(statistics.median(duljine))
    broj = Counter(x for x in N if x)
    ponavljajuci = {x for x, c in broj.items() if c >= 2 and len(x) < medijan}
    # D12-zakrpa (2. krug): oprema s ugrađenim brojem stranice prepoznaje se po
    # tome što joj se OSTATAK ponavlja preko stranica. Uvjet „jezgra != x" drži
    # zahvat uskim: redak bez broja na rubu ovim putem ne može postati oprema,
    # pa proza ostaje netaknuta.
    bez_broja = Counter(_bez_broja_stranice(x) for x in N if x)
    na_rubu = _rub_stranica(N, stranice) if stranice else Counter()
    ponavljajuci |= {x for x, c in na_rubu.items() if c >= 2}
    # Zaglavlje s UGRAĐENIM brojem stranice na svakoj je stranici drugi niz
    # znakova, pa se samo po sebi ne ponavlja; ponavlja mu se jezgra (redak bez
    # broja s ruba). Zato se rubno pojavljivanje zbraja po jezgri.
    jezgre_na_rubu = Counter()
    for x, c in na_rubu.items():
        jezgre_na_rubu[_bez_broja_stranice(x)] += c
    for x in set(broj):
        jezgra = _bez_broja_stranice(x)
        if jezgra == x or len(jezgra) < 4 or bez_broja[jezgra] < 2:
            continue
        if len(x) < medijan or (na_rubu[x] and jezgre_na_rubu[jezgra] >= 2):
            ponavljajuci.add(x)
    return ponavljajuci, medijan


def _smetnja(red, ponavljajuci, medijan):
    """Je li redak oprema stranice (broj, zaglavlje, podnožje), a ne tekst?"""
    if not red:
        return True
    if red.isdigit() or RIMSKI.match(red):
        return True
    if red in ponavljajuci:
        return True
    return len(red) < 0.25 * medijan


def izmjeri(odlomci, retci, stranice=None):
    """Za svaki odlomak vrati broj redaka koje zauzima u prijelomu.

    `stranice` je neobavezan popis brojeva stranica po retku (v.
    `retci_i_stranice`); s njim se zaglavlje i podnožje prepoznaju po položaju,
    bez obzira na duljinu.
    """
    N = [NORM(l) for l in retci]
    ponavljajuci, medijan = _okolina_stranice(N, stranice)
    out, cur = [], 0
    for p in odlomci:
        cilj = NORM(p)
        glava = cilj[:30]
        poc = next((i for i in range(cur, len(N)) if glava and glava in N[i]), None)
        if poc is None:
            out.append((p, None))
            continue
        buf, k = "", poc
        # troši retke dok se ne potroši tekst odlomka; prazne i kratke
        # (broj stranice, zaglavlje) preskače bez brojanja
        potroseno = 0
        while k < len(N) and len(buf) < len(cilj) * 0.97:
            red = N[k]
            if red:
                # D12-zakrpa: redak se broji samo ako doista nastavlja tekst
                # odlomka; inače ga se preskače kad izgleda kao oprema stranice.
                # Bez ovoga odlomak prelomljen preko stranice dobiva broj
                # stranice i zaglavlje kao vlastite retke, pa lažno prolazi
                # tvrdi prag fakulteta.
                ostatak = cilj[len(buf):]
                nastavlja = ostatak.startswith(red) or ostatak[:24] == red[:24]
                if nastavlja or not _smetnja(red, ponavljajuci, medijan):
                    buf += red
                    potroseno += 1
            k += 1
        out.append((p, potroseno))
        cur = k
    return out


def procijeni(odlomci, znakova_po_retku):
    return [(p, math.ceil(len(p) / znakova_po_retku)) for p in odlomci]


# Q6b-zakrpa: kalibracija procjene.
# Staro „84 znaka/redak" precjenjivalo je broj redaka u 15 od 21 odlomka na
# stvarnom LibreOffice renderu hrvatske proze (TNR 12 / prored 1,5 / margine
# 2,54 cm), i to UVIJEK naviše — dakle uvijek u smjeru koji skriva prekratak
# odlomak. Izmjereni medijan PUNOG retka na tom renderu je 92 znaka
# (Times New Roman) odnosno 91,5 (Calibri), pa razlika među fontovima ne
# opravdava zaseban faktor. Iz toga slijedi prosječna širina znaka:
# (21 cm − 2 × 2,54 cm) = 451,3 pt / 92 znaka ≈ 0,409 × veličina pisma.
SIRINA_ZNAKA_EM = 0.409
SIRINA_STRANICE_CM = 21.0          # A4
CM_U_PT = 28.3465
ZNAKOVA_PO_RETKU_ZADANO = 92       # izmjereno: TNR 12 / prored 1,5 / margine 2,54 cm


def znakova_po_retku_iz_profila(profile):
    """Q6b-zakrpa: izvedi znakove/redak iz pisma i margina profila.

    Vrati None ako profil ne daje ni veličinu pisma ni margine — tada se
    ostaje na izmjerenom defaultu.
    """
    fmt = (profile or {}).get("format") or {}
    velicina = fmt.get("velicina_pt")
    margine = fmt.get("margine_cm") or {}
    lijevo, desno = margine.get("lijevo"), margine.get("desno")
    try:
        velicina = float(velicina)
        lijevo, desno = float(lijevo), float(desno)
    except (TypeError, ValueError):
        return None
    sirina_pt = (SIRINA_STRANICE_CM - lijevo - desno) * CM_U_PT
    if velicina <= 0 or sirina_pt <= 0:
        return None
    return max(20, round(sirina_pt / (SIRINA_ZNAKA_EM * velicina)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("rad")
    ap.add_argument("--pdf", help="gotov render (preskače konverziju)")
    ap.add_argument("--profil", help="flat JSON profil fakulteta; pragovi dolaze iz format.odlomak")
    ap.add_argument("--min", type=int, default=None, help="eksplicitni override najmanjeg broja redaka")
    ap.add_argument("--max", type=int, default=None, help="eksplicitni override najvećeg broja redaka")
    ap.add_argument("--udio-max", type=float, default=0.25,
                    help="najveći dopušteni udio jedne duljine")
    ap.add_argument("--znakova-po-retku", type=int, default=None,
                    help="samo za procjenu kad render ne uspije; zadano se izvodi iz "
                         "profila (veličina pisma i margine), inače izmjerenih "
                         f"{ZNAKOVA_PO_RETKU_ZADANO} (TNR 12 / 1,5 / 2,54 cm)")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    profile = None
    if args.profil:
        try:
            profile = load_profile(args.profil)
        except ProfileRuleError as e:
            ap.error(str(e))
    try:
        args.min, args.max = resolve_paragraph_thresholds(profile, args.min, args.max)
    except ProfileRuleError as e:
        # Kvar 98 (audit Znahor, A1): kad profil fakulteta jednostavno NE PROPISUJE
        # duljinu odlomka, ovo je izlazilo kroz ap.error, dakle izlazni kod 2, i
        # gate ga je trajno vodio kao „alat pukao". Alat nije pukao: nema što
        # mjeriti. To je deklarirana granica i ide u „preskočeno" (kod 3), točno
        # kako pravilo 20 razlikuje ta dva stanja.
        if "nije razriješen" in str(e):
            print(f"➖ {e}", file=sys.stderr)
            print("   Profil ovog fakulteta ne propisuje duljinu odlomka, pa se ona "
                  "ne provjerava.", file=sys.stderr)
            print("   Ako je želiš provjeriti ipak: --min N --max M.", file=sys.stderr)
            return 3
        ap.error(str(e))
    # Q6b-zakrpa: procjena se kalibrira iz profila, a ne fiksnih 84 znaka.
    if args.znakova_po_retku is None:
        args.znakova_po_retku = (znakova_po_retku_iz_profila(profile)
                                 or ZNAKOVA_PO_RETKU_ZADANO)

    # Rep audita (2. krug): eksplicitan --pdf koji ne postoji GASIO je automatski
    # render (grana `if not pdf`), pa je tipfeler u putanji tiho pretvarao tvrdo
    # mjerenje u procjenu — uz poruku „Render nije uspio", koja krivo optužuje
    # render, i uz izlaz 0 sa zelenom kvačicom za tvrdi prag fakulteta. Ako je
    # korisnik imenovao datoteku, njezin nedostatak je greška ulaza, ne razlog za
    # tihu degradaciju.
    if args.pdf and not os.path.isfile(args.pdf):
        ap.error(f"--pdf: nema datoteke {args.pdf}. Što napraviti: provjeri putanju "
                 "ili izostavi --pdf pa se .docx renderira sam.")

    odl, _ = H.ucitaj(args.rad)
    if not odl:
        sys.exit("Nije pronađen prozni tekst.")

    nacin = "render"
    with contextlib.ExitStack() as stog:
        pdf = args.pdf
        if not pdf and args.rad.endswith(".docx"):
            pdf = stog.enter_context(u_pdf(args.rad))
        if pdf and os.path.exists(pdf):
            mjere = izmjeri(odl, *retci_i_stranice(pdf))
        else:
            nacin = "procjena"
            mjere = procijeni(odl, args.znakova_po_retku)

    poznati = [(p, n) for p, n in mjere if n]
    D = [n for _, n in poznati]
    c = Counter(D)
    uk = len(D)
    kratki = [(n, p) for p, n in poznati if n < args.min]
    dugi = [(n, p) for p, n in poznati if n > args.max]
    najveci_udio = max(c.values()) / uk if uk else 0
    # Q6a-zakrpa: koliki je udio odlomaka uopće izmjeren — bez toga „sve je uredno"
    # znači i „ništa nije izmjereno".
    ukupno_odlomaka = len(mjere)
    nepoznati = ukupno_odlomaka - uk
    izmjereno_udio = round(uk / ukupno_odlomaka, 3) if ukupno_odlomaka else 0.0
    # Q6b-zakrpa: u procjeni odlomak unutar jednog retka od praga nije nalaz nego
    # raspon — brojka se navodi kao n−1 do n+1 i traži se render.
    granicni = []
    if nacin == "procjena":
        granicni = sorted((n, p) for p, n in poznati
                          if abs(n - args.min) <= 1 or abs(n - args.max) <= 1)

    if args.json:
        print(json.dumps({
            "nacin": nacin, "odlomaka": uk, "odlomaka_ukupno": ukupno_odlomaka,
            "izmjereno_udio": izmjereno_udio, "nije_pronadeno": nepoznati,
            "znakova_po_retku": args.znakova_po_retku if nacin == "procjena" else None,
            "raspodjela": dict(sorted(c.items())),
            "ispod_min": len(kratki), "iznad_max": len(dugi),
            "najveci_udio": round(najveci_udio, 3),
            "kratki": [{"redaka": n, "tekst": p[:120]} for n, p in kratki],
            "granicni": [{"redaka_od": max(1, n - 1), "redaka_do": n + 1,
                          "tekst": p[:120]} for n, p in granicni],
        }, ensure_ascii=False, indent=1))
        if not uk:
            return 2
        return 1 if kratki else 0

    print("=" * 72)
    print(f"GEOMETRIJA ODLOMAKA — {os.path.basename(args.rad)}")
    print("=" * 72)
    if nacin == "procjena":
        print("⚠ Render nije uspio. Brojke su PROCJENA po "
              f"{args.znakova_po_retku} znakova/redak i na granici znaju pogriješiti "
              "za jedan redak. Za tvrdi prag fakulteta potreban je render.\n")
    if nepoznati:
        # Q6a-zakrpa: upozorenje ide PRIJE zbroja, ne iza zelenih kvačica.
        print(f"⚠ {nepoznati} od {ukupno_odlomaka} odlomaka nije pronađeno u prijelomu "
              f"(izmjereno {izmjereno_udio*100:.0f} %).")
        print("   Što napraviti: provjeri je li --pdf render BAŠ ovoga rada; "
              "nepronađeni odlomci nisu provjereni.\n")
    if not uk:
        print("✗ Nijedan odlomak nije izmjeren — nema nalaza ni potvrde da je rad uredan.")
        print("   Što napraviti: provjeri je li --pdf render baš ovoga .docx-a i "
              "je li render nastao iz iste verzije teksta.")
        print()
        return 2
    print(f"način mjerenja: {nacin} | odlomaka: {uk} od {ukupno_odlomaka} "
          f"({izmjereno_udio*100:.0f} % izmjereno)\n")
    for k in sorted(c):
        oznaka = "  ← ispod praga" if k < args.min else ("  ← iznad praga" if k > args.max else "")
        print(f"  {k:2} redaka: {'█' * c[k]} {c[k]:3} ({c[k]/uk*100:4.1f} %){oznaka}")

    print()
    if kratki:
        print(f"  ✗ ISPOD {args.min} redaka: {len(kratki)}")
        for n, p in sorted(kratki):
            print(f"      [{n}] {p[:105]}…")
        print("      → Spoji sa susjednim odlomkom koji izvodi isti misaoni potez, ili")
        print("        prenesi jednu rečenicu preko granice. Nikad ne spajaj preko naslova")
        print("        ni preko natpisa prikaza; odlomak ispod prikaza spaja se samo unaprijed.")
    else:
        print(f"  ✓ nijedan odlomak nije ispod {args.min} redaka")

    if dugi:
        print(f"  ⚠ iznad {args.max} redaka: {len(dugi)}")
        for n, p in sorted(dugi, reverse=True)[:5]:
            print(f"      [{n}] {p[:105]}…")
        print("      → Stranica mora primiti barem 2–3 odlomka. Prebaci rečenicu u susjedni.")
    else:
        print(f"  ✓ nijedan odlomak nije iznad {args.max} redaka")

    if najveci_udio > args.udio_max:
        naj = c.most_common(1)[0]
        print(f"  ⚠ ujednačenost: {naj[1]} odlomaka ima točno {naj[0]} redaka "
              f"({najveci_udio*100:.0f} %, prag {args.udio_max*100:.0f} %)")
        print("      → Vidi se kalup. Duljina mora proizlaziti iz sadržaja: odlomak koji")
        print("        iznosi jednu tvrdnju s obrazloženjem kraći je od onoga koji niže dokaze.")
    else:
        print(f"  ✓ raspodjela raspršena (najveći udio {najveci_udio*100:.0f} %, "
              f"{len(c)} različitih duljina)")

    if granicni:
        # Q6b-zakrpa: procjena na granici praga navodi se kao raspon, ne kao brojka.
        print(f"\n  ⚠ na granici praga ({len(granicni)}) — procjena, ne mjerenje:")
        for n, p in granicni[:5]:
            print(f"      [{max(1, n - 1)}–{n + 1} redaka] {p[:95]}…")
        print("      → Procjena griješi za jedan redak. Što napraviti: renderiraj rad "
              "u PDF i pokreni")
        print("        isti alat s --pdf; tvrdi prag fakulteta provjerava se samo u prijelomu.")

    if nepoznati:
        print(f"\n  ⚠ {nepoznati} odlomaka nije pronađeno u prijelomu (provjeri ručno)")
    print()
    return 1 if kratki else 0


if __name__ == "__main__":
    sys.exit(main())
