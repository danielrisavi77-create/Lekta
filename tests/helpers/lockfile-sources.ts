/**
 * Gard T99 (issue #220): gard izvora u lockfileu mora stvarno i blokirajuce vrtjeti u CI-ju, u
 * `npm-audit` jobu, selftest prije mjerenja, i PRIJE `setup-deps` (koji na promasaj kesa radi `npm ci`
 * i izvrsava instalacijske skripte; Codex runda 1 na #258, F1). Skripta koja postoji, a nitko je ne
 * pokrece, ne stiti nista; ni korak s `continue-on-error`, `if:` ili `|| true` (F5).
 *
 * Koraci se citaju kao YAML blokovi `      - ` unutar joba, bez komentara, pa zakomentirana naredba ne
 * broji. Ponasanje skripte drze `tests/lockfile-sources.test.ts` i mutacije u `tests/gate-mutations.test.ts`.
 */
const SELFTEST = 'node scripts/lockfile-sources.mjs --selftest';
const MEASURE = 'node scripts/lockfile-sources.mjs';
const SETUP = 'uses: ./.github/actions/setup-deps';
const AUDIT = 'npm audit --omit=dev --audit-level=high';

const lf = (s: string) => s.replace(/\r\n?/g, '\n');

/** Aktivni retci (bez komentara i praznih) svakog koraka u jobu, po redu. */
function jobSteps(workflow: string, job: string, nextJob: string): string[][] | null {
  const src = lf(workflow);
  const a = src.indexOf(`\n  ${job}:\n`);
  const b = src.indexOf(`\n  ${nextJob}:\n`);
  if (a === -1 || b === -1 || b < a) return null;
  const steps: string[][] = [];
  for (const line of src.slice(a, b).split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (line.startsWith('      - ')) steps.push([t.slice(2)]);
    else if (steps.length && line.startsWith('        ')) steps[steps.length - 1].push(t);
  }
  return steps;
}

export function lockfileGuardWiringProblems(workflow: string): string[] {
  const steps = jobSteps(workflow, 'npm-audit', 'gitleaks');
  if (!steps) return ['security-audit.yml: job npm-audit nije pronadjen'];
  const out: string[] = [];
  const guard = steps.findIndex((s) => s.includes(SELFTEST));
  const setup = steps.findIndex((s) => s.includes(SETUP));
  const audit = steps.findIndex((s) => s.includes(AUDIT) || s.includes(`run: ${AUDIT}`));
  if (guard === -1) return ['npm-audit: nema selftesta garda izvora'];
  const g = steps[guard];
  const s = g.indexOf(SELFTEST);
  const m = g.indexOf(MEASURE);
  if (m === -1) out.push('npm-audit: nema mjerenja garda izvora');
  else if (m < s) out.push('npm-audit: mjerenje prije selftesta');
  if (g.some((l) => /^continue-on-error:/.test(l))) out.push('npm-audit: gard izvora ima continue-on-error');
  if (g.some((l) => /^if:/.test(l))) out.push('npm-audit: gard izvora ima uvjet if');
  if (g.some((l) => l.includes('lockfile-sources.mjs') && /\|\||;\s*true|\btrue\s*$/.test(l))) {
    out.push('npm-audit: izlaz garda izvora se ignorira');
  }
  if (setup === -1) out.push('npm-audit: nema setup-deps koraka');
  else if (guard > setup) out.push('npm-audit: gard izvora tek nakon instalacije (setup-deps)');
  if (audit === -1) out.push('npm-audit: nema npm audit koraka');
  else if (guard > audit) out.push('npm-audit: gard izvora tek nakon npm audit');
  return out;
}
