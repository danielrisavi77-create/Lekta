/**
 * Redoslijed primjene fixera (RE-46): fixeri se u applyFixers primjenjuju SEKVENCIJALNO nad
 * istim `parts.documentXml`, pa fixer koji rano promijeni XML invalidira anchorFingerprint
 * SVIH kasnijih anchor-osjetljivih fixera.
 *
 * Otkriveno na stvarnom diplomskom radu (FPZG novinarstvo): heading-style-fixer je pretvorio
 * 59 odlomaka u Heading stilove, nakon cega su croatian-typography-fixer i link-doi-fixer
 * (koji ciljaju odlomke preko `typo-<hash>` otiska) vratili 'no-target' iako su ISTI params
 * primijenjeni SAMI uredno prolazili.
 *
 * Ovaj test to zakljucava na sintetickom dokumentu: isti params, dva redoslijeda, isti ishod.
 */
import { describe, it, expect } from 'vitest';
import { writeZip, type ZipEntry } from '../src/repair/zip-codec';
import { applyFixers } from '../src/repair/apply-fixers';
import { analyzeTypographyStructure } from '../src/analysis/typography-structure';

const enc = new TextEncoder();

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '</Types>';
const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '</Relationships>';
const DOC_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';
const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr>' +
  '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>' +
  '<w:sz w:val="24"/><w:szCs w:val="24"/>' +
  '</w:rPr></w:rPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
  '<w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>' +
  '</w:style></w:styles>';
const SECT_PR =
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
  '<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>' +
  '</w:sectPr>';

/**
 * Odlomak 1: pravi Heading (zatvara zasticenu front-matter zonu paragraph-cleanupa).
 * Odlomci 2-3: niz praznih odlomaka koje empty-paragraph-fixer KOLABIRA (uklanja jedan).
 * Odlomak 4: tijelo s tipografskom greskom koje croatian-typography-fixer cilja preko
 *            paragraphIndex + anchorFingerprinta.
 *
 * Poanta: uklanjanje odlomka 3 POMICE odlomak 4 na indeks 3, pa tipografski popravak
 * gada krivi (ili nepostojeci) odlomak iako je njegov vlastiti sadrzaj netaknut.
 */
const BODY_PARAGRAPHS =
  '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
  '<w:p></w:p>' +
  '<w:p></w:p>' +
  '<w:p><w:r><w:t>Prva recenica,druga recenica bez razmaka iza zareza.</w:t></w:r></w:p>';

const DOCUMENT_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
  BODY_PARAGRAPHS + SECT_PR +
  '</w:body></w:document>';

function buildDocx(): Promise<Uint8Array> {
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc.encode(ROOT_RELS) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(DOC_RELS) },
    { name: 'word/document.xml', data: enc.encode(DOCUMENT_XML) },
    { name: 'word/styles.xml', data: enc.encode(STYLES_XML) },
  ];
  return writeZip(entries);
}

/** Params za croatian-typography-fixer, izvedeni iz STVARNE analize (kao klijent). */
function typographyRequest() {
  const structure = analyzeTypographyStructure(DOCUMENT_XML, { rules: {}, profileRulesVerified: true });
  const occurrence = structure.occurrences.find((o) => o.category === 'missing-space-after-punctuation');
  if (!occurrence) throw new Error('sinteticki fixture ne proizvodi ocekivani tipografski nalaz');
  return {
    fixerId: 'croatian-typography-fixer' as const,
    ruleId: 'croatian-typography-universal',
    params: {
      version: 1,
      categories: [{ category: 'missing-space-after-punctuation', consent: true }],
      operations: [{
        id: occurrence.id, category: occurrence.category, paragraphIndex: occurrence.paragraphIndex,
        ...(occurrence.textNodeIndex != null ? { textNodeIndex: occurrence.textNodeIndex } : {}),
        nodeKind: 'text', start: occurrence.start, end: occurrence.end,
        before: occurrence.rawText, replacementText: occurrence.proposedText,
        anchorFingerprint: occurrence.anchorFingerprint, confirmed: true,
      }],
    },
  };
}

/** empty-paragraph-fixer UKLANJA osirotjele prazne odlomke i time pomice kasnije indekse. */
const emptyParagraphRequest = {
  fixerId: 'empty-paragraph-fixer' as const,
  ruleId: 'empty-paragraphs-universal',
  params: {},
};

describe('applyFixers: raniji fixer ne smije invalidirati anchore kasnijih', () => {
  it('tipografski popravak prolazi kad je sam', async () => {
    const docx = await buildDocx();
    const out = await applyFixers(docx, [typographyRequest()]);
    expect(out.skippedReasons['croatian-typography-universal']).toBeUndefined();
    expect(out.changelog.map((c) => c.fixerId)).toContain('croatian-typography-fixer');
  });

  it('uklanjanje praznih odlomaka prolazi kad je samo', async () => {
    const docx = await buildDocx();
    const out = await applyFixers(docx, [emptyParagraphRequest]);
    expect(out.changelog.map((c) => c.fixerId)).toContain('empty-paragraph-fixer');
  });

  // JEZGRA (RE-46): isti params, ista dva fixera, samo u istom zahtjevu. Prije popravka je
  // empty-paragraph-fixer uklonio odlomak PRIJE tipografske mete, pa je paragraphIndex u
  // vec izracunatim params pokazivao na krivi odlomak -> 'no-target', bez ijedne poruke
  // korisniku o pravom razlogu.
  it('OBA prolaze i kad su u istom zahtjevu', async () => {
    const docx = await buildDocx();
    const out = await applyFixers(docx, [emptyParagraphRequest, typographyRequest()]);
    const applied = out.changelog.map((c) => c.fixerId);
    expect(out.skipped, `preskoceno: ${JSON.stringify(out.skippedReasons)}`).toEqual([]);
    expect(applied).toContain('empty-paragraph-fixer');
    expect(applied).toContain('croatian-typography-fixer');
  });

  /**
   * RE-51: i UNUTAR skupine koja mijenja broj odlomaka redoslijed je bitan. Fixer koji djeluje
   * na POCETAK dokumenta (naslovnica, uklanjanje praznih odlomaka) pomakne mete onima koji rade
   * na KRAJU (popis literature je na indeksima 500+). Zato se unutar te faze ide od kraja
   * dokumenta prema pocetku.
   *
   * Na stvarnom radu: title-page-fixer je skratio naslovnicu pa je bibliography-repair-fixer
   * (paragraphIndices 529+) vracao 'invalid-params' iako je SAM uredno prolazio.
   */
  it('bibliografija na kraju prezivi fixer koji skracuje pocetak dokumenta', async () => {
    const { bibliographyAnchorFingerprint } = await import('../src/analysis/bibliography-structure');
    const docx = await buildDocx();

    // Odlomak 4 (zadnji) je bibliografski zapis; odlomci 2-3 su prazni i bit ce kolabirani.
    const entryText = 'Prva recenica,druga recenica bez razmaka iza zareza.';
    const bibliographyRequest = {
      fixerId: 'bibliography-repair-fixer' as const,
      ruleId: 'bibliography-repair-assisted',
      params: {
        version: 1,
        entries: [{
          id: 'e1', paragraphIndices: [4],
          anchorFingerprint: bibliographyAnchorFingerprint([4], entryText),
          normalizeText: true,
        }],
        options: { hangingIndentTwips: 709 },
      },
    };

    // Sam mora proci (kontrola).
    const solo = await applyFixers(docx, [bibliographyRequest]);
    expect(solo.skippedReasons['bibliography-repair-assisted'], 'kontrola: sam mora proci').toBeUndefined();

    // I u paru s fixerom koji uklanja raniji odlomak.
    const pair = await applyFixers(docx, [emptyParagraphRequest, bibliographyRequest]);
    expect(pair.skippedReasons['bibliography-repair-assisted'], `preskoceno: ${JSON.stringify(pair.skippedReasons)}`).toBeUndefined();
    expect(pair.changelog.map((c) => c.fixerId)).toContain('bibliography-repair-fixer');
  });
});
