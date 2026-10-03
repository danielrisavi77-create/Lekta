import { existsSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERIFIED_PROFILES_WITH_DRAFTS, LEGAL_DEPARTMENTS_WITH_DRAFTS, loadRepositoryAiEvidenceContext, type RuleEntry, type SourceEntry, type ThesisProfile, type VerificationLedgerEntry } from './lib/ai-evidence-cli';
import { anchorRuleQuotes, validateQuoteAnchorPlan } from '../src/verification/anchor-rule-quotes';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const [profileId, flag] = args;
const write = flag === '--write';
if (args.length < 1 || args.length > 2 || !profileId || !/^[A-Za-z0-9_-]+$/.test(profileId) || (flag && !write)) {
  console.error('Upotreba: npx vite-node scripts/anchor-rule-quotes.mts <profileId> [--write]');
  process.exit(2);
}

function collectJsonFiles(directory: string): string[] {
  try {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? collectJsonFiles(path) : entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
    });
  } catch { return []; }
}

function targetEntries(document: Record<string, unknown>, id: string): RuleEntry[] | null {
  if (document.profileId === id && Array.isArray(document.entries)) return document.entries as RuleEntry[];
  const profiles = document.profiles;
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) return null;
  const entries = (profiles as Record<string, unknown>)[id];
  return Array.isArray(entries) ? entries as RuleEntry[] : null;
}

function locateDraft(id: string): { path: string; text: string; document: Record<string, unknown>; entries: RuleEntry[] } {
  const matches: Array<{ path: string; text: string; document: Record<string, unknown>; entries: RuleEntry[] }> = [];
  for (const path of collectJsonFiles(join(root, 'data', 'profiles'))) {
    if (!relative(root, path).split(sep).includes('drafts')) continue;
    const text = readFileSync(path, 'utf8');
    let document: Record<string, unknown>;
    try { document = JSON.parse(text) as Record<string, unknown>; } catch { continue; }
    if (!document || typeof document !== 'object' || Array.isArray(document)) continue;
    const entries = targetEntries(document, id);
    if (entries) matches.push({ path, text, document, entries });
  }
  if (matches.length !== 1) throw new Error(`${id}: očekivao sam točno jedan draft, pronađeno ${matches.length}.`);
  return matches[0];
}

function writePairSafely(draftPath: string, oldDraft: string, newDraft: string, ledgerPath: string, oldLedger: string, newLedger: string): void {
  if (readFileSync(draftPath, 'utf8') !== oldDraft || readFileSync(ledgerPath, 'utf8') !== oldLedger) {
    throw new Error('Draft ili ledger promijenio se nakon planiranja; upis je otkazan.');
  }
  const suffix = `.quote-anchor-${process.pid}.tmp`;
  const draftTemp = `${draftPath}${suffix}`;
  const ledgerTemp = `${ledgerPath}${suffix}`;
  if (existsSync(draftTemp) || existsSync(ledgerTemp)) throw new Error('Privremena datoteka već postoji.');
  try {
    writeFileSync(draftTemp, newDraft, 'utf8');
    writeFileSync(ledgerTemp, newLedger, 'utf8');
    renameSync(draftTemp, draftPath);
    try { renameSync(ledgerTemp, ledgerPath); }
    catch (error) { writeFileSync(draftPath, oldDraft, 'utf8'); throw error; }
  } finally {
    for (const path of [draftTemp, ledgerTemp]) { try { unlinkSync(path); } catch { /* best effort */ } }
  }
}

async function main(): Promise<void> {
  const runtime = [...VERIFIED_PROFILES_WITH_DRAFTS, ...LEGAL_DEPARTMENTS_WITH_DRAFTS] as ThesisProfile[];
  const found = runtime.find((profile) => profile.id === profileId);
  if (!found) throw new Error(`${profileId}: profil nije u aktivnom registru.`);
  const draft = locateDraft(profileId);
  const profile: ThesisProfile = { ...found, ruleEntries: draft.entries };
  const sources = JSON.parse(readFileSync(join(root, 'data', 'sources', 'source-registry.json'), 'utf8')) as SourceEntry[];
  const context = await loadRepositoryAiEvidenceContext(root, [profile], sources, { targetProfileIds: [profileId] });
  const sourceById = Object.fromEntries(sources.map((source) => [source.id, source]));
  const snapshots = Object.fromEntries(Object.entries(context.gateContext.snapshotTextsBySourceId).map(([id, text]) =>
    [id, { text, sha256: context.gateContext.snapshotHashesBySourceId[id] }],
  ));
  const plan = anchorRuleQuotes(profile, sourceById, snapshots, new Date().toISOString());
  const errors = validateQuoteAnchorPlan(profile, plan, sourceById, snapshots);
  if (errors.length) throw new Error(`Plan sidrenja nije valjan: ${errors.join(', ')}`);
  const counts = Object.fromEntries([...new Set(plan.decisions.map((decision) => decision.code))].map((code) =>
    [code, plan.decisions.filter((decision) => decision.code === code).length],
  ));
  console.log(`${write ? 'UPIS' : 'PROBNI IZRAČUN'} ${profileId}: ${JSON.stringify(counts)}`);
  console.log(`Draft: ${relative(root, draft.path)}; novih ledger događaja: ${plan.ledger.length}`);
  if (!write || !plan.ledger.length) return;

  const ledgerPath = join(root, 'data', 'verification', 'ledger.json');
  const originalLedger = readFileSync(ledgerPath, 'utf8');
  const ledger = JSON.parse(originalLedger) as VerificationLedgerEntry[];
  const ids = new Set(ledger.map((event) => event.id));
  if (plan.ledger.some((event) => ids.has(event.id)) || new Set(plan.ledger.map((event) => event.id)).size !== plan.ledger.length) {
    throw new Error('Kolizija ledger ID-ja; ništa nije upisano.');
  }
  const document = draft.document;
  if (document.profileId === profileId) document.entries = plan.profile.ruleEntries;
  else (document.profiles as Record<string, unknown>)[profileId] = plan.profile.ruleEntries;
  writePairSafely(draft.path, draft.text, `${JSON.stringify(document, null, 2)}\n`, ledgerPath, originalLedger,
    `${JSON.stringify([...ledger, ...plan.ledger], null, 2)}\n`);
  console.log('Draft i append-only ledger upisani; status pravila zabilježen prema vrsti potvrde.');
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
