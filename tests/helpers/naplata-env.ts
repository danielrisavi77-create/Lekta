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
  if (!src.includes("spawnSync('supabase'")) problems.push('preflight ne cita Supabase Edge secrets');
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
 * Kvar koji se ovim gasi: povrat prepoznat samo po `event_name === 'order_refunded'`. Stari handler
 * je u refund granu ulazio na `ev.refunded`, koju parser racuna i iz `attributes.status` i iz
 * `attributes.refunded`. Suzenje na ime znaci da dogadjaj s vracenim novcem pod drugim imenom
 * zavrsi kao `ignored` + 200: entitlement ostaje aktivan, a provider ne ponavlja.
 */
export function refundClassificationProblems(classify: Klasifikator): string[] {
  const problems: string[] = [];
  const pod = (eventName: string) =>
    classify({ eventName, status: 'refunded', userId: '', refunded: true }).kind;
  for (const eventName of ['order_refunded', 'order_updated', 'nesto_novo_od_providera']) {
    if (pod(eventName) !== 'refund') problems.push(`povrat pod imenom ${eventName} nije prepoznat`);
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
export function naplataRunbookProblems(runbook: string, outcomes: readonly string[]): string[] {
  const problems: string[] = [];
  for (const event of ['order_created', 'order_refunded']) {
    if (!runbook.includes(`\`${event}\``)) problems.push(`runbook ne imenuje dogadjaj ${event} za pretplatu`);
  }
  for (const outcome of outcomes) {
    if (!runbook.includes(`\`${outcome}\``)) problems.push(`runbook ne opisuje ishod ${outcome} iz webhook_events`);
  }
  if (!runbook.includes('webhook_events_unresolved')) {
    problems.push('runbook ne spominje da djelomicni indeks webhook_events_unresolved ne pokriva nove ishode');
  }
  if (!/from webhook_events/i.test(runbook)) {
    problems.push('runbook nema upit kojim se neobradjeni dogadjaji nalaze');
  }
  return problems;
}
