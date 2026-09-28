import type { RuleEntry, SourceEntry } from '../profiles/profile-schema.ts';
import { DETECTOR_CHECK_BY_RULE } from './detector-check-map.ts';

export type AiEvidenceAuditReasonCode =
  | 'evidence-missing'
  | 'evidence-structure-incomplete'
  | 'schema-version-unsupported'
  | 'profile-id-mismatch'
  | 'rule-id-mismatch'
  | 'source-missing'
  | 'source-id-mismatch'
  | 'unofficial-source'
  | 'source-snapshot-missing'
  | 'source-url-mismatch'
  | 'source-fetch-mismatch'
  | 'snapshot-hash-mismatch'
  | 'snapshot-content-hash-mismatch'
  | 'source-page-missing'
  | 'source-page-mismatch'
  | 'quote-missing'
  | 'quote-mismatch'
  | 'quote-not-found'
  | 'value-mismatch'
  | 'scope-ambiguous'
  | 'scope-mismatch'
  | 'modality-ambiguous'
  | 'modality-mismatch'
  | 'passes-incomplete'
  | 'passes-disagree'
  | 'passes-model-missing'
  | 'passes-model-mismatch'
  | 'passes-same-provider'
  | 'provider-unknown'
  | 'model-metadata-missing'
  | 'summary-missing'
  | 'manifest-missing'
  | 'manifest-reference-mismatch'
  | 'manifest-id-mismatch'
  | 'manifest-profile-mismatch'
  | 'manifest-rule-mismatch'
  | 'manifest-test-mismatch'
  | 'manifest-command-mismatch'
  | 'manifest-input-hash-mismatch'
  | 'manifest-output-hash-mismatch'
  | 'manifest-time-mismatch'
  | 'manifest-stale-repair'
  | 'manifest-stale-analysis'
  | 'manifest-check-mismatch'
  | 'manifest-kind-mismatch'
  | 'manifest-rule-value-mismatch'
  | 'test-failed';

export interface AiEvidenceAuditReason {
  code: AiEvidenceAuditReasonCode;
  message: string;
}

export interface AiEvidenceAuditPass {
  pass: 'extract' | 'quote-check' | 'refute';
  verdict: 'confirm' | 'mismatch' | 'refute';
  note: string;
  model?: { provider: string; model: string; version: string };
}

/** Privatni, strukturirani audit trag uz jedno profilno pravilo. */
export interface AiEvidenceAudit {
  schemaVersion: 1 | 2;
  profileId: string;
  ruleId: string;
  sourceId: string;
  sourceUrl: string;
  fetchedAt: string;
  snapshotHash: string;
  sourcePage: string;
  quote: string;
  claim: {
    value: unknown;
    modality: RuleEntry['modality'] | null;
    scope: RuleEntry['scope'] | null;
  };
  passes: AiEvidenceAuditPass[];
  /** Informativno polje; nikad nije dovoljno bez provjere svih passes i manifesta. */
  agree: boolean;
  summary: string;
  model: { provider: string; model: string; version: string };
  execution: {
    manifestId: string;
    testId: string;
    command: string;
    inputHash: string;
    outputHash: string;
    ranAt: string;
  };
}

/**
 * Oblik manifesta nakon što ga je pozivatelj razriješio iz artefakta postojećeg harnessa.
 * Ova čista funkcija ne čita proizvoljne putanje niti prihvaća samoprijavljeni `pass` iz AI izlaza.
 */
export interface AiEvidenceExecutionManifest {
  kind?: 'repair' | 'detector';
  manifestId: string;
  profileId: string;
  ruleId: string;
  testId: string;
  command: string;
  outcome: 'pass' | 'fail' | 'skipped';
  inputHash: string;
  outputHash: string;
  repairSourceHash?: string;
  /** Detector manifests bind both analysis runs, including no-op output bytes. */
  analysisSourceHash?: string;
  ruleCheckId?: string;
  checkId?: string;
  violatingOutputHash?: string;
  correctInputHash?: string;
  failureReason?: string;
  ruleValueHash: string;
  ranAt: string;
}

export interface AiEvidenceAuditInput {
  profileId: string;
  rule: RuleEntry;
  source: SourceEntry | undefined;
  /** Izvorne datoteke bajtovi, prije izdvajanja vidljivog teksta. */
  snapshotBytes: Uint8Array;
  /** SHA-256 izvornih bajtova, izracunat u pouzdanom adapteru. */
  snapshotSha256?: string;
  currentRepairSourceHash?: string;
  currentAnalysisSourceHash?: string;
  ruleValueSha256?: string;
  snapshotText: string;
  evidence: AiEvidenceAudit | undefined;
  /** Mora biti razriješen iz izlaza stvarnog test/DOCX harness-a. */
  manifest: AiEvidenceExecutionManifest | null | undefined;
}

export type AiEvidenceAuditResult =
  | { valid: true; reasons: [] }
  | { valid: false; reasons: AiEvidenceAuditReason[] };

const OFFICIAL_AUTHORITIES = new Set<RuleEntry['authority']>(['binding', 'program-page', 'general']);
const SHA256 = /^[a-f0-9]{64}$/;
const REQUIRED_PASSES = ['extract', 'quote-check', 'refute'] as const;
const PROVIDER_ALIASES = new Map<string, 'openai' | 'anthropic'>([
  ['openai', 'openai'], ['openaicodex', 'openai'],
  ['anthropic', 'anthropic'], ['claude', 'anthropic'], ['anthropicclaude', 'anthropic'],
]);

function canonicalProvider(value: unknown): 'openai' | 'anthropic' | null {
  if (typeof value !== 'string') return null;
  return PROVIDER_ALIASES.get(value.trim().toLowerCase().replace(/[\s_-]/g, '')) ?? null;
}

/** Ista provjera provenijencije modela za audit i profilni validator. */
export function schema2ProviderProblems(evidence: AiEvidenceAudit): Array<
  'provider-unknown' | 'passes-model-missing' | 'passes-same-provider' | 'passes-model-mismatch'
> {
  const problems: Array<'provider-unknown' | 'passes-model-missing' | 'passes-same-provider' | 'passes-model-mismatch'> = [];
  const passes = Array.isArray(evidence.passes) ? evidence.passes : [];
  const extract = passes.find((pass) => pass?.pass === 'extract');
  const refute = passes.find((pass) => pass?.pass === 'refute');
  const topProvider = canonicalProvider(evidence.model?.provider);
  const passProviders = passes.filter((pass) => pass?.model)
    .map((pass) => canonicalProvider(pass.model!.provider));
  if (!topProvider || passProviders.some((provider) => !provider)) problems.push('provider-unknown');
  const validModel = (pass: AiEvidenceAuditPass | undefined) => pass?.model
    && [pass.model.provider, pass.model.model, pass.model.version]
      .every((part) => typeof part === 'string' && part.trim().length > 0);
  if (!validModel(extract) || !validModel(refute)) {
    problems.push('passes-model-missing');
  } else {
    const extractModel = extract!.model!;
    const extractProvider = canonicalProvider(extractModel.provider);
    const refuteProvider = canonicalProvider(refute!.model!.provider);
    if (extractProvider && extractProvider === refuteProvider) problems.push('passes-same-provider');
    if (extractProvider !== topProvider
        || extractModel.model.trim() !== evidence.model?.model?.trim()
        || extractModel.version.trim() !== evidence.model?.version?.trim()) {
      problems.push('passes-model-mismatch');
    }
  }
  return problems;
}

function normalizedQuote(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

export function detectorManifestId(manifest: AiEvidenceExecutionManifest): string {
  return [
    'detector', manifest.profileId, manifest.ruleId, manifest.ruleCheckId, manifest.checkId,
    manifest.inputHash, manifest.violatingOutputHash, manifest.correctInputHash, manifest.outputHash,
    manifest.analysisSourceHash, manifest.ruleValueHash, manifest.outcome,
  ].join(':');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validira sve veze dokaznog paketa bez pristupa disku ili drugim globalnim izvorima. */
export function auditAiEvidence(input: AiEvidenceAuditInput): AiEvidenceAuditResult {
  const reasons: AiEvidenceAuditReason[] = [];
  const add = (code: AiEvidenceAuditReasonCode, message: string) => reasons.push({ code, message });
  const { evidence, manifest, rule, source } = input;

  if (!evidence) {
    add('evidence-missing', 'Nedostaje strukturirani AI dokazni paket.');
    return { valid: false, reasons };
  }

  const rawEvidence = evidence as unknown as Record<string, unknown>;
  const claim = rawEvidence.claim;
  const model = rawEvidence.model;
  const execution = rawEvidence.execution;
  const passesValue = rawEvidence.passes;
  const hasRequiredStrings = [
    rawEvidence.profileId,
    rawEvidence.ruleId,
    rawEvidence.sourceId,
    rawEvidence.sourceUrl,
    rawEvidence.fetchedAt,
    rawEvidence.snapshotHash,
    rawEvidence.sourcePage,
    rawEvidence.quote,
    rawEvidence.summary,
    isRecord(model) ? model.provider : undefined,
    isRecord(model) ? model.model : undefined,
    isRecord(model) ? model.version : undefined,
    isRecord(execution) ? execution.manifestId : undefined,
    isRecord(execution) ? execution.testId : undefined,
    isRecord(execution) ? execution.command : undefined,
    isRecord(execution) ? execution.inputHash : undefined,
    isRecord(execution) ? execution.outputHash : undefined,
    isRecord(execution) ? execution.ranAt : undefined,
  ].every((value) => typeof value === 'string');
  if (
    !hasRequiredStrings
    || !isRecord(claim)
    || !Object.hasOwn(claim, 'value')
    || !Array.isArray(passesValue)
    || passesValue.some((pass) => !isRecord(pass)
      || typeof pass.pass !== 'string'
      || typeof pass.verdict !== 'string'
      || typeof pass.note !== 'string')
  ) {
    add('evidence-structure-incomplete', 'AI dokazni paket nema sva obvezna strukturirana polja.');
    return { valid: false, reasons };
  }

  if (evidence.schemaVersion !== 1 && evidence.schemaVersion !== 2) add('schema-version-unsupported', 'Nepodržana verzija AI dokaznog paketa.');
  if (evidence.profileId !== input.profileId) add('profile-id-mismatch', 'AI dokaz pripada drugom profilu.');
  if (evidence.ruleId !== rule.ruleId) add('rule-id-mismatch', 'AI dokaz pripada drugom pravilu.');

  if (!source) {
    add('source-missing', 'Službeni izvor nije razriješen iz registra.');
  } else {
    if (rule.sourceId !== source.id || evidence.sourceId !== source.id) {
      add('source-id-mismatch', 'Identitet izvora u profilu, registru i AI dokazu nije isti.');
    }
    if (!OFFICIAL_AUTHORITIES.has(rule.authority)) add('unofficial-source', 'Pravilo nema službeni autoritet.');
    if (!source.snapshotPath || !source.snapshotHash || !source.fetchedAt) {
      add('source-snapshot-missing', 'Službeni izvor nema dohvaćeni snapshot s hashom.');
    } else {
      if (evidence.sourceUrl !== source.url) add('source-url-mismatch', 'URL u AI dokazu ne odgovara registru izvora.');
      if (evidence.fetchedAt !== source.fetchedAt) add('source-fetch-mismatch', 'Vrijeme dohvata u AI dokazu ne odgovara registru izvora.');
      if (evidence.snapshotHash !== source.snapshotHash || !SHA256.test(evidence.snapshotHash)) {
        add('snapshot-hash-mismatch', 'Snapshot hash u AI dokazu ne odgovara registru ili nije SHA-256.');
      }
      if (!input.snapshotSha256 || input.snapshotSha256 !== source.snapshotHash) {
        add('snapshot-content-hash-mismatch', 'Izvorni bajtovi snapshota ne odgovaraju registriranom SHA-256 hashu.');
      }
    }
  }

  if (!evidence.sourcePage.trim()) add('source-page-missing', 'AI dokaz nema lokator stranice ili odjeljka.');
  if (!rule.sourcePage?.trim() || evidence.sourcePage !== rule.sourcePage) {
    add('source-page-mismatch', 'Lokator AI dokaza ne odgovara lokatoru profilnog pravila.');
  }
  if (!evidence.quote.trim()) {
    add('quote-missing', 'AI dokaz nema citat.');
  } else {
    if (!rule.quote || normalizedQuote(evidence.quote) !== normalizedQuote(rule.quote)) {
      add('quote-mismatch', 'Citat u AI dokazu ne odgovara citatu profilnog pravila.');
    }
    if (!normalizedQuote(input.snapshotText).includes(normalizedQuote(evidence.quote))) {
      add('quote-not-found', 'Citat nije pronađen u snapshotu uz dopuštenu normalizaciju redaka i razmaka.');
    }
  }

  if (stableJson(evidence.claim.value) !== stableJson(rule.value)) {
    add('value-mismatch', 'Izdvojena vrijednost ne odgovara vrijednosti profilnog pravila.');
  }
  if (!evidence.claim.scope) add('scope-ambiguous', 'Opseg tvrdnje nije razriješen.');
  else if (!rule.scope || evidence.claim.scope !== rule.scope) add('scope-mismatch', 'Opseg AI dokaza ne odgovara opsegu profilnog pravila.');
  if (!evidence.claim.modality) add('modality-ambiguous', 'Modalitet tvrdnje nije razriješen.');
  else if (!rule.modality || evidence.claim.modality !== rule.modality) add('modality-mismatch', 'Modalitet AI dokaza ne odgovara modalitetu profilnog pravila.');

  const passes = Array.isArray(evidence.passes) ? evidence.passes : [];
  const passNames = passes.map((pass) => pass.pass);
  if (
    REQUIRED_PASSES.some((pass) => passNames.filter((name) => name === pass).length !== 1)
    || passNames.length !== REQUIRED_PASSES.length
    || passes.some((pass) => !pass.note.trim())
  ) {
    add('passes-incomplete', 'Potrebna su točno tri različita, obrazložena prolaza: extract, quote-check i refute.');
  }
  if (!evidence.agree || passes.some((pass) => pass.verdict !== 'confirm')) {
    add('passes-disagree', 'Prolazi nisu svi potvrdili isto pravilo.');
  }
  if (evidence.schemaVersion === 2) {
    const messages = {
      'provider-unknown': 'Nova shema dopušta samo poznate OpenAI i Anthropic providere.',
      'passes-model-missing': 'Nova shema traži identitet modela za extract i refute prolaz.',
      'passes-same-provider': 'Extract i refute u novoj shemi moraju imati različite providere.',
      'passes-model-mismatch': 'Zbirni identitet modela ne odgovara extract prolazu.',
    } as const;
    for (const code of schema2ProviderProblems(evidence)) add(code, messages[code]);
  }
  if (![evidence.model.provider, evidence.model.model, evidence.model.version].every((part) => part.trim())) {
    add('model-metadata-missing', 'Nedostaje identitet providera, modela ili verzije.');
  }
  if (!evidence.summary.trim()) add('summary-missing', 'Nedostaje sažetak zaključka audita.');

  if (!manifest) {
    add('manifest-missing', 'Nije razriješen izvršni manifest iz testnog ili DOCX harnessa.');
  } else {
    const expectedManifestId = manifest.kind === 'detector'
      ? detectorManifestId(manifest)
      : `closed-loop:${manifest.profileId}:${manifest.ruleId}:${manifest.inputHash}:${manifest.outputHash}:${manifest.outcome}`;
    if (manifest.manifestId !== expectedManifestId) {
      add('manifest-id-mismatch', 'ID manifesta ne veže profil, pravilo i hashove opaženog ulaza/izlaza.');
    }
    if (evidence.execution.manifestId !== manifest.manifestId) add('manifest-reference-mismatch', 'Referenca ne odgovara razriješenom manifestu.');
    if (manifest.profileId !== input.profileId || evidence.profileId !== manifest.profileId) {
      add('manifest-profile-mismatch', 'Izvršni manifest pripada drugom profilu.');
    }
    if (manifest.ruleId !== rule.ruleId || evidence.ruleId !== manifest.ruleId) {
      add('manifest-rule-mismatch', 'Izvršni manifest pripada drugom pravilu.');
    }
    if (evidence.execution.testId !== manifest.testId) add('manifest-test-mismatch', 'Test ID ne odgovara razriješenom manifestu.');
    if (evidence.execution.command !== manifest.command) add('manifest-command-mismatch', 'Naredba izvođenja ne odgovara razriješenom manifestu.');
    if (!SHA256.test(evidence.execution.inputHash) || evidence.execution.inputHash !== manifest.inputHash) {
      add('manifest-input-hash-mismatch', 'Ulazni hash nije valjan ili ne odgovara izvršnom manifestu.');
    }
    if (!SHA256.test(evidence.execution.outputHash) || evidence.execution.outputHash !== manifest.outputHash) {
      add('manifest-output-hash-mismatch', 'Izlazni hash nije valjan ili ne odgovara izvršnom manifestu.');
    }
    if (evidence.execution.ranAt !== manifest.ranAt) add('manifest-time-mismatch', 'Vrijeme izvođenja ne odgovara izvršnom manifestu.');
    if (manifest.kind === 'detector') {
      if (rule.autoFixable === true && !!rule.fixerId) {
        add('manifest-kind-mismatch', 'Pravilo s automatskim popravkom traži closed-loop dokaz popravka.');
      }
      if (!manifest.ruleCheckId || manifest.ruleCheckId !== rule.checkId || !manifest.checkId
        || manifest.checkId !== DETECTOR_CHECK_BY_RULE[rule.checkId ?? '']) {
        add('manifest-check-mismatch', 'Manifest detektora ne veže profilnu os i stvarni check.id.');
      }
      if (!SHA256.test(manifest.violatingOutputHash ?? '') || !SHA256.test(manifest.correctInputHash ?? '')) {
        add('manifest-input-hash-mismatch', 'Nedostaju hashovi oba ulaza i izlaza detektora.');
      }
      if (!SHA256.test(manifest.analysisSourceHash ?? '') || manifest.analysisSourceHash !== input.currentAnalysisSourceHash) {
        add('manifest-stale-analysis', 'Kod analize se promijenio nakon izvršnog mjerenja.');
      }
    } else if (!SHA256.test(manifest.repairSourceHash ?? '') || manifest.repairSourceHash !== input.currentRepairSourceHash) {
      add('manifest-stale-repair', 'Kod popravka se promijenio nakon izvršnog mjerenja.');
    }
    if (!SHA256.test(manifest.ruleValueHash) || manifest.ruleValueHash !== input.ruleValueSha256) {
      add('manifest-rule-value-mismatch', 'Vrijednost pravila ne odgovara vrijednosti pri izvršnom mjerenju.');
    }
    if (manifest.outcome !== 'pass') add('test-failed', 'Razriješeni izvršni manifest nema uspješan ishod.');
  }

  return reasons.length ? { valid: false, reasons } : { valid: true, reasons: [] };
}
