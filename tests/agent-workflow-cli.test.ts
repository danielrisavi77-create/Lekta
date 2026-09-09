// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const cli = resolve('scripts/agents/cli.mjs');
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(event = 'turn.completed') {
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
    expect(readdirSync(join(root, '.artifacts/agents'))).toHaveLength(1);
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
});
