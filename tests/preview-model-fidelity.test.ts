/**
 * Plumbing test za vjernost naslovnice u "Vjernom prikazu" (faksimil): dokazuje da analyzeDocx
 * PROSLJEDJUJE u `preview.paragraphs` stvarnu velicinu odlomka, okomite razmake (before/after),
 * prored (line) i UGRADJENE SLIKE (grb/logo) kao data: URI. Ovaj sloj je u analyze-docx `any`
 * pa ga tsc ne provjerava; render-facsimile.test.ts pokriva renderer, a ovaj test granicu
 * parser -> preview model (imena polja, izvlacenje slike rel -> word/media -> data URI).
 *
 * Gradi kontrolirani .docx (helpers/docx-builder) s raw odlomcima za razmake i crtez, plus
 * word/_rels/document.xml.rels i word/media/image1.png kao extraFiles. Nije pravi rad ni izvor
 * pravila (CLAUDE.md); cisto regresijski net za preview plumbing.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec, type ZipFileSpec } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';

const TNR = 'Times New Roman';
const enc = new TextEncoder();

// Odlomak s crtezom (w:drawing) koji preko a:blip r:embed pokazuje na rId100; wp:extent u EMU
// (1440000 x 720000 = 4 x 2 cm). Namespace prefiksi deklarirani inline da XML ostane valjan.
const DRAWING_PARA: ParaSpec = {
  text: '',
  raw:
    '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>' +
    '<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
    '<wp:extent cx="1440000" cy="720000"/>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill>' +
    '<a:blip r:embed="rId100" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>' +
    '</pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline>' +
    '</w:drawing></w:r></w:p>',
};

// Odlomak s eksplicitnim razmacima: before=360 twips (18pt), after=120 (6pt), line=360 (prored 1,5).
const SPACING_PARA: ParaSpec = {
  text: 'Odlomak s razmakom',
  raw:
    '<w:p><w:pPr><w:spacing w:before="360" w:after="120" w:line="360" w:lineRule="auto"/></w:pPr>' +
    '<w:r><w:t xml:space="preserve">Odlomak s razmakom</w:t></w:r></w:p>',
};

// word/_rels/document.xml.rels: rId100 -> media/image1.png (relativno na word/).
const DOC_RELS: ZipFileSpec = {
  name: 'word/_rels/document.xml.rels',
  data: enc.encode(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId100" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>' +
      '</Relationships>',
  ),
};

// Minimalna "PNG" datoteka: potpis + par bajtova. Izvlacenje ne validira sadrzaj, samo bajtove.
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03]);
const MEDIA_PNG: ZipFileSpec = { name: 'word/media/image1.png', data: PNG_BYTES };

const body = (text: string): ParaSpec => ({ text, font: TNR, sizePt: 12, jc: 'both' });

describe('preview model: vjernost naslovnice (analyze-docx -> preview.paragraphs)', () => {
  it('prosljedjuje velicinu naslova, razmake/prored i ugradjenu sliku (data: URI) u preview', async () => {
    const file = buildDocxFile(
      {
        paragraphs: [
          { text: 'Naslov Rada', font: TNR, sizePt: 20, styleId: 'Heading1', jc: 'center' },
          DRAWING_PARA,
          SPACING_PARA,
          { empty: true },
          body('Ovo je tijelo rada u jednom odlomku sa smislenim sadrzajem za analizu.'),
        ],
      },
      'naslovnica-fidelity.docx',
      [DOC_RELS, MEDIA_PNG],
    );

    const result: any = await analyzeFixture(file);
    const paras = result.preview.paragraphs as Array<any>;

    // 1) Stvarna velicina naslova (20pt) stigla je u model.
    const heading = paras.find((p) => typeof p.text === 'string' && p.text.includes('Naslov Rada'));
    expect(heading).toBeTruthy();
    expect(heading.size).toBe(20);

    // 2) Okomiti razmaci i prored (before=18pt, after=6pt, line=1,5).
    const spaced = paras.find((p) => typeof p.text === 'string' && p.text.includes('razmakom'));
    expect(spaced).toBeTruthy();
    expect(spaced.spaceBefore).toBe(18);
    expect(spaced.spaceAfter).toBe(6);
    expect(spaced.lineHeight).toBeCloseTo(1.5, 5);

    // 3) Ugradjena slika (grb/logo): data: URI + dimenzije iz wp:extent (4 x 2 cm).
    const withImg = paras.find((p) => Array.isArray(p.images) && p.images.length);
    expect(withImg).toBeTruthy();
    expect(withImg.images[0].src.startsWith('data:image/png;base64,')).toBe(true);
    expect(withImg.images[0].wCm).toBe(4);
    expect(withImg.images[0].hCm).toBe(2);
  });

  it('preskace nepodrzani tip slike (npr. emf) bez rusenja analize', async () => {
    const relsEmf: ZipFileSpec = {
      name: 'word/_rels/document.xml.rels',
      data: enc.encode(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId100" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.emf"/>' +
          '</Relationships>',
      ),
    };
    const mediaEmf: ZipFileSpec = { name: 'word/media/image1.emf', data: PNG_BYTES };
    const file = buildDocxFile(
      { paragraphs: [DRAWING_PARA, body('Tijelo rada za analizu bez podrzane slike.')] },
      'naslovnica-emf.docx',
      [relsEmf, mediaEmf],
    );
    const result: any = await analyzeFixture(file);
    const paras = result.preview.paragraphs as Array<any>;
    // emf nije u whitelisti rasterskih tipova -> nijedan odlomak nema slike.
    expect(paras.some((p) => Array.isArray(p.images) && p.images.length)).toBe(false);
  });

  it('prosljedjuje tablicne celije (cell) i znakovne stilove (caps/underline) u preview', async () => {
    const capsPara: ParaSpec = {
      raw: '<w:p><w:r><w:rPr><w:caps/></w:rPr><w:t xml:space="preserve">zdravstveno veleuciliste</w:t></w:r></w:p>',
    };
    const uPara: ParaSpec = {
      raw: '<w:p><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">15. rujna 2026.</w:t></w:r></w:p>',
    };
    const table: ParaSpec = {
      raw:
        '<w:tbl><w:tr>' +
        '<w:tc><w:p><w:r><w:t xml:space="preserve">Mentor</w:t></w:r></w:p></w:tc>' +
        '<w:tc><w:p><w:r><w:t xml:space="preserve">Student</w:t></w:r></w:p></w:tc>' +
        '</w:tr></w:tbl>',
    };
    const file = buildDocxFile(
      { paragraphs: [capsPara, uPara, table, body('Tijelo rada za analizu bez posebnosti.')] },
      'naslovnica-styles.docx',
    );
    const result: any = await analyzeFixture(file);
    const paras = result.preview.paragraphs as Array<any>;

    // caps + underline stigli na runove.
    const runs = paras.flatMap((p) => (Array.isArray(p.runs) ? p.runs : []));
    expect(runs.some((r: any) => r.caps === true)).toBe(true);
    expect(runs.some((r: any) => r.underline === true)).toBe(true);

    // Tablicne celije: Mentor/Student s cell.col 0 i 1 u istom retku.
    const mentor = paras.find((p) => p.text === 'Mentor');
    const student = paras.find((p) => p.text === 'Student');
    expect(mentor.cell).toEqual({ tableId: 0, row: 0, col: 0 });
    expect(student.cell).toEqual({ tableId: 0, row: 0, col: 1 });
  });
});
