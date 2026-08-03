/**
 * RE-50: otisak sekcije je `sectionAnchorFingerprint(text, bodyChildIndex)`, pa se KLIJENTSKA
 * analiza i FIXER moraju slagati oko toga koji je to `bodyChildIndex`. Nisu se slagali:
 *
 *   - klijent (analyzeSectionStructure -> bodyChildren): indeks medju SVOM direktnom djecom
 *     <w:body> (dakle broji i <w:sdt>, <w:bookmarkStart> i sl.),
 *   - fixer (directBodyChildren): filtrirao je na p/tbl/sectPr i pritom kod preskocenog
 *     elementa NIJE preskakao i njegov SADRZAJ, pa je ulazio u <w:sdt>/<w:tbl> i brojao
 *     ugnijezdjene odlomke kao da su direktna djeca.
 *
 * Na stvarnom diplomskom radu (Sadrzaj omotan u <w:sdt>) klijent je slao ordinal 0 s otiskom
 * za bodyChildIndex 73, a fixer je za istu sekciju racunao bodyChildIndex 122 -> otisci se
 * nikad nisu poklopili i SVE operacije sekcija vracale su 'unsupported-structure'.
 *
 * Ovaj test je PARITETNI: ne provjerava konkretnu brojku nego da dvije implementacije daju
 * ISTI otisak za istu sekciju.
 */
import { describe, it, expect } from 'vitest';
import { analyzeSectionStructure } from '../src/analysis/section-structure';
import { sectionSurgeryFixer } from '../src/repair/section-surgery-fixer';
import type { DocxXmlParts } from '../src/repair/fixers';
import { parseXml } from '../src/docx/parser';

const SECT = (w: string) =>
  `<w:sectPr><w:pgSz w:w="${w}" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr>`;

/**
 * Naslovnica, pa SADRZAJ OMOTAN U <w:sdt> (tako ga Word stvarno sprema), pa prijelom sekcije.
 * <w:sdt> je kljucan: on je taj koji je razilazio dva brojaca.
 */
const DOCUMENT_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
  '<w:p><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>' +
  '<w:sdt><w:sdtContent>' +
  '<w:p><w:r><w:t>Sadrzaj</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t>1. Uvod .... 1</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t>2. Razrada .... 2</w:t></w:r></w:p>' +
  '</w:sdtContent></w:sdt>' +
  `<w:p><w:pPr>${SECT('11906')}</w:pPr><w:r><w:t>Kraj prve sekcije</w:t></w:r></w:p>` +
  '<w:p><w:r><w:t>Tijelo druge sekcije</w:t></w:r></w:p>' +
  SECT('11906') +
  '</w:body></w:document>';

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
    packageXmlParts: { 'word/document.xml': DOCUMENT_XML },
    removedPackageParts: [],
  } as unknown as DocxXmlParts;
}

describe('section-surgery: otisak sekcije mora biti isti u analizi i u fixeru', () => {
  it('fixer prihvaca otisak koji je izracunala klijentska analiza', () => {
    // 1) Klijentska analiza racuna otiske (to je ono sto zavrsi u params).
    const structure = analyzeSectionStructure({
      document: parseXml(DOCUMENT_XML),
      documentXml: DOCUMENT_XML,
      paragraphs: [],
    } as never) as never as { sections: Array<{ ordinal: number; anchorFingerprint: string }> };

    expect(structure.sections.length, 'fixture mora imati barem dvije sekcije').toBeGreaterThanOrEqual(2);

    // 2) Fixer dobiva TOCNO te otiske. Ako ih izracuna drukcije, vrati 'unsupported-structure'.
    const first = structure.sections[0];
    const out = sectionSurgeryFixer(parts(), {
      version: 1,
      operations: [{
        id: 'op-1', kind: 'set-numbering', sectionOrdinal: first.ordinal,
        anchorFingerprint: first.anchorFingerprint, confirmed: true,
        numbering: { format: 'lowerRoman', start: 1 },
      }],
    } as never);

    expect(out.reason, `fixer nije prepoznao sekciju: ${out.reason}`).toBeUndefined();
    expect(out.applied).toBe(true);
  });
});
