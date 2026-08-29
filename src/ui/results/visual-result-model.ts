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

export type VisualScoreModel =
  | { kind: 'scored'; value: number; max: 100; scoredChecks: number; authority: VisualAuthorityKind }
  | { kind: 'unscored'; label: string; reason: string };

export interface VisualExactEvidenceInput {
  verified?: boolean;
  sourceId?: string;
  title?: string;
  url?: string;
  quote?: string;
  page?: number | null;
  expected?: string;
}

export interface VisualExactEvidence {
  verified: true;
  sourceId: string;
  title: string;
  url: string;
  quote: string;
  page: number | null;
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

export interface VisualDocumentDnaSegmentInput {
  id: string;
  label: string;
  value: string;
  page?: number | null;
}

export interface VisualDocumentDnaAvailable {
  kind: 'available';
  segments: VisualDocumentDnaSegmentInput[];
}

export interface VisualDocumentDnaUnavailable {
  kind: 'unavailable';
  reason: string;
}

export type VisualDocumentDnaModel = VisualDocumentDnaAvailable | VisualDocumentDnaUnavailable;

export interface VisualRepairSignal {
  fixerId?: string | null;
  fixId?: string | null;
  matchKeys?: readonly string[];
  findingIds?: readonly string[];
}

export interface VisualResultInput extends FindingResultInput {
  score?: number | null;
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
  documentDnaSegments?: readonly VisualDocumentDnaSegmentInput[];
  ruleEntries?: readonly RuleEntry[];
}

export interface VisualResultContentFreeMetadata {
  score: { kind: 'scored'; value: number; max: 100; scoredChecks: number } | { kind: 'unscored' };
  readinessKind: ResultReadiness['kind'];
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
  authority: VisualAuthorityModel;
  findings: {
    document: VisualFindingModel[];
    limitations: VisualFindingModel[];
    top: VisualFindingModel[];
  };
  capabilities: VisualResultCapabilities;
  documentDna: VisualDocumentDnaModel;
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
      label: 'Djelomicno provjeren izvor',
      description: 'Rezultat koristi djelomicno provjeren ili ogradjen profil.',
      authoritative,
    };
  }
  return {
    kind,
    label: 'Opca provjera',
    description: 'Rezultat koristi opce provjere ili nema dovoljno podataka o izvoru pravila.',
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
    return { kind: 'unscored', label: 'Nije bodovano', reason: 'Rezultat nema bodovanu tehnicku ocjenu.' };
  }
  return {
    kind: 'scored',
    value: Math.max(0, Math.min(100, result.score)),
    max: 100,
    scoredChecks: scoredCheckCount(result),
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
  return {
    evidence: { verified: true, sourceId, title, url, quote, page: candidate.page },
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

function documentDna(segments: readonly VisualDocumentDnaSegmentInput[] | undefined): VisualDocumentDnaModel {
  if (!segments?.length) return { kind: 'unavailable', reason: 'Document DNA is not available for this result.' };
  return {
    kind: 'available',
    segments: segments.map((segment) => ({
      id: segment.id,
      label: segment.label,
      value: segment.value,
      ...(Object.prototype.hasOwnProperty.call(segment, 'page') ? { page: segment.page ?? null } : {}),
    })),
  };
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
  const capabilities: VisualResultCapabilities = {
    preview: result.capabilities?.preview === true,
    repair: visualDocument.some((finding) => finding.capabilities.repair),
    exactEvidence: exactEvidenceAvailable,
  };

  return {
    score,
    readiness,
    authority: authorityModel(authority, readiness.authoritative),
    findings: {
      document: visualDocument,
      limitations: visualLimitations,
      top: visualTop,
    },
    capabilities,
    documentDna: documentDna(options.documentDnaSegments),
    contentFreeMetadata: {
      score: contentFreeScore(score),
      readinessKind: readiness.kind,
      authorityKind: authority,
      capabilities,
      documentFindingCount: visualDocument.length,
      limitationFindingCount: visualLimitations.length,
      documentFindingIds: visualDocument.map((finding) => finding.id),
      topFindingIds: visualTop.map((finding) => finding.id),
    },
  };
}
