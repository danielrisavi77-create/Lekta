/**
 * LAZNA ZASTAVICA "data descriptor slijedi" (bit 3) ODLAZI IZ IZLAZA.
 *
 * `writeZip` za netaknute zapise cuva izvorne general purpose zastavice, ali NIKAD ne pise data
 * descriptor: CRC i obje velicine idu u lokalno zaglavlje. Prenosenjem bita 3 (`0x0008`) izlaz je
 * tvrdio da deskriptor postoji, a njega nije bilo.
 *
 * IZMJERENO 2026-08-31 Tier 2 oracleom: `lo-fpzg-zavrsni-*` se nakon popravka NIJE otvarao u
 * Wordu, dok se izvornik otvara. Ta dva paketa pise LibreOffice (`0x0808` = bit 11 UTF-8 ime +
 * bit 3); svi ostali fixturei imaju `0x0000`, pa je kvar pogadjao samo LibreOffice dokumente.
 *
 * Tier 0 i Tier 1 ga ne vide, jer python `zipfile` i `lxml` citaju tolerantno: CRC i velicine su
 * ionako u zaglavlju. Zato ovaj test gleda BAJTOVE zastavica, ne sadrzaj.
 */
import { describe, it, expect } from 'vitest';
import { readZip, writeZip, type ZipEntry } from '../src/repair/zip-codec';

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const DATA_DESCRIPTOR_BIT = 0x0008;
const UTF8_NAME_BIT = 0x0800;

/** Zastavice iz SVIH lokalnih zaglavlja i iz centralnog direktorija. */
function allFlags(bytes: Uint8Array): { local: number[]; central: number[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const local: number[] = [];
  const central: number[] = [];
  for (let i = 0; i + 4 <= bytes.length; i += 1) {
    const sig = view.getUint32(i, true);
    if (sig === LOCAL_SIG) local.push(view.getUint16(i + 6, true));
    else if (sig === CENTRAL_SIG) central.push(view.getUint16(i + 8, true));
  }
  return { local, central };
}

/**
 * Zip kakav pise LibreOffice: bit 3 postavljen, a deskriptor se NE pise, jer su CRC i velicine
 * vec u zaglavlju. Gradi se rucno, ne cita iz gita: fixture s tim bitom mora postojati u testu i
 * kad ga u repozitoriju nema.
 */
function zipWithDataDescriptorBit(name: string, content: string): Uint8Array {
  const enc = new TextEncoder();
  const data = enc.encode(content);
  const nameBytes = enc.encode(name);
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  crc = (crc ^ 0xffffffff) >>> 0;

  const flags = DATA_DESCRIPTOR_BIT | UTF8_NAME_BIT;
  const local = new Uint8Array(30 + nameBytes.length + data.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, LOCAL_SIG, true);
  lv.setUint16(4, 20, true);
  lv.setUint16(6, flags, true);
  lv.setUint16(8, 0, true); // STORED
  lv.setUint32(14, crc, true);
  lv.setUint32(18, data.length, true);
  lv.setUint32(22, data.length, true);
  lv.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, 30);
  local.set(data, 30 + nameBytes.length);

  const central = new Uint8Array(46 + nameBytes.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, CENTRAL_SIG, true);
  cv.setUint16(4, 20, true);
  cv.setUint16(6, 20, true);
  cv.setUint16(8, flags, true);
  cv.setUint16(10, 0, true);
  cv.setUint32(16, crc, true);
  cv.setUint32(20, data.length, true);
  cv.setUint32(24, data.length, true);
  cv.setUint16(28, nameBytes.length, true);
  cv.setUint32(42, 0, true);
  central.set(nameBytes, 46);

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length, true);

  const out = new Uint8Array(local.length + central.length + end.length);
  out.set(local, 0);
  out.set(central, local.length);
  out.set(end, local.length + central.length);
  return out;
}

describe('zip-codec: lazna zastavica data descriptora', () => {
  it('ulaz doista nosi bit 3 (baseline, inace test ne mjeri nista)', () => {
    const bytes = zipWithDataDescriptorBit('word/document.xml', '<w:document/>');
    const { local, central } = allFlags(bytes);
    expect(local[0] & DATA_DESCRIPTOR_BIT).toBe(DATA_DESCRIPTOR_BIT);
    expect(central[0] & DATA_DESCRIPTOR_BIT).toBe(DATA_DESCRIPTOR_BIT);
  });

  it('izlaz nema bit 3 ni u jednom zaglavlju, a bit 11 ostaje', async () => {
    const bytes = zipWithDataDescriptorBit('word/document.xml', '<w:document/>');
    const entries = await readZip(bytes);
    const out = await writeZip(entries as ZipEntry[]);
    const { local, central } = allFlags(out);
    expect(local.length).toBeGreaterThan(0);
    for (const flag of [...local, ...central]) {
      expect(flag & DATA_DESCRIPTOR_BIT, 'bit 3 tvrdi deskriptor koji pisac nikad ne pise').toBe(0);
      // Bit 11 je i dalje istinit (ime je UTF-8), pa se cuva.
      expect(flag & UTF8_NAME_BIT).toBe(UTF8_NAME_BIT);
    }
  });

  it('sadrzaj netaknutog zapisa ostaje bajt-identican', async () => {
    const bytes = zipWithDataDescriptorBit('word/document.xml', '<w:document/>');
    const before = await readZip(bytes);
    const out = await writeZip(before as ZipEntry[]);
    const after = await readZip(out);
    expect(new TextDecoder().decode(after[0].data)).toBe('<w:document/>');
  });
});
