/**
 * Savjetodavni "submission" linter: dodatne INFORMATIVNE provjere cestih studentskih gresaka koje
 * NE ulaze u bodovnu ocjenu (kao typoLint/registerLint). Cist, bez DOM-a, bez mreze, testabilan.
 * Rezultat ide u `details.submissionLint`; golden-normalize ga NE snapshota pa golden ostaje netaknut.
 *
 * Pokriva:
 *  - naslov zavrsava tockom;
 *  - izravni citat bez broja stranice (ISPRAVAN detektor: godina citata NIJE broj stranice);
 *  - gola poveznica u tijelu (izvan literature);
 *  - jedinica literature bez godine (moguce nepotpuna; scored engine je spaja u prethodnu jedinicu);
 *  - slika/tablica koja se ne spominje u tekstu; nedosljedno/preskoceno numeriranje slika/tablica;
 *  - NESKLAD autor-godina izmedju teksta i literature (jak lokalni signal izmisljene/nemarne reference);
 *  - nevaljan ISBN (kontrolna znamenka) / DOI (oblik); godina u buducnosti; duplikat u literaturi.
 *
 * POSTENO: sve je heuristika i poziv na provjeru, ne presuda. POSTOJANJE reference se NE moze potvrditi
 * lokalno (to trazi mrezu; vidi docs/design/citation-existence-verification.md za opt-in online dizajn).
 * Konzervativno, nizak false-positive.
 */
import { normalize } from '../utils/helpers';

export type SubmissionSeverity = 'error' | 'warning' | 'info';

export interface SubmissionFinding {
  /** 1-based indeks odlomka; 0 kad nalaz nije vezan uz konkretan odlomak. */
  paragraphIndex: number;
  kind: string;
  severity: SubmissionSeverity;
  excerpt: string;
  message: string;
}

export interface SubmissionParagraph {
  index: number;
  text: string;
  headingLevel: number | null;
}
export interface SubmissionCitation {
  author: string;
  year: string;
  p: number;
  raw?: string;
}
export interface SubmissionReference {
  text: string;
  author: string;
  year: string;
  p: number;
}

export interface SubmissionLintInput {
  paragraphs: SubmissionParagraph[];
  citations: SubmissionCitation[];
  references: SubmissionReference[];
  /** 1-based indeks odlomka naslova "Literatura" (entries su iza njega); <=0 ako popisa nema. */
  referencesStart: number;
  language: string;
  currentYear: number;
}

export const KIND_NASLOV_TOCKA = 'naslov-zavrsava-tockom';
export const KIND_CITAT_BEZ_LOKATORA = 'izravni-citat-bez-stranice';
export const KIND_GOLA_POVEZNICA = 'gola-poveznica-u-tekstu';
export const KIND_REFERENCA_BEZ_GODINE = 'referenca-bez-godine';
export const KIND_ELEMENT_BEZ_REFERENCE = 'element-bez-reference-u-tekstu';
export const KIND_ELEMENT_NUMERIRANJE = 'nedosljedno-numeriranje-elemenata';
export const KIND_AUTOR_GODINA_NESKLAD = 'autor-godina-nesklad';
export const KIND_NEVALJAN_ISBN = 'nevaljan-isbn';
export const KIND_NEVALJAN_DOI = 'nevaljan-doi';
export const KIND_BUDUCA_GODINA = 'godina-u-buducnosti';
export const KIND_DUPLIKAT_REFERENCE = 'duplikat-u-literaturi';

export const SUBMISSION_LABELS_HR: Record<string, string> = {
  [KIND_NASLOV_TOCKA]: 'Naslov završava točkom',
  [KIND_CITAT_BEZ_LOKATORA]: 'Izravni citat bez broja stranice',
  [KIND_GOLA_POVEZNICA]: 'Gola poveznica u tekstu',
  [KIND_REFERENCA_BEZ_GODINE]: 'Jedinica literature bez godine',
  [KIND_ELEMENT_BEZ_REFERENCE]: 'Slika ili tablica se ne spominje u tekstu',
  [KIND_ELEMENT_NUMERIRANJE]: 'Nedosljedno numeriranje slika ili tablica',
  [KIND_AUTOR_GODINA_NESKLAD]: 'Godina citata ne odgovara literaturi',
  [KIND_NEVALJAN_ISBN]: 'Neispravan ISBN',
  [KIND_NEVALJAN_DOI]: 'Neispravan DOI',
  [KIND_BUDUCA_GODINA]: 'Godina u budućnosti',
  [KIND_DUPLIKAT_REFERENCE]: 'Ponovljena jedinica u literaturi',
};

const EXCERPT_MAX = 80;
function snip(s: string, n = EXCERPT_MAX): string {
  const t = String(s ?? '').trim();
  return t.length > n ? t.slice(0, n).trimEnd() : t;
}
function stripYearSuffix(y: unknown): string {
  return String(y ?? '').replace(/[a-z]$/i, '');
}

// --- Element (slika/tablica) tipizacija -------------------------------------------------------
// Kanonski tip + stem za trazenje spominjanja u tekstu (hrvatska deklinacija: "Slici 2", "Sliku 2").
const ELEMENT_TYPES: Array<{ re: RegExp; canon: string; label: string; stem: string }> = [
  { re: /^tablic/i, canon: 'tablica', label: 'Tablica', stem: 'tablic' },
  { re: /^table/i, canon: 'tablica', label: 'Table', stem: 'table' },
  { re: /^grafikon/i, canon: 'grafikon', label: 'Grafikon', stem: 'grafikon' },
  { re: /^(slik|figure|chart)/i, canon: 'slika', label: 'Slika', stem: 'slik' },
];
function elementInfo(word: string): { canon: string; label: string; stem: string } | null {
  for (const e of ELEMENT_TYPES) if (e.re.test(word)) return { canon: e.canon, label: e.label, stem: e.stem };
  return null;
}

// 1. Naslov zavrsava tockom (naslovi u pravilu ne zavrsavaju tockom). Vodece numeriranje se skida.
function checkHeadingPeriod(paras: SubmissionParagraph[], out: SubmissionFinding[]): void {
  for (const p of paras) {
    if (!p.headingLevel) continue;
    const t = (p.text || '').trim();
    const body = t.replace(/^\s*(?:[IVXLCDM]+|\d+(?:\.\d+)*)\.?\s+/i, '').trim();
    if (body.length > 2 && /\.$/.test(body) && !/\.\.\.$/.test(body)) {
      out.push({
        paragraphIndex: p.index,
        kind: KIND_NASLOV_TOCKA,
        severity: 'info',
        excerpt: snip(t, 60),
        message: 'Naslovi se u pravilu ne pišu s točkom na kraju.',
      });
    }
  }
}

// 2. Izravni citat bez broja stranice. ISPRAVNO: godina citatnice ("(Kovac, 2018)") NIJE broj
//    stranice. Lokator = eksplicitni marker (str./s./p./pp./:) ILI broj razlicit od godine.
function checkDirectQuoteLocator(paras: SubmissionParagraph[], out: SubmissionFinding[]): void {
  const quoteRe = /[„“”"]([^„“”"]{8,})[„“”"]/;
  const citeRe = /\(([^)]*\b(?:18|19|20)\d{2}[a-z]?[^)]*)\)/g;
  for (const p of paras) {
    const t = p.text || '';
    if (!quoteRe.test(t)) continue;
    citeRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    let flagged = false;
    while ((m = citeRe.exec(t)) !== null) {
      const inner = m[1];
      const hasPageMarker = /(?:\bstr|\bs|\bpp?|\bf)\.?\s*\d/i.test(inner) || /:\s*\d/.test(inner);
      const nums: string[] = inner.match(/\d{1,4}/g) || [];
      const years: string[] = inner.match(/(?:18|19|20)\d{2}/g) || [];
      const hasNonYearNumber = nums.some((n) => !years.includes(n));
      if (!hasPageMarker && !hasNonYearNumber) flagged = true;
    }
    if (flagged) {
      out.push({
        paragraphIndex: p.index,
        kind: KIND_CITAT_BEZ_LOKATORA,
        severity: 'warning',
        excerpt: snip(t),
        message: 'Izravni (doslovni) navod treba broj stranice, npr. (Kovač, 2018, str. 45).',
      });
    }
  }
}

// 3. Gola poveznica u TIJELU (izvan literature): URL-ovi idu u literaturu/fusnotu, ne u tekst.
function checkBareUrl(paras: SubmissionParagraph[], out: SubmissionFinding[], referencesStart: number): void {
  const urlRe = /(?:https?:\/\/|www\.)[^\s)]+/i;
  for (const p of paras) {
    if (p.headingLevel) continue;
    if (referencesStart > 0 && p.index >= referencesStart) continue; // literatura smije imati URL
    const m = (p.text || '').match(urlRe);
    if (m) {
      out.push({
        paragraphIndex: p.index,
        kind: KIND_GOLA_POVEZNICA,
        severity: 'info',
        excerpt: snip(m[0], 60),
        message: 'Poveznice u pravilu idu u popis literature ili fusnotu, ne gole u tekst.',
      });
    }
  }
}

// 4. Jedinica literature bez godine (moguce nepotpuna). Scored engine takav redak SPOJI u prethodnu
//    jedinicu (nastavak reference), pa ga inace ne vidimo. Konzervativno: redak IZGLEDA kao nova
//    jedinica (pocinje velikim prezimenom + zarez/tocka), a nema godinu ni "b.g."/"n.d.".
function checkRefNoYear(paras: SubmissionParagraph[], out: SubmissionFinding[], referencesStart: number): void {
  if (referencesStart <= 0) return;
  for (const p of paras) {
    if (p.index <= referencesStart || p.headingLevel) continue;
    const t = (p.text || '').trim();
    if (t.length < 20) continue;
    const looksLikeEntry = /^\p{Lu}[\p{L}'’-]+\s*[,.]/u.test(t);
    const hasYear = /\((?:b\.g\.|n\.d\.|bez\s+godine)\)|\b(?:18|19|20)\d{2}[a-z]?\b/i.test(t);
    if (looksLikeEntry && !hasYear) {
      out.push({
        paragraphIndex: p.index,
        kind: KIND_REFERENCA_BEZ_GODINE,
        severity: 'warning',
        excerpt: snip(t, 70),
        message: 'Jedinica literature nema godinu izdanja (moguće nepotpuna ili spojena s prethodnom).',
      });
    }
  }
}

// 5. Slike/tablice: (a) numeriranje nije uzastopno od 1 (preskok/duplikat); (b) element se ne spominje
//    u tekstu (svaka slika/tablica treba biti navedena u prozi, npr. "kao što prikazuje Slika 2").
function checkElements(paras: SubmissionParagraph[], out: SubmissionFinding[]): void {
  const typeRe = /^(slika|tablica|grafikon|figure|table|chart)\s+(\d+)/i;
  const captions: Array<{ canon: string; label: string; stem: string; num: number; index: number }> = [];
  for (const p of paras) {
    const m = (p.text || '').trim().match(typeRe);
    if (!m) continue;
    const info = elementInfo(m[1]);
    if (info) captions.push({ ...info, num: Number(m[2]), index: p.index });
  }
  if (!captions.length) return;

  const byType = new Map<string, typeof captions>();
  for (const c of captions) {
    const list = byType.get(c.canon);
    if (list) list.push(c);
    else byType.set(c.canon, [c]);
  }

  for (const list of byType.values()) {
    const nums = list.map((c) => c.num);
    const sorted = [...nums].sort((a, b) => a - b);
    let broken = sorted[0] !== 1;
    for (let i = 1; i < sorted.length; i++) if (sorted[i] !== sorted[i - 1] + 1) broken = true; // preskok ILI duplikat
    if (broken) {
      out.push({
        paragraphIndex: list[0].index,
        kind: KIND_ELEMENT_NUMERIRANJE,
        severity: 'info',
        excerpt: `${list[0].label}: ${sorted.join(', ')}`,
        message: `Numeriranje (${list[0].label.toLowerCase()}) nije uzastopno od 1 (preskočen ili ponovljen broj).`,
      });
    }
    for (const c of list) {
      const ref = new RegExp(`(?:^|[^\\p{L}])${c.stem}\\p{L}*\\s*0*${c.num}(?![\\p{N}])`, 'iu');
      const mentioned = paras.some((p) => p.index !== c.index && ref.test(p.text || ''));
      if (!mentioned) {
        out.push({
          paragraphIndex: c.index,
          kind: KIND_ELEMENT_BEZ_REFERENCE,
          severity: 'info',
          excerpt: `${c.label} ${c.num}`,
          message: `${c.label} ${c.num} se ne spominje u tekstu; svaku sliku/tablicu treba navesti u prozi.`,
        });
      }
    }
  }
}

// 6. NESKLAD autor-godina: u tekstu "(Horvat, 2020)", a u literaturi ISTO prezime s DRUGOM godinom.
//    Jak lokalni signal izmisljene/nemarne reference (i LLM-halucinacija). Ako autora UOPCE nema u
//    literaturi, to je "missing" (scored engine), ne nesklad.
function checkAuthorYearMismatch(
  citations: SubmissionCitation[],
  references: SubmissionReference[],
  out: SubmissionFinding[],
): void {
  const refYears = new Map<string, Set<string>>();
  for (const r of references) {
    if (!r.author || !r.year) continue;
    const a = normalize(r.author);
    if (!a) continue;
    if (!refYears.has(a)) refYears.set(a, new Set());
    refYears.get(a)!.add(stripYearSuffix(r.year));
  }
  const seen = new Set<string>();
  for (const c of citations) {
    if (!c.author || !c.year) continue;
    const a = normalize(c.author);
    const years = refYears.get(a);
    if (!years || !years.size) continue; // autor nije u literaturi -> "missing", ne nesklad
    const cy = stripYearSuffix(c.year);
    if (years.has(cy)) continue;
    const key = `${a}|${cy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      paragraphIndex: c.p,
      kind: KIND_AUTOR_GODINA_NESKLAD,
      severity: 'warning',
      excerpt: snip(c.raw || `${c.author} ${c.year}`, 60),
      message: `U tekstu ${c.author} (${c.year}), a u literaturi ${c.author} (${[...years].join(' / ')}). Provjeri godinu.`,
    });
  }
}

// 7. Nevaljan ISBN (kontrolna znamenka) i nevaljan DOI (oblik 10.xxxx/...).
function isbnValid(raw: string): boolean {
  const s = raw.replace(/[^0-9Xx]/g, '');
  if (s.length === 10) {
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      const c = s[i];
      const v = c === 'X' || c === 'x' ? 10 : Number(c);
      if (Number.isNaN(v)) return false;
      sum += v * (10 - i);
    }
    return sum % 11 === 0;
  }
  if (s.length === 13) {
    let sum = 0;
    for (let i = 0; i < 13; i++) {
      const v = Number(s[i]);
      if (Number.isNaN(v)) return false;
      sum += v * (i % 2 === 0 ? 1 : 3);
    }
    return sum % 10 === 0;
  }
  return false;
}
function checkIsbnDoi(references: SubmissionReference[], out: SubmissionFinding[]): void {
  for (const r of references) {
    const t = r.text || '';
    const isbnM = t.match(/ISBN[:\s]*((?:97[89][\s-]?)?[\d][\d\s-]{7,15}[\dXx])/i);
    if (isbnM && !isbnValid(isbnM[1])) {
      out.push({
        paragraphIndex: r.p,
        kind: KIND_NEVALJAN_ISBN,
        severity: 'warning',
        excerpt: snip(isbnM[0], 40),
        message: 'ISBN kontrolna znamenka ne odgovara (greška u prijepisu ili nepostojeći izvor).',
      });
    }
    const doiM = t.match(/\bdoi:\s*(\S+)/i);
    if (doiM && !/^(?:https?:\/\/(?:dx\.)?doi\.org\/)?10\.\d{4,9}\/\S+/i.test(doiM[1])) {
      out.push({
        paragraphIndex: r.p,
        kind: KIND_NEVALJAN_DOI,
        severity: 'warning',
        excerpt: snip(doiM[0], 40),
        message: 'DOI ne odgovara obliku 10.xxxx/... (provjeri ili je izmišljen).',
      });
    }
  }
}

// 8. Godina u buducnosti (> tekuca): u referenci ili citatnici.
function checkFutureYear(
  references: SubmissionReference[],
  citations: SubmissionCitation[],
  out: SubmissionFinding[],
  currentYear: number,
): void {
  const seen = new Set<string>();
  const emit = (year: string, p: number, ex: string) => {
    const y = Number(stripYearSuffix(year));
    if (!Number.isFinite(y) || y <= currentYear) return;
    const k = `${p}|${y}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({
      paragraphIndex: p,
      kind: KIND_BUDUCA_GODINA,
      severity: 'warning',
      excerpt: snip(ex, 50),
      message: `Godina ${y} je u budućnosti; provjeri je li ispravna.`,
    });
  };
  for (const r of references) if (r.year) emit(r.year, r.p, r.text || '');
  for (const c of citations) if (c.year) emit(c.year, c.p, c.raw || `${c.author} ${c.year}`);
}

// 9. Duplikat u literaturi: dvije jedinice s prakticno istim tekstom.
function checkDuplicateRefs(references: SubmissionReference[], out: SubmissionFinding[]): void {
  const seen = new Set<string>();
  for (const r of references) {
    const key = normalize(r.text || '').slice(0, 80);
    if (key.length < 20) continue;
    if (seen.has(key)) {
      out.push({
        paragraphIndex: r.p,
        kind: KIND_DUPLIKAT_REFERENCE,
        severity: 'info',
        excerpt: snip(r.text || '', 60),
        message: 'Jedinica se ponavlja u popisu literature.',
      });
    } else seen.add(key);
  }
}

/** Pokrece sve savjetodavne provjere; nalazi sortirani po indeksu odlomka. */
export function submissionLint(input: SubmissionLintInput): SubmissionFinding[] {
  const out: SubmissionFinding[] = [];
  const paras = input.paragraphs || [];
  checkHeadingPeriod(paras, out);
  checkDirectQuoteLocator(paras, out);
  checkBareUrl(paras, out, input.referencesStart);
  checkRefNoYear(paras, out, input.referencesStart);
  checkElements(paras, out);
  checkAuthorYearMismatch(input.citations || [], input.references || [], out);
  checkIsbnDoi(input.references || [], out);
  checkFutureYear(input.references || [], input.citations || [], out, input.currentYear);
  checkDuplicateRefs(input.references || [], out);
  out.sort((a, b) => a.paragraphIndex - b.paragraphIndex);
  return out;
}

/** Sazetak: ukupan broj i raspodjela po vrsti. */
export function submissionLintSummary(findings: SubmissionFinding[]): { total: number; byKind: Record<string, number> } {
  const byKind: Record<string, number> = {};
  for (const f of findings) byKind[f.kind] = (byKind[f.kind] || 0) + 1;
  return { total: findings.length, byKind };
}
