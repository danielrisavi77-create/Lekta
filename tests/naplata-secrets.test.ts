// @vitest-environment node
/**
 * Gard nad tajnama naplate: jedno ime po tajni, i nijedno ime koje nitko ne cita.
 *
 * PORIJEKLO: master (4addb5db, 81a89f2f, daf5f53a) ga je uveo za prijasnjeg pruzatelja naplate,
 * nakon izmjerenog kvara (2026-09-22): dvije funkcije iste naplate citale su dvije razlicite tajne
 * za istu stvar, pa je operater postavio jednu i vjerovao da je naplata konfigurirana. Kupac
 * plati, entitlement ne nastane. Pri spajanju mastera u design/pack3 (2026-09-26) gard je prenesen
 * na Stripe (F18), uz istu strogocu.
 *
 * Tvrdnje:
 *  1. Svaka funkcija naplate cita tocno ona Stripe imena koja runbook i preflight imenuju, i
 *     nijedna vise ne cita ime ukinutog pruzatelja.
 *  2. Preflight (`scripts/verify-naplata-secrets.mjs`) tvrdo pada na praznu ili nepostojecu
 *     obaveznu tajnu, a NE pada na izostanak neobavezne (`STRIPE_ALLOW_TEST_MODE`). Pada i na
 *     POSTAVLJENU zabranjenu tajnu (`STRIPE_ACCOUNT_ID`, nalaz pregleda kruga 3): nijedna funkcija
 *     je ne cita, a operater bi vjerovao da je Connect racun konfiguriran. Dokazuje se nad CISTOM
 *     funkcijom, ne nad procesom.
 *  3. Preflight mjeri OKOLINU U KOJOJ EDGE FUNKCIJA RADI (Supabase Edge secrets), ne lokalnu
 *     ljusku, i nepoznatu okolinu ne tumaci kao zelenu.
 *  4. Ukljucen testni nacin (`STRIPE_ALLOW_TEST_MODE=1`) obara deploy bez izricite zastavice.
 *  5. Svaka grana koja rusi proces STVARNO ga rusi: skripta se izvodi u podprocesu nad laznim
 *     Supabase CLI-jem (nalaz pregleda 2026-09-27: tekstualni gard nije vidio `if (false) {`).
 *
 * Tvrdnja 1 se mjeri nad IZVOROM Deno ulaza (`index.ts`), jer se on pod vitestom ne izvodi. To je
 * staticka provjera i tako je i imenovana.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import {
  NAPLATA_SECRETS,
  NAPLATA_OPTIONAL_SECRETS,
  NAPLATA_FORBIDDEN_SECRETS,
  forbiddenSecretsVerdict,
  forbiddenEnvVerdict,
  testModeEnvVerdict,
  TEST_MODE_SECRET,
  TEST_MODE_ON_DIGEST,
  naplataSecretsVerdict,
  parseSupabaseSecretsList,
  supabaseSecretsVerdict,
  testModeVerdict,
  resolveSupabaseCli,
  EMPTY_VALUE_DIGEST,
} from '../scripts/verify-naplata-secrets.mjs';
import {
  envNames,
  stripeSecretNameProblems,
  preflightSourceProblems,
  preflightExecutionProblems,
  PREFLIGHT_SLUCAJEVI,
  PROJECT_REF,
  naplataDeployPathProblems,
  readTextLf,
  normalizeLf,
} from './helpers/naplata-env';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Normalizira CRLF u LF pri citanju: u checkoutu s core.autocrlf=true tekstualne datoteke
// (runbook, .md, .mjs) dolaze s `\r\n`, a mutacije nize u ovoj datoteci trebaju doslovni `\n`.
const source = (relative: string): string => readTextLf(resolve(ROOT, relative));

const WEBHOOK_SRC = source('supabase/functions/webhook-mor/index.ts');
const CHECKOUT_SRC = source('supabase/functions/create-checkout/index.ts');

describe('naplata: funkcije citaju imena tajni koja runbook i preflight imenuju', () => {
  it('mjerenje je netrivijalno (prazan izvod ne smije "proci")', () => {
    expect(envNames(WEBHOOK_SRC).size).toBeGreaterThanOrEqual(4);
    expect(envNames(CHECKOUT_SRC).size).toBeGreaterThanOrEqual(4);
  });

  it('BASELINE: svaka funkcija cita svoja Stripe imena, nijedna ime ukinutog pruzatelja', () => {
    const problems = stripeSecretNameProblems({ 'webhook-mor': WEBHOOK_SRC, 'create-checkout': CHECKOUT_SRC });
    expect(problems, problems.join('; ')).toEqual([]);
  });

  it('gard grize: webhook-mor vracen na staro ime tajne potpisa se prijavi', () => {
    // MUTACIJA u memoriji (disk se ne dira): ime tajne potpisa kakvo je bilo prije Stripea.
    const mutated = WEBHOOK_SRC.replace("Deno.env.get('STRIPE_WEBHOOK_SECRET')", "Deno.env.get('MOR_WEBHOOK_SECRET')");
    expect(mutated).not.toBe(WEBHOOK_SRC);
    const problems = stripeSecretNameProblems({ 'webhook-mor': mutated, 'create-checkout': CHECKOUT_SRC }).join('; ');
    expect(problems).toContain('ne cita STRIPE_WEBHOOK_SECRET');
    expect(problems).toContain('MOR_WEBHOOK_SECRET');
  });

  it('gard grize: create-checkout bez publishable kljuca se prijavi', () => {
    const mutated = CHECKOUT_SRC.replace("Deno.env.get('STRIPE_PUBLISHABLE_KEY')", "''");
    expect(mutated).not.toBe(CHECKOUT_SRC);
    expect(stripeSecretNameProblems({ 'webhook-mor': WEBHOOK_SRC, 'create-checkout': mutated }).join('; '))
      .toContain('STRIPE_PUBLISHABLE_KEY');
  });

  /** Bez ovoga bi preflight mogao cuvati ime koje vise nitko ne cita: zeleno, a stiti nista. */
  it('svaka tajna s popisa preflighta (obavezna i neobavezna) se stvarno cita u nekoj funkciji naplate', () => {
    const read = new Set([...envNames(WEBHOOK_SRC), ...envNames(CHECKOUT_SRC)]);
    const dead = [...NAPLATA_SECRETS, ...NAPLATA_OPTIONAL_SECRETS].filter((name: string) => !read.has(name));
    expect(dead, `tajne koje preflight imenuje a nijedna funkcija naplate ne cita: ${dead.join(', ')}`).toEqual([]);
  });

  it('obavezne su tocno tajna kljuca, publishable kljuc i tajna potpisa', () => {
    expect([...NAPLATA_SECRETS]).toEqual(['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET']);
    expect([...NAPLATA_OPTIONAL_SECRETS]).toEqual([TEST_MODE_SECRET]);
    expect([...NAPLATA_FORBIDDEN_SECRETS]).toEqual(['STRIPE_ACCOUNT_ID']);
  });

  /** Obrat gornjeg: zabranjenu tajnu ne smije citati NIJEDNA funkcija, inace zabrana laze. */
  it('zabranjenu tajnu ne cita nijedna funkcija naplate', () => {
    const read = new Set([...envNames(WEBHOOK_SRC), ...envNames(CHECKOUT_SRC)]);
    expect(NAPLATA_FORBIDDEN_SECRETS.filter((name: string) => read.has(name))).toEqual([]);
  });

  it('gard grize: webhook-mor koji opet cita STRIPE_ACCOUNT_ID se prijavi', () => {
    // MUTACIJA u memoriji: vrati redak kakav je stajao do kruga 3.
    const mutated = WEBHOOK_SRC.replace(
      "const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';",
      "const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';\nconst STRIPE_ACCOUNT_ID = Deno.env.get('STRIPE_ACCOUNT_ID') ?? '';",
    );
    expect(mutated).not.toBe(WEBHOOK_SRC);
    expect(stripeSecretNameProblems({ 'webhook-mor': mutated, 'create-checkout': CHECKOUT_SRC }).join('; '))
      .toContain('cita STRIPE_ACCOUNT_ID');
  });
});

describe('preflight naplate: prazna tajna tvrdo pada', () => {
  const FULL = { STRIPE_SECRET_KEY: 'sk', STRIPE_PUBLISHABLE_KEY: 'pk', STRIPE_WEBHOOK_SECRET: 'whsec' };

  it('BASELINE: potpuna okolina prolazi', () => {
    expect(naplataSecretsVerdict(FULL)).toEqual({ ok: true, missing: [] });
  });

  it('prazan STRIPE_WEBHOOK_SECRET je NEPOSTAVLJEN, ne "postavljen na prazno"', () => {
    // Prazna tajna potpisa: verifyStripeSignature odbija SVAKI dogadjaj s `missing_secret`.
    expect(naplataSecretsVerdict({ ...FULL, STRIPE_WEBHOOK_SECRET: '' })).toEqual({
      ok: false,
      missing: ['STRIPE_WEBHOOK_SECRET'],
    });
    expect(naplataSecretsVerdict({ ...FULL, STRIPE_WEBHOOK_SECRET: '   ' }).missing).toEqual(['STRIPE_WEBHOOK_SECRET']);
    const bezKljuca: Record<string, string> = { ...FULL };
    delete bezKljuca.STRIPE_SECRET_KEY;
    expect(naplataSecretsVerdict(bezKljuca).missing).toEqual(['STRIPE_SECRET_KEY']);
  });

  it('neobavezni STRIPE_ALLOW_TEST_MODE koji nedostaje NE obara preflight', () => {
    expect(naplataSecretsVerdict(FULL).ok).toBe(true);
    expect(naplataSecretsVerdict({ ...FULL, STRIPE_ALLOW_TEST_MODE: '' }).ok).toBe(true);
  });

  it('--env: postavljen STRIPE_ACCOUNT_ID obara preflight, prazan ili nepostojeci ne', () => {
    expect(forbiddenEnvVerdict(FULL)).toEqual({ ok: true, present: [] });
    expect(forbiddenEnvVerdict({ ...FULL, STRIPE_ACCOUNT_ID: '  ' }).ok).toBe(true);
    expect(forbiddenEnvVerdict({ ...FULL, STRIPE_ACCOUNT_ID: 'acct_1Nas' })).toEqual({
      ok: false,
      present: ['STRIPE_ACCOUNT_ID'],
    });
    expect(forbiddenEnvVerdict(undefined).ok).toBe(true);
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
    '         NAME             |                              DIGEST',
    '  ------------------------|------------------------------------------------------------------',
    '  STRIPE_SECRET_KEY       | 1f2e3d4c5b6a7988',
    '  STRIPE_PUBLISHABLE_KEY  | aabbccddeeff0011',
    '  STRIPE_WEBHOOK_SECRET   | 99887766554433',
  ].join('\n');

  it('cita tablicni izlaz CLI-ja (zaglavlje i razdjelnik nisu tajne)', () => {
    const rows = parseSupabaseSecretsList(TABLICA);
    expect(rows.map((r: { name: string }) => r.name)).toEqual([
      'STRIPE_SECRET_KEY',
      'STRIPE_PUBLISHABLE_KEY',
      'STRIPE_WEBHOOK_SECRET',
    ]);
  });

  it('cita i JSON izlaz (--output json)', () => {
    const rows = parseSupabaseSecretsList('[{"name":"STRIPE_WEBHOOK_SECRET","value":"ABCD"}]');
    expect(rows).toEqual([{ name: 'STRIPE_WEBHOOK_SECRET', digest: 'abcd' }]);
  });

  it('BASELINE: potpun popis tajni projekta prolazi', () => {
    expect(supabaseSecretsVerdict(parseSupabaseSecretsList(TABLICA))).toEqual({ ok: true, missing: [] });
  });

  it('tajna koje nema u projektu se imenuje kao "nema"', () => {
    const bezPotpisa = TABLICA.split('\n').filter((l) => !l.includes('STRIPE_WEBHOOK_SECRET')).join('\n');
    expect(supabaseSecretsVerdict(parseSupabaseSecretsList(bezPotpisa)).missing).toEqual([
      { name: 'STRIPE_WEBHOOK_SECRET', reason: 'nema' },
    ]);
  });

  /**
   * Supabase secret postavljen na PRAZNO u sucelju izgleda kao da postoji; CLI ga prikazuje s
   * digestom praznog stringa. `verifyStripeSignature` ga vidi isto kao da ga nema.
   */
  it('tajna postavljena na prazno se imenuje kao "prazna", ne kao postojeca', () => {
    const prazan = TABLICA.replace('99887766554433', EMPTY_VALUE_DIGEST);
    expect(prazan).not.toBe(TABLICA);
    expect(supabaseSecretsVerdict(parseSupabaseSecretsList(prazan)).missing).toEqual([
      { name: 'STRIPE_WEBHOOK_SECRET', reason: 'prazna' },
    ]);
  });

  /**
   * Codex pregled kruga 3: redak bez digesta je nepoznata vrijednost. Prije je prolazio kao
   * postavljen, iako se iz njega ne vidi je li tajna prazna.
   */
  it('obavezna tajna bez digesta je "nepoznata", ne postavljena', () => {
    expect(supabaseSecretsVerdict([
      { name: 'STRIPE_SECRET_KEY', digest: '11aa' },
      { name: 'STRIPE_PUBLISHABLE_KEY', digest: '22bb' },
      { name: 'STRIPE_WEBHOOK_SECRET', digest: '' },
    ]).missing).toEqual([{ name: 'STRIPE_WEBHOOK_SECRET', reason: 'nepoznata' }]);
    expect(supabaseSecretsVerdict([
      { name: 'STRIPE_SECRET_KEY', digest: '11aa' },
      { name: 'STRIPE_PUBLISHABLE_KEY', digest: '22bb' },
      { name: 'STRIPE_WEBHOOK_SECRET' },
    ]).ok).toBe(false);
    // Tekst koji nije heksadecimalan (npr. status nakon promjene CLI izlaza) nije digest.
    expect(supabaseSecretsVerdict([
      { name: 'STRIPE_SECRET_KEY', digest: '11aa' },
      { name: 'STRIPE_PUBLISHABLE_KEY', digest: '22bb' },
      { name: 'STRIPE_WEBHOOK_SECRET', digest: 'set' },
    ]).missing).toEqual([{ name: 'STRIPE_WEBHOOK_SECRET', reason: 'nepoznata' }]);
    // Tablicni redak s praznim stupcem digesta daje isti ishod.
    const bezDigesta = TABLICA.replace('99887766554433', '');
    expect(bezDigesta).not.toBe(TABLICA);
    expect(supabaseSecretsVerdict(parseSupabaseSecretsList(bezDigesta)).missing).toEqual([
      { name: 'STRIPE_WEBHOOK_SECRET', reason: 'nepoznata' },
    ]);
  });

  /** Stanje tijekom bete (naplata iskljucena, tajne prazne): deploy naplate mora pasti. */
  it('beta: sve obavezne tajne prazne daju tri imenovana razloga, nikad zeleno', () => {
    const beta = NAPLATA_SECRETS.map((name: string) => `  ${name} | ${EMPTY_VALUE_DIGEST}`).join('\n');
    const verdict = supabaseSecretsVerdict(parseSupabaseSecretsList(beta));
    expect(verdict.ok).toBe(false);
    expect(verdict.missing).toEqual(NAPLATA_SECRETS.map((name: string) => ({ name, reason: 'prazna' })));
  });

  it('BASELINE: STRIPE_ACCOUNT_ID koji u projektu ne postoji ne obara presudu', () => {
    const rows = parseSupabaseSecretsList(TABLICA);
    expect(rows.some((r: { name: string }) => r.name === 'STRIPE_ACCOUNT_ID')).toBe(false);
    expect(supabaseSecretsVerdict(rows).ok).toBe(true);
    expect(forbiddenSecretsVerdict(rows)).toEqual({ ok: true, present: [] });
  });

  /**
   * Nalaz pregleda kruga 3: operater slijedi stari runbook ("opcionalno STRIPE_ACCOUNT_ID") i
   * postavi acct_... . Nijedna funkcija ga vise ne cita, pa preflight mora reci da je tajna
   * zabranjena, a ne sutke proci.
   */
  it('postavljen STRIPE_ACCOUNT_ID u projektu obara presudu, postavljen na prazno ne', () => {
    const sRacunom = `${TABLICA}\n  STRIPE_ACCOUNT_ID       | 5f5e5d5c5b5a`;
    expect(forbiddenSecretsVerdict(parseSupabaseSecretsList(sRacunom))).toEqual({
      ok: false,
      present: ['STRIPE_ACCOUNT_ID'],
    });
    const prazan = `${TABLICA}\n  STRIPE_ACCOUNT_ID       | ${EMPTY_VALUE_DIGEST}`;
    expect(forbiddenSecretsVerdict(parseSupabaseSecretsList(prazan)).ok).toBe(true);
    // Redak bez digesta je nepoznata vrijednost, dakle postavljen: nepoznato nije zeleno.
    expect(forbiddenSecretsVerdict([{ name: 'STRIPE_ACCOUNT_ID' }]).ok).toBe(false);
    expect(forbiddenSecretsVerdict(undefined as unknown as []).ok).toBe(true);
  });

  it('CLI odbija deploy s postavljenom zabranjenom tajnom PRIJE deploya', () => {
    const src = source('scripts/verify-naplata-secrets.mjs');
    const provjera = src.indexOf('forbiddenSecretsVerdict(read.rows)');
    const deploy = src.indexOf("'functions', 'deploy'");
    expect(provjera).toBeGreaterThan(-1);
    expect(deploy).toBeGreaterThan(provjera);
    const mutated = src.replace('const zabranjene = forbiddenSecretsVerdict(read.rows);', 'const zabranjene = { ok: true, present: [] };');
    expect(mutated).not.toBe(src);
    expect(preflightSourceProblems(mutated).join('; ')).toContain('STRIPE_ACCOUNT_ID');
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
 * TOCKA 4: testni nacin rada u okolini deploya.
 *
 * Uz `STRIPE_ALLOW_TEST_MODE=1` testni Stripe dogadjaj s ispravnim potpisom dodjeljuje PRAVO pravo
 * pristupa (audit PAY-05). Preflight to vidi po digestu vrijednosti `1`. Granica tvrdnje: ovisi o
 * tome da Supabase prikazuje SHA-256; nad zivim projektom NIJE provjereno.
 */
describe('preflight naplate: ukljucen testni nacin obara deploy', () => {
  it('digest konstante je SHA-256 niza "1"', async () => {
    const { createHash } = await import('node:crypto');
    expect(createHash('sha256').update('1').digest('hex')).toBe(TEST_MODE_ON_DIGEST);
  });

  it('STRIPE_ALLOW_TEST_MODE=1 u projektu je prepoznat', () => {
    expect(testModeVerdict([{ name: TEST_MODE_SECRET, digest: TEST_MODE_ON_DIGEST.toUpperCase() }])).toBe(true);
  });

  it('BASELINE: prazna, nepostojeca ili druga vrijednost nije testni nacin', () => {
    expect(testModeVerdict([])).toBe(false);
    expect(testModeVerdict([{ name: TEST_MODE_SECRET, digest: EMPTY_VALUE_DIGEST }])).toBe(false);
    expect(testModeVerdict([{ name: TEST_MODE_SECRET, digest: 'abcd' }])).toBe(false);
  });

  /** Codex pregled kruga 3: vrijednost koja se ne vidi mogla bi biti `1`; nepoznato nije zeleno. */
  it('STRIPE_ALLOW_TEST_MODE bez prepoznatljivog digesta broji se kao ukljucen', () => {
    expect(testModeVerdict([{ name: TEST_MODE_SECRET }])).toBe(true);
    expect(testModeVerdict([{ name: TEST_MODE_SECRET, digest: '' }])).toBe(true);
    expect(testModeVerdict([{ name: TEST_MODE_SECRET, digest: 'nije postavljeno' }])).toBe(true);
    expect(testModeVerdict(undefined as unknown as [])).toBe(false);
  });

  it('--env: ukljucen testni nacin u ljusci je prepoznat, prazan ili drugi nije', () => {
    expect(testModeEnvVerdict({ [TEST_MODE_SECRET]: '1' })).toBe(true);
    expect(testModeEnvVerdict({ [TEST_MODE_SECRET]: ' 1 ' })).toBe(true);
    expect(testModeEnvVerdict({ [TEST_MODE_SECRET]: '' })).toBe(false);
    expect(testModeEnvVerdict({ [TEST_MODE_SECRET]: '0' })).toBe(false);
    expect(testModeEnvVerdict({})).toBe(false);
    expect(testModeEnvVerdict(undefined)).toBe(false);
  });

  it('gard grize: --env grana bez provjere testnog nacina se prijavi', () => {
    const src = source('scripts/verify-naplata-secrets.mjs');
    const mutated = src.replace('if (testModeEnvVerdict(process.env)', 'if (false');
    expect(mutated).not.toBe(src);
    expect(preflightSourceProblems(mutated).join('; ')).toContain('--env grana preflighta ne odbija ukljucen testni nacin');
  });

  it('CLI odbija deploy s ukljucenim testnim nacinom PRIJE deploya, osim uz izricitu zastavicu', () => {
    const src = source('scripts/verify-naplata-secrets.mjs');
    const provjera = src.indexOf('testModeVerdict(read.rows)');
    const deploy = src.indexOf("'functions', 'deploy'");
    expect(provjera).toBeGreaterThan(-1);
    expect(deploy).toBeGreaterThan(provjera);
    expect(src).toContain("argv.includes('--dopusti-testni-nacin')");
  });
});

/**
 * TOCKA 5: preflight mjeren IZVRSAVANJEM, ne samo tekstom (nalaz pregleda nakon spajanja mastera,
 * 2026-09-27). Tekstualni gard je bio prazan nad `if (false) {` i `&& false`; izvrseni gard
 * pokrece stvarnu skriptu u podprocesu nad laznim Supabase CLI-jem. Mutacije su u
 * `tests/gate-mutations.test.ts` (`naplata/izvor-*`).
 */
describe('preflight naplate: izvrsena skripta rusi proces na svakoj grani', () => {
  it('generator slucajeva proizvodi ciljanu klasu ulaza (popis se parsira kako slucaj tvrdi)', () => {
    const byId = new Map(PREFLIGHT_SLUCAJEVI.map((s) => [s.id, s]));
    const redci = (id: string) => parseSupabaseSecretsList((byId.get(id)?.popis ?? []).join('\n'));
    // Cisti popis: tri obavezne tajne s prepoznatljivim digestom, presude zelene.
    expect(redci('zadano-cisto')).toHaveLength(3);
    expect(supabaseSecretsVerdict(redci('zadano-cisto')).ok).toBe(true);
    // Svaki slucaj koji pada razlikuje se od cistog u TOCNO onome sto imenuje.
    expect(forbiddenSecretsVerdict(redci('zadano-zabranjena-tajna')).present).toEqual(['STRIPE_ACCOUNT_ID']);
    expect(supabaseSecretsVerdict(redci('zadano-zabranjena-tajna')).ok).toBe(true);
    expect(supabaseSecretsVerdict(redci('zadano-obavezna-bez-digesta')).missing).toEqual([
      { name: 'STRIPE_WEBHOOK_SECRET', reason: 'nepoznata' },
    ]);
    expect(testModeVerdict(redci('zadano-testni-bez-digesta'))).toBe(true);
    expect(redci('zadano-testni-bez-digesta').find((r) => r.name === TEST_MODE_SECRET)?.digest).toBe('');
    expect(redci('zadano-testni-ukljucen').find((r) => r.name === TEST_MODE_SECRET)?.digest).toBe(TEST_MODE_ON_DIGEST);
    // --env slucajevi: ljuska je potpuna, a razlikuje se samo u imenovanoj varijabli.
    expect(naplataSecretsVerdict(byId.get('env-cisto')?.ljuska ?? {}).ok).toBe(true);
    expect(forbiddenEnvVerdict(byId.get('env-zabranjena-tajna')?.ljuska ?? {}).present).toEqual(['STRIPE_ACCOUNT_ID']);
    expect(testModeEnvVerdict(byId.get('env-testni-ukljucen')?.ljuska ?? {})).toBe(true);
    // Svaka grana koja rusi proces ima vlastiti slucaj; dva cista slucaja stite od vakuuma.
    expect(forbiddenSecretsVerdict(redci('provjera-zabranjena-tajna')).present).toEqual(['STRIPE_ACCOUNT_ID']);
    expect(testModeVerdict(redci('provjera-testni-ukljucen'))).toBe(true);
    // Oblik iz runbooka (`-- --project-ref <ref>`): isti popisi kao zadani put, uz ref u argumentima.
    for (const id of ['ref-cisto', 'ref-zabranjena-tajna', 'ref-testni-ukljucen']) {
      const args = byId.get(id)?.args ?? [];
      expect(args.slice(args.indexOf('--project-ref'), args.indexOf('--project-ref') + 2), id).toEqual(['--project-ref', PROJECT_REF]);
      expect(args, id).toContain('--deploy');
    }
    expect(supabaseSecretsVerdict(redci('ref-cisto')).ok).toBe(true);
    expect(forbiddenSecretsVerdict(redci('ref-cisto')).ok).toBe(true);
    expect(testModeVerdict(redci('ref-cisto'))).toBe(false);
    expect(forbiddenSecretsVerdict(redci('ref-zabranjena-tajna')).present).toEqual(['STRIPE_ACCOUNT_ID']);
    expect(supabaseSecretsVerdict(redci('ref-zabranjena-tajna')).ok).toBe(true);
    expect(testModeVerdict(redci('ref-testni-ukljucen'))).toBe(true);
    expect(forbiddenSecretsVerdict(redci('ref-testni-ukljucen')).ok).toBe(true);
    expect(PREFLIGHT_SLUCAJEVI.filter((s) => s.pada)).toHaveLength(10);
    expect(PREFLIGHT_SLUCAJEVI.filter((s) => !s.pada).map((s) => s.id)).toEqual(['zadano-cisto', 'env-cisto', 'ref-cisto']);
  });

  it('BASELINE: stvarna skripta prolazi sve slucajeve (cisto zeleno, svaka grana pada imenovano, bez deploya)', () => {
    const problems = preflightExecutionProblems(source('scripts/verify-naplata-secrets.mjs'));
    expect(problems, problems.join('; ')).toEqual([]);
  }, 120_000);

  it('gard grize: ugasena --env grana zabranjene tajne (`if (false) {`) se prijavi izvrsavanjem i tekstom', () => {
    const src = source('scripts/verify-naplata-secrets.mjs');
    const mutated = src.replace('if (!zabranjene.ok) {', 'if (false) {');
    expect(mutated).not.toBe(src);
    expect(preflightSourceProblems(mutated).join('; ')).toContain('--env grana preflighta ne odbija postavljenu zabranjenu tajnu');
    const problems = preflightExecutionProblems(mutated, ['env-zabranjena-tajna', 'env-cisto']);
    expect(problems.join('; ')).toContain('[env-zabranjena-tajna] preflight NIJE srusio proces');
    expect(problems.some((p) => p.startsWith('[env-cisto]'))).toBe(false);
  }, 60_000);

  it('gard grize: --project-ref koji se ne prosljedjuje CLI-ju se prijavi (mjeri se tudji, povezan projekt)', () => {
    const src = source('scripts/verify-naplata-secrets.mjs');
    const mutated = src.replace(
      "return i >= 0 && argv[i + 1] ? ['--project-ref', argv[i + 1]] : [];",
      'return [];',
    );
    expect(mutated).not.toBe(src);
    const problems = preflightExecutionProblems(mutated, ['ref-cisto', 'ref-zabranjena-tajna', 'zadano-cisto']);
    expect(problems.join('; ')).toContain(`[ref-cisto] lazni CLI nije pitan \`secrets list --project-ref ${PROJECT_REF}\``);
    expect(problems.some((p) => p.startsWith('[ref-zabranjena-tajna]'))).toBe(true);
    expect(problems.some((p) => p.startsWith('[zadano-cisto]'))).toBe(false);
  }, 60_000);

  it('gard grize: zabranjena tajna i testni nacin propusteni samo uz --project-ref se prijave', () => {
    const src = source('scripts/verify-naplata-secrets.mjs');
    const drugi = src.indexOf('if (!zabranjene.ok) {', src.indexOf('if (!zabranjene.ok) {') + 1);
    expect(drugi).toBeGreaterThan(0);
    const mutated = (src.slice(0, drugi) + 'if (!zabranjene.ok && projectRef.length === 0) {'
      + src.slice(drugi + 'if (!zabranjene.ok) {'.length))
      .replace(
        "testModeVerdict(read.rows) && !argv.includes('--dopusti-testni-nacin')",
        "testModeVerdict(read.rows) && projectRef.length === 0 && !argv.includes('--dopusti-testni-nacin')",
      );
    expect(mutated).not.toContain("testModeVerdict(read.rows) && !argv.includes('--dopusti-testni-nacin')");
    const problems = preflightExecutionProblems(mutated, [
      'ref-zabranjena-tajna', 'ref-testni-ukljucen', 'zadano-zabranjena-tajna', 'zadano-testni-ukljucen', 'ref-cisto',
    ]);
    expect(problems.join('; ')).toContain('[ref-zabranjena-tajna] preflight NIJE srusio proces');
    expect(problems.join('; ')).toContain('[ref-testni-ukljucen] preflight NIJE srusio proces');
    // Bez zastavice iste grane i dalje grizu, a cisti slucaj s refom prolazi: mutacija gasi granu, ne skriptu.
    expect(problems.some((p) => /^\[(zadano-zabranjena-tajna|zadano-testni-ukljucen|ref-cisto)\]/.test(p))).toBe(false);
  }, 60_000);

  it('nepoznat slucaj ili prazan odabir nije zeleno', () => {
    expect(preflightExecutionProblems('', ['nema-takvog'])).toContain('[nema-takvog] nepoznat slucaj preflighta');
    expect(preflightExecutionProblems('', [])).toContain('nijedan slucaj preflighta nije izveden (nema sto mjeriti)');
  });
});

/**
 * GDJE JE CLI, i zasto to nije svejedno.
 *
 * IZMJERENO na masteru 2026-09-23: s golim imenom iz PATH-a skripta je izlazila s 1 uz
 * `'supabase' is not recognized as an internal or external command`, dok
 * `./node_modules/.bin/supabase --version` ispisuje verziju. Gard je time bio crven JEDNAKO i kad
 * su tajne ispravne i kad su prazne, dakle nije razlikovao dva stanja koja je trebao razlikovati.
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
 * PUT DEPLOYA. Preflight koji nitko ne pokrene nije obrana: `npm run check` ga ne vidi, a
 * `release:check` ne zna za naplatu, pa je deploy naplate jedna naredba koja preflight nosi u sebi.
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

  /**
   * DOKAZ CRLF NEOSJETLJIVOSTI: umjetno vraca CRLF (kakav bi dao checkout s autocrlf=true) i
   * pokazuje da ISTA mutacija i dalje pogadja redak i daje ISTI nalaz kao LF verzija.
   */
  it('CRLF varijanta runbooka (kao iz autocrlf=true checkouta) daje isti nalaz kao LF', () => {
    const crlfRunbook = RUNBOOK.replace(/\n/g, '\r\n');
    expect(crlfRunbook).not.toBe(RUNBOOK);
    expect(crlfRunbook.includes('\r\n')).toBe(true);

    expect(naplataDeployPathProblems(crlfRunbook, PKG, PREFLIGHT)).toEqual(
      naplataDeployPathProblems(RUNBOOK, PKG, PREFLIGHT),
    );

    const normalizovan = normalizeLf(crlfRunbook);
    const mutated = normalizovan.replace('npm run deploy:naplata\n', 'supabase functions deploy webhook-mor\n');
    expect(mutated).not.toBe(normalizovan);
    expect(naplataDeployPathProblems(mutated, PKG, PREFLIGHT)).toEqual(
      naplataDeployPathProblems(
        RUNBOOK.replace('npm run deploy:naplata\n', 'supabase functions deploy webhook-mor\n'),
        PKG,
        PREFLIGHT,
      ),
    );
    expect(naplataDeployPathProblems(mutated, PKG, PREFLIGHT).join('; ')).toContain('zaobilazi preflight');
  });
});
