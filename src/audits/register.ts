/**
 * Deterministicka provjera akademskog registra i jasnoce hrvatskog teksta (Faza 3, odluka B).
 *
 * READ-ONLY i NE-GENERATIVNA: samo oznacava (duge recenice, "od strane", kolokvijalizmi, prvo
 * lice), NIKAD ne prepisuje tekst ni ne ocjenjuje argument. Nalazi su INFORMATIVNI: forma
 * izraza, ne sadrzaj, i NE ulaze u bodovnu ocjenu (VISION.md carve-out, integritetska granica).
 *
 * Namjerno konzervativno (nizak false-positive): flag je poziv na provjeru, ne presuda. Prvo
 * lice je nudge "provjeri uputu kolegija" jer bezlicnost ovisi o profilu, a Lekta ne izmislja
 * pravila. Radi lokalno nad odlomcima, kao typoLint; details.registerLint se ne salje na mrezu
 * (sanitizeAnalysisResult zadrzava samo whitelist polja).
 *
 * Granice rijeci ne koriste lookbehind (Safari < 16.4): vodeca granica je grupa 1
 * (^|ne-slovo), termin je grupa 2, prateca granica je lookahead (ne trosi znak, pa susjedni
 * termini rade). \b se namjerno izbjegava jer je ASCII i pada pred hrvatskom dijakritikom.
 */

export interface RegisterFinding {
  paragraphIndex: number;
  kind: string;
  excerpt: string;
  suggestion: string;
  /** Samo za agregatne nalaze (prvo lice): broj pojava u dokumentu. */
  count?: number;
}

// Nazivi provjera (kind): stabilni hrvatski identifikatori.
export const KIND_DUGA_RECENICA = 'duga-recenica';
export const KIND_OD_STRANE = 'od-strane';
export const KIND_KOLOKVIJALIZAM = 'kolokvijalizam';
export const KIND_PRVO_LICE = 'prvo-lice';

/** Prag duge recenice u rijecima (iznad = signal za jasnocu). */
const LONG_SENTENCE_WORDS = 40;

const EXCERPT_RADIUS = 24;
const EXCERPT_MAX = 70;

/** Kolokvijalni izraz -> formalnija zamjena (svi kljucevi su mala slova, bez dijakritike). */
const COLLOQUIAL: Record<string, string> = {
  puno: 'mnogo',
  skroz: 'potpuno / posve',
  super: 'izvrsno / vrlo dobro',
  ful: 'vrlo / mnogo',
  ekstra: 'iznimno',
  okej: 'u redu',
  recimo: 'primjerice / na primjer',
  'u biti': 'zapravo / u osnovi',
  'vezano uz': 'u vezi s',
  'vezano za': 'u vezi s',
};

/** Nedvosmisleni markeri prvog lica jednine (opreza radi malen skup). */
const FIRST_PERSON_VERBS = ['smatram', 'mislim', 'vjerujem', 'držim', 'zaključujem'];

function excerptAt(text: string, index: number, length: number): string {
  const start = Math.max(0, index - EXCERPT_RADIUS);
  const end = Math.min(text.length, index + length + EXCERPT_RADIUS);
  let ex = text.slice(start, end).trim();
  if (ex.length > EXCERPT_MAX) ex = ex.slice(0, EXCERPT_MAX).trimEnd();
  return ex;
}

/** Grubo cijepanje na recenice bez lookbehind: niz znakova do ukljucivo terminatora. */
function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]*/g) || []).map((s) => s.trim()).filter(Boolean);
}

function wordCount(s: string): number {
  return (s.match(/[\p{L}\p{N}]+/gu) || []).length;
}

// 1. Duge recenice (jasnoca): recenica iznad praga je tesko citljiva.
function checkLongSentences(p: string, pi: number, out: RegisterFinding[]): void {
  for (const s of sentences(p)) {
    const wc = wordCount(s);
    if (wc > LONG_SENTENCE_WORDS) {
      out.push({
        paragraphIndex: pi,
        kind: KIND_DUGA_RECENICA,
        excerpt: s.length > EXCERPT_MAX ? s.slice(0, EXCERPT_MAX).trimEnd() : s,
        suggestion: `recenica ima ${wc} rijeci; razmisli o dijeljenju na krace radi jasnoce`,
      });
    }
  }
}

// 2. "od strane": birokratska pasivna konstrukcija koju stilski prirucnici odvracaju.
function checkOdStrane(p: string, pi: number, out: RegisterFinding[]): void {
  const re = /(^|[^\p{L}\p{N}])(od strane)(?=$|[^\p{L}\p{N}])/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p)) !== null) {
    const at = m.index + m[1].length;
    out.push({
      paragraphIndex: pi,
      kind: KIND_OD_STRANE,
      excerpt: excerptAt(p, at, m[2].length),
      suggestion: 'izbjegavaj "od strane"; koristi aktivnu recenicu ili instrumental (npr. "napisao je autor")',
    });
  }
}

// 3. Kolokvijalizmi: razgovorni izrazi izvan akademskog registra.
function checkColloquial(p: string, pi: number, out: RegisterFinding[]): void {
  const terms = Object.keys(COLLOQUIAL).join('|');
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${terms})(?=$|[^\\p{L}\\p{N}])`, 'giu');
  let m: RegExpExecArray | null;
  while ((m = re.exec(p)) !== null) {
    const at = m.index + m[1].length;
    const better = COLLOQUIAL[m[2].toLowerCase()];
    out.push({
      paragraphIndex: pi,
      kind: KIND_KOLOKVIJALIZAM,
      excerpt: excerptAt(p, at, m[2].length),
      suggestion: better ? `razgovorni izraz "${m[2]}"; formalnije: ${better}` : `razgovorni izraz "${m[2]}"`,
    });
  }
}

// 4. Prvo lice jednine: jedan agregatni nalaz (nudge). Bezlicnost ovisi o uputi kolegija, pa
//    ne proglasavamo pogreskom nego pozivamo na provjeru. Konzervativno: samo jasni markeri.
function checkFirstPerson(paragraphs: string[], out: RegisterFinding[]): void {
  const re = new RegExp(
    `(^|[^\\p{L}\\p{N}])((?:${FIRST_PERSON_VERBS.join('|')})|\\p{L}+(?:o|la) sam)(?=$|[^\\p{L}\\p{N}])`,
    'giu',
  );
  let count = 0;
  let firstPi = -1;
  let firstExcerpt = '';
  paragraphs.forEach((p, pi) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(p)) !== null) {
      count += 1;
      if (firstPi < 0) {
        firstPi = pi;
        firstExcerpt = excerptAt(p, m.index + m[1].length, m[2].length);
      }
    }
  });
  if (count > 0) {
    out.push({
      paragraphIndex: firstPi,
      kind: KIND_PRVO_LICE,
      excerpt: firstExcerpt,
      count,
      suggestion: `prvo lice jednine (${count} ${count === 1 ? 'mjesto' : 'mjesta'}); mnoge upute traze bezlicni ili trece lice, provjeri uputu kolegija`,
    });
  }
}

/** Pokrece sve provjere registra nad odlomcima; nalazi sortirani po indeksu odlomka. */
export function registerLint(paragraphs: string[]): RegisterFinding[] {
  const out: RegisterFinding[] = [];
  paragraphs.forEach((p, pi) => {
    checkLongSentences(p, pi, out);
    checkOdStrane(p, pi, out);
    checkColloquial(p, pi, out);
  });
  checkFirstPerson(paragraphs, out);
  out.sort((a, b) => a.paragraphIndex - b.paragraphIndex);
  return out;
}

/** Sazetak nalaza: ukupan broj i raspodjela po vrsti provjere. */
export function registerLintSummary(findings: RegisterFinding[]): { total: number; byKind: Record<string, number> } {
  const byKind: Record<string, number> = {};
  for (const f of findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  return { total: findings.length, byKind };
}
