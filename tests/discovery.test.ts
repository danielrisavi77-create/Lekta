import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import universe from '../discovery/out/coverage-universe.json';
import faculties from '../discovery/registries/faculties.json';
import programs from '../discovery/registries/programs.json';
import universities from '../discovery/registries/universities.json';
import candidates from '../discovery/registries/source-candidates.json';

const facultyIds = new Set(faculties.map((f) => f.id));
const programIds = new Set(programs.map((p) => p.id));
const universityIds = new Set(universities.map((u) => u.id));

function readDoc(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

describe('discovery registri: integritet', () => {
  it('nema orphana (program -> fakultet -> sveucilište)', () => {
    for (const p of programs) expect(facultyIds.has(p.facultyId)).toBe(true);
    for (const f of faculties) expect(universityIds.has(f.universityId)).toBe(true);
  });

  it('integrity izvjestaj u universeu je cist', () => {
    const i = universe.integrity;
    expect(i.orphanCells).toEqual([]);
    expect(i.orphanPrograms).toEqual([]);
    expect(i.orphanFaculties).toEqual([]);
    expect(i.duplicatePrograms).toEqual([]);
    expect(i.programsWithoutWorktypes).toEqual([]);
  });

  it('potvrden snapshotiran kandidat postoji (Pravo Upute pod data/sources/pravo/)', () => {
    const confirmed = candidates.filter((c) => c.confirmed);
    expect(confirmed.length).toBeGreaterThan(0);
    const upute = candidates.find((c) => c.id === 'pravo-upute-oblikovanje-2024');
    expect(upute?.confirmed).toBe(true);
    expect(upute?.snapshotPath).toContain('data/sources/pravo/');
  });
});

describe('coverage universe: celije i statusi', () => {
  it('svaka celija vodi do programa i ima valjan status', () => {
    expect(universe.cells.length).toBeGreaterThan(0);
    for (const c of universe.cells) {
      expect(programIds.has(c.programId)).toBe(true);
      expect(['blocked', 'sources-collected']).toContain(c.discoveryStatus);
    }
  });

  it('Pravo celije su sources-collected, FPZG celije blocked', () => {
    const pravo = universe.cells.filter((c) => c.facultyId === 'pravo');
    const fpzg = universe.cells.filter((c) => c.facultyId === 'fpzg');
    expect(pravo.length).toBeGreaterThan(0);
    expect(fpzg.length).toBeGreaterThan(0);
    for (const c of pravo) expect(c.discoveryStatus).toBe('sources-collected');
    for (const c of fpzg) expect(c.discoveryStatus).toBe('blocked');
  });

  it('counts se slazu s celijama', () => {
    const sc = universe.cells.filter((c) => c.discoveryStatus === 'sources-collected').length;
    const blocked = universe.cells.filter((c) => c.discoveryStatus === 'blocked').length;
    expect(universe.meta.counts.cells).toBe(universe.cells.length);
    expect(universe.meta.counts.sourcesCollected).toBe(sc);
    expect(universe.meta.counts.blocked).toBe(blocked);
  });

  it('batch sadrzi samo fakultete s potvrdenim izvorom (pravo, ne fpzg)', () => {
    expect(universe.meta.batch).toContain('pravo');
    expect(universe.meta.batch).not.toContain('fpzg');
  });
});

describe('discovery artefakti: GAPS i worklist', () => {
  it('worklist ima sekciju "Ovaj batch" s fakultetom pravo', () => {
    const wl = readDoc('../discovery/out/worklist.md');
    expect(wl).toContain('## Ovaj batch');
    expect(wl).toContain('pravo');
    expect(wl).toContain('Harvest backlog');
  });

  it('GAPS prijavljuje fpzg kao harvest backlog', () => {
    const gaps = readDoc('../discovery/out/GAPS.md');
    expect(gaps).toContain('Harvest backlog');
    expect(gaps).toContain('fpzg');
  });
});
