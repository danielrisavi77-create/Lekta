/**
 * ULAZNI ZIP SE PROVJERAVA CRC-om (audit A26-11).
 *
 * Ovaj nalaz nije bio u vanjskom auditu. Do 2026-08-17 se `crc32` u `zip-codec.ts` koristio
 * ISKLJUCIVO pri pisanju, pa motor nije imao nijedan mehanizam koji bi razlikovao ostecen ulazni
 * docx od ispravnog.
 *
 * Posljedica je bila gora nego sto zvuci, jer se lanac oslanjao na drugu obranu koja tu ne pomaze:
 * vrata integriteta (`package-integrity.ts`) skeniraju SAMO dijelove koje je popravak sam mijenjao.
 * Tiho ostecen dio koji nijedan fixer ne dira prosao bi kroz cijeli lanac, bio bi ponovno
 * komprimiran (jer `writeZip` rekomprimira sve) i isporucen korisniku kao "popravljen" dokument,
 * s valjanim CRC-om nad ostecenim sadrzajem. Time bi Lekta pretvorila tudje ostecenje u vlastito,
 * i to bez jednog upozorenja.
 *
 * Test drzi oba smjera: ispravan paket se cita, ostecen se ODBIJA s prepoznatljivom greskom.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readZip, writeZip } from '../src/repair/zip-codec';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(root, 'tests/fixtures/docx/fer-diplomski-puna-struktura.docx');

/**
 * Pokvari JEDAN bajt komprimiranog sadrzaja, ne mijenjajuci nijedno zaglavlje.
 *
 * Upravo je to slucaj koji je prije prolazio neopazeno: struktura zipa je besprijekorna, svi
 * potpisi i duljine se poklapaju, a sadrzaj je tih drugaciji od onoga sto CRC opisuje.
 */
function corruptOneContentByte(bytes: Uint8Array): Uint8Array {
  const copy = bytes.slice();
  // Prvi lokalni zapis pocinje na 0; podaci sigurno pocinju nakon njegovog zaglavlja. Uzimamo
  // tocku duboko u sredini datoteke da zajamceno padne u komprimirani sadrzaj, ne u zaglavlje.
  const target = Math.floor(copy.length / 2);
  copy[target] = copy[target] ^ 0xff;
  return copy;
}

describe('readZip provjerava CRC ulaznih clanova', () => {
  const original = new Uint8Array(readFileSync(FIXTURE));

  it('ispravan paket se cita bez greske', async () => {
    const entries = await readZip(original);
    expect(entries.length).toBeGreaterThan(3);
    expect(entries.some((e) => e.name === 'word/document.xml')).toBe(true);
  });

  it('paket koji smo sami napisali se cita natrag (CRC je konzistentan u oba smjera)', async () => {
    const roundTrip = await readZip(await writeZip(await readZip(original)));
    expect(roundTrip.some((e) => e.name === 'word/document.xml')).toBe(true);
  });

  it('jedan izmijenjen bajt sadrzaja se ODBIJA, ne prolazi tiho', async () => {
    const corrupted = corruptOneContentByte(original);
    expect(corrupted).not.toEqual(original);
    await expect(readZip(corrupted)).rejects.toThrow(/CRC|ostecen|zip-codec/i);
  });

  /**
   * Greska mora imenovati DIO paketa, jer je to jedini podatak s kojim se kvar moze dijagnosticirati
   * (npr. razlika izmedju ostecenog word/document.xml i ostecene ugradjene slike).
   */
  it('greska imenuje dio paketa u kojem CRC ne odgovara', async () => {
    const corrupted = corruptOneContentByte(original);
    await expect(readZip(corrupted)).rejects.toThrow(/word\//);
  });
});
