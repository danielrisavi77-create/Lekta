/**
 * Cista provjera nad IZVOROM `supabase/functions/webhook-mor/handler.ts` (Stripe).
 *
 * Porijeklo: master je 2026-09-22/23 (31b802ad, 81a89f2f, daf5f53a) ovaj gard uveo nad izvorom
 * handlera prijasnjeg pruzatelja. Pri spajanju mastera u design/pack3 (2026-09-26) prenesen je na
 * Stripe handler; tvrdnje su iste po smislu:
 *  - odluku sto je placeno, sto je povrat i sto se ignorira ne donosi handler nego
 *    `classifyStripeEvent` iz src/report/webhook.ts;
 *  - refund grana se otvara po IMENU dogadjaja (`decision.kind === 'refund'`, dakle
 *    `charge.refunded`), nikad po zastavici `ev.refunded`, koju parser postavlja i za Refund
 *    objekt pod drugim imenom (`refund.created`, isRefundBearing);
 *  - nijedna grana koja vraca 200 bez knjizenja (`ignored`) nije tiha: ima log redak;
 *  - nedostajuci user_id ne odbija dogadjaj s 400 prije inboxa (placena kupnja bi nestala);
 *  - potvrdjena naplata bez user_id (`needs_manual_link`) ima vlastiti ishod i ERROR redak, ne
 *    WARN uz `ignored` (masterov ishod iz 31b802ad i 81a89f2f);
 *  - odbijeno porijeklo (`event_refused`) je ERROR, a vrstu dogadjaja ne filtrira gate nego
 *    klasifikator (inace grana za povrat pod drugim imenom nije dohvatljiva).
 *
 * Handler se na pack3 i IZVRSAVA u testu (tests/webhook-mor-handler.test.ts), pa je ovo drugi,
 * staticki sloj: jeftin za mutacije u tests/gate-mutations.test.ts.
 */
export function webhookHandlerProblems(src: string): string[] {
  const problems: string[] = [];
  if (/!ev\.orderId\s*\|\|\s*!ev\.userId/.test(src)) {
    problems.push('400 jos odbija dogadjaj zbog nedostajuceg user_id (placena kupnja bi nestala)');
  }
  if (!src.includes('classifyStripeEvent(ev)')) {
    problems.push('handler ne zove classifyStripeEvent (odluka je opet u Edge funkciji)');
  }
  for (const kind of ['ignored', 'refund'] as const) {
    if (!src.includes(`decision.kind === '${kind}'`)) problems.push(`handler ne grana na kind '${kind}'`);
  }
  if (/if\s*\(\s*ev\.refunded\s*\)/.test(src)) {
    problems.push('refund grana se otvara po zastavici ev.refunded, ne po imenu charge.refunded');
  }
  if (!src.includes("settle('ignored'")) problems.push('ignoriran dogadjaj se ne biljezi u inbox');
  // Grana `ignored` mora ostaviti trag i u LOGU, ne samo u inboxu (nalaz pregleda na masteru
  // 2026-09-23). Odluka pociva na obliku tudjeg objekta (`status`, `amount_received`); kad bi ta
  // pretpostavka pukla, SVAKA kupnja bi postala `ignored` + 200 bez retryja.
  const ignoredBranch = (() => {
    const start = src.indexOf("decision.kind === 'ignored'");
    if (start < 0) return '';
    const end = src.indexOf("settle('ignored'", start);
    return end > start ? src.slice(start, end) : '';
  })();
  if (!/console\.(error|warn)\(/.test(ignoredBranch)) {
    problems.push("grana 'ignored' nema log retka (200 bez retryja i bez traga u logu)");
  }
  // Odbijeno porijeklo (testni nacin, tudji racun) je ERROR: kriva konfiguracija ili pokusaj.
  if (!/console\.error\(\s*'webhook-mor event_refused'/.test(src)) {
    problems.push('odbijeno porijeklo (event_refused) nema log retka na ERROR razini');
  }
  // Gate koji opet filtrira VRSTU prije klasifikatora cini granu povrata pod drugim imenom
  // nedohvatljivom (nalaz pregleda kruga 2, 2026-09-26): `refund.created` bi postao WARN sum.
  if (/'event_ignored'/.test(src)) {
    problems.push('gate opet odbija vrstu dogadjaja (event_ignored) prije klasifikatora');
  }
  // Potvrdjena naplata bez korisnika: vlastita grana, vlastiti ishod, ERROR razina.
  const manualBranch = (() => {
    const start = src.indexOf("decision.kind === 'needs_manual_link'");
    if (start < 0) return '';
    const end = src.indexOf("settle('needs_manual_link'", start);
    return end > start ? src.slice(start, end) : '';
  })();
  if (!manualBranch) {
    problems.push("handler nema granu 'needs_manual_link' s ishodom needs_manual_link (placena uplata bez korisnika)");
  } else if (!/console\.error\(\s*'webhook-mor needs_manual_link'/.test(manualBranch)) {
    problems.push("grana 'needs_manual_link' nema ERROR redak (placena uplata bez korisnika bi utonula u WARN)");
  }
  if (/settle\(\s*'ignored',\s*'missing_user_metadata'/.test(src)) {
    problems.push('placena uplata bez korisnika opet zavrsava kao ignored/missing_user_metadata');
  }
  // Redoslijed: porijeklo prije klasifikacije, klasifikacija prije ikakvog knjizenja.
  const gate = src.indexOf('acceptEvent(ev, {');
  const classify = src.indexOf('classifyStripeEvent(ev)');
  const refund = src.indexOf("decision.kind === 'refund'");
  const insert = src.indexOf('buildEntitlementInsert(');
  if (gate >= 0 && classify >= 0 && !(gate < classify)) {
    problems.push('klasifikacija ide prije provjere porijekla (acceptEvent)');
  }
  if (classify >= 0 && insert >= 0 && !(classify < insert)) {
    problems.push('entitlement se upisuje prije klasifikacije');
  }
  if (classify >= 0 && refund >= 0 && !(classify < refund)) {
    problems.push('refund grana ide prije klasifikacije');
  }
  return problems;
}
