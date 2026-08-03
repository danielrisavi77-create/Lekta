/**
 * RE-49: fieldIntegrityFixer je polja obradjivao redom kojim su stigla (rastuci offset) i pritom
 * XML MIJENJAO unutar iste petlje. Umetanje `w:dirty="true"` produzi dokument, pa je svako
 * SLJEDECE polje trazeno na offsetu izracunatom nad IZVORNIM XML-om - dakle promasaj - i fixer
 * je vracao 'stale-anchor' za cijeli zahtjev.
 *
 * Na stvarnom diplomskom radu to je znacilo da nijedno od 79 Word polja nije osvjezeno.
 *
 * Ispravno: obradjuj od NAJVECEG offseta prema najmanjem (izmjena tada ne pomice jos neobradjena
 * polja, isti obrazac koji bibliography-repair-fixer vec koristi za raspone odlomaka), a polje
 * koje se ne da uskladiti preskoci pojedinacno umjesto da obori sve.
 */
import { describe, it, expect } from 'vitest';
import { fieldIntegrityFixer } from '../src/repair/field-integrity-fixer';
import { analyzeFieldIntegrity } from '../src/analysis/field-integrity';
import type { DocxXmlParts } from '../src/repair/fixers';

const HEADER =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>';
const FOOTER = '</w:body></w:document>';

/** Dva NEOVISNA PAGEREF polja (klasican cross-reference), oba kandidat za mark-dirty. */
const FIELD = (target: string) =>
  '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  `<w:r><w:instrText xml:space="preserve"> PAGEREF ${target} \\h </w:instrText></w:r>` +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
  '<w:r><w:t>7</w:t></w:r>' +
  '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';

const DOCUMENT_XML = HEADER + FIELD('_Ref111') + '<w:p><w:r><w:t>Tekst.</w:t></w:r></w:p>' + FIELD('_Ref222') + FOOTER;

// Stvarni Word dokument uvijek ima settings.xml (provjereno na diplomskom radu); fixer ga treba
// za updateFieldsOnOpen, pa ga fixture mora imati da testira BAS offset putanju.
const SETTINGS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:settings>';

function parts(): DocxXmlParts {
  return {
    documentXml: DOCUMENT_XML,
    stylesXml: '',
    contentTypesXml: '',
    documentRelsXml: '',
    addedParts: [],
    addedPackageParts: [],
    existingParts: [],
    footerHeaderParts: {},
    packageXmlParts: { 'word/document.xml': DOCUMENT_XML, 'word/settings.xml': SETTINGS_XML },
    removedPackageParts: [],
  } as unknown as DocxXmlParts;
}

describe('fieldIntegrityFixer: vise polja u istom dijelu', () => {
  it('osvjezi SVA polja, ne samo prvo (offseti se ne smiju pomaknuti pod nogama)', () => {
    // Fingerprinti dolaze iz iste analize koju koristi klijent.
    const integrity = analyzeFieldIntegrity({ parts: { 'word/document.xml': DOCUMENT_XML } });
    const fields = integrity.fields.filter((f) => f.kind !== 'unknown');
    expect(fields.length, 'fixture mora imati barem dva polja').toBeGreaterThanOrEqual(2);

    const params = {
      version: 1 as const,
      fields: fields.map((f) => ({
        id: f.id, part: f.part, anchorFingerprint: f.anchorFingerprint,
        action: 'mark-dirty' as const, confirmed: true as const,
      })),
      settings: { updateFieldsOnOpen: true as const },
    };

    const out = fieldIntegrityFixer(parts(), params as never);
    expect(out.reason, `fixer je odustao: ${out.reason}`).toBeUndefined();
    expect(out.applied).toBe(true);

    // SVAKO polje mora biti oznaceno, ne samo prvo.
    const dirtyCount = (out.parts.documentXml.match(/w:dirty="true"/g) || []).length;
    expect(dirtyCount).toBe(fields.length);
    // I dalje valjan XML (RE-47): nikad atribut iza kose crte.
    expect(/\/\s+[a-zA-Z:_-]+\s*=/.test(out.parts.documentXml)).toBe(false);
  });
});
