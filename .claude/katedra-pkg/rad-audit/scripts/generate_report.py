#!/usr/bin/env python3
"""Objedinjeni izvještaj audita: pokreni sve provjere, razvrstaj nalaze po
težini (KRITIČNO/SREDNJE/KOZMETIČKO) i spremi kao Markdown (+ opcionalno JSON).

Uporaba:
  python3 generate_report.py rad.docx --sources izvori/
  python3 generate_report.py rad.docx --sources izvori/ --out izvjestaj.md
  python3 generate_report.py rad.docx --sources izvori/ --json izvjestaj.json

Zašto ovako (a ne da svaka skripta vraća strukturirane podatke): pojedinačne
provjere su namjerno jednostavni read-only ispisi u terminal (lako ih je
pokrenuti zasebno i pratiti tijekom rada). Ovaj alat NE mijenja njihov API —
hvata stdout svake i heuristički bucketira retke sa "⚠" po težini prema
ključnim riječima. To je namjerna pojednostavljenje: sažetak je orijentir za
PRIORITET pregleda, ne zamjena za čitanje. Puni ispis svake faze je uvijek
priložen ispod sažetka (izvor istine > dojam)."""
import sys
import os
import io
import json
import contextlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import check_fields
import check_placeholders
import check_uputnice
import check_tablice
import check_statistika
import check_hipoteze
import brojke_iz_rasprave
import provjeri_metapodatke
import check_citations
import check_citations_authoryear
import check_typography
import check_repetition
import numbers_inventory
from common import load_docx_text, load_supplementary_text, detect_citation_style

CRITICAL_HINTS = [
    # Kvar 61: iznimka u modulu upisivala se kao "[greška u modulu: ...]" BEZ
    # znaka ⚠, pa je ispadala i iz sažetka i iz brojača — srušena faza izgledala
    # je kao faza bez nalaza. Alat koji je pukao nije provjera koja je prošla.
    "greška u modulu", "faza nije izvedena", "nije nađeno u izvorima",
    # radne oznake: rad koji ih nosi nije spreman za predaju, bez obzira na ostalo
    "tvrdnja bez izvora", "nedovršen tekst", "radna bilješka",
    "nepotvrđen podatak", "rezervirano mjesto", "tekst ispune",
    "interna napomena", "otvoreno pitanje",
    # metapodaci koji putuju s radom
    "odaje alat ili radnu okolinu", "ostavljen predložak, ne ime",
    "nema što raditi u studentskom radu", "polje iz poslovnog predloška",
    "metapodatak i rad ne govore isto", "odaju mapu s računala",
    "praćene izmjene ili komentari nose imena", "nepopunjeno polje predloška",
    "uputnica u prazno", "tekst upućuje na",
    "opisano kao", "nula nije vjerojatnost", "izvan raspona",
    "redak ukupno kaže", "postoci daju", "natpis kaže n =",
    "nijedan statistički test nije imenovan",
    # hipoteza koja se postavi pa nikad ne presudi je strukturna rupa, ne stil:
    # to je prvo pitanje na obrani
    "hipoteza bez izričite presude", "rupa u numeraciji hipoteza",
    "NEURAVNOTEŽENO", "NEPRIHVAĆENE IZMJENE", "SIROČAD", "CITAT BEZ REFERENCE",
    "NEMA U IZVORIMA", "nije nađeno u izvorima", "BEZ vidljive oznake citata",
    "documentProtection: ⚠ DA", "permStart", "rupe u numeraciji",
    "neparan broj navodnika", "krši rastući redoslijed", "w:lock",
]
COSMETIC_HINTS = [
    "navodni", "crtic", "množenj", "decimal", "nbsp", "zalijepljeno",
    "tipografij", "'x' kao množenje", "inč-oznaka", "bez razmaka",
]


def classify(line):
    low = line.lower()
    for h in CRITICAL_HINTS:
        if h.lower() in low:
            return "kritično"
    for h in COSMETIC_HINTS:
        if h.lower() in low:
            return "kozmetičko"
    return "srednje"


def run_captured(fn, *args):
    """Pokreni fn(*args) hvatajući stdout; nikad ne ruši generate_report ako
    jedna faza baci iznimku (samo to zabilježi u ispisu te faze)."""
    buf = io.StringIO()
    code = 0
    try:
        with contextlib.redirect_stdout(buf):
            code = fn(*args) or 0
    except SystemExit as e:
        code = e.code if isinstance(e.code, int) else (1 if e.code else 0)
    except Exception as e:
        buf.write(f"⚠ greška u modulu: {e}\n")
        code = 2
    return buf.getvalue(), code


def main(argv):
    path = argv[0]
    sources = argv[argv.index("--sources") + 1] if "--sources" in argv else None
    out_md = argv[argv.index("--out") + 1] if "--out" in argv else \
        os.path.splitext(path)[0] + "_izvjestaj.md"
    out_json = argv[argv.index("--json") + 1] if "--json" in argv else None

    phases = []

    txt, code = run_captured(check_fields.main, path)
    phases.append(("A/F — Polja i formatiranje", txt, code))

    # Kvar 71: faza A je u SKILL.md-u tražila provjeru placeholdera, a alat je
    # bio u drugom skillu i nitko ga odavde nije zvao. [TREBA IZVOR] u fusnoti
    # prolazio je do predane verzije.
    txt, code = run_captured(check_placeholders.main, path)
    phases.append(("A2 — Radne oznake u tekstu", txt, code))

    # Faza A4: metapodaci putuju s dokumentom u repozitorij i na provjeru
    # podudarnosti, a nitko ih u Wordu ne vidi dok ne otvori Datoteka → Podaci.
    txt, code = run_captured(provjeri_metapodatke.main, [path])
    phases.append(("A4 — Metapodaci", txt, code))

    body, cells, _ = load_docx_text(path, include_tables=True)
    style, style_counts = detect_citation_style(body + "\n" + "\n".join(cells))
    style_note = f"[detektiran stil citiranja: {style} {style_counts}]"

    # Kvar 91: rad koji citira u fusnotama (pravni, dio humanistike) nema oznaka
    # citata u tijelu, pa je autor-godina provjera svaku jedinicu iz popisa
    # proglašavala siročetom. Za takav rad citatni aparat provjerava
    # katedra-lite/provjeri_fusnote.py, ne ovaj sloj.
    from common import detect_footnote_citing
    sup_all = load_supplementary_text(path)
    fusnotni = detect_footnote_citing(sup_all.get("footnotes", ""),
                                      body + "\n" + "\n".join(cells))
    if fusnotni:
        phases.append((
            "B — Citiranje (fusnotni aparat)",
            "[rad citira U FUSNOTAMA: ibid./op. cit./nav. dj./str. N, a tijelo nema "
            "vlastitih oznaka citata]\n"
            "Provjera citata autor-godina i [N] NIJE pokrenuta: nad ovakvim radom ona "
            "svaku jedinicu iz popisa prijavljuje kao siroče, što je lažni nalaz.\n"
            "Citatni aparat ovoga rada provjerava se posebno:\n"
            "  python3 <katedra-lite>/scripts/provjeri_fusnote.py rad.docx\n"
            "  (ibid. bez prethodnika, skraćeni oblik bez punog, numeracija, "
            "supra/infra uputnice)\n"
            "Popis literature i dalje prolazi provjeru oblika jedinice i postojanja.",
            0))
    # ISTA logika kao audit_all.py — za "mixed" se pokreću OBA checkera + upozorenje
    # (raniji drift: generate_report je za mixed preskakao IEEE provjeru, pa je alat
    # za finalnu isporuku prijavljivao manje nego terminal-ispis)
    if not fusnotni and style in ("ieee", "unknown", "mixed"):
        txt, code = run_captured(check_citations.main, path, "ieee")
        phases.append(("B — Citiranje (IEEE [N])", style_note + "\n" + txt, code))
    if not fusnotni and style == "vancouver" or (style in ("unknown", "mixed") and style_counts.get("vancouver", 0)):
        txt, code = run_captured(check_citations.main, path, "vancouver")
        phases.append(("B — Citiranje (Vancouver (N))", style_note + "\n" + txt, code))
    if not fusnotni and style in ("authoryear", "unknown", "mixed"):
        txt, code = run_captured(check_citations_authoryear.main, path)
        phases.append(("B — Citiranje (autor-godina)", style_note + "\n" + txt, code))
    if style == "mixed" and not fusnotni:
        phases.append(("B — Napomena o stilu",
                       "⚠ oba stila citiranja detektirana u sličnoj mjeri — provjeri ručno koristi li "
                       "rad dosljedno JEDAN stil ili je miješanje namjerno (npr. norme u uglatim "
                       "zagradama uz autor-godina tekst)", 1))

    txt, code = run_captured(numbers_inventory.main, path)
    phases.append(("C — Brojčani inventar", txt, code))

    # C2: brojka koju rad izvodi u Raspravi mora imati pokriće u Rezultatima.
    txt, code = run_captured(brojke_iz_rasprave.main, path)
    phases.append(("C2 — Brojke iz Rasprave", txt, code))

    # F2: uputnica „v. Tablica 3" mora pogađati prikaz koji postoji, i svaki
    # prikaz mora biti bar jednom uveden rečenicom.
    txt, code = run_captured(check_uputnice.main, path)
    phases.append(("F2 — Uputnice na prikaze", txt, code))

    txt, code = run_captured(check_tablice.main, path)
    phases.append(("C4 — Aritmetika u tablicama", txt, code))

    txt, code = run_captured(check_statistika.main, path)
    phases.append(("C3 — Statističko izvještavanje", txt, code))

    txt, code = run_captured(check_hipoteze.main, path)
    phases.append(("G1 — Hipoteze i ciljevi", txt, code))

    txt, code = run_captured(check_typography.main, path)
    phases.append(("E — Tipografija", txt, code))

    txt, code = run_captured(check_repetition.main, path)
    phases.append(("E — Ponavljanja i ritam", txt, code))

    if sources:
        import cross_check
        import check_overlap
        txt, code = run_captured(cross_check.main, [path, sources])
        phases.append(("D — Cross-check s izvorima", txt, code))
        txt, code = run_captured(check_overlap.main, [path, sources])
        phases.append(("D — Preklapanje (verbatim-copy)", txt, code))
    else:
        phases.append(("D — Cross-check", "[preskočeno — dodaj --sources <folder> s izvornom građom]", 0))

    buckets = {"kritično": [], "srednje": [], "kozmetičko": []}
    for name, ptxt, pcode in phases:
        for line in ptxt.split("\n"):
            if "⚠" in line:
                buckets[classify(line)].append((name, line.strip()))
        # Faza s izlaznim kodom ≥ 2 nije prazna faza, nego faza koja se nije
        # izvela (pukla, odbila ulaz, nije našla građu). Do v1.9.4 se to vidjelo
        # samo u phase_exit_codes, koje nitko nije čitao, a ukupna ocjena je
        # ostajala nepromijenjena — najtiši način da audit „prođe".
        # Kod 3 je DEKLARIRANA GRANICA (provjera se ne može provesti na ovom
        # radu: nema Rasprave, nema izvora, profil ne propisuje pravilo), kod 2
        # i više je pad alata. Prva izvedba nije razlikovala to dvoje, pa je rad
        # bez zasebne Rasprave dobivao kritični nalaz „faza nije izvedena".
        if pcode == 3:
            buckets["srednje"].append(
                (name, "➖ faza se ne može provesti na ovom radu (izlazni kod 3) — "
                       "deklarirana granica, ne nalaz"))
        elif pcode >= 2:
            buckets["kritično"].append(
                (name, f"⚠ faza nije izvedena (izlazni kod {pcode}) — "
                       f"nalazi ove faze NE POSTOJE, nisu prazni"))
    total = sum(len(v) for v in buckets.values())

    md = [f"# Sažetak audita — `{os.path.basename(path)}`\n"]
    md.append(f"Ukupno nalaza: **{total}** — kritično {len(buckets['kritično'])}, "
              f"srednje {len(buckets['srednje'])}, kozmetičko {len(buckets['kozmetičko'])}\n")
    for level, label in [("kritično", "🔴 Kritično"), ("srednje", "🟠 Srednje"), ("kozmetičko", "⚪ Kozmetičko")]:
        items = buckets[level]
        md.append(f"\n## {label} ({len(items)})\n")
        md.append("_nema nalaza_" if not items else "\n".join(f"- **[{n}]** {l}" for n, l in items))
    md.append("\n\n---\n\n# Puni ispis po fazama\n")
    md.append("_(sažetak gore je orijentir za prioritet pregleda — ovo ispod je izvor istine; "
               "automatska bucketizacija je heuristika i može krivo svrstati nalaz, uvijek "
               "provjeri puni kontekst prije zaključka)_\n")
    for name, ptxt, pcode in phases:
        md.append(f"\n## {name}\n\n```\n{ptxt.strip()}\n```\n")

    report_text = "\n".join(md)
    with open(out_md, "w", encoding="utf-8") as f:
        f.write(report_text)
    print(f"✔ izvještaj spremljen: {out_md}")
    print(f"  nalaza: kritično {len(buckets['kritično'])}, srednje {len(buckets['srednje'])}, "
          f"kozmetičko {len(buckets['kozmetičko'])}")

    if out_json:
        payload = {
            "path": path,
            "counts": {k: len(v) for k, v in buckets.items()},
            "findings": {k: [{"phase": n, "line": l} for n, l in v] for k, v in buckets.items()},
            "phase_exit_codes": {name: pcode for name, _, pcode in phases},
        }
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(f"✔ JSON spremljen: {out_json}")

    pao_alat = [n for n, _, c in phases if c >= 2 and c != 3]
    if pao_alat:
        print(f"💥 faza se nije izvela: {', '.join(pao_alat)} — "
              f"to NIJE isto što i faza bez nalaza.")
    return 1 if (buckets["kritično"] or pao_alat) else 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1:]))
