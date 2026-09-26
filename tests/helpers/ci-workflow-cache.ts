/**
 * Cisti provjeritelji nad tekstom GitHub Actions workflow YAML-a (CI kesiranje ovisnosti).
 *
 * Izdvojeno iz `tests/ci-workflow-cache.test.ts` da bi `tests/gate-mutations.test.ts` mogao
 * podmetnuti POZNAT kvar (posao koji zove `npm ci` mimo composite akcije, ili `uses:` koji
 * nije pinan SHA-om) SAMO u memoriji i dokazati da isti kod koji cuva pravi repo to hvata.
 */
import { parse as parseYaml } from 'yaml';

/** Podudara `npm ci` kao zaseban naredbeni token (ne kao dio duljeg imena skripte). */
const BARE_NPM_CI = /(^|[;&|]|\n|\r)\s*npm ci(\s|$)/;

/** `uses: vlasnik/repo@<40 hex sha>` s komentarom verzije na istom retku. */
const PINNED_USES_LINE = /^\s*(?:-\s*)?uses:\s*([\w.-]+\/[\w.-]+)@([0-9a-f]{40})\s*#\s*\S+/;
/** Bilo koji `uses:` koji cilja vanjski repo (ima `/` prije `@`), pinan ili ne. */
const ANY_EXTERNAL_USES_LINE = /^\s*(?:-\s*)?uses:\s*([\w.-]+\/[\w.-]+)@(\S+)/;
/** Lokalna composite akcija (`./.github/actions/...`) nema SHA jer nije vanjski repo. */
const LOCAL_ACTION_USES_LINE = /^\s*(?:-\s*)?uses:\s*\.\//;

export interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
}
export interface WorkflowJob {
  steps?: WorkflowStep[];
}
export interface WorkflowDoc {
  jobs?: Record<string, WorkflowJob>;
}

/** Parsira workflow YAML u strukturu (job -> koraci); baca na neispravan YAML. */
export function parseWorkflow(text: string): WorkflowDoc {
  return parseYaml(text) as WorkflowDoc;
}

/**
 * Poslovi (job imena) ciji koraci zovu `npm ci` DIREKTNO (bez composite akcije). Prazno
 * znaci da su SVI takvi poslovi presloseni kroz `./.github/actions/setup-deps`.
 */
export function jobsWithBareNpmCi(text: string): string[] {
  const doc = parseWorkflow(text);
  const offenders: string[] = [];
  for (const [jobName, job] of Object.entries(doc.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if (step.run && BARE_NPM_CI.test(step.run)) {
        offenders.push(jobName);
        break;
      }
    }
  }
  return offenders;
}

/** Poslovi ciji koraci pozivaju composite akciju `setup-deps`. */
export function jobsUsingSetupDeps(text: string): string[] {
  const doc = parseWorkflow(text);
  const users: string[] = [];
  for (const [jobName, job] of Object.entries(doc.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if (step.uses && step.uses.includes('.github/actions/setup-deps')) {
        users.push(jobName);
        break;
      }
    }
  }
  return users;
}

export interface UnpinnedUse {
  line: number;
  text: string;
}

/**
 * Retci s `uses:` prema vanjskom repozitoriju koji NISU pinani na 40-heks SHA uz komentar
 * verzije. Lokalne composite akcije (`./...`) se preskacu (nemaju SHA jer nisu vanjski repo).
 */
export function unpinnedExternalUses(text: string): UnpinnedUse[] {
  const offenders: UnpinnedUse[] = [];
  const lines = text.split(/\r\n|\r|\n/);
  lines.forEach((line, i) => {
    if (LOCAL_ACTION_USES_LINE.test(line)) return;
    if (!ANY_EXTERNAL_USES_LINE.test(line)) return;
    if (!PINNED_USES_LINE.test(line)) {
      offenders.push({ line: i + 1, text: line.trim() });
    }
  });
  return offenders;
}

/** Ima li composite akcija kes-korak ciji kljuc sadrzi `hashFiles('package-lock.json')`. */
export function hasLockfileHashedCacheStep(actionText: string): boolean {
  const doc = parseYaml(actionText) as {
    runs?: { steps?: Array<{ uses?: string; with?: Record<string, unknown> }> };
  };
  const steps = doc.runs?.steps ?? [];
  return steps.some((step) => {
    if (!step.uses || !step.uses.startsWith('actions/cache@')) return false;
    const key = String(step.with?.key ?? '');
    return key.includes("hashFiles('package-lock.json')");
  });
}

/** Ima li composite akcija `npm ci` korak uvjetovan promasajem kesa. */
export function hasConditionalNpmCiStep(actionText: string): boolean {
  const doc = parseYaml(actionText) as {
    runs?: { steps?: Array<{ run?: string; if?: string }> };
  };
  const steps = doc.runs?.steps ?? [];
  return steps.some(
    (step) =>
      typeof step.run === 'string' &&
      BARE_NPM_CI.test(step.run) &&
      typeof step.if === 'string' &&
      step.if.includes('cache-hit') &&
      step.if.includes("!= 'true'"),
  );
}
