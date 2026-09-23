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
 *  3. Preflight mjeri OKOLINU U KOJOJ EDGE FUNKCIJA RADI (Supabase Edge secrets), ne lokalnu
 *     ljusku. Prva verzija je citala `process.env`, sto je druga os: operater s izvezenom
 *     varijablom dobio bi zeleno iako je tajna u projektu prazna.
 *
 * Tvrdnja 1 se mjeri nad IZVOROM Edge funkcija, jer se Deno kod ne izvodi pod vitestom. To je
 * staticka provjera i tako je i imenovana; ne tvrdi da funkcija radi, nego da cita ono ime koje
 * runbook i preflight imenuju.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  NAPLATA_SECRETS,
  naplataSecretsVerdict,
  parseSupabaseSecretsList,
  supabaseSecretsVerdict,
  EMPTY_VALUE_DIGEST,
} from '../scripts/verify-naplata-secrets.mjs';
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


/**
 * TOCKA 3: preflight mjeri okolinu u kojoj `webhook-mor` stvarno radi.
 *
 * Mjeri se nad CISTIM funkcijama koje primaju izlaz `supabase secrets list`, jer se ziva Supabase
 * okolina u ovom stablu ne moze dohvatiti. Tvrdnja je zato uza od "produkcija je ispravna": tvrdi
 * da preflight gleda popis tajni projekta i da praznu vrijednost vidi kao nepostavljenu.
 */
describe('preflight naplate: mjeri Supabase Edge secrets, ne lokalnu ljusku', () => {
  const TABLICA = [
    '         NAME          |                              DIGEST',
    '  ---------------------|------------------------------------------------------------------',
    '  MOR_WEBHOOK_SECRET   | 1f2e3d4c5b6a7988',
    '  LEMONSQUEEZY_API_KEY | aabbccddeeff0011',
    '  LEMONSQUEEZY_STORE_ID | 99887766554433',
  ].join('\n');

  it('cita tablicni izlaz CLI-ja (zaglavlje i razdjelnik nisu tajne)', () => {
    const rows = parseSupabaseSecretsList(TABLICA);
    expect(rows.map((r: { name: string }) => r.name)).toEqual([
      'MOR_WEBHOOK_SECRET',
      'LEMONSQUEEZY_API_KEY',
      'LEMONSQUEEZY_STORE_ID',
    ]);
  });

  it('cita i JSON izlaz (--output json)', () => {
    const rows = parseSupabaseSecretsList('[{"name":"LEMONSQUEEZY_STORE_ID","value":"ABCD"}]');
    expect(rows).toEqual([{ name: 'LEMONSQUEEZY_STORE_ID', digest: 'abcd' }]);
  });

  it('BASELINE: potpun popis tajni projekta prolazi', () => {
    expect(supabaseSecretsVerdict(parseSupabaseSecretsList(TABLICA))).toEqual({ ok: true, missing: [] });
  });

  it('tajna koje nema u projektu se imenuje kao "nema"', () => {
    const bezStorea = TABLICA.split('\n').filter((l) => !l.includes('LEMONSQUEEZY_STORE_ID')).join('\n');
    expect(supabaseSecretsVerdict(parseSupabaseSecretsList(bezStorea)).missing).toEqual([
      { name: 'LEMONSQUEEZY_STORE_ID', reason: 'nema' },
    ]);
  });

  /**
   * Supabase secret postavljen na PRAZNO u sucelju izgleda kao da postoji; CLI ga prikazuje s
   * digestom praznog stringa. `acceptEvent` ga vidi isto kao da ga nema i odbija svaku kupnju s
   * 200, bez retryja, pa bi tolerancija ovdje bila upravo taj tihi kvar.
   */
  it('tajna postavljena na prazno se imenuje kao "prazna", ne kao postojeca', () => {
    const prazan = TABLICA.replace('99887766554433', EMPTY_VALUE_DIGEST);
    expect(prazan).not.toBe(TABLICA);
    expect(supabaseSecretsVerdict(parseSupabaseSecretsList(prazan)).missing).toEqual([
      { name: 'LEMONSQUEEZY_STORE_ID', reason: 'prazna' },
    ]);
  });

  /**
   * Prazan ili neprepoznat izlaz NE SMIJE izgledati kao "nema tajni pa je sve u redu"; skripta ga
   * tretira kao neprocitanu okolinu i izlazi s kodom 1 (vidi CLI blok).
   */
  it('neprepoznat izlaz daje prazan popis, a prazan popis ne moze biti zelen', () => {
    expect(parseSupabaseSecretsList('supabase: command not found')).toEqual([]);
    expect(parseSupabaseSecretsList('')).toEqual([]);
    expect(supabaseSecretsVerdict([]).ok).toBe(false);
    expect(supabaseSecretsVerdict(undefined as unknown as []).ok).toBe(false);
  });

  it('skripta zove `supabase secrets list`, a lokalnu ljusku samo na izricit --env', () => {
    // Staticka provjera izvora: bez nje bi funkcije mogle biti tocne, a CLI i dalje citati ljusku.
    const src = source('scripts/verify-naplata-secrets.mjs');
    expect(src).toContain("spawnSync('supabase'");
    expect(src).toContain("['secrets', 'list'");
    expect(src).toContain("argv.includes('--env')");
    // Zadani put NE smije gledati process.env: on se cita tek unutar --env grane.
    const zadano = src.slice(src.indexOf("} else {", src.indexOf("argv.includes('--env')")));
    expect(zadano).not.toContain('process.env');
    expect(zadano).toContain('readSupabaseSecrets');
  });
});
