// scripts/deploy-drift-core.mjs
//
// Ciste funkcije iza `deploy-drift.mjs`. Odvojene su da bi bile TESTIRLJIVE: sam skript ima
// top-level await i mrezne pozive, pa ga test ne moze uvesti bez izvodjenja.
//
// Bez ovoga se usporedba nije mogla provjeriti nijednim testom, a upravo je usporedba ono sto
// laze kad je kriva (vidi `labelForOnlyLive` i `verifyJwtDrift` nize).

/**
 * Source mape iz deployanog bundlea (ESZIP koji vraca `GET /functions/{slug}/body`). Svaki lokalni
 * modul nosi mapu `{"version":3,"sources":[...],"sourcesContent":[...]}` s IZVORNIM TS-om, pa se
 * deployani izvor moze usporediti s repoom bajt po bajt (T101). JSON se izrezuje skeniranjem do
 * pripadajuce zatvorene zagrade uz pracenje stringova; neparsiran isjecak se preskace.
 *
 * @param {string} text bundle dekodiran kao UTF-8
 * @returns {{ sources: string[], sourcesContent: (string | null)[] }[]}
 */
export function extractSourceMaps(text) {
  const out = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf('{"version":3,', from);
    if (start < 0) break;
    let depth = 0;
    let inString = false;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        if (c === '\\') i++;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { end = i; break; }
    }
    if (end < 0) break;
    try {
      const map = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(map.sources) && Array.isArray(map.sourcesContent)) {
        out.push({ sources: map.sources, sourcesContent: map.sourcesContent });
      }
    } catch {
      // Nije valjan JSON (slucajni niz u bundleu); nastavi trazenje iza pocetka.
    }
    from = end + 1;
  }
  return out;
}

/**
 * Lokalni moduli deployane funkcije kao `putanja u repou -> izvor`. Supabase CLI je mijenjao oblik
 * (izmjereno na produkciji 4. 10. 2026.): `source/index.ts` (korijen je mapa funkcije),
 * `health/index.ts` (korijen je `supabase/functions/`), `functions/<slug>/index.ts` (korijen je
 * `supabase/`) i `source/supabase/functions/<slug>/index.ts` uz `source/src/...` (korijen je repo). Udaljeni moduli (`https://`, `npm:`, `jsr:`) nisu dio repoa
 * i preskacu se.
 *
 * @param {{ sources: string[], sourcesContent: (string | null)[] }[]} maps
 * @param {string} slug
 * @returns {Map<string, string>}
 */
export function deployedLocalSources(maps, slug) {
  const out = new Map();
  const lokalni = (src) => typeof src === 'string' && !/^[a-z][a-z0-9+.-]*:/i.test(src);
  const bezKorijena = (src) => src.replace(/^\.?\/?source\//, '');
  // Korijen je zajednicki za cijeli bundle i CLI ga je mijenjao, pa se izvodi iz ULAZA funkcije: ulaz je
  // u repou uvijek `supabase/functions/<slug>/index.ts`, a u bundleu njegov sufiks (`index.ts`,
  // `<slug>/index.ts`, `functions/<slug>/index.ts`, `supabase/functions/<slug>/index.ts`). Prefiks je
  // ono sto sufiksu nedostaje do pune putanje. Bez ulaza vrijedi mapa funkcije (presuda je NE ZNAM).
  const ulazURepou = `supabase/functions/${slug}/index.ts`;
  const rels = maps.flatMap((m) => m.sources.filter(lokalni).map(bezKorijena));
  const ulaz = rels
    .filter((r) => r === 'index.ts' || ulazURepou.endsWith(`/${r}`) || r === ulazURepou)
    .sort((a, b) => b.length - a.length)[0];
  const prefiks = ulaz === undefined ? `supabase/functions/${slug}/` : ulazURepou.slice(0, ulazURepou.length - ulaz.length);
  for (const { sources, sourcesContent } of maps) {
    sources.forEach((src, i) => {
      const content = sourcesContent[i];
      if (!lokalni(src) || typeof content !== 'string') return;
      const joined = `${prefiks}${bezKorijena(src)}`;
      const parts = [];
      for (const seg of joined.split('/')) {
        if (seg === '..') parts.pop();
        else if (seg && seg !== '.') parts.push(seg);
      }
      out.set(parts.join('/'), content);
    });
  }
  return out;
}

/**
 * Presuda po SADRZAJU za jednu funkciju (T101). `jednako` samo kad je ulaz `index.ts` medju
 * deployanim modulima i svaki deployani lokalni modul je bajtno jednak repou (uz normalizaciju CR);
 * jednak ulaz znaci iste importe, pa je i skup lokalnih modula isti. `drift` kad se ijedan modul
 * razlikuje ili ga u repou nema. `ne-znam` kad bundle nema citljivih source mapa ili ulaza: tada se
 * ne tvrdi ni jednakost ni razlika.
 *
 * @param {string} slug
 * @param {Map<string, string>} deployed iz `deployedLocalSources`
 * @param {(repoPath: string) => string | null} readRepo sadrzaj datoteke iz repoa ili null
 */
export function contentDrift(slug, deployed, readRepo) {
  const entry = `supabase/functions/${slug}/index.ts`;
  if (deployed.size === 0 || !deployed.has(entry)) {
    return { status: 'ne-znam', entry, differ: [], missingInRepo: [], equal: [] };
  }
  const norm = (s) => s.replace(/\r\n?/g, '\n');
  const differ = [];
  const missingInRepo = [];
  const equal = [];
  for (const [file, content] of [...deployed].sort(([a], [b]) => a.localeCompare(b))) {
    const repo = readRepo(file);
    if (repo === null) missingInRepo.push(file);
    else if (norm(repo) !== norm(content)) differ.push(file);
    else equal.push(file);
  }
  const status = differ.length || missingInRepo.length ? 'drift' : 'jednako';
  return { status, entry, differ, missingInRepo, equal };
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
