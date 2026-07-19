import { describe, it, expect } from 'vitest';
import { readZip, writeZip } from './zip-codec';

function randomBytes(n: number): Uint8Array {
  const arr = new Uint8Array(n);
  for (let i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 256);
  return arr;
}

describe('zip-codec round-trip', () => {
  it('cuva tekstualni i binarni sadrzaj bit-identicno', async () => {
    const enc = new TextEncoder();
    const entries = [
      { name: '[Content_Types].xml', data: enc.encode('<xml>content types</xml>') },
      { name: 'word/document.xml', data: enc.encode('<w:document><w:body>hello</w:body></w:document>') },
      { name: 'word/media/image1.bin', data: new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252, 0, 0, 255]) },
    ];

    const zipped = await writeZip(entries);
    const readBack = await readZip(zipped);

    expect(readBack.length).toBe(entries.length);
    for (const orig of entries) {
      const read = readBack.find((e) => e.name === orig.name);
      expect(read).toBeDefined();
      expect(read!.data).toEqual(orig.data);
    }
  });

  it('podnosi rubne slucajeve: prazan fajl, velik binarni sadrzaj, sve-nule, sve-FF', async () => {
    const entries = [
      { name: 'empty.xml', data: new Uint8Array(0) },
      { name: 'big-binary.png', data: randomBytes(50000) },
      { name: 'all-zeros.bin', data: new Uint8Array(1000) },
      { name: 'all-ff.bin', data: new Uint8Array(1000).fill(255) },
    ];

    const zipped = await writeZip(entries);
    const readBack = await readZip(zipped);

    for (const orig of entries) {
      const read = readBack.find((e) => e.name === orig.name);
      expect(read!.data).toEqual(orig.data);
    }
  });

  it('cuva poredak entryja', async () => {
    const enc = new TextEncoder();
    const names = ['a.xml', 'b.xml', 'c.xml', 'd.xml'];
    const entries = names.map((name) => ({ name, data: enc.encode(name) }));

    const zipped = await writeZip(entries);
    const readBack = await readZip(zipped);

    expect(readBack.map((e) => e.name)).toEqual(names);
  });
});

describe('zip-codec zastita (WS-6.5: zip-bomb / entry-flood)', () => {
  const enc = new TextEncoder();

  it('produkcijski defaulti ne diraju valjan docx (ista putanja kao golden)', async () => {
    const entries = [
      { name: 'word/document.xml', data: enc.encode('<w:document/>'.repeat(500)) },
      { name: 'word/media/image1.bin', data: randomBytes(80000) },
    ];
    const zipped = await writeZip(entries);
    const readBack = await readZip(zipped); // bez limits -> defaulti 4096 / 64MB
    expect(readBack.length).toBe(2);
    expect(readBack[0].data).toEqual(entries[0].data);
  });

  it('odbija previse entryja (entry-flood) kad broj prijedje maxEntries', async () => {
    const entries = [
      { name: 'a.xml', data: enc.encode('a') },
      { name: 'b.xml', data: enc.encode('b') },
      { name: 'c.xml', data: enc.encode('c') },
    ];
    const zipped = await writeZip(entries);
    await expect(readZip(zipped, { maxEntries: 2 })).rejects.toThrow(/previse zip entryja/);
    // isti zip s dovoljnim capom prolazi
    expect((await readZip(zipped, { maxEntries: 3 })).length).toBe(3);
  });

  it('presijeca dekompresiju kad ukupni sadrzaj probije budzet (deflate put)', async () => {
    // 4000 bajtova se DEFLATE-a u writeZip; s budzetom 500 mora puknuti PRI dekompresiji, ne na kraju
    const entries = [{ name: 'big.xml', data: enc.encode('x'.repeat(4000)) }];
    const zipped = await writeZip(entries);
    await expect(readZip(zipped, { maxTotalDecompressed: 500 })).rejects.toThrow(/budzet|zip-bomba/);
    // dovoljan budzet -> prolazi netaknuto
    const ok = await readZip(zipped, { maxTotalDecompressed: 10000 });
    expect(ok[0].data.length).toBe(4000);
  });

  it('budzet se troshi PREKO svih entryja, ne po entryju', async () => {
    const entries = [
      { name: 'a.xml', data: enc.encode('a'.repeat(600)) },
      { name: 'b.xml', data: enc.encode('b'.repeat(600)) },
    ];
    const zipped = await writeZip(entries);
    // svaki entry 600B stane u 1000B pojedinacno, ali zbroj 1200B probija ukupni budzet
    await expect(readZip(zipped, { maxTotalDecompressed: 1000 })).rejects.toThrow(/budzet|zip-bomba/);
  });
});
