// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BLOCK_MESSAGE, judgeCpuDiscipline, packageScriptReader, splitCommand } from '../scripts/hooks/cpu-discipline.mjs';
import { MAX_BLOCKS, counterPath, decideStop, openItems } from '../scripts/hooks/implementer-stop.mjs';
import { formatSessionRules } from '../scripts/agents/session-bootstrap.mjs';
import { matcherCovers, missingHookRegistrations, sessionRulesProblems } from './helpers/hook-discipline';

// Stvarne definicije skripti iz package.json: `npm run check` vec ide kroz with-gate-lock, `build` ne.
const readScript = packageScriptReader(resolve('.'));
const judge = (command: string, env: Record<string, string> = {}) => judgeCpuDiscipline(command, { env, readScript });

// Okolina djeteta bez tokena i bez CI oznake, da odbijanje bude mjerljivo i na GitHub Actionsu.
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const k of ['GITHUB_ACTIONS', 'LEKTA_GATE_LOCK_TOKEN', 'LEKTA_ROLE', 'LEKTA_CHECKLIST', 'LEKTA_TASK_ID', 'LEKTA_SCOPE_ENFORCED']) {
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

  it('T109: tijelo heredoca pod navodnicima je stdin, ne naredba', () => {
    // Stvarni lazni pad 2026-10-08: python3 heredoc s JSON tekstom koji spominje gate i closed-loop.
    const heredoc = "python3 - <<'PYEOF'\nnpm run build\ntests/repair-closed-loop.test.ts samo u test:slow\nPYEOF";
    expect(judge(heredoc)).toMatchObject({ allow: true });
    expect(judge('cat <<EOF\nnpx vitest run\nEOF')).toMatchObject({ allow: true });
    expect(judge('cat <<-EOF\n\tvitest\n\tEOF')).toMatchObject({ allow: true });
    expect(judge('cat <<< "npx vitest"')).toMatchObject({ allow: true });
  });

  it('T109: naredba iza heredoca i supstitucija u tijelu bez navodnika i dalje se odbijaju', () => {
    expect(judge("cat <<'X'\nhi\nX\nnpx vitest run")).toMatchObject({ allow: false });
    expect(judge('cat <<EOF\n$(npx vitest run)\nEOF')).toMatchObject({ allow: false });
    expect(judge('cat <<EOF\n`tsc --noEmit`\nEOF')).toMatchObject({ allow: false });
    expect(judge("cat <<A <<'B'\n$(tsc)\nA\nvitest\nB")).toMatchObject({ allow: false });
    expect(judge('cat <<-EOF\n\tvitest\n\tEOF\ntsc --noEmit')).toMatchObject({ allow: false });
  });

  it('proces: 7 ubrizganih ulaza, izlazni kod 0 ili 2 i poruka za model', () => {
    const cases: Array<[unknown, NodeJS.ProcessEnv, number]> = [
      [{ tool_name: 'Bash', tool_input: { command: 'npx vitest run' } }, cleanEnv(), 2],
      [{ tool_name: 'Bash', tool_input: { command: 'npm run build' } }, cleanEnv(), 2],
      [{ tool_name: 'Bash', tool_input: { command: 'node scripts/with-gate-lock.mjs t -- npx vitest run' } }, cleanEnv(), 0],
      [{ tool_name: 'Bash', tool_input: { command: 'npx vitest run' } }, cleanEnv({ LEKTA_GATE_LOCK_TOKEN: 'ugnijezdjeno' }), 0],
      [{ tool_name: 'Bash', tool_input: { command: 'git status' } }, cleanEnv(), 0],
      ['nije json', cleanEnv(), 0],
      [{ tool_name: 'Bash', tool_input: { command: "python3 - <<'X'\nnpx vitest run\nX" } }, cleanEnv(), 0],
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
  it('svi ocekivani hookovi su registrirani, tool-guard i za Supabase MCP apply_migration', () => {
    const settings = JSON.parse(readFileSync(resolve('.claude/settings.json'), 'utf8'));
    expect(missingHookRegistrations(settings)).toEqual([]);
  });

  it('tool-guard za MCP apply_migration blokira i kad je sesija u poddirektoriju (izravni signal)', () => {
    const settings = JSON.parse(readFileSync(resolve('.claude/settings.json'), 'utf8')) as {
      hooks: { PreToolUse: Array<{ matcher?: string; hooks?: Array<{ command?: string }> }> };
    };
    const entry = settings.hooks.PreToolUse.find((e) => matcherCovers(String(e.matcher ?? ''), 'mcp__supabase__apply_migration'));
    const command = entry?.hooks?.[0]?.command ?? '';
    expect(command).toContain('tool-guard.mjs');
    const ulaz = JSON.stringify({ tool_name: 'mcp__supabase__apply_migration', tool_input: { name: 'x', query: 'select 1' } });
    const env = { ...process.env, CLAUDE_PROJECT_DIR: process.cwd() };
    const poddir = resolve('supabase');
    const sidreno = spawnSync('sh', ['-c', command], { cwd: poddir, input: ulaz, env, encoding: 'utf8', timeout: 30_000 });
    expect(sidreno.status).toBe(2);
    expect(sidreno.stderr).toContain('apply_migration');
    // Kontrola: stara relativna naredba iz istog poddirektorija ne nalazi skriptu i ne blokira (exit 1, ne 2).
    const relativno = spawnSync('sh', ['-c', 'node scripts/agents/tool-guard.mjs'], { cwd: poddir, input: ulaz, env, encoding: 'utf8', timeout: 30_000 });
    expect(relativno.status).not.toBe(2);
  });

  it('matcher po semantici Claude Code: popis tocnih imena ili regex', () => {
    expect(matcherCovers('Bash|PowerShell', 'Bash')).toBe(true);
    expect(matcherCovers('Bash|PowerShell', 'mcp__Supabase__apply_migration')).toBe(false);
    expect(matcherCovers('mcp__.*__apply_migration', 'mcp__claude_ai_Supabase__apply_migration')).toBe(true);
    expect(matcherCovers('mcp__.*__apply_migration', 'mcp__supabase__apply_migration')).toBe(true);
    expect(matcherCovers('mcp__.*__apply_migration', 'mcp__Supabase__list_tables')).toBe(false);
    // Stari matcher iz prve verzije PR-a #326 nije vidio lokalno ime servera malim slovima.
    expect(matcherCovers('mcp__.*Supabase.*__apply_migration', 'mcp__supabase__apply_migration')).toBe(false);
  });
});
