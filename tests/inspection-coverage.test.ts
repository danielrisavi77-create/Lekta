import { describe, expect, it } from 'vitest';
import {
  buildInspectionCoverage,
  inspectionCoverageFromPackage,
  inspectionCoverageUnavailable,
  inspectionPartNames,
  readInspectionParts,
  unbalancedFieldCount,
  type InspectionXmlPart,
} from '../src/analysis/inspection-coverage';
import { inspectionCensusProblems, memoryPackage } from './helpers/inspection-coverage-guard';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { buildDocxFile } from './helpers/docx-builder';
import { normalizeResult } from './helpers/golden-normalize';
import { sanitizeAnalysisResult } from '../src/report/report';

function part(xml: string): InspectionXmlPart {
  return { part: 'word/document.xml', xml };
}

describe('inspectionCoverage T64', () => {
  it('obican OOXML bez poznatih ogranicenja nema poznatih limita', () => {
    const out = buildInspectionCoverage([
      part('<w:document><w:body><w:p><w:r><w:t>Tekst</w:t></w:r></w:p><w:tbl><w:tr><w:tc/></w:tr></w:tbl></w:body></w:document>'),
    ], {});
    expect(out).toEqual({
      version: 1,
      status: 'no-known-limits',
      items: [],
      analyzerSkips: [],
      summary: { limitedKinds: 0, limitedOccurrences: 0, analyzerSkips: 0 },
    });
  });

  it('broji sest ciljnih OOXML ogranicenja bez dvostrukog brojanja nested tablice', () => {
    const xml =
      '<w:document xmlns:w="w" xmlns:m="m" xmlns:o="o"><w:body>' +
      '<w:sdt><w:sdtContent><w:p/></w:sdtContent></w:sdt>' +
      '<w:p><w:r><w:txbxContent><w:p/></w:txbxContent></w:r></w:p>' +
      '<w:p><m:oMath><m:r/></m:oMath></w:p>' +
      '<w:ins><w:r/></w:ins><w:del><w:r/></w:del>' +
      '<w:object><o:OLEObject/></w:object>' +
      '<w:tbl><w:tr><w:tc><w:tbl><w:tr><w:tc/></w:tr></w:tbl></w:tc></w:tr></w:tbl>' +
      '</w:body></w:document>';
    const out = buildInspectionCoverage([part(xml)], {});
    expect(out.status).toBe('partial');
    expect(out.items).toEqual([
      { kind: 'content-control', count: 1 },
      { kind: 'text-box', count: 1 },
      { kind: 'math', count: 1 },
      { kind: 'tracked-change', count: 2 },
      { kind: 'embedded-object', count: 1 },
      { kind: 'nested-table', count: 1 },
    ]);
    expect(out.summary).toEqual({ limitedKinds: 6, limitedOccurrences: 7, analyzerSkips: 0 });
  });

  it('spaja poznate skipped[] analizatora samo kao brojace i ne prenosi slobodni reason', () => {
    const details = {
      typographyStructure: { skipped: [{ reason: 'tajni tekst A' }, { reason: 'tajni tekst B' }] },
      consistencyStructure: { skipped: [{ reason: 'tajni tekst C' }] },
      linkDoiStructure: { skipped: [{ reason: 'tajni tekst D' }] },
      requiredSectionsStructure: { skipped: [{ reason: 'tajni tekst E' }] },
      legalFootnoteStructure: { skipped: [{ reason: 'tajni tekst F' }] },
    };
    const out = buildInspectionCoverage([part('<w:document><w:body><w:p/></w:body></w:document>')], details);
    expect(out.status).toBe('partial');
    expect(out.analyzerSkips).toEqual([
      { analyzer: 'typography', count: 2 },
      { analyzer: 'consistency', count: 1 },
      { analyzer: 'link-doi', count: 1 },
      { analyzer: 'required-sections', count: 1 },
      { analyzer: 'legal-footnotes', count: 1 },
    ]);
    expect(out.summary.analyzerSkips).toBe(6);
    expect(JSON.stringify(out)).not.toContain('tajni tekst');
  });

  it('zbraja ista ogranicenja kroz document, footnotes i endnotes', () => {
    const out = buildInspectionCoverage([
      { part: 'word/document.xml', xml: '<w:document><w:body><w:sdt/></w:body></w:document>' },
      { part: 'word/footnotes.xml', xml: '<w:footnotes><w:footnote><w:ins/></w:footnote></w:footnotes>' },
      { part: 'word/endnotes.xml', xml: '<w:endnotes><w:endnote><m:oMath xmlns:m="m"/></w:endnote></w:endnotes>' },
    ], {});
    expect(out.items).toEqual([
      { kind: 'content-control', count: 1 },
      { kind: 'math', count: 1 },
      { kind: 'tracked-change', count: 1 },
    ]);
  });

  it('nedostupan inspection korak je unknown, nikad lazno no-known-limits', () => {
    expect(inspectionCoverageUnavailable()).toEqual({
      version: 1,
      status: 'unknown',
      items: [],
      analyzerSkips: [],
      summary: { limitedKinds: 0, limitedOccurrences: 0, analyzerSkips: 0 },
    });
  });

  it('analyzeDocx izlozi inspectionCoverage, ali golden presuda ostaje izvan details sloja', async () => {
    const file = buildDocxFile({
      paragraphs: [
        { text: 'Uvod', styleId: 'Heading1' },
        {
          raw:
            '<w:sdt><w:sdtPr/><w:sdtContent>' +
            '<w:p><w:r><w:t xml:space="preserve">Kontrolirani tekst</w:t></w:r></w:p>' +
            '</w:sdtContent></w:sdt>',
          text: '',
        },
        { text: 'Zaključak', styleId: 'Heading1' },
      ],
    }, 'inspection-sdt.docx');

    const result: any = await analyzeFixture(file, { profileId: 'fpzg-politologija-diplomski' });
    expect(result.details.inspectionCoverage.status).toBe('partial');
    expect(result.details.inspectionCoverage.items).toContainEqual({ kind: 'content-control', count: 1 });

    const golden = normalizeResult(result);
    expect(JSON.stringify(golden)).not.toContain('inspectionCoverage');
    expect(golden).toMatchObject({ profileStatus: expect.any(String), checks: expect.any(Array), issues: expect.any(Array) });
  });
});

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const enc = new TextEncoder();

function extra(name: string, xml: string) {
  return { name, data: enc.encode(xml) };
}

const PLAIN_DOC = {
  paragraphs: [
    { text: 'Uvod', styleId: 'Heading1' },
    { text: 'Obican odlomak bez slozenih struktura.' },
    { text: 'Zaključak', styleId: 'Heading1' },
  ],
};

async function coverageOf(file: File): Promise<any> {
  const result: any = await analyzeFixture(file, { profileId: 'fpzg-politologija-diplomski' });
  return result;
}

describe('inspectionCoverage T64: zaglavlja, podnozja i neuravnotezena polja (Codex M1, M2)', () => {
  it('kontrolni dokument bez zaglavlja i struktura ostaje no-known-limits', async () => {
    const result = await coverageOf(buildDocxFile(PLAIN_DOC, 'inspection-plain.docx'));
    expect(result.details.inspectionCoverage.status).toBe('no-known-limits');
  });

  it('M1: tekstni okvir SAMO u zaglavlju daje partial, ne no-known-limits', async () => {
    const header =
      `<w:hdr xmlns:w="${W_NS}"><w:p><w:r><w:txbxContent>` +
      '<w:p><w:r><w:t>Okvir u zaglavlju</w:t></w:r></w:p>' +
      '</w:txbxContent></w:r></w:p></w:hdr>';
    const result = await coverageOf(buildDocxFile(PLAIN_DOC, 'inspection-header-txbx.docx', [extra('word/header1.xml', header)]));
    expect(result.details.inspectionCoverage.status).toBe('partial');
    expect(result.details.inspectionCoverage.items).toContainEqual({ kind: 'text-box', count: 1 });
  });

  it('M1: strukturirana kontrola SAMO u podnozju daje partial', async () => {
    const footer =
      `<w:ftr xmlns:w="${W_NS}"><w:sdt><w:sdtPr/><w:sdtContent>` +
      '<w:p><w:r><w:t>1</w:t></w:r></w:p>' +
      '</w:sdtContent></w:sdt></w:ftr>';
    const result = await coverageOf(buildDocxFile(PLAIN_DOC, 'inspection-footer-sdt.docx', [extra('word/footer2.xml', footer)]));
    expect(result.details.inspectionCoverage.status).toBe('partial');
    expect(result.details.inspectionCoverage.items).toContainEqual({ kind: 'content-control', count: 1 });
  });

  it('M2: neuravnotezeno polje SAMO u fusnoti nije no-known-limits i ostaje content-free', async () => {
    const footnotes =
      `<w:footnotes xmlns:w="${W_NS}"><w:footnote w:id="1"><w:p>` +
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> REF LEKTAPOLJETAJNA \h </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
      '<w:r><w:t>Spremljeni rezultat bez kraja</w:t></w:r>' +
      '</w:p></w:footnote></w:footnotes>';
    const result = await coverageOf(buildDocxFile(PLAIN_DOC, 'inspection-footnote-field.docx', [extra('word/footnotes.xml', footnotes)]));
    const coverage = result.details.inspectionCoverage;
    expect(['partial', 'unknown']).toContain(coverage.status);
    expect(coverage.status).not.toBe('no-known-limits');
    expect(coverage.items).toContainEqual({ kind: 'unbalanced-field', count: 1 });
    const json = JSON.stringify(coverage);
    expect(json).not.toContain('LEKTAPOLJETAJNA');
    expect(json).not.toContain('Spremljeni rezultat');
  });

  it('M2: neuravnotezeno polje SAMO u endnoti nije no-known-limits', async () => {
    const endnotes =
      `<w:endnotes xmlns:w="${W_NS}"><w:endnote w:id="1"><w:p>` +
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
      '</w:p></w:endnote></w:endnotes>';
    const result = await coverageOf(buildDocxFile(PLAIN_DOC, 'inspection-endnote-field.docx', [extra('word/endnotes.xml', endnotes)]));
    expect(result.details.inspectionCoverage.status).not.toBe('no-known-limits');
    expect(result.details.inspectionCoverage.items).toContainEqual({ kind: 'unbalanced-field', count: 1 });
  });

  it('privatnost: prepoznatljiv tekst iz tekstnog okvira ne izlazi ni kroz inspectionCoverage ni kroz sanitizeAnalysisResult', async () => {
    const marker = 'LEKTAOKVIRTAJNA7731';
    const file = buildDocxFile({
      paragraphs: [
        { text: 'Uvod', styleId: 'Heading1' },
        {
          raw:
            '<w:p><w:r><w:txbxContent>' +
            `<w:p><w:r><w:t>${marker} tekst okvira</w:t></w:r></w:p>` +
            '</w:txbxContent></w:r></w:p>',
          text: '',
        },
        { text: 'Zaključak', styleId: 'Heading1' },
      ],
    }, 'inspection-txbx-privacy.docx');
    const result = await coverageOf(file);
    // Kontrola: marker je stvarno u paketu i analiza ga vidi, inace test ne dokazuje nista.
    expect(JSON.stringify(result.preview ?? {})).toContain(marker);
    expect(result.details.inspectionCoverage.items).toContainEqual({ kind: 'text-box', count: 1 });
    expect(JSON.stringify(result.details.inspectionCoverage)).not.toContain(marker);
    expect(JSON.stringify(sanitizeAnalysisResult(result))).not.toContain(marker);
  });
});

describe('inspectionCoverage T64: census paketa (jedinice)', () => {
  it('stvarni census prolazi gard (isti gard kao u gate-mutations)', async () => {
    expect(await inspectionCensusProblems(inspectionCoverageFromPackage)).toEqual([]);
  });

  it('census cita tijelo, biljeske i SVA zaglavlja i podnozja, nista drugo', () => {
    expect(inspectionPartNames([
      'word/styles.xml',
      'word/footer2.xml',
      'word/document.xml',
      'word/header1.xml',
      'word/header.xml',
      'word/endnotes.xml',
      'word/footnotes.xml',
      'word/_rels/header1.xml.rels',
      'word/comments.xml',
      'customXml/item1.xml',
    ])).toEqual([
      'word/document.xml',
      'word/endnotes.xml',
      'word/footer2.xml',
      'word/footnotes.xml',
      'word/header.xml',
      'word/header1.xml',
    ]);
  });

  it('neuravnotezena polja: begin bez end i end bez begin se broje, uravnotezena i fldSimple ne', () => {
    const b = '<w:fldChar w:fldCharType="begin"/>';
    const sep = '<w:fldChar w:fldCharType="separate"/>';
    const e = '<w:fldChar w:fldCharType="end"/>';
    expect(unbalancedFieldCount(`${b}${sep}${e}`)).toBe(0);
    expect(unbalancedFieldCount(`${b}${b}${e}${e}`)).toBe(0);
    expect(unbalancedFieldCount('<w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>')).toBe(0);
    expect(unbalancedFieldCount(`${b}${sep}`)).toBe(1);
    expect(unbalancedFieldCount(`${e}`)).toBe(1);
    expect(unbalancedFieldCount(`${b}${b}${e}`)).toBe(1);
    expect(unbalancedFieldCount(`<w:fldChar w:dirty="true" w:fldCharType='begin'></w:fldChar>`)).toBe(1);
  });

  it('vec procitan document.xml se ne cita ponovno iz paketa', async () => {
    const read: string[] = [];
    const pkg = memoryPackage({ 'word/document.xml': '<w:document/>', 'word/header1.xml': '<w:hdr/>' });
    const spy = { names: pkg.names, text: async (name: string) => { read.push(name); return pkg.text(name); } };
    const parts = await readInspectionParts(spy, { preloaded: { 'word/document.xml': '<w:document><w:sdt/></w:document>' } });
    expect(read).toEqual(['word/header1.xml']);
    expect(parts.find((p) => p.part === 'word/document.xml')?.xml).toContain('<w:sdt/>');
  });

  it('idempotencija: dva census prolaza nad istim paketom daju isti rezultat', async () => {
    const pkg = memoryPackage({
      'word/document.xml': '<w:document><w:body><w:sdt/></w:body></w:document>',
      'word/header1.xml': '<w:hdr><w:txbxContent/></w:hdr>',
      'word/footnotes.xml': '<w:footnotes><w:fldChar w:fldCharType="begin"/></w:footnotes>',
    });
    const first = await inspectionCoverageFromPackage(pkg, {});
    const second = await inspectionCoverageFromPackage(pkg, {});
    expect(second).toEqual(first);
    expect(first.items).toEqual([
      { kind: 'content-control', count: 1 },
      { kind: 'text-box', count: 1 },
      { kind: 'unbalanced-field', count: 1 },
    ]);
  });
});
