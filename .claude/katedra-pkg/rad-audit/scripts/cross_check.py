#!/usr/bin/env python3
"""Cross-check: nalazi li se ono što rad TVRDI u izvornoj građi.

Uporaba:
  python3 cross_check.py rad.docx izvori_folder/
  python3 cross_check.py rad.docx izvori_folder/ --claims claims.txt
  python3 cross_check.py rad.docx izvori_folder/ --domain elektro
  python3 cross_check.py rad.docx izvori_folder/ --no-context

Bez --claims: automatski izvlači kandidate iz rada (brojevi+jedinice, profili,
oznake, norme, oznake projekta — domena se auto-detektira, v. domains/) i
traži ih po izvorima. S --claims: svaki redak datoteke je jedna tvrdnja za
provjeru.

Izvori: .txt/.md (izravno) i .docx (preko python-docx). Za .pdf prvo
napravi  pdftotext -layout src.pdf src.txt.
"""
import os
import re
import sys
import glob
from common import load_docx_text
from domains import DOMAINS, detect_domain, UNIVERSAL_CLAIM_PATTERNS


def read_any(p):
    if p.lower().endswith((".txt", ".md")):
        return open(p, encoding="utf-8", errors="ignore").read()
    if p.lower().endswith(".docx"):
        b, c, _ = load_docx_text(p, include_tables=True)
        return b + "\n" + "\n".join(c)
    return ""


def auto_claims(text, domain=None):
    """domain=None -> auto-detektiraj (v. domains.detect_domain). Uvijek uključi
    univerzalne uzorke (jedinice, HRN EN norme, oznake projekta, gole brojke)."""
    if domain is None:
        domain, _ = detect_domain(text)
    pats = list(UNIVERSAL_CLAIM_PATTERNS) + list(DOMAINS.get(domain, {}).get("claim_patterns", []))
    claims = set()
    for pat in pats:
        for m in re.findall(pat, text):
            m = m.strip()
            if m and not (m.isdigit() and int(m) < 10):
                claims.add(m)
    return sorted(claims), domain


def norm(s):
    return re.sub(r"\s+", "", s.lower())


def find_context(raw_text, claim, radius=40):
    """Nađi tvrdnju u NEnormaliziranom tekstu (dopuštajući razmake između znakova)
    i vrati okolni isječak — da se lažni pozitivci (substring preko granice
    rečenice, npr. '40 t' unutar '...iznos 40 tvrtke...') mogu vizualno provjeriti,
    ne samo vjerovati imenu datoteke."""
    core = [ch for ch in claim if not ch.isspace()]
    if not core:
        return None
    pattern = r"\s*".join(re.escape(ch) for ch in core)
    m = re.search(pattern, raw_text, re.IGNORECASE)
    if not m:
        return None
    start = max(0, m.start() - radius)
    end = min(len(raw_text), m.end() + radius)
    snippet = re.sub(r"\s+", " ", raw_text[start:end]).strip()
    return snippet


def main(argv):
    rad, folder = argv[0], argv[1]
    claims_file = None
    if "--claims" in argv:
        claims_file = argv[argv.index("--claims") + 1]
    domain_override = None
    if "--domain" in argv:
        domain_override = argv[argv.index("--domain") + 1]
        if domain_override not in DOMAINS:
            print(f"Nepoznata domena '{domain_override}'. Dostupno: {list(DOMAINS)}")
            return 2
    show_context = "--no-context" not in argv

    rad_text = read_any(rad)
    sources = {}       # ime -> (sirovi tekst, normalizirani tekst)
    # Kvar 62: nerekurzivni glob je faze D tiho gasio čim su izvori bili u
    # podmapi (izvori/pdfovi/…): nula pročitanih datoteka, izlazni kod 2, a
    # izvještaj je izgledao čisto.
    for p in sorted(glob.glob(os.path.join(folder, "**", "*"), recursive=True)):
        txt = read_any(p)
        if txt:
            sources[os.path.basename(p)] = (txt, norm(txt))
    if not sources:
        print("Nema čitljivih izvora u folderu (.txt/.md/.docx). Za PDF: pdftotext -layout.")
        return 2

    domain_used = None
    if claims_file:
        claims = [l.strip() for l in open(claims_file, encoding="utf-8") if l.strip()]
    else:
        claims, domain_used = auto_claims(rad_text, domain_override)

    print("=" * 70)
    print(f"CROSS-CHECK — {len(claims)} tvrdnji vs {len(sources)} izvora")
    if domain_used:
        print(f"domena: {domain_used} — {DOMAINS[domain_used]['label']}"
              + ("  (ručno zadano)" if domain_override else "  (auto-detekcija)"))
    print("=" * 70)
    not_found = []
    for cl in claims:
        ncl = norm(cl)
        hits = [name for name, (raw, nb) in sources.items() if ncl in nb]
        mark = "✓" if hits else "✗ NEMA U IZVORIMA"
        if not hits:
            not_found.append(cl)
        src = ", ".join(h[:18] for h in hits[:3]) + (" …" if len(hits) > 3 else "")
        print(f"  {mark:16} {cl:20} {src}")
        if hits and show_context:
            for name in hits[:2]:
                ctx = find_context(sources[name][0], cl)
                if ctx:
                    print(f"        └─ [{name}] …{ctx}…")
    print("\nSAŽETAK:")
    print(f"  potvrđeno: {len(claims)-len(not_found)}/{len(claims)}")
    if not_found:
        print(f"  ⚠ nije nađeno u izvorima: {not_found}")
        print("    (provjeri ručno — možda drukčiji zapis, ili tvrdnja nije u građi)")
    print("\nNAPOMENA: podudaranje je substring-nakon-normalizacije — kratke gole brojke")
    print("mogu dati lažni pozitivan pogodak preko granice rečenice. Uvijek pogledaj")
    print("isječak konteksta (└─) prije nego proglasiš tvrdnju potvrđenom.")
    # exit kod usklađen s ostalim checkerima: 1 = ima nalaza (nepotvrđene tvrdnje)
    return 1 if not_found else 0


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1:]))
