import { describe, expect, it } from 'vitest';
import { anchorFingerprintForXml } from '../analysis/element-structure';
import { tableFigureRescueFixer } from './table-figure-rescue-fixer';
import { applyFixers, detectIntegrityFailure } from './apply-fixers';
import { writeZip } from './zip-codec';

const table = `<w:tbl xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid><w:tr><w:trPr/></w:tr><w:tr><w:tc><w:tcPr><w:tcW w:w="4500"/></w:tcPr></w:tc><w:tc><w:tcPr><w:tcW w:w="4500"/></w:tcPr></w:tc></w:tr></w:tbl>`;
const documentXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${table}</w:body></w:document>`;
const source = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:r><w:t>Izvor: službeni podaci</w:t></w:r></w:p>`;

describe('table-figure-rescue fixer', () => {
  it('dodaje fiksnu širinu, zaglavlje i cantSplit bez promjene teksta', () => {
    const parts = { documentXml, stylesXml: '' };
    const result = tableFigureRescueFixer(parts, { version: 1, tables: [{ id: 't', bodyChildIndex: 0, anchorFingerprint: anchorFingerprintForXml('table', table), textWidthEmu: 6_000_000, actions: { fitToTextWidth: true, equalColumns: true, repeatHeader: true, preventRowSplit: true, center: true } }], figures: [] });
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain('w:tblLayout');
    expect(result.parts.documentXml).toContain('w:tblHeader');
    expect(result.parts.documentXml).toContain('w:cantSplit');
    expect(result.parts.documentXml).toContain('w:jc w:val="center"');
    const second = tableFigureRescueFixer(result.parts, { version: 1, tables: [{ id: 't', bodyChildIndex: 0, anchorFingerprint: anchorFingerprintForXml('table', table), textWidthEmu: 6_000_000, actions: { fitToTextWidth: true, equalColumns: true, repeatHeader: true, preventRowSplit: true, center: true } }], figures: [] });
    expect(second.applied).toBe(false);
  });

  it('primjenjuje profilnu tipografiju i odvaja potvrđeni izvor', () => {
    const fontTable = table.replace('</w:tc></w:tr>', '<w:p><w:r><w:t>X</w:t></w:r></w:p></w:tc></w:tr>');
    const parts = { documentXml: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${fontTable}${source}</w:body></w:document>`, stylesXml: '' };
    const result = tableFigureRescueFixer(parts, { version: 1, tables: [{ id: 't', bodyChildIndex: 0, anchorFingerprint: anchorFingerprintForXml('table', fontTable), typography: { font: 'Arial', sizePt: 10, beforePt: 0, afterPt: 3 }, source: { paragraphIndex: 2, anchorFingerprint: anchorFingerprintForXml('figure', source) }, actions: { applyProfileTypography: true, separateSource: true } }], figures: [] });
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain('w:ascii="Arial"');
    expect(result.parts.documentXml).toContain('w:after="60"');
    expect(result.parts.documentXml).toContain('Izvor: službeni podaci');
  });
});

/**
 * T65: equalColumns je prepisivao SVAKI <w:tcW> u tablici sirinom JEDNOG stupca i nije gledao
 * spojene celije. Celija s <w:gridSpan w:val="2"/> tako je dobivala sirinu jednog stupca, pa grid
 * i celije vise nisu bili uskladjeni. Odluka (opcija A): na tablici sa spojenim celijama
 * (gridSpan ili vMerge) equalColumns se preskace, a tblGrid i svi tcW ostaju bajt-identicni.
 * Ostale akcije istog zahtjeva rade kao i prije.
 */
const WNS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const cell = (width: number, text: string, extra = '') => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${extra}</w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
// Jedan red, grid 2000/3000/4000 (ukupno 9000, jedan stupac = 3000); prva celija se proteze preko dva stupca.
const gridSpanTable = `<w:tbl ${WNS}><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="3000"/><w:gridCol w:w="4000"/></w:tblGrid><w:tr>${cell(5000, 'Spojeno zaglavlje', '<w:gridSpan w:val="2"/>')}${cell(4000, 'Desno')}</w:tr></w:tbl>`;
// Dva reda, grid 3000/6000, prvi stupac okomito spojen.
const vMergeTable = `<w:tbl ${WNS}><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="6000"/></w:tblGrid><w:tr>${cell(3000, 'Skupina', '<w:vMerge w:val="restart"/>')}${cell(6000, 'Prvi')}</w:tr><w:tr>${cell(3000, '', '<w:vMerge/>')}${cell(6000, 'Drugi')}</w:tr></w:tbl>`;
const wrapDoc = (tbl: string) => `<w:document ${WNS}><w:body>${tbl}</w:body></w:document>`;
type Actions = Partial<Record<'fitToTextWidth' | 'equalColumns' | 'repeatHeader' | 'preventRowSplit' | 'center', true>>;
const rescueParams = (tbl: string, actions: Actions, textWidthEmu?: number) => ({ version: 1 as const, tables: [{ id: 't', bodyChildIndex: 0, anchorFingerprint: anchorFingerprintForXml('table', tbl), ...(textWidthEmu ? { textWidthEmu } : {}), actions }], figures: [] });
const gridOf = (xml: string) => xml.match(/<w:tblGrid\b[^>]*>[\s\S]*?<\/w:tblGrid>/i)?.[0];
const tcWidths = (xml: string) => [...xml.matchAll(/<w:tcW\b[^>]*>/gi)].map((m) => m[0]);
/** Vidljivi tekst: spojeni w:t svakog odlomka, procitan kroz DOM, ne sirovi XML. */
const paragraphTexts = (xml: string) => {
  const doc = new DOMParser().parseFromString(xml.replace(/\r/g, ''), 'application/xml');
  return [...doc.getElementsByTagName('w:p')].map((p) => [...p.getElementsByTagName('w:t')].map((t) => t.textContent ?? '').join(''));
};
const integrity = (before: string, after: string) => detectIntegrityFailure([{ name: 'word/document.xml', xml: after }], ['word/document.xml'], ['word/document.xml'], [], { 'word/document.xml': before });

describe('table-figure-rescue fixer: equalColumns i spojene celije (T65)', () => {
  it('gridSpan: celija preko dva stupca ne dobiva sirinu jednog stupca', () => {
    const input = wrapDoc(gridSpanTable);
    const result = tableFigureRescueFixer({ documentXml: input, stylesXml: '' }, rescueParams(gridSpanTable, { equalColumns: true, fitToTextWidth: true }));
    const out = result.parts.documentXml;
    // Na masteru: tcW spojene celije postaje 3000 (jedan stupac), a grid 3000/3000/3000.
    expect(tcWidths(out)[0]).not.toBe('<w:tcW w:w="3000" w:type="dxa"/>');
    expect(gridOf(out)).toBe(gridOf(input));
    expect(tcWidths(out)).toEqual(tcWidths(input));
  });

  it('vMerge: okomito spojena tablica ne dobiva prepisan grid ni tcW', () => {
    const input = wrapDoc(vMergeTable);
    const result = tableFigureRescueFixer({ documentXml: input, stylesXml: '' }, rescueParams(vMergeTable, { equalColumns: true, repeatHeader: true }));
    const out = result.parts.documentXml;
    expect(gridOf(out)).toBe(gridOf(input));
    expect(tcWidths(out)).toEqual(tcWidths(input));
  });

  for (const [name, tbl] of [['gridSpan', gridSpanTable], ['vMerge', vMergeTable]] as const) {
    it(`${name}: ostale akcije rade, grid i tcW bajt-identicni, tekst isti, integritet cist, drugi prolaz no-op`, () => {
      const input = wrapDoc(tbl);
      const params = rescueParams(tbl, { equalColumns: true, fitToTextWidth: true, repeatHeader: true, preventRowSplit: true, center: true }, 6_000_000);
      const result = tableFigureRescueFixer({ documentXml: input, stylesXml: '' }, params);
      const out = result.parts.documentXml;
      expect(result.applied).toBe(true);
      expect(out).toContain('<w:tblLayout w:type="fixed"/>');
      expect(out).toContain('<w:tblW w:w="9449" w:type="dxa"/>');
      expect(out).toContain('<w:jc w:val="center"/>');
      expect(out).toContain('<w:tblHeader w:val="true"/>');
      expect((out.match(/<w:cantSplit\/>/g) || []).length).toBe((input.match(/<w:tr>/g) || []).length);
      expect(gridOf(out)).toBe(gridOf(input));
      expect(tcWidths(out)).toEqual(tcWidths(input));
      expect(out).toContain(name === 'gridSpan' ? '<w:gridSpan w:val="2"/>' : '<w:vMerge w:val="restart"/>');
      expect(paragraphTexts(out)).toEqual(paragraphTexts(input));
      expect(integrity(input, out)).toBeNull();
      const second = tableFigureRescueFixer(result.parts, params);
      expect(second.applied).toBe(false);
      expect(second.parts.documentXml).toBe(out);
    });

    it(`${name}: samo equalColumns ne mijenja nista i javlja unsupported-structure`, () => {
      const input = wrapDoc(tbl);
      const result = tableFigureRescueFixer({ documentXml: input, stylesXml: '' }, rescueParams(tbl, { equalColumns: true }));
      expect(result.applied).toBe(false);
      expect(result.reason).toBe('unsupported-structure');
      expect(result.parts.documentXml).toBe(input);
    });
  }

  it('drugi prefiks za isti imenski prostor ne zaobilazi gard (nalaz pregleda)', () => {
    const aliased = gridSpanTable
      .replace(`<w:tbl ${WNS}>`, `<w:tbl ${WNS} xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`)
      .replace('<w:gridSpan w:val="2"/>', '<x:gridSpan x:val="2"/>');
    const input = wrapDoc(aliased);
    const result = tableFigureRescueFixer({ documentXml: input, stylesXml: '' }, rescueParams(aliased, { equalColumns: true }));
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('unsupported-structure');
    expect(result.parts.documentXml).toBe(input);
  });

  it('zakomentirani gridSpan ne gasi equalColumns (nalaz pregleda)', () => {
    const plain = `<w:tbl ${WNS}><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="7000"/></w:tblGrid><w:tr><!-- <w:gridSpan w:val="2"/> -->${cell(2000, 'A')}${cell(7000, 'B')}</w:tr></w:tbl>`;
    const result = tableFigureRescueFixer({ documentXml: wrapDoc(plain), stylesXml: '' }, rescueParams(plain, { equalColumns: true }));
    expect(result.applied).toBe(true);
    expect(gridOf(result.parts.documentXml)).toBe('<w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid>');
  });

  it('tablica bez spojenih celija i dalje dobiva jednake stupce (gard nije globalan)', () => {
    const plain = `<w:tbl ${WNS}><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="3000"/><w:gridCol w:w="4000"/></w:tblGrid><w:tr>${cell(2000, 'A')}${cell(3000, 'B')}${cell(4000, 'C')}</w:tr></w:tbl>`;
    const input = wrapDoc(plain);
    const params = rescueParams(plain, { equalColumns: true });
    const result = tableFigureRescueFixer({ documentXml: input, stylesXml: '' }, params);
    const out = result.parts.documentXml;
    expect(result.applied).toBe(true);
    expect(gridOf(out)).toBe('<w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>');
    expect(tcWidths(out)).toEqual(Array(3).fill('<w:tcW w:w="3000" w:type="dxa"/>'));
    expect(paragraphTexts(out)).toEqual(paragraphTexts(input));
    expect(integrity(input, out)).toBeNull();
    // T65 krug 2 (m): idempotencija se dokazuje dvama prolazima, a drugi mora biti no-op i po
    // zastavici, ne samo po bajtovima: applied:true bez izmjene bi u izvjestaju lagalo o popravku.
    const second = tableFigureRescueFixer(result.parts, params);
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('already-ok');
    expect(second.parts.documentXml).toBe(out);
  });
});

/**
 * T65 krug 2. Nalazi Codexa i Opus pregleda (potvrdio koordinator):
 *  M1  analiza i fixer moraju spojene celije prepoznati ISTOM funkcijom; fixer je prihvacao samo
 *      ASCII prefiks, pa je <ž:gridSpan> (prefiks vezan uz Wordov namespace) analiza vidjela kao
 *      spojeno, a fixer nije i prepisao je tcW.
 *  m   gridSpan w:val="1" nije spajanje.
 *  M3  preskoceni equalColumns u mijesanom zahtjevu mora biti vidljiv u izlazu (afterLabel, koji
 *      izvjestaj popravka vec prikazuje; od kruga 3 i FixerOutput.skippedActions, koji postoji i
 *      uz applied:false), a drugi prolaz nad vec popravljenom tablicom javlja 'already-ok', ne
 *      'unsupported-structure'.
 *  m   bez stvarne izmjene reda (trPr) obicna tablica vraca applied:false vec u PRVOM pozivu.
 */
const WORD_MAIN = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
/** Isti gridSpanTable, ali se spajanje pise prefiksom `prefix` vezanim uz Wordov namespace. */
const prefixedGridSpan = (prefix: string) => gridSpanTable
  .replace(`<w:tbl ${WNS}>`, `<w:tbl ${WNS} xmlns:${prefix}="${WORD_MAIN}">`)
  .replace('<w:gridSpan w:val="2"/>', `<${prefix}:gridSpan ${prefix}:val="2"/>`);
const threeColumns = (extra: string) => `<w:tbl ${WNS}><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="3000"/><w:gridCol w:w="4000"/></w:tblGrid><w:tr>${cell(2000, 'A', extra)}${cell(3000, 'B')}${cell(4000, 'C')}</w:tr></w:tbl>`;

describe('table-figure-rescue fixer: T65 krug 2', () => {
  for (const prefix of ['ž', 'č1', 'x']) {
    it(`M1: gridSpan s prefiksom "${prefix}" preskace equalColumns, grid i tcW bajt-identicni`, () => {
      const tbl = prefixedGridSpan(prefix);
      const input = wrapDoc(tbl);
      const result = tableFigureRescueFixer({ documentXml: input, stylesXml: '' }, rescueParams(tbl, { equalColumns: true }));
      expect(result.applied).toBe(false);
      expect(result.reason).toBe('unsupported-structure');
      expect(result.parts.documentXml).toBe(input);
    });
  }

  it('m: gridSpan w:val="1" nije spajanje, equalColumns se primjenjuje', () => {
    const tbl = threeColumns('<w:gridSpan w:val="1"/>');
    const input = wrapDoc(tbl);
    const params = rescueParams(tbl, { equalColumns: true });
    const result = tableFigureRescueFixer({ documentXml: input, stylesXml: '' }, params);
    const out = result.parts.documentXml;
    expect(result.applied).toBe(true);
    expect(gridOf(out)).toBe('<w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>');
    expect(tcWidths(out)).toEqual(Array(3).fill('<w:tcW w:w="3000" w:type="dxa"/>'));
    expect(result.afterLabel).not.toContain('preskočeno');
    expect(paragraphTexts(out)).toEqual(paragraphTexts(input));
    expect(integrity(input, out)).toBeNull();
    const second = tableFigureRescueFixer(result.parts, params);
    expect(second.applied).toBe(false);
    expect(second.parts.documentXml).toBe(out);
  });

  for (const [name, tbl] of [['gridSpan', gridSpanTable], ['vMerge', vMergeTable], ['ž:gridSpan', prefixedGridSpan('ž')]] as const) {
    it(`M3: ${name}, mijesani zahtjev: preskoceni equalColumns vidljiv je u izlazu, drugi prolaz already-ok`, () => {
      const input = wrapDoc(tbl);
      const params = rescueParams(tbl, { equalColumns: true, center: true, repeatHeader: true });
      const result = tableFigureRescueFixer({ documentXml: input, stylesXml: '' }, params);
      const out = result.parts.documentXml;
      expect(result.applied).toBe(true);
      expect(out).toContain('<w:jc w:val="center"/>');
      expect(gridOf(out)).toBe(gridOf(input));
      expect(tcWidths(out)).toEqual(tcWidths(input));
      expect(result.afterLabel).toContain('ujednačavanje stupaca preskočeno');
      expect(result.afterLabel).toContain('spojene ćelije');
      expect(paragraphTexts(out)).toEqual(paragraphTexts(input));
      if (name.startsWith('ž')) {
        // Skener integriteta (package-integrity.ts) ime taga prihvaca samo iz ASCII klase, pa vec
        // ULAZ s <ž:gridSpan> proglasi neispravnim. To je postojece ogranicenje vrata, ne kvar ovog
        // fixera: prijava je `preexisting`, a u applyFixers takav dokument ne dobiva isporuku.
        expect(integrity(input, out)).toMatchObject({ preexisting: true, problem: 'tag bez valjanog imena' });
      } else {
        expect(integrity(input, out)).toBeNull();
      }
      const second = tableFigureRescueFixer(result.parts, params);
      expect(second.applied).toBe(false);
      expect(second.reason).toBe('already-ok');
      expect(second.parts.documentXml).toBe(out);
    });
  }

  it('M3: bez spojenih celija isti mijesani zahtjev nema napomenu o preskoku', () => {
    const tbl = threeColumns('');
    const result = tableFigureRescueFixer({ documentXml: wrapDoc(tbl), stylesXml: '' }, rescueParams(tbl, { equalColumns: true, center: true, repeatHeader: true }));
    expect(result.applied).toBe(true);
    expect(result.afterLabel).toBe('spašene tablice i slike');
  });

  it('m: druga tablica bez spajanja ne skriva preskok na spojenoj tablici koja trazi samo equalColumns', () => {
    const plain = threeColumns('');
    const input = wrapDoc(`${gridSpanTable}${plain}`);
    const params = { version: 1 as const, figures: [], tables: [
      { id: 'spojena', bodyChildIndex: 0, anchorFingerprint: anchorFingerprintForXml('table', gridSpanTable), actions: { equalColumns: true as const } },
      { id: 'obicna', bodyChildIndex: 1, anchorFingerprint: anchorFingerprintForXml('table', plain), actions: { center: true as const } },
    ] };
    const first = tableFigureRescueFixer({ documentXml: input, stylesXml: '' }, params);
    expect(first.applied).toBe(true);
    expect(first.afterLabel).toContain('ujednačavanje stupaca preskočeno');
    const second = tableFigureRescueFixer(first.parts, params);
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('unsupported-structure');
  });

  /**
   * T65 krug 3 (pregled: M3 samo napola zatvoren). Napomena u afterLabel postoji samo uz
   * applied:true. Spojena tablica kojoj su OSTALE trazene akcije vec na cilju vracala je vec u
   * PRVOM prolazu applied:false/'already-ok' bez ikakvog traga da stupci nisu ujednaceni; fixer ne
   * razlikuje prvi prolaz od drugog. Zato preskok nosi zasebno polje izlaza (skippedActions), koje
   * postoji i uz applied:false.
   */
  for (const [name, tbl] of [['gridSpan', gridSpanTable], ['vMerge', vMergeTable]] as const) {
    it(`M3 (krug 3): ${name}, ostale akcije vec na cilju, PRVI prolaz: already-ok, ali preskok je u izlazu`, () => {
      const centered = tbl.replace('<w:tblPr>', '<w:tblPr><w:jc w:val="center"/>');
      const input = wrapDoc(centered);
      const result = tableFigureRescueFixer({ documentXml: input, stylesXml: '' }, rescueParams(centered, { equalColumns: true, center: true }));
      expect(result.applied).toBe(false);
      expect(result.reason).toBe('already-ok');
      expect(result.parts.documentXml).toBe(input);
      expect(result.skippedActions).toEqual(['ujednačavanje stupaca preskočeno (spojene ćelije)']);
    });
  }

  it('M3 (krug 3): skippedActions je prisutan i uz applied:true, i samo kad je equalColumns stvarno preskocen', () => {
    const mixed = tableFigureRescueFixer({ documentXml: wrapDoc(gridSpanTable), stylesXml: '' }, rescueParams(gridSpanTable, { equalColumns: true, center: true }));
    expect(mixed.applied).toBe(true);
    expect(mixed.skippedActions).toEqual(['ujednačavanje stupaca preskočeno (spojene ćelije)']);
    const only = tableFigureRescueFixer({ documentXml: wrapDoc(gridSpanTable), stylesXml: '' }, rescueParams(gridSpanTable, { equalColumns: true }));
    expect(only.reason).toBe('unsupported-structure');
    expect(only.skippedActions).toEqual(['ujednačavanje stupaca preskočeno (spojene ćelije)']);
    const plain = threeColumns('');
    const clean = tableFigureRescueFixer({ documentXml: wrapDoc(plain), stylesXml: '' }, rescueParams(plain, { equalColumns: true, center: true }));
    expect(clean.applied).toBe(true);
    expect(clean.skippedActions).toBeUndefined();
    const merged = tableFigureRescueFixer({ documentXml: wrapDoc(gridSpanTable), stylesXml: '' }, rescueParams(gridSpanTable, { center: true }));
    expect(merged.applied).toBe(true);
    expect(merged.skippedActions).toBeUndefined();
  });

  it('m (trPr gard): obicna tablica kojoj trazena akcija vec vrijedi vraca already-ok u PRVOM pozivu, bez praznog w:trPr', () => {
    // Razlikuje se od idempotencijskog testa gore: tamo je prvi prolaz stvarno mijenjao tablicu.
    // Ovdje je tablica vec centrirana i nijedna akcija reda nije trazena; prije garda
    // `next === trPr` svaki red bez w:trPr dobivao je prazan <w:trPr> i applied:true.
    const tbl = threeColumns('').replace('<w:tblPr>', '<w:tblPr><w:jc w:val="center"/>');
    const input = wrapDoc(tbl);
    const result = tableFigureRescueFixer({ documentXml: input, stylesXml: '' }, rescueParams(tbl, { center: true }));
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('already-ok');
    expect(result.parts.documentXml).toBe(input);
    expect(result.parts.documentXml).not.toContain('<w:trPr');
  });
});

/**
 * T65 krug 2 (M3), cijeli put: napomena o preskocenom equalColumns stize kroz applyFixers do
 * changeloga, iz kojeg renderSummary u repair-panelu ispisuje "prije -> poslije" po stavci.
 */
describe('table-figure-rescue kroz applyFixers: preskok je u changelogu (T65 krug 2)', () => {
  const REL = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
  const pack = (documentXml: string) => writeZip([
    { name: '[Content_Types].xml', data: new TextEncoder().encode('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>') },
    { name: '_rels/.rels', data: new TextEncoder().encode(`<Relationships ${REL}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: 'word/_rels/document.xml.rels', data: new TextEncoder().encode(`<Relationships ${REL}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: 'word/document.xml', data: new TextEncoder().encode(documentXml) },
    { name: 'word/styles.xml', data: new TextEncoder().encode(`<w:styles ${WNS}><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`) },
  ]);
  const request = (tbl: string) => [{ fixerId: 'table-figure-rescue-fixer' as const, ruleId: 'table-figure-rescue-assisted', params: rescueParams(tbl, { equalColumns: true, center: true }) as unknown as Record<string, unknown> }];

  it('spojena tablica: changelog nosi napomenu, integritet cist; obicna tablica: bez napomene', async () => {
    const merged = await applyFixers(await pack(wrapDoc(gridSpanTable)), request(gridSpanTable));
    expect(merged.integrityFailure ?? null).toBeNull();
    expect(merged.changelog).toHaveLength(1);
    expect(merged.changelog[0].afterLabel).toContain('ujednačavanje stupaca preskočeno (spojene ćelije)');
    const plain = threeColumns('');
    const clean = await applyFixers(await pack(wrapDoc(plain)), request(plain));
    expect(clean.changelog).toHaveLength(1);
    expect(clean.changelog[0].afterLabel).not.toContain('preskočeno');
  });

  it('krug 3: preskok stize do rezultata i kad fixer vrati already-ok (nista nije primijenjeno)', async () => {
    const centered = gridSpanTable.replace('<w:tblPr>', '<w:tblPr><w:jc w:val="center"/>');
    const result = await applyFixers(await pack(wrapDoc(centered)), request(centered));
    expect(result.changelog).toHaveLength(0);
    expect(result.skipped).toEqual(['table-figure-rescue-assisted']);
    expect(result.skippedReasons).toEqual({ 'table-figure-rescue-assisted': 'already-ok' });
    expect(result.skippedActions).toEqual({ 'table-figure-rescue-assisted': ['ujednačavanje stupaca preskočeno (spojene ćelije)'] });
    // Dva zahtjeva s istim ruleId: napomena se ne udvostrucuje (pregled drugog alata, krug 3).
    const twice = await applyFixers(await pack(wrapDoc(centered)), [...request(centered), ...request(centered)]);
    expect(twice.skippedActions).toEqual({ 'table-figure-rescue-assisted': ['ujednačavanje stupaca preskočeno (spojene ćelije)'] });
    const plain = threeColumns('').replace('<w:tblPr>', '<w:tblPr><w:jc w:val="center"/>');
    const clean = await applyFixers(await pack(wrapDoc(plain)), [{ ...request(plain)[0], params: rescueParams(plain, { center: true }) as unknown as Record<string, unknown> }]);
    expect(clean.skippedActions).toBeUndefined();
  });
});
