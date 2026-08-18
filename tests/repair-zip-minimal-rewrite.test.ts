/**
 * NETAKNUT DIO PAKETA SE PREPISUJE BAJT ZA BAJT (audit DOCX-17, DOCX-18).
 *
 * Do 2026-08-17 je `writeZip` rekomprimirao SVAKI entry, pa je popravak jednog XML-a usput
 * prepisivao i ugradjene slike, fontove i medij. Dvije posljedice:
 *
 *   1. svako ponovno pakiranje je nova prilika da paket suptilno odstupi od onoga sto je Word
 *      napisao, a kvar se vidi tek kod korisnika u Wordu;
 *   2. gubili su se timestampovi, kompresijska metoda i atributi zapisa.
 *
 * Ovaj test cuva da se DIRA SAMO ONO STO SE MIJENJA. Bez njega je tvrdnja o minimalnoj
 * rekompresiji neprovjerena: golden testovi gledaju DEKOMPRIMIRANI sadrzaj, pa bi prosli i da
 * se sve ponovno komprimira.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readZip, writeZip, type ZipEntry } from '../src/repair/zip-codec';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(root, 'tests/fixtures/docx/fer-diplomski-puna-struktura.docx');

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe('writeZip mijenja samo ono sto je dirano', () => {
  let input: ZipEntry[];
  let output: ZipEntry[];
  const CHANGED = 'word/document.xml';

  beforeAll(async () => {
    input = await readZip(new Uint8Array(readFileSync(FIXTURE)));
    // Promijeni TOCNO jedan dio; svi ostali zadrzavaju isti Uint8Array objekt, sto je kriterij
    // po kojem writeZip prepoznaje "netaknuto".
    const edited = input.map((e) =>
      e.name === CHANGED
        ? { ...e, data: new TextEncoder().encode(new TextDecoder().decode(e.data).replace('</w:body>', '<w:p/></w:body>')) }
        : e,
    );
    output = await readZip(await writeZip(edited));
  });

  it('fixtura ima vise dijelova, ukljucujuci onaj koji mijenjamo', () => {
    expect(input.length).toBeGreaterThan(3);
    expect(input.some((e) => e.name === CHANGED)).toBe(true);
  });

  it('KOMPRIMIRANI bajtovi netaknutih dijelova su identicni ulaznima', () => {
    const untouched = input.filter((e) => e.name !== CHANGED);
    expect(untouched.length).toBeGreaterThan(2);
    for (const before of untouched) {
      const after = output.find((e) => e.name === before.name);
      expect(after, before.name).toBeTruthy();
      expect(
        bytesEqual(before.raw!.compressedData, after!.raw!.compressedData),
        `${before.name}: komprimirani bajtovi su se promijenili iako dio nije diran`,
      ).toBe(true);
    }
  });

  it('cuva kompresijsku metodu, timestamp i atribute netaknutih dijelova', () => {
    for (const before of input.filter((e) => e.name !== CHANGED)) {
      const after = output.find((e) => e.name === before.name)!;
      expect(after.raw!.compressionMethod, before.name).toBe(before.raw!.compressionMethod);
      expect(after.raw!.dosTime, before.name).toBe(before.raw!.dosTime);
      expect(after.raw!.dosDate, before.name).toBe(before.raw!.dosDate);
      expect(after.raw!.externalAttrs, before.name).toBe(before.raw!.externalAttrs);
    }
  });

  it('promijenjen dio JEST drugaciji (test ne bi vrijedio da se nista nije promijenilo)', () => {
    const before = input.find((e) => e.name === CHANGED)!;
    const after = output.find((e) => e.name === CHANGED)!;
    expect(bytesEqual(before.data, after.data)).toBe(false);
    expect(new TextDecoder().decode(after.data)).toContain('<w:p/></w:body>');
  });

  it('dekomprimirani sadrzaj netaknutih dijelova ostaje bit-identican', () => {
    for (const before of input.filter((e) => e.name !== CHANGED)) {
      const after = output.find((e) => e.name === before.name)!;
      expect(bytesEqual(before.data, after.data), before.name).toBe(true);
    }
  });

  it('poredak i skup dijelova su nepromijenjeni', () => {
    expect(output.map((e) => e.name)).toEqual(input.map((e) => e.name));
  });
});
