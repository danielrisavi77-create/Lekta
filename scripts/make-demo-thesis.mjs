// scripts/make-demo-thesis.mjs
//
// WS-4 pomagalo: gradi JEDAN cist, reprezentativan demo-diplomski .docx s TOCNOM strukturom
// koju tamni fixeri K6/K7 trebaju da bi se ucinak VIDIO u pravom Wordu, pa nad njim pokrene
// K5/K6/K7 i izda prije/poslije parove. Rjesava dvojbu iz validacije: pravi korisnicki radovi su
// ili pravni podnesci (K6 nema rimski prednji dio) ili vec imaju sekcije/zivi TOC (K6/K7 no-op).
//
// Struktura demo-diplomskog (jedna sekcija, BEZ pgNumType, BEZ zivog TOC polja):
//   - naslovnica (Title stil) + prijelom stranice
//   - Sažetak (Heading1) + prijelom
//   - Sadržaj (Heading1) + RUCNO utipkane stavke + prijelom   <- K7 sidro
//   - Uvod (Heading1) + tijelo                                 <- K6 sidro
//   - Razrada (Heading1) / Podpoglavlje (Heading2) / Zaključak / Literatura
// Heading1/Heading2 imaju built-in ime ("heading 1"/"heading 2") + w:outlineLvl, pa ih Word TOC
// polje (\o "1-3") STVARNO skuplja na F9. Naslovnica + Sažetak + Sadržaj su zasebne STRANICE, pa
// K6 rimski (i, ii, iii) ima gdje se prikazati.
//
// Pokretanje:  npx vite-node scripts/make-demo-thesis.mjs [izlaznaMapa]   (default: tmp/demo-thesis)

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { writeZip } from '../src/repair/zip-codec.ts';
import { applyFixers } from '../src/repair/apply-fixers.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const enc = new TextEncoder();
const arg = process.argv.slice(2).find((a) => !a.startsWith('-'));
const OUT_DIR = arg ? (isAbsolute(arg) ? arg : join(process.cwd(), arg)) : join(repoRoot, 'tmp', 'demo-thesis');

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

// Kljucno za F9 TOC: Heading1/Heading2 nose built-in ime ("heading 1"/"heading 2") I w:outlineLvl,
// pa ih Word prepozna kao razine 1-3 koje \o "1-3" skuplja. Title stil za naslovnicu.
const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="160" w:line="360" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="2400" w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="56"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:pageBreakBefore/><w:outlineLvl w:val="0"/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/><w:spacing w:before="200" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>' +
  '</w:styles>';

const p = (text, style) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const pCenter = (text) => `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
const body100 =
  'Ovo je tekst tijela rada koji služi samo za popunjavanje stranice kako bi paginacija i numeriranje bili vidljivi u pregledniku. '.repeat(4);

// Jedna sekcija, A4, margine 2,5 cm, BEZ pgNumType (K6 ga tek postavlja), BEZ footera.
const SECT_PR =
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/></w:sectPr>';

const DOCUMENT_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
  // naslovnica (Title) - Heading1 ima pageBreakBefore pa Sažetak sam ide na novu stranicu
  pCenter('Sveučilište u Zagrebu') +
  pCenter('Fakultet političkih znanosti') +
  p('Diplomski rad', 'Title') +
  pCenter('Ime Prezime') +
  pCenter('Mentor: dr. sc. Ime Mentora') +
  pCenter('Zagreb, 2026.') +
  // Sažetak (nova stranica preko Heading1 pageBreakBefore)
  p('Sažetak', 'Heading1') +
  p(body100) +
  p('Ključne riječi: prva, druga, treća') +
  // Sadržaj + RUCNO utipkane stavke (K7 sidro)
  p('Sadržaj', 'Heading1') +
  p('Uvod\t3') +
  p('Razrada\t4') +
  p('Podpoglavlje\t5') +
  p('Zaključak\t6') +
  p('Literatura\t7') +
  // Uvod (K6 sidro) + ostatak (Heading1/Heading2 za TOC)
  p('Uvod', 'Heading1') +
  p(body100) +
  p('Razrada', 'Heading1') +
  p(body100) +
  p('Podpoglavlje', 'Heading2') +
  p(body100) +
  p('Zaključak', 'Heading1') +
  p(body100) +
  p('Literatura', 'Heading1') +
  p('Prezime, I. (2020). Naslov djela. Izdavač.') +
  SECT_PR +
  '</w:body></w:document>';

async function demoBytes() {
  return writeZip([
    { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc.encode(ROOT_RELS) },
    { name: 'word/_rels/document.xml.rels', data: enc.encode(DOC_RELS) },
    { name: 'word/document.xml', data: enc.encode(DOCUMENT_XML) },
    { name: 'word/styles.xml', data: enc.encode(STYLES_XML) },
  ]);
}

const BATTERY = [
  { key: 'K5-footer', requests: [{ ruleId: 'footer-page', fixerId: 'footer-page-fixer', params: { target: { sectionIndex: 0, align: 'center' } } }] },
  { key: 'K6-numbering-from-intro', requests: [{ ruleId: 'section-insert-intro', fixerId: 'section-insert-fixer', params: { target: { introParagraphIndex: 2, align: 'center' } } }] },
  { key: 'K7-toc-field', requests: [{ ruleId: 'toc-field', fixerId: 'toc-field-fixer', params: { target: { sadrzajParagraphIndex: 1 } } }] },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const bytes = await demoBytes();
  writeFileSync(join(OUT_DIR, 'demo-diplomski__original.docx'), Buffer.from(bytes));
  console.log(`Demo-diplomski: ${join(OUT_DIR, 'demo-diplomski__original.docx')}\n`);

  for (const b of BATTERY) {
    const res = await applyFixers(bytes, b.requests);
    if (res.changelog.length > 0) {
      writeFileSync(join(OUT_DIR, `demo-diplomski__${b.key}.docx`), Buffer.from(res.docxBytes));
      console.log(`  ${b.key}: PRIMIJENJENO -> demo-diplomski__${b.key}.docx  (${res.changelog.map((c) => `${c.beforeLabel} -> ${c.afterLabel}`).join('; ')})`);
    } else {
      console.log(`  ${b.key}: no-op (${res.skipped.join(', ') || 'nema sidra'})`);
    }
  }

  console.log(
    '\nOtvori u Wordu I LibreOffice, usporedi s __original:\n' +
      '  K5: podnožje ima centriran broj stranice.\n' +
      '  K6: naslovnica bez broja; Sažetak/Sadržaj = rimski (i, ii); od Uvoda = arapski od 1.\n' +
      '  K7: klikni u sadržaj -> Ctrl+A pa F9 (ili "Ažuriraj polja?" na otvaranju) -> popis 6 naslova.\n',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
