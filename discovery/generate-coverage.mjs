/**
 * Discovery generator (DISCOVERY_PIPELINE.md sekcije 5, 6, 7).
 *
 * Iz registara sastavlja coverage universe: rasiri svaki program u celije po vrsti rada,
 * prikaci kandidate izvora po scopeu, izracuna discoveryStatus, provjeri integritet i
 * ispise rupe. Determinizam: generatedAt je konstanta (datum podataka), ne stvarno
 * vrijeme, da je izlaz idempotentan i testabilan (golden-style).
 *
 * Izlaz: discovery/out/{coverage-universe.json, GAPS.md, worklist.md}.
 * Pokretanje: node discovery/generate-coverage.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (rel) => JSON.parse(readFileSync(p(rel), 'utf8'));

const GENERATED_AT = '2026-06-30';

const config = readJson('discovery/config.json');
const universities = readJson('discovery/registries/universities.json');
const faculties = readJson('discovery/registries/faculties.json');
const programs = readJson('discovery/registries/programs.json');
const worktypes = readJson('discovery/registries/worktypes.json');
const candidates = readJson('discovery/registries/source-candidates.json');

const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const universityIds = new Set(universities.map((u) => u.id));
const facultyById = new Map(faculties.map((f) => [f.id, f]));
const worktypesByProgram = new Map();
for (const wt of worktypes) {
  const list = worktypesByProgram.get(wt.programId) || [];
  list.push(wt);
  worktypesByProgram.set(wt.programId, list);
}

/** Vrste rada za program: override iz worktypes registra, inace default po levelu. */
function workTypesFor(program) {
  const override = worktypesByProgram.get(program.id);
  if (override && override.length) return override.map((w) => w.workType);
  return config.defaultWorkTypesByLevel[program.level] || [];
}

/** Kandidati izvora koji pokrivaju celiju (scope = facultyId, programId ili cellId). */
function candidatesFor(program, cellId) {
  return candidates.filter(
    (c) => c.scope === program.facultyId || c.scope === program.id || c.scope === cellId,
  );
}

// --- rasiri celije ----------------------------------------------------------
const cells = [];
const programsWithoutWorktypes = [];
for (const program of programs) {
  const wts = workTypesFor(program);
  if (!wts.length) {
    programsWithoutWorktypes.push(program.id);
    continue;
  }
  for (const workType of wts) {
    const cellId = `${program.id}-${workType}`;
    const cand = candidatesFor(program, cellId);
    const confirmed = cand.filter((c) => c.confirmed);
    cells.push({
      cellId,
      facultyId: program.facultyId,
      programId: program.id,
      programName: program.name,
      level: program.level,
      workType,
      scope: program.scope,
      discoveryStatus: confirmed.length ? 'sources-collected' : 'blocked',
      sourceCandidateIds: cand.map((c) => c.id),
      confirmedSourceIds: confirmed.map((c) => c.id),
    });
  }
}
cells.sort((a, b) => (a.cellId < b.cellId ? -1 : a.cellId > b.cellId ? 1 : 0));

// --- integritet -------------------------------------------------------------
const programIds = new Set(programs.map((x) => x.id));
const orphanCells = cells.filter((c) => !programIds.has(c.programId)).map((c) => c.cellId);
const orphanPrograms = programs
  .filter((x) => !facultyById.has(x.facultyId))
  .map((x) => x.id);
const orphanFaculties = faculties
  .filter((f) => !universityIds.has(f.universityId))
  .map((f) => f.id);

const dupMap = new Map();
for (const prog of programs) {
  const key = `${norm(prog.name)}|${norm(prog.level)}`;
  const list = dupMap.get(key) || [];
  list.push(prog.id);
  dupMap.set(key, list);
}
const duplicatePrograms = [...dupMap.values()].filter((ids) => ids.length > 1);

const programsByFaculty = new Map();
for (const prog of programs) {
  programsByFaculty.set(prog.facultyId, (programsByFaculty.get(prog.facultyId) || 0) + 1);
}
const facultiesWithoutPrograms = faculties
  .filter((f) => !programsByFaculty.get(f.id))
  .map((f) => f.id);

const integrity = {
  orphanCells,
  orphanPrograms,
  orphanFaculties,
  duplicatePrograms,
  programsWithoutWorktypes,
  facultiesWithoutPrograms,
};

// --- klasifikacija fakulteta za worklist ------------------------------------
const cellsByFaculty = new Map();
for (const c of cells) {
  const list = cellsByFaculty.get(c.facultyId) || [];
  list.push(c);
  cellsByFaculty.set(c.facultyId, list);
}

// Spremno za draft: ima bar jednu sources-collected celiju (potvrden snapshotiran izvor).
const readyToDraft = [];
// Harvest backlog: ima enumerirane celije, ali nijedna nema potvrden izvor.
const harvestBacklog = [];
for (const [facultyId, list] of cellsByFaculty) {
  if (list.some((c) => c.discoveryStatus === 'sources-collected')) readyToDraft.push(facultyId);
  else harvestBacklog.push(facultyId);
}
readyToDraft.sort();
harvestBacklog.sort();
// Enumeration backlog: poznati fakulteti bez ijednog enumeriranog programa.
const enumerationBacklog = facultiesWithoutPrograms.slice().sort();

const counts = {
  faculties: faculties.length,
  confirmedFaculties: faculties.filter((f) => f.confirmed).length,
  programs: programs.length,
  cells: cells.length,
  sourcesCollected: cells.filter((c) => c.discoveryStatus === 'sources-collected').length,
  blocked: cells.filter((c) => c.discoveryStatus === 'blocked').length,
};

const universe = {
  meta: {
    generatedAt: GENERATED_AT,
    scopeUniversities: config.scopeUniversities,
    batch: readyToDraft,
    counts,
  },
  cells,
  integrity,
};

mkdirSync(p('discovery/out'), { recursive: true });
writeFileSync(p('discovery/out/coverage-universe.json'), JSON.stringify(universe, null, 2) + '\n');

// --- GAPS.md ----------------------------------------------------------------
const facultyName = (id) => facultyById.get(id)?.name || id;
const lines = [];
lines.push('# Discovery GAPS');
lines.push('');
lines.push(`Generirano: ${GENERATED_AT}. Opseg: ${config.scopeUniversities.join(', ')}.`);
lines.push('');
lines.push(
  `Sazetak: ${counts.cells} celija (${counts.sourcesCollected} sources-collected, ${counts.blocked} blocked), ` +
    `${counts.confirmedFaculties}/${counts.faculties} fakulteta potvrdeno.`,
);
lines.push('');
lines.push('## Blokirane celije (nema potvrdenog snapshotiranog izvora)');
lines.push('');
const blockedCells = cells.filter((c) => c.discoveryStatus === 'blocked');
if (!blockedCells.length) lines.push('Nema blokiranih celija.');
else for (const c of blockedCells) lines.push(`- ${c.cellId} (${facultyName(c.facultyId)})`);
lines.push('');
lines.push('## Harvest backlog (enumerirano, ali bez snapshotiranog izvora)');
lines.push('');
if (!harvestBacklog.length) lines.push('Nema.');
else for (const f of harvestBacklog) lines.push(`- ${f} (${facultyName(f)}): treba snapshotirati sluzbene izvore.`);
lines.push('');
lines.push('## Enumeration backlog (fakultet poznat, programi nisu enumerirani)');
lines.push('');
if (!enumerationBacklog.length) lines.push('Nema.');
else for (const f of enumerationBacklog) lines.push(`- ${f} (${facultyName(f)}): enumeriraj programe, razine i vrste rada.`);
lines.push('');
lines.push('## Integritet');
lines.push('');
lines.push(`- Orphan celije: ${orphanCells.length ? orphanCells.join(', ') : 'nema'}`);
lines.push(`- Orphan programi: ${orphanPrograms.length ? orphanPrograms.join(', ') : 'nema'}`);
lines.push(`- Orphan fakulteti: ${orphanFaculties.length ? orphanFaculties.join(', ') : 'nema'}`);
lines.push(
  `- Duplikati programa: ${duplicatePrograms.length ? duplicatePrograms.map((d) => d.join(' = ')).join('; ') : 'nema'}`,
);
lines.push(`- Programi bez vrsta rada: ${programsWithoutWorktypes.length ? programsWithoutWorktypes.join(', ') : 'nema'}`);
lines.push('');
writeFileSync(p('discovery/out/GAPS.md'), lines.join('\n') + '\n');

// --- worklist.md ------------------------------------------------------------
const wl = [];
wl.push('# Discovery worklist');
wl.push('');
wl.push(`Generirano: ${GENERATED_AT}. Rang je strukturni (nema jos volumena ni platezne spremnosti).`);
wl.push('');
wl.push('## Ovaj batch');
wl.push('');
wl.push('Fakulteti spremni za fan-out draft (imaju potvrden snapshotiran izvor). `/draft-batch` pokrece rule-drafter po fakultetu.');
wl.push('');
if (!readyToDraft.length) wl.push('Nijedan fakultet nije spreman za draft.');
else
  for (const f of readyToDraft) {
    const list = cellsByFaculty.get(f) || [];
    const sc = list.filter((c) => c.discoveryStatus === 'sources-collected').length;
    wl.push(`- ${f} (${facultyName(f)}): ${sc}/${list.length} celija sources-collected. Izvori u data/sources/${f}/.`);
  }
wl.push('');
wl.push('## Harvest backlog (prvo snapshotirati izvore)');
wl.push('');
if (!harvestBacklog.length) wl.push('Nema.');
else for (const f of harvestBacklog) wl.push(`- ${f} (${facultyName(f)}): ${(cellsByFaculty.get(f) || []).length} celija ceka snapshot izvora.`);
wl.push('');
wl.push('## Enumeration backlog (prvo enumerirati programe)');
wl.push('');
if (!enumerationBacklog.length) wl.push('Nema.');
else for (const f of enumerationBacklog) wl.push(`- ${f} (${facultyName(f)})`);
wl.push('');
writeFileSync(p('discovery/out/worklist.md'), wl.join('\n') + '\n');

console.log(
  `Generator gotov: ${counts.cells} celija, ${counts.sourcesCollected} sources-collected, ` +
    `batch [${readyToDraft.join(', ') || '-'}], harvest [${harvestBacklog.join(', ') || '-'}], ` +
    `enumeration backlog ${enumerationBacklog.length} fakulteta.`,
);
