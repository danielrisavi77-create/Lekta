// @vitest-environment node
/**
 * T56: ratchet mrtvog koda i duplikata. Brojevi iz knipa i jscpd-a ne smiju rasti iznad
 * `docs/generated/lean-baseline.json`. Mjerenje se vrti UZIVO (knip ~3 s, jscpd <1 s), jer
 * spremljeni broj bez ponovnog mjerenja ne bi uhvatio nista. Nista se ne brise: kad broj padne,
 * `npm run lean:report` spusti baseline (nikad ga ne dize).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BASELINE_PATH,
  RATCHET_METRIKE,
  REPORT_PATH,
  lowerBaseline,
  measure,
  ratchetProblems,
  summarizeJscpd,
  summarizeKnip,
} from '../scripts/lean-report.mjs';

type Metrike = Record<string, number>;
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as { metrike: Metrike; generatedAt: string; generatedFromCommit: string };
const plus = (m: Metrike, k: string, n: number): Metrike => ({ ...m, [k]: m[k] + n });

describe('lean ratchet: baseline', () => {
  it('ima svaku ratchet metriku kao nenegativan cijeli broj i provenijenciju', () => {
    for (const k of RATCHET_METRIKE) {
      expect(Number.isInteger(baseline.metrike[k]), k).toBe(true);
      expect(baseline.metrike[k]).toBeGreaterThanOrEqual(0);
    }
    expect(typeof baseline.generatedAt).toBe('string');
    expect(typeof baseline.generatedFromCommit).toBe('string');
  });

  it('mjerenje nije vakuumsko: baseline ima stvarne nalaze', () => {
    expect(baseline.metrike.knipDatoteke + baseline.metrike.knipExporti).toBeGreaterThan(0);
    expect(baseline.metrike.jscpdDupliciraniRetci).toBeGreaterThan(0);
  });

  it('LEAN_REPORT.md postoji i navodi svaku metriku', () => {
    const md = readFileSync(REPORT_PATH, 'utf8');
    expect(md).toContain('# Lean izvjestaj (T56)');
    expect(md).toContain('Top 10 datoteka po knip nalazima');
    expect(md).toContain('Top 10 datoteka po dupliciranim retcima');
    expect((md.match(/^\| (knip|jscpd): /gm) || []).length).toBe(RATCHET_METRIKE.length);
  });
});

describe('lean ratchet: uzivo mjerenje ne smije rasti iznad baselinea', () => {
  it('knip i jscpd nad trenutnim stablom su unutar baselinea', () => {
    const m = measure();
    const problemi = ratchetProblems(baseline, m.metrike);
    expect(
      problemi,
      `Metrika je narasla: ${problemi.join('; ')}. Ukloni novi mrtvi kod ili duplikat; baseline se ne dize.`,
    ).toEqual([]);
  }, 120_000);
});

describe('lean ratchet: usporedba i spustanje baselinea', () => {
  it('jednako prolazi, rast bilo koje metrike za 1 pada', () => {
    expect(ratchetProblems(baseline, baseline.metrike)).toEqual([]);
    for (const k of RATCHET_METRIKE) {
      expect(ratchetProblems(baseline, plus(baseline.metrike, k, 1)), k).toHaveLength(1);
    }
  });

  it('nedostajuca metrika u baselineu ili mjerenju je problem, ne tiha nula', () => {
    const { knipExporti: _izbaceno, ...bez } = baseline.metrike;
    expect(ratchetProblems({ metrike: bez }, baseline.metrike)).toEqual(['knipExporti: baseline nema vrijednost']);
    expect(ratchetProblems(baseline, bez)).toEqual(['knipExporti: mjerenje nema vrijednost']);
  });

  it('lowerBaseline spusta pad, nikad ne dize, i drugi prolaz je no-op', () => {
    const nize = plus(baseline.metrike, 'jscpdKlonovi', -3);
    const nove = lowerBaseline(baseline, nize);
    expect(nove!.jscpdKlonovi).toBe(baseline.metrike.jscpdKlonovi - 3);
    expect(lowerBaseline({ metrike: nove! }, nize)).toBeNull();
    expect(lowerBaseline(baseline, plus(baseline.metrike, 'knipDatoteke', 50))).toBeNull();
  });
});

describe('lean ratchet: djelomican pad pipelinea rusi mjerenje', () => {
  it('knip bez "issues" i jscpd bez statistike bacaju gresku', () => {
    expect(() => summarizeKnip({})).toThrow(/issues/);
    expect(() => summarizeKnip({ issues: [{}] })).toThrow(/file/);
    expect(() => summarizeJscpd({})).toThrow(/statistics/);
  });

  it('sazetak broji polja i slaze top listu', () => {
    const k = summarizeKnip({
      issues: [
        { file: 'a.ts', files: [], exports: [{}, {}], types: [{}] },
        { file: 'b.ts', files: [{}], exports: [], types: [] },
        { file: 'package.json', dependencies: [{}], devDependencies: [{}] },
      ],
    });
    expect(k.counts).toMatchObject({ knipDatoteke: 1, knipExporti: 2, knipTipovi: 1, knipOvisnosti: 2 });
    expect(k.top[0]).toEqual({ file: 'a.ts', n: 3 });
    const j = summarizeJscpd({
      statistics: { total: { lines: 100, duplicatedLines: 10, percentage: 10, clones: 1 } },
      duplicates: [{ lines: 10, firstFile: { name: 'x.ts' }, secondFile: { name: 'y.ts' } }],
    });
    expect(j.counts).toEqual({ jscpdDupliciraniRetci: 10, jscpdKlonovi: 1 });
    expect(j.top).toHaveLength(2);
  });
});
