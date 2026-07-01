/**
 * Preracunava i sprema coverage matricu bodovano-verificiranih pravila
 * (VERIFICATION_PIPELINE.md sekcija 6: "Coverage matrica preracunata i spremljena").
 *
 * Cita zive registre (verified-profiles, legal-departments), staging nacrte
 * (law-drafts) i source registry, te primjenjuje isti izvedeni `scored` uvjet kao
 * src/verification (isRuleScored + snapshotiran izvor). Sprema rezultat u
 * data/coverage/scored-coverage.json. Test (tests/coverage-report.test.ts) preracuna
 * isto preko TS modula i dokazuje da se stored artefakt ne razilazi (drift guard).
 *
 * Pokretanje: node scripts/recompute-coverage.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);

const verified = JSON.parse(readFileSync(p('data/profiles/verified-profiles.json'), 'utf8'));
const legal = JSON.parse(readFileSync(p('data/profiles/legal-departments.json'), 'utf8'));
const sources = JSON.parse(readFileSync(p('data/sources/source-registry.json'), 'utf8'));

// Spoji SVE staging draftove pod data/profiles/<faculty>/drafts/*.json istom
// gap-fill semantikom kao src/profiles/drafts-merge.ts (agregirani autoritativan,
// fan-out popunjava samo profile bez staginga). Inace bi se coverage razisao s TS
// modulom koji cita VERIFIED_PROFILES_WITH_DRAFTS (glob-merge).
const aggregated = [];
const fanout = [];
for (const fac of readdirSync(p('data/profiles/'), { withFileTypes: true })) {
  if (!fac.isDirectory()) continue;
  let files;
  try {
    files = readdirSync(p(`data/profiles/${fac.name}/drafts/`));
  } catch {
    continue;
  }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const data = JSON.parse(readFileSync(p(`data/profiles/${fac.name}/drafts/${f}`), 'utf8'));
    if (data && data.profiles) aggregated.push(data);
    else if (data && data.profileId && data.entries) fanout.push(data);
  }
}
const mergedDrafts = {};
for (const agg of aggregated) {
  for (const [id, entries] of Object.entries(agg.profiles ?? {})) mergedDrafts[id] = entries;
}
const fresh = {};
for (const file of fanout) {
  if (mergedDrafts[file.profileId]) continue; // agregirani staging pobjeduje
  (fresh[file.profileId] ??= []).push(...(file.entries ?? []));
}
for (const [id, entries] of Object.entries(fresh)) {
  const byId = new Map();
  for (const e of entries) byId.set(e.ruleId, e); // dedup po ruleId, zadnji pobjeduje
  mergedDrafts[id] = [...byId.values()];
}

const OFFICIAL = new Set(['binding', 'program-page', 'general']);
const srcById = new Map(sources.map((s) => [s.id, s]));

function isScored(e) {
  if (
    e.status !== 'verified' ||
    !OFFICIAL.has(e.authority) ||
    e.sourceId == null ||
    e.sourcePage == null ||
    e.quote == null
  ) {
    return false;
  }
  const src = srcById.get(e.sourceId);
  return !!src && src.snapshotPath != null && src.snapshotHash != null;
}

function latest(dates) {
  let best = null;
  for (const d of dates) {
    if (!d) continue;
    if (best == null || d > best) best = d;
  }
  return best;
}

const cells = [];
for (const profile of [...verified, ...legal]) {
  const entries = mergedDrafts[profile.id] ?? [];
  if (!entries.length) continue;
  const scored = entries.filter(isScored);
  const machineCheckable = entries.filter((e) => e.machineCheckable).length;
  cells.push({
    profileId: profile.id,
    scored: scored.length,
    machineCheckable,
    advisory: entries.length - scored.length,
    ratio: machineCheckable ? scored.length / machineCheckable : 0,
    lastVerified: latest(scored.map((e) => e.lastVerified)),
  });
}
cells.sort((a, b) => (a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0));

const matrix = { cells, totalScored: cells.reduce((n, c) => n + c.scored, 0) };
writeFileSync(p('data/coverage/scored-coverage.json'), JSON.stringify(matrix, null, 2) + '\n');
console.log(`Coverage preracunat: ${cells.length} celija, ${matrix.totalScored} bodovanih pravila.`);
