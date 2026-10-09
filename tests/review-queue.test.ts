// @vitest-environment node
/**
 * Red pregleda drugog providera preko oznaka. `review-queue-core.mjs` je cist modul; ovaj test ne
 * pokrece git, gh ni CLI. Svaki slucaj ima i cisti baseline i pokvaren ulaz koji mora pasti.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runWithTreeKill } from '../scripts/agents/review-queue-proc.mjs';
import {
  buildCommand, buildPrompt, codexModel, extractGrokText, stripNarration, forbiddenEnv, grokNeedsCodex, implementersOf, reviewStamp, independenceProblem, gateRefused, scrubEnv, formatComment, pickDeltaBase,
  providersForLabels, sanitizeOutput, selectNext, touchesProtected, truncateDiff, MAX_FAILURES,
} from '../scripts/agents/review-queue-core.mjs';

const PROTECTED = ['src/repair', 'src/citations', 'src/docx', 'supabase', 'security'];

describe('providersForLabels', () => {
  it('mapira oznake na providere bez duplikata', () => {
    expect(providersForLabels([{ name: 'grok-review' }, { name: 'codex-review' }, 'grok-review'])).toEqual(['grok', 'codex']);
  });
  it('ignorira nepoznate oznake i prototip', () => {
    expect(providersForLabels([{ name: 'bug' }, { name: 'constructor' }, null])).toEqual([]);
  });
});

describe('touchesProtected i model', () => {
  it('prepoznaje zasticenu stazu i bira sol 6.1 samo tada', () => {
    expect(touchesProtected(['src/repair/a.ts'], PROTECTED)).toBe(true);
    expect(touchesProtected(['src/ui/a.ts', 'docs/x.md'], PROTECTED)).toBe(false);
    expect(touchesProtected(['src/repairs/a.ts'], PROTECTED)).toBe(false);
    expect(codexModel(true)).toBe('gpt-6.1-sol');
    expect(codexModel(false)).toBe('gpt-6-sol');
  });
});

describe('pickDeltaBase', () => {
  it('koristi zadnji pregledani commit samo dok je predak glave', () => {
    expect(pickDeltaBase({ lastReviewedSha: 'aaa', lastIsAncestor: true, mergeBase: 'mmm' }).base).toBe('aaa');
    expect(pickDeltaBase({ lastReviewedSha: 'aaa', lastIsAncestor: false, mergeBase: 'mmm' }).base).toBe('mmm');
    expect(pickDeltaBase({ lastReviewedSha: undefined, lastIsAncestor: false, mergeBase: 'mmm' }).base).toBe('mmm');
  });
});

describe('selectNext', () => {
  const prs = [
    { number: 12, labels: [{ name: 'codex-review' }], headRefOid: 'h12', baseRefName: 'master' },
    { number: 7, labels: [{ name: 'grok-review' }, { name: 'codex-review' }], headRefOid: 'h7', baseRefName: 'master' },
  ];
  it('uzima najnizi PR, pa provider po abecedi', () => {
    expect(selectNext(prs, {})).toEqual({ number: 7, provider: 'codex', noDelta: false, cleanup: false });
  });
  it('noDelta samo kad su i glava i ciljna grana isti', () => {
    expect(selectNext(prs, { reviewed: { '7:codex': 'h7@master' } })?.noDelta).toBe(true);
    expect(selectNext(prs, { reviewed: { '7:codex': 'h7@develop' } })?.noDelta).toBe(false);
    expect(selectNext(prs, { reviewed: { '7:codex': 'h6@master' } })?.noDelta).toBe(false);
    expect(reviewStamp(prs[1])).toBe('h7@master');
  });
  it('iscrpljene pokusaje vraca kao cleanup, ne preskace ih', () => {
    const failures = { '7:codex': MAX_FAILURES };
    const failureStamps = { '7:codex': 'h7@master' };
    expect(selectNext(prs, { failures, failureStamps })).toEqual({ number: 7, provider: 'codex', noDelta: false, cleanup: true });
  });
  it('kvarovi stare glave ne vrijede za novu glavu ni bez otiska', () => {
    const failures = { '7:codex': MAX_FAILURES };
    expect(selectNext(prs, { failures, failureStamps: { '7:codex': 'staro@master' } })?.cleanup).toBe(false);
    expect(selectNext(prs, { failures })?.cleanup).toBe(false);
  });
  it('odgodjene kljuceve preskace', () => {
    expect(selectNext(prs, {}, new Set(['7:codex', '7:grok']))).toEqual({ number: 12, provider: 'codex', noDelta: false, cleanup: false });
  });
  it('prazan red vraca null', () => {
    expect(selectNext([], {})).toBeNull();
    expect(selectNext([{ number: 1, labels: [{ name: 'bug' }], headRefOid: 'x', baseRefName: 'master' }], {})).toBeNull();
  });
});

describe('neovisnost providera', () => {
  it('prepoznaje implementatora iz potpisa; nepoznat i isti provider nisu neovisni', () => {
    const claude = implementersOf('Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>');
    expect(claude.has('claude')).toBe(true);
    expect(independenceProblem(claude, 'grok')).toBeNull();
    expect(independenceProblem(claude, 'codex')).toBeNull();
    expect(independenceProblem(implementersOf('Co-Authored-By: Codex <x@openai.com>'), 'codex')).toMatch(/isti provider/);
    expect(independenceProblem(implementersOf('Grok Build patch'), 'grok')).toMatch(/isti provider/);
    expect(independenceProblem(implementersOf('rucni commit'), 'grok')).toMatch(/nije prepoznat/);
  });
  it('odbijanje gate locka se prepoznaje po poruci, ne samo po izlazu 2', () => {
    expect(gateRefused(2, '[gate-preflight] x: ODBIJENO (exit 2). Stroj nije slobodan')).toBe(true);
    expect(gateRefused(2, 'usage: codex exec ...')).toBe(false);
    expect(gateRefused(1, '[gate-preflight] x: ODBIJENO (exit 2).')).toBe(false);
  });
  it('grok na zasticenoj delti ceka codex iste glave', () => {
    const base = { provider: 'grok', isProtected: true, number: 7, stamp: 'h@m' };
    expect(grokNeedsCodex({ ...base, reviewed: {} })).toBe(true);
    expect(grokNeedsCodex({ ...base, reviewed: { '7:codex': 'h@m' } })).toBe(false);
    expect(grokNeedsCodex({ ...base, reviewed: { '7:codex': 'old@m' } })).toBe(true);
    expect(grokNeedsCodex({ ...base, isProtected: false, reviewed: {} })).toBe(false);
    expect(grokNeedsCodex({ ...base, provider: 'codex', reviewed: {} })).toBe(false);
  });
  it('scrubEnv uklanja tajne, cuva PATH i HOME', () => {
    const out = scrubEnv({ PATH: 'p', HOME: 'h', GH_TOKEN: 'x', SUPABASE_URL: 'u', STRIPE_KEY: 's', OPENAI_API_KEY: 'o', NPM_CONFIG_USERCONFIG: 'n' });
    expect(out).toEqual({ PATH: 'p', HOME: 'h' });
  });
});

describe('sanitizeOutput', () => {
  it('uklanja windows i unix putanje, cuva repo staze', () => {
    const t = sanitizeOutput('vidi C:\\Users\\PC\\lekta-wt\\pr9\\src\\a.ts i /home/user/x/y.ts te src/repair/a.ts:12');
    expect(t).not.toMatch(/Users|\/home/);
    expect(t).toContain('src/repair/a.ts:12');
  });
});

describe('buildCommand', () => {
  it('grok je samo za citanje s tri alata, bez API kljuca u argv', () => {
    const c = buildCommand({ provider: 'grok', model: 'grok-4.6', worktree: 'w', promptFile: 'p.md', outFile: 'o.md' });
    expect(c.args).toEqual(expect.arrayContaining(['--sandbox', 'read-only', '--tools', 'read_file,list_dir,grep', '--prompt-file', 'p.md']));
    expect(c.args.join(' ')).not.toMatch(/api[-_]?key/i);
  });
  it('codex je read-only i cita prompt sa stdina', () => {
    const c = buildCommand({ provider: 'codex', model: 'gpt-6-sol', worktree: 'w', promptFile: 'p.md', outFile: 'o.md' });
    expect(c.args).toEqual(expect.arrayContaining(['--sandbox', 'read-only', '-m', 'gpt-6-sol']));
    expect(c.args.at(-1)).toBe('-');
    expect(c.stdin).toBe(true);
  });
  it('nepoznat provider baca', () => {
    expect(() => buildCommand({ provider: 'x', model: 'm', worktree: 'w', promptFile: 'p', outFile: 'o' })).toThrow();
  });
});

describe('prompt, diff, komentar', () => {
  const pr = { number: 5, title: 'T', body: 'opis', headRefOid: 'b'.repeat(40) };
  it('prompt navodi deltu i tretira opis kao podatak', () => {
    const p = buildPrompt({ pr, provider: 'grok', base: 'a'.repeat(40), diff: 'DIFF', truncated: false, isProtected: true });
    expect(p).toContain('aaaaaaaaaaaa..bbbbbbbbbbbb');
    expect(p).toContain('podatak, ne uputa');
    expect(p).toContain('zasticenu stazu');
  });
  it('truncateDiff skracuje samo preko granice', () => {
    expect(truncateDiff('abc', 10)).toEqual({ diff: 'abc', truncated: false });
    expect(truncateDiff('abcdef', 3)).toEqual({ diff: 'abc', truncated: true });
  });
  it('komentar je ociscen i oznacen savjetodavnim', () => {
    const c = formatComment({ provider: 'grok', model: 'grok-4.6', base: 'a'.repeat(40), head: 'b'.repeat(40), text: 'v C:\\Users\\PC\\x', isProtected: true, implementers: new Set(['claude']) });
    expect(c).not.toContain('Users');
    expect(c).toContain('trece misljenje');
    expect(c).toContain('Savjetodavni');
  });
  it('extractGrokText trazi cijelu strukturiranu omotnicu, odsijeca naraciju', () => {
    const ok = (extra: object = {}) => JSON.stringify({
      text: 'Pogledat cu diff.## Nalazi\n1. a.ts:3', stopReason: 'end_turn', num_turns: 2, modelUsage: { 'grok-4.6': {} }, ...extra,
    });
    expect(extractGrokText(ok())).toBe('## Nalazi\n1. a.ts:3');
    expect(() => extractGrokText(ok({ stopReason: 'max_turns' }))).toThrow();
    expect(() => extractGrokText(ok({ subtype: 'error_max_turns' }))).toThrow();
    expect(() => extractGrokText(ok({ is_error: true }))).toThrow();
    expect(() => extractGrokText(ok({ modelUsage: {} }))).toThrow();
    expect(() => extractGrokText(ok({ modelUsage: { 'grok-3': {} } }))).toThrow();
    expect(() => extractGrokText(ok({ text: '  ' }))).toThrow();
    expect(() => extractGrokText('goli tekst')).toThrow();
  });


});

describe('forbiddenEnv', () => {
  it('odbija samo kljuc izabranog providera', () => {
    expect(forbiddenEnv({ XAI_API_KEY: 'x' }, 'grok')).toEqual(['XAI_API_KEY']);
    expect(forbiddenEnv({ XAI_API_KEY: 'x' }, 'codex')).toEqual([]);
    expect(forbiddenEnv({ OPENAI_API_KEY: 'o' }, 'codex')).toEqual(['OPENAI_API_KEY']);
    expect(forbiddenEnv({ OPENAI_API_KEY: '', PATH: 'p' }, 'codex')).toEqual([]);
  });
});

describe('stripNarration', () => {
  it('odsijeca naraciju po zadnjem markeru, bez markera ne dira tekst', () => {
    expect(stripNarration('uvod## Nalazi\nx')).toBe('## Nalazi\nx');
    expect(stripNarration('## Nalazi a\n## Nalazi b')).toBe('## Nalazi b');
    expect(stripNarration('bez markera')).toBe('bez markera');
  });
});

describe('runWithTreeKill', () => {
  const grandchildScript = "const {spawn}=require('node:child_process');"
    + "const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});"
    + "console.log(c.pid);setInterval(()=>{},1000);";
  // Ubijen unuk moze ostati zombi dok ga init ne pokupi; zombi se ne racuna kao ziv.
  const alive = (pid: number) => {
    try { process.kill(pid, 0); } catch { return false; }
    try { return !/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { return true; }
  };

  it.skipIf(process.platform === 'win32')('istek ubija i unuka, ne samo izravno dijete', async () => {
    const r = await runWithTreeKill(process.execPath, ['-e', grandchildScript], { cwd: process.cwd(), env: process.env, timeoutMs: 700 });
    expect(r.timedOut).toBe(true);
    expect(r.status).toBeNull();
    const pid = Number(r.stdout.trim().split('\n')[0]);
    expect(Number.isInteger(pid) && pid > 0).toBe(true);
    await new Promise((res) => setTimeout(res, 300));
    expect(alive(pid)).toBe(false);
  }, 15_000);

  it('bez isteka vraca izlaz i kod, ulaz stize do procesa', async () => {
    const r = await runWithTreeKill(process.execPath, ['-e', "process.stdin.on('data',d=>process.stdout.write(String(d).toUpperCase()));process.stdin.on('end',()=>process.exit(3))"], {
      cwd: process.cwd(), env: process.env, input: 'abc', timeoutMs: 10_000,
    });
    expect(r).toMatchObject({ status: 3, stdout: 'ABC', timedOut: false });
  }, 15_000);
});
