import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RuleEntry, ThesisProfile } from '../src/profiles/profile-schema';
import type { AiEvidenceExecutionManifest } from '../src/verification/ai-evidence-audit';
import { DETECTOR_CHECK_BY_RULE } from '../src/verification/detector-check-map';
import { installXmlDomParser } from '../src/docx/xml-dom-install';
import { buildDocx } from '../tests/helpers/docx-builder';
import { buildDetectorDocxPair } from './detector-docx-pair';
import { createDetectorExecutionManifest } from './closed-loop-execution-manifest';
import { hashAnalysisSourceTree } from './lib/analysis-source-hash.mjs';

installXmlDomParser(true);
const { analyzeFixture, resolveProfile } = await import('../src/analysis/golden-entry');
const { VERIFIED_PROFILES_WITH_DRAFTS, LEGAL_DEPARTMENTS_WITH_DRAFTS } = await import('../src/profiles/drafts-runtime');
const { compileEffectiveRules } = await import('../src/profiles/rule-compiler');
const { normalizeCheckFlags } = await import('../src/profiles/profile-baseline');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const profileFlag = process.argv.indexOf('--profile');
const profileId = process.argv[profileFlag + 1];
const dryRun = process.argv.includes('--dry-run');
if (profileFlag < 0 || !profileId || !/^[A-Za-z0-9_-]+$/.test(profileId)
  || process.argv.length !== (dryRun ? 5 : 4)) {
  throw new Error('Upotreba: npm run detector-loop -- --profile <profileId> [--dry-run]');
}
const registered = ([...VERIFIED_PROFILES_WITH_DRAFTS, ...LEGAL_DEPARTMENTS_WITH_DRAFTS] as ThesisProfile[])
  .find((profile) => profile.id === profileId);
if (!registered) throw new Error(`${profileId}: profil nije u aktivnom registru.`);

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const runAt = new Date().toISOString();
const command = `npm run detector-loop -- --profile ${profileId}`;
const analysisSourceHash = hashAnalysisSourceTree(root);
const manifests: AiEvidenceExecutionManifest[] = [];
for (const entry of registered.ruleEntries ?? []) {
  if (entry.status === 'retired' || entry.status === 'advisory'
    || (entry.autoFixable === true && entry.fixerId)) continue;
  // Audit a proposed pending rule against its own value, without changing the on-disk profile.
  const proposal = { ...registered, ruleEntries: registered.ruleEntries?.map((candidate) => candidate.ruleId === entry.ruleId
    ? { ...candidate, status: 'verified' as const }
    : candidate) };
  const profile = { ...(resolveProfile(profileId) as Record<string, unknown>),
    ...compileEffectiveRules(proposal) } as Record<string, unknown>;
  normalizeCheckFlags(profile);
  const value = entry.value as { max?: unknown } | null;
  const boundaries: Array<'min' | 'max'> = entry.checkId === 'word-count'
    && value && Number.isInteger(Number(value.max)) && value.max !== undefined
    ? ['min', 'max'] : ['min'];
  for (const boundary of boundaries) {
    const pair = buildDetectorDocxPair(entry, profile, boundary);
    const fallback = buildDocx({ paragraphs: [{ text: 'Sintetički kontrolni dokument.' }] });
    const violatingBytes = pair?.violatingBytes ?? fallback;
    const correctBytes = pair?.correctBytes ?? fallback;
    const checkId = DETECTOR_CHECK_BY_RULE[entry.checkId ?? ''] ?? '';
    let violatingCheck: { id?: string | null; earned?: number; max?: number } | undefined;
    let correctCheck: { id?: string | null; earned?: number; max?: number } | undefined;
    if (pair && checkId) {
      try {
        const bad = await analyzeFixture(new File([violatingBytes], 'violating.docx', { type: DOCX_MIME }), { profileId, profile });
        const good = await analyzeFixture(new File([correctBytes], 'correct.docx', { type: DOCX_MIME }), { profileId, profile });
        violatingCheck = bad.checks.find((check: { id?: string | null }) => check.id === checkId);
        correctCheck = good.checks.find((check: { id?: string | null }) => check.id === checkId);
      } catch (error) {
        console.error(`${entry.ruleId}: analiza nije uspjela: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const manifest = createDetectorExecutionManifest({
      profileId, ruleId: entry.ruleId, ruleCheckId: entry.checkId ?? '', checkId,
      ruleValue: entry.value, analysisSourceHash,
      testId: `detector:${profileId}:${entry.ruleId}:${boundary}`,
      command, ranAt: runAt, violatingInputBytes: violatingBytes, violatingOutputBytes: violatingBytes,
      correctInputBytes: correctBytes, correctOutputBytes: correctBytes, violatingCheck, correctCheck,
    });
    manifests.push(manifest);
    console.log(`${entry.ruleId}:${boundary}: ${manifest.outcome}${manifest.failureReason ? ` (${manifest.failureReason})` : ''}`);
  }
}

const path = join(root, 'data', 'verification', 'closed-loop-manifests', `${profileId}.json`);
const original = existsSync(path) ? readFileSync(path, 'utf8') : null;
const parsed = original ? JSON.parse(original) as { profileId?: string; manifests?: AiEvidenceExecutionManifest[] } : null;
if (parsed && parsed.profileId !== profileId) throw new Error('Postojeća datoteka manifesta pripada drugom profilu.');
const retained = Array.isArray(parsed?.manifests) ? parsed.manifests.filter((manifest) => manifest.kind !== 'detector') : [];
const document = { ...(parsed ?? {}), schemaVersion: 1, generatedAt: runAt, command, profileId,
  manifests: [...retained, ...manifests] };
if (dryRun) {
  console.log(`suhi prolaz: ${manifests.length} detektora; manifest nije zapisan`);
  process.exit(0);
}
mkdirSync(dirname(path), { recursive: true });
const temp = `${path}.detector-${process.pid}.tmp`;
try {
  writeFileSync(temp, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  if ((existsSync(path) ? readFileSync(path, 'utf8') : null) !== original) throw new Error('Manifest se promijenio tijekom izvođenja.');
  renameSync(temp, path);
} finally {
  try { unlinkSync(temp); } catch { /* rename removed it */ }
}
console.log(`zapisano: data/verification/closed-loop-manifests/${profileId}.json (${manifests.length} detektora)`);
