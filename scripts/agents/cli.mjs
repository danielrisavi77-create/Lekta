#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync, openSync, closeSync, unlinkSync, realpathSync } from 'node:fs';
import { delimiter, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTS, GROK_MIN_VERSION, prepareJob, parseGrokVersion, parseResult, validateQueue, PROMPT_FILE_PLACEHOLDER } from './core.mjs';

export function diagnoseProviderFailure(command, stderr) {
  if (command === 'grok' && /bwrap:.*Creating new namespace failed: Operation not permitted/i.test(stderr ?? '')) {
    return {
      diagnostic: 'grok_sandbox_unavailable',
      diagnosticMessage: 'Grok could not start its Bubblewrap sandbox on this host. Enable supported user namespaces or run it on a compatible host; the runner will not disable the sandbox.',
    };
  }
  return { diagnostic: null, diagnosticMessage: null };
}

export function buildSpawnArgs(job, promptFile) {
  if (!job || !Array.isArray(job.args)) throw new Error('Job without args cannot be spawned');
  if (job.args.includes(PROMPT_FILE_PLACEHOLDER) && !promptFile) throw new Error('Prompt file path is required');
  const args = job.args.map((arg) => (arg === PROMPT_FILE_PLACEHOLDER ? promptFile : arg));
  if (args.includes(PROMPT_FILE_PLACEHOLDER)) throw new Error('Unsubstituted prompt file placeholder in args');
  return args;
}

export function spawnJob(job, promptFile, cwd, spawn = spawnSync) {
  const args = buildSpawnArgs(job, promptFile);
  const promptInFile = job.args.includes(PROMPT_FILE_PLACEHOLDER);
  return spawn(job.command, args, {
    cwd, input: promptInFile ? undefined : job.prompt, encoding: 'utf8', shell: false,
    timeout: 30 * 60 * 1000, killSignal: 'SIGKILL', maxBuffer: 32 * 1024 * 1024,
  });
}

/**
 * Mapa provider -> ulazna tocka npm paketa, izmjerena na Windowsu 2026-09-22.
 *
 * Zasto postoji: npm na Windowsu ne instalira izvrsnu datoteku nego `.cmd` shim
 * (`codex.cmd`, `grok.cmd`). `spawnSync('codex', ['--version'], { shell: false })` na takav shim
 * vrati `ENOENT`, pa je `agents doctor` javljao `codex: unavailable` iako CLI radi iz terminala.
 * To je LAZAN NEGATIV. Lijek nije ukljucivanje ljuske (to bi vratilo injekciju naredbenog retka),
 * nego izravan poziv paketne ulazne tocke kroz Node.
 *
 * Razrjesavanje ide po ovoj mapi, ne po imenu u uvjetu, da dodavanje providera ne trazi novu granu.
 * Vrijednost je `bin` staza iz `package.json` toga paketa:
 *  - `@xai-official/grok` ima `bin.grok = 'bin/grok-bootstrap.js'`
 *  - `@openai/codex` ima `bin.codex = 'bin/codex.js'`
 * Claude Code namjerno NIJE ovdje: nije npm shim i pokrece se izravno, pa mora proci nepromijenjen.
 */
export const PROVIDER_PACKAGE_ENTRYPOINTS = Object.freeze(Object.assign(Object.create(null), {
  grok: Object.freeze(['@xai-official', 'grok', 'bin', 'grok-bootstrap.js']),
  codex: Object.freeze(['@openai', 'codex', 'bin', 'codex.js']),
}));

/**
 * Vraca `{ command, argsPrefix }` kojim se provider pokrece bez ljuske.
 * Nepoznat provider, ne-Windows platforma i nenadjen paket vracaju naredbu nepromijenjenu
 * (fail-open: bolje pustiti pokusaj nego odbiti okolinu koju ovaj popravak ne opisuje).
 */
export function resolveProviderInvocation(command, options = {}) {
  const platform = options.platform ?? process.platform;
  const entrypoints = options.entrypoints ?? PROVIDER_PACKAGE_ENTRYPOINTS;
  const known = entrypoints !== null && typeof entrypoints === 'object'
    && Object.prototype.hasOwnProperty.call(entrypoints, command);
  const packagePath = known ? entrypoints[command] : null;
  if (platform !== 'win32' || !Array.isArray(packagePath) || packagePath.length === 0) {
    return { command, argsPrefix: [] };
  }

  const exists = options.exists ?? existsSync;
  const cwd = options.cwd ?? process.cwd();
  const pathEnv = options.pathEnv ?? process.env.PATH ?? '';
  const candidates = [
    join(cwd, 'node_modules', ...packagePath),
    ...String(pathEnv).split(delimiter).filter(Boolean).flatMap((dir) => [
      join(dir, ...packagePath),
      join(dir, 'node_modules', ...packagePath),
    ]),
  ];
  const bootstrap = candidates.find((candidate, index) => candidates.indexOf(candidate) === index && exists(candidate));
  return bootstrap ? { command: process.execPath, argsPrefix: [bootstrap] } : { command, argsPrefix: [] };
}

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
    console.log('agents doctor | list | prepare|run T00 --phase plan|implement|review --agent astra|fable|opus|sonnet|sol|grok|build [--budget-usd N | --subscription] [--execute]');
    return;
  }
  if (command === 'doctor') {
    if (rest.length) throw new Error('doctor takes no arguments');
    for (const cli of ['git', 'node', 'deno', 'codex', 'claude', 'grok']) {
      const versionArgs = cli === 'grok' ? ['version'] : ['--version'];
      const invocation = resolveProviderInvocation(cli, { cwd: root });
      const result = spawnSync(invocation.command, [...invocation.argsPrefix, ...versionArgs], { encoding: 'utf8', timeout: 10_000 });
      const line = (result.stdout || result.stderr || '').trim().split('\n')[0];
      if (cli === 'grok' && result.status === 0) {
        const version = parseGrokVersion(line);
        const support = version.supported ? 'supported' : `unsupported; minimum ${GROK_MIN_VERSION}`;
        console.log(`${cli}: ${line} [${support}]`);
      } else {
        console.log(`${cli}: ${result.status === 0 ? line : 'unavailable'}`);
      }
    }
    console.log('Model access and login must be checked locally: codex login status; claude auth status; grok login (or XAI_API_KEY). No model was called.');
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
    if (!['--agent', '--phase', '--budget-usd', '--execute', '--subscription', '--override-status', '--override-implementer'].includes(key) || options.has(key)) throw new Error(`Invalid option: ${key}`);
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
  // Autonomni kontroler tvrdi fazu pregleda iz VLASTITE evidencije, jer tasks.json pise koordinator. Obje
  // opcije idu zajedno i vrijede samo za `review`; bez njih je ponasanje identicno rucnom toku.
  const overrideStatus = options.get('--override-status');
  const overrideImplementer = options.get('--override-implementer');
  if ((overrideStatus === undefined) !== (overrideImplementer === undefined)) {
    throw new Error('--override-status and --override-implementer must be given together');
  }
  if (overrideStatus !== undefined && phase !== 'review') throw new Error('Override options apply to --phase review only');
  const overrideTask = overrideStatus === undefined ? undefined : { status: overrideStatus, implementationAgent: overrideImplementer };
  const job = prepareJob(queue, id, phase, agent, budget, overrideTask ? { billingMode, overrideTask } : { billingMode });
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
    // argv array, never a shell string. Existing CLI authentication is reused.
    // Grok reads the prompt artifact; Codex/Claude take the prompt on stdin.
    releaseLock = false;
    const invocation = resolveProviderInvocation(job.command, { cwd: root });
    const resolvedJob = invocation.argsPrefix.length
      ? { ...job, command: invocation.command, args: [...invocation.argsPrefix, ...job.args] }
      : job;
    const result = spawnJob(resolvedJob, join(out, 'prompt.md'), root);
    releaseLock = !result.error && !result.signal;
    writeFileSync(join(out, 'stdout.log'), result.stdout ?? '');
    writeFileSync(join(out, 'stderr.log'), result.stderr ?? '');
    const parsed = parseResult(job.command, result.stdout ?? '', result.status);
    const diagnosis = diagnoseProviderFailure(job.command, result.stderr ?? '');
    const report = { task: id, phase, agent, baseHead, requestedModel: AGENTS[agent].model,
      reportedModels: parsed.reportedModels, exitCode: result.status, signal: result.signal,
      error: result.error?.message ?? null,
      ...diagnosis,
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

if (isEntryModule(import.meta.url, process.argv[1])) {
  try { main(); } catch (error) {
    console.error(`[agents] ${error.message}`);
    process.exitCode = 1;
  }
}
