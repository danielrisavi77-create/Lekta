import { describe, expect, it } from 'vitest';

import { readZip, writeZip } from '../src/repair/zip-codec';
import { prepareFieldStableTarget } from '../scripts/repair-runner-e2e-target.mts';

const enc = new TextEncoder();
const dec = new TextDecoder();
const visibleText = 'Vlada UAE. Pristupljeno 8. kolovoza 2026.';
const documentXml = [
  '<w:document><w:body><w:p>',
  `<w:r><w:t>${visibleText}</w:t></w:r>`,
  '<w:r><w:fldChar w:fldCharType="begin"/></w:r>',
  '<w:r><w:instrText> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>',
  '<w:r><w:instrText> PAGEREF _Toc1 \\h </w:instrText></w:r>',
  '<w:r><w:fldChar w:fldCharType="end"/></w:r>',
  '</w:p>',
  '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>',
  '<w:r><w:instrText> PAGE </w:instrText></w:r>',
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r>',
  '<w:r><w:t>1</w:t></w:r>',
  '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>',
  '</w:body></w:document>',
].join('');

async function fixture(): Promise<Uint8Array> {
  return writeZip([
    { name: '[Content_Types].xml', data: enc.encode('<Types/>') },
    { name: 'word/document.xml', data: enc.encode(documentXml) },
    { name: 'word/settings.xml', data: enc.encode('<w:settings/>') },
  ]);
}

describe('repair-runner E2E field-stable target preparation', () => {
  it('removes only the explicit orphan TOC control and is byte-idempotent', async () => {
    const result = await prepareFieldStableTarget(await fixture());

    expect(result.removedFields).toBe(1);
    expect(result.request).toMatchObject({
      fixerId: 'field-integrity-fixer',
      ruleId: 'field-integrity-orphan-control',
      params: { fields: [{ action: 'remove-orphan-control' }] },
    });
    expect(result.request?.params).not.toHaveProperty('settings');

    expect(result.requiresConfirmation).toBe(true);
    expect(result.confirmationText).toContain('strukturu Word polja');
    const entries = await readZip(result.docxBytes);
    const repairedXml = dec.decode(entries.find((entry) => entry.name === 'word/document.xml')?.data);
    expect(repairedXml).toContain(`<w:t>${visibleText}</w:t>`);
    expect(repairedXml).not.toContain('PAGEREF _Toc1');
    expect(repairedXml).toContain('<w:instrText> PAGE </w:instrText>');

    const repeated = await prepareFieldStableTarget(result.docxBytes);
    expect(repeated.request).toBeNull();
    expect(repeated.removedFields).toBe(0);
    expect(repeated.requiresConfirmation).toBe(false);
    expect(repeated.confirmationText).toBeNull();
    expect(repeated.docxBytes).toBe(result.docxBytes);
  });
});
