import { describe, expect, it } from 'vitest';
import { hasMergedCellsXml, isMergeMarker } from './merged-cells';

/**
 * T65 krug 2: izravni signal dijeljene detekcije spojenih celija (analiza i fixer zovu istu
 * funkciju; njihovo slaganje na istim tablicama mjeri table-figure-rescue.test.ts).
 */
describe('hasMergedCellsXml', () => {
  const cases: Array<[string, string, boolean]> = [
    ['bez spajanja', '<w:tbl><w:tr><w:tc><w:tcPr><w:tcW w:w="3000"/></w:tcPr></w:tc></w:tr></w:tbl>', false],
    ['w:gridSpan val=2', '<w:tcPr><w:gridSpan w:val="2"/></w:tcPr>', true],
    ['w:gridSpan val=2 s parom tagova', '<w:tcPr><w:gridSpan w:val="2"></w:gridSpan></w:tcPr>', true],
    ['w:gridSpan val=1', '<w:tcPr><w:gridSpan w:val="1"/></w:tcPr>', false],
    ['w:gridSpan val=+01', '<w:tcPr><w:gridSpan w:val="+01"/></w:tcPr>', false],
    ['w:gridSpan val = \'1\' uz razmake', "<w:tcPr><w:gridSpan w:val = '1' /></w:tcPr>", false],
    ['gridSpan bez vrijednosti (sigurna strana)', '<w:tcPr><w:gridSpan/></w:tcPr>', true],
    ['gridSpan s neispravnom vrijednoscu (sigurna strana)', '<w:tcPr><w:gridSpan w:val="x"/></w:tcPr>', true],
    ['gridSpan bez prefiksa', '<tcPr><gridSpan val="3"/></tcPr>', true],
    ['ne-ASCII prefiks ž', '<w:tcPr><ž:gridSpan ž:val="2"/></w:tcPr>', true],
    ['ne-ASCII prefiks sa znamenkom č1', '<w:tcPr><č1:gridSpan č1:val="2"/></w:tcPr>', true],
    ['ne-ASCII prefiks, val=1', '<w:tcPr><ž:gridSpan ž:val="1"/></w:tcPr>', false],
    ['hMerge', '<w:tcPr><w:hMerge/></w:tcPr>', true],
    ['vMerge nastavak', '<w:tcPr><w:vMerge/></w:tcPr>', true],
    ['vMerge restart s ne-ASCII prefiksom', '<w:tcPr><đ:vMerge đ:val="restart"/></w:tcPr>', true],
    ['slican naziv nije spajanje', '<w:tcPr><w:gridSpanX w:val="2"/><w:vMerged/></w:tcPr>', false],
    ['zatvarajuci tag sam nije spajanje', '</w:gridSpan>', false],
    ['zakomentiran element', '<w:tcPr><!-- <w:gridSpan w:val="2"/> <w:vMerge/> --></w:tcPr>', false],
    ['escapiran tekst u odlomku', '<w:t>&lt;w:gridSpan w:val="2"/&gt;</w:t>', false],
    ['drugi atribut koji zavrsava na val', '<w:tcPr><w:gridSpan w:interval="1" w:val="2"/></w:tcPr>', true],
    // Pregled drugog alata (Codex), krug 2, re-verificirano ovim slucajevima:
    // val drugog prefiksa ispred w:val ne smije proglasiti spojenu celiju obicnom.
    ['val drugog prefiksa ispred w:val=2', '<w:tcPr><w:gridSpan x:val="1" w:val="2"/></w:tcPr>', true],
    ['w:val=1 uz val drugog prefiksa =2 (sigurna strana)', '<w:tcPr><w:gridSpan x:val="2" w:val="1"/></w:tcPr>', true],
    // XML 1.0 NameStartChar ukljucuje i znakove izvan slovnih kategorija (npr. U+200C, U+2070).
    ['prefiks s U+200C (NameStartChar)', '<w:tcPr><‌:gridSpan ‌:val="2"/></w:tcPr>', true],
    ['prefiks s U+2070 (NameStartChar)', '<w:tcPr><⁰a:vMerge/></w:tcPr>', true],
    // Oznake unutar CDATA i processing instructiona nisu elementi.
    ['CDATA u odlomku', '<w:t><![CDATA[<w:gridSpan w:val="2"/>]]></w:t>', false],
    ['processing instruction', '<?lekta <w:gridSpan w:val="2"/> ?><w:tcPr/>', false],
    // `>` je dopusten unutar navodnika atributa i ne zavrsava element.
    ['> u navodnicima, val=1', '<w:tcPr><w:gridSpan x:note="a > b" w:val="1"/></w:tcPr>', false],
    ['> u navodnicima, val=3', "<w:tcPr><w:gridSpan x:note='a > b' w:val=\"3\"/></w:tcPr>", true],
    // Drugi Codex prolaz: val= unutar vrijednosti drugog atributa nije val atribut.
    ['val= u vrijednosti drugog atributa, bez pravog val', `<w:tcPr><w:gridSpan x:note=' val="1" '/></w:tcPr>`, true],
    ['val= u vrijednosti drugog atributa, pravi val=2', `<w:tcPr><w:gridSpan x:note=' val="1" ' w:val="2"/></w:tcPr>`, true],
    ['val= u vrijednosti drugog atributa, pravi val=1', `<w:tcPr><w:gridSpan x:note='val="3"' w:val="1"/></w:tcPr>`, false],
    ['dva komentara, spajanje izmedju', '<!-- a --><w:gridSpan w:val="2"/><!-- b -->', true],
    ['nezatvoren komentar ostaje u tekstu (sigurna strana)', '<w:tcPr><!-- <w:gridSpan w:val="2"/></w:tcPr>', true],
  ];
  for (const [name, xml, expected] of cases) {
    it(`${name}: ${expected}`, () => {
      expect(hasMergedCellsXml(xml)).toBe(expected);
    });
  }
});

describe('isMergeMarker', () => {
  it('hMerge i vMerge su uvijek spajanje, gridSpan samo kad val nije 1', () => {
    expect(isMergeMarker('hMerge', '')).toBe(true);
    expect(isMergeMarker('vMerge', ' w:val="continue"')).toBe(true);
    expect(isMergeMarker('gridSpan', ' w:val="3"')).toBe(true);
    expect(isMergeMarker('gridSpan', ' w:val="1"')).toBe(false);
    expect(isMergeMarker('tcW', ' w:w="1"')).toBe(false);
  });
});

/**
 * Lijeni regex za komentare/CDATA/PI na nezatvorenim sekcijama bio je kvadratan (100 000
 * nezatvorenih komentara: oko 70 s izmjereno), a nezatvoren navodnik u atributu isto bi skenirao
 * ostatak dokumenta za svaki element. Detekcija ide kroz fixer nad cijelim document.xml, pa mora
 * ostati linearna. Prag je sirok (5 s za sve) da ne pada pod opterecenjem; kvadratni kvar ga
 * prelazi za red velicine.
 */
describe('hasMergedCellsXml: linearno vrijeme na patoloskom ulazu', () => {
  it('nezatvoreni komentari, CDATA, PI i navodnici ne daju kvadratno vrijeme', () => {
    const start = performance.now();
    for (const unit of ['<!-- ab ', '<![CDATA[ab ', '<?x ab ', '<w:gridSpan x="ab ']) {
      hasMergedCellsXml(unit.repeat(100_000));
    }
    expect(performance.now() - start).toBeLessThan(5000);
  });
});
