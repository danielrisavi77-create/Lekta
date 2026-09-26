// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const cli = resolve('scripts/agents/cli.mjs');
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(event = 'turn.completed', grokMode: 'success' | 'sandbox-failure' | 'old-version' = 'success') {
  const root = mkdtempSync(join(tmpdir(), 'lekta-agents-'));
  roots.push(root);
  mkdirSync(join(root, 'docs/agents'), { recursive: true });
  mkdirSync(join(root, 'bin'));
  writeFileSync(join(root, 'docs/agents/tasks.json'), JSON.stringify({ tasks: [
    { id: 'T00', title: 'Audit', status: 'ready', dependsOn: [] },
  ] }));
  writeFileSync(join(root, '.gitignore'), '.artifacts/\nbin/\n');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', 'docs/agents/tasks.json', '.gitignore'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Fixture'], { cwd: root });
  // The external provider is the only fake. Exercise the actual CLI, Git preflight and files.
  writeFileSync(join(root, 'bin/codex'), `#!/usr/bin/env node\nlet input = ''; process.stdin.on('data', x => input += x); process.stdin.on('end', () => { if (!input.includes('LEKTA task T00')) process.exit(2); if ('${event}' === 'SIGTERM') process.kill(process.pid, 'SIGTERM'); else console.log(JSON.stringify({ type: '${event}' })); });\n`, { mode: 0o755 });
  writeFileSync(join(root, 'bin/grok'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'version') {
  console.log('${grokMode === 'old-version' ? 'grok 1.0.33 (old)' : 'grok 1.0.34 (test)'}');
  process.exit(0);
}
const promptIndex = args.indexOf('--prompt-file');
const sandboxIndex = args.indexOf('--sandbox');
if (promptIndex < 0 || !fs.existsSync(args[promptIndex + 1])) process.exit(3);
const prompt = fs.readFileSync(args[promptIndex + 1], 'utf8');
if (!prompt.includes('LEKTA task T00') || args.includes(prompt)) process.exit(4);
if (sandboxIndex < 0 || args[sandboxIndex + 1] !== 'read-only') process.exit(5);
if ('${grokMode}' === 'sandbox-failure') {
  console.error('bwrap: Creating new namespace failed: Operation not permitted');
  process.exit(1);
}
console.log(JSON.stringify({ text: 'ok', stopReason: 'end_turn', num_turns: 1, modelUsage: { 'grok-4.6-build': { modelCalls: 1 } } }));
`, { mode: 0o755 });
  const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], {
    cwd: root, encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}` },
  });
  return { root, run };
}

// Native test executable uses a POSIX shebang. Pure protocol tests cover every platform.
describe.skipIf(process.platform === 'win32')('actual agent CLI process boundary', () => {
  it('keeps successful output unverified, records evidence, releases lock and preserves the queue', () => {
    const { root, run } = fixture();
    const before = readFileSync(join(root, 'docs/agents/tasks.json'), 'utf8');
    const dry = run('run', 'T00', '--phase', 'plan', '--agent', 'astra');
    expect(JSON.parse(dry.stdout).dryRun).toBe(true);
    expect(existsSync(join(root, '.artifacts'))).toBe(false);
    const result = run('run', 'T00', '--phase', 'plan', '--agent', 'astra', '--execute');
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.status).toBe('needs_verification');
    expect(readFileSync(join(report.artifacts, 'stdout.log'), 'utf8')).toContain('turn.completed');
    expect(readFileSync(join(root, 'docs/agents/tasks.json'), 'utf8')).toBe(before);
    expect(existsSync(join(root, '.git/lekta-agent.lock'))).toBe(false);
  });
  it('reports a provider failure even if its process exits zero', () => {
    const { root, run } = fixture('turn.failed');
    const result = run('run', 'T00', '--phase', 'plan', '--agent', 'astra', '--execute');
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).status).toBe('failed');
    const entries = readdirSync(join(root, '.artifacts/agents'));
    expect(entries).toContain('usage.jsonl');
    expect(entries.filter((name) => name.startsWith('T00-'))).toHaveLength(1);
  });
  it('retains the lock after a signal because child processes may still be alive', () => {
    const { root, run } = fixture('SIGTERM');
    const result = run('run', 'T00', '--phase', 'plan', '--agent', 'astra', '--execute');
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).signal).toBe('SIGTERM');
    expect(existsSync(join(root, '.git/lekta-agent.lock'))).toBe(true);
  });
  it('refuses a second session and implementation in the shared checkout before calling the provider', () => {
    const { root, run } = fixture();
    const shared = run('run', 'T00', '--phase', 'implement', '--agent', 'sol', '--execute');
    expect(shared.status).toBe(1);
    expect(shared.stderr).toContain('separate git worktree');
    writeFileSync(join(root, '.git/lekta-agent.lock'), 'existing session');
    const locked = run('run', 'T00', '--phase', 'plan', '--agent', 'astra', '--execute');
    expect(locked.status).toBe(1);
    expect(locked.stderr).toContain('lock');
    expect(readFileSync(join(root, '.git/lekta-agent.lock'), 'utf8')).toBe('existing session');
    expect(existsSync(join(root, '.artifacts'))).toBe(false);
  });
  it('runs Grok through a prompt file with read-only sandbox and records its model evidence', () => {
    const { root, run } = fixture();
    const result = run('run', 'T00', '--phase', 'plan', '--agent', 'grok', '--execute');
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.status).toBe('needs_verification');
    expect(report.reportedModels).toEqual(['grok-4.6-build']);
    expect(report.usage.modelCalls).toBe(1);
    expect(readFileSync(join(report.artifacts, 'prompt.md'), 'utf8')).toContain('LEKTA task T00');
    const ledger = readFileSync(join(root, '.artifacts/agents/usage.jsonl'), 'utf8')
      .trim().split('\n').map(line => JSON.parse(line));
    expect(ledger.at(-1)).toMatchObject({
      task: 'T00', phase: 'plan', provider: 'grok', status: 'needs_verification',
      usage: { modelCalls: 1 },
    });
  });
  it('diagnoses an unavailable Bubblewrap sandbox without weakening it', () => {
    const { run } = fixture('turn.completed', 'sandbox-failure');
    const result = run('run', 'T00', '--phase', 'plan', '--agent', 'grok', '--execute');
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({ status: 'failed', diagnostic: 'grok_sandbox_unavailable' });
    expect(report.diagnosticMessage).toContain('Bubblewrap');
    expect(result.stdout).not.toContain('--sandbox off');
  });
  it('reports whether the installed Grok version satisfies the verified minimum', () => {
    const supported = fixture().run('doctor');
    expect(supported.status, supported.stderr).toBe(0);
    expect(supported.stdout).toContain('grok: grok 1.0.34 (test) [supported]');
    const unsupported = fixture('turn.completed', 'old-version').run('doctor');
    expect(unsupported.status, unsupported.stderr).toBe(0);
    expect(unsupported.stdout).toContain('grok: grok 1.0.33 (old) [unsupported; minimum 1.0.34]');
  });
  it('refuses an unsupported Grok version before creating model artifacts', () => {
    const { root, run } = fixture('turn.completed', 'old-version');
    const result = run('run', 'T00', '--phase', 'plan', '--agent', 'grok', '--execute');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unsupported Grok CLI version');
    expect(existsSync(join(root, '.artifacts'))).toBe(false);
  });
});

// Sam `prepare` ne dira git ni providera, pa se ugovor opcija mjeri na SVAKOJ platformi (proces iznad je
// preskocen na Windowsu jer lazni provider ima POSIX shebang).
describe('option contract of the actual CLI process', () => {
  function bare() {
    const root = mkdtempSync(join(tmpdir(), 'lekta-agents-opt-'));
    roots.push(root);
    mkdirSync(join(root, 'docs/agents'), { recursive: true });
    writeFileSync(join(root, 'docs/agents/tasks.json'), JSON.stringify({ tasks: [
      { id: 'T00', title: 'Audit', status: 'ready', dependsOn: [] },
    ] }));
    const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], {
      cwd: root, encoding: 'utf8', timeout: 20_000, env: { ...process.env },
    });
    return { root, run };
  }

  it('prepares a review from the controller assertion without touching the queue file', () => {
    const { root, run } = bare();
    const before = readFileSync(join(root, 'docs/agents/tasks.json'), 'utf8');
    const plain = run('prepare', 'T00', '--phase', 'review', '--agent', 'astra', '--subscription');
    expect(plain.status).toBe(1);
    expect(plain.stderr).toContain('in_review');
    const result = run('prepare', 'T00', '--phase', 'review', '--agent', 'astra', '--subscription',
      '--override-status', 'in_review', '--override-implementer', 'sonnet');
    expect(result.status, result.stderr).toBe(0);
    const job = JSON.parse(result.stdout);
    expect(job.dryRun).toBe(true);
    expect(job.command).toBe('codex');
    expect(job.args).toContain('read-only');
    expect(readFileSync(join(root, 'docs/agents/tasks.json'), 'utf8')).toBe(before);
  });

  it('refuses half an override, an override outside review, and an unknown option', () => {
    const { run } = bare();
    const half = run('prepare', 'T00', '--phase', 'review', '--agent', 'astra', '--subscription', '--override-status', 'in_review');
    expect(half.status).toBe(1);
    expect(half.stderr).toContain('together');
    const wrongPhase = run('prepare', 'T00', '--phase', 'plan', '--agent', 'astra', '--subscription',
      '--override-status', 'in_review', '--override-implementer', 'sonnet');
    expect(wrongPhase.status).toBe(1);
    expect(wrongPhase.stderr).toContain('review only');
    // Override ne smije postati put kojim se zaobilazi provjera spremnosti u fazi implementacije.
    const implement = run('prepare', 'T00', '--phase', 'implement', '--agent', 'sonnet', '--subscription',
      '--override-status', 'ready', '--override-implementer', 'sonnet');
    expect(implement.status).toBe(1);
    expect(implement.stderr).toContain('review only');
    const unknown = run('prepare', 'T00', '--phase', 'review', '--agent', 'astra', '--subscription', '--override-task', 'T00');
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('Invalid option');
  });

  it('keeps the different-provider rule when the controller names the implementer', () => {
    const { root, run } = bare();
    const before = readFileSync(join(root, 'docs/agents/tasks.json'), 'utf8');
    const same = run('prepare', 'T00', '--phase', 'review', '--agent', 'astra', '--subscription',
      '--override-status', 'in_review', '--override-implementer', 'sol');
    expect(same.status).toBe(1);
    expect(same.stderr).toContain('different provider');
    expect(readFileSync(join(root, 'docs/agents/tasks.json'), 'utf8')).toBe(before);
  });

  it('leaves the manual flow byte for byte unchanged when no override is given', () => {
    const { run } = bare();
    const job = JSON.parse(run('prepare', 'T00', '--phase', 'plan', '--agent', 'astra', '--subscription').stdout);
    expect(job.args).toEqual(['exec', '--model', 'gpt-6-astra', '--sandbox', 'read-only', '--json', '-']);
    expect(job.billingMode).toBe('subscription');
  });
});
