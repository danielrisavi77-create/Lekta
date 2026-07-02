/**
 * Generalizirani port fakulteta u produkciju (AGR predlozak -> reusable reducer).
 *
 * Uzima jedan ili vise "port-spec" JSON fileova i idempotentno ih primjenjuje na
 * DIJELJENE datoteke serijski (bez racea): source-registry, verified-profiles, ledger,
 * zagreb-catalog (unit + programi), manifest brojaci. ruleEntries NISU ovdje - oni su
 * fan-out draftovi u data/profiles/<fac>/drafts/<fac>.json (pise ih draft agent, per
 * fakultet, race-free). Coverage se preracunava pozivom recompute-coverage.mjs.
 *
 * Nizovi (sources/profiles/ledger) se dopunjuju APPEND-ONLY (cuva postojeci tekst i
 * formatiranje, ne gazi paralelne izmjene). Katalog i manifest su strukturni (union
 * programa / brojaci) pa se prepisuju - round-trippaju se bez diffa. Zato reduce KORAK
 * pokreni tek kad je radno stablo cisto od tudjih WIP izmjena (provjeri git status).
 *
 * Manifest brojaci se IZVODE iz stvarne duljine datoteka (self-healing, nema delta drifta):
 *   SOURCE_REGISTRY = sources.length, VERIFIED_PROFILE_REGISTRY = verified.length,
 *   VERIFICATION_LEDGER = ledger.length, SCORED_COVERAGE = broj celija iz scored-coverage.json.
 *
 * Idempotentno: sve se preskace po id-u ako vec postoji. Pokretati koliko god puta.
 *
 * Port-spec oblik:
 *   {
 *     "faculty": "fer",
 *     "unit": { "id": "fer", "name": "...", "family": "stem", "status": "partial" },  // opcionalno, samo ako unit ne postoji
 *     "catalogPrograms": ["Diplomski studiji ...", ...],  // faculty-wide program stringovi za union u unit.programs
 *     "sources":  [ { source-registry unos } ],
 *     "profiles": [ { verified-profiles unos } ],
 *     "ledger":   [ { ledger unos } ]
 *   }
 *
 * Pokretanje: node scripts/port-faculty.mjs <spec1.json> [spec2.json ...]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (rel) => JSON.parse(readFileSync(p(rel), 'utf8'));

const specPaths = process.argv.slice(2);
if (!specPaths.length) {
  console.error('Upotreba: node scripts/port-faculty.mjs <spec1.json> [spec2.json ...]');
  process.exit(1);
}

/** Ubaci nove objekte na kraj JSON niza cuvajuci postojeci tekst (bez reformatiranja). */
function appendToJsonArray(rel, newEntries) {
  if (!newEntries.length) return;
  const path = p(rel);
  const text = readFileSync(path, 'utf8');
  const end = text.lastIndexOf(']');
  if (end < 0) throw new Error(`nije JSON niz: ${rel}`);
  const head = text.slice(0, end).replace(/\s+$/, '');
  const tail = text.slice(end);
  const body = newEntries
    .map((e) => JSON.stringify(e, null, 2).split('\n').map((l) => '  ' + l).join('\n'))
    .join(',\n');
  const sep = head.endsWith('[') ? '\n' : ',\n';
  writeFileSync(path, head + sep + body + '\n' + tail);
}

// Postojeci id-evi (za idempotenciju) citaju se iz parsiranih nizova; upis je append-only.
const srcIds = new Set(readJson('data/sources/source-registry.json').map((s) => s.id));
const profIds = new Set(readJson('data/profiles/verified-profiles.json').map((x) => x.id));
const ledIds = new Set(readJson('data/verification/ledger.json').map((l) => l.id));

const catalog = readJson('data/catalog/zagreb-catalog.json');
const manifest = readJson('data/manifest.json');

const newSources = [], newProfiles = [], newLedger = [];
let addedProg = 0;
const summary = [];

for (const path of specPaths) {
  const spec = JSON.parse(readFileSync(path, 'utf8'));
  const fs = { faculty: spec.faculty, sources: 0, profiles: 0, ledger: 0, programs: 0 };

  // --- katalog: institucija (default unizg) + unit + programi (union) ---
  const instId = spec.institution || 'unizg';
  const inst = catalog.find((i) => i.id === instId);
  if (!inst) throw new Error(`katalog nema instituciju ${instId}`);
  inst.units ??= [];
  let unit = inst.units.find((u) => u.id === (spec.unit?.id || spec.faculty));
  if (!unit && spec.unit) {
    unit = { ...spec.unit, programs: [] };
    inst.units.push(unit);
    inst.units.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  if (unit) {
    unit.programs ??= [];
    for (const prog of spec.catalogPrograms ?? []) {
      if (unit.programs.includes(prog)) continue;
      const opciIdx = unit.programs.findIndex((x) => /^Opći/.test(x));
      if (opciIdx >= 0) unit.programs.splice(opciIdx, 0, prog);
      else unit.programs.push(prog);
      addedProg++; fs.programs++;
    }
  }

  for (const s of spec.sources ?? []) {
    if (srcIds.has(s.id)) continue;
    srcIds.add(s.id); newSources.push(s); fs.sources++;
  }
  for (const pr of spec.profiles ?? []) {
    if (profIds.has(pr.id)) continue;
    profIds.add(pr.id); newProfiles.push(pr); fs.profiles++;
  }
  for (const l of spec.ledger ?? []) {
    if (ledIds.has(l.id)) continue;
    ledIds.add(l.id); newLedger.push(l); fs.ledger++;
  }
  summary.push(fs);
}

// --- append-only upis nizova (cuva formatiranje, ne gazi tudje) ---
appendToJsonArray('data/sources/source-registry.json', newSources);
appendToJsonArray('data/profiles/verified-profiles.json', newProfiles);
appendToJsonArray('data/verification/ledger.json', newLedger);

// --- katalog (strukturni union) ---
writeFileSync(p('data/catalog/zagreb-catalog.json'), JSON.stringify(catalog, null, 2) + '\n');

// --- coverage preracun (globa sve fan-out draftove) ---
execFileSync('node', [fileURLToPath(p('scripts/recompute-coverage.mjs'))], { stdio: 'inherit' });
const coverage = readJson('data/coverage/scored-coverage.json');

// --- manifest brojaci izvedeni iz stvarnog stanja (self-healing) ---
const setCount = (name, value) => {
  const row = manifest.find((m) => m.name === name);
  if (!row) throw new Error(`manifest nema ${name}`);
  row.entries = value;
};
setCount('SOURCE_REGISTRY', readJson('data/sources/source-registry.json').length);
setCount('VERIFIED_PROFILE_REGISTRY', readJson('data/profiles/verified-profiles.json').length);
setCount('VERIFICATION_LEDGER', readJson('data/verification/ledger.json').length);
setCount('SCORED_COVERAGE', coverage.cells.length);
writeFileSync(p('data/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log('\n=== port-faculty sazetak ===');
for (const s of summary) {
  console.log(`${s.faculty}: +${s.sources} izvora, +${s.profiles} profila, +${s.ledger} ledger, +${s.programs} programa`);
}
console.log(`Coverage: ${coverage.cells.length} celija, ${coverage.totalScored} bodovanih. Manifest usklađen.`);
