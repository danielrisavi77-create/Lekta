/**
 * D0: vlastiti sinteticki contract slucajevi za Laya v2. Nisu studentski radovi, nisu gold set
 * i nisu ML evaluacija; dokazuju samo softverski ugovor.
 */
import { decisionCaseId, decisionInputDigest, modelDigest } from '../../scripts/laya/contracts-v2.ts';
import type {
  LayaCalibrationPolicy, LayaDecisionCaseV2, LayaDecisionResultV2, LayaRuntime,
} from '../../scripts/laya/contracts-v2.ts';
import type { CandidateSnapshot } from '../../scripts/laya/candidate-builder.ts';

export const DOC = '11111111-1111-4111-8111-111111111111';
export const GROUP = '22222222-2222-4222-8222-222222222222';
export const PROFILE_REV = 'a'.repeat(64);
export const ENGINE_REV = '9'.repeat(40);
export const REFERENCE_TEXT = 'Institut Primjer. (2024). Testni izvjestaj. Zagreb.';

export function makeCase(): LayaDecisionCaseV2 {
  const identity = { documentRevisionId: DOC, profileId: 'synthetic-profile', profileRevision: PROFILE_REV,
    checkId: 'reference.completeness' as const, paragraphIndex: 12, recordIndex: 0 };
  const engine = { revision: ENGINE_REV, checkStatus: 'warn' as const, linkage: 'explicit' as const };
  const modelInput = { text: REFERENCE_TEXT, language: 'hr' as const,
    ruleEvidence: { ruleId: 'owned-rule-v2', sourceId: 'owned-source-v2', locator: 'synthetic-rule:1',
      excerpt: 'U ovom sintetickom profilu zapis sadrzi autora, godinu, naslov i nakladnika.', snapshotHash: 'b'.repeat(64) } };
  return { schemaVersion: 2, caseId: decisionCaseId(identity), inputDigest: decisionInputDigest(identity, engine, modelInput),
    identity, provenance: { origin: 'owned_synthetic', permissionRef: 'owned-fixture-v2', localInferenceAllowed: true,
      trainingAllowed: false, externalInferenceAllowed: false, documentGroupId: DOC, sourceGroupId: GROUP, templateFamilyId: GROUP },
    engine, modelInput };
}

export function makeRuntime(): LayaRuntime {
  return { backend: 'laya-python', modelId: 'laya-fixture', modelRevision: 'c'.repeat(40), weightsSha256: 'd'.repeat(64),
    tokenizerSha256: 'e'.repeat(64), calibrationRevision: 'cal-fixture-1', runtimeVersion: '0.0.0-fixture', precision: 'fp32' };
}

export function makeResult(): LayaDecisionResultV2 {
  const c = makeCase();
  return { schemaVersion: 2, caseId: c.caseId, inputDigest: c.inputDigest, verdict: 'finding_supported',
    probabilities: { finding_supported: 0.7, possible_false_positive: 0.1, extraction_uncertain: 0.1, insufficient_evidence: 0.1 },
    answerConfidence: 0.8, runtime: makeRuntime() };
}

/** Prag je ovdje fixture vrijednost za test ugovora, ne kalibrirana politika. */
export function makePolicy(): LayaCalibrationPolicy {
  return { taskId: 'reference.completeness/finding-v2', modelDigest: modelDigest(makeRuntime()),
    calibrationRevision: 'cal-fixture-1', minAnswerConfidence: 0.5 };
}

/** Kanonski rezultat sadrzi polja koja builder NE smije citati; zato ih puni kanarincima. */
export function makeSnapshot(): CandidateSnapshot & { result: Record<string, unknown> } {
  const c = makeCase();
  return {
    documentRevisionId: DOC, profile: { id: c.identity.profileId, revision: PROFILE_REV }, engineRevision: ENGINE_REV,
    provenance: c.provenance,
    result: {
      score: 72,
      checks: [{ id: 'reference.completeness', status: 'warn' }, { id: 'page.margins', status: 'fail' }],
      issues: [{ title: 'Sinteticki nalaz', severity: 'warning' }],
      details: { triage: { findings: [{ id: 'chk:citations:potpunost', fixability: 'manual' }], counts: { auto: 0, assisted: 0, manual: 1, total: 1 } } },
      recipe: [{ fixerId: 'margins-fixer', ruleId: 'synthetic-rule', params: { margin: 2.5 } }],
    } as CandidateSnapshot['result'] & Record<string, unknown>,
    records: [{ checkId: 'reference.completeness', linkage: 'explicit', paragraphIndex: 12, recordIndex: 0,
      text: REFERENCE_TEXT, language: 'hr', ruleEvidence: c.modelInput.ruleEvidence }],
  };
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}
