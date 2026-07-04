/**
 * Sigurnosni testovi parsera (obrana od zlonamjernog .docx):
 *  - dekompresijska bomba: deklarirana velicina iznad granice i "lazljiva" bomba (mala
 *    deklarirana velicina, golem stvarni izlaz) moraju biti odbijene s ZipLimitError;
 *  - valjan deflate zapis se i dalje ispravno cita (cap ne lomi legitimne datoteke);
 *  - parseXml odbija ulaz s <!DOCTYPE (billion laughs defense-in-depth).
 */
import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { ZipReader, ZipLimitError, parseXml, MAX_DECOMPRESSED_BYTES } from '../src/docx/parser';

function u16(v: number): Buffer { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; }
function u32(v: number): Buffer { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; }

/** Minimalni ZIP s jednim deflate-raw (metoda 8) zapisom; declaredUncomp se moze lagati.
 *  CRC se ne provjerava u ZipReaderu pa je 0. */
function makeDeflateZip(name: string, payload: Buffer, declaredUncomp?: number): ArrayBuffer {
  const nameBuf = Buffer.from(name, 'utf8');
  const comp = deflateRawSync(payload);
  const uncomp = declaredUncomp ?? payload.length;
  const local = Buffer.concat([
    u32(0x04034b50), u16(20), u16(0), u16(8), u16(0), u16(0x21),
    u32(0), u32(comp.length), u32(uncomp),
    u16(nameBuf.length), u16(0), nameBuf, comp,
  ]);
  const central = Buffer.concat([
    u32(0x02014b50), u16(20), u16(20), u16(0), u16(8), u16(0), u16(0x21),
    u32(0), u32(comp.length), u32(uncomp),
    u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(0),
    nameBuf,
  ]);
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(1), u16(1),
    u32(central.length), u32(local.length), u16(0),
  ]);
  const buf = Buffer.concat([local, central, eocd]);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe('ZipReader: obrana od dekompresijske bombe', () => {
  it('valjan deflate zapis se ispravno cita (cap ne lomi legitimne datoteke)', async () => {
    const zip = new ZipReader(makeDeflateZip('word/document.xml', Buffer.from('bok svijete', 'utf8')));
    expect(await zip.text('word/document.xml')).toBe('bok svijete');
  });

  it('deklarirana velicina iznad granice = odbijeno prije dekompresije', async () => {
    const zip = new ZipReader(
      makeDeflateZip('a.xml', Buffer.from('x'.repeat(4000)), 10_000_000),
      { maxDecompressedBytes: 1024 },
    );
    await expect(zip.data('a.xml')).rejects.toBeInstanceOf(ZipLimitError);
  });

  it('lazljiva bomba (mala deklarirana, golem stvarni izlaz) = odbijena streaming capom', async () => {
    // deklarirano 10 bajtova, stvarno 50 000 -> pred-filtar prolazi, streaming cap prekida
    const zip = new ZipReader(
      makeDeflateZip('a.xml', Buffer.from('A'.repeat(50_000)), 10),
      { maxDecompressedBytes: 1024 },
    );
    await expect(zip.data('a.xml')).rejects.toBeInstanceOf(ZipLimitError);
  });

  it('granica je razumno visoka za realan diplomski (>= 100 MB)', () => {
    expect(MAX_DECOMPRESSED_BYTES).toBeGreaterThanOrEqual(100 * 1024 * 1024);
  });
});

describe('parseXml: odbijanje DTD-a (billion laughs)', () => {
  it('odbija <!DOCTYPE prije parsiranja', () => {
    const evil = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaa">]><r>&a;</r>';
    expect(() => parseXml(evil, 'test')).toThrow(/DTD/i);
  });

  it('parsira normalan XML bez DTD-a', () => {
    const doc = parseXml('<Properties><Pages>5</Pages></Properties>', 'test');
    expect(doc.getElementsByTagName('Pages')[0]?.textContent).toBe('5');
  });
});
