import { describe, expect, it } from 'vitest';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';
import { applyFixers, type FixerRequest } from '../src/repair/apply-fixers';
import { sectionAnchorFingerprint } from '../src/analysis/section-structure';
import { buildRepairTemplate } from './helpers/repair-templates';
import { assertPackageIntact } from './helpers/docx-package-assert';
import { readZip } from '../src/repair/zip-codec';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function documentText(bytes: Uint8Array): Promise<string> {
  const entries = await readZip(bytes);
  const document = entries.find((entry) => entry.name === 'word/document.xml');
  if (!document) throw new Error('DOCX nema word/document.xml');
  const xml = new TextDecoder().decode(document.data);
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
    .join('');
}

async function assertCombinedScenario(
  templateId: Parameters<typeof buildRepairTemplate>[0],
  requests: FixerRequest[],
): Promise<void> {
  const input = await buildRepairTemplate(templateId);
  const beforeText = await documentText(input);
  const first = await applyFixers(input, requests);
  expect(first.changelog.length, `${templateId}: kombinacija mora imati barem jednu promjenu`).toBeGreaterThan(0);
  expect(new Set(first.changelog.map((entry) => entry.fixerId)).size).toBeGreaterThan(1);
  expect(await documentText(first.docxBytes)).toBe(beforeText);
  // Faza A (RE-47): kombinacija vise fixera je najizlozenija tocka - svaki pise nad izlazom
  // prethodnog, pa neispravan XML nastaje bas ovdje. Prije se provjeravao samo tekst.
  await assertPackageIntact(input, first.docxBytes, `${templateId}: kombinirani prolaz`);

  const profileId = VERIFIED_PROFILE_REGISTRY[0]?.id;
  expect(profileId).toBeTruthy();
  const output = new File([first.docxBytes], `${templateId}-combined.docx`, { type: DOCX_MIME });
  await expect(analyzeFixture(output, { profileId: profileId! })).resolves.toBeDefined();

  const second = await applyFixers(first.docxBytes, requests);
  expect(second.changelog, `${templateId}: drugi prolaz mora biti no-op`).toEqual([]);
  expect(second.docxBytes, `${templateId}: no-op mora zadržati istu referencu`).toBe(first.docxBytes);
}

describe('Repair Engine kombinirani scenariji', () => {
  it('osnovno oblikovanje: margine, font, prored, poravnanje i razmak odlomaka', async () => {
    await assertCombinedScenario('basic-text-styles', [
      { fixerId: 'margins-fixer', ruleId: 'phase5-margins', params: { top: 2, right: 2, bottom: 2, left: 2 } },
      { fixerId: 'font-fixer', ruleId: 'phase5-font', params: { fontName: 'Times New Roman', fontSizePt: 12 } },
      { fixerId: 'line-spacing-fixer', ruleId: 'phase5-line-spacing', params: { multiplier: 1.5 } },
      { fixerId: 'alignment-fixer', ruleId: 'phase5-alignment', params: { val: 'both' } },
      { fixerId: 'paragraph-spacing-fixer', ruleId: 'phase5-paragraph-spacing', params: {} },
    ]);
  }, 120000);

  it('naslovi i numeriranje: formatiranje stila zajedno sa strukturnim mapiranjem', async () => {
    await assertCombinedScenario('headings-numbering', [
      { fixerId: 'heading-format-fixer', ruleId: 'phase5-heading-format', params: { targets: [{ level: 1, sizeHalfPoints: 32, bold: true }] } },
      {
        fixerId: 'heading-style-fixer',
        ruleId: 'phase5-heading-style',
        params: {
          targets: [{ paragraphIndex: 1, level: 1, numbered: true, removeManualNumbering: false }],
          options: { numbering: { maxLevel: 3, format: 'decimal', trailingDot: true } },
        },
      },
    ]);
  }, 120000);

  it('sekcije i numeriranje: promjena geometrije ne prekida page-number popravak', async () => {
    await assertCombinedScenario('title-page-sections', [
      {
        fixerId: 'section-surgery-fixer',
        ruleId: 'phase5-section-surgery',
        params: {
          version: 1,
          operations: [
            { id: 'main-geo', kind: 'set-geometry', sectionOrdinal: 1, anchorFingerprint: sectionAnchorFingerprint('', 3), orientation: 'landscape', confirmed: true },
          ],
        },
      },
      {
        fixerId: 'page-numbering-fixer',
        ruleId: 'phase5-page-numbering',
        params: { targets: [{ sectionIndex: 0, fmt: 'upperRoman', start: 1 }, { sectionIndex: 1, fmt: 'decimal', start: 1 }] },
      },
    ]);
  }, 120000);
});
