#!/usr/bin/env python3
"""Stvaranje i validacija `.katedra/stanje.json` — jedinog izvora istine o radu.

`stanje.json` se NIKAD ne piše ručno. Ova skripta validira slug fakulteta prema
registryju, format i realnost roka, dosljednost stanja (mod=audit bez rada se
odbija) i verziju sheme. Ručno napisano stanje prije ili kasnije padne na
`--validate`, i to obično u trenutku kad se već piše poglavlje.

Uporaba:
  python3 <KATEDRA_SKILL>/scripts/stanje_init.py --mod novi-rad --tip diplomski --tema "..." \\
          --fakultet fpzg --mentor "doc. dr. sc. X" --rok 2026-09-10 \\
          --ima upute draft gradja
  python3 <KATEDRA_SKILL>/scripts/stanje_init.py --set rok=2026-09-20
  python3 <KATEDRA_SKILL>/scripts/stanje_init.py --set plan_odobren=true --set fakultet.mentor="prof. dr. sc. Y"
  python3 <KATEDRA_SKILL>/scripts/stanje_init.py --validate
  python3 <KATEDRA_SKILL>/scripts/stanje_init.py --show
  python3 <KATEDRA_SKILL>/scripts/stanje_init.py --kat /put/do/.katedra --show

Izlazni kodovi:
  0  gotovo, stanje je dosljedno
  1  --validate našao greške u postojećem stanju
  2  odbijeno: nedosljedan zahtjev, nepoznat fakultet, ili bi se prepisalo
     postojeće stanje bez --force
"""
import argparse
import datetime
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
from context import NesigurnaPutanja, atomic_write_json, resolve_state_dir  # noqa: E402
from plan_gate import approval_is_valid  # noqa: E402
from state_migrations import CURRENT_STATE_VERSION, MigrationError, migrate_file  # noqa: E402
REGISTRY = os.path.join(HERE, "..", "references", "fakulteti", "index.json")
PROFILI = os.path.join(HERE, "..", "references", "fakulteti")

VERZIJA = CURRENT_STATE_VERSION
MODOVI = ("novi-rad", "pisanje", "poboljsanje", "audit", "obrana", "predaja")
TIPOVI = ("seminarski", "zavrsni", "diplomski", "esej")
DATOTEKE = ("upute", "predlozak", "draft", "literatura", "gradja", "rad_docx")
STILOVI = ("autor-godina", "ieee", "vancouver", "harvard", "apa", "apa-hr")
VELIKI_RADOVI = ("zavrsni", "diplomski")

# v1.1-advisory patch (Q10, rep 2): modovi u kojima veliki rad tvrdi da smije pisati
# poglavlja. Prije je isto pravilo stajalo dvaput — kao doslovni „pisanje" u
# validiraj() i kao popis polja u --set guardu — pa su se razišli: guard je
# ispuštao mod, i `--set mod=pisanje` na diplomskom čiji plan pada PLAN GATE
# prolazio je s izlazom 0. Sad oba mjesta čitaju istu konstantu.
MODOVI_KOJI_TRAZE_ODOBREN_PLAN = ("pisanje",)

# Formalne odluke iz intakea (0.4). Sve četiri mijenjaju PAGINACIJU, a promjena
# paginacije poništava stilski prolaz — zato se pitaju na početku i pamte, a ne
# improviziraju pri izradi dokumenta. Zapis je i dokaz što je korisnik odabrao kad
# profil fakulteta o tome ne govori ništa.
# Jezik rada stoji ovdje, a ne u profilu, jer je odluka o RADU, ne o fakultetu:
# isti fakultet prima radove na hrvatskom i na engleskom. Alati vezani uz hrvatski
# ga čitaju kroz `jezik.py` i ISKLJUČUJU se kad ga ne podržavaju — inače bi na radu
# na engleskom svaka rečenica bila „pravopisna pogreška" (željezno pravilo 18).
FORMALNE_ODLUKE = {
    "jezik": ("hr", "en", "de", "it", "fr"),
    "numeracija": ("od-uvoda", "od-naslovnice"),
    "sadrzaj": ("zivo-polje", "staticni"),
    "tablice_boja": None,            # slobodan tekst: „bez boje", „sivo", „rozo-sivo", …
    "unakrsne_reference": ("da", "ne"),
}

# Redoslijed ispisa u tablici --validate / --show.
POLJA = ("verzija", "mod", "tip", "tema", "fakultet", "rok", "citatni_stil",
         "ciljana_ocjena", "datoteke", "ogranicenja", "plan_odobren",
         "numeracija", "sadrzaj", "tablice_boja", "unakrsne_reference", "azurirano")


def danas():
    return datetime.date.today().isoformat()


# ----------------------------------------------------------------- registry

def ucitaj_registry():
    """Vrati popis fakulteta iz index.json. Bez registryja nema validacije sluga."""
    try:
        with open(REGISTRY, encoding="utf-8") as f:
            return json.load(f).get("fakulteti", [])
    except (OSError, json.JSONDecodeError) as e:
        print(f"❌ registry fakulteta se ne može pročitati ({REGISTRY}): {e}", file=sys.stderr)
        print("   Rješenje: provjeri postoji li references/fakulteti/index.json i je li valjan JSON.",
              file=sys.stderr)
        return None


def nadi_fakultet(slug, registry):
    for f in registry or []:
        if f.get("slug") == slug:
            return f
    return None


def poruka_nepoznat_slug(slug, registry):
    dostupni = ", ".join(f.get("slug", "?") for f in registry or []) or "(registry je prazan)"
    return (
        f"❌ fakultet „{slug}\" ne postoji u registryju.\n"
        f"   Dostupni slugovi: {dostupni}\n"
        "   Što napraviti ako fakultet stvarno nedostaje:\n"
        "     1. nađi službene upute (web ili priloženi PDF),\n"
        f"     2. napravi references/fakulteti/{slug}.json po _schema.json, sa status=\"nepotvrdeno\",\n"
        "     3. pokreni python3 scripts/profile_registry.py --write (index.json se ne uređuje ručno),\n"
        "     4. pokreni python3 scripts/profile_registry.py --check, zatim ponovi ovu naredbu."
    )


def stil_iz_profila(slug):
    """Citatni stil iz profila fakulteta; ako profila nema, zadano autor-godina."""
    put = os.path.join(PROFILI, f"{slug}.json")
    try:
        with open(put, encoding="utf-8") as f:
            return json.load(f).get("citiranje", {}).get("stil") or "autor-godina"
    except (OSError, json.JSONDecodeError, AttributeError):
        return "autor-godina"


# ------------------------------------------------------------------ datoteke

def put_stanja(kat):
    return os.path.join(kat, "stanje.json")


def ucitaj(kat, tiho=False):
    put = put_stanja(kat)
    if not os.path.isfile(put):
        if not tiho:
            print(f"❌ nema stanja u {os.path.abspath(put)}.", file=sys.stderr)
            print("   Što napraviti: pokreni pun init, npr.\n"
                  "     python3 <KATEDRA_SKILL>/scripts/stanje_init.py --mod novi-rad --tip diplomski \\\n"
                  "         --tema \"...\" --fakultet fpzg --rok 2026-09-10 --ima upute draft",
                  file=sys.stderr)
        return None
    try:
        stanje, promijenjeno, backup = migrate_file(put)
        if promijenjeno and not tiho:
            print(f"ℹ️  stanje migrirano na shemu v{VERZIJA}; backup: {backup}")
        return stanje
    except MigrationError as e:
        print(f"❌ migracija stanja odbijena: {e}", file=sys.stderr)
        # v1.1-advisory patch (D10): stara uputa je vodila ravno u pun init, koji ovo
        # stanje briše. Nijedan savjet odavde ne smije predlagati pun init.
        print("   Što napraviti: datoteka ostaje netaknuta. Ako je iz novije sheme, "
              "nadogradi skill; ako je pokvarena, vrati je iz .katedra/migrations/ ili "
              "iz gita. Pun init NE popravlja stanje — on ga briše.", file=sys.stderr)
        return None
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as e:
        print(f"❌ {put} nije čitljiv JSON: {e}", file=sys.stderr)
        print("   Što napraviti: vrati zadnju ispravnu kopiju iz .katedra/migrations/ ili "
              "iz gita, pa provjeri sa --validate. Pun init NIJE popravak — on briše "
              "mentora, rok, temu, ograničenja i plan_odobren.", file=sys.stderr)
        return None


# v1.1-advisory patch (D10): „nema stanja" i „stanje se ne da pročitati" nisu isto.
def stanje_postoji(kat):
    """True ako datoteka fizički postoji, bez obzira može li se pročitati."""
    return os.path.isfile(put_stanja(kat))


def sacuvaj_necitljivo(kat):
    """Kopiraj sirove bajtove nečitljivog stanja u .katedra/migrations/ prije bilo čega."""
    put = put_stanja(kat)
    with open(put, "rb") as f:
        sirovo = f.read()
    otisak = hashlib.sha256(sirovo).hexdigest()[:12]
    direktorij = os.path.join(kat, "migrations")
    os.makedirs(direktorij, exist_ok=True)
    backup = os.path.join(direktorij, f"stanje_necitljivo_{otisak}.json")
    if not os.path.exists(backup):
        with open(backup, "wb") as f:
            f.write(sirovo)
    return backup


def spremi(stanje, kat):
    """Atomarni zapis kroz zajednički helper (context.atomic_write_json)."""
    os.makedirs(kat, exist_ok=True)
    # v1.1-advisory patch (Q14): jedinstveni tmp (mkstemp, O_EXCL) umjesto fiksnog
    # „stanje.json.tmp" — dvije istovremene naredbe se ne gaze, a podmetnuta
    # simbolička poveznica se ne slijedi.
    return atomic_write_json(put_stanja(kat), stanje)


# ----------------------------------------------------------------- validacija

def _datum_ok(v):
    try:
        datetime.date.fromisoformat(v)
        return True
    except (ValueError, TypeError):
        return False


def validiraj(stanje, registry):
    """Vrati popis (polje, vrijednost, razina, poruka).

    razina: 'ok' | 'upozorenje' | 'greska'. Greška znači da se stanje ne smije
    zapisati; upozorenje se zapisuje, ali se mora reći naglas.
    """
    n = []

    def red(polje, vrijednost, razina="ok", poruka=""):
        n.append((polje, vrijednost, razina, poruka))

    v = stanje.get("verzija")
    if v == VERZIJA:
        red("verzija", v)
    else:
        red("verzija", v, "greska",
            f"verzija sheme mora biti {VERZIJA}; ovo stanje je iz druge verzije skilla — "
            "pokreni stanje_init.py --show za sigurnu migraciju ili koristi noviji skill")

    meta = stanje.get("state_meta")
    if (isinstance(meta, dict) and meta.get("schema_version") == VERZIJA
            and meta.get("artifact_manifest") == "artifacts.json"
            and meta.get("mentor_feedback") == "zamjerke.json"):
        red("state_meta", f"schema v{meta.get('schema_version')}")
    else:
        red("state_meta", meta, "greska",
            "v2 stanje mora imati state_meta sa schema_version=2, artifact_manifest=artifacts.json "
            "i mentor_feedback=zamjerke.json")

    mod = stanje.get("mod")
    if mod in MODOVI:
        red("mod", mod)
    else:
        red("mod", mod, "greska", "dopušteno: " + " ".join(MODOVI) +
            " — ispravi s --set mod=<vrijednost>")

    tip = stanje.get("tip")
    if tip in TIPOVI:
        red("tip", tip)
    else:
        red("tip", tip, "greska", "dopušteno: " + " ".join(TIPOVI) +
            " — ispravi s --set tip=<vrijednost>")

    # v1.1-advisory patch (Q11): --validate mora preživjeti stanje koje dijagnosticira,
    # pa se tip vrijednosti provjerava prije bilo kakvog .strip()/.get().
    sirova_tema = stanje.get("tema")
    if sirova_tema is not None and not isinstance(sirova_tema, str):
        red("tema", sirova_tema, "greska",
            "tema mora biti tekst — brojčanu temu upiši u navodnicima: "
            "--set tema='\"2026\"'")
        tema = ""
    else:
        tema = (sirova_tema or "").strip()
        if tema:
            red("tema", tema if len(tema) <= 60 else tema[:57] + "...")
        else:
            red("tema", "(prazno)", "upozorenje",
                "bez teme se ne može napraviti plan — postavi s --set tema=\"...\"")

    sirovi_fak = stanje.get("fakultet") or {}
    if not isinstance(sirovi_fak, dict):
        # Prije se fak.get("slug") pozivao PRIJE ove provjere, pa je ova poruka bila
        # nedostižna, a --validate je pucao s AttributeError na stanju koje dijagnosticira.
        red("fakultet", sirovi_fak, "greska", "mora biti objekt {slug, naziv, mentor} — "
            "ispravi s --set fakultet='{\"slug\": \"fpzg\", \"naziv\": \"...\", \"mentor\": \"...\"}'")
        fak = {}
        slug = None
    elif registry is None:
        fak = sirovi_fak
        slug = fak.get("slug")
        red("fakultet.slug", slug, "upozorenje",
            "registry se nije mogao pročitati — slug nije provjeren")
    else:
        fak = sirovi_fak
        slug = fak.get("slug")
        prof = nadi_fakultet(slug, registry)
        if prof:
            red("fakultet.slug", slug)
            if fak.get("naziv") and fak["naziv"] != prof.get("naziv"):
                red("fakultet.naziv", fak["naziv"], "upozorenje",
                    f"registry kaže „{prof.get('naziv')}\" — uskladi s --set fakultet.naziv=\"...\"")
            else:
                red("fakultet.naziv", fak.get("naziv") or "(prazno)")
            if prof.get("status") == "nepotvrdeno":
                red("fakultet.status", "nepotvrdeno", "upozorenje",
                    "profil nije potvrđen iz službenih uputa — svako formalno pravilo označi "
                    "„za potvrdu\"")
        elif stanje.get("fakultet_admisija") == "nije-admitiran":
            # Svjesno odabran put: fakultet izvan registryja radi, ali samo uz zapisano
            # ograničenje. Gate ostaje binaran za ADMISIJU; ovdje je riječ o UPORABI.
            ogr = stanje.get("ogranicenja") or []
            if ogr:
                red("fakultet.slug", slug, "upozorenje",
                    "izvan registryja (admisija: nije-admitiran) — svi formalni nalazi su "
                    "savjetodavni, v. check_rules.py bez --strogo")
            else:
                red("fakultet.slug", slug, "greska",
                    "izvan registryja bez ijednog zapisanog ograničenja — zapiši što nije "
                    "provjereno i zašto (--ogranicenje ili --set ogranicenja='[...]')")
        else:
            dostupni = ", ".join(f.get("slug", "?") for f in registry)
            red("fakultet.slug", slug, "greska",
                f"nema ga u registryju; dostupni: {dostupni}; novi profil se dodaje u "
                "references/fakulteti/<slug>.json; index.json regeneriraj s profile_registry.py --write; "
                "za rad izvan registryja: --fakultet-izvan-registryja <slug> --ogranicenje \"...\"")

    if fak.get("mentor"):
        red("fakultet.mentor", fak["mentor"])
    else:
        red("fakultet.mentor", "(prazno)", "upozorenje",
            "mentor nije upisan — postavi s --set fakultet.mentor=\"doc. dr. sc. ...\"")

    rok = stanje.get("rok")
    if rok is None:
        red("rok", None, "upozorenje",
            "bez roka nema hodograma unatrag — postavi s --set rok=YYYY-MM-DD")
    elif not _datum_ok(rok):
        red("rok", rok, "greska", "format mora biti YYYY-MM-DD (npr. 2026-09-10)")
    else:
        d = datetime.date.fromisoformat(rok)
        danas_d = datetime.date.today()
        if d < danas_d:
            red("rok", rok, "upozorenje",
                f"rok je prošao prije {(danas_d - d).days} d — pomakni ga s --set rok=YYYY-MM-DD "
                "ili radi svjesno u prekoračenju")
        else:
            red("rok", f"{rok} (za {(d - danas_d).days} d)")

    stil = stanje.get("citatni_stil")
    if stil in STILOVI:
        red("citatni_stil", stil)
    else:
        red("citatni_stil", stil, "upozorenje",
            "poznati stilovi: " + " ".join(STILOVI) + " — provjeri profil fakulteta")

    oc = stanje.get("ciljana_ocjena")
    if isinstance(oc, int) and 1 <= oc <= 5:
        red("ciljana_ocjena", oc)
    else:
        red("ciljana_ocjena", oc, "upozorenje", "očekuje se cijeli broj 1–5 (zadano 5)")

    dat = stanje.get("datoteke")
    if not isinstance(dat, dict):
        red("datoteke", dat, "greska", "mora biti objekt s ključevima: " + " ".join(DATOTEKE))
        dat = {}
    else:
        fale = [k for k in DATOTEKE if k not in dat]
        visak = [k for k in dat if k not in DATOTEKE]
        krivi = [k for k, val in dat.items() if not isinstance(val, bool)]
        imam = ", ".join(k for k in DATOTEKE if dat.get(k)) or "ništa"
        if fale:
            red("datoteke", imam, "greska",
                "nedostaju ključevi: " + " ".join(fale) + " — prepiši s --ima ...")
        elif krivi:
            red("datoteke", imam, "greska",
                "vrijednosti moraju biti true/false: " + " ".join(krivi))
        elif visak:
            red("datoteke", imam, "upozorenje", "nepoznati ključevi: " + " ".join(visak))
        else:
            red("datoteke", imam)

    # Formalne odluke (intake 0.4). Nisu obavezne — rad koji ih ne postavlja radi kao
    # prije — ali ako su postavljene, moraju biti iz dopuštenog skupa, jer ih izrada
    # dokumenta čita kao naredbu. `--set unakrsne_reference=da` prolazi kroz
    # parsiraj_vrijednost i dolazi kao True, pa se bool prihvaća kao istoznačan.
    for polje, dopusteno in FORMALNE_ODLUKE.items():
        if polje not in stanje:
            continue
        vrij = stanje[polje]
        if isinstance(vrij, bool):
            vrij = "da" if vrij else "ne"
        if dopusteno is None:
            red(polje, vrij, "ok" if isinstance(vrij, str) and vrij.strip()
                else "greska", "" if isinstance(vrij, str) and vrij.strip()
                else "mora biti tekst, npr. --set tablice_boja=rozo-sivo")
        elif vrij in dopusteno:
            red(polje, vrij)
        else:
            red(polje, vrij, "greska",
                "dopušteno: " + " | ".join(dopusteno))

    ogr = stanje.get("ogranicenja")
    if isinstance(ogr, list) and all(isinstance(x, str) for x in ogr):
        red("ogranicenja", f"{len(ogr)} zapisa" if ogr else "nema")
    else:
        red("ogranicenja", ogr, "greska",
            "mora biti popis rečenica, npr. --set ogranicenja='[\"nema izvorne građe\"]'")

    po = stanje.get("plan_odobren")
    if not isinstance(po, bool):
        red("plan_odobren", po, "greska", "mora biti true ili false")
    elif not po and tip in VELIKI_RADOVI:
        red("plan_odobren", False, "upozorenje",
            f"ZABRANA PISANJA POGLAVLJA: {tip} rad bez odobrenog plana. Prvo mod 1, pa "
            "„plan_state.py odobri\" i --set plan_odobren=true")
    else:
        red("plan_odobren", po)

    az = stanje.get("azurirano")
    if _datum_ok(az):
        red("azurirano", az)
    else:
        red("azurirano", az, "greska", "format mora biti YYYY-MM-DD")

    # ---- dosljednost stanja
    if mod in MODOVI_KOJI_TRAZE_ODOBREN_PLAN and tip in VELIKI_RADOVI and not po:
        red("mod+plan_odobren", f"{mod} / false", "greska",
            "završni/diplomski ne može prijeći u mod=pisanje prije plan gatea i odobrenja")
    if mod == "audit" and not dat.get("rad_docx"):
        red("mod+datoteke.rad_docx", "audit / false", "greska",
            "mod=audit bez gotovog rada u .docx nije stanje koje se može auditirati. "
            "Ili postavi --ima ... rad_docx (kad rad stvarno postoji), ili prijeđi u "
            "mod pisanje: --set mod=pisanje")
    if mod in ("obrana", "predaja") and not dat.get("rad_docx"):
        red(f"mod+datoteke.rad_docx", f"{mod} / false", "upozorenje",
            f"mod={mod} obično pretpostavlja finalni .docx — bez njega je opseg smanjen")
    if mod == "poboljsanje" and not (dat.get("draft") or dat.get("rad_docx")):
        red("mod+datoteke.draft", "poboljsanje / false", "upozorenje",
            "nema teksta za poboljšanje — priloži draft pa --set datoteke.draft=true")

    return n


def gate_uvjetovane_tvrdnje(stanje):
    """Polja stanja koja u OVOM stanju tvrde nešto što vrijedi samo uz važeće odobrenje.

    Izvedeno iz istih pravila koja provjerava validiraj(): kod velikog rada
    „plan_odobren: true" i ulazak u mod pisanja oba se oslanjaju na plan gate.
    Vraća imena polja, da se s njima može presjeći popis polja koje je korisnik
    upravo dirnuo. Prazan skup znači da izmjena ne diže nikakvu takvu tvrdnju,
    pa je nema smisla odbijati — samo upozoriti.
    """
    if stanje.get("tip") not in VELIKI_RADOVI:
        return set()
    tvrdnje = set()
    if stanje.get("plan_odobren") is True:
        tvrdnje.add("plan_odobren")
    if stanje.get("mod") in MODOVI_KOJI_TRAZE_ODOBREN_PLAN:
        tvrdnje.add("mod")
    if tvrdnje:
        # tip je taj koji rad uopće stavlja pod veliki režim, pa je izmjena tipa
        # u završni/diplomski jednako tvrdnja kao i sama polja gore.
        tvrdnje.add("tip")
    return tvrdnje


def ispisi_nalaz(nalazi, naslov="VALIDACIJA STANJA"):
    sirina = max((len(p) for p, _, _, _ in nalazi), default=10)
    print(naslov)
    print("-" * (sirina + 40))
    for polje, vrijednost, razina, poruka in nalazi:
        znak = {"ok": "✅", "upozorenje": "⚠️", "greska": "❌"}[razina]
        print(f"{polje.ljust(sirina)}  {str(vrijednost)[:44].ljust(44)}  {znak}")
        if poruka:
            print(f"{' ' * sirina}  → {poruka}")
    g = sum(1 for _, _, r, _ in nalazi if r == "greska")
    u = sum(1 for _, _, r, _ in nalazi if r == "upozorenje")
    print("-" * (sirina + 40))
    if g:
        print(f"❌ grešaka: {g} · upozorenja: {u}")
    elif u:
        print(f"⚠️  stanje je valjano, upozorenja: {u}")
    else:
        print("✅ stanje je dosljedno")
    return g, u


# --------------------------------------------------------------------- --set

def parsiraj_vrijednost(s, postojeca=None):
    """'true' -> True, '3' -> 3, '[\"a\"]' -> ['a'], ostalo -> string.

    `postojeca` je dosadašnja vrijednost polja i služi samo kao tip-nagovještaj.
    """
    t = s.strip()
    if t.lower() in ("true", "da"):
        return True
    if t.lower() in ("false", "ne"):
        return False
    if t.lower() in ("null", "none", ""):
        return None
    if t and (t[0] in "[{" or (t[0] == '"' and t[-1] == '"')):
        try:
            return json.loads(t)
        except json.JSONDecodeError:
            return t
    # v1.1-advisory patch (Q11): tekstualno polje ne postaje broj samo zato što je
    # vrijednost brojčana — „--set tema=2026" je tema rada, ne broj 2026.
    if isinstance(postojeca, str):
        return t
    try:
        return int(t)
    except ValueError:
        pass
    try:
        return float(t)
    except ValueError:
        return t


def primijeni_set(stanje, izraz):
    """Postavi kljuc=vrijednost, uz podršku za ugniježđeno (fakultet.mentor=...)."""
    if "=" not in izraz:
        print(f"❌ --set očekuje oblik kljuc=vrijednost, dobio: „{izraz}\"", file=sys.stderr)
        print("   Primjeri: --set rok=2026-09-20 · --set plan_odobren=true · "
              "--set fakultet.mentor=\"doc. dr. sc. X\"", file=sys.stderr)
        return False
    kljuc, sirovo = izraz.split("=", 1)
    kljuc = kljuc.strip()
    put = kljuc.split(".")
    # Formalne odluke iz intakea nastaju tek kad ih korisnik odgovori, pa u kosturu
    # stanja ne postoje. Guard protiv tipfelera mora ostati, ali njima se mora dopustiti
    # da se pojave prvi put — inače intake 0.4 ne može zapisati odgovor.
    if put[0] not in stanje and len(put) == 1 and put[0] in FORMALNE_ODLUKE:
        stanje[put[0]] = None
    if put[0] not in stanje:
        print(f"❌ nepoznato polje „{put[0]}\".", file=sys.stderr)
        print("   Postojeća polja: " + ", ".join(stanje.keys()), file=sys.stderr)
        print("   Formalne odluke (intake 0.4): " + ", ".join(FORMALNE_ODLUKE),
              file=sys.stderr)
        return False
    cvor = stanje
    for dio in put[:-1]:
        if not isinstance(cvor.get(dio), dict):
            print(f"❌ „{dio}\" nije objekt pa se u njega ne može ugnijezditi „{kljuc}\".",
                  file=sys.stderr)
            return False
        cvor = cvor[dio]
    zadnji = put[-1]
    if isinstance(cvor, dict) and len(put) > 1 and zadnji not in cvor:
        print(f"⚠️  „{kljuc}\" dosad nije postojalo — dodajem novo polje.")
    cvor[zadnji] = parsiraj_vrijednost(sirovo, cvor.get(zadnji))
    return True


# ---------------------------------------------------------------------- show

def ispisi_stanje(stanje):
    # v1.1-advisory patch (Q11 / D10, rep 2): `stanje.get("fakultet") or {}` čuva samo od
    # None i praznog rječnika — čim je polje bilo krivog tipa (npr. "fakultet": "fpzg",
    # "datoteke": "upute"), sljedeći .get() je dizao AttributeError. Isti ulaz koji
    # --validate uredno dijagnosticira rušio je --show, a još gore: ispisi_stanje() se
    # zove i iz punog inita nad postojećim stanjem, pa je korisnik umjesto koda 2 i
    # uputa („pun init bi tiho pregazio povijest odluka") dobivao Traceback i kod 1.
    # Zato se ovdje ne dereferencira ništa dok se ne provjeri tip, a kriva vrijednost
    # se pokaže onakva kakva jest — ispis stanja mora podnijeti i pokvareno stanje.
    fak = stanje.get("fakultet")
    dat = stanje.get("datoteke")
    kvarno = []
    if not isinstance(fak, dict):
        if fak is not None:
            kvarno.append(("fakultet", fak, "mora biti objekt {slug, naziv, mentor}"))
        fak = {}
    if not isinstance(dat, dict):
        if dat is not None:
            kvarno.append(("datoteke", dat, "mora biti objekt s ključevima: " + " ".join(DATOTEKE)))
        dat = {}
    print("STANJE RADA (.katedra/stanje.json)")
    print("-" * 62)
    print(f"mod             {stanje.get('mod')}")
    print(f"tip             {stanje.get('tip')}")
    print(f"tema            {stanje.get('tema')}")
    print(f"fakultet        {fak.get('slug')} — {fak.get('naziv')}")
    print(f"mentor          {fak.get('mentor') or '(nije upisan)'}")
    rok = stanje.get("rok")
    if rok and _datum_ok(rok):
        d = (datetime.date.fromisoformat(rok) - datetime.date.today()).days
        print(f"rok             {rok} ({d} d)" if d >= 0 else f"rok             {rok} (prošao)")
    else:
        print(f"rok             {rok}")
    print(f"citatni stil    {stanje.get('citatni_stil')}")
    print(f"ciljana ocjena  {stanje.get('ciljana_ocjena')}")
    print(f"imam            {', '.join(k for k in DATOTEKE if dat.get(k)) or 'ništa'}")
    print(f"nemam           {', '.join(k for k in DATOTEKE if not dat.get(k)) or '—'}")
    print(f"plan odobren    {'da' if stanje.get('plan_odobren') else 'ne'}")
    print(f"ažurirano       {stanje.get('azurirano')}")
    ogr = stanje.get("ogranicenja")
    if isinstance(ogr, (list, tuple)):
        if ogr:
            print("ograničenja")
            for o in ogr:
                print(f"  · {o}")
    elif ogr:
        # niz znakova ovdje NIJE popis rečenica; iteracija bi ga razlomila na slova
        kvarno.append(("ogranicenja", ogr, "mora biti popis rečenica"))
    print("-" * 62)
    if kvarno:
        print("⚠️  stanje.json je čitljiv JSON, ali ova polja nisu onog tipa koji shema traži:")
        for polje, vrijednost, kako in kvarno:
            print(f"  · {polje} = {str(vrijednost)[:60]!r} — {kako}")
        print("   Cijeli popis: stanje_init.py --validate")
    if not stanje.get("plan_odobren") and stanje.get("tip") in VELIKI_RADOVI:
        print(f"⚠️  ZABRANA PISANJA POGLAVLJA — {stanje.get('tip')} rad, a plan nije odobren.")
        print("   Nijedno poglavlje se ne piše dok plan ne prođe. Redoslijed:")
        print("     1. mod 1 (plan i program) → plan.md + .katedra/plan.json")
        print("     2. korisnik odobri plan")
        print("     3. python3 <KATEDRA_SKILL>/scripts/plan_state.py odobri")
        print("     4. python3 <KATEDRA_SKILL>/scripts/stanje_init.py --set plan_odobren=true")


# ---------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(
        description="Stvaranje i validacija .katedra/stanje.json (nikad ručno).",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--kat", default=None,
                    help="eksplicitna putanja do .katedra/ (ima prednost nad project rootom)")
    ap.add_argument("--project-root", default=None,
                    help="korijen rada; zadano: KATEDRA_PROJECT_ROOT ili trenutni direktorij")
    ap.add_argument("--mod", help=" | ".join(MODOVI))
    ap.add_argument("--tip", help=" | ".join(TIPOVI))
    ap.add_argument("--tema")
    ap.add_argument("--fakultet", help="slug iz references/fakulteti/index.json")
    ap.add_argument("--fakultet-izvan-registryja", dest="fakultet_izvan", metavar="SLUG",
                    help="rad za fakultet koji nije prošao faculty_scale_gate. "
                         "Traži barem jedno --ogranicenje. Formalni nalazi postaju "
                         "savjetodavni (check_rules.py bez --strogo).")
    ap.add_argument("--mentor", default="")
    ap.add_argument("--rok", help="YYYY-MM-DD")
    ap.add_argument("--ima", nargs="*", default=None, metavar="KLJUC",
                    help="popis iz: " + " ".join(DATOTEKE))
    ap.add_argument("--citatni-stil", dest="citatni_stil",
                    help="zadano se uzima iz profila fakulteta")
    ap.add_argument("--ciljana-ocjena", dest="ciljana_ocjena", type=int, default=5)
    ap.add_argument("--ogranicenje", action="append", default=[],
                    help="može više puta; svako „nemam X\" iz intakea")
    ap.add_argument("--set", dest="postavke", action="append", default=[],
                    metavar="KLJUC=VRIJEDNOST")
    ap.add_argument("--validate", action="store_true")
    ap.add_argument("--show", action="store_true")
    ap.add_argument("--force", action="store_true",
                    help="dopusti prepisivanje postojećeg stanja")
    a = ap.parse_args()

    kat = resolve_state_dir(a.kat, a.project_root)
    registry = ucitaj_registry()

    # ---- --show
    if a.show:
        stanje = ucitaj(kat)
        if stanje is None:
            return 2
        ispisi_stanje(stanje)
        return 0

    # ---- --validate
    if a.validate and not a.postavke:
        stanje = ucitaj(kat)
        if stanje is None:
            return 2
        g, _ = ispisi_nalaz(validiraj(stanje, registry))
        return 1 if g else 0

    # ---- --set
    if a.postavke:
        stanje = ucitaj(kat)
        if stanje is None:
            return 2
        for izraz in a.postavke:
            if not primijeni_set(stanje, izraz):
                return 2
        stanje["azurirano"] = danas()
        # v1.1-advisory patch (Q10): gate se odnosi na plan_odobren (i na tip rada koji ga
        # uvjetuje). Izmjena roka ili mentora se ne odbija porukom o plan_odobrenu —
        # to se samo kaže naglas, ali se zapisuje.
        #
        # rep 2 (regresija): sužavanje na doslovni popis {"plan_odobren", "tip"} otišlo je
        # predaleko — ispustilo je `mod`, pa je `--set mod=pisanje` na diplomskom čiji plan
        # pada PLAN GATE prolazio s izlazom 0. To je točno prijelaz radi kojeg gate postoji.
        # Popis polja zamijenjen je strukturnim pravilom: odbija se samo izmjena koja
        # UPRAVO POSTAVLJA neku tvrdnju koja bez važećeg odobrenja ne smije stajati
        # (gate_uvjetovane_tvrdnje). Zato `--set mod=obrana`, `--set rok=...` i
        # `--set plan_odobren=false` i dalje prolaze — izlaz iz zaglavljenog stanja
        # ostaje otvoren, a raniji kvar je bio baš pretjerano zaključavanje.
        dirnuta = {izraz.split("=", 1)[0].strip() for izraz in a.postavke if "=" in izraz}
        gate_dirnut = bool(dirnuta & gate_uvjetovane_tvrdnje(stanje))
        if stanje.get("tip") in VELIKI_RADOVI and stanje.get("plan_odobren"):
            ok, gate = approval_is_valid(kat)
            if not ok and gate_dirnut:
                sporna = ", ".join(sorted(dirnuta & gate_uvjetovane_tvrdnje(stanje)))
                print(f"❌ izmjena odbijena ({sporna}): to stanje se oslanja na odobren plan, "
                      "a plan.json nije prošao PLAN GATE niti je eksplicitno odobren.",
                      file=sys.stderr)
                for razlog in gate.get("blocking_reasons", []):
                    print(f"   · {razlog}", file=sys.stderr)
                print("   Prvo: plan_state.py odobri", file=sys.stderr)
                print("   Ili, ako plan svjesno ostaje neodobren: "
                      "stanje_init.py --set plan_odobren=false", file=sys.stderr)
                return 2
            if not ok:
                polja = ", ".join(sorted(dirnuta)) or "(nepoznato polje)"
                print(f"⚠️  mijenja se {polja}, a stanje.json i dalje tvrdi plan_odobren=true "
                      "iako plan.json trenutno ne prolazi PLAN GATE:")
                for razlog in gate.get("blocking_reasons", []):
                    print(f"   · {razlog}")
                print("   Izmjena se zapisuje, ali prije pisanja poglavlja: "
                      "plan_state.py odobri (ili --set plan_odobren=false).")
        nalazi = validiraj(stanje, registry)
        g, _ = ispisi_nalaz(nalazi, naslov="STANJE NAKON IZMJENE")
        if g:
            print("\n❌ izmjena NIJE zapisana jer bi stanje ostalo nedosljedno.")
            print("   Ispravi vrijednost iz retka s ❌ i ponovi naredbu.")
            return 2
        try:
            put = spremi(stanje, kat)
        except NesigurnaPutanja as e:
            print(f"\n❌ izmjena NIJE zapisana: {e}", file=sys.stderr)
            return 2
        print(f"\n✅ zapisano: {put}")
        return 0

    # ---- pun init
    obavezno = {"--mod": a.mod, "--tip": a.tip, "--tema": a.tema, "--fakultet": a.fakultet}
    fale = [k for k, v in obavezno.items() if not v]
    if fale:
        print("❌ za pun init nedostaje: " + " ".join(fale), file=sys.stderr)
        print("   Primjer:\n"
              "     python3 <KATEDRA_SKILL>/scripts/stanje_init.py --mod novi-rad --tip diplomski --tema \"...\" \\\n"
              "         --fakultet fpzg --mentor \"doc. dr. sc. X\" --rok 2026-09-10 \\\n"
              "         --ima upute draft gradja\n"
              "   Za izmjenu jednog polja koristi --set, za pregled --show.", file=sys.stderr)
        return 2

    if a.mod not in MODOVI:
        print(f"❌ nepoznat mod „{a.mod}\". Dopušteno: " + " ".join(MODOVI), file=sys.stderr)
        return 2
    if a.tip not in TIPOVI:
        print(f"❌ nepoznat tip „{a.tip}\". Dopušteno: " + " ".join(TIPOVI), file=sys.stderr)
        return 2
    if registry is None:
        return 2
    prof = nadi_fakultet(a.fakultet, registry)
    if not prof and not a.fakultet_izvan:
        print(poruka_nepoznat_slug(a.fakultet, registry), file=sys.stderr)
        print("\n   Ako rad ide dalje bez admisije fakulteta:\n"
              f"     --fakultet-izvan-registryja {a.fakultet} "
              "--ogranicenje \"što nije provjereno i zašto\"", file=sys.stderr)
        return 2

    ima = list(a.ima or [])
    nepoznato = [k for k in ima if k not in DATOTEKE]
    if nepoznato:
        print("❌ --ima ne poznaje: " + " ".join(nepoznato), file=sys.stderr)
        print("   Dopušteni ključevi: " + " ".join(DATOTEKE), file=sys.stderr)
        return 2

    postojece = ucitaj(kat, tiho=True)
    # v1.1-advisory patch (D10): ucitaj() vraća None i kad stanje POSTOJI ali se ne da
    # pročitati (novija shema, krnji JSON, kodiranje). Prije se to čitalo kao „nema
    # projekta" i pun init bi tiho pregazio mentora, rok, temu, ograničenja i
    # plan_odobren — bez ijedne kopije igdje. Sada se prvo spašavaju sirovi bajtovi.
    if postojece is None and stanje_postoji(kat):
        try:
            backup = sacuvaj_necitljivo(kat)
        except OSError as e:
            print(f"❌ {put_stanja(kat)} postoji, ali nije čitljiv, a sigurnosna kopija "
                  f"nije uspjela ({e}).", file=sys.stderr)
            print("   Što napraviti: ručno kopiraj datoteku izvan projekta, pa tek onda "
                  "odlučuj o punom initu.", file=sys.stderr)
            return 2
        print(f"ℹ️  sirovi sadržaj nečitljivog stanja sačuvan: {backup}", file=sys.stderr)
        if not a.force:
            print(f"❌ {put_stanja(kat)} postoji, ali ga ovaj skill ne može pročitati "
                  "(novija shema, neispravan JSON ili kodiranje).", file=sys.stderr)
            print("   Pun init ovdje NIJE popravak: obrisao bi mentora, rok, temu, "
                  "ograničenja i plan_odobren.", file=sys.stderr)
            print("   Što napraviti:", file=sys.stderr)
            print(f"     · novija shema     → nadogradi skill (ovaj piše shemu v{VERZIJA}),",
                  file=sys.stderr)
            print("     · pokvaren JSON    → vrati datoteku iz kopije gore ili iz gita,",
                  file=sys.stderr)
            print("     · svjesno ispočetka→ ponovi naredbu s --force (kopija ostaje).",
                  file=sys.stderr)
            return 2
        print("⚠️  --force: nečitljivo stanje se prepisuje. Sve iz njega (mentor, rok, tema, "
              "ograničenja, plan_odobren) živi još samo u kopiji gore.")
    if postojece is not None and not a.force:
        print(f"❌ {put_stanja(kat)} već postoji — pun init bi tiho pregazio povijest odluka.")
        print()
        ispisi_stanje(postojece)
        print()
        print("Što napraviti:")
        print("  · mijenjaš jedno polje  → python3 <KATEDRA_SKILL>/scripts/stanje_init.py --set rok=2026-09-20")
        print("  · mijenjaš mod          → python3 <KATEDRA_SKILL>/scripts/stanje_init.py --set mod=pisanje")
        print("  · stvarno kreće novi rad→ ponovi naredbu s --force")
        return 2

    # Fakultet izvan registryja: ograničenje je OBAVEZNO. Bez njega nitko kasnije ne zna
    # koliko nalazima vjerovati, a upravo je to razlika između „provjereno" i
    # „pretpostavljeno". Gate ostaje binaran za admisiju; ovo je uporaba.
    if not prof and a.fakultet_izvan:
        if not a.ogranicenje:
            print("❌ fakultet izvan registryja zahtijeva barem jedno --ogranicenje "
                  "(što nije provjereno i zašto).", file=sys.stderr)
            print("   Primjer: --ogranicenje \"pravilnik je skenirani PDF bez tekstualnog "
                  "sloja — pravila su izvedena\"", file=sys.stderr)
            return 2
        if a.fakultet_izvan != a.fakultet:
            print(f"❌ --fakultet {a.fakultet} i --fakultet-izvan-registryja "
                  f"{a.fakultet_izvan} moraju biti isti slug.", file=sys.stderr)
            return 2

    stanje = {
        "verzija": VERZIJA,
        "state_meta": {
            "schema_version": VERZIJA,
            "artifact_manifest": "artifacts.json",
            "mentor_feedback": "zamjerke.json",
        },
        "mod": a.mod,
        "tip": a.tip,
        "tema": a.tema,
        "fakultet": {
            "slug": a.fakultet,
            "naziv": (prof or {}).get("naziv", ""),
            "mentor": a.mentor or "",
        },
        "rok": a.rok if a.rok else None,
        "citatni_stil": a.citatni_stil or stil_iz_profila(a.fakultet),
        "ciljana_ocjena": a.ciljana_ocjena,
        "datoteke": {k: (k in ima) for k in DATOTEKE},
        "ogranicenja": list(a.ogranicenje),
        "plan_odobren": False,
        "azurirano": danas(),
    }
    if not prof and a.fakultet_izvan:
        stanje["fakultet_admisija"] = "nije-admitiran"

    nalazi = validiraj(stanje, registry)
    g, _ = ispisi_nalaz(nalazi)
    if g:
        print("\n❌ stanje NIJE zapisano. Ispravi retke s ❌ i ponovi naredbu.")
        return 2

    try:
        put = spremi(stanje, kat)
    except NesigurnaPutanja as e:
        print(f"\n❌ stanje NIJE zapisano: {e}", file=sys.stderr)
        return 2
    print(f"\n✅ zapisano: {put}")
    if not stanje["plan_odobren"] and a.tip in VELIKI_RADOVI:
        print(f"⚠️  {a.tip}: nijedno poglavlje se ne piše prije odobrenog plana "
              "(plan_odobren: false).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
