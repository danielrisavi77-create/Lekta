// @vitest-environment node
/**
 * `scripts/worktree-gc.mjs` (odluka vlasnika 2026-10-03): uklanjanje worktreeova nakon spajanja.
 *
 * Svi testovi rade nad STVARNIM privremenim git repoom (init, commit, grana, worktree add), s
 * lokalnim bare repoom kao `origin` (fetch radi bez mreze) i s privremenim gate lockom, GC lockom i
 * mapom za odlozene datoteke. Pravi repo i pravi worktreeovi stroja se ne diraju.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import {
  isAllowedIgnored, isAllowedUntracked, judgeWorktree, parseReflogShas, parseStatusZ, parseWorktreeList,
} from '../scripts/worktree-gc.mjs';
import { lastLogLine, runWorktreeGc } from '../scripts/agents/session-bootstrap.mjs';
import { worktreeGcHint } from '../scripts/gate-preflight.mjs';

const SCRIPT = resolve(process.cwd(), 'scripts/worktree-gc.mjs');
const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000);
const LINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir';

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

const KEYS = [
  'merged', 'unmerged', 'dirty', 'locked', 'young', 'env', 'dist', 'srclog', 'hiddenlink', 'reflog', 'nmother',
] as const;
type Key = typeof KEYS[number];

interface Fixture {
  root: string;
  main: string;
  origin: string;
  lockPath: string;
  gcLockPath: string;
  stash: string;
  mainNodeModules: string;
  wt: Record<Key, string>;
}

function makeFixture(): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lekta-wtgc-')));
  const main = join(root, 'main');
  const origin = join(root, 'origin.git');
  mkdirSync(main);
  git(root, 'init', '-q', '--bare', origin);
  git(main, 'init', '-q', '-b', 'master');
  git(main, 'config', 'user.email', 'test@example.invalid');
  git(main, 'config', 'user.name', 'test');
  git(main, 'config', 'core.autocrlf', 'false');
  mkdirSync(join(main, 'src'));
  writeFileSync(join(main, 'a.txt'), 'a\n');
  writeFileSync(join(main, 'src', 'x.txt'), 'x\n');
  writeFileSync(join(main, '.gitignore'), 'node_modules/\n.env\ndist/\n.tmp-*\n');
  git(main, 'add', 'a.txt', 'src/x.txt', '.gitignore');
  git(main, 'commit', '-q', '-m', 'pocetak');
  git(main, 'remote', 'add', 'origin', origin);
  git(main, 'push', '-q', 'origin', 'master');
  git(main, 'fetch', '-q', 'origin');

  // "Glavne" ovisnosti: jedini dopusten cilj `node_modules` linka.
  const mainNodeModules = join(main, 'node_modules');
  mkdirSync(mainNodeModules);
  writeFileSync(join(mainNodeModules, 'sentinel.txt'), 'ovisnosti\n');

  const wt = Object.fromEntries(KEYS.map((k) => [k, join(root, `wt-${k}`)])) as Record<Key, string>;
  for (const k of KEYS) {
    if (k === 'dirty' || k === 'reflog') git(main, 'worktree', 'add', '-q', '--detach', wt[k], 'master');
    else git(main, 'worktree', 'add', '-q', '-b', k, wt[k], 'master');
  }
  // Uklonjiv: dopusten gate.log u korijenu i node_modules junction na glavni repo.
  writeFileSync(join(wt.merged, 'gate.log'), 'log\n');
  symlinkSync(mainNodeModules, join(wt.merged, 'node_modules'), LINK_TYPE);

  writeFileSync(join(wt.unmerged, 'b.txt'), 'b\n');
  git(wt.unmerged, 'add', 'b.txt');
  git(wt.unmerged, 'commit', '-q', '-m', 'nespojeno');
  writeFileSync(join(wt.dirty, 'a.txt'), 'promijenjeno\n');
  writeFileSync(join(wt.env, '.env'), 'TAJNA=1\n');
  // B1: ignorirana mapa s dokumentom; ime mape ne dokazuje da je sadrzaj potrosan.
  mkdirSync(join(wt.dist, 'dist'));
  writeFileSync(join(wt.dist, 'dist', 'rad.docx'), 'dokument\n');
  // B2: nepracen *.log u pracenom direktoriju je biljeska, ne izlaz gatea.
  writeFileSync(join(wt.srclog, 'src', 'progress.log'), 'biljeske\n');
  // M6: junction skriven u dopustenoj ignoriranoj mapi.
  mkdirSync(join(wt.hiddenlink, '.tmp-cache'));
  symlinkSync(mainNodeModules, join(wt.hiddenlink, '.tmp-cache', 'shared'), LINK_TYPE);
  // M3: lokalni commit u odvojenom stablu, pa HEAD natrag na master; commit zivi samo u reflogu.
  writeFileSync(join(wt.reflog, 'c.txt'), 'c\n');
  git(wt.reflog, 'add', 'c.txt');
  git(wt.reflog, 'commit', '-q', '-m', 'samo u reflogu');
  git(wt.reflog, 'checkout', '-q', '--detach', 'master');
  // node_modules junction na tudji cilj nije dopusten.
  const otherTarget = join(root, 'tudje-ovisnosti');
  mkdirSync(otherTarget);
  symlinkSync(otherTarget, join(wt.nmother, 'node_modules'), LINK_TYPE);

  for (const k of KEYS) if (k !== 'young') age(wt[k]);

  const lockPath = join(root, 'gate.lock');
  writeFileSync(lockPath, JSON.stringify({
    pid: process.pid, startedAt: new Date().toISOString(), worktree: wt.locked, label: 'test', token: 't',
  }));
  return {
    root, main, origin, lockPath, gcLockPath: join(root, 'gc.lock'), stash: join(root, 'odlozeno'), mainNodeModules, wt,
  };
}

function runGc(fx: Fixture, args: string[], env: Record<string, string> = {}): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [SCRIPT, '--repo', fx.main, ...args], {
    cwd: fx.root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
    env: {
      ...process.env,
      LEKTA_GATE_LOCK_PATH: fx.lockPath,
      LEKTA_WORKTREE_GC_LOCK_PATH: fx.gcLockPath,
      LEKTA_WORKTREE_GC_STASH: fx.stash,
      ...env,
    },
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
    const res = runGc(fx, []);
    expect(res.status, res.stderr).toBe(0);
    expect(rowFor(res.stdout, fx.wt.merged)).toMatch(/\| UKLONJIV$/);
    expect(rowFor(res.stdout, fx.wt.unmerged)).toMatch(/zadrzan: .*HEAD nije spojen u bazu/);
    expect(rowFor(res.stdout, fx.wt.dirty)).toMatch(/zadrzan: .*necommitane promjene \(1\)/);
    expect(rowFor(res.stdout, fx.wt.locked)).toMatch(/zadrzan: .*drzi ga aktivni gate lock/);
    expect(rowFor(res.stdout, fx.wt.young)).toMatch(/zadrzan: .*mladji od 60 min/);
    expect(rowFor(res.stdout, fx.wt.env)).toMatch(/zadrzan: .*ignorirane datoteke: \.env/);
    expect(rowFor(res.stdout, fx.wt.dist)).toMatch(/zadrzan: .*ignorirane datoteke: dist\//);
    expect(rowFor(res.stdout, fx.wt.srclog)).toMatch(/zadrzan: .*neprac\. datoteke: src\/progress\.log/);
    expect(rowFor(res.stdout, fx.wt.hiddenlink)).toMatch(/zadrzan: .*junction ili symlink u stablu: \.tmp-cache\/shared/);
    expect(rowFor(res.stdout, fx.wt.reflog)).toMatch(/zadrzan: .*lokalni commiti samo u reflogu \(1\)/);
    expect(rowFor(res.stdout, fx.wt.nmother)).toMatch(/zadrzan: .*((ignorirane|neprac\.) datoteke|junction ili symlink u stablu): node_modules/);
    expect(rowFor(res.stdout, fx.main)).toMatch(/zadrzan: glavno stablo/);
    expect(res.stdout).toMatch(/ukupno uklonjivo: 1 stabala, \d+ MB$/m);
    expect(git(fx.main, 'worktree', 'list', '--porcelain')).toBe(before);
    expect(existsSync(fx.wt.merged)).toBe(true);
  }, 180_000);

  it('M1: svjez nerazumljiv gate lock (presuda lockStatus: ziv) zadrzava SVA stabla', () => {
    const corrupt = join(fx.root, 'corrupt.lock');
    writeFileSync(corrupt, '{"pid": 12');
    const res = runGc(fx, [], { LEKTA_GATE_LOCK_PATH: corrupt });
    expect(res.status, res.stderr).toBe(0);
    expect(rowFor(res.stdout, fx.wt.merged)).toMatch(/zadrzan: .*aktivan gate lock bez citljive putanje stabla/);
    expect(res.stdout).toMatch(/ukupno uklonjivo: 0 stabala/);
  }, 180_000);

  it('M4: origin nedostupan zadrzava sva stabla i ne brise nista ni uz --apply', () => {
    const before = git(fx.main, 'worktree', 'list', '--porcelain');
    git(fx.main, 'remote', 'set-url', 'origin', join(fx.root, 'nema-origina.git'));
    try {
      const dry = runGc(fx, []);
      expect(dry.status, dry.stderr).toBe(0);
      expect(rowFor(dry.stdout, fx.wt.merged)).toMatch(/zadrzan: origin nedostupan/);
      expect(dry.stdout).toMatch(/ukupno uklonjivo: 0 stabala, 0 MB; origin nedostupan, nista se ne uklanja/);
      const apply = runGc(fx, ['--apply', '--quiet']);
      expect(apply.status, apply.stderr).toBe(0);
      expect(apply.stdout.trim()).toBe('worktree-gc: uklonjeno 0 (0 MB), zadrzano 11; origin nedostupan, nista se ne uklanja');
      expect(git(fx.main, 'worktree', 'list', '--porcelain')).toBe(before);
    } finally {
      git(fx.main, 'remote', 'set-url', 'origin', fx.origin);
    }
  }, 180_000);

  it('M2: zauzet GC lock (drugi GC radi) znaci da --apply ne uklanja nista', () => {
    const before = git(fx.main, 'worktree', 'list', '--porcelain');
    writeFileSync(fx.gcLockPath, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), label: 'worktree-gc', token: 'x' }));
    try {
      const res = runGc(fx, ['--apply', '--quiet']);
      expect(res.status, res.stderr).toBe(0);
      expect(res.stdout.trim()).toBe(`worktree-gc: preskoceno (drugi worktree-gc radi (PID ${process.pid})), uklonjeno 0, zadrzano 11`);
      expect(git(fx.main, 'worktree', 'list', '--porcelain')).toBe(before);
    } finally {
      rmSync(fx.gcLockPath, { force: true });
    }
  }, 180_000);

  it('--apply uklanja samo uklonjivo, nista ne brise rucno, junction cilj ostaje; drugi --apply je no-op', () => {
    const first = runGc(fx, ['--apply', '--quiet']);
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout.trim()).toMatch(/^worktree-gc: uklonjeno 1 \(\d+ MB\), zadrzano 10$/);
    expect(existsSync(fx.wt.merged)).toBe(false);
    expect(existsSync(fx.gcLockPath)).toBe(false);
    expect(readFileSync(join(fx.mainNodeModules, 'sentinel.txt'), 'utf8')).toBe('ovisnosti\n');
    // gate.log je odlozen, ne obrisan.
    const stashed = readdirSync(fx.stash);
    expect(stashed).toHaveLength(1);
    expect(readFileSync(join(fx.stash, stashed[0]!, 'gate.log'), 'utf8')).toBe('log\n');
    for (const key of KEYS.filter((k) => k !== 'merged')) expect(existsSync(fx.wt[key]), key).toBe(true);
    expect(readFileSync(join(fx.wt.dirty, 'a.txt'), 'utf8')).toBe('promijenjeno\n');
    expect(readFileSync(join(fx.wt.dist, 'dist', 'rad.docx'), 'utf8')).toBe('dokument\n');
    expect(readFileSync(join(fx.wt.srclog, 'src', 'progress.log'), 'utf8')).toBe('biljeske\n');
    expect(readFileSync(join(fx.wt.hiddenlink, '.tmp-cache', 'shared', 'sentinel.txt'), 'utf8')).toBe('ovisnosti\n');
    const listAfterFirst = git(fx.main, 'worktree', 'list', '--porcelain');
    expect(listAfterFirst).not.toContain(fwd(fx.wt.merged));

    const second = runGc(fx, ['--apply', '--quiet']);
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout.trim()).toBe('worktree-gc: uklonjeno 0 (0 MB), zadrzano 10');
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
      const res = runGc(fx, ['--apply', '--quiet']);
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/worktree-gc: PAD mjerenja/);
      expect(git(fx.main, 'worktree', 'list', '--porcelain')).toBe(before);
    } finally {
      writeFileSync(index, saved);
    }
  }, 120_000);

  it('nedostajuca baza daje exit 1', () => {
    const res = runGc(fx, ['--base', 'refs/remotes/origin/nepostojeca']);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/PAD mjerenja/);
  }, 120_000);
});

describe('worktree-gc: ciste funkcije', () => {
  const clean = { tracked: [] as string[], untracked: [] as string[], ignored: [] as string[] };
  const base = {
    main: false, bare: false, locked: false, prunable: false, current: false, originFresh: true, ancestor: true,
    unreachableCommits: 0, status: clean, mainNodeModulesLink: false, foreignLinks: [] as string[],
    lockHeld: false, lockAmbiguous: false, processPids: [] as number[], newestMtimeMs: 0,
  };
  const now = { nowMs: 10 * 60 * 60 * 1000 };

  it('BASELINE: spojeno, cisto, staro, bez locka, linkova i procesa je uklonjivo', () => {
    expect(judgeWorktree(base, now)).toEqual({ removable: true, reasons: [] });
  });

  it('svaki uvjet zasebno zadrzava stablo', () => {
    const kept = (facts: object) => judgeWorktree({ ...base, ...facts }, now).removable;
    expect(kept({ originFresh: false })).toBe(false);
    expect(kept({ ancestor: false })).toBe(false);
    expect(kept({ unreachableCommits: 1 })).toBe(false);
    expect(kept({ unreachableCommits: null })).toBe(false);
    expect(kept({ status: { ...clean, tracked: ['a.txt'] } })).toBe(false);
    expect(kept({ status: { ...clean, untracked: ['novi.ts'] } })).toBe(false);
    expect(kept({ status: { ...clean, untracked: ['logs/'] } })).toBe(false);
    expect(kept({ status: { ...clean, untracked: ['x.log'] } })).toBe(false);
    expect(kept({ status: { ...clean, untracked: ['src/progress.log'] } })).toBe(false);
    expect(kept({ status: { ...clean, untracked: ['gate.log', '.gate-lock'] } })).toBe(true);
    expect(kept({ status: { ...clean, untracked: ['node_modules'] } })).toBe(false);
    expect(kept({ status: { ...clean, untracked: ['node_modules'] }, mainNodeModulesLink: true })).toBe(true);
    expect(kept({ status: { ...clean, ignored: ['.env'] } })).toBe(false);
    expect(kept({ status: { ...clean, ignored: ['dist/'] } })).toBe(false);
    expect(kept({ status: { ...clean, ignored: ['node_modules/'] } })).toBe(false);
    expect(kept({ status: { ...clean, ignored: ['node_modules/'] }, mainNodeModulesLink: true })).toBe(true);
    expect(kept({ status: { ...clean, ignored: ['.tmp-word-verify/', 'debug.log'] } })).toBe(true);
    expect(kept({ status: { ...clean, ignored: ['src/debug.log'] } })).toBe(false);
    expect(kept({ foreignLinks: ['.tmp-cache/shared'] })).toBe(false);
    expect(kept({ foreignLinks: null })).toBe(false);
    expect(kept({ lockAmbiguous: true })).toBe(false);
    expect(kept({ lockHeld: true })).toBe(false);
    expect(kept({ lockHeld: null })).toBe(false);
    expect(kept({ processPids: [42] })).toBe(false);
    expect(kept({ processPids: null })).toBe(false);
    expect(kept({ locked: true })).toBe(false);
    expect(kept({ current: true })).toBe(false);
    expect(kept({ newestMtimeMs: now.nowMs - 59 * 60 * 1000 })).toBe(false);
    expect(kept({ newestMtimeMs: null })).toBe(false);
    expect(kept({ status: null })).toBe(false);
    expect(kept({ main: true })).toBe(false);
  });

  it('uski popisi: tocna imena u korijenu, nikad podmapa', () => {
    expect(isAllowedUntracked('gate.log')).toBe(true);
    expect(isAllowedUntracked('sub/gate.log')).toBe(false);
    expect(isAllowedUntracked('notes.log')).toBe(false);
    expect(isAllowedIgnored('debug.log')).toBe(true);
    expect(isAllowedIgnored('logs/')).toBe(false);
    expect(isAllowedIgnored('a/.tmp-x/')).toBe(false);
  });

  it('parsira porcelain popis, status s preimenovanjem i reflog', () => {
    const list = parseWorktreeList('worktree C:/a\nHEAD 1111\nbranch refs/heads/master\n\nworktree C:/b\nHEAD 2222\ndetached\nlocked razlog\n');
    expect(list.map((w) => [w.path, w.branch, w.detached, w.locked])).toEqual([
      ['C:/a', 'master', false, false],
      ['C:/b', null, true, true],
    ]);
    expect(parseStatusZ('R  novo.ts\0staro.ts\0?? gate.log\0!! node_modules/\0')).toEqual({
      tracked: ['novo.ts'], untracked: ['gate.log'], ignored: ['node_modules/'],
    });
    const a = 'a'.repeat(40);
    const b = 'b'.repeat(40);
    const z = '0'.repeat(40);
    expect(parseReflogShas(`${z} ${a} t <t@x> 1 +0000\tcheckout\r\n${a} ${b} t <t@x> 2 +0000\tcommit\n${b} ${a} t <t@x> 3 +0000\tcheckout\n`))
      .toEqual([a, b]);
  });
});

describe('integracija je fail-open i ne blokira start sesije', () => {
  it('M5: SessionStart pokrece GC odvojeno, vraca se za manje od 2 s i ispisuje zadnji redak prethodnog runa', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lekta-wtgc-boot-'));
    try {
      expect(runWorktreeGc({ root })).toBe('worktree-gc: preskoceno (skripta ne postoji)');
      mkdirSync(join(root, 'scripts'));
      // Lazna skripta traje 4 s: sinkroni hook bi cekao, odvojeni se vraca odmah.
      writeFileSync(join(root, 'scripts', 'worktree-gc.mjs'),
        "setTimeout(() => console.log('worktree-gc: lazni run gotov ' + process.argv.slice(2).join(' ')), 4000);\n");
      const logPath = join(root, 'gc.log');
      const env = { ...process.env, LEKTA_WORKTREE_GC_LOG: logPath };
      const t0 = Date.now();
      const first = runWorktreeGc({ root, env });
      const elapsed = Date.now() - t0;
      expect(elapsed).toBeLessThan(2000);
      expect(first).toBe(`worktree-gc: pokrenut u pozadini (log ${logPath}); prethodni run: nema zapisa`);
      const deadline = Date.now() + 30_000;
      while (lastLogLine(logPath) === null && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
      expect(lastLogLine(logPath)).toBe('worktree-gc: lazni run gotov --apply --quiet');
      const second = runWorktreeGc({ root, env });
      expect(second).toMatch(/prethodni run: worktree-gc: lazni run gotov --apply --quiet$/);
      const deadline2 = Date.now() + 30_000;
      while (lastLogLine(logPath) === null && Date.now() < deadline2) await new Promise((r) => setTimeout(r, 200));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    const boom = (() => { throw new Error('nema node'); }) as unknown as typeof import('node:child_process').spawn;
    const root2 = mkdtempSync(join(tmpdir(), 'lekta-wtgc-boot-'));
    try {
      mkdirSync(join(root2, 'scripts'));
      writeFileSync(join(root2, 'scripts', 'worktree-gc.mjs'), '\n');
      const env = { ...process.env, LEKTA_WORKTREE_GC_LOG: join(root2, 'gc.log') };
      expect(runWorktreeGc({ root: root2, env, spawn: boom })).toBe('worktree-gc: nije uspjelo (nema node); start sesije se nastavlja');
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  }, 90_000);

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
    const ok = (() => ({ status: 0, stdout: '{"removable":3,"removableMb":1050,"kept":4,"originFresh":true}\n', stderr: '' })) as unknown as typeof spawnSync;
    expect(worktreeGcHint({ root, spawn: ok })).toBe('uklonjivih worktreeova: 3 (1050 MB); oslobodi: node scripts/worktree-gc.mjs --apply');
    const fail = (() => ({ status: 1, stdout: '', stderr: 'x' })) as unknown as typeof spawnSync;
    expect(worktreeGcHint({ root, spawn: fail })).toMatch(/nisu izmjereni; .*node scripts\/worktree-gc\.mjs --apply$/);
    let calls = 0;
    const counted = ((...args: Parameters<typeof spawnSync>) => { calls += 1; return (ok as (...a: unknown[]) => unknown)(...args); }) as unknown as typeof spawnSync;
    expect(worktreeGcHint({ root, injected: true, spawn: counted })).toMatch(/nisu izmjereni/);
    expect(calls).toBe(0);
  });
});
