#!/usr/bin/env python3
"""Inventar i balans Word polja + provjera formatiranja koje stvara probleme.

Uporaba:  python3 check_fields.py rad.docx

Provjerava:
  - fldChar begin/separate/end balans (nepotpuno polje = greška)
  - tipove polja: TOC, PAGEREF, REF, SEQ
  - SDT (Word content control za SADRŽAJ)
  - updateFields u settings.xml
  - pageBreakBefore (uzrok praznina/"zaključanih" tablica)
  - tblLayout fixed vs autofit
  - dokument-zaštita / permStart / lock (blokira uređivanje)
"""
import re
import sys
from collections import Counter
from common import read_document_xml, read_part


def main(path):
    x = read_document_xml(path)
    settings = read_part(path, "word/settings.xml")

    b = x.count('w:fldCharType="begin"')
    s = x.count('w:fldCharType="separate"')
    e = x.count('w:fldCharType="end"')
    instr = re.findall(r"<w:instrText[^>]*>(.*?)</w:instrText>", x, re.S)
    kinds = Counter(re.match(r"\s*(\w+)", i).group(1) if re.match(r"\s*(\w+)", i) else "?" for i in instr)

    print("=" * 56)
    print("POLJA I FORMATIRANJE —", path)
    print("=" * 56)
    bal = (b == e)
    print(f"fldChar begin/separate/end: {b}/{s}/{e}   {'✓ uravnoteženo' if bal else '⚠ NEURAVNOTEŽENO (slomljeno polje)'}")
    print(f"tipovi polja: {dict(kinds)}")

    ins = x.count("<w:ins ") + x.count("<w:ins>")
    dele = x.count("<w:del ") + x.count("<w:del>")
    cmt_start = x.count("<w:commentRangeStart")
    cmt_ref = x.count("<w:commentReference")
    tracked = bool(ins or dele or cmt_start or cmt_ref)
    if tracked:
        print("\n⚠⚠⚠ DOKUMENT IMA NEPRIHVAĆENE IZMJENE / KOMENTARE ⚠⚠⚠")
        print(f"  praćene izmjene: {ins} umetanja (w:ins), {dele} brisanja (w:del)")
        print(f"  komentari: {cmt_start} raspona, {cmt_ref} referenci")
        print("  DOK OVO NIJE RIJEŠENO: brojanje citata/brojki i tekstualna analiza mogu biti")
        print("  netočni (obrisani tekst zna se i dalje pojaviti u ekstrakciji, umetnuti tekst")
        print("  zna nedostajati ovisno o alatu). PRIHVATI SVE IZMJENE prije nastavka audita:")
        print("    python3 /root/.claude/skills/docx/scripts/accept_changes.py rad.docx out.docx")
        print("  (ili u Wordu: Pregled → Prihvati → Prihvati sve izmjene)")
    print(f"SDT (content control, npr. Wordov SADRŽAJ): {x.count('<w:sdt>')}")
    # Kvar 3: prije se ovaj redak samo ispisivao i nije ulazio u `problems`, pa
    # je faza tvrdila „✓ polja/zaštita uredni" nad dokumentom koji ima TOC i SEQ
    # polja, a ne traži njihovo osvježavanje. Rad je tako prošao dva kruga audita
    # s praznim sadržajem i praznim popisima slika i tablica.
    ima_update = "w:updateFields" in settings
    polja_koja_treba_osvjeziti = sum(
        1 for t in ("TOC", "SEQ", "PAGEREF", "REF", "NUMPAGES") if t in x)
    polja_bez_osvjezavanja = bool(polja_koja_treba_osvjeziti) and not ima_update
    print(f"updateFields u settings.xml: "
          f"{'DA (Word osvježi pri otvaranju)' if ima_update else 'NE'}"
          f"{'   ⚠ dokument ima živa polja koja bi ostala prazna' if polja_bez_osvjezavanja else ''}")

    print("\n--- formatiranje koje zna praviti probleme ---")
    pbb = x.count("<w:pageBreakBefore/>")
    pbb_msg = ("⚠ provjeri uz profil fakulteta: ako se traži da svako poglavlje\n             počinje na novoj stranici, prijelomi na Heading 1 NISU nalaz;\n             nalaz su samo prijelomi iznad natpisa tablica/slika"
               if pbb else "✓")
    print(f"pageBreakBefore: {pbb}   {pbb_msg}")
    fixed = x.count('<w:tblLayout w:type="fixed"/>')
    auto = x.count('<w:tblLayout w:type="autofit"/>')
    print(f"tblLayout fixed/autofit: {fixed}/{auto}   {'⚠ fixed = kruti stupci' if fixed else '✓'}")

    print("\n--- zaključavanje / zaštita ---")
    prot = "documentProtection" in settings
    perm = x.count("<w:permStart")
    lock = x.count("<w:lock ") + x.count("<w:lock>")
    floaty = x.count("<w:tblpPr")
    exact = x.count('hRule="exact"')
    print(f"documentProtection: {'⚠ DA' if prot else '✓ ne'}")
    print(f"permStart (zaštita raspona): {perm}   {'⚠' if perm else '✓'}")
    print(f"w:lock (zaključan SDT): {lock}   {'⚠' if lock else '✓'}")
    print(f"plutajuće tablice (tblpPr): {floaty}   {'⚠ mogu djelovati zaključano' if floaty else '✓'}")
    print(f"fiksne visine redaka (hRule=exact): {exact}   {'⚠ sadržaj se može odrezati' if exact else '✓'}")

    problems = (not bal) or prot or perm or lock or tracked or polja_bez_osvjezavanja
    print("\nREZULTAT:", "⚠ ima nalaza" if problems else "✓ polja/zaštita uredni")
    if polja_bez_osvjezavanja:
        print("  · živa polja bez updateFields: Word ih pri otvaranju ne nudi osvježiti,")
        print("    pa sadržaj i popisi prikaza ostaju prazni. Popravak je jedan element u")
        print("    settings.xml: <w:updateFields w:val=\"true\"/>")
    return 1 if problems else 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
