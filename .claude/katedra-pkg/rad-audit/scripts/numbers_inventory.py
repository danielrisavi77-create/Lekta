#!/usr/bin/env python3
"""Inventar brojčanih tvrdnji + kandidati za sukob vrijednosti.

Uporaba:
  python3 numbers_inventory.py rad.docx
  python3 numbers_inventory.py rad.docx --domain elektro   (preskoči auto-detekciju)
  python3 numbers_inventory.py rad.docx --domain generic   (frekvencijski fallback)

Radi tri stvari:
  1. grupira sve "broj + jedinica" po jedinici (inventar za pregled),
  2. ispiše rečenice u kojima se domenski pojam veže uz broj,
  3. za svaki domenski pojam usporedi vrijednosti kroz rad — isti pojam s
     VIŠE RAZLIČITIH vrijednosti iste jedinice = kandidat za nesklad koji
     rad možda ne pomiruje (⚠, provjeri ručno je li razlika deklarirana).
Domena se auto-detektira iz sadržaja (v. domains/__init__.py); --domain
override. Ne zamjenjuje ručnu provjeru — daje popis za pregled.
"""
import re
import sys
from collections import defaultdict
from common import load_docx_text, sentences
from domains import (DOMAINS, UNIT_ALTERNATION, detect_domain,
                     detect_domain_detail, generic_keywords)


def main(path, domain_override=None):
    body, cells, _ = load_docx_text(path)
    text = body + "\n" + "\n".join(cells)

    razlog = ""
    if domain_override:
        domain, scores = domain_override, {}
    else:
        domain, scores, _detalj, razlog = detect_domain_detail(text)

    print("=" * 56)
    print("BROJČANI INVENTAR —", path)
    print("=" * 56)
    if scores:
        print(f"domena (auto-detekcija): {domain}  —  {DOMAINS[domain]['label']}  (bodovi: {scores})")
        if razlog:
            print(f"  ↳ {razlog}")
    else:
        print(f"domena: {domain}  —  {DOMAINS.get(domain, {}).get('label', '?')}")

    if domain == "generic" or not DOMAINS[domain]["keywords"]:
        KEYWORDS = generic_keywords(text)
        if KEYWORDS:
            print(f"(generički fallback — riječi učestale uz brojeve: {KEYWORDS})")
        else:
            print("(generički fallback nije našao dovoljno ponavljajućih pojmova uz brojeve)")
    else:
        KEYWORDS = DOMAINS[domain]["keywords"]

    # jedinstvena regex granica: (?!\w), NE \b — iza ne-word znaka (%, °)
    # \b zahtijeva word znak poslije, pa "45 %" i "10°" nikad ne bi matchali
    unit_re = re.compile(r"(\d+(?:,\d+)?)\s?(" + UNIT_ALTERNATION + r")(?!\w)")

    # 1) grupiranje broj+jedinica
    by_unit = defaultdict(set)
    for m in unit_re.finditer(text):
        by_unit[m.group(2)].add(m.group(1))
    print("\nVrijednosti po jedinici:")
    for u, vals in sorted(by_unit.items()):
        vv = sorted(vals, key=lambda s: float(s.replace(",", ".")))
        print(f"  {u:5}: {', '.join(vv)}")

    # 2) rečenice s domenskim pojmom + brojem (bez skrivenih dodatnih filtera —
    #    stara verzija je gejtala na "izvješć|projekt|…" pa je izvan originalnog
    #    čelik-workflowa sekcija uvijek bila prazna); spomen izvora se samo označi
    print("\nRečenice s ključnim pojmom + brojem:")
    seen = 0
    for s in sentences(text):
        if re.search(r"\d", s) and any(k in s.lower() for k in KEYWORDS):
            tag = "  [spominje izvor]" if re.search(r"izvješć|projekt|seminar|nacrt", s.lower()) else ""
            print("  •", s[:120] + tag)
            seen += 1
        if seen >= 25:
            print("  … (skraćeno)")
            break
    if not seen:
        print("  (nema — ili rad nema brojeva uz domenske pojmove, ili domena nije dobro pogođena)")

    # 3) kandidati za sukob: isti pojam s ≥2 različite vrijednosti iste jedinice
    kw_vals = defaultdict(lambda: defaultdict(set))
    for s in sentences(text):
        sl = s.lower()
        for k in KEYWORDS:
            if k in sl:
                for m in unit_re.finditer(s):
                    kw_vals[k][m.group(2)].add(m.group(1))
    # Kvar 92 (nađen na stvarnom empirijskom radu, HKS, 173 Vancouver citata):
    # ovaj je detektor na radu s postocima proizvodio 11 „sukoba", svaki s 12 do
    # 30 vrijednosti, a ključevi su bili funkcijske riječi: „samo + %: 12,6, 13,8,
    # 15,9, 18, …", „odnosno + %", „naspram + %", „godina + %". Ni jedan nije bio
    # nalaz. U empirijskom radu postoci se PO DEFINICIJI razlikuju; skup od
    # dvadeset vrijednosti nije proturječje nego raspodjela.
    #
    # Tri ograde, sve tri nužne:
    #   1. ključ ne smije biti funkcijska riječ (ona stoji uz svaki broj),
    #   2. skup od više od tri vrijednosti je raspodjela, ne sukob,
    #   3. ključ mora biti dovoljno dug da bude pojam, ne veznik.
    NIJE_POJAM = {
        "samo", "odnosno", "naspram", "dakle", "ukupno", "također", "takoder",
        "godina", "godine", "godini", "cjelina", "cjelini", "dok", "već", "vec",
        "više", "vise", "manje", "oko", "gotovo", "približno", "priblizno",
        "prosječno", "prosjecno", "otprilike", "barem", "najmanje", "najviše",
        "najvise", "svega", "tek", "čak", "cak", "iznad", "ispod", "između",
        "izmedu", "prema", "unutar", "putem", "pomoću", "pomocu",
    }
    NAJVISE_VRIJEDNOSTI = 3

    # Kvar 96: „Čelik S355 zbog toga nije krući od čelika S235" nosi obje
    # vrijednosti u ISTOJ rečenici, dakle razlika je izrečena. Isto vrijedi za
    # visinu na strehi i na sljemenu. Pitanje „je li razlika deklarirana" ima
    # odgovor u samom tekstu, pa se ne postavlja.
    recenice_svih = sentences(text)

    def _izrecena(vrijednosti):
        for r in recenice_svih:
            if all(v in r for v in vrijednosti):
                return True
        return False

    conflicts, raspodjele, izrecene = [], 0, 0
    for k, units in sorted(kw_vals.items()):
        if k.lower() in NIJE_POJAM or len(k) < 4 or k.isdigit():
            continue
        for u, vals in sorted(units.items()):
            if len(vals) < 2:
                continue
            vv = sorted(vals, key=lambda x: float(x.replace(",", ".")))
            if len(vv) > NAJVISE_VRIJEDNOSTI:
                raspodjele += 1
                continue
            if _izrecena(vv):
                izrecene += 1
                continue
            conflicts.append((k, u, vv))
    print("\nKandidati za sukob (isti pojam, dvije ili tri vrijednosti iste jedinice):")
    if conflicts:
        for k, u, vv in conflicts:
            print(f"  ⚠ '{k}' + {u}: {', '.join(vv)}  — provjeri je li razlika deklarirana u radu")
    else:
        print("  nema")
    if raspodjele:
        print(f"  ({raspodjele} pojmova ima više od {NAJVISE_VRIJEDNOSTI} vrijednosti — "
              f"to je raspodjela, ne sukob, i ne prijavljuje se)")
    if izrecene:
        print(f"  ({izrecene} razlika izrečeno je u istoj rečenici — deklarirano)")

    # Kvar 65: zbroj_kategorija() i uzorak_nalazi() bile su definirane ISPOD
    # bloka `if __name__ == "__main__"`, pa ih ni main() ni generate_report
    # nikad nisu pozvali. Opisane su u pipeline.md kao aktivne faze.
    recenice = [r for r in _re.split(r"(?<=[.!?])\s+", text) if r.strip()]
    zbrojevi = zbroj_kategorija(recenice)
    print("\nSkupovi kategorija koji tvore cjelinu:")
    if zbrojevi:
        for n in zbrojevi:
            print(f"  ⚠ ukupno {n['ukupno']} = {' + '.join(str(x) for x in n['kategorije'])}"
                  + ("" if n["ima_uputnicu"] else "  — BEZ uputnice u rečenici"))
            print(f"      {n['recenica']}")
    else:
        print("  nema")

    uzorci = uzorak_nalazi(recenice)
    print("\nVeličine uzorka i brojivi pojmovi (cijeli broj + imenica):")
    if uzorci:
        for n in uzorci:
            print(f"  ⚠ '{n['pojam']}': {', '.join(str(v) for v in n['vrijednosti'])}"
                  f"  — ista imenica, različiti brojevi")
            for rec in n["recenice"]:
                print(f"      {rec}")
    else:
        print("  nema")

    print("\nPODSJETNIK — ručno provjeri aritmetiku koja se DA izračunati:")
    print("  površina = Σ(a×b) ?   |   Σ(paneli×pokrivna širina) = površina krova ?")
    print("  (broj okvira−1)×raster ≈ duljina ?   |   broj stupova/greda vs broj okvira ?")
    return 1 if (conflicts or zbrojevi or uzorci) else 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    dom = None
    if "--domain" in sys.argv:
        dom = sys.argv[sys.argv.index("--domain") + 1]
        if dom not in DOMAINS:
            print(f"Nepoznata domena '{dom}'. Dostupno: {list(DOMAINS)}")
            sys.exit(2)
    sys.exit(main(sys.argv[1], dom))


# ---------------------------------------------------------------- v1.3 zbroj kategorija
import re as _re

RE_UKUPNO = _re.compile(
    r"(\b(?:ukupno|svega|od (?:toga|ukupno)|N\s*=)\b[^.]{0,40}?|\b)(\d{2,6})\b[^.]{0,60}?"
    r"(?:optuž|predmet|slučaj|ispitanik|jedinic|osob)", _re.IGNORECASE | _re.UNICODE)


def zbroj_kategorija(recenice: list[str], tolerancija: int = 0) -> list[dict]:
    """Nađi mjesta gdje niz kategorija tvori cjelinu i provjeri IZVOR, ne samo zbroj.

    Pravilo 15 (Katedra): zbroj koji izlazi nije dokaz. Kategorija izvedena oduzimanjem od
    ukupnoga broja je izvedena vrijednost i mora nositi [TREBA IZVOR], pa makar zbroj bio točan.

    Nastalo iz ciklusa u kojemu je jedna kategorija bila podignuta s 19 na 21 upravo toliko da
    zbroj izađe na 161 nakon što je peta kategorija ispuštena. Provjera „zbrajaju li se" i
    provjera „daju li postoci 100 %" obje su prošle.
    """
    nalazi = []
    for r in recenice:
        brojevi = [int(x) for x in _re.findall(r"(?<![\w.,])(\d{1,6})(?![\w])", r)]
        if len(brojevi) < 4:
            continue
        ukupno = max(brojevi)
        ostali = [b for b in brojevi if b != ukupno]
        if len(ostali) < 3:
            continue
        for izostavi in range(-1, len(ostali)):
            skup = [b for i, b in enumerate(ostali) if i != izostavi]
            # Kvar 89: bez donjeg praga uzorak je „ukupno 3 = 1 + 1 + 0 + 1"
            # proglašavao skupom kategorija. Male brojke se zbrajaju slučajno.
            if (abs(sum(skup) - ukupno) <= tolerancija and len(skup) >= 3
                    and ukupno >= 20 and all(b > 0 for b in skup)):
                uputnica = bool(_re.search(r"\([^)]*\d{4}[^)]*\)", r))
                nalazi.append({
                    "vrsta": "ZBROJ_KATEGORIJA",
                    "ukupno": ukupno,
                    "kategorije": skup,
                    "ima_uputnicu": uputnica,
                    "poruka": ("skup kategorija tvori cjelinu; provjeri da SVAKA kategorija ima "
                               "vlastitu uputnicu i da sve dolaze iz ISTOGA izvora s navedenim "
                               "danom presjeka. Kategorija izvedena oduzimanjem nosi "
                               "[TREBA IZVOR] i kad se zbroj slaže."),
                    "recenica": r.strip()[:200],
                })
                break
    return nalazi

# ------------------------------------------------- v1.9.5 cijeli broj + imenica
IMENICE_UZORKA = (
    "ispitanik", "ispitanica", "sudionik", "sudionica", "student", "studentica",
    "predmet", "slučaj", "slucaj", "jedinica", "opažanje", "opazanje",
    "odgovor", "anketa", "intervju", "dokument", "rad", "članak", "clanak",
    "škola", "skola", "poduzeće", "poduzece", "općina", "opcina", "županija",
    "zupanija", "država", "drzava", "zemlja",
)


def _osnova(rijec: str) -> str:
    """Grubo krati hrvatski padežni nastavak. Namjerno grubo: cilj je grupirati
    ispitanik / ispitanika / ispitanicima pod isti pojam, ne lematizirati."""
    r = rijec.lower()
    for n in ("ijima", "ima", "ove", "ovi", "ama", "ika", "aka", "e", "a", "i", "u", "o"):
        if len(r) - len(n) >= 4 and r.endswith(n):
            return r[: -len(n)]
    return r


# Kvar 88 (nađen na drugom stvarnom radu): prva izvedba je hvatala SVAKI broj uz
# imenicu, pa je u empirijskom radu s tablicama podskupina prijavljivala
# „ispitan: 11, 27, 45, 114, 127, 129" — dakle veličine podskupina, koje se
# legitimno razlikuju. Provjera koja u radu s tablicama uvijek opali je šum.
#
# Traži se samo ono što je i bila namjera: proturječna veličina UKUPNOG uzorka.
# Zato broj mora stajati u okviru koji govori o cjelini, a rečenica ne smije
# nositi oznaku podskupine.
OKVIR_UKUPNO = _re.compile(
    r"(?i)\b(?:ukupno|sveukupno|u\s+analizu\s+je\s+u[šs]lo|analizom\s+je\s+obuhva[ćc]en\w*"
    r"|obuhva[ćc]en\w*\s+je|obuhvatil\w+|sudjeloval\w+\s+je|sudjelovalo"
    r"|uzork\w+\s+(?:od|je\s+[čc]inil\w+)|ispunil\w+\s+je|odazval\w+\s+se"
    r"|kona[čc]n\w+\s+uzor\w+|N\s*=)\W{0,20}$")

OZNAKA_PODSKUPINE = _re.compile(
    r"(?i)(od\s+toga|njih\b|%|posto\b|skupin\w+|kategorij\w+|podskupin\w+"
    r"|me[đd]u\s+|prema\s+(?:spolu|dobi|godini|studij\w+)|tablic\w+|slik\w+"
    r"|redak|stupac|u\s+dobi|starij\w+|mla[đd]\w+)")


def uzorak_nalazi(recenice):
    """Isti pojam, dvije različite veličine: „obuhvatilo je 147 ispitanika" i
    „u uzorku je bilo 152 ispitanika".

    Kvar 64: inventar je tražio broj uz MJERNU JEDINICU (kW, m², %), pa cijeli
    broj uz imenicu nije ulazio ni u jedan brojač. Veličina uzorka je najčešća
    proturječnost među poglavljima i bila je jedina koju nijedan alat nije vidio.
    """
    po_pojmu: dict[str, dict[int, str]] = {}
    uzorak = _re.compile(
        r"(?<![\w.,])(\d{1,6})\s+([A-Za-zČĆŽŠĐčćžšđ]{4,})", _re.UNICODE)
    for r in recenice:
        if OZNAKA_PODSKUPINE.search(r):
            continue                      # rečenica opisuje dio, ne cjelinu
        for m in uzorak.finditer(r):
            broj, rijec = m.group(1), m.group(2)
            if not OKVIR_UKUPNO.search(r[:m.start()]):
                continue                  # broj ne stoji u okviru ukupnog uzorka
            osn = _osnova(rijec)
            if not any(osn.startswith(_osnova(i)[:5]) for i in IMENICE_UZORKA):
                continue
            po_pojmu.setdefault(osn, {}).setdefault(int(broj), r.strip()[:160])
    nalazi = []
    for pojam, vrijednosti in sorted(po_pojmu.items()):
        if len(vrijednosti) < 2:
            continue
        nalazi.append({
            "vrsta": "UZORAK_NESUGLASAN",
            "pojam": pojam,
            "vrijednosti": sorted(vrijednosti),
            "recenice": [vrijednosti[v] for v in sorted(vrijednosti)],
        })
    return nalazi
