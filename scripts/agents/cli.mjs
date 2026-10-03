#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync, appendFileSync, openSync, closeSync, unlinkSync, realpathSync } from 'node:fs';
import { delimiter, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTS, GROK_MIN_VERSION, modelMatches, prepareJob, parseGrokVersion, parseResult, validateQueue, PROMPT_FILE_PLACEHOLDER } from './core.mjs';
import { botPathViolations, changedPaths, resolveBot } from './grok-bots.mjs';
import { buildImplementerEnvironment, validateGlobalLeaseSync } from './global-lease-runner.mjs';
import { findTaskWriteConflicts, findWriteScopeConflicts, validateWorkScope, writeScopeViolations } from './task-scope.mjs';
import { assertKnownClaudeModel, probeModel, runFixture } from './model-probe.mjs';

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

export function spawnJob(job, promptFile, cwd, spawn = spawnSync, env = process.env) {
  const args = buildSpawnArgs(job, promptFile);
  const promptInFile = job.args.includes(PROMPT_FILE_PLACEHOLDER);
  return spawn(job.command, args, {
    cwd, env, input: promptInFile ? undefined : job.prompt, encoding: 'utf8', shell: false,
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

/**
 * Provjera verzije Grok CLI-ja prije pokretanja posla. Ide kroz `resolveProviderInvocation`
 * kao i doctor: gola `spawnSync('grok', ...)` na Windowsu daje ENOENT na npm `.cmd` shimu, pa
 * bi svaki Grok posao pao s "Unsupported Grok CLI version: unknown" iako je CLI ispravan.
 */
export function checkGrokVersion(options = {}) {
  const spawn = options.spawn ?? spawnSync;
  const invocation = resolveProviderInvocation('grok', {
    cwd: options.cwd ?? process.cwd(),
    platform: options.platform,
    exists: options.exists,
    pathEnv: options.pathEnv,
    entrypoints: options.entrypoints,
  });
  const versionRun = spawn(invocation.command, [...invocation.argsPrefix, 'version'], { encoding: 'utf8', timeout: 10_000, shell: false });
  const versionLine = (versionRun.stdout || versionRun.stderr || '').trim().split('\n')[0];
  const version = parseGrokVersion(versionLine);
  if (versionRun.status !== 0 || !version.supported) {
    throw new Error(`Unsupported Grok CLI version: ${version.version ?? 'unknown'}; minimum ${GROK_MIN_VERSION}`);
  }
}

/**
 * Jedan redak `agents doctor` za zadani CLI. Ide kroz `resolveProviderInvocation`, isto kao `run` i
 * `checkGrokVersion`: gola `spawnSync('grok', ...)` na Windowsu pogadja npm `.cmd` shim i vraca
 * ENOENT, pa bi doctor lazno javio `grok: unavailable`. Izdvojeno iz `main` da test moze podmetnuti
 * platformu, resolver i spawn i provjeriti Windows put na svakom OS-u.
 */
export function probeCli(cli, options = {}) {
  const spawn = options.spawn ?? spawnSync;
  const versionArgs = cli === 'grok' ? ['version'] : ['--version'];
  const invocation = resolveProviderInvocation(cli, {
    cwd: options.cwd ?? process.cwd(),
    platform: options.platform,
    exists: options.exists,
    pathEnv: options.pathEnv,
    entrypoints: options.entrypoints,
  });
  const result = spawn(invocation.command, [...invocation.argsPrefix, ...versionArgs], { encoding: 'utf8', timeout: 10_000, shell: false });
  const line = (result.stdout || result.stderr || '').trim().split('\n')[0];
  if (cli === 'grok' && result.status === 0) {
    const version = parseGrokVersion(line);
    const support = version.supported ? 'supported' : `unsupported; minimum ${GROK_MIN_VERSION}`;
    return `${cli}: ${line} [${support}]`;
  }
  return `${cli}: ${result.status === 0 ? line : 'unavailable'}`;
}

/** Bot iz `config/agent-routing.json` za `--bot`; bez configa ili bota baca gresku. */
export function loadBot(rootDir, botName, agentName, phase) {
  const config = JSON.parse(readFileSync(join(rootDir, 'config/agent-routing.json'), 'utf8'));
  const bot = resolveBot(config, botName, { agentName, agentCommand: AGENTS[agentName]?.command, runnerPhase: phase });
  return { bot, protectedPaths: Array.isArray(config.protectedPaths) ? config.protectedPaths : [] };
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

// Snimka prljavih i nepracenih datoteka (staza -> blob hash) za provjeru putanja Grok bota.
function worktreeSnapshot() {
  const paths = [...new Set([
    ...git('diff', '--name-only', 'HEAD').split('\n'),
    ...git('ls-files', '--others', '--exclude-standard').split('\n'),
  ].filter(Boolean))];
  const present = paths.filter((p) => existsSync(join(root, p)));
  const hashes = present.length ? git('hash-object', '--', ...present).split('\n') : [];
  const snapshot = Object.fromEntries(paths.map((p) => [p, 'deleted']));
  present.forEach((p, i) => { snapshot[p] = hashes[i]; });
  return snapshot;
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === 'help') {
    console.log('agents doctor [--model claude-...] | model-fixture --model claude-... --effort low|medium|high|xhigh | list | prepare|run T00 --phase plan|implement|review --agent astra|fable|opus|sonnet|sol|grok|build [--budget-usd N | --subscription] [--bot grok-review|grok-scout|grok-docs|grok-triage] [--execute]');
    return;
  }
  if (command === 'doctor' && rest.length) {
    // Doctor za jedan model: stvaran poziv kroz pretplatu (ROUTING.md, "Kako dodati novi model", korak 1).
    if (rest.length !== 2 || rest[0] !== '--model') throw new Error('doctor takes no arguments or --model <claude model>');
    assertKnownClaudeModel(JSON.parse(readFileSync(join(root, 'config/agent-routing.json'), 'utf8')), rest[1]);
    const probe = probeModel(rest[1], { cwd: root });
    console.log(probe.line);
    if (!probe.ok) process.exitCode = 1;
    return;
  }
  if (command === 'model-fixture') {
    // Korak 2: implement na malom zadatku u privremenoj mapi; jedan run po pozivu.
    if (rest.length !== 4 || rest[0] !== '--model' || rest[2] !== '--effort') throw new Error('model-fixture --model <claude model> --effort <level>');
    const [, model, , effort] = rest;
    assertKnownClaudeModel(JSON.parse(readFileSync(join(root, 'config/agent-routing.json'), 'utf8')), model);
    const report = { observedAt: new Date().toISOString(), ...runFixture(model, effort) };
    const out = join(root, '.artifacts/agents');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, `model-fixture-${model}-${effort}-${Date.now()}.json`), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
    return;
  }
  if (command === 'doctor') {
    for (const cli of ['git', 'node', 'deno', 'codex', 'claude', 'grok']) console.log(probeCli(cli, { cwd: root }));
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
  for (const task of queue.tasks) validateWorkScope(task.workScope, task.id);
  const activeScopeConflicts = findWriteScopeConflicts(queue);
  if (activeScopeConflicts.length) {
    const first = activeScopeConflicts[0];
    throw new Error(`Write scope conflict: ${first.taskA} ${first.pathA} <-> ${first.taskB} ${first.pathB}`);
  }
  if (!['prepare', 'run'].includes(command)) throw new Error('Unknown command');
  const id = rest.shift();
  const options = new Map();
  while (rest.length) {
    const key = rest.shift();
    if (!['--agent', '--phase', '--budget-usd', '--execute', '--subscription', '--override-status', '--override-implementer', '--bot'].includes(key) || options.has(key)) throw new Error(`Invalid option: ${key}`);
    const value = (key === '--execute' || key === '--subscription') ? true : rest.shift();
    if (!value || (typeof value === 'string' && value.startsWith('--'))) throw new Error(`Missing value: ${key}`);
    options.set(key, value);
  }
  if (command === 'prepare' && options.has('--execute')) throw new Error('Use run --execute to launch an agent');
  const phase = options.get('--phase');
  const agent = options.get('--agent');
  const budget = options.has('--budget-usd') ? Number(options.get('--budget-usd')) : undefined;
  const billingMode = options.has('--subscription') ? 'subscription' : 'budget';
  // Subscription je provider-scoped: credential jednog providera ne smije blokirati drugi.
  if (billingMode === 'subscription') {
    const provider = AGENTS[agent]?.command;
    const names = provider === 'codex'
      ? ['OPENAI_API_KEY']
      : (provider === 'claude' ? ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_API_KEY'] : []);
    const leaked = names.filter(name => process.env[name]);
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
  if (phase === 'implement') {
    const conflicts = findTaskWriteConflicts(queue, id);
    if (conflicts.length) {
      const first = conflicts[0];
      throw new Error(`Task write scope conflict: ${first.taskA} ${first.pathA} <-> ${first.taskB} ${first.pathB}`);
    }
  }
  const job = prepareJob(queue, id, phase, agent, budget, overrideTask ? { billingMode, overrideTask } : { billingMode });
  // Grok bot (odluka vlasnika 27. 9.): uloga iz config/agent-routing.json. Bot ide iskljucivo na
  // pretplatu, a nakon pokretanja se provjerava da nije dirao nista izvan dopustenih putanja.
  let botRun = null;
  if (options.has('--bot')) {
    if (billingMode !== 'subscription') throw new Error('--bot requires --subscription (Grok runs only on the subscription)');
    botRun = loadBot(root, options.get('--bot'), agent, phase);
  }
  if (!options.has('--execute')) {
    console.log(JSON.stringify({ dryRun: true, ...(botRun ? { bot: botRun.bot.name } : {}), ...job }, null, 2));
    return;
  }
  if (job.command === 'grok') {
    checkGrokVersion({ cwd: root });
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
    const task = queue.tasks.find((item) => item.id === id);
    const treeBefore = (botRun || phase === 'implement') ? worktreeSnapshot() : null;
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
    const globalLeasePreflight = phase === 'implement'
      ? validateGlobalLeaseSync({ root, taskId: id, baseSha: baseHead, env: process.env })
      : { enforced: false, leaseId: null, expiresAt: null };
    const taskEnv = phase === 'implement'
      ? buildImplementerEnvironment(process.env, {
          taskId: id,
          scopeEnforced: Boolean(task?.workScope?.write?.length),
          baseSha: baseHead,
        })
      : process.env;
    const result = spawnJob(resolvedJob, join(out, 'prompt.md'), root, spawnSync, taskEnv);
    releaseLock = !result.error && !result.signal;
    writeFileSync(join(out, 'stdout.log'), result.stdout ?? '');
    writeFileSync(join(out, 'stderr.log'), result.stderr ?? '');
    const parsed = parseResult(job.command, result.stdout ?? '', result.status);
    const diagnosis = diagnoseProviderFailure(job.command, result.stderr ?? '');
    const modelOk = modelMatches(AGENTS[agent].model, parsed.reportedModels);
    let globalLeasePostflight = globalLeasePreflight;
    let globalLeaseError = null;
    if (phase === 'implement' && globalLeasePreflight.enforced) {
      try {
        globalLeasePostflight = validateGlobalLeaseSync({
          root,
          taskId: id,
          baseSha: baseHead,
          env: process.env,
        });
      } catch (error) {
        globalLeaseError = error instanceof Error ? error.message : String(error);
      }
    }
    const changed = treeBefore ? [...new Set([
      ...git('diff', '--name-only', baseHead, 'HEAD').split('\n').filter(Boolean),
      ...changedPaths(treeBefore, worktreeSnapshot()),
    ])] : [];
    let violations = null;
    if (botRun) violations = botPathViolations(botRun.bot, changed, botRun.protectedPaths);
    const taskScopeViolations = phase === 'implement' && task?.workScope?.write?.length
      ? writeScopeViolations(changed, task.workScope, id)
      : [];
    const report = { task: id, phase, agent, baseHead, requestedModel: AGENTS[agent].model,
      reportedModels: parsed.reportedModels, usage: parsed.usage, exitCode: result.status, signal: result.signal,
      error: result.error?.message ?? null,
      modelMismatch: parsed.ok && !modelOk ? { requested: AGENTS[agent].model, reported: parsed.reportedModels } : null,
      ...diagnosis,
      retainedLock: releaseLock ? null : lock,
      ...(botRun ? { bot: botRun.bot.name, botPathViolations: violations } : {}),
      ...(phase === 'implement' ? {
        changedPaths: changed,
        taskScopeViolations,
        globalLease: {
          preflight: globalLeasePreflight,
          postflight: globalLeasePostflight,
          error: globalLeaseError,
        },
      } : {}),
      status: parsed.ok && modelOk && !result.error
        && !(violations && violations.length) && taskScopeViolations.length === 0
        && !globalLeaseError
        ? 'needs_verification' : 'failed',
      note: 'Queue unchanged. Coordinator must verify patch, required checks and independent review.' };
    writeFileSync(join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    appendFileSync(join(root, '.artifacts/agents/usage.jsonl'), JSON.stringify({
      observedAt: new Date().toISOString(), task: id, phase, agent, provider: job.command,
      requestedModel: AGENTS[agent].model, reportedModels: parsed.reportedModels,
      usage: parsed.usage, exitCode: result.status, status: report.status,
    }) + '\n');
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
