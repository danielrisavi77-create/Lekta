// scripts/deploy-drift-core.mjs
//
// Ciste funkcije iza `deploy-drift.mjs`. Odvojene su da bi bile TESTIRLJIVE: sam skript ima
// top-level await i mrezne pozive, pa ga test ne moze uvesti bez izvodjenja.
//
// Bez ovoga se usporedba nije mogla provjeriti nijednim testom, a upravo je usporedba ono sto
// laze kad je kriva (vidi `labelForOnlyLive` i `verifyJwtDrift` nize).

/**
 * Binarni ESZIP v2.2/v2.3 (deployani bundle iz `GET /functions/{slug}/body`), procitan strogo (T101).
 * Ovo je dokaz deploya, pa je svaka nesigurnost pad, nikad "jednako": krivi magic, nepoznata opcija,
 * kontrolni zbroj koji se ne provjerava, zapis izvan granica sekcije, nevaljan UTF-8, dupli specifier
 * ili visak bajtova iza zadnje sekcije daju `{ ok: false, reason }`.
 *
 * Raspored (izmjereno na produkciji 4. 10. 2026., `health` 10318 B i `admin-stats` 266212 B, oba
 * procitana do zadnjeg bajta): magic (8 B), opcije (u32 duljina + parovi kljuc/vrijednost),
 * zaglavlje modula (u32 duljina + zapisi), npm snimka (u32 + bajtovi), izvori (u32 + bajtovi),
 * source mape (u32 + bajtovi). Zapis modula: u32 duljina + specifier, u8 vrsta (0 modul, 1 preusmjerenje,
 * 2 npm), a modul nosi odmak i duljinu izvora i mape (4 x u32, big-endian) te u8 vrstu sadrzaja.
 *
 * @param {Uint8Array} bytes
 * @returns {{ ok: true, version: string, modules: EszipModule[] } | { ok: false, reason: string }}
 *
 * @typedef {{ specifier: string, kind: 'module', moduleKind: number, source: string, sourceBytes: Uint8Array, sourceMap: string | null }
 *   | { specifier: string, kind: 'redirect', target: string }
 *   | { specifier: string, kind: 'npm', packageId: number }} EszipModule
 */
export function parseEszip(bytes) {
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  let p = 0;
  const need = (n, what) => {
    if (p + n > bytes.length) throw new Error(`krnji ESZIP: ${what} trazi ${n} B na ${p}, a body ima ${bytes.length} B`);
  };
  const u8 = (what) => { need(1, what); return bytes[p++]; };
  const u32 = (what) => {
    need(4, what);
    const v = ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
    p += 4;
    return v;
  };
  const slice = (n, what) => { need(n, what); const s = bytes.subarray(p, p + n); p += n; return s; };
  try {
    const version = String.fromCharCode(...slice(8, 'magic'));
    if (version !== 'ESZIP2.2' && version !== 'ESZIP2.3') return { ok: false, reason: `nepoznat magic ${JSON.stringify(version)}` };

    const options = slice(u32('duljina opcija'), 'opcije');
    if (options.length % 2 !== 0) return { ok: false, reason: 'opcije nisu parovi kljuc/vrijednost' };
    const opt = new Map();
    for (let i = 0; i < options.length; i += 2) opt.set(options[i], options[i + 1]);
    // 0 = algoritam kontrolnog zbroja, 1 = njegova duljina. Mjereni deploy nema zbroj (0/0); zbroj koji se
    // ovdje ne provjerava znacio bi hash bajtove iza svake sekcije koje parser ne bi znao preskociti.
    if ([...opt.keys()].some((k) => k !== 0 && k !== 1)) return { ok: false, reason: `nepoznata opcija u zaglavlju (${[...opt.keys()].join(',')})` };
    if (opt.get(0) !== 0 || (opt.get(1) ?? 0) !== 0) return { ok: false, reason: 'kontrolni zbroj nije podrzan (ocekivano bez zbroja)' };

    const header = slice(u32('duljina zaglavlja modula'), 'zaglavlje modula');
    const headerEnd = p;
    p -= header.length;
    const records = [];
    const seen = new Set();
    while (p < headerEnd) {
      const specifier = utf8.decode(slice(u32('duljina specifiera'), 'specifier'));
      if (seen.has(specifier)) return { ok: false, reason: `dupli specifier ${specifier}` };
      seen.add(specifier);
      const kind = u8('vrsta zapisa');
      if (kind === 0) {
        records.push({ specifier, kind: 'module', so: u32('odmak izvora'), sl: u32('duljina izvora'), mo: u32('odmak mape'), ml: u32('duljina mape'), moduleKind: u8('vrsta modula') });
      } else if (kind === 1) {
        records.push({ specifier, kind: 'redirect', target: utf8.decode(slice(u32('duljina cilja'), 'cilj preusmjerenja')) });
      } else if (kind === 2) {
        records.push({ specifier, kind: 'npm', packageId: u32('npm paket') });
      } else {
        return { ok: false, reason: `nepoznata vrsta zapisa ${kind} za ${specifier}` };
      }
      if (p > headerEnd) return { ok: false, reason: `zapis ${specifier} prelazi granicu zaglavlja modula` };
    }

    slice(u32('duljina npm snimke'), 'npm snimka');
    const sources = slice(u32('duljina izvora'), 'izvori');
    const maps = slice(u32('duljina mapa'), 'source mape');
    if (p !== bytes.length) return { ok: false, reason: `visak ${bytes.length - p} B iza zadnje sekcije` };

    // Izvor se dekodira blago: metapodaci runtimea iza JSON-a nose binarni dio, a prevedeni JS se ne
    // usporedjuje. Mapa nosi izvorni tekst koji se usporedjuje, pa se dekodira strogo.
    const loose = new TextDecoder('utf-8');
    const cut = (section, off, len, what) => {
      if (off + len > section.length) throw new Error(`${what} izlazi iz sekcije (${off}+${len} > ${section.length})`);
      return section.subarray(off, off + len);
    };
    const modules = records.map((r) => {
      if (r.kind !== 'module') return r;
      const sourceBytes = cut(sources, r.so, r.sl, `izvor ${r.specifier}`);
      return {
        specifier: r.specifier,
        kind: 'module',
        moduleKind: r.moduleKind,
        source: loose.decode(sourceBytes),
        sourceBytes,
        sourceMap: r.ml === 0 ? null : utf8.decode(cut(maps, r.mo, r.ml, `mapa ${r.specifier}`)),
      };
    });
    return { ok: true, version, modules };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Biljeske Supabase runtimea u bundleu, ne moduli funkcije. */
const RUNTIME_METADATA = '---EDGE-RUNTIME-METADATA---';
// Vrste modula u ESZIP zapisu (0 JavaScript, 1 JSON, 2 JSONC, 3 neprozirni podaci, 4 Wasm).
const JSON_MODULE = 1;
const JSONC_MODULE = 2;
const OPAQUE_DATA = 3;

/**
 * Lokalni moduli deployane funkcije kao `putanja u repou -> izvorni TS` (T101), ili NE ZNAM s razlogom.
 *
 * Ulaz i razrjesavanje importa citaju se iz metapodataka runtimea (`<ulaz>{"import_map":...}`), ne
 * pogadjaju se. Korijen putanja izvodi se iz ulaza, jer ga je Supabase CLI mijenjao (izmjereno 4. 10.
 * 2026.): `source/index.ts`, `health/index.ts`, `functions/<slug>/index.ts` i
 * `source/supabase/functions/<slug>/index.ts`. Svaki drugi oblik ulaza je NE ZNAM prije spajanja putanja.
 *
 * Svaki lokalni modul mora imati vlastitu mapu s tocno jednim izvorom, imenovanim kao modul, i
 * citljivim `sourcesContent`; JSON modul bez mape usporedjuje se po doslovnom izvoru. Inace NE ZNAM,
 * jer bi preskoceni modul sakrio razliku (stari alat je preskakao JSON module, pa je `profile-rules`
 * s deployanim skupom pravila razlicitim od repoa izgledao JEDNAKO). Udaljeni moduli
 * (`https:`, `npm:`, `jsr:`) i npm zapisi nisu dio repoa i preskacu se.
 *
 * @param {ReturnType<typeof parseEszip>} parsed
 * @param {string} slug
 * @returns {{ status: 'ok', files: Map<string, string> } | { status: 'ne-znam', reason: string }}
 */
export function deployedModules(parsed, slug) {
  const neZnam = (reason) => ({ status: 'ne-znam', reason });
  if (!parsed.ok) return neZnam(`ESZIP nije citljiv: ${parsed.reason}`);
  const udaljen = (s) => /^[a-z][a-z0-9+.-]*:/i.test(s);
  const bezKorijena = (s) => s.replace(/^source\//, '');

  const meta = parsed.modules.find((m) => m.specifier === RUNTIME_METADATA && m.kind === 'module');
  if (!meta) return neZnam('bundle nema metapodatke runtimea (ulaz i import mapa nepoznati)');
  const brace = meta.source.indexOf('{');
  if (brace <= 0) return neZnam('metapodaci runtimea nemaju ulaz');
  const entrySpecifier = meta.source.slice(0, brace);
  let depth = 0;
  let inString = false;
  let end = -1;
  for (let i = brace; i < meta.source.length && end < 0; i++) {
    const c = meta.source[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) end = i;
  }
  let config;
  try {
    config = end < 0 ? null : JSON.parse(meta.source.slice(brace, end + 1));
  } catch {
    config = null;
  }
  if (!config || typeof config !== 'object') return neZnam('metapodaci runtimea nisu citljiv JSON');
  // Isti tekst importa ne dokazuje isti graf ako deploy razrjesava importe drukcije od repoa. Repo nema
  // import mapu (supabase/functions/deno.json nosi samo compilerOptions), pa je jedino dokazivo stanje
  // deploy bez import mape, JSR paketa i package.json razrjesavanja.
  const prazno = (v) => v === undefined || v === null || (Array.isArray(v) ? v.length === 0 : typeof v === 'object' && Object.keys(v).length === 0);
  if (!prazno(config.import_map) || !prazno(config.jsr_pkgs) || !prazno(config.package_jsons)) {
    return neZnam('deploy razrjesava importe import mapom ili paketima; isti tekst nije isti graf');
  }

  const entryModule = parsed.modules.find((m) => m.specifier === entrySpecifier && m.kind === 'module');
  if (!entryModule) return neZnam(`ulaz ${entrySpecifier} iz metapodataka nije modul bundlea`);
  const ulazURepou = `supabase/functions/${slug}/index.ts`;
  const ulaz = bezKorijena(entrySpecifier);
  const prepoznat = ulaz === 'index.ts' || ulaz === `${slug}/index.ts` || ulaz === `functions/${slug}/index.ts` || ulaz === ulazURepou;
  if (!prepoznat) return neZnam(`neprepoznat korijen ulaza ${JSON.stringify(entrySpecifier)}`);
  const prefiks = ulazURepou.slice(0, ulazURepou.length - ulaz.length);

  const files = new Map();
  for (const m of parsed.modules) {
    if (udaljen(m.specifier) || m.kind === 'npm') continue;
    if (m.kind === 'module' && m.moduleKind === OPAQUE_DATA && /^---[A-Z0-9-]+---$/.test(m.specifier)) continue;
    if (m.kind !== 'module') return neZnam(`lokalni zapis ${m.specifier} nije modul (${m.kind})`);
    if (m.specifier.startsWith('/')) return neZnam(`apsolutan specifier ${m.specifier}`);
    let content;
    if ((m.moduleKind === JSON_MODULE || m.moduleKind === JSONC_MODULE) && m.sourceMap === null) {
      // JSON modul nema mapu: izvor u bundleu je doslovna datoteka (izmjereno: `data/work-type-scope.json`
      // u `create-checkout` jednak repou), pa se usporedjuje on, strogo dekodiran.
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(m.sourceBytes);
      } catch {
        return neZnam(`JSON modul ${m.specifier} nije valjan UTF-8`);
      }
    } else {
      let map;
      try {
        map = m.sourceMap === null ? null : JSON.parse(m.sourceMap);
      } catch {
        map = null;
      }
      const sources = map?.sources;
      const contents = map?.sourcesContent;
      if (!Array.isArray(sources) || !Array.isArray(contents) || sources.length !== 1 || contents.length !== 1
        || sources[0] !== m.specifier || typeof contents[0] !== 'string') {
        return neZnam(`modul ${m.specifier} nema citljivu mapu s izvornim tekstom`);
      }
      content = contents[0];
    }
    const parts = [];
    for (const seg of `${prefiks}${bezKorijena(m.specifier)}`.split('/')) {
      if (seg === '..') {
        if (parts.length === 0) return neZnam(`modul ${m.specifier} izlazi iz korijena repoa`);
        parts.pop();
      } else if (seg && seg !== '.') parts.push(seg);
    }
    const file = parts.join('/');
    if (files.has(file)) return neZnam(`dva modula daju istu putanju ${file}`);
    files.set(file, content);
  }
  if (!files.has(ulazURepou)) return neZnam(`ulaz ${ulazURepou} nije medju lokalnim modulima`);
  return { status: 'ok', files };
}

/**
 * Presuda po SADRZAJU za jednu funkciju (T101). `jednako` samo kad je svaki deployani lokalni modul
 * bajtno jednak repou (uz normalizaciju CR). `drift` kad se ijedan razlikuje ili ga u repou nema.
 * `ne-znam` kad `deployedModules` nije mogao procitati deploy: tada se ne tvrdi ni jednakost ni razlika.
 * `modules` imenuje svaki usporedjeni modul s ishodom.
 *
 * @param {string} slug
 * @param {ReturnType<typeof deployedModules>} deployed
 * @param {(repoPath: string) => string | null} readRepo sadrzaj datoteke iz repoa ili null
 */
export function contentDrift(slug, deployed, readRepo) {
  const entry = `supabase/functions/${slug}/index.ts`;
  if (deployed.status !== 'ok') return { status: 'ne-znam', entry, reason: deployed.reason, modules: [] };
  const norm = (s) => s.replace(/\r\n?/g, '\n');
  const modules = [...deployed.files].sort(([a], [b]) => a.localeCompare(b)).map(([file, content]) => {
    const repo = readRepo(file);
    const ishod = repo === null ? 'nema-u-repou' : norm(repo) !== norm(content) ? 'drift' : 'jednako';
    return { file, ishod };
  });
  const status = modules.some((m) => m.ishod !== 'jednako') ? 'drift' : 'jednako';
  return { status, entry, reason: null, modules };
}

/**
 * Je li body vezan uz jednu verziju deploya (T101). `before` i `after` su zapisi funkcije iz
 * Management APIja procitani prije i poslije dohvata bodyja. Null kad su oba citljiva i nose istu
 * `version` i `updated_at`; inace razlog za NE ZNAM (zapis nedostaje, polje nedostaje ili se deploy
 * promijenio tijekom mjerenja, pa body mozda pripada drugoj verziji od zabiljezene).
 *
 * @param {{ version?: unknown, updated_at?: unknown } | null} before
 * @param {{ version?: unknown, updated_at?: unknown } | null} after
 * @returns {string | null}
 */
export function deployIdentityProblem(before, after) {
  if (!before || !after) return 'zapis funkcije nije procitan prije i poslije dohvata bodyja';
  if (before.version === undefined || before.version === null || before.updated_at === undefined || before.updated_at === null) {
    return 'zapis funkcije nema version ili updated_at';
  }
  if (before.version !== after.version || before.updated_at !== after.updated_at) {
    return `deploy se promijenio tijekom mjerenja (verzija ${before.version} -> ${after.version})`;
  }
  return null;
}

/** Razlika po POSTOJANJU funkcije: sto je samo u repou, sto samo na okolini, sto na obje. */
export function driftFor(repo, deployed) {
  const live = new Map(deployed.map((f) => [f.slug, f]));
  const onlyRepo = repo.filter((name) => !live.has(name));
  const onlyLive = [...live.keys()].filter((slug) => !repo.includes(slug)).sort();
  const both = repo.filter((name) => live.has(name));
  return { onlyRepo, onlyLive, both, live };
}

/**
 * Oznaka za funkciju koje ima na okolini a nema u repou.
 *
 * Do 2026-08-30 je bila HARDKODIRANA na "SAMO U PRODUKCIJI", pa je izvjestaj za staging tvrdio
 * produkciju: `cleanup-agent-payloads` postoji na STAGINGU, a izvjestaj ga je prijavio kao
 * produkcijski. Oznaka mora pratiti okolinu koja se mjeri.
 */
export function labelForOnlyLive(environmentLabel) {
  return `SAMO U OKOLINI \`${environmentLabel}\` (nema je u repou)`;
}

/**
 * `verify_jwt` iz `supabase/config.toml`, po funkciji.
 *
 * Namjerno se cita SAMO izricit blok. Funkcija bez `[functions.<slug>]` bloka NIJE `false` nego
 * NEPOZNATA: Supabase CLI joj daje default `true`, pa je izostanak bloka tihi prekidac koji na
 * prvom deployu zatvori javni endpoint. Zato `undefined`, ne pretpostavljena vrijednost.
 */
export function configVerifyJwt(tomlText) {
  const out = new Map();
  // TOML dopusta uvlaku prije zaglavlja, navodnike oko kljuca i komentar iza njega. Prva verzija
  // ovoga nije dopustala nista od toga, sto je davalo kvarove u OBA smjera:
  //  - uvuceno zaglavlje `  [functions.bar]` nije prekidalo blok, pa je prethodna funkcija
  //    NASLIJEDILA tudji `verify_jwt` i bila prijavljena kao konfigurirana iako nije. To je
  //    lazno ZELENO i najopasniji smjer, jer gard tada sutke potvrdjuje nepostojecu postavku;
  //  - komentar iza zastavice (`verify_jwt = false  # javni sink`) rusio je poklapanje, pa je
  //    uredno konfigurirana funkcija izgledala kao `missing-config`. To je lazno crveno, glasno.
  const re = /^[ 	]*\[functions\.["']?([A-Za-z0-9_-]+)["']?\][ 	]*(?:#.*)?$/gm;
  let m;
  while ((m = re.exec(tomlText)) !== null) {
    const slug = m[1];
    const rest = tomlText.slice(m.index + m[0].length);
    // Samo do sljedeceg bloka: inace bi se pokupila vrijednost tudje funkcije. Uvlaka se dopusta
    // upravo zato da uvuceno zaglavlje PREKINE blok umjesto da ga produzi.
    const block = rest.split(/^[ 	]*\[/m)[0];
    const flag = /^[ 	]*verify_jwt[ 	]*=[ 	]*(true|false)[ 	]*(?:#.*)?$/m.exec(block);
    if (flag) out.set(slug, flag[1] === 'true');
  }
  return out;
}

/**
 * Raskorak izmedju `config.toml` i STVARNOG stanja na okolini.
 *
 * Zasto postoji: `deploy-drift` je usporedjivao samo POSTOJANJE funkcija, pa je konfiguracijski
 * raskorak bio nevidljiv. Izmjereno 2026-08-29 na produkciji: `analytics-event` i
 * `record-completion-check` ondje rade s `verify_jwt=false`, a nisu imale blok u configu, dakle
 * prvi `supabase functions deploy` bi ih tiho pretvorio u JWT-obavezne i slomio.
 *
 * Dvije vrste nalaza, namjerno razdvojene:
 *  - `missing-config`: okolina ima vrijednost, config ne kaze nista (tihi prekidac na deployu);
 *  - `mismatch`: oboje kazu, ali razlicito (deploy bi promijenio autorizaciju).
 */
export function verifyJwtDrift(configMap, live) {
  // SENTINEL: okolina s funkcijama, a nijedna ne nosi boolean `verify_jwt`, znaci da se promijenio
  // oblik odgovora Management APIja (preimenovano polje, druga shema). Bez ovoga bi provjera tiho
  // pala na NULA nalaza i izgledala kao cist prolaz, sto je isti vakuum protiv kojeg klasifikacijski
  // manifest cuva pravilom "nula mapiranih modula = pad".
  const withBoolean = [...live.values()].filter((f) => typeof f?.verify_jwt === 'boolean').length;
  if (live.size > 0 && withBoolean === 0) {
    throw new Error(
      `verifyJwtDrift: nijedna od ${live.size} deployanih funkcija ne nosi boolean verify_jwt. ` +
      'Vjerojatno se promijenio oblik odgovora Management APIja; provjera bi inace tiho prosla prazna.',
    );
  }
  const findings = [];
  for (const slug of [...live.keys()].sort()) {
    const actual = live.get(slug)?.verify_jwt;
    if (typeof actual !== 'boolean') {
      // Ranije `continue`, dakle tiho preskakanje. Sentinel iznad hvata samo POTPUN izostanak
      // polja; djelomicna promjena sheme bi ga prosla, a svaki slug bez booleana bi nestao iz
      // izvjestaja kao da je uredan. Sada se imenuje.
      findings.push({ slug, kind: 'unknown-live', declared: configMap.get(slug) ?? null, actual: null });
      continue;
    }
    const declared = configMap.get(slug);
    if (declared === undefined) {
      findings.push({ slug, kind: 'missing-config', declared: null, actual });
    } else if (declared !== actual) {
      findings.push({ slug, kind: 'mismatch', declared, actual });
    }
  }
  return findings;
}
