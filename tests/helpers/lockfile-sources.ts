/**
 * Gard T99 (issue #220): gard izvora u lockfileu mora stvarno i blokirajuce vrtjeti u CI-ju, u
 * `npm-audit` jobu, selftest prije mjerenja, i PRIJE `setup-deps` (koji na promasaj kesa radi `npm ci`
 * i izvrsava instalacijske skripte; Codex runda 1 na #258, F1). Skripta koja postoji, a nitko je ne
 * pokrece, ne stiti nista; ni korak s `continue-on-error`, `if:` ili `|| true` (F5).
 *
 * Koraci se citaju kao YAML blokovi `      - ` unutar joba, bez komentara, pa zakomentirana naredba ne
 * broji. `if` i `continue-on-error` se traze i na razini joba i u navodnicima (Codex runda 2 na #258, F5).
 * Ovo je strukturno citanje uvlaka ovog workflowa, ne puni YAML parser: `yaml` je samo tranzitivna
 * ovisnost, a nova izravna nije dopustena. Flow stil (`{ if: false }`) i sidra nisu pokriveni.
 * Isti obrazac drzi i `osv-scan` job (T99 korak 2). Ponasanje skripti drze `tests/lockfile-sources.test.ts`,
 * `tests/osv-query.test.ts` i mutacije u `tests/gate-mutations.test.ts`.
 */
const SETUP = 'uses: ./.github/actions/setup-deps';
const AUDIT = 'npm audit --omit=dev --audit-level=high';

const lf = (s: string) => s.replace(/\r\n?/g, '\n');

/** Kljuc koji cini korak ili job neblokirajucim ili preskocenim, i u navodnicima (Codex F5 na #258). */
const GATING = /^["']?(if|continue-on-error)["']?\s*:/;

/**
 * Aktivni retci (bez komentara i praznih) joba: kljucevi joba prije `steps:` i retci svakog koraka.
 * Kraj joba je sljedeci kljuc na razini jobova, pa redoslijed jobova u datoteci nije bitan.
 */
function jobBlock(workflow: string, job: string): { header: string[]; steps: string[][] } | null {
  const lines = lf(workflow).split('\n');
  const start = lines.findIndex((l) => l === `  ${job}:`);
  if (start === -1) return null;
  const header: string[] = [];
  const steps: string[][] = [];
  let inSteps = false;
  for (const line of lines.slice(start + 1)) {
    if (/^ {2}["']?[\w-]+["']?:/.test(line) || /^\S/.test(line)) break;
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (/^ {4}steps:/.test(line)) { inSteps = true; continue; }
    if (!inSteps) { if (/^ {4}\S/.test(line)) header.push(t); continue; }
    if (line.startsWith('      - ')) steps.push([t.slice(2)]);
    else if (steps.length && line.startsWith('        ')) steps[steps.length - 1].push(t);
  }
  return { header, steps };
}

/** Problemi blokirajuceg koraka skripte: selftest pa mjerenje, bez if/continue-on-error ni ignoriranog izlaza. */
function scriptStepProblems(job: string, block: { header: string[]; steps: string[][] }, script: string, label: string): { index: number; out: string[] } {
  const out: string[] = [];
  const selftest = `node scripts/${script} --selftest`;
  const measure = `node scripts/${script}`;
  if (block.header.some((l) => GATING.test(l))) out.push(`${job}: job ima if ili continue-on-error`);
  const index = block.steps.findIndex((st) => st.includes(selftest));
  if (index === -1) return { index, out: [...out, `${job}: nema selftesta ${label}`] };
  const g = block.steps[index];
  const s = g.indexOf(selftest);
  const m = g.indexOf(measure);
  if (m === -1) out.push(`${job}: nema mjerenja ${label}`);
  else if (m < s) out.push(`${job}: mjerenje prije selftesta`);
  if (g.some((l) => /^["']?continue-on-error["']?\s*:/.test(l))) out.push(`${job}: korak ${script} ima continue-on-error`);
  if (g.some((l) => /^["']?if["']?\s*:/.test(l))) out.push(`${job}: korak ${script} ima uvjet if`);
  if (g.some((l) => l.includes(script) && /\|\||;\s*true|\btrue\s*$/.test(l))) out.push(`${job}: izlaz ${script} se ignorira`);
  return { index, out };
}

export function lockfileGuardWiringProblems(workflow: string): string[] {
  const block = jobBlock(workflow, 'npm-audit');
  if (!block) return ['security-audit.yml: job npm-audit nije pronadjen'];
  const { index: guard, out } = scriptStepProblems('npm-audit', block, 'lockfile-sources.mjs', 'garda izvora');
  if (guard === -1) return out;
  const setup = block.steps.findIndex((st) => st.includes(SETUP));
  const audit = block.steps.findIndex((st) => st.includes(AUDIT) || st.includes(`run: ${AUDIT}`));
  if (setup === -1) out.push('npm-audit: nema setup-deps koraka');
  else if (guard > setup) out.push('npm-audit: gard izvora tek nakon instalacije (setup-deps)');
  if (audit === -1) out.push('npm-audit: nema npm audit koraka');
  else if (guard > audit) out.push('npm-audit: gard izvora tek nakon npm audit');
  return out;
}

/** T99 korak 2: osv-scan job vrti selftest pa mjerenje, blokirajuce. */
export function osvWiringProblems(workflow: string): string[] {
  const block = jobBlock(workflow, 'osv-scan');
  if (!block) return ['security-audit.yml: job osv-scan nije pronadjen'];
  return scriptStepProblems('osv-scan', block, 'osv-query.mjs', 'OSV ratcheta').out;
}
