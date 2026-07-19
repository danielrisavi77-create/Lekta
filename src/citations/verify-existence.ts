/**
 * Opt-in ONLINE provjera POSTOJANJA reference (protiv AI-izmisljenih citata).
 *
 * Salje SAMO strukturiranu referencu (autor, naslov, DOI, godina) javnom CrossRef REST API-ju;
 * naslov i tijelo korisnikovog rada se NIKAD ne salju. Okida se iskljucivo eksplicitnim klikom
 * (vidi citat-page.ts), uz vidljivu disclosure. Isti razred mreznog poziva kao fillFromDoi.
 *
 * POSTENO (kao lekta-pipeline m2_references.py): ishod je "nije pronadjeno u CrossRef", NIKAD
 * "izmisljeno". Domaci izvori (Hrcak/Dabar) cesto nisu u CrossRef-u pa se not-found za njih spusta
 * na 'not-indexed' (poziv na rucnu provjeru), da se legitiman domaci izvor ne proglasi laznim.
 *
 * Core (URL gradnja, slicnost naslova, verdikt iz kandidata) je CIST i mrezno-neovisan; mrezni
 * fetch je INJEKTIRAN (`fetchImpl`) pa je sve testabilno bez prave mreze.
 */
import type { CitationInput } from '../tools/citation';
import { normalize } from '../utils/helpers';

export type ExistenceVerdict = 'found' | 'weak' | 'not-found' | 'not-indexed' | 'unchecked';

export interface ExistenceResult {
  verdict: ExistenceVerdict;
  /** Slicnost najboljeg CrossRef pogotka (0..1), kad je isla bibliografska pretraga. */
  score?: number;
  /** Naslov najboljeg pogotka (za prikaz "podudara se s..."). */
  matchedTitle?: string;
  /** true kad je DOI razrijesen (200) kroz CrossRef works/<doi>. */
  doiResolved?: boolean;
}

// Pragovi uskladjeni s m2_references.py (isti CrossRef bibliografski put): >=0.80 pouzdano, >=0.60 slab.
const FOUND_MIN = 0.8;
const WEAK_MIN = 0.6;

const CROSSREF_BASE = 'https://api.crossref.org/works';

// Domaci tragovi (mirror m2_references.py CRO_HINTS): kad not-found, a referenca izgleda domace,
// ishod je 'not-indexed' (CrossRef ne indeksira vecinu hrvatskih izvora), ne "nije pronadjeno".
const CRO_HINTS = [
  'zavrsni rad', 'diplomski rad', 'disertacija', 'sveuciliste', 'veleuciliste',
  'zagreb', 'rijeka', 'osijek', 'split', 'pula', 'mostar',
  'vjesnik', 'glasnik', 'zbornik', 'medix', 'socijalna psihijatrija', 'mostariensia',
];

/** Normaliziran DOI (goli, bez https://doi.org/ i doi: prefiksa). Reuse obrasca iz citation.ts. */
export function normalizeDoi(doi: string | undefined): string {
  return (doi || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '').replace(/[.,;]+$/, '');
}

/** Slaze citirajucu referencu izgleda "domace" (Hrcak/Dabar/hrvatski izdavac/grad). */
export function looksCroatian(inp: Partial<CitationInput>): boolean {
  const hay = [inp.title, inp.container, inp.publisher, inp.place, inp.institution]
    .filter(Boolean).join(' ')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  return CRO_HINTS.some((h) => hay.includes(h));
}

// Znakovni bigrami (multiskup) normaliziranog niza. normalize() vec skida dijakritiku i sve osim [a-z0-9].
function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** Dice koeficijent nad znakovnim bigramima; deterministicno, 0..1. Kratki/jednaki nizovi: egzaktno. */
export function titleSimilarity(a: string | undefined, b: string | undefined): number {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return na === nb ? 1 : 0;
  const ba = bigrams(na), bb = bigrams(nb);
  const counts = new Map<string, number>();
  for (const g of ba) counts.set(g, (counts.get(g) || 0) + 1);
  let inter = 0;
  for (const g of bb) {
    const c = counts.get(g) || 0;
    if (c > 0) { inter++; counts.set(g, c - 1); }
  }
  return (2 * inter) / (ba.length + bb.length);
}

/** CrossRef works/<doi> URL (razrjesavanje DOI-ja). */
export function crossrefWorksUrl(doi: string): string {
  return `${CROSSREF_BASE}/${encodeURIComponent(normalizeDoi(doi))}`;
}

/** CrossRef bibliografski upit iz strukturirane reference (NE salje tijelo rada). */
export function crossrefQueryUrl(inp: Partial<CitationInput>, mailto?: string): string {
  const biblio = [inp.title, inp.authors, inp.year, inp.container].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const params = new URLSearchParams();
  params.set('query.bibliographic', biblio);
  params.set('rows', '5');
  params.set('select', 'title,author,issued,DOI');
  if (mailto) params.set('mailto', mailto);
  return `${CROSSREF_BASE}?${params.toString()}`;
}

// --- Verdikt iz CrossRef kandidata (cisto) ------------------------------------

interface CrossrefItem {
  title?: string[];
  issued?: { 'date-parts'?: number[][] };
  DOI?: string;
}

function itemYear(item: CrossrefItem): number | null {
  const y = item?.issued?.['date-parts']?.[0]?.[0];
  return typeof y === 'number' ? y : null;
}

/** Slicnost naslova + mali bonus kad se godina poklapa (+-1); rezultat 0..1. */
export function scoreCandidate(inp: Partial<CitationInput>, item: CrossrefItem): number {
  const sim = titleSimilarity(inp.title, item?.title?.[0]);
  const iy = itemYear(item), refY = parseInt(String(inp.year || ''), 10);
  const yearOk = !!iy && !!refY && Math.abs(iy - refY) <= 1;
  return Math.min(1, sim + (yearOk ? 0.05 : 0));
}

/** Najbolji kandidat -> verdikt (found/weak/not-found). looksCroatian spust ide u verifyReference. */
export function verdictFromCandidates(
  inp: Partial<CitationInput>,
  items: CrossrefItem[],
): { verdict: 'found' | 'weak' | 'not-found'; score: number; matchedTitle?: string } {
  if (!inp.title) return { verdict: 'not-found', score: 0 };
  let best: CrossrefItem | null = null, bestScore = 0;
  for (const it of items || []) {
    const s = scoreCandidate(inp, it);
    if (s > bestScore) { bestScore = s; best = it; }
  }
  const matchedTitle = best?.title?.[0];
  if (bestScore >= FOUND_MIN) return { verdict: 'found', score: bestScore, matchedTitle };
  if (bestScore >= WEAK_MIN) return { verdict: 'weak', score: bestScore, matchedTitle };
  return { verdict: 'not-found', score: bestScore, matchedTitle };
}

// --- Mrezna provjera (fetch injektiran) ---------------------------------------

type FetchImpl = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<any>;
}>;

export interface VerifyOptions {
  fetchImpl?: FetchImpl;
  signal?: AbortSignal;
  mailto?: string;
}

/** Provjeri jednu referencu. DOI -> works/<doi> (200 found / 404 not-found); inace bibliografski upit.
 *  Mrezna greska/abort -> 'unchecked' (nikad lazna sigurnost). */
export async function verifyReference(inp: Partial<CitationInput>, opts: VerifyOptions = {}): Promise<ExistenceResult> {
  const fetchImpl = opts.fetchImpl || (globalThis.fetch as unknown as FetchImpl);
  if (!fetchImpl) return { verdict: 'unchecked' };
  const headers = { Accept: 'application/json' };

  const doi = normalizeDoi(inp.doi);
  if (doi) {
    try {
      const res = await fetchImpl(crossrefWorksUrl(doi), { headers, signal: opts.signal });
      if (res.ok) return { verdict: 'found', doiResolved: true };
      if (res.status === 404) return { verdict: 'not-found', doiResolved: false };
      return { verdict: 'unchecked' };
    } catch {
      return { verdict: 'unchecked' };
    }
  }

  if (!inp.title) return { verdict: 'unchecked' };
  try {
    const res = await fetchImpl(crossrefQueryUrl(inp, opts.mailto), { headers, signal: opts.signal });
    if (!res.ok) return { verdict: 'unchecked' };
    const data = await res.json();
    const items: CrossrefItem[] = (data && data.message && data.message.items) || [];
    const v = verdictFromCandidates(inp, items);
    // Domaci izvor koji CrossRef ne nadje: 'not-indexed' (poziv na rucnu provjeru), ne "nije pronadjeno".
    if (v.verdict === 'not-found' && looksCroatian(inp)) {
      return { verdict: 'not-indexed', score: v.score };
    }
    return { verdict: v.verdict, score: v.score, matchedTitle: v.matchedTitle };
  } catch {
    return { verdict: 'unchecked' };
  }
}

export interface BatchOptions extends VerifyOptions {
  onProgress?: (done: number, total: number) => void;
  /** Razmak izmedju mreznih poziva (ms); pristojnost prema CrossRef-u. Testovi salju 0. */
  delayMs?: number;
  /** Globalni rok (ms); preostale reference nakon isteka ostaju 'unchecked'. */
  deadlineMs?: number;
}

// Per-sesija cache: ista referenca u istoj sesiji se ne pita dvaput.
const sessionCache = new Map<string, ExistenceResult>();

function cacheKey(inp: Partial<CitationInput>): string {
  const doi = normalizeDoi(inp.doi);
  return doi ? `doi:${doi}` : `t:${normalize(inp.title)}|y:${(inp.year || '').trim()}`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Provjeri niz referenci sekvencijalno (pristojno prema CrossRef-u), s cacheom i globalnim rokom. */
export async function verifyReferences(list: Array<Partial<CitationInput>>, opts: BatchOptions = {}): Promise<ExistenceResult[]> {
  const delay = opts.delayMs ?? 300;
  const deadline = opts.deadlineMs ?? 30000;
  const start = Date.now();
  const out: ExistenceResult[] = [];
  let networkCalls = 0;
  for (let i = 0; i < list.length; i++) {
    const inp = list[i];
    const key = cacheKey(inp);
    const cached = sessionCache.get(key);
    if (cached) { out.push(cached); opts.onProgress?.(i + 1, list.length); continue; }
    if (Date.now() - start > deadline || opts.signal?.aborted) {
      out.push({ verdict: 'unchecked' });
      opts.onProgress?.(i + 1, list.length);
      continue;
    }
    if (networkCalls > 0 && delay > 0) await sleep(delay);
    const res = await verifyReference(inp, opts);
    networkCalls++;
    if (res.verdict !== 'unchecked') sessionCache.set(key, res);
    out.push(res);
    opts.onProgress?.(i + 1, list.length);
  }
  return out;
}

/** Za testove: isprazni per-sesija cache. */
export function _clearExistenceCache(): void {
  sessionCache.clear();
}
