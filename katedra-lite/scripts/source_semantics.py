#!/usr/bin/env python3
"""Semantički contract za provjeru i kvalitetu izvora.

Ovaj modul namjerno odvaja tri različita pitanja:
1. verification — što automatika zna o identitetu/postojanju izvora;
2. quality — koliko je izvor prikladan za akademsku tvrdnju;
3. discovery — gdje je izvor pronađen.

Discovery servis (npr. Google Scholar) nije bibliografski izvor.
"""
from __future__ import annotations

import re
from typing import Any

VERIFIED = "verified"
UNVERIFIED = "unverified"
CONFLICT = "conflict"
INVALID = "invalid"
VERIFICATION_STATUSES = {VERIFIED, UNVERIFIED, CONFLICT, INVALID}

QUALITY_TAXONOMY = {
    "A": "primary / official / peer-reviewed",
    "B": "academic secondary",
    "C": "institutional report",
    "D": "reputable journalistic / contextual",
    "E": "discovery only — not a bibliographic source entity",
    "X": "inadmissible or contradicted source identity",
}

_DISCOVERY_ALIASES = {
    "google scholar": "google_scholar",
    "scholar": "google_scholar",
    "google_scholar": "google_scholar",
    "crossref": "crossref",
    "hrcak": "hrcak",
    "hrčak": "hrcak",
    "jstor": "jstor",
    "semantic scholar": "semantic_scholar",
    "semantic_scholar": "semantic_scholar",
    # v1.1 (NEW-103): hrvatska znanstvena bibliografija — CROSBI je 2024/2025
    # migrirao u CroRIS; oba naziva ostaju kao alias za isti discovery kanal
    # jer se korisnici i dalje referiraju na stari naziv.
    "crosbi": "crosbi",
    "croris": "crosbi",
}


def normalize_discovery_channel(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = re.sub(r"\s+", " ", value.strip().lower())
    if not normalized:
        return None
    return _DISCOVERY_ALIASES.get(normalized, normalized.replace(" ", "_"))


_URL_HOST_RE = re.compile(r"^\s*(?:[A-Za-z][A-Za-z0-9+.\-]*:)?//?([^/?#\s]+)")


def _url_host(source: dict[str, Any]) -> str:
    """Host iz `url` polja izvora (bez sheme, putanje i porta), mala slova."""
    url = str(source.get("url") or "").strip()
    if not url:
        return ""
    m = _URL_HOST_RE.match(url)
    host = m.group(1) if m else url.split("/", 1)[0]
    return host.split("@")[-1].split(":")[0].lower()


# Q7a (2. krug): vezivanje SAMO za polje `url` propuštalo je dva najčešća
# studentska oblika — unos bez URL-a („Wikipedia (2024.) Turizam.") i URL bez
# sheme („Dostupno na: hr.wikipedia.org/…"), jer verify_sources.URL_RE hvata
# samo „https?://…". Zato gledamo dvije pozicije u unosu, a ne cijeli niz:
# (1) host, uključujući golu domenu iz samog unosa, i
# (2) glavu unosa — dio PRIJE godine, tj. autorsku/izdavačku poziciju.
_GOLA_DOMENA_RE = re.compile(
    r"(?<![\w@.\-])((?:[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,})(?![\w\-])")
_GODINA_RE = re.compile(r"\b(?:1[89]\d{2}|20\d{2})\b")
_WIKIPEDIA_GLAVA_RE = re.compile(r"^wikipedi(?:a|ja)\b")
_WIKIPEDIA_GLAVA_TOCNO = {"wikipedia", "wikipedija"}
_SCHOLAR_GLAVA_RE = re.compile(r"^google\s+scholar\b")
_SCHOLAR_GLAVA_TOCNO = {"google scholar"}


# Fraza koja najavljuje mjesto preuzimanja. Gola domena se broji kao HOST samo
# iza jedne od njih — inače je domena spomenuta u naslovu („Pouzdanost sadržaja
# na hr.wikipedia.org: analiza") jednako vrijedila kao mjesto objave i takav je
# rad dobivao kvalitetu X. Isti obrazac na scholar strani hard-blokirao je
# recenzirani rad o servisu, tj. točno onu regresiju koju Q7a treba spriječiti.
_DOSTUPNOST_RE = re.compile(
    r"(?:dostupno\s+na|preuzeto\s+(?:s|sa|iz)|raspolo[žz]ivo\s+na|"
    r"pristupljeno|available\s+at|retrieved\s+from|url)\s*:?\s*$",
    re.IGNORECASE)


def _hostovi(source: dict[str, Any]) -> list[str]:
    """Host-kandidati: polje `url`, plus gola domena IZA fraze o dostupnosti.

    Ne skenira se cijeli unos. Domena u naslovu nije mjesto objave.
    """
    hostovi = []
    host = _url_host(source)
    if host:
        hostovi.append(host)
    unos = str(source.get("unos") or "")
    for m in _GOLA_DOMENA_RE.finditer(unos):
        prije = unos[:m.start()]
        if _DOSTUPNOST_RE.search(prije):
            hostovi.append(m.group(1).lower())
    return hostovi


def _je_domena(host: str, korijen: str) -> bool:
    """Točno ta domena ili njezina poddomena (hr.wikipedia.org), ne bilo koji podniz."""
    return host == korijen or host.endswith("." + korijen)


def _glava_izvora(source: dict[str, Any]) -> tuple[str, bool]:
    """Vrati (normalizirana glava unosa, je li to pouzdano autorska pozicija).

    U stilu autor-godina sve prije godine JEST autorska/izdavačka pozicija.
    Bez godine se pozicija ne može pouzdano odrediti (glava tada može biti i
    naslov), pa se vraća polje `autor` uz zastavicu koja traži strože,
    doslovno podudaranje.
    """
    unos = str(source.get("unos") or "")
    m = _GODINA_RE.search(unos) if unos else None
    if m:
        glava = re.sub(r"\s+", " ", unos[:m.start()]).strip(" .,;:()[]–-").lower()
        # U stilu naslov-prvo glava JEST naslov, ne autorska pozicija. Autorska
        # pozicija je kratka („Čavlek, N.", „Wikipedia", „Google Scholar"); glava
        # od tri i više riječi bez zareza je naslov („Wikipedija u nastavi
        # ekonomije"), pa se tada traži DOSLOVNO podudaranje s imenom servisa
        # umjesto uzorka koji hvata i početak naslova.
        pouzdana = len(glava.split()) <= 2
        return glava, pouzdana
    autor = re.sub(r"\s+", " ", str(source.get("autor") or "")).strip(" .,;:()[]–-").lower()
    return autor, False


def _glava_je_servis(source: dict[str, Any], uzorak: re.Pattern[str], tocno: set[str]) -> bool:
    """Stoji li ime servisa u autorskoj poziciji (a ne bilo gdje u nizu)."""
    glava, pouzdana = _glava_izvora(source)
    if not glava:
        return False
    return bool(uzorak.match(glava)) if pouzdana else glava in tocno


def is_discovery_service_entity(source: dict[str, Any]) -> bool:
    # B12 patch (Q7a): provjera se veže za HOST i za AUTORSKU POZICIJU, nikad za
    # naslov ili cijeli unos. Rad KOJI GOVORI o Google Scholaru (npr. Halevi,
    # Moed i Bar-Ilan, 2017., Journal of Informetrics) legitiman je bibliografski
    # izvor i ne smije se proglasiti nevaljanim (kvaliteta E, blocking) samo zato
    # što mu se discovery servis spominje u naslovu.
    for host in _hostovi(source):
        if "scholar.google." in host or host.startswith("scholar.google"):
            return True
    return _glava_je_servis(source, _SCHOLAR_GLAVA_RE, _SCHOLAR_GLAVA_TOCNO)


def infer_source_type(source: dict[str, Any], provider_metadata: dict[str, Any] | None = None) -> str:
    if is_discovery_service_entity(source):
        return "discovery_service"

    text = " ".join(str(source.get(k) or "") for k in ("autor", "naslov", "unos", "url")).lower()
    # B12 patch (Q7a): i Wikipedia se prepoznaje po hostu (uključujući golu
    # domenu bez sheme) i po autorskoj poziciji, a ne po spominjanju u naslovu —
    # znanstveni rad O Wikipediji nije nedopušten izvor, ali „Wikipedia (2024.)
    # Turizam." bez ijednog URL-a jest.
    if any(_je_domena(h, "wikipedia.org") for h in _hostovi(source)) or _glava_je_servis(
            source, _WIKIPEDIA_GLAVA_RE, _WIKIPEDIA_GLAVA_TOCNO):
        return "inadmissible"
    if re.search(r"\bzakon\b", text) and ("narodne novine" in text or re.search(r"\bnn\s*\d", text)):
        return "law"
    if "uredba (eu)" in text or re.search(r"\bregulation \(eu\)", text):
        return "eu_act"
    if re.search(r"\b(?:u-|gž-|rev-|usž-|pž-)\s*[ivx\d-]*\d", text):
        return "court_decision"
    if any(domain in text for domain in (
        "eurostat", "oecd.org", "worldbank.org", "ec.europa.eu", "gov.hr", "dzs.hr", "hnb.hr"
    )):
        return "official_report"

    meta = provider_metadata or {}
    crossref_type = str(meta.get("type") or "").lower()
    mapping = {
        "journal-article": "journal_article",
        "proceedings-article": "journal_article",
        "book": "book",
        "monograph": "book",
        "book-chapter": "chapter",
        "report": "official_report" if any(
            token in text for token in ("oecd", "world bank", "eurostat", "government", "ministarstvo")
        ) else "unknown",
    }
    return mapping.get(crossref_type, "unknown")


def classify_quality(source_type: str, verification_status: str) -> dict[str, Any]:
    """Conservative quality classification.

    Quality is not guessed when the source type is unknown. A verification conflict is
    classified X because the bibliographic identity is contradicted until resolved.
    """
    if verification_status not in VERIFICATION_STATUSES:
        raise ValueError(f"nepoznat verification status: {verification_status}")

    if verification_status == CONFLICT:
        return {"class": "X", "status": "classified", "basis": "bibliographic identity conflict"}
    if source_type == "discovery_service":
        return {"class": "E", "status": "classified", "basis": "discovery service is not a source entity"}
    if source_type == "inadmissible" or verification_status == INVALID:
        return {"class": "X", "status": "classified", "basis": "invalid or inadmissible source"}

    by_type = {
        "law": "A",
        "regulation": "A",
        "court_decision": "A",
        "eu_act": "A",
        "peer_reviewed_article": "A",
        "academic_book": "B",
        "academic_chapter": "B",
        "official_report": "C",
        "journalism": "D",
    }
    klass = by_type.get(source_type)
    if klass and verification_status == VERIFIED:
        return {"class": klass, "status": "classified", "basis": f"verified {source_type}"}

    return {
        "class": None,
        "status": "needs_classification",
        "basis": "automatic verification does not establish academic quality",
    }


def is_blocking_verification(status: str) -> bool:
    if status not in VERIFICATION_STATUSES:
        raise ValueError(f"nepoznat verification status: {status}")
    return status in {CONFLICT, INVALID}


def verification_record(
    status: str,
    *,
    provider: str,
    availability: str = "available",
    scope: str = "identity",
    reason: str,
    mismatches: list[str] | None = None,
) -> dict[str, Any]:
    """Strojni zapis o tome što automatika zna o izvoru.

    `mismatches` je strojno čitljiv popis proturječja između popisa literature i
    onoga što je provider vratio (prvi autor, godina). Postoji jer je `reason`
    slobodan tekst: kad se naslov poklopi, a autor i godina proturječe, provjera
    je i dalje `verified` u dosegu „može li se ovo naći" (DOI se razrješava i
    naslov se podudara), pa se status namjerno NE mijenja — ali potrošači JSON-a
    (izvoz, engine) dosad nisu imali nikakav način vidjeti razliku prema stvarno
    potvrđenom izvoru, jer je proturječje živjelo samo u rečenici obrazloženja.
    Prazan popis znači „nema poznatog proturječja"; ključ postoji uvijek, da
    potrošač ne mora razlikovati „nema proturječja" od „stara verzija zapisa".
    """
    if status not in VERIFICATION_STATUSES:
        raise ValueError(f"nepoznat verification status: {status}")
    if availability not in {"available", "unavailable"}:
        raise ValueError(f"nepoznata availability vrijednost: {availability}")
    return {
        "status": status,
        "provider": provider,
        "availability": availability,
        "scope": scope,
        "reason": reason,
        "mismatches": list(mismatches or []),
    }
