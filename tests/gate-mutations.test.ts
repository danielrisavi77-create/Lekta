import { retractionUiProblems, citatSource, analyzerSource, verificationFocusProblems } from './helpers/retraction-ui-guard';
/**
 * MUTACIJSKO TESTIRANJE VERIFIKACIJSKIH VRATA.
 *
 * Zasto postoji: svaki gard u ovom lancu tvrdi da nesto hvata, ali sama ta tvrdnja nije provjerena
 * nicim. Gard koji ne grize je gori od nikakvog, jer daje zeleno i zaustavlja daljnje traganje. Ovaj
 * test podmece POZNATE kvarove i trazi da ih gard prijavi. Ishod je jedna brojka koja zamjenjuje
 * rucni pregled: "N od N mutacija uhvaceno".
 *
 * Da to nije teorijski strah, izmjereno je vise puta u ovom projektu:
 *  - `paper-size` izvod je IGNORIRAO vrijednost i uvijek trazio A4, pa bi se tvrdnja `A3` "izvela"
 *    iz citata o A4; gard je izgledao zdravo dok se nije podmetnula kriva vrijednost.
 *  - `audit_scored_quotes` nije prijavio citat s pokrivanjem 0,21 (prag 0,85), jer ga je
 *    `has_scanned_pages` proglasio neprovjerivim. Drugi prolaz ISTIM alatom bi ga opet propustio.
 *  - `tests/rule-compiler.test.ts` godinu dana usporedjuje `clone(rules)` s `rules` nad registrom
 *    bez ijednog `ruleEntry`: prolazi vakuumski.
 *
 * PRAVILA OVOG TESTA:
 *  1. Mutira se SAMO u memoriji. Nijedna datoteka repozitorija se ne dira. Jedina iznimka su
 *     privremene datoteke izvan repozitorija (`mkdtemp` pod `tmpdir()`, obrisane u `finally`) kad gard
 *     po ugovoru cita stablo s diska, npr. `crlf/citanje-bez-normalizacije` (T92).
 *  2. Svaka mutacija ima i BASELINE tvrdnju: nemutiran ulaz mora biti cist. Bez toga mutacija koja
 *     "prolazi" moze prolaziti zato sto gard vristi na sve, a ne zato sto je pogodio.
 *  3. Mutacija imenuje STVARAN kvar koji imitira, ne izmisljen.
 */
import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { createHash } from 'node:crypto';
import { linesPerPageCapacity } from '../src/scoring/lines-per-page';
import {
  SVA_STANJA, SVI_DOGADAJI, transition,
  type WizardEvent, type WizardState,
} from '../src/ui/wizard-machine';
import { countsAsRealDocxProof, type EvidenceManifest, type ProofMethod } from '../src/corpus/evidence-manifest';
import { DOCX_SHAPE_IDS, verifyShapeClaims, type DocxShapeCounts } from '../src/corpus/docx-shapes';
import { aggregateByFixer, deadFixers, type DocumentMeasurement } from '../scripts/corpus-gen/net-core.mts';
import { classifyOutcome, comparisonIsVacuous, divergentRows, type ComparisonRow } from '../src/corpus/tool-comparison';
import { isSupported, renderDefectFragment, type DefectClass } from '../src/corpus/tool-feedback';
import { renderEvalCases, type EvalClass } from '../src/corpus/tool-evals';
import extractionIndex from '../data/tools/citation-specs/extractions/INDEX.json';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import esbuild from 'esbuild';
import { basename, dirname, join, resolve } from 'node:path';
import { runVerificationGate, isRuleScored } from '../src/verification/verification-gate';
import { findScoredValueFindings, sameRuleValue } from '../src/verification/scored-value-binding';
import { buildExactEvidence } from '../src/ui/results/exact-evidence';
import { hasNaiveEntryGuard } from './helpers/entry-guard';
import { parseXml, ZipReader, effectiveHidden } from '../src/docx/parser';
import { runMetrics } from '../src/audits/metrics';
import { buildDocx } from './helpers/docx-builder';
import { srcLayaImportProblems } from './helpers/laya-src-boundary';
import { copyProblems, liveBoundaryProblems, motionCssProblems } from './helpers/analysis-live-guard';
import { cijenaProblems, plusBodIzvorProblems, plusBodProblems } from './helpers/result-live-guard';
import { ladica, pocetniOdabir, prsten, zahvatiPlana } from '../src/ui/result-live/result-live-model';
import { ALLOWED_FINDINGS, falseFindingProblems, type FindingKey } from './helpers/false-findings';
import { manualHeadingCandidates } from '../src/analysis/manual-heading-candidates';
import { loadVerifyExistence, retractionProblems, retractionIdentityProblems, loadVerificationSummary, retractionSummaryProblems, verifyBadgesSource, verifyExistenceSource } from './helpers/retraction-guard';
import { loadReferenceParser, referenceParserProblems, referenceParserSource } from './helpers/reference-parser-guard';
import { adjudicate } from '../scripts/laya/contracts-v2.ts';
import { buildLayaCandidates } from '../scripts/laya/candidate-builder.ts';
import { LAYA_ELIGIBLE_CHECKS, formalRegistryEntries, isLayaEligibleCheck } from '../scripts/laya/eligibility.ts';
import { makeCase, makePolicy, makeResult, makeRuntime, makeSnapshot } from './helpers/laya-v2-fixtures';
import { migrationHygieneProblems } from './helpers/migration-hygiene';
import { hasUnboundedFormData } from './helpers/edge-formdata';
import { isInOrigin } from '../scripts/site-origin.mjs';
import { runGuard5Block, writeSyntheticDist } from './helpers/seo-origin-wiring';
import { legalSyntheticDist, runLegalPlaceholderBlock } from './helpers/legal-placeholder-wiring';
import { findLegalPlaceholders } from '../scripts/lib/legal-placeholders.mjs';
import { dependabotIznimkaDrzi, napraviPrLinesRepo, PR_LINES_IZVOR } from './helpers/pr-lines-cli';
import { collectScannedSources, CRLF_DETECTORS, crlfGuardVerdict, crlfReadProblems } from './helpers/crlf-read-guard';
import { bundleFunkcije, mapaModula } from './helpers/eszip-fixture';
import {
  stripeSecretNameProblems,
  preflightSourceProblems,
  preflightExecutionProblems,
  runbookRefundCheckProblems,
  runbookManualLinkProblems,
  handlerRefundMarkers,
  paidClassificationProblems,
  refundClassificationProblems,
  refundReachabilityProblems,
  handlerOutcomes,
  naplataRunbookProblems,
  runbookSqlColumnProblems,
  runbookLogNameProblems,
  webhookMorLogNames,
  naplataDeployPathProblems,
  accountIdentityProblems,
  checkoutAccountScopeProblems,
  readTextLf,
} from './helpers/naplata-env';
import { parseCorpusPolicyHistory, type MigrationFile } from './helpers/corpus-contributions-rls';
import { webhookHandlerProblems, chargedAmountProblems, responseLeakProblems } from './helpers/webhook-handler-source';
import { wordOracleIntegrityProblems } from './helpers/word-oracle-integrity';
import {
  WORD_VERIFY_ALLOWLIST_LINE,
  WORD_VERIFY_CLEANUP_HELPER,
  WORD_VERIFY_CLEANUP_SCRIPTS,
  WORD_VERIFY_EMPTY_SET_SCRIPTS,
  wordVerifyCleanupProblems,
  wordVerifyEmptySetGuardProblems,
  wordVerifyHelperProblems,
} from './helpers/word-verify-cleanup';
import { requiredTiersDrift } from './helpers/autonomy-release-tiers';
import {
  naplataSecretsVerdict,
  supabaseSecretsVerdict,
  forbiddenSecretsVerdict,
  testModeEnvVerdict,
  parseSupabaseSecretsList,
  testModeVerdict,
  EMPTY_VALUE_DIGEST,
  TEST_MODE_ON_DIGEST,
  TEST_MODE_SECRET,
} from '../scripts/verify-naplata-secrets.mjs';
import {
  acceptEvent,
  classifyStripeEvent,
  chargedAmountVerdict,
  parseStripeEvent,
  IGNORE_REASON_PREFIXES,
  NOTABLE_IGNORE_PREFIXES,
  STRIPE_HANDLED_EVENTS,
  buildEntitlementInsert,
} from '../src/report/webhook';
import { quoteUpgrade, upgradeIdempotencyKey } from '../src/report/upgrade';
import {
  bonusOutboxWorkerProblems,
  entitlementAccessProblems,
  entitlementConsumerProblems,
  entitlementProductFkCount,
  entitlementSnapshotProblems,
  specialistFallbackProblems,
  specialistTierGateProblems,
  stripeSyncSafetyProblems,
  upgradeQuoteProblems,
  upgradeRefundTraceProblems,
  upgradeWiringProblems,
} from './helpers/monetizacija-v1-guards';
import { bonusOutboxModuleSource } from './helpers/bonus-outbox-source';
import { ENTITLEMENT_ACCESS_SELECT, entitlementRowFromDb } from '../src/report/entitlement-access';
import { billableMismatch, SPECIALIST_TIER_ENABLED } from '../src/report/billable-work-type';
import { applyGuard as stripeSyncApplyGuard, parseArgs as stripeSyncParseArgs } from '../scripts/stripe-sync-products.mjs';
import { checkoutMismatch } from '../src/report/checkout';
import { estimateWorkType, unambiguousMismatch } from '../src/report/work-type-estimate';
import { isReportWorkType } from '../src/report/pricing';
import { findBotsImplementingProtected, findImplementEffortDrift, findSameProviderWithoutFallback, findUnverifiedModelUsages, type BotSpec } from './helpers/agent-routing-checks';
import { botPathViolations } from '../scripts/agents/grok-bots.mjs';
import { FIXTURE_FILES, gradeTests, probeModel } from '../scripts/agents/model-probe.mjs';
import {
  localRepairFlagProblems,
  localRepairOfferProblems,
  localRepairPublicEndpointProblems,
} from './helpers/local-repair-flag-guard';
import { auditReleaseLaunchers as auditReleaseLaunchersRaw } from './helpers/release-launcher-audit';
import { mobileDocMetaProblems, mobileTapeProblems } from './helpers/mobile-tape-guard';
import { mentorCollapseProblems, mentorModuleFromSource, mentorResizeProblems, mobileTiltProblems } from './helpers/mobile-result-guards';
import { mobileFieldsProblems } from './helpers/mobile-fields-guard';
import { consentRevealFromSource, consentRevealProblems, consentThresholdProblems, mobileConsentProblems } from './helpers/mobile-consent-guard';
import { extractFingerprintInputFromDocx } from '../src/fingerprint/extract-from-docx';
import { linearnostProblemi, mutiraniSkener } from './helpers/fingerprint-legacy';
import { metaWithinBudget } from '../supabase/functions/_shared/read-body';
import { compareAuditToRatchet, syntheticAudit } from '../scripts/npm-audit-ratchet-core.mjs';
import * as prIntake from '../scripts/agents/pr-intake-core.mjs';
import auditRatchet from '../data/security/npm-audit-ratchet.json';
import { proofStaleness, treeDigestFromLsTree } from '../scripts/release-proof-core.mjs';
import { buildInfoVerdict, gateSummaryLine, releaseProofVerdict, workingTreeVerdict } from '../scripts/release-gate-core.mjs';
import { requiredTierIds } from '../scripts/release-tiers.mjs';
import { tier2Freshness } from '../scripts/tier2-freshness-core.mjs';
import { commitIdentityVerdict } from '../scripts/post-deploy-smoke.mjs';
import { buildCompletionLedger, pdfSeparationProblems, proofSourceProblems, type LedgerInputs } from '../src/verification/completion-ledger';
import { buildUpisnikProfileCandidates as buildRawUpisnikProfileCandidates, validateUpisnikProfileCoverageHolds } from '../src/programs/upisnik-profile-candidates';
import sourceRegistry from '../data/sources/source-registry.json';
import { validateDecisions } from '../src/programs/unit-match-decisions';
import upisnikRows from '../data/programs/drafts/upisnik.json';
import upisnikComponents from '../docs/generated/upisnik-program-components.json';
import upisnikProfiles from '../data/profiles/verified-profiles-heavy.json';
import upisnikProfileDecisions from '../data/programs/upisnik-profile-decisions.json';
import generatedUpisnikProfiles from '../docs/generated/upisnik-profile-candidates.json';
import { buildScoredValueDrift } from '../src/verification/scored-value-drift';
import { computeCoverageCell } from '../src/verification/coverage-report';
import { collectCompileDiagnostics, compileEffectiveRules } from '../src/profiles/rule-compiler';
import { computeBaseDemotedAdvisory, computeDemotedAdvisory } from '../src/profiles/advisory-demotion';
import { applyDemotion, demotionProtectedBy } from '../src/profiles/advisory-levers';
import { DRAFT_PROFILE_IDS, draftRuleEntriesFor } from '../src/profiles/drafts-runtime';
import { DEMOTABLE_CHECK_IDS } from '../src/profiles/advisory-levers';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import { checkSourceHashes } from '../scripts/verify-source-hashes.mjs';
import { repairSourceHashFromFiles } from '../scripts/lib/repair-source-hash.mjs';
import { dedupeManifest, witnessTransitions, type RealCorpusManifestEntry } from './real-corpus/harness';
import { witnessRatchetProblems } from './helpers/witness-ratchet';
import { attestationContentDigest, attestationRefusals, inheritedSignature } from '../scripts/lib/corpus-attestation-core.mjs';
import {
  measuredCodeProblem,
  provenPdfUnitWorkTypes,
  provenUnitWorkTypes,
  realSourceKindProblem,
  signedContentProblem,
  type CorpusAttestation,
} from '../src/verification/real-corpus-attestation';
import { attestationContentDigestSync } from '../src/verification/attestation-content-digest';
import { cspHeaderProblems, substituteCspTokens } from '../scripts/lib/csp-headers.mjs';
import { resolveCheckout, buildStripePaymentIntentParams } from '../src/report/checkout';
import { isSoldByLektaCheckout, mapProductRow } from '../src/catalog/products-catalog';
import { seededProducts } from './helpers/product-seeds';
import {
  REQUIRED_CONTEXT_FILES,
  REQUIRED_SCOPED_GUIDES,
  auditClaudeContext,
} from '../scripts/verify-claude-context-core.mjs';
import type { ThesisProfile, SourceEntry, RuleEntry } from '../src/profiles/profile-schema';
import { corpusSetOf, sidecarAdmitted, witnessIsolationProblems, type CorpusSidecar } from './real-corpus/corpus-track';
import { assertAxisEvidenceWiring, AXIS_SIGNAL } from './helpers/closed-loop-wiring';
import { buildHandoffQuery } from '../src/routes/intake/handoff-query';
import { handoffQueryProblems, intakeHandoffWiringProblems } from './helpers/handoff-query-contract';
import { APPLIED_AXIS_FIXER } from './helpers/coverage-cells';
import { applyRepairSelectionSnapshot, buildRepairSelectionSnapshot, repairItemsDigest } from '../src/ui/repair-selection';
import { buildRepairPanelHandle, classifyRepairReport, renderTableFigureRescueControls } from '../src/ui/repair-panel';
import { tableFigureRescueRepairableItem } from '../src/ui/repair-items';
import { bindRepairWorkflow } from '../src/ui/repair-workflow-binding';
import { detectIntegrityFailure } from '../src/repair/apply-fixers';
import {
  findBarePushWorkflows,
  findJobsRunningOnEdited,
  findPullRequestWithoutConcurrency,
  findSelfHostedProblems,
  type NamedWorkflow,
  type WorkflowFile,
} from './helpers/ci-workflow-triggers';
import { executePlan, measureDir, planCleanup } from '../scripts/clean-vitest-tmp.mjs';
import {
  LICENCE, SVI_ULAZI, listoviSWebfontom, preloadObrasci, problemiFontova, problemiGlasovaUlaza,
  problemiGrafaFontova, problemiLicenci, problemiOvisnosti, problemiPreloada, problemiRuta,
  problemiTokena, zabranjenaImena,
  DOPUSTENA_GEORGIA, STRANICE_PROZE, georgiaUSucelju, listoviStranice, monoUSerifnomNaglasku, naglasakUSerifu,
  problemiProzeStranice, svjetoviBezSinteze, tezineIznad400, uiNaSerifu, problemiDvaProlaza404,
} from './helpers/font-voices';
import { OZNAKA_404, ubaciU404, webfontFaces } from '../scripts/lib/legal-webfonts.mjs';
import { DISK, collectStaticGraph, packageImports, type IzvorDatoteka } from './helpers/module-graph';
import { hasMergedCells, tableFigureRescueFixer, type TableFigureRescueParams } from '../src/repair/table-figure-rescue-fixer';
import { anchorFingerprintForXml } from '../src/analysis/element-structure';
import { forwardsNpmCacheInput, jobsWithBareNpmCi, npmCacheProblems, unpinnedExternalUses } from './helpers/ci-workflow-cache';
import {
  falseGreenParityProblems, opportunitySqlScopeProblems, opportunityWiringProblems,
} from './helpers/opportunity-wiring';
import { opportunityMeasurementHealth } from '../src/admin/opportunity-ranking';
import { LEAN_READER_TOOLS, agentTools, leanReadOnlyViolations } from './helpers/lean-read-only';
import { judgeCpuDiscipline, packageScriptReader, HEAVY_BINARIES } from '../scripts/hooks/cpu-discipline.mjs';
import { decideStop, MAX_BLOCKS } from '../scripts/hooks/implementer-stop.mjs';
import { formatSessionRules } from '../scripts/agents/session-bootstrap.mjs';
import { hookCommand, missingHookRegistrations, sessionRulesProblems } from './helpers/hook-discipline';
import { leanPromptProblems } from './helpers/lean-prompts';
import { weakMachineProblems, weakMachineWiringProblems } from './helpers/weak-machine';
import { weakMachineWorkerEnv } from '../scripts/gate-preflight.mjs';
import {
  backdropFilterProblems,
  chromeGraph,
  deskStateSourceProblems,
  footerCopyFromTemplate,
  footerLinkProblems,
  fullFooterBlock,
  fullFooterProblems,
  funkcijaIzIzvora,
  inkObserverProblems,
  inkSignatureCssProblems,
  lazyFooterBudgetProblems,
  lazyFooterProblems,
  markerMotionProblems,
  markerTravelProblems,
  MAX_LAZY_FOOTER_JS_GZIP,
  scrolledBarProblems,
  shortStepperProblems,
  type ChromeMetafile,
  type FooterCopy,
  type PlaceMarker,
  type WireInk,
} from './helpers/site-footer-guards';
import { releasedPublicRouteGroups } from '../src/routes/shared/public-route-directory';
import { SITE_CHROME_DESTINATIONS, placeSiteChromeMarker } from '../src/shared/site-chrome';
import { INK_CLASS, wireInkSignature } from '../src/shared/site-footer-full';
import { pokretPrigusen } from '../src/shared/display-prefs';
import { legalDocuments } from '../src/legal/legal-content';
import { DEFAULT_PRODUCTION_CONFIG } from '../src/config/production-config';
import { deadEndWiringProblems, type DeadEndSources } from './helpers/dead-ends';
import { messagingRuleProblems, type MessagingSources } from './helpers/session-messaging';
import { lockfileGuardWiringProblems, osvWiringProblems } from './helpers/lockfile-sources';
import { collectPackages, compareOsvToRatchet, denoLockPackages, findingsFromBatch, requestPlan } from '../scripts/osv-query.mjs';
import osvRatchet from '../data/security/osv-ratchet.json';
import { lockfileSourceProblems } from '../scripts/lockfile-sources.mjs';
import { captchaWiringProblems } from './helpers/auth-captcha';
import { flagContractProblems, googleFlagProblems, pkceContractProblems } from './helpers/google-auth-flag';
import * as sessionModul from '../src/auth/session';
import * as googleCallbackModul from '../src/auth/google-callback';
import { PKCE_MAX_AGE_MS } from '../src/auth/google-callback';
import { acceptedInvalidUrls, committedSourceAddresses, countDocumentUrls, findSourceUrlProblems, loadPublicSourceUrl, publicSourceUrlSource } from './helpers/source-url-checks';
import { publicSourceUrl } from '../src/shared/source-url.mjs';
import { sourceLinkHtml } from '../scripts/generate-faculty-pages.mjs';
import { idempotenceProperty, realRepair, repairWith, visibleTextProperty, type RepairFn } from './helpers/repair-arbitraries';
import { repairCostGuardProblems } from './helpers/repair-cost-guard';
import { loadClientIpFromForwarded, xffBehaviourProblems, xffKeyProblems, xffRealSources } from './helpers/xff-key-guard';
import { corpusTitleBoundProblems } from './helpers/corpus-title-bound';
import { friendRewardAnonGuardProblems } from './helpers/friend-referral-guard';
import { netlifyPinProblems, netlifyPinRealSources } from './helpers/netlify-cli-pin';
import { supabaseMcpGuardProblems, supabaseMcpGuardProblemsForSource, toolGuardMatcherProblems } from './helpers/supabase-mcp-guard';

const SOURCES = SOURCE_REGISTRY as SourceEntry[];
const NOW = '2026-06-30';
/** Stvaran, snapshotiran izvor sa sha256 (isti koji koriste ostali verifikacijski testovi). */
const REAL_SOURCE_ID = 'pravo-upute-oblikovanje-2024';
const REAL_SOURCE = SOURCES.find((s) => s.id === REAL_SOURCE_ID)!;

/**
 * Profil na kojem se vjezba demotija zbog raskoraka.
 *
 * Do 2026-08-24 se uzimao iz artefakta, jer je izmisljen profil davao vakuumsku tvrdnju. Tog dana je
 * broj raskoraka pao na NULU (svih 37 presudjeno), pa artefakt vise nema nijedan profil i tvrdnja bi
 * se opet ispraznila, samo tise. Zato se raskorak sada PODMECE (`computeDemotedAdvisory` prima skup
 * za testove), a profil je stvaran i ima bodovanu tvrdnju za tu os - bez toga base i puna verzija
 * vracaju isto pa se zamjena base -> puna u generatoru ne bi vidjela.
 */
const DEMOTION_FIXTURE = (() => {
  for (const id of DRAFT_PROFILE_IDS) {
    const entries = draftRuleEntriesFor(id);
    if (!entries.length) continue;
    const base = computeBaseDemotedAdvisory({ id }, entries, SOURCES);
    const axis = DEMOTABLE_CHECK_IDS.find(
      (checkId) => !base.includes(checkId) && entries.some((e) => e.checkId === checkId && isRuleScored(e)),
    );
    if (axis) return { id, axis };
  }
  throw new Error('Nema profila s bodovanom demotabilnom osi: tvrdnja o demotiji bi bila prazna.');
})();

/** Potpuno valjana bodovana tvrdnja. Sve mutacije kvare TOCNO JEDNU stvar na njoj. */
function goodEntry(over: Partial<RuleEntry> = {}): RuleEntry {
  return {
    ruleId: 'r-font',
    checkId: 'font',
    value: ['Times New Roman'],
    authority: 'general',
    sourceId: REAL_SOURCE_ID,
    sourcePage: 'odjeljak 4',
    quote: 'font: Times New Roman',
    status: 'verified',
    scored: true,
    lastVerified: '2026-06-29',
    modality: 'directive',
    scope: 'body',
    modalitySource: 'mechanical',
    ...over,
  };
}

function profileWith(entry: RuleEntry, rules: Record<string, unknown> = { font: ['Times New Roman'] }): ThesisProfile {
  return { id: 'mut-profil', rules, ruleEntries: [entry] } as ThesisProfile;
}

function gateCodes(profile: ThesisProfile, sources: SourceEntry[] = SOURCES): string[] {
  return runVerificationGate([profile], sources, { now: NOW }).map((e) => e.code);
}

function auditReleaseLaunchers(
  sources: Parameters<typeof auditReleaseLaunchersRaw>[0],
): ReturnType<typeof auditReleaseLaunchersRaw> {
  return auditReleaseLaunchersRaw(sources.map((item) => ({
    ...item,
    source: `import { join } from 'node:path';\n` +
      `import { spawnSync } from 'node:child_process';\n` +
      `const root = join(import.meta.dirname, '..');\n${item.source}`,
  })));
}

/**
 * Zdrav dokaz izdanja za mutacije nad gateom objave: potpun, svjez i s prolazom na svakoj obaveznoj
 * razini. Vrijeme je fiksno, jer bi inace mutacija o STAROSTI dokaza (14 dana) padala ovisno o danu.
 */
const DOKAZ_SADA = Date.parse('2026-09-13T00:00:00.000Z');
const DOKAZ_BAZA = {
  commit: 'a'.repeat(40),
  treeDigest: 'd'.repeat(64),
  dirtyWorkingTree: false,
  createdAt: '2026-09-12T00:00:00.000Z',
  complete: true,
  missingRequired: [] as string[],
  results: requiredTierIds().map((id: string) => ({ id, label: id, status: 'pass' })),
};

/** Paket iz `package-lock.json` (T99); polja koja gard izvora cita. */
type LockPkg = { resolved?: string; integrity?: string; inBundle?: boolean; link?: boolean; bundleDependencies?: string[]; [k: string]: unknown };
/** Svjeza kopija stvarnog lockfilea za svaku mutaciju (T99). */
type RealLock = { lockfileVersion: unknown; packages: Record<string, LockPkg> };
const realLock = (): RealLock => JSON.parse(readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8'));
/**
 * `inBundle` lanac za T99 mutacije (Codex F2). Stvarni lockfile ga je imao samo u netlify-cli stablu;
 * nakon Popravka A (netlify-cli van) nema nijednog, pa se valjan lanac cijepi na stvarni paket.
 */
const INBUNDLE_PARENT = 'node_modules/vite';
const INBUNDLE_KEY = `${INBUNDLE_PARENT}/node_modules/napi-wasm`;
const bundledLock = (): RealLock => {
  const lock = realLock();
  lock.packages[INBUNDLE_PARENT] = { ...lock.packages[INBUNDLE_PARENT], bundleDependencies: ['napi-wasm'] };
  lock.packages[INBUNDLE_KEY] = { version: '1.0.0', inBundle: true };
  return lock;
};

/** Jezgra npm-audit ratcheta izvedena iz (mutiranog) izvora u memoriji; izvor nema importa (T93). */
type RatchetCore = {
  compareAuditToRatchet: typeof compareAuditToRatchet;
  syntheticAudit: typeof syntheticAudit;
  validateRatchet: (r: unknown, o?: { today?: string }) => string[];
};
function loadRatchetCore(src: string): RatchetCore {
  const body = src.replace(/^export /gm, '');
  return new Function(`${body}\nreturn { compareAuditToRatchet, syntheticAudit, validateRatchet };`)() as RatchetCore;
}

// T93 stays independently exercised after the production ratchet returns to zero findings.
const T93_MUTATION_RATCHET = {
  fullGraphHighCritical: 1,
  fullGraphHighCriticalPackages: ['braces'],
  exceptions: [{ packages: ['braces'], advisories: ['GHSA-aaaa-aaaa-aaaa'] }],
};

/**
 * Jedna mutacija: sto kvari, koji stvaran kvar imitira, i kako se mjeri da je uhvacena.
 * `baseline` mora biti PRAZAN/false na nemutiranom ulazu, inace tvrdnja nije o mutaciji.
 */
interface Mutation {
  id: string;
  /** Os koju mutacija vjezba; sluzi tvrdnji da `readAxis` nije pokriven samo na jednoj osi. */
  axis?: string;
  imitates: string;
  caught: () => boolean;
  cleanBefore: () => boolean;
}

/**
 * Tvrdnja garda T83: spoj korijena korpusa u kojem se isti rad pojavljuje dvaput daje manifest s
 * jednim unosom po `documentId`, a izbacena kopija je zabiljezena.
 */
function jedanDokumentJedanGlas(
  dedupe: (entries: RealCorpusManifestEntry[]) => { entries: RealCorpusManifestEntry[]; duplicates: unknown[] },
): boolean {
  const e = (documentId: string, root: string): RealCorpusManifestEntry => ({
    documentId, fileName: `${documentId}.docx`, profileId: 'fer-diplomski', root, holdout: false, expectationProvenance: 'derived',
  });
  const { entries, duplicates } = dedupe([e('corpus-a', 'docx-local'), e('corpus-b', 'docx-local'), e('corpus-a', '03-ingest')]);
  const ids = entries.map((x) => x.documentId);
  return ids.length === 2 && new Set(ids).size === 2 && duplicates.length === 1;
}

/** Razliciti radovi imaju razlicite bajtove, kao u stvarnom korpusu (inace T83-01 s pravom baca). */
const bajtoviPoIdu = (e: RealCorpusManifestEntry) => new TextEncoder().encode(`sadrzaj-${e.documentId}`);

/** Stara izvedba dedupea (prije T83-01): kljuc je samo documentId, sadrzaj se ne usporeduje medu id-ovima. */
function dedupeManifestSamoPoIdu(entries: RealCorpusManifestEntry[]) {
  const seen = new Set<string>();
  const out = entries.filter((e) => (seen.has(e.documentId) ? false : (seen.add(e.documentId), true)));
  return { entries: out, duplicates: [] as unknown[] };
}

/** Tvrdnja garda T83-01: isti bajtovi pod dva razlicita id-a ne prolaze kao dva rada. */
function istiSadrzajPodDvaImenaPada(
  dedupe: (entries: RealCorpusManifestEntry[]) => { entries: RealCorpusManifestEntry[] },
): boolean {
  const e = (documentId: string): RealCorpusManifestEntry => ({
    documentId, fileName: `${documentId}.docx`, profileId: 'fer-diplomski', root: 'r', holdout: false, expectationProvenance: 'derived',
  });
  try {
    return dedupe([e('corpus-a'), e('corpus-kopija-a')]).entries.length < 2;
  } catch {
    return true;
  }
}

/** Tvrdnja garda T75: v2 ovjera s otiskom koda popravka prolazi, bez njega ili s neispravnim ne prolazi. */
function mjereniKodSeTrazi(check: (a: CorpusAttestation) => string | null): boolean {
  const s = { fingerprintVersion: 2, repairSourceHash: 'e'.repeat(64) } as unknown as CorpusAttestation;
  return (
    check(s) === null &&
    check({ ...s, repairSourceHash: null }) !== null &&
    check({ ...s, repairSourceHash: 'nije-otisak' }) !== null
  );
}

/**
 * Tvrdnja garda NOVO-01: potpisana v2 ovjera bez izmjene nema problem potpisa, a ista ovjera s brojkom
 * promijenjenom nakon potpisa ga ima. Otisak se racuna citacevom funkcijom, ne skriptom.
 */
function izmjenaNakonPotpisaPada(check: (a: CorpusAttestation) => string | null): boolean {
  const bez = {
    schemaVersion: 1, fingerprintVersion: 2, corpusFingerprint: 'f'.repeat(32), measuredAt: '2026-09-20T09:00:00.000Z',
    measuredFromCommit: 'c'.repeat(40), oracles: ['scripts/repair-real-corpus.mts'], environment: { wordVersion: null },
    protocol: { holdoutExcluded: true, holdoutDocumentCount: 0, uniqueDocumentCount: 2, rawDocumentCount: 2, countedDocumentCount: 2, duplicateDocumentCount: 0 },
    entries: [{ unitId: 'fpzg', workType: 'final', profileIds: ['p'], documentCount: 2, cleanCount: 1, regressedChecks: [] }],
  };
  const potpisana = { ...bez, signedBy: 'Vlasnik', signedAt: '2026-09-20T10:00:00.000Z', signatureNote: null, signedContentDigest: attestationContentDigestSync(bez) } as unknown as CorpusAttestation;
  const izmijenjena = { ...potpisana, entries: [{ ...potpisana.entries[0], cleanCount: 2 }] } as CorpusAttestation;
  return check(potpisana) === null && check(izmijenjena) !== null;
}

/**
 * Potpisana v2 ovjera s jednom cistom skupinom `u::graduate`, otisak sadrzaja izracunat citacevom
 * funkcijom. `sourceKind` je dio potpisanog sadrzaja, pa se otisak racuna tek nakon njega.
 */
function potpisanaOvjera(sourceKind: string | null = 'source-docx', measuredAt = '2026-09-28T09:00:00.000Z'): CorpusAttestation {
  const bez = {
    schemaVersion: 1, fingerprintVersion: 2, corpusFingerprint: 'f'.repeat(32), measuredAt,
    measuredFromCommit: 'c'.repeat(40), repairSourceHash: 'a'.repeat(64), oracles: ['scripts/repair-real-corpus.mts'],
    environment: { wordVersion: null },
    protocol: { holdoutExcluded: true, holdoutDocumentCount: 0, independentlyConfirmedCount: 0, derivedExpectationCount: 1, uniqueDocumentCount: 1, rawDocumentCount: 1, countedDocumentCount: 1, duplicateDocumentCount: 0 },
    entries: [{ unitId: 'u', workType: 'graduate', profileIds: ['p'], documentCount: 1, cleanCount: 1, regressedChecks: [] }],
    ...(sourceKind != null ? { sourceKind } : {}),
  };
  return { ...bez, signedBy: 'Vlasnik', signedAt: '2026-09-28T10:00:00.000Z', signedContentDigest: attestationContentDigestSync(bez as unknown as CorpusAttestation) } as unknown as CorpusAttestation;
}

/**
 * Tvrdnja garda "PDF konverzija nije dokaz A" (odluka vlasnika 2026-09-28): valjana prava ovjera nema
 * problem izvora, a ista ovjera sa `sourceKind: 'public-pdf-converted'` (ponovo potpisana) ga ima.
 */
function pdfNijeDokazA(check: (a: CorpusAttestation) => string | null): boolean {
  return check(potpisanaOvjera()) === null && check(potpisanaOvjera('public-pdf-converted')) !== null;
}

/**
 * Tvrdnja garda "ovjera bez sourceKind je izvorni DOCX samo za stara mjerenja" (Codex #225, nalaz 1): nova
 * ovjera bez polja ima problem, a ona mjerena prije granice (postojeca potpisana, 2026-09-27T21:25Z) nema.
 */
function bezVrsteSamoStaraOvjera(check: (a: CorpusAttestation) => string | null): boolean {
  return check(potpisanaOvjera(null)) !== null && check(potpisanaOvjera(null, '2026-09-27T21:25:25.312Z')) === null;
}

/** Tvrdnja garda "sourceKind je zatvoren skup" (Codex #225, nalaz 1): nepoznata vrijednost nije izvorni DOCX. */
function nepoznataVrstaOdbijena(check: (a: CorpusAttestation) => string | null): boolean {
  return check(potpisanaOvjera()) === null && check(potpisanaOvjera('source-DOCX')) !== null && check(potpisanaOvjera('scan')) !== null;
}

/** Najmanji ulaz ledgera: profil `p` jedinice `u`, verificirano pravilo, fakultetski popravak, sinteticki dokaz (B). */
const LEDGER_B_ULAZ: LedgerInputs = {
  registryProfiles: [{ id: 'p', unitId: 'u', workTypes: ['graduate'] }],
  faculties: [{ unitId: 'u', profiles: [{ profileId: 'p', workTypes: ['graduate'], offeredOptionCount: 1, realDocxSampleCount: 0, automaticTests: { realCorpus: 'not-run', syntheticClosedLoop: 'pass' } }] }],
  coverageCells: [{ profileId: 'p', scoredMachineCheckable: 1, scoredTotal: 1 }],
  worklistRows: [],
  repairRows: [{ profileId: 'p', recommended: false }],
  programs: [],
  titleTemplates: [],
  citationSpecs: [],
  declarations: [],
};

/**
 * Mjerenje garda odvojenosti razine `A-pdf`: koliko redaka PDF ovjera digne na `A-pdf` i sto gard vidi kad se
 * ledger s njom i bez nje usporedi (`pdfSeparationProblems`). `realProofPairs` je jedina tocka mutacije.
 */
function pdfRazdvajanje(realProofPairs?: (i: LedgerInputs) => Set<string>): { aPdf: number; bBez: number; problemi: string[] } {
  const bez = buildCompletionLedger(LEDGER_B_ULAZ, realProofPairs);
  const sa = buildCompletionLedger({ ...LEDGER_B_ULAZ, pdfCorpusAttestation: potpisanaOvjera('public-pdf-converted') }, realProofPairs);
  return { aPdf: sa.summary.byPdfClaim['A-pdf'], bBez: bez.summary.byClaim.B, problemi: pdfSeparationProblems(bez, sa) };
}

/** Tvrdnja garda T83-03: mjerenje s ijednim palim ili pogresnim dokumentom se ne ovjerava. */
function paloMjerenjeSeNeOvjerava(refuse: (results: Array<Record<string, unknown>>) => string[]): boolean {
  const r = (documentId: string, extra: Record<string, unknown> = {}) => ({ documentId, outcome: 'review', error: null, integrityFailure: null, ...extra });
  return (
    refuse([r('a'), r('b', { outcome: 'pass' })]).length === 0 &&
    refuse([r('a'), r('b', { outcome: 'fail' })]).length > 0 &&
    refuse([r('a', { error: 'analysis crashed' })]).length > 0
  );
}

/**
 * Mutant garda `attestationRefusals` izveden iz STVARNOG izvora (blok GARD u
 * scripts/lib/corpus-attestation-core.mjs) zamjenom jednog izraza; mutacija ne filtrira izlaz nego
 * mijenja sam gard (Codex #185, T83-06).
 */
function gardIzIzvora(staro: string, novo: string): (results: Array<Record<string, unknown>>) => string[] {
  const src = readFileSync(resolve(process.cwd(), 'scripts/lib/corpus-attestation-core.mjs'), 'utf8').replace(/\r/g, '');
  const a = src.indexOf('// >>> GARD:attestationRefusals');
  const b = src.indexOf('// <<< GARD:attestationRefusals');
  if (a < 0 || b < a) throw new Error('blok GARD:attestationRefusals nije pronadjen');
  const blok = src.slice(a, b).replace('export function', 'function');
  if (!blok.includes(staro)) throw new Error(`mutacija ne pogadja izvor: ${staro}`);
  return new Function(`${blok.replace(staro, novo)}\nreturn attestationRefusals;`)() as (results: Array<Record<string, unknown>>) => string[];
}

type PotpisFn = (
  existing: Record<string, unknown> | null,
  next: Record<string, unknown>,
) => { signedBy: string; signedAt: string } | null;

/**
 * Tvrdnja garda T83-05: potpis ostaje uz ovjeru samo kad je SADRZAJ ovjere isti kao potpisani; v1
 * ovjera s istim otiskom, novo mjerenje istog skupa i isto mjerenje s --holdout-confirmed gube potpis.
 */
function potpisOstajeSamoUzIstiSadrzaj(inherit: PotpisFn): boolean {
  const otisak = '8e5bd529d4f2b596ccf8fa0ef58c029d';
  const sadrzaj = (over: Record<string, unknown> = {}) => ({
    schemaVersion: 1, fingerprintVersion: 2, corpusFingerprint: otisak,
    measuredAt: '2026-09-20T09:00:00.000Z', measuredFromCommit: 'c'.repeat(40),
    protocol: { holdoutExcluded: true, countedDocumentCount: 2 },
    entries: [{ unitId: 'fpzg', workType: 'final', documentCount: 2, cleanCount: 2 }],
    ...over,
  });
  const s = sadrzaj();
  const potpisana = { ...s, signedBy: 'Vlasnik', signedAt: '2026-09-20T10:00:00.000Z', signatureNote: null, signedContentDigest: attestationContentDigest(s) };
  const v1 = { corpusFingerprint: otisak, measuredAt: s.measuredAt, measuredFromCommit: s.measuredFromCommit, signedBy: 'Daniel', signedAt: '2026-09-12T22:00:26.856Z' };
  const isto = inherit(potpisana, s);
  const prekoVerzije = inherit(v1, s);
  const novoIzmedju = inherit(potpisana, sadrzaj({ measuredAt: '2026-09-20T09:30:00.000Z' }));
  const holdoutPotvrdjen = inherit(potpisana, sadrzaj({
    protocol: { holdoutExcluded: false, countedDocumentCount: 3 },
    entries: [{ unitId: 'fpzg', workType: 'final', documentCount: 3, cleanCount: 3 }],
  }));
  return isto?.signedBy === 'Vlasnik' && prekoVerzije === null && novoIzmedju === null && holdoutPotvrdjen === null;
}

/**
 * Tvrdnja garda T74: otisak koda popravka ne mijenja se kad se promijeni samo dokumentacija ili test
 * u src/repair, a mijenja se kad se promijeni produkcijski .ts. Obje polovice, inace bi konstantni
 * otisak prolazio.
 */
function otisakPratiSamoProdukciju(hash: (files: { path: string; content: string }[]) => string): boolean {
  const base = [
    { path: 'src/repair/apply-fixers.ts', content: 'export const a = 1;\n' },
    { path: 'src/repair/apply-fixers.test.ts', content: 'it("x", () => {});\n' },
    { path: 'src/repair/CLAUDE.md', content: '# Popravak\n' },
  ];
  const s = (p: string, content: string) => base.map((f) => (f.path === p ? { ...f, content } : f));
  const h = hash(base);
  return (
    hash(s('src/repair/CLAUDE.md', '# Popravak\n<!-- T73 mutacija: samo dokumentacija -->\n')) === h &&
    hash(s('src/repair/apply-fixers.test.ts', 'it("y", () => {});\n')) === h &&
    hash(s('src/repair/apply-fixers.ts', 'export const a = 2;\n')) !== h
  );
}

/** Potpisana metoda: dva neovisna orakula. Bez nje nijedan dokument nije dokaz, i to je namjerno. */
const PROOF_METHOD: ProofMethod = {
  signedBy: 'Daniel',
  signedAt: '2026-08-31T08:00:00.000Z',
  oracles: ['scripts/corpus-oracle.py (python-docx)', 'scripts/word-verify (Word COM)'],
};

/** Uredan manifest dokaza, uz podesiv trenutak zapisa ocekivanja (run je uvijek u 10:00). */
function manifestWithRecordedAt(recordedAt: string): EvidenceManifest {
  return {
    expected: {
      findings: [{ checkId: 'page.margins', expectFail: true }],
      recordedAt,
      recordedBy: 'Daniel',
    },
    visualReview: { reviewedAt: '2026-08-30T11:00:00.000Z', reviewedBy: 'Daniel', verdict: 'slaze-se' },
    runs: ['2026-08-30T10:00:00.000Z'],
  };
}

/** Zbroj `citedBackfilled` iz INDEX.json; `force` podmece vrijednost i vjezba mutaciju. */
function backfillTotal(force?: number): number {
  const rows = extractionIndex as unknown as Array<{ citedBackfilled?: number }>;
  return rows.reduce((a, r) => a + (force ?? r.citedBackfilled ?? 0), 0);
}

/**
 * DOKAZNA LUPA: nalaz + pravilo, za mutaciju mosta medju imenskim prostorima.
 * `checkId` na nalazu zivi u prostoru dimenzija, na pravilu u autorskom (`*-rules`).
 */
function evidenceFor(ruleCheckId: string, checkId: string, title: string, category: string): number {
  const issue = { severity: 'warning', category, title, detail: '', where: 'x' } as never;
  const check = { id: checkId, category, title, status: 'warn', earned: 0, max: 4, detail: '', issue, scored: true } as never;
  const entry = {
    ruleId: `mut--${ruleCheckId}`, checkId: ruleCheckId, sourceId: 's', status: 'verified',
    quote: 'Doslovan navod iz sluzbene upute.', sourcePage: 'str. 1',
    source: { id: 's', title: 'Upute', url: 'https://example.test/u.pdf' },
  } as never;
  return Object.keys(buildExactEvidence([check], [issue], [entry])).length;
}

/**
 * RE-60. ULAZ je valjan: `xmlns:r` je deklariran LOKALNO na `w:footerReference`, sto je legalan
 * XML. IZLAZ nosi hipervezu s `r:id` u tijelu, dakle izvan dosega te deklaracije, i vise nije
 * namespace-well-formed (@xmldom/xmldom i lxml ga odbijaju). Kontrolni izlaz je isti dokument s
 * deklaracijom na korijenu.
 */
const REL_NS_FOR_MUTATION = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const RE60_INPUT =
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
  + '<w:p><w:r><w:t>doi:10.1234/abc</w:t></w:r></w:p>'
  + `<w:sectPr><w:footerReference w:type="default" r:id="rId9" xmlns:r="${REL_NS_FOR_MUTATION}"/></w:sectPr>`
  + '</w:body></w:document>';
const RE60_BAD_OUTPUT = RE60_INPUT.replace(
  '<w:r><w:t>doi:10.1234/abc</w:t></w:r>',
  '<w:hyperlink r:id="rId1" w:history="1"><w:r><w:t>https://doi.org/10.1234/abc</w:t></w:r></w:hyperlink>',
);
const RE60_GOOD_OUTPUT = RE60_BAD_OUTPUT.replace('<w:document ', `<w:document xmlns:r="${REL_NS_FOR_MUTATION}" `);
/** Vrata integriteta nad JEDNIM promijenjenim dijelom; ostali argumenti su neutralni. */
const re60Gate = (output: string) =>
  detectIntegrityFailure(
    [{ name: 'word/document.xml', xml: output }],
    ['word/document.xml'],
    ['word/document.xml'],
    [],
    { 'word/document.xml': RE60_INPUT },
  );

/** Ulaz s TUDJIM nevezanim prefiksima (VML crtez), pa izlaz koji uz to nosi NAS `r:id`. */
const RE60_MIXED_INPUT =
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
  + '<w:p><w:r><w:t>doi:10.1234/abc</w:t></w:r></w:p><w:p><v:shape o:spid="x"/></w:p>'
  + '</w:body></w:document>';
const RE60_MIXED_BAD = RE60_MIXED_INPUT.replace(
  '<w:r><w:t>doi:10.1234/abc</w:t></w:r>',
  '<w:hyperlink r:id="rId1"><w:r><w:t>x</w:t></w:r></w:hyperlink>',
);
const RE60_MIXED_GATE = (output: string) =>
  detectIntegrityFailure([{ name: 'word/document.xml', xml: output }], ['word/document.xml'], ['word/document.xml'], [], { 'word/document.xml': RE60_MIXED_INPUT });
/** Sinteticki ulaz bez ijedne deklaracije (oblik koji testovi ovog repozitorija masovno grade). */
const RE60_SYNTHETIC_INPUT = '<w:document><w:body><w:p><w:r><w:t>doi:10.1/a</w:t></w:r></w:p></w:body></w:document>';
const RE60_SYNTHETIC_GATE = (output: string) =>
  detectIntegrityFailure([{ name: 'word/document.xml', xml: output }], ['word/document.xml'], ['word/document.xml'], [], { 'word/document.xml': RE60_SYNTHETIC_INPUT });

const buildUpisnikProfileCandidates: typeof buildRawUpisnikProfileCandidates = (...args) =>
  buildRawUpisnikProfileCandidates(args[0], args[1], args[2], args[3], args[4], args[5], args[6], sourceRegistry, args[8]);

function upisnikEvidenceFixture(over: Partial<{ sourceUrl: string; sourceLocator: string; quote: string }> = {}) {
  return buildUpisnikProfileCandidates(
    [{ sifraUpisnik: '109', naziv: 'Povijest (jednopredmetni)', izvoditelj: 'FHS', vrsta: 'Sveučilišni prijediplomski studij' }],
    [{ programCode: '109', executors: [{ componentIds: ['fhs'] }] }],
    [{ id: 'fhs-zavrsni', unitId: 'fhs', programs: ['Povijest'], workTypes: ['final'], sources: [{ url: 'https://www.unizg.hr/studiji' }] }],
    [{ programCode: '109', profileId: 'fhs-zavrsni', evidence: {
      sourceUrl: 'https://fhs.unizg.hr/povijest', sourceLocator: 'službena stranica Povijest', quote: 'Povijest', ...over,
    } }],
  );
}

function upisnikGuardFixture(programCode: '203' | '3', quote: string) {
  const fizika = programCode === '203';
  const name = fizika ? 'Fizika' : 'Elektrotehnika';
  const unitId = fizika ? 'pmf' : 'riteh';
  const sourceUrl = fizika ? 'https://www.pmf.unizg.hr/studiji' : 'https://riteh.uniri.hr/studij';
  const profileId = `${unitId}-test`;
  return buildUpisnikProfileCandidates(
    [{ sifraUpisnik: programCode, naziv: name, izvoditelj: unitId, vrsta: 'Sveučilišni prijediplomski studij' }],
    [{ programCode, executors: [{ componentIds: [unitId] }] }],
    [{ id: profileId, unitId, programs: [name], workTypes: ['final'], sources: [{ url: sourceUrl }] }],
    [{ programCode, profileId, evidence: { sourceUrl, sourceLocator: 'službena stranica', quote } }],
  );
}


function upisnikScopeFixture(sourceUrl: string, quote: string) {
  const profileUrl = 'https://pmf.unizg.hr/upute';
  return buildUpisnikProfileCandidates(
    [{ sifraUpisnik: '1', naziv: 'Biologija', izvoditelj: 'PMF', vrsta: 'Sveucilisni prijediplomski studij' }],
    [{ programCode: '1', executors: [{ componentIds: ['pmf'] }] }],
    [{ id: 'p', unitId: 'pmf', programs: ['Biologija'], workTypes: ['final'], sources: [{ url: profileUrl }] }],
    [{ programCode: '1', profileId: 'p', evidence: { sourceUrl, sourceLocator: 'sluzbena stranica', quote } }],
  );
}

function upisnikRitehRootFixture(sourceUrl: string) {
  return buildUpisnikProfileCandidates(
    [{ sifraUpisnik: '3', naziv: 'Elektrotehnika', izvoditelj: 'RITEH', vrsta: 'Sveučilišni prijediplomski studij' }],
    [{ programCode: '3', executors: [{ componentIds: ['riteh'] }] }],
    [{ id: 'p', unitId: 'riteh', programs: ['Elektrotehnika'], workTypes: ['final'], sources: [{ url: 'https://uniri.hr/studij' }] }],
    [{ programCode: '3', profileId: 'p', evidence: { sourceUrl, sourceLocator: 'službena stranica', quote: 'Elektrotehnika' } }],
  );
}

function upisnikFerFixture(sourceUrl: string) {
  return buildUpisnikProfileCandidates(
    [{ sifraUpisnik: '1', naziv: 'Elektrotehnika', izvoditelj: 'FER', vrsta: 'Sveučilišni prijediplomski studij' }],
    [{ programCode: '1', executors: [{ componentIds: ['fer'] }] }],
    [{ id: 'p', unitId: 'fer', programs: ['Elektrotehnika'], workTypes: ['final'], sources: [{ url: 'https://fer.unizg.hr/studij' }] }],
    [{ programCode: '1', profileId: 'p', evidence: { sourceUrl, sourceLocator: 'službena stranica', quote: 'Elektrotehnika' } }],
  );
}

function upisnikKbfFixture(sourceUrl: string) {
  return buildUpisnikProfileCandidates(
    [{ sifraUpisnik: '1', naziv: 'Teologija', izvoditelj: 'KBF', vrsta: 'Sveucilisni prijediplomski studij' }],
    [{ programCode: '1', executors: [{ componentIds: ['kbf'] }] }],
    [{ id: 'p', unitId: 'kbf', programs: ['Teologija'], workTypes: ['final'], sources: [{ url: 'https://kbf.unizg.hr/studij' }] }],
    [{ programCode: '1', profileId: 'p', evidence: { sourceUrl, sourceLocator: 'sluzbena stranica', quote: 'Teologija' } }],
  );
}

function upisnikInventory(decisions = upisnikProfileDecisions.decisions, integratedGraduateCoverage: typeof upisnikProfileDecisions.integratedGraduateCoverage = upisnikProfileDecisions.integratedGraduateCoverage) {
  return buildUpisnikProfileCandidates(
    upisnikRows.rows,
    upisnikComponents.decisions,
    Object.values(upisnikProfiles),
    decisions,
    upisnikProfileDecisions.exclusions as Parameters<typeof buildUpisnikProfileCandidates>[4],
    upisnikProfileDecisions.blockers as Parameters<typeof buildUpisnikProfileCandidates>[5],
    upisnikProfileDecisions.holds,
    sourceRegistry, integratedGraduateCoverage,
  );
}

function verifiedCodes(programs: Array<{ programCode: string; profileDecisionEvidence: unknown[] }>): string[] {
  return programs.filter((program) => program.profileDecisionEvidence.length > 0).map((program) => program.programCode).sort();
}

/**
 * Staticka provjera `scripts/agents/session-bootstrap.mjs`: mjerenje koje ne uspije mora vratiti
 * `null`, nikad doslovnu `0`. Doslovna nula u `catch` grani izgleda identicno stvarno izmjerenoj
 * nuli, pa je `formatBootstrap` ne moze razlikovati (CLAUDE.md: nepotvrdjeno se ne pogada).
 */
function sessionBootstrapFalseZeroProblems(source: string): string[] {
  const problems: string[] = [];
  if (/catch\s*\{\s*freeDiskGb\s*=\s*0\s*;?\s*\}/.test(source)) {
    problems.push('freeDiskGb u catch grani vraca doslovnu 0 umjesto null');
  }
  if (/catch\s*\{\s*testProcessCount\s*=\s*0\s*;?\s*\}/.test(source)) {
    problems.push('testProcessCount u catch grani vraca doslovnu 0 umjesto null');
  }
  return problems;
}

/**
 * T65. Gard u table-figure-rescue-fixeru: equalColumns se NE primjenjuje na tablicu sa spojenim
 * celijama. Nemutirana tablica (bez spajanja) mora dobiti jednake stupce, inace bi "uhvaceno" moglo
 * znaciti samo da equalColumns vise nikad nista ne radi. Mutacija ubaci gridSpan ili vMerge u istu
 * tablicu; gard je uhvatio kvar kad su tblGrid i svi tcW ostali bajt-identicni ulazu.
 */
const T65_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const t65Cell = (extra: string, text: string, width: number) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${extra}</w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
const t65Table = (first: string, second: string) =>
  `<w:tbl ${T65_W}><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="7000"/></w:tblGrid>`
  + `<w:tr>${t65Cell(first, 'A', 2000)}${t65Cell('', 'B', 7000)}</w:tr><w:tr>${t65Cell(second, 'C', 2000)}${t65Cell('', 'D', 7000)}</w:tr></w:tbl>`;
/** Sirine (tblGrid + svi tcW) nakon equalColumns; `null` kad fixer odbije cijeli zahtjev. */
function t65WidthsAfterEqualColumns(tbl: string): { before: string; after: string } | null {
  const documentXml = `<w:document ${T65_W}><w:body>${tbl}</w:body></w:document>`;
  const out = tableFigureRescueFixer({ documentXml, stylesXml: '' }, { version: 1, tables: [{ id: 't', bodyChildIndex: 0, anchorFingerprint: anchorFingerprintForXml('table', tbl), actions: { equalColumns: true, center: true } }], figures: [] });
  if (!out.applied) return null;
  const widths = (xml: string) => [xml.match(/<w:tblGrid\b[^>]*>[\s\S]*?<\/w:tblGrid>/i)?.[0] ?? '', ...[...xml.matchAll(/<w:tcW\b[^>]*>/gi)].map((m) => m[0])].join('|');
  return { before: widths(documentXml), after: widths(out.parts.documentXml) };
}
const t65Preserved = (tbl: string) => { const r = t65WidthsAfterEqualColumns(tbl); return r !== null && r.before === r.after; };
const t65Equalized = (tbl: string) => { const r = t65WidthsAfterEqualColumns(tbl); return r !== null && r.after.includes('<w:gridCol w:w="4500"/><w:gridCol w:w="4500"/>') && !r.after.includes('w:w="2000"'); };
/**
 * T65 krug 2 (M1). Ista tablica, ali spajanje nosi NE-ASCII prefiks vezan uz Wordov namespace.
 * Analiza (DOM) takvu celiju vidi kao spojenu; fixer ju je vidio kao obicnu jer je prefiks
 * prihvacao samo iz ASCII klase. Gard hvata kvar kad fixer i ovdje sacuva grid i tcW, a dijeljena
 * detekcija (ista za analizu i fixer) kaze da je tablica spojena.
 */
const t65NonAsciiPrefix = (tbl: string) => tbl
  .replace(`<w:tbl ${T65_W}>`, `<w:tbl ${T65_W} xmlns:ž="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`)
  .replace('<w:gridSpan w:val="2"/>', '<ž:gridSpan ž:val="2"/>');
/** T65 krug 2 (M3): izlaz fixera za mijesani zahtjev (equalColumns + center + repeatHeader). */
function t65MixedRequest(tbl: string): { applied: boolean; afterLabel: string } {
  const documentXml = `<w:document ${T65_W}><w:body>${tbl}</w:body></w:document>`;
  return tableFigureRescueFixer({ documentXml, stylesXml: '' }, { version: 1, tables: [{ id: 't', bodyChildIndex: 0, anchorFingerprint: anchorFingerprintForXml('table', tbl), actions: { equalColumns: true, center: true, repeatHeader: true } }], figures: [] });
}
const T65_SKIP_NOTE = 'ujednačavanje stupaca preskočeno';
/**
 * T65 krug 3 (M3, prvi prolaz): tablica kojoj je center vec na cilju. Mijesani zahtjev
 * (equalColumns + center) tada nista ne mijenja, pa fixer vraca applied:false bez afterLabela.
 */
function t65AlreadyCentered(tbl: string): { applied: boolean; reason?: string; skippedActions?: string[] } {
  const centered = tbl.replace('<w:tblPr>', '<w:tblPr><w:jc w:val="center"/>');
  const documentXml = `<w:document ${T65_W}><w:body>${centered}</w:body></w:document>`;
  return tableFigureRescueFixer({ documentXml, stylesXml: '' }, { version: 1, tables: [{ id: 't', bodyChildIndex: 0, anchorFingerprint: anchorFingerprintForXml('table', centered), actions: { equalColumns: true, center: true } }], figures: [] });
}
/**
 * T65 krug 2, pregled (M2): oznaka kucice smije tvrditi prilagodbu sirini teksta samo ako fixer nad
 * ISTIM parametrima stvarno promijeni tblW. Gard usporeduje iscrtane oznake tablicnih akcija s
 * izlazom fixera. Siroka tablica: tblW 12000 twipa, tekst 9000 twipa (9000 * 635 EMU).
 */
const T65_WIDE = `<w:tbl ${T65_W}><w:tblPr><w:tblW w:w="12000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="6000"/><w:gridCol w:w="6000"/></w:tblGrid>`
  + `<w:tr>${t65Cell('', 'A', 6000)}${t65Cell('', 'B', 6000)}</w:tr></w:tbl>`;
const T65_TEXT_WIDTH_EMU = 9000 * 635;
/** Iscrtane oznake tablicnih akcija i parametri koje UI stvarno salje za siroku tablicu. */
function t65RenderedWideTable(): { labels: string[]; params: TableFigureRescueParams } {
  const structure = { tables: [{ id: 't', bodyChildIndex: 0, anchorFingerprint: anchorFingerprintForXml('table', T65_WIDE), rowCount: 1, columnCount: 2, wide: true, mergedCells: false, confidence: 'medium', rowsWithCantSplit: 0, hasHeader: false, evidence: [] }], figures: [] };
  const item = tableFigureRescueRepairableItem({ details: { tableFigureRescue: structure } }, { ruleEntries: [] })[0];
  const li = document.createElement('li');
  renderTableFigureRescueControls(li, item);
  return { labels: [...li.querySelectorAll('.lekta-repair-panel__rescue-actions label')].map((node) => node.textContent ?? ''), params: item.params as unknown as TableFigureRescueParams };
}
/** Gard: true kad neka oznaka obecava prilagodbu sirini teksta, a fixer tblW ne postavi na sirinu teksta. */
function t65LabelOverclaims(labels: string[], params: TableFigureRescueParams): boolean {
  const documentXml = `<w:document ${T65_W}><w:body>${T65_WIDE}</w:body></w:document>`;
  const out = tableFigureRescueFixer({ documentXml, stylesXml: '' }, params);
  const fitted = out.applied && out.parts.documentXml.includes('<w:tblW w:w="9000" w:type="dxa"/>');
  return labels.some((label) => /širin\w* teksta/i.test(label)) && !fitted;
}

/** Izvor preflighta naplate s diska (LF). Mutacije ga mijenjaju samo u memoriji. */
function preflightIzvor(): string {
  return readTextLf(resolve(process.cwd(), 'scripts', 'verify-naplata-secrets.mjs'));
}

/** Indeks `redni`-te pojave (od 1) niza `trazi`, ili -1. */
function indeksPojave(src: string, trazi: string, redni: number): number {
  let i = -1;
  for (let n = 0; n < redni; n += 1) {
    i = src.indexOf(trazi, i + 1);
    if (i < 0) return -1;
  }
  return i;
}

/** Zamijeni `redni`-tu pojavu (od 1) niza `trazi`; bez te pojave vraca izvor nepromijenjen. */
function zamijeniPojavu(src: string, trazi: string, zamjena: string, redni: number): string {
  const i = indeksPojave(src, trazi, redni);
  return i < 0 ? src : src.slice(0, i) + zamjena + src.slice(i + trazi.length);
}

/**
 * Mutirani izvor preflighta, IZVRSEN u podprocesu nad laznim CLI-jem: svaki ciljani slucaj mora
 * pasti, a cisti slucajevi istog puta moraju i dalje proci. Drugo je dokaz da mutacija gasi
 * GRANU, a ne rusi skriptu (sintaksna greska bi pala svugdje i "uhvatila" se vakuumski).
 */
function izvrsenaMutacijaUhvacena(mutated: string, ciljevi: readonly string[], cisti: readonly string[]): boolean {
  if (mutated === preflightIzvor()) return false; // nema sto mutirati: gard bi prolazio vakuumski
  const problems = preflightExecutionProblems(mutated, [...ciljevi, ...cisti]);
  return ciljevi.every((c) => problems.some((p) => p.startsWith(`[${c}]`)))
    && !problems.some((p) => cisti.some((c) => p.startsWith(`[${c}]`)));
}

/** Baseline izvrsenog preflighta: nemutiran izvor prolazi iste slucajeve bez ijednog nalaza. */
function izvrseniBaselineCist(ciljevi: readonly string[], cisti: readonly string[]): boolean {
  return preflightExecutionProblems(preflightIzvor(), [...ciljevi, ...cisti]).length === 0
    && preflightSourceProblems(preflightIzvor()).length === 0;
}

/** Z15 drugi krug: puno podnozje sa stvarne stranice, LF, za mutacije u memoriji. */
function z15bPodnozje(): string {
  return fullFooterBlock(readTextLf(resolve(process.cwd(), 'alati.html'))) ?? '';
}

/** Copy punog podnozja iz predloska (prizor 05). */
function z15bPredlozak(): FooterCopy | null {
  return footerCopyFromTemplate(readTextLf(resolve(process.cwd(), 'design/templates/chrome/Chrome.dc.html')));
}

/** Poznata odredista: javni direktorij, odredista trake, pravne stranice koje generator pece. */
function z15bPoznate(): Set<string> {
  return new Set<string>([
    ...releasedPublicRouteGroups.flatMap((g) => g.destinations.map((d) => d.href)),
    ...SITE_CHROME_DESTINATIONS.map((d) => d.href),
    ...Object.values(legalDocuments()).map((d) => `/${d.slug}.html`),
  ]);
}

/** Pecene vrijednosti "Stanja stola" iz `site-stats.json`. */
function z15bPeceno(): { profiles: number; rulesVersion: string | null; sourcesCheckedAt: string | null } {
  return JSON.parse(readTextLf(resolve(process.cwd(), 'data/coverage/site-stats.json'))) as {
    profiles: number; rulesVersion: string | null; sourcesCheckedAt: string | null;
  };
}

/** Zatecena zamucenja u javnim listovima (F22); traka mora imati nula. */
const Z15B_BACKDROP_DOPUSTENO: Readonly<Record<string, number>> = { 'src/shared/page-app.css': 3 };

/** Svi CSS listovi pod `src/` osim admina (nije javna stranica). */
function z15bJavniListovi(): Array<{ ime: string; css: string }> {
  const out: Array<{ ime: string; css: string }> = [];
  const hodaj = (dir: string): void => {
    for (const e of readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (rel !== 'src/admin') hodaj(rel); continue; }
      if (e.name.endsWith('.css')) out.push({ ime: rel, css: readTextLf(resolve(process.cwd(), rel)) });
    }
  };
  hodaj('src');
  return out;
}

/**
 * Metafile u OBLIKU koji esbuild sa `splitting` stvarno vraca za traku (izmjereno 2026-09-27:
 * ulaz, zajednicki komad, lijeni komad podnozja). `staticki` imitira kvar: podnozje uvezeno
 * staticki zavrsi u ulaznom izlazu. Stvarni metafile mjeri `tests/route-shell-budget.test.ts`.
 */
function z15bMetafile(staticki: boolean): ChromeMetafile {
  const ulaz = 'site-chrome-budget/site-chrome.js';
  const komad = 'site-chrome-budget/chunk-A.js';
  const lijeni = 'site-chrome-budget/site-footer-full-B.js';
  const podnozje = { 'src/shared/site-footer-full.ts': {} };
  if (staticki) {
    return {
      outputs: {
        [ulaz]: { entryPoint: 'src/shared/site-chrome.ts', inputs: { 'src/shared/site-chrome.ts': {}, ...podnozje }, imports: [{ path: komad, kind: 'import-statement' }] },
        [komad]: { inputs: { 'data/coverage/site-stats.json': {} }, imports: [] },
      },
    };
  }
  return {
    outputs: {
      [ulaz]: { entryPoint: 'src/shared/site-chrome.ts', inputs: { 'src/shared/site-chrome.ts': {} }, imports: [{ path: komad, kind: 'import-statement' }, { path: lijeni, kind: 'dynamic-import' }] },
      [lijeni]: { entryPoint: 'src/shared/site-footer-full.ts', inputs: podnozje, imports: [{ path: komad, kind: 'import-statement' }] },
      [komad]: { inputs: { 'data/coverage/site-stats.json': {} }, imports: [] },
    },
  };
}

/**
 * Isti metafile s DRUGIM dinamickim uvozom u traci (`import('../ui/app')`): esbuild ga emitira
 * kao jos jedan lijeni izlaz s vlastitim `entryPoint`, izvan proracuna od 8 KB.
 */
function z15bMetafileDrugiLijeni(): ChromeMetafile {
  const cist = z15bMetafile(false);
  const ulaz = 'site-chrome-budget/site-chrome.js';
  const app = 'site-chrome-budget/app-C.js';
  const ulazni = cist.outputs[ulaz]!;
  return {
    outputs: {
      ...cist.outputs,
      [ulaz]: { ...ulazni, imports: [...ulazni.imports, { path: app, kind: 'dynamic-import' }] },
      [app]: { entryPoint: 'src/ui/app.ts', inputs: { 'src/ui/app.ts': {} }, imports: [] },
    },
  };
}

/** Gzip velicine lijenih izlaza, s podesivom velicinom komada podnozja (izmjereno 1174 B). */
function z15bLijeneVelicine(meta: ChromeMetafile, podnozje: number): Record<string, number> {
  const graf = chromeGraph(meta, 'src/shared/site-chrome.ts');
  return Object.fromEntries(graf.lazyOutputs.map((p) => [p, p.includes('site-footer-full') ? podnozje : 900]));
}

/** Lijeni gard nad metafileom i velicinama. */
function z15bLijeniProblemi(meta: ChromeMetafile, podnozje: number): string[] {
  return lazyFooterBudgetProblems(meta, chromeGraph(meta, 'src/shared/site-chrome.ts'), z15bLijeneVelicine(meta, podnozje), MAX_LAZY_FOOTER_JS_GZIP);
}

/** Stvarni izvor trake i podnozja, LF. */
const z15bChromeTs = (): string => readTextLf(resolve(process.cwd(), 'src/shared/site-chrome.ts'));
const z15bFooterTs = (): string => readTextLf(resolve(process.cwd(), 'src/shared/site-footer-full.ts'));
const z15bChromeCss = (): string => readTextLf(resolve(process.cwd(), 'src/shared/site-chrome.css'));

/** Gard putovanja nad `placeSiteChromeMarker` IZVRSENIM iz (mutiranog) izvora. */
function z15bKvacicaProblemi(ts: string): string[] {
  const place = funkcijaIzIzvora<PlaceMarker>(ts, 'placeSiteChromeMarker');
  return place ? markerTravelProblems(place) : ['placeSiteChromeMarker nije nadjen u izvoru'];
}

/** Gard tinte nad `wireInkSignature` IZVRSENIM iz (mutiranog) izvora, sa stvarnim ovisnostima. */
function z15bTintaProblemi(ts: string): string[] {
  const wire = funkcijaIzIzvora<WireInk>(ts, 'wireInkSignature', { pokretPrigusen, INK_CLASS });
  return wire ? inkObserverProblems(wire, document, INK_CLASS) : ['wireInkSignature nije nadjen u izvoru'];
}

type UpisnikScopePredicate = (quote: string) => boolean;
type UpisnikSourceNormalizer = (url: string) => string | null;

function upisnikScopeFromSource(source: string): UpisnikScopePredicate | null {
  return funkcijaIzIzvora<UpisnikScopePredicate>(
    source.replace('function wholeWorkScopeStatement(', 'export function wholeWorkScopeStatement('),
    'wholeWorkScopeStatement',
  );
}

type UpisnikStudyKind = (quote: string) => 'university' | 'vocational' | 'both' | null;

/** studyKindForEvidenceQuote iz (mutiranog) izvora, uz pravi normalized iz istog izvora. */
function upisnikStudyKindFromSource(source: string): UpisnikStudyKind | null {
  const normalized = funkcijaIzIzvora<(value: string) => string>(
    source.replace('function normalized(', 'export function normalized('), 'normalized');
  if (!normalized) return null;
  return funkcijaIzIzvora<UpisnikStudyKind>(
    source.replace('function studyKindForEvidenceQuote(', 'export function studyKindForEvidenceQuote('),
    'studyKindForEvidenceQuote',
    { normalized },
  );
}

function upisnikSourceNormalizerFromSource(source: string): UpisnikSourceNormalizer | null {
  return funkcijaIzIzvora<UpisnikSourceNormalizer>(
    source.replace('function comparableProfileSourceUrl(', 'export function comparableProfileSourceUrl('),
    'comparableProfileSourceUrl',
  );
}

const upisnikCandidateSource = (): string => readTextLf(resolve(process.cwd(), 'src/programs/upisnik-profile-candidates.ts'));

/**
 * scripts/register-clean-task.ps1, vlasnistvo (Codex nalaz, M1): Test-LektaCleanTaskOwned mora
 * provjeriti da je LEAF Actions[0].Execute tocno 'node' ili 'node.exe' (bez razlike velikih i malih
 * slova), ne bilo koju putanju koja zavrsava na .exe niti Arguments/WorkingDirectory. Bez ove
 * provjere tudji Scheduled Task s istim Arguments i WorkingDirectory, ali Execute npr.
 * 'powershell.exe' ili 'cmd.exe', bio bi prihvacen kao nas: -Unregister bi ga obrisao, a registracija
 * bi tiho preuzela njegovo mjesto umjesto da odbije.
 */
function registerCleanTaskExecuteGuardProblems(ps1: string): string[] {
  const code = ps1.replace(/\r/g, '').split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
  const problems: string[] = [];
  if (!code.includes('function Test-LektaCleanTaskOwned {')) {
    problems.push('nema funkcije Test-LektaCleanTaskOwned');
    return problems;
  }
  if (!code.includes('$execute = ([string]$akcije[0].Execute).Trim()')) {
    problems.push('vlasnistvo ne cita Actions[0].Execute');
  }
  if (!code.includes('$leafExecute = [System.IO.Path]::GetFileName($execute).ToLower()')) {
    problems.push('vlasnistvo ne svodi Execute na leaf ime datoteke');
  }
  if (!code.includes("if ($leafExecute -ne 'node' -and $leafExecute -ne 'node.exe') { return $false }")) {
    problems.push('vlasnistvo ne odbija Execute koji nije tocno node ili node.exe');
  }
  return problems;
}

/** Granice `executePlan` u stvarnom izvoru clean-vitest-tmp.mjs: od potpisa do sljedece top-level funkcije. */
function executePlanSourceSlice(src: string): string {
  const start = src.indexOf('export function executePlan(plan, opts = {}) {');
  const end = src.indexOf('\nfunction errCode(err) {', start);
  if (start < 0 || end < 0 || end <= start) throw new Error('executePlan (ili errCode iza njega) nije pronadjen u izvoru');
  return src.slice(start, end);
}

/**
 * clean-vitest-tmp.mjs M3 (Codex krug 3): executePlan mora, NEPOSREDNO PRIJE svakog rmSync, ponovno
 * izracunati realpath korijena i svakog kandidata i odbiti brisanje ako se realpath korijena
 * promijenio izmedju planiranja i izvrsenja, ako kandidat po realpathu lezi pod Temp/claude ili vise
 * nije izravno dijete korijena. planCleanup te vrijednosti mjeri SAMO pri planiranju; bez ove ponovne
 * provjere TOCTOU (korijen ili kandidat zamijenjen junctionom prema Temp/claude izmedju planiranja i
 * brisanja) obrise tudji radni prostor sesije ili worktree workflow runa.
 */
function executePlanRecheckProblems(src: string): string[] {
  let plan: string;
  try {
    plan = executePlanSourceSlice(src);
  } catch (err) {
    return [(err as Error).message];
  }
  const rmIdx = plan.indexOf('rm(resolve(item.path)');
  if (rmIdx < 0) return ['poziv rm(...) nad kandidatom nije pronadjen'];
  const pre = plan.slice(0, rmIdx);
  const problems: string[] = [];
  if (!pre.includes('rootRealpathNow = resolve(realpath(plan.root))')) {
    problems.push('korijenov realpath se ne racuna ponovno neposredno prije brisanja');
  }
  if (!pre.includes('plan.rootRealpath != null && rootRealpathNow !== plan.rootRealpath')) {
    problems.push('ne odbija kad se realpath korijena promijenio izmedju planiranja i izvrsenja');
  }
  if (!pre.includes('isProtected(rootRealpathNow)')) {
    problems.push('ne odbija korijen koji je pri izvrsenju po realpathu pod Temp/claude');
  }
  if (!pre.includes('isDirectChildOf(plan.root, item.path)')) {
    problems.push('ne provjerava da je kandidat (tekstualno) izravno dijete korijena');
  }
  if (!pre.includes('candidateLinkReason(item.path, fs,')) {
    problems.push('ne provjerava kandidata na simbolicku vezu neposredno prije brisanja');
  }
  if (!pre.includes('candRealpathNow = resolve(realpath(item.path))')) {
    problems.push('kandidatov realpath se ne racuna ponovno neposredno prije brisanja');
  }
  if (!pre.includes('isProtected(candRealpathNow)')) {
    problems.push('ne odbija kandidata koji je pri izvrsenju po realpathu pod Temp/claude');
  }
  if (!pre.includes('isDirectChildOf(rootRealpathNow, candRealpathNow)')) {
    problems.push('ne provjerava da je kandidat pri izvrsenju po realpathu izravno dijete korijena');
  }
  return problems;
}

/** Ukloni sve izmedju (ali ne ukljucujuci) `startMarker` i sljedeceg `endMarker`; oba moraju postojati. */
function removeBetweenMarkers(src: string, startMarker: string, endMarker: string): string {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error(`marker nije pronadjen: ${startMarker}`);
  const j = src.indexOf(endMarker, i);
  if (j < 0 || j <= i) throw new Error(`kraj marker nije pronadjen iza pocetka: ${endMarker}`);
  return src.slice(0, i) + src.slice(j);
}

const MUTATIONS: Mutation[] = [
  // --- T68 dio 2: ratchet i ugovor prijelaza svjedoka (pregled #302 R1, R2) ---
  {
    id: 'corpus/svjedok-izgubljen-ratchet',
    imitates: 'svjedok ili jedna njegova ciljana provjera nestane iz commitanog artefakta (25 -> 24), a ratchet pokrivenosti to ne primijeti',
    caught: () => {
      const r = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/generated/repair-real-corpus.json'), 'utf8')) as Parameters<typeof witnessRatchetProblems>[0];
      const izgubljen = { witnessResults: r.witnessResults.slice(0, -1), witnessSummary: { targetedCheckCount: r.witnessResults.slice(0, -1).reduce((n, x) => n + x.targetedCheckCount, 0) } };
      return witnessRatchetProblems(izgubljen, 25).some((p) => p.includes('ispod ratcheta'));
    },
    cleanBefore: () => {
      const r = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/generated/repair-real-corpus.json'), 'utf8')) as Parameters<typeof witnessRatchetProblems>[0];
      return r.witnessResults.length > 0 && witnessRatchetProblems(r, 25).length === 0;
    },
  },
  {
    id: 'corpus/svjedok-krivi-pocetni-status',
    imitates: 'poravnanje svjedoka zapisano kao fail->pass, a analiza ga ocjenjuje upozorenjem (warn->pass): ugovor prijelaza laze o tome sto je svjedok dokazao',
    caught: () => witnessTransitions(['font', 'justify'], [], { font: 'fail', justify: 'fail' }, ['format.font.dominant:fail->pass', 'format.justify.body:warn->pass']).mismatches.some((m) => m.startsWith('justify:')),
    cleanBefore: () => witnessTransitions(['font', 'justify'], [], { font: 'fail', justify: 'warn' }, ['format.font.dominant:fail->pass', 'format.justify.body:warn->pass']).mismatches.length === 0,
  },
  // --- T91: parser literature (zapis "(godina)." bez autora, oznaka bez godine) ---
  // Mutacije mijenjaju STVARNI izvor src/citations/author-year.ts u memoriji i izvrsavaju ga (pregled R5).
  ...([
    ['citations/godina-bez-autora-lijepi-se', 'stanje prije T91: zapis koji pocinje s "(2012)." bez autora lijepi se na prethodni zapis, pa ga reference.completeness ne moze prijaviti (D1: 4 od 72)', '||(leadYear&&!urlOnly&&!iza)', '', '(a)'],
    ['citations/oznaka-bez-godine-nepotpuna', 'stari predikat reference.completeness (!year || !author || kratko) koji potpun zapis s "(b.g.)", "(s. a.)" ili "(u tisku)" proglasi nepotpunim (D1: 128 od 144 laznih nalaza)', '(!r.year&&!r.noDate)', '!r.year', '(b)'],
    ['citations/oznaka-bez-godine-bilo-gdje', 'pregled R1 (runda 3): svaka godina u zapisu, i goli broj u naslovu, brise oznaku bez godine, pa "Horvat, A. (u tisku). Mediji 2011." dobije 2011 iz naslova', 'nd&&!DATE_POSITION_YEAR.test(t)?nd:null', 'nd&&!y?nd:null', '(r1)'],
    ['citations/godina-razdvaja-viseredni', 'pregled R2: autorov red ("Horvat, A.", "HZZ.", ustanova) ispred "(2011)." se ne prepozna, pa kratak nestane ili se zapis razdvoji u dva nepotpuna', 'authorOnlyParagraph(t)&&datumNaPocetku(iduci)', 'false', '(r2)'],
    ['citations/zapis-bez-godine-guta-iduci', 'pregled R2b: autorov red bez pozitivnog dokaza (svaki odlomak velikim slovom bez interpunkcije), pa naslov "Socijalna politika" proguta iduci "(2011). Prirucnik." i nalaz nepotpunosti nestane', 'return osoba||ustanova;', 'return /^\\p{Lu}/u.test(t);', '(r2b)'],
    ['citations/metapodaci-prije-spajanja', 'pregled R4: metapodaci viserednog zapisa iz prvog odlomka umjesto iz spojenog teksta, pa drugi prolaz daje drugog autora', 'for(const e of entries){if(e.ps.length<2)continue;', 'for(const e of entries){if(e.ps.length>=0)continue;', '(r4)'],
  ] as const).map(([id, imitates, staro, novo, oznaka]): Mutation => ({
    id,
    imitates,
    caught: () => {
      if (!referenceParserSource().includes(staro)) return false; // nema sto mutirati: gard bi prolazio vakuumski
      return referenceParserProblems(loadReferenceParser((x) => x.split(staro).join(novo))).some((p) => p.startsWith(oznaka));
    },
    cleanBefore: () => referenceParserProblems(loadReferenceParser()).length === 0,
  })),
  // --- Doctor i fixture po modelu (ROUTING.md, "Kako dodati novi model"; odluka vlasnika 28. 9.) ---
  {
    id: 'agents/model-probe-prima-api-kljuc',
    imitates: 'doctor ili fixture pokrenu Claude CLI s API kljucem u okolini, pa verifikacija modela tiho naplacuje po pozivu umjesto pretplate',
    caught: () => { try { probeModel('claude-opus-5-5', { env: { ANTHROPIC_API_KEY: 'x' }, spawn: () => { throw new Error('poziv'); } }); return false; } catch (e) { return /API credentials/.test((e as Error).message); } },
    cleanBefore: () => probeModel('claude-opus-5-5', { env: {}, spawn: () => ({ status: 0, stderr: '', stdout: JSON.stringify({ subtype: 'success', is_error: false, result: 'OK', modelUsage: { 'claude-opus-5-5': { outputTokens: 1 } } }) }) }).ok,
  },
  {
    id: 'agents/model-probe-broji-pomocni-model',
    imitates: 'doctor proglasi model dostupnim jer je CLI pozvao samo pomocni model (modelMatches prihvaca bilo koji pogodak u modelUsage)',
    caught: () => probeModel('claude-opus-5-5', { env: {}, spawn: () => ({ status: 0, stderr: '', stdout: JSON.stringify({ subtype: 'success', is_error: false, result: 'OK', modelUsage: { 'claude-haiku-4-5-20251001': { outputTokens: 3 }, 'claude-opus-5-5': { outputTokens: 0 } } }) }) }).reason === 'model_not_called',
    cleanBefore: () => probeModel('claude-opus-5-5', { env: {}, spawn: () => ({ status: 0, stderr: '', stdout: JSON.stringify({ subtype: 'success', is_error: false, result: 'OK', modelUsage: { 'claude-opus-5-5': { outputTokens: 2 } } }) }) }).ok,
  },
  {
    id: 'agents/fixture-vjeruje-izmijenjenom-testu',
    imitates: 'implementator u fixtureu prepise test tako da prolazi, a ocjenjivac mjeri njegovu verziju umjesto izvorne',
    caught: () => {
      const d = mkdtempSync(join(tmpdir(), 'lekta-gate-fixture-'));
      writeFileSync(join(d, 'rimski.mjs'), FIXTURE_FILES['rimski.mjs']);
      writeFileSync(join(d, 'rimski.test.mjs'), "import { test } from 'node:test'; for (const n of 'abcde') test(n, () => {});\n");
      const g = gradeTests(d);
      rmSync(d, { recursive: true, force: true });
      return !g.ok && g.fail === 5;
    },
    cleanBefore: () => {
      const d = mkdtempSync(join(tmpdir(), 'lekta-gate-fixture-'));
      for (const [n, c] of Object.entries(FIXTURE_FILES)) writeFileSync(join(d, n), c);
      const g = gradeTests(d);
      rmSync(d, { recursive: true, force: true });
      return g.pass === 0 && g.fail === 5;
    },
  },
  {
    id: 'upisnik/b15b-negacija',
    imitates: 'Uklanjanje provjere negacije prihvaca izjavu da se upute ne odnose na sve radove',
    cleanBefore: () => upisnikScopeFromSource(upisnikCandidateSource())?.('ove upute ne odnose se na sve studentske radove') === false,
    caught: () => {
      const source = upisnikCandidateSource();
      const mutant = source.replace('    && !/\\b(ne|nisu|nije)\\b/u.test(scopeMatch[2] + scopeMatch[4])\n', '');
      return mutant !== source && upisnikScopeFromSource(mutant)?.('ove upute ne odnose se na sve studentske radove') === true;
    },
  },
  {
    id: 'upisnik/b15b-iznimka',
    imitates: 'Uklanjanje provjere iznimke prihvaca sve studentske radove osim diplomskih',
    cleanBefore: () => upisnikScopeFromSource(upisnikCandidateSource())?.('upute se odnose na sve studentske radove osim diplomskih') === false,
    caught: () => {
      const source = upisnikCandidateSource();
      const mutant = source.replace('    && !/\\b(osim|izuzev)\\b/u.test(scopeMatch[11])\n', '');
      return mutant !== source && upisnikScopeFromSource(mutant)?.('upute se odnose na sve studentske radove osim diplomskih') === true;
    },
  },
  {
    id: 'upisnik/b15b-http-https',
    imitates: 'Uklanjanje normalizacije sheme ponovno razdvaja HTTP profil EFST od HTTPS dokaza',
    cleanBefore: () => {
      const normalize = upisnikSourceNormalizerFromSource(upisnikCandidateSource());
      return normalize?.('http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf') != null
        && normalize?.('http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf')
        === normalize?.('https://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf');
    },
    caught: () => {
      const source = upisnikCandidateSource();
      const mutant = source.replace("return url.hostname.toLowerCase()", "return url.protocol + url.hostname.toLowerCase()");
      const normalize = upisnikSourceNormalizerFromSource(mutant);
      return mutant !== source && normalize?.('http://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf')
        !== normalize?.('https://www.efst.unist.hr/portals/0/upute_za_izradu_studentskih_radova.pdf');
    },
  },

  {
    id: 'upisnik/b15-izvor-profila',
    imitates: 'Izjava o svim radovima s druge stranice iste domene prolazi bez vezanog izvora profila',
    cleanBefore: () => upisnikScopeFixture('https://pmf.unizg.hr/upute', 'Upute se odnose na sve kategorije studentskih radova').summary.evidenceBackedCandidatePrograms === 1,
    caught: () => {
      try { upisnikScopeFixture('https://pmf.unizg.hr/druge-upute', 'Upute se odnose na sve kategorije studentskih radova'); return false; }
      catch (error) { return /program name/u.test(String(error)); }
    },
  },
  {
    id: 'upisnik/b15-samo-radovi',
    imitates: 'Slaba izjava za sve studente prolazi kao izjava o svim vrstama radova',
    cleanBefore: () => upisnikScopeFixture('https://pmf.unizg.hr/upute', 'Upute se odnose na sve kategorije studentskih radova').summary.evidenceBackedCandidatePrograms === 1,
    caught: () => {
      try { upisnikScopeFixture('https://pmf.unizg.hr/upute', 'Upute vrijede za sve studente'); return false; }
      catch (error) { return /program name/u.test(String(error)); }
    },
  },
  {
    id: 'upisnik/b13-korijen-rijeci',
    imitates: 'Stara podnizna ili priblizna osnova ponovno prihvaca Mikrobiologija i Fizikalna terapija',
    cleanBefore: () => upisnikGuardFixture('203', 'Studij fizike').summary.evidenceBackedCandidatePrograms === 1,
    caught: () => {
      const attacks = [
        () => upisnikGuardFixture('203', 'Fizikalna terapija'),
        () => buildUpisnikProfileCandidates(
          [{ sifraUpisnik: '1', naziv: 'Biologija', izvoditelj: 'PMF', vrsta: 'Sveucilisni prijediplomski studij' }],
          [{ programCode: '1', executors: [{ componentIds: ['pmf'] }] }],
          [{ id: 'p', unitId: 'pmf', programs: ['Biologija'], workTypes: ['final'], sources: [{ url: 'https://pmf.unizg.hr' }] }],
          [{ programCode: '1', profileId: 'p', evidence: { sourceUrl: 'https://pmf.unizg.hr', sourceLocator: 'studij', quote: 'Mikrobiologija' } }],
        ),
      ];
      return attacks.every((attack) => { try { attack(); return false; } catch (error) { return /program name/u.test(String(error)); } });
    },
  },
  {
    id: 'upisnik/b13-razina-svih-studija',
    imitates: 'Stara iznimka svi studiji prihvaca doktorski citat za prijediplomski program',
    cleanBefore: () => upisnikGuardFixture('203', 'Svi prijediplomski studiji imaju zavrsni rad').summary.evidenceBackedCandidatePrograms === 1,
    caught: () => {
      try { upisnikGuardFixture('203', 'Svi doktorski studiji imaju disertaciju'); return false; }
      catch (error) { return /program name/u.test(String(error)); }
    },
  },
  {
    id: 'upisnik/b13-vrsta-uz-studij',
    imitates: 'Staro ponistavanje obiju osnova propusta strucni studij uz sveucilisnu knjiznicu',
    cleanBefore: () => upisnikGuardFixture('3', 'Elektrotehnika; sveucilisni prijediplomski studij').summary.evidenceBackedCandidatePrograms === 1,
    caught: () => {
      try { upisnikGuardFixture('3', 'Elektrotehnika; strucni prijediplomski studij. Sveucilisna knjiznica.'); return false; }
      catch (error) { return /study type/u.test(String(error)); }
    },
  },
  {
    id: 'upisnik/b13b-svi-studiji-bez-razine',
    imitates: 'Iznimka bez razine prihvaca opcenit citat Svi studiji',
    cleanBefore: () => upisnikGuardFixture('203', 'Svi prijediplomski studiji imaju zavrsni rad').summary.evidenceBackedCandidatePrograms === 1,
    caught: () => {
      try { upisnikGuardFixture('203', 'Svi studiji imaju zavrsni rad'); return false; }
      catch (error) { return /program name/u.test(String(error)); }
    },
  },
  {
    id: 'upisnik/b13b-vrsta-bez-studija',
    imitates: 'Vrsta studija izvan izraza studij nije procitana',
    cleanBefore: () => upisnikGuardFixture('3', 'Elektrotehnika; sveucilisni prvostupnik inzenjer elektrotehnike').summary.evidenceBackedCandidatePrograms === 1,
    caught: () => {
      try { upisnikGuardFixture('3', 'Elektrotehnika; strucni prvostupnik inzenjer elektrotehnike'); return false; }
      catch (error) { return /study type/u.test(String(error)); }
    },
  },
  {
    id: 'upisnik/b13b-domena-v3',
    imitates: 'unitId kao kljuc bilo gdje propusta KBF na splitskom sveucilistu',
    cleanBefore: () => upisnikKbfFixture('https://kbf.unizg.hr/studij').summary.evidenceBackedCandidatePrograms === 1,
    caught: () => {
      try { upisnikKbfFixture('https://kbf.unist.hr/studij'); return false; }
      catch (error) { return /source domain/u.test(String(error)); }
    },
  },
  {
    id: 'upisnik/b13-normalizirani-hold',
    imitates: 'Stara doslovna jednakost i bez minimalne duljine propustaju razmak i kratak dokaz',
    cleanBefore: () => {
      const report = buildUpisnikProfileCandidates(
        [{ sifraUpisnik: '1', naziv: 'Povijest', izvoditelj: 'FHS', vrsta: 'Sveucilisni prijediplomski studij' }],
        [{ programCode: '1', executors: [{ componentIds: ['fhs'] }] }],
        [{ id: 'p', unitId: 'fhs', programs: ['Drugi studij'], workTypes: ['final'] }],
      );
      return validateUpisnikProfileCoverageHolds(report).length === 0;
    },
    caught: () => {
      const report = buildUpisnikProfileCandidates(
        [{ sifraUpisnik: '1', naziv: 'Povijest', izvoditelj: 'FHS', vrsta: 'Sveucilisni prijediplomski studij' }],
        [{ programCode: '1', executors: [{ componentIds: ['fhs'] }] }],
        [{ id: 'p', unitId: 'fhs', programs: ['Drugi studij'], workTypes: ['final'] }],
      );
      const hold = report.programs[0]!.remainingHold!;
      hold.missingEvidence = ['Sluzbeni aktualni izvor za identitet programa i sastavnicu, uz dokaz obvezne vrste rada i veze s odgovarajucim profilom. '];
      const generic = validateUpisnikProfileCoverageHolds(report).some((problem) => problem.includes('generic evidence request'));
      hold.missingEvidence = ['Potreban je sluzbeni dokaz.'];
      const short = validateUpisnikProfileCoverageHolds(report).some((problem) => problem.includes('too short'));
      return generic && short;
    },
  },

  {
    id: 'upisnik/prazan-worktypes-prihvaca-sve',
    imitates: 'Prazan workTypes ponovno nudi profil za svaku razinu',
    cleanBefore: () => {
      const report = buildUpisnikProfileCandidates(
        [{ sifraUpisnik: '1', naziv: 'Geologija', izvoditelj: 'PMF', vrsta: 'Doktorski studij' }],
        [{ programCode: '1', executors: [{ componentIds: ['pmf'] }] }],
        [{ id: 'omitted', unitId: 'pmf', programs: ['Geologija'] }],
      );
      return report.programs[0]?.candidateProfileIds.includes('omitted') === true;
    },
    caught: () => {
      const rows = [
        { sifraUpisnik: '1', naziv: 'Geologija', izvoditelj: 'PMF', vrsta: 'Doktorski studij' },
        { sifraUpisnik: '2', naziv: 'Geologija', izvoditelj: 'PMF', vrsta: 'Sveucilisni prijediplomski studij' },
      ];
      const report = buildUpisnikProfileCandidates(
        rows,
        rows.map((row) => ({ programCode: row.sifraUpisnik, executors: [{ componentIds: ['pmf'] }] })),
        [{ id: 'empty', unitId: 'pmf', programs: ['Geologija'], workTypes: [] }],
      );
      return report.programs.every((program) =>
        !program.candidateProfileIds.includes('empty')
        && !program.exactCandidateProfileIds.includes('empty')
        && !program.componentWorkTypeProfileIds.includes('empty'));
    },
  },
  {
    id: 'upisnik/109-domena-druge-ustanove',
    imitates: 'Goli korijen uniri.hr u profilu propusta dokaz s medri.uniri.hr za RITEH',
    cleanBefore: () => upisnikRitehRootFixture('https://riteh.uniri.hr/studij').summary.evidenceBackedCandidatePrograms === 1,
    caught: () => {
      try { upisnikRitehRootFixture('https://medri.uniri.hr/studij'); return false; }
      catch (error) { return /source domain/u.test(String(error)); }
    },
  },
  {
    id: 'upisnik/unitid-izvan-sveucilista',
    imitates: 'unitId kao kljuc izvan sveucilisnih korijena propusta fer.com',
    cleanBefore: () => upisnikFerFixture('https://fer.unizg.hr/x').summary.evidenceBackedCandidatePrograms === 1,
    caught: () => {
      try { upisnikFerFixture('https://fer.com/x'); return false; }
      catch (error) { return /source domain/u.test(String(error)); }
    },
  },
  {
    id: 'upisnik/hold-gubi-odbijeni-izvor',
    imitates: 'Hold 109 zadržava razlog o HKS-u, ali gubi citirani izvor',
    cleanBefore: () => upisnikInventory().programs.find((row) => row.programCode === '109')?.remainingHold?.sources.length === 1,
    caught: () => {
      const holds = upisnikProfileDecisions.holds.map((hold) => hold.programCode === '109' ? { ...hold, sources: [] } : hold);
      try {
        buildUpisnikProfileCandidates(upisnikRows.rows, upisnikComponents.decisions, Object.values(upisnikProfiles),
          upisnikProfileDecisions.decisions, upisnikProfileDecisions.exclusions, upisnikProfileDecisions.blockers, holds);
        return false;
      } catch (error) { return /needs source evidence/u.test(String(error)); }
    },
  },
  {
    id: 'upisnik/citat-bez-naziva',
    imitates: 'Citat i lokator postaju općeniti i više ne imenuju Upisnik program Povijest',
    cleanBefore: () => upisnikEvidenceFixture().summary.evidenceBackedCandidatePrograms === 1,
    caught: () => {
      try { upisnikEvidenceFixture({ quote: 'Sveučilišni prijediplomski studij', sourceLocator: 'službena stranica studija' }); return false; }
      catch (error) { return /program name/u.test(String(error)); }
    },
  },
  {
    id: 'upisnik/suprotna-vrsta-bez-oznake-profila',
    imitates: 'Citat tvrdi stručni studij iako Upisnik 109 navodi sveučilišni studij',
    cleanBefore: () => upisnikEvidenceFixture().summary.evidenceBackedCandidatePrograms === 1,
    caught: () => {
      try { upisnikEvidenceFixture({ quote: 'Povijest, stručni prijediplomski studij' }); return false; }
      catch (error) { return /study type/u.test(String(error)); }
    },
  },
  {
    id: 'upisnik/prekratka-osnova-naziva',
    imitates: 'Vraća osnovu Math.max(3, word.length - 3) bez ograničenja duljine: Fizioterapija se zamijeni za Fiziku 203',
    cleanBefore: () => upisnikGuardFixture('203', 'Studij fizike').summary.evidenceBackedCandidatePrograms === 1,
    caught: () => {
      try { upisnikGuardFixture('203', 'Fizioterapija'); return false; }
      catch (error) { return /program name/u.test(String(error)); }
    },
  },
  {
    id: 'upisnik/strucni-rad-nije-vrsta-studija',
    imitates: 'Pricuvno citanje vrste broji "strucni rad" kao strucni studij i odbija sveucilisni program 3',
    cleanBefore: () => upisnikGuardFixture('3', 'Elektrotehnika; upute vrijede za zavrsni i strucni rad').summary.evidenceBackedCandidatePrograms === 1,
    caught: () => {
      // Prava vrsta uz naziv studija ili akademski naziv i dalje obara sveucilisni program 3.
      const rejects = (quote: string) => {
        try { upisnikGuardFixture('3', quote); return false; }
        catch (error) { return /study type/u.test(String(error)); }
      };
      return rejects('Elektrotehnika; strucni rad na strucnom prijediplomskom studiju')
        && rejects('Studij elektrotehnike je strucni')
        && rejects('Elektrotehnika; strucni prvostupnik inzenjer elektrotehnike');
    },
  },
  {
    id: 'upisnik/vrsta-uz-studij-preskace-rad',
    imitates: 'Vraca bilo koju rijec izmedju vrste i rijeci studij: "strucni rad na studiju" postaje strucni studij (Codex #284)',
    cleanBefore: () => upisnikStudyKindFromSource(upisnikCandidateSource())?.('strucni rad na studiju elektrotehnike') === null,
    caught: () => {
      const source = upisnikCandidateSource();
      const mutant = source.replace('(?:(?!rad)\\w+\\s+){0,3}studij', '(?:\\w+\\s+){0,3}studij');
      return mutant !== source && upisnikStudyKindFromSource(mutant)?.('strucni rad na studiju elektrotehnike') === 'vocational';
    },
  },
  {
    id: 'upisnik/pricuvna-vrsta-samo-uz-akademski-naziv',
    imitates: 'Vraca pricuvno citanje bilo koje rijeci strucn: "strucna radionica" i "strucna pomoc pri izradi rada" postaju strucni studij (Codex #284)',
    cleanBefore: () => {
      const kindOf = upisnikStudyKindFromSource(upisnikCandidateSource());
      return ['strucna radionica', 'strucno radno mjesto', 'strucna pomoc pri izradi rada'].every((q) => kindOf?.(q) === null)
        && kindOf?.('strucni prvostupnik inzenjer') === 'vocational';
    },
    caught: () => {
      const source = upisnikCandidateSource();
      const mutant = source.replace('/\\b(sveucilisn|strucn)\\w*\\s+(?:prvostupni|specijalist|magist|bacc)\\w*/gu', '/\\b(sveucilisn|strucn)\\w*\\b/gu');
      const kindOf = upisnikStudyKindFromSource(mutant);
      return mutant !== source && kindOf?.('strucna radionica') === 'vocational' && kindOf?.('strucna pomoc pri izradi rada') === 'vocational';
    },
  },
  {
    id: 'upisnik/samo-puna-rijec-strucni',
    imitates: 'Vraća prepoznavanje samo pune riječi strucni: stručnog studija za sveučilišni program 3 prolazi',
    cleanBefore: () => upisnikGuardFixture('3', 'Prijediplomski studij elektrotehnike').summary.evidenceBackedCandidatePrograms === 1,
    caught: () => {
      try { upisnikGuardFixture('3', 'Prijediplomski program stručnog studija elektrotehnike'); return false; }
      catch (error) { return /study type/u.test(String(error)); }
    },
  },
  {
    id: 'upisnik/izbrisana-integrirana-odluka',
    imitates: 'Brisanje iznimke za integrirani studij uklanja kandidata 917',
    cleanBefore: () => upisnikInventory(undefined, upisnikProfileDecisions.integratedGraduateCoverage).programs.find((row) => row.programCode === '917')?.exactCandidateProfileIds.includes('vef-diplomski') === true,
    caught: () => upisnikInventory(undefined, []).programs.find((row) => row.programCode === '917')?.exactCandidateProfileIds.includes('vef-diplomski') === false,
  },
  {
    id: 'upisnik/globalna-kompatibilnost-integriranog',
    imitates: 'Globalno dopustenje diplomskih profila dodaje kandidata kontrolnom integriranom programu',
    cleanBefore: () => ['900', '915', '919', '2018', '2229', '2236', '2237', '2585'].every((code) => upisnikInventory().programs.find((row) => row.programCode === code)?.componentWorkTypeProfileIds.length === 0),
    caught: () => {
      const controls = new Set(['900', '915', '919', '2018', '2229', '2236', '2237', '2585']);
      const report = upisnikInventory();
      const atRisk = report.programs.filter((row) => controls.has(row.programCode) &&
        Object.values(upisnikProfiles).some((profile) => row.componentIds.includes(profile.unitId) && profile.workTypes?.includes('graduate')));
      return atRisk.length > 0 && atRisk.every((row) =>
        row.exactCandidateProfileIds.length === 0 && row.componentWorkTypeProfileIds.length === 0);
    },
  },
  {
    id: 'upisnik/bez-registrirane-url-veze',
    imitates: 'Neregistrirani URL na ispravnoj domeni prolazi bez provjere prema registru',
    cleanBefore: () => upisnikInventory(undefined, upisnikProfileDecisions.integratedGraduateCoverage).programs.find((row) => row.programCode === '917')?.exactCandidateProfileIds.includes('vef-diplomski') === true,
    caught: () => {
      const coverage = upisnikProfileDecisions.integratedGraduateCoverage[0]!;
      try { upisnikInventory(undefined, [{ ...coverage, evidence: { ...coverage.evidence, sourceUrl: 'https://www.vef.unizg.hr/nepostojeci.pdf' } }]); return false; }
      catch (error) { return /source registry/u.test(String(error)); }
    },
  },
  {
    id: 'upisnik/izbrisana-jedna-veza',
    imitates: 'Jedna programska šifra nestaje iz imenovanog skupa potvrđenih veza',
    cleanBefore: () => JSON.stringify(verifiedCodes(upisnikInventory().programs)) === JSON.stringify(verifiedCodes(generatedUpisnikProfiles.programs)),
    caught: () => JSON.stringify(verifiedCodes(upisnikInventory(upisnikProfileDecisions.decisions.slice(1)).programs)) !== JSON.stringify(verifiedCodes(generatedUpisnikProfiles.programs)),
  },
  {
    id: 'upisnik/zastarjeli-generirani-artefakt',
    imitates: 'Odluka se izmijeni bez regeneracije Upisnik profilnog artefakta',
    cleanBefore: () => JSON.stringify(upisnikInventory().programs) === JSON.stringify(generatedUpisnikProfiles.programs),
    caught: () => JSON.stringify(upisnikInventory(upisnikProfileDecisions.decisions.slice(1)).programs) !== JSON.stringify(generatedUpisnikProfiles.programs),
  },
  {
    id: 'unit-match/bez-dokaza-za-rucnu-promjenu',
    imitates: 'Ručno promijenjeni exact prijedlog uparivanja jedinice nema službeni dokaz',
    cleanBefore: () => validateDecisions({ schemaVersion: 1, decisions: [{ executor: 'X', unitId: 'a', noUnitReason: null, decidedBy: 'Test', decidedAt: '2026-09-26', bulk: false, proposed: { unitId: 'a', confidence: 'exact' } }] }, { knownExecutors: new Set(['X']), knownUnitIds: new Set(['a', 'b']) }).length === 0,
    caught: () => validateDecisions({ schemaVersion: 1, decisions: [{ executor: 'X', unitId: 'b', noUnitReason: null, decidedBy: 'Test', decidedAt: '2026-09-26', bulk: false, proposed: { unitId: 'a', confidence: 'exact' } }] }, { knownExecutors: new Set(['X']), knownUnitIds: new Set(['a', 'b']) }).some((error) => error.includes('službeni dokaz')),
  },
  {
    id: 'upisnik/genericki-hold-za-jedinog-kandidata',
    imitates: 'Program s jednim profilom iste razine dobiva generički zahtjev za dokaz bez imena kandidata',
    cleanBefore: () => {
      const report = buildUpisnikProfileCandidates(
        [{ sifraUpisnik: '1', naziv: 'Povijest', izvoditelj: 'FHS', vrsta: 'Sveučilišni prijediplomski studij' }],
        [{ programCode: '1', executors: [{ componentIds: ['fhs'] }] }],
        [{ id: 'fhs-zavrsni', unitId: 'fhs', programs: ['Drugi studij'], workTypes: ['final'] }],
      );
      return validateUpisnikProfileCoverageHolds(report).length === 0;
    },
    caught: () => {
      const report = buildUpisnikProfileCandidates(
        [{ sifraUpisnik: '1', naziv: 'Povijest', izvoditelj: 'FHS', vrsta: 'Sveučilišni prijediplomski studij' }],
        [{ programCode: '1', executors: [{ componentIds: ['fhs'] }] }],
        [{ id: 'fhs-zavrsni', unitId: 'fhs', programs: ['Drugi studij'], workTypes: ['final'] }],
      );
      report.programs[0]!.remainingHold!.missingEvidence = ['Službeni aktualni izvor za identitet programa i sastavnicu, uz dokaz obvezne vrste rada i veze s odgovarajućim profilom.'];
      return validateUpisnikProfileCoverageHolds(report).some((problem) => problem.includes('generic evidence request'));
    },
  },
  {
    id: 'upisnik/nerijesena-profilna-rupa-bez-holda',
    imitates: 'Upisnik redak ostaje neriješen, ali izvještaj ukloni razlog blokade i konkretan traženi dokaz',
    cleanBefore: () => {
      const report = buildUpisnikProfileCandidates(
        [{ sifraUpisnik: '2', naziv: 'Logopedija', izvoditelj: 'Sveučilište' }],
        [],
        [],
      );
      return validateUpisnikProfileCoverageHolds(report).length === 0;
    },
    caught: () => {
      const report = buildUpisnikProfileCandidates(
        [{ sifraUpisnik: '2', naziv: 'Logopedija', izvoditelj: 'Sveučilište' }],
        [],
        [],
      );
      report.programs[0]!.remainingHold = null;
      return validateUpisnikProfileCoverageHolds(report).some((problem) => problem.includes('no hold'));
    },
  },
  {
    id: 'upisnik/sukob-bez-oba-izvora-u-holdu',
    imitates: 'Upisnik sukob zadržava status blokade, ali hold izgubi jedan od svojih službenih izvora',
    cleanBefore: () => {
      const report = buildUpisnikProfileCandidates(
        [{ sifraUpisnik: '1', naziv: 'Test', izvoditelj: 'Sveučilište', vrsta: 'Sveučilišni prijediplomski studij' }],
        [{ programCode: '1', executors: [{ componentIds: ['fhs'] }] }],
        [],
        [],
        [],
        [{
          programCode: '1',
          reasonCode: 'conflicting-completion-evidence',
          sources: [
            { sourceUrl: 'https://fhs.hr/a', sourceLocator: 'službena stranica studija', quote: 'Završni rad' },
            { sourceUrl: 'https://fhs.hr/b', sourceLocator: 'službena stranica sastavnice', quote: 'Završni ispit' },
          ],
        }],
      );
      return validateUpisnikProfileCoverageHolds(report).length === 0;
    },
    caught: () => {
      const report = buildUpisnikProfileCandidates(
        [{ sifraUpisnik: '1', naziv: 'Test', izvoditelj: 'Sveučilište', vrsta: 'Sveučilišni prijediplomski studij' }],
        [{ programCode: '1', executors: [{ componentIds: ['fhs'] }] }],
        [],
        [],
        [],
        [{
          programCode: '1',
          reasonCode: 'conflicting-completion-evidence',
          sources: [
            { sourceUrl: 'https://fhs.hr/a', sourceLocator: 'službena stranica studija', quote: 'Završni rad' },
            { sourceUrl: 'https://fhs.hr/b', sourceLocator: 'službena stranica sastavnice', quote: 'Završni ispit' },
          ],
        }],
      );
      report.programs[0]!.remainingHold!.sources.pop();
      return validateUpisnikProfileCoverageHolds(report).some((problem) => problem.includes('both cited sources'));
    },
  },
  // --- sekcija 6 VERIFICATION_PIPELINE.md: bodovano pravilo ne smije lagati o izvoru -------------
  {
    id: 'gate/bez-sourcePage',
    imitates: 'pravilo koje boduje, a lokator u izvoru nikad nije potvrden (CLAUDE.md: sourcePage ostaje null, ne nagada se)',
    caught: () => gateCodes(profileWith(goodEntry({ sourcePage: null }))).includes('scored-no-page'),
    cleanBefore: () => gateCodes(profileWith(goodEntry())).length === 0,
  },
  {
    id: 'gate/bez-citata',
    imitates: 'bodovano pravilo bez doslovnog citata: tvrdnja koju nitko ne moze provjeriti',
    caught: () => gateCodes(profileWith(goodEntry({ quote: null }))).includes('scored-no-quote'),
    cleanBefore: () => gateCodes(profileWith(goodEntry())).length === 0,
  },
  {
    id: 'gate/izmisljen-izvor',
    imitates: 'sourceId koji ne postoji u registru (tipfeler ili izvor obrisan pod nogama)',
    caught: () => gateCodes(profileWith(goodEntry({ sourceId: 'ne-postoji-2026' }))).includes('orphan-source'),
    cleanBefore: () => gateCodes(profileWith(goodEntry())).length === 0,
  },
  {
    id: 'gate/scored-bez-uporista',
    imitates: 'rucno postavljen `scored: true` na pravilu koje ne zadovoljava izvedeni uvjet',
    caught: () =>
      gateCodes(profileWith(goodEntry({ status: 'draft' }))).includes('scored-not-derivable'),
    cleanBefore: () => gateCodes(profileWith(goodEntry())).length === 0,
  },
  {
    id: 'gate/neslužben-autoritet',
    imitates: 'bodovanje po uputi mentora (mentor-or-course nikad ne smije bodovati)',
    caught: () => gateCodes(profileWith(goodEntry({ authority: 'mentor-or-course' }))).includes('scored-authority'),
    cleanBefore: () => gateCodes(profileWith(goodEntry())).length === 0,
  },
  {
    id: 'gate/obvezujuce-bez-drugog-para-ociju',
    imitates: 'binding pravilo bez reviewedBy (sekcija 2: obvezujuce trazi drugi par ociju)',
    caught: () =>
      gateCodes(profileWith(goodEntry({ authority: 'binding', reviewedBy: null }))).includes('binding-no-review'),
    cleanBefore: () =>
      gateCodes(profileWith(goodEntry({ authority: 'binding', reviewedBy: 'Netko' }))).length === 0,
  },
  {
    id: 'gate/izvor-promijenjen-nakon-verifikacije',
    imitates: 'snapshot stabilnog izvora se promijenio nakon sto je pravilo verificirano protiv njega',
    caught: () =>
      gateCodes(profileWith(goodEntry({ verifiedHash: 'f'.repeat(64) }))).includes('source-hash-drift'),
    cleanBefore: () =>
      gateCodes(profileWith(goodEntry({ verifiedHash: REAL_SOURCE.snapshotHash }))).length === 0,
  },
  {
    id: 'gate/zastarjela-verifikacija',
    imitates: 'bodovano pravilo starije od roka valjanosti (sekcija 5: 24 mjeseca)',
    caught: () => gateCodes(profileWith(goodEntry({ lastVerified: '2020-01-01' }))).includes('stale'),
    cleanBefore: () => gateCodes(profileWith(goodEntry())).length === 0,
  },
  {
    id: 'gate/nepoznat-checkId',
    imitates: 'pravilo napisano nad checkId-em koji kompajler ne poznaje, pa tiho ne radi nista',
    caught: () =>
      collectCompileDiagnostics([profileWith(goodEntry({ checkId: 'izmisljena-os' }))]).length > 0,
    cleanBefore: () => collectCompileDiagnostics([profileWith(goodEntry())]).length === 0,
  },

  // --- vezanje bodovane vrijednosti na tvrdnju --------------------------------------------------
  {
    id: 'vezanje/motor-boduje-drugu-vrijednost',
    imitates: 'unizd-pomorski: izvor propisuje Merriweather, motor boduje Times New Roman',
    caught: () =>
      findScoredValueFindings(profileWith(goodEntry(), { font: ['Arial'] }), SOURCES).some(
        (f) => f.kind === 'drift',
      ),
    cleanBefore: () => findScoredValueFindings(profileWith(goodEntry()), SOURCES).length === 0,
  },
  // --- mehanizam mora OPALITI, ne samo postojati ------------------------------------------------
  {
    id: 'mehanizam/mrtav-kod-s-brojacem-na-nuli',
    imitates:
      'dovlacenje citata koje je citalo "[object Object]" i nista nije radilo, dok se nizvodna mjera popravljala iz drugog razloga',
    caught: () => backfillTotal(0) === 0,
    cleanBefore: () => backfillTotal() > 0,
  },
  // --- manifest dokaza: run bez ljudskog ocekivanja NIJE dokaz na stvarnom radu ----------------
  {
    id: 'dokaz/ocekivanje-zapisano-nakon-runa',
    imitates:
      'dokument koji je "prosao" na stvarnom radu, a ocekivanje je zapisano tek nakon runa, pa se s alatom nije moglo ni ne sloziti',
    caught: () => !countsAsRealDocxProof(manifestWithRecordedAt('2026-08-30T12:00:00.000Z'), PROOF_METHOD),
    cleanBefore: () => countsAsRealDocxProof(manifestWithRecordedAt('2026-08-30T09:00:00.000Z'), PROOF_METHOD),
  },
  {
    id: 'dokaz/pregled-bez-potpisa',
    imitates: 'razina A bez ijednog covjeka koji je dokument otvorio i potpisao da se slaze s onim sto alat javlja',
    caught: () => {
      const m = manifestWithRecordedAt('2026-08-30T09:00:00.000Z');
      return !countsAsRealDocxProof({ ...m, visualReview: { ...m.visualReview, reviewedBy: '' } }, PROOF_METHOD);
    },
    cleanBefore: () => countsAsRealDocxProof(manifestWithRecordedAt('2026-08-30T09:00:00.000Z'), PROOF_METHOD),
  },
  {
    id: 'vezanje/tvrdnja-se-ne-primjenjuje',
    imitates: 'pravo-*: verificirana tvrdnja postoji, a motor tu dimenziju uopce ne provjerava',
    caught: () =>
      findScoredValueFindings(profileWith(goodEntry(), {}), SOURCES).some((f) => f.kind === 'unapplied'),
    cleanBefore: () => findScoredValueFindings(profileWith(goodEntry()), SOURCES).length === 0,
  },
  {
    id: 'vezanje/bodovanje-bez-ijedne-tvrdnje',
    imitates: '14 profila koji boduju font/margine bez ijednog ruleEntry-ja',
    caught: () =>
      findScoredValueFindings({ id: 'p', rules: { font: ['Arial'] }, ruleEntries: [] } as ThesisProfile, SOURCES, {
        demotedCheckIds: new Set(),
      }).some((f) => f.kind === 'unbacked'),
    cleanBefore: () =>
      findScoredValueFindings({ id: 'p', rules: { font: ['Arial'] }, ruleEntries: [] } as ThesisProfile, SOURCES, {
        demotedCheckIds: new Set(['font']),
      }).length === 0,
  },
  {
    id: 'vezanje/skriveno-iza-zastavice',
    axis: 'font',
    imitates: 'razlika sakrivena time sto je dimenzija ugasena zastavicom, a vrijednost ostala kriva',
    // `.every()` je na praznom polju TRUE, pa bi ova tvrdnja prolazila i da gard ne vraca nista.
    // Zato se trazi OBOJE: uz ugasenu zastavicu nema nalaza, a uz upaljenu ga ima. Tek to dokazuje
    // da je razlika stvarno bila vidljiva pa je zastavica sakrila, a ne da gard sutu u oba slucaja.
    caught: () => {
      const off = findScoredValueFindings(
        profileWith(goodEntry(), { font: ['Arial'], checkFont: false }),
        SOURCES,
      );
      const on = findScoredValueFindings(profileWith(goodEntry(), { font: ['Arial'] }), SOURCES);
      return off.every((f) => f.kind !== 'drift') && on.some((f) => f.kind === 'drift');
    },
    cleanBefore: () => findScoredValueFindings(profileWith(goodEntry()), SOURCES).length === 0,
  },

  // --- D1: `readAxis` je bio vjezban SAMO na `font`, pa se 7 od 8 osi moglo tiho ugasiti --------
  {
    id: 'vezanje/paper-size-alias-nije-raskorak',
    axis: 'paper-size',
    imitates: 'tvrdnja `A4` daje `paperSizes`, zrcalo nosi `requireA4`: ista odredba, drukcije zapisana',
    caught: () =>
      // Ako `readAxis` prestane razrjesavati alias, ovo postaje lazan raskorak.
      findScoredValueFindings(
        profileWith(goodEntry({ ruleId: 'r-ps', checkId: 'paper-size', value: 'A4' }), { requireA4: true }),
        SOURCES,
      ).length === 0,
    cleanBefore: () =>
      // Netrivijalno: ista postava s KRIVIM formatom mora dati raskorak, inace gard sutu u oba slucaja.
      findScoredValueFindings(
        profileWith(goodEntry({ ruleId: 'r-ps', checkId: 'paper-size', value: 'A3' }), { requireA4: true }),
        SOURCES,
      ).some((f) => f.kind === 'drift'),
  },
  {
    id: 'vezanje/paper-size-kriva-vrijednost',
    axis: 'paper-size',
    imitates: 'izvod koji IGNORIRA vrijednost i uvijek trazi A4 (stvaran kvar, vidi zaglavlje)',
    caught: () =>
      findScoredValueFindings(
        profileWith(goodEntry({ ruleId: 'r-ps', checkId: 'paper-size', value: 'A3' }), { paperSizes: ['A4'] }),
        SOURCES,
      ).some((f) => f.kind === 'drift' && f.checkId === 'paper-size'),
    cleanBefore: () =>
      findScoredValueFindings(
        profileWith(goodEntry({ ruleId: 'r-ps', checkId: 'paper-size', value: 'A3' }), { paperSizes: ['A3'] }),
        SOURCES,
      ).length === 0,
  },
  {
    id: 'vezanje/margins-minimum-mijenja-znacenje',
    axis: 'margins',
    imitates: 'forenzika-diplomski: "najmanje 2,5 cm" naspram "tocno 2,5 cm" je ista brojka, drugo pravilo',
    caught: () =>
      findScoredValueFindings(
        profileWith(
          goodEntry({ ruleId: 'r-m', checkId: 'margins', value: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5, minimum: true } }),
          { margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 } },
        ),
        SOURCES,
      ).some((f) => f.kind === 'drift' && f.checkId === 'margins'),
    cleanBefore: () =>
      findScoredValueFindings(
        profileWith(
          goodEntry({ ruleId: 'r-m', checkId: 'margins', value: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5, minimum: true } }),
          { margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 }, marginsMinimum: true },
        ),
        SOURCES,
      ).length === 0,
  },
  {
    id: 'vezanje/justify-cita-par-zastavica-vrijednost',
    axis: 'justify',
    imitates: 'motor boduje justify samo uz `checkJustify !== false && profile.justify`',
    caught: () =>
      findScoredValueFindings(
        profileWith(goodEntry({ ruleId: 'r-j', checkId: 'justify', value: true }), { justify: true, checkJustify: false }),
        SOURCES,
      ).some((f) => f.kind === 'unapplied' && f.checkId === 'justify'),
    cleanBefore: () =>
      findScoredValueFindings(
        profileWith(goodEntry({ ruleId: 'r-j', checkId: 'justify', value: true }), { justify: true, checkJustify: true }),
        SOURCES,
      ).length === 0,
  },

  // --- D4: kodovi koje vrata emitiraju, a nijedna mutacija ih nije trazila -----------------------
  {
    id: 'gate/status-nije-verified',
    imitates: 'pravilo koje boduje iz statusa koji jos ceka ljudski pass (ai-confirmed)',
    caught: () => gateCodes(profileWith(goodEntry({ status: 'ai-confirmed' }))).includes('scored-not-verified'),
    cleanBefore: () => gateCodes(profileWith(goodEntry())).length === 0,
  },
  {
    id: 'gate/bez-lastVerified',
    imitates: 'bodovano pravilo bez datuma provjere: svjezina se ne moze ni izracunati',
    caught: () => gateCodes(profileWith(goodEntry({ lastVerified: null }))).includes('scored-no-lastverified'),
    cleanBefore: () => gateCodes(profileWith(goodEntry())).length === 0,
  },
  {
    id: 'gate/dopunski-izvor-promijenjen',
    imitates: 'kompozitno pravilo: DOPUNSKI sluzbeni izvor promijenjen nakon verifikacije',
    caught: () =>
      gateCodes(
        profileWith(
          goodEntry({
            additionalSources: [
              { sourceId: REAL_SOURCE_ID, sourcePage: 'str. 2', quote: 'x', verifiedHash: 'a'.repeat(64) },
            ],
          }),
        ),
      ).includes('scored-addsrc-drift'),
    cleanBefore: () =>
      gateCodes(
        profileWith(
          goodEntry({
            additionalSources: [
              { sourceId: REAL_SOURCE_ID, sourcePage: 'str. 2', quote: 'x', verifiedHash: REAL_SOURCE.snapshotHash },
            ],
          }),
        ),
      ).length === 0,
  },
  {
    id: 'gate/diagnostic-stize-do-vrata',
    imitates: 'nepoznat checkId mora postati GRESKA VRATA, ne samo dijagnostika kompajlera',
    caught: () => gateCodes(profileWith(goodEntry({ checkId: 'izmisljena-os' }))).includes('compiler-diagnostic'),
    cleanBefore: () => gateCodes(profileWith(goodEntry())).length === 0,
  },

  // --- coverage: potpisan razlog nadjacava izvedeno stanje ---------------------------------------
  {
    id: 'coverage/potpisan-razlog-se-ignorira',
    imitates: 'FER: izvor procitan i dokazano ne obvezuje, a matrica ga vodi kao zaostatak',
    caught: () =>
      computeCoverageCell(profileWith(goodEntry({ status: 'advisory', scored: false })), SOURCES, {
        'mut-profil': { state: 'advisory-by-decision' },
      }).state === 'advisory-by-decision',
    cleanBefore: () =>
      computeCoverageCell(profileWith(goodEntry({ status: 'advisory', scored: false })), SOURCES, {}).state ===
      'advisory-only',
  },

  // --- otisak koda popravka (T74) ----------------------------------------------------------------
  {
    id: 'repair-hash/claude-md-zastarijeva-manifeste',
    imitates:
      'otisak src/repair ukljucuje CLAUDE.md i testove (wf/ai-evidence-audit), pa jedna linija komentara zastarijeva sve manifeste (T73, 3b)',
    caught: () => !otisakPratiSamoProdukciju((files) => repairSourceHashFromFiles(files, () => true).hash),
    cleanBefore: () => otisakPratiSamoProdukciju((files) => repairSourceHashFromFiles(files).hash),
  },

  // --- jedan dokument, jedan glas (T83) ----------------------------------------------------------
  {
    id: 'korpus/isti-rad-iz-dva-korijena-broji-se-dvaput',
    imitates:
      'manifest je obican spoj docx-local i LEKTA_CORPUS_SOURCE, pa 102 bajt-identicna rada ulaze dvaput (321 umjesto 219, 2026-09-27)',
    caught: () => !jedanDokumentJedanGlas((entries) => ({ entries, duplicates: [] })),
    cleanBefore: () => jedanDokumentJedanGlas((entries) => dedupeManifest(entries, bajtoviPoIdu)),
  },
  {
    id: 'korpus/isti-sadrzaj-pod-dva-imena-prolazi',
    imitates:
      'dedupe po documentId cita bajtove tek kad se id ponovi, pa isti rad pod drugim imenom ulazi dvaput (Codex #185, T83-01)',
    caught: () => !istiSadrzajPodDvaImenaPada((entries) => dedupeManifestSamoPoIdu(entries)),
    cleanBefore: () => istiSadrzajPodDvaImenaPada((entries) => dedupeManifest(entries, () => new Uint8Array([7]))),
  },
  {
    id: 'korpus/potpis-v1-ovjere-prelazi-na-v2-mjerenje',
    imitates:
      'attest-real-corpus.mjs je potpis prenosio cim je otisak isti; ponovljeno mjerenje 27. 9. dalo je isti v1 otisak kao ovjera potpisana 12. 9.',
    caught: () =>
      potpisOstajeSamoUzIstiSadrzaj((e, n) =>
        e && e.signedBy && e.signedAt && e.corpusFingerprint === n.corpusFingerprint
          ? { signedBy: String(e.signedBy), signedAt: String(e.signedAt) }
          : null,
      ) === false,
    cleanBefore: () => potpisOstajeSamoUzIstiSadrzaj(inheritedSignature),
  },
  {
    id: 'korpus/potpis-noviji-od-drugog-mjerenja-istog-skupa',
    imitates:
      'uvjet "potpis nije stariji od mjerenja" bez identiteta mjerenja: mjerenje 09:00, potpis 10:00, novo mjerenje 09:30 nasljeduje (Codex #185, T83-05)',
    caught: () =>
      potpisOstajeSamoUzIstiSadrzaj((e, n) =>
        e && e.signedBy && e.signedAt && e.fingerprintVersion === 2 && e.corpusFingerprint === n.corpusFingerprint &&
        Date.parse(String(e.signedAt)) >= Date.parse(String(n.measuredAt))
          ? { signedBy: String(e.signedBy), signedAt: String(e.signedAt) }
          : null,
      ) === false,
    cleanBefore: () => potpisOstajeSamoUzIstiSadrzaj(inheritedSignature),
  },
  {
    id: 'korpus/potpis-prelazi-na-holdout-confirmed-ovjeru',
    imitates:
      'potpis vezan uz otisak, vrijeme i commit mjerenja prelazi na istu ovjeru s --holdout-confirmed, iako se opseg dokaza i brojke mijenjaju (Codex #185, runda 2, T83-05)',
    caught: () =>
      potpisOstajeSamoUzIstiSadrzaj((e, n) =>
        e && e.signedBy && e.signedAt && e.fingerprintVersion === 2 && e.corpusFingerprint === n.corpusFingerprint &&
        e.measuredAt === n.measuredAt && e.measuredFromCommit === n.measuredFromCommit
          ? { signedBy: String(e.signedBy), signedAt: String(e.signedAt) }
          : null,
      ) === false,
    cleanBefore: () => potpisOstajeSamoUzIstiSadrzaj(inheritedSignature),
  },
  {
    id: 'korpus/skupina-s-palim-radom-ostaje-dokaziva',
    imitates:
      'pali dokument samo nije ulazio u cleanCount, pa je skupina s jednim cistim i jednim palim radom ostajala dokaziva (Codex #185, T83-03)',
    caught: () => !paloMjerenjeSeNeOvjerava(gardIzIzvora('!DOPUSTENI_ISHODI.has(r.outcome)', 'false')),
    cleanBefore: () => paloMjerenjeSeNeOvjerava(gardIzIzvora('!DOPUSTENI_ISHODI.has(r.outcome)', '!DOPUSTENI_ISHODI.has(r.outcome)')),
  },
  {
    id: 'korpus/rezultat-s-greskom-i-ishodom-review-prolazi',
    imitates:
      'attestationRefusals je gledao samo ishod, pa je rezultat { outcome: "review", error: "analysis crashed" } prolazio (Codex #185, runda 2, T83-03)',
    caught: () => !paloMjerenjeSeNeOvjerava(gardIzIzvora("r.error !== null && r.error !== undefined && String(r.error).trim() !== ''", 'false')),
    cleanBefore: () => paloMjerenjeSeNeOvjerava(attestationRefusals),
  },
  {
    id: 'korpus/brojka-promijenjena-nakon-potpisa-ostaje-priznata',
    imitates:
      'citac je provjeravao samo oblik signedContentDigest, pa je cleanCount 1 -> 2 nakon potpisa ostajao priznat (Codex #185, runda 3, NOVO-01)',
    caught: () => !izmjenaNakonPotpisaPada((a) => signedContentProblem(a, (x) => String(x.signedContentDigest))),
    cleanBefore: () => izmjenaNakonPotpisaPada((a) => signedContentProblem(a)),
  },
  {
    id: 'korpus/ovjera-bez-otiska-koda-popravka-je-dokaz',
    imitates:
      'ovjera realnog korpusa nije navodila nad kojim je kodom popravka mjereno (T73 nalaz a/b, T75), pa se nije znalo koji je kod dokazan',
    caught: () => !mjereniKodSeTrazi((a) => measuredCodeProblem(a, () => true)),
    cleanBefore: () => mjereniKodSeTrazi((a) => measuredCodeProblem(a)),
  },
  /**
   * Odluka vlasnika 2026-09-28: javni rad pretvoren iz PDF-a daje zasebnu razinu `A-pdf`, nikad A.
   * Prava ovjera koja nosi `sourceKind` PDF konverzije ne smije postati dokaz razine A.
   */
  {
    id: 'korpus/prava-ovjera-prihvaca-sourceKind-pdf',
    imitates:
      'citac prave ovjere nije gledao sourceKind, pa bi ovjera nad radovima pretvorenim iz PDF-a (Dabar, ZIR) ' +
      'podignula profile na razinu A kao da je mjerena na izvornim Word dokumentima',
    // Citac koji sourceKind uopce ne gleda; iskljucenje samo `isPdf` vise nije dovoljno, jer zatvoren skup
    // vrsta (Codex #225) PDF vrstu odbija i bez njega.
    caught: () => !pdfNijeDokazA(() => null),
    cleanBefore: () =>
      pdfNijeDokazA((a) => realSourceKindProblem(a)) &&
      provenUnitWorkTypes(potpisanaOvjera()).size === 1 &&
      provenUnitWorkTypes(potpisanaOvjera('public-pdf-converted')).size === 0 &&
      provenPdfUnitWorkTypes(potpisanaOvjera('public-pdf-converted')).size === 1 &&
      provenPdfUnitWorkTypes(potpisanaOvjera()).size === 0,
  },
  /** Codex #225, nalaz 1: odsutan sourceKind ne smije znaciti izvorni DOCX za novu ovjeru. */
  {
    id: 'korpus/nova-ovjera-bez-sourceKind-vrijedi-kao-docx',
    imitates:
      'citac je ovjeru bez sourceKind uvijek citao kao izvorni DOCX, a skripta ovjere polje nije pisala, pa bi PDF ' +
      'pretvoren u DOCX, izmjeren postojecim putem i potpisan, dao pravi A',
    caught: () => !bezVrsteSamoStaraOvjera((a) => realSourceKindProblem(a, undefined, '2100-01-01T00:00:00.000Z')),
    cleanBefore: () => bezVrsteSamoStaraOvjera((a) => realSourceKindProblem(a)),
  },
  /** Codex #225, nalaz 1: citac je odbijao samo tocan PDF niz, pa je nepoznata vrijednost prolazila kao DOCX. */
  {
    id: 'korpus/nepoznat-sourceKind-vrijedi-kao-docx',
    imitates: 'citac prave ovjere odbijao je samo tocan niz "public-pdf-converted", pa je svaka druga vrijednost prolazila kao izvorni DOCX',
    caught: () => !nepoznataVrstaOdbijena((a) => (a.sourceKind === 'public-pdf-converted' ? 'pdf' : null)),
    cleanBefore: () => nepoznataVrstaOdbijena((a) => realSourceKindProblem(a)),
  },
  {
    id: 'ledger/pdf-dokaz-podize-claim-na-A',
    imitates:
      'ledger je parove dokazane na radu pretvorenom iz PDF-a spojio s parovima prave ovjere, pa je redak B ' +
      'postao A i usao u byClaim, umjesto da dobije samo zasebnu razinu A-pdf',
    caught: () =>
      pdfRazdvajanje((i) => new Set([...provenUnitWorkTypes(i.corpusAttestation), ...provenPdfUnitWorkTypes(i.pdfCorpusAttestation)]))
        .problemi.some((p) => p.includes('PDF ovjera je promijenila claim')),
    cleanBefore: () => {
      const r = pdfRazdvajanje();
      return r.bBez === 1 && r.aPdf === 1 && r.problemi.length === 0;
    },
  },

  // --- integritet snapshota ----------------------------------------------------------------------
  {
    id: 'snapshot/hash-ne-odgovara-datoteci',
    imitates: 'PDF na disku promijenjen, a registar i dalje tvrdi stari sha256',
    caught: () =>
      checkSourceHashes({
        sources: [{ ...REAL_SOURCE, snapshotHash: '0'.repeat(64) }],
        only: [REAL_SOURCE_ID],
      }).problems.some((p: { kind: string }) => p.kind === 'hash-mismatch'),
    cleanBefore: () =>
      checkSourceHashes({ sources: [REAL_SOURCE], only: [REAL_SOURCE_ID] }).problems.length === 0,
  },
  {
    id: 'snapshot/datoteka-nedostaje',
    imitates: 'registar upucuje na snapshot koji vise ne postoji na disku',
    caught: () =>
      checkSourceHashes({
        sources: [{ ...REAL_SOURCE, snapshotPath: 'data/sources/ne/postoji.pdf' }],
        only: [REAL_SOURCE_ID],
      }).problems.some((p: { kind: string }) => p.kind === 'missing-file'),
    cleanBefore: () =>
      checkSourceHashes({ sources: [REAL_SOURCE], only: [REAL_SOURCE_ID] }).problems.length === 0,
  },
  {
    id: 'snapshot/izvor-bez-hasha',
    imitates: 'izvor uveden bez sha256, pa se njegova nepromjenjivost ne moze dokazati',
    caught: () =>
      checkSourceHashes({
        sources: [{ ...REAL_SOURCE, snapshotHash: null }],
        only: [REAL_SOURCE_ID],
      }).problems.some((p: { kind: string }) => p.kind === 'no-hash'),
    cleanBefore: () =>
      checkSourceHashes({ sources: [REAL_SOURCE], only: [REAL_SOURCE_ID] }).problems.length === 0,
  },

  // --- demotija: ne smije se sama pobrisati ------------------------------------------------------
  {
    id: 'demotija/osnovni-izracun-ne-ovisi-o-raskoraku',
    imitates: 'gard koji preskace vec demotirane osi pa se u sljedecem krugu isprazni i kvar se vrati',
    /**
     * Prva izvedba je koristila izmisljen `mut-profil`, kojeg NEMA u `demotedByProfile`, pa su base i
     * puna verzija vracale isto i tvrdnja nije mjerila nista. Sada se uzima profil koji STVARNO ima
     * raskorak: base ga ne smije demotirati (ima bodovanu tvrdnju za tu os), puna verzija mora.
     * Zamjena base -> puna u generatoru time postaje vidljiva.
     */
    caught: () => {
      const { id, axis } = DEMOTION_FIXTURE;
      const entries = draftRuleEntriesFor(id);
      const base = computeBaseDemotedAdvisory({ id }, entries, SOURCES);
      const full = computeDemotedAdvisory({ id }, entries, SOURCES, { [id]: [axis] });
      return !base.includes(axis) && full.includes(axis);
    },
    cleanBefore: () => {
      // Netrivijalnost: BEZ podmetnutog raskoraka puna verzija mora vratiti isto sto i base. Da to ne
      // stoji, gornja tvrdnja bi prolazila zato sto os pada iz nekog drugog razloga.
      const { id, axis } = DEMOTION_FIXTURE;
      const entries = draftRuleEntriesFor(id);
      const base = computeBaseDemotedAdvisory({ id }, entries, SOURCES);
      const full = computeDemotedAdvisory({ id }, entries, SOURCES);
      return !base.includes(axis) && !full.includes(axis);
    },
  },
  // --- zastita od demotije: overlay katedre mora PROPISATI, ne samo spomenuti kljuc ----------------
  {
    id: 'poluge/gola-zastavica-ne-stiti',
    axis: 'font',
    imitates:
      'overlay katedre s golom zastavicom (`checkFont: true`, bez fonta) ponistava demotiju a ne ' +
      'propisuje nikakvu vrijednost, pa se dalje boduje bas ona vrijednost osnovnog profila koju ' +
      'tvrdnja s citatom opovrgava',
    caught: () => !demotionProtectedBy({ checkFont: true }).has('font'),
    // Netrivijalnost: zastita mora RADITI kad overlay stvarno nosi vrijednost, inace tvrdnja iznad
    // prolazi zato sto funkcija nikad nista ne stiti.
    cleanBefore: () => demotionProtectedBy({ font: ['Arial'] }).has('font'),
  },
  {
    id: 'poluge/ugasena-zastavica-ne-stiti',
    imitates:
      'overlay koji dimenziju GASI (`requireToc: false`) prije je stitio od demotije, pa je os ' +
      'ispadala iz advisoryDimensions i sucelje je nije oznacilo kao informativnu',
    caught: () => !demotionProtectedBy({ requireToc: false }).has('toc'),
    cleanBefore: () => demotionProtectedBy({ requireToc: true }).has('toc'),
  },
  {
    id: 'poluge/podprovjera-stiti-roditelja-stranice',
    imitates:
      'katedra propisuje polozaj broja stranice a ne i `requirePageNumbers`; otkad podprovjere vise ' +
      'o roditelju, nezasticena os bi joj tiho ugasila bas taj zahtjev (3 boda) uz nula poruka',
    caught: () => demotionProtectedBy({ pageNumberAlignment: 'right' }).has('page-numbers'),
    cleanBefore: () => !demotionProtectedBy({}).has('page-numbers'),
  },
  {
    id: 'demotija/gasi-podprovjere-brojeva-stranica',
    imitates:
      'demotirana os brojeva stranica ostavlja aktivno poravnanje ili podprovjeru naslovnice/Uvoda, pa se pravilo i dalje primjenjuje nizvodno',
    caught: () => {
      const profile: Record<string, unknown> = {
        requirePageNumbers: true,
        pageNumberAlignment: 'right',
        checkTitlePageNumberSuppression: true,
        checkPageNumberStartAtIntro: true,
      };
      applyDemotion(profile, ['page-numbers']);
      return profile.requirePageNumbers === false &&
        profile.pageNumberAlignment === null &&
        profile.checkTitlePageNumberSuppression === false &&
        profile.checkPageNumberStartAtIntro === false;
    },
    cleanBefore: () => {
      const profile: Record<string, unknown> = {
        requirePageNumbers: true,
        pageNumberAlignment: 'right',
        checkTitlePageNumberSuppression: true,
        checkPageNumberStartAtIntro: true,
      };
      applyDemotion(profile, []);
      return profile.requirePageNumbers === true &&
        profile.pageNumberAlignment === 'right' &&
        profile.checkTitlePageNumberSuppression === true &&
        profile.checkPageNumberStartAtIntro === true;
    },
  },
  {
    id: 'poluge/podprovjera-stiti-roditelja-sadrzaj',
    imitates:
      'isti kvar na osi sadrzaja: `tocDetailedCheck` bez `requireToc` izgubio bi devet bodova ' +
      'podprovjera sadrzaja koje katedra izricito trazi',
    caught: () => demotionProtectedBy({ tocDetailedCheck: true }).has('toc'),
    cleanBefore: () => !demotionProtectedBy({}).has('toc'),
  },
  {
    id: 'vezanje/prazna-vrijednost-nije-bodovanje',
    axis: 'font',
    imitates:
      'profil s `font: []`: normalizeCheckFlags takvu provjeru GASI, a vezanje ju je citalo kao ' +
      'bodovanu, pa je prijavljivalo `unbacked` nad dimenzijom koju motor uopce ne gleda i time ' +
      'demotiralo os koja i tako nije bodovala',
    caught: () =>
      findScoredValueFindings({ id: 'mut-prazno', rules: { font: [] }, ruleEntries: [] } as unknown as ThesisProfile, SOURCES, {
        demotedCheckIds: new Set(),
      }).filter((f) => f.checkId === 'font').length === 0,
    cleanBefore: () =>
      findScoredValueFindings(
        { id: 'mut-puno', rules: { font: ['Times New Roman'] }, ruleEntries: [] } as unknown as ThesisProfile,
        SOURCES,
        { demotedCheckIds: new Set() },
      ).some((f) => f.checkId === 'font' && f.kind === 'unbacked'),
  },
  {
    id: 'kompajler/raspon-se-prosiruje-u-popis',
    axis: 'font-size',
    imitates:
      'tvrdnja `{min:10,max:12}` upisana u `eff.size` doslovno: motor cita `profile.size.some(...)` ' +
      'pa bi na objektu pukao cim `ruleEntries` postanu zivi, a usporedba je isti propis zapisan ' +
      'kao raspon prijavljivala kao raskorak i demotirala velicinu pisma (fbf-specijalisticki)',
    caught: () => {
      const eff = compileEffectiveRules({
        id: '_',
        rules: {},
        ruleEntries: [goodEntry({ checkId: 'font-size', value: { min: 10, max: 12 } as never })],
      } as unknown as ThesisProfile) as Record<string, unknown>;
      return Array.isArray(eff.size) && sameRuleValue(eff.size, [10, 11, 12]);
    },
    // Netrivijalnost u OBA smjera: obican popis prolazi netaknut, a raspon koji se ne smije
    // prosiriti (decimalna granica, prevelik raspon) ostaje kakav jest umjesto da se izmisli popis.
    cleanBefore: () => {
      const of = (value: unknown) =>
        (compileEffectiveRules({
          id: '_',
          rules: {},
          ruleEntries: [goodEntry({ checkId: 'font-size', value: value as never })],
        } as unknown as ThesisProfile) as Record<string, unknown>).size;
      return (
        sameRuleValue(of([11, 12]), [11, 12]) &&
        !Array.isArray(of({ min: 10.5, max: 12 })) &&
        !Array.isArray(of({ min: 1, max: 400 }))
      );
    },
  },
  // --- zid izmedju traka korpusa: `converted` nikad ne broji kao dokaz profila ----------------
  {
    id: 'korpus/converted-traka-ulazi-u-mjerenje',
    imitates:
      'docx nastao pretvorbom PDF-a udje u `discoverRealCorpus` i pocne brojati kao dokaz profila: ' +
      'matrica tada mjeri konverter (bez stilova, bez TOC polja, prored izveden iz razmaka linija), ' +
      'a ne studentov dokument, i to korelirano kroz cijeli skup pa izgleda puno i ne znaci nista',
    caught: () => !sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: 'converted' }),
    // Netrivijalnost: isti sidecar bez trake i s dopustenom trakom MORA proci, inace bi zid
    // "hvatao" tako sto odbija sve, a mjerenje bi ostalo prazno umjesto pokvareno.
    cleanBefore: () =>
      sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni' }) &&
      sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: 'real' }) &&
      sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: 'generated' }) &&
      !sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', synthetic: true }),
  },
  {
    id: 'korpus/authored-traka-ulazi-u-mjerenje',
    imitates:
      'dokument s NASOM prozom (traka `authored`) udje u `discoverRealCorpus` i pocne potkrepljivati ' +
      'tvrdnju "dokazano na stvarnom studentskom radu". Tekst je nas, ne studentov, pa tvrdnja postaje ' +
      'neistinita bez ijedne promjene ljestvice; uz to su sinteticke fixture izmjereno LAKSE (84,6 posto ' +
      'ciljanih provjera rijeseno naspram 39,8 posto na stvarnim radovima), pa bi ulazak proizvod ' +
      'prikazao dvostruko boljim nego jest. Drugi oblik istog kvara je kriva zastavica: sidecar koji ' +
      'kaze `synthetic: false` mora pasti na traci, inace jedan pojas nosi cijeli zid',
    caught: () =>
      !sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: 'authored' }) &&
      !sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: 'authored', synthetic: false }) &&
      !sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: 'authored', synthetic: true }),
    // Netrivijalnost: dopustene trake i dalje prolaze, inace bi zid "hvatao" tako sto odbija sve.
    cleanBefore: () =>
      sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: 'real' }) &&
      sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: 'generated' }),
  },
  {
    id: 'izvoz/kvar-bez-dokumenta-koji-ga-je-proizveo',
    imitates:
      'zapis o kvaru druge strane ostane u izvozu nakon sto ga mjerenje vise ne potkrepljuje, ili udje ' +
      'u njega bez ijednog dokumenta. Zeljezno pravilo ciljanog skilla glasi "nijedan kvar bez ' +
      'dokumenta koji ga je proizveo", a katalog koji nosi popravljene ili nikad izmjerene kvarove ' +
      'skuplji je od praznog: druga strana trosi vrijeme na kvar kojega nema, i pocinje sumnjati u ' +
      'ostale zapise. Zato se potkrepa RACUNA pri svakom izvozu, ne pamti uz zapis',
    caught: () => {
      const prazan: DefectClass = {
        id: 'bez-potkrepe',
        owner: 'katedra-lite',
        title: 'naslov',
        body: 'tijelo',
        output: 'izlaz',
        // Tvrdnja bez dokumenta: naredba postoji, ali nema nijednog dokumenta na kojem je izvedena.
        support: [{ kind: 'izravno', command: 'python3 nesto.py', documents: [] }],
      };
      const popravljen: DefectClass = {
        ...prazan,
        id: 'vise-nije-mjerljiv',
        support: [{ kind: 'usporedba', os: 'jedinica-necitirana', documentPrefix: 'fzsri' }],
      };
      // Mjerenje postoji, ali vise nema razilazenja: kvar je popravljen na drugoj strani.
      const bezRazilazenja: ComparisonRow[] = [
        { dokument: 'fzsri--a.docx', os: 'jedinica-necitirana', lekta: 0, katedra: 0, ishod: 'nitko' },
      ];
      const r = renderDefectFragment([prazan, popravljen], bezRazilazenja, 140);
      return (
        !isSupported(prazan, bezRazilazenja) &&
        !isSupported(popravljen, bezRazilazenja) &&
        r.numbers.length === 0 &&
        r.unsupported.length === 2
      );
    },
    // Netrivijalnost: zapis koji mjerenje POTKREPLJUJE mora izaci, inace bi gard praznio katalog.
    cleanBefore: () => {
      const potkrijepljen: DefectClass = {
        id: 'ima-potkrepu',
        owner: 'katedra-lite',
        title: 'naslov',
        body: 'tijelo',
        output: 'izlaz',
        support: [{ kind: 'usporedba', os: 'jedinica-necitirana', documentPrefix: 'fzsri' }],
      };
      const izravni: DefectClass = {
        ...potkrijepljen,
        id: 'izmjeren-izravno',
        support: [{ kind: 'izravno', command: 'python3 nesto.py', documents: ['a.docx'] }],
      };
      const sRazilazenjem: ComparisonRow[] = [
        { dokument: 'fzsri--a.docx', os: 'jedinica-necitirana', lekta: 0, katedra: 20, ishod: 'samo-katedra' },
      ];
      const r = renderDefectFragment([potkrijepljen, izravni], sRazilazenjem, 140);
      return (
        isSupported(potkrijepljen, sRazilazenjem) &&
        isSupported(izravni, sRazilazenjem) &&
        r.numbers.length === 2 &&
        r.numbers[0] === 141 &&
        r.unsupported.length === 0
      );
    },
  },
  {
    id: 'eval/slucaj-nadzivi-kvar-koji-cuva',
    imitates:
      'eval slucaj ostane u skupu nakon sto je kvar koji cuva popravljen ili izbrisan iz kataloga. Takav ' +
      'slucaj i dalje PROLAZI, pa izgleda kao pokrice a ne cuva vise nista, i sljedeca regresija prodje ' +
      'ispod njega neopazeno. Isti razred kao gard s prepisanom vrijednoscu koji ostaje zelen dokazujuci ' +
      'nesto o mrtvom nizu; razlika je samo u tome sto ovaj zivi u TUDJEM repozitoriju, pa ga nas gate ' +
      'nikad vise ne bi vidio',
    caught: () => {
      const kvar: DefectClass = {
        id: 'k',
        owner: 'katedra-lite',
        title: 't',
        body: 'b',
        output: 'o',
        support: [{ kind: 'usporedba', os: 'jedinica-necitirana', documentPrefix: 'fzsri' }],
      };
      const slucaj: EvalClass = {
        defectId: 'k',
        prompt: 'p',
        expected_output: 'e',
        expectations: ['x'],
        fixtures: ['a.docx'],
      };
      // Kvar popravljen na drugoj strani: mjerenje vise ne pokazuje razilazenje.
      const mirno: ComparisonRow[] = [
        { dokument: 'fzsri--a.docx', os: 'jedinica-necitirana', lekta: 0, katedra: 0, ishod: 'nitko' },
      ];
      const popravljen = renderEvalCases([slucaj], [kvar], mirno, 10);
      // Kvar izbrisan iz kataloga: slucaj vise nema sto cuvati.
      const bezKvara = renderEvalCases([slucaj], [], mirno, 10);
      return (
        popravljen.cases.length === 0 &&
        popravljen.skipped.length === 1 &&
        bezKvara.cases.length === 0 &&
        bezKvara.skipped.length === 1 &&
        popravljen.skipped[0].why !== bezKvara.skipped[0].why
      );
    },
    // Netrivijalnost: dok kvar postoji I mjerenje ga podupire, slucaj MORA izaci, s dokumentom.
    cleanBefore: () => {
      const kvar: DefectClass = {
        id: 'k',
        owner: 'katedra-lite',
        title: 't',
        body: 'b',
        output: 'o',
        support: [{ kind: 'usporedba', os: 'jedinica-necitirana', documentPrefix: 'fzsri' }],
      };
      const slucaj: EvalClass = {
        defectId: 'k',
        prompt: 'p',
        expected_output: 'e',
        expectations: ['x'],
        fixtures: ['a.docx'],
      };
      const razilazenje: ComparisonRow[] = [
        { dokument: 'fzsri--a.docx', os: 'jedinica-necitirana', lekta: 0, katedra: 20, ishod: 'samo-katedra' },
      ];
      const r = renderEvalCases([slucaj], [kvar], razilazenje, 10);
      return (
        r.cases.length === 1 &&
        r.cases[0].id === 11 &&
        r.skipped.length === 0 &&
        r.fixtures.length === 1 &&
        (r.cases[0].files ?? []).length === 1
      );
    },
  },
  {
    id: 'usporedba/druga-strana-tiho-prestane-mjeriti',
    imitates:
      'usporedba dvaju alata prestane mjeriti a izgleda kao slaganje. Katedrini nalazi se izvlace iz ' +
      'polja njezina JSON izlaza (`pokrivenost.bez_izvora`, `pokrivenost.necitirani`); preimenovano ili ' +
      'premjesteno polje vraca 0, nikad gresku. Svi redci tada padnu na `nitko`, sto se cita kao "oba ' +
      'alata se slazu da je sve u redu", a znaci "jedna strana vise ne mjeri nista". Tocno taj razred ' +
      'je razlog zbog kojeg usporedba uopce postoji: vise prolaza istim alatom je slaganje, ne tocnost, ' +
      'pa usporedba koja tiho izgubi drugu stranu gubi jedino sto donosi',
    caught: () => {
      const r = (dokument: string, os: string, lekta: number, katedra: number | null): ComparisonRow => ({
        dokument,
        os,
        lekta,
        katedra,
        ishod: classifyOutcome(lekta, katedra),
      });
      // Katedrino izvlacenje promasi polje pa svugdje vrati 0; Lekta je na tim osima cista.
      const oslijepljena = [
        r('a.docx', 'citirano-bez-jedinice', 0, 0),
        r('a.docx', 'jedinica-necitirana', 0, 0),
        r('b.docx', 'citirano-bez-jedinice', 0, 0),
      ];
      // Razlikovanje od stvarnog izostanka odgovora: `null` daje vlastiti ishod, ne `nitko`.
      const bezOdgovora = [r('a.docx', 'fusnote', 0, null)];
      return (
        comparisonIsVacuous(oslijepljena) &&
        comparisonIsVacuous(bezOdgovora) &&
        oslijepljena.every((x) => x.ishod === 'nitko') &&
        bezOdgovora[0].ishod === 'katedra-nije-mjerila'
      );
    },
    // Netrivijalnost: usporedba u kojoj BILO KOJA strana nesto nadje nije vakuumska, inace bi gard
    // vristao na svaki prolaz i prestao razlikovati slijepo mjerenje od cistog dokumenta.
    cleanBefore: () => {
      const r = (lekta: number, katedra: number | null): ComparisonRow => ({
        dokument: 'a.docx',
        os: 'jedinica-necitirana',
        lekta,
        katedra,
        ishod: classifyOutcome(lekta, katedra),
      });
      const samoKatedra = [r(0, 18), r(0, 0)];
      const samoLekta = [r(1, 0), r(0, 0)];
      const oba = [r(1, 3)];
      return (
        !comparisonIsVacuous(samoKatedra) &&
        !comparisonIsVacuous(samoLekta) &&
        !comparisonIsVacuous(oba) &&
        divergentRows(samoKatedra).length === 1 &&
        divergentRows(samoLekta).length === 1 &&
        divergentRows(oba).length === 0
      );
    },
  },
  {
    id: 'mreza/fixer-se-ugasi-a-nitko-ne-primijeti',
    imitates:
      'fixer prestane raditi (zatrazen je, ali vise nista ne mijenja) i to nitko ne vidi, jer nijedan ' +
      'postojeci artefakt to ne mjeri: `closed-loop.json` sprema `requested` kao GOLI BROJ i odbacuje ' +
      '`skippedReasons`, `repair-real-corpus.json` ima `offeredFixerIds` bez ijednog citatelja, a ' +
      '`coverage-cells` klasificira staticki i nikad ne premjerava. Tocno taj razred je vec izmjeren: ' +
      '`empty-paragraph-fixer` je bio trajni no-op na svemu pisanom LibreOfficeom, i nasao ga je tek ' +
      'sinteticki korpus',
    caught: () => {
      const m = (dokument: string, zatrazeno: string[], promijenili: string[]): DocumentMeasurement => ({
        dokument,
        profileId: 'p',
        paloPrije: [],
        zatrazeno,
        promijenili,
        bezUcinka: zatrazeno.filter((f) => !promijenili.includes(f)).map((fixerId) => ({ fixerId, reason: 'no-target' })),
        rijeseno: [],
        nerijeseno: [],
        regresije: [],
        integrityFailure: null,
      });
      const ratchet = new Set(['poznato-mrtav']);
      const rows = aggregateByFixer([
        m('a.docx', ['poznato-mrtav', 'radi', 'ugasio-se'], ['radi']),
        m('b.docx', ['poznato-mrtav', 'radi', 'ugasio-se'], ['radi']),
      ]);
      const novi = deadFixers(rows).filter((f) => !ratchet.has(f));
      return novi.length === 1 && novi[0] === 'ugasio-se';
    },
    // Netrivijalnost: fixer koji radi BAREM na jednom dokumentu ne smije se prijaviti, inace bi mreza
    // "hvatala" tako sto vristi na svaki prolaz i prestala znaciti isto.
    cleanBefore: () => {
      const m = (dokument: string, promijenili: string[]): DocumentMeasurement => ({
        dokument,
        profileId: 'p',
        paloPrije: [],
        zatrazeno: ['radi-ponekad'],
        promijenili,
        bezUcinka: promijenili.length ? [] : [{ fixerId: 'radi-ponekad', reason: 'already-ok' }],
        rijeseno: [],
        nerijeseno: [],
        regresije: [],
        integrityFailure: null,
      });
      const rows = aggregateByFixer([m('a.docx', []), m('b.docx', ['radi-ponekad'])]);
      return deadFixers(rows).length === 0;
    },
  },
  {
    id: 'mreza/zahtjev-bez-ijedne-mete-prolazi-kao-mrtav-fixer',
    imitates:
      'graditelj stavki posalje zahtjev BEZ IJEDNE METE, motor ga odbije s `invalid-params`, a to se ' +
      'procita kao "fixer je mrtav" pa se kvar trazi u fixeru umjesto u pozivu. Izmjereno 2026-09-08: ' +
      '`heading-style-fixer` je isao kao `violated: true` s praznim popisom meta na cetiri dokumenta ' +
      '(kandidat postoji, nijedan nije predodabran), pa je zadani odabir slao prazan zahtjev. Ostali ' +
      'razlozi opisuju ULAZ (`no-target`, `already-ok`, `unsupported-structure`, `stale-anchor`); ' +
      '`invalid-params` jedini opisuje POZIV, i zato je uvijek nas kvar',
    caught: () => {
      const m = (dokument: string, reason: string): DocumentMeasurement => ({
        dokument,
        profileId: 'p',
        paloPrije: [],
        zatrazeno: ['gradi-prazan-zahtjev'],
        promijenili: [],
        bezUcinka: [{ fixerId: 'gradi-prazan-zahtjev', reason }],
        rijeseno: [],
        nerijeseno: [],
        regresije: [],
        integrityFailure: null,
      });
      const rows = aggregateByFixer([m('a.docx', 'invalid-params'), m('b.docx', 'invalid-params')]);
      const losZahtjev = rows.filter((f) => Number(f.reasons?.['invalid-params'] ?? 0) > 0);
      return losZahtjev.length === 1 && losZahtjev[0].fixerId === 'gradi-prazan-zahtjev';
    },
    // Netrivijalnost: razlozi koji opisuju DOKUMENT ne smiju okinuti ovaj gard, inace bi svaki
    // uredan `no-target` prolaz izgledao kao kvar poziva i tvrdnja bi prestala znaciti isto.
    cleanBefore: () => {
      const m = (dokument: string, reason: string): DocumentMeasurement => ({
        dokument,
        profileId: 'p',
        paloPrije: [],
        zatrazeno: ['uredan-preskok'],
        promijenili: [],
        bezUcinka: [{ fixerId: 'uredan-preskok', reason }],
        rijeseno: [],
        nerijeseno: [],
        regresije: [],
        integrityFailure: null,
      });
      const rows = aggregateByFixer([
        m('a.docx', 'no-target'),
        m('b.docx', 'already-ok'),
        m('c.docx', 'unsupported-structure'),
        m('d.docx', 'stale-anchor'),
      ]);
      return rows.every((f) => Number(f.reasons?.['invalid-params'] ?? 0) === 0);
    },
  },
  {
    id: 'oblik/generator-tvrdi-oblik-koji-ne-proizvodi',
    imitates:
      'sidecar generiranog dokumenta tvrdi oblik (`shapes.claimed`) kojeg u paketu nema, ili mutaciju ' +
      'cijim je brojacem nula. Bez ove provjere je sinteticki korpus vakuumski: mjeri se ono sto smo ' +
      'namjeravali proizvesti, ne ono sto je alat doista spremio. Izmjereno pri izradi detektora: ' +
      'graditelj je tvrdio `naslov/tab-u-naslovu` a odlomak nije imao ni stil ni razmak iza broja, pa ' +
      'oblika nije bilo; obrnuto, rucna stavka sadrzaja je lazno nosila isti oblik na pet mjesta',
    caught: () => {
      const nula = Object.fromEntries(DOCX_SHAPE_IDS.map((id) => [id, 0])) as DocxShapeCounts;
      const tvrdiNepostojeci = verifyShapeClaims(['naslov/tab-u-naslovu'], nula).missing.length > 0;
      const tipfeler = verifyShapeClaims(['naslov/tab-u-naslov'], nula).unknown.length > 0;
      const mrtavBrojac = verifyShapeClaims([], nula, { tabInHeading: 0 }, {
        tabInHeading: 'naslov/tab-u-naslovu',
      }).underDetected.length > 0;
      return tvrdiNepostojeci && tipfeler && mrtavBrojac;
    },
    // Netrivijalnost: ispunjena tvrdnja uz brojac koji paket potvrdjuje NE smije proizvesti nalaz,
    // inace bi gard "hvatao" tako sto prijavljuje svaki generirani dokument.
    cleanBefore: () => {
      const counts = Object.fromEntries(DOCX_SHAPE_IDS.map((id) => [id, 0])) as DocxShapeCounts;
      counts['naslov/tab-u-naslovu'] = 4;
      const v = verifyShapeClaims(['naslov/tab-u-naslovu'], counts, { tabInHeading: 4 }, {
        tabInHeading: 'naslov/tab-u-naslovu',
      });
      return v.missing.length === 0 && v.unknown.length === 0 && v.underDetected.length === 0;
    },
  },
  {
    id: 'korpus/prazan-izvjestaj-tvrdi-da-mjeri',
    imitates:
      'commitani korpusni izvjestaj tvrdi `measuresRepairEffectiveness: true` uz NULA ciljanih ' +
      'provjera. Izmjereno 2026-09-03: nakon oznacavanja devet sidecara kao `synthetic` u ' +
      'commitanom skupu je ostalo 7 fixtura i 0 ciljanih provjera, pa su `failCount 0` i ' +
      '`passRegressionCount 0` u `tests/real-corpus.test.ts` postali VAKUUMSKI istiniti. ' +
      'Isti kod nad stvarnim radovima daje 94 ciljane provjere, 4 pada i 4 regresije, i upravo ' +
      'zato je regresija popravka danima stajala neprimijecena: commitani gard je po konstrukciji ' +
      'ne moze vidjeti, a njegovo zeleno se cita kao potvrda zdravlja',
    caught: () => {
      const lazan = { targetedCheckCount: 0, measuresRepairEffectiveness: true };
      return lazan.measuresRepairEffectiveness !== lazan.targetedCheckCount > 0;
    },
    // Baseline: posten prazan izvjestaj (nula provjera, oznaka `false`) NE smije se prijaviti,
    // inace bi gard vristao na zateceno i tocno stanje.
    cleanBefore: () => {
      const posten = { targetedCheckCount: 0, measuresRepairEffectiveness: false };
      return posten.measuresRepairEffectiveness === posten.targetedCheckCount > 0;
    },
  },
  {
    id: 'korpus/nepoznata-traka-tumaci-se-kao-real',
    imitates:
      'tipfeler ili nova traka u sidecaru (`converted-v2`, `koncertirano`) protumaci se kao `real` ' +
      'jer filtar nabraja SAMO zabranjene vrijednosti; deny-by-default trazi bijeli popis, isto ' +
      'nacelo kojim classification-guard obara build na neklasificiranom modulu',
    caught: () =>
      !sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: 'converted-v2' }) &&
      !sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: '' }) &&
      !sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: null }),
    // Baseline: `undefined` NIJE nepoznata vrijednost nego izostanak polja, i mora proci, jer su
    // svi postojeci sidecari nastali prije uvodjenja trake.
    cleanBefore: () => sidecarAdmitted({ profileId: 'fpzg-politologija-zavrsni', track: undefined }),
  },
  // --- svjedoci (T68): traka `witness` ide u zaseban skup, nikad u `results` -------------------
  {
    id: 'korpus/witness-traka-ulazi-u-results',
    imitates:
      'svjedok s NAMJERNIM prekrsajima (traka `witness`) udje u `results`: napravljen je da padne i da ' +
      'ga popravak rijesi, pa bi napuhao stopu rjesavanja (sinteticki 84,6 posto naspram stvarnih 39,8 ' +
      'posto) i usao u matricu kao dokaz profila koji nije studentski rad',
    caught: () =>
      witnessIsolationProblems((m: CorpusSidecar) => (m.track === 'witness' ? 'results' : corpusSetOf(m))).length > 0,
    // Baseline: pravi razvrstavac nema nijedan problem, ukljucujuci kontrolne trake.
    cleanBefore: () => witnessIsolationProblems(corpusSetOf).length === 0,
  },
  {
    id: 'korpus/witness-traka-pada-u-synthetic',
    imitates:
      'zateceno ponasanje prije T68: `discoverExcludedCorpus` uzima sve sto `sidecarAdmitted` odbije, pa ' +
      'svjedok zavrsi u `syntheticResults` i izgubi izravni signal (koji je namjerni prekrsaj ciljan, ' +
      'razrijesen ili ostavljen korisniku)',
    caught: () =>
      witnessIsolationProblems((m: CorpusSidecar) =>
        typeof m.profileId === 'string' && m.profileId.length > 0 ? (sidecarAdmitted(m) ? 'results' : 'synthetic') : null,
      ).length > 0,
    cleanBefore: () => witnessIsolationProblems(corpusSetOf).length === 0,
  },
  {
    id: 'korpus/witness-traka-bez-zastavice-synthetic',
    imitates:
      'prva verzija T68 razvrstavaca: `track: witness` sam je bio dovoljan, pa bi stvaran rad s greskom ' +
      'pridruzenim witness sidecarom (bez `synthetic: true` ili sa `synthetic: false`) usao u mjerenje svjedoka',
    caught: () =>
      witnessIsolationProblems((m: CorpusSidecar) =>
        m.track === 'witness' && typeof m.profileId === 'string' && m.profileId.length > 0 ? 'witness' : corpusSetOf(m),
      ).length > 0,
    cleanBefore: () => witnessIsolationProblems(corpusSetOf).length === 0,
  },
  {
    // Namjerno BEZ `axis`: ta tvrdnja vjezba `readAxis` nad BODOVANIM osima, a citatni stil se ne
    // boduje. Upravo zato ga nijedan postojeci gard nije vidio.
    id: 'citation/zivi-stil-bez-ijedne-tvrdnje',
    imitates:
      'profil nosi `recommendedCitation` a nema nijednu tvrdnju o stilu: citatni motor koji stvarno ' +
      'analizira studentov rad odabran je bez izvora, stranice i citata. Rani `return []` u ' +
      '`citationFindings` je tu granu sutke gutao, pa je klasa koju je FER pilot otkrio na jednom ' +
      'profilu (IEEE bez izvora, ispravljeno 2026-08-22) ostala nevidljiva na jos 95 profila',
    caught: () =>
      buildScoredValueDrift(
        [
          {
            id: 'mutacija-citation-unbacked',
            rules: { recommendedCitation: 'ieee' },
            ruleEntries: [],
          } as unknown as ThesisProfile,
        ],
        SOURCES,
      ).citationStyle.some((c) => c.kind === 'unbacked' && c.liveValue === 'ieee'),
    // Baseline: profil BEZ zivog stila ne smije prijaviti nista. Bez ovoga bi gard "hvatao" tako
    // sto vristi na svaki profil koji citatni stil uopce nema.
    cleanBefore: () =>
      buildScoredValueDrift(
        [{ id: 'mutacija-citation-cist', rules: {}, ruleEntries: [] } as unknown as ThesisProfile],
        SOURCES,
      ).citationStyle.length === 0,
  },
  /**
   * Gard nad ozicenjem dokaza po osi. Do 2026-08-31 nije imao mutaciju, a uz to se nije izvodio ni
   * u jednom gateu: stajao je kao kod na vrhu `scripts/run-closed-loop.mts`, a CI posao koji se
   * ZOVE `closed-loop` pokrece `npm run test:slow`, koji tu skriptu nikad ne dotakne.
   */
  {
    id: 'dokaz-po-osi/os-bez-signala-tiho-pada-na-changelog',
    imitates:
      'strukturna os udje u skup a zaboravi se signal, pa zauvijek nosi dokaz koji znaci samo ' +
      '"fixer se javio". Tocno se to dogodilo s `element-caption` i `field-integrity`, koje su bez ' +
      'ijednog spomena padale na slabije changelog pravilo',
    caught: () => {
      try {
        assertAxisEvidenceWiring(['os-koje-nema']);
        return false;
      } catch (e) {
        return (e as Error).message.includes('AXIS_SIGNAL');
      }
    },
    cleanBefore: () => {
      // Baseline: stvarno ozicenje mora proci, inace gard "hvata" tako sto vristi na sve.
      try {
        assertAxisEvidenceWiring();
        return true;
      } catch {
        return false;
      }
    },
  },
  {
    id: 'dokaz-po-osi/os-bez-fixera-nikad-ne-zaradi-applied',
    imitates:
      'os ima signal ali nema unos u APPLIED_AXIS_FIXER, pa je `changedFixerIds.has(undefined)` ' +
      'uvijek `false` i os nikad ne moze zaraditi dokaz `applied`. Prva izvedba garda provjeravala ' +
      'je samo prvu mapu i time promasila bas os zbog koje je nastala',
    caught: () => {
      try {
        // Signal postoji (stvarna mapa), fixer ne: gard mora gledati OBJE mape.
        assertAxisEvidenceWiring(['empty-paragraphs'], AXIS_SIGNAL, {});
        return false;
      } catch (e) {
        return (e as Error).message.includes('APPLIED_AXIS_FIXER');
      }
    },
    cleanBefore: () => {
      // Baseline: ista os uz OBJE stvarne mape mora proci, pa tvrdnja gore govori o fixeru.
      try {
        assertAxisEvidenceWiring(['empty-paragraphs'], AXIS_SIGNAL, APPLIED_AXIS_FIXER);
        return true;
      } catch {
        return false;
      }
    },
  },
  {
    id: 'lupa/navod-s-krive-osi',
    imitates:
      'dokazna lupa koja uz nalaz stavi citat pravila koje tu os ne uredjuje. Most medju imenskim ' +
      'prostorima je rucno kuriran popis, pa je najlaksi nacin da pokvari povjerenje upravo ' +
      'prevelika darezljivost: navod iz sluzbene upute uz nalaz koji taj navod ne opravdava',
    // `bibliography-rules` uredjuje abecedni poredak popisa literature; nalaz govori o shemi
    // numeriranja stranica. Dokaz se NE smije zalijepiti.
    caught: () => evidenceFor('bibliography-rules', 'page.numbers.scheme', 'Shema numeriranja stranica', 'formatting') === 0,
    // Baseline: pravilo koje TU os stvarno uredjuje mora dati dokaz, inace tvrdnja gore prolazi
    // samo zato sto lupa ne radi nista.
    cleanBefore: () => evidenceFor('section-surgery-rules', 'page.numbers.scheme', 'Shema numeriranja stranica', 'formatting') === 1,
  },
  /**
   * T16 korak B2. Bez ove mutacije `transition` bi mogao biti `switch` koji za nepoznat par vrati
   * ZATECENO stanje, suite bi ostao zelen, a stroj ne bi tvrdio nista: nedopusten prijelaz ne bi
   * bio greska nego samo jos jedan upis. Tocno tako `app.ts` radi danas, sa 97 rucnih dodira
   * `hidden` i bez ijedne tablice prijelaza.
   */
  {
    id: 'stroj/nedozvoljen-prijelaz-tiho-prolazi',
    imitates:
      'stroj stanja napisan kao `switch` koji nepoznat par stanje/dogadaj propusta umjesto da ga ' +
      'odbije, pa preskakanje koraka (dokument -> analiza) izgleda kao dopusten prijelaz',
    caught: () => {
      const popustljiv = (st: WizardState, dg: WizardEvent): WizardState => transition(st, dg) ?? st;
      let dopusteni = 0;
      for (const st of SVA_STANJA) for (const dg of SVI_DOGADAJI) if (popustljiv(st, dg) !== null) dopusteni += 1;
      return dopusteni === SVA_STANJA.length * SVI_DOGADAJI.length;
    },
    cleanBefore: () => {
      let dopusteni = 0;
      for (const st of SVA_STANJA) for (const dg of SVI_DOGADAJI) if (transition(st, dg) !== null) dopusteni += 1;
      return dopusteni === 12 && transition('dokument', 'pokreni-analizu') === null;
    },
  },
  {
    id: 'kontekst/root-prelazi-200-redaka',
    imitates:
      'root CLAUDE.md ponovno naraste povijesnim incidentima iznad granice pa se cijeli kontekst ' +
      'ucitava u svaku sesiju umjesto samo u zadatke na koje se odnosi',
    caught: () => {
      const oversized = Array.from({ length: 201 }, (_, index) => `redak ${index + 1}`).join('\n');
      return auditClaudeContext(oversized, new Set(REQUIRED_CONTEXT_FILES)).problems.some(
        (problem) => problem.code === 'root-too-long',
      );
    },
    cleanBefore: () => {
      const compact = [
        '# Lekta',
        ...REQUIRED_SCOPED_GUIDES.map((path) => `- \`${path}\`: upute.`),
      ].join('\n');
      return auditClaudeContext(compact, new Set(REQUIRED_CONTEXT_FILES)).problems.length === 0;
    },
  },
  /**
   * Provjera koja se tiho preskoci jednaka je provjeri koje nema. `post-deploy-smoke` je ulaz cuvao
   * slijepljenom stazom, pa na Windowsu nije izveo nista i vratio 0, dok je na CI-ju bio crven 40
   * puta zaredom. Gard mora prijaviti oblik, a ne osloniti se na to da netko primijeti tisinu.
   */
  {
    id: 'cli/straza-ulaza-slijepljenom-stazom',
    imitates:
      'ESM straza `import.meta.url === `file://` + process.argv[1]`, koja se na Windowsu nikad ne ' +
      'poklopi, pa se skripta ucita, ne izvede nista i izade s kodom 0 (lazno zeleno)',
    caught: () => hasNaiveEntryGuard('if (import.meta.url === `file://${process.argv[1]}`) main();'),
    // Baseline: stvaran izvor u repozitoriju mora biti cist, inace tvrdnja gore ne govori o mutaciji.
    cleanBefore: () =>
      !hasNaiveEntryGuard(readFileSync(resolve(process.cwd(), 'scripts/post-deploy-smoke.mjs'), 'utf8')),
  },
  /**
   * Vanjski audit 2026-09-08, nalaz 5. `repair-docx` je citao multipart s `req.formData()` iza
   * provjere `clen && clen > MAX`: bez `Content-Length` je `clen` 0, uvjet otpadne, i cijelo tijelo
   * se parsira u memoriju prije ijedne granice. Straza je staticka (cita izvor) jer grize i na
   * NOVOJ funkciji koju nijedan dinamicki test jos ne poznaje.
   */
  {
    id: 'edge/multipart-bez-granice',
    imitates:
      'Edge funkcija koja multipart cita s `req.formData()` pa velicinu provjerava POSLIJE, kad je ' +
      'tijelo vec u memoriji; bez Content-Length zaglavlja rana provjera `clen && clen > MAX` otpadne',
    caught: () => hasUnboundedFormData('const clen = Number(h ?? "0"); if (clen && clen > MAX) return r413(); const form = await req.formData();'),
    cleanBefore: () =>
      !hasUnboundedFormData(readFileSync(resolve(process.cwd(), 'supabase/functions/repair-docx/index.ts'), 'utf8')),
  },
  /**
   * Lansiranje 2026-09 ide BEZ lokalnog popravka (nema code-signing certifikata za runner), pa je
   * jedino sto stoji izmedju korisnika i ponude zastavica `REPAIR_LOCAL_ENABLED`. Do 2026-09-22 je
   * bila inline izraz u module-scope konstanti Edge funkcije: nedostupna svakom testu, jer se ta
   * datoteka u Vitestu ne izvrsava. Izdvojena je u `localRepairFlagEnabled`, a ove dvije mutacije
   * cuvaju bas ono sto tada moze tiho puknuti: da se odluka vrati u inline izraz (pa opet ostane
   * bez tablice istine) i da se `issuedLocalRepair` postavi mimo grane sa zastavicom.
   */
  {
    id: 'edge/lokalni-popravak-zastavica-inline',
    imitates:
      'zastavica lokalnog popravka vracena u inline izraz nad Deno.env, pa se semantika (ukljucujuci ' +
      "'TRUE' koje NE ukljucuje nista) vise ne moze dokazati nijednim testom bez deploya",
    caught: () => localRepairFlagProblems([
      "const LOCAL_REPAIR_ENABLED = Deno.env.get('REPAIR_LOCAL_ENABLED') === 'true'",
      "  && Deno.env.get('REPAIR_LOCAL_DISABLED') !== 'true';",
      'let issuedLocalRepair = null;',
      'if (LOCAL_REPAIR_ENABLED) { issuedLocalRepair = await issue(); }',
      'return json({ localLaunch: issuedLocalRepair?.launch ?? null });',
    ].join('\n')).includes('LOCAL_REPAIR_ENABLED se ne racuna pozivom localRepairFlagEnabled(...)'),
    cleanBefore: () =>
      localRepairFlagProblems(readFileSync(resolve(process.cwd(), 'supabase/functions/repair-docx/index.ts'), 'utf8')).length === 0,
  },
  {
    id: 'edge/lokalni-popravak-mimo-zastavice',
    imitates:
      'drugo mjesto u repair-docx koje postavlja `issuedLocalRepair` izvan grane sa zastavicom, pa ' +
      'odgovor ponese localLaunch i kad je lokalni popravak ugasen',
    caught: () => localRepairFlagProblems([
      "import { localRepairFlagEnabled } from '../../../src/repair/local-runner/feature-flag.ts';",
      'const LOCAL_REPAIR_ENABLED = localRepairFlagEnabled({',
      "  REPAIR_LOCAL_ENABLED: Deno.env.get('REPAIR_LOCAL_ENABLED'),",
      "  REPAIR_LOCAL_DISABLED: Deno.env.get('REPAIR_LOCAL_DISABLED'),",
      '});',
      'let issuedLocalRepair = null;',
      'if (LOCAL_REPAIR_ENABLED) { /* prazno */ }',
      'issuedLocalRepair = await provisionLocalRepairJob(args);',
      'return json({ localLaunch: issuedLocalRepair?.launch ?? null });',
    ].join('\n')).includes('issuedLocalRepair se postavlja izvan grane koja provjerava LOCAL_REPAIR_ENABLED'),
    cleanBefore: () =>
      localRepairFlagProblems(readFileSync(resolve(process.cwd(), 'supabase/functions/repair-docx/index.ts'), 'utf8')).length === 0,
  },
  /**
   * Klijentska strana istog toka: ponuda runnera se u app.ts dohvaca dinamickim importom UNUTAR
   * grane `if(out.localRepair)`. Kad bi se import podigao izvan grane, modul bi se dohvacao i u
   * buildu bez `VITE_LEKTA_LOCAL_REPAIR_RUNNER_*`, gdje ponuda ionako ne moze nastati.
   */
  {
    id: 'ui/ponuda-lokalnog-runnera-izvan-grane',
    imitates:
      'dinamicki import modula local-repair-runner-download podignut izvan grane if(out.localRepair), ' +
      'pa se ponuda lokalnog popravka dohvaca i kad server nije izdao launch',
    caught: () => localRepairOfferProblems([
      "const mod = await import('../report/local-repair-runner-download');",
      'if(out.localRepair){',
      ' mod.renderLocalRepairRunnerOffer(summary,out.localRepair,mod.localRepairRunnerConfig());',
      '}',
    ].join('\n')).length > 0,
    cleanBefore: () =>
      localRepairOfferProblems(readFileSync(resolve(process.cwd(), 'src/ui/app.ts'), 'utf8')).length === 0,
  },
  /**
   * Pregled 2026-09-23 je nasao dvije rupe u prvoj verziji garda i obje su ovdje zatvorene vlastitom
   * mutacijom. Prva: gard je gledao ARGUMENT `localLaunch`, a ne POLJE odgovora, pa se launch mogao
   * pustiti klijentu iz drugog izvora uz zelen gate.
   */
  {
    id: 'edge/lokalni-popravak-launch-u-odgovoru',
    imitates:
      'polje localRepair u odgovoru repair-docx popunjeno mimo handoffa, pa klijent dobije valjan ' +
      'launch i kad je zastavica REPAIR_LOCAL_ENABLED ugasena',
    caught: () => localRepairFlagProblems([
      "import { localRepairFlagEnabled } from '../../../src/repair/local-runner/feature-flag.ts';",
      'const LOCAL_REPAIR_ENABLED = localRepairFlagEnabled({',
      "  REPAIR_LOCAL_ENABLED: Deno.env.get('REPAIR_LOCAL_ENABLED'),",
      "  REPAIR_LOCAL_DISABLED: Deno.env.get('REPAIR_LOCAL_DISABLED'),",
      '});',
      'let issuedLocalRepair = null;',
      'if (LOCAL_REPAIR_ENABLED) { issuedLocalRepair = await provisionLocalRepairJob(args); }',
      'const handoff = await settleRepairStorageHandoff({ localLaunch: issuedLocalRepair?.launch ?? null });',
      'return json({ localRepair: rogueLaunch });',
    ].join('\n')).includes('polje localRepair u odgovoru dolazi iz izvora koji nije handoff.localRepair'),
    cleanBefore: () =>
      localRepairFlagProblems(readFileSync(resolve(process.cwd(), 'supabase/functions/repair-docx/index.ts'), 'utf8')).length === 0,
  },
  /**
   * Adversarijalni pregled drugog alata (2026-09-23) pokazao je da gard koji samo trazi tekst
   * `if (LOCAL_REPAIR_ENABLED` ne vidi ostatak uvjeta, pa `|| true` bezuvjetno izdaje posao.
   */
  {
    id: 'edge/lokalni-popravak-uvjet-grane',
    imitates:
      'zastavica prestane biti nuzan uvjet grane (`if (LOCAL_REPAIR_ENABLED || true)`), pa se lokalni ' +
      'popravak izdaje i kad je ugasena',
    caught: () => localRepairFlagProblems([
      "import { localRepairFlagEnabled } from '../../../src/repair/local-runner/feature-flag.ts';",
      'const LOCAL_REPAIR_ENABLED = localRepairFlagEnabled({',
      "  REPAIR_LOCAL_ENABLED: Deno.env.get('REPAIR_LOCAL_ENABLED'),",
      "  REPAIR_LOCAL_DISABLED: Deno.env.get('REPAIR_LOCAL_DISABLED'),",
      '});',
      'let issuedLocalRepair = null;',
      'if (LOCAL_REPAIR_ENABLED || true) { issuedLocalRepair = await provisionLocalRepairJob(args); }',
      'const handoff = await settleRepairStorageHandoff({ localLaunch: issuedLocalRepair?.launch ?? null });',
      'return json({ localRepair: handoff.localRepair });',
    ].join('\n')).includes('uvjet grane nije oblika `LOCAL_REPAIR_ENABLED && ...`, pa zastavica vise nije nuzan uvjet'),
    cleanBefore: () =>
      localRepairFlagProblems(readFileSync(resolve(process.cwd(), 'supabase/functions/repair-docx/index.ts'), 'utf8')).length === 0,
  },
  /**
   * Druga rupa: ponuda preseljena u omotac pod drugim imenom, koji se ucitava BEZUVJETNO, a grana
   * samo odlucuje hoce li se pozvati. Gard sada prijavljuje svaki dinamicki import cija staza
   * spominje i "local" i "repair", osim izricito popisanih modula koji nisu ponuda.
   */
  {
    id: 'ui/ponuda-lokalnog-runnera-u-omotacu',
    imitates:
      'ponuda lokalnog popravka preseljena u omotac pod neutralnim imenom koji se ucitava bezuvjetno, ' +
      'pa se modul dohvaca na svakom serverskom popravku iako launcha nema',
    caught: () => localRepairOfferProblems([
      "const offer = await import('../report/local-repair-offer');",
      'if(out.localRepair){',
      ' offer.show(summary,out.localRepair);',
      '}',
    ].join('\n')).includes('modul ponude lokalnog popravka se dohvaca izvan grane if(out.localRepair)'),
    cleanBefore: () =>
      localRepairOfferProblems(readFileSync(resolve(process.cwd(), 'src/ui/app.ts'), 'utf8')).length === 0,
  },
  /**
   * DRUGI ADVERSARIJALNI PREGLED (2026-09-23, krug 3) srusio je cetiri tvrdnje prethodne verzije
   * garda. Svaka od sljedecih mutacija je bas taj slucaj, reproduciran nad KOPIJOM stvarnog izvora
   * u memoriji (datoteka na disku se ne dira), i svaka tvrdi TOCNU poruku, ne `length > 0`: inace
   * bi ju zadovoljio i gard kojem je provjera te osi potpuno uklonjena.
   */
  {
    id: 'edge/lokalni-popravak-zasjenjena-zastavica',
    imitates:
      'privremeno "forsiraj za lokalno testiranje" koje ostane u kodu: `const LOCAL_REPAIR_ENABLED = true;` '
      + 'unutar Deno.serve handlera zasjeni modul-konstantu, prolazi check:edge i izdaje posao uz ugasenu zastavicu',
    caught: () => localRepairFlagProblems(
      readFileSync(resolve(process.cwd(), 'supabase/functions/repair-docx/index.ts'), 'utf8').replace(
        'if (LOCAL_REPAIR_ENABLED && !FREE_MODE && jobId && slotId) {',
        'const LOCAL_REPAIR_ENABLED = true;\n    if (LOCAL_REPAIR_ENABLED && !FREE_MODE && jobId && slotId) {',
      ),
    ).includes('LOCAL_REPAIR_ENABLED se deklarira vise od jednom; lokalno zasjenjenje ponistava modul-konstantu'),
    cleanBefore: () =>
      localRepairFlagProblems(readFileSync(resolve(process.cwd(), 'supabase/functions/repair-docx/index.ts'), 'utf8')).length === 0,
  },
  {
    id: 'edge/lokalni-popravak-destrukturirano-izdavanje',
    imitates:
      'izdavanje posla izvan grane preko destrukturiranog pridruzivanja `({ issued: issuedLocalRepair } = ...)`, '
      + 'oblik koji obrazac za pridruzivanje ne prepoznaje jer iza imena dolazi viticasta zagrada',
    caught: () => localRepairFlagProblems(
      readFileSync(resolve(process.cwd(), 'supabase/functions/repair-docx/index.ts'), 'utf8').replace(
        'const tStore = performance.now();',
        '({ issued: issuedLocalRepair } = rogueResult);\n    const tStore = performance.now();',
      ),
    ).includes('issuedLocalRepair se spominje izvan grane i izvan dopustenih oblika citanja'),
    cleanBefore: () =>
      localRepairFlagProblems(readFileSync(resolve(process.cwd(), 'supabase/functions/repair-docx/index.ts'), 'utf8')).length === 0,
  },
  {
    id: 'edge/lokalni-popravak-deklaracija-s-launchem',
    imitates:
      'launch upisan vec u DEKLARACIJU `let issuedLocalRepair: IssuedLocalRepairJob | null = rogueLaunch;`, '
      + 'koju je prethodna verzija garda izuzimala u cijelosti pa nikakva pocetna vrijednost nije smetala',
    caught: () => localRepairFlagProblems(
      readFileSync(resolve(process.cwd(), 'supabase/functions/repair-docx/index.ts'), 'utf8').replace(
        'let issuedLocalRepair: IssuedLocalRepairJob | null = null;',
        'let issuedLocalRepair: IssuedLocalRepairJob | null = rogueLaunch;',
      ),
    ).includes('issuedLocalRepair se ne deklarira tocno jednom kao `let issuedLocalRepair: ... = null;`'),
    cleanBefore: () =>
      localRepairFlagProblems(readFileSync(resolve(process.cwd(), 'supabase/functions/repair-docx/index.ts'), 'utf8')).length === 0,
  },
  {
    id: 'edge/lokalni-popravak-uvjet-prelomljen',
    imitates:
      'alternativa u uvjetu grane prelomljenom u dva retka (`if (LOCAL_REPAIR_ENABLED\n      || true)`), koju '
      + 'obrazac nad jednim retkom uopce ne vidi pa se provjera oblika uvjeta tiho preskoci',
    caught: () => localRepairFlagProblems(
      readFileSync(resolve(process.cwd(), 'supabase/functions/repair-docx/index.ts'), 'utf8').replace(
        'if (LOCAL_REPAIR_ENABLED && !FREE_MODE && jobId && slotId) {',
        'if (LOCAL_REPAIR_ENABLED\n      || true) {',
      ),
    ).includes('uvjet grane nije oblika `LOCAL_REPAIR_ENABLED && ...`, pa zastavica vise nije nuzan uvjet'),
    cleanBefore: () =>
      localRepairFlagProblems(readFileSync(resolve(process.cwd(), 'supabase/functions/repair-docx/index.ts'), 'utf8')).length === 0,
  },
  /**
   * Isti pregled, peti nalaz: tvrdnja "integracija je iskljucena" bila je dokazana samo za
   * repair-docx i klijenta, a javni `repair-local-claim` i `repair-local-status` (verifyJwt: false)
   * gasio je samo kill switch REPAIR_LOCAL_DISABLED, koji se na lansiranju ne postavlja.
   */
  {
    id: 'edge/javni-runner-endpoint-fail-open',
    imitates:
      'javni neautenticirani runner endpoint koji se gasi samo kill switchem REPAIR_LOCAL_DISABLED, pa je '
      + 'bez ijedne postavljene varijable ZIV iako je lokalni popravak iskljucen (fail-open)',
    caught: () => localRepairPublicEndpointProblems(
      readFileSync(resolve(process.cwd(), 'supabase/functions/repair-local-claim/index.ts'), 'utf8')
        .replace(
          /const LOCAL_REPAIR_ENABLED = localRepairFlagEnabled\(\{[\s\S]*?\}\);/,
          "const LOCAL_REPAIR_DISABLED = Deno.env.get('REPAIR_LOCAL_DISABLED') === 'true';",
        )
        .replace('if (!LOCAL_REPAIR_ENABLED) {', 'if (LOCAL_REPAIR_DISABLED) {'),
    ).includes('LOCAL_REPAIR_ENABLED se ne racuna pozivom localRepairFlagEnabled(...)'),
    cleanBefore: () =>
      ['repair-local-claim', 'repair-local-status'].every((name) =>
        localRepairPublicEndpointProblems(
          readFileSync(resolve(process.cwd(), `supabase/functions/${name}/index.ts`), 'utf8'),
        ).length === 0),
  },
  /**
   * TRECI ADVERSARIJALNI PREGLED (2026-09-23, krug 4) srusio je jos dvije tvrdnje. Prva: gard je
   * deklaraciju zastavice mjerio po POCETKU izraza i po SPOMENU imena varijabli okoline unutar
   * poziva, pa su cetiri oblika s drugacijim ishodom prolazila s praznim popisom. Sve cetiri
   * mutacije nize su reproducirane nad KOPIJOM stvarnog izvora i svaka tvrdi TOCNU poruku.
   */
  ...([
    [
      'edge/lokalni-popravak-zadano-ukljuceno',
      'zastavica postane zadano UKLJUCENA bez ijedne postavljene tajne (`Deno.env.get(...) ?? \'true\'`), '
      + 'dakle tocno suprotno od stanja na lansiranju, a ime varijable okoline je i dalje u pozivu',
      "  REPAIR_LOCAL_ENABLED: Deno.env.get('REPAIR_LOCAL_ENABLED') ?? 'true',\n"
      + "  REPAIR_LOCAL_DISABLED: Deno.env.get('REPAIR_LOCAL_DISABLED'),\n",
      'deklaracija LOCAL_REPAIR_ENABLED nije doslovno kanonskog oblika; dopustene su samo razlike u bjelini i zavrsnom zarezu',
    ],
    [
      'edge/lokalni-popravak-vrijednost-bez-okoline',
      'procitana vrijednost prodje kroz ternar koji vraca isto u obje grane, pa zastavica vise ne ovisi '
      + 'o okolini iako se varijabla doslovno cita',
      "  REPAIR_LOCAL_ENABLED: Deno.env.get('REPAIR_LOCAL_ENABLED'),\n"
      + "  REPAIR_LOCAL_DISABLED: Deno.env.get('REPAIR_LOCAL_DISABLED') === 'true' ? 'off' : 'off',\n",
      'deklaracija LOCAL_REPAIR_ENABLED nije doslovno kanonskog oblika; dopustene su samo razlike u bjelini i zavrsnom zarezu',
    ],
    [
      'edge/lokalni-popravak-preoblikovana-vrijednost',
      "`Deno.env.get('REPAIR_LOCAL_ENABLED')?.toLowerCase()`: tablica istine je dokazana nad SIROVIM "
      + "ulazom (`'TRUE'` NE ukljucuje nista), pa preoblikovanje mijenja ishod mimo dokaza",
      "  REPAIR_LOCAL_ENABLED: Deno.env.get('REPAIR_LOCAL_ENABLED')?.toLowerCase(),\n"
      + "  REPAIR_LOCAL_DISABLED: Deno.env.get('REPAIR_LOCAL_DISABLED'),\n",
      'deklaracija LOCAL_REPAIR_ENABLED nije doslovno kanonskog oblika; dopustene su samo razlike u bjelini i zavrsnom zarezu',
    ],
  ] as const).map(([id, imitates, fields, message]): Mutation => ({
    id,
    imitates,
    caught: () => localRepairFlagProblems(
      readTextLf(resolve(process.cwd(), 'supabase/functions/repair-docx/index.ts')).replace(
        /const LOCAL_REPAIR_ENABLED = localRepairFlagEnabled\(\{[\s\S]*?\}\);/,
        `const LOCAL_REPAIR_ENABLED = localRepairFlagEnabled({\n${fields}});`,
      ),
    ).includes(message),
    cleanBefore: () =>
      localRepairFlagProblems(readTextLf(resolve(process.cwd(), 'supabase/functions/repair-docx/index.ts'))).length === 0,
  })),
  {
    id: 'edge/lokalni-popravak-alternativa-iza-poziva',
    imitates:
      'alternativa dopisana IZA poziva (`localRepairFlagEnabled({...}) || Deno.env.get(...) !== \'1\'`), pa '
      + 'zastavica prestane ovisiti samo o cistoj funkciji nad kojom je tablica istine dokazana',
    caught: () => localRepairFlagProblems(
      readTextLf(resolve(process.cwd(), 'supabase/functions/repair-docx/index.ts')).replace(
        /const LOCAL_REPAIR_ENABLED = localRepairFlagEnabled\(\{[\s\S]*?\}\);/,
        'const LOCAL_REPAIR_ENABLED = localRepairFlagEnabled({\n'
        + "  REPAIR_LOCAL_ENABLED: Deno.env.get('REPAIR_LOCAL_ENABLED'),\n"
        + "  REPAIR_LOCAL_DISABLED: Deno.env.get('REPAIR_LOCAL_DISABLED'),\n"
        + "}) || Deno.env.get('REPAIR_LOCAL_FORCE') !== '1';",
      ),
    ).includes('izraz deklaracije LOCAL_REPAIR_ENABLED se nastavlja iza poziva localRepairFlagEnabled(...)'),
    cleanBefore: () =>
      localRepairFlagProblems(readTextLf(resolve(process.cwd(), 'supabase/functions/repair-docx/index.ts'))).length === 0,
  },
  /**
   * Drugi dio istog pregleda: straza javnog endpointa se mjerila po glavi i po polozaju, ali ne i po
   * tome PREKIDA li blok obradu. Sva tri oblika nize su tada vracala prazan popis; prvi i treci puste
   * izvrsavanje dalje u `createClient` i RPC, drugi javno vrati 200.
   */
  ...([
    [
      'edge/javni-endpoint-straza-bez-returna',
      'uklonjen `return` ispred `new Response(...)` u strazi javnog endpointa: odgovor se izgradi i baci, '
      + 'a funkcija nastavi u createClient i RPC iako je lokalni popravak iskljucen',
      (guard: string): string => guard.replace('return new Response(', 'new Response('),
      'blok straze javnog endpointa ne pocinje s `return new Response(`, pa ne prekida obradu',
    ],
    [
      'edge/javni-endpoint-straza-status-200',
      'straza javnog endpointa vrati 200 umjesto 503, pa iskljucena znacajka javno izgleda kao da radi',
      (guard: string): string => guard.replace('status: 503', 'status: 200'),
      'odgovor straze javnog endpointa nema status: 503',
    ],
    [
      'edge/javni-endpoint-prazna-straza',
      'tijelo straze javnog endpointa ostane prazno (`if (!LOCAL_REPAIR_ENABLED) { }`), pa glava i polozaj '
      + 'i dalje izgledaju ispravno a nista se ne gasi',
      (): string => '  if (!LOCAL_REPAIR_ENABLED) {\n  }\n',
      'blok straze javnog endpointa ne pocinje s `return new Response(`, pa ne prekida obradu',
    ],
  ] as const).map(([id, imitates, mutate, message]): Mutation => ({
    id,
    imitates,
    caught: () => {
      const source = readTextLf(resolve(process.cwd(), 'supabase/functions/repair-local-claim/index.ts'));
      const from = source.indexOf('  if (!LOCAL_REPAIR_ENABLED) {');
      const to = source.indexOf('\n  }\n', from) + '\n  }\n'.length;
      if (from < 0 || to <= from) return false;
      const mutated = source.slice(0, from) + mutate(source.slice(from, to)) + source.slice(to);
      return mutated !== source && localRepairPublicEndpointProblems(mutated).includes(message);
    },
    cleanBefore: () =>
      ['repair-local-claim', 'repair-local-status'].every((name) =>
        localRepairPublicEndpointProblems(
          readTextLf(resolve(process.cwd(), `supabase/functions/${name}/index.ts`)),
        ).length === 0),
  })),
  /**
   * CETVRTI ADVERSARIJALNI PREGLED (2026-09-23, krug 5): gard je dokazivao SADRZAJ bloka straze, ali
   * ne i njezinu DOSEZLJIVOST. Oba oblika nize su reproducirana nad stvarnim izvorom i oba su tada
   * vracala prazan popis, iako javni neautenticirani endpoint ostaje ziv.
   */
  ...([
    [
      'edge/javni-endpoint-straza-ugnijezdena',
      'straza javnog endpointa uvucena u drugi uvjet (`if (request.method === \'POST\')`), pa svaki GET ili '
      + 'PUT prodje pokraj nje u createClient i RPC iako je lokalni popravak iskljucen',
      (guard: string): string => `  if (request.method === 'POST') {\n${guard}  }\n`,
      'straza zastavice je ugnijezdena u drugi blok umjesto na prvoj razini Deno.serve(...) handlera, pa se ne izvrsava na svakom zahtjevu',
    ],
    [
      'edge/javni-endpoint-straza-mrtav-kod',
      'straza javnog endpointa preseljena u pomocnu strelicu koja se nikad ne zove, pa je cijela zastita '
      + 'mrtav kod a glava, polozaj i tijelo straze izgledaju ispravno',
      (guard: string): string => `  const disabledResponse = (): Response | null => {\n${guard}    return null;\n  };\n`,
      'straza zastavice je ugnijezdena u drugi blok umjesto na prvoj razini Deno.serve(...) handlera, pa se ne izvrsava na svakom zahtjevu',
    ],
  ] as const).map(([id, imitates, mutate, message]): Mutation => ({
    id,
    imitates,
    caught: () => {
      const source = readTextLf(resolve(process.cwd(), 'supabase/functions/repair-local-claim/index.ts'));
      const from = source.indexOf('  if (!LOCAL_REPAIR_ENABLED) {');
      const to = source.indexOf('\n  }\n', from) + '\n  }\n'.length;
      if (from < 0 || to <= from) return false;
      const guard = source.slice(from, to);
      if (!guard.includes('return new Response(') || !guard.includes('status: 503')) return false;
      const mutated = source.slice(0, from) + mutate(guard) + source.slice(to);
      return mutated !== source && localRepairPublicEndpointProblems(mutated).includes(message);
    },
    cleanBefore: () =>
      ['repair-local-claim', 'repair-local-status'].every((name) =>
        localRepairPublicEndpointProblems(
          readTextLf(resolve(process.cwd(), `supabase/functions/${name}/index.ts`)),
        ).length === 0),
  })),
  /**
   * Isti nalaz, drugi dio: `meta` JSON se prije nije mjerio nikad. Granica se mjeri u bajtovima,
   * inace bi dijakritici propustili osjetno vece tijelo od deklariranog.
   */
  {
    id: 'edge/meta-dio-bez-granice',
    imitates:
      'tekstualni `meta` dio multiparta koji ulazi u JSON.parse bez ikakve granice velicine, pa ' +
      'napadac bira koliko memorije potrosi neovisno o granici datoteke',
    caught: () => !metaWithinBudget('x'.repeat(256 * 1024 + 1), 256 * 1024),
    cleanBefore: () => metaWithinBudget(JSON.stringify({ workType: 'graduate', requests: [], references: [] }), 256 * 1024),
  },
  /**
   * Vanjski audit 2026-09-08, nalaz 6. Broj high/critical u punom grafu `npm audit` samo se ispisivao
   * u koraku s `continue-on-error`, pa je s 21 (komentar, 2026-08-24) narastao na 23 a da CI to nije
   * mogao pokazati. Ratchet cita STVARNU commitanu datoteku stropa: podmetnut porast za jedan mora
   * biti `above`, jednak broj `equal`.
   */
  {
    id: 'supply-chain/porast-nalaza-nevidljiv',
    imitates:
      'zeleni security workflow koji broj high/critical nalaza u punom grafu samo ispise (continue-on-error), ' +
      'pa porast s 21 na 23 prodje neopazeno jer nista ne tvrdi strop',
    caught: () => {
      const packages = auditRatchet.fullGraphHighCriticalPackages;
      const mutated = [...packages.slice(0, -1), '__novi-ranjivi-paket__'];
      return compareAuditToRatchet(syntheticAudit(auditRatchet, mutated), auditRatchet).verdict === 'above';
    },
    cleanBefore: () =>
      compareAuditToRatchet(syntheticAudit(auditRatchet, auditRatchet.fullGraphHighCriticalPackages), auditRatchet).verdict === 'equal',
  },
  // T93 (Codex R1 na #246): iznimka pokriva par (paket, GHSA), ne samo ime paketa. Mutacije mijenjaju
  // IZVOR jezgre (scripts/npm-audit-ratchet-core.mjs, bez importa) i izvrsavaju ga u memoriji.
  ...([
    ['t93/usporedba-bez-advisoryja', 'compareAuditToRatchet gleda samo ime i broj, pa novi GHSA na prihvacenom paketu prolazi',
      'uncoveredPairs.length > 0 || unresolvedPackages.length > 0', 'false',
      (core: RatchetCore) => core.compareAuditToRatchet(
        core.syntheticAudit(T93_MUTATION_RATCHET, ['braces'], { braces: ['GHSA-zzzz-zzzz-zzzz'] }), T93_MUTATION_RATCHET).verdict === 'above'],
    ['t93/pokrice-po-imenu', 'iznimka pokriva paket za bilo koji advisory (pokrice po imenu, kao prije T93)',
      'const uncoveredPairs = pairs.filter((pair) => !covered.has(pair));',
      "const uncoveredPairs = pairs.filter((pair) => ![...covered].some((c) => c.split(' ')[0] === pair.split(' ')[0]));",
      (core: RatchetCore) => core.compareAuditToRatchet(
        core.syntheticAudit(T93_MUTATION_RATCHET, ['braces'], { braces: ['GHSA-zzzz-zzzz-zzzz'] }), T93_MUTATION_RATCHET).verdict === 'above'],
    ['t93/validator-bez-advisoryja', 'iznimka bez advisories prolazi validaciju, pa pokriva sve buduce advisoryje paketa',
      "problems.push(`${label}.advisories je prazan (iznimka pokriva advisory, ne samo ime paketa)`);", '',
      (core: RatchetCore) => core.validateRatchet({ fullGraphHighCritical: 1, fullGraphHighCriticalPackages: ['a'],
        exceptions: [{ owner: 'o', mitigation: 'm', nextReviewOn: '2999-01-01', expiresOn: '2999-01-02', packages: ['a'] }] }).length > 0],
    // Codex R2 na #282: bez propagacije kroz via tranzitivni paket ne nasljeduje advisory iz ciklusa.
    ['t93/bez-propagacije-kroz-via', 'advisoryji i nerazrijesenost se ne prenose kroz via, pa par b/A iz ciklusa a<->b nestaje i ratchet kaze equal',
      'for (const dep of through.get(name)) {', 'for (const dep of []) {',
      (core: RatchetCore) => core.compareAuditToRatchet({ vulnerabilities: {
        a: { severity: 'high', via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-aaaa-aaaa-aaaa' }, 'b'] },
        b: { severity: 'high', via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-bbbb-bbbb-bbbb' }, 'a'] },
      } }, { fullGraphHighCritical: 2, fullGraphHighCriticalPackages: ['a', 'b'], exceptions: [
        { packages: ['a'], advisories: ['GHSA-aaaa-aaaa-aaaa', 'GHSA-bbbb-bbbb-bbbb'] },
        { packages: ['b'], advisories: ['GHSA-bbbb-bbbb-bbbb'] },
      ] }).verdict === 'above'],
    // Codex R1 na #282: prepoznat GHSA ne smije zatvoriti neprepoznat high advisory na istom paketu.
    ['t93/nerazrijesen-uz-prepoznat', 'paket s jednim prepoznatim GHSA-om tiho odbacuje drugi high advisory bez prepoznatog id-a',
      'if (list.length === 0 || problem.get(name)) unresolved.push(name);', 'if (list.length === 0) unresolved.push(name);',
      (core: RatchetCore) => core.compareAuditToRatchet({ vulnerabilities: {
        a: { severity: 'high', via: [{ severity: 'high', url: 'https://github.com/advisories/GHSA-aaaa-aaaa-aaaa' },
          { severity: 'high', url: 'https://example.invalid/new' }] },
      } }, { fullGraphHighCritical: 1, fullGraphHighCriticalPackages: ['a'], exceptions: [
        { packages: ['a'], advisories: ['GHSA-aaaa-aaaa-aaaa'] },
      ] }).verdict === 'above'],
  ] as const).map(([id, imitates, from, to, holds]) => ({
    id,
    imitates: `T93: ${imitates}.`,
    caught: () => {
      const src = readTextLf(resolve(process.cwd(), 'scripts', 'npm-audit-ratchet-core.mjs'));
      const mut = src.replace(from, to);
      return mut !== src && !holds(loadRatchetCore(mut));
    },
    cleanBefore: () => holds(loadRatchetCore(readTextLf(resolve(process.cwd(), 'scripts', 'npm-audit-ratchet-core.mjs')))),
  })),
  /**
   * Vanjski audit 2026-09-08, nalaz 1. Gate dokaza izdanja je zastarjelost mjerio `git diff`-om medju
   * commitovima i u catch grani vracao "nije zastario": u plitkom klonu (Netlify, CI) stari commit ne
   * postoji, pa je gate ispisao "OK" nad dokazom od kojeg se promijenilo 425 datoteka. Presuda sada
   * ima tri ishoda, a nepoznato stablo NIKAD nije svjeze.
   */
  {
    id: 'dokaz/zastarjelost-nepoznata-prolazi-kao-svjeza',
    imitates:
      'gate koji "ne moze procitati povijest" (plitak klon, bad object) tretira kao "nije zastarjelo", ' +
      'pa dokaz pecen 425 datoteka ranije prolazi kao potvrda za kod koji nitko nije provjerio',
    caught: () => {
      const digest = treeDigestFromLsTree('100644 blob 1111111111111111111111111111111111111111\tsrc/a.ts');
      return proofStaleness({ commit: 'abc', treeDigest: digest }, null).verdict !== 'fresh';
    },
    cleanBefore: () => {
      const digest = treeDigestFromLsTree('100644 blob 1111111111111111111111111111111111111111\tsrc/a.ts');
      return proofStaleness({ commit: 'abc', treeDigest: digest }, digest).verdict === 'fresh';
    },
  },
  /**
   * Vanjski audit 2026-09-08, nalaz 4. Razina A je za 19 od 31 profila bila IZVEDENA (par jedinica x
   * vrsta rada), ne izmjerena, a nista to nije razlikovalo. Ledger sada nosi `proofSource`; gard je
   * cista funkcija nad redcima, a baseline cita COMMITANI ledger.
   */
  {
    id: 'ledger/naslijedjeni-dokaz-bez-izvora',
    imitates:
      'redak s dokazom na stvarnom radu bez zapisanog izvora, pa sucelje ne moze razlikovati profil na ' +
      'kojem je mjereno od profila koji dokaz nasljedjuje po paru jedinica x vrsta rada',
    caught: () =>
      proofSourceProblems([{ profileId: 'x', proof: 'real-docx-pass', proofSource: null }]).length === 1,
    cleanBefore: () =>
      proofSourceProblems(
        (JSON.parse(readFileSync(resolve(process.cwd(), 'docs/generated/completion-ledger.json'), 'utf8')) as {
          rows: Parameters<typeof proofSourceProblems>[0];
        }).rows,
      ).length === 0,
  },
  /**
   * Korak C6 (2026-09-12): odabir popravaka se pamti po IDENTITETU `fixerId|ruleId`, nikad po
   * polozaju. Do C6 je DOM odraz kljucevao `data-idx`, pa bi snimka po polozaju nad preslaganom
   * ponudom kvacila krive kucice bez ijedne poruke. Mutacija: snimka koja nosi INDEKSE umjesto
   * kljuceva; gard je mora prijaviti kao nepoznate kljuceve (applied 0), ne tiho preslikati.
   */
  {
    id: 'odabir/mrtav-kljuc-po-polozaju',
    imitates:
      'snimka odabira zapisana po polozaju (data-idx) umjesto po fixerId|ruleId, pa se nad ponudom u ' +
      'drugom poretku tiho vrati kriva kucica',
    caught: () => {
      const items = C6_ITEMS();
      const poIndeksu = { ...buildRepairSelectionSnapshot({ items, keys: [], deep: false, now: 1 })!, selected: ['0', '2'] };
      const r = applyRepairSelectionSnapshot([items[2], items[0], items[1]], poIndeksu);
      return r.applied === 0 && r.skippedUnknown === 2 && r.ruleIds.length === 0;
    },
    cleanBefore: () => {
      const items = C6_ITEMS();
      const s = buildRepairSelectionSnapshot({ items, keys: ['font-fixer|a', 'toc-field-fixer|c'], deep: false, now: 1 })!;
      const r = applyRepairSelectionSnapshot([items[2], items[0], items[1]], s);
      // Redoslijed prati SNIMKU (a, c), ne preslaganu ponudu (c, a, b): to i jest smisao kljuca.
      return r.applied === 2 && r.skippedUnknown === 0 && r.ruleIds.join(',') === 'a,c';
    },
  },
  /**
   * Otisak ponude mora biti osjetljiv na CLANSTVO, ne samo na broj stavaka: dva skupa iste duljine
   * s razlicitim kljucevima moraju dati razlicit otisak, inace bi se odabir vratio na popis koji s
   * njim nema veze. Baseline: isti skup u drugom poretku daje isti otisak.
   */
  {
    id: 'odabir/otisak-ne-grize',
    imitates:
      'otisak ponude sveden na broj stavaka (items.length), pa dva razlicita skupa jednake duljine ' +
      'prolaze kao ista ponuda i odabir se vraca na krive stavke',
    caught: () => {
      const a = C6_ITEMS();
      const b = [a[0], a[1], { fixerId: 'toc-field-fixer', ruleId: 'd', params: {} }];
      return a.length === b.length && repairItemsDigest(a) !== repairItemsDigest(b);
    },
    cleanBefore: () => {
      const a = C6_ITEMS();
      return repairItemsDigest(a) === repairItemsDigest([a[2], a[0], a[1]]);
    },
  },
  /**
   * Stari panel poslije `dispose()` ne smije javljati promjene: inace kroz zivu pretplatu
   * prepisuje odabir novog panela u sesiji. Mutacija: panel koji se NE disposea i dalje javlja
   * (to je potpis kvara koji gard tests/repair-panel-dispose.test.ts lovi); baseline: disposean
   * panel javlja nula puta, a prije dispose tocno jednom (sentinel protiv nepretplacenog panela).
   */
  {
    id: 'panel/bez-dispose',
    imitates:
      'renderRepairSection koji panel mice s mount.innerHTML=\'\' bez dispose(), pa stari panel kroz ' +
      'zivu pretplatu i dalje pise odabir u sesiju preko novog panela',
    caught: () => {
      const { handle, applyThroughOldBinding } = c6Panel();
      let poziva = 0;
      handle.onSelectionChange(() => { poziva += 1; });
      applyThroughOldBinding(['b']); // bez dispose
      return poziva === 1;
    },
    cleanBefore: () => {
      const { handle, applyThroughOldBinding } = c6Panel();
      let poziva = 0;
      handle.onSelectionChange(() => { poziva += 1; });
      applyThroughOldBinding(['b']);
      const prije = poziva;
      handle.dispose();
      applyThroughOldBinding(['a']);
      return prije === 1 && poziva === 1;
    },
  },
  /**
   * RE-60 (2026-09-12). `link-doi-fixer` je umetao `<w:hyperlink r:id="...">` u tijelo dokumenta
   * ciji korijen `xmlns:r` nema, jer je deklaraciju trazio BILO GDJE u nizu, a dokument ju je imao
   * lokalno na `w:footerReference`. Izlaz vise nije namespace-well-formed (@xmldom/xmldom, lxml i
   * Word ga odbijaju), a `integrityFailure` je ostajao `null` jer skener paketa doseg deklaracija
   * nije pratio. Mutacija podmece tocno taj oblik; baseline je ISTI dokument s deklaracijom na
   * korijenu, pa tvrdnja nije o tome da skener vristi na sve.
   */
  {
    id: 'paket/nevezan-prefiks-u-document-xml',
    imitates:
      'popravljeni word/document.xml koristi prefiks r: izvan dosega njegove xmlns deklaracije, pa ga '
      + 'Word odbija otvoriti dok vrata integriteta javljaju da je paket ispravan',
    caught: () => re60Gate(RE60_BAD_OUTPUT) !== null,
    cleanBefore: () => re60Gate(RE60_GOOD_OUTPUT) === null,
  },
  /**
   * SUZENJE GARDA NE SMIJE GA OSLIJEPITI (nalaz pregleda, 2026-09-12).
   *
   * Nevezan prefiks se prijavljuje samo kad ga je uveo popravak. Da je to izuzece pisano PO DIJELU
   * ("ulazni dio je i sam padao"), jedan prefiks koji je dosao s dokumentom gasio bi provjeru za
   * cijeli taj dio, pa bi i NAS nov prefiks prosao. Mutacija podmece tocno taj par: ulaz s VML
   * crtezom (`v:`/`o:` nedeklarirani) i izlaz koji uz to nosi nasu hipervezu s `r:id`.
   */
  {
    id: 'paket/nov-prefiks-iza-vec-nevezanog-prefiksa',
    imitates:
      'popravak uvodi nevezan prefiks r: u dio koji je vec imao tudji nevezan prefiks v:, pa izuzece '
      + 'za tudji ulaz propusta i nas vlastiti kvar',
    caught: () => RE60_MIXED_GATE(RE60_MIXED_BAD)?.problem.includes('prefiks r:') === true,
    cleanBefore: () => RE60_MIXED_GATE(RE60_MIXED_INPUT.replace('<w:body>', '<w:body w:rsidR="00AA">')) === null,
  },
  /**
   * STRUKTURA IMA PRVENSTVO NAD NAMESPACEOM (nalaz pregleda, 2026-09-12).
   *
   * Ista rupa u drugom smjeru: kad ulazni dio pada na nevezanom prefiksu, izuzece ne smije progutati
   * STRUKTURNI (RE-47) kvar koji je popravak uveo. Baseline je isti sinteticki ulaz uz bezopasnu
   * izmjenu teksta.
   */
  {
    id: 'paket/re47-iza-nevezanog-prefiksa-na-ulazu',
    imitates:
      'popravak proizvede atribut iza kose crte u dijelu ciji je ulaz vec imao nevezan prefiks, pa '
      + 'vrata integriteta isporuce dokument koji nijedan parser ne otvara',
    caught: () => RE60_SYNTHETIC_GATE(RE60_SYNTHETIC_INPUT.replace('<w:r>', '<w:fldChar w:fldCharType="begin"/ w:dirty="true"><w:r>'))?.problem.includes('iza kose crte') === true,
    cleanBefore: () => RE60_SYNTHETIC_GATE(RE60_SYNTHETIC_INPUT.replace('doi:10.1/a', 'https://doi.org/10.1/a')) === null,
  },
  // --- T65: equalColumns i spojene celije --------------------------------------------------------
  {
    id: 'tablica/equal-columns-gridspan',
    imitates:
      'equalColumns upise sirinu jednog stupca u tcW celije s w:gridSpan, pa se celija preko dva '
      + 'stupca skupi na jedan i grid vise ne odgovara celijama',
    caught: () => t65Preserved(t65Table('<w:gridSpan w:val="2"/>', '')),
    cleanBefore: () => t65Equalized(t65Table('', '')),
  },
  {
    id: 'tablica/equal-columns-vmerge',
    imitates:
      'equalColumns prepise grid i tcW tablice s okomito spojenim celijama (w:vMerge) iako sirine '
      + 'spojenog stupca nisu provjerene',
    caught: () => t65Preserved(t65Table('<w:vMerge w:val="restart"/>', '<w:vMerge/>')),
    cleanBefore: () => t65Equalized(t65Table('', '')),
  },
  // Pregled drugog alata (Codex), re-verificirano crvenim testovima u src/analysis/merged-cells.test.ts.
  {
    id: 'tablica/equal-columns-val-drugog-prefiksa',
    imitates:
      'detekcija uzme PRVI val atribut bilo kojeg prefiksa, pa <w:gridSpan x:val="1" w:val="2"/> proglasi '
      + 'obicnom celijom i equalColumns prepise tcW celije preko dva stupca',
    caught: () => t65Preserved(t65Table('<w:gridSpan x:val="1" w:val="2"/>', '')),
    cleanBefore: () => t65Equalized(t65Table('<w:gridSpan w:val="1"/>', '')),
  },
  {
    id: 'tablica/equal-columns-val-u-vrijednosti',
    imitates:
      'detekcija procita val= iz VRIJEDNOSTI drugog atributa (x:note=\' val="1" \'), pa gridSpan bez '
      + 'pravog val proglasi obicnom celijom i equalColumns prepise njezin tcW',
    caught: () => t65Preserved(t65Table(`<w:gridSpan x:note=' val="1" '/>`, '')),
    cleanBefore: () => t65Equalized(t65Table(`<w:gridSpan x:note='val="3"' w:val="1"/>`, '')),
  },
  {
    id: 'tablica/equal-columns-cdata',
    imitates:
      'oznaka <w:gridSpan> doslovno u CDATA tekstu odlomka broji se kao spajanje, pa obicna tablica '
      + 'bez razloga ostane bez ujednacenih stupaca',
    caught: () => t65Equalized(t65Table('', '').replace('<w:t>A</w:t>', '<w:t><![CDATA[<w:gridSpan w:val="2"/>]]></w:t>')),
    cleanBefore: () => t65Preserved(t65Table('<w:gridSpan w:val="2"/>', '')),
  },
  {
    id: 'tablica/equal-columns-ne-ascii-prefiks',
    imitates:
      'analiza vidi <ž:gridSpan> kao spojenu celiju, a fixer prefiks prihvaca samo iz ASCII klase, '
      + 'pa istu tablicu tretira kao obicnu i prepise tcW spojene celije sirinom jednog stupca',
    caught: () => t65Preserved(t65NonAsciiPrefix(t65Table('<w:gridSpan w:val="2"/>', '')))
      && hasMergedCells(t65NonAsciiPrefix(t65Table('<w:gridSpan w:val="2"/>', ''))),
    // gridSpan w:val="1" nije spajanje: bez toga bi gard mogao "hvatati" tako da svaki gridSpan gasi equalColumns.
    cleanBefore: () => t65Equalized(t65Table('', '')) && t65Equalized(t65Table('<w:gridSpan w:val="1"/>', '')),
  },
  {
    id: 'tablica/equal-columns-tihi-preskok',
    imitates:
      'mijesani zahtjev (equalColumns + druge akcije) na tablici sa spojenim celijama vrati applied:true '
      + 'bez traga da equalColumns nije proveden, pa izvjestaj tvrdi da je sve primijenjeno',
    caught: () => {
      const out = t65MixedRequest(t65Table('<w:gridSpan w:val="2"/>', ''));
      return out.applied && out.afterLabel.includes(T65_SKIP_NOTE);
    },
    cleanBefore: () => {
      const out = t65MixedRequest(t65Table('', ''));
      return out.applied && !out.afterLabel.includes(T65_SKIP_NOTE);
    },
  },
  {
    id: 'tablica/equal-columns-preskok-bez-izmjene',
    imitates:
      'spojena tablica kojoj su ostale trazene akcije vec na cilju vrati vec u PRVOM prolazu '
      + 'applied:false/already-ok, a jedini trag preskoka (afterLabel) postoji samo uz applied:true, '
      + 'pa izvjestaj kaze "vec uskladjeno" iako stupci nisu ujednaceni',
    caught: () => {
      const out = t65AlreadyCentered(t65Table('<w:gridSpan w:val="2"/>', ''));
      return !out.applied && out.reason === 'already-ok' && (out.skippedActions ?? []).some((note) => note.includes(T65_SKIP_NOTE));
    },
    // Obicna tablica s istim zahtjevom: equalColumns se stvarno primijeni, bez ikakvog traga preskoka.
    cleanBefore: () => {
      const out = t65AlreadyCentered(t65Table('', ''));
      return out.applied && out.skippedActions === undefined;
    },
  },
  {
    id: 'izvjestaj/preskok-pod-vec-uskladjeno',
    imitates:
      'izvjestaj popravka stavku ciji je fixer vratio already-ok uz preskocen equalColumns svrsta pod '
      + '"vec uskladjeno" (pregled drugog alata, krug 3), pa korisnik cita da nista nije trebalo mijenjati',
    caught: () => {
      const out = t65AlreadyCentered(t65Table('<w:gridSpan w:val="2"/>', ''));
      const report = classifyRepairReport({ skipped: ['r'], skippedReasons: { r: out.reason as 'already-ok' }, skippedActions: { r: out.skippedActions ?? [] }, changelog: [] }, () => 'Tablice');
      return report.alreadyOk.length === 0 && report.skippedNotes.some((line) => line.includes(T65_SKIP_NOTE));
    },
    // Isti razlog bez preskoka ostaje "vec uskladjeno" (RE-36): gard ne smije sve micati iz te skupine.
    cleanBefore: () => {
      const report = classifyRepairReport({ skipped: ['r'], skippedReasons: { r: 'already-ok' }, changelog: [] }, () => 'Tablice');
      return report.alreadyOk.length === 1 && report.skippedNotes.length === 0;
    },
  },
  {
    id: 'tablica/oznaka-sirine-teksta',
    imitates:
      'predoznacena kucica fitToTextWidth glasi "Prilagodi širini teksta", a UI ne salje textWidthEmu, '
      + 'pa fixer pise samo tblLayout fixed i siroka tablica ostaje sira od teksta',
    caught: () => {
      const { params } = t65RenderedWideTable();
      return t65LabelOverclaims([' Prilagodi širini teksta'], params);
    },
    // Istu tvrdnju gard pusti kad fixer tblW stvarno postavi na sirinu teksta, a iscrtane oznake
    // produkcijskog UI-ja za iste parametre ne obecavaju vise nego sto fixer napise.
    cleanBefore: () => {
      const { labels, params } = t65RenderedWideTable();
      const withWidth: TableFigureRescueParams = { ...params, tables: params.tables.map((table) => ({ ...table, textWidthEmu: T65_TEXT_WIDTH_EMU })) };
      return labels.length > 0 && !t65LabelOverclaims(labels, params) && !t65LabelOverclaims([' Prilagodi širini teksta'], withWidth);
    },
  },
  // ---------------------------------------------------------------------------
  // GATE IZDANJA (plan T19): pet stanja u kojima objavljeni artefakt ne odgovara onome sto je dokazano.
  // Presude su ciste funkcije iz `scripts/release-gate-core.mjs`; da ozicenje stvarno zaustavi proces,
  // mjeri `tests/release-gate-cli.test.ts` (prava skripta, pravi izlazni kod).
  // ---------------------------------------------------------------------------
  {
    id: 'objava/build-info-s-tudjim-commitom-prolazi',
    imitates:
      'objavljen artefakt nosi identitet DRUGOG builda: `dist/` prekopiran iz drugog stabla, ili `build-info` '
      + 'nije ponovno pisan nakon promjene koda. Do 2026-09-13 je gate provjeravao samo OBLIK sha-a (40 hex), '
      + 'pa je bilo koji ispravno oblikovan commit prolazio, ukljucujuci tudji. Identitet artefakta iz plana T19 '
      + 'time nije bio dokazan nicim',
    caught: () =>
      buildInfoVerdict({
        raw: JSON.stringify({ commit: 'b'.repeat(40), builtAt: '2026-09-13T00:00:00Z' }),
        expectedCommit: 'a'.repeat(40),
      }).blocking.join(' ').includes('artefakt nema identitet builda'),
    cleanBefore: () =>
      buildInfoVerdict({
        raw: JSON.stringify({ commit: 'a'.repeat(40), builtAt: '2026-09-13T00:00:00Z' }),
        expectedCommit: 'a'.repeat(40),
      }).blocking.length === 0,
  },
  {
    id: 'objava/build-info-nedostaje-u-distu',
    imitates:
      '`npm run build-info` ispadne iz lanca gradnje ili padne, pa objavljena stranica nema nikakav citljiv '
      + 'identitet: vanjski audit 2026-09-08 (nalaz 3) je tako nasao javnu stranicu koja je danima stajala na '
      + 'starom commitu a da to nista nije moglo reci',
    caught: () => buildInfoVerdict({ raw: null, expectedCommit: 'a'.repeat(40) }).blocking.length === 1,
    cleanBefore: () =>
      buildInfoVerdict({ raw: JSON.stringify({ commit: 'a'.repeat(40) }), expectedCommit: 'a'.repeat(40) }).blocking.length === 0,
  },
  {
    id: 'objava/dokaz-tvrdi-potpunost-bez-zapisanog-prolaza',
    imitates:
      'dokaz izdanja koji o sebi tvrdi `complete: true`, a obavezne razine nema u `results[]`: dokaz pecen '
      + 'starijim popisom razina, rucno uredjen dokaz, ili razina koja je ispala iz zapisa. Gate je do '
      + '2026-09-13 citao polje `complete` umjesto da potpunost izracuna, pa tudju zastavicu nije imao cime '
      + 'provjeriti',
    caught: () => {
      const bezWorda = requiredTierIds()
        .filter((id: string) => id !== 'word')
        .map((id: string) => ({ id, label: id, status: 'pass' }));
      return releaseProofVerdict({
        exists: true,
        proof: { ...DOKAZ_BAZA, complete: true, missingRequired: [], results: bezWorda },
        headDigest: DOKAZ_BAZA.treeDigest,
        head: 'a'.repeat(40),
        nowMs: DOKAZ_SADA,
      })
        .conditional.join(' ')
        .includes('obavezne razine bez zapisanog prolaza');
    },
    cleanBefore: () =>
      releaseProofVerdict({
        exists: true,
        proof: DOKAZ_BAZA,
        headDigest: DOKAZ_BAZA.treeDigest,
        head: 'a'.repeat(40),
        nowMs: DOKAZ_SADA,
      }).conditional.length === 0,
  },
  // T62 (2026-09-26): Word korpus i Word TOC su obavezne Tier 2 razine. Izravni signal je popis
  // obaveznih razina iz `release-tiers.mjs`: kad bi razina ispala iz njega (`required: false` ili
  // obrisan redak), dokaz bez nje bio bi jednak punom, gate bi ga pustio i mutacija bi pala.
  ...(['word-corpus', 'word-toc'] as const).map(
    (razina): Mutation => ({
      id: `objava/dokaz-bez-obavezne-razine-${razina}`,
      imitates:
        `dokaz izdanja tvrdi \`complete: true\`, a Word razina \`${razina}\` nema zapisan prolaz. Do T62 `
        + 'popis obaveznih razina trazio je samo `word` i `word-worst`, pa commitani korpus i TOC slucaj '
        + 'nikad nisu morali proci kroz pravi Word da bi dokaz bio potpun',
      caught: () => {
        if (!requiredTierIds().includes(razina)) return false;
        const bezRazine = requiredTierIds()
          .filter((id: string) => id !== razina)
          .map((id: string) => ({ id, label: id, status: 'pass' }));
        const presuda = releaseProofVerdict({
          exists: true,
          proof: { ...DOKAZ_BAZA, complete: true, missingRequired: [], results: bezRazine },
          headDigest: DOKAZ_BAZA.treeDigest,
          head: 'a'.repeat(40),
          nowMs: DOKAZ_SADA,
        }).conditional.join(' ');
        return presuda.includes('obavezne razine bez zapisanog prolaza') && presuda.includes(razina);
      },
      cleanBefore: () =>
        releaseProofVerdict({
          exists: true,
          proof: DOKAZ_BAZA,
          headDigest: DOKAZ_BAZA.treeDigest,
          head: 'a'.repeat(40),
          nowMs: DOKAZ_SADA,
        }).conditional.length === 0,
    }),
  ),
  {
    id: 'tier2/svjezina-po-starom-popisu-word-razina',
    imitates:
      'Tier 2 dokaz pecen popisom prije T62 (prolaz samo na `word` i `word-worst`) proglasava se SVJEZIM, '
      + 'iako commitani korpus (`verify:word:corpus`) i TOC slucaj (`verify:word:toc`) nisu prosli kroz Word. '
      + 'Upravo takav je zapisani RELEASE_PROOF.json na dan uvodjenja T62',
    caught: () => {
      const stari = {
        commit: 'a'.repeat(40),
        dirtyWorkingTree: false,
        results: ['word', 'word-worst'].map((id) => ({ id, status: 'pass' })),
      };
      const s = tier2Freshness(stari, []);
      return s.fresh === false
        && s.reason === 'tier2-nije-prosao'
        && s.missingTiers.includes('word-corpus')
        && s.missingTiers.includes('word-toc');
    },
    cleanBefore: () =>
      tier2Freshness(
        { commit: 'a'.repeat(40), dirtyWorkingTree: false, results: requiredTierIds().map((id: string) => ({ id, status: 'pass' })) },
        [],
      ).fresh === true,
  },
  // T62 nastavak (2026-09-26): Word korpus oracle mora tvrditi `integrityFailure === null`. Kad vrata
  // integriteta odbiju popravak, `applyFixers` vraca ULAZNE bajtove, pa bi `check-corpus.ps1` bez ove
  // provjere Wordom otvorio original i razina `word-corpus` bi lazno prosla.
  {
    id: 'word-oracle/check-corpus-bez-provjere-integrityFailure',
    imitates:
      '`check-corpus.ps1` otvara Wordom izlaz `repair.mts` bez provjere `integrityFailure`. Do T62 nastavka '
      + '`repair.mts` polje nije ni pisao, a odbijen popravak je izlaz bit-identican ulazu, pa je Word '
      + 'mjerio ORIGINAL i razina je prolazila',
    caught: () => {
      const izvorno = readTextLf(resolve(process.cwd(), 'scripts/word-verify/check-corpus.ps1'));
      const bezProvjere = izvorno.replace(
        /\n {2}if \(\$null -ne \$res\.integrityFailure\) \{\n[\s\S]*?\n {2}\}/,
        '',
      );
      return bezProvjere !== izvorno
        && wordOracleIntegrityProblems(bezProvjere).includes('skripta ne broji integrityFailure != null kao PAD');
    },
    cleanBefore: () =>
      wordOracleIntegrityProblems(readTextLf(resolve(process.cwd(), 'scripts/word-verify/check-corpus.ps1'))).length === 0,
  },
  {
    id: 'autonomija/predlozak-bez-word-korpusa-i-toc-a',
    imitates:
      '`config/autonomy.example.json` trazi obvezne razine po popisu prije T62 (`word`, `word-worst`), pa '
      + '`gate.promotion_allowed` pusta kandidata kojemu `word-corpus` i `word-toc` nikad nisu prosli',
    caught: () => {
      const izvorno = JSON.parse(readTextLf(resolve(process.cwd(), 'config/autonomy.example.json'))) as {
        requiredReleaseTiers: string[];
      };
      const stari = {
        ...izvorno,
        requiredReleaseTiers: izvorno.requiredReleaseTiers.filter((id) => id !== 'word-corpus' && id !== 'word-toc'),
      };
      const problemi = requiredTiersDrift(JSON.stringify(stari), requiredTierIds());
      return problemi.includes('nedostaje obavezna razina word-corpus')
        && problemi.includes('nedostaje obavezna razina word-toc');
    },
    cleanBefore: () =>
      requiredTiersDrift(readTextLf(resolve(process.cwd(), 'config/autonomy.example.json')), requiredTierIds()).length === 0,
  },
  {
    id: 'objava/izvor-promijenjen-poslije-ovjere',
    imitates:
      'praceni izvor se promijenio nakon sto je dokaz pecen, pa dokaz potvrdjuje kod koji se vise ne gradi. '
      + 'Otisak stabla se tada razlikuje; `unknown` (nema otiska, `ls-tree` pao) se tretira jednako, jer je u '
      + 'plitkom klonu upravo "ne znam" prolazilo kao zeleno (vanjski audit 2026-09-08, nalaz 1)',
    caught: () => {
      const razisao = releaseProofVerdict({
        exists: true,
        proof: DOKAZ_BAZA,
        headDigest: 'f'.repeat(64),
        head: 'a'.repeat(40),
        nowMs: DOKAZ_SADA,
      }).conditional.join(' ');
      const neznam = releaseProofVerdict({
        exists: true,
        proof: { ...DOKAZ_BAZA, treeDigest: null },
        headDigest: DOKAZ_BAZA.treeDigest,
        head: 'a'.repeat(40),
        nowMs: DOKAZ_SADA,
      }).conditional.join(' ');
      return razisao.includes('ZASTARJELO') && neznam.includes('NE ZNAM') && !neznam.includes('OK');
    },
    cleanBefore: () =>
      releaseProofVerdict({
        exists: true,
        proof: DOKAZ_BAZA,
        headDigest: DOKAZ_BAZA.treeDigest,
        head: 'a'.repeat(40),
        nowMs: DOKAZ_SADA,
      }).notes.join(' ').includes('dokaz o provjerama OK'),
  },
  {
    id: 'objava/necommitana-izmjena-izvora-prolazi-kao-ovjerena',
    imitates:
      'gradnja iz NECISTOG stabla: izvor je promijenjen poslije ovjere, ali izmjena nije commitana. Otisak '
      + 'stabla se racuna iz `git ls-tree`, dakle iz commitanog stabla, pa presuda o zastarjelosti ostaje '
      + '`fresh` i objavi se kod koji nijedna razina dokaza nije mjerila. Mjeri se i to da stari mehanizam '
      + 'pritom SUTI, inace bi novi mogao biti mrtav kod uz nalaz koji dolazi s druge strane',
    caught: () => {
      const nalaz = workingTreeVerdict({ status: ' M src/ui/app.ts\n' }).conditional.join(' ');
      const otisakSuti = releaseProofVerdict({
        exists: true,
        proof: DOKAZ_BAZA,
        headDigest: DOKAZ_BAZA.treeDigest,
        head: 'a'.repeat(40),
        nowMs: DOKAZ_SADA,
      }).conditional.length === 0;
      return nalaz.includes('NECOMMITANE izmjene pracenih datoteka') && nalaz.includes('src/ui/app.ts') && otisakSuti;
    },
    cleanBefore: () => {
      const cisto = workingTreeVerdict({ status: '' });
      // Netrackana datoteka nije u otisku stabla, pa nije ni nalaz: inace bi svaki lokalni log bio pad.
      const netrackano = workingTreeVerdict({ status: '?? gate.log\n' });
      return cisto.conditional.length === 0 && netrackano.conditional.length === 0;
    },
  },
  {
    id: 'objava/neizmjerena-cistoca-stabla-prolazi-kao-cista',
    imitates:
      '`git status` padne (nije git stablo, plitak checkout bez radnog stabla, git nije u PATH-u), a gate to '
      + 'procita kao "nema izmjena". To je isti razred kvara kao plitki klon iz vanjskog audita 2026-09-08: '
      + 'provjera koja u catch grani vrati zeleno. "Ne znam" se mora imenovati i uz tvrd gate pasti',
    caught: () => workingTreeVerdict({ status: null }).conditional.join(' ').includes('cistoca NIJE izmjerena'),
    cleanBefore: () => workingTreeVerdict({ status: '' }).notes.join(' ').includes('stablo koje se gradi je cisto'),
  },
  {
    id: 'objava/mek-gate-zavrsava-s-ok-uz-nalaz',
    imitates:
      'gate koji uz upozorenje `ZASTARJELO` kao ZADNJI redak ispise "OK: ... stoje" i izadje s 0. Mekoca je '
      + 'odluka o STROGOSTI (razvojni CI dokaz ne pece jer trazi Word), ne tvrdnja o dokazu, a operater cita '
      + 'bas taj redak i izlazni kod. `release-proof-core.mjs` isto pravilo vec ima za pojedinacnu presudu '
      + '("stale i unknown nikad ne sadrze OK"); ovo je isti kvar na razini zbroja',
    caught: () => {
      const t = gateSummaryLine(
        { failures: [], warnings: ['dokaz o provjerama: ZASTARJELO: ...'], required: false },
        { ok: 'identitet artefakta i dokaz izdanja stoje', scope: 'identitet artefakta i dokaz izdanja' },
      );
      return t.level === 'unconfirmed' && !t.text.includes('OK') && t.text.includes('NIJE POTVRDJENO');
    },
    cleanBefore: () =>
      gateSummaryLine(
        { failures: [], warnings: [], required: true },
        { ok: 'identitet artefakta i dokaz izdanja stoje', scope: 'identitet artefakta i dokaz izdanja' },
      ).text.startsWith('OK: '),
  },
  {
    id: 'nadzor/objavljena-je-druga-verzija-a-smoke-suti',
    imitates:
      'strogi smoke koji ne odbija pogresnu verziju: `--expect-commit` je neslaganje javljao kao `::warning::` '
      + 'uz izlaz 0, i to i uz `--require-build-info` (ta zastavica hvata samo 404 na build-info.json). '
      + 'Provjera konkretne objave time nije mogla razlikovati objavljenu od tvrdene verzije. Mjeri se i '
      + 'SUPROTAN smjer, jer blagi cron nadzor nad zakljucanom objavom mora ostati zelen',
    caught: () =>
      commitIdentityVerdict({ expectCommit: 'a'.repeat(40), publishedCommit: 'b'.repeat(40), strict: true }).verdict === 'fail'
      && commitIdentityVerdict({ expectCommit: 'a'.repeat(40), publishedCommit: null, strict: true }).verdict === 'fail',
    cleanBefore: () =>
      commitIdentityVerdict({ expectCommit: 'a'.repeat(40), publishedCommit: 'a'.repeat(40), strict: true }).verdict === 'ok'
      && commitIdentityVerdict({ expectCommit: 'a'.repeat(40), publishedCommit: 'b'.repeat(40) }).verdict === 'warn',
  },
  {
    id: 'release/buduci-launcher-izravno-predaje-mts-nodeu',
    imitates:
      'novi cetvrti Git-praceni TypeScript launcher nije rucno dodan na fiksni popis, pa izravno ' +
      'predaje run-local-repair-release.mts Nodeu i na Windows Nodeu 20 pada prije Authenticode gatea',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/future-release-launcher.mts',
        source: ['spawnSync(', 'process', ".execPath, [join(root, 'scripts', ",
          "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/future-release-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/siguran-launcher-skriva-drugi-nepoznati-poziv',
    imitates:
      'datoteka s jednim urednim TSX pokretanjem sakriva drugi execFileSync koji istu .mts skriptu ' +
      'izravno predaje Nodeu, pa fail-closed audit pogresno smatra cijelu datoteku sigurnom',
    caught: () => {
      const safeLaunch =
        `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
        ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
          "'run-local-repair-release.mts')], {});"].join('');
      const hiddenUnsafeLaunch = ['execFileSync(', 'process', ".execPath, [join(root, 'scripts', ",
        "'run-local-repair-release.mts')]);"].join('');
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/mixed-release-launcher.mts',
        source: `${safeLaunch}\n${hiddenUnsafeLaunch}`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/mixed-release-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/tsx-deklaracija-skriva-krivi-prvi-script-argument',
    imitates:
      'ispravna TSX putanja postoji negdje u datoteci, ali Node prvo dobiva drugi script argument, ' +
      'pa kasniji tsxEntrypoint prije release naziva ne smije biti dovoljan za prolaz',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/misleading-release-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `const otherScript = join(root, 'scripts', 'other.mts');\n` +
          ['spawnSync(', 'process', ".execPath, [otherScript, tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/misleading-release-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/hoistana-putanja-skrivena-iza-sigurnog-launchera',
    imitates:
      'putanja release entrypointa deklarirana je prije izravnog execFileSync poziva, pa tekstualni ' +
      'audit nakon process' +
      '.execPath ne vidi literal i siguran launcher maskira taj drugi poziv',
    caught: () => {
      const safeLaunch =
        `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
        ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
          "'run-local-repair-release.mts')], {});"].join('');
      const releaseBinding =
        `const releaseScript = join(root, 'scripts', 'run-local-repair-release.mts');\n`;
      const hiddenUnsafeLaunch = ['execFileSync(', 'process', '.execPath, [releaseScript]);'].join('');
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/hoisted-release-launcher.mts',
        source: `${releaseBinding}${safeLaunch}\n${hiddenUnsafeLaunch}`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/hoisted-release-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/prefiksirani-callee-glumi-spawnsync',
    imitates:
      'myspawnSync zavrsava tekstom spawnSync pa ga regex pogresno prihvaca kao tocno poznati bare ' +
      'callee iako je rijec o nepoznatom wrapperu bez pregledanog sigurnosnog ugovora',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/prefixed-callee-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['myspawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/prefixed-callee-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/lokalni-spawnsync-glumi-node-child-process',
    imitates:
      'lokalna funkcija spawnSync zasjeni provjereni node:child_process import, ali audit je prihvati ' +
      'samo prema imenu pa release poziv ne mora pokrenuti pravi Node child process',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/shadowed-spawn-launcher.mts',
        source:
          `function launch() {\n` +
          `  function spawnSync() { return { status: 0 }; }\n` +
          `  const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['  spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});\n}"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchersRaw([{
        relativePath: 'scripts/shadowed-spawn-launcher.mts',
        source:
          `import { join } from 'node:path';\n` +
          `import { spawnSync } from 'node:child_process';\n` +
          `const root = join(import.meta.dirname, '..');\n` +
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/zasjenjeni-tsx-binding-prolazi-na-globalnu-deklaraciju',
    imitates:
      'globalni tsxEntrypoint pokazuje na kanonski TSX, ali lokalni binding istog imena pokazuje na ' +
      'drugu skriptu pa file-wide regex pogresno odobrava nesigurno pokretanje',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/shadowed-tsx-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `function launch() {\n  const tsxEntrypoint = join(root, 'scripts', 'other.mts');\n` +
          ['  spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});\n}"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/shadowed-tsx-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/mutabilni-tsx-binding-nakon-promjene',
    imitates:
      'let binding najprije pokazuje na kanonski TSX pa se prije launch poziva preusmjeri na drugu ' +
      'skriptu, dok audit pogresno vjeruje samo prvom initializeru',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/mutable-tsx-launcher.mts',
        source:
          `let tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `tsxEntrypoint = join(root, 'scripts', 'other.mts');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/mutable-tsx-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/destrukturirani-parametar-zasjenjuje-tsx-binding',
    imitates:
      'parametar iz object patterna lokalno zasjeni globalni kanonski tsxEntrypoint, ali audit koji ' +
      'ne registrira destrukturirane bindinge pogresno razrijesi globalnu vrijednost',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/destructured-shadow-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `function launch({ tsxEntrypoint }) {\n` +
          ['  spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});\n}"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/destructured-shadow-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/lokalni-process-glumi-node-global',
    imitates:
      'funkcijski parametar process zasjeni Node global, ali audit prihvati njegov execPath kao da ' +
      'je provjereno izvrsno okruzenje stvarnog Node procesa',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/shadowed-process-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `function launch(process) {\n` +
          ['  spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});\n}"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/shadowed-process-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/lokalni-join-glumi-node-path',
    imitates:
      'lokalna funkcija join vraca proizvoljnu skriptu, ali audit je prihvati samo zato sto se callee ' +
      'zove join bez provjere da binding dolazi iz node:path importa',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/shadowed-join-launcher.mts',
        source:
          `function join() { return 'other.mts'; }\n` +
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/shadowed-join-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/uvjetna-putanja-nije-tocan-entrypoint',
    imitates:
      'drugi script argument uvjetno bira release ili drugu skriptu, ali rekurzivna pretraga samog ' +
      'naziva datoteke pogresno odobrava cijeli izraz kao siguran',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/conditional-release-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, ready ? join(root, 'scripts', ",
            "'run-local-repair-release.mts') : join(root, 'scripts', 'other.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/conditional-release-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/parser-greska-pada-zatvoreno',
    imitates:
      'Git-praceni kandidat s ostecenom TypeScript sintaksom ne smije nestati iz audita ili srusiti ' +
      'test bez jasnog parse-error nalaza',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/broken-release-launcher.mts',
        source: ['spawnSync(', 'process', ".execPath, [join(root, 'scripts', ",
          "'run-local-repair-release.mts')], {"].join(''),
      }]);
      return audit.consumers.length === 1 &&
        audit.unsafe[0] === 'scripts/broken-release-launcher.mts:parse-error';
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/broken-release-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/var-spawnsync-je-funkcijski-hoistan',
    imitates:
      'var spawnSync iz unutarnjeg bloka hoistan je na cijelu funkciju i zasjeni provjereni import, ' +
      'ali audit ga pogresno ostavlja samo u blok-scopeu',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/var-spawn-launcher.mts',
        source:
          `function launch() {\n` +
          `  if (false) { var spawnSync = fake; }\n` +
          `  const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['  spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});\n}"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/var-spawn-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/var-process-je-funkcijski-hoistan',
    imitates:
      'var process iz unutarnjeg bloka hoistan je na cijelu funkciju i zasjeni Node global, ali ' +
      'audit ga pogresno ostavlja samo u blok-scopeu',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/var-process-launcher.mts',
        source:
          `function launch() {\n` +
          `  if (false) { var process = fake; }\n` +
          `  const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['  spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});\n}"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/var-process-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/komentar-ne-smije-sakriti-process-execpath',
    imitates:
      'komentar izmedu process i .execPath uklanja tocni tekstualni podniz pa nesigurni izravni ' +
      'Node-to-mts launcher potpuno nestane iz audita',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/commented-process-launcher.mts',
        source: ['spawnSync(', 'process', " /* gap */ .execPath, [join(root, 'scripts', ",
          "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/commented-process-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/runcaptured-nakon-ponovne-dodjele',
    imitates:
      'top-level function runCaptured je ponovno dodijeljena prije release poziva, ali audit je ' +
      'smatra nepromjenjivom samo zato sto je deklarirana function sintaksom',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/run-repair-runner-e2e.mts',
        source:
          `function runCaptured(command, args) { return spawnSync(command, args); }\n` +
          `runCaptured = fake;\n` +
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['runCaptured(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/run-repair-runner-e2e.mts',
        source:
          `function runCaptured(command, args) { return spawnSync(command, args); }\n` +
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['runCaptured(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/napadacki-root-ne-smije-biti-kanonski',
    imitates:
      'join provjerava samo zavrsetak putanje pa napadacki apsolutni korijen moze glumiti i TSX i ' +
      'release entrypoint izvan stvarnog repozitorija',
    caught: () => {
      const audit = auditReleaseLaunchersRaw([{
        relativePath: 'scripts/attacker-root-launcher.mts',
        source:
          `import { join } from 'node:path';\n` +
          `import { spawnSync } from 'node:child_process';\n` +
          `const root = '/attacker';\n` +
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/attacker-root-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/type-only-spawnsync-nije-runtime-import',
    imitates:
      'TypeScript type-only spawnSync import nema runtime vrijednost, ali audit ga pogresno smatra ' +
      'stvarnim node:child_process launcherom',
    caught: () => {
      const audit = auditReleaseLaunchersRaw([{
        relativePath: 'scripts/type-only-spawn-launcher.mts',
        source:
          `import { join } from 'node:path';\n` +
          `import { type spawnSync } from 'node:child_process';\n` +
          `const root = join(import.meta.dirname, '..');\n` +
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/type-only-spawn-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          ['spawnSync(', 'process', ".execPath, [tsxEntrypoint, join(root, 'scripts', ",
            "'run-local-repair-release.mts')], {});"].join(''),
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/nepoznati-executable-oblik-ne-smije-nestati',
    imitates:
      'poziv s release argumentom i computed process execPath oblikom ne smije nestati iz consumer ' +
      'popisa samo zato sto executable jos nije odobren kao siguran oblik',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/computed-executable-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(process['execPath'], [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/computed-executable-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/for-of-ponistava-runcaptured-binding',
    imitates:
      'for-of assignment ponovno dodjeljuje top-level runCaptured prije release poziva, ali audit ' +
      'prati samo obicne assignment i update izraze',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/run-repair-runner-e2e.mts',
        source:
          `function runCaptured(command, args) { return spawnSync(command, args); }\n` +
          `for (runCaptured of replacements) { break; }\n` +
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `runCaptured(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/run-repair-runner-e2e.mts',
        source:
          `function runCaptured(command, args) { return spawnSync(command, args); }\n` +
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `runCaptured(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/parse-error-bez-tocnog-execpath-teksta',
    imitates:
      'ostecena Git-pracena release referenca pada otvoreno ako prije parse greske ne sadrzi oba ' +
      'tocna tekstualna tokena process i execPath',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/broken-alias-launcher.mts',
        source:
          `spawnSync(nodeExecutable, [` +
          `join(root, 'scripts', 'run-local-repair-release.mts')], {`,
      }]);
      return audit.consumers.length === 1 &&
        audit.unsafe[0] === 'scripts/broken-alias-launcher.mts:parse-error';
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/broken-alias-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/nested-launcher-mora-imati-tocnu-root-dubinu',
    imitates:
      'launcher dvije mape ispod repozitorija koristi samo jedan parent segment pa audit prihvati ' +
      'scripts mapu kao da je stvarni repo-root',
    caught: () => {
      const audit = auditReleaseLaunchersRaw([{
        relativePath: 'scripts/nested/future-launcher.mts',
        source:
          `import { join } from 'node:path';\n` +
          `import { spawnSync } from 'node:child_process';\n` +
          `const root = join(import.meta.dirname, '..');\n` +
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchersRaw([{
        relativePath: 'scripts/nested/future-launcher.mts',
        source:
          `import { join } from 'node:path';\n` +
          `import { spawnSync } from 'node:child_process';\n` +
          `const root = join(import.meta.dirname, '..', '..');\n` +
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/spawnsync-nakon-ponovne-dodjele',
    imitates:
      'provjereni spawnSync import ponovno je dodijeljen prije release poziva, ali callee trust ' +
      'ignorira vec ponisteni immutable status bindinga',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/reassigned-spawn-launcher.mts',
        source:
          `spawnSync = fake;\n` +
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/reassigned-spawn-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/imenovani-function-expression-zasjenjuje-spawn',
    imitates:
      'vlastito ime named function expressiona vrijedi unutar njegova tijela i zasjeni vanjski ' +
      'spawnSync import, ali audit taj unutarnji binding ne registrira',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/named-function-launcher.mts',
        source:
          `const holder = function spawnSync() {\n` +
          `  const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `  spawnSync(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});\n};`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/named-function-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/private-method-parametar-zasjenjuje-process',
    imitates:
      'ClassPrivateMethod je funkcijski scope pa njegov process parametar mora zasjeniti Node ' +
      'global umjesto da release poziv pogresno prode kao siguran',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/private-method-launcher.mts',
        source:
          `class Launcher { #run(process) {\n` +
          `  const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `  spawnSync(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});\n} }`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/private-method-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/typescript-wrapper-ne-smije-sakriti-write',
    imitates:
      'TypeScript non-null wrapper oko assignment targeta ne smije sakriti ponovnu dodjelu ' +
      'runCaptured bindinga prije release poziva',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/run-repair-runner-e2e.mts',
        source:
          `function runCaptured(command, args) { return spawnSync(command, args); }\n` +
          `runCaptured! = fake;\n` +
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `runCaptured(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/run-repair-runner-e2e.mts',
        source:
          `function runCaptured(command, args) { return spawnSync(command, args); }\n` +
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `runCaptured(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/destrukturirani-execpath-alias-je-candidate',
    imitates:
      'destrukturirani execPath alias bez spremljenog init izraza potpuno nestane iz consumera ' +
      'umjesto da bude otkriven i fail-closed odbijen',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/destructured-executable-launcher.mts',
        source:
          `const { execPath: nodeExecutable } = process;\n` +
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(nodeExecutable, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/destructured-executable-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/uvjetni-executable-je-candidate',
    imitates:
      'conditional executable koji u obje grane sadrzi process.execPath mora ostati vidljiv kao ' +
      'nesiguran candidate umjesto da audit vrati prazan consumer popis',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/conditional-executable-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(flag ? process.execPath : process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/conditional-executable-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/optional-call-je-nesiguran-candidate',
    imitates:
      'optional spawnSync poziv moze pokrenuti release, ali OptionalCallExpression nije skupljen ' +
      'pa potpuno nestane iz consumer i unsafe rezultata',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/optional-call-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync?.(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/optional-call-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/computed-destructured-execpath-je-candidate',
    imitates:
      'computed string kljuc u process destructuringu stvara execPath alias, ali provenance ga ne ' +
      'prepoznaje pa launcher nestane iz audita',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/computed-destructure-launcher.mts',
        source:
          `const { ['execPath']: nodeExecutable } = process;\n` +
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(nodeExecutable, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/computed-destructure-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/aliased-process-destructured-execpath-je-candidate',
    imitates:
      'execPath destrukturiran iz immutable process aliasa mora ostati vidljiv kao nesiguran ' +
      'candidate umjesto da provenance zahtijeva samo izravni process identifikator',
    caught: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/aliased-destructure-launcher.mts',
        source:
          `const proc = process;\n` +
          `const { execPath: nodeExecutable } = proc;\n` +
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(nodeExecutable, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/aliased-destructure-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    id: 'release/named-node-process-execpath-import-je-candidate',
    imitates:
      'valjani imenovani execPath import iz node:process predstavlja stvarni Node executable, ali ' +
      'bez import provenance launcher potpuno nestane iz audita',
    caught: () => {
      const audit = auditReleaseLaunchersRaw([{
        relativePath: 'scripts/imported-execpath-launcher.mts',
        source:
          `import { join } from 'node:path';\n` +
          `import { spawnSync } from 'node:child_process';\n` +
          `import { execPath as nodeExecutable } from 'node:process';\n` +
          `const root = join(import.meta.dirname, '..');\n` +
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(nodeExecutable, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 1;
    },
    cleanBefore: () => {
      const audit = auditReleaseLaunchers([{
        relativePath: 'scripts/imported-execpath-launcher.mts',
        source:
          `const tsxEntrypoint = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');\n` +
          `spawnSync(process.execPath, [` +
          `tsxEntrypoint, join(root, 'scripts', 'run-local-repair-release.mts')], {});`,
      }]);
      return audit.consumers.length === 1 && audit.unsafe.length === 0;
    },
  },
  {
    // Namjerno BEZ `axis`: ovo je gard nad SQL migracijama, ne nad bodovanom osi profila.
    id: 'migracija/tvrd-kljuc-i-nezasticen-unschedule',
    imitates:
      '0059_secure_reminder_cron.sql je do 2026-09-20 bezuvjetno zvao cron.unschedule nad poslom ' +
      'koji na stagingu ne postoji, pa je `db push` pao s "could not find valid entry for job ' +
      'send-deadline-reminders" (SQLSTATE XX000) i srusio lanac od 24 migracije; ista je ' +
      'datoteka u repozitoriju drzala produkcijski endpoint i produkcijski Bearer kljuc, pa bi ' +
      'staging baza svaki dan u 8 h slala podsjetnike stvarnim korisnicima preko produkcije',
    caught: () => {
      // Doslovan oblik kvara kakav je stvarno bio u repozitoriju, slozen u memoriji: nijedna
      // datoteka na disku se ne dira. Kljuc je sintetican (niz X-eva), ne onaj procureli.
      const mutated = [{
        file: '0059_secure_reminder_cron.sql',
        sql:
          "select cron.unschedule('send-deadline-reminders'); " +
          "select cron.schedule('send-deadline-reminders', '0 8 * * *', " +
          "'select net.http_post(url := ''https://abcdefghijklmnopqrst.supabase.co/functions/v1/send-reminders'', " +
          "headers := jsonb_build_object(''Authorization'', ''Bearer XXXXXXXXXXXXXXXXXXXXXXXXXXXX''));');",
      }];
      const kinds = migrationHygieneProblems(mutated).map((p) => p.kind);

      // Drugi oblik istog kvara, dodan nakon drugog kruga pregleda (2026-09-20): migracija koja
      // vodi DVA posla, prvi zastiti `if exists` provjerom, drugi zaboravi. Gard je taj oblik do
      // ispravka prijavljivao kao CIST, jer je pogled unatrag gledao cijeli prefiks tijela bloka.
      const borrowed = [{
        file: '9999_borrowed_guard.sql',
        sql: [
          'do $$',
          'begin',
          "  if exists (select 1 from cron.job where jobname = 'purge-x') then",
          "    perform cron.unschedule('purge-x');",
          '  end if;',
          "  perform cron.unschedule('send-deadline-reminders');",
          'end $$;',
        ].join('\n'),
      }];
      const borrowedKinds = migrationHygieneProblems(borrowed).map((p) => p.kind);

      // Treci oblik, dodan nakon treceg kruga pregleda (2026-09-20): poziv u `elsif` grani
      // provjere postojanja. Ta se grana izvodi tocno kad posla NEMA, pa je pad zajamcen, a gard
      // ju je prije ispravka prijavljivao kao CIST, jer granica bloka nije poznavala `elsif`.
      const elsifBranch = [{
        file: '9999_elsif_branch.sql',
        sql: [
          'do $$',
          'begin',
          "  if exists (select 1 from cron.job where jobname = 'send-deadline-reminders') then",
          '    null;',
          '  elsif true then',
          "    perform cron.unschedule('send-deadline-reminders');",
          '  end if;',
          'end $$;',
        ].join('\n'),
      }];
      const elsifKinds = migrationHygieneProblems(elsifBranch).map((p) => p.kind);

      return (
        kinds.includes('hardcoded-endpoint') &&
        kinds.includes('bearer-literal') &&
        kinds.includes('unguarded-unschedule') &&
        borrowedKinds.includes('unguarded-unschedule') &&
        elsifKinds.includes('unguarded-unschedule')
      );
    },
    // Baseline nad STVARNIM datotekama na disku: bez njega bi mutacija mogla "prolaziti" zato
    // sto gard vristi na svaku migraciju, a ne zato sto je pogodio bas ovaj oblik.
    cleanBefore: () => {
      const dir = resolve(process.cwd(), 'supabase', 'migrations');
      const files = readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .map((file) => ({ file, sql: readFileSync(join(dir, file), 'utf8') }));
      return files.length > 50 && migrationHygieneProblems(files).length === 0;
    },
  },
  // CSP NAPLATE (F18 krug 2, 2026-09-26). Gard `cspHeaderProblems` se u produkciji vrti nad
  // dist/_headers u verify-deploy-dist.mjs; ovdje se vrti nad STVARNIM public/_headers kroz ISTU
  // zamjenu tokena koju radi vite.config.ts, pa je baseline tocno ono sto build isporucuje.
  // Namjerno BEZ `axis`: ovo nije bodovana os profila.
  {
    id: 'csp/stripe-frame-src-uklonjen',
    imitates:
      'Bez `frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com` vrijedi `default-src self`, ' +
      'pa preglednik blokira Stripe iframe: Payment Element ostaje prazan okvir, a Vitest, tsc i ' +
      'csp-hash su u krugu 1 ostali zeleni jer nijedan nije gledao Stripe hostove.',
    caught: () => {
      // Tocan niz iz CSP retka, ne regex: rijec frame-src se javlja i u komentaru iznad njega.
      const mut = builtHeaders().replace(' frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com;', '');
      return mut !== builtHeaders() && cspHeaderProblems(mut).some((p) => p.includes('frame-src'));
    },
    cleanBefore: () => cspHeaderProblems(builtHeaders()).length === 0,
  },
  {
    id: 'csp/stripe-api-izbacen-iz-connect-src',
    imitates:
      'Payment Element potvrdjuje placanje XHR-om na api.stripe.com; bez tog hosta u connect-src ' +
      'potvrda pada u pregledniku uz CSP gresku u konzoli, a build bi bez ovog garda prosao jer ' +
      'je provjera tokena gledala samo jesu li zamijenjeni.',
    caught: () => {
      const mut = builtHeaders().replace(' https://api.stripe.com;', ';');
      return mut !== builtHeaders() && cspHeaderProblems(mut).some((p) => p.includes('connect-src ne dopusta https://api.stripe.com'));
    },
    cleanBefore: () => cspHeaderProblems(builtHeaders()).length === 0,
  },
  {
    id: 'csp/nezamijenjen-token-u-komentaru',
    imitates:
      'Krug 1 F18: komentar u public/_headers je doslovno citirao token naslijedjenog providera, ' +
      'a vite.config.ts ga vise nije zamjenjivao, pa bi verify-deploy-dist srusio svaki ' +
      'produkcijski build i CI dist-gate, bez ijednog crvenog Vitest testa.',
    caught: () => {
      const tok = ['__CSP', 'LS__'].join('_');
      const mut = `# Do 2026-09-23 je ovdje stajao ${tok}.\n${builtHeaders()}`;
      return cspHeaderProblems(mut).some((p) => p.includes(`nesupstituiran token ${tok}`));
    },
    cleanBefore: () => cspHeaderProblems(builtHeaders()).length === 0,
  },
  // T89 (2026-09-28): captcha na Supabase Authu. Kad je captcha ukljucen, GoTrue odbija signup
  // bez tokena; anonimna prijava je identitet iza popravka, pa bi popravak tiho prestao raditi.
  {
    id: 'auth/captcha-token-uklonjen-iz-anonimne-prijave',
    imitates:
      'Anonimna prijava salje gole `{}` umjesto withCaptcha: dok captcha nije na Authu sve radi, a ' +
      'cim se ukljuci, svaki novi korisnik ostaje bez sesije i popravak pada s 401, bez crvenog testa.',
    caught: () => {
      const text = readTextLf(resolve(process.cwd(), 'src', 'auth', 'session.ts'));
      const mut = text.replace('body: withCaptcha({}, captchaToken),', "body: '{}',");
      return mut !== text && captchaWiringProblems([{ path: 'src/auth/session.ts', text: mut }])
        .some((p) => p.includes('/auth/v1/signup salje tijelo mimo withCaptcha'));
    },
    cleanBefore: () =>
      captchaWiringProblems([{ path: 'src/auth/session.ts', text: readTextLf(resolve(process.cwd(), 'src', 'auth', 'session.ts')) }]).length === 0,
  },
  {
    id: 'auth/captcha-token-izgubljen-u-prijavi-lozinkom',
    imitates: 'withCaptcha ostane, ali dobije undefined umjesto tokena: tijelo izgleda ispravno, a token nikad ne stigne.',
    caught: () => {
      const text = readTextLf(resolve(process.cwd(), 'src', 'auth', 'session.ts'));
      const mut = text.replace('withCaptcha({ email: clean, password }, captchaToken)', 'withCaptcha({ email: clean, password }, undefined)');
      return mut !== text && captchaWiringProblems([{ path: 'src/auth/session.ts', text: mut }])
        .some((p) => p.includes('grant_type=password zove withCaptcha bez captchaToken'));
    },
    cleanBefore: () =>
      captchaWiringProblems([{ path: 'src/auth/session.ts', text: readTextLf(resolve(process.cwd(), 'src', 'auth', 'session.ts')) }]).length === 0,
  },
  {
    id: 'auth/supabase-js-prijava-mimo-captche',
    imitates:
      'Codex T89-04: novi tok kroz supabase-js (npr. reset lozinke ili anonimna prijava) bez captchaToken; ' +
      'fetch dio garda ga ne vidi, pa bi uz tri postojeca poziva prosao.',
    caught: () => {
      const text = readTextLf(resolve(process.cwd(), 'src', 'auth', 'session.ts'));
      return captchaWiringProblems([
        { path: 'src/auth/session.ts', text },
        { path: 'src/auth/reset.ts', text: 'await supabase.auth.resetPasswordForEmail(email);\n' },
      ]).some((p) => p.includes('supabase-js resetPasswordForEmail() mimo withCaptcha'));
    },
    cleanBefore: () =>
      captchaWiringProblems([{ path: 'src/auth/session.ts', text: readTextLf(resolve(process.cwd(), 'src', 'auth', 'session.ts')) }]).length === 0,
  },
  {
    id: 'csp/turnstile-izbacen-iz-script-src',
    imitates:
      'Bez challenges.cloudflare.com u script-src preglednik blokira Turnstile api.js; klijent tada ' +
      'nema token, pa uz ukljucen captcha na Authu nitko ne moze dobiti sesiju.',
    caught: () => {
      const mut = builtHeaders().replace(' https://challenges.cloudflare.com \'sha256', " 'sha256");
      return mut !== builtHeaders() && cspHeaderProblems(mut).some((p) => p.includes('script-src ne dopusta https://challenges.cloudflare.com'));
    },
    cleanBefore: () => cspHeaderProblems(builtHeaders()).length === 0,
  },
  // Komunikacija koordinatora i cloud sesija (vlasnik 2026-10-04). Mutacije mijenjaju tekst pravila;
  // baseline je nad stvarnim datotekama.
  ...([
    ['poruke/kanal-nije-pr', 'readme', '**Kanal istine je PR.**', '**Kanal je bilo koji.**', 'README: nema pravila "kanal istine je PR"'],
    ['poruke/bez-pretplate', 'readme', 'pretplacuje na svaki PR izvrsitelja** (`subscribe_pr_activity`)', 'pretplacuje po potrebi**', 'README: nema pravila "koordinator se pretplacuje na PR"'],
    ['poruke/bez-povlacenja', 'readme', '**Koordinator sam povlaci stanje.**', '**Koordinator ceka poruke.**', 'README: nema pravila "koordinator sam povlaci stanje"'],
    ['poruke/routine-10-minuta', 'readme', '`run_once_at` tocno 1 minutu unaprijed', '`run_once_at` 10 minuta unaprijed', 'README: nema pravila "Routine 1 minutu unaprijed"'],
    ['poruke/bez-provjere-isporuke', 'readme', '`last_run` mora biti `SUCCEEDED`', '`last_run` se ne gleda', 'README: nema pravila "provjera isporuke Routinea"'],
    ['poruke/routine-kao-zakazani-zadatak', 'readme', '**Koordinator Routine s tim zaglavljem cita kao izvjestaj izvrsitelja**', '**Koordinator Routine cita kao zakazani zadatak**', 'README: nema pravila "Routine kao izvjestaj izvrsitelja"'],
    ['poruke/relay-kao-odobrenje', 'readme', '**Vlasnikove odluke izvrsitelj trazi izravno od vlasnika**', '**Vlasnikove odluke prenosi koordinator**', 'README: nema pravila "vlasnikove odluke izravno"'],
    ['poruke/brief-bez-zaglavlja', 'brief', '"[<sesija> -> koordinator] T<xx> <VRSTA> PR #<n>', '"[status] PR #<n>', 'brief: nema fiksnog zaglavlja Routine poruke'],
    ['poruke/negiran-status-na-pr', 'readme', 'koordinatoru) pise kao komentar na svoj PR', 'koordinatoru) ne pise kao komentar na svoj PR', 'README: nema pravila "status kao komentar na PR"'],
    ['poruke/zaglavlje-bez-zadatka', 'readme', '`[<sesija> -> koordinator] T<xx> <VRSTA> PR #<n>', '`[<sesija> -> koordinator] PR #<n>', 'README: nema fiksnog zaglavlja Routine poruke'],
    ['poruke/brief-bez-issuea', 'brief', 'dok PR ne postoji, na GitHub issue zadatka', 'dok PR ne postoji, cekaj', 'brief: nema izvjestaja na issueu prije PR-a'],
    ['poruke/isporuceno-kao-procitano', 'readme', '`SUCCEEDED` potvrdjuje samo isporuku u sesiju, ne i da ju je koordinator procitao', '`SUCCEEDED` potvrdjuje da je koordinator procitao', 'README: nema pravila "isporuceno nije procitano"'],
    ['poruke/pr-merge-bez-pretplate', 'prMerge', 'Budi pretplacen na PR (`subscribe_pr_activity`)', 'Gledaj PR kad stignes', 'pr-merge: nema pretplate na PR'],
  ] as const).map(([id, key, from, to, problem]) => {
    const real = (): MessagingSources => ({
      readme: readTextLf(resolve(process.cwd(), 'docs', 'agents', 'README.md')),
      brief: readTextLf(resolve(process.cwd(), '.claude', 'skills', 'brief', 'SKILL.md')),
      prMerge: readTextLf(resolve(process.cwd(), '.claude', 'skills', 'pr-merge', 'SKILL.md')),
    });
    return {
      id,
      imitates: `Komunikacija sesija: ${problem}; poruka iz clouda tada opet tiho ne stigne do koordinatora ili vrijedi kao nalog.`,
      caught: () => {
        const src = real();
        const mut = src[key].replace(from, to);
        return mut !== src[key] && messagingRuleProblems({ ...src, [key]: mut }).includes(problem);
      },
      cleanBefore: () => messagingRuleProblems(real()).length === 0,
    };
  }),
  // T87 (kriterij 9 T81): iskljucen ili zauzet endpoint ne vodi u slijepu ulicu. Mutacije mijenjaju
  // IZVOR modula; baseline je nad stvarnim datotekama.
  ...([
    ['t87/klijent-ne-prepoznaje-disabled', 'repairClient', "if (data?.error === 'disabled') {", "if (data?.error === 'iskljuceno') {",
      'repair-client: 503 disabled nije prepoznat'],
    ['t87/klijent-ne-prepoznaje-busy', 'repairClient', "if (data?.error === 'busy') {", "if (data?.error === 'zauzeto') {",
      'repair-client: 503 busy nije prepoznat'],
    ['t87/politika-disabled-bez-statusa', 'recoveryPolicy', "outcome.status === 503 && outcome.code === 'disabled'", "outcome.code === 'disabled'",
      'recovery-policy: grana disabled nije vezana uz status 503'],
    ['t87/politika-disabled-nudi-retry', 'recoveryPolicy', "action: 'none',\n      retryAllowed: false,\n      message: 'Automatski", "action: 'retry',\n      retryAllowed: true,\n      message: 'Automatski",
      'recovery-policy: disabled ne zavrsava bez ponovnog pokusaja'],
    ['t87/politika-busy-bez-statusa', 'recoveryPolicy', "outcome.status === 503 && outcome.code === 'busy'", "outcome.code === 'busy'",
      'recovery-policy: grana busy nije vezana uz status 503'],
    ['t87/render-disabled-bez-upute', 'fieldRender', 'warnings: [FIELD_RENDER_DISABLED_MESSAGE]', "warnings: ['Render nije uspio (503).']",
      'field-render: 503 disabled ne daje uputu'],
  ] as const).map(([id, key, from, to, problem]) => {
    const real = (): DeadEndSources => ({
      repairClient: readTextLf(resolve(process.cwd(), 'src', 'report', 'repair-client.ts')),
      recoveryPolicy: readTextLf(resolve(process.cwd(), 'src', 'repair', 'recovery-policy.ts')),
      fieldRender: readTextLf(resolve(process.cwd(), 'src', 'report', 'field-render-client.ts')),
    });
    return {
      id,
      imitates: `T87: ${problem}; korisnik bi opet vidio "neocekivani odgovor 503" ili gumb koji ne moze uspjeti.`,
      caught: () => {
        const src = real();
        const mut = src[key].replace(from, to);
        return mut !== src[key] && deadEndWiringProblems({ ...src, [key]: mut }).includes(problem);
      },
      cleanBefore: () => deadEndWiringProblems(real()).length === 0,
    };
  }),
  // T99 (issue #220): gard izvora u lockfileu. Baseline je stvarni package-lock.json (0 prekrsaja);
  // svaka mutacija podmece jedan los izvor u kopiju tog lockfilea, u memoriji. Baseline sadrzi i
  // `inBundle` paket bez `resolved`, pa cist baseline dokazuje i da izuzetak nije lazni pozitiv.
  ...([
    ['t99/lockfile-drugi-host', 'resolved na tudji host (lockfile injection)',
      (p: LockPkg) => ({ ...p, resolved: 'https://evil.example/x/-/x-1.0.0.tgz' })],
    ['t99/lockfile-http', 'resolved preko http:// bez TLS-a',
      (p: LockPkg) => ({ ...p, resolved: String(p.resolved).replace('https://', 'http://') })],
    ['t99/lockfile-git-izvor', 'resolved na git izvor mimo registryja',
      (p: LockPkg) => ({ ...p, resolved: 'git+https://github.com/x/x.git#0000000' })],
    ['t99/lockfile-bez-integrity', 'paket bez integrity, pa se sadrzaj ne provjerava',
      (p: LockPkg) => { const { integrity: _i, ...rest } = p; return rest; }],
    ['t99/lockfile-sha1', 'integrity sa slabim sha1 umjesto sha512',
      (p: LockPkg) => ({ ...p, integrity: 'sha1-AAAAAAAAAAAAAAAAAAAAAAAAAAA=' })],
    ['t99/lockfile-git-ssh', 'resolved na git+ssh izvor',
      (p: LockPkg) => ({ ...p, resolved: 'git+ssh://git@github.com/x/x.git#0000000' })],
    ['t99/lockfile-drugi-registry', 'resolved na drugi javni registry (yarn)',
      (p: LockPkg) => ({ ...p, resolved: String(p.resolved).replace('registry.npmjs.org', 'registry.yarnpkg.com') })],
    ['t99/lockfile-bez-resolved', 'paket bez resolved, pa npm sam bira izvor',
      (p: LockPkg) => { const { resolved: _r, ...rest } = p; return rest; }],
    ['t99/lockfile-sha512-sha1-rezerva', 'integrity "sha512- sha1-..." koji ssri cita kao sha1 (Codex F3)',
      (p: LockPkg) => ({ ...p, integrity: 'sha512- sha1-EfatjsUqKYSrqv18O1FlA3hcIHI=' })],
    ['t99/lockfile-prazan-sha512', 'integrity "sha512-" bez digesta (Codex F3)',
      (p: LockPkg) => ({ ...p, integrity: 'sha512-' })],
    ['t99/lockfile-link', 'obican paket pretvoren u link na lokalnu putanju (Codex F2)',
      (p: LockPkg) => ({ ...p, link: true, resolved: '../izvan' })],
  ] as const).map(([id, imitates, mutate]) => ({
    id,
    imitates: `T99: ${imitates}; npm audit to ne vidi jer gleda samo poznate CVE-ove.`,
    caught: () => {
      const lock = realLock();
      const name = Object.keys(lock.packages).find((k) => k !== '' && !lock.packages[k].inBundle && !lock.packages[k].link);
      if (!name) return false;
      lock.packages[name] = mutate(lock.packages[name]);
      return lockfileSourceProblems(lock).problems.some((x: string) => x.startsWith(`${name}:`));
    },
    cleanBefore: () => lockfileSourceProblems(realLock()).problems.length === 0,
  })),
  ...([
    ['t99/lockfile-verzija-4', 'lockfileVersion 4 uz valjan packages; gard ga ne bi citao (Codex F4)',
      (l: RealLock) => { l.lockfileVersion = 4; }, 'lockfileVersion mora biti broj 3'],
    ['t99/lockfile-verzija-tekst', 'lockfileVersion kao tekst "3" (Codex F4)',
      (l: RealLock) => { l.lockfileVersion = '3'; }, 'lockfileVersion mora biti broj 3'],
    ['t99/lockfile-inbundle-strani-resolved', 'inBundle zapis sa stranim resolved, dosad bezuvjetno izuzet (Codex F2)',
      (l: RealLock) => { l.packages[INBUNDLE_KEY] = { ...l.packages[INBUNDLE_KEY], resolved: 'https://evil.example/c.tgz' }; }, `${INBUNDLE_KEY}:`],
    ['t99/lockfile-inbundle-bez-roditelja', 'roditelj vise ne navodi paket u bundleDependencies, a inBundle ostaje (Codex F2)',
      (l: RealLock) => { l.packages[INBUNDLE_PARENT] = { ...l.packages[INBUNDLE_PARENT], bundleDependencies: [] }; }, `${INBUNDLE_KEY}:`],
  ] as const).map(([id, imitates, mutate, expected]) => ({
    id,
    imitates: `T99: ${imitates}.`,
    caught: () => {
      const lock = bundledLock();
      mutate(lock);
      return lockfileSourceProblems(lock).problems.some((x: string) => x.startsWith(expected));
    },
    cleanBefore: () => {
      const lock = bundledLock();
      return lockfileSourceProblems(lock).problems.length === 0 && lock.packages[INBUNDLE_KEY]?.inBundle === true;
    },
  })),
  ...([
    ['t99/lockfile-gard-nakon-instalacije', 'gard vraćen iza setup-deps: npm ci izvrsi instalacijsku skriptu prije odbijanja (Codex F1)',
      (wf: string) => {
        const step = wf.slice(wf.indexOf('      - name: Izvori paketa u lockfileu'), wf.indexOf('      - name: Ovisnosti (kesirano)'));
        const setup = '      - name: Ovisnosti (kesirano)\n        uses: ./.github/actions/setup-deps\n        with:\n          node-version: 24\n\n';
        return wf.replace(step, '').replace(setup, setup + step);
      }, 'npm-audit: gard izvora tek nakon instalacije (setup-deps)'],
    ['t99/lockfile-gard-continue-on-error', 'korak garda dobije continue-on-error pa crveno ne blokira (Codex F5)',
      (wf: string) => wf.replace('      - name: Izvori paketa u lockfileu (selftest pa mjerenje, prije instalacije)\n',
        '      - name: Izvori paketa u lockfileu (selftest pa mjerenje, prije instalacije)\n        continue-on-error: true\n'),
      'npm-audit: korak lockfile-sources.mjs ima continue-on-error'],
    ['t99/lockfile-gard-if-false', 'korak garda dobije if: false pa se nikad ne izvrsi (Codex F5)',
      (wf: string) => wf.replace('      - name: Izvori paketa u lockfileu (selftest pa mjerenje, prije instalacije)\n',
        '      - name: Izvori paketa u lockfileu (selftest pa mjerenje, prije instalacije)\n        if: false\n'),
      'npm-audit: korak lockfile-sources.mjs ima uvjet if'],
    ['t99/lockfile-mjerenje-zakomentirano', 'naredba mjerenja zakomentirana, tekst ostaje u datoteci (Codex F5)',
      (wf: string) => wf.replace('          node scripts/lockfile-sources.mjs\n', '          # node scripts/lockfile-sources.mjs\n'),
      'npm-audit: nema mjerenja garda izvora'],
  ] as const).map(([id, imitates, mutate, problem]) => ({
    id,
    imitates: `T99: ${imitates}.`,
    caught: () => {
      const wf = readTextLf(resolve(process.cwd(), '.github', 'workflows', 'security-audit.yml'));
      const mut = mutate(wf);
      return mut !== wf && lockfileGuardWiringProblems(mut).includes(problem);
    },
    cleanBefore: () =>
      lockfileGuardWiringProblems(readTextLf(resolve(process.cwd(), '.github', 'workflows', 'security-audit.yml'))).length === 0,
  })),
  // T99 korak 2: OSV ratchet za Deno i Python, F2 i F5 iz runde 2 na #258. Baseline su stvarne datoteke.
  // T84 RD-2 i RD-3: limit po korisniku i fail-closed strop ishoda bez potrosnje u repair-docx.
  ...([
    ['t84/repair-slot-bez-korisnika', 'slot se trazi bez limita po korisniku, pa jedan racun s cetiri paralelna popravka drzi sve ostale na 503',
      'maxPerUser: REPAIR_MAX_PER_USER,', 'maxPerUser: 0,', 'repair-docx: slot se ne trazi s korisnikom i limitom po korisniku'],
    ['t84/repair-user-busy-prolazi', 'user_busy se ne odbija, pa limit po korisniku postoji u bazi ali ne djeluje',
      "if (globalSlot.kind === 'full' || globalSlot.kind === 'user_busy') return json({ error: 'busy' }, 503);",
      "if (globalSlot.kind === 'full') return json({ error: 'busy' }, 503);", 'repair-docx: user_busy ne vraca 503 busy'],
    ['t84/repair-greska-slota-prolazi', 'greska novog RPC-a se ne odbija pa popravak tece bez ikakvog slota (Codex R1 na #294)',
      "    if (globalSlot.kind === 'error') return json({ error: 'unavailable' }, 503);\n", '', 'repair-docx: greska slota ne vraca 503'],
    ['t84/repair-strop-bez-429', 'grana 429 za strop pokusaja uklonjena, pa korisnik preko stropa i dalje salje pune popravke (Codex R7 na #294)',
      "    if (attemptCap === 'over') return json({ error: 'rate_limited', reason: 'attempts_daily' }, 429);\n", '',
      'repair-docx: strop ishoda ne vraca 429 attempts_daily prije citanja tijela'],
    ['t84/repair-dnevnik-fail-open', 'necitljiv dnevnik pokusaja se tumaci kao nula, pa strop nestane bas kad dnevnik ne radi (Codex R2 na #294)',
      "    if (attemptCap === 'error') return json({ error: 'unavailable' }, 503);\n", '',
      'repair-docx: necitljiv dnevnik pokusaja ne vraca 503 prije citanja tijela'],
    ['t84/repair-nula-izmjena-nebiljezena', 'ishod bez izmjena se ne dopisuje na rezervaciju (Codex R3 na #294)',
      "      await finishAttempt(admin, attempt, 'no_change');\n", '',
      'repair-docx: ishod bez izmjena se ne dopisuje na rezervaciju'],
    ['t84/repair-integritet-nebiljezen', 'odbijena isporuka se ne dopisuje na rezervaciju (Codex R3 na #294)',
      "      await finishAttempt(admin, attempt, 'integrity_failed');\n", '',
      'repair-docx: odbijena isporuka se ne dopisuje na rezervaciju'],
    ['t84/repair-bez-rezervacije', 'pokusaj se ne rezervira prije tijela, pa neuspjeli upis na kraju ostavlja skupi rad nezabiljezen (Codex R3 runda 2 na #294)',
      '    const attempt = await reserveAttempt(admin, user.id, REPAIR_UNCOUNTED_DAILY_CAP);\n', "    const attempt = { kind: 'off' } as const;\n",
      'repair-docx: pokusaj se ne rezervira prije citanja tijela'],
    ['t84/repair-rezervacija-fail-open', 'neuspjela rezervacija se ne odbija, pa skupi rad tece bez zapisa (Codex R3 runda 2 na #294)',
      "    if (!attempt) return json({ error: 'unavailable' }, 503);\n", '',
      'repair-docx: neuspjela rezervacija ne vraca 503 prije citanja tijela'],
    ['t84/repair-dvostruko-brojanje', 'zapis u report_generations ne brise rezervaciju, pa uspjesan ili odbijen pokusaj puni i strop pokusaja',
      '      if (!written.error) await dropAttempt(admin, attempt);\n', '',
      'repair-docx: zapis u report_generations ne brise rezervaciju (dvostruko brojanje)'],
  ] as const).map(([id, imitates, from, to, problem]) => ({
    id,
    imitates: `T84: ${imitates}.`,
    caught: () => {
      const src = readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'repair-docx', 'index.ts'));
      const mut = src.replace(from, to);
      return mut !== src && repairCostGuardProblems(mut).includes(problem);
    },
    cleanBefore: () => repairCostGuardProblems(readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'repair-docx', 'index.ts'))).length === 0,
  })),
  {
    id: 't84/repair-strop-nakon-tijela',
    imitates: 'T84: strop pokusaja premjesten iza citanja tijela, pa se 20 MB i dalje cita prije odbijanja (Codex R7 na #294).',
    caught: () => {
      const src = readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'repair-docx', 'index.ts'));
      const block = src.slice(src.indexOf('    const attemptCap = await attemptCapStatus('), src.indexOf("    if (attemptCap === 'over')"));
      const without = src.replace(block, '');
      const bodyLineEnd = without.indexOf('\n', without.indexOf('    const bounded = await readFormDataBounded(')) + 1;
      const mut = without.slice(0, bodyLineEnd) + block + without.slice(bodyLineEnd);
      return mut !== src && repairCostGuardProblems(mut).includes('repair-docx: strop ishoda bez potrosnje nije prije citanja tijela');
    },
    cleanBefore: () => repairCostGuardProblems(readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'repair-docx', 'index.ts'))).length === 0,
  },
  // T84 XFF: IP kljuc iz zadnjeg unosa x-forwarded-for, svi pozivatelji kroz isti pomocnik.
  {
    id: 't84/xff-prvi-unos',
    imitates: 'T84 XFF: kljuc se opet uzima iz PRVOG unosa x-forwarded-for, koji bira klijent, pa svaki izmisljen unos daje nov brojac IP limita.',
    caught: () => {
      const { hashIp, functions } = xffRealSources();
      const mut = hashIp.replace("return hops.at(-1) ?? 'unknown';", "return hops[0] ?? 'unknown';");
      return mut !== hashIp && xffKeyProblems(mut, functions).includes('hash-ip: kljuc nije zadnji unos x-forwarded-for');
    },
    cleanBefore: () => { const { hashIp, functions } = xffRealSources(); return xffKeyProblems(hashIp, functions).length === 0; },
  },
  {
    id: 't84/xff-obrnuti-hopovi',
    imitates: 'T84 XFF: hopovi se obrnu prije at(-1), pa tekst jos sadrzi zadnji unos, a kljuc je opet PRVI (klijentov) unos (Codex XFF-4 na #295).',
    caught: () => {
      const { hashIp } = xffRealSources();
      const mut = hashIp.replace("return hops.at(-1) ?? 'unknown';", "return hops.reverse().at(-1) ?? 'unknown';");
      return mut !== hashIp && xffBehaviourProblems(loadClientIpFromForwarded(mut)).length > 0;
    },
    cleanBefore: () => xffBehaviourProblems(loadClientIpFromForwarded(xffRealSources().hashIp)).length === 0,
  },
  {
    id: 't84/xff-header-velikim-slovima-u-shared',
    imitates: 'T84 XFF: _shared modul cita X-Forwarded-For velikim slovima mimo pomocnika, a skener je gledao samo index.ts i samo mala slova (Codex XFF-2 i XFF-3 na #295).',
    caught: () => {
      const { hashIp, functions } = xffRealSources();
      const extra = { path: 'supabase/functions/_shared/podmetnut.ts', text: 'export const ip = (req: Request) => req.headers.get("X-Forwarded-For");\n' };
      return xffKeyProblems(hashIp, [...functions, extra]).includes('supabase/functions/_shared/podmetnut.ts: x-forwarded-for se cita mimo hashClientIpSalted (1x)');
    },
    cleanBefore: () => { const { hashIp, functions } = xffRealSources(); return xffKeyProblems(hashIp, functions).length === 0; },
  },
  {
    id: 't84/xff-cijeli-header-u-faculty-request',
    imitates: 'T84 XFF: faculty-request opet hashira cijeli x-forwarded-for mimo pomocnika, pa izmisljen prvi unos otvara nov prozor limita.',
    caught: () => {
      const { hashIp, functions } = xffRealSources();
      const from = "hashClientIpSalted(req.headers.get('x-forwarded-for'), IP_HASH_SALT, SERVICE_ROLE)";
      const to = "sha256(IP_HASH_SALT + '|' + (req.headers.get('x-forwarded-for') ?? ''))";
      const mutated = functions.map((f) => (f.path.endsWith('faculty-request/index.ts') ? { ...f, text: f.text.replace(from, to) } : f));
      const changed = mutated.some((f, i) => f.text !== functions[i].text);
      return changed && xffKeyProblems(hashIp, mutated).includes('supabase/functions/faculty-request/index.ts: x-forwarded-for se cita mimo hashClientIpSalted (1x)');
    },
    cleanBefore: () => { const { hashIp, functions } = xffRealSources(); return xffKeyProblems(hashIp, functions).length === 0; },
  },
  ...([
    ['t84/korpus-naslov-bez-granice', 'kljuc ide u corpus_search_many bez gornje granice, pa 60 naslova od 4 000 znakova drzi dijeljenu bazu desetke sekundi po seriji',
      'qs: keys.map(corpusQueryKey),', 'qs: keys,', 'corpus-check: kljuc ide bazi bez gornje granice duljine'],
    ['t84/korpus-granica-povecana', 'granica podignuta na 5000 pa gard koji prihvaca bilo koji broj prolazi, a zastita vise ne djeluje (Codex R2 na #291)',
      'const CORPUS_TITLE_MAX = 400;', 'const CORPUS_TITLE_MAX = 5000;', 'corpus-check: CORPUS_TITLE_MAX je 5000, ocekivano 400'],
    ['t84/korpus-bodovanje-nad-rezanim', 'naslov za bodovanje se reze, pa dug jednak naslov pada s found, a razliciti podnaslovi mogu podici presudu (Codex R1 na #291)',
      "title: typeof r?.title === 'string' ? r.title : null,", "title: typeof r?.title === 'string' ? r.title.slice(0, CORPUS_TITLE_MAX) : null,",
      'corpus-check: naslov za bodovanje je skracen'],
  ] as const).map(([id, imitates, from, to, problem]) => ({
    id,
    imitates: `T84 SC-1: ${imitates}.`,
    caught: () => {
      const src = readTextLf(resolve(process.cwd(), 'supabase', 'functions', '_shared', 'corpus-check.ts'));
      const mut = src.replace(from, to);
      return mut !== src && corpusTitleBoundProblems(mut).includes(problem);
    },
    cleanBefore: () => corpusTitleBoundProblems(readTextLf(resolve(process.cwd(), 'supabase', 'functions', '_shared', 'corpus-check.ts'))).length === 0,
  })),
  // T84 RF-1: nagrada prijatelju (placeni slot) ne smije pripasti anonimnom Auth racunu.
  ...([
    ['t84/friend-nagrada-anonimnom', 'helper izgubi rani izlaz za anonimni racun, pa svaki novi anonimni racun s istim kodom dobije placeni slot',
      'helper', "  if (caller.isAnonymous !== false) return { granted: false, reason: 'ineligible_anonymous' };\n", '',
      'grant-friend-referral-reward: nema ranog izlaza za anonimni racun'],
    ['t84/friend-isanonymous-konstanta', 'generate-report prosljedi konstantu umjesto pozivatelja iz auth.getUser, pa gard nikad ne okine',
      'report', 'friendRewardCaller(user));', '{ isAnonymous: false });',
      'generate-report: pozivatelj ne dolazi iz friendRewardCaller(user) (admin, user.id, workType, { isAnonymous: false })'],
    ['t84/friend-nepoznato-je-pravi-racun', 'nepoznat is_anonymous (undefined ili null) postane pravi racun, pa promijenjen oblik Auth odgovora dodijeli slot (Codex RF-1A)',
      'helper', 'return { isAnonymous: user.is_anonymous !== false };', 'return { isAnonymous: user.is_anonymous === true };',
      'grant-friend-referral-reward: nepoznat is_anonymous se ne tretira kao anonimno'],
  ] as const).map(([id, imitates, which, from, to, problem]) => ({
    id,
    imitates: `T84 RF-1: ${imitates}.`,
    caught: () => {
      const helper = readTextLf(resolve(process.cwd(), 'supabase', 'functions', '_shared', 'grant-friend-referral-reward.ts'));
      const report = readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'generate-report', 'index.ts'));
      const mutHelper = which === 'helper' ? helper.replace(from, to) : helper;
      const mutReport = which === 'report' ? report.replace(from, to) : report;
      return (mutHelper !== helper || mutReport !== report) && friendRewardAnonGuardProblems(mutHelper, mutReport).includes(problem);
    },
    cleanBefore: () => friendRewardAnonGuardProblems(
      readTextLf(resolve(process.cwd(), 'supabase', 'functions', '_shared', 'grant-friend-referral-reward.ts')),
      readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'generate-report', 'index.ts')),
    ).length === 0,
  })),
  {
    id: 't99/osv-novi-nalaz',
    imitates: 'T99: nova ranjivost u Edge ovisnosti (esm.sh) prolazi jer je nitko ne pita; ratchet je mora oboriti i kad broj ne raste.',
    caught: () => {
      const { packages } = collectPackages();
      const results = packages.map((_: unknown, i: number) => (i === 0 ? { vulns: [{ id: 'GHSA-mutacija' }] } : {}));
      return compareOsvToRatchet(findingsFromBatch({ results }, packages), osvRatchet).verdict === 'above';
    },
    cleanBefore: () => {
      const { packages, problems } = collectPackages();
      return problems.length === 0 && compareOsvToRatchet(findingsFromBatch({ results: packages.map(() => ({})) }, packages), osvRatchet).verdict === 'equal';
    },
  },
  {
    id: 't99/osv-lockfile-bez-paketa',
    imitates: 'T99: supabase/functions/deno.lock postane necitljiv ili prazan, pa OSV pita za nula paketa i lazno je zelen.',
    caught: () => collectPackages((f: string) => (f === 'supabase/functions/deno.lock' ? '{"version":"5","remote":{}}' : readTextLf(resolve(process.cwd(), f))))
      .problems.includes('supabase/functions/deno.lock: 0 paketa; necitljiv lockfile ne smije biti zelen'),
    cleanBefore: () => collectPackages().problems.length === 0,
  },
  {
    id: 't99/osv-nepotpun-odgovor',
    imitates: 'T99: OSV vrati manje rezultata od upita ili next_page_token, a skripta to cita kao nula nalaza.',
    caught: () => {
      const { packages } = collectPackages();
      try { findingsFromBatch({ results: packages.slice(1).map(() => ({})) }, packages); return false; } catch { return true; }
    },
    cleanBefore: () => {
      const { packages } = collectPackages();
      return findingsFromBatch({ results: packages.map(() => ({})) }, packages).length === 0;
    },
  },
  {
    id: 't99/osv-nije-u-ci',
    imitates: 'T99: osv-scan job ostane bez mjerenja (samo selftest), pa Edge i Python ostaju neprovjereni a CI zelen.',
    caught: () => {
      const wf = readTextLf(resolve(process.cwd(), '.github', 'workflows', 'security-audit.yml'));
      const mut = wf.replace('          node scripts/osv-query.mjs\n', '');
      return mut !== wf && osvWiringProblems(mut).includes('osv-scan: nema mjerenja OSV ratcheta');
    },
    cleanBefore: () => osvWiringProblems(readTextLf(resolve(process.cwd(), '.github', 'workflows', 'security-audit.yml'))).length === 0,
  },
  ...([
    ['popravak-a/netlify-cli-natrag-u-devdeps', 'netlify-cli se vrati u devDependencies pa 15 high nalaza opet ulazi u graf',
      'packageJson', '"devDependencies": {\n', '"devDependencies": {\n    "netlify-cli": "^27.10.2",\n', 'package.json: netlify-cli je u devDependencies'],
    ['popravak-a/skripta-iz-node-modules', 'release skripta opet trazi netlify u node_modules umjesto pinanog npx',
      'releaseScript', "args: [npxCli(), '--yes', NETLIFY_CLI_PIN, ...args]", "args", 'release skripta: netlify ne ide kroz npx --yes s pinom'],
    ['popravak-a/pin-raspon', 'pin postane raspon (^27) pa npx tiho uzme drugu verziju',
      'releaseScript', "export const NETLIFY_CLI_PIN = 'netlify-cli@27.10.2';", "export const NETLIFY_CLI_PIN = 'netlify-cli@^27';", 'release skripta: pin nije tocna verzija (netlify-cli@^27)'],
    ['popravak-a/dokument-drift', 'dokument objave zadrzi staru verziju dok skripta dobije novu',
      'releaseDoc', 'npx --yes netlify-cli@27.10.2 deploy --prod --dir dist --no-build', 'npx --yes netlify-cli@27.10.1 deploy --prod --dir dist --no-build',
      'RELEASE_PROOF_WORKFLOW.md: nema "npx --yes netlify-cli@27.10.2 deploy --prod --dir dist --no-build"'],
    ['popravak-a/npx-cmd-bez-shella', 'netlify se opet pokrece kao npx.cmd kroz spawnSync bez shella, pa Windows objava pada s EINVAL (Codex F1 na #283)',
      'releaseScript', "return { executable: process.execPath, args: [npxCli(), '--yes', NETLIFY_CLI_PIN, ...args] };",
      "return { executable: platform === 'win32' ? 'npx.cmd' : 'npx', args: [npxCli(), '--yes', NETLIFY_CLI_PIN, ...args] };",
      'release skripta: npx se pokrece s PATH-a ili kao .cmd umjesto kroz process.execPath'],
    ['popravak-a/aktivni-poziv-uz-pin-u-komentaru', 'dokument dobije aktivni nepinani deploy, a pinani ostane u komentaru (Codex F2 na #283)',
      'releaseDoc', 'npx --yes netlify-cli@27.10.2 deploy --prod --dir dist --no-build',
      '<!-- npx --yes netlify-cli@27.10.2 deploy --prod --dir dist --no-build -->\nnpx --yes netlify-cli deploy --prod --dir dist --no-build',
      'RELEASE_PROOF_WORKFLOW.md: nepinani Netlify CLI poziv "npx --yes netlify-cli"'],
    ['popravak-a/npm-skripta-gola-naredba', 'package.json dobije skriptu s golom netlify naredbom iz globalne instalacije (Codex F2 na #283)',
      'packageJson', '"scripts": {\n', '"scripts": {\n    "deploy:netlify": "netlify deploy --prod",\n',
      'package.json scripts.deploy:netlify: gola netlify naredba "netlify deploy"'],
  ] as const).map(([id, imitates, field, from, to, problem]) => ({
    id,
    imitates: `Popravak A: ${imitates}.`,
    caught: () => {
      const src = netlifyPinRealSources();
      const mut = { ...src, [field]: src[field].replace(from, to) };
      return mut[field] !== src[field] && netlifyPinProblems(mut).includes(problem);
    },
    cleanBefore: () => netlifyPinProblems(netlifyPinRealSources()).length === 0,
  })),
  ...([
    ['popravak-a/dinamicni-paket-u-varijabli', 'objava ide kroz varijablu s netlify-cli@latest, pa u pozivu nema doslovnog pina (Codex F2a na #283)',
      '.github/workflows/mutacija.yml', '      - run: |\n          CLI=netlify-cli@latest\n          npx --yes "$CLI" deploy --prod\n',
      '.github/workflows/mutacija.yml: dinamican paket u pozivu "npx --yes "$CLI"'],
    ['popravak-a/yaml-presavijeni-blok', 'YAML presavijeni blok razlomi npx i nepinani paket u dva retka (Codex F2a na #283)',
      '.github/workflows/mutacija.yml', '      - run: >\n          npx --yes\n          netlify-cli deploy --prod\n',
      '.github/workflows/mutacija.yml: nepinani Netlify CLI poziv "npx --yes netlify-cli"'],
    ['popravak-a/akcija-js-nepinano', 'JS kod lokalne akcije objavljuje nepinanim CLI-jem (Codex F2b na #283)',
      '.github/actions/publish/index.js', "execSync('npx --yes netlify-cli deploy --prod');\n",
      '.github/actions/publish/index.js: nepinani Netlify CLI poziv "npx --yes netlify-cli"'],
  ] as const).map(([id, imitates, path, text, problem]) => ({
    id,
    imitates: `Popravak A: ${imitates}.`,
    caught: () => {
      const src = netlifyPinRealSources();
      return netlifyPinProblems({ ...src, files: [...(src.files ?? []), { path, text }] }).includes(problem);
    },
    cleanBefore: () => netlifyPinProblems(netlifyPinRealSources()).length === 0,
  })),
  {
    id: 'popravak-a/workflow-drugi-pin',
    imitates: 'Popravak A: workflow objavljuje kroz npx s drugim pinom, a gard gleda samo release skriptu i dokument (Codex F2 na #283).',
    caught: () => {
      const src = netlifyPinRealSources();
      const files = [...(src.files ?? []), { path: '.github/workflows/mutacija.yml', text: '      - run: npx --yes netlify-cli@27.10.1 deploy --prod\n' }];
      return netlifyPinProblems({ ...src, files }).includes('.github/workflows/mutacija.yml: nepinani Netlify CLI poziv "npx --yes netlify-cli@27.10.1"');
    },
    cleanBefore: () => netlifyPinProblems(netlifyPinRealSources()).length === 0,
  },
  ...([
    ['t99/lockfile-job-if-false', 'job npm-audit dobije if: false pa se gard nikad ne izvrsi (Codex runda 2, F5)',
      '  npm-audit:\n    runs-on: ubuntu-latest\n', '  npm-audit:\n    if: false\n    runs-on: ubuntu-latest\n', 'npm-audit: job ima if ili continue-on-error'],
    ['t99/lockfile-job-continue-on-error', 'job npm-audit dobije continue-on-error pa crveni gard ne blokira (Codex runda 2, F5)',
      '  npm-audit:\n    runs-on: ubuntu-latest\n', '  npm-audit:\n    continue-on-error: true\n    runs-on: ubuntu-latest\n', 'npm-audit: job ima if ili continue-on-error'],
    ['t99/lockfile-korak-if-u-navodnicima', 'korak garda dobije "if": false u navodnicima (Codex runda 2, F5)',
      '      - name: Izvori paketa u lockfileu (selftest pa mjerenje, prije instalacije)\n',
      '      - name: Izvori paketa u lockfileu (selftest pa mjerenje, prije instalacije)\n        "if": false\n', 'npm-audit: korak lockfile-sources.mjs ima uvjet if'],
  ] as const).map(([id, imitates, from, to, problem]) => ({
    id,
    imitates: `T99: ${imitates}.`,
    caught: () => {
      const wf = readTextLf(resolve(process.cwd(), '.github', 'workflows', 'security-audit.yml'));
      const mut = wf.replace(from, to);
      return mut !== wf && lockfileGuardWiringProblems(mut).includes(problem);
    },
    cleanBefore: () =>
      lockfileGuardWiringProblems(readTextLf(resolve(process.cwd(), '.github', 'workflows', 'security-audit.yml'))).length === 0,
  })),
  {
    id: 't99/osv-deno-npm-graf-necitan',
    imitates: 'T99: Edge lock dobije nativni npm graf (npm:lodash), a parser cita samo esm.sh, pa lodash ostaje neprovjeren a job zelen (Codex R1 na #274).',
    caught: () => {
      const lock = JSON.parse(readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'deno.lock')));
      const out = denoLockPackages({ ...lock, npm: { 'lodash@4.17.20': {} } }, 'e');
      return out.packages.some((p: { name: string }) => p.name === 'lodash');
    },
    cleanBefore: () => !denoLockPackages(JSON.parse(readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'deno.lock'))), 'e')
      .packages.some((p: { name: string }) => p.name === 'lodash'),
  },
  {
    id: 't99/osv-deno-jsr-tiho',
    imitates: 'T99: Edge lock dobije JSR graf koji OSV ovdje ne provjerava, a parser ga preskoci (Codex R1 na #274).',
    caught: () => {
      const lock = JSON.parse(readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'deno.lock')));
      return denoLockPackages({ ...lock, jsr: { '@std/path@1.0.0': {} } }, 'e').problems.some((p: string) => p.includes('JSR graf nije podrzan'));
    },
    cleanBefore: () => denoLockPackages(JSON.parse(readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'deno.lock'))), 'e').problems.length === 0,
  },
  {
    id: 't99/osv-specifier-bez-grafa',
    imitates: 'T99: deno.lock dobije npm: specifier bez zapisa u npm grafu (ili jsr:), a parser provjeri samo tip vrijednosti (Codex runda 2 na #274, A1).',
    caught: () => {
      const lock = JSON.parse(readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'deno.lock')));
      return denoLockPackages({ ...lock, specifiers: { 'npm:lodash@4': '4.17.20', 'jsr:@std/path@1': '1.0.0' } }, 'e').problems.length === 2;
    },
    cleanBefore: () => denoLockPackages(JSON.parse(readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'deno.lock'))), 'e').problems.length === 0,
  },
  {
    id: 't99/osv-workspace-nedokazano-izuzece',
    imitates: 'T99: korijenski deno.lock dobije workspace ovisnost koje nema u package-lock.json i nepoznat kljuc, a parser ih izuzme kao da ih pokriva npm audit (Codex runda 2 na #274, A2).',
    caught: () => {
      const lock = JSON.parse(readTextLf(resolve(process.cwd(), 'deno.lock')));
      lock.workspace.packageJson.dependencies = [...lock.workspace.packageJson.dependencies, 'npm:nepostojeci-paket@1.0.0'];
      lock.workspace.packageJson.futureGraph = {};
      return collectPackages((f: string) => (f === 'deno.lock' ? JSON.stringify(lock) : readTextLf(resolve(process.cwd(), f)))).problems.length === 2;
    },
    cleanBefore: () => collectPackages().problems.length === 0,
  },
  {
    id: 't99/osv-jedan-batch-preko-granice',
    imitates: 'T99: graf preraste 1000 paketa i ide kao jedan querybatch zahtjev preko granice API-ja (Codex R4 na #274).',
    // Gadja requestPlan, tj. tocno ona tijela koja queryAllBatches salje (veza dokazana u osv-query.test.ts, Codex R4-M).
    caught: () => requestPlan(Array.from({ length: 1001 }, (_, i) => ({ ecosystem: 'npm', name: `p${i}`, version: '1.0.0' })))
      .every((r: { body: string }) => JSON.parse(r.body).queries.length <= 1000),
    cleanBefore: () => requestPlan([{ ecosystem: 'npm', name: 'a', version: '1.0.0' }]).length === 1,
  },
  ...([
    ['t99/lockfile-job-kljuc-iza-steps', 'npm-audit', '\n  # OSV ZA DENO I PYTHON', '\n    if: false\n  # OSV ZA DENO I PYTHON', 'npm-audit: job ima if ili continue-on-error', lockfileGuardWiringProblems],
    ['t99/osv-job-kljuc-iza-steps', 'osv-scan', '          node scripts/osv-query.mjs\n', '          node scripts/osv-query.mjs\n    continue-on-error: true\n', 'osv-scan: job ima if ili continue-on-error', osvWiringProblems],
  ] as const).map(([id, job, from, to, problem, check]) => ({
    id,
    imitates: `T99: job ${job} dobije kljuc iza steps (if/continue-on-error), a helper gleda samo kljuceve prije steps (Codex R3 na #274).`,
    caught: () => {
      const wf = readTextLf(resolve(process.cwd(), '.github', 'workflows', 'security-audit.yml'));
      const mut = wf.replace(from, to);
      return mut !== wf && check(mut).includes(problem);
    },
    cleanBefore: () => check(readTextLf(resolve(process.cwd(), '.github', 'workflows', 'security-audit.yml'))).length === 0,
  })),
  {
    id: 't99/lockfile-bundle-ciklus',
    imitates: 'T99: dva bundled paketa jedan drugoga trebaju, a nijedan nije dosegljiv od bundleDependencies vlasnika (Codex R2 na #274).',
    caught: () => {
      const lock = bundledLock();
      lock.packages[`${INBUNDLE_PARENT}/node_modules/x`] = { version: '1.0.0', inBundle: true, dependencies: { y: '1' } };
      lock.packages[`${INBUNDLE_PARENT}/node_modules/y`] = { version: '1.0.0', inBundle: true, dependencies: { x: '1' } };
      return lockfileSourceProblems(lock).problems.filter((x: string) => x.includes('nije dosegljiv')).length === 2;
    },
    cleanBefore: () => lockfileSourceProblems(bundledLock()).problems.length === 0,
  },
  {
    id: 't99/lockfile-tranzitivni-bundle-bez-potrebe',
    imitates: 'T99: bundled paket koji nijedan bundled roditelj ne treba prolazi samo zato sto je unutar tudjeg tarballa (Codex runda 2, F2).',
    caught: () => {
      const lock = bundledLock();
      lock.packages[`${INBUNDLE_KEY}/node_modules/podmetnut`] = { version: '1.0.0', inBundle: true };
      return lockfileSourceProblems(lock).problems.some((x: string) => x.startsWith(`${INBUNDLE_KEY}/node_modules/podmetnut:`));
    },
    cleanBefore: () => lockfileSourceProblems(bundledLock()).problems.length === 0,
  },
  {
    id: 't99/lockfile-gard-nije-u-ci',
    imitates: 'T99: skripta postoji, ali je security-audit.yml ne pokrece (ili tek nakon npm audit), pa lockfile injection prolazi CI.',
    caught: () => {
      const wf = readTextLf(resolve(process.cwd(), '.github', 'workflows', 'security-audit.yml'));
      const mut = wf.replace('          node scripts/lockfile-sources.mjs\n', '');
      return mut !== wf && lockfileGuardWiringProblems(mut).includes('npm-audit: nema mjerenja garda izvora');
    },
    cleanBefore: () =>
      lockfileGuardWiringProblems(readTextLf(resolve(process.cwd(), '.github', 'workflows', 'security-audit.yml'))).length === 0,
  },
  {
    id: 'csp/stripe-host-u-form-action',
    imitates:
      'Mehanicka zamjena starog tokena Stripe hostom u form-action: Payment Element ne salje ' +
      'obrazac nikamo, pa bi to bila sira dozvola bez ijednog korisnika (odluka iz kruga 1).',
    caught: () => {
      const mut = builtHeaders().replace(/(form-action 'self' [^\r\n]*)/, '$1 https://js.stripe.com');
      return mut !== builtHeaders() && cspHeaderProblems(mut).some((p) => p.includes('form-action nosi Stripe host'));
    },
    cleanBefore: () => cspHeaderProblems(builtHeaders()).length === 0,
  },
  // F18 KRUG 4 (2026-09-26): Stripeove smjernice traze poddomene js.stripe.com u script-src i
  // frame-src, a Apple Pay i Google Pay trebaju `payment` otvoren za Stripe okvir.
  {
    id: 'csp/stripe-js-poddomene-izbacene-iz-frame-src',
    imitates:
      'Stripe.js okvire po mogucnosti pokrece na poddomenama js.stripe.com (docs.stripe.com/security/guide). ' +
      'Bez `https://*.js.stripe.com` u frame-src preglednik ih blokira, a polje za karticu ostaje prazno ' +
      'samo u pregledniku; Vitest, tsc i build to ne vide.',
    caught: () => {
      const mut = builtHeaders().replace(
        ' frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com;',
        ' frame-src https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com;',
      );
      return mut !== builtHeaders() && cspHeaderProblems(mut).some((p) => p.includes('frame-src ne dopusta https://*.js.stripe.com'));
    },
    cleanBefore: () => cspHeaderProblems(builtHeaders()).length === 0,
  },
  {
    id: 'permissions-policy/payment-zatvoren',
    imitates:
      'Krug 1 do 3 F18: public/_headers je nosio `payment=()` iz audita security-05, pa je Payment ' +
      'Request API bio zabranjen i Stripeovu okviru. Apple Pay i Google Pay (Z36) tiho nestanu, ' +
      'kartica i dalje radi, pa kvar nitko ne primijeti.',
    caught: () => {
      const live = 'payment=(self "https://js.stripe.com" "https://*.js.stripe.com")';
      const mut = builtHeaders().replace(live, 'payment=()');
      return mut !== builtHeaders() && cspHeaderProblems(mut).some((p) => p.includes('payment=() blokira Apple Pay'));
    },
    cleanBefore: () => cspHeaderProblems(builtHeaders()).length === 0,
  },
  {
    id: 'permissions-policy/payment-otvoren-svima',
    imitates:
      'Mehanicko "otvaranje" znacajke zamjenskim znakom: `payment=*` bi Payment Request API dao ' +
      'svakom ugradjenom okviru, a ne samo Stripeovu, sto je upravo ono sto security-05 zatvara.',
    caught: () => {
      const live = 'payment=(self "https://js.stripe.com" "https://*.js.stripe.com")';
      const mut = builtHeaders().replace(live, 'payment=*');
      return mut !== builtHeaders() && cspHeaderProblems(mut).some((p) => p.includes('payment dopusta svako porijeklo'));
    },
    cleanBefore: () => cspHeaderProblems(builtHeaders()).length === 0,
  },
  {
    id: 'permissions-policy/payment-visak-porijekla',
    imitates:
      'Krug 5 F18: netko doda tudje porijeklo pored Stripeovih (npr. kroz kopiraj-zalijepi iz ' +
      'druge konfiguracije) bez uklanjanja `*`. Gard koji samo trazi obvezne clanove to progleda: ' +
      'payment je i dalje siri od namjere, samo skriveno iza validne liste.',
    caught: () => {
      const live = 'payment=(self "https://js.stripe.com" "https://*.js.stripe.com")';
      const mut = builtHeaders().replace(live, 'payment=(self "https://js.stripe.com" "https://*.js.stripe.com" "https://evil.example")');
      return mut !== builtHeaders() && cspHeaderProblems(mut).some((p) => p.includes('payment dopusta neocekivano porijeklo') && p.includes('evil.example'));
    },
    cleanBefore: () => cspHeaderProblems(builtHeaders()).length === 0,
  },
  // GRANICA PRODAJE (F18 krug 3, 2026-09-26). Uklanjanjem uvjeta na `mor_product_id` Katedra
  // passovi (0071: retail, aktivni, s cijenom) postali su kupivi kroz Lektin checkout. Mutacija je
  // STVARNI redak iz migracije 0071 kakav bi create-checkout dobio iz baze; baseline je cijeli
  // Lektin sijani katalog, da granica ne blokira i vlastite proizvode.
  {
    id: 'naplata/katedra-pass-kroz-lektin-checkout',
    imitates:
      'Krug 2 F18: create-checkout je bez 409 product_not_mapped izdao PaymentIntent za ' +
      'katedra_pass_diplomski (129,90 EUR), a webhook bi upisao pravo bez academic_project_id ' +
      'koje Katedrini gardovi ne priznaju i zauzeo unique(provider, order_id) prije Katedre.',
    caught: () => {
      const katedra = seededProducts()
        .filter((s) => s.file === '0071_katedra_pass_products.sql')
        .map((s) => mapProductRow(s.row));
      return (
        katedra.length === 3 &&
        katedra.every((p) => p.active && p.audience === 'retail' && p.morProductId === null) &&
        katedra.every((p) => {
          const r = resolveCheckout(p, { isPartnerActive: true });
          return !r.ok && r.status === 404;
        })
      );
    },
    cleanBefore: () => {
      const own = seededProducts()
        .map((s) => mapProductRow(s.row))
        .filter((p) => isSoldByLektaCheckout(p.id));
      return own.length >= 20 && own.every((p) => resolveCheckout(p, { isPartnerActive: true }).ok);
    },
  },

  // --- Z7 opcija (a): gardovi nad glasovima su OBRNUTI (odluka vlasnika 2026-09-26) ----------
  // Pod opcijom (b) je kvar bila pojava Instrument Serifa i Geist Mona; sada je kvar povratak
  // uklonjenih obitelji, token koji dva glasa ne imenuje, list fontova koji krsi Z31 i preload koji
  // nosi vise od dva reza. Baseline je STVARNI list s diska, mutacija isti tekst izmijenjen u
  // memoriji, a gard je ista cista funkcija koju zove `tests/entry-fonts.test.ts`.
  {
    id: 'z7a/newsreader-vracen-u-token',
    imitates:
      'Opcija (b) vracena kroz jedan token: `--display-serif` opet pocinje Newsreaderom. Bez garda ' +
      'bi to na svakoj ruti promijenilo pismo naslova, a entry-fonts bi i dalje bio zelen dok god ' +
      'neki paket to ime ucitava.',
    caught: () => {
      const css = z7aList('src/shared/design-system.css');
      const mut = css.replace(/--display-serif:\s*"Instrument Serif"/, '--display-serif: "Newsreader Variable"');
      return mut !== css && problemiTokena(mut).length > 0
        && zabranjenaImena([{ ime: 'design-system.css', tekst: mut }]).length > 0;
    },
    cleanBefore: () => {
      const css = z7aList('src/shared/design-system.css');
      return problemiTokena(css).length === 0 && zabranjenaImena([{ ime: 'design-system.css', tekst: css }]).length === 0;
    },
  },
  {
    id: 'z7a/glas-sucelja-vracen-na-sans',
    imitates:
      'Glas sucelja vracen na Inter Tight (stanje prije Z7): gumbi, navigacija i oznake bi opet ' +
      'bili sans, iako README trazi da ih nosi Geist Mono.',
    caught: () => {
      const css = z7aList('src/shared/design-system.css');
      const mut = css.replace(/--ui:\s*var\(--mono\);/, '--ui: "Inter Tight Variable", system-ui, sans-serif;');
      return mut !== css && problemiTokena(mut).some((p) => p.startsWith('--ui'));
    },
    cleanBefore: () => problemiTokena(z7aList('src/shared/design-system.css')).length === 0,
  },
  {
    id: 'z7a/font-paket-uvezen-natrag',
    imitates:
      'Stari uvoz `@fontsource-variable/newsreader` vracen u fonts-core.ts: paket jos postoji u ' +
      'dijeljenom node_modules (F19), pa bi build prosao i tiho vratio treci glas.',
    caught: () => {
      const ts = z7aList('src/shared/fonts-core.ts');
      const mut = `${ts}\nimport '@fontsource-variable/newsreader/opsz.css';\n`;
      return zabranjenaImena([{ ime: 'fonts-core.ts', tekst: mut }]).length > 0;
    },
    cleanBefore: () => zabranjenaImena([{ ime: 'fonts-core.ts', tekst: z7aList('src/shared/fonts-core.ts') }]).length === 0,
  },
  {
    id: 'z7a/preload-kurziva',
    imitates:
      'Kurziv serifa dodan u preload (tako je bilo na grani design/pack2): Z31 dopusta samo serif ' +
      '400 i mono 400, a svaki visak se natjece s LCP-om i na stranici koja kurziv ne crta.',
    caught: () => {
      const cfg = z7aList('vite.config.ts');
      const mut = cfg.replace('/instrument-serif-latin-400-normal/,', '/instrument-serif-latin-400-normal/, /instrument-serif-latin-400-italic/,');
      return mut !== cfg && problemiPreloada(preloadObrasci(mut), z7aDatoteke().names).length > 0;
    },
    cleanBefore: () => problemiPreloada(preloadObrasci(z7aList('vite.config.ts')), z7aDatoteke().names).length === 0,
  },
  {
    id: 'z7a/mrtav-preload-obrazac',
    imitates:
      'Preload obrazac ostao na starom imenu datoteke (newsreader-latin-opsz-normal): ne pogadja ' +
      'nista, pa naslovi opet bljesnu zamjenskim glasom, a build prolazi jer sentinel trazi samo jedan pogodak.',
    caught: () => {
      const cfg = z7aList('vite.config.ts');
      const mut = cfg.replace('/instrument-serif-latin-400-normal/,', '/newsreader-latin-opsz-normal/,');
      return mut !== cfg && problemiPreloada(preloadObrasci(mut), z7aDatoteke().names).some((p) => p.includes('pogadja 0'));
    },
    cleanBefore: () => problemiPreloada(preloadObrasci(z7aList('vite.config.ts')), z7aDatoteke().names).length === 0,
  },
  {
    id: 'z7a/font-display-block',
    imitates:
      '`font-display: block` umjesto swap: tekst je nevidljiv do 3 s na sporoj mrezi, sto Z31 ' +
      'izricito iskljucuje.',
    caught: () => {
      const css = z7aList('src/assets/fonts/fonts.css');
      const mut = css.replace('font-display: swap;', 'font-display: block;');
      return mut !== css && problemiFontova(mut, z7aDatoteke().map).some((p) => p.includes('font-display'));
    },
    cleanBefore: () => problemiFontova(z7aList('src/assets/fonts/fonts.css'), z7aDatoteke().map).length === 0,
  },
  {
    id: 'z7a/size-adjust-bez-preracuna',
    imitates:
      'size-adjust zamjenskog glasa promijenjen bez preracuna override metrika: visina retka ' +
      'zamjene i webfonta se razidje, pa zamjena nakon ucitavanja pomakne raspored (CLS).',
    caught: () => {
      const css = z7aList('src/assets/fonts/fonts.css');
      const mut = css.replace('size-adjust: 77.02%;', 'size-adjust: 90%;');
      return mut !== css && problemiFontova(mut, z7aDatoteke().map).some((p) => p.includes('ascent-override'));
    },
    cleanBefore: () => problemiFontova(z7aList('src/assets/fonts/fonts.css'), z7aDatoteke().map).length === 0,
  },
  {
    id: 'z7a/podskup-izvan-latin',
    imitates:
      'unicode-range prosiren izvan latin + latin-ext (npr. na cirilicu): Z31 trazi samo ta dva ' +
      'podskupa, a pogresan raspon tiho skida krivu datoteku ili ne skida pravu.',
    caught: () => {
      const css = z7aList('src/assets/fonts/fonts.css');
      const mut = css.replace(/unicode-range: U\+0100-02BA[^;]*;/, 'unicode-range: U+0400-045F;');
      return mut !== css && problemiFontova(mut, z7aDatoteke().map).some((p) => p.includes('unicode-range'));
    },
    cleanBefore: () => problemiFontova(z7aList('src/assets/fonts/fonts.css'), z7aDatoteke().map).length === 0,
  },
  {
    id: 'z7a/woff2-bez-font-face',
    imitates:
      'Vendoriran rez bez @font-face (npr. kurziv Geist Mona prekopiran "za svaki slucaj"): ' +
      'datoteka ide u repo i u reviziju, a nijedna stranica je ne crta.',
    caught: () => {
      const { map } = z7aDatoteke();
      const mut = new Map(map);
      mut.set('geist-mono-latin-wght-italic.woff2', map.get('geist-mono-latin-wght-normal.woff2')!);
      return problemiFontova(z7aList('src/assets/fonts/fonts.css'), mut).some((p) => p.includes('bez @font-face'));
    },
    cleanBefore: () => problemiFontova(z7aList('src/assets/fonts/fonts.css'), z7aDatoteke().map).length === 0,
  },
  // --- Z7(a) krug popravka: gardovi nad RUTAMA i nad stablom iz tests/entry-fonts.test.ts ------
  // Pregled je nasao da gornjih devet mutacija pokriva samo tokene, list fontova, preload i
  // zabranjena imena. Ovdje su mutacije za ostale obrnute gardove. Mutacije nad grafom ruta NE
  // zovu cistu funkciju s rucno slozenim popisom: idu kroz ISTI citac grafa (`collectStaticGraph`,
  // `packageImports`) nad stvarnim diskom s jednom datotekom izmijenjenom u memoriji (overlay), pa
  // citac koji npr. preskace `.css` specifikatore rusi mutaciju umjesto da gard tiho oslijepi.
  {
    id: 'z7a/treci-glas-na-ulazu',
    imitates:
      'List ulaza `/` dobije vlastiti @font-face (npr. Newsreader vracen u intake.css "samo za ' +
      'naslov"): ulaz tada skida tri webfonta, a gard nad listom fontova i tokenima ostaje zelen.',
    caught: () => {
      const css = z7aCssGrafa('src/routes/intake/main.ts');
      const mut = [...css, '@font-face{font-family:"Newsreader Variable";src:url(./n.woff2) format("woff2")}'];
      return problemiGlasovaUlaza(z7aList('src/assets/fonts/fonts.css'), mut).some((p) => p.includes('Newsreader Variable'));
    },
    cleanBefore: () => problemiGlasovaUlaza(z7aList('src/assets/fonts/fonts.css'), z7aCssGrafa('src/routes/intake/main.ts')).length === 0,
  },
  {
    id: 'z7a/citac-glasova-ulaza-slijep',
    imitates:
      'Citac webfont obitelji pokvaren tako da vraca prazan skup (npr. regex @font-face vise ne ' +
      'pogadja razmak prije zagrade): "ulaz i list deklariraju isto" bi tada vrijedilo vakuumski.',
    caught: () => problemiGlasovaUlaza(
      z7aList('src/assets/fonts/fonts.css'), z7aCssGrafa('src/routes/intake/main.ts'), () => new Set<string>(),
    ).length > 0,
    cleanBefore: () => problemiGlasovaUlaza(z7aList('src/assets/fonts/fonts.css'), z7aCssGrafa('src/routes/intake/main.ts')).length === 0,
  },
  {
    id: 'z7a/fontsource-css-u-grafu-rute',
    imitates:
      '`import \'@fontsource/instrument-serif/400.css\'` vracen u fonts-core.ts: paket postoji u ' +
      'dijeljenom node_modules, build prolazi, a zabranjena imena ga ne vide jer instrument-serif ' +
      'nije uklonjena obitelj. Hvata ga samo gard nad paketnim uvozima, i samo ako citac grafa vidi .css.',
    caught: () => {
      const izvor = z7aOverlay({ 'src/shared/fonts-core.ts': (t) => `${t}\nimport '@fontsource/instrument-serif/400.css';\n` });
      const problemi = z7aProblemiGrafa(izvor);
      const svaki = SVI_ULAZI.every((u) => problemi.some((p) => p.startsWith(`${u}:`) && p.includes('@fontsource/instrument-serif/400.css')));
      const imenaSlijepa = zabranjenaImena([{ ime: 'fonts-core.ts', tekst: izvor.procitaj(z7aPut('src/shared/fonts-core.ts')) }]).length === 0;
      return svaki && imenaSlijepa;
    },
    cleanBefore: () => z7aProblemiGrafa(DISK).length === 0,
  },
  {
    id: 'z7a/ukinut-modul-glasova-vracen',
    imitates:
      'Zaseban modul podatkovnih glasova (src/shared/fonts-document.ts, ukinut u Z7) vracen i uvezen ' +
      'u /rad/: ruta opet nosi vlastiti skup fontova mimo fonts-core.ts.',
    caught: () => {
      const izvor = z7aOverlay({
        'src/shared/fonts-document.ts': () => "import '../assets/fonts/fonts.css';\n",
        'src/routes/workspace/main.ts': (t) => `import '../../shared/fonts-document';\n${t}`,
      });
      return z7aProblemiGrafa(izvor).some((p) => p.startsWith('src/routes/workspace/main.ts:') && p.includes('fonts-document.ts'));
    },
    cleanBefore: () => z7aProblemiGrafa(DISK).length === 0,
  },
  {
    id: 'z7a/ruta-bez-fonts-core',
    imitates:
      'Demo ulaz izgubi `import \'../shared/fonts-core\'` pri refaktoru (demo ne ide kroz ui-boot): ' +
      'stranica crta metricke zamjenske glasove umjesto Instrument Serifa i Geist Mona.',
    caught: () => {
      const izvor = z7aOverlay({ 'src/demo/main.ts': (t) => t.replace(/^import '\.\.\/shared\/fonts-core';[^\n]*\n/m, '') });
      const mutiran = izvor.procitaj(z7aPut('src/demo/main.ts')) !== DISK.procitaj(z7aPut('src/demo/main.ts'));
      return mutiran && z7aProblemiGrafa(izvor).some((p) => p === 'src/demo/main.ts: graf ne sadrzi src/shared/fonts-core.ts');
    },
    cleanBefore: () => z7aProblemiGrafa(DISK).length === 0,
  },
  {
    id: 'z7a/ruta-bez-glasova',
    imitates:
      'Isti kvar kao gore, mjeren gardom "SVE rute nose ISTE dvije obitelji": demo bez fonts-core ' +
      'ucitava nula webfontova, a ostale rute dva. Gard mora imenovati bas tu rutu.',
    caught: () => {
      const izvor = z7aOverlay({ 'src/demo/main.ts': (t) => t.replace(/^import '\.\.\/shared\/fonts-core';[^\n]*\n/m, '') });
      const problemi = problemiRuta(new Map(SVI_ULAZI.map((u) => [u, z7aCssGrafa(u, izvor)] as const)));
      return problemi.length === 1 && problemi[0].startsWith('src/demo/main.ts:');
    },
    cleanBefore: () => problemiRuta(new Map(SVI_ULAZI.map((u) => [u, z7aCssGrafa(u)] as const))).length === 0,
  },
  {
    id: 'z7a/treci-glas-na-ruti',
    imitates:
      'Admin list dobije vlastiti webfont (npr. "Inter Variable" za tablice): jedna ruta tada nosi ' +
      'tri obitelji, a gard samo nad ulazom `/` to ne vidi.',
    caught: () => {
      const izvor = z7aOverlay({
        'src/admin/admin-dashboard.css': (t) => `${t}\n@font-face{font-family:"Inter Variable";src:url(./i.woff2) format("woff2")}\n`,
      });
      const problemi = problemiRuta(new Map(SVI_ULAZI.map((u) => [u, z7aCssGrafa(u, izvor)] as const)));
      return problemi.some((p) => p.startsWith('src/admin/admin-dashboard-boot.ts:') && p.includes('Inter Variable'));
    },
    cleanBefore: () => problemiRuta(new Map(SVI_ULAZI.map((u) => [u, z7aCssGrafa(u)] as const))).length === 0,
  },
  {
    id: 'z7a/webfont-u-drugom-listu',
    imitates:
      'site-chrome.css dobije @font-face s url(): drugi izvor webfontova mimo fonts.css, koji Z31 ' +
      'proracun (<= 120 KB po ruti) i preload ne vide.',
    caught: () => {
      const listovi = z7aSviListovi().map((l) => (l.ime === 'src/shared/site-chrome.css'
        ? { ...l, css: `${l.css}\n@font-face{font-family:"Geist Mono";src:url(./g.woff2) format("woff2")}` }
        : l));
      return listoviSWebfontom(listovi, 'src/assets/fonts/fonts.css').some((p) => p.startsWith('src/shared/site-chrome.css:'));
    },
    cleanBefore: () => listoviSWebfontom(z7aSviListovi(), 'src/assets/fonts/fonts.css').length === 0,
  },
  {
    id: 'z7a/citac-webfontova-slijep',
    imitates:
      'Citac webfontova vraca prazan skup za svaki list: "nijedan drugi list ne ucitava webfont" bi ' +
      'prosao vakuumski, jer je stari sentinel provjeravao samo da je fonts.css medju listovima.',
    caught: () => listoviSWebfontom(z7aSviListovi(), 'src/assets/fonts/fonts.css', () => new Set<string>())
      .some((p) => p.includes('vakuumski')),
    cleanBefore: () => listoviSWebfontom(z7aSviListovi(), 'src/assets/fonts/fonts.css').length === 0,
  },
  {
    id: 'z7a/font-paket-u-package-json',
    imitates:
      '`npm install @fontsource/instrument-serif` u dijeljenom stablu: paket ulazi u package.json i ' +
      'dijeljeni node_modules, iako su fontovi vendorirani (F19).',
    caught: () => {
      const pkg = z7aPaket();
      const dependencies = { ...(pkg.dependencies as Record<string, string>), '@fontsource/instrument-serif': '^5.3.0' };
      return problemiOvisnosti({ ...pkg, dependencies }).some((p) => p.startsWith('@fontsource/instrument-serif'));
    },
    cleanBefore: () => problemiOvisnosti(z7aPaket()).length === 0,
  },
  {
    id: 'z7a/package-json-procitan-prazan',
    imitates:
      'Gard cita krivo polje (npr. `pkg.dependencies` umjesto cijelog package.json): nula procitanih ' +
      'ovisnosti bi "potvrdila" da font paketa nema.',
    caught: () => problemiOvisnosti(z7aPaket().dependencies).length > 0 && problemiOvisnosti({}).length > 0,
    cleanBefore: () => problemiOvisnosti(z7aPaket()).length === 0,
  },
  {
    id: 'z7a/licenca-izostavljena',
    imitates:
      'Vendoriran rez kopiran bez OFL datoteke (OFL 1.1 trazi da licenca putuje uz font): repo ' +
      'tada distribuira Geist Mono bez licence.',
    caught: () => {
      const mapa = new Map(z7aLicence());
      mapa.delete('OFL-geist-mono.txt');
      return problemiLicenci(mapa).some((p) => p.startsWith('OFL-geist-mono.txt'));
    },
    cleanBefore: () => problemiLicenci(z7aLicence()).length === 0,
  },
  // --- Z7(a) popravak: gardovi kaskade iz `tests/design-tokens.test.ts` i samostalnih stranica ---
  // Model kaskade je preseljen u `tests/helpers/font-voices.ts` upravo zato da ove mutacije zovu
  // ISTU funkciju kao gard. Baseline je stvarni skup listova (i stvarne stranice), mutacija isti
  // tekst izmijenjen u memoriji.
  {
    id: 'z7a/tezina-iznad-400-na-serifu',
    imitates:
      'Opisna kartica dobije `font-weight:600` na odlomku koji govori serifom (`.check-card p`): ' +
      'Instrument Serif rez 600 nema, a uz font-synthesis: none zahtjev se tiho ignorira.',
    caught: () => tezineIznad400(z7aListoviSrc({ 'src/shared/page-app.css': (t) => `${t}\n.check-card p{font-weight:600}\n` }))
      .some((p) => p.includes('.check-card p -> 600')),
    cleanBefore: () => tezineIznad400(z7aListoviSrc()).length === 0,
  },
  {
    id: 'z7a/serifni-kontejner-bez-naglaska',
    imitates:
      'Tocan oblik s `.pcard-path` (2026-09-20): nov serifni kontejner bez para --emph-weight/--emph-style, ' +
      'pa `<strong>` u njemu dobiva globalnih 600 u pismu koje taj rez nema.',
    caught: () => naglasakUSerifu(z7aListoviSrc({ 'src/shared/page-app.css': (t) => `${t}\n.z7-mut-put{font-family:var(--display-serif)}\n` }))
      .some((p) => p.includes('.z7-mut-put strong')),
    cleanBefore: () => naglasakUSerifu(z7aListoviSrc()).length === 0,
  },
  {
    id: 'z7a/mono-u-serifu-bez-para',
    imitates:
      'Mono cip unutar serifnog odlomka (`.ks-tvrdnja p .cip`) ne vraca par naglaska, pa njegov ' +
      '`<strong>` nasljedjuje kurziv u Geist Monu, koji se ucitava samo uspravno.',
    caught: () => monoUSerifnomNaglasku(z7aListoviSrc({ 'src/shared/page-app.css': (t) => `${t}\n.ks-tvrdnja p .z7-cip{font-family:var(--mono)}\n` }))
      .some((p) => p.includes('.z7-cip')),
    cleanBefore: () => monoUSerifnomNaglasku(z7aListoviSrc()).length === 0,
  },
  {
    id: 'z7a/svijet-bez-font-synthesis',
    imitates:
      'Admin list izgubi `font-synthesis:none` na body-ju (admin ne uvozi design-system.css): ' +
      'preglednik tada razvuce rez 400 u lazni bold na serifnom tijelu nadzorne ploce.',
    caught: () => {
      const mut = z7aListoviSrc({ 'src/admin/admin-dashboard.css': (t) => t.replace(/font-synthesis:\s*none;?/g, '') });
      const izmijenjen = mut.find((l) => l.ime === 'src/admin/admin-dashboard.css')?.css !== z7aList('src/admin/admin-dashboard.css');
      return izmijenjen && svjetoviBezSinteze(mut).includes('admin');
    },
    cleanBefore: () => svjetoviBezSinteze(z7aListoviSrc()).length === 0,
  },
  {
    id: 'z7a/body-ljuske-na-serifu',
    imitates:
      'Ljuska aplikacije vrati serif na `body` (kvar od 2026-09-20): svaki cip, status i oznaka bez ' +
      'vlastite obitelji tiho prelazi na Instrument Serif.',
    caught: () => uiNaSerifu(z7aListoviSrc({ 'src/shared/page-chrome.css': (t) => t.replace('font:16px/1.6 var(--ui)', 'font:16px/1.6 var(--display-serif)') }))
      .length > 5,
    cleanBefore: () => uiNaSerifu(z7aListoviSrc()).length === 0,
  },
  {
    id: 'z7a/proza-bez-pravila',
    imitates:
      'Nalaz pregleda Z7(a): bez pravila za gole `p`/`dd` u design-system.css odgovor u listi cinjenica ' +
      'alata (i ogledni odlomci na citat.html) nasljedjuju mono s body-ja.',
    caught: () => {
      const izvor = z7aOverlay({ 'src/shared/design-system.css': (t) => t.replace(/p:where\(:not\(\[class\]\)\),\s*dd:where\(:not\(\[class\]\)\),\s*blockquote:where\(:not\(\[class\]\)\)/, '.z7-ugaseno') });
      return z7aProblemiProze('kartice.html', izvor).some((p) => p.startsWith('dd '));
    },
    cleanBefore: () => z7aProblemiProze('kartice.html').length === 0,
  },
  {
    id: 'z7a/opis-cinjenice-u-monu',
    imitates:
      'Inline stil alata vrati mono na opis u listi cinjenica (`.fact-list dd`), pravilom s klasom koje ' +
      'nadjacava golo serifno pravilo po specificnosti, pa visereceni opis opet govori monom.',
    caught: () => {
      const izvor = z7aOverlay({ 'kartice.html': (t) => t.replace('</style>', '.fact-list dd{font-family:var(--mono)}</style>') });
      return z7aProblemiProze('kartice.html', izvor).some((p) => p.startsWith('dd ') && p.includes('.fact-list dd'));
    },
    cleanBefore: () => z7aProblemiProze('kartice.html').length === 0,
  },
  {
    id: 'z7a/georgia-u-pitanju-faq',
    imitates:
      'Nalaz pregleda Z7(a): `.faq summary{font-family:var(--ink-serif);font-weight:700}` u literatura.html, ' +
      'dakle Georgia bold u sucelju umjesto serifa proizvoda.',
    caught: () => georgiaUSucelju(z7aListoviGeorgije({ 'literatura.html': (t) => t.replace('</style>', '.faq summary{font-family:var(--ink-serif);font-weight:700}</style>') }), DOPUSTENA_GEORGIA)
      .some((p) => p.startsWith('literatura.html: .faq summary')),
    cleanBefore: () => georgiaUSucelju(z7aListoviGeorgije(), DOPUSTENA_GEORGIA).length === 0,
  },
  {
    id: 'z7a/georgia-dopusteni-nestao',
    imitates:
      'Faksimil naslovnice prijede na glas proizvoda (ili se `#tp-sheet` preimenuje): popis dopustenih ' +
      'tada imenuje selektor koji Georgiju vise ne nosi i gard ne smije ostati tiho zelen.',
    caught: () => georgiaUSucelju(z7aListoviGeorgije({ 'naslovnica.html': (t) => t.replace(/(#tp-sheet\{[^}]*?)font-family:var\(--ink-serif\)/, '$1font-family:var(--display-serif)') }), DOPUSTENA_GEORGIA)
      .some((p) => p.includes('#tp-sheet je dopusten')),
    cleanBefore: () => georgiaUSucelju(z7aListoviGeorgije(), DOPUSTENA_GEORGIA).length === 0,
  },
  {
    id: 'z7a/pravne-stranice-prazan-pogodak',
    imitates:
      'Vite promijeni obrazac imena asseta (hash ispred imena): obrasci generatora ne pogadjaju nista, ' +
      'a stari generator je tada tiho pisao pravne stranice bez ijednog glasa proizvoda.',
    caught: () => webfontFaces(z7aDatoteke().names.filter((n) => n.endsWith('.woff2')).map((n) => `Ab12Cd34-${n}`)).problemi.length === 4,
    cleanBefore: () => webfontFaces(z7aDatoteke().names.filter((n) => n.endsWith('.woff2')).map((n) => n.replace(/\.woff2$/, '-Ab12Cd34.woff2'))).problemi.length === 0,
  },
  {
    id: 'z7a/404-bez-oznake-webfontova',
    imitates:
      'Netko prepise public/404.html i izgubi oznaku za webfontove: generator bi bez provjere tiho ' +
      'ostavio 404 na sistemskim glasovima.',
    caught: () => ubaciU404(z7aList('public/404.html').replace(OZNAKA_404, ''), '@font-face{}').problemi.length === 1,
    cleanBefore: () => ubaciU404(z7aList('public/404.html'), '@font-face{}').problemi.length === 0,
  },
  {
    id: 'z7a/404-drugi-prolaz-nije-no-op',
    imitates:
      'Umetak webfontova u 404 potrosi oznaku (stanje prije ovog popravka): drugi prolaz generatora nad ' +
      'istim dist/ (izmjena pravnog teksta bez novog builda) pada s izlazom 1 iako je 404 vec ispravan.',
    caught: () => problemiDvaProlaza404(
      (html, ff) => (html.split(OZNAKA_404).length === 2 ? { html: html.replace(OZNAKA_404, () => ff), problemi: [] } : { html, problemi: ['bez oznake'] }),
      z7aList('public/404.html'), '@font-face{src:url("/assets/a-1.woff2")}', '@font-face{src:url("/assets/a-2.woff2")}',
    ).some((p) => p.startsWith('drugi prolaz s istim blokovima')),
    cleanBefore: () => problemiDvaProlaza404(
      ubaciU404, z7aList('public/404.html'), '@font-face{src:url("/assets/a-1.woff2")}', '@font-face{src:url("/assets/a-2.woff2")}',
    ).length === 0,
  },

  // --- naplata: tajne (blokeri lansiranja 2026-09-22 na masteru, preneseno na Stripe 2026-09-26) ---
  {
    id: 'naplata/prazna-tajna-potpisa',
    imitates: 'Stripe ekvivalent masterova naplata/prazan-store-id: Supabase secret STRIPE_WEBHOOK_SECRET postavljen na prazno (sam razmak). Sucelje ga prikazuje kao postojeci, a verifyStripeSignature svaki dogadjaj odbija s missing_secret, pa nijedna kupnja ne dobije pravo pristupa',
    caught: () =>
      naplataSecretsVerdict({ STRIPE_SECRET_KEY: 'sk', STRIPE_PUBLISHABLE_KEY: 'pk', STRIPE_WEBHOOK_SECRET: '  ' })
        .missing.includes('STRIPE_WEBHOOK_SECRET'),
    cleanBefore: () =>
      naplataSecretsVerdict({ STRIPE_SECRET_KEY: 'sk', STRIPE_PUBLISHABLE_KEY: 'pk', STRIPE_WEBHOOK_SECRET: 'whsec' }).ok,
  },
  {
    id: 'naplata/ime-tajne-koje-nitko-ne-postavlja',
    imitates: 'Stripe ekvivalent masterova naplata/dva-imena-iste-tajne: webhook-mor cita ime tajne potpisa koje runbook i preflight ne imenuju (staro MOR_WEBHOOK_SECRET). Operater postavi STRIPE_WEBHOOK_SECRET, preflight je zelen, a webhook cita praznu tajnu i odbija svaki dogadjaj',
    caught: () => {
      const dir = resolve(process.cwd(), 'supabase', 'functions');
      const webhook = readTextLf(join(dir, 'webhook-mor', 'index.ts'));
      const checkout = readTextLf(join(dir, 'create-checkout', 'index.ts'));
      // MUTACIJA u memoriji: vrati staro ime u webhook-mor, disk se ne dira.
      const mutated = webhook.replace("Deno.env.get('STRIPE_WEBHOOK_SECRET')", "Deno.env.get('MOR_WEBHOOK_SECRET')");
      if (mutated === webhook) return false; // nema sto mutirati: gard bi prolazio vakuumski
      return stripeSecretNameProblems({ 'webhook-mor': mutated, 'create-checkout': checkout })
        .some((p) => p.includes('MOR_WEBHOOK_SECRET'));
    },
    cleanBefore: () => {
      const dir = resolve(process.cwd(), 'supabase', 'functions');
      return stripeSecretNameProblems({
        'webhook-mor': readTextLf(join(dir, 'webhook-mor', 'index.ts')),
        'create-checkout': readTextLf(join(dir, 'create-checkout', 'index.ts')),
      }).length === 0;
    },
  },

  // --- naplata: webhook ne smije sam odlucivati sto je placeno ---------------------------------
  {
    id: 'naplata/webhook-400-bez-user-id',
    imitates: 'stanje handlera na masteru do 2026-09-22: `if (!ev.orderId || !ev.userId) return 400` PRIJE upisa u inbox, pa bi placena kupnja bez user_id u metadati nestala bez traga iako je novac naplacen',
    caught: () => {
      const src = webhookMorSource();
      // MUTACIJA u memoriji: umetni tocan uvjet koji je stajao u izvoru, ispred otvaranja baze.
      const mutated = src.replace(
        'const admin = deps.admin();',
        "if (!ev.orderId || !ev.userId) return json({ error: 'bad_request' }, 400);\n  const admin = deps.admin();",
      );
      if (mutated === src) return false; // nema sto mutirati: gard bi prolazio vakuumski
      return webhookHandlerProblems(mutated).some((p) => p.includes('user_id'));
    },
    cleanBefore: () => {
      const src = webhookMorSource();
      return src.length > 2000 && webhookHandlerProblems(src).length === 0;
    },
  },
  {
    id: 'naplata/webhook-bez-klasifikatora',
    imitates: 'odluka sto je placeno vracena u Edge funkciju: handler prestane zvati classifyStripeEvent, pa payment_intent.succeeded bez potvrdjene naplate (status processing, amount_received 0) opet padne u kupovnu granu',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src.split('classifyStripeEvent(ev)').join("({ kind: 'paid' } as const)");
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes('classifyStripeEvent'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/placeno-po-imenu-dogadjaja',
    imitates: 'Stripe ekvivalent masterova 31b802ad (obradi samo placenu narudzbu): klasifikator koji payment_intent.succeeded proglasi placenim po IMENU, bez gledanja na status i amount_received, pa dogadjaj sa statusom processing ili s nula naplacenih centi dobije puno pravo pristupa',
    caught: () => {
      // MUTACIJA: zamijeni ODLUKU verzijom koja gleda samo ime (funkcija, ne tekst izvora).
      const poImenu = (ev: { eventName: string; status: string; amountReceivedCents: number | null; refunded: boolean }) => {
        if (ev.eventName === 'charge.refunded') return { kind: 'refund' };
        if (ev.eventName === 'payment_intent.succeeded') return { kind: 'paid' };
        return { kind: 'ignored', reason: `nepodrzan_dogadjaj:${ev.eventName}` };
      };
      return paidClassificationProblems(poImenu).some((p) => p.includes('processing'))
        && paidClassificationProblems(poImenu).some((p) => p.includes('amount_received 0'));
    },
    cleanBefore: () => paidClassificationProblems(classifyStripeEvent).length === 0,
  },

  {
    id: 'naplata/preflight-mjeri-ljusku',
    imitates: 'prva verzija preflighta na masteru (2026-09-22): citao je process.env, dakle ljusku operatera, a tajne koje webhook-mor koristi zive u Supabase Edge Functions Secretsima. Izvezena varijabla u terminalu davala je zeleno iako je tajna u projektu prazna',
    caught: () => {
      const src = readTextLf(resolve(process.cwd(), 'scripts', 'verify-naplata-secrets.mjs'));
      // MUTACIJA u memoriji: vrati zadani put na citanje ljuske. Disk se ne dira.
      const mutated = src.replace('const read = readSupabaseSecrets(projectRef);', 'const read = { ok: true, rows: process.env };');
      if (mutated === src) return false; // nema sto mutirati: gard bi prolazio vakuumski
      return preflightSourceProblems(mutated).some((p) => p.includes('process.env'));
    },
    cleanBefore: () => {
      const src = readTextLf(resolve(process.cwd(), 'scripts', 'verify-naplata-secrets.mjs'));
      return src.length > 2000 && preflightSourceProblems(src).length === 0;
    },
  },
  {
    id: 'naplata/supabase-secret-postavljen-na-prazno',
    imitates: 'tajna postavljena na PRAZNO u Supabase sucelju: u popisu postoji, izgleda konfigurirano, a verifyStripeSignature je vidi isto kao da je nema i odbija svaki dogadjaj s missing_secret',
    caught: () => {
      const popis = parseSupabaseSecretsList(
        [
          '  STRIPE_SECRET_KEY | 11aa',
          '  STRIPE_PUBLISHABLE_KEY | 22bb',
          `  STRIPE_WEBHOOK_SECRET | ${EMPTY_VALUE_DIGEST}`,
        ].join('\n'),
      );
      if (popis.length !== 3) return false; // parser nije procitao popis: baseline bi bio vakuum
      return supabaseSecretsVerdict(popis).missing.some(
        (m: { name: string; reason: string }) => m.name === 'STRIPE_WEBHOOK_SECRET' && m.reason === 'prazna',
      );
    },
    cleanBefore: () =>
      supabaseSecretsVerdict(
        parseSupabaseSecretsList(
          ['  STRIPE_SECRET_KEY | 11aa', '  STRIPE_PUBLISHABLE_KEY | 22bb', '  STRIPE_WEBHOOK_SECRET | 33cc'].join('\n'),
        ),
      ).ok,
  },
  {
    id: 'naplata/testni-nacin-u-okolini-deploya',
    imitates: 'deploy naplate sa STRIPE_ALLOW_TEST_MODE=1 u projektu: testni Stripe dogadjaj s ispravnim potpisom dobije PRAVO pravo pristupa (audit PAY-05), a preflight koji gleda samo obavezne tajne to pusti kao zeleno',
    caught: () => {
      const src = readTextLf(resolve(process.cwd(), 'scripts', 'verify-naplata-secrets.mjs'));
      // MUTACIJA u memoriji: ugasi provjeru testnog nacina u CLI bloku. Disk se ne dira.
      const mutated = src.replace('if (testModeVerdict(read.rows) &&', 'if (false &&');
      if (mutated === src) return false; // nema sto mutirati: gard bi prolazio vakuumski
      // Presuda sama mora vidjeti zastavicu, inace bi CLI provjera bila kozmeticka.
      return preflightSourceProblems(mutated).some((p) => p.includes('testni nacin'))
        && testModeVerdict([{ name: TEST_MODE_SECRET, digest: TEST_MODE_ON_DIGEST }]);
    },
    cleanBefore: () => {
      const src = readTextLf(resolve(process.cwd(), 'scripts', 'verify-naplata-secrets.mjs'));
      return preflightSourceProblems(src).length === 0
        && !testModeVerdict([{ name: TEST_MODE_SECRET, digest: EMPTY_VALUE_DIGEST }])
        && !testModeVerdict([]);
    },
  },
  {
    id: 'naplata/povrat-po-zastavici-umjesto-po-imenu',
    imitates: 'Stripe ekvivalent masterova daf5f53a: refund grana otvorena po zastavici ev.refunded, koju parseStripeEvent racuna i iz data.object.refunded bez obzira na ime dogadjaja. Grana pise update entitlements ... where order_id = ev.orderId i povlaci referral nagrade, pa bi dogadjaj koji nije charge.refunded ugasio pravo po kljucu koji nije PaymentIntent povrata',
    caught: () => {
      // MUTACIJA: zamijeni ODLUKU sirom verzijom (funkcija, ne tekst izvora).
      const siroko = (ev: { eventName: string; status: string; amountReceivedCents: number | null; refunded: boolean }) => {
        if (ev.refunded || ev.eventName === 'charge.refunded') return { kind: 'refund' };
        if (ev.eventName === 'payment_intent.succeeded') return { kind: 'paid' };
        return { kind: 'ignored', reason: 'nepodrzan_dogadjaj:x' };
      };
      return refundClassificationProblems(siroko, NOTABLE_IGNORE_PREFIXES)
        .some((p) => p.includes('charge.updated'));
    },
    cleanBefore: () => refundClassificationProblems(classifyStripeEvent, NOTABLE_IGNORE_PREFIXES).length === 0,
  },
  {
    id: 'naplata/povrat-pod-drugim-imenom-tiho-odbacen',
    imitates: 'druga krajnost istog izbora: vracen novac pod imenom koje nije charge.refunded zavrsi kao obican nepodrzan_dogadjaj, dakle WARN u logu i redak koji nitko ne gleda, pa nitko ne sazna da je povrat stigao i nije obradjen',
    caught: () => {
      const tiho = (ev: { eventName: string; status: string; amountReceivedCents: number | null; refunded: boolean }) => {
        if (ev.eventName === 'charge.refunded') return { kind: 'refund' };
        if (ev.eventName === 'payment_intent.succeeded') return { kind: 'paid' };
        return { kind: 'ignored', reason: `nepodrzan_dogadjaj:${ev.eventName}` };
      };
      return refundClassificationProblems(tiho, NOTABLE_IGNORE_PREFIXES).some((p) => p.includes('TIHO'));
    },
    cleanBefore: () => refundClassificationProblems(classifyStripeEvent, NOTABLE_IGNORE_PREFIXES).length === 0,
  },
  {
    id: 'naplata/refund-grana-po-zastavici-u-handleru',
    imitates: 'isti kvar u IZVORU handlera: klasifikator je ispravan, ali handler refund granu opet otvara s if (ev.refunded) umjesto po odluci decision.kind === refund',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src.replace("if (decision.kind === 'refund') {", 'if (ev.refunded) {');
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes('ev.refunded'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },

  {
    id: 'naplata/ignored-grana-bez-loga',
    imitates: 'grana ignored bez ijednog log retka: odluka pociva na obliku Stripe objekta (status, amount_received), pa bi njegova promjena pretvorila SVAKU kupnju u 200 bez retryja, a jedini trag bio bi redak u webhook_events koji ne pokriva ni djelomicni indeks webhook_events_unresolved',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src
        .replace("if (isNotableIgnore(decision)) console.error('webhook-mor ignored_needs_attention', detalji);", '')
        .replace("else console.warn('webhook-mor ignored_foreign_event', detalji);", '');
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes("grana 'ignored' nema log retka"));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  // Krug 2 spajanja (2026-09-26): gate vise ne odbija vrstu (`event_ignored` je uklonjen), pa
  // stavka `naplata/event-ignored-na-info-razini` nema sto mjeriti. Njezinu zastitu (pretplacen
  // visak nije tih) sada nose `naplata/ignored-grana-bez-loga` i izvrseni handler; zastitu
  // odbijenog porijekla nosi stavka ispod.
  {
    id: 'naplata/odbijeno-porijeklo-na-warn-razini',
    imitates: 'testni dogadjaj ili tudji Connect racun (event_refused) spusten s ERROR na WARN: kriva konfiguracija u produkciji (STRIPE_ALLOW_TEST_MODE, webhook endpoint za povezane racune) ili pokusaj s ukradenom tajnom utone u isti kanal kao pretplaceni visak',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src.replace("console.error('webhook-mor event_refused'", "console.warn('webhook-mor event_refused'");
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes('event_refused'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/gate-filtrira-vrstu-prije-klasifikatora',
    imitates: 'stanje pack3 nakon kruga 1 spajanja: acceptEvent je vrste izvan STRIPE_HANDLED_EVENTS odbijao kao event_ignored PRIJE klasifikatora, pa povrat pod imenom refund.created ili charge.refund.updated nikad nije postao povrat_bez_charge_refunded (ERROR), nego WARN sum, a entitlement je ostao paid. Test klasifikatora bio je zelen vakuumski',
    caught: () => {
      // MUTACIJA: gate koji uz porijeklo opet filtrira i vrstu (funkcija, ne tekst izvora).
      const stariGate = (
        ev: { livemode: boolean | null; accountId: string; eventName: string },
        opts: { allowTestMode: boolean },
      ) => {
        const origin = acceptEvent(ev, opts);
        if (!origin.ok) return origin;
        return { ok: (STRIPE_HANDLED_EVENTS as readonly string[]).includes(ev.eventName) };
      };
      return refundReachabilityProblems(parseStripeEvent, stariGate, classifyStripeEvent, NOTABLE_IGNORE_PREFIXES)
        .some((p) => p.includes('gate odbija refund.created'));
    },
    cleanBefore: () =>
      refundReachabilityProblems(parseStripeEvent, acceptEvent, classifyStripeEvent, NOTABLE_IGNORE_PREFIXES).length === 0,
  },
  {
    id: 'naplata/refund-objekt-nevidljiv-parseru',
    imitates: 'parser koji vracen novac prepoznaje samo po data.object.refunded: Stripe Refund objekt (refund.created, charge.refund.updated) to polje nema, pa bi povrat pod drugim imenom bio nepodrzan_dogadjaj (WARN), ne povrat_bez_charge_refunded (ERROR)',
    caught: () => {
      const slijepiParser = (p: Parameters<typeof parseStripeEvent>[0]) => ({
        ...parseStripeEvent(p),
        refunded: p.type === 'charge.refunded' || p.data?.object?.refunded === true,
      });
      return refundReachabilityProblems(slijepiParser, acceptEvent, classifyStripeEvent, NOTABLE_IGNORE_PREFIXES)
        .some((p) => p.includes('parser ne vidi vracen novac u refund.created'));
    },
    cleanBefore: () =>
      refundReachabilityProblems(parseStripeEvent, acceptEvent, classifyStripeEvent, NOTABLE_IGNORE_PREFIXES).length === 0,
  },
  {
    id: 'naplata/placena-uplata-bez-korisnika-utopljena',
    imitates: 'Stripe ekvivalent masterova needs_manual_link (31b802ad, 81a89f2f), stanje pack3 nakon kruga 1: potvrdjena naplata (status succeeded, amount_received > 0) bez metadata[user_id] klasificirana kao ignored/missing_user_metadata, dakle WARN uz konfiguracijski sum. Novac je naplacen, 200 bez retryja, a ERROR kanal ostaje prazan',
    caught: () => {
      const utopljeno = (ev: Parameters<typeof classifyStripeEvent>[0]) =>
        ev.eventName === 'payment_intent.succeeded' && !ev.userId.trim()
          ? { kind: 'ignored', reason: 'missing_user_metadata' }
          : classifyStripeEvent(ev);
      return paidClassificationProblems(utopljeno).some((p) => p.includes('needs_manual_link'));
    },
    cleanBefore: () => paidClassificationProblems(classifyStripeEvent).length === 0,
  },
  {
    id: 'naplata/needs-manual-link-na-warn-razini',
    imitates: 'isti kvar u IZVORU handlera: klasifikator vraca needs_manual_link, ali handler granu logira na WARN, pa potvrdjena uplata bez korisnika opet nema ERROR redak koji bi netko vidio',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src.replace("console.error('webhook-mor needs_manual_link'", "console.warn('webhook-mor needs_manual_link'");
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes("grana 'needs_manual_link' nema ERROR redak"));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },

  // --- naplata: cetiri popravka koje je vlasnik odobrio 2026-09-27 ("Može") -------------------
  {
    id: 'naplata/uplata-ispod-kataloga-daje-pravo',
    imitates: 'stanje handlera do 2026-09-27: payment_intent.succeeded s amount_received manjim od round(price_eur*100), ili u valuti koja nije EUR, samo je logirao amount_mismatch i svejedno upisao entitlement. Odluka vlasnika: takva uplata ne daje pravo nego ide na rucni pregled',
    caught: () => {
      // MUTACIJA: vrati staru ODLUKU (svako odstupanje je samo trag, pravo uvijek).
      const stara = (ev: { totalCents: number | null; currency: string }, exp: number) =>
        ev.totalCents !== exp || ev.currency !== 'EUR' ? { kind: 'above_catalog' } : { kind: 'ok' };
      const problemi = chargedAmountProblems(stara);
      return problemi.some((p) => p.includes('ispod kataloga daje pravo'))
        && problemi.some((p) => p.includes('valuta koja nije EUR daje pravo'));
    },
    cleanBefore: () => chargedAmountProblems(chargedAmountVerdict).length === 0,
  },
  {
    id: 'naplata/needs-manual-review-logira-pa-nastavi',
    imitates: 'isti kvar u IZVORU handlera: odluka vrati needs_manual_review, handler zapise ishod u inbox, ali ne izade, pa uplata ispod kataloga ipak nastavi do rucne narudzbe ili entitlementa (inbox kaze rucni pregled, baza kaze placeno)',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src.replace(/return json\(\{ ok: true, action: 'needs_manual_review'[^\n]*\n/, '\n');
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes('needs_manual_review ne izlazi'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/puni-povrat-ne-zatvara-narudzbu-ni-kupon',
    imitates: 'stanje handlera do 2026-09-27: puni povrat (isFullRefund) gasi samo entitlement i referral nagrade. Rucna narudzba premium_human istog PaymentIntenta ostaje pending (covjek odradi placen posao za vracen novac), a pass kupon iz te kupnje ostaje upotrebljiv',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src.replace(/const posljedice = await closeRefundConsequences\(admin, ev\.orderId[^\n]*\n/, '\n');
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes('ne zove closeRefundConsequences'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/djelomicni-povrat-otkazuje-narudzbu',
    imitates: 'druga krajnost istog popravka: zatvaranje posljedica premjesteno na ulaz refund grane, PRIJE izlaza za djelomicni povrat (PAY-09), pa bi korisnik koji je dobio natrag dio iznosa izgubio rucnu narudzbu i kupon za koje je i dalje platio',
    caught: () => {
      const src = webhookMorSource();
      const poziv = src.match(/ {4}const posljedice = await closeRefundConsequences\(admin, ev\.orderId[^\n]*\n/)?.[0];
      if (!poziv) return false;
      const ulaz = "if (decision.kind === 'refund') {\n";
      const mutated = src.replace(poziv, '').replace(ulaz, ulaz + poziv);
      if (mutated === src || !mutated.includes(ulaz + poziv)) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes('prije izlaza za djelomicni povrat'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/rucna-narudzba-ne-cita-oznaku-povrata',
    imitates: 'stanje handlera do kruga 2 popravka 2026-09-27: grana premium_human upise manual_orders i odmah javi manual_order_created, bez citanja oznake punog povrata. Povrat obradjen prije retryja uplate (Stripe ne jamci redoslijed, prvi pokusaj uplate mogao je pasti) nalazi praznu manual_orders, a retry potom otvara pending narudzbu za vec vracen novac',
    caught: () => {
      const src = webhookMorSource();
      const od = src.indexOf('    // POVRAT STIGAO PRIJE ILI ISTODOBNO S UPLATOM, ZA RUCNU NARUDZBU');
      const _do = src.indexOf('    if (narudzbaVecPostoji) {', od);
      if (od < 0 || _do < 0) return false;
      const mutated = src.slice(0, od) + src.slice(_do);
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes('rucna narudzba ne cita oznaku punog povrata'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/rucna-narudzba-duplikat-prije-oznake-povrata',
    imitates: 'pola popravka: grana premium_human cita oznaku povrata, ali duplikat (23505) izlazi kao duplicate_ignored PRIJE citanja. Retry uplate nakon povrata tada javi obradjeno, a narudzba koju je prvi pokusaj otvorio ostaje pending za vracen novac',
    caught: () => {
      const src = webhookMorSource();
      const dup = "    if (narudzbaVecPostoji) {\n      await settle('processed', 'manual_order_duplicate');\n      return json({ ok: true, action: 'duplicate_ignored' });\n    }\n";
      const oznaka = '    // POVRAT STIGAO PRIJE ILI ISTODOBNO S UPLATOM, ZA RUCNU NARUDZBU';
      if (!src.includes(dup) || !src.includes(oznaka)) return false;
      const mutated = src.replace(dup, '').replace(oznaka, dup + oznaka);
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes('utrka s povratom'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/23505-bez-provjere-vlasnika',
    imitates: 'stanje handlera do 2026-09-27: insert entitlementa koji padne na unique(provider, order_id) (23505) tumacio se kao vec obradjeno i nastavljao na duplicate_ignored i obveze bonusa, bez provjere da postojeci redak pripada istom korisniku kao dogadjaj',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src.replace("String(postojece.user_id ?? '') !== ev.userId", 'false');
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes('bez usporedbe vlasnika'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/tekst-greske-baze-u-odgovoru-webhooka',
    imitates: 'stanje handlera do 2026-09-27: 500 za pad upisa rucne narudzbe i entitlementa vracao je { error, detail: error.message }, dakle tekst greske baze (imena relacija i ogranicenja) svakome tko posalje potpisan dogadjaj',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src.split("json({ error: 'insert_failed' }, 500)").join("json({ error: 'insert_failed', detail: error.message }, 500)");
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes('odgovor nosi tekst greske'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/tekst-greske-baze-u-odgovoru-checkouta',
    imitates: 'isti kvar u create-checkout: pad upisa privole vrati klijentu poruku greske baze (consentErr.message) umjesto generickog consent_not_recorded',
    caught: () => {
      const src = readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'create-checkout', 'handler.ts'));
      const mutated = src.replace(
        "return json({ error: 'consent_not_recorded' }, 500);",
        "return json({ error: 'consent_not_recorded', detail: consentErr.message }, 500);",
      );
      if (mutated === src) return false;
      return responseLeakProblems(mutated, 'create-checkout').some((p) => p.includes('consent_not_recorded'));
    },
    cleanBefore: () => {
      const src = readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'create-checkout', 'handler.ts'));
      return src.length > 2000 && responseLeakProblems(src, 'create-checkout').length === 0;
    },
  },

  {
    id: 'naplata/runbook-ne-imenuje-charge-refunded',
    imitates: 'Stripe ekvivalent masterova naplata/runbook-ne-imenuje-order-refunded: runbook koji ne kaze da se mora pretplatiti charge.refunded. Operater koji pretplati minimalan skup (payment_intent.succeeded) dobije naplatu koja radi i povrate koji se nikad ne obrade: entitlement ostaje paid, referral nagrada se ne povuce, i to bez ijedne greske',
    caught: () => {
      const runbook = readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md'));
      // MUTACIJA u memoriji: makni ime dogadjaja iz runbooka. Disk se ne dira.
      const mutated = runbook.split('`charge.refunded`').join('povrat');
      if (mutated === runbook) return false; // nema sto mutirati: gard bi prolazio vakuumski
      return naplataRunbookProblems(mutated, handlerOutcomes(webhookMorSource()), IGNORE_REASON_PREFIXES)
        .some((p) => p.includes('charge.refunded'));
    },
    cleanBefore: () => {
      const runbook = readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md'));
      const outcomes = handlerOutcomes(webhookMorSource());
      // outcomes stiti od vakuuma: prazan izvod bi dao "cist" runbook bez ijedne provjere ishoda.
      return outcomes.length >= 5
        && naplataRunbookProblems(runbook, outcomes, IGNORE_REASON_PREFIXES).length === 0;
    },
  },
  {
    id: 'naplata/ishod-bez-retka-u-runbooku',
    imitates: 'nov ishod u webhook_events koji trazi ljudsku radnju, a nigdje nije opisan: tocno stanje ishoda needs_manual_link na masteru do 2026-09-23, koji uz to ne ulazi ni u djelomicni indeks webhook_events_unresolved pa ga ni standardni upit nad neobradjenima ne vraca',
    caught: () => {
      const runbook = readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md'));
      // MUTACIJA: handler pocne pisati ishod koji runbook ne poznaje.
      return naplataRunbookProblems(
        runbook,
        [...handlerOutcomes(webhookMorSource()), 'nov_ishod'],
        IGNORE_REASON_PREFIXES,
      ).some((p) => p.includes('nov_ishod'));
    },
    cleanBefore: () => {
      const runbook = readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md'));
      return naplataRunbookProblems(runbook, handlerOutcomes(webhookMorSource()), IGNORE_REASON_PREFIXES)
        .length === 0;
    },
  },

  {
    id: 'naplata/runbook-upit-po-nepostojecem-stupcu',
    imitates: 'stanje runbooka na masteru do 2026-09-23: oba upita u sekciji 5.1 citala su i sortirala po created_at, stupcu kojeg webhook_events nema (0092 ima received_at). Operater bi umjesto popisa neobradjenih dogadjaja dobio ERROR 42703, a bas ti upiti su jedina zamjena za djelomicni indeks koji ishode ignored i refused ne pokriva',
    caught: () => {
      const runbook = readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md'));
      const migracija = readTextLf(
        resolve(process.cwd(), 'supabase', 'migrations', '0092_webhook_events_inbox.sql'),
      );
      // MUTACIJA u memoriji: vrati ime stupca koje je ondje stajalo. Disk se ne dira.
      const mutated = runbook.split('received_at').join('created_at');
      if (mutated === runbook) return false; // nema sto mutirati: gard bi prolazio vakuumski
      return runbookSqlColumnProblems(mutated, migracija).some((p) => p.includes('created_at'));
    },
    cleanBefore: () => {
      const runbook = readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md'));
      const migracija = readTextLf(
        resolve(process.cwd(), 'supabase', 'migrations', '0092_webhook_events_inbox.sql'),
      );
      return runbookSqlColumnProblems(runbook, migracija).length === 0;
    },
  },
  {
    id: 'naplata/runbook-log-redak-koji-izvor-ne-ispisuje',
    imitates: 'Stripe ekvivalent masterova 2f1621bf: runbook imenuje log redak webhook-mor koji handler nikad ne ispisuje (na masteru ignored_unpaid_order umjesto ignored_needs_attention). Tko ga trazi grepom ne nadje nista i zakljuci da se ignorirane uplate ne dogadjaju',
    caught: () => {
      const runbook = readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md'));
      const mutated = runbook.split('`webhook-mor ignored_needs_attention`').join('`webhook-mor ignored_unpaid_order`');
      if (mutated === runbook) return false;
      return runbookLogNameProblems(mutated, webhookMorLogNames(webhookMorSource()))
        .some((p) => p.includes('ignored_unpaid_order'));
    },
    cleanBefore: () => {
      const runbook = readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md'));
      const imena = webhookMorLogNames(webhookMorSource());
      return imena.size >= 5 && runbookLogNameProblems(runbook, imena).length === 0;
    },
  },
  {
    id: 'naplata/deploy-zaobilazi-preflight',
    imitates: 'stanje na masteru do 2026-09-23 i na pack3 prije spajanja: runbook je deploy naplate slao na goli `supabase functions deploy webhook-mor`, bez preflighta. Preskocen korak znaci deploy s praznim STRIPE_WEBHOOK_SECRET, a verifyStripeSignature je fail-closed: svaki dogadjaj dobije missing_secret',
    caught: () => {
      const runbook = readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md'));
      const pkg = JSON.parse(readTextLf(resolve(process.cwd(), 'package.json')));
      const preflight = readTextLf(resolve(process.cwd(), 'scripts', 'verify-naplata-secrets.mjs'));
      // MUTACIJA u memoriji: vrati goli CLI poziv u runbook. `runbook` je vec normaliziran na LF
      // (readTextLf), pa doslovni `\n` u uzorku pogadja redak i u checkoutu s core.autocrlf=true.
      const mutated = runbook.replace('npm run deploy:naplata\n', 'supabase functions deploy webhook-mor\n');
      if (mutated === runbook) return false;
      return naplataDeployPathProblems(mutated, pkg, preflight).some((p) => p.includes('zaobilazi preflight'));
    },
    cleanBefore: () => {
      const runbook = readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md'));
      const pkg = JSON.parse(readTextLf(resolve(process.cwd(), 'package.json')));
      const preflight = readTextLf(resolve(process.cwd(), 'scripts', 'verify-naplata-secrets.mjs'));
      return naplataDeployPathProblems(runbook, pkg, preflight).length === 0;
    },
  },
  {
    id: 'naplata/preflight-zove-goli-supabase',
    imitates: 'stanje preflighta na masteru do 2026-09-23: spawnSync s golim imenom iz PATH-a, dok repo CLI isporucuje kao devDependency. Izmjereno: exit 1 uz "supabase is not recognized" JEDNAKO i kad su tajne ispravne i kad su prazne, pa gard ne razlikuje dva stanja koja mjeri i nauci operatera da ga preskoci',
    caught: () => {
      const src = readTextLf(resolve(process.cwd(), 'scripts', 'verify-naplata-secrets.mjs'));
      // MUTACIJA u memoriji: vrati goli poziv iz PATH-a.
      const mutated = src.replace('const res = runSupabase(args);', "const res = spawnSync('supabase', args);");
      if (mutated === src) return false; // nema sto mutirati: gard bi prolazio vakuumski
      return preflightSourceProblems(mutated).some((p) => p.includes('PATH'));
    },
    cleanBefore: () => {
      const src = readTextLf(resolve(process.cwd(), 'scripts', 'verify-naplata-secrets.mjs'));
      return src.length > 2000 && preflightSourceProblems(src).length === 0;
    },
  },

  // --- naplata: isti Stripe racun u checkoutu i webhooku (krug 3 spajanja, 2026-09-27) ----------
  // Stripe ekvivalent drugog dijela masterova 4addb5db ("isti identitet trgovine u obje funkcije").
  // Izvrseni dokaz preko obje funkcije je u tests/naplata-racun.test.ts; ovdje su ciste mutacije.
  {
    id: 'naplata/webhook-ocekuje-racun-koji-checkout-ne-koristi',
    imitates: 'stanje pack3 do kruga 3: webhook-mor je citao STRIPE_ACCOUNT_ID i uz postavljenu vrijednost odbijao svaki dogadjaj bez istog polja account, a create-checkout PaymentIntent stvara na vlastitom racunu, pa njegovi dogadjaji account nikad ne nose. Operater koji slijedi runbook ("opcionalno STRIPE_ACCOUNT_ID") ugasi sav prihod: 200 event_refused bez retryja',
    caught: () => {
      const stariGate = (ev: { livemode: boolean | null; accountId: string }, opts: { allowTestMode: boolean }) => {
        if (ev.livemode === null) return { ok: false, reason: 'livemode_unverifiable' };
        if (!ev.livemode && !opts.allowTestMode) return { ok: false, reason: 'test_mode_refused' };
        const expected = 'acct_1Nas'; // postavljen STRIPE_ACCOUNT_ID
        if (expected && ev.accountId !== expected) return { ok: false, reason: 'account_mismatch' };
        return { ok: true };
      };
      return accountIdentityProblems(stariGate).some((p) => p.includes('odbija dogadjaj bez polja account'));
    },
    cleanBefore: () => accountIdentityProblems(acceptEvent).length === 0,
  },
  {
    id: 'naplata/webhook-pusta-tudji-povezani-racun',
    imitates: 'isti gate do kruga 3 s PRAZNIM STRIPE_ACCOUNT_ID: provjera racuna se preskakala, pa bi Connect dogadjaj povezanog racuna (endpoint pretplacen na povezane racune) s valjanim potpisom dodijelio pravo pristupa za PaymentIntent koji nas checkout nikad nije stvorio',
    caught: () => {
      const stariGate = (ev: { livemode: boolean | null; accountId: string }, opts: { allowTestMode: boolean }) => {
        if (ev.livemode === null) return { ok: false, reason: 'livemode_unverifiable' };
        if (!ev.livemode && !opts.allowTestMode) return { ok: false, reason: 'test_mode_refused' };
        return { ok: true };
      };
      return accountIdentityProblems(stariGate).some((p) => p.includes('prihvaca payment_intent.succeeded s povezanim racunom'));
    },
    cleanBefore: () => accountIdentityProblems(acceptEvent).length === 0,
  },
  {
    id: 'naplata/checkout-na-povezanom-racunu',
    imitates: 'drugi smjer istog razilazenja: create-checkout PaymentIntent stvara sa zaglavljem Stripe-Account (ili on_behalf_of), a webhook odbija svaki dogadjaj s povezanim racunom. Kupac plati, dogadjaj stigne s account, pravo pristupa nikad ne nastane',
    caught: () => {
      const body = buildStripePaymentIntentParams({
        amountCents: 999, currency: 'eur', userId: 'user-1', productId: 'slot_diplomski', referralCode: null, receiptEmail: null,
      });
      const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Bearer x', 'Stripe-Account': 'acct_1Povezani' };
      return checkoutAccountScopeProblems({ headers, body }).some((p) => p.includes('Stripe-Account'));
    },
    cleanBefore: () => {
      const body = buildStripePaymentIntentParams({
        amountCents: 999, currency: 'eur', userId: 'user-1', productId: 'slot_diplomski', referralCode: 'R1', receiptEmail: 'a@b.hr',
      });
      const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Bearer x', 'Idempotency-Key': 'k' };
      // Netrivijalnost: tijelo mora biti stvaran PaymentIntent zahtjev, ne prazan niz.
      return body.includes('amount=999') && checkoutAccountScopeProblems({ headers, body }).length === 0;
    },
  },
  {
    id: 'naplata/funkcija-opet-cita-racun',
    imitates: 'webhook-mor ponovno cita STRIPE_ACCOUNT_ID (redak kakav je stajao do kruga 3), a create-checkout ne: dvije funkcije iste naplate opet imaju razlicit pojam racuna, isti uzorak kao masterov kvar dvaju imena iste tajne',
    caught: () => {
      const dir = resolve(process.cwd(), 'supabase', 'functions');
      const webhook = readTextLf(join(dir, 'webhook-mor', 'index.ts'));
      const checkout = readTextLf(join(dir, 'create-checkout', 'index.ts'));
      const mutated = webhook.replace(
        "const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';",
        "const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';\nconst STRIPE_ACCOUNT_ID = Deno.env.get('STRIPE_ACCOUNT_ID') ?? '';",
      );
      if (mutated === webhook) return false; // nema sto mutirati: gard bi prolazio vakuumski
      return stripeSecretNameProblems({ 'webhook-mor': mutated, 'create-checkout': checkout })
        .some((p) => p.includes('cita STRIPE_ACCOUNT_ID'));
    },
    cleanBefore: () => {
      const dir = resolve(process.cwd(), 'supabase', 'functions');
      return stripeSecretNameProblems({
        'webhook-mor': readTextLf(join(dir, 'webhook-mor', 'index.ts')),
        'create-checkout': readTextLf(join(dir, 'create-checkout', 'index.ts')),
      }).length === 0;
    },
  },
  {
    id: 'naplata/preflight-propusta-postavljen-racun',
    imitates: 'preflight do kruga 3: STRIPE_ACCOUNT_ID vodjen kao neobavezan i nikad odbijen. Operater ga postavi po starom runbooku, deploy:naplata je zelen, a tajna ili rusi svaku kupnju (stari webhook) ili je mrtva i lazno tvrdi da je Connect racun konfiguriran',
    caught: () => {
      const rows = parseSupabaseSecretsList([
        '  STRIPE_SECRET_KEY      | 1f2e',
        '  STRIPE_PUBLISHABLE_KEY | aabb',
        '  STRIPE_WEBHOOK_SECRET  | 9988',
        '  STRIPE_ACCOUNT_ID      | 5f5e',
      ].join('\n'));
      // Stari preflight je gledao samo obavezne tajne: zelen. Novi imenuje zabranjenu.
      return supabaseSecretsVerdict(rows).ok && forbiddenSecretsVerdict(rows).present.includes('STRIPE_ACCOUNT_ID');
    },
    cleanBefore: () => {
      const rows = parseSupabaseSecretsList([
        '  STRIPE_SECRET_KEY      | 1f2e',
        '  STRIPE_PUBLISHABLE_KEY | aabb',
        '  STRIPE_WEBHOOK_SECRET  | 9988',
      ].join('\n'));
      const src = readTextLf(resolve(process.cwd(), 'scripts', 'verify-naplata-secrets.mjs'));
      return rows.length === 3 && forbiddenSecretsVerdict(rows).ok && preflightSourceProblems(src).length === 0;
    },
  },

  // --- naplata: Codex pregled kruga 3 spajanja (2026-09-27), preflight ---------------------------
  {
    id: 'naplata/obavezna-tajna-bez-digesta-prolazi',
    imitates: 'preflight do kruga 3: redak popisa tajni bez digesta (prazan ili neprepoznat stupac) brojao se kao postavljena tajna, pa bi preflight bio zelen iako se ne vidi je li STRIPE_WEBHOOK_SECRET prazan, a prazan znaci da webhook odbija svaki dogadjaj',
    caught: () => {
      const rows = [
        { name: 'STRIPE_SECRET_KEY', digest: '11aa' },
        { name: 'STRIPE_PUBLISHABLE_KEY', digest: '22bb' },
        { name: 'STRIPE_WEBHOOK_SECRET', digest: '' },
      ];
      return supabaseSecretsVerdict(rows).missing.some(
        (m: { name: string; reason: string }) => m.name === 'STRIPE_WEBHOOK_SECRET' && m.reason === 'nepoznata',
      );
    },
    cleanBefore: () =>
      supabaseSecretsVerdict([
        { name: 'STRIPE_SECRET_KEY', digest: '11aa' },
        { name: 'STRIPE_PUBLISHABLE_KEY', digest: '22bb' },
        { name: 'STRIPE_WEBHOOK_SECRET', digest: '33cc' },
      ]).ok,
  },
  {
    id: 'naplata/testni-nacin-bez-digesta-prolazi',
    imitates: 'preflight do kruga 3: redak STRIPE_ALLOW_TEST_MODE bez digesta nije se brojao kao ukljucen, pa bi deploy prosao iako vrijednost moze biti 1, a uz nju testni Stripe dogadjaj daje pravo pravo pristupa (PAY-05)',
    caught: () => testModeVerdict([{ name: TEST_MODE_SECRET, digest: '' }]),
    cleanBefore: () =>
      !testModeVerdict([{ name: TEST_MODE_SECRET, digest: EMPTY_VALUE_DIGEST }]) && !testModeVerdict([]),
  },
  {
    id: 'naplata/env-grana-bez-testnog-nacina',
    imitates: 'preflight do kruga 3: --env grana provjeravala je samo obavezne i zabranjene tajne, pa je ljuska s STRIPE_ALLOW_TEST_MODE=1 dobila zeleno, iako uz tu zastavicu testni Stripe dogadjaj daje pravo pravo pristupa (PAY-05)',
    caught: () => {
      const src = readTextLf(resolve(process.cwd(), 'scripts', 'verify-naplata-secrets.mjs'));
      const mutated = src.replace('if (testModeEnvVerdict(process.env)', 'if (false');
      if (mutated === src) return false; // nema sto mutirati: gard bi prolazio vakuumski
      return testModeEnvVerdict({ STRIPE_ALLOW_TEST_MODE: '1' })
        && preflightSourceProblems(mutated).some((p) => p.includes('--env grana preflighta ne odbija ukljucen testni nacin'));
    },
    cleanBefore: () => {
      const src = readTextLf(resolve(process.cwd(), 'scripts', 'verify-naplata-secrets.mjs'));
      return !testModeEnvVerdict({ STRIPE_ALLOW_TEST_MODE: '' }) && preflightSourceProblems(src).length === 0;
    },
  },

  // --- naplata: preflight mjeren IZVRSAVANJEM (nalaz pregleda nakon spajanja mastera, 2026-09-27) --
  // Izmjereno prije ovog popravka: `if (!zabranjene.ok) {` -> `if (false) {` (obje grane) i
  // `testModeEnvVerdict(process.env) && false` ostavljali su preflightSourceProblems PRAZNIM, jer je
  // gard trazio samo tekst poziva presude. Mutacije nize mijenjaju IZVOR skripte u memoriji, izvode
  // ga u podprocesu nad laznim Supabase CLI-jem (privremeni direktorij, ne disk repozitorija) i
  // traze da ciljani slucaj padne, a cisti slucaj istog puta i dalje prode.
  {
    id: 'naplata/izvor-zadana-grana-zabranjene-tajne-ugasena',
    imitates: 'nalaz pregleda nakon spajanja mastera (2026-09-27): u zadanom putu `if (!zabranjene.ok) {` zamijenjen s `if (false) {`. Poziv forbiddenSecretsVerdict(read.rows) ostaje u tekstu, stari gard je bio prazan, a deploy:naplata s postavljenim STRIPE_ACCOUNT_ID prolazi i deploya obje funkcije',
    caught: () => {
      const mutated = zamijeniPojavu(preflightIzvor(), 'if (!zabranjene.ok) {', 'if (false) {', 2);
      return izvrsenaMutacijaUhvacena(mutated, ['zadano-zabranjena-tajna'], ['zadano-cisto'])
        && preflightSourceProblems(mutated).some((p) => p.includes('STRIPE_ACCOUNT_ID'));
    },
    cleanBefore: () => izvrseniBaselineCist(['zadano-zabranjena-tajna'], ['zadano-cisto']),
  },
  {
    id: 'naplata/izvor-env-grana-zabranjene-tajne-ugasena',
    imitates: 'nalaz pregleda nakon spajanja mastera (2026-09-27): u --env grani `if (!zabranjene.ok) {` zamijenjen s `if (false) {`. Poziv forbiddenEnvVerdict(process.env) ostaje u tekstu, stari gard je bio prazan, a ljuska s postavljenim STRIPE_ACCOUNT_ID dobije zeleno',
    caught: () => {
      const mutated = zamijeniPojavu(preflightIzvor(), 'if (!zabranjene.ok) {', 'if (false) {', 1);
      return izvrsenaMutacijaUhvacena(mutated, ['env-zabranjena-tajna'], ['env-cisto'])
        && preflightSourceProblems(mutated).some((p) => p.includes('--env grana preflighta ne odbija postavljenu zabranjenu tajnu'));
    },
    cleanBefore: () => izvrseniBaselineCist(['env-zabranjena-tajna'], ['env-cisto']),
  },
  {
    id: 'naplata/izvor-env-grana-testnog-nacina-ugasena',
    imitates: 'nalaz pregleda nakon spajanja mastera (2026-09-27): `testModeEnvVerdict(process.env) && false` u --env grani. Tekst `if (testModeEnvVerdict(process.env)` ostaje, stari gard je bio prazan, a ljuska sa STRIPE_ALLOW_TEST_MODE=1 dobije zeleno iako testni dogadjaj tada daje pravo pravo pristupa (PAY-05)',
    caught: () => {
      const mutated = preflightIzvor().replace(
        'testModeEnvVerdict(process.env) && !argv',
        'testModeEnvVerdict(process.env) && false && !argv',
      );
      return izvrsenaMutacijaUhvacena(mutated, ['env-testni-ukljucen'], ['env-cisto'])
        && preflightSourceProblems(mutated).some((p) => p.includes('--env grana preflighta ne odbija ukljucen testni nacin'));
    },
    cleanBefore: () => izvrseniBaselineCist(['env-testni-ukljucen'], ['env-cisto']),
  },
  {
    id: 'naplata/izvor-zadana-grana-testnog-nacina-ugasena',
    imitates: 'isti oblik kao nalaz pregleda 2026-09-27, u zadanom putu: `testModeVerdict(read.rows) && false`. Tekst poziva presude ostaje, a deploy:naplata sa STRIPE_ALLOW_TEST_MODE=1 u projektu prolazi i deploya (PAY-05)',
    caught: () => {
      const mutated = preflightIzvor().replace('testModeVerdict(read.rows) && !argv', 'testModeVerdict(read.rows) && false && !argv');
      return izvrsenaMutacijaUhvacena(mutated, ['zadano-testni-ukljucen'], ['zadano-cisto'])
        && preflightSourceProblems(mutated).some((p) => p.includes('ukljucen testni nacin prije deploya'));
    },
    cleanBefore: () => izvrseniBaselineCist(['zadano-testni-ukljucen'], ['zadano-cisto']),
  },
  {
    id: 'naplata/izvor-grana-zabranjene-tajne-bez-izlaza',
    imitates: 'grana zabranjene tajne u zadanom putu koja ispise ODBIJEN, ali izgubi process.exit(1): uvjet je upravo presuda pa je tekstualni gard zelen, a skripta nastavi do deploya obje funkcije s postavljenim STRIPE_ACCOUNT_ID',
    caught: () => {
      const src = preflightIzvor();
      const grana = indeksPojave(src, 'if (!zabranjene.ok) {', 2);
      if (grana < 0) return false;
      const izlaz = src.indexOf('process.exit(1);', grana);
      if (izlaz < 0) return false;
      const mutated = src.slice(0, izlaz) + src.slice(izlaz + 'process.exit(1);'.length);
      // Tekstualni gard to NE vidi (uvjet je netaknut); zato postoji izvrseni.
      return preflightSourceProblems(mutated).length === 0
        && izvrsenaMutacijaUhvacena(mutated, ['zadano-zabranjena-tajna'], ['zadano-cisto']);
    },
    cleanBefore: () => izvrseniBaselineCist(['zadano-zabranjena-tajna'], ['zadano-cisto']),
  },
  {
    id: 'naplata/izvor-grana-zabranjene-tajne-samo-uz-deploy',
    imitates: 'grana zabranjene tajne uvjetovana zastavicom deploya (`if (!zabranjene.ok && deploy) {`): deploy:naplata i dalje pada, ali samostalna provjera (npm run verify-naplata-secrets, korak kojim operater provjerava tajne) je zelena uz postavljen STRIPE_ACCOUNT_ID',
    caught: () => {
      const mutated = zamijeniPojavu(preflightIzvor(), 'if (!zabranjene.ok) {', 'if (!zabranjene.ok && deploy) {', 2);
      return izvrsenaMutacijaUhvacena(mutated, ['provjera-zabranjena-tajna'], ['zadano-cisto'])
        // Slucaj s --deploy tu mutaciju NE vidi; zato postoji slucaj bez njega.
        && preflightExecutionProblems(mutated, ['zadano-zabranjena-tajna']).length === 0;
    },
    cleanBefore: () => izvrseniBaselineCist(['provjera-zabranjena-tajna', 'zadano-zabranjena-tajna'], ['zadano-cisto']),
  },
  {
    id: 'naplata/izvor-obavezna-tajna-bez-digesta-prolazi',
    imitates: 'izvorni oblik mutacije naplata/obavezna-tajna-bez-digesta-prolazi: supabaseSecretsVerdict bez razloga `nepoznata`, pa redak STRIPE_WEBHOOK_SECRET bez digesta prolazi kao postavljen i deploy:naplata deploya webhook koji mozda odbija svaki dogadjaj',
    caught: () => {
      const mutated = preflightIzvor().replace(
        "    else if (!isKnownDigest(byName.get(name))) missing.push({ name, reason: 'nepoznata' });\n",
        '',
      );
      return izvrsenaMutacijaUhvacena(mutated, ['zadano-obavezna-bez-digesta'], ['zadano-cisto']);
    },
    cleanBefore: () => izvrseniBaselineCist(['zadano-obavezna-bez-digesta'], ['zadano-cisto']),
  },
  {
    id: 'naplata/izvor-testni-nacin-bez-digesta-prolazi',
    imitates: 'izvorni oblik mutacije naplata/testni-nacin-bez-digesta-prolazi: testModeVerdict bez retka koji neprepoznat digest broji kao ukljucen, pa STRIPE_ALLOW_TEST_MODE cija se vrijednost ne vidi (a moze biti 1) ne obara deploy (PAY-05)',
    caught: () => {
      const mutated = preflightIzvor().replace('  if (!isKnownDigest(row.digest)) return true;\n', '');
      return izvrsenaMutacijaUhvacena(mutated, ['zadano-testni-bez-digesta'], ['zadano-cisto']);
    },
    cleanBefore: () => izvrseniBaselineCist(['zadano-testni-bez-digesta'], ['zadano-cisto']),
  },
  {
    id: 'naplata/izvor-preflight-propusta-postavljen-racun',
    imitates: 'izvorni oblik mutacije naplata/preflight-propusta-postavljen-racun: NAPLATA_FORBIDDEN_SECRETS prazan, dakle stanje do kruga 3. Obje grane i obje presude stoje u tekstu, a STRIPE_ACCOUNT_ID ni u projektu ni u ljusci vise ne obara preflight',
    caught: () => {
      const mutated = preflightIzvor().replace(
        "export const NAPLATA_FORBIDDEN_SECRETS = Object.freeze(['STRIPE_ACCOUNT_ID']);",
        'export const NAPLATA_FORBIDDEN_SECRETS = Object.freeze([]);',
      );
      return preflightSourceProblems(mutated).length === 0
        && izvrsenaMutacijaUhvacena(
          mutated,
          ['zadano-zabranjena-tajna', 'env-zabranjena-tajna'],
          ['zadano-cisto', 'env-cisto'],
        );
    },
    cleanBefore: () => izvrseniBaselineCist(['zadano-zabranjena-tajna', 'env-zabranjena-tajna'], ['zadano-cisto', 'env-cisto']),
  },

  // --- naplata: rucno vezivanje ne smije upisati pravo za vracen novac (2026-09-27) -------------
  {
    id: 'naplata/rucno-vezivanje-bez-provjere-povrata',
    imitates: 'runbook 5.1 do 2026-09-27: postupak rucnog vezivanja vodio je ravno na insert into entitlements. Uplata bez user_id nema pravo, pa njezin puni povrat zavrsi kao refund_without_entitlement; pravo upisano rucno nakon toga ostaje aktivno za vracen novac',
    caught: () => {
      const runbook = readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md'));
      // MUTACIJA u memoriji: makni ogradjeni blok provjere povrata ispred upisa prava.
      const pocetak = runbook.indexOf('```sql', runbook.indexOf('**Obavezno prije upisa'));
      const kraj = runbook.indexOf('```', pocetak + 6);
      if (pocetak < 0 || kraj < 0) return false;
      const mutated = runbook.slice(0, pocetak) + runbook.slice(kraj + 3);
      return runbookRefundCheckProblems(mutated, webhookMorSource())
        .some((p) => p.includes('bez prethodne provjere povrata'));
    },
    cleanBefore: () => {
      const runbook = readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md'));
      // Cetiri oznake: refund_consequences_failed dodana 2026-09-27 (pad sporednih posljedica povrata).
      return handlerRefundMarkers(webhookMorSource()).length === 4
        && runbookRefundCheckProblems(runbook, webhookMorSource()).length === 0;
    },
  },
  {
    id: 'naplata/cekaju-vezivanje-ukljucuje-vracene',
    imitates: 'upit "uplate koje cekaju rucno vezivanje" iz runbooka 5.1 do 2026-09-27: vracao je i uplatu ciji je PaymentIntent vec vracen, pa je operater dobivao na popis za vezivanje upravo onu uplatu koju ne smije vezati',
    caught: () => {
      const runbook = readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md'));
      const pocetak = runbook.indexOf('  and not exists (');
      const kraj = runbook.indexOf('\n  )\n', pocetak);
      if (pocetak < 0 || kraj < 0) return false;
      const mutated = runbook.slice(0, pocetak) + runbook.slice(kraj + '\n  )\n'.length);
      return runbookRefundCheckProblems(mutated, webhookMorSource())
        .some((p) => p.includes('ne iskljucuje uplate ciji je PaymentIntent vracen'));
    },
    cleanBefore: () =>
      runbookRefundCheckProblems(readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md')), webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/runbook-oznake-povrata-zastarjele',
    imitates: 'handler doda novu oznaku punog povrata u REFUND_MARKERS (kao sto je refund_pending dodan u krugu 3), a runbook i dalje filtrira stari popis: provjera prije rucnog vezivanja ne vidi povrat koji se upravo obradjuje',
    caught: () => {
      const handler = webhookMorSource();
      const mutated = handler.replace("'refund_without_entitlement', 'refunded'];", "'refund_without_entitlement', 'refunded', 'refund_nova_oznaka'];");
      if (mutated === handler) return false;
      const runbook = readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md'));
      return handlerRefundMarkers(mutated).includes('refund_nova_oznaka')
        && runbookRefundCheckProblems(runbook, mutated).some((p) => p.includes('nije REFUND_MARKERS'));
    },
    cleanBefore: () =>
      runbookRefundCheckProblems(readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md')), webhookMorSource()).length === 0,
  },

  // --- naplata: nalazi pregleda nakon spajanja design/naplata-4 u design/pack3 (2026-09-27) -------
  {
    id: 'naplata/kataloska-cijena-nula-daje-pravo',
    imitates: 'stanje handlera do 2026-09-27: mapProductRow cijenu null ili neispravnu pretvara u 0, a cijena 0 ostaje aktivna. Ocekivani iznos je 0 centi, pa svaka pozitivna uplata prolazi kao above_catalog i dobiva pravo za proizvod koji create-checkout ne bi prodao',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src.replace(
        'const cijenaUpotrebljiva = product.active && Number.isFinite(ocekivanoCenti) && ocekivanoCenti > 0;',
        'const cijenaUpotrebljiva = true;',
      );
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes('neupotrebljiva kataloska cijena'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/neaktivan-proizvod-daje-pravo',
    imitates: 'pola popravka catalog_price_unusable: provjerava se samo pozitivan iznos, ne i je li proizvod aktivan. Uplata za povucen proizvod (active=false uz staru cijenu) i dalje dobiva pravo',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src.replace('const cijenaUpotrebljiva = product.active && ', 'const cijenaUpotrebljiva = ');
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes('neupotrebljiva kataloska cijena'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/ponovljena-dostava-na-rucni-pregled',
    imitates: 'stanje handlera iz design/naplata-4: Stripe retry vec proknjizene uplate nakon promjene cijene zavrsi kao needs_manual_review, pa duplicate_ignored (tocka oporavka obveza bonusa, audit P1-07) nikad ne dodje na red',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src.replace(
        "if (iznos.kind === 'needs_manual_review' && !vecProknjizeno) {",
        "if (iznos.kind === 'needs_manual_review') {",
      );
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes('ponovljena dostava vec proknjizene uplate'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/ponovljena-dostava-tudjeg-korisnika',
    imitates: 'preiroka provjera ponovljene dostave: svaki postojeci zapis za PaymentIntent (i tudji) preskoci rucni pregled, pa uplata ispod kataloga uz sukob vlasnika zavrsi kao duplikat umjesto kod covjeka',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src.replace(
        "vecProknjizeno = redak !== null && String(redak.user_id ?? '') === ev.userId;",
        'vecProknjizeno = redak !== null;',
      );
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes('ne usporedjuje korisnika postojeceg zapisa'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/bonusi-bez-drugog-citanja-oznake',
    imitates: 'stanje handlera iz design/naplata-4: oznaka povrata cita se samo PRIJE bonusa. Puni povrat u prozoru izmedju tog citanja i upisa kupona procita praznu coupon_grants, pa pass kupon i nagrada preporucitelju ostanu aktivni za vracen novac',
    caught: () => {
      const src = webhookMorSource();
      const od = src.indexOf('  // PROZOR ISTODOBNOG POVRATA ZA BONUSE');
      const _do = src.indexOf("  await settle(\n    'processed',\n    iznos.kind === 'above_catalog'", od);
      if (od < 0 || _do < 0) return false;
      const mutated = src.slice(0, od) + src.slice(_do);
      return webhookHandlerProblems(mutated).some((p) => p.includes('oznaka povrata se ne cita ponovno'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/opoziv-bez-nagrade-preporucitelju',
    imitates: 'pola popravka prozora povrata: uplata ponovno procita oznaku i povuce kupon, ali ne i nagradu preporucitelju (referral_signups, 0013) koju je izdala u istom prozoru',
    caught: () => {
      const src = webhookMorSource();
      const pomocnik = src.indexOf('async function closePaymentAfterRefund(');
      const poziv = src.indexOf('  await pullReferralSignupReward(admin, ev.orderId);\n', pomocnik);
      if (pomocnik < 0 || poziv < 0) return false;
      const mutated = src.slice(0, poziv) + src.slice(poziv + '  await pullReferralSignupReward(admin, ev.orderId);\n'.length);
      return webhookHandlerProblems(mutated).some((p) => p.includes('ne opoziva nagradu preporucitelju'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/posljedice-povrata-prije-prava',
    imitates: 'stanje handlera iz design/naplata-4: closeRefundConsequences se izvodi prije gasenja entitlementa, pa pad upisa u manual_orders ili coupon_grants vrati 500 dok je pravo jos aktivno (kupac ima novac natrag i pristup)',
    caught: () => {
      const src = webhookMorSource();
      const blokOd = src.indexOf('    // SPOREDNE POSLJEDICE (odluka vlasnika 2026-09-27)');
      const blokDo = src.indexOf('    // Rucna narudzba nema entitlement, a povrat ju je upravo zatvorio', blokOd);
      const pravo = src.indexOf('    // PRAVO SE GASI PRIJE SPOREDNIH POSLJEDICA');
      if (blokOd < 0 || blokDo < 0 || pravo < 0 || !(pravo < blokOd)) return false;
      const blok = src.slice(blokOd, blokDo);
      const mutated = src.slice(0, pravo) + blok + src.slice(pravo, blokOd) + src.slice(blokDo);
      return webhookHandlerProblems(mutated).some((p) => p.includes('prije gasenja prava'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/pad-posljedica-brise-oznaku-povrata',
    imitates: 'pad sporednih posljedica zapisan u inbox kao detalj koji nije oznaka punog povrata: uplata koja stigne prije Stripeova retryja povrata ne vidi povrat i otvori ili ostavi rucnu narudzbu za vracen novac',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src.replace("await settle('failed', 'refund_consequences_failed', ", "await settle('failed', 'posljedice_povrata_pale', ");
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes('ne ostavlja oznaku punog povrata'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/any-u-posljedicama-povrata',
    imitates: 'stanje handlera iz design/naplata-4: closeRefundConsequences(admin: any, ...) uz retke any[] i (error as any).code, pa krivo ime stupca ili metode prolazi tsc i deno check',
    caught: () => {
      const src = webhookMorSource();
      const a = src.replace('  admin: RefundConsequencesDb,\n', '  admin: any,\n');
      const b = src.replace('dbErrorCode(error) === UNIQUE_VIOLATION;', "(error as any).code === '23505';");
      if (a === src || b === src) return false;
      return webhookHandlerProblems(a).some((p) => p.includes('closeRefundConsequences koristi any'))
        && webhookHandlerProblems(b).some((p) => p.includes('(x as any).code'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  // --- naplata: Monetizacija V1 (M2), snapshot prava i nadogradnja Repair -> Final Pass -----------
  {
    id: 'naplata/snapshot-bez-offer-code',
    imitates: 'buildEntitlementInsert kakav je bio do Monetizacije V1: redak bez offer_code i prava, pa buduca promjena kataloga mijenja ono sto je korisnik vec kupio (MONETIZACIJA_V1.md odjeljak 13)',
    caught: () => {
      const mutant: typeof buildEntitlementInsert = (p, ev, prov, now) => {
        const row = buildEntitlementInsert(p, ev, prov, now) as unknown as Record<string, unknown>;
        delete row.offer_code;
        delete row.capabilities;
        return row as unknown as ReturnType<typeof buildEntitlementInsert>;
      };
      const problems = entitlementSnapshotProblems(mutant);
      return problems.some((p) => p.includes('ne snapshotira offer_code')) && problems.some((p) => p.includes('ne snapshotira prava'));
    },
    cleanBefore: () => entitlementSnapshotProblems(buildEntitlementInsert).length === 0,
  },
  {
    id: 'naplata/snapshot-dijeli-niz-s-katalogom',
    imitates: 'pola snapshota: prava se upisuju kao referenca na niz iz kataloga umjesto kopije, pa izmjena kataloga u istom procesu tiho mijenja upisano pravo',
    caught: () => {
      const mutant: typeof buildEntitlementInsert = (p, ev, prov, now) => ({
        ...buildEntitlementInsert(p, ev, prov, now),
        capabilities: p.capabilities as string[],
      });
      return entitlementSnapshotProblems(mutant).some((p) => p.includes('dijeli niz s katalogom'));
    },
    cleanBefore: () => entitlementSnapshotProblems(buildEntitlementInsert).length === 0,
  },
  {
    id: 'naplata/webhook-snapshot-iz-drugog-upita',
    imitates: 'webhook cita proizvod kao select(*) bez offer_codes(capabilities): prava ostaju null, pa se svaka kupnja zaustavi na product_without_offer ili bi se snapshot slagao iz drugog izvora nego cijena',
    caught: () => {
      const webhook = webhookMorSource();
      const mutated = webhook.replace(".select('*, offer_codes(capabilities)')", ".select('*')");
      if (mutated === webhook) return false;
      return upgradeWiringProblems(createCheckoutSource(), mutated).some((p) => p.includes('prava ponude u istom upitu'));
    },
    cleanBefore: () => upgradeWiringProblems(createCheckoutSource(), webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/nadogradnja-naplacuje-punu-cijenu',
    imitates: 'nadogradnja bez odbitka: korisnik koji je vec platio Repair placa puni Final Pass ponovno (MONETIZACIJA_V1.md odjeljak 14, "nikad ne naplatiti puni Final Pass ponovno")',
    caught: () => {
      const mutant: typeof quoteUpgrade = (t, s, u, n) => {
        const q = quoteUpgrade(t, s, u, n);
        return q.ok ? { ...q, amountCents: q.targetCents } : q;
      };
      return upgradeQuoteProblems(mutant).some((p) => p.includes('punu cijenu Final Passa'));
    },
    cleanBefore: () => upgradeQuoteProblems(quoteUpgrade).length === 0,
  },
  {
    id: 'naplata/nadogradnja-dvaput',
    imitates: 'izracun nadogradnje koji ne gleda upgrade_order_id: vec nadogradjeno pravo daje drugi PaymentIntent s istim odbitkom, pa se isti Repair iznos priznaje dvaput',
    caught: () => {
      const mutant: typeof quoteUpgrade = (t, s, u, n) => quoteUpgrade(t, s ? { ...s, upgradeOrderId: null } : s, u, n);
      return upgradeQuoteProblems(mutant).some((p) => p.includes('nije jednom'));
    },
    cleanBefore: () => upgradeQuoteProblems(quoteUpgrade).length === 0,
  },
  {
    id: 'naplata/nadogradnja-druga-vrsta-rada',
    imitates: 'nadogradnja bez usporedbe vrste rada: diplomski Repair postaje doktorski Final Pass uz odbitak diplomskog iznosa',
    caught: () => {
      const mutant: typeof quoteUpgrade = (t, s, u, n) => quoteUpgrade(t, s && t ? { ...s, workType: t.workType ?? s.workType } : s, u, n);
      return upgradeQuoteProblems(mutant).some((p) => p.includes('drugu vrstu rada'));
    },
    cleanBefore: () => upgradeQuoteProblems(quoteUpgrade).length === 0,
  },
  {
    id: 'naplata/nadogradnja-klijentski-iznos',
    imitates: 'create-checkout koji iznos nadogradnje uzima iz tijela zahtjeva (klijent salje "vec placeno" ili iznos), pa izmijenjen klijent placa 1 cent za Final Pass',
    caught: () => {
      const checkout = createCheckoutSource();
      const mutated = checkout.replace('amountCents = quote.amountCents;', 'amountCents = Number(body.amountCents);');
      if (mutated === checkout) return false;
      const problems = upgradeWiringProblems(mutated, webhookMorSource());
      return problems.some((p) => p.includes('ne uzima iz quoteUpgrade')) && problems.some((p) => p.includes('iz tijela zahtjeva'));
    },
    cleanBefore: () => upgradeWiringProblems(createCheckoutSource(), webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/nadogradnja-tudje-pravo',
    imitates: 'create-checkout cita pravo za nadogradnju samo po id-u: tudji entitlement id (npr. iz loga) daje odbitak tudje uplate',
    caught: () => {
      const checkout = createCheckoutSource();
      const mutated = checkout.replace(".eq('id', upgradeFrom)\n      .eq('user_id', user.id)", ".eq('id', upgradeFrom)");
      if (mutated === checkout) return false;
      return upgradeWiringProblems(mutated, webhookMorSource()).some((p) => p.includes('bez filtra na prijavljenog korisnika'));
    },
    cleanBefore: () => upgradeWiringProblems(createCheckoutSource(), webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/nadogradnja-kroz-punu-cijenu-u-webhooku',
    imitates: 'webhook bez grane nadogradnje: uplata razlike (10,00) se usporedjuje s punom cijenom Final Passa (19,99) i zavrsi na rucnom pregledu, ili bi uz popusten gard stvorila DRUGO pravo za isti rad',
    caught: () => {
      const webhook = webhookMorSource();
      const od = webhook.indexOf('  if (ev.upgradeFromEntitlementId) {');
      const _do = webhook.indexOf('  }\n', od);
      if (od < 0 || _do < 0) return false;
      const mutated = webhook.slice(0, od) + webhook.slice(_do + 4);
      return upgradeWiringProblems(createCheckoutSource(), mutated).some((p) => p.includes('usporedbu s punom cijenom'));
    },
    cleanBefore: () => upgradeWiringProblems(createCheckoutSource(), webhookMorSource()).length === 0,
  },
  // --- naplata: Monetizacija V1 (M2) krug 2, potrosnja kupljenog prava --------------------------------
  {
    id: 'naplata/snapshot-bez-prozora',
    imitates: 'buildEntitlementInsert iz kruga 1: offer_code i prava se snapshotiraju, ali prozor slota ne, pa ga odluka o pristupu i dalje cita iz zivog kataloga',
    caught: () => {
      const mutant: typeof buildEntitlementInsert = (p, ev, prov, now) => {
        const row = buildEntitlementInsert(p, ev, prov, now) as unknown as Record<string, unknown>;
        delete row.slot_window_days;
        return row as unknown as ReturnType<typeof buildEntitlementInsert>;
      };
      return entitlementSnapshotProblems(mutant).some((p) => p.includes('ne snapshotira prozor slota'));
    },
    cleanBefore: () => entitlementSnapshotProblems(buildEntitlementInsert).length === 0,
  },
  {
    id: 'naplata/pristup-cita-zivi-katalog',
    imitates: 'krug 1: generate-report i repair-docx citaju slot_window_days iz products uzivo, pa buduce skracenje prozora Final Passa skrati vec kupljeno pravo (odjeljak 29)',
    caught: () => {
      const mutant: typeof entitlementRowFromDb = (e) => {
        const row = entitlementRowFromDb(e);
        return row ? { ...row, slotWindowDays: e.products?.slot_window_days ?? row.slotWindowDays } : row;
      };
      return entitlementAccessProblems(mutant, ENTITLEMENT_ACCESS_SELECT).some((p) => p.includes('iz zivog kataloga umjesto snapshota'));
    },
    cleanBefore: () => entitlementAccessProblems(entitlementRowFromDb, ENTITLEMENT_ACCESS_SELECT).length === 0,
  },
  {
    id: 'naplata/ugradnja-products-bez-hinta',
    imitates: 'upit prava s golom ugradnjom products(slot_window_days): uz drugi FK entitlements -> products PostgREST vraca PGRST201 i placeno pravo nestaje iz odluke',
    caught: () => {
      const mutated = ENTITLEMENT_ACCESS_SELECT.replace('products!product_id(', 'products(');
      if (mutated === ENTITLEMENT_ACCESS_SELECT) return false;
      return entitlementAccessProblems(entitlementRowFromDb, mutated).some((p) => p.includes('nema eksplicitan hint'));
    },
    cleanBefore: () => entitlementAccessProblems(entitlementRowFromDb, ENTITLEMENT_ACCESS_SELECT).length === 0,
  },
  {
    id: 'naplata/drugi-fk-entitlements-products',
    imitates: '0207 iz kruga 1: upgraded_from_product_id references products dodaje drugi FK prema products, pa ugradnja products(...) u generate-report i repair-docx postaje dvosmislena (PGRST201)',
    caught: () => {
      const migracije = migrationsForFkGuard();
      const idx = migracije.findIndex((m) => m.name === '0207_monetizacija_v1.sql');
      if (idx < 0) return false;
      const sql = migracije[idx].sql;
      const mutated = sql.replace('add column if not exists upgraded_from_product_id text,', 'add column if not exists upgraded_from_product_id text references public.products(id),');
      if (mutated === sql) return false;
      const kopija = migracije.map((m, i) => (i === idx ? { ...m, sql: mutated } : m));
      return entitlementProductFkCount(kopija).count === 2;
    },
    cleanBefore: () => entitlementProductFkCount(migrationsForFkGuard()).count === 1,
  },
  {
    id: 'naplata/pristup-guta-gresku-upita',
    imitates: 'krug 1: potrosac bez provjere greske citanja prava; PGRST201 ili pad baze postaju "nema prava" i placeni korisnik dobiva 402 s ponudom da plati ponovno',
    caught: () => {
      const src = generateReportSource();
      const od = src.indexOf('  if (!access.ok) {');
      const _do = od < 0 ? -1 : src.indexOf('  }\n', od);
      if (od < 0 || _do < 0) return false;
      const mutated = src.slice(0, od) + src.slice(_do + 4);
      return entitlementConsumerProblems({ 'generate-report': mutated }).some((p) => p.includes('greska upita prava se guta'));
    },
    cleanBefore: () => entitlementConsumerProblems({ 'generate-report': generateReportSource(), 'repair-docx': repairDocxSource() }).length === 0,
  },
  {
    id: 'naplata/specijalisticki-odbijen-pri-potrosnji',
    imitates: 'krug 1: repair-docx vrstu rada provjerava klijentskim isReportWorkType, pa kupljeni slot_specijalisticki (16,99) na svaki popravak dobiva 400 bad_request',
    caught: () => {
      const src = repairDocxSource();
      const mutated = src.replace('!isBillableWorkType(meta.workType)', '!isReportWorkType(meta.workType)');
      if (mutated === src) return false;
      return entitlementConsumerProblems({ 'repair-docx': mutated }).some((p) => p.includes('klijentskim popisom'));
    },
    cleanBefore: () => entitlementConsumerProblems({ 'generate-report': generateReportSource(), 'repair-docx': repairDocxSource() }).length === 0,
  },
  // --- naplata: Monetizacija V1 (M2) krug 3 -----------------------------------------------------------
  {
    id: 'naplata/pristup-mimo-zajednickog-citanja',
    imitates: 'krug 2: repair-docx cita entitlements vlastitim inline upitom pokraj readAccessRows, pa izvrseni test zajednickog citanja ne dokazuje nista o stvarnom putu',
    caught: () => {
      const src = repairDocxSource();
      const mutated = src.replace('readAccessRows(admin as unknown as AccessDb, user.id, workType, now),', "admin.from('entitlements').select(ENTITLEMENT_ACCESS_SELECT),");
      if (mutated === src) return false;
      return entitlementConsumerProblems({ 'repair-docx': mutated }).some((p) => p.includes('zajednickim citanjem readAccessRows'));
    },
    cleanBefore: () => entitlementConsumerProblems({ 'generate-report': generateReportSource(), 'repair-docx': repairDocxSource() }).length === 0,
  },
  {
    id: 'naplata/nadogradnja-anonimiziran-slot',
    imitates: 'krug 2: quoteUpgrade gleda samo purchase_expires_at, pa se Repair ciji je slot cron anonimizirao (purge 0016) nadogradi u Final Pass koji ne prepoznaje nijednu verziju rada',
    caught: () => {
      const mutant: typeof quoteUpgrade = (t, s, u, n) => quoteUpgrade(t, s ? { ...s, boundSlotIntact: true } : s, u, n);
      return upgradeQuoteProblems(mutant).some((p) => p.includes('anonimiziranim vezanim slotom'));
    },
    cleanBefore: () => upgradeQuoteProblems(quoteUpgrade).length === 0,
  },
  {
    id: 'naplata/nadogradnja-slot-neprocitan-kao-netaknut',
    imitates: 'fail-open citanje slota: pozivatelj koji zaboravi procitati vezani slot (boundSlotIntact undefined) dobiva nadogradnju kao da je otisak netaknut',
    caught: () => {
      const mutant: typeof quoteUpgrade = (t, s, u, n) => quoteUpgrade(t, s ? { ...s, boundSlotIntact: s.boundSlotIntact ?? true } : s, u, n);
      return upgradeQuoteProblems(mutant).some((p) => p.includes('nije fail-closed'));
    },
    cleanBefore: () => upgradeQuoteProblems(quoteUpgrade).length === 0,
  },
  {
    id: 'naplata/nadogradnja-rok-potrosnje-za-vezani',
    imitates: 'krug 4 (nalaz pregleda): quoteUpgrade odbija vezan Repair cim istekne purchase_expires_at, iako otisak nije anonimiziran; slot_diplomski vezan dan 85 odbijen na dan 92 dok mu slot jos zivi',
    caught: () => {
      const mutant: typeof quoteUpgrade = (t, s, u, n) =>
        s && Date.parse(s.purchaseExpiresAt) <= n ? { ok: false, error: 'upgrade_source_expired' } : quoteUpgrade(t, s, u, n);
      return upgradeQuoteProblems(mutant).some((p) => p.includes('rok potrosnje'));
    },
    cleanBefore: () => upgradeQuoteProblems(quoteUpgrade).length === 0,
  },
  {
    id: 'naplata/nadogradnja-nevezan-bez-roka',
    imitates: 'krug 4: presiroko olabavljen rok, pa se i NEVEZAN Repair nadogradjuje nakon isteka roka potrosnje (rok vezivanja uz rad nestaje)',
    caught: () => {
      const mutant: typeof quoteUpgrade = (t, s, u, n) => quoteUpgrade(t, s ? { ...s, purchaseExpiresAt: new Date(n + 86_400_000).toISOString() } : s, u, n);
      return upgradeQuoteProblems(mutant).some((p) => p.includes('(rok)'));
    },
    cleanBefore: () => upgradeQuoteProblems(quoteUpgrade).length === 0,
  },
  {
    id: 'naplata/m3-prekidac-specijalisticki-ukljucen-prije-m3',
    imitates: 'krug 4: SPECIALIST_TIER_ENABLED zadano true prije M3, pa server specijalisticku naslovnicu na seminarskom, zavrsnom i diplomskom blokira s prijedlogom specijalisticki koji klijent ne nudi',
    caught: () => {
      const b: typeof billableMismatch = (sel, sig, sug, tier = true) => billableMismatch(sel, sig, sug, tier);
      const c: typeof checkoutMismatch = (sel, sig, conf, tier = true) => checkoutMismatch(sel, sig, conf, tier);
      const p = specialistTierGateProblems(b, c, true);
      return p.some((x) => x.includes('ukljucen prije M3')) && p.some((x) => x.includes('predlaze specijalisticki'));
    },
    cleanBefore: () => specialistTierGateProblems(billableMismatch, checkoutMismatch, SPECIALIST_TIER_ENABLED).length === 0,
  },
  {
    id: 'naplata/m3-prekidac-ignoriran-u-billable',
    imitates: 'pola prekidaca: konstanta je false, ali billableMismatch granu specijalisticke naslovnice i dalje primjenjuje bezuvjetno (stanje kruga 3)',
    caught: () => {
      const b: typeof billableMismatch = (sel, sig, sug) => billableMismatch(sel, sig, sug, true);
      return specialistTierGateProblems(b, checkoutMismatch, SPECIALIST_TIER_ENABLED).some((x) => x.includes('ne odlucuje kao prije M2'));
    },
    cleanBefore: () => specialistTierGateProblems(billableMismatch, checkoutMismatch, SPECIALIST_TIER_ENABLED).length === 0,
  },
  {
    id: 'naplata/stripe-sync-apply-zadano',
    imitates: 'krug 4: parseArgs bez argumenata vraca apply=true, pa obicno pokretanje skripte salje zahtjeve Stripeu umjesto dry-runa',
    caught: () => {
      const mutant: typeof stripeSyncParseArgs = (argv) => ({ ...stripeSyncParseArgs(argv), apply: !argv.includes('--dry-run') });
      return stripeSyncSafetyProblems(mutant, stripeSyncApplyGuard, stripeSyncSource()).some((p) => p.includes('zadano nije dry-run'));
    },
    cleanBefore: () => stripeSyncSafetyProblems(stripeSyncParseArgs, stripeSyncApplyGuard, stripeSyncSource()).length === 0,
  },
  {
    id: 'naplata/stripe-sync-apply-bez-kljuca',
    imitates: 'krug 4: --apply bez STRIPE_SECRET_KEY se ne odbija nego nastavlja s praznim kljucem prema Stripeu',
    caught: () => {
      const mutant: typeof stripeSyncApplyGuard = (opts, env) => (opts.apply ? String(env.STRIPE_SECRET_KEY ?? '') : null);
      return stripeSyncSafetyProblems(stripeSyncParseArgs, mutant, stripeSyncSource()).some((p) => p.includes('bez STRIPE_SECRET_KEY'));
    },
    cleanBefore: () => stripeSyncSafetyProblems(stripeSyncParseArgs, stripeSyncApplyGuard, stripeSyncSource()).length === 0,
  },
  {
    id: 'naplata/stripe-sync-live-bez-zastavice',
    imitates: 'krug 4: sk_live_ kljuc prolazi bez --live, pa se tijekom bete s iskljucenom naplatom dira live Stripe racun',
    caught: () => {
      const mutant: typeof stripeSyncApplyGuard = (opts, env) => {
        if (!opts.apply) return null;
        if (!opts.fromExplicit) throw new Error('--apply trazi --from=db');
        const secret = String(env.STRIPE_SECRET_KEY ?? '');
        if (!secret) throw new Error('--apply trazi STRIPE_SECRET_KEY');
        return secret;
      };
      return stripeSyncSafetyProblems(stripeSyncParseArgs, mutant, stripeSyncSource()).some((p) => p.includes('bez --live'));
    },
    cleanBefore: () => stripeSyncSafetyProblems(stripeSyncParseArgs, stripeSyncApplyGuard, stripeSyncSource()).length === 0,
  },
  {
    id: 'naplata/stripe-sync-apply-sjeme-migracija',
    imitates: 'krug 4 (6d) / M2: gard se vraca na staru provjeru (fromExplicit umjesto from === "db"), pa --apply --from=migrations opet zrcali sjeme cijena iz migracija u Stripe umjesto zivog kataloga',
    caught: () => {
      const mutant: typeof stripeSyncApplyGuard = (opts, env) => {
        if (!opts.apply) return null;
        if (!opts.fromExplicit) throw new Error('--apply trazi --from=db');
        const secret = String(env.STRIPE_SECRET_KEY ?? '');
        if (!secret) throw new Error('--apply trazi STRIPE_SECRET_KEY');
        if (secret.startsWith('sk_live_') && !opts.live) throw new Error('--live');
        return secret;
      };
      return stripeSyncSafetyProblems(stripeSyncParseArgs, mutant, stripeSyncSource()).some((p) => p.includes('--from=migrations zrcali'));
    },
    cleanBefore: () => stripeSyncSafetyProblems(stripeSyncParseArgs, stripeSyncApplyGuard, stripeSyncSource()).length === 0,
  },
  {
    id: 'naplata/webhook-inline-nagrada-bez-ponovnog-citanja-povrata',
    imitates: 'krug 4 nalaz pregleda (6a): handler inline izdaje nagradu preporucitelju bez ponovnog citanja oznake povrata (upisane izmedju prvog citanja i ove tocke), pa puni povrat u tom prozoru ostavlja nagradu izdanu',
    caught: () => {
      const izvor = "  const { data: povratPrijeNagrade, error: povratPrijeNagradeErr } = await admin\n"
        + "    .from('webhook_events')\n"
        + "    .select('id')\n"
        + "    .eq('provider', PROVIDER)\n"
        + "    .eq('order_id', ev.orderId)\n"
        + "    .in('outcome_detail', REFUND_MARKERS)\n"
        + "    .limit(1);\n"
        + "  if (povratPrijeNagradeErr || dbRows(povratPrijeNagrade).length > 0) {\n"
        + "    console.error('webhook-mor referrer_reward_deferred', {\n"
        + "      orderId: ev.orderId,\n"
        + "      reason: povratPrijeNagradeErr ? 'refund_marker_lookup_failed' : 'refund_marker_present',\n"
        + "    });\n"
        + "  } else {\n";
      // Codex PR #217 (M2): blok nagrade cita ishod dodjele; mutacija uklanja samo ponovno citanje
      // oznake povrata ispred njega, a blok ostaje.
      const bezPonovnogCitanja = "  {\n";
      const src = webhookMorSource();
      if (!src.includes(izvor)) return false;
      const mutated = src.replace(izvor, bezPonovnogCitanja);
      return mutated !== src && !mutated.includes('povratPrijeNagrade');
    },
    cleanBefore: () => webhookMorSource().includes(
      "  if (povratPrijeNagradeErr || dbRows(povratPrijeNagrade).length > 0) {",
    ),
  },
  {
    id: 'naplata/webhook-markbonusdone-bez-uvjeta-pending',
    imitates: 'krug 4 nalaz pregleda (6a): markBonusDone oznacava obvezu izvrsenom i kad ju je puni povrat u medjuvremenu vec otkazao (cancelled), pa se otkaz izgubi',
    caught: () => {
      const izvor = "async function markBonusDone(admin: any, orderId: string, kind: BonusKind): Promise<void> {\n"
        + "  try {\n"
        + "    await admin.from('bonus_outbox')\n"
        + "      .update({ status: 'done', done_at: new Date().toISOString(), last_error: null })\n"
        + "      .eq('order_id', orderId).eq('kind', kind).eq('status', 'pending');\n"
        + "  } catch (e) {";
      const bezUvjeta = "async function markBonusDone(admin: any, orderId: string, kind: BonusKind): Promise<void> {\n"
        + "  try {\n"
        + "    await admin.from('bonus_outbox')\n"
        + "      .update({ status: 'done', done_at: new Date().toISOString(), last_error: null })\n"
        + "      .eq('order_id', orderId).eq('kind', kind);\n"
        + "  } catch (e) {";
      const src = webhookMorSource();
      if (!src.includes(izvor)) return false;
      const mutated = src.replace(izvor, bezUvjeta);
      const fnStart = mutated.indexOf('async function markBonusDone(');
      const fnEnd = fnStart >= 0 ? mutated.indexOf('\n}\n', fnStart) : -1;
      const fn = fnStart >= 0 && fnEnd > fnStart ? mutated.slice(fnStart, fnEnd) : '';
      return mutated !== src && !/\.eq\('status', 'pending'\)/.test(fn);
    },
    cleanBefore: () => {
      const src = webhookMorSource();
      const fnStart = src.indexOf('async function markBonusDone(');
      const fnEnd = fnStart >= 0 ? src.indexOf('\n}\n', fnStart) : -1;
      const fn = fnStart >= 0 && fnEnd > fnStart ? src.slice(fnStart, fnEnd) : '';
      return /\.eq\('status', 'pending'\)/.test(fn);
    },
  },
  {
    id: 'naplata/webhook-nadogradnja-bez-ponovnog-citanja-partial-refund',
    imitates: 'krug 4 nalaz pregleda (6b): bookUpgradePayment ne cita partial_refund_noted izvorne uplate ponovno prije pretvorbe, pa djelomican povrat zabiljezen izmedju checkouta i uplate nadogradnje prolazi s odbitkom punog iznosa',
    caught: () => {
      const izvor = "    if (source) {\n"
        + "      const partial = await readSourcePartiallyRefunded(admin, source.orderId ?? '');\n"
        + "      if (!partial.ok) {\n"
        + "        console.error('webhook-mor upgrade_source_lookup_failed', { orderId: ev.orderId, error: partial.error });\n"
        + "        await settle('failed', `upgrade_refund_lookup: ${partial.error}`);\n"
        + "        return json({ error: 'internal' }, 500);\n"
        + "      }\n"
        + "      source.partiallyRefunded = partial.partial;\n"
        + "    }\n\n";
      const src = webhookMorSource();
      if (!src.includes(izvor)) return false;
      const mutated = src.replace(izvor, '');
      const fnStart = mutated.indexOf('async function bookUpgradePayment(');
      const fnEnd = fnStart >= 0 ? mutated.indexOf('\n}\n', fnStart) : -1;
      const fn = fnStart >= 0 && fnEnd > fnStart ? mutated.slice(fnStart, fnEnd) : '';
      return mutated !== src && !fn.includes('readSourcePartiallyRefunded(');
    },
    cleanBefore: () => {
      const src = webhookMorSource();
      const fnStart = src.indexOf('async function bookUpgradePayment(');
      const fnEnd = fnStart >= 0 ? src.indexOf('\n}\n', fnStart) : -1;
      const fn = fnStart >= 0 && fnEnd > fnStart ? src.slice(fnStart, fnEnd) : '';
      return fn.includes('readSourcePartiallyRefunded(');
    },
  },
  {
    id: 'naplata/upgrade-idempotency-key-bez-iznosa',
    imitates: 'krug 4 nalaz pregleda (6e): kljuc idempotencije za nadogradnju ne nosi iznos, pa nova ciljna cijena (npr. promjena kataloga izmedju dva klika) vraca STARI PaymentIntent po starom iznosu umjesto novog',
    caught: () => {
      const stariKljuc = (userId: string, sourceEntitlementId: string, targetProductId: string, _amountCents: number): string =>
        `lekta:pi:upgrade:${userId}:${sourceEntitlementId}:${targetProductId}`;
      const a = stariKljuc('u1', 'ent1', 'pass_diplomski', 1999);
      const b = stariKljuc('u1', 'ent1', 'pass_diplomski', 2999);
      return a === b;
    },
    cleanBefore: () => {
      const a = upgradeIdempotencyKey('u1', 'ent1', 'pass_diplomski', 1999);
      const b = upgradeIdempotencyKey('u1', 'ent1', 'pass_diplomski', 2999);
      return a !== b;
    },
  },
  {
    id: 'naplata/stripe-sync-zastita-poslije-mreze',
    imitates: 'krug 4: main cita zivi katalog (mreza, service role) PRIJE provjere kljuca, pa odbijen --apply ipak zove Supabase',
    caught: () => {
      const src = stripeSyncSource();
      const guard = '  const secret = applyGuard(opts, env);\n';
      const read = "  const rows = opts.from === 'db' ? await catalogFromDb(env, fetchImpl) : catalogFromMigrations();\n";
      const mutated = src.replace(guard + read, read + guard);
      if (mutated === src) return false;
      return stripeSyncSafetyProblems(stripeSyncParseArgs, stripeSyncApplyGuard, mutated).some((p) => p.includes('prije provjere'));
    },
    cleanBefore: () => stripeSyncSafetyProblems(stripeSyncParseArgs, stripeSyncApplyGuard, stripeSyncSource()).length === 0,
  },
  {
    id: 'naplata/specijalisticki-fallback-na-diplomski-popravak',
    imitates: 'krug 2: billableMismatch za nize vrste zove samo dijeljenu unambiguousMismatch, koja specijalisticku naslovnicu mapira na diplomski, pa specijalisticki rad trosi diplomski slot (9,99 umjesto 16,99)',
    caught: () => {
      const mutant: typeof billableMismatch = (sel, sig, sug) =>
        billableMismatch(sel, sig.titleMarker === 'specialist' ? { ...sig, titleMarker: 'graduate' } : sig, sug);
      return specialistFallbackProblems(mutant, checkoutMismatch).some((p) => p.includes('repair-docx: specijalisticka naslovnica trosi'));
    },
    cleanBefore: () => specialistFallbackProblems(billableMismatch, checkoutMismatch).length === 0,
  },
  {
    id: 'naplata/specijalisticki-fallback-na-diplomski-kupnja',
    imitates: 'krug 2: checkoutMismatch provjerava samo klijentske vrste (isReportWorkType + unambiguousMismatch), pa se slot_diplomski prodaje za specijalisticki rad',
    caught: () => {
      const stari: typeof checkoutMismatch = (sel, sig, confirmed) => {
        if (confirmed || !sig || !sel || !isReportWorkType(sel)) return { block: false };
        const signals = { words: sig.words, titleMarker: (sig.titleMarker ?? null) as Parameters<typeof unambiguousMismatch>[1]['titleMarker'] };
        return unambiguousMismatch(sel, signals) ? { block: true, suggestedWorkType: estimateWorkType(signals).workType } : { block: false };
      };
      return specialistFallbackProblems(billableMismatch, stari).some((p) => p.includes('create-checkout: specijalisticka naslovnica kupuje diplomski'));
    },
    cleanBefore: () => specialistFallbackProblems(billableMismatch, checkoutMismatch).length === 0,
  },
  {
    id: 'naplata/povrat-nadogradnje-samo-u-logu',
    imitates: 'krug 2: puni povrat Repaira nadogradjenog prava gasi Final Pass, a uplata nadogradnje ostaje naplacena uz inbox processed/refunded; trag je samo redak u logu koji istekne',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src.replace("await settle('needs_manual_review', 'refunded', rucniPregled);", "await settle('processed', 'refunded');");
      if (mutated === src) return false;
      return upgradeRefundTraceProblems(mutated).some((p) => p.includes('bez trajnog traga'));
    },
    cleanBefore: () => upgradeRefundTraceProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/povrat-nadogradnje-bez-traga-izvorne-uplate',
    imitates: 'pola popravka: trajan trag samo za povrat izvorne uplate, a povrat uplate nadogradnje (placeni Repair ostaje bez prava) i dalje samo u logu',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src.replace('        rucniPregled = `upgrade_refunded: ${upgradeSources.join(\'; \')}`;\n', '');
      if (mutated === src) return false;
      return upgradeRefundTraceProblems(mutated).some((p) => p.includes('povrat uplate nadogradnje'));
    },
    cleanBefore: () => upgradeRefundTraceProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/povrat-nadogradnje-gasi-repair',
    imitates: 'krug 4 prvi pokusaj: puni povrat SAMO uplate nadogradnje gasi cijelo pravo u refunded, pa placeni Repair ostaje bez prava i bez re-checka (odjeljak 14)',
    caught: () => {
      const src = webhookMorSource();
      // Grana povrata bez vracanja: pricuvno gasenje se izvrsava uvijek.
      const mutated = src.replace('    if (upgradeIds.length > 0 && !nadogradnjaVracena) {', '    if (upgradeIds.length > 0) {');
      if (mutated === src) return false;
      return upgradeRefundTraceProblems(mutated).some((p) => p.includes('gasi pravo umjesto da ga vrati'));
    },
    cleanBefore: () => upgradeRefundTraceProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/istodobni-povrat-nadogradnje-gasi-repair',
    imitates: 'krug 4 nalaz pregleda: u bookUpgradePayment istodobni povrat (pretvorba pa oznaka) gasi pravo u refunded uz processed/refunded_before_payment, bez traga i bez placenog Repaira',
    caught: () => {
      const src = webhookMorSource();
      const start = src.indexOf('async function bookUpgradePayment(');
      const od = src.indexOf("    const { data: vracanje, error: vracanjeErr } = await admin.rpc('revert_entitlement_upgrade', {", start);
      const _do = src.indexOf('    // Stanje prije pretvorbe nije zapamceno', od);
      if (start < 0 || od < 0 || _do < 0) return false;
      const mutated = src.slice(0, od) + src.slice(_do);
      return upgradeRefundTraceProblems(mutated).some((p) => p.includes('istodobni povrat uplate nadogradnje'));
    },
    cleanBefore: () => upgradeRefundTraceProblems(webhookMorSource()).length === 0,
  },
  // --- naplata: F21 (docs/agents/orchestrator-backlog.md), zatvoreno u Monetizaciji V1 (M2) ---------
  {
    id: 'naplata/f21-povrat-ne-otkazuje-obvezu',
    imitates: 'F21 (1) stanje do 2026-09-27: closeRefundConsequences ne dira bonus_outbox, pa obveza referrer_reward ostaje pending i radnik je kasnije isplati za vracen novac',
    caught: () => {
      const src = webhookMorSource();
      const od = src.indexOf("    const { data: obveze, error: obvezeErr } = await admin\n      .from('bonus_outbox')");
      const _do = src.indexOf('    return {\n      ok: true,\n      manualOrderFound', od);
      if (od < 0 || _do < 0) return false;
      const mutated = src.slice(0, od) + src.slice(_do);
      return webhookHandlerProblems(mutated).some((p) => p.includes('ne otkazuje obvezu iz bonus_outbox'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/f21-korak-povrata-samo-u-logu',
    imitates: 'F21 (2) stanje do 2026-09-27: pad sporednog koraka povrata upisuje u inbox samo refund_consequences_failed, a korak i greska ostaju samo u logu koji istekne',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src.replace(
        "await settle('failed', 'refund_consequences_failed', `${posljedice.step}: ${posljedice.error}`);",
        "await settle('failed', 'refund_consequences_failed');",
      );
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes('ne zapisuje korak i gresku u inbox'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/f21-any-u-zatvaranju-placanja',
    imitates: 'F21 (3) stanje do 2026-09-27: closePaymentAfterRefund(admin: any, ...), pa krivo ime tablice ili stupca pri opozivu prolazi tsc i deno check',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src.replace('async function closePaymentAfterRefund(\n  admin: PaymentRefundDb,', 'async function closePaymentAfterRefund(\n  admin: any,');
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes('closePaymentAfterRefund prima admin: any'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/f21-catalog-price-unusable-odluka-ne-gleda-cijenu',
    imitates: 'F21 (4): druga grana garda catalog_price_unusable. cijenaUpotrebljiva se izracuna, ali odluka o iznosu je ne gleda, pa neupotrebljiva cijena (0 centi) i dalje ide u chargedAmountVerdict i daje pravo',
    caught: () => {
      const src = webhookMorSource();
      const mutated = src.replace('    cijenaUpotrebljiva\n      ? chargedAmountVerdict(ev, ocekivanoCenti)', '    true\n      ? chargedAmountVerdict(ev, ocekivanoCenti)');
      if (mutated === src) return false;
      return webhookHandlerProblems(mutated).some((p) => p.includes('odluka o iznosu ne ovisi o upotrebljivoj cijeni'));
    },
    cleanBefore: () => webhookHandlerProblems(webhookMorSource()).length === 0,
  },
  {
    id: 'naplata/f21-radnik-bez-provjere-povrata',
    imitates: 'F21 (1) strana radnika do 2026-09-27: process-bonus-outbox zove tryGrantReferrerReward izravno, bez citanja oznake povrata, pa isplacuje nagradu za vracen novac',
    caught: () => {
      const index = bonusOutboxIndexSource();
      const mutated = index.replace('await runReferrerRewardObligation(admin as unknown as ReferrerRewardDb, row);', "await tryGrantReferrerReward(admin, row.user_id, 'diplomski', row.order_id);");
      if (mutated === index) return false;
      return bonusOutboxWorkerProblems(bonusOutboxModuleSource(), mutated).some((p) => p.includes('mimo runReferrerRewardObligation'));
    },
    cleanBefore: () => bonusOutboxWorkerProblems(bonusOutboxModuleSource(), bonusOutboxIndexSource()).length === 0,
  },
  {
    id: 'naplata/f21-radnik-samo-prvo-citanje',
    imitates: 'pola popravka F21 na strani radnika: povrat se cita samo prije dodjele. Povrat koji stigne izmedju citanja i dodjele procita referral_signups prije nagrade, pa nagrada ostaje isplacena',
    caught: () => {
      const mod = bonusOutboxModuleSource();
      const od = mod.indexOf('  if (await orderFullyRefunded(admin, row.order_id)) {\n    // Povrat je stigao izmedju');
      const _do = mod.indexOf("  return 'granted';", od);
      if (od < 0 || _do < 0) return false;
      const mutated = mod.slice(0, od) + mod.slice(_do);
      return bonusOutboxWorkerProblems(mutated, bonusOutboxIndexSource()).some((p) => p.includes('ne cita povrat ponovno'));
    },
    cleanBefore: () => bonusOutboxWorkerProblems(bonusOutboxModuleSource(), bonusOutboxIndexSource()).length === 0,
  },
  {
    id: 'naplata/f21-radnik-pregazi-otkazano',
    imitates: 'radnik koji zavrsni status pise bez uvjeta: obvezu koju je webhook upravo otkazao (cancelled) vrati u done, pa trag otkazivanja nestane',
    caught: () => {
      const index = bonusOutboxIndexSource();
      const mutated = index.replace("          .eq('id', row.id)\n          .eq('status', 'pending');\n        done++;", "          .eq('id', row.id);\n        done++;");
      if (mutated === index) return false;
      return bonusOutboxWorkerProblems(bonusOutboxModuleSource(), mutated).some((p) => p.includes('done bez uvjeta pending'));
    },
    cleanBefore: () => bonusOutboxWorkerProblems(bonusOutboxModuleSource(), bonusOutboxIndexSource()).length === 0,
  },
  {
    id: 'naplata/rucno-vezivanje-bez-provjere-postojeceg-zapisa',
    imitates: 'runbook 5.1 iz design/naplata-4: postupak ne provjerava postoji li vec pravo ili rucna narudzba za isti order_id, pa operater upisuje drugi zapis ili vezuje uplatu koja je vec proknjizena drugom korisniku',
    caught: () => {
      const runbook = readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md'));
      const pocetak = runbook.indexOf('```sql', runbook.indexOf('**Obavezno prvo: postoji li'));
      const kraj = runbook.indexOf('```', pocetak + 6);
      if (pocetak < 0 || kraj < 0) return false;
      const mutated = runbook.slice(0, pocetak) + runbook.slice(kraj + 3);
      return runbookManualLinkProblems(mutated).some((p) => p.includes('postoji li vec pravo ili rucna narudzba'));
    },
    cleanBefore: () => runbookManualLinkProblems(readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md'))).length === 0,
  },
  {
    id: 'naplata/rucni-pregled-premium-kao-entitlement',
    imitates: 'runbook 5.1 iz design/naplata-4: jedini upis u postupku je insert into entitlements, pa premium_human (work_type null) nakon rucnog pregleda dobije pravo bez work_type umjesto rucne narudzbe',
    caught: () => {
      const runbook = readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md'));
      const upis = runbook.indexOf('insert into manual_orders');
      const pocetak = runbook.lastIndexOf('```sql', upis);
      const kraj = runbook.indexOf('```', upis);
      if (upis < 0 || pocetak < 0 || kraj < 0) return false;
      const bezNarudzbe = runbook.slice(0, pocetak) + runbook.slice(kraj + 3);
      const bezIskljucenja = runbook.replace(" and not p.manual_fulfillment\n", '\n');
      if (bezIskljucenja === runbook) return false;
      return runbookManualLinkProblems(bezNarudzbe).some((p) => p.includes('ne otvara rucnu narudzbu'))
        && runbookManualLinkProblems(bezIskljucenja).some((p) => p.includes('ne iskljucuje proizvod s rucnom obradom'));
    },
    cleanBefore: () => runbookManualLinkProblems(readTextLf(resolve(process.cwd(), 'docs', 'GO_LIVE_NAPLATA.md'))).length === 0,
  },
  {
    id: 'naplata/izvor-project-ref-se-ne-prosljedjuje',
    imitates: 'preflight koji --project-ref <ref> (oblik iz runbooka, projekt nije povezan) ne prosljedi Supabase CLI-ju: mjeri tajne povezanog ili nijednog projekta, a deploya u krivi projekt',
    caught: () => {
      const mutated = preflightIzvor().replace(
        "return i >= 0 && argv[i + 1] ? ['--project-ref', argv[i + 1]] : [];",
        'return [];',
      );
      return izvrsenaMutacijaUhvacena(mutated, ['ref-cisto'], ['zadano-cisto']);
    },
    cleanBefore: () => izvrseniBaselineCist(['ref-cisto'], ['zadano-cisto']),
  },
  {
    id: 'naplata/izvor-zabrane-preskocene-uz-project-ref',
    imitates: 'grane zabranjene tajne i testnog nacina uvjetovane izostankom --project-ref: deploy bez povezanog projekta (oblik iz runbooka) prolazi s postavljenim STRIPE_ACCOUNT_ID ili STRIPE_ALLOW_TEST_MODE=1, a zadani slucajevi to ne vide',
    caught: () => {
      const src = preflightIzvor();
      const mutated = zamijeniPojavu(src, 'if (!zabranjene.ok) {', 'if (!zabranjene.ok && projectRef.length === 0) {', 2).replace(
        "testModeVerdict(read.rows) && !argv.includes('--dopusti-testni-nacin')",
        "testModeVerdict(read.rows) && projectRef.length === 0 && !argv.includes('--dopusti-testni-nacin')",
      );
      if (!mutated.includes('projectRef.length === 0 && !argv')) return false;
      return izvrsenaMutacijaUhvacena(mutated, ['ref-zabranjena-tajna', 'ref-testni-ukljucen'], ['ref-cisto'])
        // Zadani slucajevi bez zastavice tu mutaciju NE vide; zato postoje slucajevi s refom.
        && preflightExecutionProblems(mutated, ['zadano-zabranjena-tajna', 'zadano-testni-ukljucen']).length === 0;
    },
    cleanBefore: () => izvrseniBaselineCist(
      ['ref-zabranjena-tajna', 'ref-testni-ukljucen', 'zadano-zabranjena-tajna', 'zadano-testni-ukljucen'],
      ['ref-cisto'],
    ),
  },

  // --- RLS: korisnik ne smije mijenjati vlastiti redak provenijencije ---------------------------
  {
    id: 'rls/corpus-contributions-update-own',
    imitates: 'policy corpus_contributions_update_own iz 0102: korisnik s vlastitim JWT-om mogao je PostgREST PATCH-em prepisati path, expires_at, consent_version i pseudonymization, dakle sam zapis o tome pod kojom je privolom sto pohranjeno',
    caught: () => {
      const files = corpusMigrations();
      // MUTACIJA u memoriji: makni 0203 iz POPISA (disk se ne dira). To je zatečeno stanje
      // repozitorija prije ove promjene, pa tvrdnja nije o izmisljenom kvaru.
      const bez0203 = files.filter((m) => !m.file.startsWith('0203_'));
      if (bez0203.length !== files.length - 1) return false;
      return parseCorpusPolicyHistory(bez0203).remaining.includes('corpus_contributions_update_own');
    },
    cleanBefore: () => {
      const history = parseCorpusPolicyHistory(corpusMigrations());
      // createdCount stiti od vakuuma: pokvaren izvod bi dao prazan skup i "cist" baseline.
      return history.createdCount >= 2 && history.remaining.length === 0;
    },
  },

  // --- prijenos konteksta `/` -> `/rad/`: bijela lista mora stvarno odbijati -------------------
  {
    id: 'handoff/bijela-lista-propusta-sve',
    imitates: 'bijela lista prijenosa s ulaza koja propusta svaki kljuc, pa redirect, token i utm_<script> s javne poveznice prezive navigaciju na /rad/ (audit 22. 9., nalaz #11)',
    caught: () => {
      // MUTACIJA u memoriji: prepisana je SAMO odluka o kljucu, ostalo radi kao prava izvedba.
      // To je najvjerojatniji oblik kvara, jer izgleda kao bezazleno pojednostavljenje.
      const propustaSve = (search: string | null | undefined): string => {
        if (search === null || search === undefined) return '';
        const serialized = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).toString();
        return serialized ? `?${serialized}` : '';
      };
      return handoffQueryProblems(propustaSve).length > 0;
    },
    // Baseline nad STVARNOM izvedbom: bez njega bi mutacija mogla prolaziti zato sto ugovor
    // vristi na sve, a ne zato sto je pogodio bas propusnu bijelu listu.
    cleanBefore: () => handoffQueryProblems(buildHandoffQuery).length === 0,
  },

  // --- prijenos konteksta: produkcijska veza u main.ts, ne samo ubrizgana ovisnost -------------
  {
    id: 'handoff/main-ts-gubi-location-search',
    imitates: 'refaktor ili merge koji iz src/routes/intake/main.ts izgubi `handoffSearch: window.location.search`, pa prijenos radi u testovima a u pregledniku ne postoji (audit 22. 9., nalaz #11)',
    caught: () => {
      const stvarni = readFileSync(resolve(process.cwd(), 'src/routes/intake/main.ts'), 'utf8');
      // MUTACIJA 1: redak nestaje, tocno onako kako bi ga izgubio revert ili merge.
      const bezRetka = stvarni.replace(/^.*handoffSearch\s*:.*$/m, '');
      // MUTACIJA 2: redak ostaje, ali je izvor zamijenjen praznim nizom. To je podmukliji oblik,
      // jer ovisnost je i dalje ondje pa povrsan pregled diffa ne vidi da je prijenos mrtav.
      const prazanIzvor = stvarni.replace(/handoffSearch\s*:\s*window\.location\.search/, "handoffSearch: ''");
      return intakeHandoffWiringProblems(bezRetka).length > 0
        && intakeHandoffWiringProblems(prazanIzvor).length > 0;
    },
    // Baseline nad STVARNIM izvorom: mutacija vrijedi samo ako cisto stanje daje prazan popis.
    cleanBefore: () => intakeHandoffWiringProblems(
      readFileSync(resolve(process.cwd(), 'src/routes/intake/main.ts'), 'utf8'),
    ).length === 0,
  },

  // --- session-bootstrap: brojac koji ne moze mjeriti mora priznati to, ne lagati nulom ---------
  {
    id: 'bootstrap/lazna-nula-umjesto-null',
    imitates: 'nalaz lekta-d3 2026-09-26: kad mjerenje testnih procesa ili slobodnog diska ne uspije, '
      + 'catch grana vrati 0 umjesto null, sto izgleda identicno stvarnoj nuli (tasklist /FO CSV /NH bez '
      + 'naredbenog retka i statfsSync bez fallbacka)',
    caught: () => {
      const stvarni = readFileSync(resolve(process.cwd(), 'scripts/agents/session-bootstrap.mjs'), 'utf8');
      // MUTACIJA 1: catch grana za slobodan disk vrati doslovnu nulu umjesto null.
      const diskLaznaNula = stvarni.replace(
        '} catch {\n    freeDiskGb = null;\n  }',
        '} catch {\n    freeDiskGb = 0;\n  }',
      );
      // MUTACIJA 2: catch grana za broj testnih procesa vrati doslovnu nulu umjesto null.
      const procesiLaznaNula = stvarni.replace(
        '} catch {\n    testProcessCount = null;\n  }',
        '} catch {\n    testProcessCount = 0;\n  }',
      );
      if (diskLaznaNula === stvarni || procesiLaznaNula === stvarni) return false; // nema sto mutirati
      return sessionBootstrapFalseZeroProblems(diskLaznaNula).length > 0
        && sessionBootstrapFalseZeroProblems(procesiLaznaNula).length > 0;
    },
    cleanBefore: () => sessionBootstrapFalseZeroProblems(
      readFileSync(resolve(process.cwd(), 'scripts/agents/session-bootstrap.mjs'), 'utf8'),
    ).length === 0,
  },
  // ---------------------------------------------------------------------------------------------
  // Z15, DRUGI KRUG: puno podnozje, traka nakon skrola, putujuca kvacica, kratki stepper, lijeno
  // podnozje. Gardovi su u `tests/helpers/site-footer-guards.ts`; baseline je STVARNA datoteka.
  // ---------------------------------------------------------------------------------------------
  {
    id: 'z15b/podnozje-stupac-izgubljen',
    imitates:
      'Pribor stupac ispadne iz punog podnozja pri preslagivanju markupa: kolofon ima tri stupca, ' +
      'a numeracija preskace 06 do 11, pa stranica tvrdi manje pribora nego sto postoji.',
    caught: () => {
      const foot = z15bPodnozje();
      const bez = foot.replace(/<nav class="site-footer__stupac" aria-label="Pribor">[\s\S]*?<\/nav>\n\s*/, '');
      return bez !== foot && fullFooterProblems(bez, z15bPredlozak()).some((p) => p.startsWith('kolofon ima 3 stupaca'));
    },
    cleanBefore: () => fullFooterProblems(z15bPodnozje(), z15bPredlozak()).length === 0,
  },
  {
    id: 'z15b/podnozje-copy-nije-doslovan',
    imitates:
      'Moto se "popravi" bez dijakritika ("Mjeri, ne pise.") ili se broj stavke pomakne: copy vise ' +
      'nije doslovan iz predloska, a nijedan vizualni test to ne vidi.',
    caught: () => {
      const foot = z15bPodnozje();
      const moto = foot.replace('Mjeri, ne piše.', 'Mjeri, ne pise.');
      const broj = foot.replace('<small>12</small>', '<small>21</small>');
      return moto !== foot && broj !== foot
        && fullFooterProblems(moto, z15bPredlozak()).some((p) => p.startsWith('moto'))
        && fullFooterProblems(broj, z15bPredlozak()).some((p) => p.startsWith('numeracija'));
    },
    cleanBefore: () => fullFooterProblems(z15bPodnozje(), z15bPredlozak()).length === 0,
  },
  {
    id: 'z15b/stanje-stola-vidljivo-bez-js',
    imitates:
      '`hidden` se izgubi sa "Stanja stola": bez JavaScripta stranica ispisuje prazne retke ' +
      '"Zadnji rad", "Pravila", "Izvori", dakle tvrdnje koje nije mogla procitati.',
    caught: () => {
      const foot = z15bPodnozje();
      const vidljivo = foot.replace('data-site-footer-stanje hidden>', 'data-site-footer-stanje>');
      return vidljivo !== foot && fullFooterProblems(vidljivo, z15bPredlozak()).some((p) => p.includes('nije skriveno'));
    },
    cleanBefore: () => fullFooterProblems(z15bPodnozje(), z15bPredlozak()).length === 0,
  },
  {
    id: 'z15b/podnozje-mrtva-poveznica',
    imitates:
      'Garancija se preimenuje u /jamstvo.html koju generator ne pece, ili kontakt dobije adresu ' +
      'mimo produkcijske konfiguracije: podnozje vodi u 404 ili na krivi sanducic.',
    caught: () => {
      const foot = z15bPodnozje();
      const mrtva = foot.replace('href="/garancija.html"', 'href="/jamstvo.html"');
      const mail = foot.replace(`mailto:${DEFAULT_PRODUCTION_CONFIG.contactEmail}`, 'mailto:info@lekta.hr');
      return mrtva !== foot && mail !== foot
        && footerLinkProblems(mrtva, z15bPoznate(), DEFAULT_PRODUCTION_CONFIG.contactEmail).some((p) => p.includes('/jamstvo.html'))
        && footerLinkProblems(mail, z15bPoznate(), DEFAULT_PRODUCTION_CONFIG.contactEmail).some((p) => p.includes('info@lekta.hr'));
    },
    cleanBefore: () => footerLinkProblems(z15bPodnozje(), z15bPoznate(), DEFAULT_PRODUCTION_CONFIG.contactEmail).length === 0,
  },
  {
    id: 'z15b/stanje-stola-prepisane-brojke',
    imitates:
      'Stanje stola dobije rucno upisanu brojku profila umjesto uvoza iz site-stats.json, ili ' +
      'povijest cita izravno iz localStorage mimo sigurnog omotaca (novi localStorage hack).',
    caught: () => {
      const izvor = readTextLf(resolve(process.cwd(), 'src/shared/site-footer-full.ts'));
      const baked = z15bPeceno();
      const rucno = izvor.replace('profiles: PROFILA,', `profiles: ${baked.profiles},`);
      const golo = izvor.replace('safeStorageGet(STORAGE_KEYS.history, null)', "JSON.parse(localStorage.getItem('lekta.history.v2') ?? 'null')");
      return rucno !== izvor && golo !== izvor
        && deskStateSourceProblems(rucno, baked).some((p) => p.includes(`${baked.profiles} je prepisana`))
        && deskStateSourceProblems(golo, baked).some((p) => p.includes('localStorage'));
    },
    cleanBefore: () => deskStateSourceProblems(readTextLf(resolve(process.cwd(), 'src/shared/site-footer-full.ts')), z15bPeceno()).length === 0,
  },
  {
    id: 'z15b/zamucenje-na-javnoj-stranici',
    imitates:
      'Tanko stanje trake vrati `backdrop-filter: blur(14px)` iz naloga (Z31 ga zabranjuje), ili ' +
      'novi javni list dobije zamucenje: svaki okvir skrola se tada racuna iznova.',
    caught: () => {
      const listovi = z15bJavniListovi();
      const traka = listovi.map((l) => (l.ime === 'src/shared/site-chrome.css'
        ? { ...l, css: l.css.replace('background: var(--desk);\n}', 'background: var(--desk);\n  backdrop-filter: blur(14px);\n}') }
        : l));
      const mutiranaTraka = traka.find((l) => l.ime === 'src/shared/site-chrome.css')!.css
        !== listovi.find((l) => l.ime === 'src/shared/site-chrome.css')!.css;
      const novi = [...listovi, { ime: 'src/shared/novi-list.css', css: '.x{-webkit-backdrop-filter:blur(4px)}' }];
      return mutiranaTraka
        && backdropFilterProblems(traka, Z15B_BACKDROP_DOPUSTENO).some((p) => p.startsWith('src/shared/site-chrome.css:'))
        && backdropFilterProblems(novi, Z15B_BACKDROP_DOPUSTENO).some((p) => p.startsWith('src/shared/novi-list.css:'));
    },
    cleanBefore: () => backdropFilterProblems(z15bJavniListovi(), Z15B_BACKDROP_DOPUSTENO).length === 0,
  },
  {
    id: 'z15b/tanko-stanje-prozirno',
    imitates:
      'Tanko stanje dobije prozirnu mjesavinu (color-mix 82%) kao u prvom krugu, ali bez zamucenja: ' +
      'sadrzaj prosijava kroz traku, a gard zamucenja to ne vidi.',
    caught: () => {
      const css = readTextLf(resolve(process.cwd(), 'src/shared/site-chrome.css'));
      const prozirno = css.replace(/(header\.site-chrome--scrolled \{[^}]*)background: var\(--desk\);/, '$1background: color-mix(in srgb, var(--desk) 82%, transparent);');
      return prozirno !== css && scrolledBarProblems(prozirno).includes('tanko stanje nema punu pozadinu var(--desk)');
    },
    cleanBefore: () => scrolledBarProblems(readTextLf(resolve(process.cwd(), 'src/shared/site-chrome.css'))).length === 0,
  },
  {
    id: 'z15b/kvacica-animira-left',
    imitates:
      'Kvacica se vrati na `left` iz predloska (Z31 trazi transform): u listu `transition: left`, ' +
      'u kodu `marker.style.left`, pa svaki pomak radi reflow trake.',
    caught: () => {
      const css = readTextLf(resolve(process.cwd(), 'src/shared/site-chrome.css'));
      const ts = readTextLf(resolve(process.cwd(), 'src/shared/site-chrome.ts'));
      const leftCss = css.replace('transition: transform .45s var(--ease-spring);', 'transition: left .45s var(--ease-spring);');
      const leftTs = ts.replace('marker.style.transform = `translateX(${x}px)`;', 'marker.style.left = `${x}px`;');
      return leftCss !== css && leftTs !== ts
        && markerMotionProblems(leftCss, ts).includes('kvacica animira left')
        && markerMotionProblems(css, leftTs).includes('kod pomice kvacicu kroz style.left');
    },
    cleanBefore: () => markerMotionProblems(
      readTextLf(resolve(process.cwd(), 'src/shared/site-chrome.css')),
      readTextLf(resolve(process.cwd(), 'src/shared/site-chrome.ts')),
    ).length === 0,
  },
  {
    id: 'z15b/kvacica-view-transition',
    imitates:
      '`view-transition-name: nav-marker` se vrati na kvacicu (F23): cross-document prijelazi su ' +
      'ugaseni zbog zamrznutog rAF-a, a imenovan element ulijece u prijelaze unutar dokumenta.',
    caught: () => {
      const css = readTextLf(resolve(process.cwd(), 'src/shared/site-chrome.css'));
      const vt = css.replace('transition: transform .45s var(--ease-spring);\n}', 'transition: transform .45s var(--ease-spring);\n  view-transition-name: nav-marker;\n}');
      return vt !== css && markerMotionProblems(vt, readTextLf(resolve(process.cwd(), 'src/shared/site-chrome.ts'))).some((p) => p.includes('view-transition-name'));
    },
    cleanBefore: () => markerMotionProblems(
      readTextLf(resolve(process.cwd(), 'src/shared/site-chrome.css')),
      readTextLf(resolve(process.cwd(), 'src/shared/site-chrome.ts')),
    ).length === 0,
  },
  {
    id: 'z15b/stepper-bez-kratkog-oblika',
    imitates:
      'Kratki oblik steppera za tanko stanje se izbrise ili natpis sakrije `display: none`: na ' +
      '1180px pilula opet pokazuje 6 znakova imena, ili natpis nestane i citacu ekrana.',
    caught: () => {
      const css = readTextLf(resolve(process.cwd(), 'src/shared/site-chrome.css'));
      const bez = css.replace('@container site-chrome-mid (max-width: 599px) {', '@container site-chrome-mid (max-width: 1px) {');
      const skriven = css.replace(/(@container site-chrome-mid \(max-width: 599px\) \{[\s\S]*?)clip-path: inset\(50%\);/, '$1display: none;');
      return bez !== css && skriven !== css
        && shortStepperProblems(bez).includes('nema kratkog steppera za tanko stanje (599px)')
        && shortStepperProblems(skriven).includes('natpis koraka (599px) se ne skriva clip-pathom');
    },
    cleanBefore: () => shortStepperProblems(readTextLf(resolve(process.cwd(), 'src/shared/site-chrome.css'))).length === 0,
  },
  {
    id: 'z15b/podnozje-u-statickom-grafu',
    imitates:
      'Traka puno podnozje uveze staticki (`import { mountFullFooter }` umjesto `import()`): svih ' +
      'trinaest stranica skida njegov kod i pecene brojke, a proracun od 8 KB to ne razdvaja.',
    caught: () => lazyFooterProblems(chromeGraph(z15bMetafile(true), 'src/shared/site-chrome.ts'))
      .includes('src/shared/site-footer-full.ts je u statickom grafu trake'),
    cleanBefore: () => lazyFooterProblems(chromeGraph(z15bMetafile(false), 'src/shared/site-chrome.ts')).length === 0,
  },
  // Z15 popravak: kvacica PUTUJE, tinta potpisa, lijeni komad. Mutanti kvacice i tinte su TEKST
  // stvarne funkcije, izvrsen kroz `funkcijaIzIzvora`; baseline je ista staza nad nemutiranim
  // izvorom I stvarni uvezeni modul.
  {
    id: 'z15b/kvacica-ne-putuje',
    imitates:
      'Pamcenje prvog postavljanja se izgubi (`const prvi = true;`, ili se `dataset.siteChromeMarkerX` ' +
      'vise ne upisuje, ili `transition: none` ostane nakon skoka): klik s "Kako radi" na "Cjenik" ' +
      'na /saznaj-vise/ skace umjesto da putuje .45s, a list i translateX ostaju isti.',
    caught: () => {
      const ts = z15bChromeTs();
      const uvijekPrvi = ts.replace('const prvi = marker.dataset.siteChromeMarkerX === undefined;', 'const prvi = true;');
      const bezPamcenja = ts.replace('  marker.dataset.siteChromeMarkerX = String(x);\n', '');
      const ostajeNone = ts.replace("    marker.style.removeProperty('transition');\n", '');
      return uvijekPrvi !== ts && bezPamcenja !== ts && ostajeNone !== ts
        && z15bKvacicaProblemi(uvijekPrvi).some((p) => p.startsWith('2. pomak skace'))
        && z15bKvacicaProblemi(bezPamcenja).some((p) => p.startsWith('2. pomak skace'))
        && z15bKvacicaProblemi(ostajeNone).some((p) => p.startsWith('nakon prvog postavljanja inline prijelaz ostaje "none"'));
    },
    cleanBefore: () => z15bKvacicaProblemi(z15bChromeTs()).length === 0 && markerTravelProblems(placeSiteChromeMarker).length === 0,
  },
  {
    id: 'z15b/kvacica-klizi-pri-ucitavanju',
    imitates:
      'Prvo postavljanje izgubi `transition: none` (`const prvi = false;`): na svakom ucitavanju ' +
      'kvacica klizi s lijevog ruba trake do aktivnog odredista, sto je sum, ne putovanje.',
    caught: () => {
      const ts = z15bChromeTs();
      const nikadPrvi = ts.replace('const prvi = marker.dataset.siteChromeMarkerX === undefined;', 'const prvi = false;');
      return nikadPrvi !== ts
        && z15bKvacicaProblemi(nikadPrvi).includes('prvo postavljanje nema transition: none prije pomaka; kvacica klizi pri ucitavanju');
    },
    cleanBefore: () => z15bKvacicaProblemi(z15bChromeTs()).length === 0,
  },
  {
    id: 'z15b/tinta-ne-ceka-pogled',
    imitates:
      'Tinta potpisa krene na prvom pikselu (`intersectionRatio >= 0`), promatrac izgubi prag .5 ' +
      '(`threshold: [0]`), ili potpis izvan pogleda ne dobiva `.motion-offscreen` (Z31): animacija ' +
      'se odvrti dok je potpis jos ispod ruba ili tece izvan pogleda.',
    caught: () => {
      const ts = z15bFooterTs();
      const odmah = ts.replace('unos.intersectionRatio >= 0.5', 'unos.intersectionRatio >= 0');
      const bezPraga = ts.replace('{ threshold: [0, 0.5] }', '{ threshold: [0] }');
      const bezOffscreen = ts.replace("      potpis.classList.toggle('motion-offscreen', !unos.isIntersecting);\n", '');
      return odmah !== ts && bezPraga !== ts && bezOffscreen !== ts
        && z15bTintaProblemi(odmah).includes('tinta na 49% vidljivosti (prag je .5)')
        && z15bTintaProblemi(bezPraga).some((p) => p.startsWith('pragovi promatraca su [0]'))
        && z15bTintaProblemi(bezOffscreen).includes('izvan pogleda potpis nema .motion-offscreen');
    },
    cleanBefore: () => z15bTintaProblemi(z15bFooterTs()).length === 0
      && inkObserverProblems(wireInkSignature, document, INK_CLASS).length === 0,
  },
  {
    id: 'z15b/tinta-ignorira-prigusen-pokret',
    imitates:
      'Provjera `pokretPrigusen` ispadne iz `wireInkSignature`: uz rucno prigusen pokret potpis ' +
      'ceka skrol i animira se, umjesto da je odmah popunjen.',
    caught: () => {
      const ts = z15bFooterTs();
      const bezProvjere = ts.replace('if (pokretPrigusen(doc) || !view', 'if (!view');
      return bezProvjere !== ts
        && z15bTintaProblemi(bezProvjere).includes('pod prigusenim pokretom potpis nije odmah popunjen');
    },
    cleanBefore: () => z15bTintaProblemi(z15bFooterTs()).length === 0,
  },
  {
    id: 'z15b/tinta-reduced-motion-prazan-obris',
    imitates:
      'Pod `prefers-reduced-motion` (ili `data-motion="reduce"`) ostane samo `animation: none` bez ' +
      '`background-position: 0 0`: animacija je ugasena, ali potpis ostaje prazan obris zauvijek.',
    caught: () => {
      const css = z15bChromeCss();
      const pun = '.site-footer__potpis-slovo { animation: none !important; background-position: 0 0; }';
      const prazan = '.site-footer__potpis-slovo { animation: none !important; }';
      const medij = css.replace(`  ${pun}`, `  ${prazan}`);
      const atribut = css.replace(`:root[data-motion="reduce"] ${pun}`, `:root[data-motion="reduce"] ${prazan}`);
      return medij !== css && atribut !== css
        && inkSignatureCssProblems(medij).some((p) => p.startsWith('pod prefers-reduced-motion potpis nije odmah pun'))
        && !inkSignatureCssProblems(medij).some((p) => p.startsWith('pod data-motion'))
        && inkSignatureCssProblems(atribut).some((p) => p.startsWith('pod data-motion="reduce" potpis nije odmah pun'));
    },
    cleanBefore: () => inkSignatureCssProblems(z15bChromeCss()).length === 0,
  },
  {
    id: 'z15b/tinta-kroz-background-size',
    imitates:
      'Tinta se prepise kako radi predlozak (`background-size` 0% do 100%, Z31 to zabranjuje jer ' +
      'svaki okvir racuna raspored slike), ili trajanje odluta s 1.4s.',
    caught: () => {
      const css = z15bChromeCss();
      const size = css.replace(
        'from { background-position: 100% 0; }\n  to { background-position: 0 0; }',
        'from { background-size: 0% 100%; }\n  to { background-size: 100% 100%; }',
      );
      const brzo = css.replace('animation: siteFooterTinta 1.4s var(--ease-spring) both;', 'animation: siteFooterTinta .6s var(--ease-spring) both;');
      return size !== css && brzo !== css
        && inkSignatureCssProblems(size).some((p) => p.startsWith('keyframes tinte animiraju background-size'))
        && inkSignatureCssProblems(brzo).some((p) => p.startsWith('tinta je "siteFooterTinta .6s'));
    },
    cleanBefore: () => inkSignatureCssProblems(z15bChromeCss()).length === 0,
  },
  {
    id: 'z15b/lijeni-komad-prerastao',
    imitates:
      'Lijeno podnozje naraste preko 3 KB gzip (npr. uvoz cijelog site-stats.json s nazivima jedinica): ' +
      'proracun trake zbraja samo staticki graf, pa bi rast prosao bez signala.',
    caught: () => z15bLijeniProblemi(z15bMetafile(false), MAX_LAZY_FOOTER_JS_GZIP + 1)
      .includes(`lijeni komad je ${MAX_LAZY_FOOTER_JS_GZIP + 1} B gzip, granica ${MAX_LAZY_FOOTER_JS_GZIP} B`),
    cleanBefore: () => z15bLijeniProblemi(z15bMetafile(false), 1174).length === 0,
  },
  {
    id: 'z15b/drugi-lijeni-uvoz',
    imitates:
      'Traka dobije drugi dinamicki uvoz (`import(\'../ui/app\')`): njegov komad je lijen, pa ga ne ' +
      'vidi ni proracun od 8 KB ni `lazyFooterProblems`, a stranica ga svejedno skida.',
    caught: () => z15bLijeniProblemi(z15bMetafileDrugiLijeni(), 1174)
      .some((p) => p.startsWith('lijeni ulazi trake su ["src/shared/site-footer-full.ts","src/ui/app.ts"]')),
    cleanBefore: () => z15bLijeniProblemi(z15bMetafile(false), 1174).length === 0,
  },

  // --- clean-vitest-tmp: gard procesa i starost po najnovijoj datoteci ------------------------
  // Sve nad datotecnim sustavom U MEMORIJI (pravilo 1 ovog testa); brisanje je ubrizgan `rm` koji
  // samo biljezi putanju. Baseline je stvarni planCleanup/executePlan iz skripte.
  {
    id: 'clean-tmp/gard-procesa-uklonjen',
    imitates: 'scripts/clean-vitest-tmp.mjs bez garda procesa: dok zivi vitest pise u <nanoid>/web, '
      + 'ciscenje prije gatea brise njegovu mapu i rusi tudji run (ENOENT ...\\Temp\\<nanoid>\\web\\<sha1>, 26. 9.)',
    caught: () => {
      const bezGarda = cleanTmpRun(cleanTmpOldFs(), CT_LIVE_VITEST, { guard: () => ({ ok: true }) });
      return bezGarda.rmCalls.includes(CT_NANO);
    },
    cleanBefore: () => {
      // Stvarni gard uz ziv vitest: nista se ne brise, mapa je zadrzana.
      const zivi = cleanTmpRun(cleanTmpOldFs(), CT_LIVE_VITEST);
      // Ista fixtura bez vitesta SE brise, pa je gard (a ne fixtura) ono sto je cuva.
      const mirno = cleanTmpRun(cleanTmpOldFs(), CT_QUIET);
      return zivi.rmCalls.length === 0
        && zivi.plan.held.some((h) => h.path === CT_NANO)
        && mirno.rmCalls.length === 1 && mirno.rmCalls[0] === CT_NANO;
    },
  },
  {
    id: 'clean-tmp/starost-po-mtime-mape',
    imitates: 'zamka 26. 9.: starost <nanoid> mape racunata po mtime korijena mape, koji se ne osvjezava '
      + 'dok Vitest pise u postojece podmape, pa je ciscenje obrisalo mapu zivog gatea (466 umjesto 613 test datoteka)',
    caught: () => {
      const poMapi = (dir: string, maxEntries: number, fs: CleanTmpFs) => {
        const m = measureDir(dir, maxEntries, fs);
        return m.status === 'ok' ? { ...m, newestMs: fs.lstat(dir).mtimeMs } : m;
      };
      return cleanTmpRun(cleanTmpTrapFs(), CT_QUIET, { measure: poMapi }).rmCalls.includes(CT_NANO);
    },
    cleanBefore: () => {
      const fs = cleanTmpTrapFs();
      // Generator dokazuje klasu ulaza: korijen mape i web/ stari, datoteka unutra svjeza.
      const staro = (p: string) => CT_NOW - fs.lstat(p).mtimeMs >= CT_THRESHOLD;
      if (!staro(CT_NANO) || !staro(join(CT_NANO, 'web')) || staro(CT_FRESH_FILE)) return false;
      const stvarni = cleanTmpRun(fs, CT_QUIET);
      return stvarni.rmCalls.length === 0 && stvarni.plan.young.some((i) => i.path === CT_NANO);
    },
  },
  // --- clean-vitest-tmp stavka G: ostaci testova i alata (24 h, gard po vrsti, Temp/claude) ---
  {
    id: 'clean-tmp/ostaci-vitestovim-pragom',
    imitates: 'stavka G s pragom od 2 h umjesto 24 h: profil preglednika zivog Playwright e2e runa ili mkdtemp mapa '
      + 'testa koji traje dulje od 2 h bez pisanja (release gate fixture) obrise se usred runa',
    caught: () => cleanTmpRun(ctLeftoverFs(CT_PROFILE, 3 * CT_HOUR), CT_QUIET, { leftoverThresholdMs: CT_THRESHOLD })
      .rmCalls.includes(CT_PROFILE),
    cleanBefore: () => {
      // Stvarni prag: 3 h star profil je mlad, 30 h star se brise (pa fixtura nije vakuumski mlada).
      const mlad = cleanTmpRun(ctLeftoverFs(CT_PROFILE, 3 * CT_HOUR), CT_QUIET);
      const star = cleanTmpRun(ctLeftoverFs(CT_PROFILE, 30 * CT_HOUR), CT_QUIET);
      return mlad.rmCalls.length === 0 && mlad.plan.young.some((i) => i.path === CT_PROFILE)
        && star.rmCalls.length === 1 && star.rmCalls[0] === CT_PROFILE;
    },
  },
  {
    id: 'clean-tmp/ostaci-bez-garda-procesa',
    imitates: 'stavka G bez garda po vrsti: preglednik koji Playwright drzi otvorenim s --user-data-dir na '
      + 'profilu kojemu se datoteke dugo ne mijenjaju izgubi profil ispod sebe',
    caught: () => cleanTmpRun(ctLeftoverFs(CT_PROFILE, 30 * CT_HOUR), CT_LIVE_BROWSER, { guard: () => ({ ok: true }) })
      .rmCalls.includes(CT_PROFILE),
    cleanBefore: () => {
      const zivi = cleanTmpRun(ctLeftoverFs(CT_PROFILE, 30 * CT_HOUR), CT_LIVE_BROWSER);
      const mirno = cleanTmpRun(ctLeftoverFs(CT_PROFILE, 30 * CT_HOUR), CT_QUIET);
      return zivi.rmCalls.length === 0 && zivi.plan.held.some((h) => h.path === CT_PROFILE)
        && mirno.rmCalls.length === 1;
    },
  },
  {
    id: 'clean-tmp/temp-claude-nije-izuzet',
    imitates: 'ciscenje kojemu os.tmpdir() pokazuje u Temp/claude: brise stare lekta-* mape radnog prostora sesija '
      + 'i worktreeova workflow runova (Temp/claude/lekta-wf), koje cisti drugi proces',
    caught: () => {
      const dir = join(CT_CLAUDE_ROOT, 'lekta-release-gate-valid-0aZUKz');
      const fs = ctLeftoverFs(dir, 90 * CT_HOUR, CT_CLAUDE_ROOT);
      return cleanTmpRun(fs, CT_QUIET, { root: CT_CLAUDE_ROOT, protectedRoot: () => false }).rmCalls.includes(dir);
    },
    cleanBefore: () => {
      const dir = join(CT_CLAUDE_ROOT, 'lekta-release-gate-valid-0aZUKz');
      const stvarni = cleanTmpRun(ctLeftoverFs(dir, 90 * CT_HOUR, CT_CLAUDE_ROOT), CT_QUIET, { root: CT_CLAUDE_ROOT });
      // Isti sadrzaj izvan Temp/claude se brise: zastita korijena, a ne fixtura, je ono sto cuva.
      const izvanDir = join(CT_ROOT, 'lekta-release-gate-valid-0aZUKz');
      const izvan = cleanTmpRun(ctLeftoverFs(izvanDir, 90 * CT_HOUR), CT_QUIET);
      return stvarni.plan.blocked !== null && stvarni.rmCalls.length === 0
        && izvan.rmCalls.length === 1 && izvan.rmCalls[0] === izvanDir;
    },
  },
  {
    id: 'clean-tmp/temp-claude-samo-po-tekstu',
    imitates: 'Codex krug 2 (M1): izuzece Temp/claude/** provjereno samo po tekstu putanje; korijen koji je junction '
      + 'u Temp/claude/lekta-wf (tekst ga ne odaje) izgubi radni prostor sesija i worktreeove runova',
    // Mutacija: sustav bez realpatha (kao prije popravka) vidi samo tekst putanje korijena.
    caught: () => {
      const dir = join(CT_VIEW_ROOT, 'lekta-release-gate-valid-0aZUKz');
      const { lstat, readdir } = ctViewFs(dir);
      return cleanTmpRun({ lstat, readdir }, CT_QUIET, { root: CT_VIEW_ROOT }).rmCalls.includes(dir);
    },
    cleanBefore: () => {
      const dir = join(CT_VIEW_ROOT, 'lekta-release-gate-valid-0aZUKz');
      const stvarni = cleanTmpRun(ctViewFs(dir), CT_QUIET, { root: CT_VIEW_ROOT });
      // Isti korijen s realpathom izvan Temp/claude se cisti: realpath (a ne fixtura) je ono sto cuva.
      const izvan = cleanTmpRun({ ...ctViewFs(dir), realpath: (p: string) => p }, CT_QUIET, { root: CT_VIEW_ROOT });
      return stvarni.plan.blocked !== null && /realpath/.test(stvarni.plan.blocked) && stvarni.rmCalls.length === 0
        && izvan.rmCalls.length === 1 && izvan.rmCalls[0] === dir;
    },
  },
  // --- register-clean-task.ps1 stavka G: ime Scheduled Taska bez ':' i drugih nedopustenih znakova ---
  {
    id: 'register-clean-task/ime-taska-nedopusteni-znak',
    imitates: "izmjereno 2026-09-28: ':' u imenu Scheduled Taska ('Lekta clean:tmp') obara "
      + "Register-ScheduledTask s 'The parameter is incorrect' (HRESULT 0x80070057); -DryRun to ne otkriva",
    cleanBefore: () => registerCleanTaskNameProblems(
      readFileSync(REGISTER_CLEAN_TASK_SCRIPT, 'utf8'),
    ).length === 0,
    caught: () => registerCleanTaskNameProblems(
      readFileSync(REGISTER_CLEAN_TASK_SCRIPT, 'utf8').replace("$TaskName = 'Lekta clean-tmp'", "$TaskName = 'Lekta clean:tmp'"),
    ).length > 0,
  },
  // --- register-clean-task.ps1 stavka G: -TaskName kao PARAMETAR odbija nedopustene znakove ---
  {
    id: 'register-clean-task/taskname-parametar-nedopusteni-znak',
    imitates: "prosirenje gard a474690e na -TaskName PARAMETAR: provjera nad $TaskName.Contains($znak) "
      + 'ispise poruku ali ne izadje s exit 1, pa Register-ScheduledTask ipak dobije ime s nedopustenim '
      + "znakom i padne tek u OS-u s 'The parameter is incorrect'",
    cleanBefore: () => registerCleanTaskParamNameProblems(
      readFileSync(REGISTER_CLEAN_TASK_SCRIPT, 'utf8'),
    ).length === 0,
    caught: () => registerCleanTaskParamNameProblems(
      readFileSync(REGISTER_CLEAN_TASK_SCRIPT, 'utf8').replace(
        /(\$TaskName\.Contains\(\$znak\)\)\s*\{\r?\n(?:.*\r?\n)*?)\s*exit 1\r?\n/,
        '$1',
      ),
    ).length > 0,
  },
  {
    id: 'register-clean-task/execute-provjera-uklonjena',
    imitates: 'Test-LektaCleanTaskOwned bez provjere leaf Execute (Codex nalaz, M1): tudji Scheduled Task s '
      + 'istim Arguments i WorkingDirectory ali Execute=powershell.exe ili cmd.exe se prihvaca kao nas, pa '
      + '-Unregister obrise tudji task ili registracija tiho preuzme njegovo mjesto',
    caught: () => {
      const izvorno = readTextLf(resolve(process.cwd(), 'scripts/register-clean-task.ps1'));
      const bezProvjere = izvorno.replace(
        "  if ($leafExecute -ne 'node' -and $leafExecute -ne 'node.exe') { return $false }\n",
        '',
      );
      return bezProvjere !== izvorno && registerCleanTaskExecuteGuardProblems(bezProvjere).length > 0;
    },
    cleanBefore: () => registerCleanTaskExecuteGuardProblems(
      readTextLf(resolve(process.cwd(), 'scripts/register-clean-task.ps1')),
    ).length === 0,
  },
  {
    id: 'clean-tmp/executeplan-bez-ponovne-realpath-provjere',
    imitates: 'clean-vitest-tmp.mjs M3 (Codex krug 3): executePlan bez ponovne realpath provjere neposredno '
      + 'prije rmSync, pa korijen ili kandidat zamijenjen junctionom prema Temp/claude izmedju planiranja i '
      + 'izvrsenja (TOCTOU) brise tudji radni prostor sesije ili worktree workflow runa',
    caught: () => {
      const izvorno = readTextLf(resolve(process.cwd(), 'scripts/clean-vitest-tmp.mjs'));
      const bezRootProvjere = removeBetweenMarkers(
        izvorno,
        '  let rootRealpathNow;',
        '\n\n  for (const item of plan.remove) {\n',
      );
      const bezSvega = removeBetweenMarkers(
        bezRootProvjere,
        '    if (!isDirectChildOf(plan.root, item.path)) {',
        '\n    if (result.dryRun) {',
      );
      return bezSvega !== izvorno && executePlanRecheckProblems(bezSvega).length > 0;
    },
    cleanBefore: () => executePlanRecheckProblems(readTextLf(resolve(process.cwd(), 'scripts/clean-vitest-tmp.mjs'))).length === 0,
  },
  // --- Word check skripte: izlazni direktorij se brise SAMO na uspjehu (stavka G) ---
  {
    id: 'word-verify/outdir-brisan-i-na-padu',
    imitates: 'Word check skripta brise .tmp-word-verify/.tmp-word-corpus i kad padne, pa nestanu popravljeni '
      + 'paketi koje Word nije otvorio, jedini dokaz za dijagnozu Tier 2 pada',
    // Mutacija u SVAKOJ skripti: uz poziv na uspjehu doda isti poziv u prvu granu pada (ispred exit 1).
    caught: () => WORD_VERIFY_CLEANUP_SCRIPTS.every((rel) => {
      const lines = readTextLf(resolve(process.cwd(), rel)).split('\n');
      const pad = lines.findIndex((l) => /\bexit 1\b/.test(l));
      if (pad < 0 || !lines.some((l) => /^Remove-WordVerifyOutDir -Dir/.test(l))) return false;
      const indent = /^\s*/.exec(lines[pad] ?? '')?.[0] ?? '';
      const mutirano = [...lines];
      mutirano.splice(pad, 0, `${indent}Remove-WordVerifyOutDir -Dir $OutDir -RepoRoot $root`);
      return wordVerifyCleanupProblems(mutirano.join('\n')).length > 0;
    }),
    cleanBefore: () => WORD_VERIFY_CLEANUP_SCRIPTS.every(
      (rel) => wordVerifyCleanupProblems(readTextLf(resolve(process.cwd(), rel))).length === 0,
    ),
  },
  {
    id: 'word-verify/outdir-bez-granice-repozitorija',
    imitates: 'Word check skripta pozvana s -OutDir tests/fixtures/docx (ili putanjom izvan repozitorija) na uspjehu '
      + 'rekurzivno obrise commitani korpus ili tudju mapu',
    caught: () => {
      const izvorno = readTextLf(resolve(process.cwd(), WORD_VERIFY_CLEANUP_HELPER));
      const bezGranice = izvorno.replace('if (-not $roditelj.Equals($korijen, $cmp)) {', 'if ($false) {');
      return bezGranice !== izvorno && wordVerifyHelperProblems(bezGranice).length > 0;
    },
    cleanBefore: () => wordVerifyHelperProblems(readTextLf(resolve(process.cwd(), WORD_VERIFY_CLEANUP_HELPER))).length === 0,
  },
  {
    id: 'word-verify/outdir-bez-allowliste',
    imitates: 'Codex krug 2 (B1): `check.ps1 -SkipMake -OutDir node_modules` bez ijednog DOCX-a ima $fail = 0, a '
      + 'node_modules je git-ignoriran i bez pracenih datoteka, pa ga funkcija bez allowliste imena rekurzivno obrise',
    // Mutacija: uklonjena allowlista (uvjet imena nikad ne odustaje) ili prosirena na tudje ime.
    caught: () => {
      const izvorno = readTextLf(resolve(process.cwd(), WORD_VERIFY_CLEANUP_HELPER));
      const bezAllowliste = izvorno.replace('if (-not $dozvoljeno) {', 'if ($false) {');
      const sira = izvorno.replace(WORD_VERIFY_ALLOWLIST_LINE, WORD_VERIFY_ALLOWLIST_LINE.replace(')', ", 'node_modules')"));
      return bezAllowliste !== izvorno && sira !== izvorno
        && wordVerifyHelperProblems(bezAllowliste).length > 0 && wordVerifyHelperProblems(sira).length > 0;
    },
    cleanBefore: () => {
      const izvorno = readTextLf(resolve(process.cwd(), WORD_VERIFY_CLEANUP_HELPER));
      return wordVerifyHelperProblems(izvorno).length === 0 && izvorno.includes(WORD_VERIFY_ALLOWLIST_LINE);
    },
  },
  {
    id: 'word-verify/outdir-bez-broja-provjerenih',
    imitates: 'Codex krug 2 (B1): Word check skripta koja nije provjerila nijedan dokument ($fail = 0 nad praznim '
      + 'skupom) brise izlazni direktorij kao da je uspjela',
    caught: () => {
      const izvorno = readTextLf(resolve(process.cwd(), WORD_VERIFY_CLEANUP_HELPER));
      const bezBroja = izvorno.replace('if ($CheckedCount -le 0) {', 'if ($false) {');
      const skripte = WORD_VERIFY_CLEANUP_SCRIPTS.every((rel) => {
        const src = readTextLf(resolve(process.cwd(), rel));
        const bezBrojanja = src.replace(/\n\s+\$provjereno\+\+\n/, '\n');
        return bezBrojanja !== src && wordVerifyCleanupProblems(bezBrojanja).length > 0;
      });
      return bezBroja !== izvorno && wordVerifyHelperProblems(bezBroja).length > 0 && skripte;
    },
    cleanBefore: () => wordVerifyHelperProblems(readTextLf(resolve(process.cwd(), WORD_VERIFY_CLEANUP_HELPER))).length === 0
      && WORD_VERIFY_CLEANUP_SCRIPTS.every((rel) => wordVerifyCleanupProblems(readTextLf(resolve(process.cwd(), rel))).length === 0),
  },
  {
    id: 'word-verify/outdir-kroz-junction',
    imitates: 'Codex krug 2 (B1): .tmp-word-verify je junction na tudju mapu (ili sadrzi junction), a rekurzivno '
      + 'brisanje na uspjehu obrise sadrzaj cilja',
    caught: () => {
      const izvorno = readTextLf(resolve(process.cwd(), WORD_VERIFY_CLEANUP_HELPER));
      const bezReparsea = izvorno.replace('if ($null -ne $reparse) {', 'if ($false) {');
      return bezReparsea !== izvorno && wordVerifyHelperProblems(bezReparsea).length > 0;
    },
    cleanBefore: () => wordVerifyHelperProblems(readTextLf(resolve(process.cwd(), WORD_VERIFY_CLEANUP_HELPER))).length === 0,
  },
  {
    id: 'word-verify/outdir-bez-git-provjere',
    imitates: 'Word check skripta pozvana s -OutDir docs (unutar repozitorija, pracen) na uspjehu rekurzivno obrise '
      + 'commitanu mapu jer gard gleda samo granicu repozitorija i tests/fixtures',
    caught: () => {
      const izvorno = readTextLf(resolve(process.cwd(), WORD_VERIFY_CLEANUP_HELPER));
      const bezGita = izvorno.replace('if (-not $ignoriran -or $praceno.Count -gt 0) {', 'if ($false) {');
      return bezGita !== izvorno && wordVerifyHelperProblems(bezGita).length > 0;
    },
    cleanBefore: () => wordVerifyHelperProblems(readTextLf(resolve(process.cwd(), WORD_VERIFY_CLEANUP_HELPER))).length === 0,
  },
  {
    id: 'word-verify/prazan-skup-nije-crveno',
    imitates: 'Codex krug 3, M2: check skripta koja nije stvarno otvorila nijedan dokument ($provjereno '
      + 'ostaje 0, npr. jer je $rows prazan ili je Word.Documents.Open pao prije brojanja) i dalje ispise '
      + '"SVE PROSLO" i obrise izlazni direktorij kao da je uspjeh, umjesto da prazan skup tretira kao pad',
    caught: () => WORD_VERIFY_EMPTY_SET_SCRIPTS.every((rel) => {
      const izvorno = readTextLf(resolve(process.cwd(), rel));
      const bezProvjere = izvorno.replace(
        /[ \t]*if \(\$provjereno -eq 0\) \{\n(?:.*\n)*?[ \t]*exit 1\n[ \t]*\}\n/,
        '',
      );
      return bezProvjere !== izvorno && wordVerifyEmptySetGuardProblems(bezProvjere).length > 0;
    }),
    cleanBefore: () => WORD_VERIFY_EMPTY_SET_SCRIPTS.every((rel) =>
      wordVerifyEmptySetGuardProblems(readTextLf(resolve(process.cwd(), rel))).length === 0),
  },
  // --- Laya v2 (docs/laya/LAYA_V2_SPEC.md): savjetodavni procjenitelj nikad ne ulazi u istinu Lekte ---
  {
    id: 'laya/src-uvozi-layu',
    imitates: 'src modul koji prije shadow GO odluke uveze Laya ugovor (static ili dynamic import), pa Laya tiho postane dio javnog bundlea i kriticnog puta analize',
    caught: () => srcLayaImportProblems([{ path: 'src/analysis/x.ts', source: "import { adjudicate } from '../../scripts/laya/contracts-v2.ts';" }]).length === 1
      && srcLayaImportProblems([{ path: 'src/analysis/y.ts', source: "const m = await import('../adjudication/laya-view-model');" }]).length === 1,
    cleanBefore: () => srcLayaImportProblems([{ path: 'src/analysis/x.ts', source: "import { buildTriage } from './triage';\n// layout nije laya, await import(nesto) u komentaru\nconst m = await import('./lazy');" }]).length === 0,
  },
  {
    id: 'laya/src-zaobilazi-gard',
    imitates: 'src ucita Layu kroz require ili sastavljeni dinamicki specifikator (Codex A2 na #149), pa tekstualni gard ne vidi putanju',
    caught: () => srcLayaImportProblems([{ path: 'src/a.ts', source: "const c = require('../../scripts/laya/contracts-v2.ts');" }]).length === 1
      && srcLayaImportProblems([{ path: 'src/b.ts', source: "const m = await import('scripts/' + 'laya/contracts-v2.ts');" }]).length === 1
      && srcLayaImportProblems([{ path: 'src/c.ts', source: 'const m = await import(`../${dir}/contracts-v2.ts`);' }]).length === 1,
    cleanBefore: () => srcLayaImportProblems([{ path: 'src/a.ts', source: "const m = await import('./report');\nimport x from '../scoring/checks';" }]).length === 0,
  },
  {
    id: 'laya/presuda-bez-kalibracije',
    imitates: 'upstream confidence prihvacen kao istina: odgovor s answerConfidence 1.0 postaje presuda iako za taj modelDigest ne postoji izmjereni prag',
    caught: () => adjudicate({ ...makeResult(), answerConfidence: 1 }, makeCase(), makeRuntime(), null).status === 'no_adjudication',
    cleanBefore: () => adjudicate(makeResult(), makeCase(), makeRuntime(), makePolicy()).status === 'adjudicated',
  },
  {
    id: 'laya/tezine-drift',
    imitates: 'runtime ucita druge tezine pod istim modelId-jem (novi download ili kvantizacija), a presuda se i dalje veze uz stari kalibrirani prag',
    caught: () => adjudicate({ ...makeResult(), runtime: { ...makeRuntime(), weightsSha256: '0'.repeat(64) } }, makeCase(), makeRuntime(), makePolicy()).status === 'no_adjudication',
    cleanBefore: () => adjudicate(makeResult(), makeCase(), makeRuntime(), makePolicy()).status === 'adjudicated',
  },
  {
    id: 'laya/odgovor-za-stari-ulaz',
    imitates: 'cache vrati odgovor za prijasnju verziju zapisa (isti caseId, drugi tekst), pa se presuda pripise ulazu koji model nije vidio',
    caught: () => adjudicate({ ...makeResult(), inputDigest: 'f'.repeat(64) }, makeCase(), makeRuntime(), makePolicy()).status === 'no_adjudication',
    cleanBefore: () => adjudicate(makeResult(), makeCase(), makeRuntime(), makePolicy()).status === 'adjudicated',
  },
  {
    id: 'laya/nesigurna-veza-postaje-case',
    imitates: 'zapis cija veza s reference.completeness nije eksplicitna ipak ode modelu, pa Laya procjenjuje nalaz koji Lekta nije tvrdila',
    caught: () => buildLayaCandidates({ ...makeSnapshot(), records: [{ ...makeSnapshot().records[0], linkage: 'uncertain' }] }).cases.length === 0,
    cleanBefore: () => buildLayaCandidates(makeSnapshot()).cases.length === 1,
  },
  {
    id: 'laya/formalni-check-eligibilan',
    imitates: 'registry prosiren na formalnu os (margine, font, stranica) iako je parser tu deterministicki autoritet',
    // Mutira se sam registry (ne samo upit), jer bi isLayaEligibleCheck formalni id odbio i kad je upisan.
    caught: () => formalRegistryEntries([...LAYA_ELIGIBLE_CHECKS, 'page.margins']).length === 1
      && formalRegistryEntries([...LAYA_ELIGIBLE_CHECKS, 'toc.present', 'font.family']).length === 2,
    cleanBefore: () => formalRegistryEntries().length === 0 && isLayaEligibleCheck('reference.completeness'),
  },
  // --- T26, audit 22. 9. nalazi #14, #16, #17 (+ Codex pregled #168): tocnost lokalne DOCX analize ---
  // Doseg je UZI od punog ulaznog puta: kontrole zovu parseXml, ZipReader i effectiveHidden/runMetrics
  // (harness je sinkron, a inspectDocxIntake i analyzeDocx su async). Pune putove pokrivaju
  // tests/docx-malformed-xml, docx-intake-cfb i docx-hidden-text-scoring; mutacije izvornog koda
  // izvedene su rucno i zapisane na PR-u #168.
  {
    id: 'docx/xml-greska-tiho-boduje',
    imitates: 'xmldom gresku razine error (goli & u tekstu) samo ispise i vrati djelomican DOM, pa se osteceni document.xml boduje umjesto da analiza javi gresku (nalaz #14)',
    caught: () => { try { parseXml('<t>R&D</t>', 'Glavni Word dokument'); return false; } catch (e) { return String((e as Error).message) === 'Glavni Word dokument nije moguće pročitati.'; } },
    // Cisti baseline ukljucuje valjan XML na koji xmldom salje warning (U+FFFD, Codex #14a).
    cleanBefore: () => { try { return parseXml('<t>R&amp;D \uFFFD</t>').documentElement?.textContent === 'R&D \uFFFD'; } catch { return false; } },
  },
  {
    id: 'docx/zasticen-docx-kao-not-zip',
    imitates: 'docx zasticen lozinkom (CFB s EncryptionInfo i EncryptedPackage) dobiva poruku o neispravnoj ZIP arhivi umjesto upute za uklanjanje lozinke (nalaz #16)',
    caught: () => {
      const encrypted = new Uint8Array(readFileSync(resolve(process.cwd(), 'tests/fixtures/intake/encrypted-synthetic.docx')));
      try { new ZipReader(encrypted.buffer.slice(0) as ArrayBuffer); return false; } catch (e) { return /zaštićena lozinkom/.test(String((e as Error).message)); }
    },
    cleanBefore: () => { try { new ZipReader(buildDocx({ paragraphs: [{ text: 'Obican dokument.' }] }).buffer as ArrayBuffer); return true; } catch { return false; } },
  },
  {
    id: 'docx/skriveni-run-bira-font',
    imitates: 'skriveni tekst odlucuje o fontu, ili se vanish iz stila odlomka i znakovnog stila spaja kao zadnja razina umjesto toggle preokreta, pa je vidljiv tekst proglasen skrivenim (nalaz #17, Codex #17a)',
    caught: () => effectiveHidden({ paragraphStyle: { hidden: true } }) === true
      && effectiveHidden({ paragraphStyle: { hidden: true }, runStyle: { hidden: true } }) === false
      && runMetrics([{ text: 'Vidljivo', font: 'Times New Roman', size: 12 }, { text: 'skriveno '.repeat(30), font: 'Arial', size: 20, hidden: true }]).font === 'Times New Roman',
    cleanBefore: () => effectiveHidden({}) === false
      && runMetrics([{ text: 'Vidljivo', font: 'Times New Roman', size: 12 }, { text: 'skriveno '.repeat(30), font: 'Arial', size: 20 }]).font === 'Arial',
  },
  {
    id: 'docx/lazni-nalaz-na-uskladjenom',
    imitates: 'analiza pocne javljati nalaz na poznato ispravnom fixtureu (kao structure.heading.word-styles nad stavkama literature na 12 od 14), ili dopusteni nalaz nestane a popis se ne stegne (T26)',
    // Doseg: ratchet nad popisom; punu analizu fixtura vrti tests/analysis-false-findings (async).
    caught: () => {
      const allowed = new Set<FindingKey>(ALLOWED_FINDINGS.map((a) => `${a.doc}|${a.checkId}` as FindingKey));
      const extra = falseFindingProblems(new Set([...allowed, 'fpzg--final--prijediplomski--uskladjen|structure.heading.word-styles']));
      const stale = falseFindingProblems(new Set([...allowed].slice(1)));
      return extra.length === 1 && extra[0].startsWith('lazni nalaz:') && stale.length === 1 && stale[0].startsWith('zastarjeli unos:');
    },
    cleanBefore: () => falseFindingProblems(new Set(ALLOWED_FINDINGS.map((a) => `${a.doc}|${a.checkId}` as FindingKey))).length === 0,
  },
  {
    id: 'docx/stavka-literature-kao-naslov',
    imitates: 'granica izuzeca stavki literature pogresna: numerirana stavka "1. Aston ... (1991). ..." postane kandidat za rucni naslov (12 od 14 uskladjenih fixtura), ili samo clanstvo u zapisima izuzme pravi naslov "1. Knjige" ili naslov iza zalutalog odlomka "Literatura" (Codex #184 F1, F2)',
    // Doseg: stvarni ulaz analize (odlomci) kroz istu funkciju koju zove analyze-docx.
    caught: () => {
      const texts = (ps: { text: string; headingLevel?: number }[]) => manualHeadingCandidates(ps, 'hr').candidates.map((p) => p.text).join('|');
      return texts([{ text: 'Uvod', headingLevel: 1 }, { text: 'Literatura', headingLevel: 1 }, { text: '1. Knjige' }, { text: '2. Aston, E. i Savona, G. (1991). Theatre as Sign System. London: Routledge.' }]) === '1. Knjige'
        && texts([{ text: 'Uvod', headingLevel: 1 }, { text: 'Literatura' }, { text: '2. Metodologija istraživanja' }]) === '2. Metodologija istraživanja';
    },
    cleanBefore: () => manualHeadingCandidates([{ text: 'Uvod', headingLevel: 1 }, { text: 'Tekst rada bez numeriranih odlomaka.' }], 'hr').candidates.length === 0,
  },
  /**
   * T92: treci put ista klasa (zadnji #243, popravak #245). Test cita schema.sql i trazi `\nas \$\$\n`;
   * na Linux CI-ju zelen, na Windows checkoutu CRLF pa nema pogotka.
   *
   * Svjesna iznimka od pravila 1 iz zaglavlja: prva mutacija PISE jednu sinteticku test datoteku, ali
   * u privremenu mapu izvan repozitorija (`mkdtemp` pod `tmpdir()`), koju gard skenira preko parametra
   * `root` isto kao pravo stablo, i brise je u `finally`. Datoteke repozitorija se ne diraju. Druga
   * mutacija ne mijenja izvor garda na disku: ubrizgava detektor `readNormalized` koji uvijek kaze
   * "nije normalizirano" i trazi da presuda nad pravim stablom tada ne bude prazna.
   */
  {
    id: 'crlf/citanje-bez-normalizacije',
    imitates:
      'test koji readFileSync(..., utf8) cita datoteku iz repozitorija i trazi `\\nas \\$\\$\\n` bez normalizacije CR-a; ' +
      'Linux CI zelen, Windows checkout (CRLF) crven (#243, popravak #245)',
    caught: () => crlfSintetickoStablo(false).length === 1,
    cleanBefore: () => crlfSintetickoStablo(true).length === 0,
  },
  {
    id: 'crlf/gard-bez-provjere-normalizacije',
    imitates:
      'gard kojem netko ukloni provjeru normalizacije (c): svako citanje koje ispravno normalizira CR postane ' +
      'nalaz, ili obratno gard prestane razlikovati ispravan od neispravnog testa',
    caught: () => crlfGuardVerdict(crlfReadProblems(collectScannedSources(process.cwd()), { ...CRLF_DETECTORS, readNormalized: () => false })).length > 0,
    cleanBefore: () => crlfGuardVerdict(crlfReadProblems(collectScannedSources(process.cwd()))).length === 0,
  },
  /**
   * T49, Codex nalaz 7 na #273: gard #5 i #7 u verify-deploy-dist su provjeravali kanonik,
   * sitemap i robots s `startsWith(SITE_ORIGIN)`, pa je `https://lekta.hr.evil.example/` prolazio
   * kao unutar `https://lekta.hr`. Mutant je ta stara provjera prefiksom; isInOrigin je mora odbiti.
   */
  {
    id: 'origin/prefiks-umjesto-origina',
    imitates:
      'kanonik ili sitemap <loc> na tudjoj domeni koja samo pocinje s SITE_ORIGIN (https://lekta.hr.evil.example/) ' +
      'prolazi gard jer se usporedjuje prefiks niza umjesto URL.origin',
    caught: () => {
      const zlo = 'https://lekta.hr.evil.example/';
      const prefiksPrihvaca = zlo.startsWith('https://lekta.hr');
      return prefiksPrihvaca && !isInOrigin(zlo, 'https://lekta.hr');
    },
    cleanBefore: () => isInOrigin('https://lekta.hr/alati/', 'https://lekta.hr'),
  },
  /**
   * T49, Codex runde 3 i 4 nalaz 7b na #273: gard #5 racuna probleme u `seoOriginProblems`, a
   * verify-deploy-dist za svaki zove `fail`. Mutant zakomentira `fail`; stvarni blok garda izvrsen
   * nad sintetickim distom s kanonikom //evil.example/ tada ne zove fail nijednom.
   */
  {
    id: 'origin/gard5-bez-fail',
    imitates:
      'verify-deploy-dist racuna probleme SEO origina (stari host, kanonik //evil.example/) ali ih ne pretvara ' +
      'u fail, pa build s krivim kanonikom tiho prolazi',
    caught: () => {
      const src = readTextLf(resolve(process.cwd(), 'scripts', 'verify-deploy-dist.mjs'));
      const mut = src.replace('for (const problem of seoOriginProblems(seoFiles, SITE_ORIGIN)) fail(problem);',
        '// for (const problem of seoOriginProblems(seoFiles, SITE_ORIGIN)) fail(problem);');
      const dist = writeSyntheticDist({ 'x.html': '<link rel="canonical" href="//evil.example/">' });
      try {
        return mut !== src && runGuard5Block(mut, dist, 'https://lekta.hr').length === 0;
      } finally {
        rmSync(dist, { recursive: true, force: true });
      }
    },
    cleanBefore: () => {
      const dist = writeSyntheticDist({ 'x.html': '<link rel="canonical" href="//evil.example/">' });
      try {
        return runGuard5Block(readTextLf(resolve(process.cwd(), 'scripts', 'verify-deploy-dist.mjs')), dist, 'https://lekta.hr').length === 1;
      } finally {
        rmSync(dist, { recursive: true, force: true });
      }
    },
  },
  /**
   * T101: deploy-drift po SADRZAJU je dokaz deploya, pa mora biti fail-closed. Mutanti iz izvora
   * scripts/deploy-drift-core.mjs (bez importa), izvrseni u memoriji. Svaki gasi jedan gard i trazi da
   * ulaz koji je gard morao odbiti tada prode kao JEDNAKO ili ostane neuhvacen.
   */
  ...([
    ['deploy-drift/sadrzaj-uvijek-jednak', 'usporedba sadrzaja nikad ne prijavi razliku, pa deployana funkcija koja salje ACAO * a repo odabire origin izgleda jednako',
      "norm(repo) !== norm(content) ? 'drift' : 'jednako'", "false ? 'drift' : 'jednako'",
      (core: DriftCore) => core.contentDrift('faculty-request', { status: 'ok', files: new Map([['supabase/functions/faculty-request/index.ts', "'Access-Control-Allow-Origin': '*'"]]) },
        (p: string) => (p === 'supabase/functions/faculty-request/index.ts' ? 'const ALLOWED_ORIGINS = []' : null)).status === 'drift'],
    ['deploy-drift/visak-bajtova-prihvacen', 'body s bajtovima iza zadnje sekcije (dva spojena ili pokvarena bundlea) procitan kao valjan ESZIP (Codex R1)',
      'if (p !== bytes.length) return { ok: false', 'if (false) return { ok: false',
      (core: DriftCore) => !core.parseEszip(new Uint8Array([...bundleFunkcije('source/index.ts', [['source/index.ts', 'x']]), 0])).ok],
    ['deploy-drift/necitljiv-modul-preskocen', 'lokalni modul bez citljive source mape preskocen umjesto NE ZNAM, pa razlika u njemu nestaje iz usporedbe (Codex R2)',
      'return neZnam(`modul ${m.specifier} nema citljivu mapu s izvornim tekstom`);', 'continue;',
      (core: DriftCore) => core.contentDrift('f', core.deployedModules(core.parseEszip(bundleFunkcije('source/index.ts', [['source/index.ts', 'x']],
        [{ specifier: 'source/../_shared/a.ts', kind: 'module', moduleKind: 0, source: 'js', sourceMap: mapaModula('source/../_shared/a.ts', null) }])), 'f'),
      (p: string) => (p === 'supabase/functions/f/index.ts' ? 'x' : null)).status === 'ne-znam'],
    ['deploy-drift/json-modul-preskocen', 'JSON modul bez mape preskocen, pa deployani skup pravila razlicit od repoa izgleda JEDNAKO (profile-rules, izmjereno 4. 10. 2026.)',
      "content = new TextDecoder('utf-8', { fatal: true }).decode(m.sourceBytes);", 'continue;',
      (core: DriftCore) => core.contentDrift('f', core.deployedModules(core.parseEszip(bundleFunkcije('source/index.ts', [['source/index.ts', 'x']],
        [{ specifier: 'source/../../../data/x.json', kind: 'module', moduleKind: 1, source: '{"a":2}', sourceMap: null }])), 'f'),
      (p: string) => ({ 'supabase/functions/f/index.ts': 'x', 'data/x.json': '{"a":1}' } as Record<string, string>)[p] ?? null).status === 'drift'],
    ['deploy-drift/korijen-pretpostavljen', 'neprepoznat korijen ulaza (sufiks koji presijeca segment putanje) daje prividno valjan ulaz i JEDNAKO (Codex R3)',
      'if (!prepoznat) return neZnam(', 'if (false) return neZnam(',
      (core: DriftCore) => core.contentDrift('f', core.deployedModules(core.parseEszip(bundleFunkcije('ions/f/index.ts', [['ions/f/index.ts', 'x']])), 'f'),
        (p: string) => (p === 'supabase/functions/f/index.ts' ? 'x' : null)).status === 'ne-znam'],
    ['deploy-drift/verzija-nevezana', 'body dohvacen dok se deploy mijenjao biljezi se uz staru verziju (Codex R7)',
      'if (before.version !== after.version || before.updated_at !== after.updated_at) {', 'if (false) {',
      (core: DriftCore) => core.deployIdentityProblem({ version: 10, updated_at: 1 }, { version: 11, updated_at: 2 }) !== null],
  ] as const).map(([id, imitates, from, to, holds]) => ({
    id,
    imitates: `T101: ${imitates}.`,
    caught: () => {
      const src = readTextLf(resolve(process.cwd(), 'scripts', 'deploy-drift-core.mjs'));
      const mut = src.replace(from, to);
      return mut !== src && !holds(loadDriftCore(mut));
    },
    cleanBefore: () => holds(loadDriftCore(readTextLf(resolve(process.cwd(), 'scripts', 'deploy-drift-core.mjs')))),
  })),

  /**
   * T86: pravni tekst bete nosi oznake `[ODLUKA VLASNIKA: ...]` (Z36) i `[PROVJERITI: ...]` dok ih
   * vlasnik ne zamijeni. Gard 3a u verify-deploy-dist obara objavu dok ijedna stoji u dist/, i to
   * na pravnim stranicama I u JS bundleu (modal na indexu puni ista funkcija). Blok garda se
   * izvrsava stvarno nad sintetickim distom (`tests/helpers/legal-placeholder-wiring.ts`).
   */
  {
    id: 'pravno/oznaka-bez-fail',
    imitates: 'gard 3a nadje oznaku ODLUKA VLASNIKA u pravnoj stranici, ali je ne pretvori u fail, pa se nedovrsen pravni tekst objavi',
    caught: () => {
      const src = readTextLf(resolve(process.cwd(), 'scripts', 'verify-deploy-dist.mjs'));
      const mut = src.replace('if (problems.length) fail(', 'if (problems.length) void (');
      const dist = legalSyntheticDist({ stranica: '[ODLUKA VLASNIKA: Z36]' });
      try {
        return mut !== src && runLegalPlaceholderBlock(mut, dist).length === 0;
      } finally {
        rmSync(dist, { recursive: true, force: true });
      }
    },
    cleanBefore: () => {
      const src = readTextLf(resolve(process.cwd(), 'scripts', 'verify-deploy-dist.mjs'));
      const ok = legalSyntheticDist({});
      const zlo = legalSyntheticDist({ stranica: '[ODLUKA VLASNIKA: Z36]' });
      try {
        return runLegalPlaceholderBlock(src, ok).length === 0 && runLegalPlaceholderBlock(src, zlo).length === 1;
      } finally {
        rmSync(ok, { recursive: true, force: true });
        rmSync(zlo, { recursive: true, force: true });
      }
    },
  },
  {
    id: 'pravno/oznaka-samo-u-bundleu',
    imitates: 'gard 3a gleda samo pravne stranice, pa oznaka koja stoji u modalu (JS bundle) prolazi u objavu',
    caught: () => {
      const src = readTextLf(resolve(process.cwd(), 'scripts', 'verify-deploy-dist.mjs'));
      const mut = src.replace("for (const f of assets) scan(path.join('assets', f));", '');
      const dist = legalSyntheticDist({ bundle: '[PROVJERITI: Resend DPA]' });
      try {
        return mut !== src && runLegalPlaceholderBlock(mut, dist).length === 0;
      } finally {
        rmSync(dist, { recursive: true, force: true });
      }
    },
    cleanBefore: () => {
      const src = readTextLf(resolve(process.cwd(), 'scripts', 'verify-deploy-dist.mjs'));
      const dist = legalSyntheticDist({ bundle: '[PROVJERITI: Resend DPA]' });
      try {
        return runLegalPlaceholderBlock(src, dist).length === 1;
      } finally {
        rmSync(dist, { recursive: true, force: true });
      }
    },
  },
  {
    id: 'pravno/prepoznaje-samo-jednu-vrstu-oznake',
    imitates: 'prepoznavanje oznaka zna samo za ODLUKA VLASNIKA, pa neprovjerena cinjenica [PROVJERITI: ...] prolazi u objavu',
    caught: () => {
      const src = readTextLf(resolve(process.cwd(), 'scripts', 'lib', 'legal-placeholders.mjs'));
      const anchor = '(?:ODLUKA VLASNIKA|PROVJERITI)';
      if (src.split(anchor).length !== 2) return false;
      const mutant = src.replace(anchor, 'ODLUKA VLASNIKA').replace('export function', 'function');
      const samoOdluka = new Function(`${mutant}\nreturn findLegalPlaceholders;`)() as (text: string) => string[];
      return samoOdluka('x [PROVJERITI: y] z').length === 0
        && samoOdluka('[ODLUKA VLASNIKA: Z36]').length === 1
        && findLegalPlaceholders('x [PROVJERITI: y] z').length === 1;
    },
    cleanBefore: () =>
      findLegalPlaceholders('Pravni tekst bez oznaka [1] i [vidi 2].').length === 0
      && findLegalPlaceholders('[ODLUKA VLASNIKA: Z36] i [PROVJERITI: DPA]').length === 2,
  },
];

/** Jezgra deploy-drifta iz (mutiranog) izvora u memoriji; izvor nema importa (T101). */
type DriftCore = {
  parseEszip: (bytes: Uint8Array) => { ok: boolean };
  deployedModules: (parsed: unknown, slug: string) => unknown;
  contentDrift: (slug: string, deployed: unknown, readRepo: (p: string) => string | null) => { status: string };
  deployIdentityProblem: (before: unknown, after: unknown) => string | null;
};
function loadDriftCore(src: string): DriftCore {
  return new Function(`${src.replace(/^export /gm, '')}\nreturn { parseEszip, deployedModules, contentDrift, deployIdentityProblem };`)() as DriftCore;
}

/**
 * Nalazi T92 garda nad privremenim stablom s jednom sintetickom test datotekom u obliku iz #243
 * (cita schema.sql i trazi `\nas \$\$\n`), sa ili bez normalizacije CR-a.
 */
function crlfSintetickoStablo(normalizira: boolean): string[] {
  const root = mkdtempSync(join(tmpdir(), 'lekta-t92-'));
  try {
    mkdirSync(join(root, 'tests'));
    const citanje = normalizira
      ? "const sql = readFileSync(resolve('ops/agent-control-plane/schema.sql'), 'utf8').replace(/\\r\\n/g, '\\n');"
      : "const sql = readFileSync(resolve('ops/agent-control-plane/schema.sql'), 'utf8');";
    writeFileSync(join(root, 'tests', 'sinteticki.test.ts'), `${citanje}\nexpect((sql.match(/\\nas \\$\\$\\n/g) ?? []).length).toBe(1);\n`);
    return crlfReadProblems(collectScannedSources(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Minimalni datotecni sustav koji scripts/clean-vitest-tmp.mjs prima (readdir + lstat). */
type CleanTmpFs = ReturnType<typeof cleanTmpVirtualFs>;
const CT_ROOT = resolve('/lekta-virtualni-tmp');
const CT_NOW = Date.UTC(2026, 8, 26, 12, 0, 0);
const CT_HOUR = 3_600_000;
const CT_THRESHOLD = 2 * CT_HOUR;
const CT_NANO = join(CT_ROOT, 'abcdefghijABCDEFGHIJ_');
const CT_FRESH_FILE = join(CT_NANO, 'web', 'ffffffffffffffffffffffffffffffffffffffff');
const CT_QUIET = [{ pid: 7, ppid: 1, name: 'node.exe', command: 'node npm-cli.js run check' }];
const CT_LIVE_VITEST = [
  ...CT_QUIET,
  { pid: 900, ppid: 1, name: 'node.exe', command: '"node" C:/x/node_modules/vitest/vitest.mjs run' },
];

/** Sustav u memoriji: kljuc je apsolutna putanja, djeca su unosi ciji je dirname roditelj. */
function cleanTmpVirtualFs(nodes: Record<string, { dir: boolean; mtimeMs: number; size?: number }>) {
  const map = new Map(Object.entries(nodes));
  const lstat = (p: string) => {
    const n = map.get(p);
    if (!n) throw Object.assign(new Error(`ENOENT ${p}`), { code: 'ENOENT' });
    return { mtimeMs: n.mtimeMs, size: n.size ?? 0, isDirectory: () => n.dir, isSymbolicLink: () => false };
  };
  const readdir = (p: string) => {
    lstat(p);
    return [...map.entries()]
      .filter(([k]) => k !== p && dirname(k) === p)
      .map(([k, n]) => ({ name: basename(k), isDirectory: () => n.dir, isSymbolicLink: () => false }));
  };
  return { lstat, readdir };
}

/** Stara Vitest mapa: sve (korijen, web/, datoteka) 9 h staro. */
function cleanTmpOldFs(): CleanTmpFs {
  const t = CT_NOW - 9 * CT_HOUR;
  return cleanTmpVirtualFs({
    [CT_ROOT]: { dir: true, mtimeMs: t },
    [CT_NANO]: { dir: true, mtimeMs: t },
    [join(CT_NANO, 'web')]: { dir: true, mtimeMs: t },
    [join(CT_NANO, 'web', 'da39a3ee5e6b4b0d3255bfef95601890afd80709')]: { dir: false, mtimeMs: t, size: 18 },
  });
}

/** Zamka 26. 9.: korijen mape i web/ 10 h stari, a jedna datoteka unutra prepisana prije minute. */
function cleanTmpTrapFs(): CleanTmpFs {
  const t = CT_NOW - 10 * CT_HOUR;
  return cleanTmpVirtualFs({
    [CT_ROOT]: { dir: true, mtimeMs: t },
    [CT_NANO]: { dir: true, mtimeMs: t },
    [join(CT_NANO, 'web')]: { dir: true, mtimeMs: t },
    [join(CT_NANO, 'web', 'da39a3ee5e6b4b0d3255bfef95601890afd80709')]: { dir: false, mtimeMs: t, size: 18 },
    [CT_FRESH_FILE]: { dir: false, mtimeMs: CT_NOW - 60_000, size: 6 },
  });
}

/** Stavka G: Playwright profil kao izravno dijete virtualnog korijena. */
const CT_PROFILE = join(CT_ROOT, 'playwright_chromiumdev_profile-3gUVVg');
/** Korijen unutar Temp/claude (radni prostor sesija i worktreeovi runova). */
const CT_CLAUDE_ROOT = resolve('/Temp/claude/lekta-wf');
const CT_LIVE_BROWSER = [
  ...CT_QUIET,
  {
    pid: 804,
    ppid: 1,
    name: 'chrome.exe',
    command: `chrome.exe --headless --user-data-dir=${CT_PROFILE}`,
  },
];

/** Jedna ostatak-mapa `dir` (s datotekom unutra) u korijenu `root`, sve `ageMs` staro. */
function ctLeftoverFs(dir: string, ageMs: number, root: string = CT_ROOT): CleanTmpFs {
  const t = CT_NOW - ageMs;
  return cleanTmpVirtualFs({
    [root]: { dir: true, mtimeMs: t },
    [dir]: { dir: true, mtimeMs: t },
    [join(dir, 'Default')]: { dir: true, mtimeMs: t },
    [join(dir, 'Default', 'Preferences')]: { dir: false, mtimeMs: t, size: 2 },
  });
}

/** Korijen ciji tekst ne odaje Temp/claude, a realpath vodi u Temp/claude/lekta-wf (junction). */
const CT_VIEW_ROOT = resolve('/lekta-pogled');

/** Ostatak-mapa pod CT_VIEW_ROOT; `realpath` preslikava pogled na stvarni korijen u Temp/claude. */
function ctViewFs(dir: string) {
  const base = ctLeftoverFs(dir, 90 * CT_HOUR, CT_VIEW_ROOT);
  return { ...base, realpath: (p: string) => (p.startsWith(CT_VIEW_ROOT) ? CT_CLAUDE_ROOT + p.slice(CT_VIEW_ROOT.length) : p) };
}

/**
 * Stavka G: ime Scheduled Taska (`$TaskName` u scripts/register-clean-task.ps1) ne smije sadrzavati
 * nijedan znak nedopusten u imenu Windows Scheduled Taska, isti skup kao za nazive datoteka.
 * `npm run clean:tmp` je zaseban npm skript naziv i nije obuhvacen ovim gardom.
 */
const REGISTER_CLEAN_TASK_SCRIPT = resolve(process.cwd(), 'scripts/register-clean-task.ps1');
const REGISTER_CLEAN_TASK_FORBIDDEN_CHARS = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];

function registerCleanTaskNameProblems(src: string): string[] {
  const m = src.match(/\$TaskName\s*=\s*'([^']*)'/);
  if (!m) return ['nema $TaskName u izvoru'];
  const ime = m[1];
  return REGISTER_CLEAN_TASK_FORBIDDEN_CHARS
    .filter((znak) => ime.includes(znak))
    .map((znak) => `ime taska '${ime}' sadrzi nedopusteni znak '${znak}'`);
}

/**
 * Stavka G, tocka 2: gard nedopustenih znakova prosiren i na -TaskName kao PARAMETAR (ne samo na
 * zadano ime u izvoru), provjeren PRIJE bilo kojeg poziva Register-ScheduledTask ili grane
 * -Unregister. Test: tests/register-clean-task.test.ts.
 */
function registerCleanTaskParamNameProblems(src: string): string[] {
  const c = src.replace(/\r/g, '');
  const problems: string[] = [];
  if (!/\[string\]\$TaskName\s*=\s*'Lekta clean-tmp'/.test(c)) {
    problems.push('nema parametra -TaskName s defaultom Lekta clean-tmp');
  }
  const provjeraIdx = c.search(/\$TaskName\.Contains\(\$znak\)/);
  if (provjeraIdx < 0) {
    problems.push('nema provjere $TaskName.Contains($znak) nad zabranjenim znakovima');
  } else if (!/exit 1/.test(c.slice(provjeraIdx, provjeraIdx + 400))) {
    problems.push('provjera -TaskName ne zavrsava s exit 1 (upozorenje bez odbijanja)');
  }
  const prviUnregister = c.indexOf('if ($Unregister)');
  const prviRegister = c.indexOf('Register-ScheduledTask -TaskName');
  if (provjeraIdx < 0 || prviUnregister < 0 || provjeraIdx > prviUnregister) {
    problems.push('provjera -TaskName ne prethodi grani -Unregister');
  }
  if (provjeraIdx < 0 || prviRegister < 0 || provjeraIdx > prviRegister) {
    problems.push('provjera -TaskName ne prethodi Register-ScheduledTask');
  }
  return problems;
}

/** Stvarni planCleanup + executePlan s `rm` koji samo biljezi; `overrides` nosi mutaciju. */
function cleanTmpRun(
  fs: CleanTmpFs & { realpath?: (p: string) => string },
  processes: Array<{ pid: number; ppid: number; name: string; command: string }>,
  overrides: Partial<Parameters<typeof planCleanup>[0]> = {},
) {
  const plan = planCleanup({
    root: CT_ROOT,
    nowMs: CT_NOW,
    thresholdMs: CT_THRESHOLD,
    listProcesses: () => processes,
    selfPid: 4242,
    fs,
    ...overrides,
  });
  const rmCalls: string[] = [];
  executePlan(plan, { rm: (p: string) => { rmCalls.push(p); } });
  return { plan, rmCalls };
}

/** Apsolutna staza iz relativne, istim `resolve` kojim graf gradi svoje staze. */
function z7aPut(rel: string): string {
  return resolve(process.cwd(), rel);
}

/**
 * Stvarni disk s nekoliko datoteka izmijenjenih U MEMORIJI (pravilo 1: disk se ne dira). Kljuc je
 * relativna staza, vrijednost funkcija nad stvarnim tekstom (prazan tekst za datoteku koje nema).
 */
function z7aOverlay(izmjene: Record<string, (tekst: string) => string>): IzvorDatoteka {
  const mapa = new Map(Object.entries(izmjene).map(([rel, f]) => [z7aPut(rel), f] as const));
  return {
    procitaj: (p) => {
      const f = mapa.get(p);
      if (!f) return DISK.procitaj(p);
      return f(DISK.postoji(p) ? DISK.procitaj(p) : '');
    },
    postoji: (p) => mapa.has(p) || DISK.postoji(p),
  };
}

/** Tekst svakog CSS lista u grafu ulaza, procitan kroz zadani izvor. */
function z7aCssGrafa(ulaz: string, izvor: IzvorDatoteka = DISK): string[] {
  return [...collectStaticGraph(z7aPut(ulaz), izvor)].filter((p) => p.endsWith('.css')).map((p) => izvor.procitaj(p));
}

/** Gard "nijedna ruta ne ucitava fontove mimo fonts-core.ts" nad svim ulazima, kroz zadani izvor. */
function z7aProblemiGrafa(izvor: IzvorDatoteka): string[] {
  return SVI_ULAZI.flatMap((u) => problemiGrafaFontova(
    u, [...collectStaticGraph(z7aPut(u), izvor)], packageImports(z7aPut(u), izvor),
  ));
}

/** Svaki CSS list u src/, s relativnim imenom, kako ga cita gard u entry-fonts. */
function z7aSviListovi(): Array<{ ime: string; css: string }> {
  const hodaj = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? hodaj(p) : [p];
  });
  const korijen = z7aPut('src');
  return hodaj(korijen).filter((p) => p.endsWith('.css'))
    .map((p) => ({ ime: `src/${p.slice(korijen.length + 1).split(/[\\/]/).join('/')}`, css: readFileSync(p, 'utf8') }));
}

/** package.json kao objekt. */
function z7aPaket(): Record<string, unknown> {
  return JSON.parse(z7aList('package.json')) as Record<string, unknown>;
}

/** Licence vendoriranih fontova koje postoje na disku. */
function z7aLicence(): Map<string, string> {
  const dir = z7aPut('src/assets/fonts');
  const imena = new Set(readdirSync(dir));
  return new Map(LICENCE.filter((ime) => imena.has(ime)).map((ime) => [ime, readFileSync(join(dir, ime), 'utf8')] as const));
}

/**
 * Svaki CSS list u src/ istim redom kao `listoviSrc` u `tests/design-tokens.test.ts` (izvor istine
 * prvi, ostali abecedno), CR normaliziran, s izmjenama U MEMORIJI po relativnoj stazi.
 */
function z7aListoviSrc(izmjene: Record<string, (tekst: string) => string> = {}): Array<{ ime: string; css: string }> {
  const IZVOR = 'src/shared/design-system.css';
  const listovi = z7aSviListovi().map((l) => ({ ime: l.ime, css: l.css.replace(/\r\n/g, '\n') }))
    .sort((a, b) => (a.ime < b.ime ? -1 : a.ime > b.ime ? 1 : 0));
  const poredak = [...listovi.filter((l) => l.ime === IZVOR), ...listovi.filter((l) => l.ime !== IZVOR)];
  return poredak.map((l) => (izmjene[l.ime] ? { ime: l.ime, css: izmjene[l.ime](l.css) } : l));
}

/** Visereceni odlomci stranice bez serifa, kroz isti citac listova kao gard (izvor je parametar). */
function z7aProblemiProze(rel: string, izvor: IzvorDatoteka = DISK): string[] {
  const { html, listovi } = listoviStranice(process.cwd(), rel, izvor);
  return problemiProzeStranice(html, listovi).problemi;
}

/** Listovi nad kojima gard trazi Georgiju: src/ i inline stil svake stranice, s izmjenama u memoriji. */
function z7aListoviGeorgije(izmjene: Record<string, (tekst: string) => string> = {}): Array<{ ime: string; css: string }> {
  const listovi = z7aListoviSrc(izmjene);
  for (const rel of STRANICE_PROZE) {
    const html = izmjene[rel] ? izmjene[rel](z7aList(rel)) : z7aList(rel);
    for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) listovi.push({ ime: rel, css: m[1] });
  }
  return listovi;
}

/** Tekst lista s diska, CR normaliziran (Windows worktree zna imati CRLF). */
function z7aList(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
}

/** Sadrzaj mape vendoriranih fontova: imena i bajtovi, jer gard cita metrike iz samog woff2. */
function z7aDatoteke(): { names: string[]; map: Map<string, Uint8Array> } {
  const dir = resolve(process.cwd(), 'src', 'assets', 'fonts');
  const names = readdirSync(dir);
  return { names, map: new Map(names.map((n) => [n, new Uint8Array(readFileSync(join(dir, n)))])) };
}

/**
 * public/_headers nakon ISTE zamjene tokena koju build radi (vite.config.ts, cspAllowlist).
 * CR se normalizira: worktree na Windowsu zna imati CRLF, a gard mora vrijediti za oba.
 */
function builtHeaders(): string {
  const raw = readFileSync(resolve(process.cwd(), 'public', '_headers'), 'utf8').replace(/\r\n/g, '\n');
  return substituteCspTokens(raw, { supabase: 'https://abcdefghijklmnop.supabase.co' });
}

/**
 * Izvor obrade dogadjaja webhook-mor s diska; mutira se samo kopija u memoriji. Na design/pack3
 * obrada zivi u handler.ts (index.ts cita samo okolinu), pa gardovi gledaju handler.
 */
function webhookMorSource(): string {
  return readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'webhook-mor', 'handler.ts'));
}

function stripeSyncSource(): string {
  return readTextLf(resolve(process.cwd(), 'scripts', 'stripe-sync-products.mjs'));
}

function createCheckoutSource(): string {
  return readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'create-checkout', 'handler.ts'));
}

function generateReportSource(): string {
  return readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'generate-report', 'index.ts'));
}

function repairDocxSource(): string {
  return readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'repair-docx', 'index.ts'));
}

/** Sve migracije, za gard jednog FK entitlements -> products (mutira se kopija u memoriji). */
function migrationsForFkGuard(): { name: string; sql: string }[] {
  const dir = resolve(process.cwd(), 'supabase', 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readTextLf(resolve(dir, name)) }));
}


function bonusOutboxIndexSource(): string {
  return readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'process-bonus-outbox', 'index.ts'));
}

/** Migracije s diska, redom primjene (Supabase sortira po verziji = imenu datoteke). */
function corpusMigrations(): MigrationFile[] {
  const dir = resolve(process.cwd(), 'supabase', 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readTextLf(join(dir, file)) }));
}

/** Tri stavke za C6 mutacije; `violated` uvijek boolean, kako to graditelji i vracaju. */
function C6_ITEMS() {
  return [
    { fixerId: 'font-fixer', ruleId: 'a', params: {}, violated: true },
    { fixerId: 'margins-fixer', ruleId: 'b', params: {}, violated: false },
    { fixerId: 'toc-field-fixer', ruleId: 'c', params: {}, violated: true },
  ];
}

/** Panel handle nad stvarnim bindingom i skrivenom listom, kako ga grade oba panela. */
function c6Panel() {
  const items = C6_ITEMS().map((i) => ({ ...i, label: i.ruleId, fixerId: i.fixerId as never }));
  const list = document.createElement('ul');
  items.forEach((it, idx) => { list.innerHTML += `<li><input type="checkbox" ${it.violated ? 'checked' : ''} data-idx="${idx}"></li>`; });
  const wrap = document.createElement('div');
  wrap.appendChild(list);
  document.body.appendChild(wrap);
  const binding = bindRepairWorkflow({ items, listEl: list, sessionToken: 'c6', run: async (ids) => ids, verify: async () => ({ ok: true }) });
  const handle = buildRepairPanelHandle(binding, items, null, wrap);
  return { handle, applyThroughOldBinding: (ids: string[]) => binding.applySelection(ids) };
}
describe('mutacijsko testiranje: garda stvarno grizu', () => {
  // TIMEOUT OVDJE NISTA NE PREKIDA. Tijelo testa je SINKRONO (mutation.cleanBefore/caught), a
  // vitest rok mjeri timerom koji ne moze okinuti dok sinkroni kod drzi petlju dogadjaja; kad tijelo
  // zavrsi, rezultat stigne prije timera i test PROLAZI iako je trajao dulje od roka (izmjereno
  // 2026-09-27: sinkroni test od 1,5 s uz rok od 200 ms prolazi). Zaglavljena mutacija zato NE pada
  // "samo kasnije" nego visi. Stvarna granica je `timeout` spawnSync-a u izvrsenom gardu
  // (ROK_SLUCAJA_MS, 30 s po slucaju, tests/helpers/naplata-env.ts): zaglavljena skripta se ubija i
  // postaje nalaz, a pokretac slucajeva ima rok ROK_SLUCAJA_MS + 15 s. 60 s ostaje samo za slucaj da
  // tijelo jednom postane asinkrono. Slucajevi jednog poziva izvrsenog garda idu ISTODOBNO kroz jedan
  // pokretac, svaki i dalje kao zaseban proces stvarne skripte (izmjereno 2026-09-27 na 4 jezgre,
  // naizmjenicno: baseline svih 13 slucajeva 4,1 do 4,9 s serijski, 1,7 do 2,4 s istodobno;
  // 11 mutacija `naplata/izvor-*` zajedno 14,9 do 16,4 s serijski, 13,2 do 14,6 s istodobno).
  it.each(MUTATIONS.map((m) => [m.id, m] as const))('%s', (_id, mutation) => {
    expect(mutation.cleanBefore(), `baseline nije cist, pa tvrdnja nije o mutaciji (${mutation.imitates})`).toBe(true);
    expect(mutation.caught(), `mutacija NIJE uhvacena: ${mutation.imitates}`).toBe(true);
  }, 60_000);

  it('svaka mutacija imenuje stvaran kvar koji imitira', () => {
    for (const mutation of MUTATIONS) {
      expect(mutation.imitates.length, mutation.id).toBeGreaterThan(20);
    }
  });

  /**
   * Jedna brojka umjesto rucnog pregleda. Kad se doda gard, doda se i mutacija; kad broj padne,
   * netko je uklonio mutaciju umjesto da popravi gard.
   */
  it('N od N mutacija uhvaceno, i broj mutacija ne smije pasti', () => {
    const caught = MUTATIONS.filter((m) => m.cleanBefore() && m.caught());
    expect(caught).toHaveLength(MUTATIONS.length);
    expect(MUTATIONS.length).toBeGreaterThanOrEqual(40);
  // Zbirni prolaz ponovno izvrsava stotine mutacija. Vitest 4 provjerava i
  // sinkroni timeout; izmjereno 16 s bez opterecenja, 30 s uz diskovni rad.
  // Pojedinacne mutacije zadrzavaju zadani rok i sve negativne kontrole.
  }, 120_000);

  /**
   * Anti-regresija na najgori nacin da ovaj test oslabi: da sve mutacije vjezbaju JEDNU os. Prva
   * izvedba je imala tocno taj kvar - sve cetiri tvrdnje o vezanju vrijednosti isle su na `font`, pa
   * se `readAxis` moglo svesti na "ako nije font, vrati undefined" i suite bi ostao zelen, cime bi
   * se vratio bas onaj `paper-size` kvar koji zaglavlje ove datoteke navodi kao motiv.
   */
  it('mutacije vjezbaju vise osi, ne samo font', () => {
    const axes = new Set(MUTATIONS.map((m) => m.axis).filter(Boolean));
    expect([...axes].sort()).toEqual(['font', 'font-size', 'justify', 'margins', 'paper-size']);
  });

  it('isRuleScored je izvedena istina, ne pohranjena zastavica', () => {
    // Zadnja crta: kad bi se `scored` citao iz podataka, sve gornje mutacije bi se mogle zaobici
    // jednim rucnim `scored: true`.
    expect(isRuleScored(goodEntry({ status: 'draft' }))).toBe(false);
    expect(isRuleScored(goodEntry({ sourcePage: null }))).toBe(false);
    expect(isRuleScored(goodEntry())).toBe(true);
  });

  it('mutacije ne diraju stvarne podatke na disku', () => {
    // Baseline hash stvarnog izvora mora biti netaknut i nakon svih mutacija iznad.
    // Putanja iz registra je repo-relativna; vitest se vrti iz korijena repozitorija.
    const raw = readFileSync(resolve(process.cwd(), REAL_SOURCE.snapshotPath!));
    expect(raw.byteLength).toBeGreaterThan(1000);
    expect(checkSourceHashes({ sources: [REAL_SOURCE], only: [REAL_SOURCE_ID] }).problems).toEqual([]);
  });
});


// Agent result success cannot bypass dependency or independent-review gates.
describe('agent workflow guards', () => {
  it('accepts ready work, catches a reopened dependency and same-provider review', async () => {
    const { prepareJob } = await import('../scripts/agents/core.mjs');
    const queue = { tasks: [
      { id: 'T00', title: 'Baseline', status: 'done', dependsOn: [] },
      { id: 'T01', title: 'Fix', status: 'ready', dependsOn: ['T00'], implementationAgent: 'opus' },
    ] };
    expect(() => prepareJob(queue, 'T01', 'implement', 'sol')).not.toThrow();
    queue.tasks[0].status = 'ready';
    expect(() => prepareJob(queue, 'T01', 'implement', 'sol')).toThrow(/T00/);
    queue.tasks[1].status = 'in_review';
    expect(() => prepareJob(queue, 'T01', 'review', 'astra')).not.toThrow();
    expect(() => prepareJob(queue, 'T01', 'review', 'fable', 2)).toThrow(/different provider/);
  });
});

/**
 * GROK U PRETPLATNICKOM PROFILU (odluka vlasnika 2026-09-21).
 *
 * Stvarni kvar koji se imitira: runner je Grok drzao IZVAN pretplatnickog profila, a autonomni
 * kontroler uvijek salje `--subscription`, pa Grok u autonomnom lancu nije mogao raditi uopce.
 * Otvaranje profila ima cijenu: `XAI_API_KEY` u okolini bi CLI tiho prebacio s pretplate na naplatu
 * po pozivu, sto je bas ono sto odluka zabranjuje. Zato su ovdje tri mutacije, svaka nad jednim
 * gardom, uz baseline tvrdnju da nemutiran ulaz prolazi cist.
 */
describe('mutacije: Grok pretplatnicki profil', () => {
  const grokQueue = () => ({ tasks: [
    { id: 'T00', title: 'Baseline', status: 'done', dependsOn: [] },
    { id: 'T01', title: 'Fix', status: 'ready', dependsOn: ['T00'] },
  ] });
  const XAI_ENV = { XAI_API_KEY: 'xai-placeholder-nije-pravi-kljuc' };

  /** Tvrdnja koju cuva tocka 1: profil iskljucuje samo Fable. */
  const excludedListProblems = (list: readonly string[]): string[] => {
    const problems: string[] = [];
    if (list.includes('grok') || list.includes('build')) problems.push('Grok alias iskljucen iz pretplate');
    if (!list.includes('fable')) problems.push('Fable nije iskljucen');
    return problems;
  };

  /** Tvrdnja koju cuva tocka 2: u pretplatnickom nacinu postavljen xAI kljuc obara pripremu. */
  type PrepareJobFn = (
    queue: unknown, id: string, phase: string, agent: string,
    budget: undefined, options: Record<string, unknown>,
  ) => unknown;
  const refusesXaiKey = (prepare: PrepareJobFn): boolean => {
    for (const [phase, agent] of [['plan', 'grok'], ['implement', 'build']] as const) {
      let threw = false;
      try {
        prepare(grokQueue(), 'T01', phase, agent, undefined, { billingMode: 'subscription', env: XAI_ENV });
      } catch {
        threw = true;
      }
      if (!threw) return false;
    }
    return true;
  };

  /** Tvrdnja koju cuva tocka 3: zivi oblik greske nije uspjeh ni kad je izlazni kod 0. */
  type ParseResultFn = (command: string, stdout: string, exitCode: number) => { ok: boolean };
  const liveError = () => readFileSync(resolve(process.cwd(), 'tests/fixtures/agents/grok-error.json'), 'utf8');
  const liveSuccess = () => readFileSync(resolve(process.cwd(), 'tests/fixtures/agents/grok-success.json'), 'utf8');
  /**
   * Snimak greske je viseredan (JSON redak pa plain-text rep CLI-ja), pa se mjeri i SAM JSON redak.
   * Bez toga bi svaki naivni parser prolazio slucajno: cijeli tekst nije JSON, pa bi i on pao na
   * `JSON.parse`. Tvrdnja mora drzati i za oblik koji je `--output-format json` obecao dati sam.
   */
  const liveErrorJsonLine = () => {
    const line = liveError().split(/\r?\n/).find((candidate) => candidate.trim().length > 0);
    if (!line) throw new Error('fixture greske je prazna');
    return line;
  };
  const judgesLiveShapes = (parse: ParseResultFn): boolean =>
    parse('grok', liveSuccess(), 0).ok === true
    && parse('grok', liveError(), 1).ok === false
    && parse('grok', liveError(), 0).ok === false
    && parse('grok', liveErrorJsonLine(), 0).ok === false;

  it('(a) popis iskljucenih koji opet sadrzi grok obara tvrdnju', async () => {
    const { SUBSCRIPTION_EXCLUDED_AGENTS } = await import('../scripts/agents/core.mjs');
    // BASELINE: stvarni popis je cist.
    expect(excludedListProblems(SUBSCRIPTION_EXCLUDED_AGENTS)).toEqual([]);
    expect([...SUBSCRIPTION_EXCLUDED_AGENTS]).toEqual(['fable']);
    // MUTACIJA: povratak na stari popis.
    expect(excludedListProblems(['fable', 'grok', 'build'])).toEqual(['Grok alias iskljucen iz pretplate']);
    expect(excludedListProblems(['fable', 'grok'])).not.toEqual([]);
    // Kontramutacija: brisanje Fablea iz popisa se takoder mora vidjeti.
    expect(excludedListProblems([])).toContain('Fable nije iskljucen');
  });

  it('(b) prepareJob koji propusta posao uz postavljen XAI_API_KEY obara tvrdnju', async () => {
    const { prepareJob } = await import('../scripts/agents/core.mjs');
    // BASELINE: stvarni prepareJob odbija kljuc, a bez kljuca uredno pripremi posao.
    expect(refusesXaiKey(prepareJob as PrepareJobFn)).toBe(true);
    expect(() => prepareJob(grokQueue(), 'T01', 'plan', 'grok', undefined, { billingMode: 'subscription', env: {} }))
      .not.toThrow();
    // MUTACIJA (na razini POZIVA, ne garda): okolina s kljucem zamijenjena praznom. Ne opisuje
    // izmjenu u `core.mjs` nego dokazuje da tvrdnja `refusesXaiKey` mjeri SADRZAJ okoline, a ne
    // puku cinjenicu da poziv prodje. Gard koji bi env samo ignorirao hvata mutacija ispod.
    const mutantEmptyEnvAtCallSite: PrepareJobFn = (queue, id, phase, agent, budget, options) =>
      (prepareJob as PrepareJobFn)(queue, id, phase, agent, budget, { ...options, env: {} });
    expect(refusesXaiKey(mutantEmptyEnvAtCallSite)).toBe(false);
    // MUTACIJA: gard vezan uz ime agenta umjesto uz providera, pa alias `build` prodje.
    const mutantOnlyGrokAlias: PrepareJobFn = (queue, id, phase, agent, budget, options) =>
      (prepareJob as PrepareJobFn)(queue, id, phase, agent, budget,
        agent === 'grok' ? options : { ...options, env: {} });
    expect(refusesXaiKey(mutantOnlyGrokAlias)).toBe(false);
  });

  /**
   * (b2) NALAZ PREGLEDA 2026-09-22. Gard u `core.mjs` cita okolinu kroz `options.env ?? process.env`.
   * Svi testovi su `env` predavali eksplicitno, pa je mutacija `?? {}` ostavljala 144/144 zeleno, a
   * bas ta zadana grana je jedina koja radi u produkciji: `scripts/agents/cli.mjs` zove
   * `prepareJob(..., { billingMode })` bez `env`, kao i `prepare_job_via_node` iz `worker.py`.
   *
   * Zato ova tvrdnja NE predaje `options.env`, nego postavlja stvarni `process.env.XAI_API_KEY` i
   * vraca ga u `finally`. Mutant je doslovno `options.env ?? {}`.
   */
  it('(b2) zadana okolina koja nije process.env obara tvrdnju', async () => {
    const { prepareJob } = await import('../scripts/agents/core.mjs');
    /** Poziva se BEZ `options.env`, dakle kroz zadanu granu garda. */
    const refusesAmbientXaiKey = (prepare: PrepareJobFn): boolean => {
      const before = process.env.XAI_API_KEY;
      try {
        process.env.XAI_API_KEY = XAI_ENV.XAI_API_KEY;
        for (const [phase, agent] of [['plan', 'grok'], ['implement', 'build']] as const) {
          let threw = false;
          try {
            prepare(grokQueue(), 'T01', phase, agent, undefined, { billingMode: 'subscription' });
          } catch {
            threw = true;
          }
          if (!threw) return false;
        }
        return true;
      } finally {
        if (before === undefined) delete process.env.XAI_API_KEY;
        else process.env.XAI_API_KEY = before;
      }
    };
    // BASELINE: bez kljuca u stvarnoj okolini posao se priprema, s kljucem baca.
    const before = process.env.XAI_API_KEY;
    try {
      delete process.env.XAI_API_KEY;
      expect(() => prepareJob(grokQueue(), 'T01', 'plan', 'grok', undefined, { billingMode: 'subscription' }))
        .not.toThrow();
    } finally {
      if (before === undefined) delete process.env.XAI_API_KEY;
      else process.env.XAI_API_KEY = before;
    }
    expect(refusesAmbientXaiKey(prepareJob as PrepareJobFn)).toBe(true);
    // MUTACIJA: `const env = options.env ?? {}` umjesto `?? process.env`.
    const mutantDefaultsToEmpty: PrepareJobFn = (queue, id, phase, agent, budget, options) =>
      (prepareJob as PrepareJobFn)(queue, id, phase, agent, budget,
        { ...options, env: (options as { env?: Record<string, string> }).env ?? {} });
    expect(refusesAmbientXaiKey(mutantDefaultsToEmpty)).toBe(false);
    // Kontrola: okolina je vracena u zateceno stanje.
    expect(process.env.XAI_API_KEY).toBe(before);
  });

  it('(c) parser koji zivu gresku proglasi uspjehom obara tvrdnju', async () => {
    const { parseResult } = await import('../scripts/agents/core.mjs');
    // BASELINE: stvarni parser presudi oba ziva oblika tocno.
    expect(judgesLiveShapes(parseResult as ParseResultFn)).toBe(true);
    // MUTACIJA: naivni parser "svaki parseable JSON bez is_error je uspjeh". Fallback na zadnji redak
    // je isti kao u stvarnom parseru, pa je jedina razlika izostanak dokaza uspjeha.
    const mutantNaive: ParseResultFn = (_command, stdout, exitCode) => {
      if (exitCode !== 0) return { ok: false };
      const text = stdout.trim();
      let parsed: { is_error?: boolean } | null = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        const lines = text.split('\n').filter(Boolean);
        try {
          parsed = JSON.parse(lines[lines.length - 1]);
        } catch {
          return { ok: false };
        }
      }
      return { ok: parsed?.is_error !== true };
    };
    expect(mutantNaive('grok', liveErrorJsonLine(), 0).ok).toBe(true);
    expect(judgesLiveShapes(mutantNaive)).toBe(false);
    // MUTACIJA: parser koji gleda samo izlazni kod.
    const mutantExitCodeOnly: ParseResultFn = (_command, _stdout, exitCode) => ({ ok: exitCode === 0 });
    expect(judgesLiveShapes(mutantExitCodeOnly)).toBe(false);
  });

  /**
   * (d) Cetvrta mutacija dolazi iz stvarnog nalaza pregleda 2026-09-22: prva inacica ove fixture
   * bila je hibrid ZIVE SHEME i rucno napisanih brojki (`total_cost_usd: 0.0148` uz
   * `total_cost_usd_ticks: 148`). Shema je bila tocna, pa su svi tadasnji testovi bili zeleni, a
   * fixture je ipak lagala o mjerenju. Lijek je tvrdnja koja ne gleda samo imena polja nego i
   * internu relaciju brojki: tick je 1e-10 USD, pa `ticks` mora biti `USD * 1e10`. Rucno
   * zaokruzena cijena tu relaciju krsi za sedam redova velicine i odmah se vidi.
   */
  it('(d) fixture s rucno napisanim brojkama umjesto izmjerenih obara tvrdnju', () => {
    type CostShape = { total_cost_usd: number; total_cost_usd_ticks: number };
    const costProblems = (raw: string): string[] => {
      const parsed = JSON.parse(raw) as CostShape;
      const problems: string[] = [];
      if (typeof parsed.total_cost_usd !== 'number' || typeof parsed.total_cost_usd_ticks !== 'number') {
        problems.push('cijena nije brojcana');
        return problems;
      }
      if (Math.round(parsed.total_cost_usd * 1e10) !== parsed.total_cost_usd_ticks) {
        problems.push('ticks ne odgovaraju USD x 1e10, dakle brojka nije izmjerena');
      }
      return problems;
    };
    // BASELINE: commitana fixture nosi izmjerene brojke.
    expect(costProblems(liveSuccess())).toEqual([]);
    // MUTACIJA: doslovno one vrijednosti koje je pregled uhvatio kao izmisljene.
    const handWritten = JSON.stringify({
      ...JSON.parse(liveSuccess()), total_cost_usd: 0.0148, total_cost_usd_ticks: 148,
    });
    expect(costProblems(handWritten)).toEqual(['ticks ne odgovaraju USD x 1e10, dakle brojka nije izmjerena']);
    // Kontramutacija: i sama cijena promijenjena uz zadrzane stare tickove se vidi.
    const bumpedUsd = JSON.stringify({ ...JSON.parse(liveSuccess()), total_cost_usd: 0.02 });
    expect(costProblems(bumpedUsd)).not.toEqual([]);
  });
});

/**
 * MUTACIJE ZA GRANU GROKA U PYTHON ZRCALU PRESUDE.
 *
 * Nalaz pregleda 2026-09-22 bio je da fixture prikivaju samo JS `parseResult`, dok u autonomnom lancu
 * presudjuje `parse_provider_output` iz `scripts/autonomy/worker.py`, koje nije imalo granu za Grok.
 * Kvar je zatvoren 2026-09-23: zrcalo sada grana na `GROK_COMMANDS` i zove `_parse_grok_output`.
 * Ponasanje te grane mjere python testovi (`scripts/autonomy/tests/test_worker_grok.py`); oni se ne
 * vrte u `npm run check`, pa `tests/agent-workflow.test.ts` strukturno tvrdi da grana POSTOJI.
 * Ovdje se dokazuje da ta tvrdnja grize u OBA smjera: mora vidjeti kad grana nestane iz tijela
 * funkcije i ne smije je spasiti spomen rijeci `grok` bilo gdje drugdje u datoteci.
 */
describe('mutacije: grana Groka u python zrcalu presude', () => {
  const workerSource = () => readFileSync(resolve(process.cwd(), 'scripts/autonomy/worker.py'), 'utf8');

  /** Isti strukturni izdvajac kakav koristi gard: od `def` funkcije do sljedece `def` u nultom stupcu. */
  const bodyOf = (source: string, name = 'parse_provider_output'): string | null => {
    const lines = source.split(/\r?\n/);
    const start = lines.findIndex((line) => line.startsWith(`def ${name}(`));
    if (start === -1) return null;
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => line.startsWith('def '));
    return (end === -1 ? rest : rest.slice(0, end)).join('\n');
  };

  /** Gard: vraca popis problema. Prazan popis znaci "zrcalo presudjuje Grok kao JS strana". */
  const mirrorProblems = (source: string): string[] => {
    const body = bodyOf(source);
    if (body === null) return ['funkcija parse_provider_output nije pronadjena'];
    const problems: string[] = [];
    if (!body.includes('command == "claude"')) problems.push('nema grane za claude');
    if (!body.includes('turn.completed')) problems.push('nema codex uvjeta turn.completed');
    if (!body.includes('command in GROK_COMMANDS')) problems.push('nema grane za Grok');
    if (!body.includes('_parse_grok_output')) problems.push('grana za Grok ne zove zrcalo parsera');
    const grok = bodyOf(source, '_parse_grok_output');
    if (grok === null) problems.push('funkcija _parse_grok_output nije pronadjena');
    else if (!grok.includes('end_turn') || !grok.includes('modelUsage')) {
      problems.push('zrcalo Groka ne trazi strukturiran dokaz uspjeha');
    }
    return problems;
  };

  it('(e) zrcalo koje izgubi granu za Grok obara tvrdnju', () => {
    const source = workerSource();
    // BASELINE: stvarno stanje na disku prolazi cisto.
    expect(mirrorProblems(source)).toEqual([]);
    // MUTACIJA: povratak na stanje prije popravka, dakle grana izbacena iz tijela funkcije.
    const regressed = source.replace(/ {8}if command in GROK_COMMANDS:\r?\n {12}return _parse_grok_output\(stdout, out\)\r?\n/,
      '');
    expect(regressed).not.toBe(source);
    expect(mirrorProblems(regressed)).toEqual(['nema grane za Grok', 'grana za Grok ne zove zrcalo parsera']);
    // MUTACIJA: grana ostaje, ali je tijelo zrcala zamijenjeno vakuumskim uspjehom bez dokaza.
    const gutBody = (src: string, name: string): string => {
      const lines = src.split(/\r?\n/);
      const start = lines.findIndex((line) => line.startsWith(`def ${name}(`));
      expect(start).toBeGreaterThan(-1);
      const rest = lines.slice(start + 1);
      const end = rest.findIndex((line) => line.startsWith('def '));
      const bodyLength = end === -1 ? rest.length : end;
      return [
        ...lines.slice(0, start + 1), '    out["ok"] = True', '    return out', '', '',
        ...lines.slice(start + 1 + bodyLength),
      ].join('\n');
    };
    const gutted = gutBody(source, '_parse_grok_output');
    expect(gutted).not.toBe(source);
    expect(mirrorProblems(gutted)).toEqual(['zrcalo Groka ne trazi strukturiran dokaz uspjeha']);
    // MUTACIJA: preimenovana funkcija ne smije proci kao "sve je na mjestu" (vakuumsko zeleno).
    const renamed = source.replace('def parse_provider_output(', 'def parse_provider_output_v2(');
    expect(renamed).not.toBe(source);
    expect(mirrorProblems(renamed)).toEqual(['funkcija parse_provider_output nije pronadjena']);
  });

  it('(f) gard koji gleda cijelu datoteku umjesto tijela funkcije daje lazno zeleno', () => {
    const source = workerSource();
    // Grana izbacena iz tijela, ali rijec `grok` i dalje stoji drugdje u datoteci (komentari, konstante).
    const regressed = source.replace(/ {8}if command in GROK_COMMANDS:\r?\n {12}return _parse_grok_output\(stdout, out\)\r?\n/,
      '');
    expect(regressed).toContain('GROK_COMMANDS = ("grok", "build")');
    // Stvarni gard vidi regresiju, jer gleda tijelo funkcije.
    expect(mirrorProblems(regressed)).not.toEqual([]);
    // MUTANT: naivni gard nad cijelom datotekom bi ovdje pogresno javio da je sve u redu.
    const naive = (src: string): string[] => (src.toLowerCase().includes('grok') ? [] : ['nema grane za Grok']);
    expect(naive(regressed)).toEqual([]);
  });
});

/**
 * MUTACIJE ZA RAZRJESAVANJE PROVIDERA NA WINDOWSU.
 *
 * Stvaran kvar, izmjeren na ovom stroju 2026-09-22: npm instalira `.cmd` shim, pa
 * `spawnSync('codex', ['--version'], { shell: false })` vraca `error.code === 'ENOENT'`, a
 * `npm run agents -- doctor` ispisuje `codex: unavailable` iako `codex --version` iz terminala daje
 * `codex-cli 0.154.0`. Lazan negativ, ne odsutnost CLI-ja.
 *
 * Prva inacica popravka imala je tvrd uvjet nad imenom `grok` i tvrdo upisanu stazu paketa, pa je
 * lijecila samo jednog providera. Sada je razrjesavanje podatkovna mapa. Ova skupina dokazuje da
 * gubitak unosa iz te mape GRIZE: bez toga bismo se tiho vratili na ENOENT za Codex, a suite bi
 * ostao zelen jer Grok i dalje radi.
 */
describe('mutacije: razrjesavanje providera po mapi paketnih ulaznih tocaka', () => {
  type Invocation = { command: string; argsPrefix: string[] };
  type ResolveOptions = {
    platform: string;
    cwd: string;
    pathEnv: string;
    exists: (path: string) => boolean;
    entrypoints?: Record<string, readonly string[]>;
  };
  type ResolveFn = (command: string, options: ResolveOptions) => Invocation;

  /**
   * Ocekivane staze su ovdje napisane NEOVISNO o izvoru, iz `bin` polja stvarnih paketa na disku
   * (`@xai-official/grok` -> `bin/grok-bootstrap.js`, `@openai/codex` -> `bin/codex.js`).
   * Da se citaju iz iste mape koja se mjeri, tvrdnja bi bila vakuumska.
   */
  const EXPECTED_ENTRYPOINTS: Record<string, readonly string[]> = {
    grok: ['@xai-official', 'grok', 'bin', 'grok-bootstrap.js'],
    codex: ['@openai', 'codex', 'bin', 'codex.js'],
  };
  const SHIM_DIR = '/npm-global';

  /** Gard: prazan popis znaci "svaki provider iz mape se razrjesava, a ne-provider ostaje netaknut". */
  const resolverProblems = (
    resolveFn: ResolveFn,
    entrypoints: Record<string, readonly string[]>,
  ): string[] => {
    const problems: string[] = [];
    for (const [provider, packagePath] of Object.entries(EXPECTED_ENTRYPOINTS)) {
      const planted = join(SHIM_DIR, 'node_modules', ...packagePath);
      const got = resolveFn(provider, {
        platform: 'win32',
        cwd: SHIM_DIR,
        pathEnv: '',
        exists: (path: string) => path === planted,
        entrypoints,
      });
      if (got.command !== process.execPath || got.argsPrefix.length !== 1 || got.argsPrefix[0] !== planted) {
        problems.push(`${provider} se ne razrjesava na paketnu ulaznu tocku`);
      }
    }
    // Kontrola u drugom smjeru: sto nije npm shim ne smije se preusmjeriti na Node.
    const claude = resolveFn('claude', {
      platform: 'win32', cwd: SHIM_DIR, pathEnv: '', exists: () => true, entrypoints,
    });
    if (claude.command !== 'claude' || claude.argsPrefix.length !== 0) {
      problems.push('claude je preusmjeren iako nije npm shim');
    }
    return problems;
  };

  it('(g) mapa koja izgubi unos za codex obara tvrdnju', async () => {
    const { resolveProviderInvocation, PROVIDER_PACKAGE_ENTRYPOINTS } = await import('../scripts/agents/cli.mjs');
    const real = PROVIDER_PACKAGE_ENTRYPOINTS as Record<string, readonly string[]>;
    // BASELINE: stvarna mapa i stvarna funkcija prolaze cisto.
    expect(resolverProblems(resolveProviderInvocation as ResolveFn, real)).toEqual([]);
    expect(Object.keys(real).sort()).toEqual(['codex', 'grok']);
    expect([...real.codex]).toEqual([...EXPECTED_ENTRYPOINTS.codex]);
    expect([...real.grok]).toEqual([...EXPECTED_ENTRYPOINTS.grok]);
    // MUTACIJA: povratak na stanje prije ovog popravka, kad je mapa (odnosno uvjet) znala samo Grok.
    const bezCodexa = { grok: real.grok };
    expect(resolverProblems(resolveProviderInvocation as ResolveFn, bezCodexa))
      .toEqual(['codex se ne razrjesava na paketnu ulaznu tocku']);
    // KONTRAMUTACIJA: gubitak Groka se mora vidjeti jednako, inace gard mjeri samo novi unos.
    const bezGroka = { codex: real.codex };
    expect(resolverProblems(resolveProviderInvocation as ResolveFn, bezGroka))
      .toEqual(['grok se ne razrjesava na paketnu ulaznu tocku']);
    // MUTACIJA: prazna mapa, dakle razrjesavanje ugaseno u cijelosti.
    expect(resolverProblems(resolveProviderInvocation as ResolveFn, {}).sort())
      .toEqual(['codex se ne razrjesava na paketnu ulaznu tocku', 'grok se ne razrjesava na paketnu ulaznu tocku']);
  });

  it('(h) kriva staza u mapi i rezolver koji sve pusta nepromijenjeno obaraju tvrdnju', async () => {
    const { resolveProviderInvocation, PROVIDER_PACKAGE_ENTRYPOINTS } = await import('../scripts/agents/cli.mjs');
    const real = PROVIDER_PACKAGE_ENTRYPOINTS as Record<string, readonly string[]>;
    // MUTACIJA: unos pokazuje na `.cmd` shim umjesto na Node ulaznu tocku, dakle bas na ENOENT stazu.
    const naShim = { ...real, codex: ['@openai', 'codex', 'bin', 'codex.cmd'] };
    expect(resolverProblems(resolveProviderInvocation as ResolveFn, naShim))
      .toEqual(['codex se ne razrjesava na paketnu ulaznu tocku']);
    // MUTACIJA: rezolver s tvrdim uvjetom nad imenom, kakav je bio prije poopcavanja.
    const mutantSamoGrok: ResolveFn = (command, options) => (command === 'grok'
      ? (resolveProviderInvocation as ResolveFn)(command, options)
      : { command, argsPrefix: [] });
    expect(resolverProblems(mutantSamoGrok, real)).toEqual(['codex se ne razrjesava na paketnu ulaznu tocku']);
    // MUTACIJA: rezolver koji sve preusmjerava, pa bi i Claude Code isao kroz Node.
    const mutantSvePreusmjeri: ResolveFn = (command) => ({
      command: process.execPath,
      argsPrefix: [join(SHIM_DIR, 'node_modules', ...(EXPECTED_ENTRYPOINTS[command] ?? [command]))],
    });
    expect(resolverProblems(mutantSvePreusmjeri, real)).toEqual(['claude je preusmjeren iako nije npm shim']);
  });

  it('(i) fail-open kad paket nije nadjen ostaje, i ne prikriva izgubljen unos', async () => {
    const { resolveProviderInvocation, PROVIDER_PACKAGE_ENTRYPOINTS } = await import('../scripts/agents/cli.mjs');
    const real = PROVIDER_PACKAGE_ENTRYPOINTS as Record<string, readonly string[]>;
    // BASELINE: nenadjen paket vraca golu naredbu, ne baca i ne izmislja stazu.
    for (const provider of Object.keys(real)) {
      expect((resolveProviderInvocation as ResolveFn)(provider, {
        platform: 'win32', cwd: '/nigdje', pathEnv: '', exists: () => false, entrypoints: real,
      })).toEqual({ command: provider, argsPrefix: [] });
    }
    // Tvrdnja koja bi bila vakuumska: gard iznad mjeri PODMETNUTU stazu, pa ga fail-open ne spasava.
    expect(resolverProblems(resolveProviderInvocation as ResolveFn, { grok: real.grok }))
      .toContain('codex se ne razrjesava na paketnu ulaznu tocku');
  });
});

describe('mutacije: config/agent-routing.json (korak 1 routinga)', () => {
  it('unverified model uveden u ulogu obara tvrdnju', async () => {
    const routingConfigModule = await import('../config/agent-routing.json');
    const real = routingConfigModule.default as unknown as import('./helpers/agent-routing-checks').RoutingConfig;

    // BASELINE: stvarni config je cist.
    expect(findUnverifiedModelUsages(real)).toEqual([]);

    // MUTACIJA: implement uloga za M/nezasticeno prebacena na neverificiran model.
    const mutiran = JSON.parse(JSON.stringify(real)) as import('./helpers/agent-routing-checks').RoutingConfig;
    mutiran.models['claude-neverificiran-test'] = { status: 'unverified' };
    mutiran.routing.M.false.roles.implement.model = 'claude-neverificiran-test';
    const problems = findUnverifiedModelUsages(mutiran);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some((problem) => problem.includes('claude-neverificiran-test'))).toBe(true);
    expect(problems.some((problem) => problem.startsWith('M/false/implement'))).toBe(true);
  });

  it('isti provider za implement i review bez fallbacka obara tvrdnju', async () => {
    const routingConfigModule = await import('../config/agent-routing.json');
    const real = routingConfigModule.default as unknown as import('./helpers/agent-routing-checks').RoutingConfig;

    // BASELINE: stvarni config postuje pravilo drugog providera (ili ima valjan reviewFallback).
    expect(findSameProviderWithoutFallback(real)).toEqual([]);

    // MUTACIJA: review uloga za S/nezasticeno prebacena na isti provider kao implement, uz gubitak fallbacka.
    const mutiran = JSON.parse(JSON.stringify(real)) as import('./helpers/agent-routing-checks').RoutingConfig;
    mutiran.routing.S.false.roles.review.provider = mutiran.routing.S.false.roles.implement.provider;
    delete mutiran.routing.S.false.roles.review.reviewFallback;
    const problems = findSameProviderWithoutFallback(mutiran);
    expect(problems).toEqual(['S/false: review i implement isti provider (claude) bez valjanog reviewFallbacka']);

    // KONTRAMUTACIJA: isti provider ALI s valjanim reviewFallbackom (drugi model) i dalje prolazi.
    const saFallbackom = JSON.parse(JSON.stringify(real)) as import('./helpers/agent-routing-checks').RoutingConfig;
    saFallbackom.routing.S.false.roles.review.provider = saFallbackom.routing.S.false.roles.implement.provider;
    saFallbackom.routing.S.false.roles.review.reviewFallback = {
      provider: 'claude',
      model: 'claude-haiku-4-5',
      effort: 'medium',
    };
    expect(findSameProviderWithoutFallback(saFallbackom)).toEqual([]);
  });

  it('implement effort vracen na stari xhigh ili odmaknut od effortPolicy obara tvrdnju (B1)', async () => {
    const routingConfigModule = await import('../config/agent-routing.json');
    const real = routingConfigModule.default as unknown as import('./helpers/agent-routing-checks').RoutingConfig;

    // BASELINE: stvarni config slijedi effortPolicy (implement medium, zasticeno high).
    expect(findImplementEffortDrift(real)).toEqual([]);

    // MUTACIJA 1: zasticeni L implement vracen na prijasnji xhigh.
    const staroZasticeno = JSON.parse(JSON.stringify(real)) as import('./helpers/agent-routing-checks').RoutingConfig;
    staroZasticeno.routing.L.true.roles.implement.effort = 'xhigh';
    expect(findImplementEffortDrift(staroZasticeno)).toEqual(['L/true/implement effort xhigh umjesto high']);

    // MUTACIJA 2: nezasticeni M implement na opus-5-5 podignut na high mimo politike.
    const nezasticeno = JSON.parse(JSON.stringify(real)) as import('./helpers/agent-routing-checks').RoutingConfig;
    nezasticeno.routing.M.false.roles.implement.effort = 'high';
    expect(findImplementEffortDrift(nezasticeno)).toEqual(['M/false/implement effort high umjesto medium']);

    // MUTACIJA 3: politika bez implementProtected ne smije tiho proci.
    const bezPolitike = JSON.parse(JSON.stringify(real)) as import('./helpers/agent-routing-checks').RoutingConfig;
    delete bezPolitike.effortPolicy?.implementProtected;
    expect(findImplementEffortDrift(bezPolitike)).toEqual(['effortPolicy.implement ili implementProtected nedostaje']);
  });
});

describe('mutacije: scripts/agents/tool-guard.mjs (PreToolUse gard)', () => {
  it('gard koji propusta git add -A (izgubljen uvjet) obara test', async () => {
    const { judgeCommand } = await import('../scripts/agents/tool-guard.mjs');

    // BASELINE: stvarni gard blokira git add -A.
    expect((judgeCommand as (t: string, c?: string) => { allow: boolean }) ('Bash', 'git add -A').allow).toBe(false);

    // MUTACIJA: simulira gard koji je izgubio provjeru za -A/--all/"." (npr. regex koji trazi
    // samo tocan niz "git add -A" bez varijanti razmaka/redoslijeda argumenata), pa git add -A
    // s dodatnim argumentom prolazi neopazeno.
    const mutiraniGard = (toolName: string, command?: string) => {
      if (typeof command === 'string' && command.trim() === 'git add -A') {
        return { allow: false, reason: 'blokirano' };
      }
      return { allow: true, reason: 'propusteno' };
    };
    // Varijanta koju bi izvorni test trebao uhvatiti: isti obrazac, drugaciji poredak/dodatak.
    expect(mutiraniGard('Bash', 'git add -A .')).toEqual({ allow: true, reason: 'propusteno' });
    expect(
      (judgeCommand as (t: string, c?: string) => { allow: boolean }) ('Bash', 'git add -A .').allow
    ).toBe(false);
  });
});

/**
 * Commit cijelog indeksa i dovrsenje spajanja (preneseno iz `~/.claude/hooks/lekta-git-guard.mjs`,
 * 2026-10-08). Mutira se KOPIJA izvora u privremenom direktoriju i presuduje cisti node, jer
 * vitestov loader ne ucitava module izvan korijena projekta, a mutant ne smije u repozitorij.
 */
describe('mutacije: tool-guard commit cijelog indeksa', () => {
  const izvor = readFileSync(resolve(process.cwd(), 'scripts/agents/tool-guard.mjs'), 'utf8').replace(/\r\n/g, '\n');
  const GOLI_COMMIT = '      if (!hasOnly) return judgeWholeIndexCommit(okolina, false);\n';
  const NASTAVAK = "    if (NASTAVCI_SPAJANJA.has(sub) && (hasFlag(args, '--continue') || (sub === 'am' && hasFlag(args, '--resolved')))) {\n";

  async function presude(source: string): Promise<boolean[]> {
    const { mkdtempSync, writeFileSync: write, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { pathToFileURL } = await import('node:url');
    const { spawnSync } = await import('node:child_process');
    const dir = mkdtempSync(join(tmpdir(), 'lekta-toolguard-mut-'));
    try {
      const file = join(dir, 'tool-guard.mjs');
      write(file, source);
      const script = `const m = await import(${JSON.stringify(pathToFileURL(file).href)});`
        + 'const o = (s) => ({ cwd: "/x", ispitaj: () => s });'
        + 'process.stdout.write(JSON.stringify(['
        + 'm.judgeCommand("Bash", "git commit -m x", undefined, o({ izoliran: false, spajanje: false })).allow,'
        + 'm.judgeCommand("Bash", "git merge --continue", undefined, o({ izoliran: false, spajanje: true })).allow,'
        + 'm.judgeCommand("Bash", "git merge --continue", undefined, o({ izoliran: true, spajanje: true })).allow,'
        + ']));';
      const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60_000 });
      return JSON.parse(res.stdout) as boolean[];
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('baseline: goli commit i merge --continue u dijeljenom stablu su odbijeni, u worktreeju merge prolazi', async () => {
    expect(izvor).toContain(GOLI_COMMIT);
    expect(izvor).toContain(NASTAVAK);
    expect(await presude(izvor)).toEqual([false, false, true]);
  });

  it('mutant: gard bez provjere golog commita propusta commit cijelog indeksa', async () => {
    expect(await presude(izvor.replace(GOLI_COMMIT, ''))).toEqual([true, false, true]);
  });

  /** `stanjeStabla` nad STVARNIM samostalnim klonom; `repo` glumi dijeljeno stablo. */
  async function klonIzoliran(source: string): Promise<boolean> {
    const { mkdtempSync, writeFileSync: write, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { pathToFileURL } = await import('node:url');
    const { spawnSync, execFileSync } = await import('node:child_process');
    const dir = mkdtempSync(join(tmpdir(), 'lekta-toolguard-klon-'));
    try {
      const file = join(dir, 'tool-guard.mjs');
      write(file, source);
      const repo = join(dir, 'repo');
      const g = (args: string[], cwd: string) => execFileSync('git', args, { cwd, windowsHide: true });
      g(['init', '-q', repo], dir);
      g(['-c', 'user.email=x@y.z', '-c', 'user.name=T', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'prvi'], repo);
      const klon = join(dir, 'klon');
      g(['clone', '-q', repo, klon], dir);
      const script = `const m = await import(${JSON.stringify(pathToFileURL(file).href)});`
        + `process.stdout.write(JSON.stringify(m.stanjeStabla(${JSON.stringify(klon)}, ${JSON.stringify(repo)})));`;
      const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60_000 });
      return (JSON.parse(res.stdout) as { izoliran: boolean }).izoliran;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('baseline i mutant: samostalni klon izvan dijeljenog korijena je izoliran samo uz provjeru korijena', async () => {
    const KORIJEN = ' || !dijeljeno, spajanje };';
    expect(izvor).toContain(KORIJEN);
    expect(await klonIzoliran(izvor)).toBe(true);
    expect(await klonIzoliran(izvor.replace(KORIJEN, ', spajanje };'))).toBe(false);
  });

  it('mutant: gard koji ne gada --continue propusta dovrsenje spajanja u dijeljenom stablu', async () => {
    const mutant = izvor.replace(NASTAVAK, "    if (false && hasFlag(args, '--continue')) {\n");
    expect(await presude(mutant)).toEqual([false, true, true]);
  });
});

/**
 * GATE PREFLIGHT I OMOTAC (T62, pravila za stroj). Dva kvara koja bi lock ucinila ukrasom:
 *  (a) preflight koji propusta iako radi tudji vitest (dvije sesije opet mlate isti stroj);
 *  (b) omotac koji otpusta lock samo na uspjeh (lanac `a && b && release`), pa pad gatea ostavi
 *      lock koji blokira sve ostale dok PID ne nestane.
 * Mutira se kopija izvora u privremenom direktoriju, nikad datoteka u repozitoriju.
 */
describe('mutacije: gate preflight i omotac locka', () => {
  const readLf = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

  /**
   * Tvrdnja iz tests/gate-preflight.test.ts ("tudji vitest proces: odbija"), izvrsena nad KOPIJOM
   * izvora u zasebnom node procesu. Vitestov loader ne ucitava module izvan korijena projekta, a
   * mutirana kopija ne smije u repozitorij, pa presudu racuna cisti node.
   * @returns true kad presuda ODBIJA uz tudji vitest.
   */
  async function refusesForeignVitest(source: string): Promise<boolean> {
    const { mkdtempSync, writeFileSync: write, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { pathToFileURL } = await import('node:url');
    const { spawnSync } = await import('node:child_process');
    const dir = mkdtempSync(join(tmpdir(), 'lekta-gate-mut-'));
    try {
      const file = join(dir, 'gate-preflight.mjs');
      write(file, source);
      const state = {
        nowMs: Date.now(), lockPath: 'x', lock: null, lockAlive: null,
        foreignTestProcesses: [{ pid: 8524, commandLine: 'node node_modules/vitest/vitest.mjs run' }],
        claudeProcessCount: 1, freeMemBytes: 8 * 1024 ** 3, freeDiskBytes: 80 * 1024 ** 3, worktree: 'w', injected: false,
      };
      const script = `const m = await import(${JSON.stringify(pathToFileURL(file).href)});`
        + `process.stdout.write(JSON.stringify(m.judgeGate(${JSON.stringify(state)})));`;
      const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60_000 });
      const verdict = JSON.parse(res.stdout) as { allow: boolean };
      return verdict.allow === false;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('(a) preflight koji propusta uz tudji vitest obara tvrdnju', async () => {
    const source = readLf('scripts/gate-preflight.mjs');
    // BASELINE: stvarni preflight odbija.
    expect(await refusesForeignVitest(source)).toBe(true);

    // MUTACIJA: tudji pokretac se samo biljezi kao upozorenje, nikad ne blokira.
    const mutated = source.replace('    if (nested) warnings.push(msg);\n    else blockers.push(msg);', '    warnings.push(msg);');
    expect(mutated).not.toBe(source);
    expect(await refusesForeignVitest(mutated)).toBe(false);
  }, 120_000);

  it('(b) omotac koji ne otpusta lock pri padu naredbe obara tvrdnju', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync: write, existsSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { spawnSync } = await import('node:child_process');

    const wrapper = readLf('scripts/with-gate-lock.mjs');
    const preflight = readLf('scripts/gate-preflight.mjs');

    /** Tvrdnja iz tests/with-gate-lock.test.ts: naredba padne s 3, kod se cuva, lock je otpusten. */
    function releasesOnFailure(wrapperSource: string): boolean {
      const root = mkdtempSync(join(tmpdir(), 'lekta-gate-mut-omotac-'));
      try {
        mkdirSync(join(root, 'scripts'));
        write(join(root, 'scripts', 'with-gate-lock.mjs'), wrapperSource);
        write(join(root, 'scripts', 'gate-preflight.mjs'), preflight);
        const lockPath = join(root, 'lekta-gate.lock');
        const measurement = join(root, 'mjerenje.json');
        write(measurement, JSON.stringify({ processes: [], freeMemBytes: 8 * 1024 ** 3, freeDiskBytes: 80 * 1024 ** 3 }));
        const env: NodeJS.ProcessEnv = { ...process.env, LEKTA_GATE_LOCK_PATH: lockPath, LEKTA_GATE_MEASUREMENT_FILE: measurement };
        delete env.CI;
        delete env.LEKTA_GATE_FORCE;
        delete env.LEKTA_GATE_LOCK_TOKEN;
        const res = spawnSync(process.execPath, [join(root, 'scripts', 'with-gate-lock.mjs'), 'mutacija', '--', 'node', '-e', 'process.exit(3)'], {
          cwd: root, env, encoding: 'utf8', timeout: 90_000,
        });
        return res.status === 3 && !existsSync(lockPath);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }

    // BASELINE: stvarni omotac otpusta lock i kad naredba padne.
    expect(releasesOnFailure(wrapper)).toBe(true);

    // MUTACIJA: otpustanje samo na uspjeh (oblik `preflight && naredba && release`), bez zadnje
    // linije obrane na izlazu procesa.
    const mutated = wrapper
      .replace("  process.on('exit', release);\n", '')
      .replace('    return code;\n  } finally {\n', '    if (code === 0) release();\n    return code;\n  } finally {\n')
      .replace('    }\n    release();\n  }', '    }\n    // otpustanje premjesteno na uspjeh\n  }');
    expect(mutated).not.toBe(wrapper);
    expect(mutated).not.toContain("process.on('exit', release)");
    expect(mutated).toContain('// otpustanje premjesteno na uspjeh');
    expect(releasesOnFailure(mutated)).toBe(false);
  }, 120_000);

  /** Izvrsava `readLock(path)` iz izvora u zasebnom node procesu; vraca je li bacio i sto je vratio. */
  async function ocijeniReadLock(source: string, path: string): Promise<{ threw: boolean; value: unknown }> {
    const { mkdtempSync, writeFileSync: write, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { pathToFileURL } = await import('node:url');
    const { spawnSync } = await import('node:child_process');
    const dir = mkdtempSync(join(tmpdir(), 'lekta-gate-mut-readlock-'));
    try {
      const file = join(dir, 'gate-preflight.mjs');
      write(file, source);
      const script = `const m = await import(${JSON.stringify(pathToFileURL(file).href)});`
        + `let out; try { out = { threw: false, value: m.readLock(${JSON.stringify(path)}) }; }`
        + `catch (e) { out = { threw: true, value: String(e && e.code || e) }; }`
        + `process.stdout.write(JSON.stringify(out));`;
      const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 30_000 });
      return JSON.parse(res.stdout) as { threw: boolean; value: unknown };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('(c) readLock koji baca na EPERM/EBUSY/EACCES rusi gate umjesto fail-open obara tvrdnju', async () => {
    const { mkdtempSync, mkdirSync, rmSync: rm } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const source = readLf('scripts/gate-preflight.mjs');
    const dir = mkdtempSync(join(tmpdir(), 'lekta-gate-mut-readlock-dir-'));
    // Staza postoji ali NIJE datoteka: `readFileSync` na njoj baca gresku koja NIJE ENOENT (npr.
    // EISDIR), imitirajuci istu klasu kvara kao EPERM/EBUSY/EACCES.
    const nijeDatoteka = join(dir, 'lekta-gate.lock');
    mkdirSync(nijeDatoteka);
    try {
      // BASELINE: stvaran readLock ne baca, vraca unmeasurable.
      const baseline = await ocijeniReadLock(source, nijeDatoteka);
      expect(baseline.threw).toBe(false);
      expect(baseline.value).toMatchObject({ unmeasurable: true });

      // MUTACIJA: povratak na stari kvar, svaka greska osim ENOENT se baca i rusi gate.
      const mutated = source.replace(
        "    if (error && error.code === 'ENOENT') return null;\n    return { unmeasurable: true, error: error && error.code ? error.code : 'UNKNOWN' };",
        "    if (error && error.code === 'ENOENT') return null;\n    throw error;",
      );
      expect(mutated).not.toBe(source);
      const posljeMutacije = await ocijeniReadLock(mutated, nijeDatoteka);
      expect(posljeMutacije.threw).toBe(true);
    } finally {
      rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  /** Izvrsava `canTakeOverLock(status, age)` iz izvora u zasebnom node procesu. */
  async function ocijeniCanTakeOverLock(source: string, status: string, age: number): Promise<boolean> {
    const { mkdtempSync, writeFileSync: write, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { pathToFileURL } = await import('node:url');
    const { spawnSync } = await import('node:child_process');
    const dir = mkdtempSync(join(tmpdir(), 'lekta-gate-mut-takeover-'));
    try {
      const file = join(dir, 'gate-preflight.mjs');
      write(file, source);
      const script = `const m = await import(${JSON.stringify(pathToFileURL(file).href)});`
        + `process.stdout.write(JSON.stringify(m.canTakeOverLock(${JSON.stringify(status)}, ${age})));`;
      const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 30_000 });
      return JSON.parse(res.stdout) as boolean;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('(d) preuzimanje mrtvog locka bez donje granice starosti obara tvrdnju (uska utrka dvije sesije)', async () => {
    const source = readLf('scripts/gate-preflight.mjs');
    const mladi = 10; // ms, daleko ispod THRESHOLDS.minTakeoverAgeMs

    // BASELINE: lock mrtav/zastario ali mladji od praga se NE preuzima.
    expect(await ocijeniCanTakeOverLock(source, 'dead', mladi)).toBe(false);
    expect(await ocijeniCanTakeOverLock(source, 'stale', mladi)).toBe(false);

    // MUTACIJA: donja granica starosti nestaje, preuzima se cim je status dead/stale, bez obzira
    // koliko je lock svjez, sto je upravo uska utrka koju vlasnik prijavljuje.
    const mutated = source.replace(
      "  if (status !== 'dead' && status !== 'stale') return false;\n  return age === null || age >= thresholds.minTakeoverAgeMs;",
      "  return status === 'dead' || status === 'stale';",
    );
    expect(mutated).not.toBe(source);
    expect(await ocijeniCanTakeOverLock(mutated, 'dead', mladi)).toBe(true);
  }, 60_000);
});

describe('mutacije: granica statickog grafa ulaza (helpers/entry-graph-boundary.ts)', () => {
  const readLf = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

  /**
   * Predikat se izvrsava kao ODVOJEN Node proces (ne kroz vitestov/viteov ucitavac), jer dinamicki
   * `import()` unutar vitesta odbija ucitati datoteku izvan korijena projekta ("Failed to load
   * url ... Does the file exist?"), pa se svaka varijanta izvora ispisuje u privremenu datoteku i
   * pokrece odvojenim `node` procesom, isto kao gore za `gate-preflight.mjs`.
   */
  async function ocijeni(source: string, path: string, root: string, platform: string): Promise<boolean> {
    const { mkdtempSync, writeFileSync: write, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { pathToFileURL } = await import('node:url');
    const { spawnSync } = await import('node:child_process');
    // Minimalno skidanje TypeScript tipova: jedini oblici u ovoj datoteci su `: string` i
    // `: boolean` iza parametra ili liste parametara, sto native ESM ne razumije.
    const plainJs = source
      .replace(/:\s*(?:string|boolean)\b/g, '')
      .replace(/opts:\s*\{\s*platform\?\s*\}\s*=\s*\{\}/, 'opts = {}');
    const dir = mkdtempSync(join(tmpdir(), 'lekta-gate-mut-graf-'));
    try {
      const file = join(dir, 'entry-graph-boundary.mjs');
      write(file, plainJs);
      // Platforma se predaje IZRICITO (nikad iz stvarnog `process.platform` procesa koji izvrsava
      // ovaj test), jer CI Linux runner i lokalni Windows razvoj moraju mjeriti ISTU logiku.
      const script = `const m = await import(${JSON.stringify(pathToFileURL(file).href)});`
        + `process.stdout.write(JSON.stringify(m.zabranjenUGrafuUlaza(${JSON.stringify(path)}, ${JSON.stringify(root)}, { platform: ${JSON.stringify(platform)} })));`;
      const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 30_000 });
      return JSON.parse(res.stdout) as boolean;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('(c) usporedba nad apsolutnom stazom (bez svodenja na korijen) obara tvrdnju', async () => {
    const source = readLf('tests/helpers/entry-graph-boundary.ts');
    const dopusteni = 'src/shared/ui-boot.ts';
    const zabranjeni = 'src/analysis/run.ts';
    const root = 'C:/wt/wf-gate-preflight-lock';

    // BASELINE: stvaran predikat mjeri relativno, pa ime checkouta ne utjece na dopusten modul, a
    // stvaran zabranjen modul u istom checkoutu i dalje pada. Platforma je izricito 'win32' da
    // ishod ne ovisi o stvarnom OS-u na kojem se ovaj test izvrsava.
    expect(await ocijeni(source, `${root}/${dopusteni}`, root, 'win32')).toBe(false);
    expect(await ocijeni(source, `${root}/${zabranjeni}`, root, 'win32')).toBe(true);

    // MUTACIJA: povratak na stari kvar, regex gleda apsolutnu stazu bez svodenja na korijen, pa ime
    // checkouta koje sadrzi zabranjenu rijec (`preflight`) lazno oznaci i dopusten modul, dok bi
    // ANALIZATOR morao ostati uhvacen.
    const mutated = source.replace(
      /const relativno = podudaraSeSPrefiksom \? posixPath\.slice\(rootPrefix\.length - 1\) : posixPath;/,
      'const relativno = posixPath;',
    );
    expect(mutated).not.toBe(source);
    expect(await ocijeni(mutated, `${root}/${dopusteni}`, root, 'win32')).toBe(true);
    expect(await ocijeni(mutated, `${root}/${zabranjeni}`, root, 'win32')).toBe(true);
  }, 60_000);

  it('(d) preskocena normalizacija velicine slova diska na win32 obara tvrdnju', async () => {
    const source = readLf('tests/helpers/entry-graph-boundary.ts');
    const dopusteni = 'src/shared/ui-boot.ts';
    const root = 'C:/wt/wf-gate-preflight-lock';
    const stazaDrugimSlovomDiska = `c:/wt/wf-gate-preflight-lock/${dopusteni}`;

    // BASELINE: platforma je izricito 'win32', pa slovo diska u drugoj velicini i dalje pogadja
    // prefiks i dopusten modul ostaje dopusten. Test predaje platformu kao parametar (ne cita
    // stvaran `process.platform` runnera) da CI Linux i lokalni Windows mjere istu logiku.
    expect(await ocijeni(source, stazaDrugimSlovomDiska, root, 'win32')).toBe(false);

    // MUTACIJA: usporedba prefiksa vise ne normalizira na mala slova, pa se staza s drugim slovom
    // diska vise ne prepoznaje kao unutar korijena i pada natrag na strozi apsolutni uvjet, koji
    // dopusteni modul lazno proglasava zabranjenim. Mutant i dalje pada uz izricit 'win32', dakle
    // neovisno o platformi runnera koji izvrsava sam vitest.
    const mutated = source.replace(
      "const podudaraSeSPrefiksom = platform === 'win32'\n    ? posixPath.toLowerCase().startsWith(rootPrefix.toLowerCase())\n    : posixPath.startsWith(rootPrefix);",
      'const podudaraSeSPrefiksom = posixPath.startsWith(rootPrefix);',
    );
    expect(mutated).not.toBe(source);
    expect(await ocijeni(mutated, stazaDrugimSlovomDiska, root, 'win32')).toBe(true);
  }, 60_000);

  it('(e) na linuxu se velicina slova diska NE normalizira, gard i dalje hvata zabranjen modul', async () => {
    const source = readLf('tests/helpers/entry-graph-boundary.ts');
    const dopusteni = 'src/shared/ui-boot.ts';
    const zabranjeni = 'src/analysis/run.ts';
    const root = 'C:/wt/wf-gate-preflight-lock';
    const stazaDrugimSlovomDiska = `c:/wt/wf-gate-preflight-lock/${dopusteni}`;

    // BASELINE (linux): isto slovo diska i dalje pogadja prefiks, dopusten modul ostaje dopusten, a
    // stvaran zabranjen modul u istom korijenu i dalje pada.
    expect(await ocijeni(source, `${root}/${dopusteni}`, root, 'linux')).toBe(false);
    expect(await ocijeni(source, `${root}/${zabranjeni}`, root, 'linux')).toBe(true);
    // Na linuxu se velicina slova NE normalizira: drugo slovo diska vise ne pogadja prefiks, staza
    // pada natrag na strozi apsolutni uvjet, isti onaj kojeg opisuje test (c) - a ime checkouta
    // `wf-gate-preflight-lock` samo po sebi sadrzi zabranjenu rijec `preflight`, pa je ovdje lazno
    // zabranjen. Ovo je poznato, nepromijenjeno ogranicenje apsolutne grane, ne novi kvar.
    expect(await ocijeni(source, stazaDrugimSlovomDiska, root, 'linux')).toBe(true);
  }, 60_000);
});

describe('mutacije: .github/workflows trigeri (CI minute, ne vrti dvaput po PR-u)', () => {
  it('workflow s golim push: (bez branches: [master]) obara gard', () => {
    const cist: NamedWorkflow[] = [
      {
        file: 'primjer-cist.yml',
        doc: { on: { push: { branches: ['master'] }, pull_request: {} } },
      },
    ];
    // BASELINE: push ogranicen na master prolazi bez nalaza.
    expect(findBarePushWorkflows(cist)).toEqual([]);

    // MUTACIJA: netko doda goli 'push:' bez branches filtra (kao prije popravka u
    // check.yml/conformance.yml/... 2026-09-26), sto vrti workflow i na push i na pull_request
    // za isti commit na PR grani.
    const mutiran: NamedWorkflow[] = [
      {
        file: 'primjer-mutiran.yml',
        doc: { on: { push: null, pull_request: {} } },
      },
    ];
    expect(findBarePushWorkflows(mutiran)).toEqual(['primjer-mutiran.yml']);

    // Imenovana iznimka i dalje prolazi bez nalaza kad je eksplicitno navedena.
    expect(findBarePushWorkflows(mutiran, new Set(['primjer-mutiran.yml']))).toEqual([]);
  });

  it('pull_request bez concurrency grupe ovisne o grani obara gard', () => {
    const cist: NamedWorkflow[] = [
      {
        file: 'primjer-cist.yml',
        doc: {
          on: { pull_request: {} },
          concurrency: {
            group: '${{ github.workflow }}-${{ github.ref }}',
            'cancel-in-progress': "${{ github.ref != 'refs/heads/master' }}",
          },
        },
      },
    ];
    expect(findPullRequestWithoutConcurrency(cist)).toEqual([]);

    // MUTACIJA: concurrency blok izostavljen posve.
    const bezConcurrency: NamedWorkflow[] = [
      { file: 'primjer-bez-concurrency.yml', doc: { on: { pull_request: {} } } },
    ];
    expect(findPullRequestWithoutConcurrency(bezConcurrency)).toEqual(['primjer-bez-concurrency.yml']);

    // MUTACIJA: concurrency postoji ali cancel-in-progress je gola konstanta 'true', pa bi
    // otkazivao i runove na masteru (kontraugovor "na masteru se ne otkazuje").
    const golaKonstanta: NamedWorkflow[] = [
      {
        file: 'primjer-gola-konstanta.yml',
        doc: {
          on: { pull_request: {} },
          concurrency: { group: '${{ github.workflow }}-${{ github.ref }}', 'cancel-in-progress': true },
        },
      },
    ];
    expect(findPullRequestWithoutConcurrency(golaKonstanta)).toEqual(['primjer-gola-konstanta.yml']);
  });
});

describe('mutacije: self-hosted Word runner na javnom repou (T80, Codex F1, F3, F5 na #162)', () => {
  const IF = "github.event.repository.fork == false && github.repository == 'danielrisavi77-create/Lekta'";
  const RAW = 'name: word-proof\npermissions:\n  contents: read\n';
  // Ugovor mutacijskog testa mora sadrzavati stvarne Word preflight korake.
  // Minimalni stari fixture (checkout + origin + release) vise ne zadovoljava P1 fail-closed guard,
  // pa bi njegovi sintetski mutanti padali zbog NEPOVEZANIH praznih Deno/Python koraka.
  const actualWordProof = parseYaml(readFileSync('.github/workflows/word-proof.yml', 'utf8')) as WorkflowFile;
  const wordProof = (): NamedWorkflow => ({
    file: 'word-proof.yml',
    raw: RAW,
    doc: structuredClone(actualWordProof),
  });
  const drugi = (runsOn: unknown): NamedWorkflow => ({
    file: 'drugi.yml',
    raw: 'name: drugi\n',
    doc: { on: { push: { branches: ['master'] } }, jobs: { posao: { 'runs-on': runsOn } } },
  });
  const nalazi = (...w: NamedWorkflow[]) => findSelfHostedProblems(w);

  it('BASELINE: tocan word-proof i drugi workflow na ubuntu-latest su cisti', () => {
    expect(nalazi(wordProof(), drugi('ubuntu-latest'))).toEqual([]);
  });

  it('F1: drugi workflow s golom oznakom word, windows, self-hosted, izrazom ili grupom se hvata', () => {
    for (const runsOn of ['word', 'windows', 'self-hosted', ['self-hosted'], '${{ matrix.os }}', { group: 'default' }]) {
      expect(nalazi(drugi(runsOn)), JSON.stringify(runsOn)).toHaveLength(1);
    }
  });

  it('F5: slabiji if (|| umjesto &&) se hvata', () => {
    const m = wordProof();
    m.doc.jobs!['word-proof'].if = IF.replace('&&', '||');
    expect(nalazi(m)).toEqual([`word-proof.yml: job word-proof if mora biti tocno: ${IF}`]);
  });

  it('F5: push.tags uz dopustene grane se hvata', () => {
    const m = wordProof();
    (m.doc.on as Record<string, unknown>).push = { branches: ['master', 'release/**'], tags: ['v*'] };
    expect(nalazi(m)).toEqual(['word-proof.yml: push smije imati samo branches (ima: branches, tags)']);
  });

  it('F5: workflow_call i pull_request trigeri se hvataju', () => {
    for (const trigger of ['workflow_call', 'pull_request']) {
      const m = wordProof();
      (m.doc.on as Record<string, unknown>)[trigger] = {};
      expect(nalazi(m)[0], trigger).toMatch(/^word-proof\.yml: trigeri moraju biti tocno push, workflow_dispatch/);
    }
  });

  it('F5: secrets: inherit, secrets[ i secrets. se hvataju', () => {
    for (const dodatak of ['    secrets: inherit\n', "    env:\n      K: ${{ secrets['K'] }}\n", '      K: ${{ secrets.K }}\n']) {
      const m = wordProof();
      m.raw = RAW + dodatak;
      expect(nalazi(m), dodatak).toEqual(['word-proof.yml: spominje secrets (secrets., secrets[ ili secrets: inherit)']);
    }
  });

  it('F5: prosireni runs-on i pravo pisanja se hvataju', () => {
    const m = wordProof();
    m.doc.jobs!['word-proof']['runs-on'] = ['self-hosted', 'windows', 'word', 'x64'];
    m.doc.permissions = { contents: 'write' };
    expect(nalazi(m)).toEqual([
      'word-proof.yml: job word-proof runs-on mora biti tocno [self-hosted, windows, word]',
      'word-proof.yml: job word-proof nema permissions samo contents: read',
    ]);
  });

  it('F3: provjera porijekla s --contains ili korak koji izvrsava kod prije nje se hvata', () => {
    const contains = wordProof();
    contains.doc.jobs!['word-proof'].steps![1].run = 'git branch -r --contains HEAD';
    expect(nalazi(contains)).toEqual([
      'word-proof.yml: job word-proof Porijeklo commita mora usporedjivati tocne vrhove grana, ne --contains',
    ]);
    const prije = wordProof();
    prije.doc.jobs!['word-proof'].steps!.splice(1, 0, { name: 'npm ci', run: 'npm ci' });
    expect(nalazi(prije)).toEqual(['word-proof.yml: job word-proof izvrsava nesto prije koraka Porijeklo commita']);
  });
});

describe('mutacije: obvezni retci opisa PR-a (T58)', () => {
  type Provjera = (body: string, nove: string[]) => string[];
  type Nove = (base: unknown, head: unknown) => string[];
  type Neto = (shortstat: string) => string;

  /** Tvrdnja garda: opis bez redaka ili s "nema" uz stvarno novu ovisnost ne prolazi. */
  const provjeraGrize = (p: Provjera): boolean =>
    p('Neto redaka: +1/-1\nNove ovisnosti: nema', []).length === 0
    && p('Neto redaka: +1/-1\nNove ovisnosti: nema', ['zod']).length > 0
    && p('Nove ovisnosti: nema', []).length > 0
    && p('<!-- Neto redaka: +1/-1\nNove ovisnosti: nema -->', []).length > 0;
  /** Tvrdnja: nova devDependency je nova ovisnost jednako kao dependency. */
  const noveGrize = (n: Nove): boolean =>
    n({ dependencies: {} }, { dependencies: {} }).length === 0
    && n({ dependencies: {} }, { devDependencies: { 'left-pad': '1' } }).join() === 'left-pad';
  /** Tvrdnja: ulaz koji nije shortstat rusi mjerenje, ne daje +0/-0. */
  const netoGrize = (f: Neto): boolean => {
    if (f(' 1 file changed, 2 insertions(+)') !== '+2/-0') return false;
    try {
      f('fatal: bad revision');
      return false;
    } catch {
      return true;
    }
  };

  it('baseline: stvarne funkcije zadovoljavaju tvrdnje', async () => {
    const m = await import('../scripts/agents/pr-lines.mjs');
    expect(provjeraGrize(m.provjeriOpisPr)).toBe(true);
    expect(noveGrize(m.noveOvisnosti)).toBe(true);
    expect(netoGrize(m.netoRedaka)).toBe(true);
  });

  it('(a) provjera koja gleda samo prisutnost retka, ne i "nema" uz novu ovisnost, obara tvrdnju', async () => {
    const m = await import('../scripts/agents/pr-lines.mjs');
    expect(provjeraGrize((body) => m.provjeriOpisPr(body, []))).toBe(false);
  });

  it('(b) usporedba samo sekcije dependencies (devDependencies propustene) obara tvrdnju', async () => {
    const m = await import('../scripts/agents/pr-lines.mjs');
    const samoDeps: Nove = (base, head) => m.noveOvisnosti(
      { dependencies: (base as { dependencies?: object }).dependencies },
      { dependencies: (head as { dependencies?: object }).dependencies },
    );
    expect(noveGrize(samoDeps)).toBe(false);
  });

  it('(c) neto koji na neprepoznat ulaz tiho vrati +0/-0 obara tvrdnju', async () => {
    const m = await import('../scripts/agents/pr-lines.mjs');
    const tiho: Neto = (s) => {
      try {
        return m.netoRedaka(s);
      } catch {
        return '+0/-0';
      }
    };
    expect(netoGrize(tiho)).toBe(false);
  });
});

describe('mutacije: T102 zastavica prijave Googleom ostaje izvan repozitorija', () => {
  // Stvaran kvar koji imitira: netko ukljuci Google prijavu commitom u netlify.toml prije nego sto
  // je provider uskladjen s Katedrom (dijeljeni Auth), ili primjer okoline zadano ukljuci zastavicu.
  const toml = readFileSync('netlify.toml', 'utf8').replace(/\r\n/g, '\n');
  const env = readFileSync('.env.example', 'utf8').replace(/\r\n/g, '\n');

  it('BASELINE: stvarni netlify.toml i .env.example su cisti', () => {
    expect(googleFlagProblems(toml, env)).toEqual([]);
  });

  it('mutant: netlify.toml produkcijski kontekst ukljuci zastavicu', () => {
    const m = `${toml}
[context.production.environment]
  VITE_AUTH_GOOGLE_ENABLED = "true"
`;
    expect(googleFlagProblems(m, env).some((p) => p.includes('netlify.toml') && p.includes('VITE_AUTH_GOOGLE_ENABLED'))).toBe(true);
  });

  it('mutant: zastavica samo u komentaru netlify.toml nije dodjela (gard ne vristi na sve)', () => {
    expect(googleFlagProblems(`${toml}
# VITE_AUTH_GOOGLE_ENABLED = "true"
`, env)).toEqual([]);
  });

  it('mutant: .env.example zadano ukljuci zastavicu ili izgubi oznaku [klijent]', () => {
    expect(googleFlagProblems(toml, env.replace('VITE_AUTH_GOOGLE_ENABLED=', 'VITE_AUTH_GOOGLE_ENABLED=true'))).toEqual([
      '.env.example postavlja VITE_AUTH_GOOGLE_ENABLED=true; primjer mora biti iskljucen (prazno)',
    ]);
    const bezOznake = env.replace('# [klijent] Prijava Googleom', '# Prijava Googleom');
    expect(googleFlagProblems(toml, bezOznake)).toEqual(['.env.example: VITE_AUTH_GOOGLE_ENABLED nema oznaku [klijent] u komentaru iznad']);
  });

  it('mutant: svaki TOML oblik kljuca se hvata (jednostruko citiran, tockasti, inline tablica, iza komentara u istom retku)', () => {
    const oblici = [
      `[context.production.environment]\n  'VITE_AUTH_GOOGLE_ENABLED' = "true"`,
      `[context.production]\n  environment.VITE_AUTH_GOOGLE_ENABLED = "true"`,
      `[context.production]\n  environment = { VITE_AUTH_GOOGLE_ENABLED = "true" }`,
      `[build.environment]\n  "VITE_AUTH_GOOGLE_ENABLED"="1" # tiho ukljuceno`,
      // TOML escape sekvence u citiranom kljucu (Codex R4 runda 2 na #307).
      `[context.production.environment]\n  "\\u0056ITE_AUTH_GOOGLE_ENABLED" = "true"`,
      `[context.production.environment]\n  "VITE_AUTH_\\U00000047OOGLE_ENABLED" = "true"`,
    ];
    for (const o of oblici) {
      expect(googleFlagProblems(`${toml}\n${o}\n`, env).filter((p) => p.startsWith('netlify.toml:')), o).toHaveLength(1);
    }
    // Negativna kontrola: ime u komentaru iza vrijednosti nije dodjela, a # unutar navodnika nije komentar.
    expect(googleFlagProblems(`${toml}\nX = "a#b" # VITE_AUTH_GOOGLE_ENABLED nije ovdje\n`, env)).toEqual([]);
  });

  it('mutant: .env.example s drugim unosom, export oblikom ili citiranom vrijednoscu se hvata', () => {
    const drugi = `${env}\nVITE_AUTH_GOOGLE_ENABLED=true\n`;
    expect(googleFlagProblems(toml, drugi)).toEqual([
      '.env.example dodjeljuje VITE_AUTH_GOOGLE_ENABLED 2 puta; dopusten je tocno jedan unos',
      '.env.example postavlja VITE_AUTH_GOOGLE_ENABLED=true; primjer mora biti iskljucen (prazno)',
    ]);
    expect(googleFlagProblems(toml, env.replace('VITE_AUTH_GOOGLE_ENABLED=', 'export VITE_AUTH_GOOGLE_ENABLED = "1"'))).toEqual([
      '.env.example postavlja VITE_AUTH_GOOGLE_ENABLED=1; primjer mora biti iskljucen (prazno)',
    ]);
    // Negativna kontrola: prazna citirana vrijednost je i dalje iskljucena.
    expect(googleFlagProblems(toml, env.replace('VITE_AUTH_GOOGLE_ENABLED=', 'VITE_AUTH_GOOGLE_ENABLED=""'))).toEqual([]);
  });
});

describe('mutacije: T102 izvor prijave Googleom (zastavica fail-closed, PKCE povratak)', () => {
  // Mutanti mijenjaju STVARNI izvor src/auth/google-flag.ts i src/auth/google-oauth.ts u memoriji
  // (esbuild u CommonJS, bez upisa u repozitorij), a ugovor se izvrsava nad mutiranom funkcijom.
  function izvrsiAuthIzvor(datoteka: string, od: string, u: string): Record<string, unknown> {
    const izvor = readTextLf(resolve(process.cwd(), 'src', 'auth', datoteka));
    const mutiran = izvor.replace(od, u);
    if (od !== u) expect(mutiran, `zamjena nije pogodila izvor: ${od}`).not.toBe(izvor);
    const { code } = esbuild.transformSync(mutiran, { loader: 'ts', format: 'cjs' });
    const modul: { exports: Record<string, unknown> } = { exports: {} };
    const uvozi: Record<string, unknown> = { './session': sessionModul, './google-callback': googleCallbackModul };
    const zahtjev = (ime: string): unknown => {
      if (!(ime in uvozi)) throw new Error(`neocekivan uvoz u mutiranom izvoru: ${ime}`);
      return uvozi[ime];
    };
    new Function('module', 'exports', 'require', code)(modul, modul.exports, zahtjev);
    return modul.exports;
  }
  const zastavica = (od: string, u: string) =>
    izvrsiAuthIzvor('google-flag.ts', od, u).googleAuthEnabled as (env: Record<string, unknown>) => boolean;
  const povratak = (od: string, u: string) =>
    izvrsiAuthIzvor('google-oauth.ts', od, u).completeGoogleSignIn as Parameters<typeof pkceContractProblems>[0];

  it('BASELINE: nemutirani izvor kroz isti ucitavac je cist (zastavica i PKCE povratak)', async () => {
    expect(flagContractProblems(zastavica('', ''))).toEqual([]);
    expect(await pkceContractProblems(povratak('', ''), PKCE_MAX_AGE_MS)).toEqual([]);
  });

  it('mutant: zastavica fail-open (sve osim false/0 ukljucuje) se hvata', () => {
    const m = zastavica("return raw === 'true' || raw === '1';", "return raw !== 'false' && raw !== '0';");
    expect(flagContractProblems(m)).toEqual(expect.arrayContaining(['ukljucena za ""', 'ukljucena bez varijable', 'ukljucena za "yes"']));
  });

  it('mutant: povratak bez provjere isteka verifiera se hvata', async () => {
    const m = povratak('if (!(now - pending.createdAt >= 0 && now - pending.createdAt <= PKCE_MAX_AGE_MS)) {', 'if (false) {');
    expect(await pkceContractProblems(m, PKCE_MAX_AGE_MS)).toEqual(['istekao verifier nije odbijen bez mreze']);
  });

  it('mutant: verifier koji se ne trosi (visekratni povratak) se hvata', async () => {
    const m = povratak('  if (!pending || typeof pending.verifier !== \'string\' || !pending.verifier) return null;\n  opts.store.save(null);', '  if (!pending || typeof pending.verifier !== \'string\' || !pending.verifier) return null;');
    expect(await pkceContractProblems(m, PKCE_MAX_AGE_MS)).toEqual(['verifier nije potrosen']);
  });

  it('mutant: povratak bez provjere identiteta (Codex R3 na #307) se hvata', async () => {
    const m = povratak("    if (!verifiedIdentity(raw)) return { ok: false, message: 'nevaljan identitet u odgovoru poslužitelja' };\n", '');
    expect(await pkceContractProblems(m, PKCE_MAX_AGE_MS)).toEqual(['odgovor bez user prihvacen kao prijava', 'odgovor anonimni korisnik prihvacen kao prijava']);
  });
});

/**
 * Dependabot iznimka u pr-opis (koordinator lekta-37, Codex #290 nalaz 2). Mutacije mijenjaju STVARNI
 * izvor scripts/agents/pr-lines.mjs u izoliranoj kopiji i pokrecu CLI nad privremenim git repozitorijem
 * (tests/helpers/pr-lines-cli.ts): Dependabot bez redaka prolazi, isti opis s covjekom pada, nepodrzan
 * manifest pada, a bump nije nova ovisnost.
 */
describe('mutacije: pr-opis iznimka samo za Dependabot (stvarni CLI)', () => {
  let repo = '';
  beforeAll(() => { repo = napraviPrLinesRepo(); });
  afterAll(() => { if (repo) rmSync(repo, { recursive: true, force: true }); });

  const mutant = (staro: string, novo: string): string => {
    if (PR_LINES_IZVOR.split(staro).length !== 2) throw new Error(`mutacija ne pogadja izvor tocno jednom: ${staro}`);
    return PR_LINES_IZVOR.replace(staro, novo);
  };
  const MUTACIJE: Array<[string, string, string]> = [
    ['(a) CLI uvijek postavi autora na Dependabot', "login: process.env.PR_AUTHOR ?? ''", "login: 'dependabot[bot]'"],
    ['(b) iznimka izgubljena (Dependabot opet trazi rucne retke)', 'if (!jeDependabot(autor)) return provjeriOpisPr(body, stvarneNove);', 'return provjeriOpisPr(body, stvarneNove);'],
    ['(c) prepoznavanje samo po loginu, bez tipa racuna', "autor.login === DEPENDABOT_LOGIN && autor.type === 'Bot'", 'autor.login === DEPENDABOT_LOGIN'],
    ['(d) nepodrzan manifest (requirements.txt) prolazi', 'if (izvan.length) {', 'if (false) {'],
    ['(e) bump se ispisuje kao nova ovisnost', '...retciOpisa({ diffShortstat, basePkg, headPkg }),', '`Neto redaka: ${netoRedaka(diffShortstat)}`, `Nove ovisnosti: ${verzije.join(\', \') || \'nema\'}`,'],
  ];

  it('baseline: stvarni izvor zadovoljava tvrdnju', () => {
    expect(dependabotIznimkaDrzi(PR_LINES_IZVOR, repo)).toBe(true);
  }, 60_000);

  it.each(MUTACIJE)('%s obara tvrdnju', (_opis, staro, novo) => {
    const m = staro.includes('PR_AUTHOR ??')
      ? mutant(staro, novo).replace("type: process.env.PR_AUTHOR_TYPE ?? ''", "type: 'Bot'")
      : mutant(staro, novo);
    expect(m).not.toBe(PR_LINES_IZVOR);
    expect(dependabotIznimkaDrzi(m, repo)).toBe(false);
  }, 60_000);
});

describe('mutacije: setup-node npm kes ugasen samo u word-proof.yml', () => {
  const poziv = (npmCache?: string) => `
jobs:
  j:
    steps:
      - uses: ./.github/actions/setup-deps
        with:
          node-version: 24${npmCache === undefined ? '' : `
          npm-cache: '${npmCache}'`}
`;

  it('baseline: word-proof gasi, check ne gasi; mutant bez gasenja u word-proof se hvata', () => {
    expect(npmCacheProblems([{ file: 'word-proof.yml', text: poziv('false') }, { file: 'check.yml', text: poziv() }])).toEqual([]);
    expect(npmCacheProblems([{ file: 'word-proof.yml', text: poziv() }])).toEqual(['word-proof.yml#j: npm kes nije ugasen']);
  });

  it('mutant koji gasi npm kes u hostanom workflowu se hvata', () => {
    expect(npmCacheProblems([{ file: 'check.yml', text: poziv('false') }])).toEqual(['check.yml#j: npm kes ugasen izvan word-proof.yml']);
  });

  it('mutant akcije koja ne prosljedjuje ulaz u setup-node se hvata', () => {
    const akcija = (withBlok: string) => `
inputs:
  npm-cache:
    default: 'true'
runs:
  steps:
    - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
      with:
        node-version: 24${withBlok}
`;
    expect(forwardsNpmCacheInput(akcija('\n        package-manager-cache: ${{ inputs.npm-cache }}'))).toBe(true);
    expect(forwardsNpmCacheInput(akcija(''))).toBe(false);
  });
});

describe('mutacije: .github/workflows/ npm ci mimo setup-deps (CI kesiranje ovisnosti)', () => {
  it('job koji zove "npm ci" izravno, bez composite akcije, obara gard', () => {
    // BASELINE: stvaran repo nema nijedan job koji zove "npm ci" mimo `setup-deps` (dokazano
    // i uzivo u tests/ci-workflow-cache.test.ts, ali gard ovdje mutira SAMO u memoriji).
    const cistWorkflow = `
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - name: Ovisnosti (kesirano)
        uses: ./.github/actions/setup-deps
        with:
          node-version: 24
      - run: npm run check
`;
    expect(jobsWithBareNpmCi(cistWorkflow)).toEqual([]);

    // MUTACIJA: isti job, ali netko je "za brzinu" vratio izravan `npm ci` mimo composite akcije.
    // Ovo je STVARAN kvar koji je gard smisljen hvatati: kesiranje postoji u action.yml, ali ga
    // nitko ne poziva, pa je node_modules kes mrtav teret koji nikad ne pogodi.
    const mutiraniWorkflow = `
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - name: Node 24
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
      - run: npm ci
      - run: npm run check
`;
    expect(jobsWithBareNpmCi(mutiraniWorkflow)).toEqual(['build']);
  });

  it('vanjska akcija pinana na pokretan tag (bez SHA-a) obara gard', () => {
    // BASELINE: stvaran repo pina sve vanjske akcije na 40-heks SHA uz komentar verzije
    // (dokazano uzivo u tests/ci-workflow-cache.test.ts nad svih 16 workflowa).
    const cistWorkflow = `
jobs:
  build:
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - uses: ./.github/actions/setup-deps
        with:
          node-version: 24
`;
    expect(unpinnedExternalUses(cistWorkflow)).toEqual([]);

    // MUTACIJA: pomican tag umjesto SHA-a. Ovo je STVARAN nacin na koji je `repair-net.yml`
    // prije ovog garda referencirao `actions/checkout@v4` i `actions/setup-node@v7`: pomican
    // tag moze tiho pokazati na drugaciji, i po sadrzaju izmijenjen, kod bez ikakvog diffa u
    // ovom repozitoriju.
    const mutiraniWorkflow = `
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-deps
        with:
          node-version: 24
`;
    const problemi = unpinnedExternalUses(mutiraniWorkflow);
    expect(problemi.length).toBeGreaterThan(0);
    expect(problemi[0].text).toContain('actions/checkout@v4');
  });
});

describe('mutacije: routing korak 2 (select-route)', () => {
  const blok = (() => {
    const src = readFileSync(resolve(process.cwd(), 'scripts/agents/select-route.mjs'), 'utf8').replace(/\r/g, '');
    const a = src.indexOf('// >>> DIJELJENO:select-route\n');
    const b = src.indexOf('// <<< DIJELJENO:select-route\n');
    if (a < 0 || b < a) throw new Error('blok DIJELJENO:select-route nije pronadjen');
    return src.slice(a, b);
  })();
  type SelectRoute = (input: Record<string, unknown>) => { model: string | null };
  const izvedi = (code: string): SelectRoute => new Function(`${code}\nreturn selectRoute;`)() as SelectRoute;
  const configSUnverified = () => {
    const cfg = JSON.parse(readFileSync(resolve(process.cwd(), 'config/agent-routing.json'), 'utf8'));
    cfg.models['claude-neverificiran-test'] = { input: 1, output: 1, status: 'unverified' };
    cfg.routing.S.false.roles.implement.model = 'claude-neverificiran-test';
    return cfg;
  };
  /** Tvrdnja garda: neverificiran model iz configa nikad ne izlazi iz selectRoute. */
  const odbijaUnverified = (fn: SelectRoute): boolean => {
    try {
      const r = fn({ config: configSUnverified(), size: 'S', files: [], phase: 'implement' });
      return r.model !== 'claude-neverificiran-test';
    } catch {
      return true;
    }
  };

  it('baseline: stvarni selectRoute odbija neverificiran model', () => {
    expect(odbijaUnverified(izvedi(blok))).toBe(true);
  });

  it('mutant koji preskoci provjeru statusa vraca neverificiran model i gard ga hvata', () => {
    const mutant = blok.replace("if (!spec || spec.status !== 'verified') {", 'if (false) {');
    expect(mutant).not.toBe(blok);
    expect(odbijaUnverified(izvedi(mutant))).toBe(false);
  });
});

describe('mutacije: zivi list na ulazu (Z32)', () => {
  const procitaj = (f: string): string => readFileSync(resolve(__dirname, '..', f), 'utf8').replace(/\r/g, '');
  type Rok = { datum: string | null; neznam: boolean };
  type Vrata = { rok: Rok; fakultetPotvrden?: boolean };

  it('baseline: stvarni kod prolazi sve gardove zivog lista', async () => {
    const g = await import('./helpers/intake-live-guards');
    const { spremnostUlaza, potvrdaVrijediZaSesiju, potvrdaNosiCijeliProfil, rokZaPovratak } = await import('../src/shared/intake-choice');
    const { pecatRoka } = await import('../src/routes/intake/deadline-stamp');
    expect(g.vrataProblemi(spremnostUlaza)).toEqual([]);
    expect(g.povratakRokaProblemi(rokZaPovratak)).toEqual([]);
    expect(g.pecatRokaProblemi(pecatRoka)).toEqual([]);
    expect(g.potvrdaSesijeProblemi(potvrdaVrijediZaSesiju)).toEqual([]);
    expect(g.cijeliProfilProblemi(potvrdaNosiCijeliProfil)).toEqual([]);
    expect(g.ozicenjeUlazaProblemi(procitaj('src/routes/intake/main.ts'))).toEqual([]);
    expect(g.pokretProblemi(procitaj('src/routes/intake/intake.css'), procitaj('index.html'), procitaj('src/shared/ui-boot.ts'))).toEqual([]);
    expect(g.redoslijedPotvrdeProblemi(procitaj('src/routes/workspace/main.ts'))).toEqual([]);
    expect(g.ispustanjeProblemi(procitaj('src/routes/intake/intake-controller.ts'), procitaj('src/routes/intake/intake-live.ts'))).toEqual([]);
    expect(g.detekcijaFakultetaProblemi(
      procitaj('src/ui/app.ts'), procitaj('src/ui/confirmed-faculty.ts'), procitaj('src/routes/workspace/main.ts'),
    )).toEqual([]);
  });

  it('(a) povratak gatea za rok ili fakultet obara gard otvorenog ulaza', async () => {
    const { vrataProblemi } = await import('./helpers/intake-live-guards');
    const { rokOdlucen } = await import('../src/routes/intake/deadline-stamp');
    const otvoreno = { spremno: true, natpis: 'ili ispusti dokument ovdje' };
    const zatvoreno = { spremno: false, natpis: 'Prvo potvrdi rok' };
    // Kvar: stari tok u kojem rok mora biti odlucen prije prve vrijednosti proizvoda.
    const traziRok = (s: Vrata) => (rokOdlucen(s.rok) ? otvoreno : zatvoreno);
    expect(vrataProblemi(traziRok).length).toBeGreaterThan(0);
    // Kvar: vrata opet traze i potvrdjen fakultet.
    const traziFakultet = (s: Vrata) => (s.fakultetPotvrden ? otvoreno : { spremno: false, natpis: 'Prvo potvrdi fakultet' });
    expect(vrataProblemi(traziFakultet).length).toBeGreaterThan(0);
    // Kvar: tok je otvoren, ali copy korisniku i dalje lazno govori da prvo mora potvrditi rok.
    const stariNatpis = (_s: Vrata) => ({ spremno: true, natpis: 'Prvo potvrdi rok' });
    expect(vrataProblemi(stariNatpis).length).toBeGreaterThan(0);
  });

  it('(a2) istekao rok koji se vraca na ulaz obara gard', async () => {
    const { povratakRokaProblemi } = await import('./helpers/intake-live-guards');
    const { rokZaPovratak } = await import('../src/shared/intake-choice');
    // Kvar: zapamcen rok se vraca kakav jest, pa rok proslog rada sam otvara vrata.
    const vratiSve = (rok: Rok) => rok;
    expect(povratakRokaProblemi(vratiSve)).toContain('rok jucer: {"datum":"2026-09-26","neznam":false}, ocekivano {"datum":null,"neznam":false}');
    // Kvar: brise i rok danas (usporedba po satima, ne po kalendaru).
    const strogo = (rok: Rok, danas: Date) => (rok.datum && new Date(`${rok.datum}T00:00`).getTime() < danas.getTime() ? { datum: null, neznam: false } : rokZaPovratak(rok, danas));
    expect(povratakRokaProblemi(strogo).length).toBeGreaterThan(0);
  });

  it('(b) pecat roka po SATIMA (ljetno vrijeme, ponoc) i sklonidba "21 dana" obaraju gard', async () => {
    const { pecatRokaProblemi } = await import('./helpers/intake-live-guards');
    const { pecatRoka, razloziDatum, daniRijecju } = await import('../src/routes/intake/deadline-stamp');
    const poSatima = (s: Rok, danas: Date): string | null => {
      if (s.neznam) return 'Rok nije zadan';
      const r = s.datum ? razloziDatum(s.datum) : null;
      if (!r || !s.datum) return null;
      const dana = Math.floor((new Date(`${s.datum}T00:00`).getTime() - danas.getTime()) / 864e5);
      return `Rok ${r.dan}. ${r.mjesec}. · ${dana < 0 ? 'prošao' : dana === 0 ? 'danas' : daniRijecju(dana)}`;
    };
    expect(pecatRokaProblemi(poSatima).length).toBeGreaterThan(0);
    const uvijekDana = (s: Rok, danas: Date) => pecatRoka(s, danas)?.replace(/ dan$/, ' dana') ?? null;
    expect(pecatRokaProblemi(uvijekDana).length).toBeGreaterThan(0);
  });

  it('(c) potvrda koja ne gleda id sesije, odbija fakultet bez studija ili bez studija nosi profil obara gard', async () => {
    const { potvrdaSesijeProblemi, cijeliProfilProblemi } = await import('./helpers/intake-live-guards');
    type P = { unit: string; program: string | null; workType: string | null; sesija: string | null };
    type O = { unit: string; program: string; workType: string };
    const bezSesije = (p: P | null, s: { imaProfil: boolean }) => Boolean(p && !s.imaProfil);
    expect(potvrdaSesijeProblemi(bezSesije)).toContain('potvrda vrijedi za TUDJU sesiju');
    // Nalaz pregleda Z32: prva izvedba odbijala potvrdu s `program=null` (fakultet iz `?unit=`).
    const trazStudij = (p: P | null, s: { id: string; imaProfil: boolean }) => Boolean(p && !s.imaProfil && p.sesija === s.id && p.program);
    expect(potvrdaSesijeProblemi(trazStudij)).toContain('potvrda fakulteta bez studija (?unit=) ne vrijedi');
    const bezStudija = (p: P, o: O) => p.unit === o.unit;
    expect(cijeliProfilProblemi(bezStudija)).toContain('potvrda bez studija zakljucava fallback');
  });

  it('(g) ispustanje bez provjere vrata (kontroler ili zivi list) obara gard', async () => {
    const { ispustanjeProblemi } = await import('./helpers/intake-live-guards');
    const kontroler = procitaj('src/routes/intake/intake-controller.ts');
    const live = procitaj('src/routes/intake/intake-live.ts');
    // Kvar: kontroler prima ispusteni dokument bez `accepts()`.
    const kontrolerBez = kontroler.replace('if (file && accepts()) void selectFile(file);', 'if (file) void selectFile(file);');
    expect(kontrolerBez).not.toBe(kontroler);
    expect(ispustanjeProblemi(kontrolerBez, live)).toContain('kontroler prima ispusten dokument bez provjere vrata');
    // Kvar: zivi list predaje ispustanje izvan lista bez provjere spremnosti.
    const liveBez = live.replace('    if (!spremnost().spremno) { onBlocked(); return; }\n', '');
    expect(liveBez).not.toBe(live);
    expect(ispustanjeProblemi(kontroler, liveBez)).toContain('ispustanje izvan lista prolazi kroz zatvorena vrata');
    // Kvar: provjera ostane, ali tek POSLIJE predaje.
    const kasno = live.replace('    if (!spremnost().spremno) { onBlocked(); return; }\n    odabir?.(file);', '    odabir?.(file);\n    if (!spremnost().spremno) { onBlocked(); return; }');
    expect(kasno).not.toBe(live);
    expect(ispustanjeProblemi(kontroler, kasno)).toContain('ispustanje izvan lista prolazi kroz zatvorena vrata');
  });

  it('(h) detekcija na /rad/ koja gazi fakultet potvrdjen na ulazu obara gard', async () => {
    const { detekcijaFakultetaProblemi } = await import('./helpers/intake-live-guards');
    const app = procitaj('src/ui/app.ts');
    const fak = procitaj('src/ui/confirmed-faculty.ts');
    const main = procitaj('src/routes/workspace/main.ts');
    expect(detekcijaFakultetaProblemi(app, fak, main), 'cist baseline').toEqual([]);
    // Kvar: detekcija ne pita bravu.
    const bez = app.replace('||!detekcijaSmije(ctx.unitId,', '||!(ctx.unitId,');
    expect(bez).not.toBe(app);
    expect(detekcijaFakultetaProblemi(bez, fak, main)).toContain('detekcija ne postuje fakultet potvrdjen na ulazu');
    // Kvar: primjena fakulteta ne postavlja bravu.
    const bezBrave = fak.replace('  return zakljucajFakultet(ids.unit, jedinicaUObrascu(doc), novoPamcenje);', '  return true;');
    expect(bezBrave).not.toBe(fak);
    expect(detekcijaFakultetaProblemi(app, bezBrave, main)).toContain('primjena fakulteta ne postavlja bravu');
    // Kvar: obrazac se ne postavi prije brave, pa brava cita stari izbornik (iz postavki).
    const rano = fak.replace('  postaviObrazac(ids);\n  return zakljucajFakultet', '  return zakljucajFakultet');
    expect(rano).not.toBe(fak);
    expect(detekcijaFakultetaProblemi(app, rano, main)).toContain('brava se postavlja prije nego obrazac prihvati fakultet');
    // Kvar: fakultet bez studija ostavi `_profileConfirmed` iz postavki, pa nepotvrdjen studij prolazi kao potvrdjen.
    const potvrden = app.replace('applySelectionIds(ids);_profileConfirmed=false}', 'applySelectionIds(ids)}');
    expect(potvrden).not.toBe(app);
    expect(detekcijaFakultetaProblemi(potvrden, fak, main)).toContain('fakultet bez studija oznacen kao potvrdjen profil');
    // Kvar: /rad/ potvrdu bez studija vodi ravno na obrazac, pa brava nikad ne nastane.
    const ravno = main.replace('applyFaculty: (ids, pamcenje) => primijeniFakultetUlaza(ids, applyFacultyIds, pamcenje),', 'applyFaculty: (ids) => { applyFacultyIds(ids); return true; },');
    expect(ravno).not.toBe(main);
    expect(detekcijaFakultetaProblemi(app, fak, ravno)).toContain('/rad/ primjenjuje fakultet s ulaza bez brave');
    // Nalaz pregleda Codex (blocker): cijeli profil s ulaza ide ravno na C4, bez brave, pa rad
    // drugog fakulteta nikad ne dobije napomenu.
    const profilRavno = main.replace('apply: (ids, pamcenje) => primijeniProfilUlaza(ids, applyConfirmedProfileSelection, pamcenje),', 'apply: applyConfirmedProfileSelection,');
    expect(profilRavno).not.toBe(main);
    expect(detekcijaFakultetaProblemi(app, fak, profilRavno)).toContain('/rad/ primjenjuje cijeli profil s ulaza bez brave');
    // Kvar: ponovno otvaranje sesije s vlastitim profilom (C4) bez brave, pa "Prebaci" tiho nestane.
    const obnovaBez = main.replace('      zakljucajObnovljeno: (pamcenje) => { zakljucajObnovljeniFakultet(pamcenje); },\n', '');
    expect(obnovaBez).not.toBe(main);
    expect(detekcijaFakultetaProblemi(app, fak, obnovaBez)).toContain('/rad/ obnavlja profil sesije s ulaza bez brave');
    // Isti nalaz, druga polovica: C4 opet preskace detekciju i kad je fakultet zakljucan.
    const c4Rano = app.replace('if(_sessionProfileApplied&&!potvrdjenFakultet())return;', 'if(_sessionProfileApplied)return;');
    expect(c4Rano).not.toBe(app);
    expect(detekcijaFakultetaProblemi(c4Rano, fak, main)).toContain('potvrdjen profil sesije preskace provjeru potvrdjenog fakulteta');
    // Kvar: detekcija koja smije (isti fakultet) primijeni se preko potvrdjenog profila sesije (C4).
    const c4Gazi = app.replace('||_sessionProfileApplied)return;', ')return;');
    expect(c4Gazi).not.toBe(app);
    expect(detekcijaFakultetaProblemi(c4Gazi, fak, main)).toContain('detekcija gazi potvrdjen profil sesije (C4)');
    // Nalaz pregleda Codex (minor): zamjena dokumenta skriva samo znacku, a vidljivi red ostaje.
    const staraNapomena = app.replace('clearErr();skrijNapomenu();', "clearErr();$('#detectBadge')?.classList.add('hidden');");
    expect(staraNapomena).not.toBe(app);
    expect(detekcijaFakultetaProblemi(staraNapomena, fak, main)).toContain('zamjena dokumenta ostavlja napomenu o starom radu');
  });

  it('(d) main.ts bez kuke canAccept, ili bez veze ispustanja izvan lista, obara gard', async () => {
    const { ozicenjeUlazaProblemi } = await import('./helpers/intake-live-guards');
    const main = procitaj('src/routes/intake/main.ts');
    const bezKuke = main.replace('    canAccept: live.canAccept,\n', '');
    expect(bezKuke).not.toBe(main);
    expect(ozicenjeUlazaProblemi(bezKuke)).toContain('kontroler ne dobiva kuku canAccept');
    const bezVeze = main.replace('live.poveziOdabir((file) => { void controller.selectFile(file); });', '');
    expect(bezVeze).not.toBe(main);
    expect(ozicenjeUlazaProblemi(bezVeze).length).toBeGreaterThan(0);
  });

  it('(e) tragovi bez gasenja pod prigusenim pokretom, beskonacno skeniranje ili linija bez opt-ina obaraju gard', async () => {
    const { pokretProblemi } = await import('./helpers/intake-live-guards');
    const css = procitaj('src/routes/intake/intake.css');
    const html = procitaj('index.html');
    const boot = procitaj('src/shared/ui-boot.ts');
    const bezUpita = css.replace('  .intake-tragovi{display:none}\n', '');
    expect(bezUpita).not.toBe(css);
    expect(pokretProblemi(bezUpita, html, boot)).toContain('tragovi olovke se prikazuju pod prefers-reduced-motion');
    const bezRucnog = css.replace(':root[data-motion="reduce"] .intake-tragovi{display:none}', '');
    expect(bezRucnog).not.toBe(css);
    expect(pokretProblemi(bezRucnog, html, boot).length).toBeGreaterThan(0);
    const beskonacno = css.replace('animation:intake-sken 1.2s linear 14', 'animation:intake-sken 1.2s linear infinite');
    expect(beskonacno).not.toBe(css);
    expect(pokretProblemi(beskonacno, html, boot)).toContain('beskonacna animacija na ulazu');
    const bezOptIna = html.replace('class="intake-sken" aria-hidden="true" data-motion-offscreen', 'class="intake-sken" aria-hidden="true"');
    expect(bezOptIna).not.toBe(html);
    expect(pokretProblemi(css, bezOptIna, boot).length).toBeGreaterThan(0);
    const bootBez = boot.replace("'.ks-priv-scena, [data-motion-offscreen]'", "'.ks-priv-scena'");
    expect(bootBez).not.toBe(boot);
    expect(pokretProblemi(css, html, bootBez)).toContain('ui-boot ne promatra [data-motion-offscreen]');
  });

  it('(f) potvrda s ulaza primijenjena POSLIJE restoreDocument obara gard', async () => {
    const { redoslijedPotvrdeProblemi } = await import('./helpers/intake-live-guards');
    const src = procitaj('src/routes/workspace/main.ts');
    const mutant = src.replace('primijeniPotvrduUlaza({', '__A__({')
      .replace('const restored = await restoreDocument(', 'const restored = await primijeniPotvrduUlaza(')
      .replace('__A__({', 'restoreDocument({');
    expect(mutant).not.toBe(src);
    expect(redoslijedPotvrdeProblemi(mutant).length).toBeGreaterThan(0);
  });
});

describe('mutacije: samo pr-opis reagira na uredjivanje opisa PR-a (edited)', () => {
  const cist: NamedWorkflow[] = [
    {
      file: 'pr-opis.yml',
      doc: { on: { pull_request: { types: ['opened', 'synchronize', 'reopened', 'edited', 'ready_for_review'] } }, jobs: { 'pr-opis': {} } },
    },
    { file: 'foundation-check.yml', doc: { on: { pull_request: { branches: ['master'] } }, jobs: { check: {} } } },
  ];

  it('baseline: samo pr-opis', () => {
    expect(findJobsRunningOnEdited(cist)).toEqual(['pr-opis.yml#pr-opis']);
  });

  it('mutant: edited dodan workflowu s punim checkom (stvaran kvar: pr-opis je prije bio job u foundation-check.yml) se hvata', () => {
    const mutiran: NamedWorkflow[] = [
      cist[0],
      {
        file: 'foundation-check.yml',
        doc: { on: { pull_request: { branches: ['master'], types: ['opened', 'synchronize', 'edited'] } }, jobs: { check: {}, 'pr-opis': {} } },
      },
    ];
    expect(findJobsRunningOnEdited(mutiran)).toEqual([
      'foundation-check.yml#check',
      'foundation-check.yml#pr-opis',
      'pr-opis.yml#pr-opis',
    ]);
  });

  it('job s if koji iskljucuje edited se ne broji', () => {
    const sIf: NamedWorkflow[] = [
      {
        file: 'foundation-check.yml',
        doc: { on: { pull_request: { types: ['opened', 'edited'] } }, jobs: { check: { if: "github.event.action != 'edited'" } } },
      },
    ];
    expect(findJobsRunningOnEdited(sIf)).toEqual([]);
  });
});

describe('mutacije: T98 oznaka povucenog rada (stvarni src/citations/verify-existence.ts u memoriji)', () => {
  const MUT = [
    ['citations/povlacenje-iz-update-to', "(message as { 'updated-by'?: unknown } | null)?.['updated-by']", "(message as { 'update-to'?: unknown } | null)?.['update-to']", '(u)'],
    ['citations/povlacenje-uz-weak', "if (bestScore >= WEAK_MIN) return { verdict: 'weak', score: bestScore, matchedTitle };", "if (bestScore >= WEAK_MIN) return { verdict: 'weak', score: bestScore, matchedTitle, ...(retractionFromWork(best) ? { retraction: retractionFromWork(best) } : {}) };", '(w)'],
    ['citations/povlacenje-doi-bez-tijela', 'retraction = retractionFromWork(message);', 'retraction = null;', '(d)'],
    ['citations/povlacenje-select-bez-updated-by', "params.set('select', 'title,author,issued,DOI,updated-by');", "params.set('select', 'title,author,issued,DOI');", '(s)'],
  ] as const;

  it('baseline: gard je cist nad nemutiranim izvorom', async () => {
    expect(await retractionProblems(loadVerifyExistence())).toEqual([]);
  });

  for (const [id, staro, novo, oznaka] of MUT) {
    it(`${id}: mutacija postoji u izvoru i gard je hvata`, async () => {
      expect(verifyExistenceSource().includes(staro), 'nema sto mutirati: gard bi prolazio vakuumski').toBe(true);
      const problemi = await retractionProblems(loadVerifyExistence((x) => x.split(staro).join(novo)));
      expect(problemi.some((p) => p.startsWith(oznaka)), problemi.join('; ')).toBe(true);
    });
  }
});

describe('mutacije: T82 dnevni izvjestaj ne broji citanje kesa kao ulaz', () => {
  const src = readFileSync(resolve(process.cwd(), 'scripts/agents/usage-daily.mjs'), 'utf8').replace(/\r/g, '');
  const blok = (pocetak: string) => {
    const i = src.indexOf(pocetak);
    return src.slice(i, src.indexOf('\n}\n', i) + 3);
  };
  const numBlok = blok('function num(');
  const tokensBlok = blok('export function claudeTokens(');
  type Tokens = (u: Record<string, number>) => { input: number; cacheRead: number };
  const izvedi = (fn: string): Tokens => new Function(`${numBlok}\n${fn.replace('export ', '')}\nreturn claudeTokens;`)() as Tokens;
  // Tvrdnja: ulaz je samo input_tokens; citanje kesa ide u zaseban stupac i ne dize tezinu.
  const cisto = (t: Tokens) => {
    const r = t({ input_tokens: 3, output_tokens: 4, cache_read_input_tokens: 500, cache_creation_input_tokens: 7 });
    return r.input === 3 && r.cacheRead === 500;
  };

  it('baseline: stvarni claudeTokens odvaja citanje kesa od ulaza', () => {
    expect(cisto(izvedi(tokensBlok))).toBe(true);
  });

  it('mutant koji zbraja cache_read u ulaz se hvata', () => {
    const mutant = tokensBlok.replace('input: num(usage?.input_tokens),', 'input: num(usage?.input_tokens) + num(usage?.cache_read_input_tokens),');
    expect(mutant).not.toBe(tokensBlok);
    expect(cisto(izvedi(mutant))).toBe(false);
  });
});

describe('mutacije: petlja ucenja, skupljac broji kvar jednom i samo is_error', () => {
  const src = readFileSync(resolve(process.cwd(), 'scripts/quality/harvest.mjs'), 'utf8').replace(/\r/g, '');
  const blok = (pocetak: string) => {
    const i = src.indexOf(pocetak);
    return src.slice(i, src.indexOf('\n}\n', i) + 3);
  };
  const textBlok = blok('function resultText(');
  const fnBlok = blok('export function failuresFromLines(');
  const toolsBlok = src.slice(src.indexOf('const REPORT_TOOLS'), src.indexOf('const IS_ERROR_RE'));
  type Fn = (lines: string[], ctx: { seen: Set<string>; stats: { malformedLines: number } }) => unknown[];
  const izvedi = (fn: string): Fn =>
    new Function('localDay', 'sessionLabel', 'classify', 'IS_ERROR_RE', `${toolsBlok}\n${textBlok}\n${fn.replace('export ', '')}\nreturn failuresFromLines;`)(
      () => '2026-10-04', () => 's', () => ({ klasa: 'k', potpis: 'k' }), /"is_error"\s*:\s*true/,
    ) as Fn;
  // Jedna poruka s tri rezultata (paralelni pozivi): t1 i t3 su greske, t2 uspjeh. Redak prolazi brzi filtar.
  const redak = JSON.stringify({
    uuid: 'u1',
    timestamp: '2026-10-04T08:00:00Z',
    message: { content: [
      { type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'x' },
      { type: 'tool_result', tool_use_id: 't2', content: 'ok' },
      { type: 'tool_result', tool_use_id: 't3', is_error: true, content: 'y' },
    ] },
  });
  // Tvrdnja: isti redak dvaput (roditelj i podagent) daje dva kvara (t1, t3), ne cetiri, ne jedan;
  // uspjesan tool_result nije kvar.
  const cisto = (f: Fn) => f([redak, redak], { seen: new Set(), stats: { malformedLines: 0 } }).length === 2;

  it('baseline: stvarni failuresFromLines broji jednom i samo is_error', () => {
    expect(cisto(izvedi(fnBlok))).toBe(true);
  });

  it('naziv alata: baseline ne prenosi privatni naziv, mutant ga otkriva', () => {
    const lines = [JSON.stringify({ uuid: 'private-name', timestamp: '2026-10-04T08:00:00Z', message: { content: [
      { type: 'tool_use', id: 'private', name: 'TAJNI-SADRZAJ' },
      { type: 'tool_result', tool_use_id: 'private', is_error: true, content: 'x' },
    ] } })];
    const safe = (f: Fn) => !JSON.stringify(f(lines, { seen: new Set(), stats: { malformedLines: 0 } })).includes('TAJNI-SADRZAJ');
    expect(safe(izvedi(fnBlok))).toBe(true);
    const mutant = fnBlok.replace('reportTool(toolNames.get(b.tool_use_id))', "toolNames.get(b.tool_use_id) ?? '?'");
    expect(mutant).not.toBe(fnBlok);
    expect(safe(izvedi(mutant))).toBe(false);
  });

  it('mutant bez deduplikacije po uuid+tool_use_id obara tvrdnju', () => {
    const mutant = fnBlok.replace('if (ctx.seen.has(key)) continue;', '');
    expect(mutant).not.toBe(fnBlok);
    expect(cisto(izvedi(mutant))).toBe(false);
  });

  it('mutant koji deduplicira samo po uuid retka (spaja paralelne kvarove) obara tvrdnju', () => {
    const mutant = fnBlok.replace("const key = `${j.uuid ?? ''}|${b.tool_use_id ?? ''}`;", "const key = `${j.uuid ?? ''}`;");
    expect(mutant).not.toBe(fnBlok);
    expect(cisto(izvedi(mutant))).toBe(false);
  });

  it('mutant koji broji svaki tool_result obara tvrdnju', () => {
    const mutant = fnBlok.replace("if (b?.type !== 'tool_result' || b.is_error !== true) continue;", "if (b?.type !== 'tool_result') continue;");
    expect(mutant).not.toBe(fnBlok);
    expect(cisto(izvedi(mutant))).toBe(false);
  });
});

describe('mutacije: lean ratchet (T56)', () => {
  const src = readFileSync(resolve(process.cwd(), 'scripts/lean-report.mjs'), 'utf8').replace(/\r/g, '');
  const metrikeBlok = src.slice(src.indexOf('export const RATCHET_METRIKE'), src.indexOf('];', src.indexOf('export const RATCHET_METRIKE')) + 2);
  const fnStart = src.indexOf('export function ratchetProblems');
  const fnBlok = src.slice(fnStart, src.indexOf('\n}\n', fnStart) + 3);
  type Ratchet = (b: { metrike: Record<string, number> }, c: Record<string, number>) => string[];
  const izvedi = (fn: string): Ratchet =>
    new Function(`${metrikeBlok.replace('export ', '')}\n${fn.replace('export ', '')}\nreturn ratchetProblems;`)() as Ratchet;
  const baseline = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/generated/lean-baseline.json'), 'utf8'));
  /** Tvrdnja garda: rast bilo koje metrike za 1 je nalaz. */
  const hvataRast = (r: Ratchet): boolean =>
    Object.keys(baseline.metrike).every((k) => r(baseline, { ...baseline.metrike, [k]: baseline.metrike[k] + 1 }).length === 1);

  it('baseline: stvarni ratchetProblems hvata rast za 1', () => {
    expect(hvataRast(izvedi(fnBlok))).toBe(true);
  });

  it('mutant koji povisi prag (tolerira rast za 1) obara tvrdnju', () => {
    const mutant = fnBlok.replace('if (c > b)', 'if (c > b + 1)');
    expect(mutant).not.toBe(fnBlok);
    expect(hvataRast(izvedi(mutant))).toBe(false);
  });

  // Windows: Node odbija execFile nad `.cmd` bez shella (EINVAL), pa win32 put nikad ne smije vratiti .cmd.
  const invStart = src.indexOf('export function toolInvocation');
  const invBlok = src.slice(invStart, src.indexOf('\n}\n', invStart) + 3);
  type Invocation = (name: string, o: object) => { command: string; argsPrefix: string[] };
  const izvediInv = (fn: string): Invocation =>
    new Function('path', 'existsSync', 'readFileSync', 'ROOT', `${fn.replace('export ', '')}\nreturn toolInvocation;`)(
      { join }, () => true, () => '', 'X:/repo',
    ) as Invocation;
  const win32Opts = { platform: 'win32', exists: () => true, readText: () => JSON.stringify({ bin: { knip: 'bin/knip.js' } }) };
  const bezCmd = (inv: Invocation): boolean => !inv('knip', win32Opts).command.toLowerCase().endsWith('.cmd');

  it('baseline: stvarni toolInvocation na win32 ne vraca .cmd', () => {
    expect(bezCmd(izvediInv(invBlok))).toBe(true);
  });

  it('mutant koji na win32 vrati .bin/<ime>.cmd (stari EINVAL put) obara tvrdnju', () => {
    const mutant = invBlok.replace(
      'return { command: process.execPath, argsPrefix: [entry] };',
      "return { command: path.join(root, 'node_modules', '.bin', `${name}.cmd`), argsPrefix: [] };",
    );
    expect(mutant).not.toBe(invBlok);
    expect(bezCmd(izvediInv(mutant))).toBe(false);
  });
});

describe('mutacije: Grok bot ne smije implementirati nad protectedPaths', () => {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), 'config/agent-routing.json'), 'utf8')) as {
    bots: Record<string, BotSpec>; protectedPaths: string[];
  };

  it('baseline: stvarni config nema bota koji implementira nad zasticenom stazom', () => {
    expect(findBotsImplementingProtected(config.bots, config.protectedPaths, botPathViolations)).toEqual([]);
  });

  it('mutant: grok-docs dobije src/repair/** u allowlist i izgubi zabranu src/** (se hvata)', () => {
    const mutiran = JSON.parse(JSON.stringify(config.bots)) as Record<string, BotSpec>;
    mutiran['grok-docs'].allowedPaths = [...(mutiran['grok-docs'].allowedPaths ?? []), 'src/repair/**'];
    mutiran['grok-docs'].forbiddenPaths = (mutiran['grok-docs'].forbiddenPaths ?? []).filter((p) => p !== 'src/**');
    const problems = findBotsImplementingProtected(mutiran, config.protectedPaths, botPathViolations);
    expect(problems).toContain('grok-docs smije implementirati src/repair/x.ts');
  });

  it('mutant: read-only bot premjesten u implement bez allowliste ne prolazi ni gard ni resolver', () => {
    const mutiran = JSON.parse(JSON.stringify(config.bots)) as Record<string, BotSpec>;
    mutiran['grok-review'].phases = ['review', 'implement'];
    // Bez allowedPaths svaka datoteka je povreda, pa gard ostaje cist; obranu drzi resolver (implement bez allowliste baca).
    expect(findBotsImplementingProtected(mutiran, config.protectedPaths, botPathViolations)).toEqual([]);
  });
});

describe('mutacije: read-only faze lean workflowa idu kroz lean-citac (run wf_c810022a-a05)', () => {
  // CR normaliziran pri citanju: na Windows checkoutu (CRLF) regex mutacije nad recima inace tiho promasi.
  const workflow = readFileSync(resolve(process.cwd(), '.claude/workflows/lekta-lean.js'), 'utf8').replace(/\r/g, '');
  const agentMd = readFileSync(resolve(process.cwd(), '.claude/agents/lean-citac.md'), 'utf8').replace(/\r/g, '');
  const samoCitanje = (md: string): boolean => {
    try {
      return JSON.stringify(agentTools(md)) === JSON.stringify([...LEAN_READER_TOOLS]);
    } catch {
      return false;
    }
  };

  it('baseline: stvarni workflow i definicija agenta prolaze', () => {
    expect(leanReadOnlyViolations(workflow)).toEqual([]);
    expect(samoCitanje(agentMd)).toBe(true);
  });

  it('mutant: brief poziv bez agentType (stvarni kvar) se hvata', () => {
    const mutant = workflow.replace("schema: BRIEF_SCHEMA, agentType: 'lean-citac',", 'schema: BRIEF_SCHEMA,');
    expect(mutant).not.toBe(workflow);
    expect(leanReadOnlyViolations(mutant)).toEqual(["brief ide bez agentType 'lean-citac' (nema)"]);
  });

  it('mutant: preimenovan brief poziv ne prolazi tiho', () => {
    const mutant = workflow.replace("runAgent('brief',", "runAgent('izvidjac',");
    expect(mutant).not.toBe(workflow);
    expect(leanReadOnlyViolations(mutant)).toContain('nema runAgent poziva s labelom brief');
  });

  it('mutant: Bash dodan u tools lean-citac se hvata', () => {
    const mutant = agentMd.replace('tools: Read, Glob, Grep', 'tools: Read, Glob, Grep, Bash');
    expect(mutant).not.toBe(agentMd);
    expect(samoCitanje(mutant)).toBe(false);
  });

  it('mutant: uklonjen tools (agent bi naslijedio sve alate) se hvata', () => {
    const mutant = agentMd.replace(/^tools:.*\n/m, '');
    expect(mutant).not.toBe(agentMd);
    expect(samoCitanje(mutant)).toBe(false);
  });
});

describe('mutacije: kapacitet redaka po stranici', () => {
  const page = { page: { w: 21, h: 29.7 }, margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 } };
  const input = (font: string) => ({ size: 12, spacing: 1.5, font, sections: [page] });
  it('faktor 1,0 mijenja izmjereni kapacitet', () => {
    expect(linesPerPageCapacity(input('Times New Roman'))).toBe(33);
    expect(linesPerPageCapacity(input('Times New Roman'), {
      lineHeightFactor: 1.0,
      supportsFont: (font) => typeof font === 'string' && font.trim().toLowerCase() === 'times new roman',
    })).not.toBe(33);
  });
  it('uklonjena provjera fonta lazno mjeri Arial', () => {
    expect(linesPerPageCapacity(input('Arial'))).toBeNull();
    expect(linesPerPageCapacity(input('Arial'), {
      lineHeightFactor: 1.15,
      supportsFont: () => true,
    })).not.toBeNull();
  });
});

describe('Opportunity Report V3 gardovi (Codex V3-04 na #163)', () => {
  // Isti obrazac kao ostatak datoteke: process.cwd() i LF normalizacija (Windows checkout, V3-04/V3-05 na #163).
  const read = (p: string) => readTextLf(resolve(process.cwd(), p));
  const izvori = () => ({
    app: read('src/ui/app.ts'),
    panel: read('src/ui/repair-panel.ts'),
    emitter: read('src/analytics/opportunity-emit.ts'),
    result: read('src/analytics/repair-result.ts'),
  });
  const sql = read('supabase/migrations/0208_opportunity_report_v3.sql');
  const LOCAL = 'if (ctx.trackEvent) trackRepairResultOk(ctx.trackEvent, result.skippedReasons, ctx.opportunityContext);';
  const EMIT = 'emitRepairNoOpSignals(track, skippedReasons, context);';

  it('BASELINE: stvarni izvori, SQL i health su cisti', () => {
    expect(opportunityWiringProblems(izvori())).toEqual([]);
    expect(opportunitySqlScopeProblems(sql)).toEqual([]);
    expect(falseGreenParityProblems(opportunityMeasurementHealth)).toEqual([]);
  });

  it('dvostruka emisija: drugi summary, drugi poziv emittera ili drugi repair put se hvata', () => {
    const src = izvori();
    const dvaSummaryja = src.emitter.replace(
      "void track('repair_noop_summary',",
      "void track('repair_noop_summary', {}); void track('repair_noop_summary',",
    );
    expect(dvaSummaryja).not.toBe(src.emitter);
    expect(opportunityWiringProblems({ ...src, emitter: dvaSummaryja }))
      .toEqual(['emitter: repair_noop_summary se emitira 2 puta (mora tocno 1)']);

    const dvaEmittera = src.result.replace(EMIT, `${EMIT}\n  ${EMIT}`);
    expect(dvaEmittera).not.toBe(src.result);
    expect(opportunityWiringProblems({ ...src, result: dvaEmittera }))
      .toEqual(['repair-result.ts: emitRepairNoOpSignals se poziva 2 puta (mora tocno 1)']);

    const dvaPuta = src.panel.replace(LOCAL, `${LOCAL}\n      ${LOCAL}`);
    expect(dvaPuta).not.toBe(src.panel);
    expect(opportunityWiringProblems({ ...src, panel: dvaPuta }))
      .toEqual(['repair-panel.ts: trackRepairResultOk se poziva 2 puta (mora tocno 1)']);
  });

  it('neovisnost: brojac u emitteru ili izravan poziv emittera iz puta se hvata', () => {
    const src = izvori();
    const uEmitteru = src.emitter.replace(
      "void track('repair_noop_summary',",
      "void track('repair_result_ok', context); void track('repair_noop_summary',",
    );
    expect(opportunityWiringProblems({ ...src, emitter: uEmitteru }))
      .toEqual(['emitter: repair_result_ok ne smije biti u emitteru, inace nije neovisan brojac']);

    const mimo = src.panel.replace(
      LOCAL,
      'if (ctx.trackEvent) emitRepairNoOpSignals(ctx.trackEvent, result.skippedReasons, ctx.opportunityContext);',
    );
    const nalazi = opportunityWiringProblems({ ...src, panel: mimo });
    expect(nalazi).toContain('repair-panel.ts: emitter se zove izravno, mimo neovisnog brojaca');
    expect(nalazi).toContain('repair-panel.ts: trackRepairResultOk se poziva 0 puta (mora tocno 1)');
  });

  it('izgubljen kontekst: put bez konteksta ili emitter bez istog konteksta se hvata', () => {
    const src = izvori();
    const bezKonteksta = src.panel.replace(LOCAL, 'if (ctx.trackEvent) trackRepairResultOk(ctx.trackEvent, result.skippedReasons);');
    expect(opportunityWiringProblems({ ...src, panel: bezKonteksta })).toEqual([
      'repair-panel.ts: trackRepairResultOk bez Opportunity konteksta',
      'repair-panel.ts: pozivatelj bez ctx.opportunityContext',
    ]);

    const server = src.app.replace('trackRepairResultOk(trackEvent,out.skippedReasons,opportunityContextFor(r))', 'trackRepairResultOk(trackEvent,out.skippedReasons,{})');
    expect(server).not.toBe(src.app);
    expect(opportunityWiringProblems({ ...src, app: server }))
      .toEqual(['app.ts: serverski repair ne salje profileId/workType rezultata']);

    const emitterBez = src.result.replace(EMIT, 'emitRepairNoOpSignals(track, skippedReasons, {});');
    expect(opportunityWiringProblems({ ...src, result: emitterBez }))
      .toEqual(['repair-result.ts: emitter ne dobiva isti Opportunity kontekst']);

    const brojacBez = src.result.replace("track('repair_result_ok', { ...context })", "track('repair_result_ok', {})");
    expect(opportunityWiringProblems({ ...src, result: brojacBez }))
      .toEqual(['repair-result.ts: repair_result_ok s kontekstom se emitira 0 puta (mora tocno 1)']);
  });

  it('redoslijed: repair rezultat prije integrity gatea se hvata', () => {
    const src = izvori();
    const gate = 'if (result.integrityFailure)';
    const prije = src.panel.replace(LOCAL, '').replace(gate, `${LOCAL}\n      ${gate}`);
    expect(opportunityWiringProblems({ ...src, panel: prije }))
      .toEqual(['repair-panel.ts: repair rezultat prije integrity gatea']);
  });

  it('CRLF checkout: gardovi su cisti nad CRLF izvorom, a mutacija i dalje grize', () => {
    const crlf = (t: string) => t.replace(/\n/g, '\r\n');
    const src = izvori();
    expect(crlf(sql)).not.toBe(sql);
    expect(opportunitySqlScopeProblems(crlf(sql))).toEqual([]);
    expect(opportunityWiringProblems({
      app: crlf(src.app), panel: crlf(src.panel), emitter: crlf(src.emitter), result: crlf(src.result),
    })).toEqual([]);

    const mutant = sql.replace(
      "where e.event = 'repair_result_ok'\n          and e.created_at >= w.repair_v3_from",
      "where e.event = 'repair_result_ok'\n          and e.created_at >= w.f",
    );
    expect(mutant).not.toBe(sql);
    expect(opportunitySqlScopeProblems(crlf(mutant))).toEqual(['SQL: repair_result_ok mora poceti od repair_v3_from (ima w.f)']);

    const prije = src.panel.replace(LOCAL, '').replace('if (result.integrityFailure)', `${LOCAL}\n      if (result.integrityFailure)`);
    expect(opportunityWiringProblems({ ...src, panel: crlf(prije) }))
      .toEqual(['repair-panel.ts: repair rezultat prije integrity gatea']);
  });

  it('krivi SQL obuhvat: V3 dogadjaj od pocetka prozora, epoha po prozoru ili samoreferencija se hvata', () => {
    const odPocetka = sql.replace(
      "where e.event = 'repair_result_ok'\n          and e.created_at >= w.repair_v3_from",
      "where e.event = 'repair_result_ok'\n          and e.created_at >= w.f",
    );
    expect(odPocetka).not.toBe(sql);
    expect(opportunitySqlScopeProblems(odPocetka)).toEqual(['SQL: repair_result_ok mora poceti od repair_v3_from (ima w.f)']);

    const epohaPoProzoru = sql.replace(
      "where e.event in ('repair_result_ok', 'repair_noop_summary')",
      "where e.event in ('repair_result_ok', 'repair_noop_summary') and e.created_at >= p_from",
    );
    expect(opportunitySqlScopeProblems(epohaPoProzoru)).toEqual(['SQL: V3 epoha ne smije biti ogranicena prozorom']);

    const samoSummary = sql.replace("e.event in ('repair_result_ok', 'repair_noop_summary')", "e.event = 'repair_noop_summary'");
    expect(opportunitySqlScopeProblems(samoSummary)).toContain('SQL: V3 epoha mora obuhvatiti repair_result_ok i repair_noop_summary');

    const samoref = sql.replace('    from win w\n    cross join v3 v', '    from win_v3 w\n    cross join v3 v');
    expect(samoref).not.toBe(sql);
    expect(opportunitySqlScopeProblems(samoref)).toEqual(['SQL: win_v3 mora citati win, ne sebe']);

    const bezScopea = sql.replace("'repair_attempts'::text", "'repair_attempt'::text");
    expect(opportunitySqlScopeProblems(bezScopea)).toEqual(['SQL: nema parity po obuhvatu za repair_attempts']);
  });

  it('lazno zelen paritet: health koji ignorira scope, brojac pokusaja ili razdvajanje povrsina se hvata', () => {
    const bezScopea: typeof opportunityMeasurementHealth = (b) =>
      opportunityMeasurementHealth({ ...b, scopeParityMismatches: [] });
    expect(falseGreenParityProblems(bezScopea)).toEqual([
      'V3-01 structure: isti zbroj, krivi profil: healthy, mora biti partial',
      'V3-01 repair: isti zbroj, kriva vrsta rada: healthy, mora biti partial',
    ]);

    const bezBrojaca: typeof opportunityMeasurementHealth = (b) =>
      opportunityMeasurementHealth({ ...b, repairAttemptEvents: b.repairNoOpSummaryEvents });
    expect(falseGreenParityProblems(bezBrojaca)).toEqual([
      'V3-02: uspjesan repair bez summaryja: healthy, mora biti partial',
      'V3-02: summary bez uspjesnog repaira: healthy, mora biti partial',
    ]);

    const jedinstveno: typeof opportunityMeasurementHealth = (b) => {
      const h = opportunityMeasurementHealth(b);
      return { ...h, analysis: h.kind };
    };
    expect(falseGreenParityProblems(jedinstveno)).toEqual(['V3-03: repair-only prozor daje analysis=healthy']);
  });
});

describe('mutacije: hookovi discipline (odluka vlasnika 2026-09-28)', () => {
  const settings = JSON.parse(readFileSync(resolve(process.cwd(), '.claude/settings.json'), 'utf8'));
  const readScript = packageScriptReader(process.cwd());
  /** Tvrdnja A1 garda: izravan vitest i tsc se odbijaju, isti posao pod lockom prolazi. */
  const a1Grize = (heavyBinaries: readonly string[]): boolean =>
    !judgeCpuDiscipline('npx vitest run tests/a.test.ts', { readScript, heavyBinaries }).allow &&
    !judgeCpuDiscipline('npx tsc --noEmit', { readScript, heavyBinaries }).allow &&
    judgeCpuDiscipline('node scripts/with-gate-lock.mjs t -- npx vitest run', { readScript, heavyBinaries }).allow;
  const checklist = '- [ ] testovi\n';
  const env = { LEKTA_ROLE: 'implementer', LEKTA_CHECKLIST: 'c.md' };
  /** Tvrdnja A3 garda: blokira dok ima otvorenih stavki, ali najvise MAX_BLOCKS puta. */
  const a3Grize = (maxBlocks: number): boolean =>
    decideStop({ env, blocksSoFar: 0, readFile: () => checklist, maxBlocks }).block &&
    !decideStop({ env, blocksSoFar: MAX_BLOCKS, readFile: () => checklist, maxBlocks }).block;

  it('baseline: registracija, A1, A2 i A3 su cisti', () => {
    expect(missingHookRegistrations(settings)).toEqual([]);
    expect(a1Grize(HEAVY_BINARIES)).toBe(true);
    expect(sessionRulesProblems(formatSessionRules())).toEqual([]);
    expect(a3Grize(MAX_BLOCKS)).toBe(true);
  });

  it('mutant: cpu-discipline maknut iz settings.json se hvata', () => {
    const mutant = JSON.parse(JSON.stringify(settings));
    mutant.hooks.PreToolUse = mutant.hooks.PreToolUse.filter(
      (e: { hooks?: Array<{ command?: string }> }) => !(e.hooks ?? []).some((h) => h.command?.includes('cpu-discipline')));
    expect(missingHookRegistrations(mutant)).toEqual(['PreToolUse[Bash]: ' + hookCommand('scripts/hooks/cpu-discipline.mjs')]);
  });

  it('mutant: Stop hook maknut iz settings.json se hvata', () => {
    const mutant = JSON.parse(JSON.stringify(settings));
    delete mutant.hooks.Stop;
    expect(missingHookRegistrations(mutant)).toEqual(['Stop: ' + hookCommand('scripts/hooks/implementer-stop.mjs')]);
  });

  it('mutant: vitest ispao s popisa teskih alata obara tvrdnju A1', () => {
    expect(a1Grize(HEAVY_BINARIES.filter((b) => b !== 'vitest'))).toBe(false);
  });

  it('mutant: pravila bez retka o relayed porukama se hvataju', () => {
    const mutant = formatSessionRules().filter((l) => !l.includes('relayed'));
    expect(sessionRulesProblems(mutant)).toEqual(['nedostaje pravilo o relayed porukama']);
  });

  it('mutant: Stop hook bez gornje granice blokiranja obara tvrdnju A3', () => {
    expect(a3Grize(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('mutant: tool-guard samo pod matcherom Bash|PowerShell ne stize do Supabase MCP apply_migration', () => {
    // Zateceno stanje prije popravka: zabrana u tool-guard.mjs je postojala, ali je hook nikad nije vidio.
    const mutant = JSON.parse(JSON.stringify(settings));
    mutant.hooks.PreToolUse = mutant.hooks.PreToolUse.filter((e: { matcher?: string }) => !String(e.matcher ?? '').startsWith('mcp__'));
    expect(missingHookRegistrations(mutant)).toEqual([
      'PreToolUse[mcp__supabase__apply_migration]: ' + hookCommand('scripts/agents/tool-guard.mjs'),
      'PreToolUse[mcp__Supabase__apply_migration]: ' + hookCommand('scripts/agents/tool-guard.mjs'),
      'PreToolUse[mcp__claude_ai_Supabase__apply_migration]: ' + hookCommand('scripts/agents/tool-guard.mjs'),
      'PreToolUse[mcp__plugin_supabase_supabase__apply_migration]: ' + hookCommand('scripts/agents/tool-guard.mjs'),
    ]);
  });

  it('mutant: matcher samo za Supabase velikim slovom propusta lokalni server supabase', () => {
    const mutant = JSON.parse(JSON.stringify(settings));
    // Registracija `mcp__.*[Ss]upabase.*` (PR #327) pokriva iste alate; makni je da mutant mjeri
    // bas ovu registraciju, ne preklapanje dviju.
    mutant.hooks.PreToolUse = mutant.hooks.PreToolUse.filter((e: { matcher?: string }) => e.matcher !== 'mcp__.*[Ss]upabase.*');
    for (const e of mutant.hooks.PreToolUse as Array<{ matcher?: string }>) {
      if (e.matcher === 'mcp__.*__apply_migration') e.matcher = 'mcp__.*Supabase.*__apply_migration';
    }
    expect(missingHookRegistrations(mutant)).toEqual([
      'PreToolUse[mcp__supabase__apply_migration]: ' + hookCommand('scripts/agents/tool-guard.mjs'),
      'PreToolUse[mcp__plugin_supabase_supabase__apply_migration]: ' + hookCommand('scripts/agents/tool-guard.mjs'),
    ]);
  });

  it('mutant: relativna putanja hooka (ne postoji nakon cd u poddirektorij) se hvata', () => {
    const mutant = JSON.parse(JSON.stringify(settings));
    for (const e of mutant.hooks.PreToolUse as Array<{ hooks?: Array<{ command?: string }> }>) {
      for (const h of e.hooks ?? []) {
        if (h.command === hookCommand('scripts/hooks/cpu-discipline.mjs')) h.command = 'node scripts/hooks/cpu-discipline.mjs';
      }
    }
    expect(missingHookRegistrations(mutant)).toEqual(['PreToolUse[Bash]: ' + hookCommand('scripts/hooks/cpu-discipline.mjs')]);
  });

  it('mutant: dash-guard maknut iz settings.json se hvata', () => {
    const mutant = JSON.parse(JSON.stringify(settings));
    mutant.hooks.PreToolUse = mutant.hooks.PreToolUse.filter(
      (e: { hooks?: Array<{ command?: string }> }) => !(e.hooks ?? []).some((h) => h.command?.includes('dash-guard')));
    expect(missingHookRegistrations(mutant)).toEqual([
      'PreToolUse[Edit]: ' + hookCommand('scripts/hooks/dash-guard.mjs'),
      'PreToolUse[Write]: ' + hookCommand('scripts/hooks/dash-guard.mjs'),
    ]);
  });
});

/**
 * DASH-GUARD (pravilo "bez em i en crtica" iz CLAUDE.md, Konvencije). Mutira se KOPIJA izvora u
 * privremenom direktoriju i presuda se racuna u cistom node procesu (Vitest ne ucitava module izvan
 * korijena projekta). Tvrdnja: Edit koji uvodi en crticu u src/ se odbija.
 */
/**
 * T110: omotac locka na prekid salje signal cijelom stablu djeteta. Mutant koji trazi samo izravnu
 * djecu (bez unuka) vraca stari kvar: `npm` i `vitest` ispod `sh -c` prezive, a lock se otpusti.
 * Mutira se kopija izvora (uz gate-preflight.mjs koji uvozi), presudu racuna cisti node.
 */
describe('mutacije: scripts/with-gate-lock.mjs stablo procesa (T110)', () => {
  const izvor = readFileSync(resolve(process.cwd(), 'scripts/with-gate-lock.mjs'), 'utf8').replace(/\r\n/g, '\n');
  const preflight = readFileSync(resolve(process.cwd(), 'scripts/gate-preflight.mjs'), 'utf8');

  async function signaliziraniPidovi(source: string): Promise<number[]> {
    const { mkdtempSync, writeFileSync: write, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { pathToFileURL } = await import('node:url');
    const { spawnSync } = await import('node:child_process');
    const dir = mkdtempSync(join(tmpdir(), 'lekta-lock-mut-'));
    try {
      const file = join(dir, 'with-gate-lock.mjs');
      write(file, source);
      write(join(dir, 'gate-preflight.mjs'), preflight);
      const stablo = [{ pid: 101, ppid: 100 }, { pid: 102, ppid: 101 }, { pid: 103, ppid: 102 }];
      const script = `const m = await import(${JSON.stringify(pathToFileURL(file).href)});`
        + `const r = m.signalTree(100, 'SIGTERM', { list: () => ${JSON.stringify(stablo)}, kill: () => true });`
        + 'process.stdout.write(JSON.stringify(r));';
      const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60_000 });
      return JSON.parse(res.stdout) as number[];
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('baseline: signal ide djetetu, ljusci i unucima', async () => {
    expect(await signaliziraniPidovi(izvor)).toEqual([100, 101, 102, 103]);
  });

  it('mutant: samo izravna djeca (bez unuka) se hvata', async () => {
    const mutant = izvor.replace('        queue.push(p.pid);\n', '');
    expect(mutant).not.toBe(izvor);
    expect(await signaliziraniPidovi(mutant)).toEqual([100, 101]);
  });

  // Grok pregled #329: reapTree mora preostale gasiti SIGKILL-om i nepoznato stanje (null) drzati zivim.
  async function zetva(source: string): Promise<Array<[number, string]>> {
    const { mkdtempSync, writeFileSync: write, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { pathToFileURL } = await import('node:url');
    const { spawnSync } = await import('node:child_process');
    const dir = mkdtempSync(join(tmpdir(), 'lekta-lock-mut-'));
    try {
      const file = join(dir, 'with-gate-lock.mjs');
      write(file, source);
      write(join(dir, 'gate-preflight.mjs'), preflight);
      const script = `const m = await import(${JSON.stringify(pathToFileURL(file).href)});`
        + 'const sent = [];'
        + 'await m.reapTree([7, 8], { graceMs: 5, stepMs: 1, sleep: async () => {}, alive: (p) => (p === 7 ? true : null), kill: (p, s) => { sent.push([p, s]); return true; } });'
        + 'process.stdout.write(JSON.stringify(sent));';
      const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60_000 });
      return JSON.parse(res.stdout) as Array<[number, string]>;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('baseline: zivi i nepoznati proces nakon roka dobivaju SIGKILL', async () => {
    expect(await zetva(izvor)).toEqual([[7, 'SIGKILL'], [8, 'SIGKILL']]);
  });

  it('mutant: reapTree salje SIGTERM umjesto SIGKILL', async () => {
    const mutant = izvor.replace("kill(pid, 'SIGKILL');", "kill(pid, 'SIGTERM');");
    expect(mutant).not.toBe(izvor);
    expect(await zetva(mutant)).toEqual([[7, 'SIGTERM'], [8, 'SIGTERM']]);
  });

  it('mutant: nepoznato stanje (null) se tretira kao mrtav proces', async () => {
    const mutant = izvor.replaceAll('alive(pid) !== false', 'alive(pid) === true');
    expect(mutant).not.toBe(izvor);
    expect(await zetva(mutant)).toEqual([[7, 'SIGKILL']]);
  });
});

/**
 * T109: cpu-discipline i heredoc (allowlist citaca nakon tri runde Grok pregleda #328). Tijelo se
 * preskace samo za prvi redak `citac arg ... <<'IME'` s cistim rijecima; sve ostalo ide starim
 * rastavom po retku. Svaki mutant uklanja jedan uvjet i mora pustiti ulaz koji bash izvrsi.
 * Mutira se kopija izvora, presudu racuna cisti node.
 */
describe('mutacije: scripts/hooks/cpu-discipline.mjs heredoc (T109)', () => {
  const izvor = readFileSync(resolve(process.cwd(), 'scripts/hooks/cpu-discipline.mjs'), 'utf8').replace(/\r\n/g, '\n');
  const pomoc = readFileSync(resolve(process.cwd(), 'scripts/hooks/hook-input.mjs'), 'utf8');
  // Redak tijela koji pocinje teskom naredbom: stari rastav po novom retku ga je citao kao naredbu.
  const citirani = "python3 - <<'PYEOF'\nnpx vitest run je samo tekst u biljesci\nPYEOF";
  const bezNavodnika = 'cat <<EOF\n$(npx vitest run)\nEOF';
  const komentar = "cat # <<'EOF'\nnpx vitest run";
  const funkcija = "cat() { bash; }\ncat <<'EOF'\nnpx vitest run\nEOF";
  const ljuska = "sh <<'EOF'\nnpx vitest run\nEOF";
  // Cetvrta runda: Python koji sam izvrsi naredbu (bash ga izvrsi) i NFKC oblik naziva `eval`.
  const pythonOs = 'python3 - <<\'EOF\'\nimport os\nos.system("\\";npx vitest run".replace(chr(34), "").replace(";", ""))\nEOF';
  const pythonMixedImport = "python3 - <<'EOF'\nimport json, os\nos.system('npx vitest run')\nEOF";
  const pythonWrapped = "env FOO=1 python3 - <<'EOF'\nimport json, os\nos.system('npx vitest run')\nEOF";
  const pythonLater = "echo ready\npython3 - <<'EOF'\nimport os\nos.system('npx vitest run')\nEOF";
  const pythonUnquoted = "python3 - <<EOF\nimport os\nos.system('npx vitest run')\nEOF";
  // Uvoz izvan popisa bez imena iz PYTHON_ESCAPE_NAMES_RE: hvata ga samo provjera cijele import liste.
  const pythonMixedZip = "python3 - <<'EOF'\nimport json, zipfile\nprint(1)\nEOF";
  const pythonEnvFlag = "env -i python3 - <<'EOF'\nimport os\nos.system('npx vitest run')\nEOF";
  const pythonArgparse = "python3 - <<'EOF'\nimport argparse\nargparse.os.system('npx vitest run')\nEOF";
  const pythonNfkc = "python3 - <<'EOF'\n\uFF45\uFF56\uFF41\uFF4C('1')\nnpx vitest run\nEOF";

  async function dopusta(source: string, command: string): Promise<boolean> {
    const { mkdtempSync, writeFileSync: write, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { pathToFileURL } = await import('node:url');
    const { spawnSync } = await import('node:child_process');
    const dir = mkdtempSync(join(tmpdir(), 'lekta-cpu-mut-'));
    try {
      const file = join(dir, 'cpu-discipline.mjs');
      write(file, source);
      write(join(dir, 'hook-input.mjs'), pomoc);
      const script = `const m = await import(${JSON.stringify(pathToFileURL(file).href)});`
        + `process.stdout.write(JSON.stringify(m.judgeCpuDiscipline(${JSON.stringify(command)})));`;
      const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60_000 });
      return (JSON.parse(res.stdout) as { allow: boolean }).allow;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('baseline: citirani heredoc prolazi, ostali oblici se odbijaju', async () => {
    expect(await dopusta(izvor, citirani)).toBe(true);
    for (const ulaz of [bezNavodnika, komentar, funkcija, ljuska, pythonOs, pythonNfkc, pythonMixedImport, pythonWrapped, pythonLater, pythonUnquoted, pythonEnvFlag, pythonArgparse, pythonMixedZip]) {
      expect(await dopusta(izvor, ulaz), ulaz).toBe(false);
    }
  });

  it('mutant: bez prepoznavanja heredoca citirani tekst se opet lazno odbija', async () => {
    const mutant = izvor.replace("if (ch === '<' && command[i + 1] === '<') {", 'if (false) {');
    expect(mutant).not.toBe(izvor);
    expect(await dopusta(mutant, citirani)).toBe(false);
  });

  it('mutant: delimiter bez navodnika preskace tijelo sa supstitucijom', async () => {
    const mutant = izvor.replace('const skipBody = Boolean(m[3]) && simplePrefix;', 'const skipBody = simplePrefix;');
    expect(mutant).not.toBe(izvor);
    expect(await dopusta(mutant, bezNavodnika)).toBe(true);
  });

  it('mutant: rijeci u retku operatora se ne provjeravaju (# vise ne iskljucuje heredoc)', async () => {
    const mutant = izvor.replace(
      'words.every((w) => HEREDOC_WORD_RE.test(w) || (pythonReader && ENV_ASSIGN_RE.test(w)))',
      'true',
    );
    expect(mutant).not.toBe(izvor);
    expect(await dopusta(mutant, komentar)).toBe(true);
  });

  it('mutant: heredoc i iza prvog retka (funkcija cat definirana ranije)', async () => {
    const mutant = izvor.replace('lineStart === 0', 'true');
    expect(mutant).not.toBe(izvor);
    expect(await dopusta(mutant, funkcija)).toBe(true);
  });

  it('mutant: program izvan allowliste citaca', async () => {
    const mutant = izvor.replace('HEREDOC_READERS.has(programName(words[0])) || pythonReader', 'true');
    expect(mutant).not.toBe(izvor);
    expect(await dopusta(mutant, ljuska)).toBe(true);
  });

  it('mutant: unsafe Python sentinel se ne blokira', async () => {
    const mutant = izvor.replace(
      "if (tokens.includes(UNSAFE_PYTHON_HEREDOC)) return { heavy: true, what: 'nesiguran Python heredoc' };",
      'if (false) return { heavy: true, what: "nesiguran Python heredoc" };',
    );
    expect(mutant).not.toBe(izvor);
    expect(await dopusta(mutant, pythonWrapped)).toBe(true);
  });

  it('mutant: Python reader iza omotača i assignmenta se ne prepoznaje', async () => {
    const mutant = izvor.replace(
      'return tokens.some((t) => PYTHON_READERS.has(programName(t)));',
      'return false;',
    );
    expect(mutant).not.toBe(izvor);
    expect(await dopusta(mutant, pythonWrapped)).toBe(true);
  });

  it('mutant: omotac sa zastavicom (env -i python3) sakriva Python citac', async () => {
    const mutant = izvor.replace(
      'return tokens.some((t) => PYTHON_READERS.has(programName(t)));',
      `let i = 0;
  while (i < tokens.length && (ENV_ASSIGN_RE.test(tokens[i]) || WRAPPERS.has(programName(tokens[i])))) i += 1;
  return PYTHON_READERS.has(programName(tokens[i] ?? ''));`,
    );
    expect(mutant).not.toBe(izvor);
    expect(await dopusta(mutant, pythonEnvFlag)).toBe(true);
  });

  it('mutant: os/sys dohvacen kroz sigurni modul (argparse.os) prolazi', async () => {
    const mutant = izvor.replace(' || PYTHON_ESCAPE_NAMES_RE.test(normalized)', '');
    expect(mutant).not.toBe(izvor);
    expect(await dopusta(mutant, pythonArgparse)).toBe(true);
  });

  it('mutant: u import listi provjerava se samo prvi modul', async () => {
    const mutant = izvor.replace(
      "for (const spec of match[2].split(',')) {",
      "for (const spec of match[2].split(',').slice(0, 1)) {",
    );
    expect(mutant).not.toBe(izvor);
    expect(await dopusta(mutant, pythonMixedZip)).toBe(true);
  });

  it('mutant: tijelo Pythona se ne NFKC-normalizira (naziv pisan punom sirinom prolazi)', async () => {
    const mutant = izvor.replace(".normalize('NFKC')", '');
    expect(mutant).not.toBe(izvor);
    expect(await dopusta(mutant, pythonNfkc)).toBe(true);
  });
});

describe('mutacije: scripts/hooks/dash-guard.mjs', () => {
  const izvor = readFileSync(resolve(process.cwd(), 'scripts/hooks/dash-guard.mjs'), 'utf8').replace(/\r\n/g, '\n');
  const pomoc = readFileSync(resolve(process.cwd(), 'scripts/hooks/hook-input.mjs'), 'utf8');

  const premjestena = { toolName: 'Edit', rel: 'docs/a.md', toolInput: { old_string: 'citat \u2013 izvora', new_string: 'novi tekst \u2014 autora' }, postojeci: null };
  const odbijaEnCrticu = (source: string) =>
    odbijaUlaz(source, { toolName: 'Edit', rel: 'src/a.ts', toolInput: { old_string: 'x', new_string: 'x \u2013 y' }, postojeci: null });

  async function odbijaUlaz(source: string, ulaz: unknown): Promise<boolean> {
    const { mkdtempSync, writeFileSync: write, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { pathToFileURL } = await import('node:url');
    const { spawnSync } = await import('node:child_process');
    const dir = mkdtempSync(join(tmpdir(), 'lekta-dash-mut-'));
    try {
      const file = join(dir, 'dash-guard.mjs');
      write(file, source);
      write(join(dir, 'hook-input.mjs'), pomoc);
      const script = `const m = await import(${JSON.stringify(pathToFileURL(file).href)});`
        + `process.stdout.write(JSON.stringify(m.judgeDashWrite(${JSON.stringify(ulaz)})));`;
      const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60_000 });
      return (JSON.parse(res.stdout) as { allow: boolean }).allow === false;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('baseline: stvarni gard odbija novu en crticu', async () => {
    expect(await odbijaEnCrticu(izvor)).toBe(true);
  });

  it('mutant: regex koji lovi samo em crticu se hvata', async () => {
    const mutant = izvor.replace('/[\\u2013\\u2014]/g', '/[\\u2014]/g');
    expect(mutant).not.toBe(izvor);
    expect(await odbijaEnCrticu(mutant)).toBe(false);
  });

  it('mutant: presuda samo po zbroju (bez sidrenja) propusta premjestenu crticu', async () => {
    const mutant = izvor.replace(' && neusidrene.length === 0) return', ') return');
    expect(mutant).not.toBe(izvor);
    // Stvarni gard odbija zamjenu en crtice em crticom na novom mjestu, mutant je propusta.
    expect(await odbijaUlaz(izvor, premjestena)).toBe(true);
    expect(await odbijaUlaz(mutant, premjestena)).toBe(false);
  });

  it('mutant: src/ ispao iz opsega se hvata', async () => {
    const mutant = izvor.replace('[/^src\\//, ', '[');
    expect(mutant).not.toBe(izvor);
    expect(await odbijaEnCrticu(mutant)).toBe(false);
  });
});

describe('slab stroj: VITEST_MAX_THREADS gard (pravilo vlasnika 2026-09-28)', () => {
  const wrapper = readTextLf(resolve(process.cwd(), 'scripts/with-gate-lock.mjs'));
  type Fn = typeof weakMachineWorkerEnv;

  it('BASELINE: stvarna funkcija i stvarni omotac su cisti', () => {
    expect(weakMachineProblems(weakMachineWorkerEnv)).toEqual([]);
    expect(weakMachineWiringProblems(wrapper)).toEqual([]);
  });

  it('mutant: gazi vec postavljen VITEST_MAX_THREADS se hvata', () => {
    const gazi: Fn = (input) => weakMachineWorkerEnv({ ...input, env: { ...input?.env, VITEST_MAX_THREADS: undefined } });
    expect(weakMachineProblems(gazi)).toEqual([
      'slab stroj, VITEST_MAX_THREADS vec 3: ne dira: dobiveno {"VITEST_MAX_THREADS":"1"}, ocekivano null',
    ]);
  });

  it('mutant: gleda samo jezgre, ne RAM, se hvata', () => {
    const samoJezgre: Fn = (input) => weakMachineWorkerEnv({ ...input, totalMemBytes: null });
    expect(weakMachineProblems(samoJezgre)).toEqual([
      'laptop (4 niti, 8 GB): postavlja 1: dobiveno null, ocekivano {"VITEST_MAX_THREADS":"1"}',
      '8 jezgri uz 8 GB: postavlja 1: dobiveno null, ocekivano {"VITEST_MAX_THREADS":"1"}',
    ]);
  });

  it('mutant: stroga granica jezgri (< 2 umjesto <= 2) se hvata', () => {
    const stroga: Fn = (input) => weakMachineWorkerEnv({ ...input, cpus: input?.cpus === 2 ? 3 : input?.cpus });
    expect(weakMachineProblems(stroga)).toEqual([
      'tocno 2 jezgre uz 32 GB: postavlja 1: dobiveno null, ocekivano {"VITEST_MAX_THREADS":"1"}',
    ]);
  });

  it('mutant: stara granica od 4 jezgre (laptop 16 GB na jednom radniku) se hvata', () => {
    const stara: Fn = (input) => {
      const presuda = weakMachineWorkerEnv(input);
      const cpus = input?.cpus;
      const ci = input?.env?.CI;
      const vecPostavljen = input?.env?.VITEST_MAX_THREADS;
      return presuda ?? (typeof cpus === 'number' && cpus <= 4 && !ci && !vecPostavljen ? { VITEST_MAX_THREADS: '1' } : null);
    };
    expect(weakMachineProblems(stara)).toEqual([
      'laptop (4 niti, 16 GB): ne dira: dobiveno {"VITEST_MAX_THREADS":"1"}, ocekivano null',
      '3 jezgre uz 16 GB: ne dira: dobiveno {"VITEST_MAX_THREADS":"1"}, ocekivano null',
    ]);
  });

  it('mutant: omotac ne primjenjuje presudu na dijete se hvata', () => {
    const mutant = wrapper.replace('Object.assign(childEnv, workers);', '');
    expect(mutant).not.toBe(wrapper);
    expect(weakMachineWiringProblems(mutant)).toEqual(['with-gate-lock: presuda se ne primjenjuje na dijete']);
  });
});

describe('lean workflow promptovi: vrijeme, omot zadatka, rad bez nadzora (odluka vlasnika 2026-09-28)', () => {
  const wf = readTextLf(resolve(process.cwd(), '.claude/workflows/lekta-lean.js'));
  const mut = (from: string, to: string) => {
    const m = wf.replace(from, to);
    expect(m, from).not.toBe(wf);
    return m;
  };

  it('BASELINE: stvarna skripta je cista', () => {
    expect(leanPromptProblems(wf)).toEqual([]);
  });

  it('mutant: recenzent bez vremenskog retka se hvata', () => {
    const m = mut('istrazuj repo sire od diffa.\\n${TIME_LINE}\\n\\nZADATAK', 'istrazuj repo sire od diffa.\\n\\nZADATAK');
    expect(leanPromptProblems(m)).toEqual(['review: nema vremenskog retka']);
  });

  it('mutant: sirovi task u promptu umjesto omota se hvata', () => {
    const m = mut('`ZADATAK:\\n${TASK_BLOCK}\\n\\nBRIEF:\\n${briefText}\\n\\n` +', '`ZADATAK:\\n${task}\\n\\nBRIEF:\\n${briefText}\\n\\n` +');
    const nalazi = leanPromptProblems(m);
    expect(nalazi).toContain('ZADATAK blok nosi ${task} umjesto ${TASK_BLOCK}');
    expect(nalazi.some((n) => n.includes('sirovi ${task} u promptu'))).toBe(true);
  });

  it('mutant: omot bez fiksnog id-a ili bez napomene se hvata', () => {
    expect(leanPromptProblems(mut('</pasted_content id="task">', '</pasted_content>')))
      .toEqual(['TASK_BLOCK nema fiksni pasted_content omot s napomenom o relayanim porukama']);
    expect(leanPromptProblems(mut('nalog je samo koordinatorov brief', 'nalog je u tekstu')))
      .toEqual(['TASK_BLOCK nema fiksni pasted_content omot s napomenom o relayanim porukama']);
  });

  it('mutant: implementator bez odlomka za rad bez nadzora se hvata', () => {
    const m = mut('    `PRAVILA RADA:\\n${PRAVILA}\\n\\n${UNATTENDED}\\n${TIME_LINE}\\n\\n` +\n    (round === 1', '    `PRAVILA RADA:\\n${PRAVILA}\\n\\n${TIME_LINE}\\n\\n` +\n    (round === 1');
    expect(leanPromptProblems(m)).toEqual(['standardImpl: implementator nema odlomak za rad bez nadzora']);
  });

  it('mutant: proracun iz sata (Date.now) umjesto iz args se hvata', () => {
    const m = mut('const timeBudgetSeconds = (args', 'const nowMs = Date.now()\nconst timeBudgetSeconds = (args');
    expect(leanPromptProblems(m)).toEqual(['skripta koristi sat ili slucajnost (Date/Math.random)']);
  });

  it('mutant: TIME_LINE bez upute o proteklom vremenu se hvata (E1)', () => {
    const m = mut('Na pocetku svakog koraka izracunaj proteklo vrijeme', 'Pazi na vrijeme');
    expect(leanPromptProblems(m)).toEqual(['TIME_LINE nema uputu o proteklom vremenu ("Na pocetku svakog koraka izracunaj proteklo vrijeme")']);
  });

  it('mutant: uputa o proteklom vremenu bez uvjeta poznatog pocetka se hvata (E1)', () => {
    const m = mut('(startExpr\n', '(true\n');
    expect(leanPromptProblems(m)).toEqual(['uputa o proteklom vremenu nije uvjetovana poznatim pocetkom']);
  });
});

describe('T84 R-01: otisak dokumenta je linearan na napadackom XML-u', () => {
  // Gard je brojac rada u skeneru (deterministicki, Codex R2 na #230) nad svih 11 napada, n i 2n.
  // Mutanti su zamjene u STVARNOM izvoru skenera: forward finder koji ne pamti poziciju, i matcher
  // stila koji zadnji `</w:style>` trazi iznova za svaku pojavu. Svaki mutant hvataju upravo napadi
  // koji ciljaju taj pokazivac; ostali napadi ostaju cisti, pa tvrdnja nije "nesto je palo".
  it('BASELINE: stvarni skener je linearan na svih 11 napada', () => {
    expect(linearnostProblemi(extractFingerprintInputFromDocx, 2000)).toEqual([]);
  });

  it('mutant: forward finder bez pamcenja pozicije se hvata', () => {
    const mutant = mutiraniSkener('    if (cached >= from) return cached;\n', '');
    expect(linearnostProblemi(mutant, 2000)).toEqual([
      'styles: <w:name bez > u stilu',
      'document: <w:pStyle bez > u odlomku',
      'document: <w:t bez > u odlomku',
      'styles: vise styleId u tagu, jedan > na kraju',
    ]);
  });

  it('mutant: matcher stila bez pamcenja zadnjeg </w:style> se hvata', () => {
    const mutant = mutiraniSkener('        if (lastClose === null) {', '        if (true) {');
    expect(linearnostProblemi(mutant, 2000)).toEqual([
      'styles: <w:style styleId bez zatvaranja',
      'styles: vise styleId u tagu, jedan > na kraju',
      'styles: > u navodnicima bez zatvaranja',
    ]);
  });
});

describe('mobilna traka lista ne prekriva korake (mobilni audit 2026-09-28, PR 2)', () => {
  const css = () => readFileSync(resolve(process.cwd(), 'src/shared/page-app.css'), 'utf8').replace(/\r/g, '');
  const PRAVILO = '@media(max-width:720px){.analyzer-wrap::before{left:auto;right:14px;top:-11px;width:84px;height:22px;transform:rotate(2deg)}}';

  it('BASELINE: na uskom ekranu traka je uz desni rub i uska', () => {
    expect(css()).toContain(PRAVILO);
    expect(mobileTapeProblems(css())).toEqual([]);
  });

  it('mutant: bez pravila za uski ekran traka ostaje na sredini', () => {
    expect(mobileTapeProblems(css().replace(PRAVILO, ''))).toEqual(['traka nema pravilo za uski ekran']);
  });

  it('mutant: traka na sredini i siroka kao na racunalu', () => {
    const m = css().replace(PRAVILO, '@media(max-width:720px){.analyzer-wrap::before{top:-11px;width:150px;height:22px}}');
    expect(mobileTapeProblems(m)).toEqual(['traka nije uz desni rub', 'traka je sira od 100 px']);
  });
});

describe('zbijeni dokumentov red na mobitelu (mobilni audit 2026-09-28, PR 2)', () => {
  const css = () => readFileSync(resolve(process.cwd(), 'src/shared/site-chrome.css'), 'utf8').replace(/\r/g, '');

  it('BASELINE: gumb nove verzije je meta od 44 px, ispod reda je razmak', () => {
    expect(mobileDocMetaProblems(css())).toEqual([]);
  });

  it('mutant: bez prosirenja dodira meta je 28 px', () => {
    const m = css().replace('  .rad-doc-meta .rad-doc-new-version::after { content: ""; position: absolute; inset: -8px 0; }\n', '');
    expect(m).not.toBe(css());
    expect(mobileDocMetaProblems(m)).toEqual(['dodirna meta nove verzije 28 px, ispod 44']);
  });

  it('mutant: bez razmaka ispod reda list prekriva donji dio mete', () => {
    const m = css().replace('margin-top: 6px; padding-bottom: 6px; }', 'margin-top: 6px; }');
    expect(m).not.toBe(css());
    expect(mobileDocMetaProblems(m)).toEqual(['ispod reda nema razmaka za prosirenu metu']);
  });

  it('mutant: bez razmaka redaka prelomljen gumb otima dodir znacki (Codex R1 na #286)', () => {
    const m = css().replace('gap: 8px 10px;', 'gap: 0 10px;');
    expect(m).not.toBe(css());
    expect(mobileDocMetaProblems(m)).toEqual(['razmak redaka manji od prosirenja: prelomljen gumb otima dodir retku iznad']);
  });
});

describe('mutacije: Upisnik dokaz u snimci', () => {
  const baselineRatchet = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/upisnik-snapshot-ratchet-baseline.json'), 'utf8')) as import('../src/programs/upisnik-evidence-snapshots').SnapshotRatchet;
  const sourcePath = resolve(process.cwd(), 'src/programs/upisnik-evidence-snapshots.ts');
  const fixture = 'Doslovni citat iz registrirane snimke izvora.';
  const url = 'https://example.test/source';
  const path = 'data/sources/test.html';
  const encoder = new TextEncoder();
  const goodBytes = encoder.encode(fixture);
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const file = { decisions: [{ programCode: '1', evidence: { sourceUrl: url, sourceLocator: 'test', quote: fixture } }], exclusions: [] };
  const ratchet = { schemaVersion: 1, entries: [] };
  const source = { url, snapshotPath: path, snapshotHash: hash(goodBytes) };

  async function copyWith(replace: (s: string) => string, readZipMock: (bytes: Uint8Array) => Promise<any[]> = async () => []) {
    const { createRequire } = await import('node:module');
    const { transform } = await import('esbuild');
    const original = readFileSync(sourcePath, 'utf8');
    let edited = replace(original);
    expect(edited).not.toBe(original);
    edited = edited
      .replace("import { extractText, getDocumentProxy } from 'unpdf';", "const extractText = async () => ({ text: '' }); const getDocumentProxy = async () => ({});")
      .replace("import { readZip } from '../repair/zip-codec';", "const readZip = readZipMock;")
      .replace('createRequire(import.meta.url)', 'createRequire(' + JSON.stringify(sourcePath) + ')');
    // Mutant se ne pise na disk (vitestov loader ne ucitava modul izvan korijena projekta): CJS kod se
    // izvodi s pravim require modula, pa radi jednako na Node 20 i 24.
    const js = (await transform(edited, { loader: 'ts', format: 'cjs' })).code;
    const mod = { exports: {} as Record<string, unknown> };
    new Function('require', 'module', 'exports', 'readZipMock', js)(createRequire(sourcePath), mod, mod.exports, readZipMock);
    return mod.exports as typeof import('../src/programs/upisnik-evidence-snapshots');
  }
  async function baseline(data: Uint8Array, src = source, companion?: Uint8Array, registry = [src]) {
    const { verifyUpisnikEvidenceSnapshots } = await import('../src/programs/upisnik-evidence-snapshots');
    return verifyUpisnikEvidenceSnapshots(file, registry, (p) => p === path ? data : p.endsWith('.snapshot-ocr.txt') ? companion ?? null : null, ratchet, baselineRatchet);
  }
  it('uklanjanje provjere hasha snimke propusta zamijenjene bajtove', async () => {
    const wrong = encoder.encode(fixture + ' promjena');
    expect((await baseline(wrong)).join(' ')).toMatch(/hash snimke/);
    const mutant = await copyWith((s) => s.replace("if (createHash('sha256').update(bytes).digest('hex') !== source.snapshotHash)", "if (false && createHash('sha256').update(bytes).digest('hex') !== source.snapshotHash)"));
    expect(await mutant.verifyUpisnikEvidenceSnapshots(file, [source], () => wrong, ratchet, baselineRatchet)).toEqual([]);
  });
  it('uklanjanje ratchet provjere propusta novu neregistriranu odluku', async () => {
    expect((await baseline(goodBytes, source, undefined, [])).join(' ')).toMatch(/nova obvezujuca odluka/);
    const mutant = await copyWith((s) => s.replace('if (!ratchetKeys.has(key))', 'if (false && !ratchetKeys.has(key))'));
    expect(await mutant.verifyUpisnikEvidenceSnapshots(file, [], () => null, ratchet, baselineRatchet)).toEqual([]);
  });
  it('provjera svake rijeci propusta citat koji nije podniz', async () => {
    const rearranged = encoder.encode('snimke izvora. Doslovni citat iz registrirane');
    expect((await baseline(rearranged, { ...source, snapshotHash: hash(rearranged) })).join(' ')).toMatch(/nije doslovan podniz/);
    const mutant = await copyWith((s) => s.replace(
      String.raw`if (!(await cache.get(cacheKey)!).split(/\n\s*\n/u).some((paragraph) => normalizeSnapshotQuote(paragraph).includes(quote)))`,
      "const text = normalizeSnapshotQuote(await cache.get(cacheKey)!); if (!quote.split(' ').every((word) => text.includes(word)))",
    ));
    expect(await mutant.verifyUpisnikEvidenceSnapshots(file, [{ ...source, snapshotHash: hash(rearranged) }], () => rearranged, ratchet, baselineRatchet)).toEqual([]);
  });
  it('uklanjanje zamrznute osnovice propusta zamjenu ratchet zapisa', async () => {
    const entry = { ...baselineRatchet.entries[0], sourceUrl: 'https://replacement.example.test' };
    const changed = { schemaVersion: 1, entries: [entry] };
    const changedFile = { decisions: [{ programCode: entry.programCode, evidence: { sourceUrl: entry.sourceUrl, sourceLocator: 'test', quote: fixture } }], exclusions: [] };
    const { verifyUpisnikEvidenceSnapshots } = await import('../src/programs/upisnik-evidence-snapshots');
    expect((await verifyUpisnikEvidenceSnapshots(changedFile, [], () => null, changed, baselineRatchet)).join(' ')).toMatch(/ratchet zapis izvan zamrznute osnovice/);
    const mutant = await copyWith((s) => s.replace('if (!baselineKeys.has(ratchetKey(entry)))', 'if (false && !baselineKeys.has(ratchetKey(entry)))'));
    expect(await mutant.verifyUpisnikEvidenceSnapshots(changedFile, [], () => null, changed, baselineRatchet)).toEqual([]);
  });
  it('uklanjanje hidden provjere propusta skriveni HTML citat', async () => {
    const hidden = encoder.encode('<p hidden>' + fixture + '</p>');
    const hiddenSource = { ...source, snapshotHash: hash(hidden) };
    const { verifyUpisnikEvidenceSnapshots } = await import('../src/programs/upisnik-evidence-snapshots');
    expect((await verifyUpisnikEvidenceSnapshots(file, [hiddenSource], () => hidden, ratchet, baselineRatchet)).join(' ')).toMatch(/nije doslovan podniz/);
    const mutant = await copyWith((s) => s.replace("element.hasAttribute('hidden') ||", "false ||"));
    expect(await mutant.verifyUpisnikEvidenceSnapshots(file, [hiddenSource], () => hidden, ratchet, baselineRatchet)).toEqual([]);
  });
  it('iskljucen DOCX onError propusta atribut bez navodnika', async () => {
    // xmldom 0.9.12: atribut bez navodnika prijavljuje SAMO kroz onError (nije fatalError i nije goli ampersand).
    const broken = buildDocx({ paragraphs: [{ text: '', raw: '<w:p><w:r><w:rPr><w:rFonts w:ascii=Arial/></w:rPr><w:t>' + fixture + '</w:t></w:r></w:p>' }] });
    const docxSource = { ...source, snapshotPath: 'data/sources/test.docx', snapshotHash: hash(broken) };
    const { readZip } = await import('../src/repair/zip-codec');
    const { verifyUpisnikEvidenceSnapshots } = await import('../src/programs/upisnik-evidence-snapshots');
    expect((await verifyUpisnikEvidenceSnapshots(file, [docxSource], () => broken, ratchet, baselineRatchet)).join(' ')).toMatch(/DOCX XML nije ispravan/);
    const mutant = await copyWith((s) => s.replace("onError: () => { throw new Error('DOCX XML nije ispravan'); }", 'onError: () => {}'), readZip);
    expect(await mutant.verifyUpisnikEvidenceSnapshots(file, [docxSource], () => broken, ratchet, baselineRatchet)).toEqual([]);
  });
  it('uklanjanje provjere golog ampersanda propusta neispravan DOCX XML', async () => {
    const broken = buildDocx({ paragraphs: [{ text: '', raw: '<w:p><w:r><w:rPr><w:rFonts w:ascii="A & B"/></w:rPr><w:t>' + fixture + '</w:t></w:r></w:p>' }] });
    const docxSource = { ...source, snapshotPath: 'data/sources/test.docx', snapshotHash: hash(broken) };
    const { readZip } = await import('../src/repair/zip-codec');
    const { verifyUpisnikEvidenceSnapshots } = await import('../src/programs/upisnik-evidence-snapshots');
    expect((await verifyUpisnikEvidenceSnapshots(file, [docxSource], () => broken, ratchet, baselineRatchet)).join(' ')).toMatch(/DOCX XML nije ispravan/);
    const mutant = await copyWith((s) => s.replace("if (/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/u.test(xml)) throw new Error('DOCX XML nije ispravan');", ''), readZip);
    expect(await mutant.verifyUpisnikEvidenceSnapshots(file, [docxSource], () => broken, ratchet, baselineRatchet)).toEqual([]);
  });
  // Skenirani PDF: pratitelj = "# snapshotHash: <PDF>", "# ocrTextHash: <tijelo>", tijelo; dokaz samo uz rucno
  // potvrdjen prijepis u registru (ocrTranscript.textHash). Mutant stubira unpdf na prazan tekst, pa ide istim putem.
  const pdfPath = 'data/sources/efri/efri-pravilnik-specijalisticki-2024.pdf';
  const companionPath = pdfPath.replace(/\.pdf$/u, '.snapshot-ocr.txt');
  const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
  const scanned = () => {
    const scan = new Uint8Array(readFileSync(resolve(process.cwd(), pdfPath)));
    const transcript = { textHash: sha(fixture), verifiedBy: 'test', verifiedAt: '2026-10-04' };
    return { scan, pdfSource: { url, snapshotPath: pdfPath, snapshotHash: hash(scan), ocrTranscript: transcript } };
  };
  const companionWith = (pdfHash: string, bodyHash: string, body = fixture) => encoder.encode(`# snapshotHash: ${pdfHash}\n# ocrTextHash: ${bodyHash}\n${body}`);
  async function scannedRun(companion: Uint8Array, src: Record<string, unknown>, mutantSource?: (s: string) => string) {
    const { scan } = scanned();
    const read = (p: string) => p === pdfPath ? scan : p === companionPath ? companion : null;
    const mod = mutantSource ? await copyWith(mutantSource) : await import('../src/programs/upisnik-evidence-snapshots');
    return mod.verifyUpisnikEvidenceSnapshots(file, [src as never], read, ratchet, baselineRatchet);
  }
  it('BASELINE: nemutirani gard prihvaca valjan HTML i valjan potvrdjen prijepis skena (Codex R4)', async () => {
    expect(await baseline(goodBytes)).toEqual([]);
    const { scan, pdfSource } = scanned();
    expect(await scannedRun(companionWith(hash(scan), sha(fixture)), pdfSource)).toEqual([]);
  });
  it('uklanjanje provjere prvog retka zaglavlja propusta pratitelj tudjeg PDF-a', async () => {
    const { pdfSource } = scanned();
    const wrongPdf = companionWith('0'.repeat(64), sha(fixture));
    expect((await scannedRun(wrongPdf, pdfSource)).join(' ')).toMatch(/skenirana snimka bez OCR pratitelja/);
    expect(await scannedRun(wrongPdf, pdfSource, (s) => s.replace("if (lines[0] !== `# snapshotHash: ${source.snapshotHash}`)", "if (false && lines[0] !== `# snapshotHash: ${source.snapshotHash}`)"))).toEqual([]);
  });
  it('uklanjanje provjere hasha tijela propusta pratitelj kojem drugi redak ne odgovara tijelu', async () => {
    const { scan, pdfSource } = scanned();
    const staleHeader = companionWith(hash(scan), '1'.repeat(64));
    expect((await scannedRun(staleHeader, pdfSource)).join(' ')).toMatch(/hashu vlastitog tijela/);
    expect(await scannedRun(staleHeader, pdfSource, (s) => s.replace('if (lines[1] !== `# ocrTextHash: ${bodyHash}`)', 'if (false && lines[1] !== `# ocrTextHash: ${bodyHash}`)'))).toEqual([]);
  });
  it('kljuc predmemorije bez potvrde prijepisa propusta nepotvrdjen zapis iste snimke (Codex runda 2)', async () => {
    const { scan, pdfSource } = scanned();
    const plain = { url: 'http://example.test/isti-pdf', snapshotPath: pdfPath, snapshotHash: hash(scan) };
    const twoFile = { decisions: [
      { programCode: '1', evidence: { sourceUrl: url, sourceLocator: 'test', quote: fixture } },
      { programCode: '2', evidence: { sourceUrl: plain.url, sourceLocator: 'test', quote: fixture } },
    ], exclusions: [] };
    const read = (p: string) => p === pdfPath ? scan : p === companionPath ? companionWith(hash(scan), sha(fixture)) : null;
    const { verifyUpisnikEvidenceSnapshots } = await import('../src/programs/upisnik-evidence-snapshots');
    expect((await verifyUpisnikEvidenceSnapshots(twoFile, [pdfSource, plain], read, ratchet, baselineRatchet)).join(' ')).toMatch(/decision 2: .*rucno potvrdjenog prijepisa/);
    const mutant = await copyWith((s) => s.replace(
      'transcript ? [transcript.textHash, transcript.verifiedBy, transcript.verifiedAt] : null]);', ']);'));
    expect(await mutant.verifyUpisnikEvidenceSnapshots(twoFile, [pdfSource, plain], read, ratchet, baselineRatchet)).toEqual([]);
  });
  it('uklanjanje zahtjeva za rucno potvrdjenim prijepisom propusta strojni OCR kao dokaz (Codex R1)', async () => {
    const { scan, pdfSource } = scanned();
    const unverified = { ...pdfSource, ocrTranscript: undefined };
    const companion = companionWith(hash(scan), sha(fixture));
    expect((await scannedRun(companion, unverified)).join(' ')).toMatch(/rucno potvrdjenog prijepisa/);
    expect(await scannedRun(companion, unverified, (s) => s.replace('if (!transcript || transcript.textHash !== bodyHash || !transcript.verifiedBy?.trim() || !transcript.verifiedAt?.trim()) {', 'if (false) {'))).toEqual([]);
  });
});

/**
 * WORKTREE GC (odluka vlasnika 2026-10-03). Dva kvara koja bi ciscenje pretvorila u brisanje rada:
 *  (a) presuda bez provjere cistoce uklonila bi worktree s necommitanim promjenama;
 *  (b) presuda bez provjere pretka uklonila bi worktree s nespojenom granom (commiti se gube).
 * Mutira se kopija izvora u privremenom direktoriju (uz kopiju `gate-preflight.mjs` koju uvozi),
 * nikad datoteka u repozitoriju; presudu racuna cisti node, kao u mutacijama gate preflighta.
 */
describe('mutacije: worktree-gc presuda', () => {
  const readLf = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
  const clean = { tracked: [], untracked: [], ignored: [] };
  const merged = {
    main: false, bare: false, locked: false, prunable: false, current: false, originFresh: true, ancestor: true,
    unreachableCommits: 0, status: clean, mainNodeModulesLink: false, foreignLinks: [],
    lockHeld: false, lockAmbiguous: false, processPids: [], newestMtimeMs: 0,
  };
  const dirty = { ...merged, status: { ...clean, tracked: ['src/a.ts'] } };
  const unmerged = { ...merged, ancestor: false };

  /** @returns presude `removable` za zadane cinjenice, izracunate nad kopijom izvora. */
  async function removableFor(source: string, facts: object[]): Promise<boolean[]> {
    const { mkdtempSync: mkd, writeFileSync: write, rmSync: rm } = await import('node:fs');
    const { tmpdir: tmp } = await import('node:os');
    const { pathToFileURL } = await import('node:url');
    const { spawnSync } = await import('node:child_process');
    const dir = mkd(join(tmp(), 'lekta-wtgc-mut-'));
    try {
      write(join(dir, 'gate-preflight.mjs'), readLf('scripts/gate-preflight.mjs'));
      const file = join(dir, 'worktree-gc.mjs');
      write(file, source);
      const script = `const m = await import(${JSON.stringify(pathToFileURL(file).href)});`
        + `process.stdout.write(JSON.stringify(${JSON.stringify(facts)}.map((f) => m.judgeWorktree(f, { nowMs: 36e6 }).removable)));`;
      const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60_000 });
      return JSON.parse(res.stdout) as boolean[];
    } finally {
      rm(dir, { recursive: true, force: true });
    }
  }

  it('(a) presuda bez provjere cistoce obara tvrdnju', async () => {
    const source = readLf('scripts/worktree-gc.mjs');
    // BASELINE: spojeno i cisto je uklonjivo, necommitana promjena zadrzava.
    expect(await removableFor(source, [merged, dirty])).toEqual([true, false]);

    // MUTACIJA: izgubljena provjera pracenih promjena (stvaran kvar: brojanje samo neprac. datoteka).
    const mutated = source.replace(/\n {4}if \(facts\.status\.tracked\.length > 0\) reasons\.push\([^\n]*\);/, '');
    expect(mutated).not.toBe(source);
    expect(await removableFor(mutated, [merged, dirty])).toEqual([true, true]);
  }, 120_000);

  it('(b) presuda bez provjere pretka obara tvrdnju', async () => {
    const source = readLf('scripts/worktree-gc.mjs');
    // BASELINE: nespojena grana se zadrzava.
    expect(await removableFor(source, [merged, unmerged])).toEqual([true, false]);

    // MUTACIJA: izgubljena provjera `merge-base --is-ancestor` (stvaran kvar: "cisto" shvaceno kao "spojeno").
    const mutated = source.replace("  if (facts.ancestor !== true) reasons.push('HEAD nije spojen u bazu');\n", '');
    expect(mutated).not.toBe(source);
    expect(await removableFor(mutated, [merged, unmerged])).toEqual([true, true]);
  }, 120_000);

  /**
   * Runda 2 (Codex pregled PR #253): svaki novi uvjet uklanjanja ima cist baseline i mutanta koji
   * vraca zateceni kvar. Tablica: [oznaka, cinjenice koje uvjet mora zadrzati, zamjena izvora].
   */
  const round2: Array<[string, object, (s: string) => string]> = [
    ['B1 ignorirana .env', { ...merged, status: { ...clean, ignored: ['.env'] } },
      (s) => s.replace("  return path === 'dist/';\n", '  return true;\n')],
    ['B2 nepracen src/progress.log', { ...merged, status: { ...clean, untracked: ['src/progress.log'] } },
      (s) => s.replace("  return !path.includes('/') && ALLOWED_UNTRACKED_ROOT.has(path);\n", '  return /\\.log$/i.test(path) || ALLOWED_UNTRACKED_ROOT.has(path);\n')],
    ['M1 aktivan lock bez putanje', { ...merged, lockAmbiguous: true },
      (s) => s.replace("  if (facts.lockAmbiguous === true) reasons.push('aktivan gate lock bez citljive putanje stabla');\n", '')],
    ['M3 commit samo u reflogu', { ...merged, unreachableCommits: 1 },
      (s) => s.replace(/\n {2}else if \(facts\.unreachableCommits > 0\) reasons\.push\([^\n]*\);/, '')],
    ['M4 origin nedostupan', { ...merged, originFresh: false },
      (s) => s.replace("  if (facts.originFresh !== true) reasons.push('origin nedostupan (fetch nije uspio)');\n", '')],
    ['M6 skriveni junction', { ...merged, foreignLinks: ['.tmp-cache/shared'] },
      (s) => s.replace(/\n {2}else if \(facts\.foreignLinks\.length > 0\) reasons\.push\([^\n]*\);/, '')],
  ];
  for (const [label, keptFacts, mutate] of round2) {
    it(`(runda 2) ${label}: mutant bez provjere obara tvrdnju`, async () => {
      const source = readLf('scripts/worktree-gc.mjs');
      expect(await removableFor(source, [merged, keptFacts])).toEqual([true, false]);
      const mutated = mutate(source);
      expect(mutated).not.toBe(source);
      expect(await removableFor(mutated, [merged, keptFacts])).toEqual([true, true]);
    }, 120_000);
  }

  /**
   * M2: medjuprocesni GC lock. Mutant koji ne postuje zauzet lock uklanja stablo dok drugi GC radi.
   * Kopija skripte radi nad stvarnim privremenim repoom (lokalni bare `origin`).
   */
  it('(runda 2) M2 zauzet GC lock: mutant bez provjere locka uklanja stablo', async () => {
    const fs = await import('node:fs');
    const { tmpdir: tmp } = await import('node:os');
    const { spawnSync } = await import('node:child_process');
    const g = (cwd: string, ...args: string[]) => {
      const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    };
    const root = fs.realpathSync(fs.mkdtempSync(join(tmp(), 'lekta-wtgc-mut2-')));
    try {
      const main = join(root, 'main');
      fs.mkdirSync(main);
      g(root, 'init', '-q', '--bare', 'origin.git');
      g(main, 'init', '-q', '-b', 'master');
      g(main, 'config', 'user.email', 't@example.invalid');
      g(main, 'config', 'user.name', 't');
      fs.writeFileSync(join(main, 'a.txt'), 'a\n');
      g(main, 'add', 'a.txt');
      g(main, 'commit', '-q', '-m', 'a');
      g(main, 'remote', 'add', 'origin', join(root, 'origin.git'));
      g(main, 'push', '-q', 'origin', 'master');
      const lockPath = join(root, 'gc.lock');
      const run = (source: string, wt: string) => {
        g(main, 'worktree', 'add', '-q', '--detach', wt, 'master');
        const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const gd = join(main, '.git', 'worktrees', wt.split(/[\\/]/).pop() ?? '');
        for (const p of [join(wt, '.git'), join(gd, 'HEAD'), join(gd, 'index')]) fs.utimesSync(p, old, old);
        const dir = fs.mkdtempSync(join(root, 'src-'));
        fs.writeFileSync(join(dir, 'gate-preflight.mjs'), readLf('scripts/gate-preflight.mjs'));
        fs.writeFileSync(join(dir, 'worktree-gc.mjs'), source);
        fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), label: 'worktree-gc', token: 'x' }));
        spawnSync(process.execPath, [join(dir, 'worktree-gc.mjs'), '--repo', main, '--apply', '--quiet'], {
          cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60_000,
          env: { ...process.env, LEKTA_WORKTREE_GC_LOCK_PATH: lockPath, LEKTA_GATE_LOCK_PATH: join(root, 'gate.lock') },
        });
        return fs.existsSync(wt);
      };
      const source = readLf('scripts/worktree-gc.mjs');
      // BASELINE: dok drugi GC drzi lock, stablo ostaje.
      expect(run(source, join(root, 'wt-a'))).toBe(true);
      // MUTACIJA: zauzet lock se ignorira (zateceno stanje prije runde 2: nije bilo locka).
      const mutated = source.replace("  if ('busy' in gcLock) {", '  if (false) {');
      expect(mutated).not.toBe(source);
      expect(run(mutated, join(root, 'wt-b'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 180_000);

  /**
   * Runda 3 (Codex runda 2 nad 121a9b44, odluke koordinatora): ignorirane iznimke su samo
   * `node_modules` link i korijenski `dist/`; prunable stablo ne preskace reflog.
   */
  const round3: Array<[string, object, (s: string) => string]> = [
    ['B1 vracena .tmp-* iznimka', { ...merged, status: { ...clean, ignored: ['.tmp-word-verify/'] } },
      (s) => s.replace("  return path === 'dist/';\n", "  return path === 'dist/' || path.startsWith('.tmp-');\n")],
    ['B2 vracena *.log iznimka', { ...merged, status: { ...clean, ignored: ['debug.log'] } },
      (s) => s.replace("  return path === 'dist/';\n", "  return path === 'dist/' || /\\.log$/i.test(path);\n")],
    ['M3 prunable bez refloga', { ...merged, prunable: true, unreachableCommits: 1 },
      (s) => s.replace(/\n {4}else if \(facts\.unreachableCommits > 0\) pr\.push\([^\n]*\);/, '')],
  ];
  for (const [label, keptFacts, mutate] of round3) {
    it(`(runda 3) ${label}: mutant obara tvrdnju`, async () => {
      const source = readLf('scripts/worktree-gc.mjs');
      expect(await removableFor(source, [merged, keptFacts])).toEqual([true, false]);
      const mutated = mutate(source);
      expect(mutated).not.toBe(source);
      expect(await removableFor(mutated, [merged, keptFacts])).toEqual([true, true]);
    }, 120_000);
  }

  /**
   * Runda 3, stvarni procesi nad privremenim repoom: kopija skripte se zaustavlja u testnim
   * tockama (`LEKTA_WORKTREE_GC_TEST_BARRIER`) dok test mijenja svijet izmedju mjerenja i brisanja.
   */
  async function gcSandbox() {
    const fs = await import('node:fs');
    const { tmpdir: tmp } = await import('node:os');
    const cp = await import('node:child_process');
    const g = (cwd: string, ...args: string[]) => {
      const r = cp.spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    };
    const root = fs.realpathSync(fs.mkdtempSync(join(tmp(), 'lekta-wtgc-mut3-')));
    const main = join(root, 'main');
    fs.mkdirSync(main);
    g(root, 'init', '-q', '--bare', 'origin.git');
    g(main, 'init', '-q', '-b', 'master');
    g(main, 'config', 'user.email', 't@example.invalid');
    g(main, 'config', 'user.name', 't');
    fs.writeFileSync(join(main, 'a.txt'), 'a\n');
    fs.writeFileSync(join(main, '.gitignore'), 'debug.log\n');
    g(main, 'add', 'a.txt', '.gitignore');
    g(main, 'commit', '-q', '-m', 'a');
    g(main, 'remote', 'add', 'origin', join(root, 'origin.git'));
    g(main, 'push', '-q', 'origin', 'master');
    let n = 0;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const waitFor = async (pred: () => boolean, ms = 90_000) => {
      const deadline = Date.now() + ms;
      while (!pred() && Date.now() < deadline) await sleep(50);
      return pred();
    };
    /** Novo staro spojeno stablo, svjeza mapa za barijeru i kopija izvora. */
    const prepare = (source: string) => {
      n += 1;
      const wt = join(root, `wt-${n}`);
      g(main, 'worktree', 'add', '-q', '--detach', wt, 'master');
      const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const gd = join(main, '.git', 'worktrees', `wt-${n}`);
      for (const p of [join(wt, '.git'), join(gd, 'HEAD'), join(gd, 'index')]) fs.utimesSync(p, old, old);
      const barrier = join(root, `barrier-${n}`);
      fs.mkdirSync(barrier);
      const dir = join(root, `src-${n}`);
      fs.mkdirSync(dir);
      fs.writeFileSync(join(dir, 'gate-preflight.mjs'), readLf('scripts/gate-preflight.mjs'));
      fs.writeFileSync(join(dir, 'worktree-gc.mjs'), source);
      return { wt, barrier, script: join(dir, 'worktree-gc.mjs') };
    };
    const start = (script: string, barrier: string, lockPath = join(root, 'gc.lock')) => {
      const child = cp.spawn(process.execPath, [script, '--repo', main, '--apply'], {
        cwd: root,
        windowsHide: true,
        env: {
          ...process.env,
          LEKTA_WORKTREE_GC_LOCK_PATH: lockPath,
          LEKTA_GATE_LOCK_PATH: join(root, 'gate.lock'),
          LEKTA_WORKTREE_GC_STASH: join(root, 'odlozeno'),
          LEKTA_WORKTREE_GC_TEST_BARRIER: barrier,
        },
      });
      let out = '';
      child.stdout.on('data', (d) => { out += String(d); });
      child.stderr.on('data', (d) => { out += String(d); });
      const done = new Promise<string>((r) => child.on('close', () => r(out)));
      return { child, done };
    };
    const ready = (barrier: string, point: string) => fs.readdirSync(barrier)
      .filter((f) => f.startsWith(`${point}-`) && f.endsWith('.ready'))
      .map((f) => Number(f.slice(point.length + 1, -'.ready'.length)));
    const go = (barrier: string, name: string) => fs.writeFileSync(join(barrier, `${name}.go`), '');
    const cleanup = () => fs.rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    return { fs, cp, root, main, prepare, start, ready, go, waitFor, cleanup };
  }

  it('(runda 3) M2b ponovna provjera bez svjezeg snimka procesa: mutant uklanja stablo u kojem proces radi', async () => {
    const sb = await gcSandbox();
    try {
      const scenario = async (source: string) => {
        const { wt, barrier, script } = sb.prepare(source);
        for (const p of ['preuzimanje', 'uzet', 'provjereno']) sb.go(barrier, p);
        const gc = sb.start(script, barrier);
        expect(await sb.waitFor(() => sb.ready(barrier, 'izmjereno').length === 1)).toBe(true);
        // Proces s putanjom stabla u naredbenom retku nastaje TEK nakon prvog mjerenja.
        const holder = sb.cp.spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)', wt], { cwd: sb.root, windowsHide: true });
        try {
          await new Promise((r) => setTimeout(r, 500));
          sb.go(barrier, 'izmjereno');
          const out = await gc.done;
          return { kept: sb.fs.existsSync(wt), out };
        } finally {
          const exited = new Promise((r) => holder.once('exit', r));
          holder.kill();
          await exited;
        }
      };
      const source = readLf('scripts/worktree-gc.mjs');
      // BASELINE: svjez snimak procesa vidi novi proces i stablo ostaje.
      const base = await scenario(source);
      expect(base.kept, base.out).toBe(true);
      expect(base.out).toMatch(/zadrzan pri ponovnoj provjeri: .*proces radi u stablu/);
      // MUTACIJA: ponovna provjera koristi snimak procesa iz prvog mjerenja (nalaz M2b runde 2).
      const mutated = source.replace(
        "{ sizes: 'none', nowMs: Date.now(), foreignProcesses: lazyForeignProcesses() }",
        "{ sizes: 'none', nowMs: Date.now() }",
      );
      expect(mutated).not.toBe(source);
      const mut = await scenario(mutated);
      expect(mut.kept, mut.out).toBe(false);
    } finally {
      sb.cleanup();
    }
  }, 300_000);

  it('(runda 3) M2b zadnja provjera prije remove preskocena: mutant brise ignorirani debug.log nastao nakon ponovnog mjerenja', async () => {
    const sb = await gcSandbox();
    try {
      const scenario = async (source: string) => {
        const { wt, barrier, script } = sb.prepare(source);
        for (const p of ['preuzimanje', 'uzet', 'izmjereno']) sb.go(barrier, p);
        const gc = sb.start(script, barrier);
        expect(await sb.waitFor(() => sb.ready(barrier, 'provjereno').length === 1)).toBe(true);
        sb.fs.writeFileSync(join(wt, 'debug.log'), 'korisnicki podaci\n');
        sb.go(barrier, 'provjereno');
        const out = await gc.done;
        const log = join(wt, 'debug.log');
        return { kept: sb.fs.existsSync(log) && sb.fs.readFileSync(log, 'utf8') === 'korisnicki podaci\n', out };
      };
      const source = readLf('scripts/worktree-gc.mjs');
      // BASELINE: svjez status s ignoriranim stavkama neposredno prije remove vidi debug.log.
      const base = await scenario(source);
      expect(base.kept, base.out).toBe(true);
      expect(base.out).toMatch(/zadrzan neposredno prije uklanjanja: .*ignorirane datoteke: debug\.log/);
      // MUTACIJA: bez zadnje provjere git worktree remove brise ignoriranu datoteku.
      const mutated = source.replace('    changed = finalChangeReason(row);\n    if (changed) throw new Error(changed);\n', '');
      expect(mutated).not.toBe(source);
      const mut = await scenario(mutated);
      expect(mut.kept, mut.out).toBe(false);
    } finally {
      sb.cleanup();
    }
  }, 300_000);

  it('(runda 3) M2a utrka dva --apply nad mrtvim GC lockom: mutant s neatomarnim preuzimanjem pusta oba', async () => {
    const sb = await gcSandbox();
    try {
      const deadPid = sb.cp.spawnSync(process.execPath, ['-e', ''], { windowsHide: true }).pid;
      const scenario = async (source: string) => {
        const { barrier, script } = sb.prepare(source);
        const lockPath = join(barrier, 'gc.lock');
        sb.fs.writeFileSync(lockPath, JSON.stringify({
          pid: deadPid, startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), label: 'worktree-gc', token: 'mrtav',
        }));
        for (const p of ['izmjereno', 'provjereno']) sb.go(barrier, p);
        const gcs = [sb.start(script, barrier, lockPath), sb.start(script, barrier, lockPath)];
        // Oba procesa su procitala ISTI mrtav lock prije nego sto ijedan djeluje.
        expect(await sb.waitFor(() => sb.ready(barrier, 'preuzimanje').length === 2)).toBe(true);
        const [a, b] = sb.ready(barrier, 'preuzimanje') as [number, number];
        sb.go(barrier, `preuzimanje-${a}`);
        expect(await sb.waitFor(() => sb.ready(barrier, 'uzet').includes(a))).toBe(true);
        sb.go(barrier, `preuzimanje-${b}`);
        const exitedB = gcs.find((x) => x.child.pid === b)!;
        let bDone = false;
        void exitedB.done.then(() => { bDone = true; });
        await sb.waitFor(() => bDone || sb.ready(barrier, 'uzet').includes(b), 60_000);
        sb.go(barrier, 'uzet');
        const outs = await Promise.all(gcs.map((x) => x.done));
        return outs.filter((o) => /preskoceno \(drugi worktree-gc radi \(PID \d+\)\)/.test(o)).length;
      };
      const source = readLf('scripts/worktree-gc.mjs');
      // BASELINE: tocno jedan proces preuzima mrtav lock; drugi pod cuvarom vidi zivi lock i odustaje.
      expect(await scenario(source)).toBe(1);
      // MUTACIJA: preuzimanje bez cuvara (zateceno stanje runde 2: unlink pa wx).
      const mutated = source.replace(
        '  return takeOverDeadGcLock(path, record, nowMs);\n',
        "  try { unlinkSync(path); } catch { /* vec maknut */ }\n  return writeLock(path, record) ? { token } : { busy: 'GC lock nije uzet' };\n",
      );
      expect(mutated).not.toBe(source);
      expect(await scenario(mutated)).toBe(0);
    } finally {
      sb.cleanup();
    }
  }, 300_000);
});

describe('mobilni rezultat prvi (mobilni audit 2026-09-28, PR 1)', () => {
  const css = () => readFileSync(resolve(process.cwd(), 'src/shared/page-app.css'), 'utf8');
  const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), 'tests/fixtures/docx/synthetic-mentor-komentari.docx')));

  it('BASELINE: nagnut list na uskom ekranu stoji ravno', () => {
    expect(mobileTiltProblems(css())).toEqual([]);
  });

  it('mutant: bez pravila za uski ekran nagib ostaje i gard ga hvata', () => {
    const bez = css().replace('@media(max-width:720px){.analyzer-wrap{transform:none}}', '');
    expect(bez).not.toBe(css());
    expect(mobileTiltProblems(bez)).toEqual(['list je nagnut i na uskom ekranu']);
  });

  it('mutant: kasnije pravilo s !important ponovno nagne list (Codex F5, runda 2)', () => {
    expect(mobileTiltProblems(`${css()}\n.analyzer-wrap{transform:rotate(.3deg)!important}`)).toEqual(['list je nagnut i na uskom ekranu']);
  });

  it('mutant: kasnije mobilno pravilo ponovno nagne list', () => {
    expect(mobileTiltProblems(`${css()}\n@media(max-width:720px){.analyzer-wrap{transform:rotate(.3deg)}}`)).toEqual(['list je nagnut i na uskom ekranu']);
  });

  it('kontrola: nagib samo za siroki ekran ne vrijedi na 360 px', () => {
    expect(mobileTiltProblems(`${css()}\n@media(min-width:900px){.analyzer-wrap{transform:rotate(.3deg)!important}}`)).toEqual([]);
  });

  it('mutant: samostalni rotate nagne list iako je transform none (Codex R2 na #286)', () => {
    expect(mobileTiltProblems(`${css()}\n.analyzer-wrap{rotate:.3deg}`)).toEqual(['list je nagnut samostalnim rotate na uskom ekranu']);
  });

  it('mutant: samostalni translate pomakne list (Codex R2 na #286)', () => {
    expect(mobileTiltProblems(`${css()}\n@media(max-width:720px){.analyzer-wrap{translate:18px 0}}`)).toEqual(['list je pomaknut samostalnim translate na uskom ekranu']);
  });

  it('kontrola: rotate:none i translate:0 ne dizu gard', () => {
    expect(mobileTiltProblems(`${css()}\n.analyzer-wrap{rotate:none;translate:0}`)).toEqual([]);
  });

  it('BASELINE: blok komentara je sklopljen na uskom i otvoren na sirokom ekranu', async () => {
    expect(await mentorCollapseProblems(await mentorModuleFromSource([]), bytes)).toEqual([]);
  });

  it('mutant: blok uvijek otvoren se hvata na uskom ekranu', async () => {
    const mod = await mentorModuleFromSource([['let otvoreno = !(opts.uzak ?? medij?.matches ?? false);', 'let otvoreno = true;']]);
    expect(await mentorCollapseProblems(mod, bytes)).toEqual(['uzak ekran: blok komentara je otvoren']);
  });

  it('mutant: blok opet obican div (bez sklapanja) se hvata', async () => {
    const mod = await mentorModuleFromSource([["return `<details class=\"mt\"${otvoreno ? ' open' : ''}><summary class=\"mt-kicker\">", "return `<div class=\"mt\"><p class=\"mt-kicker\">"]]);
    expect(await mentorCollapseProblems(mod, bytes)).toEqual(['blok komentara nije <details>', 'blok komentara nije <details>']);
  });

  it('BASELINE: otvorenost prati sirinu, rucni odabir ima prednost (Codex F6)', async () => {
    expect(await mentorResizeProblems(await mentorModuleFromSource([]), bytes)).toEqual([]);
  });

  it('mutant: odluka samo pri montazi (bez pracenja medija) se hvata', async () => {
    const mod = await mentorModuleFromSource([['      if (rucno) return;', '      return;']]);
    expect(await mentorResizeProblems(mod, bytes)).toEqual(['suzeno na uzak ekran: blok ostaje otvoren']);
  });

  it('mutant: promjena sirine gazi rucni odabir se hvata', async () => {
    const mod = await mentorModuleFromSource([['      if (rucno) return;', '']]);
    expect(await mentorResizeProblems(mod, bytes)).toEqual(['rucno otvoren blok sklopljen promjenom sirine']);
  });
});

describe('mutacije: T64 census inspectionCoverage (Codex M4 na #165)', () => {
  // Uvoz je lijen da ovaj blok ne mijenja redoslijed ucitavanja ostatka datoteke.
  const load = async () => ({
    cov: await import('../src/analysis/inspection-coverage'),
    guard: await import('./helpers/inspection-coverage-guard'),
  });

  it('baseline: stvarni census je cist pod gardom', async () => {
    const { cov, guard } = await load();
    expect(await guard.inspectionCensusProblems(cov.inspectionCoverageFromPackage)).toEqual([]);
  });

  it('(a) census bez zaglavlja i podnozja (stanje na 265598f7) obara gard', async () => {
    const { cov, guard } = await load();
    const samoTijeloIBiljeske = (names: Iterable<string>) =>
      [...names].filter((name) => /^word\/(?:document|footnotes|endnotes)\.xml$/.test(name)).sort();
    const mutant: typeof cov.inspectionCoverageFromPackage = (zip, details) =>
      cov.inspectionCoverageFromPackage(zip, details, { partNames: samoTijeloIBiljeske });
    const problems = await guard.inspectionCensusProblems(mutant);
    expect(problems).toContain('tekstni okvir samo u zaglavlju nije prijavljen kao ogranicenje');
    expect(problems).toContain('strukturirana kontrola samo u podnozju nije prijavljena kao ogranicenje');
  });

  it('(b) census koji izostavi jednu strukturu (txbx) obara gard', async () => {
    const { cov, guard } = await load();
    const bezOkvira = cov.INSPECTION_STRUCTURES.filter((s) => s.kind !== 'text-box');
    expect(bezOkvira.length).toBe(cov.INSPECTION_STRUCTURES.length - 1);
    const mutant: typeof cov.inspectionCoverageFromPackage = (zip, details) =>
      cov.inspectionCoverageFromPackage(zip, details, { structures: bezOkvira });
    expect(await guard.inspectionCensusProblems(mutant)).toContain('vrsta text-box nije prepoznata u census-u');
  });

  it('(c) lazni no-known-limits kad census baci izuzetak obara gard', async () => {
    const { cov, guard } = await load();
    const mutant: typeof cov.inspectionCoverageFromPackage = async (zip, details) => {
      try {
        return cov.buildInspectionCoverage(await cov.readInspectionParts(zip), details);
      } catch {
        return cov.buildInspectionCoverage([], details);
      }
    };
    expect(await guard.inspectionCensusProblems(mutant)).toContain('kvar citanja dijela dao je no-known-limits, ne unknown');
  });

  it('(d) izbor zaglavlja i podnozja po imenu umjesto po relaciji (stanje na 9428b217) obara gard', async () => {
    const { cov, guard } = await load();
    const poImenu = (names: Iterable<string>) =>
      [...names].filter((name) => /^word\/(?:document|footnotes|endnotes|header\d*|footer\d*)\.xml$/i.test(name)).sort();
    const mutant: typeof cov.inspectionCoverageFromPackage = (zip, details) =>
      cov.inspectionCoverageFromPackage(zip, details, { partNames: poImenu });
    const problems = await guard.inspectionCensusProblems(mutant);
    expect(problems).toContain('zaglavlje povezano relacijom pod imenom izvan header*.xml nije prijavljeno kao ogranicenje');
    expect(problems).toContain('nepovezano zaglavlje bez relacije promijenilo je status (partial)');
    expect(problems).toContain('nevaljan document.xml.rels dao je no-known-limits, ne unknown');
    expect(problems).toContain('referenca zaglavlja bez document.xml.rels dala je no-known-limits, ne unknown');
  });

  it('(e) dubina polja na razini cijelog dijela (stanje na 9428b217) obara gard', async () => {
    const { cov, guard } = await load();
    // Doslovno brojilo s 9428b217: jedna dubina za cijeli footnotes.xml.
    const dubinaDijela = (xml: string): number => {
      let depth = 0;
      let orphanEnds = 0;
      for (const match of xml.matchAll(/<w:fldChar\b[^>]*>/gi)) {
        const type = /\bw:fldCharType\s*=\s*["']([A-Za-z]+)["']/i.exec(match[0])?.[1]?.toLowerCase();
        if (type === 'begin') depth += 1;
        else if (type === 'end') {
          if (depth > 0) depth -= 1;
          else orphanEnds += 1;
        }
      }
      return depth + orphanEnds;
    };
    const structures = cov.INSPECTION_STRUCTURES.map((s) => (s.kind === 'unbalanced-field' ? { kind: s.kind, count: dubinaDijela } : s));
    const mutant: typeof cov.inspectionCoverageFromPackage = (zip, details) =>
      cov.inspectionCoverageFromPackage(zip, details, { structures });
    expect(await guard.inspectionCensusProblems(mutant)).toEqual([
      'polje otvoreno u jednoj fusnoti i zatvoreno u drugoj dalo je no-known-limits',
    ]);
  });

  it('(f) census bez komentara i glossary dijela obara gard', async () => {
    const { cov, guard } = await load();
    const bezKomentaraIGlossaryja: typeof cov.inspectionPartNames = (names, context) =>
      cov.inspectionPartNames(names, context).filter((name) => !/^word\/(?:comments\.xml|glossary\/)/i.test(name));
    const mutant: typeof cov.inspectionCoverageFromPackage = (zip, details) =>
      cov.inspectionCoverageFromPackage(zip, details, { partNames: bezKomentaraIGlossaryja });
    expect(await guard.inspectionCensusProblems(mutant)).toEqual([
      'tekstni okvir u zaglavlju povezanom iz glossary rels nije prijavljen kao ogranicenje',
      'strukturirana kontrola samo u komentarima nije prijavljena kao ogranicenje',
      'tekstni okvir samo u glossary dijelu nije prijavljen kao ogranicenje',
    ]);
  });

  it('(g) census bez razrjesavanja r:id reference zaglavlja (stanje na efc94369) obara gard', async () => {
    const { cov, guard } = await load();
    // Mutant: reference u document.xml se ne provjeravaju prema rels dijelu.
    const bezRazrjesavanja: typeof cov.inspectionPartNames = (names, context) =>
      cov.inspectionPartNames(names, context.documentRelsXml == null ? context : { ...context, documentXml: '' });
    const mutant: typeof cov.inspectionCoverageFromPackage = (zip, details) =>
      cov.inspectionCoverageFromPackage(zip, details, { partNames: bezRazrjesavanja });
    expect(await guard.inspectionCensusProblems(mutant)).toEqual([
      'nerazrijeseni r:id zaglavlja u postojecem rels dijelu dao je no-known-limits, ne unknown',
      'headerReference na relaciju tipa footer dao je no-known-limits, ne unknown',
    ]);
  });

  it('(h) census koji ignorira word/glossary/_rels (stanje na efc94369) obara gard', async () => {
    const { cov, guard } = await load();
    const bezGlossaryRels: typeof cov.inspectionPartNames = (names, context) =>
      cov.inspectionPartNames(names, { ...context, glossaryRelsXml: null, glossaryXml: '' });
    const mutant: typeof cov.inspectionCoverageFromPackage = (zip, details) =>
      cov.inspectionCoverageFromPackage(zip, details, { partNames: bezGlossaryRels });
    expect(await guard.inspectionCensusProblems(mutant)).toEqual([
      'tekstni okvir u zaglavlju povezanom iz glossary rels nije prijavljen kao ogranicenje',
      'nevaljan glossary rels dao je no-known-limits, ne unknown',
      'referenca zaglavlja u glossaryju bez glossary rels dala je no-known-limits, ne unknown',
    ]);
  });
});

describe('mutacije: pr-intake (najnoviji check-run po imenu, zasticene staze)', () => {
  // Gard: sazetak sintetickog PR-a mora prijaviti crveni `orphan` (noviji pad preko starijeg
  // zelenog) i ne smije prijaviti `check` (stariji pad, noviji zeleni rerun). PR koji dira
  // src/docx mora dati tu zasticenu stazu i jaci model pregleda.
  type PrIntakeInputT = import('../scripts/agents/pr-intake-core.mjs').PrIntakeInput;
  type PrIntakeOpcije = Parameters<typeof prIntake.summarizePr>[1];
  const ulaz = (): PrIntakeInputT =>
    JSON.parse(readFileSync(resolve(process.cwd(), 'tests/fixtures/pr-intake/pr-osnova.json'), 'utf8')) as PrIntakeInputT;

  function prIntakeProblems(opcije: PrIntakeOpcije): string[] {
    const problemi: string[] = [];
    const s = prIntake.summarizePr(ulaz(), opcije);
    if (JSON.stringify(s.ci.imenaCrvenih) !== JSON.stringify(['orphan'])) {
      problemi.push(`crveni check-runi nisu najnoviji po imenu: ${s.ci.imenaCrvenih.join(', ')}`);
    }
    const zasticeni = ulaz();
    zasticeni.files = [...zasticeni.files, { filename: 'src/docx/parser.ts', additions: 0, deletions: 0 }];
    const z = prIntake.summarizePr(zasticeni, opcije);
    if (JSON.stringify(z.zasticeneStaze) !== JSON.stringify(['src/docx']) || z.modelPregleda !== prIntake.MODEL_PREGLEDA_ZASTICENO) {
      problemi.push(`zasticena staza src/docx nije prijavljena (model ${z.modelPregleda})`);
    }
    return problemi;
  }

  it('baseline: stvarna pravila daju cist ishod', () => {
    expect(prIntakeProblems({})).toEqual([]);
  });

  it('mutant: uzima najstariji check-run umjesto najnovijeg (obara gard)', () => {
    const najstariji: typeof prIntake.latestCheckRunsByName = (runs) => {
      const m = new Map<string, (typeof runs)[number]>();
      for (const r of runs) {
        const p = m.get(r.name);
        if (!p || r.id < p.id) m.set(r.name, r);
      }
      return [...m.values()];
    };
    expect(prIntakeProblems({ latestByName: najstariji })).toEqual([
      'crveni check-runi nisu najnoviji po imenu: check',
    ]);
  });

  it('mutant: ignorira protectedPaths (obara gard)', () => {
    expect(prIntakeProblems({ protectedTouched: () => [] })).toEqual([
      'zasticena staza src/docx nije prijavljena (model gpt-6-sol)',
    ]);
  });
});

/**
 * ANALIZA UZIVO (ALIGNMENT Z33). Dva garda iz `tests/helpers/analysis-live-guard.ts`:
 *  - Z31 pokret: list Z33 smije animirati samo transform, opacity i clip-path, bez backdrop-filter.
 *    Predlozak sam animira `left` i `box-shadow` na drugim ekranima; prepisivanje inline stilova u
 *    klase je upravo trenutak u kojem se takav literal tiho prenese.
 *  - Granica lijenog modula: ulaz `/rad/` je tik ispod bundle-guarda (960 KB), pa bi jedan
 *    staticki uvoz modula Z33 gurnuo njegov kod i CSS u statican graf rute.
 */
describe('Z33 analiza uzivo: gardovi pokreta i lijene granice grizu', () => {
  const citaj = (rel: string): string => readFileSync(resolve(__dirname, '..', rel), 'utf8').split('\r\n').join('\n');
  const css = citaj('src/ui/analysis-live/analysis-live.css');
  const izvori = {
    'src/ui/progress-scan.ts': citaj('src/ui/progress-scan.ts'),
    'src/ui/app.ts': citaj('src/ui/app.ts'),
  };

  it('BASELINE: stvarni list i stvarni ulaz su cisti', () => {
    expect(motionCssProblems(css)).toEqual([]);
    expect(liveBoundaryProblems(izvori, 'src/ui/progress-scan.ts')).toEqual([]);
  });

  it('MUTACIJA: prijelaz sirine (layout u petlji) obara gard', () => {
    const mutant = css.replace('.z33-slot { display: grid;', '.z33-slot { transition: width .3s; display: grid;');
    expect(mutant).not.toBe(css);
    expect(motionCssProblems(mutant)).toEqual(['transition mijenja width']);
  });

  it('MUTACIJA: keyframes koji animiraju left (kao predlozak) obaraju gard', () => {
    const mutant = css.replace('@keyframes z33-caret { 50% { opacity: 0 } }', '@keyframes z33-caret { 50% { opacity: 0; left: 4px } }');
    expect(mutant).not.toBe(css);
    expect(motionCssProblems(mutant)).toEqual(['@keyframes z33-caret animira left']);
  });

  it('MUTACIJA: backdrop-filter na listu obara gard', () => {
    const mutant = css.replace('.z33-verdict-wait {', '.z33-verdict-wait { backdrop-filter: blur(4px);');
    expect(mutant).not.toBe(css);
    expect(motionCssProblems(mutant)).toContain('backdrop-filter je zabranjen (Z31)');
  });

  it('MUTACIJA: staticki uvoz modula Z33 u app.ts obara gard', () => {
    const uvoz = "import { mountAnalysisLive } from './analysis-live/analysis-live';";
    const mutant = { ...izvori, 'src/ui/app.ts': uvoz + '\n' + izvori['src/ui/app.ts'] };
    expect(liveBoundaryProblems(mutant, 'src/ui/progress-scan.ts')).toEqual(['src/ui/app.ts: staticki uvoz ./analysis-live/analysis-live']);
  });

  it('MUTACIJA: dinamicki uvoz zamijenjen statickim u progress-scan.ts obara gard', () => {
    const uvoz = "import { mountAnalysisLive } from './analysis-live/analysis-live';";
    // Od runde 2 (Z33-02, rok uvoza) dinamicki uvoz stoji u vlastitom pokusaju s rokom.
    const dinamicki = "import('./analysis-live/analysis-live')";
    const src = izvori['src/ui/progress-scan.ts'];
    expect(src).toContain(dinamicki);
    const mutant = { ...izvori, 'src/ui/progress-scan.ts': uvoz + '\n' + src.replace(dinamicki, 'Promise.resolve({ mountAnalysisLive })') };
    expect(liveBoundaryProblems(mutant, 'src/ui/progress-scan.ts')).toEqual([
      'src/ui/progress-scan.ts: staticki uvoz ./analysis-live/analysis-live',
      'src/ui/progress-scan.ts: nema dinamickog uvoza ./analysis-live/analysis-live',
    ]);
  });
});

/**
 * Z33 COPY (F31, odluka vlasnika 2026-10-04): natpisi gumba na ekranu analize uzivo su doslovno iz
 * predloska `Analysis.dc.html`; "Preskoči" je jedino zapisano odstupanje. Gard `copyProblems`.
 */
describe('Z33 analiza uzivo: gard doslovnog copyja grize', () => {
  const citaj = (rel: string): string => readFileSync(resolve(__dirname, '..', rel), 'utf8').split('\r\n').join('\n');
  const modul = citaj('src/ui/analysis-live/analysis-live.ts');
  const predlozak = citaj('design/templates/analysis/Analysis.dc.html');
  const ODSTUPANJA = ['Preskoči'];

  it('BASELINE: stvarni kostur i predlozak su cisti', () => {
    expect(copyProblems(modul, predlozak, ODSTUPANJA)).toEqual([]);
  });

  it('MUTACIJA: preformuliran natpis plana popravka obara gard', () => {
    // Natpis koji NIJE podniz predloska ("Napravi plan" bi to bio, pa ne bi bio mutacija copyja).
    const mutant = modul.replace('>Napravi plan popravka</button>', '>Izradi plan popravka</button>');
    expect(mutant).not.toBe(modul);
    expect(copyProblems(mutant, predlozak, ODSTUPANJA)).toEqual(['natpis "Izradi plan popravka" nije u predlosku']);
  });

  it('MUTACIJA: odstupanje izbrisano s popisa obara gard', () => {
    expect(copyProblems(modul, predlozak, [])).toEqual(['natpis "Preskoči" nije u predlosku']);
  });

  it('MUTACIJA: natpis iz predloska proglasen odstupanjem obara gard', () => {
    expect(copyProblems(modul, predlozak, [...ODSTUPANJA, 'Pregledaj nalaze'])).toEqual(['"Pregledaj nalaze" je u predlosku, nije odstupanje']);
  });
});

/**
 * REZULTAT: SVE U JEDNOM (ALIGNMENT Z34). Gardovi iz `tests/helpers/analysis-live-guard.ts` (pokret,
 * lijena granica, doslovni copy) i `tests/helpers/result-live-guard.ts` (cijena, "+N"):
 *  - Z31 pokret na listu Z34 (predlozak animira padding i line-height prijelazom "Nakon plana");
 *  - kod Z34 ulazi u `/rad/` samo dinamickim uvozom iz kokpita (ulaz je tik ispod 960 KB);
 *  - natpisi gumba doslovno iz `ResultLive.dc.html`;
 *  - nema cijene u klijentskom kodu i nema bodova po zahvatu (odluka vlasnika, F37).
 */
describe('Z34 rezultat sve u jednom: gardovi grizu', () => {
  const citaj = (rel: string): string => readFileSync(resolve(__dirname, '..', rel), 'utf8').split('\r\n').join('\n');
  const css = citaj('src/ui/result-live/result-live.css');
  const modul = citaj('src/ui/result-live/result-live.ts');
  const predlozak = citaj('design/templates/result-live/ResultLive.dc.html');
  const SHIM = 'src/ui/results/results-cockpit-live.ts';
  const KOKPIT = 'src/ui/results/results-cockpit.ts';
  const MODUL = '../result-live/result-live';
  const izvori = { [SHIM]: citaj(SHIM), [KOKPIT]: citaj(KOKPIT), 'src/ui/app.ts': citaj('src/ui/app.ts') };
  const zahvati = zahvatiPlana([{ ruleId: 'm', label: 'Margine', violated: true, matchKeys: ['M'] }], true);
  const racun = ladica(pocetniOdabir(zahvati), zahvati, 71, 88).racun ?? '';

  it('BASELINE: stvarni list, ulaz, kostur i racun su cisti', () => {
    expect(motionCssProblems(css)).toEqual([]);
    expect(izvori[KOKPIT]).toContain("import('./results-cockpit-live')");
    expect(liveBoundaryProblems(izvori, SHIM, MODUL)).toEqual([]);
    expect(copyProblems(modul, predlozak, [])).toEqual([]);
    expect(cijenaProblems({ 'src/ui/result-live/result-live.ts': modul, 'src/ui/result-live/result-live.css': css })).toEqual([]);
    expect(racun).toBe('71 → najviše 88');
    expect(plusBodProblems(`${racun} ${prsten(71, 88)?.opis}`)).toEqual([]);
  });

  it('MUTACIJA: prijelaz sirine na hrpi kartica obara gard pokreta', () => {
    const mutant = css.replace('.rl-slot { position: relative;', '.rl-slot { transition: width .3s; position: relative;');
    expect(mutant).not.toBe(css);
    expect(motionCssProblems(mutant)).toEqual(['transition mijenja width']);
  });

  it('MUTACIJA: staticki uvoz modula Z34 u kokpit (bez dinamickog) obara gard granice', () => {
    const dinamicki = "import('../result-live/result-live')";
    const src = izvori[SHIM];
    expect(izvori[KOKPIT]).toContain("import('./results-cockpit-live')");
    expect(src).toContain(dinamicki);
    const mutant = { ...izvori, [SHIM]: "import { mountResultLive } from '../result-live/result-live';\n" + src.replaceAll(dinamicki, 'Promise.resolve({ mountResultLive })') };
    expect(liveBoundaryProblems(mutant, SHIM, MODUL)).toEqual([
      `${SHIM}: staticki uvoz ../result-live/result-live`,
      `${SHIM}: nema dinamickog uvoza ../result-live/result-live`,
    ]);
  });

  it('MUTACIJA: preformuliran natpis gumba obara gard copyja', () => {
    const mutant = modul.replace('>Uključi u plan</button>', '>Dodaj u plan</button>');
    expect(mutant).not.toBe(modul);
    expect(copyProblems(mutant, predlozak, [])).toEqual(['natpis "Dodaj u plan" nije u predlosku']);
  });

  it('MUTACIJA: cijena iz predloska upisana u ladicu obara gard cijene', () => {
    const mutant = modul.replace('>Cijena ne ovisi o odabiru.</span>', '>14,99 €</span>');
    expect(mutant).not.toBe(modul);
    expect(cijenaProblems({ 'src/ui/result-live/result-live.ts': mutant })).toEqual(['src/ui/result-live/result-live.ts: znak eura']);
  });

  it('MUTACIJA: stvarni literal gumba Z34 s +N obara gard izvora', () => {
    const mutant = modul.replace('>U planu ✓</button>', '>U planu ✓ · +7</button>');
    expect(mutant).not.toBe(modul);
    expect(plusBodIzvorProblems({ 'src/ui/result-live/result-live.ts': mutant })).toEqual([
      'src/ui/result-live/result-live.ts: "+7" u tekstu',
    ]);
  });

  it('MUTACIJA: bodovi po zahvatu u natpisu ili racunu obaraju gard', () => {
    expect(plusBodProblems('U planu ✓ · +7')).toEqual(['bodovi po zahvatu: "+7"']);
    expect(plusBodProblems(`${racun} · +17`)).toEqual(['bodovi po zahvatu: "+17"']);
  });
});

describe('mutacije: ID zadatka u validateQueue prima T100 do T999 (T100, nalog vlasnika 2026-10-04)', () => {
  type Validator = (queue: unknown) => unknown;
  const IZVORNI_UZORAK = '/^T(?:\\d{2}|[1-9]\\d{2})$/';
  /** validateQueue iz STVARNOG izvora, s jednim zamijenjenim regexom; mutacija mijenja sam gard. */
  const validatorIzIzvora = (uzorak: string): Validator => {
    const src = readFileSync(resolve(process.cwd(), 'scripts/agents/core.mjs'), 'utf8').replace(/\r/g, '');
    const a = src.indexOf('export function validateQueue(');
    const b = src.indexOf('\n}\n', a);
    if (a < 0 || b < a) throw new Error('validateQueue nije pronadjen u scripts/agents/core.mjs');
    const blok = src.slice(a, b + 2).replace('export function', 'function');
    if (!blok.includes(IZVORNI_UZORAK)) throw new Error(`mutacija ne pogadja izvor: ${IZVORNI_UZORAK}`);
    return new Function(`${blok.replace(IZVORNI_UZORAK, uzorak)}\nreturn validateQueue;`)() as Validator;
  };
  const stvarniRed = () => JSON.parse(readFileSync(resolve(process.cwd(), 'docs/agents/tasks.json'), 'utf8'));
  const jedan = (id: string) => ({ tasks: [{ id, title: 'x', status: 'ready', dependsOn: [] }] });
  const prolazi = (v: Validator, q: unknown) => { try { v(q); return true; } catch { return false; } };
  /** Tvrdnja garda: stvarni red (s T100) prolazi, a vodeca nula i cetiri znamenke padaju. */
  const gardDrzi = (v: Validator): boolean =>
    prolazi(v, stvarniRed()) && !prolazi(v, jedan('T017')) && !prolazi(v, jedan('T1000')) && !prolazi(v, jedan('T7'));

  it('baseline: stvarni red sadrzi troznamenkasti ID i gard drzi', () => {
    expect(stvarniRed().tasks.some((t: { id: string }) => /^T\d{3}$/.test(t.id))).toBe(true);
    expect(gardDrzi(validatorIzIzvora(IZVORNI_UZORAK))).toBe(true);
  });

  it('mutant: stari oblik samo s dvije znamenke obara stvarni red', () => {
    expect(gardDrzi(validatorIzIzvora('/^T\\d{2}$/'))).toBe(false);
  });

  it('mutant: bilo koliko znamenki propusta T017 i T1000', () => {
    expect(gardDrzi(validatorIzIzvora('/^T\\d+$/'))).toBe(false);
  });
});

describe('mobilna polja i mete alata (mobilni audit 2026-09-28, PR 4)', () => {
  const lf = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r/g, '');
  const TOOL = 'src/shared/tool-page.css';
  const CHROME = 'src/shared/site-chrome.css';

  it('BASELINE: polja 16 px, .row2 u jednom stupcu, pravne poveznice 44 px', () => {
    expect(mobileFieldsProblems(lf(TOOL), lf(CHROME))).toEqual([]);
  });

  it('mutant: bez 16 px u poljima se hvata', () => {
    const m = lf(TOOL).replace('select,textarea){font-size:16px}', 'select,textarea){font-size:14px}');
    expect(m).not.toBe(lf(TOOL));
    expect(mobileFieldsProblems(m, lf(CHROME))).toEqual(['polja alata nemaju 16 px na uskom ekranu']);
  });

  it('mutant: .row2 u dva stupca se hvata', () => {
    const m = lf(TOOL).replace('.tool-workspace .row2{grid-template-columns:1fr}', '');
    expect(m).not.toBe(lf(TOOL));
    expect(mobileFieldsProblems(m, lf(CHROME))).toEqual(['.row2 ostaje u dva stupca na uskom ekranu']);
  });

  it('mutant: pravne poveznice opet 24 px se hvata', () => {
    const m = lf(CHROME).replace('.site-footer__pravno a { min-height: 44px;', '.site-footer__pravno a { min-height: 24px;');
    expect(m).not.toBe(lf(CHROME));
    expect(mobileFieldsProblems(lf(TOOL), m)).toEqual(['pravne poveznice u podnozju nisu mete od 44 px na uskom ekranu']);
  });

  it('mutant: pravne poveznice bez najmanje sirine se hvata (Codex 310-2)', () => {
    const m = lf(CHROME).replace(' min-width: 44px;', '');
    expect(m).not.toBe(lf(CHROME));
    expect(mobileFieldsProblems(lf(TOOL), m)).toEqual(['pravne poveznice u podnozju su uze od 44 px na uskom ekranu']);
  });

  for (const [tip, novo] of [['select', 'textarea){font-size:16px}'], ['textarea', 'select){font-size:16px}']] as const) {
    it(`mutant: pravilo od 16 px bez ${tip} se hvata (Codex 310-3)`, () => {
      const m = lf(TOOL).replace('select,textarea){font-size:16px}', novo);
      expect(m).not.toBe(lf(TOOL));
      expect(mobileFieldsProblems(m, lf(CHROME))).toEqual([`pravilo od 16 px ne obuhvaca ${tip}`]);
    });
  }

  it('mutant: pravilo samo za radni prostor ne obuhvaca ostatak stranice ni karticu Cijela literatura (Codex 310-1)', () => {
    const m = lf(TOOL).replace(':is(main:has(.tool-workspace),#panel-bulk) :is(input', '.tool-workspace :is(input');
    expect(m).not.toBe(lf(TOOL));
    expect(mobileFieldsProblems(m, lf(CHROME))).toEqual(['pravilo od 16 px ne obuhvaca cijeli sadrzaj stranice alata', 'pravilo od 16 px ne obuhvaca karticu Cijela literatura']);
  });

  it('mutant: bez #panel-bulk pravilo gubi specificnost iznad #bulk-input i karticu Cijela literatura', () => {
    const m = lf(TOOL).replace(':is(main:has(.tool-workspace),#panel-bulk) :is(input', ':is(main:has(.tool-workspace)) :is(input');
    expect(m).not.toBe(lf(TOOL));
    expect(mobileFieldsProblems(m, lf(CHROME))).toEqual(['pravilo od 16 px ne obuhvaca karticu Cijela literatura']);
  });

  it('mutant: kasnije pravilo koje poljima vraca 14 px se hvata (Codex 310-3)', () => {
    expect(mobileFieldsProblems(`${lf(TOOL)}\n#panel-bulk textarea{font-size:14px}`, lf(CHROME))).toEqual(['kasnije pravilo vraca poljima slova manja od 16 px']);
  });
});

describe('mutacije: javne adrese izvora (sourceLinkHtml, profile-source-links)', () => {
  it('validator bez provjere razmaka, protokola ili gole domene obara gard', () => {
    // BASELINE: stvarni validator odbija svaku klasu nevaljane adrese, a sourceLinkHtml je ne linka.
    expect(acceptedInvalidUrls(publicSourceUrl)).toEqual([]);
    expect(sourceLinkHtml({ title: 'Upute', url: 'https://x.hr/upute.pdf (opis dokumenta)' })).not.toContain('href=');

    // Mutanti su stvarni validator bez TOCNO jedne provjere, pa svaki obara samo svoju klasu.
    const mutations = {
      razmak: ['/\\s/.test(raw)', 'false'],
      protokol: ["if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;", ''],
      vjerodajnice: ['if (url.username || url.password) return null;', ''],
      gola: ["if (url.pathname === '/' && !url.search) return null;", ''],
    } as const;
    const validator = (bez: keyof typeof mutations) => {
      const [before, after] = mutations[bez];
      expect(publicSourceUrlSource().split(before)).toHaveLength(2);
      return loadPublicSourceUrl((source) => source.replace(before, after));
    };
    expect(acceptedInvalidUrls(loadPublicSourceUrl())).toEqual([]);
    for (const valid of ['https://x.hr/upute.pdf', 'http://x.hr/upute.pdf', 'https://x.hr/?page_id=17']) expect(loadPublicSourceUrl()(valid)).toBe(valid);
    expect(acceptedInvalidUrls(validator('razmak'))).toEqual(['https://x.hr/upute.pdf (opis dokumenta)']);
    expect(acceptedInvalidUrls(validator('protokol'))).toEqual(['javascript:alert(1)', 'ftp://x.hr/upute.pdf']);
    expect(acceptedInvalidUrls(validator('gola'))).toEqual(['https://x.hr/']);
    expect(acceptedInvalidUrls(validator('vjerodajnice'))).toEqual(['https://u:p@x.hr/upute.pdf']);

    // MUTANT gola domena nad stvarnim registrom: poznate gole domene bi se brojale kao ciste adrese.
    const registar = committedSourceAddresses()['source-registry.json'];
    expect(countDocumentUrls(registar, validator('gola'))).toBeGreaterThan(countDocumentUrls(registar));
  });

  it('stari URL s razmakom ili gola domena u podacima obara profile-source-links', () => {
    const files = committedSourceAddresses();
    // BASELINE: commitani podaci su cisti u sve tri datoteke.
    for (const sources of Object.values(files)) expect(findSourceUrlProblems(sources)).toEqual([]);

    // MUTANT 1: vracen stari FESB zapis s imenom clana uz adresu (oblik prije #238).
    const stari = 'https://data.fesb.unist.hr/public/documents/merlin/Dokumentacija_za_izradu_diplomskih_radova.zip (Upute za pisanje diplomskog rada.doc)';
    const registar = files['source-registry.json'].map((s) => (s.label.endsWith(' fesb-upute-diplomski-2017') ? { ...s, url: stari } : s));
    expect(findSourceUrlProblems(registar)).toEqual([`source-registry.json fesb-upute-diplomski-2017: nije javna adresa dokumenta (${stari})`]);

    // MUTANT 2: profilni izvor sveden na golu domenu bez dokumenta.
    const profili = files['verified-profiles.json'];
    const prvi = profili.findIndex((s) => s.url !== undefined);
    const gola = profili.map((s, i) => (i === prvi ? { ...s, url: 'https://www.unidu.hr' } : s));
    expect(findSourceUrlProblems(gola)).toEqual([`${profili[prvi].label}: gola domena bez dokumenta (https://www.unidu.hr)`]);
  });
});

describe('mutacije: T96 svojstva popravka (fast-check), mutant unutar stvarnog applyFixers', () => {
  // Mutant se podmece kao JEDAN fixer u stvarnom lancu: vi.doMock zamijeni alignmentFixer u
  // src/repair/fixers samo za svjeze ucitan apply-fixers (redoslijed, changelog i vrata integriteta
  // ostaju stvarni), a produkcijski fixer se trajno ne mijenja (Codex R6 na #287).
  type XmlParts = { documentXml: string };
  async function repairSMutantom(mutiraj: (documentXml: string) => string): Promise<RepairFn> {
    vi.resetModules();
    vi.doMock('../src/repair/fixers', async (importOriginal) => {
      const orig = await importOriginal<typeof import('../src/repair/fixers')>();
      return {
        ...orig,
        alignmentFixer: (...args: Parameters<typeof orig.alignmentFixer>) => {
          const out = orig.alignmentFixer(...args);
          const parts = out.parts as typeof out.parts & XmlParts;
          const documentXml = mutiraj(parts.documentXml);
          return documentXml === parts.documentXml
            ? out
            : { ...out, applied: true, beforeLabel: out.beforeLabel || 'mutant', afterLabel: out.afterLabel || 'mutant', parts: { ...parts, documentXml } };
        },
      };
    });
    try {
      const { applyFixers: mutiraniApply } = await import('../src/repair/apply-fixers');
      return repairWith(mutiraniApply);
    } finally {
      vi.doUnmock('../src/repair/fixers');
      vi.resetModules();
    }
  }

  // Stvaran kvar koji imitira: fixer koji ne provjerava je li cilj vec postignut, pa svakim
  // prolazom doda razmak na kraj prvog w:t.
  const dodajRazmak = (xml: string) => xml.replace('</w:t>', ' </w:t>');
  // Stvaran kvar koji imitira: idempotentna zamjena znaka u autorskom tekstu (svako 'č' u 'c'; slovo a bi pokvarilo entitet &amp; pa bi ga odbila vrata integriteta).
  // Idempotencija je prolazi, pa je hvata samo svojstvo vidljivog teksta.
  const cUc = (xml: string) => xml.replace(/(<w:t\b[^>]*>)([^<]*)/g, (_m, o: string, t: string) => o + t.replace(/č/g, 'c'));

  it('BASELINE: stvarni recept forme prolazi oba svojstva', async () => {
    expect((await idempotenceProperty(realRepair)).error).toBeNull();
    expect((await visibleTextProperty(realRepair)).error).toBeNull();
  }, 120_000);

  it('BASELINE: identitetski mutant kroz isti mock prolazi oba svojstva (mock sam po sebi ne obara)', async () => {
    const repair = await repairSMutantom((xml) => xml);
    expect((await idempotenceProperty(repair)).error).toBeNull();
    expect((await visibleTextProperty(repair)).error).toBeNull();
  }, 120_000);

  it('mutant: fixer koji svakim prolazom doda razmak obara idempotenciju uz smanjen protuprimjer', async () => {
    const out = await idempotenceProperty(await repairSMutantom(dodajRazmak));
    expect(out.failed).toBe(true);
    expect(out.error).toContain('word/document.xml: drugi prolaz nije no-op');
    expect(out.numShrinks).toBeGreaterThan(0);
    // Smanjen na jedan nositelj teksta: shrinker ostavlja jedan run, a moze ostaviti i prazan odlomak.
    const ce = out.counterexample!;
    expect(ce.paragraphs.flatMap((p) => p.runs)).toHaveLength(1);
    expect(ce.paragraphs.length).toBeLessThanOrEqual(2);
  }, 120_000);

  it('mutant: idempotentna zamjena č u c prolazi idempotenciju, a obara svojstvo vidljivog teksta', async () => {
    const repair = await repairSMutantom(cUc);
    expect((await idempotenceProperty(repair)).error).toBeNull();
    const out = await visibleTextProperty(repair);
    expect(out.failed).toBe(true);
    expect(out.error).toContain('vidljivi tekst promijenjen');
    expect(out.numShrinks).toBeGreaterThan(0);
  }, 120_000);
});

describe('traka privole u toku stranice na mobitelu (mobilni audit 2026-09-28, PR 3)', () => {
  const lf = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r/g, '');
  const izvor = () => ({
    pageApp: lf('src/shared/page-app.css'),
    pageChrome: lf('src/shared/page-chrome.css'),
    toolPage: lf('src/shared/tool-page.css'),
    appTs: lf('src/ui/app.ts'),
  });

  it('BASELINE: obje trake u toku na uskom ekranu, rezerva samo za fiksnu traku', () => {
    expect(mobileConsentProblems(izvor())).toEqual([]);
  });

  it('mutant: /rad/ traka opet fiksna na mobitelu se hvata', () => {
    const s = izvor();
    const m = s.pageApp.replace('.consent-banner{position:static;', '.consent-banner{');
    expect(m).not.toBe(s.pageApp);
    expect(mobileConsentProblems({ ...s, pageApp: m })).toEqual(['/rad/: traka nije u toku na uskom ekranu']);
  });

  it('mutant: alatna traka opet fiksna na mobitelu se hvata', () => {
    const s = izvor();
    const m = s.toolPage.replace('.lekta-consent-banner{position:static;', '.lekta-consent-banner{');
    expect(m).not.toBe(s.toolPage);
    expect(mobileConsentProblems({ ...s, toolPage: m })).toEqual(['alati: traka nije u toku na uskom ekranu']);
  });

  it('mutant: rezerva bez praga sirine se hvata', () => {
    const s = izvor();
    const m = s.pageChrome.replace('@media screen and (width > 720px){body:has(.consent-banner', '@media screen{body:has(.consent-banner');
    expect(m).not.toBe(s.pageChrome);
    expect(mobileConsentProblems({ ...s, pageChrome: m })).toEqual(['rezerva za traku bez praga sirine']);
  });

  it('mutant: inline rezerva i za traku u toku se hvata', () => {
    const s = izvor();
    const m = s.appTs.replace("!skriven&&getComputedStyle(b).position==='fixed'?`${h+34}px`:''", "skriven?'':`${h+34}px`");
    expect(m).not.toBe(s.appTs);
    expect(mobileConsentProblems({ ...s, appTs: m })).toEqual(['inline rezerva ne ovisi o fiksnoj traci']);
  });

  it('mutant: prag min-width:721px ostavlja rupu za frakcijske sirine (Codex R2 na #305)', () => {
    const s = izvor();
    const m = s.toolPage.replace('@media screen and (width > 720px){', '@media screen and (min-width:721px){');
    expect(m).not.toBe(s.toolPage);
    expect(mobileConsentProblems({ ...s, toolPage: m })).toEqual(['rezerva ostavlja rupu izmedju 720 i 721 px']);
  });

  it('mutant: rezerva i na uskom ekranu se hvata', () => {
    const s = izvor();
    const m = s.pageChrome.replace('@media screen and (width > 720px){body:has(.consent-banner', '@media(max-width:720px){body:has(.consent-banner');
    expect(m).not.toBe(s.pageChrome);
    expect(mobileConsentProblems({ ...s, pageChrome: m })).toEqual(['rezerva za traku i na uskom ekranu']);
  });

  it('BASELINE: na 720 / 720,5 / 721 px vrijedi tocno jedno, traka u toku ili rezerva (Codex R2 na #305)', () => {
    expect(consentThresholdProblems(izvor())).toEqual([]);
  });

  it('mutant: min-width:721px ostavlja 720,5 px bez trake u toku i bez rezerve', () => {
    const s = izvor();
    const m = s.toolPage.replace('@media screen and (width > 720px){', '@media screen and (min-width:721px){');
    expect(m).not.toBe(s.toolPage);
    expect(consentThresholdProblems({ ...s, toolPage: m })).toEqual(['alati 720.5 px: ni traka u toku ni rezerva']);
  });

  it('mutant: rezerva od 720 px ukljucivo preklapa traku u toku', () => {
    const s = izvor();
    const m = s.pageChrome.replace('@media screen and (width > 720px){body:has(.consent-banner', '@media screen and (width >= 720px){body:has(.consent-banner');
    expect(m).not.toBe(s.pageChrome);
    expect(consentThresholdProblems({ ...s, pageChrome: m })).toEqual(['/rad/ 720 px: traka u toku i rezerva']);
  });

  it('BASELINE: Postavke privatnosti dovode traku u vidokrug i fokusiraju prvu radnju (Codex R1 na #305)', async () => {
    expect(await consentRevealProblems(consentRevealFromSource())).toEqual([]);
  });

  it('mutant: bez pomaka u vidokrug se hvata', async () => {
    const mod = consentRevealFromSource([["traka.scrollIntoView({ block: 'nearest' });", '']]);
    expect(await consentRevealProblems(mod)).toEqual(['traka nije dovedena u vidokrug']);
  });

  it('mutant: bez fokusa na prvu radnju se hvata', async () => {
    const mod = consentRevealFromSource([['?.focus({ preventScroll: true })', '']]);
    expect(await consentRevealProblems(mod)).toEqual(['prva radnja trake nema fokus']);
  });
});


describe('mutacije: quality izlaz ne prati junction u checkout', () => {
  const src = readFileSync(resolve(process.cwd(), 'scripts/quality/harvest.mjs'), 'utf8').replace(/\r/g, '');
  const start = src.indexOf('function repositoryOutput(');
  const fn = src.slice(start, src.indexOf('\n}\n', start) + 3);
  const external = resolve('quality-external-probe');
  const repo = resolve('quality-repository-probe');
  const alias = resolve('quality-junction-probe');
  const run = (source: string) => new Function('resolve', 'dirname', 'join', 'existsSync', 'realpathSync', 'isInside', 'ROOT', `${source}\nreturn repositoryOutput;`)(
    resolve, dirname, join,
    (p: string) => [external, alias, repo, join(repo, '.git')].includes(p),
    (p: string) => p === alias ? repo : p,
    () => false,
    resolve('quality-current-checkout-probe'),
  ) as (path: string) => boolean;
  it('baseline i mutacija kanonikalizacije imaju isti izlazni ulaz', () => {
    expect(run(fn)(external)).toBe(false);
    expect(run(fn)(join(alias, 'new-reports'))).toBe(true);
    const mutant = fn.replace('ancestor = realpathSync(ancestor);', 'ancestor = resolve(ancestor);');
    expect(mutant).not.toBe(fn);
    expect(run(mutant)(join(alias, 'new-reports'))).toBe(false);
  });
});


describe('mutacije: quality --no-samples ima prednost', () => {
  const src = readFileSync(resolve(process.cwd(), 'scripts/quality/harvest.mjs'), 'utf8').replace(/\r/g, '');
  const start = src.indexOf('function parseArgs(');
  const fn = src.slice(start, src.indexOf('\n}\n', start) + 3);
  const run = (source: string) => new Function(`${source}\nreturn parseArgs;`)() as (argv: string[]) => { samples: boolean };
  it('isti argumenti ostaju privatni samo dok stvarni kod postuje --no-samples', () => {
    const argv = ['--samples', '--no-samples'];
    expect(run(fn)(argv).samples).toBe(false);
    expect(run(fn)(['--samples']).samples).toBe(true);
    const mutant = fn.replace(" && !argv.includes('--no-samples')", '');
    expect(mutant).not.toBe(fn);
    expect(run(mutant)(argv).samples).toBe(true);
  });
});


describe('mutacije: quality necitljive putanje daju djelomicni izvjestaj s brojacem', () => {
  const src = readFileSync(resolve(process.cwd(), 'scripts/quality/harvest.mjs'), 'utf8').replace(/\r/g, '');
  const block = (source: string, start: string): string => {
    const i = source.indexOf(start);
    return source.slice(i, source.indexOf('\n}\n', i) + 3).replace('export ', '');
  };
  const root = join('fixture', '.claude', 'projects');
  const badDir = join(root, 'bad-dir'), badStat = join(root, 'bad-stat.jsonl'), badRead = join(root, 'bad-read.jsonl');
  const clean = (source: string): boolean => {
    const run = new Function('homedir', 'join', 'existsSync', 'readdirSync', 'statSync', 'readFileSync', 'failuresFromLines',
      `${block(source, 'function* walkJsonl(')}\n${block(source, 'export function collectFailures(')}\nreturn collectFailures;`)(
      () => 'fixture', join, () => true,
      (p: string) => { if (p === badDir) throw new Error('synthetic readdir'); return ['good.jsonl', 'bad-dir', 'bad-stat.jsonl', 'bad-read.jsonl']; },
      (p: string) => { if (p === badStat) throw new Error('synthetic stat'); return { isDirectory: () => p === badDir }; },
      (p: string) => { if (p === badRead) throw new Error('synthetic read'); return ''; },
      () => [{ day: '2026-10-04' }],
    ) as (opts: { home: string }) => { stats: { unreadableFiles: number }; failures: unknown[] };
    try { const r = run({ home: 'fixture' }); return r.stats.unreadableFiles === 3 && r.failures.length === 1; }
    catch { return false; }
  };
  it('baseline zadrzava citljiv zapis i broji sva tri tipa kvara', () => { expect(clean(src)).toBe(true); });
  for (const [id, old, mutant] of [
    ['readdir bez oporavka', 'try { entries = readdirSync(dir); } catch { stats.unreadableFiles += 1; return; }', 'entries = readdirSync(dir);'],
    ['stat bez brojenja', 'try { st = statSync(p); } catch { stats.unreadableFiles += 1; continue; }', 'try { st = statSync(p); } catch { continue; }'],
    ['read bez brojenja', "try { text = readFileSync(file, 'utf8'); } catch { stats.unreadableFiles += 1; continue; }", "try { text = readFileSync(file, 'utf8'); } catch { continue; }"],
  ]) {
    it(`quality ${id}: stvarni mutant pada nad istim ulazom`, () => {
      const changed = src.replace(old, mutant);
      expect(changed).not.toBe(src);
      expect(clean(changed)).toBe(false);
    });
  }
});


describe('mutacije: quality datum i konacni izlaz cuvaju checkout', () => {
  const src = readFileSync(resolve(process.cwd(), 'scripts/quality/harvest.mjs'), 'utf8').replace(/\r/g, '');
  const block = (source: string, start: string): string => {
    const i = source.indexOf(start);
    return source.slice(i, source.indexOf('\n}\n', i) + 3);
  };
  it('stvarni kalendarski validator hvata nepostojeci datum, a mutant ga prihvaca', () => {
    const fn = block(src, 'function validDay(');
    const run = (code: string) => new Function(`${code}\nreturn validDay;`)() as (value: unknown) => boolean;
    expect(run(fn)('2024-02-29')).toBe(true);
    for (const value of ['2026-02-30', '../repo/leak', undefined]) expect(run(fn)(value)).toBe(false);
    const changed = fn.replace('day.toISOString().slice(0, 10) === value', 'true');
    expect(changed).not.toBe(fn);
    expect(run(changed)('2026-02-30')).toBe(true);
  });

  const dir = resolve('quality-final-output-probe'), out = join(dir, '2026-10-04.md');
  const run = (source: string, rejectFile: boolean) => {
    const writes: string[] = [], renames: string[] = [];
    const proc: { exitCode?: number; stdout: { write: () => void }; stderr: { write: () => void } } = {
      stdout: { write: () => undefined }, stderr: { write: () => undefined },
    };
    const main = new Function('localDay', 'addDays', 'collectFailures', 'summarize', 'renderMarkdown', 'resolve', 'join', 'homedir', 'repositoryOutput', 'mkdirSync', 'writeFileSync', 'renameSync', 'existsSync', 'unlinkSync', 'randomBytes', 'process',
      `${block(source, 'function parseArgs(')}\n${block(source, 'function validDay(')}\n${block(source, 'function main(')}\nreturn main;`)(
      () => '2026-10-04', (day: string) => day, () => ({ failures: [], stats: {} }), () => ({ clusters: [], dug: [] }), () => 'synthetic',
      resolve, join, () => dir, (p: string) => rejectFile && p === out,
      () => undefined, (p: string) => writes.push(p), (_from: string, to: string) => renames.push(to), () => false, () => undefined,
      () => ({ toString: () => 'synthetic-random' }), proc,
    ) as (argv: string[]) => void;
    main(['--day', '2026-10-04', '--out-dir', dir]);
    return { exit: proc.exitCode, writes, renames };
  };
  it('provjera konacne datoteke odbija poznatu poveznicu u checkout prije pisanja; stvarni mutant pise', () => {
    expect(run(src, true)).toEqual({ exit: 2, writes: [], renames: [] });
    const changed = src.replace('if (repositoryOutput(out)) {', 'if (false) {');
    expect(changed).not.toBe(src);
    expect(run(changed, true).renames).toContain(out);
  });
  it('izlaz se zamjenjuje bez direktnog otvaranja postojeceg unosa; stvarni mutant ga otvara', () => {
    const clean = run(src, false);
    expect(clean.writes).not.toContain(out);
    expect(clean.renames).toEqual([out]);
    const changed = src.replace('renameSync(temporary, out);', "writeFileSync(out, text, 'utf8');");
    expect(changed).not.toBe(src);
    expect(run(changed, false).writes).toContain(out);
  });
});


describe('mutacije: T98 pouzdan identitet, cache i djelomicno povlacenje', () => {
  it('baseline: svaki mehanizam stvarno izvrsen i nema problema', async () => {
    const result = await retractionIdentityProblems(loadVerifyExistence());
    expect(result.problems).toEqual([]);
    for (const n of Object.values(result.mechanisms)) expect(n).toBeGreaterThan(0);
  });
  const mutations = [
    ['naslov', 'title(inp.title) !== title(item.title?.[0])', 'false', '(i)'],
    ['godina', 'Number(year) !== itemYear(item)', 'false', '(i)'],
    ['autor', 'identityText(a.last) === identityText(b.family)', 'true', '(i)'],
    ['dvosmislenost', 'workDois.size === 1', 'workDois.size >= 1', '(b)'],
    ['cache-autora', "(inp.authors || '').trim()", "''", '(k)'],
    ['doi-identitet', 'normalizeDoi(message.DOI).toLowerCase() === doi.toLowerCase()', 'true', '(o)'],
    ['unicode-identitet', "s.normalize('NFC').toLowerCase().replace(/\\s+/gu, ' ').trim()", 'normalize(s)', '(g)'],
    ['unicode-cache', 'JSON.stringify([identityText(inp.title),', 'JSON.stringify([normalize(inp.title),', '(q)'],
    ['djelomicno', "type === 'partial_retraction'", 'false', '(p)'],
  ] as const;
  for (const [id, before, after, label] of mutations) it(`citations/povlacenje-${id}: stvarni izvor pada`, async () => {
    expect(verifyExistenceSource()).toContain(before);
    const result = await retractionIdentityProblems(loadVerifyExistence((s) => s.replace(before, after)));
    expect(result.problems.some((p) => p.startsWith(label)), result.problems.join('; ')).toBe(true);
  });
});


describe('mutacije: T98 stvarno ozicenje UI funkcija', () => {
  it('baseline: stvarni Citat i analizator izvode sve mehanizme', async () => {
    const result = await retractionUiProblems();
    expect(result.problems).toEqual([]);
    for (const n of Object.values(result.mechanisms)) expect(n).toBeGreaterThan(0);
  });
  it('uklonjeno stvarno ciscenje kartice ostavlja stale oznake', async () => {
    const before = 'cards.forEach((c) => clearVerifyBadges(c));';
    expect(citatSource()).toContain(before);
    const result = await retractionUiProblems((s) => s.replace(before, ''));
    expect(result.problems.some((p) => p.startsWith('(c)'))).toBe(true);
  });
  it('uklonjen stvarni prikaz analizatora gubi oznaku', async () => {
    const before = 'cell.innerHTML=existenceCellHtml(res,escapeHtml)';
    expect(analyzerSource()).toContain(before);
    const result = await retractionUiProblems(undefined, (s) => s.replace(before, "cell.innerHTML=''"));
    expect(result.problems.some((p) => p.startsWith('(a)'))).toBe(true);
  });
  it('uklonjen stvarni event payload gubi brojac', async () => {
    const before = "trackEvent('references_existence_checked',existenceEventProps(results))";
    expect(analyzerSource()).toContain(before);
    const result = await retractionUiProblems(undefined, (s) => s.replace(before, "trackEvent('references_existence_checked',{})"));
    expect(result.problems.some((p) => p.startsWith('(e)'))).toBe(true);
  });
});


describe('mutacije: T98 aria-live najavljuje sva upozorenja', () => {
  it('baseline stvarnog izvora najavljuje djelomicno povlacenje i zabrinutost', () => {
    expect(retractionSummaryProblems(loadVerificationSummary())).toEqual([]);
  });
  for (const before of ['if (djelomicnih)', 'if (zabrinutosti)']) it(`uklanjanje ${before} pada`, () => {
    expect(verifyBadgesSource()).toContain(before);
    expect(retractionSummaryProblems(loadVerificationSummary((s) => s.replace(before, 'if (false)'))).length).toBeGreaterThan(0);
  });
});


describe('mutacije: T98 stvarni click binding', () => {
  it('uklonjen stvarni Citat listener ne pokrece provjeru', async () => {
    const before = "$('#bulk-verify')?.addEventListener('click', () => { void verifyBulk(); });";
    expect(citatSource()).toContain(before);
    const result = await retractionUiProblems((s) => s.replace(before, ''));
    expect(result.problems.some((p) => p.startsWith('(c)'))).toBe(true);
  });
  it('uklonjen stvarni onclick analizatora ne pokrece provjeru', async () => {
    const before = 'btn.onclick=()=>{void runExistenceCheck(refs,r)}';
    expect(analyzerSource()).toContain(before);
    const result = await retractionUiProblems(undefined, (s) => s.replace(before, 'btn.onclick=()=>{}'));
    expect(result.problems.some((p) => p.startsWith('(a)'))).toBe(true);
  });
});

describe('mutations: actual verification focus restoration', () => {
  it('baseline restores only lost initial focus', async () => {
    expect(await verificationFocusProblems()).toEqual([]);
  });
  for (const [before, after] of [
    ['!wasFocused || ', ''],
    ['doc.activeElement === doc.body || doc.activeElement === doc.documentElement', 'true'],
    ['button.focus({ preventScroll: true })', 'void 0'],
  ]) it(`actual focus guard removal fails: ${before}`, async () => {
    expect(verifyBadgesSource()).toContain(before);
    expect((await verificationFocusProblems((s) => s.replace(before, after))).length).toBeGreaterThan(0);
  });
});

/**
 * SUPABASE MCP GARD (odluka vlasnika 2026-10-08, popravak po Codex pregledu #327). Mutira se KOPIJA
 * izvora `scripts/agents/tool-guard.mjs` (tests/helpers/supabase-mcp-guard.ts), nikad omotac.
 *  (a) matcher hooka bez MCP alata: presuda se nikad ne pozove (stanje do 2026-10-08);
 *  (b) E-string bez backslash escapea, poziv funkcije bez provjere, nepoznat alat kao citanje i
 *      vise naredbi u jednom upitu: svaki propusta pisanje koje je Codex ili mjerenje nasao.
 */
describe('mutacije: Supabase MCP gard u tool-guard.mjs', () => {
  const settingsText = readTextLf(resolve(process.cwd(), '.claude/settings.json'));
  const settings = JSON.parse(settingsText);
  const izvor = readTextLf(resolve(process.cwd(), 'scripts/agents/tool-guard.mjs'));
  const mutiraj = (from: string, to: string) => {
    const m = izvor.replace(from, to);
    expect(m, from).not.toBe(izvor);
    return m;
  };

  it('BASELINE: stvarna presuda, nemutirana kopija izvora i stvarna registracija su ciste', async () => {
    const { judgeCommand } = await import('../scripts/agents/tool-guard.mjs');
    expect(supabaseMcpGuardProblems(judgeCommand)).toEqual([]);
    expect(supabaseMcpGuardProblemsForSource(izvor)).toEqual([]);
    expect(toolGuardMatcherProblems(settings)).toEqual([]);
  });

  it('mutant: bez registracije mcp__.*[Ss]upabase.* ostali Supabase MCP alati ne stizu do garda', () => {
    // apply_migration i dalje pokriva zasebna registracija `mcp__.*__apply_migration` (PR #326).
    const mutant = JSON.parse(settingsText);
    mutant.hooks.PreToolUse = mutant.hooks.PreToolUse.filter((e: { matcher?: string }) => e.matcher !== 'mcp__.*[Ss]upabase.*');
    expect(mutant.hooks.PreToolUse.length).toBe(settings.hooks.PreToolUse.length - 1);
    expect(toolGuardMatcherProblems(mutant)).toEqual([
      'tool-guard matcher ne pokriva mcp__Supabase__execute_sql',
      'tool-guard matcher ne pokriva mcp__claude_ai_Supabase__deploy_edge_function',
    ]);
  });

  it('mutant: tool-guard samo pod Bash|PowerShell (stanje do 2026-10-08) se hvata', () => {
    const mutant = JSON.parse(settingsText);
    mutant.hooks.PreToolUse = mutant.hooks.PreToolUse.filter((e: { matcher?: string }) => !String(e.matcher ?? '').startsWith('mcp__'));
    expect(toolGuardMatcherProblems(mutant)).toEqual([
      'tool-guard matcher ne pokriva mcp__Supabase__apply_migration',
      'tool-guard matcher ne pokriva mcp__Supabase__execute_sql',
      'tool-guard matcher ne pokriva mcp__claude_ai_Supabase__deploy_edge_function',
    ]);
  });

  it('mutant: E-string bez backslash escapea se hvata', () => {
    const m = mutiraj("if (eString && sql[i] === '\\\\') { i += 2; continue; }", '');
    expect(supabaseMcpGuardProblemsForSource(m)).toEqual([
      'execute_sql E-string s parnim navodnicima skriva update: dobiveno allow=true, ocekivano allow=false',
    ]);
  });

  it('mutant: poziv funkcije bez provjere se hvata', () => {
    const m = mutiraj('if (!SQL_SAFE_CALLS.has(call[1])) return', 'if (false) return');
    expect(supabaseMcpGuardProblemsForSource(m)).toEqual([
      'execute_sql pg_notify (Codex #327, nalaz 2): dobiveno allow=true, ocekivano allow=false',
      'execute_sql pg_advisory_lock: dobiveno allow=true, ocekivano allow=false',
      'execute_sql vlastiti RPC: dobiveno allow=true, ocekivano allow=false',
      'execute_sql funkcija u navodnicima: dobiveno allow=true, ocekivano allow=false',
      'execute_sql set_config: dobiveno allow=true, ocekivano allow=false',
    ]);
  });

  it('mutant: nepoznat Supabase alat kao citanje se hvata', () => {
    const m = mutiraj('if (SUPABASE_MCP_READ_TOOLS.has(name))', 'if (true)');
    const problems = supabaseMcpGuardProblemsForSource(m);
    expect(problems).toContain('create_edge_function_secret (nije na popisu zabrana): dobiveno allow=true, ocekivano allow=false');
    expect(problems).toContain('nepoznat buduci alat: dobiveno allow=true, ocekivano allow=false');
    expect(problems).toContain('deploy_edge_function (konektor): dobiveno allow=true, ocekivano allow=false');
  });

  it('mutant: vise naredbi u jednom upitu se hvata', () => {
    const m = mutiraj("if (body.includes(';')) return 'vise naredbi';", '');
    expect(supabaseMcpGuardProblemsForSource(m)).toEqual([
      'execute_sql dvije naredbe koje citaju: dobiveno allow=true, ocekivano allow=false',
    ]);
  });
});
