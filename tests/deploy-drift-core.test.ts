/**
 * Gard za usporedbu iza `npm run deploy-drift`.
 *
 * Zasto postoji: skripta je dosad bila NETESTIRANA jer ima top-level await i mrezne pozive, pa je
 * test nije mogao uvesti bez izvodjenja. Posljedica su bila dva tiha kvara koje nijedan test nije
 * mogao vidjeti:
 *
 *  1. oznaka za funkciju koje ima samo na okolini bila je hardkodirana na "SAMO U PRODUKCIJI", pa
 *     je izvjestaj za staging tvrdio produkciju (`cleanup-agent-payloads` je na STAGINGU);
 *  2. usporedjivalo se samo POSTOJANJE funkcije, nikad njezina konfiguracija, pa je raskorak
 *     `verify_jwt` izmedju `config.toml` i zive okoline bio nevidljiv.
 *
 * Ciste funkcije su zato izvucene u `scripts/deploy-drift-core.mjs`, a ovdje se mjere.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error - .mjs bez tipova; namjerno, jer je rijec o build/ops skripti, ne o src modulu.
import { driftFor, labelForOnlyLive, configVerifyJwt, verifyJwtDrift } from '../scripts/deploy-drift-core.mjs';

const fn = (slug: string, verify_jwt?: boolean) => ({ slug, version: 1, status: 'ACTIVE', verify_jwt });

describe('driftFor: razlika po postojanju', () => {
  it('razvrstava samo-repo, samo-okolina i obostrane', () => {
    const d = driftFor(['a', 'b', 'c'], [fn('b'), fn('c'), fn('x')]);
    expect(d.onlyRepo).toEqual(['a']);
    expect(d.onlyLive).toEqual(['x']);
    expect(d.both).toEqual(['b', 'c']);
  });

  it('bez drifta kad se skupovi poklapaju (netrivijalnost u drugom smjeru)', () => {
    const d = driftFor(['a', 'b'], [fn('a'), fn('b')]);
    expect(d.onlyRepo).toEqual([]);
    expect(d.onlyLive).toEqual([]);
  });
});

describe('labelForOnlyLive: oznaka prati okolinu, ne pretpostavlja produkciju', () => {
  it('imenuje staging kad se mjeri staging', () => {
    expect(labelForOnlyLive('staging')).toContain('staging');
    // Tocno ovo je bio kvar: staging redak je pisao "PRODUKCIJI".
    expect(labelForOnlyLive('staging')).not.toMatch(/PRODUKCIJI/i);
  });

  it('imenuje produkciju kad se mjeri produkcija', () => {
    expect(labelForOnlyLive('produkcija')).toContain('produkcija');
  });
});

describe('configVerifyJwt: cita samo IZRICIT blok', () => {
  const toml = [
    '[functions.alfa]',
    'verify_jwt = true',
    '',
    '[functions.beta]',
    'verify_jwt = false',
    '',
    '[functions.gama]',
    'import_map = "./x.json"',
    '',
  ].join('\n');

  it('cita deklarirane vrijednosti', () => {
    const m = configVerifyJwt(toml);
    expect(m.get('alfa')).toBe(true);
    expect(m.get('beta')).toBe(false);
  });

  it('funkcija bez `verify_jwt` je NEPOZNATA, ne `false`', () => {
    // Kljucna razlika: CLI default je `true`, pa bi tumacenje "nema bloka = false" sakrilo
    // upravo onaj slucaj u kojem deploy zatvori javni endpoint.
    expect(configVerifyJwt(toml).has('gama')).toBe(false);
  });

  it('vrijednost ne curi iz susjednog bloka', () => {
    const m = configVerifyJwt('[functions.prvi]\nverify_jwt = true\n\n[functions.drugi]\n');
    expect(m.get('prvi')).toBe(true);
    expect(m.has('drugi')).toBe(false);
  });
});

describe('verifyJwtDrift: config nasuprot zivoj okolini', () => {
  const live = new Map([
    ['alfa', fn('alfa', true)],
    ['beta', fn('beta', false)],
  ]);

  it('poklapanje ne daje nijedan nalaz (netrivijalnost)', () => {
    const cfg = new Map([['alfa', true], ['beta', false]]);
    expect(verifyJwtDrift(cfg, live)).toEqual([]);
  });

  it('funkcija bez bloka u configu je `missing-config`', () => {
    const cfg = new Map([['alfa', true]]);
    const found = verifyJwtDrift(cfg, live);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ slug: 'beta', kind: 'missing-config', actual: false });
  });

  it('razlicita vrijednost je `mismatch`', () => {
    const cfg = new Map([['alfa', false], ['beta', false]]);
    const found = verifyJwtDrift(cfg, live);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ slug: 'alfa', kind: 'mismatch', declared: false, actual: true });
  });
});

/**
 * Tvrdnja nad STVARNIM `config.toml`, ne nad izmisljenim primjerom. Ovo je gard koji bi 2026-08-29
 * uhvatio `analytics-event` i `record-completion-check` prije nego ih deploy tiho zatvori.
 */
describe('stvarni config.toml pokriva svaku funkciju u repou', () => {
  const root = join(__dirname, '..');
  const repoFunctions = readdirSync(join(root, 'supabase', 'functions'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)
    .sort();

  it('mjeri netrivijalan broj funkcija', () => {
    expect(repoFunctions.length).toBeGreaterThan(15);
  });

  it('svaka funkcija ima izricit `verify_jwt`', () => {
    const declared = configVerifyJwt(readFileSync(join(root, 'supabase', 'config.toml'), 'utf8'));
    const missing = repoFunctions.filter((slug) => !declared.has(slug));
    expect(missing, `bez izricitog verify_jwt: ${missing.join(', ')}`).toEqual([]);
  });
});

/**
 * Oblici TOML-a koji su prvu verziju parsera navodili na krivi odgovor.
 *
 * Najvazniji je prvi: TOML dopusta uvlaku prije zaglavlja, a `split(/^\[/m)` na uvuceno zaglavlje
 * NIJE dijelio. Prethodna funkcija tada proguta tudji blok i NASLIJEDI njegov `verify_jwt`, pa
 * bude prijavljena kao konfigurirana iako nema nijedan svoj redak. To je lazno ZELENO: gard sutke
 * potvrdjuje postavku koja ne postoji, sto je gore od promasaja u drugom smjeru.
 */
describe('configVerifyJwt: oblici koji su davali krivi odgovor', () => {
  it('UVUCENO zaglavlje prekida blok, pa se vrijednost ne nasljedjuje', () => {
    const toml = ['[functions.prvi]', '  [functions.drugi]', '  verify_jwt = false', ''].join('\n');
    const m = configVerifyJwt(toml);
    // `prvi` nema svoju zastavicu i mora ostati NEPOZNAT, ne pokupiti tudju.
    expect(m.has('prvi'), 'prvi je naslijedio tudji verify_jwt').toBe(false);
    expect(m.get('drugi')).toBe(false);
  });

  it('komentar iza zastavice se i dalje cita', () => {
    expect(configVerifyJwt('[functions.a]\nverify_jwt = false  # javni sink\n').get('a')).toBe(false);
  });

  it('komentar iza zaglavlja se i dalje cita', () => {
    expect(configVerifyJwt('[functions.a] # sink\nverify_jwt = true\n').get('a')).toBe(true);
  });

  it('navodnici oko kljuca (legalan TOML) se citaju', () => {
    expect(configVerifyJwt('[functions."moja-fn"]\nverify_jwt = true\n').get('moja-fn')).toBe(true);
  });

  it('uvucena zastavica unutar vlastitog bloka se cita', () => {
    expect(configVerifyJwt('  [functions.a]\n    verify_jwt = false\n').get('a')).toBe(false);
  });
});

describe('verifyJwtDrift: sentinel protiv tihog vakuuma', () => {
  it('baca kad okolina ima funkcije a nijedna ne nosi boolean', () => {
    // Ovakav oblik znaci promijenjen odgovor Management APIja. Bez sentinela bi provjera vratila
    // prazan popis i izgledala kao cist prolaz.
    const live = new Map([['a', { slug: 'a', version: 1, status: 'ACTIVE' }]]);
    expect(() => verifyJwtDrift(new Map(), live as never)).toThrow(/boolean verify_jwt/);
  });

  it('prazna okolina NE baca (nema sto tvrditi)', () => {
    expect(() => verifyJwtDrift(new Map(), new Map())).not.toThrow();
  });
});
