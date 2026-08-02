/**
 * Ekstrakcija cistog teksta iz uploadanih IZVORNIH MATERIJALA (izvještaji, projekti, radovi koje
 * je student stvarno citirao) - za cross-check protiv analiziranog rada, ne sam rad.
 *
 * v1 namjerno ogranicen na .docx/.txt/.md: u repou ne postoji NIKAKVA PDF ekstrakcija teksta (nema
 * pdfjs-dist/pdf-parse), a dodavanje PDF podrske je zaseban, jednako velik zahvat kao odgodjeni
 * korpus-plagijat feature (nova ovisnost + worker integracija) - PDF izvori su eksplicitno
 * odgodjeni, ne tiho prosireni u opseg.
 *
 * .docx grana = NULA novih ovisnosti: postojeci ZipReader (src/docx/parser.ts, vec hardeniran
 * protiv zip-bombe) + extractDocxText (src/tools/docx-text.ts, vec koristen za kartice.html).
 */
import { ZipReader } from '../docx/parser';
import { extractDocxText } from '../tools/docx-text';

export interface SourceMaterialDoc {
  fileName: string;
  rawText: string;
  paragraphs: string[];
}

export class UnsupportedSourceMaterialError extends Error {
  constructor(fileName: string) {
    super(`Nepodržan format izvorne datoteke: ${fileName}. Podržani su .docx, .txt i .md (PDF izvori još nisu podržani).`);
    this.name = 'UnsupportedSourceMaterialError';
  }
}

function splitTextParagraphs(text: string): string[] {
  return String(text || '')
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Izvuci {fileName, rawText, paragraphs} iz jedne izvorne datoteke. Baca UnsupportedSourceMaterialError za sve osim .docx/.txt/.md. */
export async function extractSourceMaterialText(file: File): Promise<SourceMaterialDoc> {
  const fileName = file.name || 'izvor';
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.docx')) {
    const zip = new ZipReader(await file.arrayBuffer());
    const xml = await zip.text('word/document.xml');
    const rawText = extractDocxText(xml);
    return {
      fileName,
      rawText,
      paragraphs: rawText.split('\n').map((s) => s.trim()).filter(Boolean),
    };
  }
  if (lower.endsWith('.txt') || lower.endsWith('.md')) {
    const rawText = await file.text();
    return { fileName, rawText, paragraphs: splitTextParagraphs(rawText) };
  }
  throw new UnsupportedSourceMaterialError(fileName);
}
