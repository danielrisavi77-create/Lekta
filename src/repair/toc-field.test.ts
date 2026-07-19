// Unit + e2e testovi za K7 (BL-09): umetanje ZIVOG TOC polja (fldChar, w:dirty) iza naslova
// "Sadrzaj". Pokriva primitive buildTocFieldXml / documentHasTocField / insertParagraphAfterParagraph
// (koordinatni sustav, guardovi, balansiran kraj odlomka), kompozitni tocFieldFixer (no-op/idempotencija),
// gating u tocFieldItem i end-to-end koordinatnu konzistentnost + hasTocField kroz analyzeDocx.

import { describe, it, expect } from 'vitest';
import {
  buildTocFieldXml,
  documentHasTocField,
  insertParagraphAfterParagraph,
} from './xml-patch';
import { tocFieldFixer, type DocxXmlParts } from './fixers';
import { applyFixers } from './apply-fixers';
import { tocFieldItem, tocFieldRepairableItem } from '../ui/repair-items';
import { analyzeFixture } from '../analysis/golden-entry';
import { tocManualDocx } from '../../tests/helpers/synthetic-docx';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const SECT = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>';

// NASLOVNICA(1), Sadrzaj(2), rucna stavka Uvod..1(3), Uvod(4), zavrsni sectPr.
function manualTocDoc(): string {
  return (
    `<w:document ${NS}><w:body>` +
    '<w:p><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Sadržaj</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>Uvod\t1</w:t></w:r></w:p>' +
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
    SECT +
    '</w:body></w:document>'
  );
}
function partsFor(documentXml: string): DocxXmlParts {
  return { documentXml, stylesXml: '' };
}

describe('buildTocFieldXml', () => {
  it('SDT (Table of Contents) omot oko fldChar TOC polja s w:dirty i TOC instrukcijom', () => {
    const xml = buildTocFieldXml();
    expect(xml).toContain('<w:fldChar w:fldCharType="begin" w:dirty="true"/>');
    expect(xml).toMatch(/<w:instrText[^>]*> TOC \\o "1-3" \\h \\z \\u <\/w:instrText>/);
    expect(xml).toContain('<w:fldChar w:fldCharType="separate"/>');
    expect(xml).toContain('<w:fldChar w:fldCharType="end"/>');
    // SDT sadrzaj-kontrola = prava Word TOC kartica ("Azuriraj tablicu"), ne golo polje.
    expect(xml).toContain('<w:docPartGallery w:val="Table of Contents"/>');
    expect(xml.startsWith('<w:sdt>')).toBe(true);
    expect(xml.endsWith('</w:sdt>')).toBe(true);
  });
});

describe('documentHasTocField', () => {
  it('true za fldChar instrText TOC (nas izlaz)', () => {
    expect(documentHasTocField(`<w:body>${buildTocFieldXml()}</w:body>`)).toBe(true);
  });
  it('true za fldSimple TOC', () => {
    expect(documentHasTocField('<w:p><w:fldSimple w:instr=" TOC \\o &quot;1-3&quot; "/></w:p>')).toBe(true);
  });
  it('true za sdt docPartGallery Table of Contents', () => {
    expect(
      documentHasTocField(
        '<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/></w:docPartObj></w:sdtPr></w:sdt>',
      ),
    ).toBe(true);
  });
  it('false za obican dokument s RUCNIM Sadrzajem (bez polja)', () => {
    expect(documentHasTocField(manualTocDoc())).toBe(false);
  });
});

describe('insertParagraphAfterParagraph', () => {
  const NEW = '<w:p><w:r><w:t>NOVO</w:t></w:r></w:p>';

  it('umece IZA N-tog odlomka (p2 = Sadrzaj) -> izmedju p2 i p3', () => {
    const res = insertParagraphAfterParagraph(manualTocDoc(), 2, NEW);
    expect(res.applied).toBe(true);
    expect(res.xml).toContain('<w:t>Sadržaj</w:t></w:r></w:p>' + NEW + '<w:p><w:r><w:t>Uvod\t1</w:t>');
  });

  it('ordinal < 1 -> no-op', () => {
    const doc = manualTocDoc();
    const res = insertParagraphAfterParagraph(doc, 0, NEW);
    expect(res.applied).toBe(false);
    expect(res.xml).toBe(doc);
  });

  it('ordinal izvan raspona -> no-op', () => {
    expect(insertParagraphAfterParagraph(manualTocDoc(), 99, NEW).applied).toBe(false);
  });

  it('umece iza ZADNJEG odlomka (p4=Uvod) -> neposredno prije zavrsnog sectPr', () => {
    const res = insertParagraphAfterParagraph(manualTocDoc(), 4, NEW);
    expect(res.applied).toBe(true);
    expect(res.xml).toContain('<w:t>Uvod</w:t></w:r></w:p>' + NEW + SECT);
  });

  it('komentar s <w:p prije cilja NE pomice indeks (marker pred PRAVI iduci odlomak)', () => {
    const doc =
      `<w:document ${NS}><w:body>` +
      '<w:p><w:r><w:t>a</w:t></w:r></w:p>' +
      '<!-- <w:p>x</w:p> -->' +
      '<w:p><w:r><w:t>Sadržaj</w:t></w:r></w:p>' + // p2 (komentar se ne broji)
      '<w:p><w:r><w:t>poslije</w:t></w:r></w:p>' +
      SECT +
      '</w:body></w:document>';
    const res = insertParagraphAfterParagraph(doc, 2, NEW);
    expect(res.applied).toBe(true);
    expect(res.xml).toContain('<w:t>Sadržaj</w:t></w:r></w:p>' + NEW + '<w:p><w:r><w:t>poslije</w:t>');
  });

  it('cilj u tablici -> no-op (nije na razini tijela)', () => {
    const doc =
      `<w:document ${NS}><w:body>` +
      '<w:p><w:r><w:t>prije</w:t></w:r></w:p>' +
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>u celiji</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
      SECT +
      '</w:body></w:document>';
    expect(insertParagraphAfterParagraph(doc, 2, NEW).applied).toBe(false);
  });

  it('cilj sadrzi ugnjezden okvir (nested <w:p>) -> umece iza VANJSKOG </w:p>, ne u okvir', () => {
    const doc =
      `<w:document ${NS}><w:body>` +
      '<w:p><w:r><w:t>Sadržaj</w:t></w:r>' +
      '<w:r><w:txbxContent><w:p><w:r><w:t>u okviru</w:t></w:r></w:p></w:txbxContent></w:r>' +
      '</w:p>' + // vanjski </w:p>
      '<w:p><w:r><w:t>poslije</w:t></w:r></w:p>' +
      SECT +
      '</w:body></w:document>';
    const res = insertParagraphAfterParagraph(doc, 1, NEW);
    expect(res.applied).toBe(true);
    expect(res.xml).toContain('</w:txbxContent></w:r></w:p>' + NEW + '<w:p><w:r><w:t>poslije</w:t>');
  });
});

describe('tocFieldFixer', () => {
  it('umece TOC polje iza naslova Sadrzaj (p2); rucna stavka OSTAJE (ne brisemo)', () => {
    const out = tocFieldFixer(partsFor(manualTocDoc()), { sadrzajParagraphIndex: 2 });
    expect(out.applied).toBe(true);
    expect(documentHasTocField(out.parts.documentXml)).toBe(true);
    // Polje je neposredno IZA Sadrzaj, PRIJE rucne stavke.
    expect(out.parts.documentXml).toContain('<w:t>Sadržaj</w:t></w:r></w:p><w:sdt>');
    // Rucno upisana stavka NIJE obrisana.
    expect(out.parts.documentXml).toContain('<w:t>Uvod\t1</w:t>');
    expect(out.afterLabel).toContain('TOC polje');
  });

  it('dokument VEC ima TOC polje -> NO_OP (ne dupliciramo)', () => {
    const withField = manualTocDoc().replace('</w:body>', buildTocFieldXml() + '</w:body>');
    const out = tocFieldFixer(partsFor(withField), { sadrzajParagraphIndex: 2 });
    expect(out.applied).toBe(false);
    expect(out.parts.documentXml).toBe(withField);
  });

  it('idempotentan: druga primjena istog cilja = NO_OP (hasTocField)', () => {
    const first = tocFieldFixer(partsFor(manualTocDoc()), { sadrzajParagraphIndex: 2 });
    expect(first.applied).toBe(true);
    const second = tocFieldFixer(partsFor(first.parts.documentXml), { sadrzajParagraphIndex: 2 });
    expect(second.applied).toBe(false);
    expect(second.parts.documentXml).toBe(first.parts.documentXml);
  });

  it('RE-DERIVIRA sidro: pogresan/zastario index svejedno umece iza PRAVOG Sadrzaja', () => {
    // Index 99 je besmislen (samo prolazi gate >=1); fixer nalazi Sadrzaj po tekstu, ne po indeksu.
    const out = tocFieldFixer(partsFor(manualTocDoc()), { sadrzajParagraphIndex: 99 });
    expect(out.applied).toBe(true);
    expect(out.parts.documentXml).toContain('<w:t>Sadržaj</w:t></w:r></w:p><w:sdt>');
  });

  it('sidro otporno na promjenu broja odlomaka (kao nakon empty-paragraph-fixera u bateriji)', () => {
    // Simuliraj da je RANIJI fixer u bateriji obrisao odlomak prije Sadrzaja: Sadrzaj se pomakne s
    // p2 na p1, ali anal-time index (2) ostaje. Re-derivacija svejedno umece iza PRAVOG Sadrzaja
    // (bez re-derivacije bi TOC sletio iza pogresnog odlomka -> adversarial K7 HIGH).
    const shifted = manualTocDoc().replace('<w:p><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>', '');
    const out = tocFieldFixer(partsFor(shifted), { sadrzajParagraphIndex: 2 });
    expect(out.applied).toBe(true);
    expect(out.parts.documentXml).toContain('<w:t>Sadržaj</w:t></w:r></w:p><w:sdt>');
    // Umetnuto je iza Sadrzaja (p1), NE iza odlomka koji bi bio na zastarjelom indeksu 2.
    expect(out.parts.documentXml).not.toContain('<w:t>Uvod\t1</w:t></w:r></w:p><w:sdt>');
  });

  it('dokument bez naslova Sadrzaj -> NO_OP (re-derivacija ne nadje sidro)', () => {
    const noToc = `<w:document ${NS}><w:body>` +
      '<w:p><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>' +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>' +
      SECT + '</w:body></w:document>';
    expect(tocFieldFixer(partsFor(noToc), { sadrzajParagraphIndex: 2 }).applied).toBe(false);
  });

  it('lose sidro (index < 1) -> NO_OP (gate)', () => {
    expect(tocFieldFixer(partsFor(manualTocDoc()), { sadrzajParagraphIndex: 0 }).applied).toBe(false);
  });
});

describe('documentHasTocField: gramatika field koda (adversarial K7)', () => {
  it('split-run instrText ( TO + C ) i dalje detektira TOC polje (nema duplikata)', () => {
    const doc =
      '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> TO</w:instrText></w:r>' +
      '<w:r><w:instrText xml:space="preserve">C \\o "1-3" </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
    expect(documentHasTocField(doc)).toBe(true);
  });

  it('HYPERLINK polje s "toc" u URL-u NIJE lazno TOC (instrukcija ne pocinje s TOC)', () => {
    const doc =
      '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> HYPERLINK "https://narodne-novine.nn.hr/clanci/sluzbeni/toc" </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>link</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
    expect(documentHasTocField(doc)).toBe(false);
  });
});

describe('tocFieldItem (gating, neovisno o TOC_FIELD_LIVE)', () => {
  const profile = { requireToc: true };
  const result = { details: { sadrzajParagraphIndex: 2, hasTocField: false } };

  it('nudi kad requireToc + postoji Sadrzaj + nema polja', () => {
    const items = tocFieldItem(result, profile);
    expect(items).toHaveLength(1);
    expect(items[0].fixerId).toBe('toc-field-fixer');
    expect((items[0].params as any).target.sadrzajParagraphIndex).toBe(2);
    expect(items[0].violated).toBe(true);
  });

  it('profil ne trazi sadrzaj -> prazno', () => {
    expect(tocFieldItem(result, { requireToc: false })).toEqual([]);
  });

  it('nema naslova Sadrzaj (sadrzajParagraphIndex null) -> prazno', () => {
    expect(tocFieldItem({ details: { sadrzajParagraphIndex: null, hasTocField: false } }, profile)).toEqual([]);
  });

  it('vec ima zivo TOC polje -> prazno (ne dupliciramo)', () => {
    expect(tocFieldItem({ details: { sadrzajParagraphIndex: 2, hasTocField: true } }, profile)).toEqual([]);
  });

  it('TOC_FIELD_LIVE upaljen (WS-4): javna tocFieldRepairableItem sada nudi stavku (live)', () => {
    const items = tocFieldRepairableItem(result, profile);
    expect(items).toHaveLength(1);
    expect(items[0].fixerId).toBe('toc-field-fixer');
  });
});

describe('applyFixers(toc-field) -> analyzeDocx (e2e koordinate + hasTocField)', () => {
  it('tocManualDocx: Sadrzaj idx 2, hasTocField false -> nakon popravka hasTocField true', async () => {
    const before = await tocManualDocx();
    const beforeFile = new File([before as Uint8Array<ArrayBuffer>], 'toc.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const beforeResult: any = await analyzeFixture(beforeFile);
    expect(beforeResult.details.sadrzajParagraphIndex).toBe(2);
    expect(beforeResult.details.hasTocField).toBe(false);

    const repaired = await applyFixers(before, [
      { ruleId: 'toc-field', fixerId: 'toc-field-fixer', params: { target: { sadrzajParagraphIndex: 2 } } },
    ]);
    expect(repaired.changelog).toHaveLength(1);

    const afterFile = new File([repaired.docxBytes as Uint8Array<ArrayBuffer>], 'toc-fixed.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const afterResult: any = await analyzeFixture(afterFile);
    expect(afterResult.details.hasTocField).toBe(true);
  });
});
