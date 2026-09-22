/**
 * Cista provjera nad IZVOROM `supabase/functions/webhook-mor/index.ts`.
 *
 * Deno kod se pod vitestom ne izvodi, pa se ne moze tvrditi da handler radi. Moze se tvrditi da
 * odluku vise ne donosi sam nego kroz `classifyLemonEvent`, i da je 400 suzen na nedostajuci
 * order_id. Oboje je bilo drukcije do 2026-09-22 i oboje je bilo kvar: `!ev.orderId || !ev.userId`
 * je placenu narudzbu bez `meta.custom_data.user_id` odbijao s 400 PRIJE upisa u inbox, pa bi
 * naplacena kupnja nestala bez traga.
 *
 * Funkcija je cista da se moze mutirati u memoriji (`tests/gate-mutations.test.ts`).
 */
export function webhookHandlerProblems(src: string): string[] {
  const problems: string[] = [];
  if (/!ev\.orderId\s*\|\|\s*!ev\.userId/.test(src)) {
    problems.push('400 jos odbija dogadjaj zbog nedostajuceg user_id (placena kupnja bi nestala)');
  }
  if (!src.includes('classifyLemonEvent(ev)')) {
    problems.push('handler ne zove classifyLemonEvent (odluka je opet u Edge funkciji)');
  }
  for (const kind of ['ignored', 'needs_manual_link', 'refund'] as const) {
    if (!src.includes(`decision.kind === '${kind}'`)) problems.push(`handler ne grana na kind '${kind}'`);
  }
  if (!src.includes("settle('ignored'")) problems.push('ignoriran dogadjaj se ne biljezi u inbox');
  if (!src.includes("settle('needs_manual_link'")) problems.push('needs_manual_link se ne biljezi u inbox');
  return problems;
}
