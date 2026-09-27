/**
 * T64: `details.inspectionCoverage`. Izravni signal novog mehanizma (popis nad DOM-om i
 * agregacija), neovisno o goldenu. Generator ulaza je doslovni OOXML, pa je vidljivo da test
 * stvarno sadrzi ciljanu klasu (Zotero polje, Mendeley SDT, okvir s Choice i Fallback granom...).
 *
 * Krug 2: svaki preskoceni dio nosi doseg (`scope`). Test "bodovane provjere citaju odlomke koje
 * tipografska provjera preskace" dokazuje da tvrdnja "nije provjereno" ne smije vrijediti za
 * cijelu analizu, a unakrsna provjera s `analyzeTypographyStructure` dokazuje da popis broji
 * tocno ono sto ta provjera preskace.
 */
import { describe, it, expect } from 'vitest';
import { parseXml } from '../src/docx/parser';
import {
  censusInspectionContainers,
  computeInspectionCoverage,
  statusFor,
  MANUAL_REVIEW_MIN_SKIPPED_PARAGRAPHS,
  MANUAL_REVIEW_SKIPPED_RATIO,
  PARAGRAPH_KIND_PRIORITY,
  TYPOGRAPHY_CHECK_ID,
  type InspectionCensus,
  type InspectionCoverage,
  type ParagraphSkipKind,
} from '../src/analysis/inspection-coverage';
import { analyzeTypographyStructure, extractBodyParagraphs } from '../src/analysis/typography-structure';
import { CHECK_ID_BY_TITLE } from '../src/scoring/check-id-registry';
import { sanitizeAnalysisResult } from '../src/report/report';
import { normalizeResult } from './helpers/golden-normalize';
import { buildDocxFile } from './helpers/docx-builder';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';
import { inspectionCoverageText } from '../src/ui/results/inspection-coverage-line';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
  + 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" '
  + 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
  + 'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" '
  + 'xmlns:v="urn:schemas-microsoft-com:vml" '
  + 'xmlns:o="urn:schemas-microsoft-com:office:office"';

/** Jedinstven niz koji se NIKAD ne smije pojaviti u izlazu (tekst rada ne izlazi iz modula). */
const SECRET = 'TAJNI_TEKST_RADA_T64';

const p = (text = SECRET) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const xmlOf = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><w:document ${NS}><w:body>${body}<w:sectPr/></w:body></w:document>`;
const doc = (body: string) => parseXml(xmlOf(body));

/** Zotero citat kao slozeno polje u jednom odlomku. */
const ZOTERO_INLINE = `<w:p><w:r><w:t>Prema </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ADDIN ZOTERO_ITEM CSL_CITATION {"citationID":"x"} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>(Horvat, 2020)</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
/** Mendeley citat kao SDT. */
const MENDELEY_SDT = `<w:p><w:sdt><w:sdtPr><w:tag w:val="MENDELEY_CITATION_v3_abc"/></w:sdtPr><w:sdtContent><w:r><w:t>(Kovac, 2019)</w:t></w:r></w:sdtContent></w:sdt></w:p>`;
/** Tekstni okvir: Choice (wps) i Fallback (VML) nose ISTI sadrzaj; broji se samo jednom. */
const TEXTBOX = `<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wps:txbx><w:txbxContent>${p()}${p()}</w:txbxContent></wps:txbx></w:drawing></mc:Choice><mc:Fallback><w:pict><v:textbox><w:txbxContent>${p()}${p()}</w:txbxContent></v:textbox></w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p>`;

function fullDetails(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    typographyStructure: { skipped: [] },
    consistencyStructure: { skipped: [] },
    requiredSectionsStructure: { skipped: [] },
    linkDoiStructure: { skipped: [] },
    tableFigureRescue: { tables: [], figures: [] },
    legalFootnoteStructure: null,
    ...extra,
  };
}

function coverageFor(body: string, extra: Record<string, unknown> = {}, scoredCheckIds: string[] = []): InspectionCoverage {
  return computeInspectionCoverage({ details: fullDetails(extra), census: censusInspectionContainers(doc(body)), scoredCheckIds });
}

function countOf(coverage: InspectionCoverage, kind: string): number {
  return coverage.skippedParts.find((part) => part.kind === kind)?.count ?? 0;
}

function censusWith(total: number, kind: ParagraphSkipKind, n: number, embeddedObjects = 0): InspectionCensus {
  const byKind: Record<ParagraphSkipKind, number> = { citationField: 0, textBox: 0, nestedTable: 0, tableCell: 0, contentControl: 0, trackedChange: 0, equation: 0, fieldOrHyperlink: 0, otherStructure: 0 };
  byKind[kind] = n;
  return { totalParagraphs: total, byKind, embeddedObjects, typographyProtectedTopLevel: 0 };
}

const KNOWN_IDS = new Set(Object.values(CHECK_ID_BY_TITLE));

describe('T64 popis spremnika i agregacija', () => {
  it('cist dokument: fullyChecked, nula preskocenih, bez dijelova', () => {
    const coverage = coverageFor(p() + p() + p());
    expect(coverage).toEqual({ version: 1, status: 'fullyChecked', skippedParagraphs: 0, totalParagraphs: 3, skippedParts: [] });
  });

  it('Zotero polje, Mendeley SDT i tekstni okvir: tocni brojevi po vrsti, Fallback se ne broji dvaput', () => {
    const coverage = coverageFor(p() + ZOTERO_INLINE + MENDELEY_SDT + TEXTBOX + p());
    expect(countOf(coverage, 'citationField')).toBe(2);
    // Domacin okvira + 2 odlomka u Choice grani; 2 odlomka iz Fallback grane se ne broje.
    expect(countOf(coverage, 'textBox')).toBe(3);
    expect(coverage.skippedParagraphs).toBe(5);
    // Nazivnik je populacija parsera (bodyParagraphs), koja takodjer preskace Fallback.
    expect(coverage.totalParagraphs).toBe(7);
    expect(coverage.status).toBe('partiallyChecked');
    expect(coverage.skippedParts.map((part) => part.kind)).toEqual(['citationField', 'textBox']);
    for (const part of coverage.skippedParts) {
      expect(part.scope).toBe('typographyCheck');
      expect(part.affectedCheckIds).toEqual([TYPOGRAPHY_CHECK_ID]);
    }
  });

  it('Zotero bibliografija preko vise odlomaka: srednji odlomak bez oznake polja tipografska provjera cita', () => {
    const body = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> ADDIN ZOTERO_BIBL {"uncited":[]} CSL_BIBLIOGRAPHY </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Horvat, A. (2020).</w:t></w:r></w:p>`
      + p('Kovac, B. (2019).')
      + `<w:p><w:r><w:t>Novak, C. (2018).</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`
      + p();
    const coverage = coverageFor(body);
    // Prvi (begin + instrText) i zadnji (end) odlomak nose oznaku polja; srednji nema nijednu.
    expect(countOf(coverage, 'citationField')).toBe(2);
    expect(coverage.skippedParagraphs).toBe(2);
    expect(analyzeTypographyStructure(xmlOf(body)).skipped).toHaveLength(2);
  });

  it('EndNote, Citavi i Word CITATION polja su citatna; obicni SEQ je polje', () => {
    const field = (instr: string) => `<w:p><w:fldSimple w:instr="${instr}"><w:r><w:t>x</w:t></w:r></w:fldSimple></w:p>`;
    const coverage = coverageFor(field(' ADDIN EN.CITE ') + field(' ADDIN CITAVI.PLACEHOLDER ') + field(' CITATION Hor20 \\l 1050 ') + field(' SEQ Tablica \\* ARABIC '));
    expect(countOf(coverage, 'citationField')).toBe(3);
    expect(countOf(coverage, 'fieldOrHyperlink')).toBe(1);
  });

  it('automatski sadrzaj (TOC polje i TOC SDT) se ne prijavljuje, obicna poveznica se prijavljuje', () => {
    const tocField = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> TOC \\o "1-3" \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:hyperlink w:anchor="_Toc1"><w:r><w:t>Uvod</w:t></w:r></w:hyperlink></w:p>`
      + `<w:p><w:hyperlink w:anchor="_Toc2"><w:r><w:t>Zakljucak</w:t></w:r></w:hyperlink><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
    const tocSdt = `<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/></w:docPartObj></w:sdtPr><w:sdtContent><w:p><w:hyperlink w:anchor="_Toc3"><w:r><w:t>Metode</w:t></w:r></w:hyperlink></w:p></w:sdtContent></w:sdt>`;
    const link = `<w:p><w:hyperlink><w:r><w:t>https://example.hr</w:t></w:r></w:hyperlink></w:p>`;
    const coverage = coverageFor(tocField + tocSdt + link + p());
    expect(coverage.skippedParagraphs).toBe(1);
    expect(countOf(coverage, 'fieldOrHyperlink')).toBe(1);
    expect(countOf(coverage, 'contentControl')).toBe(0);
  });

  it('tablica, ugnijezdena tablica, formula, revizija, customXml i SDT; objekt je zaseban dio bez odlomaka', () => {
    const cell = (inner: string) => `<w:tc>${inner}</w:tc>`;
    const table = `<w:tbl><w:tr>${cell(p())}${cell(`<w:tbl><w:tr>${cell(p() + p())}</w:tr></w:tbl>${p()}`)}</w:tr></w:tbl>`;
    const math = `<w:p><m:oMathPara><m:oMath><m:r><m:t>E</m:t></m:r></m:oMath></m:oMathPara></w:p>`;
    const ins = `<w:p><w:ins w:id="1" w:author="a"><w:r><w:t>novo</w:t></w:r></w:ins></w:p>`;
    const del = `<w:p><w:del w:id="2" w:author="a"><w:r><w:delText>staro</w:delText></w:r></w:del></w:p>`;
    const object = `<w:p><w:r><w:t>Slika </w:t></w:r><w:r><w:object><v:shape/></w:object></w:r></w:p>`;
    const customXml = `<w:customXml w:element="x">${p()}</w:customXml>`;
    const sdt = `<w:sdt><w:sdtPr><w:alias w:val="Naslov"/></w:sdtPr><w:sdtContent>${p()}</w:sdtContent></w:sdt>`;
    const coverage = coverageFor(table + math + ins + del + object + customXml + sdt + p());
    expect(countOf(coverage, 'tableCell')).toBe(2);
    expect(countOf(coverage, 'nestedTable')).toBe(2);
    expect(countOf(coverage, 'equation')).toBe(1);
    expect(countOf(coverage, 'trackedChange')).toBe(2);
    expect(countOf(coverage, 'contentControl')).toBe(2);
    // Odlomak s objektom tipografska provjera cita; nitko ne cita sadrzaj samog OLE objekta.
    expect(countOf(coverage, 'embeddedObject')).toBe(1);
    const object1 = coverage.skippedParts.find((part) => part.kind === 'embeddedObject');
    expect(object1?.scope).toBe('noCheck');
    expect(object1?.affectedCheckIds).toEqual([]);
    expect(coverage.skippedParagraphs).toBe(9);
    expect(coverage.totalParagraphs).toBe(11);
  });

  it('pregled Astre: DrawingML a:p i a:tbl u crtezu nisu odlomci ni tablice tijela', () => {
    const drawing = `<w:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:r><w:t>Slika</w:t></w:r><w:r><w:drawing><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>x</a:t></a:r></a:p><a:p/></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></w:drawing></w:r></w:p>`;
    const census = censusInspectionContainers(doc(drawing + p()));
    // Parser (`bodyParagraphs`) vidi 2 odlomka; tipografska provjera cita oba (crtez nije zasticen).
    expect(census.totalParagraphs).toBe(2);
    expect(Object.values(census.byKind).reduce((s, n) => s + n, 0)).toBe(0);
    expect(analyzeTypographyStructure(xmlOf(drawing + p())).skipped).toHaveLength(0);
  });

  it('pregled Astre: odlomak s autorskim tekstom uz TOC polje se prijavljuje, cisti sadrzaj ne', () => {
    const tocWithProse = `<w:p><w:r><w:t>Autorska recenica prije sadrzaja. </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> TOC \o "1-3" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Uvod</w:t></w:r></w:p>`
      + `<w:p><w:r><w:t>Zakljucak</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t> Autorski tekst iza polja.</w:t></w:r></w:p>`
      + `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> TOC </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Metode</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
    const coverage = coverageFor(tocWithProse);
    expect(countOf(coverage, 'fieldOrHyperlink')).toBe(2);
    expect(coverage.skippedParagraphs).toBe(2);
    expect(analyzeTypographyStructure(xmlOf(tocWithProse)).skipped).toHaveLength(3);
  });

  it('pregled Astre 2: formula iza TOC polja je autorski sadrzaj; obican SDT unutar TOC SDT-a nije', () => {
    const tocThenMath = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> TOC </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Uvod</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><m:oMath><m:r><m:t>x=1</m:t></m:r></m:oMath></w:p>`;
    const nestedInTocSdt = `<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/></w:docPartObj></w:sdtPr><w:sdtContent><w:p><w:sdt><w:sdtPr><w:alias w:val="x"/></w:sdtPr><w:sdtContent><w:r><w:t>Metode</w:t></w:r></w:sdtContent></w:sdt></w:p></w:sdtContent></w:sdt>`;
    const math = coverageFor(tocThenMath);
    expect(countOf(math, 'equation')).toBe(1);
    expect(math.skippedParagraphs).toBe(1);
    expect(coverageFor(nestedInTocSdt).skippedParagraphs).toBe(0);
  });

  it('pregled Astre 4: TOC uputa u odlomku iza begin oznake oznaci i odlomak s begin oznakom', () => {
    const split = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r></w:p>`
      + `<w:p><w:r><w:instrText> TOC </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Uvod</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
    expect(coverageFor(split).skippedParagraphs).toBe(0);
    expect(coverageFor(split).status).toBe('fullyChecked');
  });

  it('pregled Astre 3: obrisan autorski tekst iza TOC polja se prijavljuje', () => {
    const tocThenDel = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> TOC </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Uvod</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:del w:id="9" w:author="a"><w:r><w:delText>Autorski tekst</w:delText></w:r></w:del></w:p>`;
    const coverage = coverageFor(tocThenDel);
    expect(countOf(coverage, 'trackedChange')).toBe(1);
    expect(analyzeTypographyStructure(xmlOf(tocThenDel)).skipped).toHaveLength(1);
  });

  it('pregled Astre: zasticena oznaka u XML komentaru ili CDATA-i zrcali regex tipografske provjere', () => {
    for (const body of ['<w:p><!-- <w:hyperlink> --><w:r><w:t>1.5</w:t></w:r></w:p>', '<w:p><w:r><w:t><![CDATA[<w:sdt>]]></w:t></w:r></w:p>', '<w:p><?audit <w:hyperlink> ?><w:r><w:t>1.5</w:t></w:r></w:p>']) {
      const xml = xmlOf(body);
      const census = censusInspectionContainers(parseXml(xml));
      expect(census.typographyProtectedTopLevel).toBe(analyzeTypographyStructure(xml).skipped.length);
      expect(census.typographyProtectedTopLevel).toBe(1);
      expect(Object.values(census.byKind).reduce((s, n) => s + n, 0)).toBe(1);
    }
  });

  it('objekt u potisnutoj Fallback grani se ne broji', () => {
    const alt = `<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:object><v:shape/></w:object></mc:Choice><mc:Fallback><w:object><v:shape/></w:object></mc:Fallback></mc:AlternateContent></w:r></w:p>`;
    expect(censusInspectionContainers(doc(alt)).embeddedObjects).toBe(1);
  });

  it('preklapanja se broje jednom: SDT i revizija unutar okvira, revizija u celiji', () => {
    const overlapBox = `<w:p><w:r><w:drawing><wps:txbx><w:txbxContent>${MENDELEY_SDT}<w:p><w:ins w:id="3" w:author="a"><w:r><w:t>x</w:t></w:r></w:ins></w:p></w:txbxContent></wps:txbx></w:drawing></w:r></w:p>`;
    const overlapCell = `<w:tbl><w:tr><w:tc><w:p><w:del w:id="4" w:author="a"><w:r><w:delText>y</w:delText></w:r></w:del></w:p></w:tc></w:tr></w:tbl>`;
    const coverage = coverageFor(overlapBox + overlapCell);
    const sum = coverage.skippedParts.filter((part) => (PARAGRAPH_KIND_PRIORITY as readonly string[]).includes(part.kind)).reduce((s, part) => s + part.count, 0);
    expect(sum).toBe(coverage.skippedParagraphs);
    expect(coverage.skippedParagraphs).toBe(coverage.totalParagraphs);
    expect(coverage.totalParagraphs).toBe(4);
    // Mendeley SDT u okviru ima prednost kao citatno polje; domacin i revizija u okviru su okvir.
    expect(countOf(coverage, 'citationField')).toBe(1);
    expect(countOf(coverage, 'textBox')).toBe(2);
    expect(countOf(coverage, 'tableCell')).toBe(1);
    expect(countOf(coverage, 'trackedChange')).toBe(0);
  });

  it('pravne fusnote niske pouzdanosti i slozene tablice: doseg su samo prijedlozi popravka', () => {
    const coverage = coverageFor(p(), {
      legalFootnoteStructure: { skipped: [{ footnoteId: 3, reason: 'x' }, { footnoteId: 3, reason: 'x' }, { footnoteId: 7, reason: 'x' }] },
      tableFigureRescue: { tables: [{ unsupported: true, nested: true }, { unsupported: false, nested: false }, { unsupported: true, nested: false }], figures: [] },
    });
    expect(countOf(coverage, 'legalFootnote')).toBe(2);
    expect(countOf(coverage, 'complexTable')).toBe(2);
    for (const part of coverage.skippedParts) {
      expect(part.scope).toBe('repairSuggestions');
      expect(part.affectedCheckIds).toEqual([]);
    }
    // Nisu odlomci: ne ulaze u skippedParagraphs.
    expect(coverage.skippedParagraphs).toBe(0);
    expect(coverage.status).toBe('partiallyChecked');
  });

  it('affectedCheckIds su podskup stabilnih ID-eva iz check-id-registry, nikad naslovi', () => {
    const coverage = coverageFor(ZOTERO_INLINE + TEXTBOX + `<w:tbl><w:tr><w:tc>${p()}</w:tc></w:tr></w:tbl>`, {
      legalFootnoteStructure: { skipped: [{ footnoteId: 1, reason: 'x' }] },
      tableFigureRescue: { tables: [{ unsupported: true }], figures: [] },
    });
    const ids = coverage.skippedParts.flatMap((part) => part.affectedCheckIds);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(KNOWN_IDS.has(id), id).toBe(true);
    const titles = new Set(Object.keys(CHECK_ID_BY_TITLE));
    for (const id of ids) expect(titles.has(id)).toBe(false);
  });

  it('izlaz nosi samo brojeve i vrste: tekst rada se ne pojavljuje', () => {
    const coverage = coverageFor(p() + ZOTERO_INLINE + MENDELEY_SDT + TEXTBOX);
    expect(JSON.stringify(coverage)).not.toContain(SECRET);
    expect(JSON.stringify(coverage)).not.toContain('Horvat');
    expect(Object.keys(coverage).sort()).toEqual(['skippedParagraphs', 'skippedParts', 'status', 'totalParagraphs', 'version']);
    for (const part of coverage.skippedParts) expect(Object.keys(part).sort()).toEqual(['affectedCheckIds', 'count', 'kind', 'reason', 'scope']);
  });

  it('razlozi imenuju provjeru na koju se odnose i nemaju em ni en crtice', () => {
    const coverage = coverageFor(ZOTERO_INLINE + TEXTBOX, { legalFootnoteStructure: { skipped: [{ footnoteId: 1 }] }, tableFigureRescue: { tables: [{ unsupported: true }] } });
    for (const part of coverage.skippedParts) {
      expect(part.reason).not.toMatch(new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']'));
      if (part.scope === 'typographyCheck') expect(part.reason).toMatch(/^provjera tehničko-tipografske dosljednosti ne čita/);
      if (part.scope === 'repairSuggestions') expect(part.reason).toMatch(/^prijedlozi popravka ne obuhvaćaju/);
      // Nijedan razlog ne tvrdi da dio "nije analiziran" bez navodjenja tko ga nije procitao.
      expect(part.reason).not.toMatch(/nisu analizirani/);
    }
  });

  it('idempotencija: drugi prolaz nad istim ulazom (i nad details koji vec nosi polje) je no-op', () => {
    const census = censusInspectionContainers(doc(p() + ZOTERO_INLINE + TEXTBOX));
    const details = fullDetails();
    const first = computeInspectionCoverage({ details, census });
    details.inspectionCoverage = first;
    const second = computeInspectionCoverage({ details, census });
    expect(second).toEqual(first);
    expect(censusInspectionContainers(doc(p() + ZOTERO_INLINE + TEXTBOX))).toEqual(census);
  });
});

describe('T64 popis zrcali pravilo tipografske provjere', () => {
  const bodies: Record<string, string> = {
    cist: p() + p() + '<w:p/>',
    zoteroOkvirSdt: p() + ZOTERO_INLINE + MENDELEY_SDT + TEXTBOX + p(),
    tablicaRevizijaFormula: `<w:tbl><w:tr><w:tc>${p()}</w:tc></w:tr></w:tbl>`
      + `<w:p><w:ins w:id="1" w:author="a"><w:r><w:t>x</w:t></w:r></w:ins></w:p>`
      + `<w:p><m:oMath><m:r><m:t>E</m:t></m:r></m:oMath></w:p>`
      + `<w:p><w:hyperlink><w:r><w:t>https://example.hr</w:t></w:r></w:hyperlink></w:p>`
      + `<w:p><w:r><w:object><v:shape/></w:object></w:r></w:p>` + p(),
    blokSdtICustomXml: `<w:sdt><w:sdtContent>${p()}${p()}</w:sdtContent></w:sdt><w:customXml w:element="x">${p()}</w:customXml>` + p(),
  };

  for (const [name, body] of Object.entries(bodies)) {
    it(`${name}: zasticeni izravni odlomci == typographyStructure.skipped, a procitani == extractBodyParagraphs bez njih`, () => {
      const xml = xmlOf(body);
      const census = censusInspectionContainers(parseXml(xml));
      const typography = analyzeTypographyStructure(xml);
      expect(census.typographyProtectedTopLevel).toBe(typography.skipped.length);
      // Sve sto tipografska provjera NE cita (i nije sadrzaj) mora biti prijavljeno.
      const reported = Object.values(census.byKind).reduce((s, n) => s + n, 0);
      const selfClosing = (body.match(/<w:p\/>/g) ?? []).length;
      const readByTypography = extractBodyParagraphs(xml).length - typography.skipped.length + selfClosing;
      expect(reported + readByTypography).toBe(census.totalParagraphs);
    });
  }
});

describe('T64 degradirani ulaz: nepoznato nije zeleno', () => {
  it('ne baca na praznom ulazu i nikad nije fullyChecked', () => {
    for (const details of [null, undefined, {}]) {
      const coverage = computeInspectionCoverage({ details, census: null });
      expect(coverage.status).toBe('partiallyChecked');
      expect(countOf(coverage, 'analysisUnavailable')).toBeGreaterThan(0);
      expect(coverage.skippedParts.find((part) => part.kind === 'analysisUnavailable')?.scope).toBe('unknown');
    }
  });

  it('kad je tipografska provjera bodovana, a popis nedostaje, doseg je nepoznat: rucna provjera', () => {
    const coverage = computeInspectionCoverage({ details: fullDetails(), census: null, scoredCheckIds: [TYPOGRAPHY_CHECK_ID] });
    expect(coverage.status).toBe('manualReviewRequired');
  });

  it('catch grana omotaca: prazni fallbackovi nisu "nista preskoceno"', () => {
    const census = censusInspectionContainers(doc(p()));
    const coverage = computeInspectionCoverage({ details: fullDetails(), census, unavailableSources: ['requiredSectionsStructure', 'linkDoiStructure'] });
    expect(coverage.status).toBe('partiallyChecked');
    expect(countOf(coverage, 'analysisUnavailable')).toBe(2);
    // Ti izvori hrane prijedloge popravka, ne tipografsku provjeru: bez check.id.
    expect(coverage.skippedParts.find((part) => part.kind === 'analysisUnavailable')?.affectedCheckIds).toEqual([]);
  });

  it('izvor bez skipped niza je nepoznat', () => {
    const census = censusInspectionContainers(doc(p()));
    const coverage = computeInspectionCoverage({ details: fullDetails({ typographyStructure: { occurrences: [] } }), census });
    expect(coverage.status).toBe('partiallyChecked');
    const part = coverage.skippedParts.find((x) => x.kind === 'analysisUnavailable');
    expect(part?.affectedCheckIds).toEqual([TYPOGRAPHY_CHECK_ID]);
  });
});

describe('T64 prag za rucnu provjeru', () => {
  const at = (typographySkipped: number, totalParagraphs: number, typographyScored = true) => statusFor({ parts: 1, typographyScored, typographyUnknown: false, typographySkipped, totalParagraphs });

  it('konstante su one koje dokumentacija navodi', () => {
    expect(MANUAL_REVIEW_SKIPPED_RATIO).toBe(0.25);
    expect(MANUAL_REVIEW_MIN_SKIPPED_PARAGRAPHS).toBe(20);
  });

  it('bodovana tipografska provjera: tocno na pragu, jedan ispod i jedan iznad', () => {
    expect(at(20, 80)).toBe('manualReviewRequired'); // udio tocno 0,25 i tocno 20
    expect(at(21, 80)).toBe('manualReviewRequired'); // iznad
    expect(at(20, 81)).toBe('partiallyChecked'); // udio tik ispod 0,25
    expect(at(19, 76)).toBe('partiallyChecked'); // udio 0,25 ali ispod apsolutnog praga
    expect(at(19, 19)).toBe('partiallyChecked'); // kratak dokument, sve preskoceno, ispod 20
  });

  it('informativna tipografska provjera nikad ne trazi rucnu provjeru, ni kad je sve preskoceno', () => {
    expect(at(20, 80, false)).toBe('partiallyChecked');
    expect(at(500, 500, false)).toBe('partiallyChecked');
  });

  it('nalazi pregleda: 30 od 90 Zotero odlomaka i 25 od 85 poveznica ne daju rucnu provjeru dok je provjera informativna', () => {
    const zotero = computeInspectionCoverage({ details: fullDetails(), census: censusWith(90, 'citationField', 30) });
    const links = computeInspectionCoverage({ details: fullDetails(), census: censusWith(85, 'fieldOrHyperlink', 25) });
    expect(zotero.status).toBe('partiallyChecked');
    expect(links.status).toBe('partiallyChecked');
    for (const coverage of [zotero, links]) {
      const text = inspectionCoverageText(coverage) ?? '';
      expect(text).not.toContain('Potrebna je ručna provjera');
      expect(text).toMatch(/^Provjera tehničko-tipografske dosljednosti nije obuhvatila /);
      expect(text).toContain('provjere fonta, veličine, proreda i poravnanja pročitale su i te odlomke');
    }
    // Ista slika uz bodovanu tipografsku provjeru prelazi prag.
    expect(computeInspectionCoverage({ details: fullDetails(), census: censusWith(90, 'citationField', 30), scoredCheckIds: [TYPOGRAPHY_CHECK_ID] }).status).toBe('manualReviewRequired');
  });

  it('tablice se uz bodovanu provjeru broje kao ostalo; ugradjeni objekti ne ulaze u prag', () => {
    const scored = [TYPOGRAPHY_CHECK_ID];
    expect(computeInspectionCoverage({ details: fullDetails(), census: censusWith(60, 'tableCell', 50), scoredCheckIds: scored }).status).toBe('manualReviewRequired');
    expect(computeInspectionCoverage({ details: fullDetails(), census: censusWith(60, 'tableCell', 0, 40), scoredCheckIds: scored }).status).toBe('partiallyChecked');
  });
});

describe('T64 mrezni i golden ugovor (odluka: polje ostaje samo na klijentu)', () => {
  const coverage: InspectionCoverage = { version: 1, status: 'partiallyChecked', skippedParagraphs: 3, totalParagraphs: 10, skippedParts: [{ kind: 'textBox', count: 3, scope: 'typographyCheck', reason: 'x', affectedCheckIds: [TYPOGRAPHY_CHECK_ID] }] };
  const result = {
    score: 80, profile: 'P', profileStatus: 'verified', stats: {}, checks: [], issues: [],
    details: { profileFingerprint: 'fp', ruleAuthority: 'official', profileDefinitionId: 'id', sources: [], inspectionCoverage: coverage },
  };

  it('sanitizeAnalysisResult NE salje inspectionCoverage mrezom (whitelist ostaje 4 polja)', () => {
    const out = sanitizeAnalysisResult(result as never) as { details?: Record<string, unknown> };
    expect(Object.keys(out.details ?? {}).sort()).toEqual(['profileDefinitionId', 'profileFingerprint', 'ruleAuthority', 'sources']);
    expect(JSON.stringify(out)).not.toContain('inspectionCoverage');
  });

  it('golden normalizacija NE sadrzi inspectionCoverage, pa postojeci snapshoti ostaju bajt-identicni', () => {
    const normalized = normalizeResult(result) as Record<string, unknown>;
    expect(Object.keys(normalized).sort()).toEqual(['checks', 'issues', 'profile', 'profileFingerprint', 'profileStatus', 'score', 'stats']);
    expect(JSON.stringify(normalized)).not.toContain('inspectionCoverage');
  });
});

type PipelineResult = {
  checks: Array<{ id: string | null; detail: string; scored: boolean }>;
  details: { inspectionCoverage: InspectionCoverage };
};

const COMIC = '<w:rPr><w:rFonts w:ascii="Comic Sans MS" w:hAnsi="Comic Sans MS"/></w:rPr>';
const LONG = 'Ovo je dugi odlomak teksta koji sluzi tome da tezina fonta bude jasno veca od ostatka dokumenta.';
const comicP = (extra = '') => `<w:p>${extra}<w:r>${COMIC}<w:t>${LONG}</w:t></w:r></w:p>`;
/** Deklaracije prefiksa okvira na samom odlomku, jer graditelj deklarira samo `w:`. */
const withNs = (xml: string) => xml.replace('<w:p>', `<w:p ${NS.replace(/xmlns:w="[^"]*" /, '')}>`);

describe('T64 spoj u analyzeDocx', () => {
  const bodyWithBox = [
    { text: 'Uvod', styleId: 'Heading1' },
    { text: 'Obican odlomak tijela rada.' },
    { text: '', raw: withNs(TEXTBOX) },
    { text: '', raw: ZOTERO_INLINE },
  ];

  it('stvarni .docx kroz cijeli pipeline dobiva inspectionCoverage s okvirom i Zotero poljem', async () => {
    const file = buildDocxFile({ paragraphs: bodyWithBox } as never, 't64.docx');
    const result = (await analyzeFixture(file)) as PipelineResult;
    const coverage = result.details.inspectionCoverage;
    expect(countOf(coverage, 'textBox')).toBe(3);
    expect(countOf(coverage, 'citationField')).toBe(1);
    expect(coverage.status).toBe('partiallyChecked');
    expect(countOf(coverage, 'analysisUnavailable')).toBe(0);
  }, 60000);

  it('bodovane provjere citaju odlomke koje tipografska provjera preskace (tablica, okvir, Zotero)', async () => {
    // Font koji se pojavljuje SAMO u preskocenim odlomcima; ako ga provjera dominantnog fonta
    // prijavi, ona je te odlomke procitala. Kontrola: bez tih odlomaka prijavljuje drugi font.
    const table = `<w:tbl><w:tr><w:tc>${comicP()}${comicP()}</w:tc><w:tc>${comicP()}</w:tc></w:tr></w:tbl>`;
    const box = withNs(`<w:p><w:r><w:drawing><wps:txbx><w:txbxContent>${comicP()}${comicP()}</w:txbxContent></wps:txbx></w:drawing></w:r></w:p>`);
    const zotero = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> ADDIN ZOTERO_ITEM CSL_CITATION {} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r>${COMIC}<w:t>${LONG}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
    const base = [{ text: 'Uvod', styleId: 'Heading1' }, { text: 'Kratko.', font: 'Times New Roman' }];
    const withSkipped = (await analyzeFixture(buildDocxFile({ paragraphs: [...base, { text: '', raw: table }, { text: '', raw: box }, { text: '', raw: zotero }] } as never, 't64-font.docx'))) as PipelineResult;
    const control = (await analyzeFixture(buildDocxFile({ paragraphs: base } as never, 't64-font-kontrola.docx'))) as PipelineResult;
    const coverage = withSkipped.details.inspectionCoverage;
    expect(countOf(coverage, 'tableCell')).toBe(3);
    expect(countOf(coverage, 'textBox')).toBe(3);
    expect(countOf(coverage, 'citationField')).toBe(1);
    const font = (r: PipelineResult) => r.checks.find((check) => check.id === 'format.font.dominant')?.detail ?? '';
    expect(font(withSkipped)).toContain('Comic Sans MS');
    expect(font(control)).not.toContain('Comic Sans MS');
  }, 60000);

  it('bodovana tipografska provjera i velik neprocitan dio: status rucne provjere prolazi kroz omotac', async () => {
    const id = VERIFIED_PROFILE_REGISTRY[0].id;
    const base = resolveProfile(id) as { ruleEntries?: unknown[] };
    const scoredProfile = {
      ...base,
      ruleEntries: [...(base.ruleEntries ?? []), { checkId: 'croatian-typography-rules', status: 'verified', sourceId: 't64-test', sourcePage: 1, quote: 'test' }],
    };
    const cells = Array.from({ length: 24 }, () => `<w:tc><w:p><w:r><w:t>1.5</w:t></w:r></w:p></w:tc>`).join('');
    const paragraphs = [
      { text: 'Uvod', styleId: 'Heading1' },
      // Dvostruki razmak daje tipografski nalaz, pa provjera postaje bodovana (1 bod).
      ...Array.from({ length: 10 }, () => ({ text: 'Ovo  je odlomak.' })),
      { text: '', raw: `<w:tbl><w:tr>${cells}</w:tr></w:tbl>` },
    ];
    const file = () => buildDocxFile({ paragraphs } as never, 't64-bodovano.docx');
    const scored = (await analyzeFixture(file(), { profileId: id, profile: scoredProfile })) as PipelineResult;
    const advisory = (await analyzeFixture(file(), { profileId: id })) as PipelineResult;
    const typo = (r: PipelineResult) => r.checks.find((check) => check.id === TYPOGRAPHY_CHECK_ID);
    expect(typo(scored)?.scored).toBe(true);
    expect(typo(advisory)?.scored).toBe(false);
    expect(scored.details.inspectionCoverage.skippedParagraphs).toBe(24);
    expect(scored.details.inspectionCoverage.status).toBe('manualReviewRequired');
    expect(advisory.details.inspectionCoverage.status).toBe('partiallyChecked');
  }, 60000);

  it('kad omotac ne moze ponovno otvoriti paket, polje postoji i nije fullyChecked', async () => {
    const good = buildDocxFile({ paragraphs: [{ text: 'Uvod', styleId: 'Heading1' }, { text: 'Tekst.' }] } as never, 't64-catch.docx');
    const bytes = await good.arrayBuffer();
    let calls = 0;
    const flaky = {
      name: good.name, size: good.size, type: good.type,
      arrayBuffer: async () => { calls += 1; if (calls > 1) throw new Error('drugi dohvat pada'); return bytes; },
    } as unknown as File;
    const result = (await analyzeFixture(flaky)) as PipelineResult;
    expect(calls).toBe(2);
    const coverage = result.details.inspectionCoverage;
    expect(coverage.status).not.toBe('fullyChecked');
    expect(countOf(coverage, 'analysisUnavailable')).toBe(2);
  }, 60000);
});
