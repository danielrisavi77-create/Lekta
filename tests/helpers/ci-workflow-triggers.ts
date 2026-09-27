// Cisti provjeritelji za CI trigere (bez datotecnog I/O), da ih gate-mutations.test.ts
// moze pozvati nad rucno sastavljenim (mutiranim) workflow objektom.

export interface WorkflowTrigger {
  branches?: string[];
  tags?: string[];
  types?: string[];
}

export interface WorkflowJob {
  if?: string;
}

export interface WorkflowFile {
  name?: string;
  on?: Record<string, WorkflowTrigger | null> | string[] | string;
  concurrency?: {
    group?: string;
    'cancel-in-progress'?: unknown;
  };
  jobs?: Record<string, WorkflowJob | null>;
}

export interface NamedWorkflow {
  file: string;
  doc: WorkflowFile;
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

const PR_EVENTS = ['pull_request', 'pull_request_target'] as const;

/** Job-level `if` koji izricito iskljucuje akciju `edited` (npr. `github.event.action != 'edited'`). */
function jobExcludesEdited(job: WorkflowJob | null | undefined): boolean {
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
