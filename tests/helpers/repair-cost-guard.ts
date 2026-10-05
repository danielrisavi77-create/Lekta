/**
 * T84 RD-2 i RD-3: repair-docx trazi slot s limitom po korisniku i ima fail-closed strop ishoda koji ne
 * trose kvotu (bez izmjena, vrata integriteta), provjeren PRIJE citanja tijela. Gard cita izvor
 * index.ts; baseline je u tests/repair-global-slot.test.ts, mutacije u tests/gate-mutations.test.ts.
 * Moduli global-slot.ts i attempt-cap.ts izvrsavaju se u tests/repair-global-slot.test.ts, a sam handler
 * (uz lazni esm.sh klijent) u tests/repair-docx-attempt-cap-handler.test.ts.
 */
export function repairCostGuardProblems(src: string): string[] {
  const out: string[] = [];
  if (!/acquireRepairSlot\(admin, \{\s*userId: user\.id,[\s\S]*?maxPerUser: REPAIR_MAX_PER_USER,/.test(src)) {
    out.push('repair-docx: slot se ne trazi s korisnikom i limitom po korisniku');
  }
  if (!/globalSlot\.kind === 'full' \|\| globalSlot\.kind === 'user_busy'\) return json\(\{ error: 'busy' \}, 503\);/.test(src)) {
    out.push('repair-docx: user_busy ne vraca 503 busy');
  }
  if (!/if \(globalSlot\.kind === 'error'\) return json\(\{ error: 'unavailable' \}, 503\);/.test(src)) {
    out.push('repair-docx: greska slota ne vraca 503');
  }
  const capCall = src.indexOf('const attemptCap = await attemptCapStatus(admin, user.id, REPAIR_UNCOUNTED_DAILY_CAP);');
  const body = src.indexOf('const bounded = await readFormDataBounded(');
  if (capCall < 0) out.push('repair-docx: nema stropa ishoda bez potrosnje');
  else if (body < 0 || capCall > body) out.push('repair-docx: strop ishoda bez potrosnje nije prije citanja tijela');
  const over = src.indexOf("if (attemptCap === 'over') return json({ error: 'rate_limited', reason: 'attempts_daily' }, 429);");
  if (over < 0 || (body >= 0 && over > body)) out.push('repair-docx: strop ishoda ne vraca 429 attempts_daily prije citanja tijela');
  const err = src.indexOf("if (attemptCap === 'error') return json({ error: 'unavailable' }, 503);");
  if (err < 0 || (body >= 0 && err > body)) out.push('repair-docx: necitljiv dnevnik pokusaja ne vraca 503 prije citanja tijela');
  const reserve = src.indexOf('const attempt = await reserveAttempt(admin, user.id, REPAIR_UNCOUNTED_DAILY_CAP);');
  const reserveFail = src.indexOf("if (!attempt) return json({ error: 'unavailable' }, 503);");
  if (reserve < 0 || (body >= 0 && reserve > body)) out.push('repair-docx: pokusaj se ne rezervira prije citanja tijela');
  if (reserveFail < 0 || reserveFail < reserve || (body >= 0 && reserveFail > body)) {
    out.push('repair-docx: neuspjela rezervacija ne vraca 503 prije citanja tijela');
  }
  if (!src.includes("await finishAttempt(admin, attempt, 'no_change');")) out.push('repair-docx: ishod bez izmjena se ne dopisuje na rezervaciju');
  if (!src.includes("await finishAttempt(admin, attempt, 'integrity_failed');")) out.push('repair-docx: odbijena isporuka se ne dopisuje na rezervaciju');
  if (!/const log = async \(status: string, sId: string \| null\) => \{[\s\S]*?if \(!written\.error\) await dropAttempt\(admin, attempt\);/.test(src)) {
    out.push('repair-docx: zapis u report_generations ne brise rezervaciju (dvostruko brojanje)');
  }
  if (/log\('(no_change|integrity_failed)'/.test(src)) out.push('repair-docx: ishod bez potrosnje ide u report_generations');
  return out;
}
