/**
 * Ciste funkcije nad IZVOROM Edge funkcija naplate, da se gard moze mutirati bez diranja diska.
 *
 * Deno kod se pod vitestom ne izvodi, pa je jedino sto se moze mjeriti ono sto izvor DEKLARIRA:
 * koja imena tajni cita. To je manje od "funkcija radi", i tako je i imenovano.
 */

/** Sva imena koja izvor cita kroz `Deno.env.get('IME')`. */
export function envNames(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/Deno\.env\.get\(\s*['"]([A-Z0-9_]+)['"]\s*\)/g)) out.add(m[1]);
  return out;
}

/**
 * Nalazi o imenu tajne za Lemon Squeezy trgovinu. Prazno = obje funkcije naplate citaju
 * `LEMONSQUEEZY_STORE_ID` i nijedna vise ne cita staro `LS_STORE_ID`.
 */
export function storeIdSecretProblems(sources: Readonly<Record<string, string>>): string[] {
  const problems: string[] = [];
  for (const [name, src] of Object.entries(sources)) {
    const names = envNames(src);
    if (!names.has('LEMONSQUEEZY_STORE_ID')) problems.push(`${name}: ne cita LEMONSQUEEZY_STORE_ID`);
    if (names.has('LS_STORE_ID')) problems.push(`${name}: jos cita staro ime LS_STORE_ID`);
  }
  return problems;
}

/**
 * Nalazi o PREFLIGHTU naplate, mjereni nad njegovim izvorom.
 *
 * Kvar koji se ovim gasi (nalaz pregleda 2026-09-23): preflight je citao `process.env`, dakle
 * ljusku operatera, dok tajne koje `webhook-mor` stvarno koristi zive u Supabase Edge Functions
 * Secretsima. Zeleno u ljusci nije dokaz o okolini deploya; operater s izvezenom varijablom dobio
 * bi prolaz iako je tajna u projektu prazna.
 */
export function preflightSourceProblems(src: string): string[] {
  const problems: string[] = [];
  if (!src.includes("['secrets', 'list'")) problems.push('preflight ne cita Supabase Edge secrets');
  // CLI se NE smije zvati golim imenom iz PATH-a: repo ga isporucuje kao devDependency, pa bi takav
  // poziv na cistom stroju uvijek padao istom greskom, i kad su tajne ispravne i kad su prazne
  // (izmjereno 2026-09-23: `'supabase' is not recognized`). Gard koji je uvijek crven iz razloga
  // koji ne mjeri nauci operatera da ga preskoci.
  if (/spawnSync\(\s*'supabase'/.test(src)) {
    problems.push('preflight zove goli `supabase` iz PATH-a umjesto CLI-ja iz node_modules/.bin');
  }
  if (!src.includes("node_modules', '.bin'")) {
    problems.push('preflight ne razrjesava Supabase CLI iz node_modules/.bin');
  }
  // Razlog pada mora razlikovati "CLI se ne moze pokrenuti" od "tajna je prazna". CLI poruku o
  // gresci pise i na stdout, pa citanje samo stderr-a daje "bez poruke".
  if (!/res\.stderr, res\.stdout/.test(src)) {
    problems.push('preflight cita samo stderr pa razlog pada ostaje neimenovan');
  }
  const envGate = src.indexOf("argv.includes('--env')");
  if (envGate < 0) {
    problems.push('preflight nema izricitu --env granu za lokalnu ljusku');
    return problems;
  }
  const zadano = src.slice(src.indexOf('} else {', envGate));
  if (zadano === '' || !zadano.includes('readSupabaseSecrets')) {
    problems.push('zadani put preflighta ne dohvaca Supabase secrets');
  }
  if (zadano.includes('process.env')) {
    problems.push('zadani put preflighta jos cita process.env (mjeri ljusku, ne okolinu deploya)');
  }
  return problems;
}

/** Odluka koju `classifyLemonEvent` donosi; uzi potpis od pravog tipa, da se moze mutirati. */
type KlasifikatorUlaz = { eventName: string; status: string; userId: string; refunded: boolean };
type Klasifikator = (ev: KlasifikatorUlaz) => { kind: string; reason?: string };

/**
 * Nalazi o KLASIFIKATORU povrata. Prima funkciju, pa se mutacija radi zamjenom funkcije, ne
 * zamjenom teksta izvora.
 *
 * Kvar koji se ovim gasi (nalaz pregleda 2026-09-23): povrat prepoznat po ZASTAVICI `ev.refunded`
 * umjesto po imenu dogadjaja. `parseLemonEvent` tu zastavicu racuna i iz `attributes.status` i iz
 * `attributes.refunded`, dakle bez obzira na `event_name`, a refund grana handlera pise
 * `update entitlements ... where order_id = ev.orderId` i povlaci referral nagrade po istom id-u.
 * Kod dogadjaja pretplate (`subscription_payment_refunded`) `data.id` je id pretplatnickog RACUNA,
 * a ne narudzbe, pa bi numericki pogodak tiho ugasio pravo pristupa kupcu koji je uredno platio.
 *
 * Zato: refund SAMO iz `order_refunded`. Vracen novac pod drugim imenom nije tiho odbacen nego
 * `ignored` s razlogom `povrat_bez_order_refunded:*`, koji mora biti medju `notable` prefiksima
 * (ERROR u logu i vlastiti redak u runbooku).
 */
export function refundClassificationProblems(classify: Klasifikator, notablePrefixes: readonly string[] = []): string[] {
  const problems: string[] = [];
  // Povrat po imenu, bez obzira na userId i na to sto je u statusu.
  for (const status of ['refunded', '', 'paid']) {
    const out = classify({ eventName: 'order_refunded', status, userId: '', refunded: true });
    if (out.kind !== 'refund') problems.push(`order_refunded sa statusom "${status}" nije prepoznat kao povrat`);
  }
  // Tudje ime sa zastavicom povrata NE SMIJE upasti u refund granu: njegov id nije id narudzbe.
  for (const eventName of ['subscription_payment_refunded', 'order_updated', 'nesto_novo_od_providera']) {
    const out = classify({ eventName, status: 'refunded', userId: '', refunded: true });
    if (out.kind === 'refund') {
      problems.push(`dogadjaj ${eventName} je usao u refund granu iako mu data.id nije id narudzbe`);
      continue;
    }
    if (out.kind !== 'ignored') {
      problems.push(`dogadjaj ${eventName} sa zastavicom povrata nije ignored nego ${out.kind}`);
      continue;
    }
    // Ignoriran, ali ne tiho: razlog mora biti medju onima koji se logiraju na ERROR razini.
    const reason = String(out.reason ?? '');
    if (notablePrefixes.length > 0 && !notablePrefixes.some((prefix) => reason.startsWith(prefix))) {
      problems.push(`povrat pod imenom ${eventName} je ignoriran TIHO (razlog "${reason}" nije notable)`);
    }
  }
  if (classify({ eventName: 'order_created', status: 'PAID', userId: 'u1', refunded: false }).kind !== 'paid') {
    problems.push('status PAID velikim slovom nije prepoznat kao placeno');
  }
  return problems;
}

/** Svi ishodi koje handler upisuje u `webhook_events.outcome`, izvedeni iz izvora. */
export function handlerOutcomes(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(/settle\(\s*'([a-z_]+)'/g)) out.add(m[1]);
  return [...out].sort();
}

/**
 * Nalazi o RUNBOOKU naplate (`docs/GO_LIVE_NAPLATA.md`).
 *
 * Dva kvara koja se ovim gase (nalaz pregleda 2026-09-23):
 *  1. Runbook nije imenovao koje LS dogadjaje treba pretplatiti. Handler od 2026-09-22 obradjuje
 *     tocno `order_created` i `order_refunded`, pa operater koji pretplati samo prvi dobije naplatu
 *     koja radi i povrate koji se nikad ne obrade.
 *  2. Novi ishodi `needs_manual_link` i `ignored` traze ljudsku radnju, a nisu u djelomicnom
 *     indeksu `webhook_events_unresolved`; bez retka u runbooku nitko ih nema po cemu naci.
 */
export function naplataRunbookProblems(
  runbook: string,
  outcomes: readonly string[],
  detailPrefixes: readonly string[] = [],
): string[] {
  const problems: string[] = [];
  for (const event of ['order_created', 'order_refunded']) {
    if (!runbook.includes(`\`${event}\``)) problems.push(`runbook ne imenuje dogadjaj ${event} za pretplatu`);
  }
  for (const outcome of outcomes) {
    if (!runbook.includes(`\`${outcome}\``)) problems.push(`runbook ne opisuje ishod ${outcome} iz webhook_events`);
  }
  // Ishod `ignored` pokriva vise razlicitih razloga, a dva od njih traze razlicitu radnju. Ime
  // ishoda zato nije dovoljno: runbook mora imenovati svaki prefiks koji klasifikator moze upisati
  // u `outcome_detail`.
  for (const prefix of detailPrefixes) {
    if (!runbook.includes(`\`${prefix}\``)) {
      problems.push(`runbook ne opisuje razlog ${prefix} iz webhook_events.outcome_detail`);
    }
  }
  if (!runbook.includes('webhook_events_unresolved')) {
    problems.push('runbook ne spominje da djelomicni indeks webhook_events_unresolved ne pokriva nove ishode');
  }
  if (!/from webhook_events/i.test(runbook)) {
    problems.push('runbook nema upit kojim se neobradjeni dogadjaji nalaze');
  }
  return problems;
}

/** SQL kljucne rijeci i funkcije koje se u upitima pojavljuju, a nisu imena stupaca. */
const SQL_RIJECI = new Set([
  'select', 'from', 'where', 'order', 'by', 'group', 'having', 'limit', 'offset', 'asc', 'desc',
  'and', 'or', 'not', 'in', 'is', 'null', 'as', 'on', 'join', 'left', 'right', 'inner', 'outer',
  'update', 'set', 'insert', 'into', 'values', 'delete', 'distinct', 'case', 'when', 'then', 'else',
  'end', 'exists', 'between', 'like', 'ilike', 'count', 'sum', 'min', 'max', 'coalesce', 'now',
  'interval', 'true', 'false', 'returning', 'with', 'using', 'all', 'any', 'public',
]);

/**
 * Imena stupaca tablice `webhook_events`, procitana iz migracije koja ju stvara.
 *
 * Izvod, ne prepisan popis: kad se tablici doda stupac, gard ga vidi bez diranja testa.
 */
export function webhookEventsColumns(migrationSql: string): string[] {
  const start = migrationSql.search(/create table if not exists public\.webhook_events\s*\(/i);
  if (start < 0) return [];
  const open = migrationSql.indexOf('(', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < migrationSql.length; i += 1) {
    if (migrationSql[i] === '(') depth += 1;
    else if (migrationSql[i] === ')') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return [];
  const body = migrationSql.slice(open + 1, end);
  const columns: string[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/--.*$/, '').trim();
    const m = /^([a-z_][a-z0-9_]*)\s+[a-z]/i.exec(line);
    if (m && !SQL_RIJECI.has(m[1].toLowerCase())) columns.push(m[1]);
  }
  return columns;
}

/**
 * Nalazi o SQL UPITIMA u runbooku: imena stupaca moraju postojati u tablici.
 *
 * Kvar koji se ovim gasi (nalaz pregleda 2026-09-23): oba upita u sekciji 5.1 citala su i sortirala
 * po `created_at`, stupcu kojeg `webhook_events` nema (migracija 0092 ima `received_at`). Bas ti
 * upiti su jedini dokumentirani nacin da se nadju redci s ishodom `needs_manual_link`, jer ih
 * djelomicni indeks `webhook_events_unresolved` namjerno ne pokriva. Operater bi umjesto popisa
 * placenih narudzbi bez prava pristupa dobio `ERROR: column "created_at" does not exist`.
 *
 * Postojeci gard to nije mogao vidjeti: trazio je samo da se niz `from webhook_events` negdje
 * pojavi, dakle POSTOJANJE upita, ne njegovu valjanost.
 *
 * Granica tvrdnje: ovo nije SQL parser. Mjeri se samo da svaki goli identifikator u upitu nad
 * `webhook_events` bude ili stupac te tablice, ili SQL rijec, ili alias uveden s `as`. Tocnost
 * semantike upita (vraca li ono sto treba) ostaje neprovjerena.
 */
export function runbookSqlColumnProblems(runbook: string, migrationSql: string): string[] {
  const columns = new Set(webhookEventsColumns(migrationSql));
  if (columns.size === 0) return ['migracija webhook_events se ne moze procitati (izvod stupaca je prazan)'];

  // Ogradjeni blokovi prvo, pa se IZ TEKSTA maknu: inace bi parovi obicnih navodnika presli preko
  // ograde i spojili prozu u lazan "upit".
  const blocks: string[] = [];
  let proza = runbook;
  for (const m of runbook.matchAll(/```[a-z]*\r?\n([\s\S]*?)```/g)) {
    blocks.push(m[1]);
    proza = proza.replace(m[0], '\n');
  }
  // Upit napisan u redu teksta (npr. korak zatvaranja traga), unutar jednog para navodnika.
  for (const m of proza.matchAll(/`([^`]+)`/g)) blocks.push(m[1]);

  const problems: string[] = [];
  let mjereno = 0;
  for (const block of blocks) {
    if (!/\bwebhook_events\b/.test(block)) continue;
    if (!/\b(select|update|delete|insert)\b/i.test(block)) continue;
    mjereno += 1;
    const ocisceno = block
      .replace(/--[^\r\n]*/g, ' ') // SQL komentari nisu upit
      .replace(/'[^']*'/g, ' ') // znakovni nizovi
      .replace(/<[^>]*>/g, ' '); // mjesta za popunjavanje, npr. <id>
    const aliasi = new Set<string>();
    for (const m of ocisceno.matchAll(/\bas\s+([a-z_][a-z0-9_]*)/gi)) aliasi.add(m[1].toLowerCase());
    for (const m of ocisceno.matchAll(/[a-z_][a-z0-9_]*/gi)) {
      const ime = m[0].toLowerCase();
      if (ime === 'webhook_events' || SQL_RIJECI.has(ime) || aliasi.has(ime)) continue;
      if (columns.has(ime)) continue;
      problems.push(`upit nad webhook_events koristi "${ime}", a taj stupac tablica nema`);
    }
  }
  if (mjereno === 0) problems.push('runbook nema nijedan SQL upit nad webhook_events (nema sto mjeriti)');
  return [...new Set(problems)];
}

/**
 * Sva imena log redaka `webhook-mor <ime>` koje izvor Edge funkcije stvarno ispisuje
 * (`console.error`/`console.warn`), izvedena iz izvora, ne popisana rucno.
 */
export function webhookMorLogNames(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/console\.(?:error|warn)\(\s*'webhook-mor ([a-z_]+)'/g)) out.add(m[1]);
  return out;
}

/**
 * Nalazi o IMENIMA LOG REDAKA u runbooku (nalaz pregleda 2026-09-23): runbook je spominjao
 * `webhook-mor ignored_unpaid_order`, redak koji izvor nikad nije ispisao (stvarno ime je
 * `ignored_needs_attention`). Tko bi taj redak trazio u logu (npr. grepom) ne bi nasao nista i
 * zakljucio da se ignorirane narudzbe uopce ne dogadjaju.
 */
export function runbookLogNameProblems(runbook: string, logNames: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const spomenuta = new Set<string>();
  for (const m of runbook.matchAll(/`webhook-mor ([a-z_]+)`/g)) spomenuta.add(m[1]);
  if (spomenuta.size === 0) problems.push('runbook ne spominje nijedno ime log retka webhook-mor (nema sto mjeriti)');
  for (const ime of spomenuta) {
    if (!logNames.has(ime)) problems.push(`runbook spominje webhook-mor ${ime}, a izvor taj redak ne ispisuje`);
  }
  return problems;
}

/** Koliko je upita nad `webhook_events` gard stvarno izmjerio; stiti baseline od vakuuma. */
export function runbookSqlQueryCount(runbook: string): number {
  let n = 0;
  let proza = runbook;
  for (const m of runbook.matchAll(/```[a-z]*\r?\n([\s\S]*?)```/g)) {
    proza = proza.replace(m[0], '\n');
    if (/\bwebhook_events\b/.test(m[1]) && /\b(select|update|delete|insert)\b/i.test(m[1])) n += 1;
  }
  for (const m of proza.matchAll(/`([^`]+)`/g)) {
    if (/\bwebhook_events\b/.test(m[1]) && /\b(select|update|delete|insert)\b/i.test(m[1])) n += 1;
  }
  return n;
}

/**
 * Nalazi o PUTU DEPLOYA naplate.
 *
 * Kvar koji se ovim gasi (nalaz pregleda 2026-09-23): preflight je postojao, ali ga nije dosezao
 * nijedan automatski put. `npm run check` ga ne vidi (trazi zivi CLI i povezan projekt),
 * `release:check` ne zna za naplatu, pa je jedina obrana od prazne tajne bila da se operater sjeti
 * pokrenuti skriptu iz runbooka. Tko preskoci taj redak deploya `webhook-mor` s praznim
 * `LEMONSQUEEZY_STORE_ID`, a `acceptEvent` je fail-closed: svaka kupnja dobije `refused` i 200 bez
 * retryja.
 *
 * Lijek koji se ovdje mjeri: deploy naplate je JEDNA naredba koja preflight nosi u sebi, i runbook
 * goli `supabase functions deploy` za te dvije funkcije vise ne nudi.
 */
export function naplataDeployPathProblems(
  runbook: string,
  packageJson: { scripts?: Record<string, string> },
  preflightSrc: string,
): string[] {
  const problems: string[] = [];
  const script = packageJson.scripts?.['deploy:naplata'] ?? '';
  if (!script.includes('verify-naplata-secrets.mjs')) {
    problems.push('npm skripta deploy:naplata ne ide kroz preflight verify-naplata-secrets.mjs');
  }
  if (!script.includes('--deploy')) problems.push('npm skripta deploy:naplata ne predaje --deploy');
  if (!runbook.includes('npm run deploy:naplata')) {
    problems.push('runbook ne upucuje na npm run deploy:naplata kao put deploya naplate');
  }
  for (const fn of ['webhook-mor', 'create-checkout']) {
    if (runbook.includes(`supabase functions deploy ${fn}`)) {
      problems.push(`runbook jos nudi goli supabase functions deploy ${fn}, koji zaobilazi preflight`);
    }
  }
  // Deploy u skripti smije poceti TEK nakon presude o tajnama; inace bi lanac bio samo kozmeticki.
  const verdict = preflightSrc.indexOf('const verdict = supabaseSecretsVerdict(read.rows);');
  const deployCall = preflightSrc.indexOf("'functions', 'deploy'");
  if (verdict < 0 || deployCall < 0 || deployCall < verdict) {
    problems.push('preflight ne deploya tek nakon presude o tajnama');
  }
  if (/--(skip|no)-preflight/.test(preflightSrc)) {
    problems.push('preflight ima zastavicu za preskakanje, pa put deploya moze zaobici provjeru');
  }
  return problems;
}
