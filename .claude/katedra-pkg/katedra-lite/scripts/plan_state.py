#!/usr/bin/env python3
"""Rad s `.katedra/plan.json` — planom i programom u strojno čitljivom obliku.

Po ovoj datoteci „nastavi rad" zna što se piše sljedeće, pa se korisnika nikad ne
pita „gdje smo stali". Sve izmjene idu kroz `_spremi()`: shema se validira prije
zapisa, zapis je atomaran (tmp + os.replace). Ručno uređivanje plan.json-a ruši
vezu između odobrenog plana i teksta.

Uporaba:
  python3 <KATEDRA_SKILL>/scripts/plan_state.py init --teza "..." --budzet 38
  python3 <KATEDRA_SKILL>/scripts/plan_state.py set --teza "..." --budzet 38
  python3 <KATEDRA_SKILL>/scripts/plan_state.py import ./plan.md
  python3 <KATEDRA_SKILL>/scripts/plan_state.py next
  python3 <KATEDRA_SKILL>/scripts/plan_state.py mark 4.2 --status napisano --rijeci 820
  python3 <KATEDRA_SKILL>/scripts/plan_state.py status
  python3 <KATEDRA_SKILL>/scripts/plan_state.py odstupanje --sto "spojena 4.2 i 4.3" --zasto "isti misaoni potez"
  python3 <KATEDRA_SKILL>/scripts/plan_state.py odobri
  python3 <KATEDRA_SKILL>/scripts/plan_state.py --kat /put/do/.katedra status

Izlazni kodovi:
  0  gotovo (uključujući „nema više nenapisanih potpoglavlja")
  1  plan je zapisan, ali ima upozorenja koja blokiraju sljedeći korak
  2  odbijeno: nema plana, nepoznato potpoglavlje, neispravan zahtjev ili shema
"""
import argparse
import datetime
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
from context import NesigurnaPutanja, atomic_write_json, resolve_state_dir  # noqa: E402
from perspective_map import BIG_WORKS, evaluate_map, load_map  # noqa: E402
from plan_gate import (  # noqa: E402
    OTISAK_KLJUC, STANJE_NEISPRAVNO, STANJE_NEPOZNAT_TIP, TIPOVI_RADA,
    approval_hash, approval_is_valid, evaluate_plan_gate, izvori_planirani,
    je_sadrzajno, state_plan_approved, work_type_status,
)

VERZIJA = 1
STATUSI = ("nije-napisano", "u-tijeku", "napisano", "provjereno")
GOTOVI = ("napisano", "provjereno")

# Gruba, ali stabilna mjera za hrvatski akademski tekst (TNR 12, prored 1,5).
RIJECI_PO_STRANICI = 250


def danas():
    return datetime.date.today().isoformat()


def put_plana(kat):
    return os.path.join(kat, "plan.json")


# ----------------------------------------------------------------- shema

def validiraj_shemu(plan):
    """Vrati popis grešaka (prazan = shema je u redu)."""
    g = []
    if not isinstance(plan, dict):
        return ["plan.json mora biti objekt"]
    if plan.get("verzija") != VERZIJA:
        g.append(f"verzija mora biti {VERZIJA} (dobiveno: {plan.get('verzija')!r})")
    if not isinstance(plan.get("teza", ""), str):
        g.append("teza mora biti tekst")
    if not isinstance(plan.get("odobren"), bool):
        g.append("odobren mora biti true/false")
    if plan.get("odobreno_datum") is not None and not isinstance(plan.get("odobreno_datum"), str):
        g.append("odobreno_datum mora biti datum (YYYY-MM-DD) ili null")
    if plan.get("odobreno_od") is not None and plan.get("odobreno_od") not in ("user", "full-auto"):
        g.append("odobreno_od mora biti user, full-auto ili null")
    if plan.get("budzet_stranica") is not None and not isinstance(plan.get("budzet_stranica"), int):
        g.append("budzet_stranica mora biti cijeli broj ili null")

    pogl = plan.get("poglavlja")
    if not isinstance(pogl, list):
        g.append("poglavlja moraju biti popis")
        pogl = []
    vidjeni = set()
    for i, p in enumerate(pogl):
        oznaka = f"poglavlja[{i}]"
        if not isinstance(p, dict):
            g.append(f"{oznaka} mora biti objekt")
            continue
        if not str(p.get("broj", "")).strip():
            g.append(f"{oznaka}.broj nedostaje")
        if not str(p.get("naslov", "")).strip():
            g.append(f"{oznaka}.naslov nedostaje")
        pot = p.get("potpoglavlja")
        if not isinstance(pot, list):
            g.append(f"{oznaka}.potpoglavlja moraju biti popis")
            continue
        for j, s in enumerate(pot):
            o2 = f"{oznaka}.potpoglavlja[{j}]"
            if not isinstance(s, dict):
                g.append(f"{o2} mora biti objekt")
                continue
            broj = str(s.get("broj", "")).strip()
            if not broj:
                g.append(f"{o2}.broj nedostaje")
            elif broj in vidjeni:
                g.append(f"broj potpoglavlja „{broj}\" pojavljuje se dvaput")
            else:
                vidjeni.add(broj)
            if not str(s.get("naslov", "")).strip():
                g.append(f"{o2}.naslov nedostaje")
            if s.get("status") not in STATUSI:
                g.append(f"{o2}.status mora biti jedan od: " + " ".join(STATUSI))
            if not isinstance(s.get("rijeci", 0), int):
                g.append(f"{o2}.rijeci mora biti cijeli broj")
            if not isinstance(s.get("izvori", []), list):
                g.append(f"{o2}.izvori moraju biti popis")

    if not isinstance(plan.get("prikazi", []), list):
        g.append("prikazi moraju biti popis")
    ods = plan.get("odstupanja", [])
    if not isinstance(ods, list):
        g.append("odstupanja moraju biti popis")
    else:
        for i, o in enumerate(ods):
            if not isinstance(o, dict) or not o.get("sto") or not o.get("zasto"):
                g.append(f"odstupanja[{i}] mora imati „sto\" i „zasto\"")
    return g


def _spremi(plan, kat):
    """Jedina točka zapisa: validacija sheme pa atomaran zapis (tmp + os.replace)."""
    greske = validiraj_shemu(plan)
    if greske:
        print("❌ plan nije zapisan jer ne prolazi shemu:", file=sys.stderr)
        for x in greske:
            print(f"   · {x}", file=sys.stderr)
        print("   Što napraviti: ispravi vrijednost kroz naredbe ove skripte "
              "(init / import / mark), ne ručno u JSON-u.", file=sys.stderr)
        return False
    os.makedirs(kat, exist_ok=True)
    # v1.1-advisory patch (Q14): zajednički atomaran zapis (context.py) umjesto
    # fiksnog „plan.json.tmp" — bez utrke i bez slijeđenja simboličkih poveznica.
    try:
        atomic_write_json(put_plana(kat), plan)
    except NesigurnaPutanja as e:
        print(f"❌ plan nije zapisan: {e}", file=sys.stderr)
        return False
    except OSError as e:
        print(f"❌ plan nije zapisan ({e}).", file=sys.stderr)
        print("   Što napraviti: provjeri prava pisanja nad .katedra/ pa ponovi naredbu.",
              file=sys.stderr)
        return False
    return True


def ucitaj(kat, tiho=False):
    put = put_plana(kat)
    if not os.path.isfile(put):
        if not tiho:
            print(f"❌ nema plana u {os.path.abspath(put)}.", file=sys.stderr)
            print("   Što napraviti: napravi kostur pa uvezi strukturu iz plana:\n"
                  "     python3 <KATEDRA_SKILL>/scripts/plan_state.py init --teza \"...\" --budzet 38\n"
                  "     python3 <KATEDRA_SKILL>/scripts/plan_state.py import ./plan.md", file=sys.stderr)
        return None
    try:
        with open(put, encoding="utf-8") as f:
            plan = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"❌ {put} nije čitljiv JSON: {e}", file=sys.stderr)
        print("   Što napraviti: vrati zadnju verziju iz gita ili ponovi init + import.",
              file=sys.stderr)
        return None
    greske = validiraj_shemu(plan)
    if greske:
        print("⚠️  postojeći plan ne prolazi shemu:", file=sys.stderr)
        for x in greske:
            print(f"   · {x}", file=sys.stderr)
        print("   Nastavljam čitati, ali svaki zapis će biti odbijen dok se ovo ne ispravi.\n",
              file=sys.stderr)
    return plan


# ----------------------------------------------------------------- pomoćno

def sva_potpoglavlja(plan):
    """Vrati [(poglavlje, potpoglavlje)] u redoslijedu plana."""
    out = []
    for p in plan.get("poglavlja", []):
        for s in p.get("potpoglavlja", []):
            out.append((p, s))
    return out


def novo_potpoglavlje(broj, naslov, stranice=None, sadrzaj="", izvori=None):
    return {
        "broj": broj,
        "naslov": naslov,
        "stranice": stranice,
        "sadrzaj": sadrzaj,
        "izvori": list(izvori or []),
        "status": "nije-napisano",
        "rijeci": 0,
    }


def stanje_tip(kat):
    """Tip rada iz stanje.json, ako postoji — samo za točnije upozorenje."""
    return work_type_status(kat)[1]


# v1.1-advisory patch (D14b): nečitljivo stanje ili tip izvan TIPOVI_RADA više ne
# prolaze kao „nema stanja"; prije je pokvaren stanje.json diplomski rad tiho
# spuštao na neograđeni seminarski i mijenjao izlazni kod s 1 na 0.
def zabrani_na_nepoznatom_tipu(kat, naslov="ZABRANA PISANJA"):
    """Vrati 1 i objasni ako se tip rada ne može potvrditi; inače (0, tip)."""
    status, tip = work_type_status(kat)
    if status == STANJE_NEISPRAVNO:
        print(f"❌ {naslov}: .katedra/stanje.json postoji, ali nije čitljiv, "
              "pa tip rada nije potvrđen.", file=sys.stderr)
        print("   Dok se ne zna je li ovo diplomski, nijedan gate ne vrijedi i ništa "
              "se ne piše.", file=sys.stderr)
        print("   Što napraviti: vrati stanje.json iz .katedra/migrations/ ili iz gita, "
              "pa provjeri sa stanje_init.py --validate.", file=sys.stderr)
        return 1, None
    if status == STANJE_NEPOZNAT_TIP:
        print(f"❌ {naslov}: stanje.json → tip „{tip}\" nije poznat tip rada.",
              file=sys.stderr)
        print("   Dopušteno: " + " ".join(TIPOVI_RADA), file=sys.stderr)
        print("   Što napraviti: python3 <KATEDRA_SKILL>/scripts/stanje_init.py "
              "--set tip=diplomski (ili ispravan tip), pa ponovi.", file=sys.stderr)
        return 1, None
    return 0, tip


# -------------------------------------------------------------------- init

def _ispisi_sto_init_brise(stari, kat):
    """Popiši, prije brisanja, sve što init --force nepovratno odnosi."""
    parovi = sva_potpoglavlja(stari)
    napisano = [str(s.get("broj")) for _, s in parovi
                if s.get("status") in GOTOVI or s.get("rijeci")]
    print("⚠️  init --force BRIŠE postojeći plan. Nepovratno nestaje:")
    print(f"   · struktura: {len(stari.get('poglavlja') or [])} poglavlja, "
          f"{len(parovi)} potpoglavlja")
    print(f"   · teza: {stari.get('teza') or '(prazno)'}")
    print(f"   · budžet stranica: {stari.get('budzet_stranica')}")
    print("   · evidencija napisanog: "
          + (", ".join(sorted(napisano, key=_kljuc_broja)) if napisano else "nema"))
    print(f"   · odobrenje plana: {'da → postaje ne' if stari.get('odobren') else 'ne'}")
    print(f"   · zabilježena odstupanja: {len(stari.get('odstupanja') or [])}")
    print(f"   · planirani prikazi: {len(stari.get('prikazi') or [])}")
    print("   Ako si htio samo promijeniti tezu ili budžet, to NIJE init:")
    print("     python3 <KATEDRA_SKILL>/scripts/plan_state.py set --teza \"...\" --budzet N")
    print()


def cmd_init(a, kat):
    postojeci = ucitaj(kat, tiho=True)
    if postojeci is not None and not a.force:
        print(f"❌ {put_plana(kat)} već postoji — init bi obrisao strukturu i napredak.")
        print("   Što napraviti:")
        print("     · samo teza ili budžet → python3 <KATEDRA_SKILL>/scripts/plan_state.py set --teza \"...\" --budzet N")
        print("     · uvoz nove strukture  → python3 <KATEDRA_SKILL>/scripts/plan_state.py import ./plan.md")
        print("     · pregled napretka     → python3 <KATEDRA_SKILL>/scripts/plan_state.py status")
        print("     · stvarno kreće ispočetka → ponovi s --force")
        return 2
    # v1.1-advisory patch (Q10): --force briše rad, pa mora naglas reći što briše.
    if postojeci is not None:
        _ispisi_sto_init_brise(postojeci, kat)
    plan = {
        "verzija": VERZIJA,
        "teza": a.teza or "",
        "odobren": False,
        "odobreno_datum": None,
        "odobreno_od": None,
        "budzet_stranica": a.budzet,
        "poglavlja": [],
        "prikazi": [],
        "odstupanja": [],
    }
    if not _spremi(plan, kat):
        return 2
    print(f"✅ kostur plana: {put_plana(kat)}")
    if postojeci is not None and state_plan_approved(kat):
        print("⚠️  stanje.json → plan_odobren i dalje stoji na true, a plan je upravo "
              "obrisan i više nije odobren.")
        print("   Uskladi odmah: python3 <KATEDRA_SKILL>/scripts/stanje_init.py "
              "--set plan_odobren=false")
    # v1.1-advisory patch (Q10, rep 2): upozorenje je hvatalo samo praznu tezu, pa je
    # „TBD" ili „—" prolazilo bez ijedne riječi upozorenja sve do plan gatea. Gate
    # sada takvu tezu odbija, pa neka to korisnik čuje odmah, a ne tek na `odobri`.
    if not je_sadrzajno(plan["teza"]):
        sto = "teza je prazna" if not str(plan["teza"]).strip() else \
            f"teza „{plan['teza']}\" je rezervirano mjesto"
        print(f"⚠️  {sto} — bez obranjive teze plan nije plan. "
              "Dopuni s: plan_state.py set --teza \"...\"  (ne init, init briše strukturu)")
    print("Sljedeći korak: python3 <KATEDRA_SKILL>/scripts/plan_state.py import ./plan.md "
          "(uvoz strukture iz PLANA I PROGRAMA)")
    return 0


# ------------------------------------------------------------------ import

RED_TABLICE = re.compile(r"^\s*\|(.+)\|\s*$")
NASLOV_MD = re.compile(r"^\s{0,3}(#{2,6})\s*(\d+(?:\.\d+)*)\.?\s+(.+?)\s*$")
BROJ = re.compile(r"^\d+(\.\d+)*$")

# PLAN I PROGRAM i sam ima numerirane sekcije (0–11). „## 4. Struktura rada" je
# sekcija plana, ne poglavlje rada — bez ovog popisa uvoz izmisli poglavlje.
SEKCIJE_PLANA = (
    "formalni zahtjevi", "gap-analiza", "gap analiza", "teza", "struktura rada",
    "struktura", "program pisanja", "plan tablica", "prikazi", "literatura",
    "metodolo", "hodogram", "pitanja", "isporuke", "sažetak", "sazetak",
    "polazište", "polaziste", "opseg",
)


def _kljuc_broja(broj):
    """'2.10' -> (2, 10); za ispis i redoslijed po planu, ne po redu u datoteci."""
    try:
        return tuple(int(x) for x in str(broj).split("."))
    except ValueError:
        return (10 ** 6,)


def _stranice_iz(tekst):
    m = re.search(r"(\d+(?:[.,]\d+)?)", tekst or "")
    if not m:
        return None
    try:
        # zaokruživanje na više: „2,5 str." je bliže 3 nego 2 kad se planira opseg
        return int(float(m.group(1).replace(",", ".")) + 0.5)
    except ValueError:
        return None


def _izvori_iz(tekst):
    if not tekst:
        return []
    dijelovi = [x.strip(" ·") for x in re.split(r"[;,]\s*(?![^\[]*\])", tekst) if x.strip(" ·")]
    return [d for d in dijelovi if d]


OGRADA = re.compile(
    r"<!--\s*STRUKTURA:POCETAK\s*-->(.*?)<!--\s*STRUKTURA:KRAJ\s*-->", re.S)


def _podrucje_strukture(tekst):
    """Vrati (podtekst, ogradjeno).

    Zašto ograda, a ne bolji regex: PLAN I PROGRAM sam po sebi ima numerirane sekcije,
    hodogram s `| 1 | Odobrenje plana |` i popis „ručno provjeri" s `| 1 | … |`. Svaki
    uzorak koji prepoznaje „broj pa naslov" pogodit će i hodogram, jer hodogram JEST
    tablica s brojem i naslovom. Razlika je semantička, ne sintaktička, pa mora biti
    eksplicitna.

    Bez ograde vraća cijeli tekst — stari planovi moraju nastaviti raditi.
    """
    m = OGRADA.search(tekst)
    if m:
        return m.group(1), True
    return tekst, False


def parsiraj_markdown(tekst):
    """Heuristika: retci tablice `| 2.1 | Naslov | 2 | opis | izvori |` i naslovi `### 2.1 Naslov`.

    Struktura se traži unutar ograde `<!-- STRUKTURA:POCETAK/KRAJ -->` ako je plan ima.

    Vraća (stavke, preskoceno). Stavka: dict s broj/naslov/stranice/sadrzaj/izvori/odakle.
    """
    tekst, _ = _podrucje_strukture(tekst)
    stavke, preskoceno = [], []
    for redak in tekst.splitlines():
        if not redak.strip():
            continue
        m = RED_TABLICE.match(redak)
        if m:
            celije = [c.strip() for c in m.group(1).split("|")]
            if not celije:
                continue
            prva = celije[0].strip("*` ").rstrip(".")
            if not BROJ.match(prva):
                if celije[0].strip() and not set(celije[0]) <= set("-: "):
                    preskoceno.append(redak.strip())
                continue
            stavke.append({
                "broj": prva,
                "naslov": (celije[1] if len(celije) > 1 else "").strip("*` "),
                "stranice": _stranice_iz(celije[2]) if len(celije) > 2 else None,
                "sadrzaj": celije[3].strip() if len(celije) > 3 else "",
                "izvori": _izvori_iz(celije[4]) if len(celije) > 4 else [],
                "odakle": "tablica",
            })
            continue
        m = NASLOV_MD.match(redak)
        if m:
            broj, naslov = m.group(2), m.group(3).strip("*` ")
            if "." not in broj and any(k in naslov.lower() for k in SEKCIJE_PLANA):
                preskoceno.append(f"{redak.strip()}   (izgleda kao sekcija PLANA, "
                                  f"ne poglavlje rada)")
                continue
            stavke.append({
                "broj": broj,
                "naslov": naslov,
                "stranice": None,
                "sadrzaj": "",
                "izvori": [],
                "odakle": "naslov",
            })

    # Budžet stranica veći od 100 gotovo je sigurno redak koji nije poglavlje. U praksi je
    # to bila stavka „3. Numeracija stranica. Nije propisana ni u jednom…" iz popisa
    # provjera, koja je ušla kao poglavlje s 300 stranica.
    for s in stavke:
        if s.get("stranice") and s["stranice"] > 100:
            preskoceno.append(f"poglavlje „{s['broj']}\" ima {s['stranice']} stranica — "
                              f"je li to redak strukture ili nešto drugo?")

    return stavke, preskoceno


def cmd_import(a, kat):
    kod, tip = zabrani_na_nepoznatom_tipu(kat, naslov="ZABRANA UVOZA")
    if kod:
        return kod
    if tip in BIG_WORKS:
        perspektive = evaluate_map(load_map(kat), tip)
        if not perspektive["ready"]:
            print("❌ PERSPECTIVE GATE: struktura završnog/diplomskog ne uvozi se prije perspective mapa.", file=sys.stderr)
            for razlog in perspektive["blocking_reasons"]:
                print(f"   · {razlog}", file=sys.stderr)
            print("   Što napraviti: perspective_map.py init + add najmanje dvije različite perspektive, pa validate.", file=sys.stderr)
            return 1
    put = os.path.abspath(a.datoteka)
    if not os.path.isfile(put):
        print(f"❌ nema datoteke {put}.", file=sys.stderr)
        print("   Što napraviti: navedi putanju do markdowna s PLANOM I PROGRAMOM, "
              "npr. python3 <KATEDRA_SKILL>/scripts/plan_state.py import ./plan.md", file=sys.stderr)
        return 2
    plan = ucitaj(kat)
    if plan is None:
        return 2

    with open(put, encoding="utf-8") as f:
        sirovi_plan = f.read()
    _, ogradjeno = _podrucje_strukture(sirovi_plan)
    stavke, preskoceno = parsiraj_markdown(sirovi_plan)
    if not ogradjeno:
        print("⚠️  plan nema ogradu <!-- STRUKTURA:POCETAK/KRAJ -->; strukturu tražim",
              file=sys.stderr)
        print("   u cijelom dokumentu, pa hodogram i popisi mogu ući kao poglavlja.",
              file=sys.stderr)
        print("   Što napraviti: dodaj ogradu oko tablice strukture i ponovi uvoz.",
              file=sys.stderr)

    if not stavke:
        print("❌ ništa nije prepoznato.", file=sys.stderr)
        print("   Uvoz prepoznaje dva oblika:", file=sys.stderr)
        print("     | 2.1 | Naslov | 2 | što ulazi | izvor A; izvor B |", file=sys.stderr)
        print("     ### 2.1 Naslov", file=sys.stderr)
        print("   Što napraviti: dopuni tablicu strukture u planu pa ponovi uvoz.",
              file=sys.stderr)
        return 2

    # sačuvaj napredak po broju potpoglavlja
    staro = {s["broj"]: s for _, s in sva_potpoglavlja(plan)}
    zapisano = [b for b, s in staro.items() if s.get("status") in GOTOVI or s.get("rijeci")]
    if zapisano and not a.force:
        print("⚠️  plan već ima napisanih potpoglavlja: " + ", ".join(sorted(zapisano)))
        print("   Uvoz prepisuje strukturu; status i broj riječi se prenose po broju,")
        print("   ali potpoglavlje kojeg u novom planu nema — nestaje iz evidencije.")
        print("   Što napraviti: zapiši izmjenu kao odstupanje pa ponovi s --force:")
        print("     python3 <KATEDRA_SKILL>/scripts/plan_state.py odstupanje --sto \"...\" --zasto \"...\"")
        print("     python3 <KATEDRA_SKILL>/scripts/plan_state.py import " + a.datoteka + " --force")
        return 2

    print("⚠️  UVOZ JE HEURISTIKA, ne parser plana.")
    print("   Prepoznaje samo retke tablice `| 2.1 | Naslov | 2 | opis | izvori |` i")
    print("   markdown naslove `### 2.1 Naslov`. Provjeri popis dolje prije nego kreneš pisati.")
    print()

    brojac = {"prijenos": 0}

    def prenesi(s):
        """Status i broj riječi preživljavaju ponovni uvoz, vežu se na broj."""
        broj = s["broj"]
        if broj in staro:
            s["status"] = staro[broj].get("status", "nije-napisano")
            s["rijeci"] = staro[broj].get("rijeci", 0)
            if not s["sadrzaj"]:
                s["sadrzaj"] = staro[broj].get("sadrzaj", "")
            if not s["izvori"]:
                s["izvori"] = staro[broj].get("izvori", [])
            if s["status"] != "nije-napisano" or s["rijeci"]:
                brojac["prijenos"] += 1
        return s

    poglavlja, indeks = [], {}
    for st in stavke:
        broj = st["broj"]
        if "." not in broj:
            if broj in indeks:
                p = indeks[broj]
                if st["naslov"]:
                    p["naslov"] = st["naslov"]
                if st["stranice"]:
                    p["stranice"] = st["stranice"]
                p["_sadrzaj"] = p.get("_sadrzaj") or st["sadrzaj"]
                p["_izvori"] = p.get("_izvori") or st["izvori"]
                continue
            p = {"broj": broj, "naslov": st["naslov"], "stranice": st["stranice"],
                 "potpoglavlja": [], "_sadrzaj": st["sadrzaj"], "_izvori": st["izvori"]}
            indeks[broj] = p
            poglavlja.append(p)
            continue
        roditelj = broj.split(".")[0]
        if roditelj not in indeks:
            p = {"broj": roditelj, "naslov": "(poglavlje nije imenovano u planu)",
                 "stranice": None, "potpoglavlja": [], "_sadrzaj": "", "_izvori": []}
            indeks[roditelj] = p
            poglavlja.append(p)
        indeks[roditelj]["potpoglavlja"].append(prenesi(
            novo_potpoglavlje(broj, st["naslov"], st["stranice"], st["sadrzaj"], st["izvori"])))

    # Uvod i Zaključak obično nemaju potpoglavlja; bez ove jedinice ih „next" nikad
    # ne bi ponudio jer status postoji samo na razini potpoglavlja.
    cjeloviti = []
    for p in poglavlja:
        if not p["potpoglavlja"]:
            p["potpoglavlja"].append(prenesi(novo_potpoglavlje(
                p["broj"], p["naslov"], p.get("stranice"),
                p.get("_sadrzaj", ""), p.get("_izvori", []))))
            cjeloviti.append(p["broj"])
        p.pop("_sadrzaj", None)
        p.pop("_izvori", None)

    # redoslijed po numeraciji plana, ne po redu pojavljivanja u datoteci
    poglavlja.sort(key=lambda p: _kljuc_broja(p["broj"]))
    for p in poglavlja:
        p["potpoglavlja"].sort(key=lambda s: _kljuc_broja(s["broj"]))

    plan["poglavlja"] = poglavlja
    # v1.1-advisory patch (D14a): uvoz mijenja upravo ono što je gate provjerio, pa
    # odobrenje ovdje pada eksplicitno i naglas — naljepnica „odobren" ne preživi
    # zamjenu strukture na koju se odnosila.
    bilo_odobreno = bool(plan.get("odobren"))
    if bilo_odobreno:
        plan["odobren"] = False
        plan["odobreno_datum"] = None
        plan["odobreno_od"] = None
        plan[OTISAK_KLJUC] = None
    if not _spremi(plan, kat):
        return 2

    if bilo_odobreno:
        print("⚠️  ODOBRENJE PLANA POVUČENO (plan.json → odobren: false).")
        print("   Razlog: uvoz je zamijenio strukturu, opise sadržaja i planirane izvore, "
              "a odobrenje je vrijedilo za prijašnji sadržaj.")
        print("   Što napraviti:")
        print("     1. provjeri popis dolje,")
        print("     2. python3 <KATEDRA_SKILL>/scripts/plan_state.py odobri")
        if state_plan_approved(kat):
            print("   ⚠️  stanje.json → plan_odobren i dalje stoji na true i sada laže; "
                  "do ponovnog odobrenja:")
            print("       python3 <KATEDRA_SKILL>/scripts/stanje_init.py --set plan_odobren=false")
        print()

    print("PREPOZNATO")
    print("-" * 72)
    for p in poglavlja:
        str_p = f"{p['stranice']} str." if p.get("stranice") else "— str."
        print(f"{p['broj']}. {p['naslov']}  [{str_p}]")
        for s in p["potpoglavlja"]:
            oznake = []
            # v1.1-advisory patch (Q10): „—", „?", „TBD" i „n/a" su rupa, ne sadržaj.
            if not je_sadrzajno(s["sadrzaj"]):
                oznake.append("bez sadržaja")
            if not izvori_planirani(s["izvori"]):
                oznake.append("bez izvora")
            rep = ("  ⚠️  " + ", ".join(oznake)) if oznake else "  ✅"
            st = f"{s['stranice']} str." if s.get("stranice") else "— str."
            print(f"    {s['broj']} {s['naslov']}  [{st}]{rep}")
    print("-" * 72)
    ukupno_pot = sum(len(p["potpoglavlja"]) for p in poglavlja)
    print(f"✅ uvezeno: {len(poglavlja)} poglavlja, {ukupno_pot} potpoglavlja → {put_plana(kat)}")
    if brojac["prijenos"]:
        print(f"   prenesen napredak za {brojac['prijenos']} potpoglavlja "
              "(status i broj riječi po broju)")
    if cjeloviti:
        print("   poglavlja bez potpoglavlja vode se kao jedna cjelina (piše se odjednom): "
              + ", ".join(sorted(cjeloviti, key=_kljuc_broja)))
    if preskoceno:
        print(f"⚠️  preskočeno {len(preskoceno)} redaka (zaglavlje tablice, redak bez broja "
              "u prvoj ćeliji, ili sekcija plana):")
        for r in preskoceno[:5]:
            print(f"     {r[:90]}")
        if len(preskoceno) > 5:
            print(f"     … i još {len(preskoceno) - 5}")
    print("Provjeri popis. Ako nešto fali, dopuni plan.md pa ponovi uvoz s --force.")
    return 0


# --------------------------------------------------------------------- next

def cmd_next(a, kat):
    plan = ucitaj(kat)
    if plan is None:
        return 2
    kod, tip = zabrani_na_nepoznatom_tipu(kat)
    if kod:
        return kod
    # v1.1-advisory patch (D14a): odobrenje se ovdje PROVJERAVA, ne čita kao naljepnica.
    odobrenje_ok, gate = approval_is_valid(kat)
    if tip in BIG_WORKS:
        if not odobrenje_ok:
            print(f"❌ ZABRANA PISANJA: {tip} rad nema važeće odobrenje plana.", file=sys.stderr)
            for razlog in gate.get("blocking_reasons", []):
                print(f"   · {razlog}", file=sys.stderr)
            print("   Prvo plan_state.py odobri, zatim sinkroniziraj stanje.json.", file=sys.stderr)
            return 1
        if not state_plan_approved(kat):
            print("❌ ZABRANA PISANJA: stanje.json → plan_odobren=false.", file=sys.stderr)
            print("   Nakon uspješnog plan gatea: stanje_init.py --set plan_odobren=true", file=sys.stderr)
            return 1
    parovi = sva_potpoglavlja(plan)
    if not parovi:
        print("❌ plan nema nijedno potpoglavlje.", file=sys.stderr)
        print("   Što napraviti: python3 <KATEDRA_SKILL>/scripts/plan_state.py import ./plan.md", file=sys.stderr)
        return 2

    sljedeci = None
    for p, s in parovi:
        if s.get("status") == "nije-napisano":
            sljedeci = (p, s)
            break

    if not sljedeci:
        u_tijeku = [s for _, s in parovi if s.get("status") == "u-tijeku"]
        print("✅ nema više nenapisanih potpoglavlja — struktura plana je pokrivena.")
        if u_tijeku:
            print("⚠️  još je u tijeku: " + ", ".join(s["broj"] for s in u_tijeku))
            print("   Zatvori ih s: python3 <KATEDRA_SKILL>/scripts/plan_state.py mark <broj> --status napisano --rijeci N")
        neprovjereno = [s for _, s in parovi if s.get("status") == "napisano"]
        if neprovjereno:
            print(f"Sljedeći korak: provjera ({len(neprovjereno)} potpoglavlja u statusu "
                  "„napisano\") → mod 4 audit, pa mark --status provjereno.")
        else:
            print("Sljedeći korak: mod 4 (audit) ili mod 6 (preflight pred predaju).")
        return 0

    p, s = sljedeci
    if not odobrenje_ok:
        if tip in ("zavrsni", "diplomski"):
            print(f"⚠️  ZABRANA PISANJA: {tip} rad, a plan nema važeće odobrenje.")
            print("   Prvo odobrenje korisnika, pa: python3 <KATEDRA_SKILL>/scripts/plan_state.py odobri\n")
        else:
            print("⚠️  plan nema važeće odobrenje — piše se na vlastitu odgovornost.")
            for razlog in gate.get("blocking_reasons", []):
                print(f"   · {razlog}")
            print()

    print("SLJEDEĆE POTPOGLAVLJE")
    print("=" * 72)
    print(f"Poglavlje    {p.get('broj')}. {p.get('naslov')}")
    print(f"Broj         {s['broj']}")
    print(f"Naslov       {s['naslov']}")
    stranice = s.get("stranice")
    rijeci_cilj = int(stranice * RIJECI_PO_STRANICI) if stranice else None
    print(f"Stranice     {stranice if stranice else '— (nije planirano)'}"
          + (f"  ≈ {rijeci_cilj} riječi" if rijeci_cilj else ""))
    print(f"Sadržaj      {s.get('sadrzaj') or '⚠️  nije definiran u planu'}")
    izvori = s.get("izvori") or []
    if izvori:
        print("Izvori       " + izvori[0])
        for i in izvori[1:]:
            print("             " + i)
    else:
        print("Izvori       ⚠️  nema ih u planu — svaka tvrdnja ide s [TREBA IZVOR]")
    prikazi = [x for x in plan.get("prikazi", []) if x.get("poglavlje") == s["broj"]]
    if prikazi:
        print("Prikazi      " + "; ".join(
            f"{x.get('oznaka', '?')} ({x.get('izvor', 'izvor nije naveden')})" for x in prikazi))
    teza = plan.get("teza")
    if teza:
        print(f"Teza rada    {teza}")
    print("=" * 72)
    print(f"Kad je gotovo: python3 <KATEDRA_SKILL>/scripts/plan_state.py mark {s['broj']} --status napisano --rijeci N")
    return 0


# --------------------------------------------------------------------- mark

def cmd_mark(a, kat):
    plan = ucitaj(kat)
    if plan is None:
        return 2
    if a.status not in STATUSI:
        print(f"❌ nepoznat status „{a.status}\".", file=sys.stderr)
        print("   Dopušteno: " + " → ".join(STATUSI), file=sys.stderr)
        return 2
    parovi = sva_potpoglavlja(plan)
    broj = a.broj.strip().rstrip(".")
    meta = None
    for p, s in parovi:
        if str(s.get("broj")) == broj:
            meta = (p, s)
            break
    if not meta:
        print(f"❌ potpoglavlje „{broj}\" ne postoji u planu.", file=sys.stderr)
        postojeci = ", ".join(str(s.get("broj")) for _, s in parovi) or "(plan je prazan)"
        print("   Postojeći brojevi: " + postojeci, file=sys.stderr)
        print("   Što napraviti: ili upiši točan broj, ili uvezi novu strukturu "
              "(plan_state.py import ./plan.md) i zapiši odstupanje.", file=sys.stderr)
        return 2

    p, s = meta
    prije = (s.get("status"), s.get("rijeci", 0))
    s["status"] = a.status
    if a.rijeci is not None:
        if a.rijeci < 0:
            print("❌ --rijeci ne može biti negativan.", file=sys.stderr)
            return 2
        s["rijeci"] = a.rijeci
    if not _spremi(plan, kat):
        return 2

    print(f"✅ {broj} {s['naslov']}: {prije[0]} → {s['status']}"
          + (f", riječi {prije[1]} → {s['rijeci']}" if a.rijeci is not None else ""))
    stranice = s.get("stranice")
    if stranice and s.get("rijeci"):
        cilj = stranice * RIJECI_PO_STRANICI
        odnos = s["rijeci"] / cilj
        if odnos < 0.7:
            print(f"⚠️  planirano ≈ {cilj} riječi ({stranice} str.), napisano {s['rijeci']} "
                  f"({odnos:.0%}) — ili dopiši, ili zapiši odstupanje.")
        elif odnos > 1.4:
            print(f"⚠️  planirano ≈ {cilj} riječi ({stranice} str.), napisano {s['rijeci']} "
                  f"({odnos:.0%}) — prekoračenje ide na račun drugog poglavlja; zapiši odstupanje.")
    ostalo = [x for _, x in sva_potpoglavlja(plan) if x.get("status") == "nije-napisano"]
    if ostalo:
        print(f"Preostalo nenapisanih: {len(ostalo)} → sljedeće: python3 <KATEDRA_SKILL>/scripts/plan_state.py next")
    else:
        print("Sve iz plana je pokriveno → python3 <KATEDRA_SKILL>/scripts/plan_state.py status")
    return 0


# ------------------------------------------------------------------- status

def cmd_status(a, kat):
    plan = ucitaj(kat)
    if plan is None:
        return 2
    parovi = sva_potpoglavlja(plan)
    print("NAPREDAK PO PLANU")
    print("=" * 72)
    print(f"Teza          {plan.get('teza') or '⚠️  nije upisana'}")
    # v1.1-advisory patch (D14a): „odobren" je tvrdnja koja se provjerava, ne naljepnica.
    odobrenje_ok, gate = approval_is_valid(kat)
    if odobrenje_ok:
        print(f"Plan odobren  da ({plan.get('odobreno_datum')})")
    elif plan.get("odobren"):
        print(f"Plan odobren  ⚠️  zastarjelo odobrenje ({plan.get('odobreno_datum')}) "
              "— NE vrijedi za sadašnji plan")
        for razlog in gate.get("blocking_reasons", []):
            print(f"              · {razlog}")
    else:
        print("Plan odobren  ⚠️  ne")
    print("-" * 72)
    if not parovi:
        print("⚠️  plan nema potpoglavlja. Sljedeći korak: plan_state.py import ./plan.md")
        return 1

    ukupno_rijeci = 0
    gotovih = 0
    for p in plan.get("poglavlja", []):
        pot = p.get("potpoglavlja", [])
        g = sum(1 for s in pot if s.get("status") in GOTOVI)
        r = sum(int(s.get("rijeci") or 0) for s in pot)
        ukupno_rijeci += r
        gotovih += g
        udio = f"{g}/{len(pot)}"
        stanje_znak = "✅" if pot and g == len(pot) else ("⚠️" if g else "  ")
        print(f"{stanje_znak} {p.get('broj')}. {p.get('naslov')[:44].ljust(44)} "
              f"{udio.rjust(6)}  {r:>6} rij.")
        for s in pot:
            oznaka = {"nije-napisano": "·", "u-tijeku": "~", "napisano": "+",
                      "provjereno": "✅"}.get(s.get("status"), "?")
            print(f"     {oznaka} {s.get('broj')} {str(s.get('naslov'))[:40].ljust(40)} "
                  f"{str(s.get('status')).ljust(13)} {int(s.get('rijeci') or 0):>6} rij.")
    print("-" * 72)
    n = len(parovi)
    postotak = gotovih / n * 100 if n else 0
    print(f"Potpoglavlja  {gotovih}/{n} napisano ({postotak:.0f} %)")
    print(f"Riječi        {ukupno_rijeci}")

    budzet = plan.get("budzet_stranica")
    cilj_str = sum(int(s.get("stranice") or 0) for _, s in parovi)
    cilj = None
    if budzet:
        cilj = budzet * RIJECI_PO_STRANICI
        izvor_cilja = f"budžet {budzet} str."
    elif cilj_str:
        cilj = cilj_str * RIJECI_PO_STRANICI
        izvor_cilja = f"zbroj planiranih stranica ({cilj_str})"
    if cilj:
        preostalo = cilj - ukupno_rijeci
        if preostalo > 0:
            print(f"Preostalo     ≈ {preostalo} riječi do cilja ({cilj}, "
                  f"{izvor_cilja} × {RIJECI_PO_STRANICI} rij./str.)")
        else:
            print(f"Preostalo     cilj ({cilj} rij., {izvor_cilja}) premašen za "
                  f"{-preostalo} riječi ⚠️")
    else:
        print("Preostalo     ⚠️  nema budžeta stranica — postavi ga s: "
              "plan_state.py set --budzet N  (init bi obrisao strukturu)")

    ods = plan.get("odstupanja") or []
    print("-" * 72)
    if ods:
        print(f"ODSTUPANJA OD PLANA ({len(ods)})")
        for o in ods:
            print(f"  · [{o.get('datum', '?')}] {o.get('sto')}")
            print(f"      zašto: {o.get('zasto')}")
    else:
        print("Odstupanja    nema zabilježenih")
    print("=" * 72)
    nesljedeci = [s for _, s in parovi if s.get("status") == "nije-napisano"]
    if nesljedeci:
        print(f"Sljedeće: python3 <KATEDRA_SKILL>/scripts/plan_state.py next  (prvo nenapisano: {nesljedeci[0]['broj']})")
    return 0


# --------------------------------------------------------------- odstupanje

def cmd_odstupanje(a, kat):
    plan = ucitaj(kat)
    if plan is None:
        return 2
    if not a.sto or not a.zasto:
        print("❌ odstupanje bez razloga se ne zapisuje.", file=sys.stderr)
        print("   Primjer: python3 <KATEDRA_SKILL>/scripts/plan_state.py odstupanje --sto \"spojena 4.2 i 4.3\" "
              "--zasto \"isti misaoni potez, 1,5 str. praznog hoda\"", file=sys.stderr)
        return 2
    plan.setdefault("odstupanja", []).append(
        {"datum": danas(), "sto": a.sto.strip(), "zasto": a.zasto.strip()})
    if not _spremi(plan, kat):
        return 2
    print(f"✅ zabilježeno odstupanje ({len(plan['odstupanja'])} ukupno): {a.sto}")
    print("   Ovo ide i u sažetak za mentora — odobreni plan i rad sada se razlikuju "
          "objašnjeno, ne tiho.")
    return 0


# ---------------------------------------------------------------------- set

# v1.1-advisory patch (Q10): teza i budžet dosad su se mijenjali samo kroz „init --force",
# koji briše strukturu, napredak i odstupanja. „set" mijenja samo ta dva polja.
def cmd_set(a, kat):
    plan = ucitaj(kat)
    if plan is None:
        return 2
    if a.teza is None and a.budzet is None:
        print("❌ set bez izmjene: navedi --teza i/ili --budzet.", file=sys.stderr)
        print("   Primjer: python3 <KATEDRA_SKILL>/scripts/plan_state.py set "
              "--teza \"...\" --budzet 38", file=sys.stderr)
        return 2
    if a.budzet is not None and a.budzet <= 0:
        print("❌ --budzet mora biti pozitivan broj stranica.", file=sys.stderr)
        return 2

    promjene = []
    if a.teza is not None:
        promjene.append(f"teza: {plan.get('teza') or '(prazno)'} → {a.teza}")
        plan["teza"] = a.teza
    if a.budzet is not None:
        promjene.append(f"budzet_stranica: {plan.get('budzet_stranica')} → {a.budzet}")
        plan["budzet_stranica"] = a.budzet

    # teza je dio otiska odobrenja; budžet stranica nije predmet plan gatea.
    povuceno = bool(plan.get("odobren")) and a.teza is not None
    if povuceno:
        plan["odobren"] = False
        plan["odobreno_datum"] = None
        plan["odobreno_od"] = None
        plan[OTISAK_KLJUC] = None
    if not _spremi(plan, kat):
        return 2

    print("✅ izmijenjeno bez diranja strukture, napretka i odstupanja:")
    for x in promjene:
        print(f"   · {x}")
    # v1.1-advisory patch (Q10, rep 2): ista simetrija kao u initu — rezervirano
    # mjesto umjesto teze mora se čuti odmah, jer plan gate na njemu pada.
    if a.teza is not None and not je_sadrzajno(a.teza):
        print("⚠️  upisana teza je rezervirano mjesto, ne tvrdnja — plan gate će je odbiti "
              "(„plan nema obranjivu tezu\").")
    if povuceno:
        print("⚠️  ODOBRENJE PLANA POVUČENO (plan.json → odobren: false): promijenjena je "
              "teza, a ona je predmet plan gatea.")
        print("   Što napraviti: python3 <KATEDRA_SKILL>/scripts/plan_state.py odobri")
        if state_plan_approved(kat):
            print("   ⚠️  stanje.json → plan_odobren i dalje stoji na true; do ponovnog "
                  "odobrenja: stanje_init.py --set plan_odobren=false")
    return 0


# ------------------------------------------------------------------- odobri

def cmd_odobri(a, kat):
    plan = ucitaj(kat)
    if plan is None:
        return 2

    report = evaluate_plan_gate(plan, kat)
    if not report["passed"]:
        print("❌ PLAN GATE: plan NIJE odobren; odobren ostaje false.", file=sys.stderr)
        for razlog in report["blocking_reasons"]:
            print(f"   · {razlog}", file=sys.stderr)
        print("   Ispravi gate nalaze pa ponovno pokreni plan_state.py odobri.", file=sys.stderr)
        return 1

    plan["odobren"] = True
    plan["odobreno_datum"] = danas()
    plan["odobreno_od"] = a.actor
    # v1.1-advisory patch (D14a): odobrenje se veže na sadržaj koji je gate pregledao.
    plan[OTISAK_KLJUC] = approval_hash(plan, kat, work_type=report.get("work_type"))
    if not _spremi(plan, kat):
        return 2

    print(f"✅ PLAN GATE PASS — plan odobren ({plan['odobreno_datum']}, actor={a.actor}).")
    print(f"   Odobrenje je vezano na sadašnji sadržaj plana ({plan[OTISAK_KLJUC][:19]}…); "
          "svaka izmjena teze, strukture, opisa ili izvora ga povlači.")
    print("Sljedeći korak: python3 <KATEDRA_SKILL>/scripts/stanje_init.py --set plan_odobren=true")
    return 0


# ---------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description="Rad s .katedra/plan.json.")
    ap.add_argument("--kat", default=None,
                    help="eksplicitna putanja do .katedra/ (ima prednost nad project rootom)")
    ap.add_argument("--project-root", default=None,
                    help="korijen rada; zadano: KATEDRA_PROJECT_ROOT ili trenutni direktorij")
    pod = ap.add_subparsers(dest="naredba", required=True)

    p = pod.add_parser("init", help="stvori kostur plana")
    p.add_argument("--teza", default="")
    p.add_argument("--budzet", type=int, default=None, help="budžet stranica")
    p.add_argument("--force", action="store_true")

    p = pod.add_parser("set", help="promijeni tezu i/ili budžet stranica bez brisanja plana")
    p.add_argument("--teza", default=None)
    p.add_argument("--budzet", type=int, default=None, help="budžet stranica")

    p = pod.add_parser("import", help="uvezi strukturu iz markdowna (heuristika)")
    p.add_argument("datoteka")
    p.add_argument("--force", action="store_true")

    pod.add_parser("next", help="prvo potpoglavlje sa status=nije-napisano")

    p = pod.add_parser("mark", help="postavi status potpoglavlja")
    p.add_argument("broj")
    p.add_argument("--status", default="napisano", help=" | ".join(STATUSI))
    p.add_argument("--rijeci", type=int, default=None)

    pod.add_parser("status", help="pregled napretka")

    p = pod.add_parser("odstupanje", help="zabilježi izmjenu plana s razlogom")
    p.add_argument("--sto", required=True)
    p.add_argument("--zasto", required=True)

    p = pod.add_parser("odobri", help="označi plan odobrenim nakon plan gatea")
    p.add_argument("--actor", choices=["user", "full-auto"], default="user",
                   help="tko je autorizirao prijelaz; full-auto znači prethodnu korisničku autorizaciju autopilota")

    a = ap.parse_args()
    kat = resolve_state_dir(a.kat, a.project_root)
    naredbe = {
        "init": cmd_init, "set": cmd_set, "import": cmd_import, "next": cmd_next,
        "mark": cmd_mark, "status": cmd_status, "odstupanje": cmd_odstupanje,
        "odobri": cmd_odobri,
    }
    return naredbe[a.naredba](a, kat)


if __name__ == "__main__":
    sys.exit(main())
