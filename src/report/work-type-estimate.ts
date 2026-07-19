/**
 * Neovisna procjena vrste rada iz KOLICINE TEKSTA (rijeci; NE stranice) + naslovnickog markera,
 * za obranu od "diplomski prijavljen kao seminarski" (WS-2). Cista, DOM-free, dijeljena izmedju
 * klijenta (meko upozorenje) i servera (autoritativna blokada pri kupnji/popravku).
 *
 * NACELA:
 * - Rasponi su IZVEDENI iz sluzbenih fakultetskih pravila (data/work-type-scope.json, generira
 *   scripts/generate-work-type-scope.mjs iz rules.wordMin/Max + rulesByWorkType.*.charMin/Max).
 *   Pokrivenost je danas TANKA (v. scope.gaps), pa:
 * - PRIMARNI, pouzdani signal je naslovnicki marker (naslovnica doslovno kaze "diplomski rad").
 * - Opseg teksta je SEKUNDARNI: blokira SAMO kad je daleko iznad velikodusnog stropa (faktor 2.0),
 *   da granicni posteni radovi (dug seminar) nikad ne padnu (fail-open, kao intake-gate).
 * - Ovo je ADVISORY heuristika (ne bodovano pravilo), pa genericki fallback ne krsi "ne izmisljaj
 *   bodovana pravila"; profilni charMin/wordMin (koji se BODUJE) ostaju netaknuti.
 */
import type { ReportWorkType } from './pricing';
import { isReportWorkType } from './pricing';
// `with { type: 'json' }` je OBAVEZAN za Deno (Supabase Edge/repair-docx); Vite/tsc/vitest ga
// jednako podnose. Bez atributa Deno baca "Attempted to load JSON module without ... type: json".
import scopeJson from '../../data/work-type-scope.json' with { type: 'json' };

/** Profilske (engine) oznake vrste rada. */
export type ProfileWorkType =
  | 'seminar' | 'final' | 'graduate' | 'specialist' | 'doctoral' | 'article' | 'project';

/** Profilska -> naplatna vrsta (sinkronizirano s REPORT_WORK_TYPE u report-client.ts i generatoru). */
const PROFILE_TO_REPORT: Record<ProfileWorkType, ReportWorkType> = {
  seminar: 'seminarski', final: 'zavrsni', graduate: 'diplomski', specialist: 'diplomski',
  doctoral: 'doktorski', article: 'zavrsni', project: 'zavrsni',
};
export function profileToReportWorkType(wt: string): ReportWorkType {
  if (isReportWorkType(wt)) return wt;
  return PROFILE_TO_REPORT[wt as ProfileWorkType] ?? 'zavrsni';
}

interface RangeStat { min: number | null; max: number | null; sampleCount: number; samples: unknown[] }
interface ScopeTier { words: RangeStat | null; chars: RangeStat | null; anchored: boolean }
export interface WorkTypeScope { karticaChars: number; tiers: Record<string, ScopeTier>; gaps: string[] }

const SCOPE = scopeJson as unknown as WorkTypeScope;

/** Rang po cijeni/razini (seminarski < zavrsni < diplomski < doktorski). */
export const TIER_RANK: Record<ReportWorkType, number> = { seminarski: 0, zavrsni: 1, diplomski: 2, doktorski: 3 };
const TIERS: ReportWorkType[] = ['seminarski', 'zavrsni', 'diplomski', 'doktorski'];

/** Prosjecno znakova po rijeci (hrv., s razmakom) za pretvorbu char-pragova u rijeci. Konzervativno. */
const CHARS_PER_WORD = 6.5;
/** Faktor iznad stropa iznad kojeg opseg smatramo NEDVOSMISLENO prevelikim (BLOKADA). */
const OVERSIZE_FACTOR = 2.0;
/** Blazi faktor za MEKO upozorenje (klijent): posumnjaj ranije nego sto blokiras. */
const WARN_FACTOR = 1.25;

/**
 * Genericki "zdravorazumski" raspon rijeci po vrsti (advisory fallback za vrste bez fakultetskog
 * sidra ili kao velikodusna gornja/donja ograda). NIJE bodovano pravilo.
 */
const FALLBACK_WORDS: Record<ReportWorkType, [number, number]> = {
  seminarski: [1500, 9000], zavrsni: [3000, 18000], diplomski: [6000, 30000], doktorski: [25000, 150000],
};

function charsToWords(chars: number | null | undefined): number | null {
  return typeof chars === 'number' && isFinite(chars) ? chars / CHARS_PER_WORD : null;
}

/** Velikodusan gornji strop rijeci za vrstu: max(izvedeno-rijeci, izvedeno-znakovi/cpw, fallback). */
function upperWords(tier: ReportWorkType): number {
  const t = SCOPE.tiers[tier];
  const cands = [t?.words?.max ?? null, charsToWords(t?.chars?.max), FALLBACK_WORDS[tier][1]]
    .filter((x): x is number => typeof x === 'number');
  return Math.max(...cands);
}

/** Reprezentativan donji prag rijeci za vrstu: min(izvedeno-rijeci, izvedeno-znakovi/cpw, fallback). */
function lowerWords(tier: ReportWorkType): number {
  const t = SCOPE.tiers[tier];
  const cands = [t?.words?.min ?? null, charsToWords(t?.chars?.min), FALLBACK_WORDS[tier][0]]
    .filter((x): x is number => typeof x === 'number');
  return Math.min(...cands);
}

export interface WorkTypeSignals {
  /** Izmjerene rijeci (profilni officialWords ako postoji, inace sirovi broj rijeci dokumenta). */
  words: number | null;
  /** Naslovnicki marker vrste rada (iz detectTitleWorkTypeMarker), ako je prepoznat. */
  titleMarker?: ProfileWorkType | null;
}

export interface WorkTypeEstimate {
  workType: ReportWorkType;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
}

/**
 * Procjeni najvjerojatniju naplatnu vrstu rada. Naslovnicki marker ima prednost (visoka pouzdanost);
 * inace klasificira po izmjerenom broju rijeci (najvisa vrsta ciji je donji prag dosegnut).
 */
export function estimateWorkType(signals: WorkTypeSignals): WorkTypeEstimate {
  const reasons: string[] = [];
  if (signals.titleMarker) {
    const wt = profileToReportWorkType(signals.titleMarker);
    reasons.push(`naslovnica navodi vrstu rada (${signals.titleMarker})`);
    return { workType: wt, confidence: 'high', reasons };
  }
  const words = signals.words;
  if (typeof words !== 'number' || !isFinite(words) || words <= 0) {
    return { workType: 'zavrsni', confidence: 'low', reasons: ['nema pouzdanog broja rijeci'] };
  }
  // Najvisa vrsta ciji je donji prag dosegnut.
  let pick: ReportWorkType = 'seminarski';
  for (const t of TIERS) if (words >= lowerWords(t)) pick = t;
  reasons.push(`opseg ~${Math.round(words)} rijeci`);
  const anchored = !!SCOPE.tiers[pick]?.anchored;
  return { workType: pick, confidence: anchored ? 'medium' : 'low', reasons };
}

export type MismatchLevel = 'none' | 'warn' | 'block';

/**
 * Razina nesklada izmedju odabrane (kupljene) i stvarne vrste rada:
 *  - 'block': naslovnica doslovno navodi visu vrstu, ILI opseg je iznad stropa za OVERSIZE_FACTOR
 *    (nedvosmisleno; server odbija jeftiniji tier).
 *  - 'warn': opseg je umjereno iznad stropa (WARN_FACTOR) i visa vrsta je prikladnija (klijent
 *    meko upozori, ne blokira).
 *  - 'none': u redu ili granicno (fail-open).
 * NE baca. Volumen uvijek zahtijeva da je procijenjena vrsta STROGO visa (sanity).
 */
export function workTypeMismatchLevel(selected: string, signals: WorkTypeSignals): MismatchLevel {
  if (!isReportWorkType(selected)) return 'none';
  const selRank = TIER_RANK[selected];
  if (signals.titleMarker) {
    const mk = profileToReportWorkType(signals.titleMarker);
    if (TIER_RANK[mk] > selRank) return 'block';
  }
  const words = signals.words;
  if (typeof words === 'number' && isFinite(words) && words > 0) {
    const up = upperWords(selected);
    const higher = TIER_RANK[estimateWorkType({ words }).workType] > selRank;
    if (higher && words > up * OVERSIZE_FACTOR) return 'block';
    if (higher && words > up * WARN_FACTOR) return 'warn';
  }
  return 'none';
}

/**
 * Je li odabrana vrsta rada NEDVOSMISLENO nizja od stvarne (server odbija jeftiniji tier)? Vrati
 * true samo za razinu 'block'. Granicne slucajeve rjesava meko upozorenje ('warn') + potvrda.
 */
export function unambiguousMismatch(selected: string, signals: WorkTypeSignals): boolean {
  return workTypeMismatchLevel(selected, signals) === 'block';
}

const DIACRITICS: Record<string, string> = { č: 'c', ć: 'c', š: 's', ž: 'z', đ: 'd' };
function cleanText(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[čćšžđ]/g, (m) => DIACRITICS[m] || m)
    .replace(/\s+/g, ' ');
}

/**
 * Prepoznaj vrstu rada iz teksta naslovnice (prve stranice). Konzervativno i redom specificnosti;
 * uklanja "preddiplomski"/"prijediplomski" prije provjere "diplomski rad" da razina studija ne
 * lazno oznaci diplomski. Vraca profilsku oznaku ili null.
 */
export function detectTitleWorkTypeMarker(rawFrontText: string): ProfileWorkType | null {
  let t = cleanText(rawFrontText);
  if (!t) return null;
  if (/doktorsk|disertacij/.test(t)) return 'doctoral';
  if (/specijalist/.test(t)) return 'specialist';
  // Ukloni razinu studija koja sadrzi substring "diplomski".
  t = t.replace(/preddiplomsk[a-z]*/g, ' ').replace(/prijediplomsk[a-z]*/g, ' ');
  if (/diplomsk[a-z]* rad[a-z]*/.test(t)) return 'graduate';
  if (/zavrsn[a-z]* rad[a-z]*/.test(t)) return 'final';
  if (/seminarsk[a-z]* rad[a-z]*/.test(t)) return 'seminar';
  return null;
}

/** Izlozi ucitani scope (za dijagnostiku/testove). */
export function workTypeScope(): WorkTypeScope { return SCOPE; }
