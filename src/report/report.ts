import type { Check, Issue } from '../scoring/checks';
import { scoreMeta } from '../scoring/checks';
import type { FingerprintInput } from '../fingerprint/fingerprint';
import type { ReportWorkType } from './pricing';
import { coverageTierForStatus } from './guarantee';

/**
 * Granica teaser (klijent) i puni izvjestaj (server) kao cista podatkovna granica
 * (MONETIZATION_AND_ANTI_ABUSE.md sekcije 3 i 5).
 *
 * Teaser je 100% klijentski i besplatan: ukupni score, score po kategorijama, brojaci
 * problema po ozbiljnosti i 1 do 2 problema u potpunosti. NIKAD ne sadrzi puni popis
 * problema ni cist izvoz; to je iza paywalla. Teaser se smije dijeliti i nikad se ne
 * gatea.
 *
 * Puni izvjestaj generira i potpisuje server (Edge Function) iz payloada koji klijent
 * posalje (`ReportRequest`): parsirana struktura (iz koje server racuna otisak) plus
 * rezultat analize plus work_type. Server nikad ne vjeruje klijentu o pravu pristupa.
 */

/** Minimalan oblik rezultata analize koji granica treba (decoupling od @ts-nocheck UI-ja). */
export interface AnalysisResultLike {
  score: number;
  profile?: string;
  profileStatus?: string;
  stats?: Record<string, number | undefined>;
  checks?: Check[];
  issues?: Issue[];
  details?: {
    profileFingerprint?: string;
    ruleAuthority?: string;
    profileDefinitionId?: string;
    sources?: Array<{ title: string; url: string }>;
  };
}

export interface CategoryScore {
  category: string;
  earned: number;
  max: number;
}

export interface IssueCounts {
  error: number;
  warning: number;
  info: number;
  total: number;
}

/** Teaser payload: sve sto se smije izracunati i prikazati lokalno, besplatno. */
export interface Teaser {
  score: number;
  scoreLabel: string;
  categoryScores: CategoryScore[];
  issueCounts: IssueCounts;
  /** 1 do 2 problema u potpunosti (mamac), ostalo je iza paywalla. */
  sampleIssues: Issue[];
  /** Ima li jos problema preko uzorka (signal za paywall). */
  hasMore: boolean;
  watermark: true;
}

/** Pouzdanost pravila u punom izvjestaju (kriterij 10). informational = nescored (max 0)
 *  pravilo koje se prikazuje ali NE boduje ("nepotvrdjeno"). */
export type RuleConfidence = 'high' | 'medium' | 'low' | 'informational';
export type AnnotatedCheck = Check & { confidence: RuleConfidence };

/** Puni izvjestaj: kompletan anotirani sadrzaj, vraca ga server uz vazeci entitlement. */
export interface FullReport {
  score: number;
  scoreLabel: string;
  profile?: string;
  profileStatus?: string;
  stats: Record<string, number | undefined>;
  categoryScores: CategoryScore[];
  checks: AnnotatedCheck[];
  issues: Issue[];
  watermark: false;
  /** Coverage tier profila (0..3). T2/T3 nose garanciju i verificirana pravila (sekcija 3). */
  coverageTier: number;
  /** Diskretan per-purchase token (traceability); ubacuje ga server. */
  traceToken?: string;
  /** Broj bodovanih (scored) i informativnih/nepotvrdjenih provjera (kriterij 10). */
  scoredCount: number;
  unverifiedCount: number;
}

/** Zahtjev koji klijent salje Edge Functionu za placeni izvjestaj. */
export interface ReportRequest {
  parsedStructure: FingerprintInput;
  analysisResult: AnalysisResultLike;
  workType: ReportWorkType;
}

/** Zbroji bodovane provjere (max > 0) po kategoriji. Informativne (max 0) se izostavljaju. */
export function categoryScores(checks: Check[] = []): CategoryScore[] {
  const byCat = new Map<string, CategoryScore>();
  for (const c of checks) {
    if (!c.scored || c.max <= 0) continue;
    const cur = byCat.get(c.category) ?? { category: c.category, earned: 0, max: 0 };
    cur.earned += c.earned;
    cur.max += c.max;
    byCat.set(c.category, cur);
  }
  return [...byCat.values()];
}

/** Prebroji probleme po ozbiljnosti. */
export function issueCounts(issues: Issue[] = []): IssueCounts {
  const counts: IssueCounts = { error: 0, warning: 0, info: 0, total: issues.length };
  for (const i of issues) {
    if (i.severity === 'error') counts.error += 1;
    else if (i.severity === 'warning') counts.warning += 1;
    else if (i.severity === 'info') counts.info += 1;
  }
  return counts;
}

/**
 * Pouzdanost pravila za puni izvjestaj: nescored (max 0) je uvijek 'informational'
 * (prikazuje se, ne boduje = "nepotvrdjeno"); scored pravilo nasljeduje pouzdanost iz
 * statusa profila (coverageTier) uz spust na 'medium' kad izvor nosi currency-caveat.
 * Nikad ne precjenjuje: nepoznat status daje 'low', ne 'high'.
 */
export function ruleConfidence(
  check: Check,
  opts: { profileStatus?: string; ruleAuthority?: string } = {},
): RuleConfidence {
  if (!check.scored || check.max <= 0) return 'informational';
  const caveat = opts.ruleAuthority === 'official-source-with-currency-caveat';
  const tier = coverageTierForStatus(opts.profileStatus);
  if (tier >= 2 && !caveat) return 'high';
  if (tier >= 1 || caveat) return 'medium';
  return 'low';
}

export interface TeaserOptions {
  /** Koliko problema prikazati u potpunosti (default 2). */
  sampleSize?: number;
}

/**
 * Gradi teaser iz rezultata analize. Cista funkcija, bez mreze i bez entitlementa
 * (kriterij 11.9): smije se izvrtjeti potpuno lokalno.
 */
export function buildTeaser(result: AnalysisResultLike, options: TeaserOptions = {}): Teaser {
  const sampleSize = options.sampleSize ?? 2;
  const issues = result.issues ?? [];
  return {
    score: result.score,
    scoreLabel: scoreMeta(result.score).label,
    categoryScores: categoryScores(result.checks),
    issueCounts: issueCounts(issues),
    sampleIssues: issues.slice(0, sampleSize),
    hasMore: issues.length > sampleSize,
    watermark: true,
  };
}

/**
 * Gradi puni izvjestaj. Poziva se SAMO serverski nakon uspjesnog entitlement gatea.
 * `traceToken` ubacuje server po kupnji. `scoredCheckFilter` je opcionalni hook: ako je
 * zadan, u izvjestaj ulaze samo provjere ciji checkId je u skupu (verifikacijski
 * "boduje se samo scored:true"); bez njega ulaze sve provjere koje engine vrati.
 */
export function buildFullReport(
  result: AnalysisResultLike,
  options: { traceToken?: string; scoredCheckTitles?: Set<string> } = {},
): FullReport {
  const allChecks = result.checks ?? [];
  const checks = options.scoredCheckTitles
    ? allChecks.filter((c) => options.scoredCheckTitles!.has(c.title))
    : allChecks;
  const authority = { profileStatus: result.profileStatus, ruleAuthority: result.details?.ruleAuthority };
  const annotated: AnnotatedCheck[] = checks.map((c) => ({ ...c, confidence: ruleConfidence(c, authority) }));
  return {
    score: result.score,
    scoreLabel: scoreMeta(result.score).label,
    profile: result.profile,
    profileStatus: result.profileStatus,
    stats: result.stats ?? {},
    categoryScores: categoryScores(checks),
    checks: annotated,
    issues: result.issues ?? [],
    watermark: false,
    coverageTier: coverageTierForStatus(result.profileStatus),
    traceToken: options.traceToken,
    scoredCount: annotated.filter((c) => c.confidence !== 'informational').length,
    unverifiedCount: annotated.filter((c) => c.confidence === 'informational').length,
  };
}

/** Sastavi zahtjev za serverski izvjestaj (klijentska strana). */
export function buildReportRequest(
  parsedStructure: FingerprintInput,
  analysisResult: AnalysisResultLike,
  workType: ReportWorkType,
): ReportRequest {
  return { parsedStructure, analysisResult, workType };
}
