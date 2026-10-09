// @vitest-environment node
/**
 * Gard nad detektorom svjezine pecenih projekcija.
 *
 * Zasto postoji: 2026-08-31/09-01 je SEST puta pecena projekcija zaostala za svojim izvorom
 * (golden snimka, repair-real-corpus, real-corpus-backlog, faculty-matrix dvaput, REPAIR_RECIPE).
 * Posljedica je uvijek zeleno koje ne znaci ono sto tvrdi, i uvijek pada na SLJEDECU sesiju, koja
 * onda trosi cist worktree dokazujuci da kvar nije njezin; kroz dvije sesije je na to otislo pet
 * worktreea.
 *
 * Detektor se testira nad JEZGROM, bez gita i bez repozitorija, jer je jedino tako moguce podmetnuti
 * stanje koje se u stvarnom stablu ne moze narucˇiti.
 */
import { describe, expect, it } from 'vitest';
import {
  PROJECTIONS,
  projectionFreshness,
  formatProjection,
  exitCodeFor,
} from '../scripts/projection-freshness-core.mjs';

const commit = (sha: string, subject: string) => ({ sha, subject });

describe('svjezina pecenih projekcija', () => {
  it('bez ijednog commita nad izvorom projekcija je svjeza', () => {
    const v = projectionFreshness('x', 'abc123', [], 'npm run x');
    expect(v.status).toBe('svjeze');
    expect(exitCodeFor([v])).toBe(0);
  });

  it('commit nad izvorom poslije pecenja znaci USTAJALO', () => {
    const v = projectionFreshness('x', 'abc123', [commit('def456', 'fix: motor')], 'npm run x');
    expect(v.status).toBe('ustajalo');
    expect(v.commits).toHaveLength(1);
    expect(exitCodeFor([v])).toBe(1);
  });

  /**
   * NEGATIVNA KONTROLA nad izlaznim kodom: jedna ustajala mora oboriti cijeli prolaz, inace bi
   * gard prijavljivao a nista ne bi blokirao.
   */
  it('jedna ustajala medju svjezima obara izlazni kod', () => {
    const svjeza = projectionFreshness('a', 'sha', [], 'npm run a');
    const ustajala = projectionFreshness('b', 'sha', [commit('c', 's')], 'npm run b');
    expect(exitCodeFor([svjeza, svjeza, svjeza])).toBe(0);
    expect(exitCodeFor([svjeza, ustajala, svjeza])).toBe(1);
  });

  it('artefakt koji nikad nije commitan nije lazno svjez, ali ni ustajao', () => {
    const v = projectionFreshness('x', null, [], 'npm run x');
    expect(v.status).toBe('nepoznato');
    // Ne obara prolaz: nepostojanje artefakta je drugi problem i ima svoje garde.
    expect(exitCodeFor([v])).toBe(0);
  });

  it('presuda uvijek imenuje naredbu za osvjezavanje, jer je to jedini koristan ishod', () => {
    const v = projectionFreshness('x', 'abc', [commit('d', 's')], 'npm run bas-to');
    expect(formatProjection(v)).toContain('npm run bas-to');
  });

  /**
   * Popis mora pokrivati SVIH sest izmjerenih driftova. Bez ove tvrdnje bi netko mogao ukloniti
   * ulaz i time uciniti da drift te projekcije opet nitko ne vidi.
   */
  it('popis pokriva sve projekcije koje su danas zaostale, ukljucujuci naknadno registrirane', () => {
    const ids = PROJECTIONS.map((p: { id: string }) => p.id).sort();
    expect(ids).toEqual([
      'citation-dossiers',
      'closed-loop',
      'completion-ledger',
      'faculty-matrix',
      'profile-claims',
      'real-corpus',
      'real-corpus-backlog',
      'reconcile-programs',
      'repair-gap',
      'repair-net',
      'repair-recipe',
      'scored-value-drift',
      'site-stats',
      'synthetic-corpus-manifest',
      'worklist',
    ]);
    for (const p of PROJECTIONS as Array<{ artifacts: string[]; sources: string[]; regenerate: string }>) {
      expect(p.artifacts.length, 'svaka projekcija mora imati artefakt').toBeGreaterThan(0);
      expect(p.sources.length, 'svaka projekcija mora imati izvor').toBeGreaterThan(0);
      expect(p.regenerate, 'bez naredbe presuda nije upotrebljiva').toMatch(/^(npm run|npx) /);
    }
  });

  /** Lanac je stvaran: matrica je izvor backlogu, a korpus i petlja su izvori matrici. */
  it('ulancane projekcije se vide kao izvori jedna drugoj', () => {
    const byId = Object.fromEntries((PROJECTIONS as Array<{ id: string; sources: string[] }>).map((p) => [p.id, p]));
    expect(byId['faculty-matrix'].sources).toContain('docs/generated/closed-loop.json');
    expect(byId['faculty-matrix'].sources).toContain('docs/generated/repair-real-corpus.json');
    expect(byId['real-corpus-backlog'].sources).toContain('docs/generated/faculty-matrix.json');
    expect(byId['profile-claims'].sources).toContain('docs/generated/completion-ledger.json');
    expect(byId['completion-ledger'].sources).toContain('data/verification/real-corpus-attestation.json');
  });

  /**
   * Z15 (2026-09-27): `rulesVersion` i `sourcesCheckedAt` u "Stanju stola" citaju
   * `data/generated/profile-rules-server.json` (rulesVersionFromDisk) i `data/coverage/scored-coverage.json`
   * (uvoz SCORED_COVERAGE), oba u `src/coverage/site-stats.ts`. Bez ovih dvaju izvora bi commit koji
   * promijeni samo njih presudio "svjeze", a "Stanje stola" bi pokazivalo pecenu vrijednost koja vise
   * ne odgovara stvarnom stanju izvora.
   */
  it('site-stats navodi profile-rules-server.json i scored-coverage.json kao izvore', () => {
    const byId = Object.fromEntries((PROJECTIONS as Array<{ id: string; sources: string[] }>).map((p) => [p.id, p]));
    expect(byId['site-stats'].sources).toContain('data/generated/profile-rules-server.json');
    expect(byId['site-stats'].sources).toContain('data/coverage/scored-coverage.json');
  });

  /**
   * DOKAZ da navodenje ovih izvora stvarno oznacava projekciju zastarjelom: isti `projectionFreshness`
   * koji `npm run projection-freshness` zove, nad commitom koji dira SAMO jedan od ta dva izvora.
   */
  it('commit nad profile-rules-server.json ili scored-coverage.json cini site-stats ustajalim', () => {
    const byId = Object.fromEntries((PROJECTIONS as Array<{ id: string; sources: string[] }>).map((p) => [p.id, p]));
    const izvori = byId['site-stats'].sources;
    for (const izvor of ['data/generated/profile-rules-server.json', 'data/coverage/scored-coverage.json']) {
      expect(izvori).toContain(izvor);
      const v = projectionFreshness('site-stats', 'abc123', [commit('def456', `fix: ${izvor}`)], byId['site-stats'].regenerate);
      expect(v.status, izvor).toBe('ustajalo');
    }
  });
});
