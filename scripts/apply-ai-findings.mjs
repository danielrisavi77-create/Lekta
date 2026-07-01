/**
 * Pretvara nalaze AI provjere u izvoz za apply-verification (rule-patches + ledger).
 *
 * Generalno: ulazni JSON je polje nalaza, svaki { profileId, checkId, decision, quote?,
 * sourcePage?, confirmedVia?, note? }. Za decision 'verified' popuni quote/sourcePage u
 * postojecem draftu (vrijednost ostaje), postavi verified + verifiedBy + confirmedVia +
 * verifiedHash + lastVerified, i upise dva ledger zapisa (ai potvrda + ljudsko odobrenje).
 * Za 'needs-recheck' samo flagira (vrijednost i ostalo netaknuto) uz ledger zapis.
 *
 * Honesty: confirmedVia i ledger note iz nalaza tocno opisuju rigor (npr. ai-1pass-batch
 * za jedan adversarijalni prolaz, ai-3pass-batch za tri). Covjek je odobravatelj.
 *
 * Pokretanje: node scripts/apply-ai-findings.mjs <findings.json> "<approver>"
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (rel) => JSON.parse(readFileSync(rel, 'utf8'));

const [findingsPath, approver] = process.argv.slice(2);
if (!findingsPath || !approver) {
  console.error('Upotreba: node scripts/apply-ai-findings.mjs <findings.json> "<approver>"');
  process.exit(1);
}
const NOW = '2026-06-30';

const findings = readJson(findingsPath);
const drafts = JSON.parse(readFileSync(p('data/profiles/pravo/drafts/law-drafts.json'), 'utf8'));
const sources = JSON.parse(readFileSync(p('data/sources/source-registry.json'), 'utf8'));
const srcById = new Map(sources.map((s) => [s.id, s]));

const patches = [];
const ledger = [];
const skipped = [];

for (const f of findings) {
  const entries = drafts.profiles[f.profileId] || [];
  const ruleId = `${f.profileId}--${f.checkId}`;
  const e = entries.find((x) => x.ruleId === ruleId);
  if (!e) {
    skipped.push(`${ruleId}: nema u stagingu`);
    continue;
  }

  if (f.decision === 'verified') {
    const src = srcById.get(e.sourceId);
    if (!src || !src.snapshotHash) {
      skipped.push(`${ruleId}: izvor nije snapshotiran`);
      continue;
    }
    patches.push({
      profileId: f.profileId,
      ruleId,
      entry: {
        ...e,
        sourcePage: f.sourcePage,
        quote: f.quote,
        status: 'verified',
        verifiedBy: approver,
        confirmedVia: f.confirmedVia || 'ai-1pass-batch',
        lastVerified: NOW,
        verifiedHash: src.snapshotHash,
      },
    });
    ledger.push({
      id: `led-${ruleId}-ai-confirmed-${NOW}`,
      ruleId,
      profileId: f.profileId,
      action: 'ai-confirmed',
      actor: 'ai-1pass',
      timestamp: NOW,
      sourceId: e.sourceId,
      sourcePage: f.sourcePage,
      quote: f.quote,
      note: f.note || 'AI adversarijalna provjera potvrdila vrijednost u izvoru.',
    });
    ledger.push({
      id: `led-${ruleId}-verified-${NOW}`,
      ruleId,
      profileId: f.profileId,
      action: 'verified',
      actor: approver,
      timestamp: NOW,
      sourceId: e.sourceId,
      sourcePage: f.sourcePage,
      quote: f.quote,
      note: 'Batch odobrenje AI-potvrdjenog pravila; covjek preuzeo akontabilnost.',
    });
  } else if (f.decision === 'needs-recheck') {
    patches.push({ profileId: f.profileId, ruleId, entry: { ...e, status: 'needs-recheck' } });
    ledger.push({
      id: `led-${ruleId}-rechecked-${NOW}`,
      ruleId,
      profileId: f.profileId,
      action: 'rechecked',
      actor: 'ai-1pass',
      timestamp: NOW,
      sourceId: e.sourceId,
      sourcePage: e.sourcePage,
      quote: e.quote,
      note: f.note || 'AI provjera oborila vrijednost; ceka ljudski ispravak.',
    });
  }
}

writeFileSync(p('rule-patches.json'), JSON.stringify(patches, null, 2) + '\n');
writeFileSync(p('ledger-additions.json'), JSON.stringify(ledger, null, 2) + '\n');
console.log(`Pripremljeno: ${patches.length} zakrpa, ${ledger.length} ledger zapisa, ${skipped.length} preskoceno.`);
if (skipped.length) console.log('  ' + skipped.join('\n  '));
