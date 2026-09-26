import { describe, expect, it, afterEach } from 'vitest';
import { resolveMaxWorkers } from '../scripts/agents/resolve-max-workers.mjs';

/**
 * `vitest.config.ts` racuna zadani broj radnika iz `VITEST_MAX_THREADS` env varijable preko
 * `resolveMaxWorkers` (isti izvor koji koristi config, ne duplikat), s padom na 2 kad varijabla
 * nije postavljena (CLAUDE.md optimizacijski popis, stavka 9).
 *
 * `resolveMaxWorkers` se testira izravno za sve slucajeve nadjacavanja: Vite ne ponovno izvrsava
 * jednom ucitan config modul za istu putanju unutar istog procesa, pa bi ponovni `import()` iste
 * datoteke s razlicitim env vrijednostima davao lazno zelen/pogresan rezultat (mjereno pri pisanju
 * ovog testa). Zaseban test nize uvozi STVARAN `vitest.config.ts` jednom, s trenutnim (praznim)
 * env-om, i potvrduje da config stvarno koristi tu istu funkciju za zadanu vrijednost.
 */
describe('resolveMaxWorkers - cista logika', () => {
  it('zadano je 2 kad env nije postavljena ili je prazna', () => {
    expect(resolveMaxWorkers(undefined)).toBe(2);
    expect(resolveMaxWorkers('')).toBe(2);
  });

  it('nadjacava se s pozitivnim cijelim brojem iz env-a', () => {
    expect(resolveMaxWorkers('4')).toBe(4);
    expect(resolveMaxWorkers('1')).toBe(1);
  });

  it('ignorira neispravnu vrijednost (0, negativno, ne-broj) i vraca zadano 2', () => {
    expect(resolveMaxWorkers('0')).toBe(2);
    expect(resolveMaxWorkers('-1')).toBe(2);
    expect(resolveMaxWorkers('abc')).toBe(2);
  });
});

describe('vitest.config.ts - stvarni config koristi resolveMaxWorkers', () => {
  const originalEnv = process.env.VITEST_MAX_THREADS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.VITEST_MAX_THREADS;
    } else {
      process.env.VITEST_MAX_THREADS = originalEnv;
    }
  });

  it('default.test.maxWorkers je 2 kad VITEST_MAX_THREADS nije postavljena', async () => {
    delete process.env.VITEST_MAX_THREADS;
    const mod = await import('../vitest.config.ts');
    expect(mod.resolvedMaxWorkers).toBe(2);
    expect(mod.default.test?.maxWorkers).toBe(2);
    // Konzistentnost: config mora davati ISTI rezultat kao izravan poziv cure funkcije za
    // trenutnu env vrijednost, inace bi config i test mogli tiho divergirati.
    expect(mod.resolvedMaxWorkers).toBe(resolveMaxWorkers(process.env.VITEST_MAX_THREADS));
  });
});
