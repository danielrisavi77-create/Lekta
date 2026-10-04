/**
 * T84 RD-2 i RD-3: repair-docx trazi slot s limitom po korisniku i ima strop ishoda koji ne trose
 * kvotu (bez izmjena, vrata integriteta). Gard cita izvor index.ts; baseline je u
 * tests/repair-global-slot.test.ts, mutacije u tests/gate-mutations.test.ts.
 */
export function repairCostGuardProblems(src: string): string[] {
  const out: string[] = [];
  if (!/acquireRepairSlot\(admin, \{\s*userId: user\.id,[\s\S]*?maxPerUser: REPAIR_MAX_PER_USER,/.test(src)) {
    out.push('repair-docx: slot se ne trazi s korisnikom i limitom po korisniku');
  }
  if (!/globalSlot\.kind === 'full' \|\| globalSlot\.kind === 'user_busy'\) return json\(\{ error: 'busy' \}, 503\);/.test(src)) {
    out.push('repair-docx: user_busy ne vraca 503 busy');
  }
  const cap = src.indexOf(".in('status', UNCOUNTED_STATUSES)");
  const body = src.indexOf('const bounded = await readFormDataBounded(');
  if (cap < 0) out.push('repair-docx: nema stropa ishoda bez potrosnje');
  else if (body >= 0 && cap > body) out.push('repair-docx: strop ishoda bez potrosnje je tek nakon citanja tijela');
  if (!/await log\('no_change', null\);/.test(src)) out.push('repair-docx: ishod bez izmjena se ne biljezi');
  if (!/await log\('integrity_failed', null\);/.test(src)) out.push('repair-docx: odbijena isporuka se ne biljezi');
  if (!/\.not\('status', 'in', `\(\$\{UNCOUNTED_STATUSES\.join\(','\)\}\)`\)/.test(src)) {
    out.push('repair-docx: placeni dnevni strop broji i ishode bez potrosnje');
  }
  return out;
}
