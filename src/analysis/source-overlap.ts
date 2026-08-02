/**
 * Detektor doslovnog preklapanja (verbatim-copy): rad vs izvorna gradja koju je student uploadao
 * uz rad (izvjestaji, projekti, radovi koje je stvarno citirao). Port `check_overlap.py` (vanjski
 * "Katedra" skill), algoritam prenesen, kod NIJE 1:1 prijepis.
 *
 * Zasto ovo postoji: cross-check (source-claim-check.ts) provjerava "je li tvrdnja/broj iz rada
 * prisutan u izvoru" (potvrdjuje SADRZAJ). Ovo radi OBRNUTO: trazi odlomke koji su gotovo
 * doslovno prepisani iz izvora BEZ vidljive oznake citata (navodnici + referenca) - akademska
 * cestitost, ne cross-check sadrzaja.
 *
 * Metoda: word n-grami (zadano n=8) po odlomku rada naspram n-grama SVAKOG IZVORA (spojen tekst
 * cijele datoteke, ne po odlomku izvora). Preklapanje >= minOverlapCount n-grama = kandidat za
 * rucnu provjeru. NIJE Turnitin-razina alata (nema fuzzy/sinonim usporedbe) - hvata samo
 * blisko-doslovno podudaranje i daje lazne pozitivce za formulaicne/standardne fraze (nazivi
 * normi, standardne recenice iz propisa). Preklapanje NIJE samo po sebi plagijat: ako je odlomak
 * vec oznacen kao citat (navodnici + referenca odmah uz njega), to je ocekivano i u redu - alat
 * to samo istice da provjeris je li oznaka doista prisutna.
 */

export interface SourceOverlapOptions {
  n?: number;
  minParagraphWords?: number;
  minOverlapCount?: number;
}

export interface SourceOverlapBestMatch {
  sourceFileName: string;
  overlapCount: number;
  sampleNgram: string;
}

export interface SourceOverlapFinding {
  paragraphIndex: number;
  excerpt: string;
  looksMarked: boolean;
  bestMatch: SourceOverlapBestMatch | null;
  flagged: boolean;
}

export interface SourceOverlapReport {
  version: 1;
  paragraphsScanned: number;
  sourceFilesUsed: number;
  findings: SourceOverlapFinding[];
  flaggedCount: number;
}

// Sentinel koji se NE moze pojaviti u izlazu wordsOf (koji hvata samo slova), koristi se za
// spajanje rijeci u n-gram kljuc - obican join('') bi kolidirao (npr. "ab"+"c" === "a"+"bc").
// String.fromCharCode (ne doslovni escape literal) da izbjegnemo dvosmislenost kodiranja izvora.
const NGRAM_SEP = String.fromCharCode(1);

/** Rijeci (samo slova, hrvatska dijakritika ukljucena) iz teksta, malim slovima. */
export function wordsOf(text: string): string[] {
  return String(text || '').toLowerCase().match(/[a-zčćžšđ]+/g) || [];
}

/** Skup n-grama kao spojeni string-kljucevi (JS Set nema strukturnu jednakost za nizove/tuple). */
export function ngramKeySet(words: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(NGRAM_SEP));
  return out;
}

// LITERATURA i dalje se ne skenira (bibliografski zapisi se OCEKIVANO poklapaju s izvorima).
const LIT_HEADING_RE = /^\s*(?:\d+\.?\s*)?(LITERATURA|POPIS LITERATURE|REFERENCE|BIBLIOGRAFIJA|POPIS IZVORA|IZVORI)\s*$/i;

// NAPOMENA (adaptacija Python izvornika): Python `\w` u `[\wčćžšđ\-]` je Unicode-svjestan (vec
// hvata malu dijakritiku), pa je eksplicitno navodjenje čćžšđ ondje tehnicki suvisno. JS `\w` je
// UVIJEK ASCII-only, pa ovdje MORA eksplicitno navesti slova - inace bi hrvatski autor s
// dijakritikom u prezimenu (npr. "Ćosić") tiho prekinuo prepoznavanje citatne oznake.
const CITATION_MARK_RE = /\[\d+[\d,\s–-]*\]|\([A-ZČĆŠŽĐ][A-Za-z0-9čćžšđČĆŽŠĐ_-]+.{0,60}?\d{4}[a-z]?\)/;

/** Gruba provjera: ima li odlomak navodnike I referencu (citat/broj-godina) u blizini. */
export function looksMarkedAsQuote(text: string): boolean {
  const t = String(text || '');
  const hasQuotes = t.includes('„') || t.includes('“') || t.includes('"');
  const hasCitation = CITATION_MARK_RE.test(t);
  return hasQuotes && hasCitation;
}

const EXCERPT_MAX = 100;
function snip(s: string, n = EXCERPT_MAX): string {
  const t = String(s ?? '').trim();
  return t.length > n ? t.slice(0, n).trimEnd() : t;
}

/**
 * Usporedi odlomke rada (>= minParagraphWords rijeci, prije LITERATURA sekcije) s n-gram skupom
 * svakog izvora; prijavi odlomke ciji je najbolji poklapajuci izvor >= minOverlapCount n-grama.
 */
export function buildSourceOverlapReport(
  thesisParagraphs: Array<{ index: number; text: string }>,
  sourceDocs: Array<{ fileName: string; paragraphs: string[] }>,
  options: SourceOverlapOptions = {},
): SourceOverlapReport {
  const n = options.n ?? 8;
  const minParagraphWords = options.minParagraphWords ?? 15;
  const minOverlapCount = options.minOverlapCount ?? 2;

  const sourceNgrams = sourceDocs
    .map((s) => ({ fileName: s.fileName, ngrams: ngramKeySet(wordsOf(s.paragraphs.join(' ')), n) }))
    .filter((s) => s.ngrams.size > 0);

  const findings: SourceOverlapFinding[] = [];
  let paragraphsScanned = 0;
  let inLit = false;

  for (const p of thesisParagraphs) {
    const raw = p.text || '';
    if (LIT_HEADING_RE.test(raw.trim())) inLit = true;
    if (inLit) continue;

    const words = wordsOf(raw);
    if (words.length < minParagraphWords) continue;
    paragraphsScanned++;

    const pn = ngramKeySet(words, n);
    if (!pn.size || !sourceNgrams.length) continue;

    let best: SourceOverlapBestMatch | null = null;
    for (const s of sourceNgrams) {
      let count = 0;
      let sampleKey: string | null = null;
      for (const key of pn) {
        if (s.ngrams.has(key)) {
          count++;
          if (!sampleKey) sampleKey = key;
        }
      }
      if (!best || count > best.overlapCount) {
        best = { sourceFileName: s.fileName, overlapCount: count, sampleNgram: sampleKey ? sampleKey.split(NGRAM_SEP).join(' ') : '' };
      }
    }

    if (best && best.overlapCount >= minOverlapCount) {
      const marked = looksMarkedAsQuote(raw);
      findings.push({
        paragraphIndex: p.index,
        excerpt: snip(raw),
        looksMarked: marked,
        bestMatch: best,
        flagged: !marked,
      });
    }
  }

  return {
    version: 1,
    paragraphsScanned,
    sourceFilesUsed: sourceNgrams.length,
    findings,
    flaggedCount: findings.filter((f) => f.flagged).length,
  };
}
