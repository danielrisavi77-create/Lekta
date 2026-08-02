/**
 * Closed-loop provjera genericnih strukturnih fixera (logika NE ovisi o profilu, samo o
 * stvarnoj analiziranoj strukturi dokumenta): toc-field-fixer, link-doi-fixer,
 * footnote-spacing-fixer, page-numbering-fixer, section-insert-fixer, page-number-alignment-fixer.
 * Vidi plan prosirenja - Batch 2. Zajednicki koraci u tests/helpers/closed-loop-runner.ts.
 */
import { describe, it } from 'vitest';
import { resolveProfile } from '../src/analysis/golden-entry';
import {
  tocFieldRepairableItem,
  linkDoiRepairableItem,
  footnoteSpacingRepairableItem,
  pageNumberingRepairableItem,
  introSectionRepairableItem,
  pageNumberAlignmentRepairableItem,
} from '../src/ui/repair-items';
import { CHECK_TITLES } from '../src/analysis/check-fixer-map';
import { packageDoc, paragraph, documentXml, buildRepairTemplate } from './helpers/repair-templates';
import { runClosedLoopCase } from './helpers/closed-loop-runner';

const WORD_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

describe('Repair Engine closed-loop: toc-field-fixer', () => {
  it('fpzg-politologija-zavrsni: rucni "Sadrzaj" bez zivog TOC polja', async () => {
    const profileId = 'fpzg-politologija-zavrsni';
    const stylesXml = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;
    const body = `${paragraph('Sadržaj')}${paragraph('Uvod .......... 1')}${paragraph('Uvod', 'Heading1')}${paragraph('Tijelo teksta nakon uvoda za popunu dokumenta.')}`;
    await runClosedLoopCase({
      label: `toc-field/${profileId}`,
      profileId,
      buildBrokenDocx: () => packageDoc({ documentXml: documentXml(body), stylesXml }),
      buildItems: (before, p) => tocFieldRepairableItem(before, p),
      isResolved: (after) => after?.details?.hasTocField === true,
      // Nedestruktivno: fixer DODAJE uputu ("azuriraj tablicu u Wordu") uz zivo polje, ne
      // brise rucne stavke - ocekivana promjena teksta (dodavanje, ne prepisivanje autora).
      allowTextChange: true,
    });
  }, 30000);
});

describe('Repair Engine closed-loop: link-doi-fixer', () => {
  it('fer-diplomski: neobradjen DOI i poveznica (genericko, ne ovisi o profilu)', async () => {
    const profileId = 'fer-diplomski';
    await runClosedLoopCase({
      label: `link-doi/${profileId}`,
      profileId,
      buildBrokenDocx: () => buildRepairTemplate('links-doi'),
      buildItems: (before, p) => linkDoiRepairableItem(before, p),
      targetTitles: ['Oblik poveznica'],
      // Kanonizacija DOI-ja MIJENJA vidljivi tekst (doi:... -> https://doi.org/...) - to je
      // svrha ovog popravka, ne slucajna nuspojava (za razliku od ostalih fixera u ovoj datoteci).
      allowTextChange: true,
    });
  }, 30000);
});

describe('Repair Engine closed-loop: footnote-spacing-fixer', () => {
  it('pravo-integrirani-diplomski: razmak prije/poslije fusnota razlicit od nule', async () => {
    const profileId = 'pravo-integrirani-diplomski';
    const stylesXml = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="Footnote Text"/><w:pPr><w:spacing w:before="120" w:after="120"/></w:pPr></w:style></w:styles>`;
    const bodyXml = documentXml(`<w:p><w:r><w:t>Tekst uz izvor </w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="1"/></w:r></w:p>`);
    const footnotesXml = `<w:footnotes ${WORD_NS}><w:footnote w:id="1"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:t>Usp. Zakon o obveznim odnosima, NN 35/05, cl. 2.</w:t></w:r></w:p></w:footnote></w:footnotes>`;
    await runClosedLoopCase({
      label: `footnote-spacing/${profileId}`,
      profileId,
      buildBrokenDocx: () => packageDoc({ documentXml: bodyXml, stylesXml, footnotesXml }),
      buildItems: (before, p) => footnoteSpacingRepairableItem(before.checks ?? [], p),
      targetTitles: [CHECK_TITLES['footnote-spacing']],
    });
  }, 30000);
});

// "Numeriranje od prve stranice Uvoda"/"Shema numeriranja stranica" (analyze-docx.ts) racunaju se
// SAMO kad postoji barem jedno PAGE polje negdje u dokumentu/footeru - bez toga check uopce ne
// postoji (ne samo da je 'warn'). Footer je vec desno poravnat (profil trazi "right") da se ne
// otvori NEPOVEZAN "Položaj broja stranice" nalaz koji ova dva testa ne cilja.
const PAGE_FOOTER_XML = `<w:ftr ${WORD_NS}><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;

describe('Repair Engine closed-loop: page-numbering-fixer (dvosekcijski dokument)', () => {
  it('pravo-socijalni-rad-zavrsni: naslovnica+Uvod granica postoji, numeriranje krivo', async () => {
    const profileId = 'pravo-socijalni-rad-zavrsni';
    const documentXmlRaw = `<w:document ${WORD_NS}><w:body>${paragraph('Naslov rada')}<w:p><w:pPr><w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/><w:pgNumType w:fmt="decimal"/><w:titlePg/></w:sectPr></w:pPr><w:r><w:t>Naslovnica</w:t></w:r></w:p>${paragraph('Uvod', 'Heading1')}<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/><w:pgNumType w:fmt="decimal"/></w:sectPr></w:body></w:document>`;
    const stylesXml = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;
    await runClosedLoopCase({
      label: `page-numbering/${profileId}`,
      profileId,
      buildBrokenDocx: () => packageDoc({ documentXml: documentXmlRaw, stylesXml, footerXml: PAGE_FOOTER_XML }),
      buildItems: (before, p) => pageNumberingRepairableItem(before, p),
      // "Shema numeriranja stranica" je zaseban check gatean na profile.checkPageNumberScheme
      // (SAMO FPZG profili), koje pravo-socijalni-rad-zavrsni nema - ovdje se ne racuna uopce.
      // Taj check je uz to UVIJEK status:'pass' kad postoji (cisto informativan, max=0).
      targetTitles: [CHECK_TITLES['page-number-start']],
    });
  }, 30000);
});

describe('Repair Engine closed-loop: section-insert-fixer (jednosekcijski dokument)', () => {
  it('pravo-socijalni-rad-zavrsni: Uvod na paragrafu >=2, bez ijednog prijeloma sekcije', async () => {
    const profileId = 'pravo-socijalni-rad-zavrsni';
    const stylesXml = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`;
    // NAMJERNO bez footerReference/titlePg/headerReference na jedinoj sekciji: sectionInsertFixer
    // eksplicitno odbija (NO_OP) dokument koji vec ima svoju footer/header konfiguraciju (src/repair/fixers.ts,
    // "Dokument s VLASTITOM prvo-stranica/zaglavlje/podnozje konfiguracijom se ne dira"). PAGE polje
    // za pageNums=true dolazi vec iz same PRISUTNOSTI word/footer1.xml u zipu (footerXml opcija ispod),
    // NE treba i footerReference da bi "Numeriranje od prve stranice Uvoda" check uopce postojao.
    const body = `${paragraph('Naslov rada')}${paragraph('Sažetak istraživanja u kratkim crtama.')}${paragraph('Uvod', 'Heading1')}${paragraph('Tijelo teksta nakon uvoda.')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>`;
    await runClosedLoopCase({
      label: `section-insert/${profileId}`,
      profileId,
      buildBrokenDocx: () => packageDoc({ documentXml: documentXml(body, false), stylesXml, footerXml: PAGE_FOOTER_XML }),
      buildItems: (before, p) => introSectionRepairableItem(before, p),
      // NAMJERNO isResolved umjesto targetTitles: fixer dodaje footer SAMO prednjoj sekciji (glavna
      // ga po Wordovim pravilima nasljedjuje "continuous"), ali analiza hasAnyPageField NE simulira
      // to nasljedjivanje (cita samo eksplicitni footerReference po sekciji) - "Numeriranje od prve
      // stranice Uvoda" zato ostaje konzervativno 'warn' (isto bi se dogodilo i na stvarnom Word
      // dokumentu, otud requiresConfirmation:true na ovoj stavci). Provjeravamo stvarni strukturni
      // ishod izravno: dvije sekcije, prednja rimska+titlePg, glavna decimalna od 1.
      isResolved: (after) => {
        const sections = after?.details?.sections ?? [];
        return sections.length === 2 && sections[0]?.titlePageDifferent === true &&
          sections[0]?.pageNumbering?.format === 'lowerRoman' &&
          sections[1]?.pageNumbering?.format === 'decimal' && sections[1]?.pageNumbering?.start === 1;
      },
      exemptFromRegression: [CHECK_TITLES['page-number-start'], CHECK_TITLES['page-number-scheme']],
    });
  }, 30000);
});

describe('Repair Engine closed-loop: page-number-alignment-fixer', () => {
  it('pravo-socijalni-rad-zavrsni: broj stranice u footeru nije desno poravnat', async () => {
    const profileId = 'pravo-socijalni-rad-zavrsni';
    const stylesXml = `<w:styles ${WORD_NS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
    const footerXml = `<w:ftr ${WORD_NS}><w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
    await runClosedLoopCase({
      label: `page-number-alignment/${profileId}`,
      profileId,
      buildBrokenDocx: () => packageDoc({ documentXml: documentXml(paragraph('Tijelo teksta rada.')), stylesXml, footerXml }),
      buildItems: (before, p) => pageNumberAlignmentRepairableItem(before.checks ?? [], p),
      targetTitles: [CHECK_TITLES['page-number-alignment']],
    });
  }, 30000);
});
