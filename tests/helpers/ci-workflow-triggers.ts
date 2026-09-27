// Cisti provjeritelji za CI trigere (bez datotecnog I/O), da ih gate-mutations.test.ts
// moze pozvati nad rucno sastavljenim (mutiranim) workflow objektom.

export interface WorkflowTrigger {
  branches?: string[];
  tags?: string[];
}

export interface WorkflowJobShape {
  'runs-on'?: unknown;
  if?: unknown;
  permissions?: unknown;
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

/** Trigeri koji mogu pokrenuti kod koji nije napisao suradnik s pravom pisanja (fork PR i slicno). */
const UNTRUSTED_TRIGGERS = ['pull_request', 'pull_request_target', 'issue_comment', 'workflow_run'];

function runsOnLabels(runsOn: unknown): string[] {
  if (typeof runsOn === 'string') return [runsOn];
  if (Array.isArray(runsOn)) return runsOn.map(String);
  if (runsOn && typeof runsOn === 'object') {
    const labels = (runsOn as { labels?: unknown }).labels;
    const group = (runsOn as { group?: unknown }).group;
    // `group:` bez labela je runner grupa, a grupe drze self-hosted runnere.
    return [...runsOnLabels(labels), ...(group ? ['self-hosted'] : [])];
  }
  return [];
}

function isContentsReadOnly(permissions: unknown): boolean {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return false;
  const entries = Object.entries(permissions as Record<string, unknown>);
  return entries.length === 1 && entries[0][0] === 'contents' && entries[0][1] === 'read';
}

/**
 * Self-hosted runner na JAVNOM repozitoriju (T80, Word dokaz na vlasnikovom stroju). Vraca
 * probleme oblika `datoteka: razlog` za svaki workflow ciji job trazi `self-hosted`:
 *  - datoteka nije na popisu dopustenih (`allowed`);
 *  - workflow ima trigger kojim tudji kod moze doci na stroj (pull_request i slicni);
 *  - job nema `if` koji odbija fork i drugi repozitorij;
 *  - token nije samo `contents: read`;
 *  - tekst datoteke spominje `secrets.`.
 */
export function findSelfHostedProblems(
  workflows: NamedWorkflow[],
  allowed: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  for (const { file, doc, raw } of workflows) {
    const selfHostedJobs = Object.entries(doc.jobs ?? {}).filter(([, job]) =>
      runsOnLabels(job['runs-on']).some((label) => label.trim().toLowerCase() === 'self-hosted'),
    );
    if (selfHostedJobs.length === 0) continue;
    if (!allowed.has(file)) problems.push(`${file}: self-hosted runner izvan popisa dopustenih workflowa`);
    for (const trigger of UNTRUSTED_TRIGGERS) {
      if (hasKey(doc.on, trigger)) problems.push(`${file}: trigger ${trigger} uz self-hosted runner`);
    }
    for (const [jobName, job] of selfHostedJobs) {
      const condition = typeof job.if === 'string' ? job.if.replace(/\s+/g, ' ') : '';
      if (!condition.includes('github.event.repository.fork == false') || !condition.includes('github.repository ==')) {
        problems.push(`${file}: job ${jobName} nema if koji odbija fork i drugi repozitorij`);
      }
      const permissions = job.permissions ?? doc.permissions;
      if (!isContentsReadOnly(permissions)) {
        problems.push(`${file}: job ${jobName} nema permissions samo contents: read`);
      }
    }
    if (raw === undefined) problems.push(`${file}: nema sirovog teksta za provjeru tajni`);
    else if (/secrets\./.test(raw)) problems.push(`${file}: spominje secrets. uz self-hosted runner`);
  }
  return problems;
}

/** Grane iz `push.branches` koje nisu na dopustenom popisu (tocna usporedba uzorka). */
export function pushBranchesOutside(doc: WorkflowFile, allowed: readonly string[]): string[] {
  const push = triggerValue(doc.on, 'push');
  const branches = push?.branches ?? [];
  if (hasKey(doc.on, 'push') && branches.length === 0) return ['(push bez branches filtra)'];
  return branches.filter((b) => !allowed.includes(b));
}
