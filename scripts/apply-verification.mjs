/**
 * Primjena izvoza verifikacijske konzole natrag u staging (zatvaranje petlje).
 *
 * Konzola (verification.html) izvozi dvije datoteke:
 *   - rule-patches.json     (zakrpe pravila: [{ profileId, ruleId, entry }])
 *   - ledger-additions.json (ledger dodaci: [VerificationLedgerEntry])
 *
 * Ova skripta ih primjenjuje na data/profiles/pravo/drafts/law-drafts.json (zamjena
 * pravila po ruleId) i data/verification/ledger.json (append idempotentno po id). Time
 * potvrdjeno pravilo postaje verified/scored; gate ga od tada cuva. Pokreni potom
 * recompute-coverage (npm run apply-verification radi oboje).
 *
 * Pokretanje: node scripts/apply-verification.mjs <rule-patches.json> <ledger-additions.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const [patchArg, ledgerArg] = process.argv.slice(2);
if (!patchArg || !ledgerArg) {
  console.error('Upotreba: node scripts/apply-verification.mjs <rule-patches.json> <ledger-additions.json>');
  process.exit(1);
}

const patches = readJson(patchArg);
const additions = readJson(ledgerArg);
const draftsPath = p('data/profiles/pravo/drafts/law-drafts.json');
const ledgerPath = p('data/verification/ledger.json');
const drafts = readJson(draftsPath);
const ledger = readJson(ledgerPath);

// primjena zakrpa (mirror src/verification/apply-verification.ts applyPatches)
const applied = [];
const skipped = [];
for (const patch of patches) {
  const list = drafts.profiles[patch.profileId];
  if (!list) {
    skipped.push(`${patch.ruleId}: profil "${patch.profileId}" nije u stagingu`);
    continue;
  }
  const idx = list.findIndex((e) => e.ruleId === patch.ruleId);
  if (idx === -1) {
    skipped.push(`${patch.ruleId}: pravilo nije u profilu`);
    continue;
  }
  list[idx] = patch.entry;
  applied.push(patch.ruleId);
}

// append ledgera idempotentno po id
const seen = new Set(ledger.map((e) => e.id));
let ledgerAdded = 0;
for (const a of additions) {
  if (seen.has(a.id)) continue;
  ledger.push(a);
  seen.add(a.id);
  ledgerAdded += 1;
}

writeFileSync(draftsPath, JSON.stringify(drafts, null, 2) + '\n');
writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');

console.log(
  `Primijenjeno: ${applied.length} pravila (${applied.join(', ') || '-'}), ` +
    `${ledgerAdded} novih ledger zapisa, ${skipped.length} preskoceno.`,
);
if (skipped.length) console.log('Preskoceno:\n  ' + skipped.join('\n  '));

// preracunaj coverage iz svjeze upisanog staginga
await import('./recompute-coverage.mjs');
