/**
 * T64: `details.inspectionCoverage`. Izravni signal novog mehanizma (popis spremnika nad DOM-om i
 * agregacija), neovisno o goldenu. Generator ulaza je doslovni OOXML, pa je vidljivo da test
 * stvarno sadrzi ciljanu klasu (Zotero polje, Mendeley SDT, okvir s Choice i Fallback granom...).
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
  type InspectionCensus,
  type InspectionCoverage,
} from '../src/analysis/inspection-coverage';
import { CHECK_ID_BY_TITLE } from '../src/scoring/check-id-registry';
import { sanitizeAnalysisResult } from '../src/report/report';
import { normalizeResult } from './helpers/golden-normalize';
import { buildDocxFile } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
  + 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" '
  + 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
  + 'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" '
  + 'xmlns:v="urn:schemas-microsoft-com:vml" '
  + 'xmlns:o="urn:schemas-microsoft-com:office:office"';

/** Jedinstven niz koji se NIKAD ne smije pojaviti u izlazu (tekst rada ne izlazi iz modula). */
const SECRET = 'TAJNI_TEKST_RADA_T64';

const p = (text = SECRET) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const doc = (body: string) => parseXml(`<?xml version="1.0" encoding="UTF-8"?><w:document ${NS}><w:body>${body}<w:sectPr/></w:body></w:document>`);

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

function coverageFor(body: string, extra: Record<string, unknown> = {}): InspectionCoverage {
  return computeInspectionCoverage({ details: fullDetails(extra), census: censusInspectionContainers(doc(body)) });
}

function countOf(coverage: InspectionCoverage, kind: string): number {
  return coverage.skippedParts.find((part) => part.kind === kind)?.count ?? 0;
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
  });

  it('Zotero bibliografija preko vise odlomaka: svaki odlomak unutar polja je citatni', () => {
    const body = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> ADDIN ZOTERO_BIBL {"uncited":[]} CSL_BIBLIOGRAPHY </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Horvat, A. (2020).</w:t></w:r></w:p>`
      + p('Kovac, B. (2019).')
      + `<w:p><w:r><w:t>Novak, C. (2018).</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`
      + p();
    const coverage = coverageFor(body);
    expect(countOf(coverage, 'citationField')).toBe(3);
    expect(coverage.skippedParagraphs).toBe(3);
  });

  it('EndNote, Citavi i Word CITATION polja su citatna; obicni SEQ je polje', () => {
    const field = (instr: string) => `<w:p><w:fldSimple w:instr="${instr}"><w:r><w:t>x</w:t></w:r></w:fldSimple></w:p>`;
    const coverage = coverageFor(field(' ADDIN EN.CITE ') + field(' ADDIN CITAVI.PLACEHOLDER ') + field(' CITATION Hor20 \\l 1050 ') + field(' SEQ Tablica \\* ARABIC '));
    expect(countOf(coverage, 'citationField')).toBe(3);
    expect(countOf(coverage, 'fieldOrHyperlink')).toBe(1);
  });

  it('automatski sadrzaj (TOC polje i TOC SDT) nije preskocen, obicna poveznica jest', () => {
    const tocField = `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> TOC \\o "1-3" \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:hyperlink w:anchor="_Toc1"><w:r><w:t>Uvod</w:t></w:r></w:hyperlink></w:p>`
      + `<w:p><w:hyperlink w:anchor="_Toc2"><w:r><w:t>Zakljucak</w:t></w:r></w:hyperlink><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
    const tocSdt = `<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/></w:docPartObj></w:sdtPr><w:sdtContent><w:p><w:hyperlink w:anchor="_Toc3"><w:r><w:t>Metode</w:t></w:r></w:hyperlink></w:p></w:sdtContent></w:sdt>`;
    const link = `<w:p><w:hyperlink><w:r><w:t>https://example.hr</w:t></w:r></w:hyperlink></w:p>`;
    const coverage = coverageFor(tocField + tocSdt + link + p());
    expect(coverage.skippedParagraphs).toBe(1);
    expect(countOf(coverage, 'fieldOrHyperlink')).toBe(1);
    expect(countOf(coverage, 'contentControl')).toBe(0);
  });

  it('tablica, ugnijezdena tablica, formula, revizija, objekt, customXml i SDT', () => {
    const cell = (inner: string) => `<w:tc>${inner}</w:tc>`;
    const table = `<w:tbl><w:tr>${cell(p())}${cell(`<w:tbl><w:tr>${cell(p() + p())}</w:tr></w:tbl>${p()}`)}</w:tr></w:tbl>`;
    const math = `<w:p><m:oMathPara><m:oMath><m:r><m:t>E</m:t></m:r></m:oMath></m:oMathPara></w:p>`;
    const ins = `<w:p><w:ins w:id="1" w:author="a"><w:r><w:t>novo</w:t></w:r></w:ins></w:p>`;
    const del = `<w:p><w:del w:id="2" w:author="a"><w:r><w:delText>staro</w:delText></w:r></w:del></w:p>`;
    const object = `<w:p><w:r><w:object><v:shape/></w:object></w:r></w:p>`;
    const customXml = `<w:customXml w:element="x">${p()}</w:customXml>`;
    const sdt = `<w:sdt><w:sdtPr><w:alias w:val="Naslov"/></w:sdtPr><w:sdtContent>${p()}</w:sdtContent></w:sdt>`;
    const coverage = coverageFor(table + math + ins + del + object + customXml + sdt + p());
    expect(countOf(coverage, 'tableCell')).toBe(2);
    expect(countOf(coverage, 'nestedTable')).toBe(2);
    expect(countOf(coverage, 'equation')).toBe(1);
    expect(countOf(coverage, 'trackedChange')).toBe(2);
    expect(countOf(coverage, 'embeddedObject')).toBe(1);
    expect(countOf(coverage, 'contentControl')).toBe(2);
    expect(coverage.skippedParagraphs).toBe(10);
    expect(coverage.totalParagraphs).toBe(11);
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

  it('pravne fusnote niske pouzdanosti i slozene tablice dolaze iz vec izracunatih struktura', () => {
    const coverage = coverageFor(p(), {
      legalFootnoteStructure: { skipped: [{ footnoteId: 3, reason: 'x' }, { footnoteId: 3, reason: 'x' }, { footnoteId: 7, reason: 'x' }] },
      tableFigureRescue: { tables: [{ unsupported: true, nested: true }, { unsupported: false, nested: false }, { unsupported: true, nested: false }], figures: [] },
    });
    expect(countOf(coverage, 'legalFootnote')).toBe(2);
    expect(countOf(coverage, 'complexTable')).toBe(2);
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
    for (const part of coverage.skippedParts) expect(Object.keys(part).sort()).toEqual(['affectedCheckIds', 'count', 'kind', 'reason']);
  });

  it('bez em i en crtica u razlozima', () => {
    const coverage = coverageFor(ZOTERO_INLINE + TEXTBOX, { legalFootnoteStructure: { skipped: [{ footnoteId: 1 }] }, tableFigureRescue: { tables: [{ unsupported: true }] } });
    for (const part of coverage.skippedParts) expect(part.reason).not.toMatch(new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']'));
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

describe('T64 degradirani ulaz: nepoznato nije zeleno', () => {
  it('ne baca na praznom ulazu i daje manualReviewRequired', () => {
    for (const details of [null, undefined, {}]) {
      const coverage = computeInspectionCoverage({ details, census: null });
      expect(coverage.status).toBe('manualReviewRequired');
      expect(countOf(coverage, 'analysisUnavailable')).toBeGreaterThan(0);
    }
  });

  it('catch grana omotaca: prazni fallbackovi nisu "nista preskoceno"', () => {
    const census = censusInspectionContainers(doc(p()));
    const coverage = computeInspectionCoverage({ details: fullDetails(), census, unavailableSources: ['requiredSectionsStructure', 'linkDoiStructure'] });
    expect(coverage.status).toBe('manualReviewRequired');
    expect(countOf(coverage, 'analysisUnavailable')).toBe(2);
  });

  it('izvor bez skipped niza je nepoznat', () => {
    const census = censusInspectionContainers(doc(p()));
    const coverage = computeInspectionCoverage({ details: fullDetails({ typographyStructure: { occurrences: [] } }), census });
    expect(coverage.status).toBe('manualReviewRequired');
    const part = coverage.skippedParts.find((x) => x.kind === 'analysisUnavailable');
    expect(part?.affectedCheckIds).toEqual(['format.typography.consistency']);
  });
});

describe('T64 prag za rucnu provjeru', () => {
  const at = (reviewParagraphs: number, totalParagraphs: number) => statusFor({ unknown: false, parts: 1, reviewParagraphs, totalParagraphs });

  it('konstante su one koje dokumentacija navodi', () => {
    expect(MANUAL_REVIEW_SKIPPED_RATIO).toBe(0.25);
    expect(MANUAL_REVIEW_MIN_SKIPPED_PARAGRAPHS).toBe(20);
  });

  it('tocno na pragu, jedan ispod i jedan iznad', () => {
    expect(at(20, 80)).toBe('manualReviewRequired'); // udio tocno 0,25 i tocno 20
    expect(at(21, 80)).toBe('manualReviewRequired'); // iznad
    expect(at(20, 81)).toBe('partiallyChecked'); // udio tik ispod 0,25
    expect(at(19, 76)).toBe('partiallyChecked'); // udio 0,25 ali ispod apsolutnog praga
    expect(at(19, 19)).toBe('partiallyChecked'); // kratak dokument, sve preskoceno, ispod 20
  });

  it('obicne tablice ne guraju dokument u rucnu provjeru; okviri guraju', () => {
    const census = (kind: 'tableCell' | 'textBox'): InspectionCensus => ({
      totalParagraphs: 60,
      byKind: { citationField: 0, textBox: 0, nestedTable: 0, tableCell: 0, contentControl: 0, trackedChange: 0, equation: 0, embeddedObject: 0, fieldOrHyperlink: 0, [kind]: 50 },
    });
    expect(computeInspectionCoverage({ details: fullDetails(), census: census('tableCell') }).status).toBe('partiallyChecked');
    expect(computeInspectionCoverage({ details: fullDetails(), census: census('textBox') }).status).toBe('manualReviewRequired');
  });
});

describe('T64 mrezni i golden ugovor (odluka: polje ostaje samo na klijentu)', () => {
  const coverage: InspectionCoverage = { version: 1, status: 'partiallyChecked', skippedParagraphs: 3, totalParagraphs: 10, skippedParts: [{ kind: 'textBox', count: 3, reason: 'x', affectedCheckIds: ['format.typography.consistency'] }] };
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

describe('T64 spoj u analyzeDocx', () => {
  const bodyWithBox = [
    { text: 'Uvod', styleId: 'Heading1' },
    { text: 'Obican odlomak tijela rada.' },
    // Graditelj deklarira samo `w:`; prefiksi okvira se deklariraju na samom odlomku.
    { text: '', raw: TEXTBOX.replace('<w:p>', `<w:p ${NS.replace(/xmlns:w="[^"]*" /, '')}>`) },
    { text: '', raw: ZOTERO_INLINE },
  ];

  it('stvarni .docx kroz cijeli pipeline dobiva inspectionCoverage s okvirom i Zotero poljem', async () => {
    const file = buildDocxFile({ paragraphs: bodyWithBox } as never, 't64.docx');
    const result = (await analyzeFixture(file)) as { details: { inspectionCoverage: InspectionCoverage } };
    const coverage = result.details.inspectionCoverage;
    expect(countOf(coverage, 'textBox')).toBe(3);
    expect(countOf(coverage, 'citationField')).toBe(1);
    expect(coverage.status).toBe('partiallyChecked');
    expect(countOf(coverage, 'analysisUnavailable')).toBe(0);
  }, 60000);

  it('kad omotac ne moze ponovno otvoriti paket, polje postoji i nije fullyChecked', async () => {
    const good = buildDocxFile({ paragraphs: [{ text: 'Uvod', styleId: 'Heading1' }, { text: 'Tekst.' }] } as never, 't64-catch.docx');
    const bytes = await good.arrayBuffer();
    let calls = 0;
    const flaky = {
      name: good.name, size: good.size, type: good.type,
      arrayBuffer: async () => { calls += 1; if (calls > 1) throw new Error('drugi dohvat pada'); return bytes; },
    } as unknown as File;
    const result = (await analyzeFixture(flaky)) as { details: { inspectionCoverage: InspectionCoverage } };
    expect(calls).toBe(2);
    const coverage = result.details.inspectionCoverage;
    expect(coverage.status).toBe('manualReviewRequired');
    expect(countOf(coverage, 'analysisUnavailable')).toBe(2);
  }, 60000);
});
