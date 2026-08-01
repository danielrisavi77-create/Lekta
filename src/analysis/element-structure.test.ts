import { describe, expect, it } from 'vitest';
import { parseXml } from '../docx/parser';
import { analyzeElementStructure } from './element-structure';

describe('element-structure', () => {
  it('prepoznaje tablicu, sliku, grafikon, rucni broj, izvor i pozivanje', () => {
    const doc = parseXml('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' +
      '<w:p><w:r><w:t>Tablica broj 3. Rezultati ankete</w:t></w:r></w:p>' +
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>celija</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
      '<w:p><w:r><w:t>Izvor: vlastito istraživanje</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Slika 1. Model rada</w:t></w:r></w:p>' +
      '<w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><a:blip r:embed="rId1"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>' +
      '<w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><c:chart r:id="rId2"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>' +
      '<w:p><w:r><w:t>U tekstu se vidi Tablica 3.</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Popis tablica</w:t></w:r></w:p>' +
      '</w:body></w:document>', 'test');
    const result = analyzeElementStructure(doc, [
      { index: 1, text: 'Tablica broj 3. Rezultati ankete' },
      { index: 2, text: 'celija' },
      { index: 3, text: 'Izvor: vlastito istraživanje' },
      { index: 4, text: 'Slika 1. Model rada' },
      { index: 5, text: '' },
      { index: 6, text: '' },
      { index: 7, text: 'U tekstu se vidi Tablica 3.' },
      { index: 8, text: 'Popis tablica' },
    ]);
    expect(result.summary.byKind).toEqual({ table: 1, figure: 1, chart: 1 });
    expect(result.candidates[0].existingCaption?.manualNumber).toBe('3');
    expect(result.candidates[0].source?.text).toContain('Izvor:');
    expect(result.candidates[0].confidence).toBe('high');
    expect(result.references.some((reference) => reference.elementId === result.candidates[0].id)).toBe(true);
    expect(result.lists.table).toBe(true);
  });

  it('iskljucuje elemente u tablicama i tekstualnim okvirima', () => {
    const doc = parseXml('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' +
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p></w:tc></w:tr></w:tbl>' +
      '<w:p><w:txbxContent><w:p><w:r><w:drawing><a:blip r:embed="rId3"/></w:drawing></w:r></w:p></w:txbxContent></w:p>' +
      '</w:body></w:document>', 'test');
    const result = analyzeElementStructure(doc, [{ index: 1, text: '' }, { index: 2, text: '' }, { index: 3, text: '' }]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].kind).toBe('table');
  });
});
