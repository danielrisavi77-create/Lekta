// tests/helpers/synthetic-docx.ts
//
// Deterministicki graditelji minimalnih .docx bajtova za repair golden harness
// (tests/repair-golden.test.ts) i buduce korake numeriranja (pipeline K4-K6).
//
// Zasto sinteticki, a ne commitani binarni fixture: ovi dokumenti su citljivi u
// izvoru (recenziraju se u code reviewu, ne kao neproziran binary), deterministicki
// (isti bajtovi svaki put jer writeZip ne nosi vremenske oznake) i namjenski
// oblikovani da pokriju svaku granu fixera (docDefaults + Normal backstop za deep,
// vise sekcija za buduci pgNumType/footer/sekcija-umetanje).
//
// Granica: pokrivaju XML-transform putanju fixera (regex nad document.xml/styles.xml).
// Punu Word-validnost (otvara li Word bez upozorenja) i dalje dokazuju STVARNI .docx
// fixturi u tests/fixtures/docx/ + rucna Word/LibreOffice matrica u koracima K5/K6.

import { writeZip, type ZipEntry } from '../../src/repair/zip-codec';

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

// docDefaults (font Calibri 11pt) + Normal stil s proredom, poravnanjem i BEZ rPr.
// Ovaj oblik daje backstop za deep ciscenje: docDefaults ima literalni w:ascii/w:hAnsi
// (font backstop), Normal ima w:spacing w:line (prored backstop) i w:jc (poravnanje
// backstop). Normal namjerno nema rPr, pa font-deep ne nailazi na Normal-konflikt.
const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr>' +
  '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' +
  '<w:sz w:val="22"/><w:szCs w:val="22"/>' +
  '</w:rPr></w:rPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
  '<w:name w:val="Normal"/>' +
  '<w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>' +
  '</w:style></w:styles>';

// Odlomak s IZRAVNIM formatiranjem (run rFonts Calibri + sz 22; pPr spacing line + jc
// left): meta koju deep ciscenje treba ukloniti kad su backstopi u stilu zadovoljeni.
const DIRECT_FORMATTED_PARAGRAPH =
  '<w:p><w:pPr><w:spacing w:line="259" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>' +
  '<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr>' +
  '<w:t>Tekst tijela pisan izravnim formatiranjem koje deep ciscenje uklanja.</w:t></w:r></w:p>';

const SECT_PR =
  '<w:sectPr>' +
  '<w:pgSz w:w="11906" w:h="16838"/>' +
  '<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>' +
  '<w:cols w:space="708"/>' +
  '</w:sectPr>';

function docxBytes(documentXml: string): Promise<Uint8Array> {
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc.encode(ROOT_RELS) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(DOC_RELS) },
    { name: 'word/document.xml', data: enc.encode(documentXml) },
    { name: 'word/styles.xml', data: enc.encode(STYLES_XML) },
  ];
  return writeZip(entries);
}

/**
 * Jedna sekcija: naslovnica-tekst + Uvod + izravno formatiran odlomak + zavrsni sectPr.
 * NEMA pgNumType (buduci pgNumType fixer, K4, treba dokument bez postavljene numeracije).
 */
export function singleSectionDocx(): Promise<Uint8Array> {
  const body =
    '<w:body>' +
    '<w:p><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
    DIRECT_FORMATTED_PARAGRAPH +
    SECT_PR +
    '</w:body>';
  return docxBytes(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      body +
      '</w:document>',
  );
}

/**
 * Dvije sekcije: naslovnica (vlastiti sectPr u pPr prvog odlomka) pa tijelo od Uvoda
 * (zavrsni sectPr). Nijedan sectPr nema w:pgNumType. Ovo je ciljni oblik za korake
 * K4 (pgNumType po sekcijama), K5 (footer PAGE polje) i K6 (umetanje sekcije prije
 * Uvoda); harness ga vec sada snima da regresija u fixerima nad viseslojnim
 * dokumentom bude uhvacena.
 */
export function multiSectionDocx(): Promise<Uint8Array> {
  const titleSectPr =
    '<w:pPr><w:sectPr>' +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1417" w:right="1134" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>' +
    '</w:sectPr></w:pPr>';
  const body =
    '<w:body>' +
    '<w:p>' + titleSectPr + '<w:r><w:t>NASLOVNICA RADA</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
    DIRECT_FORMATTED_PARAGRAPH +
    SECT_PR +
    '</w:body>';
  return docxBytes(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      body +
      '</w:document>',
  );
}

/**
 * Jednosekcijski rad s naslovom "Sadržaj" (Heading1) i RUCNO utipkanom stavkom (bez zivog TOC
 * polja). Ciljni oblik za K7 (umetanje TOC polja iza naslova Sadrzaj). Paragraph indeksi:
 * NASLOVNICA(1), Sadržaj(2), rucna stavka Uvod..1(3), Uvod(4), tijelo(5), pa zavrsni sectPr.
 */
export function tocManualDocx(): Promise<Uint8Array> {
  const body =
    '<w:body>' +
    '<w:p><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Sadržaj</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>Uvod\t1</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
    DIRECT_FORMATTED_PARAGRAPH +
    SECT_PR +
    '</w:body>';
  return docxBytes(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      body +
      '</w:document>',
  );
}
