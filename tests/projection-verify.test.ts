/**
 * Gard nad SADRZAJNOM presudom o pecenim projekcijama.
 *
 * Odnos prema `projection-freshness`: ondje je screening (redoslijed commita), ovdje presuda
 * (regeneriraj pa usporedi bajtove). Testira se JEZGRA, bez gita i generatora, jer se stanja koja
 * su ovdje bitna u stvarnom stablu ne mogu naruciti.
 *
 * Zasto ovaj modul uopce postoji, izmjereno 2026-09-01: screening je prijavio tri ustajale
 * projekcije, a regeneracija je dala bajt-identican sadrzaj u sva tri slucaja. Bez sadrzajne
 * presude nije se moglo razlikovati lazan alarm od stvarnog kvara.
 */
import { describe, expect, it } from 'vitest';
import {
  normalizeEol,
  classifyArtifact,
  projectionVerdict,
  formatVerdict,
  exitCodeFor,
} from '../scripts/projection-verify-core.mjs';

describe('sadrzajna presuda o projekcijama', () => {
  it('identicni bajtovi su identicni', () => {
    expect(classifyArtifact('a\nb\n', 'a\nb\n')).toBe('identican');
  });

  /**
   * KLJUCNI SLUCAJ, i razlog zasto se ne oslanjamo na `git status`: isti dan je git u
   * regeneracijskom worktreeu prijavio sest izmijenjenih datoteka, dok im je sadrzaj bio jednak
   * commitanom. Razlika u zavrsecima redaka ne smije postati "nalaz".
   */
  it('razlika samo u zavrsecima redaka NIJE sadrzajna razlika', () => {
    expect(classifyArtifact('a\r\nb\r\n', 'a\nb\n')).toBe('samo-eol');
    expect(classifyArtifact('a\rb', 'a\nb')).toBe('samo-eol');
  });

  /**
   * Artefakt s provenijencijom se pri svakom pokretanju mijenja, jer `withProvenance` upisuje
   * `generatedAt` i `generatedFromCommit`. Bez ovog ishoda bi presuda nad takvom projekcijom bila
   * TRAJNO crvena, sto je izmjereno 2026-09-04 na `program-reconcile.json`.
   */
  it('razlika samo u provenijenciji NIJE sadrzajna', () => {
    const a = JSON.stringify({ schemaVersion: 1, x: 5, generatedAt: '2026-09-04T10:00:00.000Z', generatedFromCommit: 'aaa' });
    const b = JSON.stringify({ schemaVersion: 1, x: 5, generatedAt: '2026-09-04T11:22:33.000Z', generatedFromCommit: 'bbb' });
    expect(classifyArtifact(a, b)).toBe('samo-provenijencija');
  });

  /** NEGATIVNA KONTROLA: promjena UZ provenijenciju mora ostati sadrzajna. */
  it('sadrzajna razlika se ne skriva iza provenijencije', () => {
    const a = JSON.stringify({ x: 5, generatedAt: '2026-09-04T10:00:00.000Z' });
    const b = JSON.stringify({ x: 6, generatedAt: '2026-09-04T11:00:00.000Z' });
    expect(classifyArtifact(a, b)).toBe('sadrzaj');
  });

  /** Artefakt BEZ provenijencije ne smije dobiti to izuzece; inace bi svaki JSON prosao blaze. */
  it('JSON bez provenijencije se i dalje mjeri po sadrzaju', () => {
    expect(classifyArtifact(JSON.stringify({ x: 1 }), JSON.stringify({ x: 2 }))).toBe('sadrzaj');
  });

  it('stvarna razlika u znakovima JEST sadrzajna', () => {
    expect(classifyArtifact('deep: 5\n', 'deep: 50\n')).toBe('sadrzaj');
  });

  /** Ali se ni ne sakriva: EOL razlika se imenuje u obrazlozenju, inace nitko ne zna zasto git vristi. */
  it('EOL razlika je cista, ali se izrijekom spominje', () => {
    const v = projectionVerdict('x', [{ path: 'a.json', status: 'samo-eol' }]);
    expect(v.status).toBe('cisto');
    expect(v.reason).toContain('zavrsecima redaka');
    expect(exitCodeFor([v])).toBe(0);
  });

  it('sadrzajni raskorak imenuje BAS one artefakte koji se razlikuju', () => {
    const v = projectionVerdict('m', [
      { path: 'a.json', status: 'identican' },
      { path: 'b.json', status: 'sadrzaj' },
      { path: 'c.md', status: 'sadrzaj' },
    ]);
    expect(v.status).toBe('raskorak');
    expect(v.drifted).toEqual(['b.json', 'c.md']);
    expect(exitCodeFor([v])).toBe(1);
  });

  /**
   * Neuspjela regeneracija NE SMIJE proci kao cisto. To je isti razred kao `integrityFailure`
   * koji vrati ulazne bajtove: sve ostale tvrdnje tada prolaze vakuumski nad originalom.
   */
  it('neuspjela regeneracija nije cisto nego neprovjereno, i obara prolaz', () => {
    const v = projectionVerdict('m', [
      { path: 'a.json', status: 'identican' },
      { path: 'b.json', status: 'neprovjereno', reason: 'regeneracija pala (exit 1)' },
    ]);
    expect(v.status).toBe('neprovjereno');
    expect(v.reason).toContain('exit 1');
    expect(exitCodeFor([v])).toBe(1);
  });

  it('neprovjereno ima prednost pred raskorakom, jer se raskoraku ne moze vjerovati', () => {
    const v = projectionVerdict('m', [
      { path: 'a.json', status: 'sadrzaj' },
      { path: 'b.json', status: 'neprovjereno', reason: 'nema artefakta' },
    ]);
    expect(v.status).toBe('neprovjereno');
  });

  it('normalizacija dira samo zavrsetke redaka', () => {
    expect(normalizeEol('a\r\n\r\nb')).toBe('a\n\nb');
    expect(normalizeEol('bez promjene')).toBe('bez promjene');
  });

  /** NEGATIVNA KONTROLA nad izlaznim kodom: cisto ne smije obarati, inace gard vristi na sve. */
  it('sama cista presuda ne obara prolaz', () => {
    const cisto = projectionVerdict('a', [{ path: 'x', status: 'identican' }]);
    expect(exitCodeFor([cisto, cisto, cisto])).toBe(0);
    expect(formatVerdict(cisto)).toContain('cisto');
  });
});
