/**
 * Closed-loop-lite provjera submission-metadata-fixer-a (Batch 6, zadnji fixer).
 *
 * Arhitektonski poseban slucaj: result.details.crossFileSubmissionConsistency racuna SAMO
 * src/ui/app.ts (buildCrossFileSubmissionConsistency, UI sloj lijeno pozvan iz "Moji popravci"
 * toka), NIKAD src/analysis/analyze-docx.ts - pa analyzeFixture(file,{profileId}) preko golden-entry.ts
 * ovo nikad ne populira, neovisno o profilu. Isto ogranicenje kao legal-footnote-repair-fixer u
 * repair-closed-loop-citations.test.ts: rucno konstruiramo "before" nalaz (isti oblik kao
 * src/repair/submission-metadata-fixer.test.ts), ali PRIMJENA i PROVJERA IZLAZA idu nad stvarnim
 * docx bajtovima kroz stvarni applyFixers + stvarnu ponovnu analizu.
 */
import { describe, expect, it } from 'vitest';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { crossFileSubmissionRepairableItem } from '../src/ui/repair-items';
import { applyFixers } from '../src/repair/apply-fixers';
import { submissionMetadataFingerprint } from '../src/analysis/cross-file-submission-consistency';
import { readZip } from '../src/repair/zip-codec';
import { packageDoc, paragraph, documentXml } from './helpers/repair-templates';
import { documentText } from './helpers/closed-loop-runner';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const WORD_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

describe('Repair Engine closed-loop-lite: submission-metadata-fixer', () => {
  it('fer-diplomski: docProps/core.xml naslov ne odgovara prepoznatom naslovu na naslovnici', async () => {
    const profileId = 'fer-diplomski';
    const profile = resolveProfile(profileId) as any;
    const staleTitle = 'Stari, zastarjeli naslov rada';
    const canonicalTitle = 'Analiza distribuiranih sustava u stvarnom vremenu';
    const stylesXml = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
    const body = documentXml(`${paragraph(canonicalTitle)}${paragraph('Tijelo teksta rada koje slijedi.')}`);
    const docPropsCoreXml = `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${staleTitle}</dc:title></cp:coreProperties>`;
    const bytes = await packageDoc({ documentXml: body, stylesXml, docPropsCoreXml });

    const result = {
      details: {
        crossFileSubmissionConsistency: {
          issues: [{
            id: 'title-mismatch', field: 'title', status: 'mismatch', severity: 'warning', reason: 'docProps naslov ne odgovara prepoznatom naslovu na naslovnici',
            suggestedCanonical: canonicalTitle,
            values: [{ value: staleTitle, source: 'docx-metadata', fingerprint: submissionMetadataFingerprint('title', staleTitle) }],
          }],
          summary: { text: '1 nesklad u naslovu' },
          files: [{ name: 'rad.docx' }],
        },
      },
    };
    const items = crossFileSubmissionRepairableItem(result, profile);
    expect(items.length).toBeGreaterThan(0);
    const form = items[0].crossFileSubmissionForm!;
    const confirmedForm = { ...form, issues: form.issues.map((issue) => ({ ...issue, selected: true })) };
    const requests = [{ fixerId: items[0].fixerId, ruleId: items[0].ruleId, params: form.buildParams(confirmedForm) }];

    const beforeBodyText = await documentText(bytes);
    const applied = await applyFixers(bytes, requests);
    expect(applied.changelog.length, 'barem jedna stavka mora stvarno promijeniti dokument').toBeGreaterThan(0);

    const afterEntries = await readZip(applied.docxBytes);
    const afterCore = new TextDecoder().decode(afterEntries.find((entry) => entry.name === 'docProps/core.xml')!.data);
    expect(afterCore).toContain(canonicalTitle);
    expect(afterCore).not.toContain(staleTitle);
    // Tijelo dokumenta (autorski tekst) ostaje netaknuto - popravak dira SAMO docProps/core.xml.
    expect(await documentText(applied.docxBytes)).toBe(beforeBodyText);

    const outputFile = new File([applied.docxBytes], 'submission-metadata-fixed.docx', { type: DOCX_MIME });
    await expect(analyzeFixture(outputFile, { profileId })).resolves.toBeDefined();

    const second = await applyFixers(applied.docxBytes, requests);
    expect(second.changelog).toEqual([]);
    expect(second.docxBytes).toBe(applied.docxBytes);
  }, 30000);
});
