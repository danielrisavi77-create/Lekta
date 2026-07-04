/**
 * Write round-trip spike: rewritePageGeometry mijenja ISKLJUCIVO w:pgMar/w:pgSz u
 * word/document.xml, sve ostale zapise prenosi netaknute, a bez sectPr ili bez
 * stvarne promjene vraca original. Realna fixtura (deflate) dokazuje da tekst i
 * fusnote prezive prepakiravanje.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rewritePageGeometry } from '../src/docx/docx-rewriter';
import { ZipReader } from '../src/docx/parser';
import { zipStore } from '../src/docx/docx-writer';
import { buildDocx } from './helpers/docx-builder';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(here, 'fixtures', 'docx');
const fixtures = existsSync(FIXTURE_DIR)
  ? readdirSync(FIXTURE_DIR).filter((n) => n.toLowerCase().endsWith('.docx')).sort()
  : [];

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const countWt = (xml: string) => (xml.match(/<w:t[\s>]/g) || []).length;

describe('rewritePageGeometry: margine i A4 (spike write-puta)', () => {
  it('sinteticki docx: margine 2,0 -> 2,5, tekst i ostali zapisi netaknuti', async () => {
    const src = buildDocx({
      paragraphs: [
        { text: 'Uvodni odlomak.' },
        { text: 'Drugi odlomak s vise teksta.' },
      ],
      marginsCm: { top: 2.0, right: 2.0, bottom: 2.0, left: 2.0 },
    });
    const srcZip = new ZipReader(toArrayBuffer(src));
    const srcDoc = await srcZip.text('word/document.xml');
    const srcStyles = await srcZip.data('word/styles.xml');

    const out = await rewritePageGeometry(toArrayBuffer(src), {
      marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
    });
    expect(out.changed).toEqual(['margine 2.5/2.5/2.5/2.5 cm']);

    const zip = new ZipReader(toArrayBuffer(out.bytes));
    const doc = await zip.text('word/document.xml');
    // 2,5 cm * 567 = 1417,5 -> 1418 twipa
    expect(doc).toContain('w:top="1418"');
    expect(doc).toContain('w:left="1418"');
    expect(doc).not.toContain('w:top="1134"'); // stara 2,0 cm margina
    // tekst odlomaka bajt-identican (w:t sadrzaj netaknut)
    expect(doc).toContain('Uvodni odlomak.');
    expect(countWt(doc)).toBe(countWt(srcDoc));
    // ostali zapisi netaknuti
    const styles = await zip.data('word/styles.xml');
    expect(styles).toEqual(srcStyles);
    expect(zip.names().sort()).toEqual(srcZip.names().sort());
  });

  it('a4: postavlja w:pgSz na Wordov A4 (11906 x 16838)', async () => {
    const src = buildDocx({
      paragraphs: [{ text: 'Letter dokument.' }],
      pageCm: { w: 21.59, h: 27.94 },
    });
    const out = await rewritePageGeometry(toArrayBuffer(src), { a4: true });
    expect(out.changed).toEqual(['velicina stranice A4']);
    const doc = await new ZipReader(toArrayBuffer(out.bytes)).text('word/document.xml');
    expect(doc).toContain('w:w="11906"');
    expect(doc).toContain('w:h="16838"');
  });

  it('bez cilja: no-op vraca originalne bajtove', async () => {
    const src = buildDocx({ paragraphs: [{ text: 'Netaknuto.' }] });
    const out = await rewritePageGeometry(toArrayBuffer(src), {});
    expect(out.changed).toEqual([]);
    expect(out.bytes).toEqual(src);
  });

  it('dokument bez sectPr: no-op, original netaknut', async () => {
    const enc = new TextEncoder();
    const doc =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:p><w:r><w:t>Bez sekcije.</w:t></w:r></w:p></w:body></w:document>';
    const bytes = zipStore([
      { name: '[Content_Types].xml', data: enc.encode('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>') },
      { name: 'word/document.xml', data: enc.encode(doc) },
    ]);
    const out = await rewritePageGeometry(toArrayBuffer(bytes), {
      marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
    });
    expect(out.changed).toEqual([]);
    expect(out.bytes).toEqual(bytes);
  });

  it('sectPr bez pgMar: umece minimalan w:pgMar', async () => {
    const enc = new TextEncoder();
    const doc =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:p><w:r><w:t>Implicitne margine.</w:t></w:r></w:p>' +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>';
    const bytes = zipStore([{ name: 'word/document.xml', data: enc.encode(doc) }]);
    const out = await rewritePageGeometry(toArrayBuffer(bytes), {
      marginsCm: { top: 3, right: 3, bottom: 3, left: 3 },
    });
    expect(out.changed).toEqual(['margine 3/3/3/3 cm (dodan w:pgMar)']);
    const next = await new ZipReader(toArrayBuffer(out.bytes)).text('word/document.xml');
    expect(next).toContain('<w:pgMar w:top="1701" w:right="1701" w:bottom="1701" w:left="1701"/>');
  });

  it('cuva postojece pgMar atribute koji se ne diraju (header/footer/gutter)', async () => {
    const enc = new TextEncoder();
    const doc =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:sectPr>' +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>' +
      '</w:sectPr></w:body></w:document>';
    const bytes = zipStore([{ name: 'word/document.xml', data: enc.encode(doc) }]);
    const out = await rewritePageGeometry(toArrayBuffer(bytes), {
      marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
    });
    const next = await new ZipReader(toArrayBuffer(out.bytes)).text('word/document.xml');
    expect(next).toContain('w:top="1418"');
    expect(next).toContain('w:header="708"');
    expect(next).toContain('w:gutter="0"');
  });
});

describe.skipIf(!fixtures.length)('rewritePageGeometry: realne fixture (deflate)', () => {
  it('rewrite margina cuva sve ostale zapise i sav tekst', async () => {
    const name = fixtures[0];
    const raw = readFileSync(join(FIXTURE_DIR, name));
    const input = toArrayBuffer(new Uint8Array(raw));

    const srcZip = new ZipReader(input);
    const srcNames = srcZip.names().sort();
    const srcDoc = await srcZip.text('word/document.xml');
    const srcFoot = srcNames.includes('word/footnotes.xml') ? await srcZip.text('word/footnotes.xml') : '';

    const out = await rewritePageGeometry(input, {
      marginsCm: { top: 3, right: 3, bottom: 3, left: 3 },
    });
    expect(out.changed.length).toBeGreaterThan(0);

    const zip = new ZipReader(toArrayBuffer(out.bytes));
    expect(zip.names().sort()).toEqual(srcNames);

    const doc = await zip.text('word/document.xml');
    expect(doc).toContain('w:top="1701"');
    expect(countWt(doc)).toBe(countWt(srcDoc));

    // svi ostali zapisi bajt-identicni (usporedba dekomprimiranog sadrzaja)
    for (const n of srcNames) {
      if (n === 'word/document.xml') continue;
      expect(await zip.data(n), n).toEqual(await srcZip.data(n));
    }
    if (srcFoot) {
      const foot = await zip.text('word/footnotes.xml');
      expect(countWt(foot)).toBe(countWt(srcFoot));
      expect(foot).toBe(srcFoot);
    }
  });
});
