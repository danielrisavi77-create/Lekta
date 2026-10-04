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
    const klase = ['field', 'emptyRun', 'multiSection', 'footnote', 'nbsp', 'tab', 'br', 'noBreakHyphen', 'lineOverride', 'emptyPair'] as const;
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

  it('izvlakac vidljivog teksta: tocan tok znakova, bez svojstava i brisanih revizija', () => {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const odlomak = (inner: string) => visibleParagraphs(`<w:document ${W}><w:body><w:p>${inner}</w:p></w:body></w:document>`);
    const run = (inner: string) => odlomak(`<w:r>${inner}</w:r>`);
    expect(run('<w:t>a</w:t><w:t>b</w:t>')).toEqual(['ab']);
    expect(run('<w:t>a</w:t><w:tab/><w:t>b</w:t>')).toEqual(['a\tb']);
    expect(run('<w:t>a</w:t><w:br/><w:t>b</w:t>')).toEqual(['a\nb']);
    expect(run('<w:t>a</w:t><w:noBreakHyphen/><w:t>b</w:t>')).toEqual(['a‑b']);
    // Negativne kontrole: definicija tab-stopa u w:pPr i tab u brisanoj ili premjestenoj reviziji nisu vidljivi.
    expect(odlomak('<w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>a</w:t></w:r>')).toEqual(['a']);
    expect(odlomak('<w:r><w:t>a</w:t></w:r><w:del w:id="1" w:author="x"><w:r><w:tab/><w:delText>x</w:delText></w:r></w:del>')).toEqual(['a']);
    expect(odlomak('<w:r><w:t>a</w:t></w:r><w:moveFrom w:id="2" w:author="x"><w:r><w:br/><w:t>y</w:t></w:r></w:moveFrom>')).toEqual(['a']);
  });
});

describe('svojstva popravka forme', () => {
  it('svaki fixer recepta primijenjen je na barem KVOTA dokumenata uzorka, u oba moda (deep i obican)', async () => {
    const KVOTA = 8;
    const sample = fc.sample(docModelArb, { numRuns: 30, seed: 11 });
    for (const deep of [false, true]) {
      const counts = new Map<string, number>();
      for (const m of sample) for (const f of await appliedFixers(m, deep)) counts.set(f, (counts.get(f) ?? 0) + 1);
      for (const { fixerId } of formRecipe(deep)) {
        expect(counts.get(fixerId) ?? 0, `${fixerId} (deep=${deep}) primijenjen premalo puta od ${sample.length}`).toBeGreaterThanOrEqual(KVOTA);
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
