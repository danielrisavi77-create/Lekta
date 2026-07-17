/**
 * Sigurnosni testovi ZIP/DOCX intake puta (golden-first disciplina, CLAUDE.md):
 * napisani PRIJE implementacije capova da dokazu zatecen nedostatak, pa nakon
 * implementacije dokazuju ponasanje. Pokrivaju:
 *  - entry-count cap (MAX_ZIP_ENTRIES): arhiva sa stotinama zapisa se odbija vec u parse(),
 *  - agregatni cross-entry dekompresijski cap (2x per-entry budzet) u data(),
 *  - footnotes.xml paragraph pre-scan u analyzeDocx (klijentski par serverskog AUD-38),
 *  - kontrolu da minimalni builder docx i realni budzeti NISU pogodjeni (nema laznih odbijanja).
 */
import { describe, it, expect } from 'vitest';
import { ZipReader, ZipLimitError } from '../src/docx/parser';
import { buildDocx, buildDocxFile, zipStore } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';

const enc = new TextEncoder();

describe('zip hardening: entry-count cap', () => {
  it('arhiva sa 600 zapisa se odbija kao ZipLimitError', () => {
    const files = Array.from({ length: 600 }, (_, i) => ({ name: `f/${i}.bin`, data: enc.encode('x') }));
    const bytes = zipStore(files);
    expect(() => new ZipReader(bytes.buffer as ArrayBuffer)).toThrow(ZipLimitError);
  });

  it('minimalni builder docx (4-5 zapisa) prolazi bez greske', () => {
    const bytes = buildDocx({ paragraphs: [{ text: 'Uvod' }] });
    const zip = new ZipReader(bytes.buffer as ArrayBuffer);
    expect(zip.names()).toContain('word/document.xml');
    expect(zip.names().length).toBeLessThan(512);
  });
});

describe('zip hardening: agregatni dekompresijski cap', () => {
  it('zbroj zapisa preko 2x budzeta baca ZipLimitError na trecem citanju', async () => {
    const files = [
      { name: 'a.bin', data: new Uint8Array(700).fill(65) },
      { name: 'b.bin', data: new Uint8Array(700).fill(66) },
      { name: 'c.bin', data: new Uint8Array(700).fill(67) },
    ];
    const zip = new ZipReader(zipStore(files).buffer as ArrayBuffer, { maxDecompressedBytes: 1024 });
    await expect(zip.data('a.bin')).resolves.toBeTruthy(); // 700 <= 2048
    await expect(zip.data('b.bin')).resolves.toBeTruthy(); // 1400 <= 2048
    await expect(zip.data('c.bin')).rejects.toThrow(ZipLimitError); // 2100 > 2048
  });

  it('realan slijed dijelova docx-a ostaje ispod agregata (nema laznog odbijanja)', async () => {
    const bytes = buildDocx({ paragraphs: [{ text: 'Uvod, tekst rada.' }], footnotes: ['Usp. izvor.'] });
    const zip = new ZipReader(bytes.buffer as ArrayBuffer);
    for (const name of ['word/document.xml', 'word/styles.xml', 'word/footnotes.xml', '[Content_Types].xml']) {
      await expect(zip.text(name)).resolves.toBeTruthy();
    }
  });
});

describe('zip hardening: footnotes.xml paragraph pre-scan', () => {
  it('footnotes.xml s vise od 300000 odlomaka odbija analizu porukom "previše odlomaka"', async () => {
    const evil = `<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${'<w:p/>'.repeat(300001)}</w:footnotes>`;
    const file = buildDocxFile({ paragraphs: [{ text: 'Uvod' }] }, 'fusnote-bomba.docx', [
      { name: 'word/footnotes.xml', data: enc.encode(evil) },
    ]);
    await expect(analyzeFixture(file)).rejects.toThrow(/previše odlomaka/);
  }, 30000);

  it('normalan broj fusnota prolazi (sanity par)', async () => {
    const file = buildDocxFile(
      { paragraphs: [{ text: '1. Uvod', styleId: 'Heading1' }, { text: 'Tekst rada s fusnotama.' }], footnotes: ['a', 'b', 'c', 'd', 'e'] },
      'fusnote-ok.docx',
    );
    const r = await analyzeFixture(file);
    expect(Array.isArray(r.checks)).toBe(true);
  }, 30000);
});
