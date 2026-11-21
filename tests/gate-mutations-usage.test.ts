// @vitest-environment node
/**
 * Mutacije mjerila troska s kesom (scripts/agents/usage-daily.mjs: `CLAUDE_PRICES`, `priceOf`,
 * `costParts`, `costOf`). Svaka mutacija mijenja IZVOR i trazi da sinteticki dan s poznatim
 * troskom padne.
 *
 * Zasto: stara tezina brojala je samo ulaz + izlaz i vidjela tek nekoliko posto troska
 * (izmjereno 17. 10. 2026.). Mutant koji ispusti kes, izjednaci cijene modela ili izmisli
 * cijenu vraca tocno tu sljepocu.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(resolve(process.cwd(), 'scripts/agents/usage-daily.mjs'), 'utf8').replace(/\r\n?/g, '\n');
const start = SOURCE.indexOf('export const CLAUDE_PRICES');
const endFn = SOURCE.indexOf('export function costOf(');
const end = SOURCE.indexOf('\n}\n', endFn) + 3;
const BLOK = SOURCE.slice(start, end);

type Rec = { model: string; input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite1h?: number };
type CostOf = (r: Rec) => number | null;

function izvedi(blok: string): CostOf {
  return new Function(`${blok.replace(/export /g, '')}\nreturn costOf;`)() as CostOf;
}

function mutiraj(from: string, to: string): string {
  const out = BLOK.replace(from, to);
  if (out === BLOK) throw new Error(`mutacija nije nasla izvor: ${from}`);
  return out;
}

// Sinteticki dan Opusa 5.5 u milijunima tokena: kes nosi gotovo sav trosak (oblik izmjeren 4. 10.).
const M = 1_000_000;
const DAN: Rec = { model: 'claude-opus-5-5', input: 1 * M, output: 0.1 * M, cacheRead: 10 * M, cacheWrite: 2 * M, cacheWrite1h: 1.5 * M };
const OCEKIVANO = 4 + 0.1 * 20 + 10 * 0.2 + 1.5 * 8 + 0.5 * 5;

describe('mutacije: mjerilo troska s kesom', () => {
  it('baseline: izvor je nadjen i daje tocan trosak', () => {
    expect(start).toBeGreaterThan(0);
    expect(BLOK).toContain('function costParts(');
    expect(izvedi(BLOK)(DAN)).toBeCloseTo(OCEKIVANO, 9);
    expect(izvedi(BLOK)({ ...DAN, model: 'nepoznat' })).toBeNull();
  });

  it('mutant bez citanja kesa pada', () => {
    const m = mutiraj('readUsd: (p.read * r.cacheRead) / 1e6', 'readUsd: 0');
    expect(izvedi(m)(DAN)).not.toBeCloseTo(OCEKIVANO, 3);
  });

  it('mutant bez pisanja kesa pada', () => {
    const m = mutiraj('writeUsd: (p.write1h * write1h + p.write5m * (r.cacheWrite - write1h)) / 1e6', 'writeUsd: 0');
    expect(izvedi(m)(DAN)).not.toBeCloseTo(OCEKIVANO, 3);
  });

  it('mutant koji svo pisanje kesa cijeni kao 5 min pada', () => {
    const m = mutiraj('const write1h = Math.min(r.cacheWrite1h ?? 0, r.cacheWrite);', 'const write1h = 0;');
    expect(izvedi(m)(DAN)).not.toBeCloseTo(OCEKIVANO, 3);
  });

  it('mutant s istim omjerom citanja kesa za sve modele (0,1x ulaza) pada', () => {
    const m = mutiraj("'claude-opus-5-5': Object.freeze({ input: 4, write5m: 5, write1h: 8, read: 0.2,", "'claude-opus-5-5': Object.freeze({ input: 4, write5m: 5, write1h: 8, read: 0.4,");
    expect(izvedi(m)(DAN)).not.toBeCloseTo(OCEKIVANO, 3);
  });

  it('mutant koji nepoznatom modelu izmisli cijenu pada', () => {
    const m = mutiraj('return Object.prototype.hasOwnProperty.call(CLAUDE_PRICES, id) ? CLAUDE_PRICES[id] : null;', "return CLAUDE_PRICES[id] ?? CLAUDE_PRICES['claude-opus-5-5'];");
    expect(izvedi(m)({ ...DAN, model: 'nepoznat' })).not.toBeNull();
  });
});
