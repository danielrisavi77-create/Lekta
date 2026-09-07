#!/usr/bin/env python3
"""Profil autora između radova — što se ponavlja iz rada u rad.

Ista slabost se vraća: isti tik u stilu, isti tip zamjerke mentora, ista rupa u
argumentu. Bez pamćenja između radova svaki rad počinje od nule i istu lekciju
plaća dvaput.

ŠTO SE SPREMA: samo NAZIVI nalaza i brojači, plus defaulti (fakultet, tip rada,
citatni stil). ŠTO SE NE SPREMA: nijedna rečenica iz rada, nijedan dio rečenice,
nijedan naslov rada, nijedno ime mentora, nijedan osobni podatak, nijedna tema.
Naziv nalaza smije navesti pojam samo ako dolazi iz ZATVORENOG kataloga alata
(vezno sredstvo, glagol uvođenja izvora, katalog fraza); sve iz otvorenog
rječnika rada — početak rečenice, naziv ustanove, ime slučaja — izbacuje se.
Profil je popis kategorija i brojeva, ne arhiva tekstova. Datoteka je čitljiv
JSON — otvori je i provjeri sam, `zaboravi --sve` je briše u cijelosti.

Uporaba:
  python3 <KATEDRA_SKILL>/scripts/user_profile.py brief
  python3 <KATEDRA_SKILL>/scripts/user_profile.py learn --stil ./stil.json --argument ./.katedra/arg.json \\
          --zamjerke ./.katedra/zamjerke.json --fakultet fpzg --tip diplomski
  python3 <KATEDRA_SKILL>/scripts/user_profile.py zaboravi --nalaz "argument: teza"
  python3 <KATEDRA_SKILL>/scripts/user_profile.py zaboravi --sve

Izlazni kodovi:
  0  gotovo (i kad profila nema — to nije greška)
  1  brief je našao ponavljajuće slabosti (≥2 rada)
  2  ulazna datoteka se ne može pročitati, brisanje nije potvrđeno, ili se
     profil ne može sigurno zapisati
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
from context import NesigurnaPutanja, atomic_write_json  # noqa: E402

ZADANI_PROFIL = os.path.expanduser("~/.katedra/profil.json")
VERZIJA = 1
PRAG_PONAVLJANJA = 2
OK = "✅"

# „Na što paziti" po vrsti nalaza. Ključ se traži kao podniz u nazivu nalaza.
SAVJETI = [
    ("fraza", "Fraze se vraćaju jer su udobne. Prije predaje pretraži tekst po njima "
              "i preformuliraj svaku pojavu."),
    ("početak rečenice", "Variraj početke: priložna oznaka, zavisna rečenica ili objekt "
                         "na početku, ne uvijek subjekt."),
    ("glagol uvođenja izvora", "Isti glagol atribucije (navodi, ističe) troši se brzo. "
                               "Planiraj tri-četiri varijante po poglavlju."),
    ("rečenic", "Ritam ti bježi u istu duljinu. Nakon svakog poglavlja izmjeri "
                "check_ai_style.py, ne na kraju rada."),
    ("vezno sredstvo", "Isto vezno sredstvo se vraća. Vezna sredstva planiraj pri "
                       "pisanju odlomka, ne pri lekturi."),
    ("veznih sredstava", "Repertoar veznih sredstava ti je uzak. Napiši si popis od "
                         "deset i drži ga uz tekst."),
    ("kohezij", "Vezna sredstva planiraj pri pisanju odlomka, ne pri lekturi."),
    ("argument: teza", "Teza ti se gubi. Napiši je u jednoj rečenici PRIJE pisanja i "
                       "drži je vidljivom uz tekst."),
    ("argument: zaključak", "Zaključak ne zatvara krug. Provjeri odgovara li doslovno "
                            "na tezu iz uvoda."),
    ("argument: proporcije", "Poglavlja ti ispadaju neujednačena. Budžet stranica iz "
                             "plana provjeri na pola rada, ne na kraju."),
    ("argument: deskriptivnost", "Sklonost prepričavanju izvora. Dodaj analitičku vezu: "
                                 "uzrok, kontrast, usporedbu, inferenciju ili evaluaciju."),
    ("doprinos", "Vlastiti doprinos ostaje nevidljiv. Označi mjesta gdje govoriš ti, "
                 "a ne izvor."),
    ("istraživačk", "Istraživačko pitanje ti se ne vidi u tekstu. Postavi ga eksplicitno "
                    "u uvodu i vrati mu se u zaključku."),
    ("citatn", "Citatna gustoća je ponavljajući nalaz. Provjeri pokrivenost po "
               "poglavljima prije predaje, ne na kraju."),
    ("zamjerka mentora: citiranje", "Mentor ti ponovljeno prigovara citiranju. Pokreni "
                                    "verify_sources.py --pokrivenost prije slanja."),
    ("zamjerka mentora: struktura", "Struktura je opetovana zamjerka. Plan poglavlja "
                                    "daj mentoru na odobrenje prije pisanja."),
    ("zamjerka mentora: sadrzaj", "Zamjerke na sadržaj se ponavljaju: piši manje opisa, "
                                  "više analize."),
    ("zamjerka mentora: stil", "Stil je opetovana zamjerka. Odvoji zaseban prolaz za "
                               "stil, ne ispravljaj usput."),
    ("zamjerka mentora: forma", "Forma se ponavlja: prije predaje odradi preflight "
                                "(margine, prored, numeracija, sadržaj)."),
]
ZADANI_SAVJET = ("Pojavljuje se u više radova — stavi ga na self-check listu prije "
                 "sljedeće isporuke.")


# --------------------------------------------------------------- pomoćno

def danas():
    return datetime.date.today().isoformat()


def mn(n, jednina, dvojina, mnozina):
    """Hrvatska sročnost uz broj: 1 rad · 2 rada · 5 radova."""
    z, d = n % 10, n % 100
    if 11 <= d <= 14:
        return mnozina
    return jednina if z == 1 else (dvojina if z in (2, 3, 4) else mnozina)


def naziv_nalaza(s, prefiks=""):
    """Iz poruke nalaza izvedi stabilan NAZIV (bez brojki, mjera i primjera iz teksta).

    „vezno sredstvo „dok" 1× (5.4/1000)" → „vezno sredstvo „dok"". Brojka se ne
    sprema: mijenja se od rada do rada, a ime nalaza mora ostati isto da bi se
    ponavljanje uopće vidjelo.
    """
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    s = re.sub(r"\([^)]*\)", " ", s)                     # (prag 20–24), (5.4/1000)
    s = re.sub(r"\b\d+([.,]\d+)?\s*(×|%|/\s*\d+|riječi|puta)?", " ", s)
    s = re.sub(r"^(samo|tek|previše|čak)\s+", "", s)     # ostatak brojčane tvrdnje
    s = re.sub(r"[/·…]+", " ", s)
    s = re.sub(r"\s{2,}", " ", s).strip(" :·-,")
    return (prefiks + s)[:80] if s else ""


# Q13-zakrpa: nalazi čiji je navedeni sadržaj ZATVOREN katalog alata. Samo se
# kod njih navodnici smiju zadržati — te riječi dolaze iz popisa u
# check_ai_style.py, ne iz teksta rada. „početak rečenice" nosi prve dvije
# riječi ponovljene rečenice, dakle otvoreni rječnik (naziv ustanove, ime
# slučaja), i takav sadržaj ne smije završiti u ~/.katedra/profil.json.
ZATVORENI_KATALOZI = ("vezno sredstvo", "glagol uvođenja izvora", "fraza")

# Q13-zakrpa (2. krug): povjerenje je obrnuto. Navedeni sadržaj preživi SAMO ako
# naziv nalaza POČINJE jednom od gornjih vrsta (uz poznati prefiks). Podniz nije
# dovoljan: nalaz „nedostaje vezno sredstvo u rečenici „…\"" sadrži isti niz
# znakova, a nosi rečenicu iz rada. Svaka nova, ovdje nenabrojena vrsta nalaza
# gubi navedeni sadržaj — zadano je brisanje, ne propuštanje.
PREFIKSI_NALAZA = ("stil:", "argument:", "zamjerka mentora:")


def iz_zatvorenog_kataloga(naziv):
    """Dolazi li navedeni sadržaj ovoga nalaza iz ZATVORENOG kataloga alata?

    Naziv mora BITI ta vrsta nalaza, a ne samo početi njezinim imenom: iza vrste
    smije stajati jedino navedeni pojam. „fraza iz uvodnog dijela poglavlja „…\""
    zato ne prolazi, a „fraza „Riječ je o\"" prolazi.
    """
    s = str(naziv or "").strip().lower()
    for p in PREFIKSI_NALAZA:
        if s.startswith(p):
            s = s[len(p):].lstrip()
            break
    for k in ZATVORENI_KATALOZI:
        if s.startswith(k):
            return s[len(k):].lstrip()[:1] in ("„", '"', "”")
    return False


def bez_citata_iz_rada(naziv):
    """Izbaci navedeni tekst iz naziva nalaza ako nije iz zatvorenog kataloga."""
    s = str(naziv or "")
    if "„" not in s and '"' not in s and "”" not in s:
        return s
    if iz_zatvorenog_kataloga(s):
        return s
    s = re.sub(r"„[^„”\"]*[”\"]?", " ", s)
    s = re.sub(r"[”\"][^„”\"]*[”\"]", " ", s)
    s = re.sub(r"[„”\"]", " ", s)
    s = re.sub(r"\s{2,}", " ", s).strip(" …·-,")
    return "" if s.rstrip(": ") in ("", "stil", "argument", "zamjerka mentora") else s


PREFIKS_ZAMJERKE = "zamjerka mentora: "


def ocisti_naziv(naziv):
    """Naziv nalaza očišćen prije zapisa i prije ispisa (isto pravilo na oba puta).

    Rep audita (2. krug): profil zapisan ranijom verzijom već sadrži slobodan
    tekst mentora kao naziv nalaza, a čišćenje pri čitanju ovisilo je o
    navodnicima — kojih u mentorovoj rečenici nema. Zato se ovdje primjenjuje i
    pravilo o obliku kategorije, pa se stari zapis pri prvom čitanju svede na
    „zamjerka mentora: ostalo" i brojači se spoje.
    """
    s = bez_citata_iz_rada(naziv)
    if s.startswith(PREFIKS_ZAMJERKE):
        tip = s[len(PREFIKS_ZAMJERKE):].strip()
        return PREFIKS_ZAMJERKE + (tip if SLUG_TIPA.match(tip) else "ostalo")
    return s


def savjet_za(naziv):
    n = naziv.lower()
    for kljuc, tekst in SAVJETI:
        if kljuc.lower() in n:
            return tekst
    return ZADANI_SAVJET


def prazan():
    return {"verzija": VERZIJA, "radova": 0, "fakulteti": {}, "tipovi": {},
            "citatni_stilovi": {}, "nalazi": {}, "azurirano": danas()}


def ucitaj(put):
    if not os.path.isfile(put):
        return None
    try:
        with open(put, encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"❌ {put} nije čitljiv JSON: {e}\n"
              f"   Što napraviti: obriši ga (python3 <KATEDRA_SKILL>/scripts/user_profile.py zaboravi --sve --da) "
              f"i uči ispočetka — profil ne sadrži ništa nenadoknadivo.", file=sys.stderr)
        return "GRESKA"
    if not isinstance(d, dict) or "nalazi" not in d:
        print(f"❌ {put} nema očekivani oblik (ključ „nalazi\").", file=sys.stderr)
        return "GRESKA"
    for k, v in prazan().items():
        d.setdefault(k, v)
    # Q13-zakrpa: profil zapisan starijom verzijom može sadržavati navedeni tekst
    # iz rada. Čisti se već pri čitanju, da ga `brief` ne iznese u novu sesiju.
    ocisceni = {}
    for naziv, v in (d.get("nalazi") or {}).items():
        n2 = ocisti_naziv(naziv)
        if not n2:
            continue
        if not isinstance(v, dict):
            ocisceni.setdefault(n2, v)
            continue
        s = ocisceni.setdefault(n2, {"radova": 0, "ukupno": 0, "zadnji": ""})
        if not isinstance(s, dict):
            continue
        s["radova"] += int(v.get("radova", 0) or 0)
        s["ukupno"] += int(v.get("ukupno", 0) or 0)
        s["zadnji"] = max(s["zadnji"], str(v.get("zadnji", "") or ""))
    d["nalazi"] = ocisceni
    return d


def spremi(put, d):
    """Q14-zakrpa: zapis je išao na fiksno ime `profil.json.tmp`.

    Ime je bilo predvidivo i zajedničko svim istovremenim pozivima: dva `learn`
    poziva iz dvije sesije rušila su se jedan drugom na os.replace, a već
    postojeća simbolička poveznica na toj putanji slijedila se, pa je profil
    autora završavao izvan ~/.katedra. Zajednički helper piše u jedinstvenu
    privremenu datoteku u istom direktoriju.

    Rep audita (2. krug) — PREKORREKCIJA: uz to je zabranjen i zapis kad je sam
    profil poveznica. Za projektno stanje u repozitoriju to pravilo drži, ali
    ~/.katedra nije alatov direktorij: GNU stow i chezmoi rutinski simlinkaju
    korisničku konfiguraciju u $HOME, pa je takav profil ISPRAVAN ulaz, a
    odbijanje (rc=2) korisniku bez ikakve upute blokira posve uredan setup.
    Profil se zato piše kroz poveznicu — atomarno, u pravu datoteku na koju
    poveznica pokazuje, tako da poveznica ostaje netaknuta. Vraća se putanja na
    koju je zapis STVARNO otišao, da ispis ne tvrdi jedno dok se piše drugdje.
    """
    return os.path.realpath(atomic_write_json(put, d, dopusti_poveznicu=True))


def ucitaj_ulaz(put, opis):
    """Vrati JSON iz ulazne datoteke ili None (uz jasnu poruku, bez rušenja)."""
    if not put:
        return None
    if not os.path.isfile(put):
        print(f"⚠️  {opis}: nema datoteke {put} — preskačem.", file=sys.stderr)
        return None
    try:
        with open(put, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"⚠️  {opis}: {put} nije čitljiv JSON ({e}) — preskačem.\n"
              f"   Što napraviti: stil.json nastaje s "
              f"`check_ai_style.py rad.docx --json > stil.json`, "
              f"arg.json s `check_argument.py rad.docx --json arg.json`.", file=sys.stderr)
        return None


def najcesci(brojac):
    if not brojac:
        return None
    return sorted(brojac.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]


# --------------------------------------------------------------------- brief

def brief(put):
    d = ucitaj(put)
    if d == "GRESKA":
        return 2
    print("=" * 78)
    print("PROFIL AUTORA")
    print("=" * 78)
    if d is None:
        print(f"Profila još nema ({put}). To nije greška — ovo je prvi rad koji Katedra")
        print("prati, ili je profil obrisan.")
        print()
        print("Nakon završenog rada nauči iz njega:")
        print("  python3 <KATEDRA_SKILL>/scripts/user_profile.py learn --stil ./stil.json "
              "--argument ./.katedra/arg.json \\")
        print("          --zamjerke ./.katedra/zamjerke.json --fakultet fpzg --tip diplomski")
        return 0

    print(f"radova u profilu: {d['radova']}  ·  ažurirano: {d.get('azurirano', '?')}")
    print(f"datoteka: {put}")
    print("sadrži samo nazive nalaza i brojače — nijednu rečenicu iz radova, "
          "nijedan njezin početak, nijedan osobni podatak")
    print()
    print("DEFAULTI (iz dosadašnjih radova)")
    for oznaka, kljuc in (("fakultet", "fakulteti"), ("tip rada", "tipovi"),
                          ("citatni stil", "citatni_stilovi")):
        v = najcesci(d.get(kljuc) or {})
        if v:
            n = d[kljuc][v]
            print(f"  {oznaka:<14} {v}  ({n} od {d['radova']} "
                  f"{mn(d['radova'], 'rada', 'rada', 'radova')})")
        else:
            print(f"  {oznaka:<14} —  (nije zabilježeno)")
    print()

    ponavljajuce = sorted(
        [(n, v) for n, v in d["nalazi"].items() if v.get("radova", 0) >= PRAG_PONAVLJANJA],
        key=lambda kv: (-kv[1].get("radova", 0), -kv[1].get("ukupno", 0), kv[0]))
    print(f"PONAVLJAJUĆE SLABOSTI (nalaz u ≥{PRAG_PONAVLJANJA} rada)")
    if not ponavljajuce:
        jednokratni = len(d["nalazi"])
        print(f"  Nijedan nalaz se još nije ponovio. Zabilježeno je {jednokratni} "
              f"{mn(jednokratni, 'nalaz', 'nalaza', 'nalaza')}")
        print(f"  iz {d['radova']} {mn(d['radova'], 'rada', 'rada', 'radova')} — "
              f"obrazac se vidi tek od drugog rada nadalje.")
        return 0
    for naziv, v in ponavljajuce:
        print(f"  ⚠️  {naziv}")
        print(f"      u {v['radova']} {mn(v['radova'], 'radu', 'rada', 'radova')} "
              f"· ukupno {v.get('ukupno', v['radova'])} "
              f"{mn(v.get('ukupno', v['radova']), 'nalaz', 'nalaza', 'nalaza')} "
              f"· zadnji put {v.get('zadnji', '?')}")
        print(f"      na što paziti: {savjet_za(naziv)}")
    print()
    print(f"Ovih {len(ponavljajuce)} stavki idu na self-check listu PRIJE pisanja "
          f"sljedećeg rada, ne poslije.")
    return 1


# --------------------------------------------------------------------- learn

def nalazi_iz_stila(d):
    out = []
    if not isinstance(d, dict):
        return out
    for n in d.get("nalazi") or []:
        poruka = n[1] if isinstance(n, (list, tuple)) and len(n) > 1 else (
            n.get("poruka") if isinstance(n, dict) else None)
        naziv = bez_citata_iz_rada(naziv_nalaza(poruka, "stil: "))
        if naziv and naziv != "stil:":
            out.append(naziv)
    return out


def nalazi_iz_argumenta(d):
    out = []
    if not isinstance(d, dict):
        return out
    for dim in d.get("dimenzije") or []:
        if not isinstance(dim, dict):
            continue
        if dim.get("stanje") and dim["stanje"] != OK:
            naziv = naziv_nalaza(dim.get("dimenzija"), "argument: ")
            if naziv and naziv != "argument:":
                out.append(naziv)
    return out


# Rep audita (2. krug): `tip` zamjerke dolazi iz KATEGORIZACIJE u
# extract_comments.klasificiraj i uvijek je slug — jedna riječ malim slovima bez
# dijakritike („citiranje", „forma", „struktura", „stil", „sadrzaj"). Slobodan
# tekst mentora nikad nema taj oblik: ima razmake, velika slova, brojke, naziv
# ustanove. Provjerava se dakle OBLIK, a ne popis dopuštenih riječi — nova
# kategorija koju alat jednom uvede prolazi bez ikakve izmjene ovdje, a rečenica
# iz rada ne prolazi ni kad je kategorija nepoznata.
SLUG_TIPA = re.compile(r"^[a-z][a-z_-]{1,23}$")


def nalazi_iz_zamjerki(d):
    """Zamjerke mentora → nazivi nalaza, bez ijedne mentorove rečenice.

    Rep audita (2. krug): ovdje se `z['tip']` lijepio doslovno, mimo
    `naziv_nalaza` i `bez_citata_iz_rada`. Na tom je putu bilo zadano
    PROPUŠTANJE, pa je slobodan tekst („Nedostaje analiza poslovanja Hrvatske
    elektroprivrede u razdoblju 2019-2023") završavao u ~/.katedra/profil.json i
    `brief` ga je ispisivao u novu sesiju — osam redaka ispod obećanja da ondje
    nema nijedne rečenice iz rada. Čišćenje kroz navodnike ga nije hvatalo jer
    mentorova rečenica navodnike nema. Zadano je sada brisanje: tip koji nije
    kategorija svodi se na „ostalo", pa brojač ponavljanja i dalje radi, a tekst
    ne izlazi iz projekta.
    """
    out = []
    if not isinstance(d, dict):
        return out
    for z in d.get("zamjerke") or []:
        if not isinstance(z, dict) or not z.get("tip"):
            continue
        tip = re.sub(r"\s+", " ", str(z["tip"])).strip()
        out.append("zamjerka mentora: " + (tip if SLUG_TIPA.match(tip) else "ostalo"))
    return out


def learn(put, a):
    d = ucitaj(put)
    if d == "GRESKA":
        return 2
    if d is None:
        d = prazan()

    nalazi = []
    nalazi += nalazi_iz_stila(ucitaj_ulaz(a.stil, "stil"))
    nalazi += nalazi_iz_argumenta(ucitaj_ulaz(a.argument, "argument"))
    nalazi += nalazi_iz_zamjerki(ucitaj_ulaz(a.zamjerke, "zamjerke"))

    if not nalazi and not (a.fakultet or a.tip or a.citatni_stil):
        print("Nijedan ulaz nije dao nalaze i nijedan default nije zadan — "
              "profil nije mijenjan.")
        print("Što napraviti: daj barem jedan od --stil / --argument / --zamjerke, "
              "ili --fakultet/--tip.")
        return 0

    d["radova"] = int(d.get("radova", 0)) + 1
    for kljuc, vrijednost in (("fakulteti", a.fakultet), ("tipovi", a.tip),
                              ("citatni_stilovi", a.citatni_stil)):
        if vrijednost:
            d[kljuc][vrijednost] = d[kljuc].get(vrijednost, 0) + 1

    jedinstveni = sorted(set(nalazi))
    for naziv in jedinstveni:
        s = d["nalazi"].setdefault(naziv, {"radova": 0, "ukupno": 0, "zadnji": ""})
        s["radova"] += 1
        s["ukupno"] += sum(1 for n in nalazi if n == naziv)
        s["zadnji"] = danas()
    d["azurirano"] = danas()
    stvarni = spremi(put, d)

    print(f"✅ profil ažuriran → {put}")
    if stvarni != put:
        # Rep audita (2. krug): poveznica (na profilu ili na samom .katedra) vodi
        # zapis drugamo. Ako se ispiše samo tražena putanja, korisnik traži profil
        # ondje gdje ga nema; prava datoteka se zato navodi.
        print(f"   preko poveznice → stvarna datoteka: {stvarni}")
    print(f"   rad #{d['radova']} · novih naziva nalaza u ovom radu: {len(jedinstveni)}")
    if jedinstveni:
        print("   zapisano (samo nazivi, bez teksta rada):")
        for naziv in jedinstveni:
            s = d["nalazi"][naziv]
            oznaka = " ← ponavlja se" if s["radova"] >= PRAG_PONAVLJANJA else ""
            print(f"     {naziv}  [{s['radova']} "
                  f"{mn(s['radova'], 'rad', 'rada', 'radova')}]{oznaka}")
    novo_ponavljajucih = sum(1 for v in d["nalazi"].values()
                             if v.get("radova", 0) >= PRAG_PONAVLJANJA)
    if novo_ponavljajucih:
        print(f"   ponavljajućih slabosti ukupno: {novo_ponavljajucih} "
              f"→ vidi `user_profile.py brief`")
    return 0


# ------------------------------------------------------------------ zaboravi

def zaboravi(put, a):
    d = ucitaj(put)
    if d == "GRESKA":
        d = None
    if a.sve:
        if not os.path.isfile(put):
            print(f"Nema što obrisati — {put} ne postoji.")
            return 0
        if not a.da:
            if not sys.stdin.isatty():
                print("❌ brisanje profila traži potvrdu.\n"
                      "   Što napraviti: pokreni ponovno s --da "
                      "(python3 <KATEDRA_SKILL>/scripts/user_profile.py zaboravi --sve --da).", file=sys.stderr)
                return 2
            odg = input(f"Obrisati cijeli profil ({put})? Ovo se ne može poništiti. "
                        f"[da/ne]: ").strip().lower()
            if odg not in ("da", "d", "y", "yes"):
                print("Odustao — profil je netaknut.")
                return 0
        os.remove(put)
        print(f"✅ profil obrisan: {put}")
        print("   Sljedeći `learn` počinje ispočetka.")
        return 0

    if a.nalaz:
        if d is None:
            print(f"Nema profila ({put}) — nema što brisati.")
            return 0
        if a.nalaz not in d["nalazi"]:
            print(f"❌ u profilu nema nalaza „{a.nalaz}\".\n"
                  f"   Postojeći nazivi:", file=sys.stderr)
            for n in sorted(d["nalazi"]):
                print(f"     {n}", file=sys.stderr)
            return 2
        d["nalazi"].pop(a.nalaz)
        d["azurirano"] = danas()
        spremi(put, d)
        print(f"✅ obrisan brojač za „{a.nalaz}\" ({put})")
        return 0

    print("❌ zaboravi treba --sve ili --nalaz \"<naziv>\".\n"
          "   Nazive vidiš u `python3 <KATEDRA_SKILL>/scripts/user_profile.py brief`.", file=sys.stderr)
    return 2


# ---------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(
        description="Profil autora između radova (~/.katedra/profil.json). "
                    "Sprema samo nazive nalaza i brojače — nikad tekst radova "
                    "ni osobne podatke.")
    ap.add_argument("naredba", choices=("brief", "learn", "zaboravi"))
    ap.add_argument("--profil", metavar="PUT", default=ZADANI_PROFIL,
                    help=f"putanja profila (zadano: {ZADANI_PROFIL})")
    ap.add_argument("--stil", metavar="PUT", help="JSON iz check_ai_style.py --json")
    ap.add_argument("--argument", metavar="PUT", help="JSON iz check_argument.py --json")
    ap.add_argument("--zamjerke", metavar="PUT", help=".katedra/zamjerke.json")
    ap.add_argument("--fakultet", metavar="SLUG")
    ap.add_argument("--tip", metavar="TIP", help="seminarski|zavrsni|diplomski|esej")
    ap.add_argument("--citatni-stil", dest="citatni_stil", metavar="STIL")
    ap.add_argument("--sve", action="store_true", help="uz zaboravi: obriši cijeli profil")
    ap.add_argument("--nalaz", metavar="NAZIV", help="uz zaboravi: obriši jedan brojač")
    ap.add_argument("--da", action="store_true", help="potvrdi brisanje bez pitanja")
    a = ap.parse_args()

    put = os.path.expanduser(a.profil)
    try:
        if a.naredba == "brief":
            return brief(put)
        if a.naredba == "learn":
            return learn(put, a)
        return zaboravi(put, a)
    except NesigurnaPutanja as e:
        print(f"❌ profil se ne zapisuje: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except BrokenPipeError:
        # ispis presječen (npr. `| head`) — to nije greška, samo tiho izađi
        os._exit(0)
    except KeyboardInterrupt:
        sys.exit(130)
