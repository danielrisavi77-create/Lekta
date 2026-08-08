#!/usr/bin/env python3
"""Provjeri slijedi li `value` iz nacrta pravila DOISTA iz njegovog `quote`.

Druga strojna provjera, komplement `verify-draft-quotes.py`. Ondje se pita "stoji li citat u
izvoru", ovdje "kaze li citat ono sto je nacrt iz njega izveo". Obje su mehanicke i deterministicke.

Zasto je bas ovo bitno: krivo prepisan citat je neuredan, ali krivo IZVEDENA vrijednost je stetna,
jer popravak onda mijenja dokument u krivom smjeru (npr. natpis tablice premjesti ispod umjesto
iznad). Izmjereno na pilotu: njemacke upute propisuju KRONOLOSKI redoslijed radova istog autora, a
nacrt je iz toga izveo `authorYearSuffixes: true` (slovcani sufiksi a, b, c), sto izvor ne kaze.

Metoda: svaka tvrdnja u `value` razlozi se na "sto bi u citatu moralo pisati da ta vrijednost
slijedi", pa se to trazi u citatu. Usporedba ide preko PREFIKSA rijeci (4 znaka), jer hrvatski
sklanja ("kljucne" vs "kljucnim"), palatalizira ("sazetak" vs "sazeci") a OCR grijesi u pojedinom
slovu ("lzjava" umjesto "Izjava"). Polozaj natpisa (iznad/ispod) NE mjeri se pukim spominjanjem
nego po surecenici, jer izvori redovito navedu oba smjera u istoj recenici; vidi `position_for`.

Osjetljivost je izmjerena, ne pretpostavljena: negativnom kontrolom (svaka uporistena tvrdnja se
izokrene u suprotnu) provjera odbija 98% pokvarenih vrijednosti. Prva verzija je odbijala 46%, pa
je brojka jedini razlog zasto se ovom gateu smije vjerovati.

Tri ishoda po unosu:
  supported   - svaka tvrdnja ima uporiste u citatu
  unsupported - barem jedna tvrdnja nema uporiste (nacrt je zakljucivao, ne prepisivao)
  unknown     - vrijednost nosi kljuc koji ova provjera jos ne pokriva (trazi oci, nije pad)

  python scripts/verify-draft-values.py data/pilot-drafts
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

def fold(text: str) -> str:
    """Male slovo bez dijakritike: usporedba prezivi 'č/c', 'ž/z' i OCR varijante."""
    text = str(text).lower().replace("đ", "d").replace("ß", "ss")
    text = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn")


def stems(text: str, length: int = 4) -> set[str]:
    """Skup prefiksa rijeci (>=4 znaka). Prefiks nosi padeznu promjenu i sitnu OCR gresku.

    Duljina je 4, ne 5, jer hrvatski mijenja i CETVRTO slovo osnove: "sazetak" -> "sazeci"
    (palatalizacija) prolazi tek na "saze". Na 5 znakova je provjera odbacivala natpis koji u
    izvoru uredno stoji, samo u drugom padezu.
    """
    return {word[:length] for word in re.findall(r"\w+", fold(text)) if len(word) >= 4}


def says(quote: str, pattern: str) -> bool:
    return re.search(pattern, fold(quote)) is not None


def label_supported(quote: str, label: str) -> bool:
    """Natpis cjeline mora se vecinom poklopiti s citatom.

    Ne trazi se doslovno poklapanje: natpisi nose zagrade i objasnjenja kojih u izvoru nema
    ("Prilozi (npr. slikovni, zvucni zapisi)"). Trazi se da vecina NOSIVIH rijeci natpisa stoji u
    citatu, pa "Sazetak s kljucnim rijecima" pokriva "Sazetak i kljucne rijeci".
    """
    words = stems(label)
    if not words:
        return True
    hit = len(words & stems(quote))
    return hit / len(words) >= 0.6


ABOVE = r"iznad|oberhalb|uber der|uber den"
BELOW = r"ispod|unterhalb|unter der|unter den"

#

# Kojim se rijecima izvor obraca pojedinoj vrsti elementa.
KIND_WORDS = {
    "table": r"tablic|tabel",
    "figure": r"slik|ilustrac|graficki prikaz|fotograf|abbildung",
    "chart": r"grafik|grafick|dijagram|ilustrac|schaubild",
}


CAPTION_TOPIC = r"naslov|naziv|redni broj|opis|oznac|titel|beschrift"
SOURCE_TOPIC = r"izvor|quelle"


def position_for(quote: str, kind: str, topic: str) -> str | None:
    """Gdje izvor smjesta `topic` (natpis ili izvor) za zadanu vrstu elementa: 'above', 'below', None.

    Zasto po SURECENICAMA, a ne po blizini u znakovima: gotovo svaka uputa navede oba smjera u istoj
    recenici ("naslov iznad tablice, izvor ispod tablice"), pa provjera "spominje li iznad" prolazi
    bez obzira na smjer i ne bi uhvatila vrijednost koja natpis salje na krivu stranu (mjereno
    negativnom kontrolom: 46% pokvarenih vrijednosti je prolazilo). Ni cista udaljenost ne valja:
    u "Naslov tablice se pise iznad tablice, a slike i grafikona ispod" rijec "iznad" je znakovno
    bliza rijeci "slike" nego "ispod", pa bi ispalo da natpis slike ide iznad.

    Zato se recenica lomi na surecenice i gleda se ona koja govori BAS o tom elementu i bas o toj
    temi. Tema razlikuje "naslov ide iznad tablice" od "izvor ide ispod tablice": bez nje se ta dva
    pravila iz iste recenice medusobno ponistavaju.
    """
    text = fold(quote)
    # Tocka u kratici ("i dr.", "npr.", "tzv.") i u rednom broju ("6.4.") NIJE kraj surecenice.
    # Bez ovoga se "a slike i grafikona i dr. ispod" lomi tocno izmedu elementa i njegova polozaja,
    # pa pravilo koje u izvoru uredno stoji ispadne nepotkrijepljeno.
    keep = lambda m: m.group(1) + "\x00"
    text = re.sub(r"\b(dr|npr|tzv|sl|itd|str|tj|god|br|prof|doc|mr|sc|op|cit|engl|usp|odn)\.", keep, text)
    text = re.sub(r"(\d)\.", keep, text)
    # Ni zarez unutar zagrade nije granica: "naslovi slika (fotografija, dijagrama i sl.) pisu se
    # ispod" inace izgubi vezu izmedu elementa i njegova polozaja.
    text = re.sub(r"\(([^)]*)\)", lambda m: "(" + m.group(1).replace(",", "\x00") + ")", text)
    clauses = re.split(r"[.;,:]| a | te | dok | ali ", text)
    kind_pattern = KIND_WORDS.get(kind, kind)

    def decide(pool: list[str]) -> str | None:
        above = sum(1 for c in pool if re.search(ABOVE, c))
        below = sum(1 for c in pool if re.search(BELOW, c))
        if above > below:
            return "above"
        if below > above:
            return "below"
        return None

    on_topic = [c for c in clauses if re.search(kind_pattern, c) and re.search(topic, c)]
    # Ako nijedna surecenica ne spaja element i temu, tema je najcesce ostala u prethodnoj
    # surecenici ("Naslov tablice iznad tablice, a slike ispod"): tada vrijedi sam element.
    return decide(on_topic) or decide([c for c in clauses if re.search(kind_pattern, c)])


def first_mention(quote: str, wanted: str, rival: str) -> bool:
    """Kad izvor navede dva poretka, mjerodavan je onaj koji spomene PRVI.

    Upute redovito kazu "abecednim redom prema prezimenu, a kronoloski za radove istog autora":
    prvi navedeni poredak ureduje popis, drugi je podpravilo unutar iste natuknice.
    """
    text = fold(quote)
    hit = re.search(wanted, text)
    if not hit:
        return False
    other = re.search(rival, text)
    return other is None or hit.start() < other.start()


def claims(check_id: str, value, quote: str) -> tuple[list[str], list[str]]:
    """Vrati (neuporistene tvrdnje, nepokriveni kljucevi) za jedan unos."""
    bad: list[str] = []
    unknown: list[str] = []
    value = value if isinstance(value, dict) else {}

    def need(ok: bool, claim: str) -> None:
        if not ok:
            bad.append(claim)

    if check_id == "bibliography-rules":
        for key, val in value.items():
            if key == "sort":
                if val == "alphabetical":
                    need(first_mention(quote, r"abeced|alphabetisch|alphabetical|azbu", r"kronolo|chronolog"),
                         "sort=alphabetical")
                elif val == "appearance":
                    need(says(quote, r"redoslijed(om)? (pojavljivanja|navodenja)|redom kojim se|pojavljuju u tekst"
                         # Vancouver oblik: izvor ne kaze "redoslijedom pojavljivanja" nego propise
                         # redni broj vezan uz mjesto u tekstu, sto je isti zahtjev.
                         r"|redn\w* broj\w*.{0,60}u tekstu"),
                         "sort=appearance")
                elif val == "chronological":
                    need(first_mention(quote, r"kronolo|chronolog", r"abeced|alphabetisch|alphabetical|azbu"),
                         "sort=chronological")
                else:
                    unknown.append(f"sort={val}")
            elif key == "authorYearSuffixes":
                if val:
                    need(
                        says(quote, r"ist\w* godin|ist\w* autor\w*.{0,80}godin|slov(o|om|ima|can)|podklasifikacij|gleichen jahr|desselben jahr"),
                        "authorYearSuffixes=true",
                    )
            elif key == "hangingIndentCm":
                need(says(quote, r"uvlac|uvuc|einzug") and says(quote, str(val).replace(".", r"[.,]")),
                     f"hangingIndentCm={val}")
            elif key == "italicize":
                if val:
                    need(says(quote, r"kurziv|italic|kosim slov|nagnut"), "italicize=true")
            elif key == "hangingIndent":
                if val:
                    need(says(quote, r"uvlak|uvuc|visec|hanging|einzug"), "hangingIndent=true")
            else:
                unknown.append(key)

    elif check_id == "citation-sync-rules":
        for key, val in value.items():
            if key == "mode":
                if val == "author-year":
                    need(
                        says(quote, r"autor.{0,4}godin|prezime.{0,60}godin|familienname jahr|harvard|apa\b|godin(a|u|e) objav|unutartekst")
                        # Izvor cesto ne OPISUJE sustav nego ga POKAZE: "(Jones, 2000; Buss i Schmitt, 2002)".
                        # Zagrada s prezimenom i cetveroznamenkastom godinom je jednako tvrd dokaz.
                        or says(quote, r"\(\s*[a-z][^)]{0,40}\b(19|20)\d\d"),
                        "mode=author-year",
                    )
                elif val == "footnote":
                    # Izvor koji imenuje autor-godina stil (APA, harvard, primjer "(Jones, 2000)") ili
                    # izricito kaze da se NE citira u fusnotama ("und nicht in Fussnoten") ne moze
                    # potkrijepiti fusnotni nacin, makar rijec "fusnota" u njemu stajala.
                    need(
                        says(quote, r"fusnot|biljesk|fussnote|footnote")
                        and not says(quote, r"(nicht|nije|ne|niti)\s+(in\s+)?(den\s+)?(fusnot|biljesk|fussnot)")
                        and not says(quote, r"apa|harvard|autor.{0,4}godin|\(\s*[a-z][^)]{0,40}(19|20)\d\d"),
                        "mode=footnote",
                    )
                else:
                    unknown.append(f"mode={val}")
            elif key == "requirePageForDirectQuotes":
                if val:
                    need(
                        says(quote, r"stranic|seitenzahl|\bstr\.|\bs\.\s?\d")
                        and says(quote, r"doslovn|citat|navod|wortlich|zitat|preuzim"),
                        "requirePageForDirectQuotes=true",
                    )
            else:
                unknown.append(key)

    elif check_id == "element-caption-rules":
        for key, val in value.items():
            if key == "labels":
                for kind, label in (val or {}).items():
                    stem = fold(label).split("/")[0][:4]
                    need(stem in fold(quote), f"labels.{kind}={label}")
            elif key == "captionPosition":
                for kind, pos in (val or {}).items():
                    if pos in ("above", "below"):
                        need(position_for(quote, kind, CAPTION_TOPIC) == pos, f"captionPosition.{kind}={pos}")
                    else:
                        unknown.append(f"captionPosition.{kind}={pos}")
            elif key == "sourceRequired":
                if val:
                    need(says(quote, r"izvor|quelle"), "sourceRequired=true")
            elif key == "sourcePosition":
                if val in ("below-element", "above-element"):
                    want = val.split("-")[0]
                    # Polozaj izvora mjeri se prema elementu uz koji izvor stoji (tablica je
                    # najcesci nositelj), a tema je izricito "izvor", ne natpis.
                    got = position_for(quote, "table", SOURCE_TOPIC) or position_for(quote, "figure", SOURCE_TOPIC)
                    need(got == want, f"sourcePosition={val}")
                else:
                    unknown.append(f"sourcePosition={val}")
            elif key == "lists":
                # `false` ne tvrdi nista (odsutnost zahtjeva), pa se ni ne dokazuje.
                for kind, on in (val or {}).items():
                    if on:
                        need(says(quote, r"popis (tablic|slik|ilustrac|grafik|prilog)|verzeichnis"), f"lists.{kind}=true")
            elif key == "numbering":
                unknown.append(key)
            else:
                unknown.append(key)

    elif check_id == "section-surgery-rules":
        front = value.get("frontMatter") or {}
        main = value.get("mainMatter") or {}
        # Izvor cesto ne nabraja sto NIJE numerirano nego kaze GDJE numeracija pocinje. "Numeriranje
        # ide od prve stranice Uvoda" je isti zahtjev izrazen s druge strane, pa vrijedi kao uporiste
        # i za frontMatter.numbering=none i za micanje broja s naslovnice.
        starts_at_body = says(quote, r"(pocev|pocinje|zapoce|ide|numeraci)\w*.{0,60}(od )?(prve stranice )?uvod|uvod.{0,60}(od koje|pocinje) numeraci")
        for key, val in front.items():
            if key == "removePageNumberFromTitlePage":
                if val:
                    need(
                        says(quote, r"naslovn\w*.{0,90}(ne|ni(je|su)) (numerir|obrojc|oznacav|navod|stavlj)|(ne|ni(je|su)|nenumerir) (numerir|obrojc|oznacav)\w*.{0,40}naslovn|nikada se ne oznacava")
                        or starts_at_body,
                        "removePageNumberFromTitlePage=true",
                    )
            elif key == "numbering":
                if val == "none":
                    need(says(quote, r"(ne|ni(je|su)) (numerir|obrojc|oznacav)|nenumerir|bez numeracij") or starts_at_body,
                         "frontMatter.numbering=none")
                elif val == "roman":
                    need(says(quote, r"rimsk|romisch"), "frontMatter.numbering=roman")
                else:
                    unknown.append(f"frontMatter.numbering={val}")
            else:
                unknown.append(f"frontMatter.{key}")
        for key, val in main.items():
            if key == "numbering":
                if val == "decimal":
                    need(says(quote, r"arapsk|arabisch|numerir|numeraci|obrojc"), "mainMatter.numbering=decimal")
                else:
                    unknown.append(f"mainMatter.numbering={val}")
            elif key == "startAt":
                need(says(quote, r"od (prve|1|uvoda)|pocevsi|pocinje|zapoce\w* numeraci|prve stranice uvoda"), f"mainMatter.startAt={val}")
            else:
                unknown.append(f"mainMatter.{key}")
        for key in value:
            if key not in ("frontMatter", "mainMatter"):
                unknown.append(key)

    elif check_id == "table-figure-rescue-rules":
        for kind, spec in value.items():
            for key, val in (spec or {}).items():
                if key == "align":
                    if val == "center":
                        need(says(quote, r"centrir|zentriert|sredin|sredis"), f"{kind}.align=center")
                    else:
                        unknown.append(f"{kind}.align={val}")
                elif key == "minDpi":
                    need(says(quote, r"dpi|rezoluc|auflosung"), f"{kind}.minDpi={val}")
                else:
                    unknown.append(f"{kind}.{key}")

    elif check_id == "required-section-rules":
        for label in (value.get("labels") or {}).values():
            need(label_supported(quote, label), f"labels: {label}")
        for key in value:
            if key not in ("labels", "order"):
                unknown.append(key)

    else:
        unknown.append(f"checkId:{check_id}")

    return bad, unknown


def iter_entry_lists(raw: object) -> list[list]:
    out: list[list] = []
    if isinstance(raw, list):
        return [raw]
    if not isinstance(raw, dict):
        return out
    profiles = raw.get("profiles")
    if isinstance(profiles, dict):
        out.extend(v for v in profiles.values() if isinstance(v, list))
    for key in ("ruleEntries", "entries", "drafts"):
        value = raw.get(key)
        if isinstance(value, list):
            out.append(value)
    return out


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2
    as_json = "--json" in argv
    only = None
    if "--only" in argv:
        only = set(json.loads(Path(argv[argv.index("--only") + 1]).read_text(encoding="utf-8")))
        argv = [a for i, a in enumerate(argv) if a != "--only" and argv[i - 1] != "--only"]
    argv = [a for a in argv if a != "--json"]

    stats = {"supported": 0, "unsupported": 0, "unknown": 0}
    verdicts: list[dict] = []
    lines: list[str] = []
    for directory in argv:
        for file in sorted(Path(directory).rglob("*.json")):
            raw = json.loads(file.read_text(encoding="utf-8"))
            for entries in iter_entry_lists(raw):
                for entry in entries:
                    if not isinstance(entry, dict) or not entry.get("quote"):
                        continue
                    rule_id = entry.get("ruleId")
                    if only is not None and rule_id not in only:
                        continue
                    bad, unknown = claims(entry.get("checkId"), entry.get("value"), entry["quote"])
                    outcome = "unsupported" if bad else ("unknown" if unknown else "supported")
                    stats[outcome] += 1
                    verdicts.append({
                        "file": str(file).replace("\\", "/"),
                        "ruleId": rule_id,
                        "checkId": entry.get("checkId"),
                        "outcome": outcome,
                        "unsupported": bad,
                        "uncovered": unknown,
                    })
                    if bad:
                        lines.append(f"NE SLIJEDI  {rule_id}: {', '.join(bad)}")
                    elif unknown:
                        lines.append(f"NEPOKRIVENO {rule_id}: {', '.join(unknown)}")

    if as_json:
        print(json.dumps(verdicts, ensure_ascii=False, indent=1))
        return 0
    for line in lines:
        print(line)
    total = sum(stats.values())
    print(f"\nprovjereno: {total} | slijedi iz citata: {stats['supported']}"
          f" | NE SLIJEDI: {stats['unsupported']} | nepokriveno provjerom: {stats['unknown']}")
    return 1 if stats["unsupported"] else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
