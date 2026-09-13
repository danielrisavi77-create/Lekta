import { describe, expect, it } from 'vitest';
import { confirmLinks, extractCommentTasks, joinedText, markAddressed, textFingerprint, verifyAgainstChecks } from '../src/mentor/comment-tasks';

/**
 * T13: mentorovi komentari kao lokalni zadaci. Sucelje ne smije tvrditi da je sadrzajna primjedba
 * automatski rijesena; strojnu potvrdu daje samo povezana formalna provjera koja prolazi.
 */
const COMMENTS = `<?xml version="1.0"?><w:comments xmlns:w="w" xmlns:w14="w14">
  <w:comment w:id="0" w:author="Mentor &amp; Co" w:date="2026-09-01T10:00:00Z">
    <w:p w14:paraId="1A2B3C4D"><w:r><w:t xml:space="preserve">Prored </w:t></w:r><w:r><w:t>nije 1,5</w:t></w:r></w:p>
    <w:p><w:r><w:t>i marg&#105;ne provjeri.</w:t></w:r></w:p>
  </w:comment>
  <w:comment w:id="1" w:author="Mentor">
    <w:p w14:paraId="AAAA0001"><w:r><w:t>Argumentacija u 3. poglavlju je slaba.</w:t></w:r></w:p>
  </w:comment>
  <w:comment w:id="2">
    <w:p w14:paraId="BBBB0002"><w:r><w:t>Odgovor u threadu</w:t></w:r></w:p>
  </w:comment>
</w:comments>`;
const DOCUMENT = `<w:document xmlns:w="w"><w:body>
  <w:p><w:r><w:t>Uvod bez komentara.</w:t></w:r></w:p>
  <w:p><w:commentRangeStart w:id="0"/><w:r><w:t>Ovaj odlomak ima prored 1,0.</w:t></w:r><w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r></w:p>
  <w:p><w:r><w:t>Treće poglavlje.</w:t></w:r><w:r><w:commentReference w:id="1"/></w:r></w:p>
</w:body></w:document>`;
const EXTENDED = `<w15:commentsEx xmlns:w15="w15"><w15:commentEx w15:paraId="BBBB0002" w15:paraIdParent="AAAA0001" w15:done="0"/></w15:commentsEx>`;

describe('extractCommentTasks', () => {
  const tasks = extractCommentTasks({ commentsXml: COMMENTS, documentXml: DOCUMENT, commentsExtendedXml: EXTENDED });

  it('sastavlja PUNI tekst iz svih w:t cvorova, s entitetima, ne skraceni isjecak', () => {
    expect(tasks[0].text).toBe('Prored nije 1,5 i margine provjeri.');
    expect(tasks[0].authorLabel).toBe('Mentor & Co');
    expect(tasks[0].commentId).toBe('0');
  });

  it('sidro je otisak teksta odlomka s referencom; bez reference je null, nikad izmisljen', () => {
    expect(tasks[0].anchorKey).toBe(textFingerprint('Ovaj odlomak ima prored 1,0.'));
    expect(tasks[1].anchorKey).toBe(textFingerprint('Treće poglavlje.'));
    expect(tasks[2].anchorKey).toBeNull();
    expect(joinedText('<w:p><w:r><w:t>a</w:t></w:r></w:p><w:p><w:r><w:t>b</w:t></w:r></w:p>')).toBe('a b');
  });

  it('odgovor u threadu je oznacen kao nepodrzan, bez tumacenja', () => {
    expect(tasks[2].unsupported).toBe(true);
    expect(tasks[1].unsupported, 'roditelj s odgovorima je threaded').toBe(true);
    expect(tasks[0].unsupported).toBe(false);
    expect(tasks.every((t) => t.userStatus === 'open' && t.verification === 'not-verified' && t.linkedFindingIds.length === 0)).toBe(true);
  });
});

describe('statusi zadatka', () => {
  const [formalni, sadrzajni] = extractCommentTasks({ commentsXml: COMMENTS, documentXml: DOCUMENT });

  it('sadrzajna primjedka oznacena obradjenom OSTAJE not-verified', () => {
    const addressed = markAddressed(sadrzajni);
    expect(addressed.userStatus).toBe('addressed');
    expect(addressed.verification).toBe('not-verified');
    expect(verifyAgainstChecks(addressed, [{ id: 'line-spacing', status: 'pass' }]).verification).toBe('not-verified');
  });

  it('formal-check-passed daje SAMO povezana formalna provjera koja stvarno prolazi', () => {
    const linked = confirmLinks(formalni, ['line-spacing', 'page.margins']);
    expect(verifyAgainstChecks(linked, [{ id: 'line-spacing', status: 'pass' }, { id: 'page.margins', status: 'pass' }]).verification).toBe('formal-check-passed');
    expect(verifyAgainstChecks(linked, [{ id: 'line-spacing', status: 'pass' }, { id: 'page.margins', status: 'fail' }]).verification).toBe('not-verified');
    expect(verifyAgainstChecks(linked, [{ id: 'line-spacing', status: 'pass' }]).verification).toBe('not-verified');
    expect(verifyAgainstChecks(linked, [{ id: 'line-spacing', status: 'unmeasurable' }, { id: 'page.margins', status: 'pass' }]).verification).toBe('not-verified');
  });

  it('oznaka obradjeno ne mijenja strojnu potvrdu ni u jednom smjeru', () => {
    const verified = verifyAgainstChecks(confirmLinks(formalni, ['line-spacing']), [{ id: 'line-spacing', status: 'pass' }]);
    expect(markAddressed(verified).verification).toBe('formal-check-passed');
    expect(markAddressed(formalni).verification).toBe('not-verified');
  });
});
