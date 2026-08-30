// scripts/deploy-drift-core.mjs
//
// Ciste funkcije iza `deploy-drift.mjs`. Odvojene su da bi bile TESTIRLJIVE: sam skript ima
// top-level await i mrezne pozive, pa ga test ne moze uvesti bez izvodjenja.
//
// Bez ovoga se usporedba nije mogla provjeriti nijednim testom, a upravo je usporedba ono sto
// laze kad je kriva (vidi `labelForOnlyLive` i `verifyJwtDrift` nize).

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
    if (typeof actual !== 'boolean') continue;
    const declared = configMap.get(slug);
    if (declared === undefined) {
      findings.push({ slug, kind: 'missing-config', declared: null, actual });
    } else if (declared !== actual) {
      findings.push({ slug, kind: 'mismatch', declared, actual });
    }
  }
  return findings;
}
