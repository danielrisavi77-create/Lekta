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
