import { describe, expect, it } from 'vitest';
import { applyFixers, FIXER_IDS, type FixerRequest } from '../src/repair/apply-fixers';
import { readZip, writeZip, type ZipEntry } from '../src/repair/zip-codec';
import { buildRepairTemplate } from './helpers/repair-templates';

const WORD_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const enc = new TextEncoder();

async function replaceEntry(bytes: Uint8Array, name: string, data: string): Promise<Uint8Array> {
  const entries = await readZip(bytes);
  return writeZip(entries.map((entry) => entry.name === name ? { ...entry, data: enc.encode(data) } : entry));
}

async function malformedReadableDocx(): Promise<Uint8Array> {
  const base = await buildRepairTemplate('basic-text-styles');
  let broken = await replaceEntry(
    base,
    'word/document.xml',
    `<w:document ${WORD_NS}><w:body><w:p><w:r><w:t>Otvoren tekst`,
  );
  broken = await replaceEntry(
    broken,
    'word/styles.xml',
    `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal">`,
  );
  return broken;
}

describe('Repair Engine adversarial DOCX resilience', () => {
  it('kontrolirano odbija sirove bajtove i ZIP bez word/document.xml', async () => {
    await expect(applyFixers(new Uint8Array([0, 1, 2, 3]), [])).rejects.toThrow(/EOCD|valjan zip/i);

    const withoutDocument = await writeZip([
      { name: '[Content_Types].xml', data: enc.encode('<Types/>') },
      { name: 'word/styles.xml', data: enc.encode(`<w:styles ${WORD_NS}></w:styles>`) },
    ]);
    await expect(applyFixers(withoutDocument, [])).rejects.toThrow(/nedostaje word\/document\.xml/i);
  });

  it('svaki registrirani fixer preživljava čitljiv ZIP s oštećenim XML-om', async () => {
    const broken = await malformedReadableDocx();

    for (const fixerId of FIXER_IDS) {
      const request: FixerRequest = { fixerId, ruleId: `phase6-${fixerId}`, params: {} };
      const result = await applyFixers(broken, [request]);
      const outputEntries = await readZip(result.docxBytes);
      const document = outputEntries.find((entry) => entry.name === 'word/document.xml');
      expect(document, `${fixerId}: output mora ostati ZIP s document.xml`).toBeDefined();
      expect(document?.data.length, `${fixerId}: document.xml ne smije nestati`).toBeGreaterThan(0);
      expect(result.changelog, `${fixerId}: oštećen XML ne smije proizvesti lažni uspjeh`).toEqual([]);
      expect(result.skipped).toContain(`phase6-${fixerId}`);
    }
  }, 120000);

  it('prepoznaje eksplicitno nepodržanu Word strukturu kao no-op', async () => {
    const base = await buildRepairTemplate('title-page-sections');
    const unsupported = await replaceEntry(
      base,
      'word/document.xml',
      `<w:document ${WORD_NS}><w:body><w:ins w:id="7"><w:p><w:r><w:t>Revizija</w:t></w:r></w:p></w:ins><w:sectPrChange/></w:body></w:document>`,
    );
    const request: FixerRequest = {
      fixerId: 'section-surgery-fixer',
      ruleId: 'phase6-unsupported-section',
      params: { version: 1, operations: [] },
    };
    const result = await applyFixers(unsupported, [request]);
    expect(result.changelog).toEqual([]);
    expect(result.skipped).toEqual(['phase6-unsupported-section']);
    expect(result.skippedReasons['phase6-unsupported-section']).toBe('unsupported-structure');
    await expect(readZip(result.docxBytes)).resolves.toHaveLength((await readZip(unsupported)).length);
  });
});
