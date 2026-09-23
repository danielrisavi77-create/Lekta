import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Provider-neutral task handoff. No process execution or queue writes here. */
export const PROMPT_FILE_PLACEHOLDER = '__LEKTA_PROMPT_FILE__';

function providerRegistryPath() {
  // Runner i testovi imaju repo/worktree root kao CWD. Namjerno ne izvodimo ovu stazu iz
  // import.meta.url: mutation harness ucitava core.mjs kao data: URL, gdje URL hijerarhija ne postoji.
  return resolve(process.cwd(), 'config/agent-providers.json');
}

const PROVIDER_REGISTRY = JSON.parse(
  readFileSync(providerRegistryPath(), 'utf8'),
);
if (PROVIDER_REGISTRY?.schemaVersion !== 1 || !PROVIDER_REGISTRY?.agents) {
  throw new Error('Unsupported config/agent-providers.json contract');
}
export const GROK_MIN_VERSION = String(PROVIDER_REGISTRY.grokMinVersion);

export function parseGrokVersion(output) {
  const match = String(output ?? '').match(/\b(\d+)\.(\d+)\.(\d+)\b/);
  if (!match) return { version: null, supported: false };
  const version = match.slice(1, 4).map(Number);
  const minimum = GROK_MIN_VERSION.split('.').map(Number);
  const supported = version[0] > minimum[0]
    || (version[0] === minimum[0] && version[1] > minimum[1])
    || (version[0] === minimum[0] && version[1] === minimum[1] && version[2] >= minimum[2]);
  return { version: match[0], supported };
}

export const AGENTS = Object.freeze(
  Object.fromEntries(Object.entries(PROVIDER_REGISTRY.agents).map(([name, spec]) => [name, Object.freeze({ ...spec })])),
);

export function validateQueue(queue) {
  if (!Array.isArray(queue?.tasks) || !queue.tasks.length) throw new Error('Empty task queue');
  const tasks = new Map();
  const states = ['blocked', 'ready', 'in_progress', 'in_review', 'done'];
  for (const task of queue.tasks) {
    if (!/^T\d{2}$/.test(task.id) || tasks.has(task.id)) throw new Error('Invalid or duplicate task id');
    if (!task.title || !states.includes(task.status) || !Array.isArray(task.dependsOn)) {
      throw new Error(`Invalid task: ${task.id}`);
    }
    tasks.set(task.id, task);
  }
  const visited = new Set();
  function visit(id, ancestors = new Set()) {
    if (!tasks.has(id)) throw new Error(`Missing dependency: ${id}`);
    if (ancestors.has(id)) throw new Error(`Dependency cycle: ${id}`);
    if (visited.has(id)) return;
    const next = new Set([...ancestors, id]);
    for (const dependency of tasks.get(id).dependsOn) visit(dependency, next);
    visited.add(id);
  }
  for (const id of tasks.keys()) visit(id);
  return tasks;
}

/**
 * Dva nacina naplate, razdvojena namjerno (plan autonomije, Zadatak 1):
 *  - `budget`: postojeci rucni nacin; Claude poziv trazi eksplicitan `--max-budget-usd` jer moze trositi
 *    dodatne usage kredite.
 *  - `subscription`: autonomni profil; NEMA budzeta jer se ne smije ni doci do naplate: Fable je iskljucen
 *    (nije u paketu), API kljuc u okolini je odbijen u CLI-ju, a poziv ide iskljucivo kroz prijavljenu
 *    pretplatu. Lazni pozitivan budzet se ovdje ne unosi da bi "prosla" stara validacija.
 * Grok (xAI) nema USD budget flag u runneru; headless cesto koristi `XAI_API_KEY` ili `grok login`.
 */
export const BILLING_MODES = Object.freeze(['budget', 'subscription', 'included_account']);
export const INCLUDED_ACCOUNT_AGENTS = Object.freeze(Object.entries(AGENTS).filter(([, spec]) => spec.command === 'grok').map(([name]) => name));
export const SUBSCRIPTION_EXCLUDED_AGENTS = Object.freeze(['fable', ...INCLUDED_ACCOUNT_AGENTS]);

/**
 * `options.overrideTask` postoji SAMO za `phase === 'review'` i samo za autonomni kontroler: on zna tko je
 * upravo implementirao zadatak, a `docs/agents/tasks.json` pise koordinator i kontroler ga ne smije mijenjati.
 * Override se primjenjuje na dvije provjere pregleda (status, implementationAgent) i NIGDJE drugdje: prompt
 * nosi pravi zadatak iz reda, `implement` grana i dalje cita sirovi status (inace bi override bio rupa kroz
 * koju se zaobilazi provjera spremnosti), a pravilo "pregled trazi drugog providera" i dalje grize.
 */
export function prepareJob(queue, id, phase, agentName, budget, options = {}) {
  const billingMode = options.billingMode ?? 'budget';
  if (!BILLING_MODES.includes(billingMode)) throw new Error(`Unknown billing mode: ${billingMode}`);
  const tasks = validateQueue(queue);
  const task = tasks.get(id);
  const agent = Object.hasOwn(AGENTS, agentName) ? AGENTS[agentName] : null;
  if (!task) throw new Error(`Unknown task: ${id}`);
  if (!agent) throw new Error(`Unknown agent: ${agentName}`);
  if (!['plan', 'implement', 'review'].includes(phase)) throw new Error('Invalid phase');
  if (phase === 'implement' && agent.role !== 'implementer') throw new Error('Invalid agent role for implementation');
  if (phase === 'plan' && agent.role !== 'coordinator') throw new Error('Invalid agent role for planning');
  // Review is read-only and may use either alias role; provider separation below is the security boundary.
  if (phase === 'implement') {
    if (task.status !== 'ready') throw new Error(`${id} must be ready`);
    for (const dependency of task.dependsOn) {
      if (tasks.get(dependency).status !== 'done') throw new Error(`Unfinished dependency: ${dependency}`);
    }
  }
  if (phase === 'review') {
    const effectiveTask = options.overrideTask ? { ...task, ...options.overrideTask } : task;
    if (effectiveTask.status !== 'in_review') throw new Error(`${id} must be in_review`);
    const implementation = AGENTS[effectiveTask.implementationAgent];
    if (!implementation || implementation.role !== 'implementer') throw new Error('Missing implementationAgent');
    if (implementation.command === agent.command) throw new Error('Review requires a different provider');
  }
  let args;
  if (agent.command === 'codex') {
    args = ['exec', '--model', agent.model, '--sandbox', phase === 'implement' ? 'workspace-write' : 'read-only', '--json', '-'];
  } else if (agent.command === 'claude') {
    args = ['-p', '--model', agent.model, '--output-format', 'json', '--max-turns', '20', '--permission-mode', 'dontAsk'];
  } else if (agent.command === 'grok') {
    // Grok 1.0.34 supports --prompt-file. cli.mjs substitutes the artifact path so the
    // complete task never appears in the process argv or shell history.
    args = [
      '--no-auto-update',
      '--prompt-file', PROMPT_FILE_PLACEHOLDER,
      '-m', agent.model,
      '--output-format', 'json',
      '--max-turns', '20',
      '--sandbox', phase === 'implement' ? 'workspace' : 'read-only',
    ];
    if (phase === 'implement') args.push('--always-approve');
  } else {
    throw new Error(`Unsupported agent command: ${agent.command}`);
  }
  if (billingMode === 'subscription' && SUBSCRIPTION_EXCLUDED_AGENTS.includes(agentName)) {
    throw new Error(`${agentName} is not included in the subscription profile`);
  }
  if (billingMode === 'included_account' && !INCLUDED_ACCOUNT_AGENTS.includes(agentName)) {
    throw new Error(`${agentName} is not supported by the included-account profile`);
  }
  if (agent.command === 'claude' && billingMode === 'subscription') {
    if (budget !== undefined) throw new Error('subscription mode does not take --budget-usd');
    const allowed = phase === 'implement'
      ? 'Read,Edit,Write,Glob,Grep,Bash(git diff *),Bash(git status *),Bash(npm run check),Bash(npm run orphan-scan),Bash(npm run build),Bash(npx vitest run *)'
      : 'Read,Glob,Grep';
    args.push('--tools', phase === 'implement' ? 'Read,Edit,Write,Glob,Grep,Bash' : 'Read,Glob,Grep', '--allowedTools', allowed);
  } else if (agent.command === 'claude') {
    if (!Number.isFinite(budget) || budget <= 0) throw new Error('Claude requires a positive --budget-usd');
    const allowed = phase === 'implement'
      ? 'Read,Edit,Write,Glob,Grep,Bash(git diff *),Bash(git status *),Bash(npm run check),Bash(npm run orphan-scan),Bash(npm run build),Bash(npx vitest run *)'
      : 'Read,Glob,Grep';
    args.push('--max-budget-usd', String(budget), '--tools', phase === 'implement' ? 'Read,Edit,Write,Glob,Grep,Bash' : 'Read,Glob,Grep', '--allowedTools', allowed);
  }
  const prompt = [
    `LEKTA task ${id}. Phase: ${phase}. Requested agent: ${agentName} (${agent.model}).`,
    'Follow the host-loaded root instructions. Read docs/agents/ORCHESTRATION.md before working; do not re-read root AGENTS.md/CLAUDE.md solely because of this prompt.',
    'Read the matching task section in docs/agents/development-plan.md, the relevant headings of docs/agents/PROJECT_RULES.md, and only scoped CLAUDE.md files for paths you actually inspect. Do not read the entire detailed rules file by default. Recheck findings against the current code.',
    phase === 'implement'
      ? 'Implement only this task in this worktree. Run the required checks. Do not edit the queue, commit, push, merge or deploy; return the patch and evidence to the coordinator.'
      : 'Read-only assessment. Do not modify files. Return a concrete brief or independent review with file references and evidence.',
    'Repository hard gates remain mandatory. Do not claim tests, model identity, production state or Word verification without evidence.',
    'Return: base HEAD, scope, findings/changes, tests actually run, unresolved risks, recommended next step. Success is not task completion.',
    JSON.stringify(task, null, 2),
  ].join('\n\n');
  return { command: agent.command, args, prompt, requestedModel: agent.model, billingMode };
}

function numberOrNull(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function emptyUsage() {
  return {
    inputTokens: null,
    cachedInputTokens: null,
    cacheWriteInputTokens: null,
    outputTokens: null,
    reasoningOutputTokens: null,
    totalTokens: null,
    costUsd: null,
    modelCalls: null,
  };
}

function usageFields(part) {
  return {
    inputTokens: part?.inputTokens ?? part?.input_tokens,
    cachedInputTokens: part?.cachedInputTokens ?? part?.cached_input_tokens ?? part?.cacheReadInputTokens,
    cacheWriteInputTokens: part?.cacheWriteInputTokens ?? part?.cache_write_input_tokens ?? part?.cacheCreationInputTokens,
    outputTokens: part?.outputTokens ?? part?.output_tokens,
    reasoningOutputTokens: part?.reasoningOutputTokens ?? part?.reasoning_output_tokens,
    totalTokens: part?.totalTokens ?? part?.total_tokens,
    costUsd: part?.costUsd ?? part?.costUSD ?? part?.total_cost_usd,
    modelCalls: part?.modelCalls ?? part?.model_calls,
  };
}

function mergeUsage(...parts) {
  const out = emptyUsage();
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    for (const [key, value] of Object.entries(usageFields(part))) {
      const n = numberOrNull(value);
      if (n != null && out[key] == null) out[key] = n;
    }
  }
  if (out.totalTokens == null && out.inputTokens != null && out.outputTokens != null) {
    out.totalTokens = out.inputTokens + out.outputTokens;
  }
  return out;
}

function sumUsage(...parts) {
  const out = emptyUsage();
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    for (const [key, value] of Object.entries(usageFields(part))) {
      if (key === 'totalTokens') continue;
      const n = numberOrNull(value);
      if (n == null) continue;
      out[key] = (out[key] ?? 0) + n;
    }
  }
  if (out.inputTokens != null && out.outputTokens != null) out.totalTokens = out.inputTokens + out.outputTokens;
  return out;
}

function modelUsageSummary(modelUsage) {
  if (!modelUsage || typeof modelUsage !== 'object' || Array.isArray(modelUsage)) return emptyUsage();
  return sumUsage(...Object.values(modelUsage).filter(value => value && typeof value === 'object'));
}

export function modelMatches(requested, reportedModels) {
  if (!Array.isArray(reportedModels) || reportedModels.length === 0) return true;
  const req = String(requested ?? '').toLowerCase();
  return reportedModels.some(model => {
    const actual = String(model ?? '').toLowerCase();
    return Boolean(req) && (req.includes(actual) || actual.includes(req));
  });
}

export function parseResult(command, stdout, exitCode) {
  const failed = () => ({ ok: false, reportedModels: [], usage: mergeUsage() });
  if (exitCode !== 0) return failed();
  try {
    if (command === 'claude') {
      const result = JSON.parse(stdout);
      return {
        ok: result.subtype === 'success' && result.is_error === false,
        reportedModels: Object.keys(result.modelUsage ?? {}),
        usage: mergeUsage(result.usage, modelUsageSummary(result.modelUsage), { costUsd: result.total_cost_usd ?? result.totalCostUSD }),
      };
    }
    if (command === 'grok') {
      const text = stdout.trim();
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        const lines = text.split('\n').filter(Boolean);
        result = JSON.parse(lines[lines.length - 1]);
      }
      if (result == null || typeof result !== 'object' || Array.isArray(result)) return failed();
      const currentSuccess = typeof result.text === 'string' && result.text.trim().length > 0
        && result.stopReason === 'end_turn'
        && Number.isInteger(result.num_turns) && result.num_turns > 0
        && result.modelUsage != null && typeof result.modelUsage === 'object'
        && Object.keys(result.modelUsage).length > 0;
      if (!currentSuccess || result.is_error === true || result.ok === false
          || result.error != null || String(result.subtype ?? '').startsWith('error')) return failed();
      const reportedModels = [];
      if (typeof result.model === 'string') reportedModels.push(result.model);
      if (result.modelUsage && typeof result.modelUsage === 'object') reportedModels.push(...Object.keys(result.modelUsage));
      return {
        ok: true,
        reportedModels: [...new Set(reportedModels)],
        usage: mergeUsage(result.usage, modelUsageSummary(result.modelUsage), { costUsd: result.total_cost_usd }),
      };
    }
    const events = stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    const completed = events.findLast?.(e => e.type === 'turn.completed') ?? [...events].reverse().find(e => e.type === 'turn.completed');
    return {
      ok: Boolean(completed) && !events.some(e => ['turn.failed', 'error'].includes(e.type)),
      reportedModels: [...new Set(events.map(e => e.model).filter(model => typeof model === 'string'))],
      usage: mergeUsage(completed?.usage),
    };
  } catch {
    return failed();
  }
}
