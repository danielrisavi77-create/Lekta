import { describe, expect, it } from 'vitest';
import { submissionMetadataFingerprint } from '../analysis/cross-file-submission-consistency';
import { submissionMetadataFixer, type SubmissionMetadataFixParams } from './submission-metadata-fixer';
import type { DocxXmlParts } from './fixers';

const core = '<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:title>Stari naslov</dc:title><dc:creator>Horvat</dc:creator></cp:coreProperties>';
const parts: DocxXmlParts = { documentXml: '<w:document/>', stylesXml: '<w:styles/>', packageXmlParts: { 'docProps/core.xml': core } };

describe('submission metadata fixer', () => {
  it('mijenja samo potvrđeni naslov u core.xml i idempotentan je', () => {
    const params: SubmissionMetadataFixParams = {
      version: 1,
      fields: [{ field: 'title', part: 'docProps/core.xml', before: 'Stari naslov', replacementText: 'Novi naslov', fingerprint: submissionMetadataFingerprint('title', 'Stari naslov'), confirmed: true }],
    };
    const first = submissionMetadataFixer(parts, params);
    expect(first.applied).toBe(true);
    expect(first.parts.packageXmlParts?.['docProps/core.xml']).toContain('Novi naslov');
    expect(submissionMetadataFixer(first.parts, params).reason).toBe('already-ok');
  });

  it('odbija promijenjeni core part prije izmjene', () => {
    const params: SubmissionMetadataFixParams = {
      version: 1,
      fields: [{ field: 'author', part: 'docProps/core.xml', before: 'Drugi autor', replacementText: 'Novi autor', fingerprint: submissionMetadataFingerprint('author', 'Drugi autor'), confirmed: true }],
    };
    expect(submissionMetadataFixer(parts, params).reason).toBe('stale-anchor');
  });
});
