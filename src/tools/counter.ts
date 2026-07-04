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

// Kratice koje zavrsavaju tockom a nisu kraj recenice (uobicajene u akademskom hrvatskom).
const ABBREVIATIONS = [
  'dr', 'sc', 'mr', 'prof', 'doc', 'akad', 'npr', 'itd', 'tj', 'tzv', 'god', 'st', 'br',
  'sv', 'čl', 'op', 'cit', 'odn', 'ur', 'izv', 'usp', 'vidi', 'str', 'tab', 'sl',
];
const ABBREV_RE = new RegExp('\\b(' + ABBREVIATIONS.join('|') + ')\\.', 'gi');

/**
 * Broj recenica bez laznog napuhavanja na kraticama, decimalama i rednim brojevima.
 * Prvo neutralizira tocke unutar brojeva (3.5, 1.000), poznate kratice (dr. sc. -> dr sc)
 * i redne brojeve ispred malog slova (2. svibnja), pa broji skupine zavrsne interpunkcije.
 */
function countSentences(trimmed: string): number {
  if (!trimmed) return 0;
  const s = trimmed
    .replace(/(\d)[.,](?=\d)/g, '$1') // decimalni/tisucni separator unutar broja
    .replace(ABBREV_RE, '$1') // poznate kratice
    .replace(/(\d)\.(?=\s*\p{Ll})/gu, '$1'); // redni broj ispred malog slova ("2. svibnja")
  const terminators = (s.match(/[.!?…]+/g) || []).length;
  return Math.max(1, terminators);
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
  // Stranice se vezu na stvarni sadrzaj (trimano), ne na same razmake, da prazan/whitespace
  // dokument ne prijavi 1 stranicu dok su ostale metrike 0.
  const pages = trimmed ? Math.max(1, Math.ceil(karticeRaw)) : 0;

  // Recenice: skupine zavrsnih interpunkcija, uz preskakanje kratica/decimala/rednih brojeva.
  const sentences = countSentences(trimmed);

  // Odlomci: blokovi teksta odvojeni prijelomom retka.
  const paragraphs = trimmed
    ? text.split(/\n+/).map(p => p.trim()).filter(Boolean).length
    : 0;

  const readingMinutes = words ? Math.round((words / RIJECI_PO_MINUTI) * 10) / 10 : 0;

  return { words, charsWithSpaces, charsWithoutSpaces, pages, kartice, sentences, paragraphs, readingMinutes };
}
