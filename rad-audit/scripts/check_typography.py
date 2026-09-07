#!/usr/bin/env python3
"""Provjera hrvatske tipografije.

Uporaba:  python3 check_typography.py rad.docx

Provjerava: navodnike („…" — U+201E/U+201D, NE U+201C ni ravni "),
crtice (– za raspone), znak × (ne x), decimalni zarez, razmak broj–jedinica,
NBSP, 10° vs 20 °C.
"""
import re
import sys
from collections import Counter
from common import load_docx_text


# Kvar 102 (audit Znahor, B4): provjera je bezuvjetno tražila zatvarajući
# U+201D. Hrvatska praksa poznaje DVA para i oba su u optjecaju:
#   ihjj  „…”  (U+201E … U+201D) — Hrvatski pravopis IHJJ-a
#   njem  „…“  (U+201E … U+201C) — starija, i dalje raširena praksa
# Bezuvjetno traženje jednoga daje trajno lažan nalaz na svakom radu koji drži
# drugi, a to je bio slučaj na tri od šest radova u korpusu. Rješenje nije prag
# nego DIJALEKT, isto kako je riješen Vancouver u citation_dialects.py: bira se
# zastavicom ili iz profila, a nalaz je NEDOSLJEDNOST, ne izbor.
ZATVARAJUCI = {"ihjj": "\u201d", "njem": "\u201c"}


def _dijalekt_navodnika(t, zadan=None):
    """Vrati (dijalekt, razlog). Bez zastavice: onaj koji rad pretežno koristi."""
    if zadan in ZATVARAJUCI:
        return zadan, "zadano zastavicom ili profilom"
    n_ihjj, n_njem = t.count("\u201d"), t.count("\u201c")
    if n_ihjj == 0 and n_njem == 0:
        return "ihjj", "nema zatvarajućih navodnika — pretpostavlja se IHJJ"
    if n_njem > n_ihjj:
        return "njem", f"rad pretežno koristi „…“ ({n_njem} naspram {n_ihjj})"
    return "ihjj", f"rad pretežno koristi „…” ({n_ihjj} naspram {n_njem})"


def main(path, navodnici=None):
    body, cells, _ = load_docx_text(path, include_tables=True)
    t = body + "\n" + "\n".join(cells)

    print("=" * 56)
    print("TIPOGRAFIJA —", path)
    print("=" * 56)

    findings = []

    straight = t.count('"')
    if straight:
        findings.append(f"⚠ ravni navodnici (\"): {straight} — zamijeni hrvatskima „…\"")
    open_hr = t.count("„")            # U+201E
    close_ihjj = t.count("\u201d")
    close_njem = t.count("\u201c")
    dijalekt, razlog = _dijalekt_navodnika(t, navodnici)
    ocekivan = ZATVARAJUCI[dijalekt]
    drugi = close_njem if dijalekt == "ihjj" else close_ihjj
    print(f"navodnici: otvarajući „={open_hr}, „…”={close_ihjj}, „…“={close_njem}")
    print(f"   dijalekt: {dijalekt} ({razlog})")
    if drugi:
        findings.append(f"⚠ dva oblika zatvarajućeg navodnika u istom radu: "
                        f"{drugi}× odstupa od dijalekta „{dijalekt}” — "
                        f"nedosljednost, ne izbor (dijalekt se zadaje s --navodnici hr|njem)")
    if open_hr != close_ihjj + close_njem and (open_hr or close_ihjj or close_njem):
        findings.append(f"⚠ nesparen broj navodnika "
                        f"(otv {open_hr} vs zatv {close_ihjj + close_njem})")

    # hex literale (0x41) NE broji kao "x umjesto ×" — alternacija ih pojede prve
    # Kvar 78: uzorak je hvatao DOI („10.1177/1023263X251338198") i svaki drugi
    # identifikator u kojem X stoji među znamenkama. Množenje ima granice tokena:
    # ni s jedne strane ne smije biti slovo, kosa crta ni točka.
    ascii_x = sum(1 for m in re.finditer(
        r"(\b0[xX][0-9A-Fa-f]+\b)|(?<![\w/.])\d+\s*[xX]\s*\d+(?![\w/.])", t)
                  if not m.group(1))
    if ascii_x:
        findings.append(f"⚠ slovo 'x' kao množenje: {ascii_x} — koristi × (npr. 80 × 80 mm)")
    print(f"znak množenja ×: {t.count('×')}   |   'x' kao množenje: {ascii_x}")

    spaced_hyphen = len(re.findall(r"\s-\s", t))
    if spaced_hyphen:
        findings.append(f"⚠ spojnica ' - ' umjesto en-crtice '–': {spaced_hyphen}")
    print(f"en-crtica –: {t.count('–')}   |   spojnica ' - ': {spaced_hyphen}")

    # Hrvatski separator tisućica je TOČKA ("1.465 milijuna") i nije greška.
    # Prijavljuje se samo troznamenkasti decimalni dio uz PRAVU jedinicu,
    # uz granicu riječi — inače "m" uhvati početak riječi "milijuna".
    dot_dec = len(re.findall(
        r"(?<!\d)\d+\.\d{1,2}\s?(?:mm|cm|km|m|t|kg|bar|kW|Hz|L|A|%)(?![\w])", t))
    if dot_dec:
        findings.append(f"⚠ decimalna točka umjesto zareza (uz jedinicu): {dot_dec}")

    glued = re.findall(r"\b\d+(mm|cm|km|kg|bar|kW|Hz)\b", t)  # bez razmaka
    if glued:
        findings.append(f"⚠ broj+jedinica bez razmaka: {dict(Counter(glued))}")
    print(f"broj+jedinica zalijepljeno: {len(glued)}")

    nbsp = t.count(" ")
    print(f"NBSP (nedjeljivi razmak): {nbsp}  " + ("(preporuka: ubaci između broja i jedinice)" if nbsp == 0 else ""))

    # Kvar 66: references/typography_hr.md i lektura.md izrijekom traže sve
    # donje provjere, a nijedna nije postojala u kodu. Tekst s dugom crticom i
    # miješanim „45%" / „62 %" dobivao je ispis „✓ tipografija čista".
    em = t.count("\u2014")
    if em:
        findings.append(f"⚠ duga crtica — (U+2014): {em}× — u hrvatskom tekstu "
                        f"ide zarez, dvotočje, zagrade ili nova rečenica")

    # Kvar 87: ovu je provjeru trebalo maknuti, a ne popraviti. U hrvatskom je
    # crta (–) ISPRAVAN znak za umetanje („rad – uz ogradu – pokazuje"), jednako
    # kao za raspone; nepravilna je duga crtica (—), koja se u hrvatskom ne
    # koristi. Provjera je na stvarnom radu prijavila 18 ispravnih umetanja.
    # Pogrešna provjera nije stroža provjera, nego provjera koja uči autora krivo.

    pct_bez = len(re.findall(r"\d%", t))
    pct_sa = len(re.findall(r"\d[\s\u00a0]%", t))
    if pct_bez and pct_sa:
        findings.append(f"⚠ postotak nedosljedno: {pct_bez}× (45%) i {pct_sa}× (45 %) — "
                        f"odaberi jedan oblik i drži ga kroz cijeli rad")

    stupanj = len(re.findall(r"\d\u00b0[CF]", t))
    if stupanj:
        findings.append(f"⚠ stupanj bez razmaka: {stupanj}× (20°C) — ide (20 °C)")

    trotocka = len(re.findall(r"(?<!\.)\.\.\.(?!\.)", t))
    if trotocka:
        findings.append(f"⚠ tri točke umjesto trotočke …: {trotocka}× (U+2026)")

    # Kvar 77: U+2019 između dvaju slova je APOSTROF („Orbán's", „the EU's"), ne
    # navodnik. Na stvarnom radu je 8 od 9 pogodaka bilo iz engleskih naslova u
    # popisu literature, gdje je apostrof ispravan.
    otvarajuci = t.count("\u2018")
    # Kvar 90: druga polovica uvjeta („U+2019 kojemu ne slijedi slovo") hvatala je
    # englesku posvojnu množinu iz popisa literature: „students’ behavior",
    # „consumers’ awareness", „Scientists’ warning". Apostrof je uvijek IZA slova;
    # navodnik je onaj kojemu slovo ne PRETHODI.
    zatvarajuci_ne_apostrof = len(re.findall(r"(?<![A-Za-zÀ-ɏ])\u2019", t))
    polunavodnici = otvarajuci + zatvarajuci_ne_apostrof
    if polunavodnici:
        findings.append(f"⚠ engleski polunavodnici: {polunavodnici}× "
                        f"(U+2018 {otvarajuci}, U+2019 kao navodnik {zatvarajuci_ne_apostrof}) — "
                        f"citat u citatu ide ‚…\u2018; apostrof u engleskim naslovima nije nalaz")

    print("\nNALAZI:")
    if findings:
        for f in findings:
            print("  " + f)
    else:
        print("  ✓ tipografija čista")
    return 1 if findings else 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    _nav = None
    if "--navodnici" in sys.argv:
        _nav = sys.argv[sys.argv.index("--navodnici") + 1]
        _nav = {"hr": "ihjj", "ihjj": "ihjj", "njem": "njem", "de": "njem"}.get(_nav)
        if _nav is None:
            print("--navodnici prima: hr|ihjj|njem", file=sys.stderr)
            sys.exit(2)
    sys.exit(main(sys.argv[1], _nav))
