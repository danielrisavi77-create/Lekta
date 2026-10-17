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

type Judge = (u: { toolInput: Record<string, unknown>; ext: string; redaka: number | null; bajtova: number | null; binarna?: boolean }) => { allow: boolean };
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

  it('mutant koji ignorira prag redaka propusta mnogo kratkih redaka', () => {
    const m = mutiraj('const prevelikaRedcima = redaka != null && redaka > PRAG_REDAKA;', 'const prevelikaRedcima = false;');
    const kratki = { toolInput: {}, ext: '.ts', redaka: 301, bajtova: 602 };
    expect(izvedi(BLOK)(kratki).allow).toBe(false);
    expect(izvedi(m)(kratki).allow).toBe(true);
  });

  it('mutant s povisenim pragom redaka propusta 301 redak', () => {
    const m = mutiraj('export const PRAG_REDAKA = 300;', 'export const PRAG_REDAKA = 3000;');
    expect(izvedi(m)({ toolInput: {}, ext: '.ts', redaka: 301, bajtova: 602 }).allow).toBe(true);
  });

  it('mutant s povisenim pragom bajtova propusta 40.001 bajt', () => {
    const m = mutiraj('export const PRAG_BAJTOVA = 40_000;', 'export const PRAG_BAJTOVA = 400_000;');
    expect(izvedi(m)({ toolInput: {}, ext: '.js', redaka: null, bajtova: 40_001 }).allow).toBe(true);
    expect(izvedi(BLOK)({ toolInput: {}, ext: '.js', redaka: null, bajtova: 40_001 }).allow).toBe(false);
  });

  it('mutant koji binarnu datoteku tretira kao tekst je odbija', () => {
    const m = mutiraj('if (bajtova == null || binarna) return', 'if (bajtova == null) return');
    const bin = { toolInput: {}, ext: '', redaka: null, bajtova: 5_000_000, binarna: true };
    expect(izvedi(BLOK)(bin).allow).toBe(true);
    expect(izvedi(m)(bin).allow).toBe(false);
  });

  it('mutant koji ne priznaje limit odbija i izricito ciljano citanje', () => {
    const m = mutiraj('if (toolInput?.limit != null) return', 'if (false) return');
    expect(izvedi(m)(S_LIMIT).allow).toBe(false);
  });

  it('mutant koji gleda samo retke propusta jedan golemi redak', () => {
    const m = mutiraj('const prevelikaBajtovima = bajtova > PRAG_BAJTOVA;', 'const prevelikaBajtovima = false;');
    expect(izvedi(m)({ toolInput: {}, ext: '.js', redaka: 1, bajtova: 500_000 }).allow).toBe(true);
    expect(izvedi(BLOK)({ toolInput: {}, ext: '.js', redaka: 1, bajtova: 500_000 }).allow).toBe(false);
  });
});

