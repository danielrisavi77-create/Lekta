import { describe, expect, it } from 'vitest';
import { analyzeFinalDocumentInspector, inspectorFingerprint } from '../analysis/final-document-inspector';
import { finalDocumentInspectorFixer, type FinalDocumentInspectorParams } from './final-document-inspector-fixer';
import type { DocxXmlParts } from './fixers';

describe('finalDocumentInspectorFixer', () => {
  it('atomski prihvaća reviziju, uklanja komentar i privatna polja', () => {
    const packageXmlParts = {
      'word/settings.xml': '<w:settings><w:trackRevisions/></w:settings>',
      'word/document.xml': '<w:document><w:body><w:p><w:ins w:id="3"><w:r><w:t>novo</w:t></w:r></w:ins><w:commentRangeStart w:id="7"/><w:r><w:rPr><w:vanish/></w:rPr><w:t>skriveno</w:t></w:r><w:commentRangeEnd w:id="7"/><w:r><w:commentReference w:id="7"/></w:p></w:body></w:document>',
      'word/comments.xml': '<w:comments><w:comment w:id="7"><w:p><w:r><w:t>Komentar</w:t></w:r></w:p></w:comment></w:comments>',
      'docProps/core.xml': '<cp:coreProperties><dc:creator>Autor</dc:creator></cp:coreProperties>',
    };
    const analysis = analyzeFinalDocumentInspector({ parts: packageXmlParts });
    const revision = analysis.findings.find((finding) => finding.category === 'revisions')!.evidence[0];
    const comment = analysis.findings.find((finding) => finding.category === 'comments')!.evidence[0];
    const metadata = analysis.findings.find((finding) => finding.category === 'private-metadata')!.evidence[0];
    const hidden = analysis.findings.find((finding) => finding.category === 'hidden-text')!.evidence[0];
    const hiddenRun = [...packageXmlParts['word/document.xml'].matchAll(/<w:r\b[^>]*>[^]*?<\/w:r\s*>/gi)].find((match) => /<w:(?:vanish|specVanish)\b/i.test(match[0]))!;
    const hiddenDisplay = [...hiddenRun[0].matchAll(/<w:t\b[^>]*>([^]*?)<\/w:t\s*>/gi)].map((match) => match[1]).join(' ').slice(0, 160);
    expect(inspectorFingerprint('word/document.xml', 'hidden-run:' + hiddenRun.index + '|' + hiddenDisplay)).toBe(hidden.fingerprint);
    const parts: DocxXmlParts = { documentXml: packageXmlParts['word/document.xml'], stylesXml: '', packageXmlParts };
    const params: FinalDocumentInspectorParams = {
      version: 1,
      revisions: [{ part: 'word/document.xml', revisionId: revision.revisionId!, action: 'accept', anchorFingerprint: revision.fingerprint, confirmed: true }],
      comments: [{ commentId: comment.commentId!, anchorFingerprint: comment.fingerprint, action: 'remove', confirmed: true }],
      metadata: [{ part: 'core', field: metadata.field!, fingerprint: metadata.fingerprint, action: 'remove', confirmed: true }],
      hiddenText: [{ part: 'word/document.xml', anchorFingerprint: hidden.fingerprint, action: 'remove', confirmed: true }],
      settings: { disableTracking: true },
    };
    const first = finalDocumentInspectorFixer(parts, params);
    expect(first.applied).toBe(true);
    expect(first.parts.packageXmlParts?.['word/document.xml']).not.toContain('w:ins');
    expect(first.parts.packageXmlParts?.['word/document.xml']).not.toContain('skriveno');
    expect(first.parts.packageXmlParts?.['word/comments.xml']).toBeUndefined();
    expect(first.parts.packageXmlParts?.['docProps/core.xml']).not.toContain('Autor');
    expect(first.parts.packageXmlParts?.['word/settings.xml']).not.toContain('trackRevisions');
    const second = finalDocumentInspectorFixer(first.parts, params);
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('already-ok');
  });
});
