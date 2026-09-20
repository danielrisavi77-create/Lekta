#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, openSync, closeSync, unlinkSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTS, prepareJob, parseResult, resolvePromptFileArgs, validateQueue } from './core.mjs';

/**
 * Konacni argv za `spawnSync`, iz pripremljenog posla i putanje do vec upisanog `prompt.md`.
 *
 * Postoji kao IZVEZENA funkcija, a ne kao izraz u tijelu `main()`, jer je gard nad njom prije bio
 * tekstualni (`toContain` nad izvorom ove datoteke) i nije grizao: mutacija koja `resolvePromptFileArgs`
 * ostavi kao mrtav izraz, a spawna alias `const args = job.args`, prolazi svaku takvu tvrdnju i Groku
 * salje doslovnu oznaku `__PROMPT_FILE__`. Ovako test poziva isti kod koji `main()` izvodi.
 */
export function buildSpawnArgs(job, promptFile) {
  if (!job || !Array.isArray(job.args)) throw new Error('Job without args cannot be spawned');
  return resolvePromptFileArgs(job.args, promptFile);
}

/**
 * Jedini poziv provideru. Postoji kao IZVEZENA funkcija s ubrizgivim `spawn` upravo zato da tvrdnja
 * o argumentima mjeri ono sto proces stvarno dobije, a ne izraz prepisan u testu: gard nad
 * `buildSpawnArgs` sam po sebi ne dokazuje da ga `main()` uopce zove, pa je mutacija
 * `spawnSync(job.command, job.args, ...)` prolazila cijeli suite. Zadana vrijednost je stvarni
 * `spawnSync`, pa produkcijski put ide kroz isti kod koji test izvodi.
 */
export function spawnJob(job, promptFile, cwd, spawn = spawnSync) {
  // argv array + stdin, never a shell string. Existing CLI authentication is reused.
  return spawn(job.command, buildSpawnArgs(job, promptFile), {
    cwd, input: job.prompt, encoding: 'utf8', shell: false,
    timeout: 30 * 60 * 1000, killSignal: 'SIGKILL', maxBuffer: 32 * 1024 * 1024,
  });
}

/**
 * Je li ova datoteka ULAZNA tocka procesa.
 *
 * Usporedba `import.meta.url === pathToFileURL(process.argv[1]).href` je TOCNA samo kad staza nema
 * poveznice. ESM ulaznu tocku Node razrjesava na `realpath`, pa `node <junction>\cli.mjs help`
 * ispise NISTA i vrati 0, a bas taj mehanizam (junction na stablo) ovaj repozitorij propisuje za
 * worktreeve. Zato se usporeduju RAZRIJESENE staze, a ne URL oblici.
 */
export function isEntryModule(moduleUrl, argv1) {
  if (!argv1) return false;
  const real = (path) => { try { return realpathSync(path); } catch { return resolve(path); } };
  const self = real(fileURLToPath(moduleUrl));
  const entry = real(resolve(argv1));
  return process.platform === 'win32' ? self.toLowerCase() === entry.toLowerCase() : self === entry;
}

const root = process.cwd();
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10_000 });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed`);
  return result.stdout.trim();
};

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === 'help') {
    console.log('agents doctor | list | prepare|run T00 --phase plan|implement|review --agent astra|fable|opus|sonnet|sol|grok|grok-audit [--budget-usd N | --subscription] [--execute]');
    return;
  }
  if (command === 'doctor') {
    if (rest.length) throw new Error('doctor takes no arguments');
    for (const cli of ['git', 'node', 'deno', 'codex', 'claude', 'grok']) {
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
    if (!['--agent', '--phase', '--budget-usd', '--execute', '--subscription'].includes(key) || options.has(key)) throw new Error(`Invalid option: ${key}`);
    const value = (key === '--execute' || key === '--subscription') ? true : rest.shift();
    if (!value || (typeof value === 'string' && value.startsWith('--'))) throw new Error(`Missing value: ${key}`);
    options.set(key, value);
  }
  if (command === 'prepare' && options.has('--execute')) throw new Error('Use run --execute to launch an agent');
  const phase = options.get('--phase');
  const agent = options.get('--agent');
  const budget = options.has('--budget-usd') ? Number(options.get('--budget-usd')) : undefined;
  const billingMode = options.has('--subscription') ? 'subscription' : 'budget';
  // Pretplatnicki nacin: postavljen API kljuc bi Claude `-p` poziv prebacio na API naplatu (dokumentirano
  // ponasanje CLI-ja), pa je to greska prije pripreme, ne upozorenje poslije poziva.
  if (billingMode === 'subscription') {
    const leaked = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_API_KEY'].filter(name => process.env[name]);
    if (leaked.length) throw new Error(`subscription mode refuses API credentials in the environment: ${leaked.join(', ')}`);
  }
  const job = prepareJob(queue, id, phase, agent, budget, { billingMode });
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
    const promptFile = join(out, 'prompt.md');
    writeFileSync(promptFile, job.prompt);
    // Grok cita prompt iz datoteke; priprema je oznacila mjesto, `spawnJob` upisuje stvarnu putanju.
    releaseLock = false;
    const result = spawnJob(job, promptFile, root);
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

// Pokrece se samo kad je ova datoteka ULAZNA tocka procesa. Bez toga bi uvoz iz testa izvrsio
// `main()` nad argv vitesta, pa bi se gard nad izgradnjom argumenata uopce ne bi dao napisati.
if (isEntryModule(import.meta.url, process.argv[1])) {
  try { main(); } catch (error) {
    console.error(`[agents] ${error.message}`);
    process.exitCode = 1;
  }
}
