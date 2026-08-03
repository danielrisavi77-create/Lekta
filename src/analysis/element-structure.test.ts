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

describe('element-structure: jedinstvenost identiteta', () => {
  /**
   * RE-56. Identitet elementa se gradio kao `element-<vrsta>-<otisak sadrzaja>`, pa su DVIJE
   * bajt-identicne tablice dobivale ISTI id. element-caption-fixer takav recept odbija
   * (`ids.has(element.id)`) i vraca 'invalid-params' za CIJELI popravak, dakle rad ostane bez
   * ijednog natpisa zbog dva ponovljena predloska tablice.
   *
   * Otisak sadrzaja i dalje sluzi provjeri sidra; za IDENTITET mora se dodati redni broj, koji
   * je jedinstven po vrsti i deterministican jer se broji redom kroz tijelo dokumenta.
   */
  it('dvije bajt-identicne tablice dobivaju razlicite id-eve', () => {
    const table = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>ista celija</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
    const doc = parseXml(
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        '<w:p><w:r><w:t>Tablica 1. Prvi predlozak</w:t></w:r></w:p>' + table +
        '<w:p><w:r><w:t>Tablica 2. Drugi predlozak</w:t></w:r></w:p>' + table +
        '</w:body></w:document>',
      'test',
    );
    const result = analyzeElementStructure(doc, [
      { index: 1, text: 'Tablica 1. Prvi predlozak' },
      { index: 2, text: 'ista celija' },
      { index: 3, text: 'Tablica 2. Drugi predlozak' },
      { index: 4, text: 'ista celija' },
    ] as never);

    const ids = result.candidates.map((candidate) => candidate.id);
    expect(ids.length, 'obje tablice moraju biti prepoznate').toBe(2);
    expect(new Set(ids).size, `id-evi moraju biti jedinstveni, dobiveno: ${ids.join(', ')}`).toBe(2);
  });
});
