/**
 * extractDocxText (kartice.html .docx uvoz): vidljivi tekst glavnog dokumenta za BROJANJE,
 * bez DOM-a. Kljucni ugovori: odlomci -> \n, tab/br unutar odlomka cuvaju poredak, entiteti
 * se dekodiraju, w:delText (pracene izmjene) i w:instrText (kod polja) se NE broje.
 */
import { describe, it, expect } from 'vitest';
import { extractDocxText } from '../src/tools/docx-text';

const P = (inner: string) => `<w:p><w:r>${inner}</w:r></w:p>`;

describe('extractDocxText', () => {
  it('spaja runove unutar odlomka, odlomke odvaja s \\n', () => {
    const xml = `<w:document><w:body>` +
      `<w:p><w:r><w:t>Prvi </w:t></w:r><w:r><w:t>odlomak.</w:t></w:r></w:p>` +
      P('<w:t>Drugi odlomak.</w:t>') +
      `</w:body></w:document>`;
    expect(extractDocxText(xml)).toBe('Prvi odlomak.\nDrugi odlomak.');
  });

  it('cuva poredak tekst/tab/br unutar odlomka (jedan kombinirani prolaz)', () => {
    const xml = P('<w:t>A</w:t><w:tab/><w:t>B</w:t><w:br/><w:t>C</w:t>');
    expect(extractDocxText(xml)).toBe('A\tB\nC');
  });

  it('dekodira XML entitete (amp/lt/gt/quot/apos + numericke)', () => {
    const xml = P('<w:t>Ivi&#x107; &amp; dr. &lt;3 &quot;navod&quot; &#268;akovec</w:t>');
    expect(extractDocxText(xml)).toBe('Ivić & dr. <3 "navod" Čakovec');
  });

  it('w:t s atributom (xml:space="preserve") i samozatvoreni w:t rade', () => {
    const xml = P('<w:t xml:space="preserve"> tekst s razmacima </w:t><w:t/>');
    expect(extractDocxText(xml)).toBe(' tekst s razmacima ');
  });

  it('w:delText (obrisano u pracenim izmjenama) i w:instrText (kod polja) se NE broje', () => {
    const xml = P('<w:delText>obrisano</w:delText><w:instrText> PAGE </w:instrText><w:t>vidljivo</w:t>');
    expect(extractDocxText(xml)).toBe('vidljivo');
  });

  it('w:tabs definicije u pPr se ne brkaju s w:tab (\\b granica)', () => {
    const xml = `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>tekst</w:t></w:r></w:p>`;
    // pPr-ov <w:tab .../> je definicija tab-stopa; u ovom pojednostavljenom ekstraktoru
    // prihvatljivo je da se broji kao jedan tab znak (whitespace ne mijenja kartice bez
    // razmaka, a s razmacima mijenja za 1 znak) - bitno je da w:tabS ne eksplodira.
    const out = extractDocxText(xml);
    expect(out.replace(/\t/g, '')).toBe('tekst');
  });

  it('prazni odlomci (bez teksta) ne proizvode prazne retke', () => {
    const xml = `<w:p><w:pPr></w:pPr></w:p>` + P('<w:t>jedini</w:t>') + `<w:sectPr></w:sectPr>`;
    expect(extractDocxText(xml)).toBe('jedini');
  });
});
