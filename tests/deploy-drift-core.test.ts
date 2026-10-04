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
  deployedModules,
  deployIdentityProblem,
  driftFor,
  labelForOnlyLive,
  parseEszip,
  verifyJwtDrift,
} from '../scripts/deploy-drift-core.mjs';
import { buildEszip, bundleFunkcije, mapaModula, metapodaci, type EszipZapis } from './helpers/eszip-fixture';

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
 * odabire origin s popisa. Ovo je dokaz deploya, pa svaka nesigurnost mora dati NE ZNAM, nikad JEDNAKO.
 *
 * Fixtura `tests/fixtures/deploy-drift/health.eszip` je stvarni deployani body funkcije `health`
 * (produkcija, 4. 10. 2026.; bez refa projekta i identifikatora funkcije, izvor je javni kod iz repoa).
 */
describe('deploy-drift po sadrzaju (T101)', () => {
  const HEALTH = new Uint8Array(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'deploy-drift', 'health.eszip')));
  const healthIzvor = () => {
    const p = parseEszip(HEALTH);
    const m = p.modules.find((x: { specifier: string }) => x.specifier === 'health/index.ts');
    return JSON.parse(m.sourceMap).sourcesContent[0] as string;
  };
  const repoS = (datoteke: Record<string, string>) => (p: string) => datoteke[p] ?? null;
  const presuda = (slug: string, bytes: Uint8Array, read: (p: string) => string | null) =>
    contentDrift(slug, deployedModules(parseEszip(bytes), slug), read);

  it('generator: iz stvarnog bodyja ponovno sastavi iste bajtove (dokaz formata, ne samo naseg parsera)', () => {
    const p = parseEszip(HEALTH);
    expect(p).toMatchObject({ ok: true, version: 'ESZIP2.3' });
    const zapisi = p.modules.map((m: EszipZapis & { sourceBytes?: Uint8Array }) => (m.kind === 'module' ? { ...m, source: m.sourceBytes! } : m));
    expect(Buffer.compare(Buffer.from(buildEszip({ version: p.version, modules: zapisi })), Buffer.from(HEALTH))).toBe(0);
    // Generator proizvodi ciljanu klasu: modul s mapom, opaque biljeske i preusmjerenje na udaljeni modul.
    const b = parseEszip(bundleFunkcije('source/supabase/functions/x/index.ts', [['source/supabase/functions/x/index.ts', 'ulaz']],
      [{ specifier: 'https://esm.sh/a', kind: 'redirect', target: 'https://esm.sh/a@1' }]));
    expect(b.ok).toBe(true);
    expect(b.modules.map((m: { kind: string; specifier: string }) => `${m.kind}:${m.specifier}`)).toEqual([
      'module:source/supabase/functions/x/index.ts', 'redirect:https://esm.sh/a', 'module:---SUPABASE-ESZIP-VERSION-ESZIP---', 'module:---EDGE-RUNTIME-METADATA---',
    ]);
  });

  it('stvarni body: JEDNAKO uz isti izvor, DRIFT uz drukciji, a modul je imenovan s ishodom', () => {
    const izvor = healthIzvor();
    expect(presuda('health', HEALTH, repoS({ 'supabase/functions/health/index.ts': izvor.replace(/\r\n/g, '\n') })))
      .toEqual({ status: 'jednako', entry: 'supabase/functions/health/index.ts', reason: null, modules: [{ file: 'supabase/functions/health/index.ts', ishod: 'jednako' }] });
    expect(presuda('health', HEALTH, repoS({ 'supabase/functions/health/index.ts': `${izvor}// promjena\n` })).modules)
      .toEqual([{ file: 'supabase/functions/health/index.ts', ishod: 'drift' }]);
  });

  it('svaka skracena duljina stvarnog bodyja i visak bajta su NE ZNAM, nikad JEDNAKO', () => {
    const read = repoS({ 'supabase/functions/health/index.ts': healthIzvor() });
    const krive: number[] = [];
    for (let n = 0; n < HEALTH.length; n++) {
      if (presuda('health', HEALTH.subarray(0, n), read).status !== 'ne-znam') krive.push(n);
    }
    expect(krive).toEqual([]);
    const visak = new Uint8Array(HEALTH.length + 1);
    visak.set(HEALTH);
    expect(presuda('health', visak, read)).toMatchObject({ status: 'ne-znam', reason: expect.stringContaining('visak 1 B') });
  });

  it('nevaljan format: magic, kontrolni zbroj, nepoznata vrsta zapisa i gola source mapa daju NE ZNAM', () => {
    const read = repoS({ 'supabase/functions/f/index.ts': 'x' });
    const dobar = bundleFunkcije('source/supabase/functions/f/index.ts', [['source/supabase/functions/f/index.ts', 'x']]);
    expect(presuda('f', dobar, read).status).toBe('jednako');
    const losMagic = dobar.slice();
    losMagic[7] = '9'.charCodeAt(0);
    expect(presuda('f', losMagic, read).reason).toContain('nepoznat magic');
    const zbroj = buildEszip({ options: [0, 1, 1, 32], modules: [] });
    expect(presuda('f', zbroj, read).reason).toContain('kontrolni zbroj');
    // Codex R1: HTTP 200 s golom mapom ulaza bez ESZIP zaglavlja.
    const gola = new TextEncoder().encode(mapaModula('source/index.ts', 'x'));
    expect(presuda('f', gola, read).status).toBe('ne-znam');
  });

  it('necitljiv ili konfliktan modul je NE ZNAM, ne preskocen (Codex R2)', () => {
    const read = repoS({ 'supabase/functions/f/index.ts': 'x', 'supabase/functions/_shared/a.ts': 'a' });
    const ulaz = 'source/supabase/functions/f/index.ts';
    const sa = (dodatno: EszipZapis[]) => presuda('f', bundleFunkcije(ulaz, [[ulaz, 'x']], dodatno), read);
    const modul = (specifier: string, sourceMap: string | null): EszipZapis => ({ specifier, kind: 'module', moduleKind: 0, source: 'js', sourceMap });
    expect(sa([modul('source/supabase/functions/_shared/a.ts', mapaModula('source/supabase/functions/_shared/a.ts', 'a'))]).status).toBe('jednako');
    expect(sa([modul('source/supabase/functions/_shared/a.ts', mapaModula('source/supabase/functions/_shared/a.ts', null))]).status).toBe('ne-znam');
    expect(sa([modul('source/supabase/functions/_shared/a.ts', null)]).status).toBe('ne-znam');
    expect(sa([modul('source/supabase/functions/_shared/a.ts', JSON.stringify({ version: 3, sources: ['source/supabase/functions/_shared/a.ts', 'b'], sourcesContent: ['a'] }))]).status).toBe('ne-znam');
    expect(sa([modul('source/supabase/functions/_shared/a.ts', mapaModula('drugo/ime.ts', 'a'))]).status).toBe('ne-znam');
    // JSON modul nema mapu: usporedjuje se doslovni izvor (stari alat ga je preskakao, pa je
    // `profile-rules` s drukcijim deployanim skupom pravila izgledao JEDNAKO).
    const json = (tekst: string | Uint8Array): EszipZapis => ({ specifier: 'source/data/x.json', kind: 'module', moduleKind: 1, source: tekst, sourceMap: null });
    const sJsonom = (tekst: string | Uint8Array) => presuda('f', bundleFunkcije(ulaz, [[ulaz, 'x']], [json(tekst)]), repoS({ 'supabase/functions/f/index.ts': 'x', 'data/x.json': '{"a":1}\n' }));
    expect(sJsonom('{"a":1}\r\n').status).toBe('jednako');
    expect(sJsonom('{"a":2}\n').modules).toContainEqual({ file: 'data/x.json', ishod: 'drift' });
    expect(sJsonom(new Uint8Array([0x7b, 0xff, 0x7d])).status).toBe('ne-znam');
    expect(sa([{ specifier: 'source/x.wasm', kind: 'module', moduleKind: 4, source: 'w', sourceMap: null }]).status).toBe('ne-znam');
    // Dva specifiera koji daju istu putanju u repou: konflikt, ne "zadnji pobjedjuje".
    expect(sa([modul('source/supabase/functions/f/./index.ts', mapaModula('source/supabase/functions/f/./index.ts', 'y'))]))
      .toMatchObject({ status: 'ne-znam', reason: expect.stringContaining('istu putanju') });
  });

  it('cetiri izmjerena oblika korijena mapiraju se na repo; neprepoznat korijen je NE ZNAM (Codex R3)', () => {
    const repo = repoS({ 'supabase/functions/f/index.ts': 'x', 'supabase/functions/_shared/c.ts': 'c', 'src/a.ts': 'a' });
    expect(presuda('f', bundleFunkcije('source/index.ts', [['source/index.ts', 'x'], ['source/../_shared/c.ts', 'c']]), repo).modules)
      .toEqual([{ file: 'supabase/functions/_shared/c.ts', ishod: 'jednako' }, { file: 'supabase/functions/f/index.ts', ishod: 'jednako' }]);
    expect(presuda('f', bundleFunkcije('f/index.ts', [['f/index.ts', 'x'], ['_shared/c.ts', 'c']]), repo).status).toBe('jednako');
    expect(presuda('f', bundleFunkcije('functions/f/index.ts', [['functions/f/index.ts', 'x'], ['functions/_shared/c.ts', 'c']]), repo).status).toBe('jednako');
    expect(presuda('f', bundleFunkcije('source/supabase/functions/f/index.ts', [['source/supabase/functions/f/index.ts', 'x'], ['source/src/a.ts', 'a']]), repo).modules)
      .toEqual([{ file: 'src/a.ts', ishod: 'jednako' }, { file: 'supabase/functions/f/index.ts', ishod: 'jednako' }]);
    // `ions/f/index.ts` je sufiks pune putanje koji presijeca segment: bez provjere korijena dao bi
    // prefiks `supabase/funct` i prividno valjan ulaz, dakle JEDNAKO.
    for (const ulaz of ['/index.ts', '/workspace/f/index.ts', 'workspace/f/index.ts', 'source/drugo/index.ts', 'ions/f/index.ts']) {
      expect(presuda('f', bundleFunkcije(ulaz, [[ulaz, 'x']]), repo), ulaz).toMatchObject({ status: 'ne-znam', modules: [] });
    }
    // Izlaz iz korijena repoa nije normaliziran u nesto prividno valjano.
    expect(presuda('f', bundleFunkcije('source/index.ts', [['source/index.ts', 'x'], ['source/../../../../x.ts', 'x']]), repo).status).toBe('ne-znam');
  });

  it('udaljeni moduli se preskacu; ulaz i import mapa dolaze iz metapodataka (Codex R4)', () => {
    const repo = repoS({ 'supabase/functions/f/index.ts': 'x' });
    const ulaz = 'source/supabase/functions/f/index.ts';
    const udaljeno: EszipZapis[] = [
      { specifier: 'https://esm.sh/a.mjs', kind: 'module', moduleKind: 0, source: 'u', sourceMap: mapaModula('https://esm.sh/a.mjs', 'u') },
      { specifier: 'npm:lib', kind: 'npm', packageId: 1 },
    ];
    expect(presuda('f', bundleFunkcije(ulaz, [[ulaz, 'x']], udaljeno), repo).modules).toEqual([{ file: 'supabase/functions/f/index.ts', ishod: 'jednako' }]);
    const sMetom = (meta: Uint8Array) => buildEszip({ modules: [
      { specifier: ulaz, kind: 'module', moduleKind: 0, source: 'js', sourceMap: mapaModula(ulaz, 'x') },
      { specifier: '---EDGE-RUNTIME-METADATA---', kind: 'module', moduleKind: 3, source: meta, sourceMap: null },
    ] });
    expect(presuda('f', sMetom(metapodaci(ulaz)), repo).status).toBe('jednako');
    expect(presuda('f', sMetom(metapodaci(ulaz, { import_map: 'file:///import_map.json', jsr_pkgs: [], package_jsons: {} })), repo).reason).toContain('import mapom');
    expect(presuda('f', sMetom(metapodaci('source/supabase/functions/drugi/index.ts')), repo).status).toBe('ne-znam');
    expect(presuda('f', buildEszip({ modules: [{ specifier: ulaz, kind: 'module', moduleKind: 0, source: 'js', sourceMap: mapaModula(ulaz, 'x') }] }), repo).reason)
      .toContain('metapodatke runtimea');
  });

  it('drift: razlicit modul i modul kojeg nema u repou su imenovani, CRLF nije razlika', () => {
    const ulaz = 'source/supabase/functions/f/index.ts';
    const repo = repoS({ 'supabase/functions/f/index.ts': 'export const a = 1;\n' });
    expect(presuda('f', bundleFunkcije(ulaz, [[ulaz, 'export const a = 1;\r\n']]), repo).status).toBe('jednako');
    expect(presuda('f', bundleFunkcije(ulaz, [[ulaz, "'Access-Control-Allow-Origin': '*'"]]), repo).modules)
      .toEqual([{ file: 'supabase/functions/f/index.ts', ishod: 'drift' }]);
    expect(presuda('f', bundleFunkcije(ulaz, [[ulaz, 'export const a = 1;\n'], ['source/supabase/functions/_shared/stari.ts', 's']]), repo))
      .toMatchObject({ status: 'drift', modules: [{ file: 'supabase/functions/_shared/stari.ts', ishod: 'nema-u-repou' }, { file: 'supabase/functions/f/index.ts', ishod: 'jednako' }] });
  });

  it('body je vezan uz jednu verziju deploya (Codex R7)', () => {
    const zapis = { version: 15, updated_at: 1788777840289 };
    expect(deployIdentityProblem(zapis, { ...zapis })).toBeNull();
    expect(deployIdentityProblem(zapis, { version: 16, updated_at: 1788777999999 })).toContain('promijenio tijekom mjerenja');
    expect(deployIdentityProblem(zapis, { version: 15, updated_at: 1788777999999 })).toContain('promijenio tijekom mjerenja');
    expect(deployIdentityProblem(null, zapis)).not.toBeNull();
    expect(deployIdentityProblem({ version: 15 }, { version: 15 })).not.toBeNull();
    expect(contentDrift('f', { status: 'ne-znam', reason: 'deploy se promijenio' }, () => 'x'))
      .toEqual({ status: 'ne-znam', entry: 'supabase/functions/f/index.ts', reason: 'deploy se promijenio', modules: [] });
  });
});
