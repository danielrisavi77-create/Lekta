/** Provider-neutral task handoff. No process execution or queue writes here. */
export const PROMPT_FILE_PLACEHOLDER = '__LEKTA_PROMPT_FILE__';

export const AGENTS = Object.freeze({
  astra: { command: 'codex', model: 'gpt-6-astra', role: 'coordinator' },
  fable: { command: 'claude', model: 'fable', role: 'coordinator' },
  opus: { command: 'claude', model: 'opus', role: 'implementer' },
  sonnet: { command: 'claude', model: 'sonnet', role: 'implementer' },
  sol: { command: 'codex', model: 'gpt-5.6-sol', role: 'implementer' },
  // Grok Build CLI (https://docs.x.ai/build/overview). Default model grok-4.6 = current coding recommendation (docs.x.ai/docs/models, 2026-09-20).
  grok: { command: 'grok', model: 'grok-4.6', role: 'coordinator' },
  build: { command: 'grok', model: 'grok-4.6', role: 'implementer' },
});

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
export const BILLING_MODES = Object.freeze(['budget', 'subscription']);
export const SUBSCRIPTION_EXCLUDED_AGENTS = Object.freeze(['fable', 'grok', 'build']);

export function prepareJob(queue, id, phase, agentName, budget, options = {}) {
  const billingMode = options.billingMode ?? 'budget';
  if (!BILLING_MODES.includes(billingMode)) throw new Error(`Unknown billing mode: ${billingMode}`);
  const tasks = validateQueue(queue);
  const task = tasks.get(id);
  const agent = Object.hasOwn(AGENTS, agentName) ? AGENTS[agentName] : null;
  if (!task) throw new Error(`Unknown task: ${id}`);
  if (!agent) throw new Error(`Unknown agent: ${agentName}`);
  if (!['plan', 'implement', 'review'].includes(phase)) throw new Error('Invalid phase');
  if ((phase === 'implement') !== (agent.role === 'implementer')) throw new Error('Invalid agent role for phase');
  if (phase === 'implement') {
    if (task.status !== 'ready') throw new Error(`${id} must be ready`);
    for (const dependency of task.dependsOn) {
      if (tasks.get(dependency).status !== 'done') throw new Error(`Unfinished dependency: ${dependency}`);
    }
  }
  if (phase === 'review') {
    if (task.status !== 'in_review') throw new Error(`${id} must be in_review`);
    const implementation = AGENTS[task.implementationAgent];
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
    'Read AGENTS.md, CLAUDE.md and docs/agents/README.md before working.',
    'Read the matching task section in docs/agents/development-plan.md. Recheck findings against the current code.',
    phase === 'implement'
      ? 'Implement only this task in this worktree. Run the required checks. Do not edit the queue, commit, push, merge or deploy; return the patch and evidence to the coordinator.'
      : 'Read-only assessment. Do not modify files. Return a concrete brief or independent review with file references and evidence.',
    'Repository hard gates remain mandatory. Do not claim tests, model identity, production state or Word verification without evidence.',
    'Return: base HEAD, scope, findings/changes, tests actually run, unresolved risks, recommended next step. Success is not task completion.',
    JSON.stringify(task, null, 2),
  ].join('\n\n');
  return { command: agent.command, args, prompt, requestedModel: agent.model, billingMode };
}

export function parseResult(command, stdout, exitCode) {
  if (exitCode !== 0) return { ok: false, reportedModels: [] };
  try {
    if (command === 'claude') {
      const result = JSON.parse(stdout);
      return { ok: result.subtype === 'success' && result.is_error === false,
        reportedModels: Object.keys(result.modelUsage ?? {}) };
    }
    if (command === 'grok') {
      // Official docs: `--output-format json` emits one JSON object at the end.
      // Exact success schema is not fully documented; refuse explicit errors and require parseable JSON.
      const text = stdout.trim();
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        const lines = text.split('\n').filter(Boolean);
        result = JSON.parse(lines[lines.length - 1]);
      }
      if (result == null || typeof result !== 'object' || Array.isArray(result)) {
        return { ok: false, reportedModels: [] };
      }
      const currentSuccess = typeof result.text === 'string' && result.text.trim().length > 0
        && result.stopReason === 'end_turn'
        && Number.isInteger(result.num_turns) && result.num_turns > 0
        && result.modelUsage != null && typeof result.modelUsage === 'object'
        && Object.keys(result.modelUsage).length > 0;
      const legacySuccess = result.type === 'result' && result.is_error === false;
      if ((!currentSuccess && !legacySuccess) || result.is_error === true || result.ok === false
          || result.error != null || String(result.subtype ?? '').startsWith('error')) {
        return { ok: false, reportedModels: [] };
      }
      const reportedModels = [];
      if (typeof result.model === 'string') reportedModels.push(result.model);
      if (result.modelUsage && typeof result.modelUsage === 'object') {
        reportedModels.push(...Object.keys(result.modelUsage));
      }
      return { ok: true, reportedModels: [...new Set(reportedModels)] };
    }
    const events = stdout.trim().split('\n').map(line => JSON.parse(line));
    return { ok: events.some(e => e.type === 'turn.completed') && !events.some(e => ['turn.failed', 'error'].includes(e.type)),
      reportedModels: [...new Set(events.map(e => e.model).filter(model => typeof model === 'string'))] };
  } catch {
    return { ok: false, reportedModels: [] };
  }
}
