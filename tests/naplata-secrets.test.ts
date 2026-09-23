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
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import {
  NAPLATA_SECRETS,
  naplataSecretsVerdict,
  parseSupabaseSecretsList,
  supabaseSecretsVerdict,
  resolveSupabaseCli,
  EMPTY_VALUE_DIGEST,
} from '../scripts/verify-naplata-secrets.mjs';
import {
  envNames,
  storeIdSecretProblems,
  preflightSourceProblems,
  naplataDeployPathProblems,
} from './helpers/naplata-env';

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
    expect(src).toContain("['secrets', 'list'");
    expect(src).toContain("argv.includes('--env')");
    // Zadani put NE smije gledati process.env: on se cita tek unutar --env grane.
    const zadano = src.slice(src.indexOf("} else {", src.indexOf("argv.includes('--env')")));
    expect(zadano).not.toContain('process.env');
    expect(zadano).toContain('readSupabaseSecrets');
  });

  it('BASELINE: izvor preflighta nema nijedan poznat propust', () => {
    const problems = preflightSourceProblems(source('scripts/verify-naplata-secrets.mjs'));
    expect(problems, problems.join('; ')).toEqual([]);
  });
});

/**
 * GDJE JE CLI, i zasto to nije svejedno.
 *
 * IZMJERENO 2026-09-23 u ovom worktreeu: `node scripts/verify-naplata-secrets.mjs` je s golim
 * imenom izlazio s 1 uz `'supabase' is not recognized as an internal or external command`, dok
 * `./node_modules/.bin/supabase --version` ispisuje 2.109.1. Gard je time bio crven JEDNAKO i kad
 * su tajne ispravne i kad je `LEMONSQUEEZY_STORE_ID` prazan, dakle nije razlikovao dva stanja koja
 * je trebao razlikovati.
 */
describe('preflight razrjesava Supabase CLI iz repozitorija', () => {
  it('uzima node_modules/.bin kad postoji, po platformi', () => {
    const postoji = () => true;
    expect(resolveSupabaseCli('/repo', 'win32', postoji)).toBe(join('/repo', 'node_modules', '.bin', 'supabase.cmd'));
    expect(resolveSupabaseCli('/repo', 'linux', postoji)).toBe(join('/repo', 'node_modules', '.bin', 'supabase'));
  });

  it('pada natrag na globalnu instalaciju samo kad lokalne nema', () => {
    expect(resolveSupabaseCli('/repo', 'win32', () => false)).toBe('supabase');
  });

  it('u ovom repozitoriju se STVARNO razrjesava na lokalni CLI (ne na goli PATH)', () => {
    // Ovo je tvrdnja o disku, ne o funkciji: da lokalni CLI doista postoji tamo gdje ga trazimo.
    const cli = resolveSupabaseCli();
    expect(cli, cli).not.toBe('supabase');
    expect(existsSync(cli)).toBe(true);
  });
});

/**
 * PUT DEPLOYA. Preflight koji nitko ne pokrene nije obrana: do 2026-09-23 ga nije dosezao nijedan
 * automatski put (`npm run check` ga ne vidi, `release:check` ne zna za naplatu), pa je jedina
 * brana bila da se operater sjeti retka iz runbooka. Sada je deploy naplate jedna naredba koja
 * preflight nosi u sebi.
 *
 * Granica tvrdnje, izricito: ovo NE dokazuje da ijedan CI ili gate pokrece preflight. Dokazuje da
 * put kojim runbook salje operatera ne moze zaobici provjeru.
 */
describe('deploy naplate ide kroz preflight', () => {
  const RUNBOOK = source('docs/GO_LIVE_NAPLATA.md');
  const PKG = JSON.parse(source('package.json')) as { scripts?: Record<string, string> };
  const PREFLIGHT = source('scripts/verify-naplata-secrets.mjs');

  it('BASELINE: put deploya nema nijedan poznat propust', () => {
    const problems = naplataDeployPathProblems(RUNBOOK, PKG, PREFLIGHT);
    expect(problems, problems.join('; ')).toEqual([]);
  });

  it('gard grize: runbook koji vraca goli supabase functions deploy se prijavi', () => {
    const mutated = RUNBOOK.replace('npm run deploy:naplata\n', 'supabase functions deploy webhook-mor\n');
    expect(mutated).not.toBe(RUNBOOK);
    expect(naplataDeployPathProblems(mutated, PKG, PREFLIGHT).join('; ')).toContain('zaobilazi preflight');
  });

  it('gard grize: npm skripta bez --deploy se prijavi', () => {
    const mutated = { scripts: { 'deploy:naplata': 'supabase functions deploy webhook-mor' } };
    expect(naplataDeployPathProblems(RUNBOOK, mutated, PREFLIGHT).join('; ')).toContain('preflight');
  });

  it('gard grize: deploy prije presude o tajnama se prijavi', () => {
    // MUTACIJA u memoriji: makni presudu, pa deploy poziv ostaje bez provjere ispred sebe.
    const mutated = PREFLIGHT.replace('const verdict = supabaseSecretsVerdict(read.rows);', '');
    expect(mutated).not.toBe(PREFLIGHT);
    expect(naplataDeployPathProblems(RUNBOOK, PKG, mutated).join('; '))
      .toContain('ne deploya tek nakon presude');
  });

  it('gard grize: zastavica za preskakanje preflighta se prijavi', () => {
    const mutated = `${PREFLIGHT}\n// argv.includes('--skip-preflight')\n`;
    expect(naplataDeployPathProblems(RUNBOOK, PKG, mutated).join('; ')).toContain('zastavicu za preskakanje');
  });
});
