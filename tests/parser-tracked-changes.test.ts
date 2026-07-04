/**
 * Parser robustnost na raznolikost izvora (pre-launch checklist P1 4, kod-dio): dokumenti iz
 * LibreOfficea/Google Docsa/Worda cesto nose tracked changes (<w:ins>/<w:del>), komentare i
 * polja. paragraphText (parser.ts) cita iskljucivo vidljivi tekst (w:t/tab/br), pa umetnuti
 * tekst ulazi, obrisani (w:delText) NE ulazi, a komentari i polja su inertni. Ovi testovi
 * fiksiraju to ponasanje bez potrebe za binarnim fixturama iz svakog alata.
 *
 * (Realni .docx exporti iz LibreOffice/Google Docs/Pages ostaju golden fixturi koje dodaje
 *  vlasnik u tests/fixtures/docx/; golden suite se sam preskace dok ih nema.)
 */
import { describe, it, expect } from 'vitest';
import { parseXml, paragraphText } from '../src/docx/parser';
import { first } from '../src/utils/helpers';

const wrap = (inner: string) =>
  `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p>${inner}</w:p></w:body></w:document>`;

function paraText(inner: string): string {
  const doc = parseXml(wrap(inner), 'word/document.xml');
  return paragraphText(first(doc, 'w:p'));
}

describe('parser robustnost: tracked changes, komentari, polja (P1 4)', () => {
  it('ukljucuje umetnuti tekst (<w:ins>)', () => {
    const t = paraText(
      '<w:r><w:t>Prije </w:t></w:r><w:ins w:id="1" w:author="A"><w:r><w:t>umetnuto</w:t></w:r></w:ins><w:r><w:t> poslije</w:t></w:r>',
    );
    expect(t).toContain('umetnuto');
    expect(t).toBe('Prije umetnuto poslije');
  });

  it('iskljucuje obrisani tekst (<w:del> / <w:delText>)', () => {
    const t = paraText(
      '<w:r><w:t>Ostaje</w:t></w:r><w:del w:id="2" w:author="A"><w:r><w:delText>obrisano</w:delText></w:r></w:del>',
    );
    expect(t).not.toContain('obrisano');
    expect(t).toBe('Ostaje');
  });

  it('komentari (<w:commentReference>) su inertni, bez pada i bez dodatnog teksta', () => {
    const t = paraText(
      '<w:r><w:t>Tekst</w:t></w:r><w:commentRangeStart w:id="3"/><w:r><w:commentReference w:id="3"/></w:r><w:commentRangeEnd w:id="3"/>',
    );
    expect(t).toBe('Tekst');
  });

  it('polje (instrText) se ne cita kao vidljivi tekst i ne rusi parser', () => {
    const t = paraText('<w:r><w:t>Str </w:t></w:r><w:r><w:instrText> PAGE </w:instrText></w:r>');
    expect(t).toBe('Str ');
  });

  it('kombinacija ins+del+komentar u istom odlomku daje samo preostali vidljivi tekst', () => {
    const t = paraText(
      '<w:ins w:id="4"><w:r><w:t>Novo </w:t></w:r></w:ins><w:del w:id="5"><w:r><w:delText>staro </w:delText></w:r></w:del><w:r><w:t>ostatak</w:t></w:r><w:r><w:commentReference w:id="6"/></w:r>',
    );
    expect(t).toBe('Novo ostatak');
  });
});
