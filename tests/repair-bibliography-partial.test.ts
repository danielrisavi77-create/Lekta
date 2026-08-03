/**
 * RE-48: bibliographyRepairFixer je na PRVOM zapisu koji se ne da sigurno preoblikovati
 * radio `return NO_OP(...)` i time odustajao od SVIH zapisa u istom zahtjevu.
 *
 * Stvarni slucaj (diplomski rad, 31 zapis): dva zapisa dijele autora i godinu pa im pravilo
 * trazi a/b sufiks. Jedan od njih ima naslov u kurzivu, dakle VISE <w:t> cvorova, a
 * `replaceSingleTextNode` sigurnosno odbija dirati takav blok (ne zna koji cvor nosi godinu).
 * Posljedica je bila da se NIJEDAN od 31 zapisa ne normalizira ni ne sortira.
 *
 * Ispravno ponasanje: zapis koji se ne da sigurno preoblikovati ostaje NETAKNUT, a svi
 * ostali se svejedno obrade. Nikad se ne pogadja koji <w:t> nosi godinu (to bi bilo diranje
 * sadrzaja rada).
 */
import { describe, it, expect } from 'vitest';
import { bibliographyRepairFixer } from '../src/repair/bibliography-repair-fixer';
import type { DocxXmlParts } from '../src/repair/fixers';

const HEADER =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>';
const FOOTER = '</w:body></w:document>';

/** Zapis s JEDNIM <w:t> (sigurno preoblikovljiv). */
const SIMPLE_ENTRY = '<w:p><w:r><w:t>Bagic, Dragan (2011) Prvi naslov. Zagreb: FPZG.</w:t></w:r></w:p>';
/** Zapis s DVA <w:t> (naslov kurzivom) - replaceSingleTextNode ga odbija dirati. */
const SPLIT_ENTRY =
  '<w:p><w:r><w:t xml:space="preserve">Bagic, Dragan (2011) </w:t></w:r>' +
  '<w:r><w:rPr><w:i/></w:rPr><w:t>Drugi naslov</w:t></w:r>' +
  '<w:r><w:t>. Zagreb: FPZG.</w:t></w:r></w:p>';

const DOCUMENT_XML = HEADER + SIMPLE_ENTRY + SPLIT_ENTRY + FOOTER;

function parts(): DocxXmlParts {
  return {
    documentXml: DOCUMENT_XML,
    stylesXml: '',
    contentTypesXml: '',
    documentRelsXml: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
    addedParts: [],
    addedPackageParts: [],
    existingParts: [],
    footerHeaderParts: {},
    packageXmlParts: {},
    removedPackageParts: [],
  } as unknown as DocxXmlParts;
}

const PARAMS = {
  version: 1 as const,
  entries: [
    { id: 'e1', paragraphIndices: [1], anchorFingerprint: '', normalizeText: true },
    { id: 'e2', paragraphIndices: [2], anchorFingerprint: '', normalizeText: true },
  ],
  // Oba zapisa dijele autora i godinu -> pravilo trazi a/b sufiks. Drugi ga NE moze dobiti.
  suffixes: [{ entryId: 'e1', suffix: 'a' }, { entryId: 'e2', suffix: 'b' }],
  options: { hangingIndentTwips: 709 },
};

/** Fingerprinti se racunaju iz stvarnog teksta, kao sto to radi klijentska analiza. */
async function paramsWithRealAnchors() {
  const { bibliographyAnchorFingerprint } = await import('../src/analysis/bibliography-structure');
  const text = (block: string) => [...block.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('');
  return {
    ...PARAMS,
    entries: [
      { ...PARAMS.entries[0], anchorFingerprint: bibliographyAnchorFingerprint([1], text(SIMPLE_ENTRY)) },
      { ...PARAMS.entries[1], anchorFingerprint: bibliographyAnchorFingerprint([2], text(SPLIT_ENTRY)) },
    ],
  };
}

describe('bibliographyRepairFixer: jedan neobradiv zapis ne smije oboriti sve', () => {
  it('obradi zapise koje moze, a neobradiv ostavi netaknutim', async () => {
    const out = bibliographyRepairFixer(parts(), (await paramsWithRealAnchors()) as never);

    expect(out.reason, `fixer je odustao: ${out.reason}`).toBeUndefined();
    expect(out.applied).toBe(true);

    // Zapis koji se DAO preoblikovati je dobio sufiks uz godinu.
    expect(out.parts.documentXml).toContain('2011a');
    // Zapis s vise <w:t> cvorova ostaje BEZ izmisljenog sufiksa: sadrzaj se ne pogadja.
    expect(out.parts.documentXml).toContain('Drugi naslov');
    expect(out.parts.documentXml).not.toContain('2011b');
  });
});
