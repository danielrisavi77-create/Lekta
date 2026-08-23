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

const noRulesReasons = JSON.parse(readFileSync(p('data/profiles/no-rules-reasons.json'), 'utf8')).reasons ?? {};

const cells = [];
const nonMachineCheckable = new Map();
for (const profile of [...verified, ...legal]) {
  const entries = mergedDrafts[profile.id] ?? [];
  // Od P2-2 ulaze SVI profili, i oni bez ijednog staging pravila: tiho odsustvo je izgledalo isto
  // kao da profila nema, pa se 24 takva profila nisu vidjela ni u jednom izvjestaju.
  const scored = entries.filter(isScored);
  // Brojnik omjera mora gledati istu populaciju kao nazivnik (samo machineCheckable), inace
  // omjer moze preci 100% kad profil ima vise verificiranih ne-strojnih pravila (npr.
  // citation-style) nego strojno provjerljivih - isti fix kao src/verification/coverage-report.ts.
  const scoredMachineCheckable = scored.filter((e) => e.machineCheckable).length;
  const machineCheckable = entries.filter((e) => e.machineCheckable).length;
  cells.push({
    profileId: profile.id,
    scoredMachineCheckable,
    scoredTotal: scored.length,
    machineCheckable,
    advisory: entries.length - scored.length,
    ratio: machineCheckable ? scoredMachineCheckable / machineCheckable : null,
    // Mora ostati bit-identicno computeCoverageCell u src/verification/coverage-report.ts:
    // razlog koji je covjek POTPISAO nadjacava izvedeno stanje. Prije 2026-08-22 se konzultirao tek
    // kad profil nema nijedan ruleEntry, pa se dokazano stanje ("izvor procitan, ne obvezuje") nije
    // moglo razlikovati od zaostatka ("nitko jos nije pogledao").
    state: scored.length
      ? 'scored'
      : (noRulesReasons[profile.id]?.state ?? (entries.length ? 'advisory-only' : 'no-rules-sourced')),
    lastVerified: latest(scored.map((e) => e.lastVerified)),
  });
  // Razlaganje razlike scoredTotal - scoredMachineCheckable po checkId-u: bez njega su dva
  // broja izgledala kao nepomiren kvar umjesto kao dvije populacije (vidi coverage-report.ts).
  for (const e of scored) {
    if (e.machineCheckable) continue;
    const key = e.checkId ?? '(bez checkId)';
    nonMachineCheckable.set(key, (nonMachineCheckable.get(key) ?? 0) + 1);
  }
}
cells.sort((a, b) => (a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0));

const scoredMachineCheckableTotal = cells.reduce((n, c) => n + c.scoredMachineCheckable, 0);
const scoredTotal = cells.reduce((n, c) => n + c.scoredTotal, 0);
const matrix = {
  cells,
  scoredMachineCheckable: scoredMachineCheckableTotal,
  scoredTotal,
  scoredNonMachineCheckable: scoredTotal - scoredMachineCheckableTotal,
  nonMachineCheckableByCheckId: Object.fromEntries(
    [...nonMachineCheckable].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  ),
};
writeFileSync(p('data/coverage/scored-coverage.json'), JSON.stringify(matrix, null, 2) + '\n');
console.log(
  `Coverage preracunat: ${cells.length} celija, ${matrix.scoredMachineCheckable} bodovanih strojno provjerljivih ` +
    `(${matrix.scoredTotal} ukupno, ${matrix.scoredNonMachineCheckable} ne-strojnih).`,
);

// Profili bez bodovanih pravila su radna lista (P2-2/P2-3), pa se ispisuju imenom, ne samo brojem.
const byState = {};
for (const c of cells) byState[c.state] = (byState[c.state] ?? 0) + 1;
console.log('stanja:', Object.entries(byState).map(([k, n]) => `${k}=${n}`).join(', '));
const needsResearch = cells.filter((c) => c.state === 'no-rules-sourced').map((c) => c.profileId);
const advisoryOnly = cells.filter((c) => c.state === 'advisory-only').map((c) => c.profileId);
const decided = cells.filter((c) => c.state === 'advisory-by-decision').map((c) => c.profileId);
if (needsResearch.length) {
  console.log('');
  console.log(`BEZ IJEDNOG PRAVILA, jos neistrazeno (${needsResearch.length}) - P2-2:`);
  for (const id of needsResearch) console.log(`  ${id}`);
}
if (advisoryOnly.length) {
  console.log('');
  console.log(`PRAVILA POSTOJE, NIJEDNO BODOVANO (${advisoryOnly.length}) - P2-3:`);
  for (const id of advisoryOnly) console.log(`  ${id}`);
}
if (decided.length) {
  console.log('');
  console.log(`PRESUDJENO: izvor procitan, ne obvezuje (${decided.length}) - konacno stanje, NE zaostatak:`);
  for (const id of decided) console.log(`  ${id}`);
}
if (needsResearch.length || advisoryOnly.length) {
  console.log('');
  console.log('Razlog se upisuje u data/profiles/no-rules-reasons.json (potpisuje covjek).');
}
