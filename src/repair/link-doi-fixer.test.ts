import { describe, expect, it } from 'vitest';
import { extractBodyParagraphs } from '../analysis/typography-structure';
import { linkDoiFixer, type LinkDoiFixParams } from './link-doi-fixer';

const documentXml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>doi:10.1234/abc</w:t></w:r></w:p></w:body></w:document>';
const parts = { documentXml, stylesXml: '', documentRelsXml: '<Relationships></Relationships>' };

describe('link DOI fixer', () => {
  it('pretvara DOI u hyperlink i dodaje relaciju', () => {
    const anchor = extractBodyParagraphs(documentXml)[0];
    const params: LinkDoiFixParams = { version: 1, operations: [{ id: 'doi', part: 'word/document.xml', paragraphIndex: 1, start: 0, end: 15, anchorFingerprint: anchor.fingerprint, before: 'doi:10.1234/abc', replacementText: 'https://doi.org/10.1234/abc', targetUrl: 'https://doi.org/10.1234/abc', action: 'normalize-doi', confirmed: true }] };
    const result = linkDoiFixer(parts, params);
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain('w:hyperlink');
    expect(result.parts.documentRelsXml).toContain('https://doi.org/10.1234/abc');
  });

  it('odbija zastarjelo sidro i drugu primjenu označava already-ok', () => {
    const anchor = extractBodyParagraphs(documentXml)[0];
    const params: LinkDoiFixParams = { version: 1, operations: [{ id: 'doi', part: 'word/document.xml', paragraphIndex: 1, start: 0, end: 15, anchorFingerprint: anchor.fingerprint, before: 'doi:10.1234/abc', replacementText: 'https://doi.org/10.1234/abc', targetUrl: 'https://doi.org/10.1234/abc', action: 'normalize-doi', confirmed: true }] };
    const first = linkDoiFixer(parts, params);
    const second = linkDoiFixer(first.parts, params);
    expect(second.reason).toBe('already-ok');
    expect(linkDoiFixer(parts, { ...params, operations: [{ ...params.operations[0], anchorFingerprint: 'stale' }] }).reason).toBe('stale-anchor');
  });

  /**
   * REGRESIJA (2026-08-29): fixer je radio SAMO na runu bez ijednog svojstva.
   *
   * `enclosingRun` je pocetak runa trazio s `lastIndexOf('<w:r', ...)`, a taj niz doslovno
   * pocinje i `<w:rPr>` i `<w:rFonts>`. Kandidat tada ne prolazi `/^<w:r(?:\s|>)/` i fixer
   * odustaje s `unsupported-structure`. Oba oblika ispod Word pise u svakom drugom dokumentu, pa
   * je popravak u praksi bio mrtav; oba testa iznad koriste gol `<w:r><w:t>`, dakle jedini oblik
   * koji je prolazio, pa je kvar godinama bio nevidljiv.
   */
  it.each([
    ['rPr s rFonts (Wordov uobicajen zapis)', '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="24"/></w:rPr>'],
    ['rPr bez rFonts', '<w:rPr><w:sz w:val="24"/></w:rPr>'],
    ['bez rPr (jedini oblik koji je radio i prije)', ''],
  ])('primjenjuje se na run koji ima svojstva: %s', (_label, rPr) => {
    const xml =
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      `<w:p><w:r>${rPr}<w:t>doi:10.1234/abc</w:t></w:r></w:p>` +
      '</w:body></w:document>';
    const localParts = { documentXml: xml, stylesXml: '', documentRelsXml: '<Relationships></Relationships>' };
    const anchor = extractBodyParagraphs(xml)[0];
    const params: LinkDoiFixParams = {
      version: 1,
      operations: [{ id: 'doi', part: 'word/document.xml', paragraphIndex: 1, start: 0, end: 15, anchorFingerprint: anchor.fingerprint, before: 'doi:10.1234/abc', replacementText: 'https://doi.org/10.1234/abc', targetUrl: 'https://doi.org/10.1234/abc', action: 'normalize-doi', confirmed: true }],
    };
    const result = linkDoiFixer(localParts, params);
    expect(result.reason).not.toBe('unsupported-structure');
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain('w:hyperlink');
    // Svojstva runa moraju PREZIVJETI zahvat: popravak DOI-ja ne smije usput promijeniti font
    // ni velicinu, jer bi to bila izmjena oblikovanja koju korisnik nije trazio.
    if (rPr) expect(result.parts.documentXml).toContain(rPr);
  });

  /**
   * REGRESIJA (2026-08-29): DVIJE poveznice u ISTOM runu kvarile su paket.
   *
   * Svaka operacija racuna `beforeText`/`afterText` nad cijelim tekstom svojega runa i gura
   * zamjenu preko CIJELOG raspona tog runa. Dvije operacije nad istim runom time upisu dva zapisa
   * s identicnim `start`/`end`, pa druga zamjena rezuje po vec izmijenjenom nizu.
   *
   * Izmjereno na stvarnom diplomskom radu: jedan bibliografski zapis s dvije URL adrese dao je
   * `word/document.xml: ocekivan </w:p>, a nadjen </w:hyperlink>`. Svaka operacija SAMA je
   * prolazila uredno, pa se kvar vidi tek kad se posalju zajedno. Vrata integriteta su ga uhvatila,
   * ali su odbila CIJELI popravak: korisnik je zbog jedne poveznice gubio i svih ostalih sest
   * zahvata na tom dokumentu.
   */
  it('dvije poveznice u istom runu ne kvare paket', () => {
    const text = 'Vidi https://example.org/prvi i https://example.org/drugi u popisu.';
    const xml =
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      `<w:p><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>${text}</w:t></w:r></w:p>` +
      '</w:body></w:document>';
    const localParts = { documentXml: xml, stylesXml: '', documentRelsXml: '<Relationships></Relationships>' };
    const anchor = extractBodyParagraphs(xml)[0];
    const op = (id: string, start: number, end: number, url: string) => ({
      id, part: 'word/document.xml', paragraphIndex: 1, start, end,
      anchorFingerprint: anchor.fingerprint, before: url, replacementText: url, targetUrl: url,
      action: 'make-hyperlink' as const, confirmed: true as const,
    });
    const first = text.indexOf('https://example.org/prvi');
    const second = text.indexOf('https://example.org/drugi');
    const params: LinkDoiFixParams = {
      version: 1,
      operations: [
        op('a', first, first + 'https://example.org/prvi'.length, 'https://example.org/prvi'),
        op('b', second, second + 'https://example.org/drugi'.length, 'https://example.org/drugi'),
      ],
    };
    const result = linkDoiFixer(localParts, params);
    expect(result.reason).toBeUndefined();
    expect(result.applied).toBe(true);
    const out = result.parts.documentXml;
    // Uravnotezenost je srz tvrdnje: prije popravka je izlaz imao visak zatvaranja hiperveze.
    expect((out.match(/<w:hyperlink\b/g) ?? []).length).toBe((out.match(/<\/w:hyperlink>/g) ?? []).length);
    expect((out.match(/<w:p\b/g) ?? []).length).toBe((out.match(/<\/w:p>/g) ?? []).length);
    // Autorov tekst mora prezivjeti: mijenja se mehanika poveznice, ne recenica.
    expect(out.replace(/<[^>]+>/g, '')).toBe(text);
  });
});
