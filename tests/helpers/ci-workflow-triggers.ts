// Cisti provjeritelji za CI trigere (bez datotecnog I/O), da ih gate-mutations.test.ts
// moze pozvati nad rucno sastavljenim (mutiranim) workflow objektom.

export interface WorkflowTrigger {
  branches?: string[];
  tags?: string[];
  types?: string[];
}

export interface WorkflowStepShape {
  name?: string;
  uses?: string;
  run?: string;
}

export interface WorkflowJobShape {
  'runs-on'?: unknown;
  if?: unknown;
  permissions?: unknown;
  uses?: string;
  steps?: WorkflowStepShape[];
}

export interface WorkflowFile {
  name?: string;
  on?: Record<string, WorkflowTrigger | null> | string[] | string;
  concurrency?: {
    group?: string;
    'cancel-in-progress'?: unknown;
  };
  permissions?: unknown;
  jobs?: Record<string, WorkflowJobShape>;
}

export interface NamedWorkflow {
  file: string;
  doc: WorkflowFile;
  /** Sirovi tekst datoteke; treba ga samo `findSelfHostedProblems` (trazenje `secrets.`). */
  raw?: string;
}

function hasKey(on: WorkflowFile['on'], key: string): boolean {
  if (!on) return false;
  if (Array.isArray(on)) return on.includes(key);
  if (typeof on === 'string') return on === key;
  return Object.prototype.hasOwnProperty.call(on, key);
}

function triggerValue(on: WorkflowFile['on'], key: string): WorkflowTrigger | null | undefined {
  if (!on || Array.isArray(on) || typeof on === 'string') return undefined;
  return on[key];
}

/**
 * Vraca datoteke ciji 'push' trigger nema branches: [master] (ili drugi ne-wildcard filtar),
 * a nisu na popisu imenovanih iznimaka. Takav 'push' u paru s 'pull_request' vrti isti
 * workflow DVAPUT po svakom PR pushu.
 */
export function findBarePushWorkflows(
  workflows: NamedWorkflow[],
  exceptions: ReadonlySet<string> = new Set(),
): string[] {
  const problems: string[] = [];
  for (const { file, doc } of workflows) {
    if (!hasKey(doc.on, 'push')) continue;
    if (exceptions.has(file)) continue;
    const push = triggerValue(doc.on, 'push');
    const branches = push?.branches ?? [];
    const isMasterOnly = branches.length > 0 && branches.every((b) => !b.includes('*'));
    if (!isMasterOnly) {
      problems.push(file);
    }
  }
  return problems;
}

/**
 * Vraca datoteke koje imaju 'pull_request' trigger ali nemaju concurrency grupu koja ovisi
 * o grani (cancel-in-progress razlicit za master i za PR granu).
 */
export function findPullRequestWithoutConcurrency(
  workflows: NamedWorkflow[],
  exceptions: ReadonlySet<string> = new Set(),
): string[] {
  const problems: string[] = [];
  for (const { file, doc } of workflows) {
    if (!hasKey(doc.on, 'pull_request')) continue;
    if (exceptions.has(file)) continue;
    const concurrency = doc.concurrency;
    const group = String(concurrency?.group ?? '');
    const cancel = String(concurrency?.['cancel-in-progress'] ?? '');
    const ok = group.includes('github.ref') && cancel.includes('github.ref') && cancel !== 'true';
    if (!ok) {
      problems.push(file);
    }
  }
  return problems;
}

/** Jedini workflow koji smije ciljati vlasnikov Word stroj (T80). */
export const WORD_PROOF_FILE = 'word-proof.yml';

/** Tocan, jedini dopusteni oblik word-proof.yml; sve ostalo je nalaz (Codex F5 na #162). */
export const WORD_PROOF_SHAPE = Object.freeze({
  triggers: ['push', 'workflow_dispatch'],
  pushBranches: ['master', 'release/**'],
  runsOn: ['self-hosted', 'windows', 'word'],
  jobIf: "github.event.repository.fork == false && github.repository == 'danielrisavi77-create/Lekta'",
});

/**
 * GitHub-hosted oznaka: `ubuntu-latest`, `windows-2022`, `macos-15`... Gola `windows`, `word`,
 * `self-hosted`, izraz `${{ ... }}`, popis oznaka i runner grupa NISU dopusteni izvan
 * word-proof.yml, jer svaki od njih moze pogoditi vlasnikov stroj (Codex F1 na #162).
 */
const GITHUB_HOSTED_LABEL = /^(ubuntu|windows|macos)-[A-Za-z0-9.]+$/;

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function triggerKeys(on: WorkflowFile['on']): string[] {
  if (!on) return [];
  if (typeof on === 'string') return [on];
  if (Array.isArray(on)) return [...on];
  return Object.keys(on);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
}

function checkWordProof(file: string, doc: WorkflowFile, raw: string | undefined): string[] {
  const problems: string[] = [];
  const triggers = triggerKeys(doc.on);
  if (!sameSet(triggers, WORD_PROOF_SHAPE.triggers)) {
    problems.push(`${file}: trigeri moraju biti tocno ${WORD_PROOF_SHAPE.triggers.join(', ')} (ima: ${triggers.join(', ')})`);
  }
  const push = triggerValue(doc.on, 'push') as Record<string, unknown> | null | undefined;
  const pushKeys = push ? Object.keys(push) : [];
  if (!sameSet(pushKeys, ['branches'])) {
    problems.push(`${file}: push smije imati samo branches (ima: ${pushKeys.join(', ') || 'nista'})`);
  }
  const branches = Array.isArray(push?.branches) ? (push!.branches as unknown[]).map(String) : [];
  if (!sameSet(branches, WORD_PROOF_SHAPE.pushBranches)) {
    problems.push(`${file}: push.branches mora biti tocno ${WORD_PROOF_SHAPE.pushBranches.join(', ')}`);
  }
  for (const [jobName, job] of Object.entries(doc.jobs ?? {})) {
    const runsOn = job['runs-on'];
    if (!Array.isArray(runsOn) || !sameSet(runsOn.map(String), WORD_PROOF_SHAPE.runsOn) || runsOn.length !== 3) {
      problems.push(`${file}: job ${jobName} runs-on mora biti tocno [${WORD_PROOF_SHAPE.runsOn.join(', ')}]`);
    }
    if (typeof job.if !== 'string' || normalize(job.if) !== WORD_PROOF_SHAPE.jobIf) {
      problems.push(`${file}: job ${jobName} if mora biti tocno: ${WORD_PROOF_SHAPE.jobIf}`);
    }
    if (!isContentsReadOnly(job.permissions ?? doc.permissions)) {
      problems.push(`${file}: job ${jobName} nema permissions samo contents: read`);
    }
    if (job.uses) problems.push(`${file}: job ${jobName} poziva drugi workflow (uses)`);
    const steps = job.steps ?? [];
    const origin = steps.findIndex((step) => (step.name ?? '').startsWith('Porijeklo commita'));
    if (origin < 0) {
      problems.push(`${file}: job ${jobName} nema korak Porijeklo commita`);
    } else {
      const before = steps.slice(0, origin);
      if (!before.every((step) => (step.uses ?? '').startsWith('actions/checkout@') && !step.run)) {
        problems.push(`${file}: job ${jobName} izvrsava nesto prije koraka Porijeklo commita`);
      }
      const run = steps[origin].run ?? '';
      if (!run.includes('for-each-ref') || run.includes('--contains')) {
        problems.push(`${file}: job ${jobName} Porijeklo commita mora usporedjivati tocne vrhove grana, ne --contains`);
      }
    }
  }
  if (raw === undefined) problems.push(`${file}: nema sirovog teksta za provjeru tajni`);
  else if (/\bsecrets\b/.test(raw)) problems.push(`${file}: spominje secrets (secrets., secrets[ ili secrets: inherit)`);
  return problems;
}

function isContentsReadOnly(permissions: unknown): boolean {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return false;
  const entries = Object.entries(permissions as Record<string, unknown>);
  return entries.length === 1 && entries[0][0] === 'contents' && entries[0][1] === 'read';
}

/**
 * Pristup vlasnikovom Word stroju na JAVNOM repozitoriju (T80). Vraca probleme `datoteka: razlog`:
 *  - word-proof.yml mora imati tocno propisan oblik (trigeri, grane, runs-on, if, token, bez tajni,
 *    Porijeklo commita prije ijednog izvrsavanja koda iz stabla);
 *  - svaki drugi job u svakom drugom workflowu mora imati `runs-on` koji je JEDNA GitHub-hosted
 *    oznaka (`ubuntu-latest` i slicno), a `uses:` samo lokalni `./.github/workflows/...`.
 * Gard nije granica pristupa stroju: fork PR moze donijeti vlastiti workflow koji ovaj test nikad ne
 * vidi. Granica su postavke repozitorija (docs/verification/WORD_PROOF_RUNNER.md, odjeljak 6).
 */
export function findSelfHostedProblems(
  workflows: NamedWorkflow[],
  allowed: ReadonlySet<string> = new Set([WORD_PROOF_FILE]),
): string[] {
  const problems: string[] = [];
  for (const { file, doc, raw } of workflows) {
    if (allowed.has(file)) {
      problems.push(...checkWordProof(file, doc, raw));
      continue;
    }
    for (const [jobName, job] of Object.entries(doc.jobs ?? {})) {
      if (job.uses !== undefined) {
        if (!String(job.uses).startsWith('./.github/workflows/')) {
          problems.push(`${file}: job ${jobName} poziva vanjski workflow ${String(job.uses)}`);
        }
        continue;
      }
      const runsOn = job['runs-on'];
      if (typeof runsOn !== 'string' || !GITHUB_HOSTED_LABEL.test(runsOn)) {
        problems.push(`${file}: job ${jobName} runs-on nije jedna GitHub-hosted oznaka (${JSON.stringify(runsOn)})`);
      }
    }
  }
  return problems;
}

const PR_EVENTS = ['pull_request', 'pull_request_target'] as const;

/** Job-level `if` koji izricito iskljucuje akciju `edited` (npr. `github.event.action != 'edited'`). */
function jobExcludesEdited(job: WorkflowJobShape | null | undefined): boolean {
  const cond = String(job?.if ?? '');
  return /github\.event\.action\s*!=\s*['"]edited['"]/.test(cond);
}

/**
 * Vraca `datoteka#job` za svaki job koji se pokrece kad se UREDI opis PR-a (akcija `edited`).
 * Zadani pull_request tipovi (bez `types:`) ne ukljucuju `edited`. Job s `if` koji iskljucuje
 * `edited` se ne broji. Koristi ga gard da samo `pr-opis` reagira na uredjivanje opisa, a puni CI ne.
 */
export function findJobsRunningOnEdited(workflows: NamedWorkflow[]): string[] {
  const hits: string[] = [];
  for (const { file, doc } of workflows) {
    const reactsToEdited = PR_EVENTS.some((event) => {
      if (!hasKey(doc.on, event)) return false;
      const types = triggerValue(doc.on, event)?.types;
      return Array.isArray(types) && types.includes('edited');
    });
    if (!reactsToEdited) continue;
    for (const [name, job] of Object.entries(doc.jobs ?? {})) {
      if (!jobExcludesEdited(job)) hits.push(`${file}#${name}`);
    }
  }
  return hits.sort();
}
