/**
 * Gard nad tajnama naplate: jedno ime po tajni, i nijedno ime koje nitko ne cita.
 *
 * IZMJERENI KVAR (2026-09-22, prije ove promjene): `supabase/functions/webhook-mor/index.ts` je
 * citao `Deno.env.get('LS_STORE_ID')`, a `supabase/functions/create-checkout/index.ts`
 * `Deno.env.get('LEMONSQUEEZY_STORE_ID')`. Dvije funkcije iste naplate trazile su dvije razlicite
 * tajne za ISTU trgovinu. Nijedan dokument (`docs/GO_LIVE_NAPLATA.md`, `supabase/README.md`) nije
 * spominjao `LS_STORE_ID`, pa je operater koji slijedi runbook postavio samo drugu: checkout bi
 * radio, a `acceptEvent` bi svaku kupnju odbio s `store_unverifiable` i vratio 200, pa ni provider
 * ne bi retryjao. Kupac plati, entitlement ne nastane.
 *
 * Zato ovdje dvije razdvojene tvrdnje:
 *  1. Obje funkcije naplate citaju ISTO ime tajne za store id (kvar iznad se ne moze vratiti).
 *  2. Preflight (`scripts/verify-naplata-secrets.mjs`) tvrdo pada na praznu vrijednost, i to se
 *     dokazuje nad CISTOM funkcijom, ne nad procesom.
 *
 * Tvrdnja 1 se mjeri nad IZVOROM Edge funkcija, jer se Deno kod ne izvodi pod vitestom. To je
 * staticka provjera i tako je i imenovana; ne tvrdi da funkcija radi, nego da cita ono ime koje
 * runbook i preflight imenuju.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { NAPLATA_SECRETS, naplataSecretsVerdict } from '../scripts/verify-naplata-secrets.mjs';
import { envNames, storeIdSecretProblems } from './helpers/naplata-env';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = (relative: string): string => readFileSync(resolve(ROOT, relative), 'utf8');

const WEBHOOK_SRC = source('supabase/functions/webhook-mor/index.ts');
const CHECKOUT_SRC = source('supabase/functions/create-checkout/index.ts');

describe('naplata: obje funkcije citaju isto ime tajne za trgovinu', () => {
  it('mjerenje je netrivijalno (prazan izvod ne smije "proci")', () => {
    expect(envNames(WEBHOOK_SRC).size).toBeGreaterThanOrEqual(4);
    expect(envNames(CHECKOUT_SRC).size).toBeGreaterThanOrEqual(4);
  });

  it('obje funkcije citaju LEMONSQUEEZY_STORE_ID, nijedna vise staro LS_STORE_ID', () => {
    const problems = storeIdSecretProblems({ 'webhook-mor': WEBHOOK_SRC, 'create-checkout': CHECKOUT_SRC });
    expect(problems, problems.join('; ')).toEqual([]);
  });

  it('gard grize: podmetnuto staro ime u webhook-mor se prijavi', () => {
    // MUTACIJA u memoriji (disk se ne dira): tocno stanje od prije 2026-09-22.
    const mutated = WEBHOOK_SRC.replace("Deno.env.get('LEMONSQUEEZY_STORE_ID')", "Deno.env.get('LS_STORE_ID')");
    expect(mutated).not.toBe(WEBHOOK_SRC);
    const problems = storeIdSecretProblems({ 'webhook-mor': mutated, 'create-checkout': CHECKOUT_SRC });
    expect(problems.join('; ')).toContain('LS_STORE_ID');
  });

  /**
   * Bez ovoga bi preflight mogao cuvati ime koje vise nitko ne cita: zeleno, a stiti nista.
   * `LS_ALLOW_TEST_MODE` NIJE na popisu obveznih jer je u produkciji namjerno prazan.
   */
  it('svaka tajna s popisa preflighta se stvarno cita u nekoj funkciji naplate', () => {
    const read = new Set([...envNames(WEBHOOK_SRC), ...envNames(CHECKOUT_SRC)]);
    const dead = NAPLATA_SECRETS.filter((name: string) => !read.has(name));
    expect(dead, `tajne koje preflight trazi a nijedna funkcija naplate ne cita: ${dead.join(', ')}`).toEqual([]);
  });
});

describe('preflight naplate: prazna tajna tvrdo pada', () => {
  const FULL = { MOR_WEBHOOK_SECRET: 'whsec', LEMONSQUEEZY_API_KEY: 'key', LEMONSQUEEZY_STORE_ID: '42' };

  it('BASELINE: potpuna okolina prolazi', () => {
    expect(naplataSecretsVerdict(FULL)).toEqual({ ok: true, missing: [] });
  });

  it('prazan LEMONSQUEEZY_STORE_ID je NEPOSTAVLJEN, ne "postavljen na prazno"', () => {
    // Supabase secret postavljen na prazno u sucelju izgleda kao da postoji; `acceptEvent` ga vidi
    // isto kao da ga nema, pa bi tolerancija ovdje bila tocno onaj tihi kvar koji se gasi.
    expect(naplataSecretsVerdict({ ...FULL, LEMONSQUEEZY_STORE_ID: '' })).toEqual({
      ok: false,
      missing: ['LEMONSQUEEZY_STORE_ID'],
    });
    expect(naplataSecretsVerdict({ ...FULL, LEMONSQUEEZY_STORE_ID: '   ' }).missing).toEqual(['LEMONSQUEEZY_STORE_ID']);
    const bezKljuca: Record<string, string> = { ...FULL };
    delete bezKljuca.LEMONSQUEEZY_STORE_ID;
    expect(naplataSecretsVerdict(bezKljuca).missing).toEqual(['LEMONSQUEEZY_STORE_ID']);
  });

  it('poruka imenuje SVE tajne koje nedostaju, ne samo prvu', () => {
    expect(naplataSecretsVerdict({}).missing).toEqual([...NAPLATA_SECRETS]);
  });

  it('prazna okolina ne prolazi ni slucajno (undefined umjesto objekta)', () => {
    expect(naplataSecretsVerdict(undefined).ok).toBe(false);
  });
});
