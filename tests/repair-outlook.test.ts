import { describe, expect, it } from 'vitest';
import { buildRepairOutlook } from '../src/ui/results/repair-outlook';
import type { Check } from '../src/scoring/checks';

/**
 * Prije popravka sucelje smije reci samo ono sto je DETERMINISTICKO. Ovi gardovi cuvaju
 * granicu: strop je gornja granica, nikad predvidjanje, i nigdje se ne pojavljuje
 * "procijenjena ocjena nakon odabranih popravaka".
 */

function check(over: Partial<Check> = {}): Check {
  return {
    id: 'format.font.dominant', category: 'formatting', title: 'Dominantni font', status: 'warn',
    earned: 4, max: 8, detail: '', issue: null, scored: true, ...over,
  } as Check;
}

function ok(model: ReturnType<typeof buildRepairOutlook>) {
  if (model.kind !== 'available') throw new Error('ocekivan dostupan model: ' + model.kind);
  return model;
}

describe('izgled popravka prije pokretanja', () => {
  it('bez bodovanih provjera strop se ne racuna, i to se imenuje', () => {
    const model = buildRepairOutlook([check({ scored: false })], 70, 0);
    expect(model.kind).toBe('unavailable');
    if (model.kind === 'unavailable') expect(model.reason).toMatch(/bodovan/i);
  });

  it('PROSLE provjere se ne broje kao prilika za popravak', () => {
    const model = ok(buildRepairOutlook(
      [check({ status: 'pass', earned: 8 }), check({ id: 'page.margins', title: 'Margine dokumenta' })],
      70, 0,
    ));
    const total = model.counts.auto + model.counts.assisted + model.counts.manual;
    expect(total).toBe(1);
  });

  it('asistirane se broje ODVOJENO od automatskih', () => {
    // Strop racuna kao da i asistirane budu popravljene, a one traze korisnikovu potvrdu.
    // Bez odvojenog broja strop bi tiho obecavao ishod koji ovisi o jos nedonesenim odlukama.
    const model = ok(buildRepairOutlook([check(), check({ id: 'structure.sections.profile', title: 'Osnovni dijelovi rada' })], 70, 0));
    expect(model.counts).toHaveProperty('assisted');
    expect(model.counts.auto + model.counts.assisted + model.counts.manual).toBe(2);
  });

  it('strop je gornja granica: headroom nikad nije negativan', () => {
    const model = ok(buildRepairOutlook([check()], 99, 0));
    expect(model.headroom).toBeGreaterThanOrEqual(0);
  });

  it('bez bodovane ocjene nema ni razlike, a strop i dalje postoji', () => {
    const model = ok(buildRepairOutlook([check()], null, 0));
    expect(model.currentScore).toBeNull();
    expect(model.headroom).toBeNull();
    expect(typeof model.ceilingScore).toBe('number');
  });

  it('rucne provjere su IMENOVANE, ne samo prebrojane', () => {
    // Popis blokatora se imenuje a ne prebrojava: broj koji ostane isti dok se sadrzaj mijenja
    // sakriva promjenu (isto pravilo kao za citatne dosjee u CLAUDE.md).
    const manual = check({ id: 'method.declared', title: 'Metodologija', status: 'fail', earned: 0, max: 5 });
    const model = ok(buildRepairOutlook([manual], 60, 0));
    if (model.counts.manual > 0) {
      expect(model.manualItems.length).toBeGreaterThan(0);
      expect(model.manualItems[0]).toHaveProperty('title');
      expect(model.manualItems[0]).toHaveProperty('lostPoints');
    }
  });

  it('dosegnut strop se prepoznaje, pa sucelje ne nudi prazno obecanje', () => {
    const model = ok(buildRepairOutlook([check({ status: 'pass', earned: 8 })], 100, 0));
    expect(model.atCeiling).toBe(true);
  });

  it('predodabir se prenosi kakav jest, negativan se ne izmislja', () => {
    expect(ok(buildRepairOutlook([check()], 70, 5)).preselected).toBe(5);
    expect(ok(buildRepairOutlook([check()], 70, -3)).preselected).toBe(0);
    expect(ok(buildRepairOutlook([check()], 70, Number.NaN)).preselected).toBe(0);
  });

  it('model NIGDJE ne nosi procijenjenu ocjenu nakon popravka', () => {
    const model = buildRepairOutlook([check()], 70, 3);
    const keys = new Set<string>();
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (v && typeof v === 'object') for (const [k, val] of Object.entries(v)) { keys.add(k); walk(val); }
    };
    walk(model);
    expect([...keys].filter((k) => /projected|estimated|predicted|ocjenaNakon/i.test(k))).toEqual([]);
  });
});
