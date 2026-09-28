// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BLOCK_MESSAGE, judgeCpuDiscipline, packageScriptReader, splitCommand } from '../scripts/hooks/cpu-discipline.mjs';
import { MAX_BLOCKS, counterPath, decideStop, openItems } from '../scripts/hooks/implementer-stop.mjs';
import { formatSessionRules } from '../scripts/agents/session-bootstrap.mjs';
import { missingHookRegistrations, sessionRulesProblems } from './helpers/hook-discipline';

// Stvarne definicije skripti iz package.json: `npm run check` vec ide kroz with-gate-lock, `build` ne.
const readScript = packageScriptReader(resolve('.'));
const judge = (command: string, env: Record<string, string> = {}) => judgeCpuDiscipline(command, { env, readScript });

// Okolina djeteta bez tokena i bez CI oznake, da odbijanje bude mjerljivo i na GitHub Actionsu.
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const k of ['GITHUB_ACTIONS', 'LEKTA_GATE_LOCK_TOKEN', 'LEKTA_ROLE', 'LEKTA_CHECKLIST']) {
    if (!(k in extra)) delete env[k];
  }
  return env;
}

function runHook(script: string, input: unknown, env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [resolve(script)], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env,
    cwd: resolve('.'),
    timeout: 10_000,
  });
}

describe('A1 cpu-discipline: tezak posao samo kroz with-gate-lock', () => {
  it('odbija tezak posao izvan locka', () => {
    for (const cmd of [
      'npx vitest run tests/foo.test.ts',
      'npx tsc --noEmit',
      'cd /repo && npx playwright test',
      'npm run build',
      'npm test',
      'FOO=1 vite-node scripts/run-closed-loop.mts',
      'npm run closed-loop',
      'node node_modules/.bin/vitest run',
      'git status; npx knip',
      'echo x | npx jscpd src',
    ]) {
      expect(judge(cmd), cmd).toMatchObject({ allow: false });
    }
  });

  it('propusta sto nije tezak posao ili je vec pod lockom', () => {
    for (const cmd of [
      'git status',
      'grep -rn vitest tests',
      'cat tsconfig.json',
      'git log --grep playwright',
      'node scripts/with-gate-lock.mjs ciljano -- npx vitest run tests/foo.test.ts',
      'node scripts/with-gate-lock.mjs sve -- "npx vitest run && npx tsc --noEmit"',
      'npm run check',
      'npm run test:ux',
      'npm run orphan-scan',
      'npm ci',
    ]) {
      expect(judge(cmd), cmd).toMatchObject({ allow: true });
    }
  });

  it('with-gate-lock stiti samo svoju podnaredbu, ne cijeli lanac', () => {
    expect(judge('node scripts/with-gate-lock.mjs x -- echo ok && npx vitest run')).toMatchObject({ allow: false });
  });

  it('dijete zauzetog gatea (token) i CI prolaze', () => {
    expect(judge('npx vitest run', { LEKTA_GATE_LOCK_TOKEN: 'abc' })).toMatchObject({ allow: true });
    expect(judge('npx vitest run', { GITHUB_ACTIONS: 'true' })).toMatchObject({ allow: true });
  });

  it('navodnici su argument, ne naredba', () => {
    expect(splitCommand('git commit -m "npx vitest && tsc" --only a.ts')).toEqual([
      ['git', 'commit', '-m', 'npx vitest && tsc', '--only', 'a.ts'],
    ]);
  });

  it('proces: 6 ubrizganih ulaza, izlazni kod 0 ili 2 i poruka za model', () => {
    const cases: Array<[unknown, NodeJS.ProcessEnv, number]> = [
      [{ tool_name: 'Bash', tool_input: { command: 'npx vitest run' } }, cleanEnv(), 2],
      [{ tool_name: 'Bash', tool_input: { command: 'npm run build' } }, cleanEnv(), 2],
      [{ tool_name: 'Bash', tool_input: { command: 'node scripts/with-gate-lock.mjs t -- npx vitest run' } }, cleanEnv(), 0],
      [{ tool_name: 'Bash', tool_input: { command: 'npx vitest run' } }, cleanEnv({ LEKTA_GATE_LOCK_TOKEN: 'ugnijezdjeno' }), 0],
      [{ tool_name: 'Bash', tool_input: { command: 'git status' } }, cleanEnv(), 0],
      ['nije json', cleanEnv(), 0],
    ];
    for (const [input, env, code] of cases) {
      const r = runHook('scripts/hooks/cpu-discipline.mjs', input, env);
      expect(r.status, JSON.stringify(input)).toBe(code);
      if (code === 2) expect(r.stderr).toContain(BLOCK_MESSAGE);
    }
  });
});

describe('A2 pravila na pocetku sesije', () => {
  it('najvise 8 redaka: CPU pravilo, granice stroja, relayed poruke', () => {
    expect(sessionRulesProblems(formatSessionRules())).toEqual([]);
  });

  it('bootstrap ih ispisuje ispod stanja stabla (jedan SessionStart hook, ne dva)', () => {
    const r = spawnSync(process.execPath, [resolve('scripts/agents/session-bootstrap.mjs')], {
      encoding: 'utf8', cwd: resolve('.'), timeout: 20_000,
    });
    const out = r.stdout.replace(/\r/g, '');
    for (const line of formatSessionRules()) expect(out).toContain(line);
  });
});

describe('A3 implementer-stop', () => {
  const env = { LEKTA_ROLE: 'implementer', LEKTA_CHECKLIST: '/x/checklist.md' };
  const checklist = '# T99\n- [x] gotovo\n- [ ] testovi\n- [ ] PR otvoren\n';

  it('otvorene stavke blokiraju s popisom', () => {
    const d = decideStop({ env, sessionId: 's', readFile: () => checklist });
    expect(d).toEqual({ block: true, reason: 'Otvoreno: testovi; PR otvoren. Nastavi; ako je blokirano, napisi BLOKIRANO: razlog.' });
    expect(openItems('- [ ] a\r\n* [ ] b\n- [x] c')).toEqual(['a', 'b']);
  });

  it('pusta: bez uloge, bez checkliste, zatvoren checklist, BLOKIRANO, nakon 2 blokade, necitljiva datoteka', () => {
    expect(decideStop({ env: {}, readFile: () => checklist }).block).toBe(false);
    expect(decideStop({ env: { LEKTA_ROLE: 'implementer' }, readFile: () => checklist }).block).toBe(false);
    expect(decideStop({ env, readFile: () => '- [x] sve' }).block).toBe(false);
    expect(decideStop({ env, readFile: () => `${checklist}BLOKIRANO: ceka vlasnika\n` }).block).toBe(false);
    expect(decideStop({ env, blocksSoFar: MAX_BLOCKS, readFile: () => checklist }).block).toBe(false);
    expect(decideStop({ env, readFile: () => { throw new Error('nema'); } }).block).toBe(false);
  });

  it('brojac ne izlazi iz tmpdira ni s cudnim session_id', () => {
    expect(counterPath('../../etc/passwd', '/tmp')).toBe(join('/tmp', 'lekta-stop-______etc_passwd'));
  });

  it('proces: blokira najvise 2 puta po sesiji, bez uloge je no-op', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lekta-stop-test-'));
    const list = join(dir, 'checklist.md');
    writeFileSync(list, checklist);
    const sessionId = `test-${process.pid}-${Date.now()}`;
    const counter = counterPath(sessionId);
    try {
      const roleEnv = cleanEnv({ LEKTA_ROLE: 'implementer', LEKTA_CHECKLIST: list });
      const outputs = [1, 2, 3].map(() => runHook('scripts/hooks/implementer-stop.mjs', { session_id: sessionId, stop_hook_active: false }, roleEnv));
      expect(outputs.map((o) => o.status)).toEqual([0, 0, 0]);
      expect(JSON.parse(outputs[0].stdout)).toMatchObject({ decision: 'block' });
      expect(JSON.parse(outputs[1].stdout)).toMatchObject({ decision: 'block' });
      expect(outputs[2].stdout.trim()).toBe('');
      const noRole = runHook('scripts/hooks/implementer-stop.mjs', { session_id: `${sessionId}-b` }, cleanEnv());
      expect(noRole.status).toBe(0);
      expect(noRole.stdout.trim()).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      if (existsSync(counter)) rmSync(counter, { force: true });
    }
  });
});

describe('registracija u repo .claude/settings.json', () => {
  it('sva tri hooka su registrirana, uz postojeci tool-guard', () => {
    const settings = JSON.parse(readFileSync(resolve('.claude/settings.json'), 'utf8'));
    expect(missingHookRegistrations(settings)).toEqual([]);
    expect(JSON.stringify(settings)).toContain('scripts/agents/tool-guard.mjs');
  });
});
