// @vitest-environment node
/**
 * Mutacije read-guarda (scripts/hooks/read-guard.mjs). Svaka mutacija mijenja IZVOR presude i trazi da
 * gard to uhvati. Registraciju u .claude/settings.json upisuje vlasnik; tada ide i u EXPECTED_HOOKS.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(resolve(process.cwd(), 'scripts/hooks/read-guard.mjs'), 'utf8').replace(/\r\n?/g, '\n');
const start = SOURCE.indexOf('export const PRAG_REDAKA');
const end = SOURCE.indexOf('\n}\n', SOURCE.indexOf('export function judgeRead(')) + 3;
const BLOK = SOURCE.slice(start, end);

type Judge = (u: { toolInput: Record<string, unknown>; ext: string; redaka: number | null; bajtova: number | null }) => { allow: boolean };
const izvedi = (blok: string): Judge => new Function(`${blok.replace(/export /g, '')}\nreturn judgeRead;`)() as Judge;
function mutiraj(from: string, to: string): string {
  const out = BLOK.replace(from, to);
  if (out === BLOK) throw new Error(`mutacija nije nasla izvor: ${from}`);
  return out;
}

// Sinteticki ulazi: velika datoteka bez limit (mora pasti) i ista s limit (mora proci).
const VELIKA = { toolInput: {}, ext: '.ts', redaka: 2000, bajtova: 80_000 };
const S_LIMIT = { ...VELIKA, toolInput: { limit: 2000 } };

describe('mutacije: read-guard presuda', () => {
  it('baseline: izvor je nadjen, velika bez limit pada, s limit prolazi', () => {
    expect(BLOK).toContain('function judgeRead(');
    expect(izvedi(BLOK)(VELIKA).allow).toBe(false);
    expect(izvedi(BLOK)(S_LIMIT).allow).toBe(true);
  });

  it('mutant koji ignorira prag redaka propusta veliku datoteku', () => {
    const m = mutiraj('if (redaka <= PRAG_REDAKA && bajtova <= PRAG_BAJTOVA)', 'if (true)');
    expect(izvedi(m)(VELIKA).allow).toBe(true);
  });

  it('mutant koji ne priznaje limit odbija i izricito ciljano citanje', () => {
    const m = mutiraj('if (toolInput?.limit != null) return', 'if (false) return');
    expect(izvedi(m)(S_LIMIT).allow).toBe(false);
  });

  it('mutant koji gleda samo retke propusta jedan golemi redak', () => {
    const m = mutiraj('redaka <= PRAG_REDAKA && bajtova <= PRAG_BAJTOVA', 'redaka <= PRAG_REDAKA');
    expect(izvedi(m)({ toolInput: {}, ext: '.js', redaka: 1, bajtova: 500_000 }).allow).toBe(true);
    expect(izvedi(BLOK)({ toolInput: {}, ext: '.js', redaka: 1, bajtova: 500_000 }).allow).toBe(false);
  });
});

