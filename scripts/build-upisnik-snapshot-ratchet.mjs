import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const file = read('data/programs/upisnik-profile-decisions.json');
const registered = new Set(read('data/sources/source-registry.json').map((s) => s.url));
const entries = [
  ...file.decisions.map((r) => ({ programCode: r.programCode, kind: 'decision', sourceUrl: r.evidence.sourceUrl })),
  ...(file.integratedGraduateCoverage ?? []).map((r) => ({ programCode: r.programCode, kind: 'decision', sourceUrl: r.evidence.sourceUrl })),
  ...file.exclusions.map((r) => ({ programCode: r.programCode, kind: 'exclusion', sourceUrl: r.evidence.sourceUrl })),
].filter((e) => !registered.has(e.sourceUrl))
  .sort((a, b) => a.kind.localeCompare(b.kind) || Number(a.programCode) - Number(b.programCode) || a.sourceUrl.localeCompare(b.sourceUrl));
const baseline = read('tests/fixtures/upisnik-snapshot-ratchet-baseline.json');
const baselineKeys = new Set(baseline.entries.map((e) => JSON.stringify([e.programCode, e.kind, e.sourceUrl])));
for (const entry of entries) if (!baselineKeys.has(JSON.stringify([entry.programCode, entry.kind, entry.sourceUrl])))
  throw new Error(`ratchet zapis izvan zamrznute osnovice: ${entry.kind} ${entry.programCode} ${entry.sourceUrl}`);
if (entries.length > 380) throw new Error(`ratchet prelazi strop 380: ${entries.length}`);
writeFileSync(new URL('data/programs/upisnik-evidence-snapshot-ratchet.json', root), `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`, 'utf8');
console.log(`Upisnik snapshot ratchet: ${entries.length}`);
