#!/usr/bin/env python3
"""Redoslijed djece po ECMA-376 i provjera koja NE laže.

Dva pravila iz stvarnoga ciklusa (FPZG, kolovoz 2026.):

1. NORMALIZATOR KOJI NAIĐE NA NEPOZNATO DIJETE NE SMIJE GA PREMJESTITI. Prije ovog pravila
   nepoznati element dobivao je ključ 10**6 i tiho se gurao na kraj kontejnera. Ista praznina u
   popisu istodobno je KVARILA dokument (`footerReference` i `mathPr` premješteni na kraj) i
   SKRIVALA kvar od validatora, jer ga validator nije poznavao pa ga nije ni provjeravao.

2. VALIDATOR ISPISUJE ŠTO JE PROVJERIO, NE SAMO REZULTAT. Prva inačica gledala je tri
   kontejnera (pPr, rPr, tcBorders) i ispisivala „shema-valjano" nad dokumentom koji je imao pet
   prekršaja u tblPr, sectPr i settings.xml. Validator koji laže gori je od validatora kojega
   nema. `✅` bez popisa dosega je neupotrebljiv.

    python3 shema.py rad.docx                 # provjeri
    python3 shema.py rad.docx --popravi       # poredaj i zapiši
"""

from docx.oxml.ns import qn
from docx.oxml import OxmlElement

PPR = ["pStyle","keepNext","keepLines","pageBreakBefore","framePr","widowControl","numPr",
       "suppressLineNumbers","pBdr","shd","tabs","suppressAutoHyphens","kinsoku","wordWrap",
       "overflowPunct","topLinePunct","autoSpaceDE","autoSpaceDN","bidi","adjustRightInd",
       "snapToGrid","spacing","ind","contextualSpacing","mirrorIndents","suppressOverlap",
       "jc","textDirection","textAlignment","textboxTightWrap","outlineLvl","divId",
       "cnfStyle","rPr","sectPr","pPrChange"]
RPR = ["rStyle","rFonts","b","bCs","i","iCs","caps","smallCaps","strike","dstrike","outline",
       "shadow","emboss","imprint","noProof","snapToGrid","vanish","webHidden","color",
       "spacing","w","kern","position","sz","szCs","highlight","u","effect","bdr","shd",
       "fitText","vertAlign","rtl","cs","em","lang","eastAsianLayout","specVanish","oMath"]
BORDERS = ["top","start","left","bottom","end","right","insideH","insideV","tl2br","tr2bl"]


TBLPR = ["tblStyle","tblpPr","tblOverlap","bidiVisual","tblStyleRowBandSize","tblStyleColBandSize",
         "tblW","jc","tblCellSpacing","tblInd","tblBorders","shd","tblLayout","tblCellMar","tblLook",
         "tblCaption","tblDescription","tblPrChange"]
TRPR = ["cnfStyle","divId","gridBefore","gridAfter","wBefore","wAfter","cantSplit","trHeight",
        "tblHeader","tblCellSpacing","jc","hidden","ins","del","trPrChange"]
TCPR = ["cnfStyle","tcW","gridSpan","hMerge","vMerge","tcBorders","shd","noWrap","tcMar",
        "textDirection","tcFitText","vAlign","hideMark","headers","cellIns","cellDel","cellMerge","tcPrChange"]
SECTPR = ["headerReference","footerReference","footnotePr","endnotePr","type","pgSz","pgMar","paperSrc","pgBorders","lnNumType",
          "pgNumType","cols","formProt","vAlign","noEndnote","titlePg","textDirection","bidi",
          "rtlGutter","docGrid","printerSettings","sectPrChange"]
STYLE = ["name","aliases","basedOn","next","link","autoRedefine","hidden","uiPriority","semiHidden",
         "unhideWhenUsed","qFormat","locked","personal","personalCompose","personalReply","rsid",
         "pPr","rPr","tblPr","trPr","tcPr","tblStylePr"]
SETTINGS = ["writeProtection","view","zoom","removePersonalInformation","removeDateAndTime",
            "doNotDisplayPageBoundaries","displayBackgroundShape","printPostScriptOverText",
            "printFractionalCharacterWidth","printFormsData","embedTrueTypeFonts","embedSystemFonts",
            "saveSubsetFonts","saveFormsData","mirrorMargins","alignBordersAndEdges","bordersDoNotSurroundHeader",
            "bordersDoNotSurroundFooter","gutterAtTop","hideSpellingErrors","hideGrammaticalErrors",
            "activeWritingStyle","proofState","formsDesign","attachedTemplate","linkStyles",
            "stylePaneFormatFilter","stylePaneSortMethod","documentType","mailMerge","revisionView",
            "trackChanges","doNotTrackMoves","doNotTrackFormatting","documentProtection","autoFormatOverride",
            "styleLockTheme","styleLockQFSet","defaultTabStop","autoHyphenation","consecutiveHyphenLimit",
            "hyphenationZone","doNotHyphenateCaps","showEnvelope","summaryLength","clickAndTypeStyle",
            "defaultTableStyle","evenAndOddHeaders","bookFoldRevPrinting","bookFoldPrinting",
            "bookFoldPrintingSheets","drawingGridHorizontalSpacing","drawingGridVerticalSpacing",
            "displayHorizontalDrawingGridEvery","displayVerticalDrawingGridEvery","doNotUseMarginsForDrawingGridOrigin",
            "drawingGridHorizontalOrigin","drawingGridVerticalOrigin","doNotShadeFormData","noPunctuationKerning",
            "characterSpacingControl","printTwoOnOne","strictFirstAndLastChars","noLineBreaksAfter",
            "noLineBreaksBefore","savePreviewPicture","doNotValidateAgainstSchema","saveInvalidXml",
            "ignoreMixedContent","alwaysShowPlaceholderText","doNotDemarcateInvalidXml","saveXmlDataOnly",
            "useXSLTWhenSaving","saveThroughXslt","showXMLTags","alwaysMergeEmptyNamespace","updateFields",
            "hdrShapeDefaults","footnotePr","endnotePr","compat","docVars","rsids","attachedSchema",
            "mathPr","themeFontLang","clrSchemeMapping","doNotIncludeSubdocsInStats","doNotAutoCompressPictures",
            "forceUpgrade","captions","readModeInkLockDown","smartTagType","shapeDefaults",
            "doNotEmbedSmartTags","decimalSymbol","listSeparator"]

PONOVLJIVI = {"tblStylePr", "activeWritingStyle", "attachedSchema", "smartTagType", "noLineBreaksAfter", "noLineBreaksBefore"}

MAPA = {"pPr": PPR, "rPr": RPR, "tcBorders": BORDERS, "tblPr": TBLPR, "trPr": TRPR,
        "tcPr": TCPR, "sectPr": SECTPR, "style": STYLE, "settings": SETTINGS}

def _umetni(roditelj, dijete, redoslijed):
    tag = dijete.tag.split('}')[1]
    if tag not in redoslijed:
        roditelj.append(dijete); return dijete
    for stari in roditelj.findall(qn('w:' + tag)):
        roditelj.remove(stari)
    i = redoslijed.index(tag)
    for post in roditelj:
        t = post.tag.split('}')[1]
        if t in redoslijed and redoslijed.index(t) > i:
            post.addprevious(dijete); return dijete
    roditelj.append(dijete); return dijete

def u_pPr(pPr, dijete):  return _umetni(pPr, dijete, PPR)
def u_rPr(rPr, dijete):  return _umetni(rPr, dijete, RPR)
def u_rub(tcBorders, dijete): return _umetni(tcBorders, dijete, BORDERS)

def el(tag, **a):
    e = OxmlElement(tag)
    for k, v in a.items(): e.set(qn(k.replace('_', ':')), v)
    return e

def pbdr_bottom(p, sz="12", color="8C6B10", space="3"):
    """Jedan zlatni donji rub na odlomku — uvijek zamjena, nikad drugi pBdr."""
    pPr = p._p.get_or_add_pPr()
    bd = el('w:pBdr')
    bt = el('w:bottom', w_val='single', w_sz=sz, w_space=space, w_color=color)
    bd.append(bt)
    u_pPr(pPr, bd)

def rub_celije(cell, edge, sz, color):
    tcPr = cell._tc.get_or_add_tcPr()
    tb = tcPr.find(qn('w:tcBorders'))
    if tb is None:
        tb = el('w:tcBorders'); tcPr.append(tb)
    u_rub(tb, el(f'w:{edge}', w_val='single', w_sz=str(sz), w_space='0', w_color=color))

def validiraj(putanja):
    """Vrati broj prekršaja redoslijeda i duplikata preko SVIH poznatih kontejnera i dijelova."""
    import zipfile
    from lxml import etree
    W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    z = zipfile.ZipFile(putanja)
    dijelovi = [n for n in z.namelist()
                if n.startswith('word/') and n.endswith('.xml')
                and ('document' in n or 'styles' in n or 'settings' in n
                     or 'numbering' in n or 'footer' in n or 'header' in n)]
    kr, dup = {}, {}
    for dio in dijelovi:
        try:
            root = etree.fromstring(z.read(dio))
        except Exception:
            continue
        for naziv, red in MAPA.items():
            cvorovi = [root] if (naziv == 'settings' and root.tag == W + 'settings') \
                      else list(root.iter(W + naziv))
            for node in cvorovi:
                tags = [c.tag.split('}')[1] for c in node]
                idx = [red.index(x) for x in tags if x in red]
                if idx != sorted(idx):
                    kr[f"{dio}:{naziv}"] = kr.get(f"{dio}:{naziv}", 0) + 1
                poznati = [x for x in tags if x in red and x not in PONOVLJIVI]
                if len(poznati) != len(set(poznati)):
                    dup[f"{dio}:{naziv}"] = dup.get(f"{dio}:{naziv}", 0) + 1
    return kr, dup



def poredaj_dokument(putanja: str) -> dict:
    """Poredaj djecu svih poznatih kontejnera u svim word/*.xml dijelovima.

    NEPOZNATO DIJETE OSTAJE NA MJESTU i prijavljuje se. Nikad se ne gura na kraj.
    """
    import re as _re, shutil, zipfile
    from lxml import etree
    W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    nepoznati, pomaknuto = {}, 0

    def _poredaj(node, red):
        nonlocal pomaknuto
        djeca = list(node)
        poznata, vidjeno = [], set()
        for c in djeca:
            tag = c.tag.split('}')[1]
            if tag not in red:
                nepoznati[tag] = nepoznati.get(tag, 0) + 1
                continue                       # NE dira se, ostaje gdje jest
            if tag in vidjeno and tag not in PONOVLJIVI:
                node.remove(c); continue
            if tag not in PONOVLJIVI:
                vidjeno.add(tag)
            poznata.append(c)
        prije = [c.tag for c in poznata]
        for c in sorted(poznata, key=lambda x: red.index(x.tag.split('}')[1])):
            node.append(c)
        if [c.tag for c in poznata] != prije:
            pomaknuto += 1

    zin = zipfile.ZipFile(putanja); tmp = putanja + '.tmp'
    zout = zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED)
    for it in zin.infolist():
        d = zin.read(it.filename)
        if it.filename.startswith('word/') and it.filename.endswith('.xml'):
            try:
                root = etree.fromstring(d)
            except Exception:
                zout.writestr(it, d); continue
            for naziv, red in MAPA.items():
                cvorovi = ([root] if (naziv == 'settings' and root.tag == W + 'settings')
                           else list(root.iter(W + naziv)))
                for node in cvorovi:
                    _poredaj(node, red)
            d = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
        zout.writestr(it, d)
    zout.close(); zin.close(); shutil.move(tmp, putanja)
    return {"pomaknuto_kontejnera": pomaknuto, "nepoznati_elementi": nepoznati}


def _main():
    import argparse, sys
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("docx")
    ap.add_argument("--popravi", action="store_true", help="poredaj i zapiši u istu datoteku")
    a = ap.parse_args()

    if a.popravi:
        r = poredaj_dokument(a.docx)
        print(f"poredano kontejnera: {r['pomaknuto_kontejnera']}")
        if r["nepoznati_elementi"]:
            print("NEPOZNATI ELEMENTI (ostavljeni na mjestu, provjeri ručno):")
            for tag, n in sorted(r["nepoznati_elementi"].items()):
                print(f"  {tag}  ×{n}")

    kr, dup = validiraj(a.docx)
    print()
    print("provjereno kontejnera:", ", ".join(sorted(MAPA)))
    print("u dijelovima: word/*.xml (document, styles, settings, numbering, footnotes, header*, footer*)")
    print("izvan redoslijeda:", kr if kr else "nema")
    print("duplikata:        ", dup if dup else "nema")
    ok = not kr and not dup
    print("STATUS:", "OK — shema-valjano" if ok else "NEISPRAVNO")
    return 0 if ok else 1


if __name__ == "__main__":
    import sys
    sys.exit(_main())
