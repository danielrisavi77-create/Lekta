import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VerificationLedgerEntry } from '../src/profiles/profile-schema';
import { VERIFIED_PROFILES_WITH_DRAFTS, LEGAL_DEPARTMENTS_WITH_DRAFTS } from '../src/profiles/drafts-runtime';
import { formatAiLedgerReconciliationPreview, planAiLedgerReconciliation } from '../src/verification/reconcile-ai-ledger';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [profileId, mode] = process.argv.slice(2);
if (!profileId || !/^[A-Za-z0-9_-]+$/.test(profileId) || (mode && mode !== '--write') || process.argv.length > 4) {
  console.error('Upotreba: npx vite-node scripts/reconcile-ai-ledger.mts <profileId> [--write]');
  process.exit(2);
}
const profile = [...VERIFIED_PROFILES_WITH_DRAFTS, ...LEGAL_DEPARTMENTS_WITH_DRAFTS]
  .find((item) => item.id === profileId);
if (!profile) throw new Error(`${profileId}: profil nije u aktivnom registru.`);
const path = join(root, 'data', 'verification', 'ledger.json');
const original = readFileSync(path, 'utf8');
const ledger = JSON.parse(original) as VerificationLedgerEntry[];
const corrections = planAiLedgerReconciliation(profileId, profile.ruleEntries ?? [], ledger, new Date().toISOString());
console.log(`${profileId}: ${corrections.length} append-only korekcija`);
for (const entry of corrections) {
  console.log(formatAiLedgerReconciliationPreview(entry, ledger, profile.ruleEntries ?? []));
}
if (mode === '--write' && corrections.length) {
  if (readFileSync(path, 'utf8') !== original) throw new Error('Ledger se promijenio tijekom planiranja; upis otkazan.');
  const temp = `${path}.reconcile-${process.pid}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify([...ledger, ...corrections], null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    renameSync(temp, path);
  } finally {
    try { unlinkSync(temp); } catch { /* rename removed it */ }
  }
  console.log('Korekcije su dodane u ledger; postojeći događaji nisu mijenjani.');
} else if (mode !== '--write') {
  console.log('Suhi prolaz; nije zapisano.');
}
