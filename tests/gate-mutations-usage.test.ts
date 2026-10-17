// @vitest-environment node
/**
 * Mutacije mjerila troska s kesom (scripts/agents/usage-daily.mjs, `COST_RATIOS` i `costOf`).
 * Svaka mutacija mijenja IZVOR funkcije i trazi da sinteticki dan s poznatim troskom padne.
 *
 * Zasto: stara tezina brojala je samo ulaz + izlaz i vidjela 0,5 do 2,4 % stvarnog troska
 * (izmjereno 17. 10. 2026.). Mutant koji ispusti kes vraca tocno tu sljepocu.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(resolve(process.cwd(), 'scripts/agents/usage-daily.mjs'), 'utf8').replace(/\r\n?/g, '\n');
const start = SOURCE.indexOf('export const COST_RATIOS');
const end = SOURCE.indexOf('  : null);', start) + '  : null);'.length;
const BLOK = SOURCE.slice(start, end);

type Rec = { model: string; input: number; output: number; cacheRead: number; cacheWrite: number };
type CostOf = (r: Rec, w: Record<string, number>) => number | null;

function izvedi(blok: string): CostOf {
  return new Function(`${blok.replace(/export /g, '')}\nreturn costOf;`)() as CostOf;
}

function mutiraj(from: string, to: string): string {
  const out = BLOK.replace(from, to);
  if (out === BLOK) throw new Error(`mutacija nije nasla izvor: ${from}`);
  return out;
}

const W = { m: 2 };
// Sinteticki dan duge sesije: kes nosi gotovo sav trosak (oblik izmjeren 4. 10.).
const DAN: Rec = { model: 'm', input: 10, output: 100, cacheRead: 1_000_000, cacheWrite: 40_000 };
const OCEKIVANO = 2 * (10 + 5 * 100 + 0.1 * 1_000_000 + 1.25 * 40_000);

describe('mutacije: mjerilo troska s kesom', () => {
  it('baseline: izvor je nadjen i daje tocan trosak', () => {
    expect(BLOK.length).toBeGreaterThan(200);
    expect(izvedi(BLOK)(DAN, W)).toBeCloseTo(OCEKIVANO, 6);
    expect(izvedi(BLOK)({ ...DAN, model: 'nepoznat' }, W)).toBeNull();
  });

  it('mutant bez citanja kesa pada', () => {
    const m = mutiraj(' + COST_RATIOS.cacheRead * r.cacheRead', '');
    expect(izvedi(m)(DAN, W)).not.toBeCloseTo(OCEKIVANO, 0);
  });

  it('mutant bez pisanja kesa pada', () => {
    const m = mutiraj(' + COST_RATIOS.cacheWrite * r.cacheWrite', '');
    expect(izvedi(m)(DAN, W)).not.toBeCloseTo(OCEKIVANO, 0);
  });

  it('mutant sa starom tezinom (izlaz kao ulaz, bez kesa) pada', () => {
    const m = mutiraj('cacheRead: 0.1, cacheWrite: 1.25', 'cacheRead: 0, cacheWrite: 0').replace('output: 5', 'output: 1');
    expect(izvedi(m)(DAN, W)).toBeCloseTo(2 * 110, 6);
    expect(izvedi(m)(DAN, W)).not.toBeCloseTo(OCEKIVANO, 0);
  });

  it('mutant koji izmisli tezinu za nepoznat model pada', () => {
    const m = mutiraj("(typeof weights[r.model] === 'number'\n  ? weights[r.model]", "(true\n  ? (weights[r.model] ?? 1)");
    expect(izvedi(m)({ ...DAN, model: 'nepoznat' }, W)).not.toBeNull();
  });
});
