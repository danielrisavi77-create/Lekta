// Unit testovi za K4 (BL-06 korak a): pgNumType fixer nad postojecim sekcijama.
// Pokriva patch/insert poziciju (CT_SectPr: iza pgMar, prije cols), oba oblika sectPr
// (container + self-closing), poravnanje indeksa s els(doc,'w:sectPr'), idempotenciju,
// sectPrChange sigurnosni no-op te cistu granicu Uvoda (sectionNumberingTargets).

import { describe, it, expect } from 'vitest';
import { patchSectionPageNumbering, type SectionNumberingTarget } from './xml-patch';
import { pageNumberingFixer } from './fixers';
import { sectionNumberingTargets } from '../ui/repair-items';
import { analyzeFixture } from '../analysis/golden-entry';
import { multiSectionDocx } from '../../tests/helpers/synthetic-docx';

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const FRONT_SECT = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1134" w:bottom="1417" w:left="1417"/></w:sectPr>';
const MAIN_SECT = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/><w:cols w:space="708"/></w:sectPr>';

function twoSectionDoc(): string {
  return (
    `<w:document ${NS}><w:body>` +
    `<w:p><w:pPr>${FRONT_SECT}</w:pPr><w:r><w:t>NASLOVNICA</w:t></w:r></w:p>` +
    `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>` +
    `<w:p><w:r><w:t>Tijelo.</w:t></w:r></w:p>` +
    MAIN_SECT +
    `</w:body></w:document>`
  );
}

const FRONT_MAIN: SectionNumberingTarget[] = [
  { sectionIndex: 0, fmt: 'lowerRoman', start: 1 },
  { sectionIndex: 1, fmt: 'decimal', start: 1 },
];

describe('patchSectionPageNumbering: umetanje po sekcijama', () => {
  it('umece pgNumType u obje sekcije na ispravnu CT_SectPr poziciju', () => {
    const res = patchSectionPageNumbering(twoSectionDoc(), FRONT_MAIN);
    expect(res.applied).toBe(true);

    // Sekcija 0 (prednja, bez cols): pgNumType odmah IZA pgMar.
    expect(res.xml).toContain('<w:pgMar w:top="1417" w:right="1134" w:bottom="1417" w:left="1417"/><w:pgNumType w:fmt="lowerRoman" w:start="1"/>');
    // Sekcija 1 (glavna, ima cols): pgNumType PRIJE cols.
    expect(res.xml).toContain('<w:pgNumType w:fmt="decimal" w:start="1"/><w:cols w:space="708"/>');
    // Tocno dvije pgNumType oznake (po jedna po sekciji), nista uniformno preko svih.
    expect((res.xml.match(/<w:pgNumType\b/g) ?? []).length).toBe(2);
  });

  it('idempotentan: druga primjena istih ciljeva je no-op', () => {
    const once = patchSectionPageNumbering(twoSectionDoc(), FRONT_MAIN);
    const twice = patchSectionPageNumbering(once.xml, FRONT_MAIN);
    expect(twice.applied).toBe(false);
    expect(twice.xml).toBe(once.xml);
  });

  it('krpa POSTOJECI pgNumType (mijenja fmt, dodaje start koji fali)', () => {
    const doc = `<w:document ${NS}><w:body><w:p><w:r><w:t>x</w:t></w:r></w:p>` +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/><w:pgNumType w:fmt="decimal"/></w:sectPr>' +
      '</w:body></w:document>';
    const res = patchSectionPageNumbering(doc, [{ sectionIndex: 0, fmt: 'lowerRoman', start: 1 }]);
    expect(res.applied).toBe(true);
    expect(res.xml).toContain('<w:pgNumType w:fmt="lowerRoman" w:start="1"/>');
    expect((res.xml.match(/<w:pgNumType\b/g) ?? []).length).toBe(1); // nije duplicirano
  });

  it('prazni targeti = bit-identican no-op', () => {
    const doc = twoSectionDoc();
    const res = patchSectionPageNumbering(doc, []);
    expect(res.applied).toBe(false);
    expect(res.xml).toBe(doc);
  });

  it('sectPrChange (pracene promjene) = sigurnosni no-op, ne mijenja dokument', () => {
    const doc = `<w:document ${NS}><w:body><w:p><w:r><w:t>x</w:t></w:r></w:p>` +
      '<w:sectPr><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/>' +
      '<w:sectPrChange w:id="1" w:author="a"><w:sectPr><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000"/></w:sectPr></w:sectPrChange>' +
      '</w:sectPr></w:body></w:document>';
    const res = patchSectionPageNumbering(doc, [{ sectionIndex: 0, fmt: 'decimal', start: 1 }]);
    expect(res.applied).toBe(false);
    expect(res.xml).toBe(doc);
  });

  it('poravnanje indeksa: self-closing sectPr se broji kao sekcija', () => {
    // Sekcija 0 = self-closing (<w:sectPr/>), sekcija 1 = container. Cilj samo indeks 1.
    const doc = `<w:document ${NS}><w:body>` +
      '<w:p><w:pPr><w:sectPr/></w:pPr><w:r><w:t>front</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Uvod</w:t></w:r></w:p>' +
      MAIN_SECT +
      '</w:body></w:document>';
    const res = patchSectionPageNumbering(doc, [{ sectionIndex: 1, fmt: 'decimal', start: 1 }]);
    expect(res.applied).toBe(true);
    // Sekcija 1 dobila pgNumType prije cols; sekcija 0 (self-closing) ostala netaknuta.
    expect(res.xml).toContain('<w:pgNumType w:fmt="decimal" w:start="1"/><w:cols');
    expect(res.xml).toContain('<w:sectPr/>'); // prazna prednja sekcija nedirnuta (nije bila cilj)
    expect((res.xml.match(/<w:pgNumType\b/g) ?? []).length).toBe(1);
  });

  it('self-closing sectPr kao cilj se pretvara u kontejner s pgNumType', () => {
    const doc = `<w:document ${NS}><w:body><w:p><w:pPr><w:sectPr/></w:pPr><w:r><w:t>x</w:t></w:r></w:p></w:body></w:document>`;
    const res = patchSectionPageNumbering(doc, [{ sectionIndex: 0, fmt: 'lowerRoman', start: 1 }]);
    expect(res.applied).toBe(true);
    expect(res.xml).toContain('<w:sectPr><w:pgNumType w:fmt="lowerRoman" w:start="1"/></w:sectPr>');
  });

  it('bez cols, s pgBorders+lnNumType: pgNumType ide IZA njih (CT_SectPr poredak)', () => {
    // Regresija za adversarial LOW nalaz: fallback ne smije umetnuti pgNumType ispred
    // pgBorders/lnNumType koji po shemi prethode pgNumType.
    const doc = `<w:document ${NS}><w:body><w:p><w:r><w:t>x</w:t></w:r></w:p>` +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/>' +
      '<w:pgBorders w:offsetFrom="page"><w:top w:val="single" w:sz="4"/></w:pgBorders>' +
      '<w:lnNumType w:countBy="1"/>' +
      '</w:sectPr></w:body></w:document>';
    const res = patchSectionPageNumbering(doc, [{ sectionIndex: 0, fmt: 'decimal', start: 1 }]);
    expect(res.applied).toBe(true);
    // pgNumType tocno iza lnNumType (zadnji element prije pgNumType), prije </w:sectPr>.
    expect(res.xml).toContain('<w:lnNumType w:countBy="1"/><w:pgNumType w:fmt="decimal" w:start="1"/></w:sectPr>');
    // NE smije biti ispred pgBorders.
    expect(res.xml).not.toMatch(/<w:pgNumType[^>]*\/>\s*<w:pgBorders/);
  });
});

describe('pageNumberingFixer', () => {
  it('primjenjuje se na multi-section i vraca citljiv changelog', () => {
    const out = pageNumberingFixer({ documentXml: twoSectionDoc(), stylesXml: '' }, FRONT_MAIN);
    expect(out.applied).toBe(true);
    expect(out.parts.documentXml).toContain('<w:pgNumType w:fmt="lowerRoman"');
    expect(out.parts.documentXml).toContain('<w:pgNumType w:fmt="decimal"');
    expect(out.afterLabel).toMatch(/[Rr]imski.*arapski/);
  });

  it('prazni targeti = NO_OP (applied false, parts nedirnuti)', () => {
    const parts = { documentXml: twoSectionDoc(), stylesXml: '' };
    const out = pageNumberingFixer(parts, []);
    expect(out.applied).toBe(false);
    expect(out.parts.documentXml).toBe(parts.documentXml);
  });
});

describe('sectionNumberingTargets: granica Uvoda', () => {
  it('naslovnica prije Uvoda, tijelo od Uvoda -> rimski+arapski, start=1 na svakoj', () => {
    const r = sectionNumberingTargets([{ paragraphIndex: 0 }, { paragraphIndex: 99 }], 1);
    expect(r.detectable).toBe(true);
    expect(r.targets).toEqual([
      { sectionIndex: 0, fmt: 'lowerRoman', start: 1 },
      { sectionIndex: 1, fmt: 'decimal', start: 1 },
    ]);
  });

  it('jedna sekcija -> nije detektabilno', () => {
    expect(sectionNumberingTargets([{ paragraphIndex: 99 }], 1).detectable).toBe(false);
  });

  it('nepoznat Uvod (introIndex null) -> nije detektabilno', () => {
    expect(sectionNumberingTargets([{ paragraphIndex: 0 }, { paragraphIndex: 99 }], null).detectable).toBe(false);
  });

  it('sve sekcije prednje (nema glavne) -> nije detektabilno', () => {
    expect(sectionNumberingTargets([{ paragraphIndex: 0 }, { paragraphIndex: 1 }], 5).detectable).toBe(false);
  });

  it('nijedna sekcija prednja (frontCount 0) -> nije detektabilno', () => {
    expect(sectionNumberingTargets([{ paragraphIndex: 5 }, { paragraphIndex: 6 }], 1).detectable).toBe(false);
  });

  it('tri sekcije: dvije prednje pa jedna glavna -> start=1 na prvoj prednjoj i prvoj glavnoj', () => {
    const r = sectionNumberingTargets([{ paragraphIndex: 0 }, { paragraphIndex: 2 }, { paragraphIndex: 99 }], 3);
    expect(r.detectable).toBe(true);
    expect(r.targets).toEqual([
      { sectionIndex: 0, fmt: 'lowerRoman', start: 1 },
      { sectionIndex: 1, fmt: 'lowerRoman' },
      { sectionIndex: 2, fmt: 'decimal', start: 1 },
    ]);
  });

  it('prijelom NIJE na Uvodu (sazetak/sadrzaj u istoj sekciji kao Uvod) -> NIJE detektabilno', () => {
    // Adversarial MEDIUM nalaz: jedan prijelom iza naslovnice (sekcija 0 zavrsava na par. 1),
    // ali Uvod je tek par. 5 (sazetak/sadrzaj su par. 2-4 u glavnoj sekciji). start=1 bi
    // restartao numeriranje na sazetku, ne na Uvodu -> fixer se ne smije ponuditi.
    expect(sectionNumberingTargets([{ paragraphIndex: 1 }, { paragraphIndex: 50 }], 5).detectable).toBe(false);
  });

  it('prijelom KOINCIDIRA s Uvodom (prednja zavrsava tocno prije Uvoda) -> detektabilno', () => {
    // Prednja sekcija zavrsava na par. 4, Uvod je par. 5 (glavna sekcija POCINJE Uvodom).
    const r = sectionNumberingTargets([{ paragraphIndex: 4 }, { paragraphIndex: 50 }], 5);
    expect(r.detectable).toBe(true);
    expect(r.targets).toEqual([
      { sectionIndex: 0, fmt: 'lowerRoman', start: 1 },
      { sectionIndex: 1, fmt: 'decimal', start: 1 },
    ]);
  });
});

// End-to-end: dokazuje da ZIVA analyzeDocx putanja (introParagraphIndex + sections iz details)
// kroz sectionNumberingTargets proizvede TOCNE targete. Golden koristi hardkodirane targete pa
// ovo zatvara jedinu preostalu rupu: da su paragraph.index i section.paragraphIndex u ISTOM
// koordinatnom sustavu (oba idx+1 iz analyze-docx.ts, ista usporedba kao audit :62).
describe('analyzeDocx -> sectionNumberingTargets (end-to-end koordinatna konzistentnost)', () => {
  it('multiSectionDocx: Uvod je index 2, sekcije [1,3] -> targeti rimski(0)+arapski(1) start=1', async () => {
    const file = new File([(await multiSectionDocx()) as Uint8Array<ArrayBuffer>], 'multi.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const result: any = await analyzeFixture(file);
    expect(result.details.introParagraphIndex).toBe(2);
    expect(result.details.sections.map((s: any) => s.paragraphIndex)).toEqual([1, 3]);

    const { detectable, targets } = sectionNumberingTargets(
      result.details.sections,
      result.details.introParagraphIndex,
    );
    expect(detectable).toBe(true);
    expect(targets).toEqual([
      { sectionIndex: 0, fmt: 'lowerRoman', start: 1 },
      { sectionIndex: 1, fmt: 'decimal', start: 1 },
    ]);
  });
});
