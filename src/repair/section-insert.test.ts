// Unit + e2e testovi za K6 (BL-07c): umetanje sekcije prije Uvoda + kompletno
// "numeriranje od Uvoda" (prijelom + pgNumType rimski/arapski + footer PAGE + titlePg).
// Pokriva primitiv insertSectionBreakBeforeParagraph (koordinatni sustav, guardovi),
// extractFinalSectionGeometry, kompozitni sectionInsertFixer (reuse K4+K5), idempotenciju,
// gating u introSectionItem i end-to-end koordinatnu konzistentnost kroz analyzeDocx.

import { describe, it, expect } from 'vitest';
import {
  insertSectionBreakBeforeParagraph,
  insertSectionBreakBeforeHeading,
  extractFinalSectionGeometry,
} from './xml-patch';
import { sectionName } from '../utils/helpers';
import { sectionInsertFixer, type DocxXmlParts } from './fixers';
import { applyFixers } from './apply-fixers';
import { introSectionItem, introSectionRepairableItem } from '../ui/repair-items';
import { analyzeFixture } from '../analysis/golden-entry';
import { singleSectionDocx } from '../../tests/helpers/synthetic-docx';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const MAIN_SECT =
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
  '<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/><w:cols w:space="708"/></w:sectPr>';
const MARKER_SECT = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:titlePg/></w:sectPr>';

// Jednosekcijski rad: naslovnica (p1), Uvod (p2), tijelo (p3), zavrsni sectPr.
function singleDoc(): string {
  return (
    `<w:document ${NS}><w:body>` +
    '<w:p><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>Tijelo rada.</w:t></w:r></w:p>' +
    MAIN_SECT +
    '</w:body></w:document>'
  );
}

// Minimalni part flow (content-types + rels) za footer korak kompozita.
const CT =
  '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '</Types>';
const RELS =
  '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';

function partsFor(documentXml: string, withFlow = true): DocxXmlParts {
  return {
    documentXml,
    stylesXml: '',
    contentTypesXml: withFlow ? CT : '',
    documentRelsXml: withFlow ? RELS : '',
    addedParts: [],
    existingParts: ['word/document.xml', 'word/styles.xml'],
  };
}

describe('extractFinalSectionGeometry', () => {
  it('izvlaci pgSz i pgMar iz ZADNJEG (body-level) sectPr-a', () => {
    const geo = extractFinalSectionGeometry(singleDoc());
    expect(geo.pgSz).toBe('<w:pgSz w:w="11906" w:h="16838"/>');
    expect(geo.pgMar).toBe('<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/>');
  });

  it('null kad sectPr nema geometrije', () => {
    const geo = extractFinalSectionGeometry(`<w:document ${NS}><w:body><w:sectPr/></w:body></w:document>`);
    expect(geo.pgSz).toBeNull();
    expect(geo.pgMar).toBeNull();
  });
});

describe('insertSectionBreakBeforeParagraph', () => {
  it('umece marker odlomak tocno prije N-tog <w:p> (p2 = Uvod)', () => {
    const res = insertSectionBreakBeforeParagraph(singleDoc(), 2, MARKER_SECT);
    expect(res.applied).toBe(true);
    // Marker je neposredno prije Uvoda; prednji dio (NASLOVNICA) je prije markera.
    expect(res.xml).toContain(`</w:p><w:p><w:pPr>${MARKER_SECT}</w:pPr></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/>`);
    // Sada dvije sekcije: marker sectPr + zavrsni sectPr.
    expect((res.xml.match(/<w:sectPr\b/g) ?? []).length).toBe(2);
  });

  it('ordinal < 2 -> no-op (nema prednjeg dijela)', () => {
    const doc = singleDoc();
    const res = insertSectionBreakBeforeParagraph(doc, 1, MARKER_SECT);
    expect(res.applied).toBe(false);
    expect(res.xml).toBe(doc);
  });

  it('ordinal veci od broja odlomaka -> no-op', () => {
    const doc = singleDoc();
    expect(insertSectionBreakBeforeParagraph(doc, 99, MARKER_SECT).applied).toBe(false);
  });

  it('sectPrChange -> sigurnosni no-op (kao K4/K5)', () => {
    const doc = `<w:document ${NS}><w:body>` +
      '<w:p><w:r><w:t>a</w:t></w:r></w:p><w:p><w:r><w:t>Uvod</w:t></w:r></w:p>' +
      '<w:sectPr><w:sectPrChange w:id="1" w:author="x"><w:sectPr/></w:sectPrChange></w:sectPr>' +
      '</w:body></w:document>';
    const res = insertSectionBreakBeforeParagraph(doc, 2, MARKER_SECT);
    expect(res.applied).toBe(false);
    expect(res.xml).toBe(doc);
  });

  it('ciljni odlomak VEC ima sectPr u pPr (idempotencija: cilj je marker) -> no-op', () => {
    const doc = `<w:document ${NS}><w:body>` +
      '<w:p><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>' +
      `<w:p><w:pPr>${MARKER_SECT}</w:pPr></w:p>` + // p2 = vec marker
      '<w:p><w:r><w:t>Uvod</w:t></w:r></w:p>' +
      MAIN_SECT + '</w:body></w:document>';
    const res = insertSectionBreakBeforeParagraph(doc, 2, MARKER_SECT);
    expect(res.applied).toBe(false);
    expect(res.xml).toBe(doc);
  });

  it('odlomak PRIJE cilja vec ima sectPr (prijelom vec tocno prije Uvoda) -> no-op', () => {
    // Multi-section oblik: NASLOVNICA(p1) nosi sectPr u pPr, Uvod(p2). Prijelom vec postoji.
    const doc = `<w:document ${NS}><w:body>` +
      `<w:p><w:pPr>${MARKER_SECT}</w:pPr><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>` +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
      MAIN_SECT + '</w:body></w:document>';
    const res = insertSectionBreakBeforeParagraph(doc, 2, MARKER_SECT);
    expect(res.applied).toBe(false);
  });

  it('cilj unutar tablice -> no-op (nije na razini tijela)', () => {
    const doc = `<w:document ${NS}><w:body>` +
      '<w:p><w:r><w:t>prije</w:t></w:r></w:p>' +
      '<w:tbl><w:tr><w:tc>' +
      '<w:p><w:r><w:t>Uvod u celiji</w:t></w:r></w:p>' + // p2, unutar tablice
      '</w:tc></w:tr></w:tbl>' +
      MAIN_SECT + '</w:body></w:document>';
    const res = insertSectionBreakBeforeParagraph(doc, 2, MARKER_SECT);
    expect(res.applied).toBe(false);
  });

  it('prazan samozatvarajuci odlomak (<w:p/>) prije Uvoda ne blokira umetanje', () => {
    // Prethodni odlomak je <w:p/> (goli Enter): nema sectPr pa prijelom jos ne postoji ->
    // umetanje se svejedno dogodi (self-closing guard ne smije lazno tvrditi da je prijelom tu).
    const doc = `<w:document ${NS}><w:body>` +
      '<w:p><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>' +
      '<w:p/>' + // p2, prazan
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' + // p3
      MAIN_SECT + '</w:body></w:document>';
    const res = insertSectionBreakBeforeParagraph(doc, 3, MARKER_SECT);
    expect(res.applied).toBe(true);
    expect(res.xml).toContain(`<w:p/><w:p><w:pPr>${MARKER_SECT}</w:pPr></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/>`);
  });

  it('regex broji SAMO odlomacke tagove, ne <w:pPr>/<w:pStyle>/<w:pgSz>', () => {
    // p1 ima pPr/pStyle, p2 (cilj) je Uvod. Kad bi regex brojao pPr, indeksi bi se pomakli.
    const doc = `<w:document ${NS}><w:body>` +
      '<w:p><w:pPr><w:pStyle w:val="Title"/><w:spacing w:before="0"/></w:pPr><w:r><w:t>Naslov</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Uvod</w:t></w:r></w:p>' +
      MAIN_SECT + '</w:body></w:document>';
    const res = insertSectionBreakBeforeParagraph(doc, 2, MARKER_SECT);
    expect(res.applied).toBe(true);
    // Marker ide neposredno prije Uvoda, ne prije/unutar naslova.
    expect(res.xml).toContain(`</w:p><w:p><w:pPr>${MARKER_SECT}</w:pPr></w:p><w:p><w:r><w:t>Uvod`);
  });

  it('komentar s <w:p prije Uvoda NE pomice indeks (marker pred PRAVI Uvod, ne u komentar)', () => {
    // getElementsByTagName ne vidi <w:p u komentaru; bez maskiranja bi ga regex brojao i ciljao
    // krivo. p1=Naslovnica, komentar s <w:p>, p2=Uvod (analyzeDocx introParagraphIndex=2).
    const doc = `<w:document ${NS}><w:body>` +
      '<w:p><w:r><w:t>Naslovnica</w:t></w:r></w:p>' +
      '<!-- stari nacrt <w:p>izbaci</w:p> -->' +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
      MAIN_SECT + '</w:body></w:document>';
    const res = insertSectionBreakBeforeParagraph(doc, 2, MARKER_SECT);
    expect(res.applied).toBe(true);
    // Marker je neposredno prije PRAVOG Uvoda; komentar ostaje netaknut (nije razbijen umetanjem).
    expect(res.xml).toContain(`--><w:p><w:pPr>${MARKER_SECT}</w:pPr></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/>`);
    expect(res.xml).toContain('<!-- stari nacrt <w:p>izbaci</w:p> -->');
  });

  it('prethodni odlomak ima sectPr SAMO u pPrChange (povijest) -> ne blokira umetanje', () => {
    // p1 je obican odlomak cija pPrChange povijest sadrzi stari sectPr; to NIJE zivi prijelom pa
    // ne smije lazno odbiti popravak inace popravljivog dokumenta.
    const doc = `<w:document ${NS}><w:body>` +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/>' +
      '<w:pPrChange w:id="3" w:author="x"><w:pPr><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:pPr></w:pPrChange>' +
      '</w:pPr><w:r><w:t>Naslovnica</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
      MAIN_SECT + '</w:body></w:document>';
    const res = insertSectionBreakBeforeParagraph(doc, 2, MARKER_SECT);
    expect(res.applied).toBe(true);
  });

  it('cilj unutar blok-kontrole sadrzaja (w:sdtContent) -> no-op (nije na razini tijela)', () => {
    const doc = `<w:document ${NS}><w:body>` +
      '<w:p><w:r><w:t>prije</w:t></w:r></w:p>' +
      '<w:sdt><w:sdtContent>' +
      '<w:p><w:r><w:t>Uvod u kontroli</w:t></w:r></w:p>' +
      '</w:sdtContent></w:sdt>' +
      MAIN_SECT + '</w:body></w:document>';
    const res = insertSectionBreakBeforeParagraph(doc, 2, MARKER_SECT);
    expect(res.applied).toBe(false);
  });
});

describe('insertSectionBreakBeforeHeading (re-derivacija sidra Uvoda po tekstu)', () => {
  const isUvod = (t: string) => ['uvod', 'introduction'].includes(sectionName(t));

  it('umece marker TOCNO prije odlomka Uvoda (nadjen po tekstu)', () => {
    const res = insertSectionBreakBeforeHeading(singleDoc(), isUvod, MARKER_SECT);
    expect(res.applied).toBe(true);
    expect(res.xml).toContain(
      `</w:p><w:p><w:pPr>${MARKER_SECT}</w:pPr></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod`,
    );
  });

  it('Uvod je PRVI odlomak na razini tijela -> no-op (nema prednjeg dijela)', () => {
    const doc = `<w:document ${NS}><w:body>` +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Tijelo.</w:t></w:r></w:p>' + MAIN_SECT + '</w:body></w:document>';
    expect(insertSectionBreakBeforeHeading(doc, isUvod, MARKER_SECT).applied).toBe(false);
  });

  it('nema odlomka Uvoda -> no-op', () => {
    const doc = `<w:document ${NS}><w:body>` +
      '<w:p><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Zakljucak</w:t></w:r></w:p>' + MAIN_SECT + '</w:body></w:document>';
    expect(insertSectionBreakBeforeHeading(doc, isUvod, MARKER_SECT).applied).toBe(false);
  });

  it('naslovnica kao TABLICA, Uvod prvi odlomak tijela -> prednji dio (tablica) postoji, umece', () => {
    // Regresija: prednji dio nije ODLOMAK vec tablica; bez provjere tablice bi bio lazan no-op.
    const doc = `<w:document ${NS}><w:body>` +
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Naslov rada</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Tijelo.</w:t></w:r></w:p>' + MAIN_SECT + '</w:body></w:document>';
    const res = insertSectionBreakBeforeHeading(doc, isUvod, MARKER_SECT);
    expect(res.applied).toBe(true);
    expect(res.xml).toContain(`</w:tbl><w:p><w:pPr>${MARKER_SECT}</w:pPr></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod`);
  });

  it('odlomak PRIJE Uvoda vec ima sectPr (prijelom vec tocno prije) -> no-op', () => {
    const doc = `<w:document ${NS}><w:body>` +
      `<w:p><w:pPr>${MARKER_SECT}</w:pPr><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>` +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
      MAIN_SECT + '</w:body></w:document>';
    expect(insertSectionBreakBeforeHeading(doc, isUvod, MARKER_SECT).applied).toBe(false);
  });

  it('komentar s <w:p prije Uvoda ne zbuni sidro (marker pred PRAVI Uvod)', () => {
    const doc = `<w:document ${NS}><w:body>` +
      '<w:p><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>' +
      '<!-- <w:p>Uvod krivi</w:p> -->' +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
      MAIN_SECT + '</w:body></w:document>';
    const res = insertSectionBreakBeforeHeading(doc, isUvod, MARKER_SECT);
    expect(res.applied).toBe(true);
    expect(res.xml).toContain(`-->` + `<w:p><w:pPr>${MARKER_SECT}</w:pPr></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod`);
  });
});

describe('sectionInsertFixer (kompozit: prijelom + pgNum + footer + titlePg)', () => {
  it('jednosekcijski rad -> 2 sekcije, rimski/arapski, titlePg, footer s PAGE', () => {
    const out = sectionInsertFixer(partsFor(singleDoc()), { introParagraphIndex: 2, align: 'center' });
    expect(out.applied).toBe(true);
    const doc = out.parts.documentXml;

    // Dvije sekcije.
    const sects = doc.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g) ?? [];
    expect(sects.length).toBe(2);
    // Sekcija 0 (marker/prednja): rimski start=1 + titlePg (naslovnica bez broja).
    expect(sects[0]).toContain('<w:pgNumType w:fmt="lowerRoman" w:start="1"/>');
    expect(sects[0]).toContain('<w:titlePg/>');
    // Sekcija 1 (glavna): arapski start=1, BEZ titlePg.
    expect(sects[1]).toContain('<w:pgNumType w:fmt="decimal" w:start="1"/>');
    expect(sects[1]).not.toContain('<w:titlePg/>');
    // Footer: footerReference u prednjoj sekciji (glavnu Word nasljedjuje) + part s PAGE.
    expect(sects[0]).toContain('<w:footerReference');
    expect((doc.match(/<w:footerReference\b/g) ?? []).length).toBe(1);
    const footer = (out.parts.addedParts ?? []).find((p) => /^word\/footer\d+\.xml$/.test(p.name));
    expect(footer).toBeTruthy();
    expect(footer!.content).toContain(' PAGE ');
    // Part flow uskladjen: Override + Relationship + xmlns:r.
    expect(out.parts.contentTypesXml).toContain(`PartName="/${footer!.name}"`);
    expect(out.parts.documentRelsXml).toContain('/relationships/footer');
    expect(doc).toContain('xmlns:r=');
    expect(out.afterLabel).toContain('podnožju');
  });

  it('SIDRO Uvoda otporno na promjenu broja odlomaka (adversarial K6 follow-up)', () => {
    // Rad SAZETAK(p1), Uvod(p2), Tijelo(p3). Prosljedjujemo ZASTARJELI introParagraphIndex 3 (kao da
    // je raniji fixer u bateriji, npr. empty-paragraph-fixer, obrisao odlomak prije Uvoda pa se Uvod
    // pomakao s p3 na p2). Fixer IGNORIRA index i re-derivira Uvod po tekstu -> prijelom TOCNO prije
    // Uvoda (p2), NE prije Tijela (p3, gdje bi zastarjeli index pao).
    const doc = `<w:document ${NS}><w:body>` +
      '<w:p><w:r><w:t>SAZETAK</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Tijelo rada.</w:t></w:r></w:p>' +
      MAIN_SECT + '</w:body></w:document>';
    const out = sectionInsertFixer(partsFor(doc), { introParagraphIndex: 3, align: 'center' });
    expect(out.applied).toBe(true);
    const d = out.parts.documentXml;
    // Marker (zavrsava titlePg) je neposredno prije Uvoda.
    expect(d).toContain('<w:titlePg/></w:sectPr></w:pPr></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t>');
    // NIJE prije Tijela (sto bi bio slucaj sa zastarjelim indeksom 3).
    expect(d).not.toContain('<w:titlePg/></w:sectPr></w:pPr></w:p><w:p><w:r><w:t>Tijelo');
  });

  it('idempotentan: druga primjena istog cilja je NO_OP (2 sekcije -> preSectPr backstop)', () => {
    const first = sectionInsertFixer(partsFor(singleDoc()), { introParagraphIndex: 2 });
    expect(first.applied).toBe(true);
    // Nakon umetanja dokument ima 2 sectPr (marker + zavrsni) -> preSectPr.length!==1 backstop -> NO_OP.
    const second = sectionInsertFixer(
      { ...partsFor(first.parts.documentXml), contentTypesXml: first.parts.contentTypesXml, documentRelsXml: first.parts.documentRelsXml, addedParts: first.parts.addedParts },
      { introParagraphIndex: 2 },
    );
    expect(second.applied).toBe(false);
    expect(second.parts.documentXml).toBe(first.parts.documentXml);
  });

  it('vec podijeljen dokument (prijelom prije Uvoda) -> NO_OP', () => {
    const doc = `<w:document ${NS}><w:body>` +
      `<w:p><w:pPr>${MARKER_SECT}</w:pPr><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>` +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
      MAIN_SECT + '</w:body></w:document>';
    const out = sectionInsertFixer(partsFor(doc), { introParagraphIndex: 2 });
    expect(out.applied).toBe(false);
  });

  it('jednosekcijski rad s titlePg na sectPr (autor zabijelio naslovnicu) -> NO_OP (defer na matricu)', () => {
    // Sole sectPr vec ima <w:titlePg/> (i cesto "first" footer): umetanje bi ostavilo titlePg na
    // glavnoj sekciji i odnumeriralo Uvod. Fixer takav dokument ne dira (deferira na rucnu matricu).
    const doc = `<w:document ${NS}><w:body>` +
      '<w:p><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Tijelo.</w:t></w:r></w:p>' +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/><w:titlePg/></w:sectPr>' +
      '</w:body></w:document>';
    const out = sectionInsertFixer(partsFor(doc), { introParagraphIndex: 2 });
    expect(out.applied).toBe(false);
    expect(out.parts.documentXml).toBe(doc);
  });

  it('jednosekcijski rad s postojecim footerReference na sectPr -> NO_OP (ne diramo tudji footer)', () => {
    const doc = `<w:document ${NS}><w:body>` +
      '<w:p><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
      '<w:sectPr><w:footerReference w:type="default" r:id="rId9"/><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>' +
      '</w:body></w:document>';
    expect(sectionInsertFixer(partsFor(doc), { introParagraphIndex: 2 }).applied).toBe(false);
  });

  it('visesekcijski rad, prijelom NIJE na Uvodu (naslovnica|sazetak|Uvod) -> NO_OP (v1 samo jednosekcijski)', () => {
    // Naslovnica(p1) nosi vlastiti sectPr, sazetak(p2), Uvod(p3): prijelom je izmedju naslovnice i
    // sazetka, NE na Uvodu (2 postojece sekcije). Umetanje markera prije Uvoda dalo bi 3 sekcije,
    // a hardkodirani [{0,rimski},{1,arapski}] bi sazetak (sekcija 1) krivo oznacio arapskim i
    // glavni tekst (sekcija 2) ostavio bez sheme. Backstop preSectPr.length===1 to sprjecava.
    const doc = `<w:document ${NS}><w:body>` +
      `<w:p><w:pPr>${MARKER_SECT}</w:pPr><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>` +
      '<w:p><w:r><w:t>Sazetak</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
      MAIN_SECT + '</w:body></w:document>';
    const out = sectionInsertFixer(partsFor(doc), { introParagraphIndex: 3 });
    expect(out.applied).toBe(false);
    expect(out.parts.documentXml).toBe(doc);
  });

  it('bez part flowa (nema content-types/rels): prijelom + pgNum vrijede, footer preskocen', () => {
    const out = sectionInsertFixer(partsFor(singleDoc(), false), { introParagraphIndex: 2 });
    expect(out.applied).toBe(true);
    expect(out.parts.documentXml).toContain('<w:pgNumType w:fmt="lowerRoman"');
    expect(out.parts.documentXml).toContain('<w:pgNumType w:fmt="decimal"');
    expect(out.parts.documentXml).not.toContain('<w:footerReference');
    expect(out.afterLabel).not.toContain('podnožju');
  });

  it('align se svede na whitelist (zlonamjerni navodnik ne razbija footer XML)', () => {
    const out = sectionInsertFixer(partsFor(singleDoc()), {
      introParagraphIndex: 2,
      align: '"/><script>' as unknown as 'center',
    });
    expect(out.applied).toBe(true);
    const footer = (out.parts.addedParts ?? []).find((p) => /footer/.test(p.name));
    expect(footer!.content).toContain('<w:jc w:val="center"/>'); // default, ne injektirana vrijednost
    expect(footer!.content).not.toContain('<script>');
  });

  it('sectPrChange -> NO_OP', () => {
    const doc = `<w:document ${NS}><w:body>` +
      '<w:p><w:r><w:t>a</w:t></w:r></w:p><w:p><w:r><w:t>Uvod</w:t></w:r></w:p>' +
      '<w:sectPr><w:sectPrChange w:id="1" w:author="x"><w:sectPr/></w:sectPrChange></w:sectPr>' +
      '</w:body></w:document>';
    expect(sectionInsertFixer(partsFor(doc), { introParagraphIndex: 2 }).applied).toBe(false);
  });
});

describe('introSectionItem (gating, neovisno o SECTION_INSERT_LIVE)', () => {
  const profile = { checkPageNumberStartAtIntro: true };
  const singleSectionResult = {
    details: { introParagraphIndex: 5, sections: [{ paragraphIndex: 99 }] }, // 1 sekcija -> nedetektabilno
    checks: [{ title: 'Numeriranje od prve stranice Uvoda', status: 'warn', max: 0 }],
  };

  it('nudi popravak za jednosekcijski rad (nedetektabilan split) s introParagraphIndex>=2', () => {
    const items = introSectionItem(singleSectionResult, profile);
    expect(items).toHaveLength(1);
    expect(items[0].fixerId).toBe('section-insert-fixer');
    expect(items[0].requiresConfirmation).toBe(true);
    expect((items[0].params as any).target.introParagraphIndex).toBe(5);
    expect(items[0].violated).toBe(true); // status 'warn' != 'pass'
  });

  it('profil ne trazi numeriranje od Uvoda -> prazno', () => {
    expect(introSectionItem(singleSectionResult, { checkPageNumberStartAtIntro: false })).toEqual([]);
  });

  it('introParagraphIndex < 2 (Uvod je prvi odlomak, nema prednjeg dijela) -> prazno', () => {
    expect(introSectionItem({ details: { introParagraphIndex: 1, sections: [{ paragraphIndex: 99 }] }, checks: [] }, profile)).toEqual([]);
  });

  it('vec postoji upotrebljiv split na Uvodu (K4 to rjesava) -> prazno', () => {
    const detectable = {
      details: { introParagraphIndex: 2, sections: [{ paragraphIndex: 1 }, { paragraphIndex: 99 }] },
      checks: [],
    };
    expect(introSectionItem(detectable, profile)).toEqual([]);
  });

  it('visesekcijski rad bez splita na Uvodu -> prazno (v1 samo jednosekcijski, isto kao fixer backstop)', () => {
    const multi = {
      details: { introParagraphIndex: 3, sections: [{ paragraphIndex: 1 }, { paragraphIndex: 99 }] },
      checks: [{ title: 'Numeriranje od prve stranice Uvoda', status: 'warn', max: 0 }],
    };
    expect(introSectionItem(multi, profile)).toEqual([]);
  });

  it('SECTION_INSERT_LIVE gate: javna introSectionRepairableItem je prazna (dark) dok flag ne padne', () => {
    // Feature je namjerno tamna dok rucna Word/LO matrica nije odradjena.
    expect(introSectionRepairableItem(singleSectionResult, profile)).toEqual([]);
  });
});

// End-to-end: dokazuje da introParagraphIndex (analyzeDocx) tocno mapira na N-ti <w:p> koji
// fixer cilja. Prije popravka Uvod je index 2; nakon umetanja re-analiza vidi 2 sekcije i Uvod
// na indexu 3 (marker je novi p2). Zatvara koordinatnu rupu specificnu za K6.
describe('applyFixers(section-insert) -> analyzeDocx (end-to-end koordinate)', () => {
  it('singleSectionDocx: Uvod idx 2 -> nakon popravka 2 sekcije, Uvod idx 3', async () => {
    const before = await singleSectionDocx();
    const beforeFile = new File([before as Uint8Array<ArrayBuffer>], 'single.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const beforeResult: any = await analyzeFixture(beforeFile);
    expect(beforeResult.details.introParagraphIndex).toBe(2);
    expect(beforeResult.details.sections).toHaveLength(1);

    const repaired = await applyFixers(before, [
      { ruleId: 'section-insert-intro', fixerId: 'section-insert-fixer', params: { target: { introParagraphIndex: 2, align: 'center' } } },
    ]);
    expect(repaired.changelog).toHaveLength(1);

    const afterFile = new File([repaired.docxBytes as Uint8Array<ArrayBuffer>], 'single-fixed.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const afterResult: any = await analyzeFixture(afterFile);
    expect(afterResult.details.sections).toHaveLength(2);
    // Uvod se pomaknuo za jedan (marker je umetnut prije njega).
    expect(afterResult.details.introParagraphIndex).toBe(3);
  });
});
