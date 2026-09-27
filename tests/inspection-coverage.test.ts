import { describe, expect, it } from 'vitest';
import {
  buildInspectionCoverage,
  inspectionCoverageUnavailable,
  type InspectionXmlPart,
} from '../src/analysis/inspection-coverage';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { buildDocxFile } from './helpers/docx-builder';
import { normalizeResult } from './helpers/golden-normalize';

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
