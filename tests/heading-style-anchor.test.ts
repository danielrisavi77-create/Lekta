import { describe, expect, it } from 'vitest';
import { applyFixers } from '../src/repair/apply-fixers';
import { readZip, writeZip } from '../src/repair/zip-codec';

/**
 * SIDRO ZA `heading-style-fixer` (2026-08-29).
 *
 * Zatecen kvar: fixer gadja iskljucivo po `paragraphIndex`, bez ikakvog sidra, za razliku od
 * `link-doi`, `croatian-typography` i `required-section`. Cim jedan INDEX_SHIFTING fixer
 * (`empty-paragraph-fixer` i ostali) ukloni odlomak, isti indeksi pokazuju na DRUGE odlomke.
 *
 * U prvom prolazu to ne skodi, jer INDEX_SHIFTING fixeri po ugovoru idu ZADNJI. Ali ponovna
 * primjena ISTIH zahtjeva na vec popravljen dokument tada nije no-op, sto je izmjereno na 9 od 54
 * stvarna rada: `heading-style-fixer` je opalio drugi put, nad pomaknutim indeksima.
 *
 * Testovi su sinteticki i deterministicki namjerno: mjere ugovor sidra, ne stanje korpusa, pa ne
 * ovise o tome mijenja li se motor u istom radnom stablu.
 */
const enc = new TextEncoder();
const para = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const DOCUMENT_XML =
  '<w:document><w:body>' + para('Uvodni odlomak.') + para('Metodologija') + para('Tijelo poglavlja.') + '</w:body></w:document>';

async function docx(): Promise<Uint8Array> {
  return writeZip([
    { name: '[Content_Types].xml', data: enc.encode('<Types></Types>') },
    { name: 'word/_rels/document.xml.rels', data: enc.encode('<Relationships></Relationships>') },
    { name: 'word/document.xml', data: enc.encode(DOCUMENT_XML) },
    { name: 'word/styles.xml', data: enc.encode('<w:styles><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>') },
  ]);
}

/** Naslov "Metodologija" je DRUGI `<w:p>`, dakle 1-bazirani indeks 2. */
const request = (anchorText?: string) => [{
  ruleId: 'heading-structure-universal',
  fixerId: 'heading-style-fixer' as const,
  params: { targets: [{ paragraphIndex: 2, level: 1, ...(anchorText === undefined ? {} : { anchorText }) }] },
}];

const documentOf = async (bytes: Uint8Array) =>
  new TextDecoder().decode((await readZip(bytes)).find((entry) => entry.name === 'word/document.xml')!.data);

describe('heading-style-fixer: sidro protiv zastarjele mete', () => {
  it('sidro koje ODGOVARA tekstu odlomka ne mijenja ponasanje', async () => {
    const bytes = await docx();
    const withAnchor = await applyFixers(bytes, request('Metodologija') as never);
    const withoutAnchor = await applyFixers(bytes, request() as never);
    // BASELINE: bez sidra fixer doista radi. Bez ove tvrdnje bi sidro "hvatalo" tako da gasi
    // fixer, a test bi zeleno prolazio nad necim sto nista ne radi.
    expect(withoutAnchor.changelog.length).toBeGreaterThan(0);
    expect(withAnchor.changelog.length).toBe(withoutAnchor.changelog.length);
    expect(await documentOf(withAnchor.docxBytes)).toBe(await documentOf(withoutAnchor.docxBytes));
  });

  it('sidro koje NE odgovara daje stale-anchor i ne dira dokument', async () => {
    const bytes = await docx();
    const out = await applyFixers(bytes, request('Rezultati') as never);
    expect(out.skippedReasons['heading-structure-universal']).toBe('stale-anchor');
    expect(out.changelog).toEqual([]);
    expect(await documentOf(out.docxBytes)).toBe(DOCUMENT_XML);
  });

  it('zahtjev BEZ sidra prolazi kao i prije (stari klijenti i pecene projekcije)', async () => {
    const bytes = await docx();
    const out = await applyFixers(bytes, request() as never);
    expect(out.changelog.length).toBeGreaterThan(0);
    expect(out.skippedReasons['heading-structure-universal']).toBeUndefined();
  });

  /**
   * F6 (2026-08-31), nalaz neovisnog pregleda: djelomican promasaj sidra se gutao.
   *
   * Primjenjivao se prezivjeli podskup uz `applied: true`, bez ikakva traga o odbacenima. Uz 12
   * meta i pomak indeksa jedna moze prezivjeti slucajno, a jedanaest nestati, i to se prijavi kao
   * uspjeh. Djelomicno oblikovanje naslova gore je od nijednog, jer dokument IZGLEDA popravljeno.
   *
   * Drugi dio istog nalaza: prazno sidro je odgovaralo svakom praznom odlomku.
   */
  it('jedna zastarjela meta obara CIJELI zahtjev, ne samo sebe', async () => {
    const bytes = await docx();
    const out = await applyFixers(bytes, [{
      ruleId: 'heading-structure-universal',
      fixerId: 'heading-style-fixer' as const,
      params: { targets: [
        { paragraphIndex: 2, level: 1, anchorText: 'Metodologija' },
        { paragraphIndex: 3, level: 1, anchorText: 'Ovoga naslova nema u dokumentu' },
      ] },
    }] as never);
    expect(out.skippedReasons['heading-structure-universal']).toBe('stale-anchor');
    expect(out.changelog).toEqual([]);
    expect(await documentOf(out.docxBytes)).toBe(DOCUMENT_XML);
  });

  /**
   * Ovu tvrdnju danas drzi mapa jedinstvenosti (prazan kljuc se u nju ne upisuje), a ne izricita
   * provjera `!wanted`; mutacija te provjere zato NE obara ovaj test. Ostaje jer je tvrdnja o
   * PONASANJU, ne o izvedbi: prazno sidro ne smije nikad nista pogoditi.
   */
  it('prazno sidro se ne priznaje kao podudaranje', async () => {
    const bytes = await docx();
    const out = await applyFixers(bytes, [{
      ruleId: 'heading-structure-universal',
      fixerId: 'heading-style-fixer' as const,
      params: { targets: [{ paragraphIndex: 2, level: 1, anchorText: '' }] },
    }] as never);
    expect(out.skippedReasons['heading-structure-universal']).toBe('stale-anchor');
    expect(await documentOf(out.docxBytes)).toBe(DOCUMENT_XML);
  });

  /**
   * DRUGI KRUG PREGLEDA (2026-08-31): moj F6 popravak je bio pretvrd.
   *
   * `paragraphTextsForAnchors` broji SVAKI `<w:p>`, ukljucujuci celije tablica, dok `link-doi` i
   * `required-section` gledaju samo body-level odlomke. Uz obaranje cijelog zahtjeva to je znacilo
   * da jedna celija tablice s istim tekstom kao naslov gasi popravak SVIH naslova u dokumentu.
   * Izmjereno na fixture korpusu: 1 od 19 datoteka, a taj je korpus siromasan tablicama.
   *
   * Nejedinstveno sidro sada je DVOJBA (meta se preskace), a ne zastarjelost (koja obara sve).
   */
  it('celija tablice s istim tekstom ne gasi popravak ostalih naslova', async () => {
    const enc2 = new TextEncoder();
    const withTable =
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      para('Uvodni odlomak.') + para('Metodologija') + para('Rezultati') +
      '<w:tbl><w:tr><w:tc>' + para('Metodologija') + '</w:tc></w:tr></w:tbl>' +
      '</w:body></w:document>';
    const bytes = await writeZip([
      { name: '[Content_Types].xml', data: enc2.encode('<Types></Types>') },
      { name: 'word/_rels/document.xml.rels', data: enc2.encode('<Relationships></Relationships>') },
      { name: 'word/document.xml', data: enc2.encode(withTable) },
      { name: 'word/styles.xml', data: enc2.encode('<w:styles><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>') },
    ]);
    const out = await applyFixers(bytes, [{
      ruleId: 'heading-structure-universal',
      fixerId: 'heading-style-fixer' as const,
      params: { targets: [
        { paragraphIndex: 2, level: 1, anchorText: 'Metodologija' },
        { paragraphIndex: 3, level: 1, anchorText: 'Rezultati' },
      ] },
    }] as never);
    expect(out.skippedReasons['heading-structure-universal']).toBeUndefined();
    expect(out.changelog.length, 'jedinstven naslov mora proci unatoc dvojbenom susjedu').toBeGreaterThan(0);
    // Dvojbena meta se PRESKACE, pa celija tablice ostaje netaknuta.
    const doc = await documentOf(out.docxBytes);
    expect(doc).toContain('<w:tbl>');
  });

  /**
   * TRECI KRUG PREGLEDA (2026-08-31): moj rad na sidrima uveo je REGRESIJU u proizvod.
   *
   * Sidro nastaje iz teksta ANALIZE (`src/docx/parser.ts`), koji za `<w:tab/>` emitira `	` i za
   * `<w:br/>` emitira `
`; provjerava se protiv `paragraphTextsForAnchors`, koji cita SAMO
   * `<w:t>`. Dva neovisno pisana izvlakaca teksta razilaze se na dokumentu koji Word svakodnevno
   * proizvodi, pa je `1.<w:tab/>UVOD` (standardni zapis rucno numeriranog naslova) obarao CIJELI
   * zahtjev. Bez sidra je isti dokument prolazio: popravak je radio prije mojih izmjena.
   *
   * Isti kvar dizao je i `croatian-typography-fixer`, koji je `ANCHOR_SENSITIVE` pa radi PRIJE
   * ovoga i mijenja crtice i navodnike u naslovima.
   *
   * Zasto fixture korpus to nije uhvatio: nijedna od 19 fixtura nema `<w:tab/>` ni u jednom
   * odlomku. Korpus po konstrukciji nije mogao sadrzavati ovaj kvar.
   */
  describe('sidro prezivljava razliku izmedju dvaju izvlakaca teksta', () => {
    const enc3 = new TextEncoder();
    const build = async (paragraphXml: string) => writeZip([
      { name: '[Content_Types].xml', data: enc3.encode('<Types></Types>') },
      { name: 'word/_rels/document.xml.rels', data: enc3.encode('<Relationships></Relationships>') },
      { name: 'word/document.xml', data: enc3.encode('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + para('Uvodni odlomak.') + paragraphXml + '</w:body></w:document>') },
      { name: 'word/styles.xml', data: enc3.encode('<w:styles><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>') },
    ]);
    const run = async (bytes: Uint8Array, anchorText: string) => applyFixers(bytes, [{
      ruleId: 'heading-structure-universal',
      fixerId: 'heading-style-fixer' as const,
      params: { targets: [{ paragraphIndex: 2, level: 1, anchorText }] },
    }] as never);

    it('tabulator u naslovu ne obara zahtjev', async () => {
      const bytes = await build('<w:p><w:r><w:t>1.</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>UVOD</w:t></w:r></w:p>');
      const out = await run(bytes, '1.	UVOD');
      expect(out.skippedReasons['heading-structure-universal']).toBeUndefined();
      expect(out.changelog.length).toBeGreaterThan(0);
    });

    it('promijenjena crtica (tipografski popravak prije ovoga) ne obara zahtjev', async () => {
      const bytes = await build(para('Uvod – ciljevi rada'));
      const out = await run(bytes, 'Uvod - ciljevi rada');
      expect(out.skippedReasons['heading-structure-universal']).toBeUndefined();
      expect(out.changelog.length).toBeGreaterThan(0);
    });

    it('NEGATIVNA KONTROLA: promijenjena RIJEC i dalje obara zahtjev', async () => {
      const bytes = await build(para('Zakljucak'));
      const out = await run(bytes, 'Uvod');
      expect(out.skippedReasons['heading-structure-universal']).toBe('stale-anchor');
      expect(out.changelog).toEqual([]);
    });
  });
});
