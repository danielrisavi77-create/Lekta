import { describe, expect, it } from 'vitest';
import { analyzeFinalDocumentInspector } from './final-document-inspector';

describe('final document inspector', () => {
  it('lokalno pronalazi revizije, komentare, metapodatke, skriveni tekst i polja', () => {
    const result = analyzeFinalDocumentInspector({
      parts: {
        'word/settings.xml': '<w:settings><w:trackRevisions/><w:fldChar w:dirty="true"/></w:settings>',
        'word/document.xml': '<w:document><w:body><w:p><w:ins w:id="3" w:author="Mentor"><w:r><w:t>novo</w:t></w:r></w:ins><w:r><w:rPr><w:vanish/></w:rPr><w:t>skriveno</w:t></w:r><w:bookmarkStart w:id="1" w:name="cilj"/><w:bookmarkEnd w:id="2"/><w:fldSimple><w:instrText>REF nepostojeci</w:instrText></w:fldSimple></w:p></w:body></w:document>',
        'word/comments.xml': '<w:comments><w:comment w:id="7" w:author="Mentor" w:date="2026-01-01"><w:p><w:r><w:t>Komentar</w:t></w:r></w:p></w:comment></w:comments>',
        'docProps/core.xml': '<cp:coreProperties><dc:creator>Prethodni autor</dc:creator><cp:lastModifiedBy>Mentor</cp:lastModifiedBy><cp:revision>4</cp:revision></cp:coreProperties>',
        'word/customXml/item1.xml': '<item>podatak</item>',
      },
    });
    expect(result.summary.revisions).toBe(1);
    expect(result.summary.comments).toBe(1);
    expect(result.summary.hiddenText).toBe(1);
    expect(result.summary.privateMetadata).toBe(3);
    expect(result.summary.customXmlParts).toBe(1);
    expect(result.summary.brokenBookmarks).toBeGreaterThan(0);
    expect(result.findings.some((finding) => finding.id === 'tracking-enabled')).toBe(true);
    expect(result.findings.some((finding) => finding.id === 'stale-fields')).toBe(true);
  });
});
