import { describe, expect, it } from 'vitest';
import { applyFixers } from './apply-fixers';
import { anchorFingerprintForXml } from '../analysis/element-structure';
import { writeZip, readZip } from './zip-codec';

const documentXml = '<w:document><w:body>' +
  '<w:p><w:r><w:t>Uvod i Tablica 1.</w:t></w:r></w:p>' +
  '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Podatak</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
  '<w:p><w:r><w:t>Izvorni tekst.</w:t></w:r></w:p>' +
  '<w:sectPr/></w:body></w:document>';

function target() {
  const anchor = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Podatak</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
  return {
    id: 'element-table-test', kind: 'table' as const,
    anchor: { bodyChildIndex: 1, tableIndex: 0 },
    anchorFingerprint: anchorFingerprintForXml('table', anchor),
    description: 'Rezultati ankete', position: 'above' as const,
    replaceManualCaption: true, label: 'Tablica',
  };
}

async function docx() {
  const enc = new TextEncoder();
  return writeZip([
    { name: 'word/document.xml', data: enc.encode(documentXml) },
    { name: 'word/styles.xml', data: enc.encode('<w:styles><w:style w:styleId="Normal"/></w:styles>') },
  ]);
}

describe('element-caption-fixer', () => {
  it('umece SEQ natpis, Caption stil i cuva tablicu', async () => {
    const result = await applyFixers(await docx(), [{ fixerId: 'element-caption-fixer', ruleId: 'caption', params: { version: 1, elements: [target()], labels: { table: 'Tablica', figure: 'Slika', chart: 'Grafikon' }, lists: [{ kind: 'table', title: 'Popis tablica', placement: 'before-intro' }], references: [{ paragraphIndex: 1, start: 7, end: 16, elementId: 'element-table-test' }] } }]);
    expect(result.changelog).toHaveLength(1);
    const entries = await readZip(result.docxBytes);
    const xml = new TextDecoder().decode(entries.find((entry) => entry.name === 'word/document.xml')!.data);
    const styles = new TextDecoder().decode(entries.find((entry) => entry.name === 'word/styles.xml')!.data);
    expect(xml).toContain('SEQ Tablica \\* ARABIC');
    expect(xml).toContain('TOC \\h \\z \\c "Tablica"');
    expect(xml).toContain('REF LektaCaption_element_table_test');
    expect(xml).toContain('Rezultati ankete</w:t>');
    expect(xml).toContain('<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Podatak</w:t>');
    expect(styles).toContain('w:styleId="Caption"');
  });

  it('odbija promijenjeno sidro i druga primjena je already-ok', async () => {
    const params = { version: 1 as const, elements: [target()], labels: { table: 'Tablica' }, lists: [{ kind: 'table' as const, title: 'Popis tablica', placement: 'before-intro' as const }] };
    const first = await applyFixers(await docx(), [{ fixerId: 'element-caption-fixer', ruleId: 'caption', params }]);
    const second = await applyFixers(first.docxBytes, [{ fixerId: 'element-caption-fixer', ruleId: 'caption', params }]);
    expect(second.skippedReasons.caption).toBe('already-ok');
    expect(second.docxBytes).toEqual(first.docxBytes);
    const stale = { ...target(), anchorFingerprint: '00000000' };
    const rejected = await applyFixers(await docx(), [{ fixerId: 'element-caption-fixer', ruleId: 'caption', params: { version: 1, elements: [stale] } }]);
    expect(rejected.skippedReasons.caption).toBe('no-target');
  });
});
