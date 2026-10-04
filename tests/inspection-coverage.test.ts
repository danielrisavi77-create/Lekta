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
import { documentRels, inspectionCensusProblems, memoryPackage } from './helpers/inspection-coverage-guard';
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
    const result = await coverageOf(buildDocxFile(PLAIN_DOC, 'inspection-header-txbx.docx', [
      extra('word/header1.xml', header),
      extra('word/_rels/document.xml.rels', documentRels([['rIdH', 'header', 'header1.xml']])),
    ]));
    expect(result.details.inspectionCoverage.status).toBe('partial');
    expect(result.details.inspectionCoverage.items).toContainEqual({ kind: 'text-box', count: 1 });
  });

  it('M1: strukturirana kontrola SAMO u podnozju daje partial', async () => {
    const footer =
      `<w:ftr xmlns:w="${W_NS}"><w:sdt><w:sdtPr/><w:sdtContent>` +
      '<w:p><w:r><w:t>1</w:t></w:r></w:p>' +
      '</w:sdtContent></w:sdt></w:ftr>';
    const result = await coverageOf(buildDocxFile(PLAIN_DOC, 'inspection-footer-sdt.docx', [
      extra('word/footer2.xml', footer),
      extra('word/_rels/document.xml.rels', documentRels([['rIdF', 'footer', 'footer2.xml']])),
    ]));
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

  it('M2b: begin u fusnoti 1 i samostalni end u fusnoti 2 se ne ponistavaju (dubina po biljesci)', async () => {
    const footnotes =
      `<w:footnotes xmlns:w="${W_NS}">` +
      '<w:footnote w:id="1"><w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r></w:p></w:footnote>' +
      '<w:footnote w:id="2"><w:p><w:r><w:t>Druga biljeska</w:t></w:r>' +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:footnote>' +
      '</w:footnotes>';
    const result = await coverageOf(buildDocxFile(PLAIN_DOC, 'inspection-split-field.docx', [extra('word/footnotes.xml', footnotes)]));
    const coverage = result.details.inspectionCoverage;
    expect(coverage.status).toBe('partial');
    // begin bez end u prvoj i end bez begin u drugoj: dvije neuravnotezenosti.
    expect(coverage.items).toContainEqual({ kind: 'unbalanced-field', count: 2 });
  });

  it('M1b: zaglavlje povezano relacijom pod imenom headerCustom.xml s okvirom daje partial', async () => {
    const header =
      `<w:hdr xmlns:w="${W_NS}"><w:p><w:r><w:txbxContent>` +
      '<w:p><w:r><w:t>Okvir</w:t></w:r></w:p>' +
      '</w:txbxContent></w:r></w:p></w:hdr>';
    const result = await coverageOf(buildDocxFile(PLAIN_DOC, 'inspection-header-custom.docx', [
      extra('word/headerCustom.xml', header),
      extra('word/_rels/document.xml.rels', documentRels([['rIdH', 'header', 'headerCustom.xml']])),
    ]));
    expect(result.details.inspectionCoverage.status).toBe('partial');
    expect(result.details.inspectionCoverage.items).toContainEqual({ kind: 'text-box', count: 1 });
  });

  it('M1b: nepovezani header1.xml s okvirom (bez relacije) ne mijenja status', async () => {
    const header =
      `<w:hdr xmlns:w="${W_NS}"><w:p><w:r><w:txbxContent>` +
      '<w:p><w:r><w:t>Okvir</w:t></w:r></w:p>' +
      '</w:txbxContent></w:r></w:p></w:hdr>';
    const rels = documentRels([['rIdS', 'styles', 'styles.xml']]);
    const unlinked = await coverageOf(buildDocxFile(PLAIN_DOC, 'inspection-header-unlinked.docx', [
      extra('word/header1.xml', header),
      extra('word/_rels/document.xml.rels', rels),
    ]));
    expect(unlinked.details.inspectionCoverage.status).toBe('no-known-limits');
    // Kontrola generatora: isti dio s relacijom JE ogranicenje, pa gornji ishod nije slucajan.
    const linked = await coverageOf(buildDocxFile(PLAIN_DOC, 'inspection-header-linked.docx', [
      extra('word/header1.xml', header),
      extra('word/_rels/document.xml.rels', documentRels([['rIdS', 'styles', 'styles.xml'], ['rIdH', 'header', 'header1.xml']])),
    ]));
    expect(linked.details.inspectionCoverage.status).toBe('partial');
  });

  it('m: strukturirana kontrola samo u komentarima daje partial', async () => {
    const comments =
      `<w:comments xmlns:w="${W_NS}"><w:comment w:id="0" w:author="A">` +
      '<w:sdt><w:sdtPr/><w:sdtContent><w:p><w:r><w:t>Komentar</w:t></w:r></w:p></w:sdtContent></w:sdt>' +
      '</w:comment></w:comments>';
    const result = await coverageOf(buildDocxFile(PLAIN_DOC, 'inspection-comment-sdt.docx', [extra('word/comments.xml', comments)]));
    expect(result.details.inspectionCoverage.status).toBe('partial');
    expect(result.details.inspectionCoverage.items).toContainEqual({ kind: 'content-control', count: 1 });
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

  it('census cita tijelo, biljeske, komentare, glossary i zaglavlja/podnozja SAMO po relaciji', () => {
    const names = [
      'word/styles.xml',
      'word/footer2.xml',
      'word/document.xml',
      'word/header1.xml',
      'word/header.xml',
      'word/headerCustom.xml',
      'word/endnotes.xml',
      'word/footnotes.xml',
      'word/_rels/header1.xml.rels',
      'word/_rels/document.xml.rels',
      'word/comments.xml',
      'word/glossary/document.xml',
      'customXml/item1.xml',
    ];
    const rels = documentRels([
      ['rId1', 'styles', 'styles.xml'],
      ['rId2', 'header', 'headerCustom.xml'],
      ['rId3', 'footer', '/word/footer2.xml'],
    ]);
    expect(inspectionPartNames(names, { documentRelsXml: rels, documentXml: '' })).toEqual([
      'word/comments.xml',
      'word/document.xml',
      'word/endnotes.xml',
      'word/footer2.xml',
      'word/footnotes.xml',
      'word/glossary/document.xml',
      'word/headerCustom.xml',
    ]);
  });

  it('relacije: nevaljan rels, relacija na nepostojeci dio i referenca bez rels bacaju (census je tada unknown)', () => {
    const names = ['word/document.xml', 'word/header1.xml', 'word/_rels/document.xml.rels'];
    const refs = '<w:document><w:body><w:sectPr><w:headerReference r:id="rId1"/></w:sectPr></w:body></w:document>';
    expect(() => inspectionPartNames(names, { documentRelsXml: '<Relationships><Relationship', documentXml: '' })).toThrow();
    expect(() => inspectionPartNames(names, { documentRelsXml: '<Nesto/>', documentXml: '' })).toThrow();
    expect(() => inspectionPartNames(names, {
      documentRelsXml: documentRels([['rId1', 'header', 'headerNema.xml']]),
      documentXml: '',
    })).toThrow();
    expect(() => inspectionPartNames(['word/document.xml', 'word/header1.xml'], { documentRelsXml: null, documentXml: refs })).toThrow();
    // Bez rels i bez ijedne reference: po OPC-u dio bez relacija nema rels, to nije kvar.
    expect(inspectionPartNames(['word/document.xml', 'word/header1.xml'], { documentRelsXml: null, documentXml: '<w:document/>' }))
      .toEqual(['word/document.xml']);
  });

  it('nevaljan document.xml.rels u paketu daje unknown, nikad no-known-limits', async () => {
    const out = await inspectionCoverageFromPackage(memoryPackage({
      'word/document.xml': '<w:document><w:body><w:p/></w:body></w:document>',
      'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rId1"',
      'word/header1.xml': '<w:hdr/>',
    }), {});
    expect(out.status).toBe('unknown');
  });

  it('glossary: tekstni okvir samo u word/glossary/document.xml daje partial', async () => {
    const out = await inspectionCoverageFromPackage(memoryPackage({
      'word/document.xml': '<w:document><w:body><w:p/></w:body></w:document>',
      'word/glossary/document.xml': '<w:glossaryDocument><w:docParts><w:docPart><w:docPartBody><w:p><w:r><w:txbxContent/></w:r></w:p></w:docPartBody></w:docPart></w:docParts></w:glossaryDocument>',
    }), {});
    expect(out.status).toBe('partial');
    expect(out.items).toEqual([{ kind: 'text-box', count: 1 }]);
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

  it('neuravnotezena polja: dubina se racuna po biljesci, komentaru i docPart, ne po cijelom dijelu', () => {
    const b = '<w:fldChar w:fldCharType="begin"/>';
    const e = '<w:fldChar w:fldCharType="end"/>';
    const note = (tag: string, id: number, inner: string) => `<w:${tag} w:id="${id}"><w:p><w:r>${inner}</w:r></w:p></w:${tag}>`;
    // Baseline: uravnotezeno polje unutar jedne biljeske ostaje 0.
    expect(unbalancedFieldCount(`<w:footnotes>${note('footnote', 1, `${b}${e}`)}</w:footnotes>`)).toBe(0);
    for (const [root, tag] of [['footnotes', 'footnote'], ['endnotes', 'endnote'], ['comments', 'comment']] as const) {
      expect(unbalancedFieldCount(`<w:${root}>${note(tag, 1, b)}${note(tag, 2, e)}</w:${root}>`)).toBe(2);
    }
    expect(unbalancedFieldCount(`<w:docParts><w:docPart>${b}</w:docPart><w:docPart>${e}</w:docPart></w:docParts>`)).toBe(2);
    // footnotePr, footnoteReference i commentRangeStart nisu granice biljeske.
    expect(unbalancedFieldCount(`<w:p>${b}<w:footnoteReference w:id="1"/><w:commentRangeStart w:id="0"/>${e}</w:p>`)).toBe(0);
    // Glavni dokument: polje (npr. TOC) smije prelaziti granice odlomka.
    expect(unbalancedFieldCount(`<w:body><w:p>${b}</w:p><w:p>${e}</w:p></w:body>`)).toBe(0);
  });

  it('vec procitan document.xml se ne cita ponovno iz paketa', async () => {
    const read: string[] = [];
    const pkg = memoryPackage({
      'word/document.xml': '<w:document/>',
      'word/_rels/document.xml.rels': documentRels([['rId1', 'header', 'header1.xml']]),
      'word/header1.xml': '<w:hdr/>',
    });
    const spy = { names: pkg.names, text: async (name: string) => { read.push(name); return pkg.text(name); } };
    const parts = await readInspectionParts(spy, { preloaded: { 'word/document.xml': '<w:document><w:sdt/></w:document>' } });
    expect(read).toEqual(['word/_rels/document.xml.rels', 'word/header1.xml']);
    expect(parts.find((p) => p.part === 'word/document.xml')?.xml).toContain('<w:sdt/>');
  });

  it('vec procitan rels se ne cita ponovno; prazan preloaded rels za zapis kojeg nema ne glumi sadrzaj', async () => {
    const read: string[] = [];
    const rels = documentRels([['rId1', 'header', 'headerCustom.xml']]);
    const pkg = memoryPackage({
      'word/document.xml': '<w:document/>',
      'word/_rels/document.xml.rels': rels,
      'word/headerCustom.xml': '<w:hdr/>',
    });
    const spy = { names: pkg.names, text: async (name: string) => { read.push(name); return pkg.text(name); } };
    const parts = await readInspectionParts(spy, {
      preloaded: { 'word/document.xml': '<w:document/>', 'word/_rels/document.xml.rels': rels },
    });
    expect(read).toEqual(['word/headerCustom.xml']);
    expect(parts.map((p) => p.part)).toEqual(['word/document.xml', 'word/headerCustom.xml']);
    // analyze-docx predaje '' kad rels zapisa nema (ZipReader.text): census ga tada ne smije parsirati.
    const noRels = await inspectionCoverageFromPackage(
      memoryPackage({ 'word/document.xml': '<w:document><w:body><w:p/></w:body></w:document>' }),
      {},
      { preloaded: { 'word/_rels/document.xml.rels': '' } },
    );
    expect(noRels.status).toBe('no-known-limits');
  });

  it('idempotencija: dva census prolaza nad istim paketom daju isti rezultat', async () => {
    const pkg = memoryPackage({
      'word/document.xml': '<w:document><w:body><w:sdt/></w:body></w:document>',
      'word/_rels/document.xml.rels': documentRels([['rId1', 'header', 'header1.xml']]),
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

describe('inspectionCoverage T64 krug 4: razrjesavanje r:id i glossary rels (Codex M1c, M1d)', () => {
  const NS =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const body = (refs: string) =>
    `<w:document ${NS}><w:body><w:p/><w:sectPr>${refs}</w:sectPr></w:body></w:document>`;
  const headerRef = '<w:headerReference w:type="default" r:id="rIdH"/>';
  const footerRef = '<w:footerReference w:type="default" r:id="rIdF"/>';
  const textBoxHeader = `<w:hdr ${NS}><w:p><w:r><w:txbxContent><w:p/></w:txbxContent></w:r></w:p></w:hdr>`;
  const glossary = (refs: string) =>
    `<w:glossaryDocument ${NS}><w:docParts><w:docPart><w:docPartBody><w:p/><w:sectPr>${refs}</w:sectPr></w:docPartBody></w:docPart></w:docParts></w:glossaryDocument>`;

  it('A: rels sadrzi samo styles, a headerReference r:id="rIdH" ne razrjesava se: unknown, ne no-known-limits', async () => {
    const out = await inspectionCoverageFromPackage(memoryPackage({
      'word/document.xml': body(headerRef),
      'word/_rels/document.xml.rels': documentRels([['rId1', 'styles', 'styles.xml']]),
      'word/header1.xml': textBoxHeader,
    }), {});
    expect(out.status).toBe('unknown');
    expect(out.items).toEqual([]);
  });

  it('A: kontrola generatora, isti paket s relacijom rIdH razrjesava se i daje partial (nije slucajno unknown)', async () => {
    const out = await inspectionCoverageFromPackage(memoryPackage({
      'word/document.xml': body(headerRef),
      'word/_rels/document.xml.rels': documentRels([['rId1', 'styles', 'styles.xml'], ['rIdH', 'header', 'header1.xml']]),
      'word/header1.xml': textBoxHeader,
    }), {});
    expect(out.status).toBe('partial');
    expect(out.items).toEqual([{ kind: 'text-box', count: 1 }]);
  });

  it('A: r:id koji razrjesava relacija krivog tipa, vanjska relacija i dvostruki Id daju unknown', () => {
    const names = ['word/document.xml', 'word/header1.xml', 'word/footer1.xml'];
    const pick = (rels: string, refs = headerRef) =>
      () => inspectionPartNames(names, { documentRelsXml: rels, documentXml: body(refs) });
    expect(pick(documentRels([['rIdH', 'footer', 'footer1.xml']]))).toThrow();
    expect(pick(documentRels([['rIdF', 'header', 'header1.xml']]), footerRef)).toThrow();
    expect(pick(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="https://x.example/h.xml" TargetMode="External"/></Relationships>',
    )).toThrow();
    expect(pick(documentRels([['rIdH', 'header', 'header1.xml'], ['rIdH', 'footer', 'footer1.xml']]))).toThrow();
    // headerReference bez ikakvog r:id ne moze se razrijesiti.
    expect(pick(documentRels([['rIdH', 'header', 'header1.xml']]), '<w:headerReference w:type="default"/>')).toThrow();
    // Sve razrijeseno: header i footer idu u census, ime dijela je nebitno.
    expect(
      inspectionPartNames(names, {
        documentRelsXml: documentRels([['rIdH', 'header', 'header1.xml'], ['rIdF', 'footer', 'footer1.xml']]),
        documentXml: body(headerRef + footerRef),
      }),
    ).toEqual(['word/document.xml', 'word/footer1.xml', 'word/header1.xml']);
  });

  it('B: zaglavlje povezano iz word/glossary/_rels s tekstnim okvirom daje partial', async () => {
    const out = await inspectionCoverageFromPackage(memoryPackage({
      'word/document.xml': body(''),
      'word/glossary/document.xml': glossary(headerRef),
      'word/glossary/_rels/document.xml.rels': documentRels([['rIdH', 'header', 'header1.xml']]),
      // Putanja je relativna na word/glossary/, pa glavni word/header1.xml ovdje nije cilj.
      'word/glossary/header1.xml': textBoxHeader,
      'word/header1.xml': `<w:hdr ${NS}><w:p/></w:hdr>`,
    }), {});
    expect(out.status).toBe('partial');
    expect(out.items).toEqual([{ kind: 'text-box', count: 1 }]);
  });

  it('B: glossary rels bira samo header i footer, a putanja se razrjesava od word/glossary/', () => {
    const names = [
      'word/document.xml',
      'word/glossary/document.xml',
      'word/glossary/header1.xml',
      'word/glossary/styles.xml',
      'word/footer9.xml',
    ];
    const glossaryRelsXml = documentRels([
      ['rId1', 'styles', 'styles.xml'],
      ['rIdH', 'header', 'header1.xml'],
      ['rIdF', 'footer', '../footer9.xml'],
    ]);
    expect(inspectionPartNames(names, {
      documentRelsXml: null,
      documentXml: '',
      glossaryRelsXml,
      glossaryXml: glossary(headerRef + footerRef),
    })).toEqual(['word/document.xml', 'word/footer9.xml', 'word/glossary/document.xml', 'word/glossary/header1.xml']);
  });

  it('B: nevaljan glossary rels, nerazrijeseni r:id i referenca bez glossary rels daju unknown', async () => {
    const parts = { 'word/document.xml': body(''), 'word/glossary/document.xml': glossary(headerRef) };
    const invalid = await inspectionCoverageFromPackage(memoryPackage({
      ...parts,
      'word/glossary/_rels/document.xml.rels': '<Relationships><Relationship Id="rIdH"',
    }), {});
    expect(invalid.status).toBe('unknown');
    const unresolved = await inspectionCoverageFromPackage(memoryPackage({
      ...parts,
      'word/glossary/_rels/document.xml.rels': documentRels([['rId1', 'styles', 'styles.xml']]),
    }), {});
    expect(unresolved.status).toBe('unknown');
    const missing = await inspectionCoverageFromPackage(memoryPackage(parts), {});
    expect(missing.status).toBe('unknown');
    // Glossary bez referenci i bez rels dijela ostaje valjan i bez ogranicenja.
    const clean = await inspectionCoverageFromPackage(memoryPackage({
      'word/document.xml': body(''),
      'word/glossary/document.xml': glossary(''),
    }), {});
    expect(clean.status).toBe('no-known-limits');
  });

  it('glossary rels bez word/glossary/document.xml ne utjece na census (nema sto povezivati)', async () => {
    const out = await inspectionCoverageFromPackage(memoryPackage({
      'word/document.xml': body(''),
      'word/glossary/_rels/document.xml.rels': '<Relationships><Relationship Id="rIdH"',
    }), {});
    expect(out.status).toBe('no-known-limits');
  });

  it('idempotencija: dva census prolaza nad glossary paketom daju isti rezultat', async () => {
    const zip = memoryPackage({
      'word/document.xml': body(''),
      'word/glossary/document.xml': glossary(headerRef),
      'word/glossary/_rels/document.xml.rels': documentRels([['rIdH', 'header', 'header1.xml']]),
      'word/glossary/header1.xml': textBoxHeader,
    });
    const first = await inspectionCoverageFromPackage(zip, {});
    expect(await inspectionCoverageFromPackage(zip, {})).toEqual(first);
  });
});
