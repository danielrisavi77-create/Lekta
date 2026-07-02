// Tipizirana, testabilna jezgra brojaca kartica/rijeci/znakova (bez DOM-a, bez mreze).
// Hrvatski standard lekture i prijevoda: 1 autorska kartica = 1800 znakova s razmacima.
// Glue (kartice-page.ts) samo veze textarea i ispisuje ove brojeve.

export const ZNAKOVA_PO_KARTICI = 1800;
export const RIJECI_PO_MINUTI = 200; // prosjecna brzina tihog citanja

export interface TextMetrics {
  words: number;
  charsWithSpaces: number;   // svi znakovi osim prijeloma retka (kao "znakova s razmacima")
  charsWithoutSpaces: number; // samo ne-praznine
  pages: number;             // kartice, zaokruzeno prema gore (procjena stranica)
  kartice: number;           // znakovi s razmacima / 1800, na dvije decimale
  sentences: number;
  paragraphs: number;
  readingMinutes: number;    // procjena vremena citanja u minutama, na jednu decimalu
}

function normalize(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

export function countText(input: string): TextMetrics {
  const text = normalize(input || '');
  const trimmed = text.trim();

  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  // Znakovi: prijelom retka se ne broji (kartica broji tekstualne znakove, ne odlomke).
  const charsWithSpaces = (text.match(/[^\n]/g) || []).length;
  const charsWithoutSpaces = (text.match(/\S/g) || []).length;

  const karticeRaw = charsWithSpaces / ZNAKOVA_PO_KARTICI;
  const kartice = Math.round(karticeRaw * 100) / 100;
  const pages = charsWithSpaces ? Math.max(1, Math.ceil(karticeRaw)) : 0;

  // Recenice: skupine zavrsnih interpunkcija; ako ima teksta bez terminatora, to je 1.
  const terminators = (trimmed.match(/[.!?…]+/g) || []).length;
  const sentences = trimmed ? Math.max(1, terminators) : 0;

  // Odlomci: blokovi teksta odvojeni prijelomom retka.
  const paragraphs = trimmed
    ? text.split(/\n+/).map(p => p.trim()).filter(Boolean).length
    : 0;

  const readingMinutes = words ? Math.round((words / RIJECI_PO_MINUTI) * 10) / 10 : 0;

  return { words, charsWithSpaces, charsWithoutSpaces, pages, kartice, sentences, paragraphs, readingMinutes };
}
