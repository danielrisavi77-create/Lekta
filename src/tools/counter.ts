// Tipizirana, testabilna jezgra brojaca kartica/rijeci/znakova (bez DOM-a, bez mreze).
// Hrvatski standard lekture i prijevoda: 1 autorska kartica = 1800 znakova s razmacima.
// Glue (kartice-page.ts) samo veze textarea i ispisuje ove brojeve.

export const ZNAKOVA_PO_KARTICI = 1800;
export const RIJECI_PO_MINUTI = 200; // prosjecna brzina tihog citanja

export interface TextMetrics {
  words: number;
  charsWithSpaces: number;   // svi znakovi osim prijeloma retka (kao "znakova s razmacima")
  charsWithoutSpaces: number; // samo ne-praznine
  pages: number;             // procjena A4 stranica (TNR 12, prored 1,5): kartica je oko pola stranice
  kartice: number;           // znakovi s razmacima / 1800, na dvije decimale
  sentences: number;
  paragraphs: number;
  readingMinutes: number;    // procjena vremena citanja u minutama, na jednu decimalu
}

// Zero-width space/joiner/non-joiner i BOM (escape oblik da nevidljivi znakovi ne zive u izvoru).
const ZERO_WIDTH_RE = new RegExp('[\\u200B\\u200C\\u200D\\uFEFF]', 'g');

function normalize(text: string): string {
  // CRLF/CR -> LF; zero-width znakovi i BOM se izbacuju da ne napuhuju "znakove s razmacima"
  // (nevidljivi su, a stizu iz copy-pastea; BOM je k tome \s pa bi dvije metrike divergirale).
  return text.replace(/\r\n?/g, '\n').replace(ZERO_WIDTH_RE, '');
}

// Kratice koje zavrsavaju tockom a nisu kraj recenice (uobicajene u akademskom hrvatskom).
// Dvije skupine, jer se razlicito ponasaju na kraju recenice:
//  - ALWAYS: titule/prefiksi i oznake koje UVIJEK prethode imenu/broju i nikad ne zavrsavaju
//    recenicu ("dr. sc. Ivic", "čl. 5", "tab. 3"), pa im tocku uvijek brisemo.
//  - LEX: leksicke kratice koje MOGU biti na kraju recenice ("...i sl. Zatim...", "...itd.
//    Nakon..."), pa tocku brisemo samo kad NE slijedi granica recenice (razmak + veliko slovo).
// Granica NIJE \b: u JS-u je \b ASCII pa pada ispred dijakritika ("čl" -> \b prije č ne postoji),
// zbog cega se "čl." nikad nije neutralizirao. Umjesto toga konzumiramo ne-slovnu granicu
// (^|[^\p{L}]) uz 'u' flag i vracamo je kroz $1 ($2 je sama kratica, bez tocke).
// 'sv' (sveti/sveta) je ALWAYS: prakticki uvijek prethodi velikom imenu ("sv. Marko"), pa bi ga
// LEX lookahead (veliko slovo = granica) sustavno promasivao. 'st' (stoljece) ostaje LEX jer
// legitimno zavrsava recenicu ("... u 20. st. Nakon toga ..."). 'vidi' je puni glagol, ne kratica
// s tockom ("Vidi." JE kraj recenice), pa mu ovdje nije mjesto.
const ALWAYS_ABBR = [
  'dr', 'sc', 'mr', 'prof', 'doc', 'akad', 'ur', 'izv', 'čl', 'br', 'god', 'str', 'tab',
  'op', 'cit', 'odn', 'npr', 'tj', 'tzv', 'usp', 'sv',
];
const LEX_ABBR = ['itd', 'st', 'sl'];
const ALWAYS_RE = new RegExp('(^|[^\\p{L}])(' + ALWAYS_ABBR.join('|') + ')\\.', 'giu');
// LEX_RE NAMJERNO bez 'i' flaga: uz 'i' se \p{Lu} case-folda i poklapa i mala slova, pa bi
// lookahead "razmak + veliko slovo" lazno okidao. Kratice su ionako mala slova u tekstu.
const LEX_RE = new RegExp('(^|[^\\p{L}])(' + LEX_ABBR.join('|') + ')\\.(?!\\s+\\p{Lu})', 'gu');
// Mrezni izvori: tocke unutar domene/putanje nisu kraj recenice; uklanjamo cijeli URL prije
// brojanja, ali cuvamo zavrsnu recenicnu interpunkciju iza URL-a (lazy do granice + lookahead).
const URL_RE = /(?:https?:\/\/|www\.)\S+?(?=[.,;:!?]*(?:\s|$))/giu;

/**
 * Broj recenica bez laznog napuhavanja na URL-ovima, kraticama, decimalama i rednim brojevima.
 * Redom: makni URL-ove, spoji decimale/tisucnice, neutraliziraj kratice (ALWAYS uvijek, LEX
 * osim pred novom recenicom) i redne brojeve pred malim slovom, pa broji zavrsnu interpunkciju.
 */
function countSentences(trimmed: string): number {
  if (!trimmed) return 0;
  const s = trimmed
    .replace(URL_RE, ' ') // mrezni izvori (tocke u domeni nisu kraj recenice)
    .replace(/(\d)[.,](?=\d)/g, '$1') // decimalni/tisucni separator unutar broja
    .replace(ALWAYS_RE, '$1$2') // titule/prefiksne kratice (uvijek)
    .replace(LEX_RE, '$1$2') // leksicke kratice (osim pred velikim slovom = nova recenica)
    .replace(/(\d)\.(?=\s*\p{Ll})/gu, '$1') // redni broj ispred malog slova ("2. svibnja")
    // marker nabrajanja na pocetku retka ("1. Uvod") nije kraj recenice, ni pred velikim slovom;
    // sredina retka se NE dira da godina koja zavrsava recenicu ("... 1990. Danas ...") ostane granica
    .replace(/(^|\n)(\s*)(\d+)\.(?=\s)/g, '$1$2$3')
    // tocka izmedu slova bez razmaka, pred malim slovom: gole domene i e-mail ("primjer.hr",
    // "ivan@primjer.com") nisu kraj recenice; veliko slovo iza tocke ("kraj.Novo") ostaje granica
    .replace(/(\p{L})\.(?=\p{Ll})/gu, '$1');
  const terminators = (s.match(/[.!?…]+/g) || []).length;
  return Math.max(1, terminators);
}

export function countText(input: string): TextMetrics {
  const text = normalize(input || '');
  const trimmed = text.trim();

  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  // Znakovi: prijelom retka se ne broji (kartica broji tekstualne znakove, ne odlomke).
  // 'u' flag: astralni znakovi (emoji i sl.) broje se kao jedan znak, ne dva code unita.
  const charsWithSpaces = (text.match(/[^\n]/gu) || []).length;
  const charsWithoutSpaces = (text.match(/\S/gu) || []).length;

  const karticeRaw = charsWithSpaces / ZNAKOVA_PO_KARTICI;
  const kartice = Math.round(karticeRaw * 100) / 100;
  // Procjena A4 stranica: kartica je oko pola stranice (TNR 12, prored 1,5), pa kartice / 2.
  // Veze se na stvarni sadrzaj (trimano) da prazan/whitespace ulaz ne prijavi 1 stranicu.
  const pages = trimmed ? Math.max(1, Math.ceil(karticeRaw / 2)) : 0;

  // Recenice: skupine zavrsnih interpunkcija, uz preskakanje kratica/decimala/rednih brojeva.
  const sentences = countSentences(trimmed);

  // Odlomci: blokovi teksta odvojeni prijelomom retka.
  const paragraphs = trimmed
    ? text.split(/\n+/).map(p => p.trim()).filter(Boolean).length
    : 0;

  // Donji prag 0.1 da kratki ne-prazan tekst (1-9 rijeci) ne prijavi "0 min".
  const readingMinutes = words ? Math.max(0.1, Math.round((words / RIJECI_PO_MINUTI) * 10) / 10) : 0;

  return { words, charsWithSpaces, charsWithoutSpaces, pages, kartice, sentences, paragraphs, readingMinutes };
}
