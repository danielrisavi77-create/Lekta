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
import { parseAuthors, type CitationInput } from '../tools/citation.ts';
import { normalize } from '../utils/helpers.ts';

export type ExistenceVerdict = 'found' | 'weak' | 'not-found' | 'not-indexed' | 'unchecked';

export interface ExistenceResult {
  verdict: ExistenceVerdict;
  /** Slicnost najboljeg CrossRef pogotka (0..1), kad je isla bibliografska pretraga. */
  score?: number;
  /** Naslov najboljeg pogotka (za prikaz "podudara se s..."). */
  matchedTitle?: string;
  /** true kad je DOI razrijesen (200) kroz CrossRef works/<doi>. */
  doiResolved?: boolean;
  /**
   * Oznaka povucenog rada ili izraza zabrinutosti iz Crossref `updated-by` (T98, issue #219). Postoji
   * SAMO uz verdikt `found`; odsutnost NIJE tvrdnja "nije povuceno", nego "nepoznato".
   */
  retraction?: RetractionInfo;
}

export interface RetractionInfo {
  kind: 'retracted' | 'partial' | 'concern';
  /** `retraction-watch` ili `publisher` (kako ga Crossref imenuje). */
  source: string;
  /** DOI obavijesti o povlacenju ili zabrinutosti. */
  noticeDoi: string;
  /** Datum obavijesti (YYYY-MM-DD) ili prazan niz. */
  date: string;
}

const RETRACTED_TYPES = new Set(['retraction', 'withdrawal', 'removal']);
const CONCERN_TYPES = new Set(['expression_of_concern']);

/**
 * Povlacenje ili zabrinutost iz Crossref `works` zapisa. Cita ISKLJUCIVO `updated-by` (zapis rada koji je
 * azuriran), nikad `update-to` (zapis same obavijesti), da se obavijest ne oznaci kao povucen rad.
 * Djelomicno povlacenje (`partial_retraction`) ostaje zasebno. Ispravci (`correction`, `erratum`)
 * se ignoriraju. Potpuno povlacenje ima prednost pred djelomicnim, zatim zabrinutoscu.
 * Nepoznat ili nevaljan oblik daje `null`, nikad iznimku.
 */
export function retractionFromWork(message: unknown): RetractionInfo | null {
  try {
    const updatedBy = (message as { 'updated-by'?: unknown } | null)?.['updated-by'];
    if (!Array.isArray(updatedBy)) return null;
    let concern: RetractionInfo | null = null;
    let partial: RetractionInfo | null = null;
    for (const u of updatedBy) {
      if (!u || typeof u !== 'object') continue;
      const e = u as { type?: unknown; source?: unknown; DOI?: unknown; updated?: { 'date-time'?: unknown; 'date-parts'?: unknown } };
      const type = typeof e.type === 'string' ? e.type.toLowerCase() : '';
      const kind = RETRACTED_TYPES.has(type) ? 'retracted' : type === 'partial_retraction' ? 'partial' : CONCERN_TYPES.has(type) ? 'concern' : null;
      if (!kind) continue;
      const dt = e.updated?.['date-time'];
      const dateParts = e.updated?.['date-parts'];
      const parts = Array.isArray(dateParts) ? (dateParts as unknown[])[0] : null;
      const date = typeof dt === 'string' ? dt.slice(0, 10)
        : Array.isArray(parts) && parts.every((n) => typeof n === 'number') ? (parts as number[]).map((n, i) => (i ? String(n).padStart(2, '0') : String(n))).join('-') : '';
      const info: RetractionInfo = { kind, source: typeof e.source === 'string' ? e.source : '', noticeDoi: typeof e.DOI === 'string' ? e.DOI : '', date };
      if (kind === 'retracted') return info;
      if (kind === 'partial') partial ??= info;
      else concern ??= info;
    }
    return partial ?? concern;
  } catch {
    return null;
  }
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
  // `updated-by` nosi oznaku povucenog rada (T98); select ga prihvaca (snimka tests/fixtures/crossref/select-updated-by.json).
  params.set('select', 'title,author,issued,DOI,updated-by');
  if (mailto) params.set('mailto', mailto);
  return `${CROSSREF_BASE}?${params.toString()}`;
}

// --- Verdikt iz CrossRef kandidata (cisto) ------------------------------------

interface CrossrefItem {
  author?: Array<{ family?: string; given?: string }>;
  title?: string[];
  issued?: { 'date-parts'?: number[][] };
  DOI?: string;
  'updated-by'?: unknown;
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

/** Za identitet cuvamo slova (ukljucujuci grcka), dijakritike, interpunkciju i granice rijeci.
 * ASCII normalizacija fuzzy skora ovdje bi izjednacila razlicite radove. */
function identityText(s: unknown): string {
  return typeof s === 'string' ? s.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim() : '';
}

/** Strozi identitet SAMO za upozorenje; fuzzy verdikt postojanja ostaje nepromijenjen.
 * Potrebni su puni naslov, tocna godina i svi puni autori. Inicijali i nepotpuni metapodaci
 * ostaju nepoznati. Crossref moze dodati RETRACTED: i inline HTML stvarnom naslovu rada. */
function exactWorkIdentity(inp: Partial<CitationInput>, item: CrossrefItem): boolean {
  if (!item || typeof item !== 'object') return false;
  const title = (s: string | undefined) => identityText((typeof s === 'string' ? s : '').replace(/<[^>]*>/g, '').replace(/^\s*retracted(?: article)?\s*:\s*/i, ''));
  if (!title(inp.title) || title(inp.title) !== title(item.title?.[0])) return false;
  const year = String(inp.year || '').trim();
  if (!/^\d{4}$/.test(year) || Number(year) !== itemYear(item)) return false;
  const authors = parseAuthors(inp.authors);
  if (!authors.length || !Array.isArray(item.author) || authors.length !== item.author.length) return false;
  const fullName = (s: string | undefined) => typeof s === 'string' && !!s && s.split(/[\s.-]+/).filter(Boolean).every((part) => part.length > 1);
  return authors.every((a, i) => {
    const b = item.author![i];
    if (!b || typeof b !== 'object' || typeof b.family !== 'string') return false;
    return fullName(a.first) && fullName(b.given) && !!identityText(a.last) && identityText(a.last) === identityText(b.family)
      && identityText(a.first) === identityText(b.given);
  });
}

/** Najbolji kandidat -> verdikt (found/weak/not-found). looksCroatian spust ide u verifyReference. */
export function verdictFromCandidates(
  inp: Partial<CitationInput>,
  items: CrossrefItem[],
): { verdict: 'found' | 'weak' | 'not-found'; score: number; matchedTitle?: string; retraction?: RetractionInfo } {
  if (!inp.title) return { verdict: 'not-found', score: 0 };
  let best: CrossrefItem | null = null, bestScore = 0;
  for (const it of items || []) {
    const s = scoreCandidate(inp, it);
    if (s > bestScore) { bestScore = s; best = it; }
  }
  const matchedTitle = best?.title?.[0];
  if (bestScore >= FOUND_MIN) {
    // Oznaka trazi found I pouzdan, nedvosmislen identitet; fuzzy found sam nije dovoljan.
    const matching = (items || []).filter((it) => exactWorkIdentity(inp, it));
    const workDois = new Set(matching.map((it) => normalizeDoi(typeof it.DOI === 'string' ? it.DOI : '').toLowerCase()).filter(Boolean));
    const retraction = best && exactWorkIdentity(inp, best) && workDois.size === 1
      && matching.every((it) => typeof it.DOI === 'string' && !!normalizeDoi(it.DOI)) ? retractionFromWork(best) : null;
    return { verdict: 'found', score: bestScore, matchedTitle, ...(retraction ? { retraction } : {}) };
  }
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
      if (res.ok) {
        // Tijelo se cita samo radi oznake povlacenja; neispravno tijelo ne mijenja verdikt `found`.
        let retraction: RetractionInfo | null = null;
        try {
          const message = (await res.json())?.message;
          if (typeof message?.DOI === 'string' && normalizeDoi(message.DOI).toLowerCase() === doi.toLowerCase()) {
            retraction = retractionFromWork(message);
          }
        } catch { retraction = null; }
        return { verdict: 'found', doiResolved: true, ...(retraction ? { retraction } : {}) };
      }
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
    return { verdict: v.verdict, score: v.score, matchedTitle: v.matchedTitle, ...(v.retraction ? { retraction: v.retraction } : {}) };
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
  return doi ? `doi:${doi.toLowerCase()}` : JSON.stringify([identityText(inp.title), (inp.year || '').trim(), (inp.authors || '').trim()]);
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
