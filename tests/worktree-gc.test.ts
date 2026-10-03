// @vitest-environment node
/**
 * `scripts/worktree-gc.mjs` (odluka vlasnika 2026-10-03): uklanjanje worktreeova nakon spajanja.
 *
 * Svi testovi rade nad STVARNIM privremenim git repoom (init, commit, grana, worktree add) i nad
 * privremenim gate lockom (`LEKTA_GATE_LOCK_PATH`). Pravi repo i pravi worktreeovi stroja se ne
 * diraju. `origin/master` je lokalni ref (`update-ref refs/remotes/origin/master`), pa nema mreze.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { judgeWorktree, parseStatusZ, parseWorktreeList } from '../scripts/worktree-gc.mjs';
import { runWorktreeGc } from '../scripts/agents/session-bootstrap.mjs';
import { worktreeGcHint } from '../scripts/gate-preflight.mjs';

const SCRIPT = resolve(process.cwd(), 'scripts/worktree-gc.mjs');
const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000);

function git(cwd: string, ...args: string[]): string {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} u ${cwd}: ${res.stderr}`);
  return res.stdout;
}

/** Postavlja starost worktreea: `.git` datoteka, gitdir HEAD i gitdir index. */
function age(wt: string): void {
  const raw = readFileSync(join(wt, '.git'), 'utf8');
  const gd = (raw.match(/^gitdir:\s*(.+)$/m) ?? [])[1]?.trim() ?? '';
  const gitdir = isAbsolute(gd) ? gd : resolve(wt, gd);
  for (const p of [join(wt, '.git'), join(gitdir, 'HEAD'), join(gitdir, 'index')]) {
    if (existsSync(p)) utimesSync(p, TWO_HOURS_AGO, TWO_HOURS_AGO);
  }
}

interface Fixture {
  root: string;
  main: string;
  lockPath: string;
  linkTarget: string;
  wt: Record<'merged' | 'unmerged' | 'dirty' | 'locked' | 'young' | 'env', string>;
}

function makeFixture(): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lekta-wtgc-')));
  const main = join(root, 'main');
  mkdirSync(main);
  git(main, 'init', '-q', '-b', 'master');
  git(main, 'config', 'user.email', 'test@example.invalid');
  git(main, 'config', 'user.name', 'test');
  git(main, 'config', 'core.autocrlf', 'false');
  writeFileSync(join(main, 'a.txt'), 'a\n');
  writeFileSync(join(main, '.gitignore'), 'node_modules/\n.env\n');
  git(main, 'add', 'a.txt', '.gitignore');
  git(main, 'commit', '-q', '-m', 'pocetak');
  git(main, 'update-ref', 'refs/remotes/origin/master', 'HEAD');

  const wt = {
    merged: join(root, 'wt-merged'),
    unmerged: join(root, 'wt-unmerged'),
    dirty: join(root, 'wt-dirty'),
    locked: join(root, 'wt-locked'),
    young: join(root, 'wt-young'),
    env: join(root, 'wt-env'),
  };
  git(main, 'worktree', 'add', '-q', '-b', 'merged', wt.merged, 'master');
  git(main, 'worktree', 'add', '-q', '-b', 'unmerged', wt.unmerged, 'master');
  writeFileSync(join(wt.unmerged, 'b.txt'), 'b\n');
  git(wt.unmerged, 'add', 'b.txt');
  git(wt.unmerged, 'commit', '-q', '-m', 'nespojeno');
  git(main, 'worktree', 'add', '-q', '--detach', wt.dirty, 'master');
  writeFileSync(join(wt.dirty, 'a.txt'), 'promijenjeno\n');
  git(main, 'worktree', 'add', '-q', '-b', 'locked', wt.locked, 'master');
  git(main, 'worktree', 'add', '-q', '-b', 'young', wt.young, 'master');
  git(main, 'worktree', 'add', '-q', '-b', 'env', wt.env, 'master');
  writeFileSync(join(wt.env, '.env'), 'TAJNA=1\n');

  // Uklonjiv worktree nosi dopusten log i node_modules junction na "glavne" ovisnosti.
  writeFileSync(join(wt.merged, 'gate.log'), 'log\n');
  const linkTarget = join(root, 'shared-node-modules');
  mkdirSync(linkTarget);
  writeFileSync(join(linkTarget, 'sentinel.txt'), 'ovisnosti\n');
  symlinkSync(linkTarget, join(wt.merged, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');

  for (const key of ['merged', 'unmerged', 'dirty', 'locked', 'env'] as const) age(wt[key]);

  const lockPath = join(root, 'gate.lock');
  writeFileSync(lockPath, JSON.stringify({
    pid: process.pid, startedAt: new Date().toISOString(), worktree: wt.locked, label: 'test', token: 't',
  }));
  return { root, main, lockPath, linkTarget, wt };
}

function runGc(fx: Fixture, ...args: string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [SCRIPT, '--repo', fx.main, ...args], {
    cwd: fx.root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
    env: { ...process.env, LEKTA_GATE_LOCK_PATH: fx.lockPath },
  });
}

const fwd = (p: string) => p.replace(/\\/g, '/');
function rowFor(stdout: string, path: string): string {
  const want = fwd(path).toLowerCase();
  return stdout.split(/\r?\n/).find((l) => l.toLowerCase().startsWith(`${want} |`)) ?? '';
}

describe('worktree-gc nad stvarnim privremenim repoom', () => {
  let fx: Fixture;
  beforeAll(() => {
    fx = makeFixture();
  });
  afterAll(() => {
    if (fx) rmSync(fx.root, { recursive: true, force: true });
  });

  it('suhi rad: tablica s razlogom za svako stablo, a popis worktreeova ostaje identican', () => {
    const before = git(fx.main, 'worktree', 'list', '--porcelain');
    const res = runGc(fx);
    expect(res.status, res.stderr).toBe(0);
    expect(rowFor(res.stdout, fx.wt.merged)).toMatch(/\| UKLONJIV$/);
    expect(rowFor(res.stdout, fx.wt.unmerged)).toMatch(/zadrzan: .*HEAD nije spojen u bazu/);
    expect(rowFor(res.stdout, fx.wt.dirty)).toMatch(/zadrzan: .*necommitane promjene \(1\)/);
    expect(rowFor(res.stdout, fx.wt.locked)).toMatch(/zadrzan: .*drzi ga aktivni gate lock/);
    expect(rowFor(res.stdout, fx.wt.young)).toMatch(/zadrzan: .*mladji od 60 min/);
    expect(rowFor(res.stdout, fx.wt.env)).toMatch(/zadrzan: .*ignorirane datoteke: \.env/);
    expect(rowFor(res.stdout, fx.main)).toMatch(/zadrzan: glavno stablo/);
    expect(res.stdout).toMatch(/ukupno uklonjivo: 1 stabala, \d+ MB/);
    expect(git(fx.main, 'worktree', 'list', '--porcelain')).toBe(before);
    expect(existsSync(fx.wt.merged)).toBe(true);
  }, 180_000);

  it('--apply uklanja samo uklonjivo, junction cilj ostaje netaknut; drugi --apply je no-op', () => {
    const first = runGc(fx, '--apply', '--quiet');
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout.trim()).toMatch(/^worktree-gc: uklonjeno 1 \(\d+ MB\), zadrzano 5$/);
    expect(existsSync(fx.wt.merged)).toBe(false);
    expect(readFileSync(join(fx.linkTarget, 'sentinel.txt'), 'utf8')).toBe('ovisnosti\n');
    for (const key of ['unmerged', 'dirty', 'locked', 'young', 'env'] as const) {
      expect(existsSync(fx.wt[key]), key).toBe(true);
    }
    expect(readFileSync(join(fx.wt.dirty, 'a.txt'), 'utf8')).toBe('promijenjeno\n');
    const listAfterFirst = git(fx.main, 'worktree', 'list', '--porcelain');
    expect(listAfterFirst).not.toContain(fwd(fx.wt.merged));

    const second = runGc(fx, '--apply', '--quiet');
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout.trim()).toBe('worktree-gc: uklonjeno 0 (0 MB), zadrzano 5');
    expect(git(fx.main, 'worktree', 'list', '--porcelain')).toBe(listAfterFirst);
  }, 240_000);

  it('djelomican pad gita (ostecen index jednog stabla) daje exit 1, ne tihu nulu', () => {
    const raw = readFileSync(join(fx.wt.young, '.git'), 'utf8');
    const gd = (raw.match(/^gitdir:\s*(.+)$/m) ?? [])[1]?.trim() ?? '';
    const index = join(isAbsolute(gd) ? gd : resolve(fx.wt.young, gd), 'index');
    const saved = readFileSync(index);
    writeFileSync(index, 'nije index');
    try {
      const before = git(fx.main, 'worktree', 'list', '--porcelain');
      const res = runGc(fx, '--apply', '--quiet');
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/worktree-gc: PAD mjerenja/);
      expect(git(fx.main, 'worktree', 'list', '--porcelain')).toBe(before);
    } finally {
      writeFileSync(index, saved);
    }
  }, 120_000);

  it('nedostajuca baza (origin/master) daje exit 1', () => {
    const res = runGc(fx, '--base', 'refs/remotes/origin/nepostojeca');
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/PAD mjerenja/);
  }, 120_000);
});

describe('worktree-gc: ciste funkcije', () => {
  const clean = { tracked: [] as string[], untracked: [] as string[], ignored: [] as string[] };
  const base = {
    main: false, bare: false, locked: false, prunable: false, current: false, ancestor: true,
    status: clean, lockHeld: false, processPids: [] as number[], newestMtimeMs: 0,
  };
  const now = { nowMs: 10 * 60 * 60 * 1000 };

  it('BASELINE: spojeno, cisto, staro, bez locka i procesa je uklonjivo', () => {
    expect(judgeWorktree(base, now)).toEqual({ removable: true, reasons: [] });
  });

  it('svaki uvjet zasebno zadrzava stablo', () => {
    expect(judgeWorktree({ ...base, ancestor: false }, now).removable).toBe(false);
    expect(judgeWorktree({ ...base, status: { ...clean, tracked: ['a.txt'] } }, now).removable).toBe(false);
    expect(judgeWorktree({ ...base, status: { ...clean, untracked: ['novi.ts'] } }, now).removable).toBe(false);
    expect(judgeWorktree({ ...base, status: { ...clean, untracked: ['logs/'] } }, now).removable).toBe(false);
    expect(judgeWorktree({ ...base, status: { ...clean, untracked: ['gate.log', 'x.log', '.gate-lock'] } }, now).removable).toBe(true);
    expect(judgeWorktree({ ...base, status: { ...clean, ignored: ['.env'] } }, now).removable).toBe(false);
    expect(judgeWorktree({ ...base, status: { ...clean, ignored: ['node_modules/', 'dist/'] } }, now).removable).toBe(true);
    expect(judgeWorktree({ ...base, lockHeld: true }, now).removable).toBe(false);
    expect(judgeWorktree({ ...base, lockHeld: null }, now).removable).toBe(false);
    expect(judgeWorktree({ ...base, processPids: [42] }, now).removable).toBe(false);
    expect(judgeWorktree({ ...base, processPids: null }, now).removable).toBe(false);
    expect(judgeWorktree({ ...base, locked: true }, now).removable).toBe(false);
    expect(judgeWorktree({ ...base, current: true }, now).removable).toBe(false);
    expect(judgeWorktree({ ...base, newestMtimeMs: now.nowMs - 59 * 60 * 1000 }, now).removable).toBe(false);
    expect(judgeWorktree({ ...base, newestMtimeMs: null }, now).removable).toBe(false);
    expect(judgeWorktree({ ...base, status: null }, now).removable).toBe(false);
    expect(judgeWorktree({ ...base, main: true }, now).removable).toBe(false);
  });

  it('parsira porcelain popis i status s preimenovanjem', () => {
    const list = parseWorktreeList('worktree C:/a\nHEAD 1111\nbranch refs/heads/master\n\nworktree C:/b\nHEAD 2222\ndetached\nlocked razlog\n');
    expect(list.map((w) => [w.path, w.branch, w.detached, w.locked])).toEqual([
      ['C:/a', 'master', false, false],
      ['C:/b', null, true, true],
    ]);
    expect(parseStatusZ('R  novo.ts\0staro.ts\0?? gate.log\0!! node_modules/\0')).toEqual({
      tracked: ['novo.ts'], untracked: ['gate.log'], ignored: ['node_modules/'],
    });
  });
});

describe('integracija je fail-open', () => {
  it('SessionStart: nedostajuca skripta, pad i iznimka daju jedan citljiv redak, nikad bacanje', () => {
    const empty = mkdtempSync(join(tmpdir(), 'lekta-wtgc-boot-'));
    try {
      expect(runWorktreeGc({ root: empty })).toBe('worktree-gc: preskoceno (skripta ne postoji)');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
    const root = process.cwd();
    const fail = (() => ({ status: 1, stdout: '', stderr: 'worktree-gc: PAD mjerenja (exit 1): x\n' })) as unknown as typeof spawnSync;
    expect(runWorktreeGc({ root, spawn: fail })).toMatch(/^worktree-gc: nije uspjelo \(worktree-gc: PAD mjerenja.*start sesije se nastavlja$/);
    const boom = (() => { throw new Error('nema node'); }) as unknown as typeof spawnSync;
    expect(runWorktreeGc({ root, spawn: boom })).toMatch(/^worktree-gc: nije uspjelo \(nema node\)/);
    const ok = (() => ({ status: 0, stdout: 'worktree-gc: uklonjeno 2 (700 MB), zadrzano 3\n', stderr: '' })) as unknown as typeof spawnSync;
    expect(runWorktreeGc({ root, spawn: ok })).toBe('worktree-gc: uklonjeno 2 (700 MB), zadrzano 3');
  });

  it('bootstrap zove worktree-gc samo uz zastavicu hooka; settings.json je jedini koji je daje', () => {
    const src = readFileSync(resolve(process.cwd(), 'scripts/agents/session-bootstrap.mjs'), 'utf8').replace(/\r\n/g, '\n');
    expect(src).toMatch(/if \(process\.argv\.includes\('--worktree-gc'\)\) \{\n(?:\s*\/\/[^\n]*\n)*\s*console\.log\(runWorktreeGc\(\{ root \}\)\);/);
    expect(src.match(/runWorktreeGc\(\{ root \}\)/g)).toHaveLength(1);
    const settings = JSON.parse(readFileSync(resolve(process.cwd(), '.claude/settings.json'), 'utf8')) as {
      hooks: { SessionStart: Array<{ hooks: Array<{ command: string }> }> };
    };
    const commands = settings.hooks.SessionStart.flatMap((e) => e.hooks.map((h) => h.command));
    expect(commands).toEqual(['node scripts/agents/session-bootstrap.mjs --worktree-gc']);
  });

  it('gate preflight: redak s brojem uklonjivih i naredbom; pad mjerenja ne rusi poruku', () => {
    const root = process.cwd();
    const ok = (() => ({ status: 0, stdout: '{"removable":3,"removableMb":1050,"kept":4}\n', stderr: '' })) as unknown as typeof spawnSync;
    expect(worktreeGcHint({ root, spawn: ok })).toBe('uklonjivih worktreeova: 3 (1050 MB); oslobodi: node scripts/worktree-gc.mjs --apply');
    const fail = (() => ({ status: 1, stdout: '', stderr: 'x' })) as unknown as typeof spawnSync;
    expect(worktreeGcHint({ root, spawn: fail })).toMatch(/nisu izmjereni; .*node scripts\/worktree-gc\.mjs --apply$/);
    let calls = 0;
    const counted = ((...args: Parameters<typeof spawnSync>) => { calls += 1; return (ok as (...a: unknown[]) => unknown)(...args); }) as unknown as typeof spawnSync;
    expect(worktreeGcHint({ root, injected: true, spawn: counted })).toMatch(/nisu izmjereni/);
    expect(calls).toBe(0);
  });
});
