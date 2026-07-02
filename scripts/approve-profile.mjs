/**
 * Ljudsko potvrdjivanje (audit) scored pravila po profilu preko CIJELOG porta.
 *
 * Zatvara petlju za fakultete (postojeci apply-verification/ai-batch-approve su samo
 * pravo/law-drafts). Za dani profil pronalazi njegov draft (agregirani <fac>.json ili
 * fan-out) i sva scored pravila koja su masovno odobrena (verifiedBy=owner-bulk-approval)
 * prebacuje na verifiedBy=<approver> uz confirmedVia=human-audit i lastVerified, te dopisuje
 * ledger zapis (action human-verified, distinktan id da ne kolidira s originalnim bulk
 * verified zapisom). Opcionalno checkId-jeve koje covjek OBORI postavlja u needs-recheck.
 *
 * COVJEK je odgovoran: pokreni tek NAKON sto si u dosjeu (data/verification/dossiers/<id>.md)
 * provjerio svako pravilo protiv izvora na lokatoru. Skripta ne cita izvor niti sto potvrdjuje
 * sama; samo biljezi tvoju potvrdu.
 *
 * Pokretanje:
 *   node scripts/approve-profile.mjs <profileId> "<approver>" [checkIds] [--flag <checkIds>] [--dry]
 *     checkIds  : zarezom odvojeni checkId-jevi za potvrdu; izostavljeno = SVI bulk-scored u profilu
 *     --flag    : checkId-jevi koje si oborio -> needs-recheck (ne boduju se dok se ne isprave)
 *     --dry     : samo ispis, bez izmjene datoteka
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (rel) => JSON.parse(readFileSync(p(rel), 'utf8'));

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const flagIdx = argv.indexOf('--flag');
const flagCheckIds = flagIdx >= 0 ? (argv[flagIdx + 1] || '').split(',').filter(Boolean) : [];
const positional = argv.filter((a, i) => a !== '--dry' && a !== '--flag' && (flagIdx < 0 || i !== flagIdx + 1));
const [profileId, approver, checkIdsArg] = positional;

if (!profileId || !approver) {
  console.error('Upotreba: node scripts/approve-profile.mjs <profileId> "<approver>" [checkIds] [--flag <checkIds>] [--dry]');
  process.exit(1);
}
const onlyCheckIds = (checkIdsArg || '').split(',').filter(Boolean);
const NOW = '2026-07-02';
const BULK = 'owner-bulk-approval';
const OFFICIAL = new Set(['binding', 'program-page', 'general']);

const sources = readJson('data/sources/source-registry.json');
const srcById = new Map(sources.map((s) => [s.id, s]));
const snapshotted = (id) => {
  const s = srcById.get(id);
  return !!s && s.snapshotPath != null && s.snapshotHash != null;
};
const isScored = (e) =>
  e.status === 'verified' && OFFICIAL.has(e.authority) && e.sourceId != null &&
  e.sourcePage != null && e.quote != null && snapshotted(e.sourceId);

// --- pronadji draft datoteke koje sadrze ovaj profil ---
function draftFilesFor(pid) {
  const hits = [];
  for (const fac of readdirSync(p('data/profiles/'), { withFileTypes: true })) {
    if (!fac.isDirectory()) continue;
    let files;
    try { files = readdirSync(p(`data/profiles/${fac.name}/drafts/`)); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const rel = `data/profiles/${fac.name}/drafts/${f}`;
      const d = JSON.parse(readFileSync(p(rel), 'utf8'));
      if (d && d.profiles && d.profiles[pid]) hits.push({ rel, d, list: d.profiles[pid] });
      else if (d && d.profileId === pid && d.entries) hits.push({ rel, d, list: d.entries });
    }
  }
  return hits;
}

const files = draftFilesFor(profileId);
if (!files.length) {
  console.error(`Profil "${profileId}" nije nadjen ni u jednom draftu.`);
  process.exit(1);
}

const ledgerPath = p('data/verification/ledger.json');
const ledger = readJson('data/verification/ledger.json');
const ledgerIds = new Set(ledger.map((e) => e.id));

const confirmed = [];
const flagged = [];
const newLedger = [];
let changedFiles = 0;

for (const { rel, d, list } of files) {
  let changed = false;
  for (const e of list) {
    const isTarget = isScored(e) && e.verifiedBy === BULK &&
      (!onlyCheckIds.length || onlyCheckIds.includes(e.checkId)) &&
      !flagCheckIds.includes(e.checkId);
    if (isTarget) {
      confirmed.push(e.ruleId);
      if (!dry) {
        e.verifiedBy = approver;
        e.confirmedVia = 'human-audit';
        e.lastVerified = NOW;
        e.reviewedBy = approver;
        const src = srcById.get(e.sourceId);
        if (src) e.verifiedHash = src.snapshotHash;
        changed = true;
      }
      const id = `led-${e.ruleId}-human-verified-${NOW}`;
      if (!ledgerIds.has(id)) {
        ledgerIds.add(id);
        newLedger.push({
          id, ruleId: e.ruleId, profileId, action: 'human-verified', actor: approver,
          timestamp: NOW, sourceId: e.sourceId, sourcePage: e.sourcePage, quote: e.quote,
          note: `Ljudski audit: potvrdjena vrijednost protiv izvora na lokatoru (bio owner-bulk-approval).`,
        });
      }
      continue;
    }
    if (flagCheckIds.includes(e.checkId) && list.includes(e)) {
      flagged.push(e.ruleId);
      if (!dry) { e.status = 'needs-recheck'; changed = true; }
      const id = `led-${e.ruleId}-rechecked-${NOW}`;
      if (!ledgerIds.has(id)) {
        ledgerIds.add(id);
        newLedger.push({
          id, ruleId: e.ruleId, profileId, action: 'rechecked', actor: approver,
          timestamp: NOW, sourceId: e.sourceId ?? null, sourcePage: e.sourcePage ?? null,
          quote: e.quote ?? null, note: 'Ljudski audit oborio vrijednost; ceka ispravak.',
        });
      }
    }
  }
  if (changed && !dry) { writeFileSync(p(rel), JSON.stringify(d, null, 2) + '\n'); changedFiles++; }
}

if (!dry && newLedger.length) {
  writeFileSync(ledgerPath, JSON.stringify([...ledger, ...newLedger], null, 2) + '\n');
}

console.log(`${dry ? '[DRY] ' : ''}Profil ${profileId} / ${approver}:`);
console.log(`  potvrdjeno (bulk->human): ${confirmed.length}${confirmed.length ? ' [' + confirmed.map((r) => r.split('--')[1]).join(', ') + ']' : ''}`);
if (flagged.length) console.log(`  oboreno (needs-recheck): ${flagged.length} [${flagged.map((r) => r.split('--')[1]).join(', ')}]`);
console.log(`  ledger dodaci: ${newLedger.length}, izmijenjeno datoteka: ${dry ? 0 : changedFiles}`);
if (!dry && (newLedger.length || changedFiles)) {
  console.log('  preracunavam coverage...');
  await import('./recompute-coverage.mjs');
  // manifest brojaci usklageni (self-healing, kao reducer) da idući reducer/diff ne iznenadi
  const manifest = readJson('data/manifest.json');
  const set = (name, val) => { const r = manifest.find((m) => m.name === name); if (r) r.entries = val; };
  set('VERIFICATION_LEDGER', readJson('data/verification/ledger.json').length);
  set('SCORED_COVERAGE', readJson('data/coverage/scored-coverage.json').cells.length);
  writeFileSync(p('data/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
