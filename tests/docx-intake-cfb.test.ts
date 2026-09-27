/**
 * T26 / audit 22. 9. nalaz #16: .docx zasticen lozinkom nije ZIP nego CFB (OLE) kontejner.
 * Intake ga je odbijao kao `not-zip` uz poruku "provjeri da nije preimenovana datoteka drugog
 * tipa", sto korisnika salje u pogresnom smjeru. Isto vrijedi za stari Word 97-2003 .doc.
 *
 * Sifrirani fixture je STVARNO sifriran paket (vidi tests/fixtures/intake/README.md), ne rucno
 * slozeni potpis. Za stari .doc u okruzenju nema Worda, pa je taj slucaj sinteticki (ali strukturno
 * ispravan) CFB i dokazuje samo granu prepoznavanja, ne stvarni Wordov .doc. Imena tokova citaju se
 * iz zapisa CFB direktorija (Codex pregled #168, #16), ne pretragom bajtova.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { inspectDocxIntake, MIN_DOCX_BYTES } from '../src/docx/intake-gate';
import { ZipReader, cfbKind, cfbStreamNames } from '../src/docx/parser';
import { buildDocx } from './helpers/docx-builder';

const FIXTURE = resolve(__dirname, 'fixtures/intake/encrypted-synthetic.docx');
const FIXTURE_SHA256 = '856f53d0388302356537a06890b08ecf3da88e2db13191997cfdfb99be1a01ad';
const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function file(bytes: Uint8Array, name = 'rad.docx'): File {
  return new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/**
 * Minimalan ispravan CFB (MS-CFB, sektor 512 B): zaglavlje, jedan FAT sektor, jedan direktorijski
 * sektor s Root Entry i zadanim tokovima, dopunjeno do velicine pravog rada. `noise` se upisuje
 * IZVAN direktorija, da test dokaze kako se imena citaju iz zapisa, ne iz bilo kojih bajtova.
 */
function syntheticCfb(streams: string[], noise = ''): Uint8Array {
  const sector = 512;
  const bytes = new Uint8Array(sector * 12);
  const view = new DataView(bytes.buffer);
  bytes.set(CFB_MAGIC, 0);
  view.setUint16(0x18, 0x3e, true); view.setUint16(0x1a, 3, true); view.setUint16(0x1c, 0xfffe, true);
  view.setUint16(0x1e, 9, true); view.setUint16(0x20, 6, true);
  view.setUint32(0x2c, 1, true); // jedan FAT sektor
  view.setUint32(0x30, 1, true); // direktorij u sektoru 1
  view.setUint32(0x3c, 0xfffffffe, true); view.setUint32(0x44, 0xfffffffe, true);
  for (let i = 0; i < 109; i++) view.setUint32(0x4c + i * 4, i === 0 ? 0 : 0xffffffff, true);
  const fatBase = sector; // sektor 0
  for (let i = 0; i < sector / 4; i++) view.setUint32(fatBase + i * 4, 0xffffffff, true);
  view.setUint32(fatBase, 0xfffffffd, true); // sektor 0 je FAT
  view.setUint32(fatBase + 4, 0xfffffffe, true); // sektor 1: kraj lanca direktorija
  const dirBase = sector * 2;
  const entry = (index: number, name: string, type: number) => {
    const at = dirBase + index * 128;
    for (let i = 0; i < name.length; i++) view.setUint16(at + i * 2, name.charCodeAt(i), true);
    view.setUint16(at + 0x40, (name.length + 1) * 2, true);
    bytes[at + 0x42] = type;
  };
  entry(0, 'Root Entry', 5);
  streams.slice(0, 3).forEach((name, i) => entry(i + 1, name, 2));
  for (let i = 0; i < noise.length; i++) view.setUint16(sector * 6 + i * 2, noise.charCodeAt(i), true);
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
    if (verdict.kind === 'reject') expect(verdict.message).toMatch(/zaštićena lozinkom/);
  });

  it('i izravna analiza (ZipReader) javlja zastitu, ne generican ZIP kvar', () => {
    expect(() => new ZipReader(encrypted.buffer.slice(0) as ArrayBuffer)).toThrow(/zaštićena lozinkom/);
  });

  it('sinteticki stari .doc dobiva kod legacy-doc i uputu za spremanje kao .docx', async () => {
    const legacy = syntheticCfb(['WordDocument', 'Data']);
    expect(cfbKind(legacy)).toBe('legacy-doc');
    const verdict = await inspectDocxIntake(file(legacy, 'rad.doc'));
    expect(verdict).toMatchObject({ kind: 'reject', code: 'legacy-doc' });
  });

  it('CFB bez prepoznatog toka ostaje not-zip', async () => {
    const other = syntheticCfb(['NestoTrece']);
    expect(cfbKind(other)).toBe('other');
    expect(await inspectDocxIntake(file(other))).toMatchObject({ kind: 'reject', code: 'not-zip' });
  });

  it('imena izvan direktorija ne klasificiraju datoteku (Codex #16)', () => {
    // Stara implementacija trazila je UTF-16 nizove bilo gdje u bajtovima: ovo je bio lazni pozitiv.
    const decoy = syntheticCfb(['NestoTrece'], 'EncryptionInfo EncryptedPackage WordDocument');
    expect(cfbStreamNames(decoy)).toEqual(new Set(['NestoTrece']));
    expect(cfbKind(decoy)).toBe('other');
  });

  it('samo jedan od dva tokova sifriranja nije dovoljan', () => {
    expect(cfbKind(syntheticCfb(['EncryptionInfo']))).toBe('other');
    expect(cfbKind(syntheticCfb(['EncryptedPackage']))).toBe('other');
    expect(cfbKind(syntheticCfb(['EncryptionInfo', 'EncryptedPackage']))).toBe('encrypted-docx');
  });

  it('osteceno zaglavlje ili lanac vraca null imena i neutralnu klasifikaciju', () => {
    const broken = syntheticCfb(['EncryptionInfo', 'EncryptedPackage']);
    new DataView(broken.buffer).setUint32(0x30, 999, true); // direktorij izvan datoteke
    expect(cfbStreamNames(broken)).toBeNull();
    expect(cfbKind(broken)).toBe('other');
  });

  it('imena tokova stvarnog fixturea odgovaraju neovisnom citacu (olefile)', () => {
    // olefile (Python) za isti fixture 2026-09-27 izlistava ove listove tokova.
    expect([...(cfbStreamNames(encrypted) ?? [])].sort()).toEqual(
      ['\u0006Primary', 'DataSpaceMap', 'EncryptedPackage', 'EncryptionInfo', 'StrongEncryptionDataSpace', 'Version']);
  });

  it('baseline: obican .docx nije CFB i prolazi intake', async () => {
    const plain = buildDocx({ paragraphs: Array.from({ length: 40 }, () => ({ text: 'Smislen odlomak akademskog teksta s dovoljno rijeci. '.repeat(3) })) });
    expect(cfbKind(plain)).toBeNull();
    expect((await inspectDocxIntake(file(plain))).kind).toBe('ok');
  });
});
