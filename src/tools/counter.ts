// Tipizirana, testabilna jezgra brojaca kartica/rijeci/znakova (bez DOM-a, bez mreze).
// Hrvatski standard lekture i prijevoda: 1 autorska kartica = 1800 znakova s razmacima.
// Glue (kartice-page.ts) samo veze textarea i ispisuje ove brojeve.

export const ZNAKOVA_PO_KARTICI = 1800;
// Alternativna mjera dijela kolegija: 1500 znakova BEZ razmaka (v. FAQ na kartice.html).
export const ZNAKOVA_PO_KARTICI_BEZ_RAZMAKA = 1500;

/** Kartice iz broja znakova, na dvije decimale. Mnozi PRIJE dijeljenja (cijeli brojnik):
 *  naivni Math.round((chars/per)*100)/100 za tocno pola stotinke (npr. 1809/1800=1,005)
 *  IEEE-754 zaokruzi na nizu stranu (v. regresijski test u counter.test.ts). */
export function karticeFrom(chars: number, znakovaPoKartici: number): number {
  return Math.round((chars * 100) / znakovaPoKartici) / 100;
}
// Procjena A4 stranice (TNR 12, prored 1,5, standardne margine): oko 2600 znakova s razmacima.
// Kartica (1800) je tako oko dvije trecine A4 stranice. Djelitelj /2 (koji smo prije koristili)
// odgovara JEDNOSTRUKOM proredu pa je podbrajao stranice pri deklariranom proredu 1,5.
export const ZNAKOVA_PO_STRANICI = 2600;
export const RIJECI_PO_MINUTI = 200; // prosjecna brzina tihog citanja

export interface TextMetrics {
  words: number;
  charsWithSpaces: number;   // svi znakovi osim prijeloma retka (kao "znakova s razmacima")
  charsWithoutSpaces: number; // samo ne-praznine (uz NBSP koji nosi sadrzaj, npr. "10 kg")
  pages: number;             // procjena A4 stranica (TNR 12, prored 1,5): kartica je oko 2/3 stranice
  kartice: number;           // znakovi s razmacima / 1800, na dvije decimale
  sentences: number;
  paragraphs: number;
  readingMinutes: number;    // procjena vremena citanja u minutama, na jednu decimalu
}

// Nevidljivi znakovi koji stizu copy-pasteom a ne smiju napuhati "znakove s razmacima":
// zero-width space/joiner/non-joiner (U+200B..U+200D), word joiner (U+2060), meki prijelom
// (soft hyphen U+00AD, iz obostrano poravnatih PDF/Word izvora) i BOM (U+FEFF). Svi su nevidljivi,
// a broje se kao znak pa bi inace divergirali od stvarnog opsega i napuhali naplatni metrik.
const INVISIBLE_RE = new RegExp('[\\u00AD\\u200B\\u200C\\u200D\\u2060\\uFEFF]', 'g');

function normalize(text: string): string {
  // 1) NFC: dekomponirani (NFD) dijakritici inace broje osnovno slovo + kombinirajuci znak kao 2,
  //    pa bi vizualno identican tekst iz NFD izvora (macOS, neki PDF/CMS) dao vise kartica od NFC.
  // 2) CRLF/CR -> LF; prijelomi se poslije ne broje u znakove.
  // 3) nevidljivi znakovi i BOM se izbacuju (v. INVISIBLE_RE).
  return text.normalize('NFC').replace(/\r\n?/g, '\n').replace(INVISIBLE_RE, '');
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
// Zavrsni navodnik/zagrada iza kojih se recenica NASTAVLJA malim slovom: terminator ispred
// zatvarajuceg navodnika ("Zasto?" i dalje...) nije stvarni kraj recenice. Veliko slovo iza
// ostaje granica ("Idi." Zatim...), pa je uvjet zatvarac + razmak + malo slovo.
const QUOTE_CONT_RE = /[.!?…]+(?=["'”’»›)\]]+\s*\p{Ll})/gu;

/**
 * Broj recenica bez laznog napuhavanja na URL-ovima, kraticama, decimalama, rasponima i rednim brojevima.
 * Redom: makni URL-ove, spoji decimale/tisucnice, spoji raspone brojeva ("10.-20."), neutraliziraj
 * kratice (ALWAYS uvijek, LEX osim pred novom recenicom) i redne brojeve pred malim slovom, ponisti
 * terminator ispred zatvarajuceg navodnika kad se recenica nastavlja, pa broji zavrsnu interpunkciju.
 */
function countSentences(trimmed: string): number {
  if (!trimmed) return 0;
  const s = trimmed
    .replace(URL_RE, ' ') // mrezni izvori (tocke u domeni nisu kraj recenice)
    .replace(/(\d)[.,](?=\d)/g, '$1') // decimalni/tisucni separator unutar broja
    .replace(/(\d)\.(?=[-–]\d)/gu, '$1') // raspon brojeva ("str. 10.-20.", "2020.-2024.")
    .replace(ALWAYS_RE, '$1$2') // titule/prefiksne kratice (uvijek)
    .replace(LEX_RE, '$1$2') // leksicke kratice (osim pred velikim slovom = nova recenica)
    .replace(/(\d)\.(?=\s*\p{Ll})/gu, '$1') // redni broj ispred malog slova ("2. svibnja")
    // marker nabrajanja na pocetku retka ("1. Uvod") nije kraj recenice, ni pred velikim slovom;
    // sredina retka se NE dira da godina koja zavrsava recenicu ("... 1990. Danas ...") ostane granica
    .replace(/(^|\n)(\s*)(\d+)\.(?=\s)/g, '$1$2$3')
    // tocka izmedu slova bez razmaka, pred malim slovom: gole domene i e-mail ("primjer.hr",
    // "ivan@primjer.com") nisu kraj recenice; veliko slovo iza tocke ("kraj.Novo") ostaje granica
    .replace(/(\p{L})\.(?=\p{Ll})/gu, '$1')
    // terminator ispred zatvarajuceg navodnika/zagrade kad se recenica nastavlja malim slovom
    .replace(QUOTE_CONT_RE, '');
  const terminators = (s.match(/[.!?…]+/g) || []).length;
  return Math.max(1, terminators);
}

// Rijec je token koji sadrzi barem jedno slovo ili broj. Samostalna interpunkcija (crtica, tocka)
// okruzena razmacima NIJE rijec. Em/en crtica bez okolnih razmaka ("rijec—rijec") razdvaja dvije
// rijeci, dok obicna spojnica ("dobro-poznat") ostaje jedna rijec.
function countWords(trimmed: string): number {
  if (!trimmed) return 0;
  const split = trimmed.replace(/([^\s–—])[–—](?=[^\s–—])/gu, '$1 ');
  return split.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

export function countText(input: string): TextMetrics {
  const text = normalize(input || '');
  const trimmed = text.trim();

  const words = countWords(trimmed);

  // Znakovi se broje iz TRIMANOG sadrzaja: vodeci/zavrsni razmaci i prazni redovi (cesti u
  // copy-pasteu iz PDF/Worda) inace napuhuju naplatnu karticu. Jedan prolaz (bez alokacije niza
  // po znaku): 'u'-iteracija broji astralni znak kao jedan. Prijelom retka se ne broji.
  // NBSP (U+00A0) i uski NBSP (U+202F) su \s u JS-u, ali nose sadrzaj (npr. "10 kg") pa ulaze
  // u "znakove bez razmaka".
  let charsWithSpaces = 0;
  let charsWithoutSpaces = 0;
  for (const ch of trimmed) {
    if (ch === '\n') continue;
    charsWithSpaces++;
    const code = ch.codePointAt(0);
    if (!/\s/u.test(ch) || code === 0x00a0 || code === 0x202f) charsWithoutSpaces++;
  }

  const kartice = karticeFrom(charsWithSpaces, ZNAKOVA_PO_KARTICI);
  // Procjena A4 stranica iz iste (trimane) osnovice kao kartice, da metrike ostanu uskladjene.
  const pages = trimmed ? Math.max(1, Math.ceil(charsWithSpaces / ZNAKOVA_PO_STRANICI)) : 0;

  // Recenice: skupine zavrsnih interpunkcija, uz preskakanje kratica/decimala/raspona/rednih brojeva.
  const sentences = countSentences(trimmed);

  // Odlomci: blokovi teksta odvojeni prijelomom retka (Word-like: svaki hard-return dijeli odlomak).
  const paragraphs = trimmed
    ? text.split(/\n+/).map((p) => p.trim()).filter(Boolean).length
    : 0;

  // Donji prag 0.1 da kratki ne-prazan tekst (1-9 rijeci) ne prijavi "0 min". Gornja zastita:
  // tekst ispod jedne minute (npr. 190 rijeci) ne smije se zaokruziti na "1 min".
  let readingMinutes = 0;
  if (words) {
    const raw = words / RIJECI_PO_MINUTI;
    let rounded = Math.round(raw * 10) / 10;
    if (raw < 1 && rounded >= 1) rounded = 0.9; // ostani ispod minute
    readingMinutes = Math.max(0.1, rounded);
  }

  return { words, charsWithSpaces, charsWithoutSpaces, pages, kartice, sentences, paragraphs, readingMinutes };
}
