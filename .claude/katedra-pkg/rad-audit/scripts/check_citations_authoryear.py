#!/usr/bin/env python3
"""Provjera dosljednosti citiranja — AUTOR-GODINA stil (APA/Harvard), npr. (Ivić, 2020).

Uporaba:  python3 check_citations_authoryear.py rad.docx

Za numerički IEEE [N] stil koristi check_citations.py. Ako nisi siguran koji
stil rad koristi, `audit_all.py` ga auto-detektira (common.detect_citation_style)
i pokreće odgovarajuću skriptu.

VAŽNA NAPOMENA — ovo je heuristika, ne egzaktna provjera kao kod IEEE brojeva:
  Usporedba ide po ključu (PRVI autor prezime, godina), ne po punom popisu
  autora niti punom nazivu. To znači:
  - dvije različite reference istog prvog autora u istoj godini bez slovnog
    sufiksa (2020a/2020b) mogu se stopiti u isti ključ — provjeri ručno;
  - "Ivić i Perić, 2020" i "Ivić i dr., 2020" dijele isti ključ (ivić, 2020)
    što je namjerno pojednostavljenje;
  - jako neuobičajeni formati reference (obrnuti redoslijed, brojčana lista
    unutar autor-godina teksta) možda se neće ispravno parsirati.
Rezultat čitaj kao POPIS ZA RUČNU PROVJERU, ne kao konačnu presudu.

Provjerava:
  - popis referenci (LITERATURA/POPIS LITERATURE/...) -> (prezime, godina) parovi
  - citate u tekstu, UKLJUČUJUĆI fusnote/endnote (učestalo mjesto autor-godina
    citata u humanističkim/društvenim radovima) -> (prezime, godina) parovi
  - siročad (referenca u popisu, ne citirana) i citat bez reference
"""
import re
import sys
import common as C
from common import (load_docx_text, load_supplementary_text, CITE_AY_RE,
                    parse_ay_citation_group, parse_ay_narrative)

# R14/R16: rječnik naslova bio je preuzak. „Izvori i literatura" (FPZG) i
# „POPIS CITIRANE LITERATURE" (HKS-FZS) nisu prolazili, a kad naslov ne prođe,
# popis ostaje prazan i SVAKI citat ispada „citat bez reference". Dijeli se s
# common.LIT_HEADING_RE da dva alata ne rade po dva rječnika.
from common import LIT_HEADING_RE as HEADING_RE

# Institucionalni autor je sve prije prve parentetizirane godine. To je namjerno
# šire od osobnog autora: mediji/platforme nose točke u imenu („danas.hr",
# „Index.hr"), a kratice često imaju točku prije godine („UNESCO. (2021)").
# Primjenjuje se tek NAKON strožeg BIBLIO_LINE_RE i samo na retke popisa
# literature koji imaju godinu u zagradi.
BIBLIO_INST_RE = re.compile(
    r"^[•\-\d\.\)\s]*(.{1,160}?)\s*(?:\.\s*)?\((\d{4}[a-z]?)\.?\)\.?(?:\s|,|$)",
    re.UNICODE,
)
# Uzorak je tražio INICIJAL („Prezime, I. (2007)"), a FPZG Upute traže PUNO IME
# („Prezime, Ime (2007)"). Zbog toga cijeli popis literature u FPZG obliku nije
# prolazio raščlambu i svaki citat u tekstu ispadao je siroče. Uz to nije poznavao
# čestice u prezimenu („Van der Zwan, Natascha") ni institucionalne autore s
# raspisom („HNB (Hrvatska narodna banka) (2023)").
# Jedinica kojoj godina stoji na kraju retka: uzima se prvi autorski dio
# (prezime ili naziv institucije) i završna godina.
BIBLIO_KRAJ_RE = re.compile(
    r"^[•\-\d\.\)\s]*"
    r"((?:(?:van|von|de|del|della|di|da|dos|der|den|la|le|ten|ter)\s+)*"
    r"[A-ZČĆŠŽĐ][\wčćžšđ\-]+"
    # institucionalni naziv nosi male riječi u sredini („Državni zavod za
    # statistiku", „Hrvatski zavod za javno zdravstvo"); negramzivo, pa se
    # skupina širi tek dok se ne nađe točka ili zarez iza naziva
    r"(?:\s+[A-Za-zČĆŠŽĐčćžšđ][\wčćžšđ\-]*){0,8}?)"
    r"\s*[.,]\s*"
    r".{5,800}?"
    r"(?:\(|,\s*|\.\s*|\s)(\d{4}[a-z]?)\.?\s*$",
    re.UNICODE | re.DOTALL,
)

# Kvar 97: časopisna jedinica u hrvatskom tehničkom i medicinskom obliku nosi
# godinu uz broj sveska, a iza nje slijede stranice:
#   „… Medicina Fluminensis. Vol. 57, br. 4(2021), str. 328–340."
# Godina tako nije ni u prvih 120 znakova (BIBLIO_LINE_RE) ni na kraju retka
# (BIBLIO_KRAJ_RE). Na FER seminaru su četiri takve jedinice davale četiri
# lažna nalaza „citat bez reference".
BIBLIO_SVEZAK_RE = re.compile(
    r"^[•\-\d\.\)\s]*"
    r"((?:(?:van|von|de|del|della|di|da|dos|der|den|la|le|ten|ter)\s+)*"
    r"[A-ZČĆŠŽĐ][\wčćžšđ\-]+)"
    r"[.,].{5,600}?\d\s*\((\d{4}[a-z]?)\)",
    re.UNICODE | re.DOTALL,
)

BIBLIO_LINE_RE = re.compile(
    r"^[•\-\d\.\)\s]*"
    r"((?:(?:van|von|de|del|della|di|da|dos|der|den|la|le|ten|ter)\s+)*"
    r"[A-ZČĆŠŽĐ][\wčćžšđ\-]+(?:\s+[A-ZČĆŠŽĐ][\wčćžšđ\-]+){0,2})"
    r"\s*,\s*"
    r"(?:[A-ZČĆŠŽĐ]\.(?:\s*[A-ZČĆŠŽĐ]\.)*|[A-ZČĆŠŽĐ][\wčćžšđ\-]+)"
    r"\s*.{0,120}?\(?(\d{4}[a-z]?)\)?",
    re.IGNORECASE | re.UNICODE,
)


ALIAS_U_ZAGRADI_RE = re.compile(r"\(([^)]{2,60})\)")


def _aliasi_iz_autora(autor, glavni):
    """Ključevi kratica u zagradi unutar imena institucije.

    `Hrvatska narodna banka (HNB)` → {`hnb`}; `HNB (Hrvatska narodna banka)` →
    {`hrvatska`}. Radi u oba smjera jer se u popisima pojavljuju oba.
    """
    out = set()
    for unutra in ALIAS_U_ZAGRADI_RE.findall(autor or ""):
        if not any(z.isalpha() for z in unutra):
            continue
        k = C.kljuc_prezimena(unutra)
        if k and k != glavni:
            out.add(k)

    # Kvar 76: institucionalni autor s malom riječi u sredini („Notes from Poland",
    # „Institute for Public Affairs") — narativni uzorak prekida se na toj riječi
    # i hvata tek ono iza nje, pa je ključ iz teksta bio `poland`, a iz popisa
    # `notes`. Ista jedinica, dva ključa: i lažno siroče i lažni citat bez
    # reference. Svaka VELIKIM slovom pisana riječ imena postaje alias glavnog
    # ključa; alias ne stvara novi unos u popisu (v. test R13).
    rijeci = [r.strip(" \t,.;:()") for r in (autor or "").split()]
    for r in rijeci:
        if len(r) < 3 or not r[:1].isupper():
            continue
        k = C.kljuc_prezimena(r)
        if k and k != glavni:
            out.add(k)
    return out


def _akronimi(redak, glavni):
    """Samo VELIKIM slovima pisani akronimi, po cijelom retku.

    Kvar 94: institucija se u tekstu citira akronimom („DZS, 2024", „HZJZ, 2024",
    „WIPO, 2025"), a u popisu je raspisana, s akronimom tek u nakladničkom dijelu
    („Zagreb: HZJZ, 2024."). Traži se ISKLJUČIVO akronim: prvi pokušaj je uzimao
    svaku veliku riječ retka, pa je „Ljetopis" iz naslova postao alias i oborio
    test R13. Alias može samo potisnuti lažni nalaz, nikad ga stvoriti.
    """
    out = set()
    for tok in re.findall(r"\b[A-ZČĆŠŽĐ]{2,6}\b", redak or ""):
        k = C.kljuc_prezimena(tok)
        if k and k != glavni:
            out.add(k)
    return out


def biblio_aliasi(lit_text):
    """{(alias, godina): (glavni, godina)} — za preslikavanje ključeva iz teksta."""
    mapa = {}
    for line in (lit_text or "").splitlines():
        line = line.strip()
        # Jedinica s godinom u zagradi („Becker, Gary (2007) …") ide starim
        # putem: ondje je svaka velika riječ ime ili naslov, ne alias. Testovi
        # R13 („zagrada bez slova nije alias", „osobni autor nema alias") pali
        # su čim je ta ograda maknuta — zato ostaje.
        if not line or BIBLIO_LINE_RE.match(line):
            continue
        mi = BIBLIO_INST_RE.match(line)
        mk = (BIBLIO_KRAJ_RE.match(line) or BIBLIO_SVEZAK_RE.match(line)) \
            if not mi else None
        m = mi or mk
        if not m:
            continue
        autor = m.group(1).strip(" \t,.;:")
        glavni = C.kljuc_prezimena(autor)
        if not glavni:
            continue
        god = m.group(2).lower()
        # Kvar 94: akronim često stoji tek u nakladničkom dijelu retka
        # („Zagreb: HZJZ, 2024."), a ne u autorskom. Alias se zato traži po
        # CIJELOM retku; alias može samo potisnuti lažni nalaz, ne stvoriti ga.
        for a in _aliasi_iz_autora(autor, glavni) | _akronimi(line, glavni):
            mapa.setdefault((a, god), (glavni, god))
    return mapa


def extract_biblio_keys(lit_text):
    keys = set()
    unmatched = 0
    for line in lit_text.split("\n"):
        line = line.strip()
        if not line:
            continue
        m = BIBLIO_LINE_RE.match(line)
        if m:
            # Ključ ide kroz ZAJEDNIČKI `kljuc_prezimena`, isti koji koriste oba
            # parsera citata u tekstu. Dok je svaka strana gradila ključ po svome,
            # „Van der Zwan" je iz teksta bio „van", a iz popisa „zwan".
            keys.add((C.kljuc_prezimena(m.group(1)), m.group(2).lower()))
        else:
            mi = BIBLIO_INST_RE.match(line)
            if mi:
                autor = mi.group(1).strip(" \t,.;:")
                kljuc = C.kljuc_prezimena(autor)
                if kljuc:
                    keys.add((kljuc, mi.group(2).lower()))
                    continue
            # Kvar 93 (nađen na stvarnom FER seminaru): u hrvatskom i tehničkom
            # obliku popisa godina stoji na KRAJU jedinice, bez zagrada:
            #   „Bezak, B., … Mehanička trombektomija… 2021."
            #   „Državni zavod za statistiku. Istraživanje i razvoj… Zagreb: DZS, 2024."
            # BIBLIO_LINE_RE traži godinu u prvih 120 znakova, pa je promašio
            # polovicu popisa: 16 citata iz teksta prijavljeno je kao CITAT BEZ
            # REFERENCE, iako je svaka jedinica bila uredno u popisu.
            mk = BIBLIO_KRAJ_RE.match(line) or BIBLIO_SVEZAK_RE.match(line)
            if mk:
                kljuc = C.kljuc_prezimena(mk.group(1))
                if kljuc:
                    keys.add((kljuc, mk.group(2).lower()))
                    continue
            if re.search(r"\d{4}", line) and len(line) > 15:
                unmatched += 1
    return keys, unmatched



# Kvar 75 (nađen na stvarnom radu, 5.9.2026.): hrvatski akademski tekst prezime
# redovito pretvara u POSVOJNI PRIDJEV — „Putnamovo (1988) shvaćanje", „Closina
# (2021) situacija", „u Thinusinu (2025) tvrdnju". Sklonidba iz _osnova te oblike
# ne dohvaća, pa je svaki takav citat izlazio kao CITAT BEZ REFERENCE, a jedinica
# u popisu kao SIROČE. Na radu od 5 172 riječi to je bilo 5 od 6 kritičnih nalaza:
# gate koji tako puca prestaje se čitati.
_POSVOJNI = re.compile(
    r"(ov|ev|in)(a|o|u|e|i|om|im|oj|og|oga|omu|ih|ima|ome)?$")


def _osnova(prezime):
    """Skini hrvatske padežne nastavke: Albersa→Albers, Faulkneru→Faulkner,
    i posvojne pridjeve: Putnamovim→Putnam, Closina→Closa, Thinusinu→Thinus."""
    m = _POSVOJNI.search(prezime)
    if m and len(prezime) - len(m.group(0)) >= 4:
        korijen = prezime[: -len(m.group(0))]
        yield korijen
        # Closa → Closin-: korijen gubi završno -a koje prezime ima
        yield korijen + "a"
        yield korijen + "e"
    for n in ("ovima", "ima", "ova", "ove", "ovi", "om", "ju", "u", "a", "e", "i"):
        if prezime.endswith(n) and len(prezime) - len(n) >= 4:
            korijen = prezime[: -len(n)]
            yield korijen
            # R14: hrvatski padež guta završno -y stranog prezimena
            # (Lipsky → Lipskom → korijen "lipsk"), a popis nosi "lipsky".
            # Uz goli korijen vraćaju se i oblici sa završnim y/i/j/e.
            for zavrsetak in ("y", "i", "j", "e"):
                yield korijen + zavrsetak
    yield prezime


def uskladi_kljuceve(citirani, definirani):
    """Vrati (siročad, citat_bez_reference) uz toleranciju na hrvatsku sklonidbu,
    višečlana prezimena i institucionalne autore.

    Bez ovoga svaki narativni citat u kosom padežu ("Albersa i Rundshagena
    (2020.)") izgleda kao citat bez reference, a referenca kao siroče."""
    def slaze(c, d):
        if c[1] != d[1]:
            return False
        a, b = c[0], d[0]
        if a == b:
            return True
        # Kvar 67: „bilo koja 4 znaka zajedničkog prefiksa" spajalo je Markov i
        # Marković iste godine u isti ključ, pa je stvarni citat bez reference
        # nestajao. Prefiks vrijedi samo ako je razlika hrvatski padežni
        # nastavak, a ne bilo koji nastavak.
        NASTAVCI = ("a", "e", "i", "u", "om", "om", "ju", "ima", "ove", "ovi",
                    "ova", "ovima", "y", "j")
        if a.startswith(b) and len(a) > len(b) >= 4 and a[len(b):] in NASTAVCI:
            return True
        if b.startswith(a) and len(b) > len(a) >= 4 and b[len(a):] in NASTAVCI:
            return True
        return any(o == b for o in _osnova(a)) or any(o == a for o in _osnova(b))

    siroces = {d for d in definirani if not any(slaze(c, d) for c in citirani)}
    bez_ref = {c for c in citirani if not any(slaze(c, d) for d in definirani)}
    return siroces, bez_ref


def main(path):
    body, cells, _ = load_docx_text(path, include_tables=True)
    sup = load_supplementary_text(path)

    # Split na LITERATURU SAMO po body tekstu; ćelije tablica i fusnote/endnote
    # se dodaju u "korišteno u tekstu" NAKON splita. (Da se lijepe prije splita,
    # fusnote bi UVIJEK pale iza naslova literature — koji je u body-ju — pa
    # citati u fusnotama nikad ne bi bili viđeni, što je točno slučaj zbog
    # kojeg fusnote i čitamo.)
    m = list(HEADING_RE.finditer(body))
    split = m[-1].end() if m else len(body)
    # Kvar 79: do sada je popis literature bio „sve do kraja dokumenta", pa su
    # redci popisa tablica i rečenice sažetka ulazili u bibliografiju.
    lit = C.dio_literature(body)
    used_text = "\n".join([body[:split], "\n".join(cells),
                            sup["footnotes"], sup["endnotes"]])

    defined, unmatched_lines = extract_biblio_keys(lit)
    cited = set()
    for inner in CITE_AY_RE.findall(used_text):
        cited |= parse_ay_citation_group(inner)
    # narativni oblik — u hrvatskim radovima najčešći
    zagradnih = len(cited)
    cited |= parse_ay_narrative(used_text)
    print(f"  (zagradnih ključeva: {zagradnih}, "
          f"narativnih dodatno: {len(cited) - zagradnih})")

    print("=" * 60)
    print("CITIRANJE (autor-godina, heuristika) —", path)
    print("=" * 60)
    if not m:
        print("⚠ Naslov popisa literature nije prepoznat (LITERATURA/POPIS LITERATURE/...) "
              "— cijeli tekst je tretiran kao 'korišten u tekstu', rezultat je nepouzdan.")
    if not defined:
        print("⚠ Nijedna referenca u popisu nije prepoznata u autor-godina formatu — "
              "provjeri je li ovo doista APA/Harvard stil (ili je popis drukčije formatiran).")
    if unmatched_lines:
        print(f"({unmatched_lines} redaka u popisu literature sadrži godinu ali nije prepoznato "
              f"kao 'Prezime, I. (GODINA)' — pregledaj ručno format)")

    print(f"\nDefinirano u popisu literature (prezime+godina): {len(defined)}")
    print(f"Citirano u tekstu (uklj. fusnote/endnote): {len(cited)}")
    if sup["footnotes"] or sup["endnotes"]:
        print(f"  (od toga u fusnotama/endnotama: {len(sup['footnotes']) + len(sup['endnotes'])} znakova teksta pretraženo)")

    # Kratica institucije u tekstu (`(HNB, 2023)`) i pun naziv u popisu
    # (`Hrvatska narodna banka (HNB) (2023)`) isti su izvor. Bez ovoga jedan
    # institucionalni izvor daje DVA lažna nalaza odjednom — siroče i citat bez
    # reference — a mjereno je da se to događa svakom takvom retku.
    aliasi = biblio_aliasi(lit)
    if aliasi:
        cited = {aliasi.get(k, k) for k in cited}
    _sir, _bez = uskladi_kljuceve(cited, defined)
    orphans, undefined = sorted(_sir), sorted(_bez)
    print(f"\n  {'⚠ SIROČAD' if orphans else 'SIROČAD'} (u popisu, ne citirano): {orphans or 'nema'}")
    print(f"  {'⚠ CITAT BEZ REFERENCE' if undefined else 'CITAT BEZ REFERENCE'}: {undefined or 'nema'}")

    # Kvar 74: ovo je trajna napomena o metodi, ne nalaz. Znak ⚠ ju je uvodio u
    # bucketizaciju generate_report.py, pa je SVAKI rad — i savršeno čist —
    # imao barem jedan „nalaz". Brojač koji nikad ne pokazuje nulu prestaje se
    # čitati, a to je isti kvar kao gate koji nikad ne pada, samo obrnut.
    print("\nNAPOMENA O METODI — ključ je (prvi autor, godina), ne pun popis autora/naslov.")
    print("  Prije zaključka ručno provjeri: duple godine istog prvog autora (2020a/2020b),")
    print("  'i dr.'/'et al.' grupe, i retke koje regex nije prepoznao (v. gore).")

    ok = defined and not orphans and not undefined and bool(m)
    print("\nREZULTAT:", "✓ interno konzistentno (uz gornju napomenu)" if ok else "⚠ ima nalaza / potrebna ručna provjera")
    return 0 if ok else 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))


# ---------------------------------------------------------------- v1.3 pin-cite nalazi
# Tri nalaza iz stvarnoga ciklusa (FPZG, kolovoz 2026.). Sva tri prošla su postojeću
# provjeru zatvorenosti skupa (15 jedinica, 15 ključeva, 0 siročadi) jer ona gleda
# POSTOJI li referenca, a ne pokriva li stranica tvrdnju.
RE_JEDINICA_RASPON = re.compile(r"(\d{1,4})\s*[–-]\s*(\d{1,4})\s*\.?\s*$")


def _raspon_jedinice(redak: str):
    """Iz retka popisa literature izvuci raspon stranica jedinice, ako ga ima."""
    m = RE_JEDINICA_RASPON.search(redak.strip())
    if not m:
        return None
    a, b = int(m.group(1)), int(m.group(2))
    return (a, b) if b > a else None


def pin_cite_nalazi(citati, jedinice_redci):
    """citati: [(kljuc, stranica_str, kontekst)] · jedinice_redci: {kljuc: redak_popisa}

    Vraća listu nalaza:
      PIN_CITE_RASPON     stranica u citatu = cijeli raspon jedinice („negdje u ovom tekstu")
      PIN_CITE_RUB        stranica je prva ili zadnja stranica jedinice
      PIN_CITE_PONOVLJEN  isti (autor, godina, stranica) uz dvije različite tvrdnje
    """
    nalazi = []
    po_kljucu = {}
    for kljuc, stranica, kontekst in citati:
        if not stranica:
            continue
        raspon = _raspon_jedinice(jedinice_redci.get(kljuc, ""))
        s = stranica.strip()
        m = re.match(r"^(\d{1,4})\s*[–-]\s*(\d{1,4})$", s)
        if m and raspon and (int(m.group(1)), int(m.group(2))) == raspon:
            nalazi.append({
                "vrsta": "PIN_CITE_RASPON", "kljuc": kljuc, "stranica": s,
                "poruka": "stranica u citatu jednaka je rasponu cijele jedinice — to nije "
                          "pin-cite nego 'negdje u ovom tekstu'",
                "kontekst": kontekst[:120]})
        elif raspon and re.fullmatch(r"\d{1,4}", s):
            n = int(s)
            if n in raspon:
                nalazi.append({
                    "vrsta": "PIN_CITE_RUB", "kljuc": kljuc, "stranica": s,
                    "poruka": "stranica je prva ili zadnja stranica jedinice — često znak da "
                              "je podatak preuzet iz sažetka ili zaključka, a ne iz tijela",
                    "kontekst": kontekst[:120]})
        po_kljucu.setdefault((kljuc, s), []).append(kontekst)
    for (kljuc, s), konteksti in po_kljucu.items():
        if len(konteksti) < 2:
            continue
        jedinstveni = {k.strip()[:60] for k in konteksti}
        if len(jedinstveni) > 1:
            nalazi.append({
                "vrsta": "PIN_CITE_PONOVLJEN", "kljuc": kljuc, "stranica": s,
                "poruka": f"ista stranica nosi {len(jedinstveni)} različite tvrdnje — jedna "
                          f"stranica ne može biti izvor za dva različita nalaza",
                "konteksti": sorted(jedinstveni)[:3]})
    return nalazi
