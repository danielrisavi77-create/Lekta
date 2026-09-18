import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { detectChanges } from './detect-change.mjs';
import { selectGates, validateVerificationMap } from './select-gates.mjs';
import { buildReport, formatReport, writeReport } from './report.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function assertValue(value, option) {
  if (!value || value.startsWith('-')) throw new Error(`${option} trazi vrijednost.`);
  return value;
}

export function parseArgs(argv) {
  const parsed = {
    base: 'origin/master',
    dryRun: false,
    acknowledgements: [],
    configPath: null,
    reportPath: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '--base') {
      parsed.base = assertValue(argv[++index], '--base');
    } else if (arg.startsWith('--base=')) {
      parsed.base = assertValue(arg.slice('--base='.length), '--base');
    } else if (arg === '--ack') {
      parsed.acknowledgements.push(assertValue(argv[++index], '--ack'));
    } else if (arg.startsWith('--ack=')) {
      parsed.acknowledgements.push(assertValue(arg.slice('--ack='.length), '--ack'));
    } else if (arg === '--config') {
      parsed.configPath = assertValue(argv[++index], '--config');
    } else if (arg === '--report') {
      parsed.reportPath = assertValue(argv[++index], '--report');
    } else {
      throw new Error(`Nepoznat argument: ${arg}`);
    }
  }
  parsed.acknowledgements = [...new Set(parsed.acknowledgements)];
  return parsed;
}

export function requirementStatus(gate, { env, platform, executableAvailable }) {
  const requirements = gate.requirements ?? {};
  if (requirements.platforms && !requirements.platforms.includes(platform)) {
    return { available: false, reason: `platform:${platform}` };
  }
  for (const name of requirements.env ?? []) {
    if (!env[name]) return { available: false, reason: `missing-env:${name}` };
  }
  if (requirements.anyEnv && !requirements.anyEnv.some((name) => env[name])) {
    return { available: false, reason: `missing-any-env:${requirements.anyEnv.join(',')}` };
  }
  if (requirements.executable && !executableAvailable(requirements.executable)) {
    return { available: false, reason: `missing-executable:${requirements.executable}` };
  }
  return { available: true, reason: null };
}

export function finalVerdict(selection, results) {
  if (results.some((result) => result.status === 'failed')) return { status: 'failed', exitCode: 1 };
  const needsHuman = selection.status === 'needs_human'
    || results.some((result) => ['manual_required', 'unavailable', 'not_run'].includes(result.status));
  if (needsHuman) return { status: 'needs_human', exitCode: 2 };
  return { status: 'passed', exitCode: 0 };
}

export async function runSelectedGates(selection, options = {}) {
  const acknowledgements = new Set(options.acknowledgements ?? []);
  const acknowledgementErrors = [];
  const selectedById = new Map(selection.gates.map((gate) => [gate.id, gate]));
  for (const gateId of acknowledgements) {
    const gate = selectedById.get(gateId);
    if (!gate) throw new Error(`Ack za neodabrani gate: ${gateId}.`);
    if (gate.kind !== 'manual' || gate.acknowledgeable === false) {
      acknowledgementErrors.push(`Gate se ne moze potvrditi: ${gateId}.`);
      acknowledgements.delete(gateId);
    }
  }

  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const executableAvailable = options.executableAvailable ?? (() => true);
  const execute = options.execute ?? (() => { throw new Error('Command executor nije konfiguriran.'); });
  const results = [];

  for (const gate of selection.gates) {
    if (gate.coveredBy) {
      results.push({ id: gate.id, status: 'covered', coveredBy: gate.coveredBy, durationMs: 0 });
      continue;
    }
    if (gate.kind === 'manual') {
      results.push({
        id: gate.id,
        status: acknowledgements.has(gate.id) && gate.acknowledgeable !== false ? 'acknowledged' : 'manual_required',
        durationMs: 0,
      });
      continue;
    }
    if (options.dryRun) {
      results.push({ id: gate.id, status: 'not_run', reason: 'dry-run', durationMs: 0 });
      continue;
    }
    const requirement = requirementStatus(gate, { env, platform, executableAvailable });
    if (!requirement.available) {
      results.push({ id: gate.id, status: 'unavailable', reason: requirement.reason, durationMs: 0 });
      continue;
    }

    const started = Date.now();
    try {
      const execution = await execute(gate);
      const statusCode = typeof execution === 'number' ? execution : execution?.status;
      results.push({
        id: gate.id,
        status: statusCode === 0 ? 'passed' : 'failed',
        commandStatus: Number.isInteger(statusCode) ? statusCode : null,
        durationMs: execution?.durationMs ?? Date.now() - started,
      });
    } catch (error) {
      results.push({
        id: gate.id,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started,
      });
    }
  }

  return { results, acknowledgementErrors, ...finalVerdict(selection, results) };
}

export function resolveCommand(gate, options = {}) {
  if (!Array.isArray(gate.argv) || gate.argv.length === 0) throw new Error(`Gate ${gate.id ?? '<unknown>'} nema argv.`);
  const [program, ...args] = gate.argv;
  const nodePath = options.nodePath ?? process.execPath;
  if (program === 'node') return { executable: nodePath, args };
  if (program === 'npm') {
    const pathExists = options.pathExists ?? existsSync;
    const environment = options.env ?? process.env;
    const configuredNpmCli = options.npmExecPath !== undefined ? options.npmExecPath : environment.npm_execpath;
    const adjacentNpmCli = resolve(dirname(nodePath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    const npmExecPath = configuredNpmCli
      || (pathExists(adjacentNpmCli) ? adjacentNpmCli : null);
    if (!npmExecPath) throw new Error('Nije pronaden npm CLI uz trenutni Node runtime.');
    return { executable: nodePath, args: [npmExecPath, ...args] };
  }
  return { executable: program, args };
}

export function executableAvailable(name, options = {}) {
  if (name === 'node') return true;
  if (name === 'npm') {
    try {
      resolveCommand({ id: 'npm-probe', argv: ['npm'] }, options);
      return true;
    } catch {
      return false;
    }
  }
  const platform = options.platform ?? process.platform;
  const probe = platform === 'win32'
    ? { executable: 'where.exe', args: [name] }
    : { executable: 'which', args: [name] };
  const result = spawnSync(probe.executable, probe.args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  return !result.error && result.status === 0;
}

export function executeGateCommand(gate, options = {}) {
  const command = resolveCommand(gate, options);
  const started = Date.now();
  const result = spawnSync(command.executable, command.args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return { status: result.status, durationMs: Date.now() - started };
}

function resolveRepoFile(repoRoot, requested, fallback) {
  const resolved = resolve(repoRoot, requested ?? fallback);
  const fromRoot = relative(repoRoot, resolved);
  if (fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(fromRoot)) {
    throw new Error(`Putanja mora ostati u repozitoriju: ${requested}.`);
  }
  return resolved;
}

function unknownSelection(config) {
  const gate = config.gateById.get('needs-human');
  return {
    risk: 'unknown',
    status: 'needs_human',
    reasons: ['git-detection-failed'],
    matchedRoutes: [],
    unknownPaths: [],
    gateIds: ['needs-human'],
    gates: [{ ...gate, coveredBy: null }],
  };
}

export async function main(argv = process.argv.slice(2), context = {}) {
  const parsed = parseArgs(argv);
  const repoRoot = context.repoRoot ?? REPO_ROOT;
  const logger = context.logger ?? console;
  const environment = context.env ?? process.env;
  const platform = context.platform ?? process.platform;
  const configPath = resolveRepoFile(repoRoot, parsed.configPath, 'config/verification-map.json');
  const reportPath = resolveRepoFile(repoRoot, parsed.reportPath, '.artifacts/verification-router/latest.json');
  const config = validateVerificationMap(JSON.parse(readFileSync(configPath, 'utf8')));
  const startedAt = new Date().toISOString();

  let detection;
  try {
    detection = detectChanges({ repoRoot, base: parsed.base, git: context.git });
  } catch (error) {
    const selection = unknownSelection(config);
    const execution = {
      results: [{ id: 'needs-human', status: 'manual_required', reason: 'git-detection-failed', durationMs: 0 }],
      acknowledgementErrors: [],
      status: 'needs_human',
      exitCode: 2,
    };
    const report = buildReport({
      detection: {
        baseRef: parsed.base,
        baseSha: null,
        headSha: null,
        dirtyWorkingTree: true,
        changes: [],
      },
      selection,
      execution,
      acknowledgements: parsed.acknowledgements,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    writeReport(report, reportPath);
    logger.error(`Git detection failed: ${error instanceof Error ? error.message : String(error)}`);
    logger.log(formatReport(report));
    logger.log(`Report: ${relative(repoRoot, reportPath).replaceAll('\\', '/')}`);
    return 2;
  }

  const selection = selectGates(detection.changes, config);
  const execution = await runSelectedGates(selection, {
    acknowledgements: parsed.acknowledgements,
    dryRun: parsed.dryRun,
    env: environment,
    platform,
    executableAvailable: (name) => executableAvailable(name, { cwd: repoRoot, env: environment, platform }),
    execute: (gate) => executeGateCommand(gate, {
      cwd: repoRoot,
      env: environment,
      nodePath: context.nodePath,
      npmExecPath: context.npmExecPath,
    }),
  });
  const report = buildReport({
    detection,
    selection,
    execution,
    acknowledgements: parsed.acknowledgements,
    startedAt,
    finishedAt: new Date().toISOString(),
  });
  writeReport(report, reportPath);
  logger.log(formatReport(report));
  logger.log(`Report: ${relative(repoRoot, reportPath).replaceAll('\\', '/')}`);
  return execution.exitCode;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
