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
});
