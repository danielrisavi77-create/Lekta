/**
 * K2: provjera POSTOJANJA domace reference u hrvatskom korpusu (Dabar + Hrcak, 526k radova).
 *
 * Ovo je CISTA jezgra: nema mreze, nema baze, nema Denovih ni preglednickih ovisnosti. Dohvat
 * kandidata je INJEKTIRAN (`CorpusFetcher`), pa se cijelo ponasanje dokazuje lokalno testovima,
 * bez ijednog deploya. Konkretan SQL (pg_trgm nad corpus_works.title_norm) zivi u Edge funkciji.
 *
 * Semantika je preslikana 1:1 iz lekta-pipeline/lekta_pipeline/modules/m2_references.py (grana
 * "Domaci korpus"), da server i pipeline ne daju razlicite presude nad istim podatkom:
 *   - kandidati: title_hits(min_ratio=0.55, top=5)
 *   - bodovanje: title_similarity + 0.05 kad je godina unutar +-1 (klamp na 1.0)
 *   - >= 0.80 pronadjeno, >= 0.60 vjerojatno, ispod toga NIKAKVA presuda (fall-through)
 *
 * TVRDO PRAVILO (integritet): korpus SMIJE SAMO POBOLJSATI ishod, nikad ga pogorsati. Promasaj u
 * korpusu NIJE dokaz da izvor ne postoji, jer korpus pokriva hrvatske repozitorije, a ne knjige,
 * strane izvore, zbornike ni starije radove. Zato se pri promasaju vraca `null` i zadrzava
 * postojeci ishod ('not-indexed' = provjeri rucno), umjesto da se referenca proglasi izmisljenom.
 */
import { titleSimilarity } from './verify-existence';
import type { ExistenceResult } from './verify-existence';
import { normalize } from '../utils/helpers';

/**
 * Kljuc po kojem se pretrazuje korpus: MORA dati isti oblik kao stupac corpus_works.title_norm
 * (koji uvozna skripta racuna istom funkcijom). Jedno mjesto istine, da server i baza ne razidju.
 */
export function corpusKey(title: string | null | undefined): string {
  return normalize(title);
}

/**
 * Prag za DOHVAT kandidata. NIJE isto sto i prag odluke i NAMJERNO je nizi od njega.
 *
 * Pipeline koristi 0.55, ali nad SVOJOM mjerom (FTS5 + Dice). Nas dohvat ide preko pg_trgm
 * `similarity()`, sto je DRUGA mjera, pa se broj ne smije prepisati doslovno: 0.55 na trigramima
 * odbacuje stvarne pogotke prije nego ih Dice uopce vidi.
 *
 * Izmjereno nad punim korpusom (525.817 redaka, Supabase free): naslov kracen na tri rijeci ima
 * trigramsku slicnost 0.422, dakle prag 0.55 bi ga izgubio. Brzina po pragu: 0.30 -> 877 ms
 * (505 kandidata), 0.40 -> 143 ms (102), 0.55 -> 52 ms (6). Zato 0.40: dovoljno labavo da
 * kraceni i nepotpuni navodi prezive dohvat, a jos uvijek ispod 200 ms.
 *
 * Dohvat je filtar RECALLA; presudu i dalje donosi iskljucivo Dice (WEAK_MIN/FOUND_MIN nize).
 */
export const CORPUS_CANDIDATE_MIN = 0.4;
/**
 * Najvise kandidata (mirror top iz corpus.title_hits). Provjereno da 5 nije preusko: za kraceni
 * upit pravi pogodak dolazi kao RANG 1 (trgm 0.744), a uz prag 0.40 cesto je i jedini kandidat.
 */
export const CORPUS_TOP = 5;
/** Prag za 'weak' (vjerojatno pronadjeno); mirror LIKELY iz m2_references. */
export const CORPUS_WEAK_MIN = 0.6;
/** Prag za 'found' (pronadjeno); mirror VERIFIED iz m2_references. */
export const CORPUS_FOUND_MIN = 0.8;
/** Godina se smije razlikovati za toliko a da se jos smatra istim radom. */
export const CORPUS_YEAR_TOLERANCE = 1;
/** Bonus na slicnost kad se godina poklapa unutar tolerancije. */
export const CORPUS_YEAR_BONUS = 0.05;

/** Zapis iz corpus_works kakav dohvat vraca. Samo bibliografski metapodaci, bez punog teksta. */
export interface CorpusCandidate {
  title: string;
  year?: number | null;
  institution?: string | null;
  repo?: string | null;
  url?: string | null;
  sourceId?: string | null;
}

/** Referenca koju provjeravamo. Namjerno minimalno: naslov i godina su sve sto korpus treba. */
export interface CorpusQuery {
  title?: string | null;
  year?: number | null;
}

/** Pogodak u korpusu. `null` umjesto ovoga znaci "bez presude", NE "ne postoji". */
export interface CorpusMatch {
  verdict: 'found' | 'weak';
  /** Slicnost naslova ukljucujuci bonus za godinu, 0..1. */
  score: number;
  matchedTitle: string;
  /** Ustanova ili repozitorij za prikaz ("gdje je nadjeno"). */
  where: string;
  institution: string | null;
  repo: string | null;
  url: string | null;
  note: string;
}

/** Dohvat kandidata iz korpusa. Injektira ga pozivatelj (Edge funkcija radi SQL, test vraca niz). */
export type CorpusFetcher = (
  title: string,
  opts: { min: number; top: number },
) => Promise<CorpusCandidate[]>;

/**
 * Odaberi najbolji pogodak medju kandidatima. Mirror _best_match iz m2_references.py: slicnost
 * naslova, plus 0.05 kad je godina unutar tolerancije, klamp na 1.0, bez ikakve kazne za nesklad
 * godine (nepoznata godina ne smije obarati inace dobar pogodak).
 */
export function bestCorpusCandidate(
  q: CorpusQuery,
  candidates: CorpusCandidate[] | null | undefined,
): { score: number; candidate: CorpusCandidate } | null {
  const title = (q.title || '').trim();
  if (!title) return null;
  let best: { score: number; candidate: CorpusCandidate } | null = null;
  for (const c of candidates || []) {
    const cand = (c?.title || '').trim();
    if (!cand) continue;
    let sim = titleSimilarity(title, cand);
    if (q.year && c.year && Math.abs(c.year - q.year) <= CORPUS_YEAR_TOLERANCE) sim += CORPUS_YEAR_BONUS;
    sim = Math.min(sim, 1);
    if (!best || sim > best.score) best = { score: sim, candidate: c };
  }
  return best;
}

/** Pretvori najbolji pogodak u presudu, ili `null` kad ne dosize prag (fall-through, bez presude). */
export function corpusMatchFrom(
  q: CorpusQuery,
  candidates: CorpusCandidate[] | null | undefined,
): CorpusMatch | null {
  const best = bestCorpusCandidate(q, candidates);
  if (!best || best.score < CORPUS_WEAK_MIN) return null;
  const c = best.candidate;
  const institution = c.institution || null;
  const repo = c.repo || null;
  const where = institution || repo || 'hrvatski repozitorij';
  return {
    verdict: best.score >= CORPUS_FOUND_MIN ? 'found' : 'weak',
    score: best.score,
    matchedTitle: c.title,
    where,
    institution,
    repo,
    url: c.url || null,
    note: `Pronađeno u hrvatskom korpusu (${where}); sličnost naslova ${best.score.toFixed(2)}.`,
  };
}

/**
 * Dohvati kandidate pa presudi. NIKAD ne baca i nikad ne vraca negativnu presudu: greska dohvata,
 * prazan korpus ili referenca bez naslova svi zavrsavaju kao `null` (bez presude), pa pozivatelj
 * zadrzi svoj postojeci, posteni ishod.
 */
export async function verifyAgainstCorpus(
  q: CorpusQuery,
  fetchCandidates: CorpusFetcher,
): Promise<CorpusMatch | null> {
  const title = (q.title || '').trim();
  if (!title) return null;
  let candidates: CorpusCandidate[] = [];
  try {
    candidates = await fetchCandidates(title, { min: CORPUS_CANDIDATE_MIN, top: CORPUS_TOP });
  } catch {
    return null; // ostecen indeks ili nedostupna baza ne smiju proizvesti lazni "ne postoji"
  }
  return corpusMatchFrom(q, candidates);
}

/**
 * Spoji korpusni pogodak s vec postojecim ishodom (npr. iz CrossRefa).
 *
 * SMIJE SAMO NADOGRADITI: dira se iskljucivo ishod koji je ostao neodlucen ili negativan
 * ('not-found', 'not-indexed', 'unchecked'). Vec potvrdjen 'found' ili 'weak' iz CrossRefa se NE
 * dira, jer je DOI/bibliografski pogodak jaci dokaz od podudaranja naslova u repozitoriju.
 */
export function applyCorpusFallback(prev: ExistenceResult, match: CorpusMatch | null): ExistenceResult {
  if (!match) return prev;
  if (prev.verdict !== 'not-found' && prev.verdict !== 'not-indexed' && prev.verdict !== 'unchecked') return prev;
  return { ...prev, verdict: match.verdict, score: match.score, matchedTitle: match.matchedTitle };
}

// ------------------------------------------------------------------------------------------------
// Serijska provjera s PRORACUNOM VREMENA.
//
// Izmjereno na produkciji: dohvat kosta oko 2,8 ms po znaku naslova, dakle ~85 ms za kratak i
// ~200 ms za dug naslov. Rad s 40 referenci je 6 do 10 s, sto je previse da bi se cekalo u jednom
// zahtjevu. Zato se obradjuje u malim serijama dok traje budzet, pa se POSTENO javi koliko je
// referenci stiglo na red. Djelomican rezultat je bolji od nikakvog, ali NIKAD se ne smije
// predstaviti kao potpun.
// ------------------------------------------------------------------------------------------------

export interface CorpusBatchItem {
  title?: string | null;
  year?: number | null;
}

export interface CorpusBatchResult {
  /** Presuda po ulaznom indeksu; null znaci "bez presude" (nije nadjeno ili nije stiglo na red). */
  matches: Array<CorpusMatch | null>;
  /** Koliko je referenci stvarno provjereno (moze biti manje od ukupno, zbog budzeta). */
  checked: number;
  /** Ukupan broj poslanih referenci. */
  total: number;
  /** true kad je budzet potrosen prije kraja, pa je rezultat DJELOMICAN. */
  truncated: boolean;
}

/** Dohvat jedne serije: prima kljuceve, vraca kandidate po indeksu unutar serije. */
export type CorpusBatchFetcher = (
  keys: string[],
  opts: { min: number; top: number },
) => Promise<Array<CorpusCandidate[]>>;

export interface CorpusBatchOptions {
  /** Koliko referenci po odlasku na bazu. */
  chunkSize?: number;
  /** Gornja granica ukupnog vremena u ms. */
  budgetMs?: number;
  /** Izvor vremena (injektiran radi determinističkih testova). */
  now?: () => number;
}

/**
 * Provjeri niz referenci u serijama, unutar zadanog budzeta.
 * Greska pojedine serije NE prekida posao i NE proizvodi negativnu presudu: ta serija ostaje bez
 * presude, ostale se nastavljaju (isti princip kao verifyAgainstCorpus).
 */
export async function verifyCorpusBatch(
  items: CorpusBatchItem[],
  fetchBatch: CorpusBatchFetcher,
  opts: CorpusBatchOptions = {},
): Promise<CorpusBatchResult> {
  const list = items || [];
  const chunkSize = Math.max(1, opts.chunkSize ?? 8);
  const budgetMs = opts.budgetMs ?? 6000;
  const now = opts.now ?? (() => Date.now());
  const started = now();

  const matches: Array<CorpusMatch | null> = new Array(list.length).fill(null);
  let checked = 0;
  let truncated = false;

  for (let i = 0; i < list.length; i += chunkSize) {
    if (now() - started >= budgetMs) { truncated = true; break; }
    const slice = list.slice(i, i + chunkSize);
    const keys = slice.map((it) => corpusKey(it?.title));
    let candidates: Array<CorpusCandidate[]> = [];
    try {
      candidates = await fetchBatch(keys, { min: CORPUS_CANDIDATE_MIN, top: CORPUS_TOP });
    } catch {
      checked += slice.length; // pokusano je; ostaje bez presude, ne kao "ne postoji"
      continue;
    }
    slice.forEach((it, k) => {
      matches[i + k] = corpusMatchFrom({ title: it?.title, year: it?.year }, candidates[k] || []);
    });
    checked += slice.length;
  }

  return { matches, checked, total: list.length, truncated: truncated || checked < list.length };
}
