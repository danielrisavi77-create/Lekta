#!/usr/bin/env python3
"""Automatski primijeni SAMO sigurne, uzorkovane ispravke na .docx.

Uporaba:
  python3 apply_safe_fixes.py rad.docx [out.docx] [opcije]

Zadano (uvijek sigurno):
  • navodnici: U+201C(") → U+201D(”) i sparivanje ravnih " → „…"
  • znak množenja: 80x80 → 80 × 80 (samo između znamenki)
  • ukloni prisilne prijelome iznad natpisa (pageBreakBefore)
  • tablice fixed → autofit
  • updateFields=true (Word osvježi polja pri otvaranju)

Opcije (opt-in, mijenjaju izgled — uključi svjesno):
  --fonts arial     sve na Arial (theme + docDefaults + stilovi + Courier)
  --no-indent       makni uvlaku prvog retka (Normal firstLine=0) + razmak da se odlomci ne stope
  --no-quotes       preskoči navodnike
  --no-mult         preskoči × zamjenu
  --strip-breaks    ukloni pageBreakBefore (OPT-IN — provjeri pravila fakulteta!)
  --no-autofit      preskoči fixed→autofit
  --dry-run         samo prikaži što bi promijenio

VAŽNO: radi samo unutar vidljivog teksta (<w:t>) i strukturnih atributa —
NE kolabira runove, NE dira polja (REF/SEQ/TOC/instrText). Nakon zahvata
provjeri docx skillom:  validate.py out.docx --original rad.docx
"""
import re
import sys
import os
import zipfile
import shutil
import tempfile


def process_wt_stateful(xml, transform):
    """Primijeni transform(text, state) na sadržaj svakog <w:t>, dijeleći state."""
    state = {"quote_open": True}
    out = []
    last = 0
    for m in re.finditer(r"(<w:t\b[^>]*>)(.*?)(</w:t>)", xml, re.S):
        out.append(xml[last:m.start()])
        out.append(m.group(1) + transform(m.group(2), state) + m.group(3))
        last = m.end()
    out.append(xml[last:])
    return "".join(out)


def top_level_paragraph_spans(xml):
    """Vrati (start, end) spanove TOP-LEVEL <w:p>…</w:p> elemenata, s praćenjem
    dubine. Naivni regex <w:p\\b.*?</w:p> (non-greedy) završi na UGNIJEŽĐENOM
    </w:p> unutar textboxa (w:txbxContent) — tekst iza textboxa u istom odlomku
    tada tiho ispadne iz obrade. Ovo to rješava: ugniježđeni paragrafi ostaju
    unutar spana svog top-level roditelja."""
    spans = []
    depth = 0
    start = None
    for m in re.finditer(r"<w:p\b[^>]*?(/)?>|</w:p>", xml):
        tok = m.group(0)
        if tok.startswith("</"):
            depth -= 1
            if depth == 0 and start is not None:
                spans.append((start, m.end()))
                start = None
        elif m.group(1):  # samozatvarajući <w:p/> (prazan odlomak)
            if depth == 0:
                spans.append((m.start(), m.end()))
        else:
            if depth == 0:
                start = m.start()
            depth += 1
    return spans


def fix_quotes_by_paragraph(doc_xml):
    """Zamijeni ravne navodnike hrvatskima („…") po ODLOMCIMA, ne globalno.

    Zašto po odlomku: stari pristup je držao jedan toggle-state kroz cijeli
    dokument — jedan nesparen ravni navodnik (npr. inč-oznaka 12" ili 6" u
    tehničkim radovima) bi desinkronizirao toggle za SVE navodnike iza njega
    do kraja dokumenta. Reset stanja na svakom <w:p> ograničava eventualnu
    štetu na taj jedan odlomak, i taj odlomak se prijavljuje kao upozorenje
    umjesto tihog kvarenja ostatka teksta.

    Heuristika za inč-oznaku: ravni navodnik odmah iza znamenke (bez razmaka,
    npr. '12"') se NE pretvara i NE broji u toggle — ostaje kao što je, jer je
    vjerojatnije oznaka mjere (inč/sekunda) nego zatvarajući navodnik. Ako je
    heuristika pogrešna u konkretnom slučaju, odlomak će (najčešće) izaći s
    neparnim brojem navodnika i biti prijavljen za ručnu provjeru.

    U+201C („engleski otvarajući" / njemački zatvarajući): pretvara se u
    hrvatski zatvarajući U+201D SAMO u odlomku koji sadrži i „ (U+201E) —
    tj. u hrvatskom/njemačkom kontekstu. Odlomak s "…" parom bez „ (tipično
    engleski sažetak/Abstract) se NE dira — globalna zamjena bi ispravan
    engleski par pretvorila u ”…” (dva zatvarajuća) bez ikakvog upozorenja.

    Odlomci se iteriraju depth-aware (v. top_level_paragraph_spans) — tekst
    iza inline textboxa u istom odlomku se NE preskače.

    Vraća: (novi_xml, counts_dict, upozorenja[])
    """
    c = {"straight": 0, "inch": 0, "curly_hr": 0, "curly_left": 0}
    warnings = []

    def transform_paragraph(p_xml, p_index):
        if '"' not in p_xml and "“" not in p_xml:
            return p_xml
        matches = list(re.finditer(r"(<w:t\b[^>]*>)(.*?)(</w:t>)", p_xml, re.S))
        if not matches:
            return p_xml

        full = []
        owner = []
        for mi, m in enumerate(matches):
            for ch in m.group(2):
                full.append(ch)
                owner.append(mi)

        replacement = {}

        # --- U+201C kontekstualno (samo uz prisutan „ u istom odlomku) ---
        curly_positions = [i for i, ch in enumerate(full) if ch == "“"]
        if curly_positions:
            if "„" in full:
                for i in curly_positions:
                    replacement[i] = "”"
                    c["curly_hr"] += 1
            else:
                c["curly_left"] += len(curly_positions)

        # --- ravni navodnici (toggle po odlomku, inč-heuristika) ---
        # R15: stanje se NE smije voditi togglom koji broji samo ravne navodnike.
        # Odlomak koji je već otvoren hrvatskim „ dobio bi drugi „ umjesto ”
        # („Neovisno življenje„). Stanje se zato čita iz CIJELOG prefiksa, uz
        # već obavljene zamjene: otvoreno je ako je „ više nego ”.
        quote_positions = [i for i, ch in enumerate(full) if ch == '"']
        real_quotes = 0
        for i in quote_positions:
            prev_ch = full[i - 1] if i > 0 else ""
            if prev_ch.isdigit():
                c["inch"] += 1
                continue  # vjerojatna inč-oznaka — ostavi kao ravni "
            prefiks = [replacement.get(j, ch) for j, ch in enumerate(full[:i])]
            state_open = prefiks.count("„") <= prefiks.count("”")
            replacement[i] = "„" if state_open else "”"
            real_quotes += 1
            c["straight"] += 1

        if real_quotes % 2 == 1:
            snippet = "".join(full)[:80].replace("\n", " ").strip()
            warnings.append(f"odlomak #{p_index}: neparan broj navodnika ({real_quotes}) — "
                             f"provjeri ručno: „{snippet}…\"")

        if not replacement:
            return p_xml

        new_full = list(full)
        for i, rep in replacement.items():
            new_full[i] = rep
        per_owner_text = ["" for _ in matches]
        for ch, o in zip(new_full, owner):
            per_owner_text[o] += ch

        out = []
        last = 0
        for mi, m in enumerate(matches):
            out.append(p_xml[last:m.start()])
            out.append(m.group(1) + per_owner_text[mi] + m.group(3))
            last = m.end()
        out.append(p_xml[last:])
        return "".join(out)

    out = []
    last = 0
    for p_index, (s, e) in enumerate(top_level_paragraph_spans(doc_xml), 1):
        out.append(doc_xml[last:s])
        out.append(transform_paragraph(doc_xml[s:e], p_index))
        last = e
    out.append(doc_xml[last:])
    return "".join(out), c, warnings


def main(argv):
    src = argv[0]
    out = argv[1] if len(argv) > 1 and not argv[1].startswith("--") else \
        os.path.splitext(src)[0] + "_fixed.docx"
    opt = set(a for a in argv if a.startswith("--"))
    dry = "--dry-run" in opt
    counts = {}

    tmp = tempfile.mkdtemp()
    with zipfile.ZipFile(src) as z:
        z.extractall(tmp)

    doc_p = os.path.join(tmp, "word", "document.xml")
    doc = open(doc_p, encoding="utf-8").read()

    # ---------- navodnici ----------
    quote_warnings = []
    if "--no-quotes" not in opt:
        doc, qc, quote_warnings = fix_quotes_by_paragraph(doc)
        counts["ravni \" → „…”"] = qc["straight"]
        counts["navodnik U+201C→U+201D (uz „ u odlomku)"] = qc["curly_hr"]
        if qc["curly_left"]:
            counts["U+201C ostavljen (bez „ u odlomku — vjerojatno engleski par)"] = qc["curly_left"]
        if qc["inch"]:
            counts["preskočeno (moguća inč-oznaka, npr. 12\")"] = qc["inch"]

    # ---------- znak množenja ----------
    if "--no-mult" not in opt:
        n = [0]
        hexed = [0]

        def mult(text, st):
            # alternacija: hex literal (0x41, 0xFF…) se prepozna PRVI i vrati
            # netaknut — inače bi "0x41" postao "0 × 41" (tiho kvarenje,
            # realno u IT domeni koju skill podržava)
            def repl(m):
                if m.group(1):
                    hexed[0] += 1
                    return m.group(1)
                n[0] += 1
                return " × "
            return re.sub(r"(\b0[xX][0-9A-Fa-f]+\b)|(?<=\d)\s*[xX]\s*(?=\d)", repl, text)
        doc = process_wt_stateful(doc, mult)
        counts["'x'→'×' (broj×broj)"] = n[0]
        if hexed[0]:
            counts["hex literal (0x…) preskočen"] = hexed[0]

    # ---------- prisilni prijelomi ----------
    # Uklanjanje prijeloma je OPT-IN: mnogi fakulteti traže da poglavlje
    # počinje na novoj stranici, pa bi tiho uklanjanje prekršilo zahtjev.
    if "--strip-breaks" in opt:
        c = doc.count("<w:pageBreakBefore/>")
        doc = doc.replace("<w:pageBreakBefore/>", "")
        counts["uklonjen pageBreakBefore"] = c

    # ---------- tablice autofit ----------
    if "--no-autofit" not in opt:
        c = doc.count('<w:tblLayout w:type="fixed"/>')
        doc = doc.replace('<w:tblLayout w:type="fixed"/>', '<w:tblLayout w:type="autofit"/>')
        counts["tablice fixed→autofit"] = c

    # ---------- bez uvlake (opt-in) ----------
    if "--no-indent" in opt:
        counts["Normal firstLine→0"] = 0
        # dodaj razmak prozi bez after (da se ne stope) — po odlomku izvan tablica
        tbl_spans = [(m.start(), m.end()) for m in re.finditer(r"<w:tbl>.*?</w:tbl>", doc, re.S)]
        def in_tbl(p): return any(a <= p < b for a, b in tbl_spans)
        def has_txt(p): return bool(re.search(r"<w:t\b", p))
        outp = []; last = 0; added = 0
        for s_, e_ in top_level_paragraph_spans(doc):
            p = doc[s_:e_]; outp.append(doc[last:s_]); last = e_
            styled = "<w:pStyle" in p
            ppr_m = re.search(r"(<w:pPr>)(.*?)(</w:pPr>)", p, re.S)
            ppr_inner = ppr_m.group(2) if ppr_m else ""
            # w:after provjeravamo SAMO unutar pPr — w:spacing postoji i kao
            # run-level (razmak slova) u rPr i tamo w:after NIJE dopušten
            has_after = bool(re.search(r'<w:spacing\b[^>]*w:after="', ppr_inner))
            if (not in_tbl(s_)) and (not styled) and has_txt(p) \
               and "<w:ind" not in ppr_inner and not has_after \
               and "fldChar" not in p and "instrText" not in p:
                p2 = _add_after_to_ppr(p, ppr_m)
                if p2 is not None:
                    p = p2
                    added += 1
            outp.append(p)
        outp.append(doc[last:]); doc = "".join(outp)
        counts["razmak dodan prozi bez razmaka"] = added

    if not dry:
        open(doc_p, "w", encoding="utf-8").write(doc)

    # ---------- fontovi Arial (opt-in) ----------
    if "--fonts" in opt:
        target = argv[argv.index("--fonts") + 1] if len(argv) > argv.index("--fonts") + 1 else "arial"
        font = "Arial" if target.lower() == "arial" else target
        n = _apply_font(tmp, font, dry)
        counts[f"fontovi → {font}"] = n
        if "--no-indent" in opt:
            _normal_firstline0(tmp, dry)
            counts["Normal firstLine→0"] = 1
    elif "--no-indent" in opt:
        _normal_firstline0(tmp, dry)
        counts["Normal firstLine→0"] = 1

    # ---------- updateFields ----------
    _set_updatefields(tmp, dry)
    counts["updateFields=true"] = 1

    # ---------- report ----------
    print("=" * 56)
    print(("[DRY-RUN] " if dry else "") + "SIGURNI AUTO-ISPRAVCI")
    print("=" * 56)
    for k, v in counts.items():
        print(f"  {v:>4}  {k}")

    if quote_warnings:
        print(f"\n  ⚠ {len(quote_warnings)} odlomak(a) s neparnim brojem navodnika — ručno provjeri:")
        for w in quote_warnings:
            print(f"    - {w}")

    if not dry:
        if os.path.exists(out):
            os.remove(out)
        base = os.path.dirname(os.path.abspath(out)) or "."
        # rezip
        zf = zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED)
        for root, _dirs, files in os.walk(tmp):
            for f in files:
                fp = os.path.join(root, f)
                zf.write(fp, os.path.relpath(fp, tmp))
        zf.close()
        print(f"\n✔ spremljeno: {out}")
        print("  → provjeri:  validate.py", out, "--original", src)
        print("  → u Wordu:   Ctrl+A pa F9 (osvježi polja)")
    shutil.rmtree(tmp, ignore_errors=True)
    return 0


def _add_after_to_ppr(p, ppr_m):
    """Ubaci <w:spacing w:after="120"/> ISKLJUČIVO unutar <w:pPr> odlomka —
    nikad u run-level <w:rPr> (tamo w:spacing znači razmak slova i atribut
    w:after NIJE dopušten po schemi; stari kod je zbog provjere '<w:spacing in p'
    znao ubaciti after u rPr i proizvesti XSD-nevaljan dokument).

    Umeće na schema-ispravno mjesto: prije prvog pPr djeteta koje po redoslijedu
    dolazi IZA spacing (ind/jc/rPr…), ili na kraj pPr. Vraća novi p ili None
    ako se ništa nije promijenilo."""
    if ppr_m is None:
        new_p, k = re.subn(r"(<w:p\b[^>]*>)",
                            r'\1<w:pPr><w:spacing w:after="120"/></w:pPr>', p, count=1)
        return new_p if k else None
    inner = ppr_m.group(2)
    if re.search(r"<w:spacing\b", inner):
        new_inner = re.sub(r"<w:spacing\b", '<w:spacing w:after="120"', inner, count=1)
    else:
        anchor = re.search(
            r"<w:(?:ind|contextualSpacing|mirrorIndents|suppressOverlap|jc|"
            r"textDirection|textAlignment|outlineLvl|divId|cnfStyle|rPr|sectPr)\b", inner)
        pos = anchor.start() if anchor else len(inner)
        new_inner = inner[:pos] + '<w:spacing w:after="120"/>' + inner[pos:]
    return p[:ppr_m.start(2)] + new_inner + p[ppr_m.end(2):]


def _apply_font(tmp, font, dry):
    total = 0
    th = os.path.join(tmp, "word", "theme", "theme1.xml")
    if os.path.exists(th):
        t = open(th, encoding="utf-8").read()
        for bad in ["Calibri", "Cambria", "Times New Roman"]:
            total += t.count(f'typeface="{bad}"')
            t = t.replace(f'typeface="{bad}"', f'typeface="{font}"')
        if not dry:
            open(th, "w", encoding="utf-8").write(t)
    for part in ["styles.xml", "stylesWithEffects.xml"]:
        pp = os.path.join(tmp, "word", part)
        if not os.path.exists(pp):
            continue
        s = open(pp, encoding="utf-8").read()
        repl = f'<w:rFonts w:ascii="{font}" w:eastAsia="{font}" w:hAnsi="{font}" w:cs="{font}"/>'
        s, n = re.subn(r'<w:rFonts\b[^>]*(?:asciiTheme|hAnsiTheme|eastAsiaTheme|cstheme)="[^"]*"[^>]*/>', repl, s)
        total += n
        s = re.sub(r'<w:rFonts w:ascii="Courier" w:hAnsi="Courier"\s*/>',
                   f'<w:rFonts w:ascii="{font}" w:hAnsi="{font}"/>', s)
        for bad in ["Calibri", "Cambria", "Times New Roman"]:
            s = s.replace(f'w:ascii="{bad}"', f'w:ascii="{font}"').replace(f'w:hAnsi="{bad}"', f'w:hAnsi="{font}"')
        if not dry:
            open(pp, "w", encoding="utf-8").write(s)
    return total


def _normal_firstline0(tmp, dry):
    """Ugasi uvlaku prvog retka SAMO u stilu Normal.

    Stara verzija je (a) blanket-replace-ala firstLine="709" u SVIM stilovima
    (pogodila bi i npr. block-quote stil) i (b) koristila regex
    'styleId="Normal".*?firstLine' koji — kad Normal NEMA firstLine — non-greedy
    doskoči do PRVOG SLJEDEĆEG stila s uvlakom (npr. Heading1) i promijeni njega.
    Sada se mijenja isključivo unutar <w:style …styleId="Normal">…</w:style> bloka."""
    pp = os.path.join(tmp, "word", "styles.xml")
    if not os.path.exists(pp):
        return
    s = open(pp, encoding="utf-8").read()
    m = re.search(r'<w:style\b[^>]*w:styleId="Normal"[^>]*>.*?</w:style>', s, re.S)
    if not m:
        return
    block = m.group(0)
    new_block = re.sub(r'(<w:ind\b[^>]*?w:firstLine=")[1-9]\d*(")', r'\g<1>0\2', block)
    if new_block != block and not dry:
        s = s[:m.start()] + new_block + s[m.end():]
        open(pp, "w", encoding="utf-8").write(s)


def _set_updatefields(tmp, dry):
    pp = os.path.join(tmp, "word", "settings.xml")
    if not os.path.exists(pp):
        return
    s = open(pp, encoding="utf-8").read()
    if "w:updateFields" in s:
        return
    for anchor in ["compat", "rsids", "mathPr", "hdrShapeDefaults", "footnotePr",
                   "endnotePr", "clrSchemeMapping", "shapeDefaults", "decimalSymbol"]:
        m = re.search(r"<w:" + anchor + r"[ />]", s)
        if m:
            s = s[:m.start()] + '<w:updateFields w:val="true"/>' + s[m.start():]
            break
    if not dry:
        open(pp, "w", encoding="utf-8").write(s)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1:]))
