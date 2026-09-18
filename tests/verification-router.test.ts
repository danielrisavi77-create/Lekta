import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MINIMAL_MAP = {
  version: 1,
  defaults: { gates: ['check', 'orphan-scan'] },
  gates: [
    { id: 'check', kind: 'command', argv: ['npm', 'run', 'check'], order: 10 },
    { id: 'orphan-scan', kind: 'command', argv: ['npm', 'run', 'orphan-scan'], order: 20 },
    { id: 'focused-repair-tests', kind: 'command', argv: ['node', 'vitest.mjs'], order: 30 },
    { id: 'strict-open', kind: 'command', argv: ['python', 'strict-open.py'], order: 40 },
    { id: 'slow', kind: 'command', argv: ['npm', 'run', 'test:slow'], order: 50 },
    { id: 'word', kind: 'command', argv: ['powershell', 'check.ps1'], order: 60 },
    { id: 'adversarial-review', kind: 'manual', order: 70 },
    { id: 'needs-human', kind: 'manual', acknowledgeable: false, order: 1000 },
  ],
  routes: [
    {
      id: 'repair',
      patterns: ['src/repair/**'],
      risk: 'high',
      gates: ['focused-repair-tests', 'strict-open', 'slow', 'word', 'adversarial-review'],
    },
  ],
};

describe('verification router', () => {
  it('repair promjena bira high-risk gateove i tvrdi minimum', async () => {
    const modulePath = '../scripts/verification/select-gates.mjs';
    const modulePromise = import(/* @vite-ignore */ modulePath);
    await expect(modulePromise).resolves.toHaveProperty('selectGates');

    const { validateVerificationMap, selectGates } = await modulePromise;
    const config = validateVerificationMap(MINIMAL_MAP);

    expect(selectGates([{ path: 'src/repair/apply-fixers.ts', sources: ['committed'] }], config)).toMatchObject({
      risk: 'high',
      status: 'ready',
      unknownPaths: [],
      gateIds: [
        'check',
        'orphan-scan',
        'focused-repair-tests',
        'strict-open',
        'slow',
        'word',
        'adversarial-review',
      ],
    });
  });

  it.each([
    ['src/repair/apply-fixers.ts', 'high', ['focused-repair-tests', 'strict-open', 'slow', 'word', 'adversarial-review']],
    ['src/citations/parse.ts', 'high', ['citation-tests', 'verify-claims', 'adversarial-review']],
    ['src/ui/repair-panel.ts', 'medium', ['ux', 'visual']],
    ['supabase/functions/repair-docx/index.ts', 'high', ['check-edge', 'migration-identity', 'db-smoke', 'security-checks', 'adversarial-review']],
    ['data/profiles/fer/drafts/test.json', 'high', ['verify-claims', 'scored-value-drift', 'projection-freshness', 'conformance', 'adversarial-review']],
    ['scripts/verification/run-gates.mjs', 'high', ['verification-router-tests', 'adversarial-review']],
  ] as const)('produkcijska mapa klasificira %s', async (path, risk, expectedGates) => {
    const modulePath = '../scripts/verification/select-gates.mjs';
    const { validateVerificationMap, selectGates } = await import(/* @vite-ignore */ modulePath);
    const raw = JSON.parse(readFileSync(join(__dirname, '..', 'config', 'verification-map.json'), 'utf8'));
    const selection = selectGates([{ path, sources: ['committed'] }], validateVerificationMap(raw));

    expect(selection.risk).toBe(risk);
    expect(selection.status).toBe('ready');
    expect(selection.gateIds.slice(0, 2)).toEqual(['check', 'orphan-scan']);
    expect(selection.gateIds).toEqual(expect.arrayContaining(expectedGates));
    if (path.startsWith('supabase/')) {
      expect(selection.gates.find((gate: { id: string }) => gate.id === 'check-edge')?.coveredBy).toBe('check');
    }
  });

  it('odbija nepodrzani glob umjesto da ga tiho tumaci', async () => {
    const modulePath = '../scripts/verification/select-gates.mjs';
    const { validateVerificationMap } = await import(/* @vite-ignore */ modulePath);
    const invalid = structuredClone(MINIMAL_MAP);
    invalid.routes[0].patterns = ['src/repair/?.ts'];

    expect(() => validateVerificationMap(invalid)).toThrow(/nepodrzan glob/i);
  });

  it('odbija ciklus u covers odnosima', async () => {
    const modulePath = '../scripts/verification/select-gates.mjs';
    const { validateVerificationMap } = await import(/* @vite-ignore */ modulePath);
    const invalid = structuredClone(MINIMAL_MAP);
    invalid.gates[0].covers = ['orphan-scan'];
    invalid.gates[1].covers = ['check'];

    expect(() => validateVerificationMap(invalid)).toThrow(/ciklus/i);
  });

  it('rename klasificira i staru i novu putanju', async () => {
    const modulePath = '../scripts/verification/detect-change.mjs';
    const modulePromise = import(/* @vite-ignore */ modulePath);
    await expect(modulePromise).resolves.toHaveProperty('parseNameStatusZ');
    const { parseNameStatusZ } = await modulePromise;

    expect(parseNameStatusZ('R100\0src/repair/a.ts\0src/ui/a.ts\0', 'committed')).toEqual([
      { path: 'src/repair/a.ts', sources: ['rename_from'] },
      { path: 'src/ui/a.ts', sources: ['rename_to'] },
    ]);
  });

  it('odbija base koji Git moze protumaciti kao opciju prije prvog poziva', async () => {
    const modulePath = '../scripts/verification/detect-change.mjs';
    const { detectChanges } = await import(/* @vite-ignore */ modulePath);
    let calls = 0;
    const git = () => {
      calls += 1;
      return '';
    };

    expect(() => detectChanges({ repoRoot: 'C:/repo', base: '--help', git })).toThrow(/base ref/i);
    expect(calls).toBe(0);
  });

  it('spaja committed, radno stablo, untracked i obje strane renamea iz stvarnog Gita', async () => {
    const modulePath = '../scripts/verification/detect-change.mjs';
    const { detectChanges } = await import(/* @vite-ignore */ modulePath);
    const repoRoot = mkdtempSync(join(tmpdir(), 'lekta-verification-router-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();

    try {
      git('init');
      git('config', 'user.email', 'router@example.test');
      git('config', 'user.name', 'Verification Router Test');
      mkdirSync(join(repoRoot, 'src', 'repair'), { recursive: true });
      mkdirSync(join(repoRoot, 'docs'), { recursive: true });
      writeFileSync(join(repoRoot, 'src', 'repair', 'a.ts'), 'export const a = 1;\n');
      writeFileSync(join(repoRoot, 'docs', 'base.md'), 'base\n');
      git('add', '--', 'src/repair/a.ts', 'docs/base.md');
      git('commit', '-m', 'base');
      const base = git('rev-parse', 'HEAD');

      mkdirSync(join(repoRoot, 'src', 'ui'), { recursive: true });
      git('mv', 'src/repair/a.ts', 'src/ui/a.ts');
      git('commit', '-m', 'rename');
      writeFileSync(join(repoRoot, 'src', 'ui', 'a.ts'), 'export const a = 2;\n');
      writeFileSync(join(repoRoot, 'docs', 'base.md'), 'staged\n');
      git('add', '--', 'docs/base.md');
      mkdirSync(join(repoRoot, 'new-top'), { recursive: true });
      writeFileSync(join(repoRoot, 'new-top', 'file.ts'), 'untracked\n');

      const detected = detectChanges({ repoRoot, base });

      expect(detected.dirtyWorkingTree).toBe(true);
      expect(detected.changes).toEqual([
        { path: 'docs/base.md', sources: ['staged_or_unstaged'] },
        { path: 'new-top/file.ts', sources: ['untracked'] },
        { path: 'src/repair/a.ts', sources: ['rename_from'] },
        { path: 'src/ui/a.ts', sources: ['rename_to', 'staged_or_unstaged'] },
      ]);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it('nepotvrden manual gate zadrzava zeleni command plan na needs_human', async () => {
    const selectPath = '../scripts/verification/select-gates.mjs';
    const runPath = '../scripts/verification/run-gates.mjs';
    const { validateVerificationMap, selectGates } = await import(/* @vite-ignore */ selectPath);
    const runnerPromise = import(/* @vite-ignore */ runPath);
    await expect(runnerPromise).resolves.toHaveProperty('runSelectedGates');
    const { runSelectedGates } = await runnerPromise;
    const selection = selectGates(
      [{ path: 'src/repair/apply-fixers.ts', sources: ['committed'] }],
      validateVerificationMap(MINIMAL_MAP),
    );

    const result = await runSelectedGates(selection, {
      acknowledgements: [],
      execute: async () => ({ status: 0, durationMs: 1 }),
      executableAvailable: () => true,
      env: {},
      platform: 'win32',
    });

    expect(result.status).toBe('needs_human');
    expect(result.exitCode).toBe(2);
    expect(result.results.find((gate: { id: string }) => gate.id === 'adversarial-review')?.status).toBe('manual_required');
  });

  it('unknown ostaje needs_human i kad netko pokusa potvrditi needs-human gate', async () => {
    const selectPath = '../scripts/verification/select-gates.mjs';
    const runPath = '../scripts/verification/run-gates.mjs';
    const { validateVerificationMap, selectGates } = await import(/* @vite-ignore */ selectPath);
    const { runSelectedGates } = await import(/* @vite-ignore */ runPath);
    const selection = selectGates(
      [{ path: 'potpuno-nova-domena/file.ts', sources: ['untracked'] }],
      validateVerificationMap(MINIMAL_MAP),
    );

    const result = await runSelectedGates(selection, {
      acknowledgements: ['needs-human'],
      execute: async () => ({ status: 0 }),
      executableAvailable: () => true,
      env: {},
      platform: 'win32',
    });

    expect(result.status).toBe('needs_human');
    expect(result.exitCode).toBe(2);
    expect(result.acknowledgementErrors).toEqual(['Gate se ne moze potvrditi: needs-human.']);
    expect(result.results.find((gate: { id: string }) => gate.id === 'needs-human')?.status).toBe('manual_required');
  });

  it('odbija malformirane requirements prije izvrsavanja', async () => {
    const modulePath = '../scripts/verification/select-gates.mjs';
    const { validateVerificationMap } = await import(/* @vite-ignore */ modulePath);
    const invalid = structuredClone(MINIMAL_MAP);
    invalid.gates[0].requirements = { env: 'SUPABASE_ACCESS_TOKEN' };

    expect(() => validateVerificationMap(invalid)).toThrow(/requirements\.env/i);
  });

  it('izvjestaj je strojan, fail-closed i ne zapisuje vrijednosti tajni', async () => {
    const modulePath = '../scripts/verification/report.mjs';
    const reportPromise = import(/* @vite-ignore */ modulePath);
    await expect(reportPromise).resolves.toHaveProperty('buildReport');
    const { buildReport, formatReport } = await reportPromise;

    const report = buildReport({
      detection: {
        baseRef: 'origin/master',
        baseSha: 'base123',
        headSha: 'head456',
        dirtyWorkingTree: true,
        changes: [{ path: 'new-area/file.ts', sources: ['untracked'] }],
      },
      selection: {
        risk: 'unknown',
        status: 'needs_human',
        matchedRoutes: [],
        unknownPaths: ['new-area/file.ts'],
        gates: [{ id: 'needs-human', kind: 'manual', label: 'Ljudska klasifikacija', coveredBy: null }],
      },
      execution: {
        results: [{ id: 'needs-human', status: 'manual_required', durationMs: 0 }],
        acknowledgementErrors: [],
        status: 'needs_human',
        exitCode: 2,
      },
      acknowledgements: [],
      startedAt: '2026-09-18T12:00:00.000Z',
      finishedAt: '2026-09-18T12:00:01.000Z',
      environment: { SUPABASE_ACCESS_TOKEN: 'LEKTA_SECRET_CANARY' },
    });

    expect(report).toMatchObject({ schemaVersion: 1, risk: 'unknown', status: 'needs_human', exitCode: 2 });
    expect(JSON.stringify(report)).not.toContain('LEKTA_SECRET_CANARY');
    expect(formatReport(report)).toContain('UNKNOWN');
    expect(formatReport(report)).toContain('new-area/file.ts');
  });

  it('razrjesava npm i node bez shella ili ponovnog parsiranja argumenata', async () => {
    const modulePath = '../scripts/verification/run-gates.mjs';
    const runnerPromise = import(/* @vite-ignore */ modulePath);
    await expect(runnerPromise).resolves.toHaveProperty('resolveCommand');
    const { resolveCommand } = await runnerPromise;

    expect(resolveCommand(
      { argv: ['npm', 'run', 'check'] },
      { nodePath: 'C:/tools/node.exe', npmExecPath: 'C:/tools/npm-cli.js' },
    )).toEqual({ executable: 'C:/tools/node.exe', args: ['C:/tools/npm-cli.js', 'run', 'check'] });

    expect(resolveCommand(
      { argv: ['node', 'script.mjs', 'value;Remove-Item'] },
      { nodePath: 'C:/tools/node.exe', npmExecPath: 'C:/tools/npm-cli.js' },
    )).toEqual({
      executable: 'C:/tools/node.exe',
      args: ['script.mjs', 'value;Remove-Item'],
    });
  });

  it('nastavlja sve gateove nakon pada i vraca exit 1', async () => {
    const selectPath = '../scripts/verification/select-gates.mjs';
    const runPath = '../scripts/verification/run-gates.mjs';
    const { validateVerificationMap, selectGates } = await import(/* @vite-ignore */ selectPath);
    const { runSelectedGates } = await import(/* @vite-ignore */ runPath);
    const config = validateVerificationMap({
      ...structuredClone(MINIMAL_MAP),
      routes: [{ id: 'docs', patterns: ['docs/**'], risk: 'low', gates: [] }],
    });
    const selection = selectGates([{ path: 'docs/readme.md', sources: ['committed'] }], config);
    const called: string[] = [];

    const result = await runSelectedGates(selection, {
      execute: async (gate: { id: string }) => {
        called.push(gate.id);
        return { status: gate.id === 'check' ? 1 : 0, durationMs: 1 };
      },
      executableAvailable: () => true,
      env: {},
      platform: 'win32',
    });

    expect(called).toEqual(['check', 'orphan-scan']);
    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);
  });

  it('nedostupna obvezna okolina nije prolaz', async () => {
    const selectPath = '../scripts/verification/select-gates.mjs';
    const runPath = '../scripts/verification/run-gates.mjs';
    const { validateVerificationMap, selectGates } = await import(/* @vite-ignore */ selectPath);
    const { runSelectedGates } = await import(/* @vite-ignore */ runPath);
    const raw = structuredClone(MINIMAL_MAP);
    raw.gates.find((gate) => gate.id === 'strict-open').requirements = { env: ['STRICT_OPEN_TOKEN'] };
    const selection = selectGates(
      [{ path: 'src/repair/apply-fixers.ts', sources: ['committed'] }],
      validateVerificationMap(raw),
    );

    const result = await runSelectedGates(selection, {
      acknowledgements: ['adversarial-review'],
      execute: async () => ({ status: 0, durationMs: 1 }),
      executableAvailable: () => true,
      env: {},
      platform: 'win32',
    });

    expect(result.status).toBe('needs_human');
    expect(result.exitCode).toBe(2);
    expect(result.results.find((gate: { id: string }) => gate.id === 'strict-open')).toMatchObject({
      status: 'unavailable',
      reason: 'missing-env:STRICT_OPEN_TOKEN',
    });
  });

  it('dry-run ne izvrsava naredbe i ne predstavlja plan kao prolaz', async () => {
    const selectPath = '../scripts/verification/select-gates.mjs';
    const runPath = '../scripts/verification/run-gates.mjs';
    const { validateVerificationMap, selectGates } = await import(/* @vite-ignore */ selectPath);
    const { runSelectedGates } = await import(/* @vite-ignore */ runPath);
    const selection = selectGates(
      [{ path: 'src/repair/apply-fixers.ts', sources: ['committed'] }],
      validateVerificationMap(MINIMAL_MAP),
    );
    let calls = 0;

    const result = await runSelectedGates(selection, {
      acknowledgements: ['adversarial-review'],
      dryRun: true,
      execute: async () => {
        calls += 1;
        return { status: 0 };
      },
    });

    expect(calls).toBe(0);
    expect(result.status).toBe('needs_human');
    expect(result.exitCode).toBe(2);
    expect(result.results.filter((gate: { status: string }) => gate.status === 'not_run')).toHaveLength(6);
  });

  it('izravni node poziv nalazi npm CLI uz node kad npm_execpath nije postavljen', async () => {
    const modulePath = '../scripts/verification/run-gates.mjs';
    const { resolveCommand } = await import(/* @vite-ignore */ modulePath);
    const expectedNpmCli = join('C:/tools', 'node_modules', 'npm', 'bin', 'npm-cli.js');
    const inspected: string[] = [];

    const command = resolveCommand(
      { id: 'check', argv: ['npm', 'run', 'check'] },
      {
        nodePath: 'C:/tools/node.exe',
        npmExecPath: '',
        pathExists: (path: string) => {
          inspected.push(path);
          return path === expectedNpmCli;
        },
      },
    );

    expect(inspected).toEqual([expectedNpmCli]);
    expect(command).toEqual({
      executable: 'C:/tools/node.exe',
      args: [expectedNpmCli, 'run', 'check'],
    });
  });
});
