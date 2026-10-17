// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  MAX_REDAKA, UPUTA, findStanje, formatStanje, hookOutput, projectSlug, stanjeCandidates,
} from '../scripts/hooks/compact-stanje.mjs';
import { compactOutputProblems } from './helpers/hook-discipline';

// Stednja konteksta (odluka vlasnika 2026-10-17): SessionStart hook s matcherom `compact`.
const SCRIPT = resolve('scripts/hooks/compact-stanje.mjs');
const SESIJA = '17a250b9-9f21-43db-97c4-cdd97e71658f';
const CWD = 'c:\\Users\\PC\\Desktop\\Lekta';
const SLUG = 'c--Users-PC-Desktop-Lekta';

/** Datoteka stanja od n razlicitih redaka (generator dokazuje da proizvodi n jedinstvenih redaka). */
const stanje = (n: number): string[] => Array.from({ length: n }, (_, i) => `redak stanja ${i + 1}`);

let root = '';
let tmpRoot = '';
let home = '';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lekta-compact-stanje-'));
  tmpRoot = join(root, 'tmp');
  home = join(root, 'home');
  mkdirSync(tmpRoot, { recursive: true });
  mkdirSync(home, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function scratchStanje(slug = SLUG): string {
  const dir = join(tmpRoot, 'claude', slug, SESIJA, 'scratchpad');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'STANJE.md');
}

/** Okolina djeteta: tmp i home preusmjereni u privremenu mapu, bez LEKTA_STANJE iz roditelja. */
function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, TEMP: tmpRoot, TMP: tmpRoot, TMPDIR: tmpRoot, USERPROFILE: home, HOME: home, ...extra };
  if (!('LEKTA_STANJE' in extra)) delete env.LEKTA_STANJE;
  return env;
}

function runHook(input: unknown, env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [SCRIPT], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env,
    timeout: 10_000,
  });
}

const contextOf = (stdout: string): string =>
  String(JSON.parse(stdout).hookSpecificOutput.additionalContext).replace(/\r/g, '');

describe('compact-stanje: kandidati i redoslijed', () => {
  it('slug kao Claude Code: svaki znak osim slova i znamenke postaje crtica', () => {
    expect(projectSlug(CWD)).toBe(SLUG);
    expect(projectSlug('C:/Users/PC/lekta-wt/c4-stednja')).toBe('C--Users-PC-lekta-wt-c4-stednja');
  });

  it('redom: LEKTA_STANJE, scratchpad po mapi transkripta, scratchpad po cwd, lekta-wt/stanje', () => {
    const transcript = join(home, '.claude', 'projects', 'slug-iz-transkripta', `${SESIJA}.jsonl`);
    const env = { LEKTA_STANJE: join(root, 'izricito.md') };
    expect(stanjeCandidates({ session_id: SESIJA, cwd: CWD, transcript_path: transcript }, { env, tmpRoot, home })).toEqual([
      resolve(env.LEKTA_STANJE),
      join(tmpRoot, 'claude', 'slug-iz-transkripta', SESIJA, 'scratchpad', 'STANJE.md'),
      join(tmpRoot, 'claude', SLUG, SESIJA, 'scratchpad', 'STANJE.md'),
      join(home, 'lekta-wt', 'stanje', `${SESIJA}.md`),
    ]);
  });

  it('session_id koji nije jedan siguran segment ne ulazi u putanju', () => {
    for (const session_id of ['../../etc', 'a/b', 'a\\b', '', 42, null]) {
      expect(stanjeCandidates({ session_id, cwd: CWD }, { env: {}, tmpRoot, home }), String(session_id)).toEqual([]);
    }
  });

  it('prazna datoteka se preskace, uzima se sljedeci kandidat', () => {
    const prazna = join(root, 'prazna.md');
    const puna = join(root, 'puna.md');
    writeFileSync(prazna, '  \r\n');
    writeFileSync(puna, 'zadatak T1\r\nhead abc\r\n');
    expect(findStanje([join(root, 'nema.md'), prazna, puna])).toEqual({ path: puna, text: 'zadatak T1\nhead abc\n' });
  });

  it('necitljiv kandidat ne baca', () => {
    const p = join(root, 'x.md');
    writeFileSync(p, 'x');
    expect(findStanje([p], () => { throw new Error('EACCES'); })).toBeNull();
    expect(hookOutput({ session_id: SESIJA }, { env: {}, tmpRoot, home, read: () => { throw new Error('x'); } }))
      .toEqual({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: UPUTA } });
  });
});

describe('compact-stanje: proces (izlaz 0 uvijek)', () => {
  it('nadje scratchpad/STANJE.md i ubaci ga s naslovom STANJE SESIJE', () => {
    const redci = stanje(5);
    writeFileSync(scratchStanje(), `${redci.join('\r\n')}\r\n`);
    const r = runHook({ session_id: SESIJA, cwd: CWD, hook_event_name: 'SessionStart', source: 'compact' }, childEnv());
    expect(r.status).toBe(0);
    expect(compactOutputProblems(r.stdout, redci)).toEqual([]);
    const ctx = contextOf(r.stdout);
    expect(ctx.split('\n')[0]).toMatch(/^STANJE SESIJE \(.*STANJE\.md\):$/);
    expect(ctx.split('\n').slice(1)).toEqual(redci);
  });

  it('LEKTA_STANJE ima prednost pred scratchpadom; bez oba vrijedi lekta-wt/stanje', () => {
    writeFileSync(scratchStanje(), 'iz scratchpada\n');
    const izricito = join(root, 'izricito.md');
    writeFileSync(izricito, 'iz varijable\n');
    const a = runHook({ session_id: SESIJA, cwd: CWD }, childEnv({ LEKTA_STANJE: izricito }));
    expect(a.status).toBe(0);
    expect(contextOf(a.stdout).split('\n').slice(1)).toEqual(['iz varijable']);

    rmSync(join(tmpRoot, 'claude'), { recursive: true, force: true });
    mkdirSync(join(home, 'lekta-wt', 'stanje'), { recursive: true });
    writeFileSync(join(home, 'lekta-wt', 'stanje', `${SESIJA}.md`), 'iz lekta-wt\n');
    const b = runHook({ session_id: SESIJA, cwd: CWD }, childEnv());
    expect(b.status).toBe(0);
    expect(contextOf(b.stdout).split('\n').slice(1)).toEqual(['iz lekta-wt']);
  });

  it(`ogranicenje: od 60 redaka u kontekst ide najvise ${MAX_REDAKA}`, () => {
    const redci = stanje(60);
    expect(new Set(redci).size).toBe(60);
    writeFileSync(scratchStanje(), redci.join('\n'));
    const r = runHook({ session_id: SESIJA, cwd: CWD }, childEnv());
    expect(r.status).toBe(0);
    expect(MAX_REDAKA).toBe(40);
    expect(compactOutputProblems(r.stdout, redci)).toEqual([]);
    const ctx = contextOf(r.stdout).split('\n');
    expect(ctx).toContain('redak stanja 40');
    expect(ctx).not.toContain('redak stanja 41');
    expect(ctx.at(-1)).toBe('(skraceno: 40 od 60 redaka)');
    // Tocno 40 redaka ne skracuje se i nema biljeske.
    expect(formatStanje({ path: 'p', text: stanje(40).join('\n') }).split('\n')).toHaveLength(41);
  });

  it('nema datoteke stanja: kratka uputa da sesija prvo napise STANJE.md', () => {
    const r = runHook({ session_id: SESIJA, cwd: CWD }, childEnv());
    expect(r.status).toBe(0);
    expect(contextOf(r.stdout)).toBe(UPUTA);
    expect(UPUTA).toMatch(/^STANJE SESIJE: .*STANJE\.md/);
  });

  it('neispravan ili prazan stdin: izlaz 0 i uputa, ne pad', () => {
    for (const input of ['nije json {', '', '[]', 'null']) {
      const r = runHook(input, childEnv());
      expect(r.status, input).toBe(0);
      expect(contextOf(r.stdout), input).toBe(UPUTA);
    }
  });

  it('ne pise datoteke: privremena mapa je ista prije i poslije', () => {
    writeFileSync(scratchStanje(), 'x\n');
    const prije = readdirSync(root, { recursive: true }).map(String).sort();
    expect(runHook({ session_id: SESIJA, cwd: CWD }, childEnv()).status).toBe(0);
    expect(runHook('los ulaz', childEnv()).status).toBe(0);
    expect(readdirSync(root, { recursive: true }).map(String).sort()).toEqual(prije);
  });
});
