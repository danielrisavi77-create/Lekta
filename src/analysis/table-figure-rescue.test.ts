import { describe, expect, it } from 'vitest';
import { parseXml } from '../docx/parser';
import { analyzeElementStructure } from './element-structure';
import { analyzeTableFigureRescue } from './table-figure-rescue';

const docXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:drawing><wp:inline><wp:extent cx="914400" cy="457200"/><wp:docPr id="1" name="Slika" descr="Opis"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:tbl><w:tblPr><w:tblW w:w="10000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="5000"/><w:gridCol w:w="5000"/></w:tblGrid><w:tr><w:trPr/></w:tr><w:tr><w:trPr><w:cantSplit/></w:trPr></w:tr></w:tbl></w:body></w:document>`;

describe('table-figure-rescue analiza', () => {
  it('pronalazi široku tablicu, zaglavlje i sliku s alt tekstom', () => {
    const document = parseXml(docXml, 'synthetic rescue');
    const structure = analyzeElementStructure(document, [{ index: 1, text: '' }, { index: 2, text: '' }]);
    const result = analyzeTableFigureRescue({ document, elementStructure: structure, availableWidthEmu: 5_000_000, media: { rId5: { widthPx: 300, heightPx: 150 } } });
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].wide).toBe(true);
    expect(result.tables[0].rowsWithCantSplit).toBe(1);
    expect(result.figures).toHaveLength(1);
    expect(result.figures[0].hasAltText).toBe(true);
    expect(result.figures[0].dpiX).toBeGreaterThan(200);
  });
});

/**
 * T65: popravak preskace equalColumns na tablici sa spojenim celijama. Analiza to mora reci
 * (mergedCells + evidence), a da pritom ne mijenja unsupported ni confidence: to je izravan
 * signal da se bodovanje i predodabir tablice nisu promijenili.
 */
describe('table-figure-rescue analiza: spojene celije (T65)', () => {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const tc = (extra: string, text: string) => `<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/>${extra}</w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
  const table = (first: string, second: string) => `<w:tbl><w:tblPr><w:tblW w:w="6000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid><w:tr>${tc(first, 'A')}${tc('', 'B')}</w:tr><w:tr>${tc(second, 'C')}${tc('', 'D')}</w:tr></w:tbl>`;
  const analyse = (tbl: string) => {
    const document = parseXml(`<w:document ${W}><w:body><w:p><w:r><w:t>Prije</w:t></w:r></w:p>${tbl}<w:p><w:r><w:t>Poslije</w:t></w:r></w:p></w:body></w:document>`, 'T65');
    const structure = analyzeElementStructure(document, [{ index: 0, text: 'Prije' }, { index: 1, text: 'Poslije' }]);
    const result = analyzeTableFigureRescue({ document, elementStructure: structure, availableWidthEmu: 6_000_000 });
    expect(result.tables).toHaveLength(1);
    return result.tables[0];
  };
  const plain = analyse(table('', ''));

  it('tablica bez spojenih celija nema mergedCells ni napomenu', () => {
    expect(plain.mergedCells).toBe(false);
    expect(plain.evidence.join(' ')).not.toContain('spojene ćelije');
  });

  for (const [name, first, second] of [['gridSpan', '<w:gridSpan w:val="2"/>', ''], ['vMerge', '<w:vMerge w:val="restart"/>', '<w:vMerge/>'], ['hMerge', '<w:hMerge w:val="restart"/>', '']] as const) {
    it(`${name}: mergedCells i napomena, a unsupported i confidence isti kao bez spajanja`, () => {
      const merged = analyse(table(first, second));
      expect(merged.mergedCells).toBe(true);
      expect(merged.evidence).toContain('spojene ćelije: stupci se neće ujednačiti');
      expect(merged.unsupported).toBe(plain.unsupported);
      expect(merged.confidence).toBe(plain.confidence);
    });
  }
});
