import { isScoreEligible } from '../scoring/checks.ts';
import type { Check, Issue, MeasurementStatus } from '../scoring/checks.ts';

export type { MeasurementStatus } from '../scoring/checks.ts';

export interface CanonicalFinding {
  id: string;
  checkId: string | null;
  ruleId: string | null;
  category: string;
  severity: 'error' | 'warning' | 'info';
  status: 'pass' | 'fail' | 'warn' | 'info' | 'unknown';
  measurementStatus: MeasurementStatus;
  title: string;
  detail: string;
  locations: Array<{ where: string }>;
  evidence: string[];
  hasIssue: boolean;
  scored: boolean;
  scoreImpact: { earned: number; max: number } | null;
  blocking: boolean;
}

export interface CanonicalFindingInput {
  checks?: Check[];
  issues?: Issue[];
}

function normalizeStatus(status: string, measurementStatus: MeasurementStatus): CanonicalFinding['status'] {
  if (measurementStatus === 'unavailable') return 'unknown';
  if (status === 'pass' || status === 'fail' || status === 'warn' || status === 'info') return status;
  if (status === 'error') return 'fail';
  if (status === 'warning') return 'warn';
  return 'unknown';
}

function normalizeSeverity(severity: string, status: CanonicalFinding['status']): CanonicalFinding['severity'] {
  if (severity === 'error' || severity === 'warning' || severity === 'info') return severity;
  if (status === 'fail') return 'error';
  if (status === 'warn') return 'warning';
  return 'info';
}

function sameIssue(left: Issue, right: Issue): boolean {
  return left.category === right.category && left.title === right.title && left.where === right.where;
}

function addUnique(values: string[], value: string): void {
  if (value && !values.includes(value)) values.push(value);
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function unmatchedIssueBase(issue: Issue): string {
  return `issue:${stableHash(`${issue.category}\u001f${issue.title}\u001f${issue.where}`)}`;
}

function unmatchedIssueId(issue: Issue, counts: Map<string, number>): string {
  const base = unmatchedIssueBase(issue);
  const count = (counts.get(base) ?? 0) + 1;
  counts.set(base, count);
  return count === 1 ? base : `${base}:${count}`;
}

export function buildCanonicalFindings(input: CanonicalFindingInput): CanonicalFinding[] {
  const checks = input.checks ?? [];
  const issues = input.issues ?? [];
  const consumedIssues = new Set<number>();
  const findings: CanonicalFinding[] = [];

  for (const check of checks) {
    let matchingIssue = check.issue;
    if (check.issue) {
      const matchingIndex = issues.findIndex((candidate, index) => !consumedIssues.has(index) && sameIssue(candidate, check.issue!));
      if (matchingIndex >= 0) {
        matchingIssue = issues[matchingIndex];
        consumedIssues.add(matchingIndex);
      }
    }

    const measurementStatus = check.measurementStatus;
    const status = normalizeStatus(check.status, measurementStatus);
    const evidence: string[] = [];
    addUnique(evidence, check.detail);

    findings.push({
      id: `check:${check.id}`,
      checkId: check.id,
      ruleId: null,
      category: check.category,
      severity: normalizeSeverity(matchingIssue?.severity ?? '', status),
      status,
      measurementStatus,
      title: matchingIssue?.title ?? check.title,
      detail: matchingIssue?.detail ?? check.detail,
      locations: matchingIssue ? [{ where: matchingIssue.where }] : [],
      evidence,
      hasIssue: !!matchingIssue,
      scored: isScoreEligible(check),
      scoreImpact: isScoreEligible(check) ? { earned: check.earned, max: check.max } : null,
      blocking: false,
    });
  }

  const idCounts = new Map<string, number>();
  issues.forEach((issue, index) => {
    if (consumedIssues.has(index)) return;
    const status = normalizeStatus(issue.severity, 'measured');
    findings.push({
      id: unmatchedIssueId(issue, idCounts),
      checkId: null,
      ruleId: null,
      category: issue.category,
      severity: normalizeSeverity(issue.severity, status),
      status,
      measurementStatus: 'measured',
      title: issue.title,
      detail: issue.detail,
      locations: [{ where: issue.where }],
      evidence: issue.detail ? [issue.detail] : [],
      hasIssue: true,
      scored: false,
      scoreImpact: null,
      blocking: false,
    });
  });

  return findings;
}
