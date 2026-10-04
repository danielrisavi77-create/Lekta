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
import {
  configVerifyJwt,
  contentDrift,
  deployedLocalSources,
  driftFor,
  extractSourceMaps,
  labelForOnlyLive,
  verifyJwtDrift,
} from '../scripts/deploy-drift-core.mjs';

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

/**
 * T101: usporedba po SADRZAJU. Do sada se mjerilo samo postojanje, pa je deployani faculty-request
 * (v14, deploy 9. 7. 2026.) s `Access-Control-Allow-Origin: *` prolazio kao "deployano", iako repo
 * odabire origin s popisa. Bundle nosi source mape s izvornim TS-om; sinteticki bundle ispod ima
 * isti oblik (binarni sum, mapa po modulu, dva oblika putanja i udaljeni modul).
 */
describe('deploy-drift po sadrzaju (T101)', () => {
  const mapa = (sources: string[], contents: string[]) => JSON.stringify({ version: 3, sources, sourcesContent: contents, mappings: 'AAAA' });
  const bundle = (...maps: string[]) => `ESZIP2.3\u0000\u0001\u00ff garbage {"not":"a map"} ${maps.join('\u0000\u0002')} \u0000 kraj`;

  it('generator: sinteticki bundle stvarno sadrzi oba oblika putanja i udaljeni modul', () => {
    const b = bundle(
      mapa(['source/index.ts'], ['stari ulaz']),
      mapa(['source/supabase/functions/x/index.ts', 'source/supabase/functions/_shared/cors.ts'], ['novi ulaz', 'cors']),
      mapa(['https://esm.sh/lib.mjs'], ['udaljeno']),
    );
    const maps = extractSourceMaps(b);
    expect(maps).toHaveLength(3);
    expect(maps.flatMap((m: { sources: string[] }) => m.sources)).toEqual([
      'source/index.ts', 'source/supabase/functions/x/index.ts', 'source/supabase/functions/_shared/cors.ts', 'https://esm.sh/lib.mjs',
    ]);
  });

  it('putanje oba oblika i ../ mapiraju se na repo; udaljeni moduli se preskacu', () => {
    const stari = deployedLocalSources(extractSourceMaps(bundle(mapa(['source/index.ts', 'source/../_shared/cors.ts'], ['a', 'b']))), 'faculty-request');
    expect([...stari.keys()]).toEqual(['supabase/functions/faculty-request/index.ts', 'supabase/functions/_shared/cors.ts']);
    const novi = deployedLocalSources(extractSourceMaps(bundle(
      mapa(['source/supabase/functions/profile-rules/index.ts', 'source/supabase/functions/_shared/hash-ip.ts'], ['a', 'b']),
      mapa(['https://esm.sh/x.mjs', 'npm:lib'], ['c', 'd']),
    )), 'profile-rules');
    expect([...novi.keys()]).toEqual(['supabase/functions/profile-rules/index.ts', 'supabase/functions/_shared/hash-ip.ts']);
    // Korijen repoa i za `src/...`: putanja bez `supabase/functions/` NIJE relativna na mapu funkcije.
    const sSrc = deployedLocalSources(extractSourceMaps(bundle(
      mapa(['source/supabase/functions/admin-stats/index.ts', 'source/src/admin/admin-range.ts'], ['a', 'b']),
    )), 'admin-stats');
    expect([...sSrc.keys()]).toEqual(['supabase/functions/admin-stats/index.ts', 'src/admin/admin-range.ts']);
    // Treci oblik: korijen je `supabase/functions/` (`health/index.ts`, bez `source/`).
    const fn = deployedLocalSources(extractSourceMaps(bundle(mapa(['health/index.ts', '_shared/cors.ts'], ['a', 'b']))), 'health');
    expect([...fn.keys()]).toEqual(['supabase/functions/health/index.ts', 'supabase/functions/_shared/cors.ts']);
    // Cetvrti oblik: korijen je `supabase/` (`functions/<slug>/index.ts`).
    const sup = deployedLocalSources(extractSourceMaps(bundle(
      mapa(['functions/send-reminders/index.ts'], ['a']), mapa(['functions/_shared/cron-auth.ts'], ['b']),
    )), 'send-reminders');
    expect([...sup.keys()]).toEqual(['supabase/functions/send-reminders/index.ts', 'supabase/functions/_shared/cron-auth.ts']);
  });

  it('jednako, drift i ne-znam', () => {
    const repo: Record<string, string> = {
      'supabase/functions/f/index.ts': 'export const a = 1;\n',
      'supabase/functions/_shared/cors.ts': 'cors\n',
    };
    const read = (p: string) => repo[p] ?? null;
    const dep = (entries: [string, string][]) => new Map(entries);
    // CRLF u deployu nije razlika.
    expect(contentDrift('f', dep([['supabase/functions/f/index.ts', 'export const a = 1;\r\n'], ['supabase/functions/_shared/cors.ts', 'cors\n']]), read))
      .toMatchObject({ status: 'jednako', differ: [], missingInRepo: [] });
    // Stvarni oblik faculty-request drifta: repo odabire origin, deploy salje *.
    expect(contentDrift('f', dep([['supabase/functions/f/index.ts', "'Access-Control-Allow-Origin': '*'"]]), read))
      .toMatchObject({ status: 'drift', differ: ['supabase/functions/f/index.ts'] });
    expect(contentDrift('f', dep([['supabase/functions/f/index.ts', 'export const a = 1;\n'], ['supabase/functions/_shared/stari.ts', 'x']]), read))
      .toMatchObject({ status: 'drift', missingInRepo: ['supabase/functions/_shared/stari.ts'] });
    // Bez mapa ili bez ulaza: NE ZNAM, nikad jednako.
    expect(contentDrift('f', dep([]), read).status).toBe('ne-znam');
    expect(contentDrift('f', dep([['supabase/functions/_shared/cors.ts', 'cors\n']]), read).status).toBe('ne-znam');
  });
});