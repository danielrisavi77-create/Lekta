/**
 * T26 / audit 22. 9. nalaz #16: .docx zasticen lozinkom nije ZIP nego CFB (OLE) kontejner.
 * Intake ga je odbijao kao `not-zip` uz poruku "provjeri da nije preimenovana datoteka drugog
 * tipa", sto korisnika salje u pogresnom smjeru. Isto vrijedi za stari Word 97-2003 .doc.
 *
 * Sifrirani fixture je STVARNO sifriran paket (vidi tests/fixtures/intake/README.md), ne rucno
 * slozeni potpis. Za stari .doc u okruzenju nema Worda, pa je taj slucaj sinteticki CFB i to
 * dokazuje samo granu prepoznavanja, ne stvarni Wordov .doc.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { inspectDocxIntake, MIN_DOCX_BYTES } from '../src/docx/intake-gate';
import { ZipReader, cfbKind } from '../src/docx/parser';
import { buildDocx } from './helpers/docx-builder';

const FIXTURE = resolve(__dirname, 'fixtures/intake/encrypted-synthetic.docx');
const FIXTURE_SHA256 = '856f53d0388302356537a06890b08ecf3da88e2db13191997cfdfb99be1a01ad';
const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function file(bytes: Uint8Array, name = 'rad.docx'): File {
  return new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/** Sinteticki CFB: potpis, pa ime toka kao UTF-16LE, dopunjeno do velicine pravog rada. */
function syntheticCfb(stream: string): Uint8Array {
  const bytes = new Uint8Array(MIN_DOCX_BYTES * 2);
  bytes.set(CFB_MAGIC, 0);
  for (let i = 0; i < stream.length; i++) bytes[1024 + i * 2] = stream.charCodeAt(i);
  return bytes;
}

describe('CFB datoteke na intakeu (nalaz #16)', () => {
  const encrypted = new Uint8Array(readFileSync(FIXTURE));

  it('fixture je netaknut i stvarno je CFB sa sifriranim paketom', () => {
    expect(createHash('sha256').update(encrypted).digest('hex')).toBe(FIXTURE_SHA256);
    expect([...encrypted.slice(0, 8)]).toEqual(CFB_MAGIC);
    expect(encrypted.length).toBeGreaterThan(MIN_DOCX_BYTES);
    expect(cfbKind(encrypted)).toBe('encrypted-docx');
  });

  it('zasticen .docx dobiva kod encrypted i uputu za uklanjanje lozinke', async () => {
    const verdict = await inspectDocxIntake(file(encrypted));
    expect(verdict).toMatchObject({ kind: 'reject', code: 'encrypted' });
    if (verdict.kind === 'reject') expect(verdict.message).toMatch(/zaštićen lozinkom/);
  });

  it('i izravna analiza (ZipReader) javlja zastitu, ne generican ZIP kvar', () => {
    expect(() => new ZipReader(encrypted.buffer.slice(0) as ArrayBuffer)).toThrow(/zaštićen lozinkom/);
  });

  it('sinteticki stari .doc dobiva kod legacy-doc i uputu za spremanje kao .docx', async () => {
    const legacy = syntheticCfb('WordDocument');
    expect(cfbKind(legacy)).toBe('legacy-doc');
    const verdict = await inspectDocxIntake(file(legacy, 'rad.doc'));
    expect(verdict).toMatchObject({ kind: 'reject', code: 'legacy-doc' });
  });

  it('CFB bez prepoznatog toka ostaje not-zip', async () => {
    const other = syntheticCfb('NestoTrece');
    expect(cfbKind(other)).toBe('other');
    expect(await inspectDocxIntake(file(other))).toMatchObject({ kind: 'reject', code: 'not-zip' });
  });

  it('baseline: obican .docx nije CFB i prolazi intake', async () => {
    const plain = buildDocx({ paragraphs: Array.from({ length: 40 }, () => ({ text: 'Smislen odlomak akademskog teksta s dovoljno rijeci. '.repeat(3) })) });
    expect(cfbKind(plain)).toBeNull();
    expect((await inspectDocxIntake(file(plain))).kind).toBe('ok');
  });
});
