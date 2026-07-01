/**
 * Discovery ingest (DISCOVERY_PIPELINE.md sekcija 3, korak 1; sekcija 11 acceptance).
 *
 * Seeda discovery registre iz POSTOJECEG v2.x data/** (catalog, coverage matrica, source
 * registry). Ne prepisuje rucno i ne izmislja. Faithfully preslikava sto vec znamo:
 *   - universities: u opsegu je Sveucilište u Zagrebu (unizg).
 *   - faculties: svi unizg fakulteti iz kataloga; confirmed:true samo za one za koje
 *     coverage matrica nosi sluzbeni URL (FPZG, Pravo). Ostali su poznati, ali nepotvrdeni.
 *   - programs: enumerirani programi iz coverage matrice (imaju level i izvor). Fakulteti
 *     bez enumeriranih programa idu u enumeration backlog (GAPS).
 *   - worktypes: override po programu iz expectedWorkTypes matrice.
 *   - source-candidates: iz source registryja; confirmed:true samo ako je snapshotiran
 *     (PDF plus hash). URL-ovi programa iz matrice su program-page kandidati confirmed:false.
 *
 * Idempotentno: ponovno pokretanje daje isti rezultat. Nista nije live ni verificirano.
 * Pokretanje: node discovery/ingest.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (rel) => JSON.parse(readFileSync(p(rel), 'utf8'));
const writeJson = (rel, data) => writeFileSync(p(rel), JSON.stringify(data, null, 2) + '\n');

const catalog = readJson('data/catalog/zagreb-catalog.json');
const matrix = readJson('data/coverage/institutional-coverage-matrix.json');
const sourceRegistry = readJson('data/sources/source-registry.json');

const SCOPE_UNIVERSITY = 'unizg';
const INGEST_DATE = '2026-06-30';

mkdirSync(p('discovery/registries'), { recursive: true });

// --- universities -----------------------------------------------------------
const unizg = catalog.find((c) => c.id === SCOPE_UNIVERSITY);
if (!unizg) throw new Error('Catalog nema unizg; ingest prekinut.');
const universities = [
  {
    id: 'unizg',
    name: unizg.name,
    url: 'https://www.unizg.hr/',
    confirmed: true,
    fetchedAt: INGEST_DATE,
  },
];

// --- faculties --------------------------------------------------------------
// Svi unizg fakulteti iz kataloga; confirmed + URL samo za one u coverage matrici.
const matrixInstitutions = matrix.institutions || {};
const faculties = unizg.units.map((unit) => {
  const inst = matrixInstitutions[unit.id];
  return {
    id: unit.id,
    universityId: 'unizg',
    name: unit.name,
    abbrev: unit.id,
    url: inst ? inst.source : null,
    confirmed: !!inst,
    fetchedAt: inst ? matrix.verifiedAt : null,
  };
});

// --- programs i worktypes ---------------------------------------------------
// Iz coverage matrice: samo enumerirani programi (imaju level i izvor).
const programs = [];
const worktypes = [];
for (const prog of matrix.programs || []) {
  programs.push({
    id: prog.id,
    facultyId: prog.unitId,
    unitId: null,
    name: prog.name,
    level: prog.level,
    scope: prog.scope,
    confirmed: true,
    source: prog.source,
    fetchedAt: matrix.verifiedAt,
  });
  for (const wt of prog.expectedWorkTypes || []) {
    worktypes.push({
      id: `${prog.id}-${wt}`,
      programId: prog.id,
      workType: wt,
      documentType: wt,
      note: prog.note || undefined,
    });
  }
}

// --- source-candidates ------------------------------------------------------
// Iz source registryja: scope = facultyId iz prefiksa id-a; confirmed = snapshotiran.
function facultyOfSourceId(id) {
  const prefix = id.split('-')[0];
  return faculties.some((f) => f.id === prefix) ? prefix : null;
}
const sourceCandidates = sourceRegistry.map((s) => ({
  id: s.id,
  scope: facultyOfSourceId(s.id) || 'unizg',
  scopeKind: 'facultyId',
  kind: s.kind,
  title: s.title,
  url: s.url,
  fetchedAt: s.fetchedAt,
  snapshotPath: s.snapshotPath,
  snapshotHash: s.snapshotHash,
  validityClass: s.validityClass,
  confirmed: s.snapshotPath != null && s.snapshotHash != null,
}));

// Program-page kandidati iz URL-ova programa (confirmed:false, jos nesnapshotirani),
// deduplicirano po URL-u, da se ne izgubi trag gdje sluzbena pravila zive.
const seenUrls = new Set(sourceCandidates.map((c) => c.url));
for (const prog of programs) {
  if (!prog.source || seenUrls.has(prog.source)) continue;
  seenUrls.add(prog.source);
  sourceCandidates.push({
    id: `cand-${prog.facultyId}-program-page`,
    scope: prog.facultyId,
    scopeKind: 'facultyId',
    kind: 'program-page',
    title: `Stranica studija (${prog.facultyId})`,
    url: prog.source,
    fetchedAt: null,
    snapshotPath: null,
    snapshotHash: null,
    validityClass: 'volatile',
    confirmed: false,
  });
}

writeJson('discovery/registries/universities.json', universities);
writeJson('discovery/registries/faculties.json', faculties);
writeJson('discovery/registries/units.json', []);
writeJson('discovery/registries/programs.json', programs);
writeJson('discovery/registries/worktypes.json', worktypes);
writeJson('discovery/registries/source-candidates.json', sourceCandidates);

console.log(
  `Ingest gotov: ${universities.length} sveucilište, ${faculties.length} fakulteta ` +
    `(${faculties.filter((f) => f.confirmed).length} potvrdeno), ${programs.length} programa, ` +
    `${worktypes.length} vrsta rada, ${sourceCandidates.length} kandidata izvora ` +
    `(${sourceCandidates.filter((c) => c.confirmed).length} potvrdeno/snapshotirano).`,
);
