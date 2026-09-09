#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { AGENTS, prepareJob, parseResult, validateQueue } from './core.mjs';

const root = process.cwd();
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10_000 });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed`);
  return result.stdout.trim();
};

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === 'help') {
    console.log('agents doctor | list | prepare|run T00 --phase plan|implement|review --agent astra|fable|opus|sonnet|sol [--budget-usd N] [--execute]');
    return;
  }
  if (command === 'doctor') {
    if (rest.length) throw new Error('doctor takes no arguments');
    for (const cli of ['git', 'node', 'deno', 'codex', 'claude']) {
      const result = spawnSync(cli, ['--version'], { encoding: 'utf8', timeout: 10_000 });
      console.log(`${cli}: ${result.status === 0 ? result.stdout.trim().split('\n')[0] : 'unavailable'}`);
    }
    console.log('Model access and login must be checked locally: codex login status; claude auth status. No model was called.');
    return;
  }
  const queue = JSON.parse(readFileSync(join(root, 'docs/agents/tasks.json'), 'utf8'));
  validateQueue(queue);
  if (command === 'list') {
    if (rest.length) throw new Error('list takes no arguments');
    for (const task of queue.tasks) console.log(`${task.id}\t${task.status}\t${task.title}`);
    return;
  }
  if (!['prepare', 'run'].includes(command)) throw new Error('Unknown command');
  const id = rest.shift();
  const options = new Map();
  while (rest.length) {
    const key = rest.shift();
    if (!['--agent', '--phase', '--budget-usd', '--execute'].includes(key) || options.has(key)) throw new Error(`Invalid option: ${key}`);
    const value = key === '--execute' ? true : rest.shift();
    if (!value || (typeof value === 'string' && value.startsWith('--'))) throw new Error(`Missing value: ${key}`);
    options.set(key, value);
  }
  if (command === 'prepare' && options.has('--execute')) throw new Error('Use run --execute to launch an agent');
  const phase = options.get('--phase');
  const agent = options.get('--agent');
  const budget = options.has('--budget-usd') ? Number(options.get('--budget-usd')) : undefined;
  const job = prepareJob(queue, id, phase, agent, budget);
  if (!options.has('--execute')) {
    console.log(JSON.stringify({ dryRun: true, ...job }, null, 2));
    return;
  }
  if (resolve(git('rev-parse', '--show-toplevel')) !== resolve(root)) throw new Error('Run from the repository root');
  const gitDir = resolve(root, git('rev-parse', '--git-dir'));
  const commonDir = resolve(root, git('rev-parse', '--git-common-dir'));
  if (phase === 'implement') {
    if (gitDir === commonDir) throw new Error('Implementation requires a separate git worktree');
    const branch = git('branch', '--show-current');
    if (!branch || ['master', 'main'].includes(branch)) throw new Error('Implementation requires a feature branch');
    if (git('status', '--porcelain')) throw new Error('Implementation requires a clean worktree');
  }
  // One local call at a time, including across worktrees sharing this Git directory.
  // A crashed parent leaves the lock for manual inspection; never steal it automatically.
  const lock = join(commonDir, 'lekta-agent.lock');
  let lockFd;
  let releaseLock = true;
  try {
    lockFd = openSync(lock, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Another run or stale lock exists: ${lock}`);
    throw error;
  }
  try {
    writeFileSync(lockFd, JSON.stringify({ pid: process.pid, task: id, agent, phase, root }));
    const baseHead = git('rev-parse', 'HEAD');
    const out = join(root, '.artifacts/agents', `${id}-${Date.now()}-${process.pid}`);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'prompt.md'), job.prompt);
    // argv array + stdin, never a shell string. Existing CLI authentication is reused.
    releaseLock = false;
    const result = spawnSync(job.command, job.args, {
      cwd: root, input: job.prompt, encoding: 'utf8', shell: false,
      timeout: 30 * 60 * 1000, killSignal: 'SIGKILL', maxBuffer: 32 * 1024 * 1024,
    });
    releaseLock = !result.error && !result.signal;
    writeFileSync(join(out, 'stdout.log'), result.stdout ?? '');
    writeFileSync(join(out, 'stderr.log'), result.stderr ?? '');
    const parsed = parseResult(job.command, result.stdout ?? '', result.status);
    const report = { task: id, phase, agent, baseHead, requestedModel: AGENTS[agent].model,
      reportedModels: parsed.reportedModels, exitCode: result.status, signal: result.signal,
      error: result.error?.message ?? null,
      retainedLock: releaseLock ? null : lock,
      status: parsed.ok && !result.error ? 'needs_verification' : 'failed',
      note: 'Queue unchanged. Coordinator must verify actual model, patch, required checks and independent review.' };
    writeFileSync(join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ ...report, artifacts: out }, null, 2));
    if (report.status === 'failed') process.exitCode = 1;
  } finally {
    closeSync(lockFd);
    if (releaseLock) unlinkSync(lock);
  }
}

try { main(); } catch (error) {
  console.error(`[agents] ${error.message}`);
  process.exitCode = 1;
}
