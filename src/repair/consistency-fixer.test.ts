import { describe, expect, it } from 'vitest';
import { consistencyFixer, type ConsistencyFixParams } from './consistency-fixer';
import { paragraphFingerprint } from '../analysis/typography-structure';

function parts(documentXml: string) {
  const paragraph = documentXml.match(/<w:p>[\s\S]*?<\/w:p>/)?.[0] ?? '';
  return { documentXml, stylesXml: '', packageXmlParts: { 'word/document.xml': documentXml, 'docProps/core.xml': '<cp:coreProperties><dc:title>Stari naslov</dc:title></cp:coreProperties>' }, paragraph };
}

describe('consistency-fixer', () => {
  it('mijenja samo potvrđeni raspon i čuva run oblikovanje', () => {
    const xml = '<w:document><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>EU</w:t></w:r><w:r><w:t> ostaje</w:t></w:r></w:p><w:sectPr/></w:body></w:document>';
    const p = parts(xml);
    const params: ConsistencyFixParams = { version: 1, groups: [{ id: 'g', zone: 'terminology', canonicalText: 'Europska unija', confirmed: true }], replacements: [{ id: 'r', groupId: 'g', part: 'word/document.xml', paragraphIndex: 1, start: 0, end: 2, before: 'EU', replacementText: 'Europska unija', anchorFingerprint: paragraphFingerprint(p.paragraph), confirmed: true }] };
    const result = consistencyFixer(p, params);
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain('<w:rPr><w:b/></w:rPr><w:t>Europska unija</w:t>');
    expect(result.parts.documentXml).toContain(' ostaje');
  });

  it('atomski odbija zastarjelo sidro i drugi prolaz je already-ok', () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>EU</w:t></w:r></w:p><w:sectPr/></w:body></w:document>';
    const p = parts(xml);
    const params: ConsistencyFixParams = { version: 1, groups: [{ id: 'g', zone: 'terminology', canonicalText: 'EU', confirmed: true }], replacements: [{ id: 'r', groupId: 'g', part: 'word/document.xml', paragraphIndex: 1, start: 0, end: 2, before: 'EU', replacementText: 'EU', anchorFingerprint: 'staro', confirmed: true }] };
    expect(consistencyFixer(p, params).reason).toBe('stale-anchor');
    const ok = consistencyFixer(p, { ...params, replacements: [{ ...params.replacements[0], anchorFingerprint: paragraphFingerprint(p.paragraph), replacementText: 'Europska unija', before: 'EU' }] });
    expect(ok.applied).toBe(true);
    const second = consistencyFixer(ok.parts, { ...params, replacements: [{ ...params.replacements[0], anchorFingerprint: paragraphFingerprint(p.paragraph), replacementText: 'Europska unija', before: 'EU' }] });
    expect(second.reason).toBe('already-ok');
  });

  it('ažurira samo potvrđeni naslov u core metapodacima', () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>Naslov</w:t></w:r></w:p><w:sectPr/></w:body></w:document>';
    const p = parts(xml);
    const params: ConsistencyFixParams = { version: 1, groups: [{ id: 'g', zone: 'document-metadata', canonicalText: 'Novi naslov', confirmed: true }], replacements: [{ id: 'm', groupId: 'g', part: 'docProps/core.xml', before: 'Stari naslov', replacementText: 'Novi naslov', anchorFingerprint: paragraphFingerprint(p.packageXmlParts['docProps/core.xml']), metadataField: 'dc:title', confirmed: true }] };
    const result = consistencyFixer(p, params);
    expect(result.applied).toBe(true);
    expect(result.parts.packageXmlParts?.['docProps/core.xml']).toContain('Novi naslov');
  });
});
