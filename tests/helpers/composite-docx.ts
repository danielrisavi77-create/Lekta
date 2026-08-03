/**
 * Kompozitni .docx generatori: jedan dokument koji odjednom nosi strukturu koju Repair Engine
 * stvarno susrece u studentskom radu.
 *
 * Zasto uz postojeci tests/helpers/repair-templates.ts: ondje svaki predlozak pokriva JEDNU
 * sposobnost i ima tocno 4 zip dijela. Izolirana sposobnost ne moze proizvesti lancanu klasu buga
 * poput RE-47, gdje jedan fixer proizvede neispravan XML i obori sve kasnije u istom prolazu.
 * Mjereno prije ovoga: 18 od 31 fixera nije imalo nijednu stvarnu primjenu u golden snapshotu,
 * najcesce jer u dokumentu naprosto nije bilo cilja (nema tablice, slike, fusnote, polja, TOC-a).
 *
 * Dokumenti su GENERIRANI i ANONIMNI. Nisu studentski radovi, nisu izvor pravila (CLAUDE.md), i
 * ne sadrze niciji sadrzaj: sav tekst je bezlicna ispuna.
 */
import { writeZip, type ZipEntry } from '../../src/repair/zip-codec';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const REL_NS = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
const CT_NS = 'xmlns="http://schemas.openxmlformats.org/package/2006/content-types"';

const DOC_NS = `xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:pic="${PIC}"`;
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const enc = new TextEncoder();

/**
 * Stvaran PNG 120x80 (SteelBlue s zutom elipsom), generiran System.Drawingom istim postupkom
 * kao scripts/word-verify/make-worst-case.ps1. NIJE potpis + nule: table-figure-rescue-fixer
 * cita dimenzije radi DPI racuna, pa bi laznu sliku ili preskocio ili krivo ocijenio, a Word bi
 * je pri otvaranju "popravljao" (sto Tier 2 s OpenAndRepair=false vidi kao pad).
 */
const IMAGE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAYAAADSm7GJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAH9SURBVHhe7dPbiQMxEERRR7eBbUzOZcPxIsyADRdjaD1Kpfo436Ouy9x+fu+P8JXA5hLYXAKbS2BzCWwugc0lsLkENpfA5hLYXAKbS2BzCWwugc0lsDmbwI+/W3f0nd1sGZhizELvUbZNYBp7NXqnGunANKoqer8CycA04C7onpWkAtNgu6L7VpAITAO5oHtnWhqYBnFF98+wLDCN4I52GG1JYDr+FLTHSFMD08Gnon1GmBaYjjwd7dRbAi9EO/U2JTAdF0+0V0/DA9NR8Y5262VoYDomGO3XQwKLoP16GBaYjojPaMeqBBZCO1YNCUyPj+/QnhUJLIb2rEhgMbRnRQKLoT0rElgM7VnRPTA9Or5Hm1bkDxZDe1YksBjasyKBxdCeFQkshvasSGAxtGfFkMANPT4+ox2rElgI7Vg1LHBDRwSj/XpIYBG0Xw9DAzd0TLyj3XoZHriho+KJ9uppSuCGjjsd7dRbAi9EO/U2LXBDR56K9hlhauALHXwK2mOkJYEbOt4d7TDassANjeCK7p9haeALDeKC7p1JIvCFBtoV3beCVOALDbYLumclycAXGlAVvV+BdOBXNOpq9E412wR+RWPPQu9RtmVgQjGq6Du7sQkcLIHNJbC5BDaXwOYS2FwCm0tgcwlsLoHNJbC5BDaXwOYS2FwCW7s//gG61VBAtKAprQAAAABJRU5ErkJggg==';

/** 120x80 px pri 96 DPI = 1143000 x 762000 EMU (1 inch = 914400 EMU). */
const IMAGE_EMU = { cx: 1143000, cy: 762000 };

function pngBytes(): Uint8Array {
  const binary = atob(IMAGE_PNG_BASE64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

// === Gradivni blokovi ===

function para(text: string, opts: { style?: string; jc?: string; font?: string; sizePt?: number } = {}): string {
  const pPr = [
    opts.style ? `<w:pStyle w:val="${opts.style}"/>` : '',
    opts.jc ? `<w:jc w:val="${opts.jc}"/>` : '',
  ].join('');
  const rPr = [
    opts.font ? `<w:rFonts w:ascii="${opts.font}" w:hAnsi="${opts.font}"/>` : '',
    opts.sizePt ? `<w:sz w:val="${opts.sizePt * 2}"/>` : '',
  ].join('');
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

/**
 * TOC omotan u structured document tag, tako Word zapravo umece "Automatski sadrzaj".
 * Goli fldChar bez sdt-a je oblik koji Word nikad ne proizvede sam, pa ga toc-field-fixer i
 * field-integrity vide u drugom kontekstu nego u praksi.
 */
function sdtToc(rows: ReadonlyArray<{ title: string; page: number }>): string {
  const entries = rows
    .map((row) => `<w:p><w:pPr><w:pStyle w:val="TOC1"/></w:pPr><w:r><w:t xml:space="preserve">${row.title}\t${row.page}</w:t></w:r></w:p>`)
    .join('');
  return (
    '<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj></w:sdtPr><w:sdtContent>' +
    para('Sadrzaj', { style: 'Heading1' }) +
    '<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>' +
    '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r></w:p>' +
    entries +
    '<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>' +
    '</w:sdtContent></w:sdt>'
  );
}

/** Tablica 3 reda x 4 stupca s natpisom iznad (element-caption-fixer trazi bas taj oblik). */
function table(): string {
  const grid = Array.from({ length: 4 }, () => '<w:gridCol w:w="2265"/>').join('');
  const row = (cells: readonly string[]) =>
    `<w:tr>${cells.map((cell) => `<w:tc><w:tcPr><w:tcW w:w="2265" w:type="dxa"/></w:tcPr>${para(cell)}</w:tc>`).join('')}</w:tr>`;
  return (
    para('Tablica 1. Pregled izmjerenih vrijednosti') +
    `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="9060" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>` +
    row(['Mjerenje', 'Prvi krug', 'Drugi krug', 'Razlika']) +
    row(['Prosjek', '12,4', '13,1', '0,7']) +
    row(['Medijan', '11,8', '12,9', '1,1']) +
    '</w:tbl>'
  );
}

/**
 * Potpun wp:inline crtez po ECMA-376. Nepotpun crtez (bez wp:extent, wp:docPr, pic:nvPicPr,
 * a:stretch, a:xfrm) Word pri otvaranju popravlja, pa bi Tier 2 s OpenAndRepair=false pao.
 */
function drawing(relId: string): string {
  return (
    `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${IMAGE_EMU.cx}" cy="${IMAGE_EMU.cy}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="1" name="Slika 1" descr="Ilustracija"/>` +
    `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="${PIC}"><pic:pic>` +
    `<pic:nvPicPr><pic:cNvPr id="0" name="slika.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${IMAGE_EMU.cx}" cy="${IMAGE_EMU.cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>` +
    para('Slika 1. Shematski prikaz postupka')
  );
}

function footnoteRef(id: number): string {
  return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="${id}"/></w:r>`;
}

/** Odlomak tijela s fusnotom na kraju recenice. */
function paraWithFootnote(text: string, footnoteId: number): string {
  return `<w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r>${footnoteRef(footnoteId)}</w:p>`;
}

const A4_PORTRAIT = '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1701" w:header="708" w:footer="708"/>';
const A4_LANDSCAPE = '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1701" w:header="708" w:footer="708"/>';

// === Puna struktura (B1) ===

function fullStructureDocumentXml(): string {
  const titlePage =
    para('SVEUCILISTE U ZAGREBU', { jc: 'center' }) +
    para('FAKULTET ELEKTROTEHNIKE I RACUNARSTVA', { jc: 'center' }) +
    para('', { jc: 'center' }) +
    para('Ime Prezime', { jc: 'center' }) +
    para('NASLOV DIPLOMSKOGA RADA', { jc: 'center' }) +
    para('DIPLOMSKI RAD', { jc: 'center' }) +
    para('Zagreb, 2026.', { jc: 'center' });

  // Naslovnica je vlastita sekcija: rimska numeracija i titlePg (razlicito prvo zaglavlje).
  const titleSection =
    `<w:p><w:pPr><w:sectPr><w:pgNumType w:fmt="lowerRoman" w:start="1"/><w:titlePg/>${A4_PORTRAIT}</w:sectPr></w:pPr></w:p>`;

  const body =
    sdtToc([
      { title: '1. Uvod', page: 1 },
      { title: '2. Razrada', page: 3 },
      { title: '2.1. Metoda', page: 4 },
      { title: '3. Zakljucak', page: 9 },
    ]) +
    para('Sazetak', { style: 'Heading1' }) +
    para('Ovaj sazetak je bezlicna ispuna koja postoji samo da dokument ima ocekivanu strukturu.', { jc: 'both' }) +
    para('1. Uvod', { style: 'Heading1' }) +
    paraWithFootnote('Uvodni odlomak nosi jednu fusnotu radi provjere obrade fusnota.', 1) +
    para('2. Razrada', { style: 'Heading1' }) +
    para('2.1. Metoda', { style: 'Heading2' }) +
    paraWithFootnote('Drugi odlomak nosi drugu fusnotu i dolazi prije tablice.', 2) +
    table() +
    para('2.2. Rezultati', { style: 'Heading2' }) +
    drawing('rId7') +
    para('3. Zakljucak', { style: 'Heading1' }) +
    para('Zavrsni odlomak bez posebnosti.', { jc: 'both' }) +
    para('Literatura', { style: 'Heading1' }) +
    para('Prezime, I. (2020). Naslov djela. Zagreb: Nakladnik.') +
    para('Drugo, A. (2021). Drugi naslov. Split: Drugi nakladnik.');

  // Prilog je zasebna, POLOZENA sekcija (paper-size/margins fixeri moraju je postovati).
  const attachmentBreak = `<w:p><w:pPr><w:sectPr>${A4_PORTRAIT}<w:pgNumType w:fmt="decimal" w:start="1"/><w:footerReference w:type="default" r:id="rId6"/><w:headerReference w:type="default" r:id="rId5"/></w:sectPr></w:pPr></w:p>`;
  const attachment = para('Prilog A. Prosirena tablica', { style: 'Heading1' }) + table();

  return `${XML_DECL}<w:document ${DOC_NS}><w:body>${titlePage}${titleSection}${body}${attachmentBreak}${attachment}<w:sectPr>${A4_LANDSCAPE}</w:sectPr></w:body></w:document>`;
}

const FULL_STYLES = `${XML_DECL}<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:b/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:b/><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/></w:style><w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="Footnote Text"/><w:pPr><w:spacing w:before="120" w:after="120" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style></w:styles>`;

const FULL_NUMBERING = `${XML_DECL}<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2."/><w:lvlJc w:val="left"/></w:lvl><w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2.%3."/><w:lvlJc w:val="left"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

const FULL_FOOTNOTES = `${XML_DECL}<w:footnotes xmlns:w="${W}"><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote><w:footnote w:id="1"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> Prezime, I., Naslov djela, Zagreb, 2020., str. 15.</w:t></w:r></w:p></w:footnote><w:footnote w:id="2"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> Ibid., str. 22.</w:t></w:r></w:p></w:footnote></w:footnotes>`;

/** Podnozje s PAGE poljem: bez njega page-number-alignment-fixer nema sto poravnati. */
const FULL_FOOTER = `${XML_DECL}<w:ftr xmlns:w="${W}"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;

const FULL_HEADER = `${XML_DECL}<w:hdr xmlns:w="${W}"><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>Diplomski rad</w:t></w:r></w:p></w:hdr>`;

const FULL_SETTINGS = `${XML_DECL}<w:settings xmlns:w="${W}"><w:zoom w:percent="100"/><w:defaultTabStop w:val="708"/><w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

const FULL_CORE = `${XML_DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Stari naslov iz predloska</dc:title><dc:creator>Ime Prezime</dc:creator><cp:lastModifiedBy>Ime Prezime</cp:lastModifiedBy><cp:revision>3</cp:revision></cp:coreProperties>`;

const FULL_APP = `${XML_DECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Office Word</Application><Pages>12</Pages><Words>2400</Words><Characters>13600</Characters><Company/><AppVersion>16.0000</AppVersion></Properties>`;

const FULL_FONT_TABLE = `${XML_DECL}<w:fonts xmlns:w="${W}"><w:font w:name="Calibri"><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font><w:font w:name="Times New Roman"><w:family w:val="roman"/><w:pitch w:val="variable"/></w:font><w:font w:name="Cambria"><w:family w:val="roman"/><w:pitch w:val="variable"/></w:font></w:fonts>`;

const FULL_CONTENT_TYPES = `${XML_DECL}<Types ${CT_NS}><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;

const FULL_PACKAGE_RELS = `${XML_DECL}<Relationships ${REL_NS}><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${R}/extended-properties" Target="docProps/app.xml"/></Relationships>`;

const FULL_DOCUMENT_RELS = `${XML_DECL}<Relationships ${REL_NS}><Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${R}/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="${R}/footnotes" Target="footnotes.xml"/><Relationship Id="rId4" Type="${R}/settings" Target="settings.xml"/><Relationship Id="rId5" Type="${R}/header" Target="header1.xml"/><Relationship Id="rId6" Type="${R}/footer" Target="footer1.xml"/><Relationship Id="rId7" Type="${R}/image" Target="media/image1.png"/><Relationship Id="rId8" Type="${R}/fontTable" Target="fontTable.xml"/></Relationships>`;

// === FPZG: bibliografija, citati i obvezni dijelovi (B2) ===

/**
 * Zasto bas FPZG: izmjereno je da od 368 profila u data/profiles/repair-map.json samo 11 (svi FPZG)
 * nosi asistirana pravila bibliography-rules, citation-sync-rules, section-surgery-rules i
 * required-section-rules, sva cetiri sa statusom "verified" i punom provenijencijom. Bez profila
 * koji ta pravila ima, pripadni fixeri ne aktiviraju ni na najbogatijem dokumentu, jer builderi u
 * src/ui/repair-items.ts citaju profile.ruleEntries kao gate.
 *
 * Dokument je namjerno neispravan bas u tim dimenzijama, i to na nacin na koji studentski rad
 * stvarno grijesi, ne umjetno.
 */
function fpzgBibliographyDocumentXml(): string {
  const titlePage =
    para('SVEUCILISTE U ZAGREBU', { jc: 'center' }) +
    para('FAKULTET POLITICKIH ZNANOSTI', { jc: 'center' }) +
    para('Diplomski studij novinarstva', { jc: 'center' }) +
    para('Ime Prezime', { jc: 'center' }) +
    para('NASLOV DIPLOMSKOGA RADA', { jc: 'center' }) +
    para('DIPLOMSKI RAD', { jc: 'center' }) +
    para('Mentor: doc. dr. sc. Ime Mentora', { jc: 'center' }) +
    para('Zagreb, 2026.', { jc: 'center' }) +
    // Prijelom stranice je uvjet da firstPageParagraphs naslovnicu oznaci kao pouzdano
    // prepoznatu (src/audits/structure.ts); bez njega title-page-fixer nema plan, ma koliko
    // naslovnica bila uredna. Pravi Word dokument ga ovdje uvijek ima.
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

  // Prednji dio ima sazetak ali NEMA kljucne rijeci. Izmjereno: analyzeRequiredSectionsStructure
  // od profilnog popisa stvarno provjerava samo "abstract" i "keywords-en", pa je izostanak
  // kljucnih rijeci jedini nacin da required-section-fixer dobije cilj na ovom profilu. To je i
  // realan propust studentskog rada. Fixer umece SAMO naslov i oznaku za unos, nikad sadrzaj
  // (tvrdo pravilo iz CLAUDE.md).
  const front =
    para('Sazetak', { style: 'Heading1' }) +
    para('Sazetak je bezlicna ispuna koja postoji da dokument ima ocekivan prednji dio.', { jc: 'both' });

  // In-text citati u obliku autor-godina (citation-sync-rules ima mode "author-year").
  // Namjerno: Sokol 2019 je citiran a NEMA ga u literaturi; Baric 2018 je u literaturi a NIJE citiran.
  const body =
    para('1. Uvod', { style: 'Heading1' }) +
    para('Uvodni odlomak upucuje na raniji rad (Antic, 2021) i na drugi izvor (Vukovic, 2020).', { jc: 'both' }) +
    para('2. Razrada', { style: 'Heading1' }) +
    para('Razrada se oslanja na isti izvor (Antic, 2021) i na jedan koji u popisu ne postoji (Sokol, 2019).', { jc: 'both' }) +
    para('3. Zakljucak', { style: 'Heading1' }) +
    para('Zakljucni odlomak bez novih izvora.', { jc: 'both' });

  // Literatura je namjerno pokvarena na cetiri nacina odjednom:
  //   1. nije abecedno slozena (Vukovic prije Antica prije Barica),
  //   2. dva zapisa istog autora i godine bez a/b sufiksa (authorYearSuffixes: true),
  //   3. jedan zapis je tocan duplikat prethodnog,
  //   4. jedan zapis nosi DOI (hyperlink grana u buildParams).
  const references =
    para('Literatura', { style: 'Heading1' }) +
    para('Vukovic, M. (2020). Mediji i javna sfera. Zagreb: Naklada Prvi.') +
    para('Antic, I. (2021). Digitalno novinarstvo. Zagreb: Naklada Drugi.') +
    para('Antic, I. (2021). Mrezni mediji i publika. Split: Naklada Treci.') +
    para('Baric, K. (2018). Metodologija drustvenih istrazivanja. Rijeka: Naklada Cetvrti. doi:10.1234/abcd.2018') +
    para('Vukovic, M. (2020). Mediji i javna sfera. Zagreb: Naklada Prvi.');

  // JEDNA sekcija s arapskom numeracijom od pocetka, dakle i na naslovnici. section-surgery-rules
  // trazi rimsku numeraciju u prednjem dijelu i uklonjen broj s naslovnice, pa fixer ima cilj.
  const sectPr = `<w:sectPr><w:pgNumType w:fmt="decimal" w:start="1"/>${A4_PORTRAIT}<w:footerReference w:type="default" r:id="rId6"/></w:sectPr>`;

  return `${XML_DECL}<w:document ${DOC_NS}><w:body>${titlePage}${front}${body}${references}${sectPr}</w:body></w:document>`;
}

const FPZG_CONTENT_TYPES = `${XML_DECL}<Types ${CT_NS}><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

const FPZG_PACKAGE_RELS = `${XML_DECL}<Relationships ${REL_NS}><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;

const FPZG_DOCUMENT_RELS = `${XML_DECL}<Relationships ${REL_NS}><Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rId4" Type="${R}/settings" Target="settings.xml"/><Relationship Id="rId6" Type="${R}/footer" Target="footer1.xml"/></Relationships>`;

const FPZG_STYLES = `${XML_DECL}<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:b/><w:sz w:val="26"/></w:rPr></w:style></w:styles>`;

const FPZG_CORE = `${XML_DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Radni naslov iz predloska</dc:title><dc:creator>Ime Prezime</dc:creator></cp:coreProperties>`;

/**
 * fpzg-novinarstvo-diplomski: popis literature pokvaren na cetiri nacina (redoslijed, isti
 * autor i godina bez sufiksa, tocan duplikat, DOI zapis), in-text citati autor-godina od kojih
 * jedan nema zapis a jedan zapis nije citiran, nedostajuca "Izjava o autorstvu" i jedna sekcija
 * s arapskom numeracijom vec od naslovnice.
 */
export function fpzgBibliographyDocx(): Promise<Uint8Array> {
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: enc.encode(FPZG_CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc.encode(FPZG_PACKAGE_RELS) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(FPZG_DOCUMENT_RELS) },
    { name: 'word/document.xml', data: enc.encode(fpzgBibliographyDocumentXml()) },
    { name: 'word/styles.xml', data: enc.encode(FPZG_STYLES) },
    { name: 'word/settings.xml', data: enc.encode(FULL_SETTINGS) },
    { name: 'word/footer1.xml', data: enc.encode(FULL_FOOTER) },
    { name: 'docProps/core.xml', data: enc.encode(FPZG_CORE) },
  ];
  return writeZip(entries);
}

/**
 * fer-diplomski-puna-struktura: naslovnica kao vlastita sekcija (rimska numeracija, titlePg),
 * SDT TOC, viserazinsko numeriranje, Heading1/2/3, tablica 3x4 s natpisom, stvaran PNG u punom
 * wp:inline crtezu, dvije fusnote, zaglavlje i podnozje s PAGE poljem, settings, docProps
 * core + app, fontTable i polozen prilog kao zavrsna sekcija. 14 zip dijelova.
 */
export function fullStructureDocx(): Promise<Uint8Array> {
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: enc.encode(FULL_CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc.encode(FULL_PACKAGE_RELS) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(FULL_DOCUMENT_RELS) },
    { name: 'word/document.xml', data: enc.encode(fullStructureDocumentXml()) },
    { name: 'word/styles.xml', data: enc.encode(FULL_STYLES) },
    { name: 'word/numbering.xml', data: enc.encode(FULL_NUMBERING) },
    { name: 'word/footnotes.xml', data: enc.encode(FULL_FOOTNOTES) },
    { name: 'word/settings.xml', data: enc.encode(FULL_SETTINGS) },
    { name: 'word/fontTable.xml', data: enc.encode(FULL_FONT_TABLE) },
    { name: 'word/header1.xml', data: enc.encode(FULL_HEADER) },
    { name: 'word/footer1.xml', data: enc.encode(FULL_FOOTER) },
    { name: 'word/media/image1.png', data: pngBytes() },
    { name: 'docProps/core.xml', data: enc.encode(FULL_CORE) },
    { name: 'docProps/app.xml', data: enc.encode(FULL_APP) },
  ];
  return writeZip(entries);
}
