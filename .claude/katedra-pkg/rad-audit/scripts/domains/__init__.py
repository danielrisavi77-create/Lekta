"""Domenski paketi ključnih riječi/uzoraka za numbers_inventory.py i cross_check.py.

Zašto ovo postoji: prvotna verzija ovih provjera imala je fiksnu listu ključnih
riječi i regex uzoraka izvedenu iz JEDNOG konkretnog rada o čeličnim krovnim
konstrukcijama (stup, greda, panel, IPE/HEA/HEB profili...). To je odlično za
taj rad, ali beskorisno za bilo koji drugi inženjerski rad. Ovaj modul to
generalizira: nekoliko gotovih paketa po domeni + auto-detekcija po sadržaju
rada, plus generički fallback bez fiksnog rječnika (frekvencijska analiza) kad
nijedan paket ne odgovara dovoljno dobro.

Uporaba:
    from domains import detect_domain, DOMAINS, generic_keywords
    name, scores = detect_domain(text)
    pack = DOMAINS[name]
    pack["keywords"], pack["claim_patterns"], pack["label"]

Dodavanje novog paketa: dodaj novi ključ u DOMAINS s istim oblikom
({"label", "keywords", "claim_patterns"}) — automatski se uključuje u
detekciju, bez izmjena u numbers_inventory.py / cross_check.py.
"""
import re
from collections import Counter

# Jedinice koje vrijede kroz SVE domene. VAŽNO: granica na kraju je (?!\w),
# NE \b — iza ne-word znaka (%, °) \b zahtijeva word znak POSLIJE, pa
# "45 %" i "10°" nikad ne bi matchali (mrtva grana). Dulje jedinice prije
# kraćih s istim prefiksom (kVA prije kV prije V; ms prije m).
UNIT_ALTERNATION = (
    "mm|cm|km|kg|kVA|kV|kW|kN|kHz|MHz|GHz|Hz|MPa|GPa|Pa|Nm|rpm|min-1|m/s|"
    "ms|MB|GB|TB|bar|mA|VA|°C|°|%|m|t|g|A|L|V|W|N|s"
)
UNIVERSAL_CLAIM_PATTERNS = [
    r"\b\d+(?:,\d+)?\s?(?:" + UNIT_ALTERNATION + r")(?!\w)",
    r"\bHRN\s?EN\s?[\dA-Z\-.:/]+\b",
    r"\b\d{3,4}-\d{2}\b",              # oznaka projekta/ugovora (npr. 2022-61)
    r"\b\d{2,4}\b",                    # gole veće brojke (kandidati, provjeri ručno)
]

DOMAINS = {
    "celik": {
        "label": "čelične konstrukcije / građevinarstvo",
        "keywords": ["strehi", "sljemenu", "duljin", "širin", "površin", "raster",
                     "stup", "gred", "okvir", "panel", "sidr", "ploč", "stijenk",
                     "vijk", "premaz", "dizalic", "čelik", "profil", "krovišt",
                     "temelj", "armatur", "beton"],
        "claim_patterns": [
            r"\b(?:IPE|HEA|HEB)\s?\d{3}\b",
            # oznaka čelika: S + standardna granica razvlačenja — NE r"S\s?2?3?5?5?"
            # (svi kvantifikatori opcionalni → matchao bi i golo "S")
            r"\bS\s?(?:185|235|275|355|420|450|460)(?:\s?[JKNM][RHL0-9]{0,2})?\b",
            r"\bM\d{1,2}(?:\s?[×x]\s?\d+)?\b",
            r"\bRAL ?\d{4}\b",
        ],
    },
    "elektro": {
        "label": "elektrotehnika",
        "keywords": ["napon", "struj", "snag", "otpor", "transformator", "kabel",
                     "sklopk", "relej", "frekvenc", "faz", "uzemljenj", "osiguač",
                     "razvod", "instalacij", "generator", "akumulator"],
        "claim_patterns": [
            r"\b\d+(?:,\d+)?\s?(?:V|kV|A|mA|W|kW|Hz|Ω|VA|kVA)\b",
            r"\bIP\d{2}\b",
        ],
    },
    "strojarstvo": {
        "label": "strojarstvo",
        "keywords": ["moment", "brzin", "tlak", "protok", "ležaj", "zupčanik",
                     "osovin", "hidraulik", "pneumatik", "zavar", "tolerancij",
                     "opterećenj", "naprezanj", "deformacij"],
        "claim_patterns": [
            r"\b\d+(?:,\d+)?\s?(?:Nm|bar|rpm|min-1|m/s|MPa|N)\b",
        ],
    },
    "it": {
        "label": "informatika / softversko inženjerstvo",
        "keywords": ["algoritam", "baz", "upit", "poslužitelj", "korisnik",
                     "aplikacij", "performans", "latenc", "propusnost", "api",
                     "sustav", "baza podataka", "arhitektur", "sučelj"],
        "claim_patterns": [
            r"\b\d+(?:,\d+)?\s?(?:ms|MB|GB|TB|req/s|fps)\b",
            r"\bHTTP\s?\d{3}\b",
        ],
    },
    "generic": {
        "label": "generički (nije prepoznat specifičan inženjerski domen)",
        "keywords": [],
        "claim_patterns": [],
    },
}

# Mala hrvatska stop-lista za frekvencijski fallback (nije NLP, samo filter čestih riječi)
STOPWORDS_HR = {
    "i", "u", "na", "je", "su", "se", "za", "s", "sa", "od", "do", "ili", "ali",
    "kao", "koji", "koja", "koje", "kojeg", "kojem", "kojih", "te", "pa", "no",
    "već", "nego", "prema", "kroz", "kod", "bez", "iz", "što", "da", "ne", "li",
    "ovaj", "ova", "ovo", "taj", "ta", "to", "njegov", "njezin", "biti", "ima",
    "imaju", "tako", "kada", "gdje", "dok", "jer", "ako", "ni", "niti", "svaki",
    "svih", "sve", "ovim", "ovoj", "ovog", "ovih", "bio", "bila", "bilo", "bile",
    "također", "dakle", "stoga", "time", "ovdje", "gore", "dolje", "između",
}


MIN_RAZLICITIH = 5   # koliko RAZLIČITIH ključnih riječi domena mora pogoditi


def _bodovi(tl, pack):
    r"""(bodovi, razlicitih, claim_pogodaka) za jedan paket.

    Ključne riječi su korijeni, pa se traže na POČETKU riječi (`(?<!\w)`), a ne
    kao slobodan podniz. Bez te granice `stup` hvata „nastup" i „dostupan",
    `okvir` hvata „okvira" (što je točno) ali i sve izvedenice pojma „teorijski
    okvir", pa rad iz medijskih studija skupi više bodova nego stvarna
    konstrukcija — v. rad-audit/references/zamke.md, kvar 1.
    """
    pogoci = {}
    for k in pack["keywords"]:
        n = len(re.findall(r"(?<!\w)" + re.escape(k), tl))
        if n:
            pogoci[k] = n
    claim = 0
    for pat in pack["claim_patterns"]:
        claim += len(re.findall(pat, tl, re.IGNORECASE))
    return sum(pogoci.values()), len(pogoci), claim, pogoci


def detect_domain(text, min_score=3):
    """Vrati (naziv_domene, {domena: score}). 'generic' kad dokaza nema dovoljno.

    Domena se prihvaća samo ako uz `min_score` bodova ima i JEDAN od dva dokaza
    da je rad doista iz te struke:
      · barem MIN_RAZLICITIH različitih ključnih riječi, ili
      · barem jedan pogodak domenskog uzorka oznake (IPE 300, S235, IP44, HTTP 404…).
    Golo zbrajanje pogodaka nije dokaz: na dovoljno dugom tekstu dvije česte
    riječi prijeđu svaki fiksni prag.
    """
    tl = text.lower()
    scores, detalj = {}, {}
    for name, pack in DOMAINS.items():
        if name == "generic":
            continue
        b, raz, claim, pogoci = _bodovi(tl, pack)
        scores[name] = b
        detalj[name] = {"bodovi": b, "razlicitih": raz, "claim": claim, "pogoci": pogoci}
    if not scores:
        return "generic", scores
    best = max(scores, key=scores.get)
    d = detalj[best]
    if d["bodovi"] >= min_score and (d["razlicitih"] >= MIN_RAZLICITIH or d["claim"] >= 1):
        return best, scores
    return "generic", scores


def detect_domain_detail(text, min_score=3):
    """Kao detect_domain, ali vraća i razlog odluke — za ispis alata."""
    tl = text.lower()
    detalj = {}
    for name, pack in DOMAINS.items():
        if name == "generic":
            continue
        b, raz, claim, pogoci = _bodovi(tl, pack)
        detalj[name] = {"bodovi": b, "razlicitih": raz, "claim": claim, "pogoci": pogoci}
    ime, scores = detect_domain(text, min_score)
    najbolji = max(detalj, key=lambda n: detalj[n]["bodovi"]) if detalj else None
    razlog = ""
    if ime == "generic" and najbolji and detalj[najbolji]["bodovi"] >= min_score:
        d = detalj[najbolji]
        razlog = (f"'{najbolji}' ima {d['bodovi']} bodova, ali samo "
                  f"{d['razlicitih']} različitih ključnih riječi "
                  f"(traži se {MIN_RAZLICITIH}) i {d['claim']} domenskih oznaka "
                  f"— nedovoljno za tvrdnju o struci, pa ide generički rječnik")
    return ime, scores, detalj, razlog


def generic_keywords(text, top=15, min_count=3, window=3):
    """Fallback BEZ fiksnog rječnika kad se ne prepozna nijedna domena: riječi
    koje se ponavljaju u blizini (do `window` tokena ispred) broja, filtrirane
    od kratkih riječi i stop-liste. Ovo je namjerno jednostavno (frekvencija,
    ne NLP) — daje kandidate za pregled, ne zamjenjuje ručnu prosudbu."""
    words = re.findall(r"\w+", text.lower())
    counts = Counter()
    for i, w in enumerate(words):
        if re.match(r"^\d+([.,]\d+)?$", w):
            for back in range(1, window + 1):
                j = i - back
                if j < 0:
                    break
                cand = words[j]
                if len(cand) >= 4 and cand not in STOPWORDS_HR:
                    counts[cand] += 1
    return [w for w, c in counts.most_common(top) if c >= min_count]
