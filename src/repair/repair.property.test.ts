/**
 * T96 (#209): property testovi popravka nad generiranim WordprocessingML-om (fast-check).
 *
 * Rucni fixturei (idempotence-gaps.test.ts, repair-golden.test.ts) dokazuju svojstva na odabranim
 * ulazima; ovdje fast-check slaze proizvoljne rasporede odlomaka, runova, polja i fusnota i svaki
 * pad smanji na najmanji model. Fiksni seed drzi `npm run check` deterministicnim; veci prolaz:
 * LEKTA_FC_RUNS=1000 LEKTA_FC_SEED=<n> npx vitest run src/repair/repair.property.test.ts
 *
 * Nadjeni protuprimjer se NE popravlja u fixeru u ovom zadatku: postaje zaseban zadatak s goldenom.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  classify,
  docModelArb,
  idempotenceProperty,
  packModel,
  realRepair,
  visibleTextProperty,
  xmlParts,
  type ModelClasses,
} from '../../tests/helpers/repair-arbitraries';

describe('generator: proizvodi ciljanu klasu ulaza', () => {
  it('polja, prazni runovi, vise sekcija, fusnote i NBSP cine znacajan udio uzorka', () => {
    const sample = fc.sample(docModelArb, { numRuns: 400, seed: 7 });
    const share = (k: keyof ModelClasses) => sample.filter((m) => classify(m)[k]).length / sample.length;
    for (const k of ['field', 'emptyRun', 'multiSection', 'footnote', 'nbsp'] as const) {
      expect(share(k), `udio klase ${k}`).toBeGreaterThanOrEqual(0.15);
      expect(share(k), `klasa ${k} ne smije biti svugdje`).toBeLessThan(1);
    }
  });
});

describe('svojstva popravka forme', () => {
  it('recept stvarno mijenja generirane dokumente, inace bi svojstva bila vakuumska', async () => {
    const sample = fc.sample(docModelArb, { numRuns: 20, seed: 11 });
    let changed = 0;
    for (const m of sample) {
      const before = await xmlParts(await packModel(m));
      const after = await xmlParts(await realRepair(await packModel(m), false));
      if (after['word/document.xml'] !== before['word/document.xml']) changed++;
    }
    expect(changed).toBe(sample.length);
  }, 60_000);

  it('idempotencija: drugi prolaz je bajtno isti nad document.xml i footnotes.xml', async () => {
    const out = await idempotenceProperty(realRepair);
    expect(out.error, JSON.stringify(out.counterexample)).toBeNull();
  }, 60_000);

  it('vidljivi tekst odlomaka (tijelo i fusnote) isti je prije i poslije popravka', async () => {
    const out = await visibleTextProperty(realRepair);
    expect(out.error, JSON.stringify(out.counterexample)).toBeNull();
  }, 60_000);
});
