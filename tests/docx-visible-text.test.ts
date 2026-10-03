import { describe, expect, it } from 'vitest';
import { writeZip } from '../src/repair/zip-codec.ts';
import { documentText } from '../src/verification/docx-visible-text.ts';

const docx = (body: string) => writeZip([{
  name: 'word/document.xml',
  data: new TextEncoder().encode(`<w:document><w:body>${body}</w:body></w:document>`),
}]);

describe('vidljivi DOCX tekst', () => {
  it('samozatvarajuci w:t ne proguta sljedeci element ni tekst', async () => {
    expect(await documentText(await docx('<w:p><w:t/><w:tab/><w:t>Poslije</w:t></w:p>'))).toBe('Poslije');
  });

  it('dekodira decimalne i heksadekadske numericke entitete', async () => {
    expect(await documentText(await docx('<w:t>&#269;&#x17E;&amp;</w:t>'))).toBe('čž&');
  });
});
