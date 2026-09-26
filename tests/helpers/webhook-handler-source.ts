/**
 * Cista provjera nad IZVOROM `supabase/functions/webhook-mor/handler.ts` (Stripe).
 *
 * Porijeklo: master je 2026-09-22/23 (31b802ad, 81a89f2f, daf5f53a) ovaj gard uveo nad izvorom
 * handlera prijasnjeg pruzatelja. Pri spajanju mastera u design/pack3 (2026-09-26) prenesen je na
 * Stripe handler; tvrdnje su iste po smislu:
 *  - odluku sto je placeno, sto je povrat i sto se ignorira ne donosi handler nego
 *    `classifyStripeEvent` iz src/report/webhook.ts;
 *  - refund grana se otvara po IMENU dogadjaja (`decision.kind === 'refund'`, dakle
 *    `charge.refunded`), nikad po zastavici `ev.refunded`, koju parser racuna i iz
 *    `data.object.refunded` bez obzira na ime;
 *  - nijedna grana koja vraca 200 bez knjizenja (`ignored`) nije tiha: ima log redak;
 *  - nedostajuci user_id ne odbija dogadjaj s 400 prije inboxa (placena kupnja bi nestala).
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
  // Isto vrijedi za vrstu koju gate odbija prije klasifikacije (`event_ignored`).
  if (!/console\.(error|warn)\(\s*'webhook-mor event_ignored'/.test(src)) {
    problems.push('odbijena vrsta dogadjaja (event_ignored) nema log retka na WARN ili ERROR razini');
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
