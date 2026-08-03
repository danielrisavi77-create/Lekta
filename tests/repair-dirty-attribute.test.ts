/**
 * RE-47: `w:dirty="true"` se umetao regexom `replace(/>$/, ' w:dirty="true">')`, koji kod
 * SAMOZATVARAJUCEG taga proizvodi NEVALJAN XML:
 *
 *   <w:fldChar w:fldCharType="begin"/>   ->   <w:fldChar w:fldCharType="begin"/ w:dirty="true">
 *                                                                              ^ atribut IZA kose crte
 *
 * Posljedica je bila dvostruka i tiha:
 *   1. isporuceni .docx nosi neispravan XML (Word ga tolerira, strogi parseri ne moraju),
 *   2. vlastiti regex parser (extractBodyParagraphs) na tom mjestu prestane ispravno brojati
 *      odlomke - na stvarnom diplomskom radu 392 -> 71 - pa SVI kasniji anchor-osjetljivi
 *      fixeri (croatian-typography, link-doi, consistency, field-integrity...) vracaju
 *      'no-target' iako s dokumentom nije bilo nista.
 *
 * Isti obrazac postojao je na tri mjesta: xml-patch.ts (fldSimple + fldChar) i
 * field-integrity-fixer.ts. Test cuva SVA tri.
 */
import { describe, it, expect } from 'vitest';
import { markTocFieldsDirty } from '../src/repair/xml-patch';
import { extractBodyParagraphs } from '../src/analysis/typography-structure';
// Faza A: guard vise ne zivi kao lokalna kopija po testovima nego u src/repair/package-integrity.ts,
// odakle ga koristi i sam motor (ukljucujuci Deno Edge Function).
import { hasAttributeAfterSlash } from '../src/repair/package-integrity';

const HEADER =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>';
const FOOTER = '</w:body></w:document>';

describe('markTocFieldsDirty: w:dirty ne smije razbiti samozatvarajuci tag', () => {
  it('SAMOZATVARAJUCI <w:fldChar .../> ostaje valjan XML', () => {
    const xml =
      HEADER +
      '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
      '<w:r><w:t>Sadrzaj</w:t></w:r>' +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>' +
      '<w:p><w:r><w:t>Tijelo rada.</w:t></w:r></w:p>' +
      FOOTER;

    const out = markTocFieldsDirty(xml);
    expect(out.applied).toBe(true);
    expect(hasAttributeAfterSlash(out.xml), `neispravan XML: ${out.xml.slice(0, 400)}`).toBe(false);
    expect(out.xml).toContain('w:dirty="true"');
    // Kljucna posljedica: parser i dalje vidi SVE odlomke (prije popravka je brojao manje).
    expect(extractBodyParagraphs(out.xml)).toHaveLength(extractBodyParagraphs(xml).length);
  });

  it('NE-samozatvarajuci <w:fldSimple ...> i dalje dobiva atribut ispravno', () => {
    const xml =
      HEADER +
      '<w:p><w:fldSimple w:instr=" TOC \\o &quot;1-3&quot; \\h "><w:r><w:t>Sadrzaj</w:t></w:r></w:fldSimple></w:p>' +
      '<w:p><w:r><w:t>Tijelo rada.</w:t></w:r></w:p>' +
      FOOTER;

    const out = markTocFieldsDirty(xml);
    expect(out.applied).toBe(true);
    expect(hasAttributeAfterSlash(out.xml)).toBe(false);
    expect(out.xml).toContain('w:dirty="true"');
    expect(extractBodyParagraphs(out.xml)).toHaveLength(extractBodyParagraphs(xml).length);
  });

  it('SAMOZATVARAJUCI <w:fldSimple .../> ostaje valjan XML', () => {
    const xml =
      HEADER +
      '<w:p><w:fldSimple w:instr=" TOC \\h "/></w:p>' +
      '<w:p><w:r><w:t>Tijelo rada.</w:t></w:r></w:p>' +
      FOOTER;

    const out = markTocFieldsDirty(xml);
    expect(hasAttributeAfterSlash(out.xml), `neispravan XML: ${out.xml.slice(0, 400)}`).toBe(false);
    expect(extractBodyParagraphs(out.xml)).toHaveLength(extractBodyParagraphs(xml).length);
  });
});
