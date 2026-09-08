/** Provider-neutral task handoff. No process execution or queue writes here. */
export const AGENTS = Object.freeze({
  astra: { command: 'codex', model: 'gpt-6-astra', role: 'coordinator' },
  fable: { command: 'claude', model: 'fable', role: 'coordinator' },
  opus: { command: 'claude', model: 'opus', role: 'implementer' },
  sonnet: { command: 'claude', model: 'sonnet', role: 'implementer' },
  sol: { command: 'codex', model: 'gpt-5.6-sol', role: 'implementer' },
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

export function prepareJob(queue, id, phase, agentName, budget) {
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
  const args = agent.command === 'codex'
    ? ['exec', '--model', agent.model, '--sandbox', phase === 'implement' ? 'workspace-write' : 'read-only', '--json', '-']
    : ['-p', '--model', agent.model, '--output-format', 'json', '--max-turns', '20', '--permission-mode', 'dontAsk'];
  if (agent.command === 'claude') {
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
  return { command: agent.command, args, prompt, requestedModel: agent.model };
}

export function parseResult(command, stdout, exitCode) {
  if (exitCode !== 0) return { ok: false, reportedModels: [] };
  try {
    if (command === 'claude') {
      const result = JSON.parse(stdout);
      return { ok: result.subtype === 'success' && result.is_error === false,
        reportedModels: Object.keys(result.modelUsage ?? {}) };
    }
    const events = stdout.trim().split('\n').map(line => JSON.parse(line));
    return { ok: events.some(e => e.type === 'turn.completed') && !events.some(e => ['turn.failed', 'error'].includes(e.type)),
      reportedModels: [...new Set(events.map(e => e.model).filter(model => typeof model === 'string'))] };
  } catch {
    return { ok: false, reportedModels: [] };
  }
}
