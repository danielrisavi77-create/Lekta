import { existsSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RuleEntry, SourceEntry, ThesisProfile, VerificationLedgerEntry } from '../src/profiles/profile-schema';
import { VERIFIED_PROFILES_WITH_DRAFTS, LEGAL_DEPARTMENTS_WITH_DRAFTS } from '../src/profiles/drafts-runtime';
import { applyAiEvidenceProfile } from '../src/verification/apply-ai-evidence-profile';
import { prepareAiEvidenceProfilePersistence, type AiEvidenceDraftDocument } from '../src/verification/ai-evidence-profile-storage';
import { loadRepositoryAiEvidenceContext } from './ai-evidence-context-loader';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [profileId, mode] = process.argv.slice(2);
const write = mode === '--write';
if (!profileId || (mode && !write) || !/^[A-Za-z0-9_-]+$/.test(profileId)) {
  console.error('Upotreba: npx vite-node scripts/apply-ai-evidence-profile.mts <profileId> [--write]');
  process.exit(2);
}

function collectJsonFiles(directory: string): string[] {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? collectJsonFiles(path)
      : entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
  });
}

function parseJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function locateDraft(profile: string): { path: string; text: string; document: AiEvidenceDraftDocument; entries: RuleEntry[] } {
  const files = collectJsonFiles(join(root, 'data', 'profiles'));
  const matches: Array<{ path: string; text: string; document: AiEvidenceDraftDocument; entries: RuleEntry[] }> = [];
  for (const path of files) {
    if (!relative(root, path).split(sep).includes('drafts')) continue;
    const text = readFileSync(path, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue;
    const document = parsed as AiEvidenceDraftDocument;
    const profiles = document.profiles;
    const value = document.profileId === profile
      ? document.entries
      : typeof profiles === 'object' && profiles !== null && !Array.isArray(profiles)
        ? (profiles as Record<string, unknown>)[profile]
        : undefined;
    if (Array.isArray(value)) matches.push({ path, text, document, entries: value as RuleEntry[] });
  }
  if (matches.length !== 1) {
    throw new Error(`${profile}: očekivao sam točno jedan profilni draft, pronađeno ${matches.length}.`);
  }
  return matches[0];
}

function writePairSafely(
  draftPath: string,
  originalDraftText: string,
  nextDraftText: string,
  ledgerPath: string,
  originalLedgerText: string,
  nextLedgerText: string,
): void {
  if (readFileSync(draftPath, 'utf8') !== originalDraftText || readFileSync(ledgerPath, 'utf8') !== originalLedgerText) {
    throw new Error('Draft ili ledger promijenio se nakon audita; upis je otkazan bez izmjena.');
  }
  const suffix = `.ai-evidence-${process.pid}.tmp`;
  const draftTemp = `${draftPath}${suffix}`;
  const ledgerTemp = `${ledgerPath}${suffix}`;
  if (existsSync(draftTemp) || existsSync(ledgerTemp)) throw new Error('Privremeni upisni naziv već postoji; ništa nije zapisano.');
  try {
    writeFileSync(draftTemp, nextDraftText, 'utf8');
    writeFileSync(ledgerTemp, nextLedgerText, 'utf8');
    renameSync(draftTemp, draftPath);
    try {
      renameSync(ledgerTemp, ledgerPath);
    } catch (error) {
      writeFileSync(draftPath, originalDraftText, 'utf8');
      throw error;
    }
  } finally {
    for (const path of [draftTemp, ledgerTemp]) {
      try { unlinkSync(path); } catch { /* temp cleanup best-effort */ }
    }
  }
}

async function main(): Promise<void> {
  const registered = [...VERIFIED_PROFILES_WITH_DRAFTS, ...LEGAL_DEPARTMENTS_WITH_DRAFTS] as ThesisProfile[];
  const runtimeProfile = registered.find((profile) => profile.id === profileId);
  if (!runtimeProfile) throw new Error(`${profileId}: profil nije u aktivnom registru.`);

  const draft = locateDraft(profileId);
  const profile: ThesisProfile = { ...runtimeProfile, ruleEntries: draft.entries };
  const sourcesText = readFileSync(join(root, 'data', 'sources', 'source-registry.json'), 'utf8');
  const sources = JSON.parse(sourcesText) as SourceEntry[];
  const context = await loadRepositoryAiEvidenceContext(root, [profile], sources, { targetProfileIds: [profileId] });
  const now = new Date().toISOString().slice(0, 10);
  const application = applyAiEvidenceProfile(profile, {
    now,
    sourcesById: Object.fromEntries(sources.map((source) => [source.id, source])),
    snapshotBytesBySourceId: context.gateContext.snapshotBytesBySourceId,
    snapshotTextsBySourceId: context.gateContext.snapshotTextsBySourceId,
    snapshotHashesBySourceId: context.gateContext.snapshotHashesBySourceId,
    currentRepairSourceHash: context.gateContext.currentRepairSourceHash,
    ruleValueHashesByRule: context.gateContext.ruleValueHashesByRule,
    manifestsById: context.gateContext.manifestsById,
  });
  if (!application.ok) throw new Error(application.errors.join('\n'));

  const ledgerPath = join(root, 'data', 'verification', 'ledger.json');
  const originalLedgerText = readFileSync(ledgerPath, 'utf8');
  const currentLedger = JSON.parse(originalLedgerText) as VerificationLedgerEntry[];
  const priorAiEvents = currentLedger.filter((event) => event.profileId === profileId && event.action === 'ai-confirmed');
  const confirmedRuleIds = new Set(application.profile.ruleEntries
    ?.filter((entry) => entry.confirmedVia === 'ai-evidence-audit')
    .map((entry) => entry.ruleId));
  const orphanEvents = priorAiEvents.filter((event) => !confirmedRuleIds.has(event.ruleId));
  if (orphanEvents.length) {
    throw new Error(`${profileId}: postoje ${orphanEvents.length} AI-confirmed ledger događaji bez odgovarajućeg dokaznog pravila; prvo ih razriješi append-only korekcijom.`);
  }

  const plan = prepareAiEvidenceProfilePersistence(draft.document, application.profile, currentLedger, application.ledger);
  if (!plan.ok) throw new Error(plan.errors.join('\n'));

  const nextDraftText = `${JSON.stringify(plan.draftDocument, null, 2)}\n`;
  const nextLedgerText = `${JSON.stringify(plan.ledger, null, 2)}\n`;
  console.log(`${write ? 'UPIS' : 'PROBNI IZRAČUN'} ${profileId}: ${plan.updatedRuleIds.length} bodovanih pravila; ${plan.addedLedgerIds.length} novi ledger događaji.`);
  console.log(`Draft: ${relative(root, draft.path)}`);
  if (!write) {
    console.log('Nije zapisano. Za potvrđeni upis ponovi s --write.');
    return;
  }
  writePairSafely(draft.path, draft.text, nextDraftText, ledgerPath, originalLedgerText, nextLedgerText);
  console.log('Profilni draft i append-only ledger upisani. Generirane projekcije nisu mijenjane.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
