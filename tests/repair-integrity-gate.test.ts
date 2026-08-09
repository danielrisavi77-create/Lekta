/**
 * Vrata integriteta (src/repair/apply-fixers.ts): popravak koji bi isporucio neispravan .docx
 * NE isporucuje se, nego se vracaju ULAZNI bajtovi bit-identicni uz integrityFailure.
 *
 * Zasto ovo uopce treba: skener iz package-integrity.ts je do sada postojao SAMO u testovima, pa
 * je Edge funkcija slala korisniku bajtove koje nitko nije provjerio. Ovaj test cuva i mehaniku
 * (abort-to-original) i cinjenicu da ishod nije isto sto i "nema se sto popraviti".
 */
import { describe, it, expect } from 'vitest';
import { applyFixers, detectIntegrityFailure } from '../src/repair/apply-fixers';
import { readZip, writeZip } from '../src/repair/zip-codec';
import { singleSectionDocx } from './helpers/synthetic-docx';

/** Doslovan RE-47 oblik: atribut IZA kose crte samozatvarajuceg taga. */
const MALFORMED_RUN = '<w:r><w:fldChar w:fldCharType="begin"/ w:dirty="true"><w:t>NASLOVNICA</w:t></w:r>';

async function docxWithMalformedDocumentXml(): Promise<Uint8Array> {
  const entries = await readZip(await singleSectionDocx());
  const patched = entries.map((entry) => {
    if (entry.name !== 'word/document.xml') return entry;
    const xml = new TextDecoder().decode(entry.data);
    const broken = xml.replace('<w:r><w:t>NASLOVNICA</w:t></w:r>', MALFORMED_RUN);
    expect(broken, 'test fixture mora stvarno biti pokvaren').not.toBe(xml);
    return { name: entry.name, data: new TextEncoder().encode(broken) };
  });
  return writeZip(patched);
}

describe('vrata integriteta: applyFixers ne isporucuje neispravan paket', () => {
  it('zaustavlja isporuku i vraca ULAZNE bajtove kad promijenjeni dio nije dobro oblikovan', async () => {
    const input = await docxWithMalformedDocumentXml();
    const result = await applyFixers(input, [
      { ruleId: 'margins', fixerId: 'margins-fixer', params: { top: 3, right: 2.5, bottom: 3, left: 3 } },
    ]);

    expect(result.integrityFailure).toBeDefined();
    expect(result.integrityFailure?.part).toBe('word/document.xml');
    // Kvar je dosao s ulazom, pa poruka NE smije optuziti nas motor.
    expect(result.integrityFailure?.preexisting).toBe(true);
    // Nista nije primijenjeno -> server ne trosi slot ni kvotu (ista grana kao RE-32).
    expect(result.changelog).toEqual([]);
    expect(result.skipped).toContain('margins');
    // Bit-identicno: isti objekt, bez rekompresije.
    expect(result.docxBytes).toBe(input);
  });

  it('ispravan dokument prolazi bez integrityFailure i stvarno se popravi', async () => {
    const input = await singleSectionDocx();
    const result = await applyFixers(input, [
      { ruleId: 'margins', fixerId: 'margins-fixer', params: { top: 3, right: 2.5, bottom: 3, left: 3 } },
    ]);
    expect(result.integrityFailure).toBeUndefined();
    expect(result.changelog.length).toBeGreaterThan(0);
  });
});

describe('detectIntegrityFailure: grane koje zivi fixer ne proizvodi', () => {
  const ok = '<a><b/></a>';

  it('prijavi prazan dio', () => {
    const out = detectIntegrityFailure([{ name: 'word/styles.xml', xml: '' }], [], [], [], {});
    expect(out?.part).toBe('word/styles.xml');
    expect(out?.problem).toMatch(/prazan/);
  });

  it('prijavi neispravan XML i oznaci ga kao NAS kvar kad je ulaz bio ispravan', () => {
    const out = detectIntegrityFailure(
      [{ name: 'word/document.xml', xml: '<a><b></a>' }],
      [], [], [],
      { 'word/document.xml': ok },
    );
    expect(out?.part).toBe('word/document.xml');
    expect(out?.preexisting).toBeUndefined();
  });

  it('prijavi nestali dio koji fixer nije izricito uklonio', () => {
    const out = detectIntegrityFailure([], ['word/document.xml', 'word/media/slika.png'], ['word/document.xml'], [], {});
    expect(out?.part).toBe('word/media/slika.png');
    expect(out?.problem).toMatch(/nestao/);
  });

  it('dopusti uklanjanje koje je fixer izricito zatrazio', () => {
    const out = detectIntegrityFailure(
      [], ['word/document.xml', 'word/comments.xml'], ['word/document.xml'], ['word/comments.xml'], {},
    );
    expect(out).toBeNull();
  });

  it('propusti ispravan, nepromijenjen paket', () => {
    expect(detectIntegrityFailure([{ name: 'word/document.xml', xml: ok }], ['word/document.xml'], ['word/document.xml'], [], {})).toBeNull();
  });
});
