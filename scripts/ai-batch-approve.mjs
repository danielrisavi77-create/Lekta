/**
 * Generira izvoz batch-odobrenja AI-potvrdjenih pravila (opcija C) u oblik koji cita
 * apply-verification.mjs. Covjek je odobravatelj (akontabilnost); trag iskreno biljezi
 * da je citanje radila 3-prolazna AI provjera (confirmedVia ai-3pass-batch, ledger
 * ai-confirmed + verified). Mirror src/verification/verification-actions.ts approveFromAi.
 *
 * Pokretanje: node scripts/ai-batch-approve.mjs <profileId> "<approver>" <verifiedCheckIds> [<flagCheckIds>]
 *   verifiedCheckIds: zarezom odvojeni checkId-jevi jednoglasno potvrdjeni (postaju verified)
 *   flagCheckIds (opcionalno): checkId-jevi koje je AI oborio (postaju needs-recheck)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (rel) => JSON.parse(readFileSync(p(rel), 'utf8'));

const [profileId, approver, verifiedArg, flagArg] = process.argv.slice(2);
if (!profileId || !approver || !verifiedArg) {
  console.error('Upotreba: node scripts/ai-batch-approve.mjs <profileId> "<approver>" <verifiedCheckIds> [<flagCheckIds>]');
  process.exit(1);
}
const NOW = '2026-06-30';
const verifiedCheckIds = verifiedArg.split(',').filter(Boolean);
const flagCheckIds = (flagArg || '').split(',').filter(Boolean);

const drafts = readJson('data/profiles/pravo/drafts/law-drafts.json');
const sources = readJson('data/sources/source-registry.json');
const srcById = new Map(sources.map((s) => [s.id, s]));
const entries = drafts.profiles[profileId] || [];
const findEntry = (checkId) => entries.find((e) => e.ruleId === `${profileId}--${checkId}`);

const patches = [];
const ledger = [];

for (const checkId of verifiedCheckIds) {
  const e = findEntry(checkId);
  if (!e) {
    console.error(`Nema pravila za checkId "${checkId}" u profilu ${profileId}.`);
    process.exit(1);
  }
  const src = srcById.get(e.sourceId);
  const verified = {
    ...e,
    status: 'verified',
    verifiedBy: approver,
    confirmedVia: 'ai-3pass-batch',
    lastVerified: NOW,
    verifiedHash: src.snapshotHash,
  };
  patches.push({ profileId, ruleId: e.ruleId, entry: verified });
  const summary = `extract + quote-check + refute jednoglasno CONFIRM; "${e.quote}" @ ${e.sourcePage}`;
  ledger.push({
    id: `led-${e.ruleId}-ai-confirmed-${NOW}`,
    ruleId: e.ruleId,
    profileId,
    action: 'ai-confirmed',
    actor: 'ai-3pass',
    timestamp: NOW,
    sourceId: e.sourceId,
    sourcePage: e.sourcePage,
    quote: e.quote,
    note: `3-prolazna AI provjera: ${summary}`,
  });
  ledger.push({
    id: `led-${e.ruleId}-verified-${NOW}`,
    ruleId: e.ruleId,
    profileId,
    action: 'verified',
    actor: approver,
    timestamp: NOW,
    sourceId: e.sourceId,
    sourcePage: e.sourcePage,
    quote: e.quote,
    note: 'Batch odobrenje AI-potvrdjenog pravila; covjek preuzeo akontabilnost (confirmedVia ai-3pass-batch).',
  });
}

for (const checkId of flagCheckIds) {
  const e = findEntry(checkId);
  if (!e) continue;
  patches.push({ profileId, ruleId: e.ruleId, entry: { ...e, status: 'needs-recheck' } });
  ledger.push({
    id: `led-${e.ruleId}-rechecked-${NOW}`,
    ruleId: e.ruleId,
    profileId,
    action: 'rechecked',
    actor: 'ai-3pass',
    timestamp: NOW,
    sourceId: e.sourceId,
    sourcePage: e.sourcePage,
    quote: e.quote,
    note: '3-prolazna AI provjera oborila vrijednost; ceka ljudski ispravak (vidi sazetak).',
  });
}

writeFileSync(p('rule-patches.json'), JSON.stringify(patches, null, 2) + '\n');
writeFileSync(p('ledger-additions.json'), JSON.stringify(ledger, null, 2) + '\n');
console.log(`Pripremljeno: ${verifiedCheckIds.length} verified, ${flagCheckIds.length} needs-recheck, ${ledger.length} ledger zapisa.`);
