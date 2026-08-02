import { describe, it, expect } from 'vitest';
import { buildDocxFile } from './helpers/docx-builder';
import { extractSourceMaterialText, UnsupportedSourceMaterialError } from '../src/analysis/source-material-text';

describe('extractSourceMaterialText', () => {
  it('izvlaci tekst iz .docx izvora (isti ZipReader/extractDocxText put kao kartice.html)', async () => {
    const file = buildDocxFile({ paragraphs: [{ text: 'Prvi odlomak izvora.' }, { text: 'Drugi odlomak izvora.' }] }, 'izvor.docx');
    const doc = await extractSourceMaterialText(file);
    expect(doc.fileName).toBe('izvor.docx');
    expect(doc.rawText).toContain('Prvi odlomak izvora.');
    expect(doc.paragraphs).toEqual(['Prvi odlomak izvora.', 'Drugi odlomak izvora.']);
  });

  it('izvlaci tekst iz .txt izvora, odlomci razdvojeni praznim retkom', async () => {
    const file = new File(['Prvi odlomak.\n\nDrugi odlomak.'], 'izvor.txt', { type: 'text/plain' });
    const doc = await extractSourceMaterialText(file);
    expect(doc.fileName).toBe('izvor.txt');
    expect(doc.paragraphs).toEqual(['Prvi odlomak.', 'Drugi odlomak.']);
  });

  it('izvlaci tekst iz .md izvora', async () => {
    const file = new File(['# Naslov\n\nSadržaj odlomka.'], 'izvor.md', { type: 'text/markdown' });
    const doc = await extractSourceMaterialText(file);
    expect(doc.paragraphs).toEqual(['# Naslov', 'Sadržaj odlomka.']);
  });

  it('odbija .pdf uz jasnu poruku', async () => {
    const file = new File(['%PDF-1.4'], 'izvor.pdf', { type: 'application/pdf' });
    await expect(extractSourceMaterialText(file)).rejects.toThrow(UnsupportedSourceMaterialError);
    await expect(extractSourceMaterialText(file)).rejects.toThrow(/PDF izvori još nisu podržani/);
  });
});
