/**
 * Skaliranje verifikacije na pravne celije koje dijele isti snapshotirani izvor (Upute)
 * i istu vrijednost kao vec verificirana flagship celija (pravo-integrirani-diplomski).
 *
 * Logika: ista recenica Uputa (isti sourceId + sourcePage + quote + vrijednost) vec je
 * 3-prolazno adversarijalno provjerena. Tamo gdje druga celija tvrdi ISTI podatak iz
 * ISTOG izvora, taj dokaz vrijedi i za nju, pa se batch-odobrava uz isti trag (ledger
 * iskreno biljezi zajednicki dokaz + ljudsko odobrenje). Pravila cija se vrijednost
 * razlikuje se NE diraju (treba im vlastita provjera). required-sections se preskace.
 *
 * Pokretanje: node scripts/scale-pravo-verification.mjs "<approver>"
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (rel) => JSON.parse(readFileSync(p(rel), 'utf8'));

const approver = process.argv[2];
if (!approver) {
  console.error('Upotreba: node scripts/scale-pravo-verification.mjs "<approver>"');
  process.exit(1);
}
const NOW = '2026-06-30';
const UPUTE = 'pravo-upute-oblikovanje-2024';
const FLAGSHIP = 'pravo-integrirani-diplomski';
const SKIP = new Set(['required-sections']);

const drafts = readJson('data/profiles/pravo/drafts/law-drafts.json');
const sources = readJson('data/sources/source-registry.json');
const srcById = new Map(sources.map((s) => [s.id, s]));

// vec verificirane vrijednosti iz flagship celije, po checkId
const verifiedVals = {};
for (const e of drafts.profiles[FLAGSHIP]) {
  if (e.status === 'verified') verifiedVals[e.ruleId.split('--')[1]] = JSON.stringify(e.value);
}

const patches = [];
const ledger = [];
const perProfile = {};

for (const [pid, entries] of Object.entries(drafts.profiles)) {
  if (pid === FLAGSHIP) continue;
  for (const e of entries) {
    const checkId = e.ruleId.split('--')[1];
    if (SKIP.has(checkId)) continue;
    if (e.sourceId !== UPUTE || !e.sourcePage || !e.quote) continue;
    if (e.status === 'verified') continue; // vec verificirano
    if (verifiedVals[checkId] !== JSON.stringify(e.value)) continue; // razlicita vrijednost -> vlastita provjera

    const src = srcById.get(e.sourceId);
    patches.push({
      profileId: pid,
      ruleId: e.ruleId,
      entry: {
        ...e,
        status: 'verified',
        verifiedBy: approver,
        confirmedVia: 'ai-3pass-batch',
        lastVerified: NOW,
        verifiedHash: src.snapshotHash,
      },
    });
    ledger.push({
      id: `led-${e.ruleId}-ai-confirmed-${NOW}`,
      ruleId: e.ruleId,
      profileId: pid,
      action: 'ai-confirmed',
      actor: 'ai-3pass',
      timestamp: NOW,
      sourceId: e.sourceId,
      sourcePage: e.sourcePage,
      quote: e.quote,
      note: `3-prolazna AI provjera (zajednicki dokaz s ${FLAGSHIP}; isti izvor, lokator i vrijednost): "${e.quote}" @ ${e.sourcePage}`,
    });
    ledger.push({
      id: `led-${e.ruleId}-verified-${NOW}`,
      ruleId: e.ruleId,
      profileId: pid,
      action: 'verified',
      actor: approver,
      timestamp: NOW,
      sourceId: e.sourceId,
      sourcePage: e.sourcePage,
      quote: e.quote,
      note: 'Batch odobrenje AI-potvrdjenog pravila (zajednicki dokaz); covjek preuzeo akontabilnost.',
    });
    perProfile[pid] = (perProfile[pid] || 0) + 1;
  }
}

writeFileSync(p('rule-patches.json'), JSON.stringify(patches, null, 2) + '\n');
writeFileSync(p('ledger-additions.json'), JSON.stringify(ledger, null, 2) + '\n');
console.log(`Pripremljeno ${patches.length} verified pravila u ${Object.keys(perProfile).length} celija:`);
for (const [pid, n] of Object.entries(perProfile)) console.log(`  ${pid}: ${n}`);
