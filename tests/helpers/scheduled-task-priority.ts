/**
 * Gard prioriteta Scheduled Taska u PowerShell skripti za registraciju.
 *
 * Zasto: Task Scheduler po zadanom daje prioritet 7, a uz njega ide nizak I/O prioritet. Zadatak
 * koji cita puno s diska (dnevni izvjestaj potrosnje cita transkripte) tada gladuje uz tudje
 * gateove i biva prekinut na ExecutionTimeLimit bez izlaza (izmjereno 2026-10-04).
 * Normalan I/O imaju prioriteti 4 do 6.
 */
export function taskPriorityProblems(ps1Source: string): string[] {
  const src = ps1Source.replace(/\r/g, '');
  // Komentari ne smiju zadovoljiti gard: gleda se samo redak s pozivom cmdleta.
  const lines = src.split('\n').filter((l) => !l.trim().startsWith('#') && l.includes('New-ScheduledTaskSettingsSet'));
  if (lines.length === 0) return ['nema poziva New-ScheduledTaskSettingsSet'];
  const problems: string[] = [];
  for (const line of lines) {
    const m = line.match(/-Priority\s+(\d+)\b/);
    if (!m) problems.push('New-ScheduledTaskSettingsSet bez -Priority (zadano 7, nizak I/O prioritet)');
    else if (Number(m[1]) < 4 || Number(m[1]) > 6) problems.push(`-Priority ${m[1]} je izvan 4 do 6 (normalan I/O prioritet)`);
  }
  return problems;
}
