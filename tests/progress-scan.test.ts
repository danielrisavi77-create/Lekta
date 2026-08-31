import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCAN_PHASES, phaseStates } from '../src/ui/progress-scan';

/**
 * Rendgen na ekranu progresa crta STVARNI napredak analize. Cim bi popis faza smio odlutati
 * od stvarnih onProgress poziva, prikaz bi pocela biti animacija koja glumi rad: tocno ona
 * klasa laznog zelenog koju ovaj repozitorij inace lovi gardovima.
 */
describe('progress scan', () => {
  it('pragovi faza doslovno prate onProgress pozive u analyze-docx.ts', () => {
    const source = readFileSync(resolve(__dirname, '../src/analysis/analyze-docx.ts'), 'utf8');
    // 'Gotovo' na 100% je zavrsetak, ne faza rada, pa u popisu namjerno ne stoji.
    const calls = [...source.matchAll(/onProgress\(\s*(\d+)\s*,\s*'([^']+)'/g)]
      .map((m) => ({ pct: Number(m[1]), label: m[2] }))
      .filter((call) => call.pct < 100);

    expect(calls.length).toBeGreaterThan(0);
    expect(SCAN_PHASES.map((p) => ({ pct: p.pct, label: p.label }))).toEqual(calls);
  });

  it('pragovi rastu, pa je aktivna faza uvijek jednoznacna', () => {
    const pcts = SCAN_PHASES.map((p) => p.pct);
    expect([...pcts].sort((a, b) => a - b)).toEqual(pcts);
    expect(new Set(pcts).size).toBe(pcts.length);
  });

  it('prije prve faze nista ne tvrdi da je gotovo', () => {
    expect(phaseStates(0)).toEqual(Array(SCAN_PHASES.length).fill('pending'));
    expect(phaseStates(SCAN_PHASES[0].pct - 1)).toEqual(Array(SCAN_PHASES.length).fill('pending'));
  });

  it('tocno jedna faza je aktivna dok analiza traje', () => {
    for (let pct = SCAN_PHASES[0].pct; pct < 100; pct += 1) {
      const states = phaseStates(pct);
      expect(states.filter((s) => s === 'active')).toHaveLength(1);
      // Iza aktivne ne smije biti nijedna gotova: prikaz ne smije prijeci ispred analize.
      const active = states.indexOf('active');
      expect(states.slice(active + 1).every((s) => s === 'pending')).toBe(true);
      expect(states.slice(0, active).every((s) => s === 'done')).toBe(true);
    }
  });

  it('na 100% su sve faze gotove i nijedna se ne vrti', () => {
    expect(phaseStates(100)).toEqual(Array(SCAN_PHASES.length).fill('done'));
  });

  it('faza se pali TOCNO na svom pragu, ne prije', () => {
    SCAN_PHASES.forEach((phase, index) => {
      expect(phaseStates(phase.pct)[index]).toBe('active');
      expect(phaseStates(phase.pct - 1)[index]).not.toBe('active');
    });
  });

  it('neispravan ulaz ne izmislja napredak', () => {
    for (const bad of [Number.NaN, -50, Number.POSITIVE_INFINITY * 0]) {
      expect(phaseStates(bad)).toEqual(Array(SCAN_PHASES.length).fill('pending'));
    }
    // Prekoracenje se stisce na 100, ne omota u nulu.
    expect(phaseStates(1000)).toEqual(Array(SCAN_PHASES.length).fill('done'));
  });

  it('MUTACIJA: podmetnut kriv prag mora pasti na usporedbi s izvorom', () => {
    const source = readFileSync(resolve(__dirname, '../src/analysis/analyze-docx.ts'), 'utf8');
    const calls = [...source.matchAll(/onProgress\(\s*(\d+)\s*,\s*'([^']+)'/g)]
      .map((m) => ({ pct: Number(m[1]), label: m[2] }))
      .filter((call) => call.pct < 100);
    const mutated = SCAN_PHASES.map((p, i) => (i === 0 ? { pct: p.pct + 7, label: p.label } : { pct: p.pct, label: p.label }));
    expect(mutated).not.toEqual(calls);
  });
});
