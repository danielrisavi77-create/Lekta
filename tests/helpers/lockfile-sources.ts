/**
 * Gard T99 (issue #220): gard izvora u lockfileu mora stvarno vrtjeti u CI-ju, i to PRIJE `npm audit`
 * u `npm-audit` jobu, selftest prije mjerenja. Skripta koja postoji, a nitko je ne pokrece, ne stiti
 * nista. Ponasanje skripte drze `tests/lockfile-sources.test.ts` i mutacije u `tests/gate-mutations.test.ts`.
 */
const SELFTEST = 'node scripts/lockfile-sources.mjs --selftest';
const MEASURE = 'node scripts/lockfile-sources.mjs\n';
const AUDIT = 'npm audit --omit=dev --audit-level=high';

const lf = (s: string) => s.replace(/\r\n?/g, '\n');

export function lockfileGuardWiringProblems(workflow: string): string[] {
  const src = lf(workflow);
  const a = src.indexOf('\n  npm-audit:\n');
  const b = src.indexOf('\n  gitleaks:\n');
  if (a === -1 || b === -1 || b < a) return ['security-audit.yml: job npm-audit nije pronadjen'];
  const job = src.slice(a, b);
  const out: string[] = [];
  const s = job.indexOf(SELFTEST);
  const m = job.indexOf(MEASURE);
  const audit = job.indexOf(AUDIT);
  if (s === -1) out.push('npm-audit: nema selftesta garda izvora');
  if (m === -1) out.push('npm-audit: nema mjerenja garda izvora');
  if (s !== -1 && m !== -1 && m < s) out.push('npm-audit: mjerenje prije selftesta');
  if (audit === -1) out.push('npm-audit: nema npm audit koraka');
  else if (m !== -1 && m > audit) out.push('npm-audit: gard izvora tek nakon npm audit');
  return out;
}
