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
