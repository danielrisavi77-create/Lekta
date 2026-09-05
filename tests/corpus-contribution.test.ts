/**
 * Kanal A: pseudonimizirana kopija za prilog korpusu (src/corpus/contribution.ts).
 *
 * Dokaz je DOSLOVNA pretraga bajtova izlaza: ime iz metapodataka i s naslovnice ne smije postojati nigdje u
 * pohranjenom paketu, a dijelovi koji nisu XML (slika) moraju ostati bajt-identicni. Keyring se ne vraca.
 */
import { describe, expect, it } from 'vitest';
import { readZip, writeZip } from '../src/repair/zip-codec';
import { corpusObjectPath, prepareCorpusCopy } from '../src/corpus/contribution';

const enc = new TextEncoder();
const dec = new TextDecoder();
const paras = (...xs: string[]) =>
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
  xs.map((t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`).join('') +
  '</w:body></w:document>';
const SLIKA = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

async function docx(): Promise<Uint8Array> {
  return writeZip([
    { name: '[Content_Types].xml', data: enc.encode('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>') },
    { name: 'docProps/core.xml', data: enc.encode('<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:creator>Ana Anić</dc:creator></cp:coreProperties>') },
    { name: 'word/document.xml', data: enc.encode(paras('Sveučilište u Zagrebu', 'Fakultet političkih znanosti', 'Mentor: doc. dr. sc. Ivan Ivić', 'Ana Anić', 'ZAVRŠNI RAD', 'Uvod. Tekst rada koji ostaje.')) },
    { name: 'word/media/image1.png', data: SLIKA },
  ]);
}

describe('prepareCorpusCopy', () => {
  it('ime iz metapodataka i s naslovnice ne postoji NIGDJE u izlaznim bajtovima; tekst rada ostaje', async () => {
    const copy = await prepareCorpusCopy(await docx(), 'sol-1');
    const entries = await readZip(copy.bytes);
    const sve = entries.map((e) => dec.decode(e.data)).join('\n');
    expect(sve).not.toContain('Ana Anić');
    expect(sve).not.toContain('Anić');
    expect(sve).not.toContain('Ivan Ivić');
    expect(sve).toContain('Tekst rada koji ostaje');
    expect(copy.report.dictionarySize).toBeGreaterThan(0);
    expect(copy.report.vacuous).toBe(false);
    expect(copy.report.leaks).toBe(0);
    expect(copy.report.carriersCleaned).toContain('core.creator');
    expect(copy.report.carriersCleaned).toContain('document.frontMatter');
  });

  it('dijelovi koji nisu XML ostaju bajt-identicni, a keyring se ne vraca', async () => {
    const copy = await prepareCorpusCopy(await docx(), 'sol-1');
    const slika = (await readZip(copy.bytes)).find((e) => e.name === 'word/media/image1.png');
    expect(slika && Array.from(slika.data)).toEqual(Array.from(SLIKA));
    expect(Object.keys(copy)).toEqual(['bytes', 'report']);
    expect(Object.keys(copy.report).sort()).toEqual(['carriersCleaned', 'dictionarySize', 'leaks', 'vacuous']);
  });

  it('razlicita sol daje razlicite pseudonime za isti pojam (nema grafa povezivanja)', async () => {
    const a = dec.decode((await readZip((await prepareCorpusCopy(await docx(), 'sol-1')).bytes)).find((e) => e.name === 'docProps/core.xml')!.data);
    const b = dec.decode((await readZip((await prepareCorpusCopy(await docx(), 'sol-2')).bytes)).find((e) => e.name === 'docProps/core.xml')!.data);
    expect(a).not.toBe(b);
    expect(a).toMatch(/OSOBA_/);
  });

  it('prazan rjecnik je oznacen, ne skriven', async () => {
    const bez = await writeZip([
      { name: '[Content_Types].xml', data: enc.encode('<Types></Types>') },
      { name: 'word/document.xml', data: enc.encode(paras('Naslov rada', 'Uvod.')) },
    ]);
    const copy = await prepareCorpusCopy(bez, 'sol');
    expect(copy.report.vacuous).toBe(true);
    expect(copy.report.dictionarySize).toBe(0);
  });

  it('necitljiv paket baca, pa pozivatelj nema sto pohraniti', async () => {
    await expect(prepareCorpusCopy(new Uint8Array([1, 2, 3, 4]), 'sol')).rejects.toBeTruthy();
  });
});

describe('corpusObjectPath', () => {
  it('nosi mjesec i id priloga, bez korisnickog identiteta', () => {
    expect(corpusObjectPath('abc-123', new Date('2026-09-05T10:00:00Z'))).toBe('2026-09/abc-123.docx');
    expect(corpusObjectPath('x', new Date('2027-01-31T23:59:59Z'))).toBe('2027-01/x.docx');
  });
});
