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
