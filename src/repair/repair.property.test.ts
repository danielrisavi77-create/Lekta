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
  allParts,
  appliedFixers,
  classify,
  docModelArb,
  formRecipe,
  idempotenceProperty,
  packageIssues,
  packModel,
  realRepair,
  visibleParagraphs,
  visibleTextProperty,
  type ModelClasses,
} from '../../tests/helpers/repair-arbitraries';

describe('generator: proizvodi ciljanu klasu ulaza', () => {
  it('svaka klasa ulaza cini znacajan udio uzorka, ali ne cijeli uzorak', () => {
    const sample = fc.sample(docModelArb, { numRuns: 400, seed: 7 });
    const share = (k: keyof ModelClasses) => sample.filter((m) => classify(m)[k]).length / sample.length;
    const klase = ['field', 'emptyRun', 'multiSection', 'footnote', 'nbsp', 'tab', 'br', 'noBreakHyphen'] as const;
    for (const k of klase) {
      expect(share(k), `udio klase ${k}`).toBeGreaterThanOrEqual(0.15);
      expect(share(k), `klasa ${k} ne smije biti svugdje`).toBeLessThan(1);
    }
  });

  it('generirani paketi su valjan OPC (manifest, relacije, shema) po checkPackageStructure', async () => {
    for (const m of fc.sample(docModelArb, { numRuns: 30, seed: 13 })) {
      expect(await packageIssues(await packModel(m)), JSON.stringify(m)).toEqual([]);
    }
  });

  it('izvlakac vidljivog teksta razlikuje tabulator, prijelom i neprelomivu crticu od spojenog teksta', () => {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const p = (inner: string) => visibleParagraphs(`<w:document ${W}><w:body><w:p><w:r>${inner}</w:r></w:p></w:body></w:document>`);
    const spojeno = p('<w:t>a</w:t><w:t>b</w:t>');
    expect(spojeno).toEqual(['ab']);
    for (const el of ['<w:tab/>', '<w:br/>', '<w:noBreakHyphen/>']) {
      expect(p(`<w:t>a</w:t>${el}<w:t>b</w:t>`), el).not.toEqual(spojeno);
    }
  });
});

describe('svojstva popravka forme', () => {
  it('svaki fixer recepta stvarno se primjenjuje na uzorku, u oba moda (deep i obican)', async () => {
    const sample = fc.sample(docModelArb, { numRuns: 30, seed: 11 });
    for (const deep of [false, true]) {
      const counts = new Map<string, number>();
      for (const m of sample) for (const f of await appliedFixers(m, deep)) counts.set(f, (counts.get(f) ?? 0) + 1);
      for (const { fixerId } of formRecipe(deep)) {
        expect(counts.get(fixerId) ?? 0, `${fixerId} (deep=${deep}) nijednom primijenjen, svojstvo bi za njega bilo vakuumsko`).toBeGreaterThan(0);
      }
    }
  }, 120_000);

  it('deep put stvarno mijenja runove drugacije od obicnog prolaza', async () => {
    const sample = fc.sample(docModelArb, { numRuns: 20, seed: 17 });
    let razlika = 0;
    for (const m of sample) {
      const bytes = await packModel(m);
      const obicno = (await allParts(await realRepair(bytes, false)))['word/document.xml'];
      const duboko = (await allParts(await realRepair(bytes, true)))['word/document.xml'];
      if (obicno !== duboko) razlika++;
    }
    expect(razlika).toBeGreaterThan(0);
  }, 120_000);

  it('idempotencija: drugi prolaz je bajtno isti nad svim dijelovima paketa', async () => {
    const out = await idempotenceProperty(realRepair);
    expect(out.error, JSON.stringify(out.counterexample)).toBeNull();
  }, 120_000);

  it('vidljivi tok znakova (tijelo i fusnote) isti je prije i poslije popravka', async () => {
    const out = await visibleTextProperty(realRepair);
    expect(out.error, JSON.stringify(out.counterexample)).toBeNull();
  }, 120_000);
});
