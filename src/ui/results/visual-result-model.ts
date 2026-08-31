import { identifyFindings } from '../../integration/finding-identity';
import type { RuleEntry } from '../../profiles/profile-schema';
import type { Check, Issue } from '../../scoring/checks';
import {
  buildFindingViewModels,
  topFindings,
  type FindingResultInput,
  type FindingSessionState,
  type FindingSource,
  type FindingViewModel,
} from '../finding-view-model';
import { resultReadiness, type ReadinessAuthority, type ResultReadiness } from '../result-readiness';

export type VisualAuthorityKind = 'verified' | 'limited' | 'generic';

export interface VisualAuthorityModel {
  kind: VisualAuthorityKind;
  label: string;
  description: string;
  authoritative: boolean;
}

export interface VisualReadinessSignals {
  blockers: number;
  warnings: number;
  manualReviews: number;
  automaticFixes: number;
  informationalChecks: number;
  totalChecks: number;
}

export interface VisualResultHeaderModel {
  documentName: string;
  profile: string;
  profileStatus: string | null;
  profileConfirmed: boolean;
  authorityLabel: string;
}

export type VisualScoreModel =
  | { kind: 'scored'; value: number; max: 100; scoredChecks: number; authority: VisualAuthorityKind }
  | { kind: 'unscored'; label: string; reason: string };

export interface VisualCategoryInput { earned?: number; max?: number; }
export interface VisualCategoryModel { id: string; label: string; earned: number; max: number; percentage: number; }

export interface VisualExactEvidenceInput {
  verified?: boolean;
  sourceId?: string;
  title?: string;
  url?: string;
  quote?: string;
  page?: number | null;
  /** Doslovna formulacija izvora o mjestu, npr. "str. 9 (odjeljak 2.4)". Vidi VisualExactEvidence. */
  pageLabel?: string | null;
  expected?: string;
}

export interface VisualExactEvidence {
  verified: true;
  sourceId: string;
  title: string;
  url: string;
  quote: string;
  page: number | null;
  /**
   * Doslovna formulacija izvora o mjestu. Postoji jer `sourcePage` u pravilima NIJE broj nego
   * slobodan tekst ("str. 9 (odjeljak 2.4 Quellenangaben im Text, tocke 1 i 2)"). Parsiranje u
   * cijeli broj izgubilo bi odjeljak, a izmisljanje broja je zabranjeno; zato se navodi kako
   * izvor sam pise. `page` ostaje strogo numericki i nepromijenjen za pozivatelje koji ga imaju.
   */
  pageLabel: string | null;
}

export interface VisualFindingCapabilities {
  preview: boolean;
  repair: boolean;
  exactEvidence: boolean;
}

export interface VisualFindingModel extends Omit<FindingViewModel, 'source' | 'expected'> {
  stableIssueKey?: string;
  source?: FindingSource;
  exactEvidence?: VisualExactEvidence;
  expected?: string;
  capabilities: VisualFindingCapabilities;
}

export interface VisualResultCapabilities {
  preview: boolean;
  repair: boolean;
  exactEvidence: boolean;
}

export interface VisualRepairSignal {
  fixerId?: string | null;
  fixId?: string | null;
  matchKeys?: readonly string[];
  findingIds?: readonly string[];
}

export interface VisualResultInput extends FindingResultInput {
  file?: { name?: string; size?: number };
  profile?: string | null;
  score?: number | null;
  categories?: Record<string, VisualCategoryInput>;
  scoredChecks?: number | null;
  generatedAt?: string;
  profileStatus?: string | null;
  capabilities?: Partial<VisualResultCapabilities>;
  details?: FindingResultInput['details'] & {
    ruleAuthority?: string | null;
  };
}

export interface VisualResultOptions {
  states?: ReadonlyMap<string, FindingSessionState>;
  exactEvidence?: Readonly<Record<string, VisualExactEvidenceInput>>;
  repairItems?: readonly VisualRepairSignal[];
  ruleEntries?: readonly RuleEntry[];
}

export interface VisualResultContentFreeMetadata {
  score: { kind: 'scored'; value: number; max: 100; scoredChecks: number } | { kind: 'unscored' };
  readinessKind: ResultReadiness['kind'];
  signals: VisualReadinessSignals;
  authorityKind: VisualAuthorityKind;
  capabilities: VisualResultCapabilities;
  documentFindingCount: number;
  limitationFindingCount: number;
  documentFindingIds: string[];
  topFindingIds: string[];
}

export interface VisualResultModel {
  score: VisualScoreModel;
  readiness: ResultReadiness;
  signals: VisualReadinessSignals;
  header: VisualResultHeaderModel;
  authority: VisualAuthorityModel;
  findings: {
    document: VisualFindingModel[];
    limitations: VisualFindingModel[];
    top: VisualFindingModel[];
  };
  categories: VisualCategoryModel[];
  capabilities: VisualResultCapabilities;
  contentFreeMetadata: VisualResultContentFreeMetadata;
}

function trimString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function authorityInput(result: VisualResultInput): Required<ReadinessAuthority> {
  return {
    profileStatus: result.profileStatus ?? null,
    ruleAuthority: result.details?.ruleAuthority ?? null,
  };
}

function authorityKind(authority: ReadinessAuthority): VisualAuthorityKind {
  const profileStatus = authority.profileStatus ?? null;
  const ruleAuthority = authority.ruleAuthority ?? null;
  if (profileStatus === 'verified' && ruleAuthority !== 'generic') return 'verified';
  if ((profileStatus == null && ruleAuthority == null) || profileStatus === 'generic' || ruleAuthority === 'generic') return 'generic';
  return 'limited';
}

function authorityModel(kind: VisualAuthorityKind, authoritative: boolean): VisualAuthorityModel {
  if (kind === 'verified') {
    return {
      kind,
      label: 'Provjereni fakultetski izvor',
      description: 'Rezultat se oslanja na provjereni fakultetski izvor.',
      authoritative,
    };
  }
  if (kind === 'limited') {
    return {
      kind,
      label: 'Djelomično provjeren izvor',
      description: 'Rezultat koristi djelomično provjeren ili ograđen profil, pa su nalazi moguća odstupanja, ne potvrđeni zahtjevi.',
      authoritative,
    };
  }
  return {
    kind,
    label: 'Opća provjera',
    description: 'Rezultat koristi opće provjere jer nema dovoljno podataka o izvoru pravila za ovaj studij.',
    authoritative,
  };
}

function scoredCheckCount(result: VisualResultInput): number {
  if (typeof result.scoredChecks === 'number' && Number.isFinite(result.scoredChecks) && result.scoredChecks >= 0) {
    return Math.floor(result.scoredChecks);
  }
  const checks = Array.isArray(result.checks) ? result.checks : [];
  return checks.filter((check) => check.scored && check.max > 0).length;
}

function scoreModel(result: VisualResultInput, authority: VisualAuthorityKind): VisualScoreModel {
  if (typeof result.score !== 'number' || !Number.isFinite(result.score)) {
    return { kind: 'unscored', label: 'Nije bodovano', reason: 'Rezultat nema bodovanu tehničku ocjenu.' };
  }
  const scoredChecks = scoredCheckCount(result);
  if (scoredChecks <= 0) {
    return { kind: 'unscored', label: 'Nije bodovano', reason: 'Za ovaj rezultat nisu dostupne bodovane provjere.' };
  }
  return {
    kind: 'scored',
    value: Math.max(0, Math.min(100, result.score)),
    max: 100,
    scoredChecks,
    authority,
  };
}

function acceptedEvidence(candidate: VisualExactEvidenceInput | undefined): { evidence: VisualExactEvidence; expected?: string } | null {
  if (!candidate || candidate.verified !== true) return null;
  if (!('page' in candidate) || !(candidate.page === null || (typeof candidate.page === 'number' && Number.isFinite(candidate.page) && Number.isInteger(candidate.page) && candidate.page >= 1))) return null;
  const sourceId = trimString(candidate.sourceId);
  const title = trimString(candidate.title);
  const url = trimString(candidate.url);
  const quote = trimString(candidate.quote);
  if (!sourceId || !title || !url || !quote) return null;
  const expected = trimString(candidate.expected);
  const pageLabel = trimString(candidate.pageLabel);
  return {
    evidence: { verified: true, sourceId, title, url, quote, page: candidate.page, pageLabel: pageLabel ?? null },
    ...(expected ? { expected } : {}),
  };
}

function repairSignalFor(finding: FindingViewModel, repairItems: readonly VisualRepairSignal[]): boolean {
  if (finding.autoRepairable) return true;
  return repairItems.some((item) => {
    const fixerId = trimString(item.fixerId) ?? trimString(item.fixId);
    if (!fixerId) return false;
    if (item.findingIds?.includes(finding.id)) return true;
    return Boolean(item.matchKeys?.some((key) => finding.matchKeys.includes(key)));
  });
}

function stableKeysByIndex(result: VisualResultInput, ruleEntries: readonly RuleEntry[] | undefined): Map<number, string> {
  if (!ruleEntries?.length) return new Map();
  const checks: Check[] = Array.isArray(result.checks) ? result.checks : [];
  const issues: Issue[] = Array.isArray(result.issues) ? result.issues : [];
  return new Map(identifyFindings(checks, issues, [...ruleEntries]).map((identity, index) => [index, identity.issueKey]));
}

function nonNegativeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function readinessSignals(result: VisualResultInput, readiness: ResultReadiness): VisualReadinessSignals {
  const checks = Array.isArray(result.checks) ? result.checks : [];
  return {
    blockers: readiness.blockers,
    warnings: readiness.improvements,
    manualReviews: readiness.manualReviews,
    automaticFixes: nonNegativeCount(result.details?.triage?.counts?.auto),
    informationalChecks: checks.filter((check) => check.max === 0).length,
    totalChecks: checks.length,
  };
}

function headerModel(result: VisualResultInput, authority: VisualAuthorityKind): VisualResultHeaderModel {
  return {
    documentName: trimString(result.file?.name) ?? 'Dokument',
    profile: trimString(result.profile) ?? 'Profil nije odabran',
    profileStatus: trimString(result.profileStatus),
    profileConfirmed: authority === 'verified',
    authorityLabel: authority === 'verified' ? 'Pravila provjerena prema službenim izvorima' : 'Opseg provjere ima ograničenja',
  };
}
function categoryModels(input: VisualResultInput['categories']): VisualCategoryModel[] {
  if (!input) return [];
  const labels: Record<string, string> = { formatting: 'Oblikovanje', structure: 'Struktura', citations: 'Citatnice', elements: 'Elementi' };
  return Object.entries(input).flatMap(([id, value]) => {
    const max = Number(value?.max);
    const earned = Number(value?.earned);
    if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(earned)) return [];
    return [{ id, label: labels[id] ?? id, earned, max, percentage: Math.max(0, Math.min(100, Math.round((earned / max) * 100))) }];
  });
}


function contentFreeScore(score: VisualScoreModel): VisualResultContentFreeMetadata['score'] {
  return score.kind === 'scored'
    ? { kind: 'scored', value: score.value, max: score.max, scoredChecks: score.scoredChecks }
    : { kind: 'unscored' };
}

export function buildVisualResultModel(result: VisualResultInput, options: VisualResultOptions = {}): VisualResultModel {
  const states = options.states ?? new Map<string, FindingSessionState>();
  const repairItems = options.repairItems ?? [];
  const stableKeys = stableKeysByIndex(result, options.ruleEntries);
  const findings = buildFindingViewModels(result, states);
  const documentFindings = findings.filter((finding) => finding.kind === 'document');
  const limitationFindings = findings.filter((finding) => finding.kind === 'limitation');
  const visualById = new Map<string, VisualFindingModel>();
  let exactEvidenceAvailable = false;

  const toVisualFinding = (finding: FindingViewModel): VisualFindingModel => {
    const stableIssueKey = stableKeys.get(finding.originalIndex);
    const exact = acceptedEvidence(options.exactEvidence?.[finding.id] ?? (stableIssueKey ? options.exactEvidence?.[stableIssueKey] : undefined));
    const repair = result.capabilities?.repair === true && repairSignalFor(finding, repairItems);
    if (exact) exactEvidenceAvailable = true;
    const clone: Partial<VisualFindingModel> = { ...finding };
    delete clone.expected;
    delete clone.source;
    const visual: VisualFindingModel = {
      ...(clone as Omit<FindingViewModel, 'source' | 'expected'>),
      ...(stableIssueKey ? { stableIssueKey } : {}),
      ...(exact ? { source: { title: exact.evidence.title, url: exact.evidence.url, exact: true }, exactEvidence: exact.evidence } : finding.source ? { source: finding.source } : {}),
      ...(exact?.expected ? { expected: exact.expected } : {}),
      capabilities: {
        preview: result.capabilities?.preview === true && finding.scope.kind === 'anchor',
        repair,
        exactEvidence: Boolean(exact),
      },
    };
    visualById.set(visual.id, visual);
    return visual;
  };

  const visualDocument = documentFindings.map(toVisualFinding);
  const visualLimitations = limitationFindings.map(toVisualFinding);
  const visualTop = topFindings(documentFindings, 3).map((finding) => visualById.get(finding.id) ?? toVisualFinding(finding));
  const documentIssueIndexes = new Set(documentFindings.map((finding) => finding.originalIndex));
  const documentIssues = (Array.isArray(result.issues) ? result.issues : []).filter((_, index) => documentIssueIndexes.has(index));
  const readinessAuthority = authorityInput(result);
  const readiness = resultReadiness(documentIssues, readinessAuthority);
  const authority = authorityKind(readinessAuthority);
  const score = scoreModel(result, authority);
  const signals = readinessSignals(result, readiness);
  const header = headerModel(result, authority);
  const categories = categoryModels(result.categories);
  const capabilities: VisualResultCapabilities = {
    preview: result.capabilities?.preview === true,
    repair: visualDocument.some((finding) => finding.capabilities.repair),
    exactEvidence: exactEvidenceAvailable,
  };

  return {
    score,
    readiness,
    signals,
    header,
    authority: authorityModel(authority, readiness.authoritative),
    findings: {
      document: visualDocument,
      limitations: visualLimitations,
      top: visualTop,
    },
    categories,
    capabilities,
    contentFreeMetadata: {
      score: contentFreeScore(score),
      readinessKind: readiness.kind,
      signals,
      authorityKind: authority,
      capabilities,
      documentFindingCount: visualDocument.length,
      limitationFindingCount: visualLimitations.length,
      documentFindingIds: visualDocument.map((finding) => finding.id),
      topFindingIds: visualTop.map((finding) => finding.id),
    },
  };
}
