import { describe, expect, it } from 'vitest';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { applyFixers } from '../src/repair/apply-fixers';
import { resolveParams } from '../src/repair/param-authority';
import { readZip } from '../src/repair/zip-codec';
import { buildDocxFile } from './helpers/docx-builder';

const PROFILE_ID = 'hks-diplomski';
const RULE_ID = `${PROFILE_ID}--line-spacing`;
const FIXER_ID = 'line-spacing-fixer' as const;
const STYLE_WITH_ONE_AND_A_HALF_SPACING =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
  '<w:name w:val="Normal"/><w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr>' +
  '</w:style></w:styles>';

describe('profile authority to repair engine: line spacing overrides', () => {
  it('keeps the profile multiplier, forwards deep, fixes direct 1.0 overrides, and is idempotent', async () => {
    const sourceFile = buildDocxFile({
      stylesXml: STYLE_WITH_ONE_AND_A_HALF_SPACING,
      paragraphs: [
        { text: 'Prvi odlomak s izravno zadanim jednostrukim proredom.', font: 'Book Antiqua', sizePt: 11, spacingLine: 240, jc: 'both' },
        { text: 'Drugi odlomak s istim izravnim odstupanjem od profila.', font: 'Book Antiqua', sizePt: 11, spacingLine: 240, jc: 'both' },
      ],
    }, 'direct-spacing-override.docx');
    const source = new Uint8Array(await sourceFile.arrayBuffer());
    const analyze = (bytes: Uint8Array) => analyzeFixture(new File([bytes], 'direct-spacing-override.docx'), { profileId: PROFILE_ID });
    const spacingCheck = (result: Awaited<ReturnType<typeof analyze>>) => result.checks.find((check) => check.id === 'format.spacing.body');
    const before = await analyze(source);
    expect(spacingCheck(before)?.status).toBe('fail');
    expect(spacingCheck(before)?.detail).toBe('1.00');

    const resolved = resolveParams(PROFILE_ID, RULE_ID, FIXER_ID, { multiplier: 9, deep: true, injected: 'ignore-me' });
    expect(resolved).toEqual({ source: 'profile', params: { multiplier: 1.5, deep: true } });
    const request = { ruleId: RULE_ID, fixerId: FIXER_ID, params: resolved.params };
    const first = await applyFixers(source, [request]);
    expect(first.integrityFailure ?? null).toBeNull();
    expect(first.changelog).toHaveLength(1);
    expect(first.changelog[0].afterLabel).toContain('izravno formatiranje uklonjeno u 2 odlomaka');

    const repairedEntries = await readZip(first.docxBytes);
    const documentXml = new TextDecoder().decode(repairedEntries.find((entry) => entry.name === 'word/document.xml')!.data);
    expect(documentXml).not.toContain('w:line="240"');
    expect(documentXml).toContain('Prvi odlomak s izravno zadanim jednostrukim proredom.');
    expect(documentXml).toContain('Drugi odlomak s istim izravnim odstupanjem od profila.');

    const after = await analyze(first.docxBytes);
    expect(spacingCheck(after)?.status).toBe('pass');
    expect(spacingCheck(after)?.detail).toBe('1.50');

    const second = await applyFixers(first.docxBytes, [request]);
    expect(second.integrityFailure ?? null).toBeNull();
    expect(second.changelog).toHaveLength(0);
    expect(second.docxBytes).toEqual(first.docxBytes);
  });
});
