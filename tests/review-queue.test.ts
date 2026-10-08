// @vitest-environment node
/**
 * Red pregleda drugog providera preko oznaka. `review-queue-core.mjs` je cist modul; ovaj test ne
 * pokrece git, gh ni CLI. Svaki slucaj ima i cisti baseline i pokvaren ulaz koji mora pasti.
 */
import { describe, expect, it } from 'vitest';
import {
  buildCommand, buildPrompt, codexModel, extractGrokText, shimInvocation, stripNarration, forbiddenEnv, formatComment, pickDeltaBase,
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
    { number: 12, labels: [{ name: 'codex-review' }], headRefOid: 'h12' },
    { number: 7, labels: [{ name: 'grok-review' }, { name: 'codex-review' }], headRefOid: 'h7' },
  ];
  it('uzima najnizi PR, pa provider po abecedi', () => {
    expect(selectNext(prs, {})).toEqual({ number: 7, provider: 'codex', noDelta: false });
  });
  it('oznacava vec pregledan head kao noDelta', () => {
    expect(selectNext(prs, { reviewed: { '7:codex': 'h7' } })).toEqual({ number: 7, provider: 'codex', noDelta: true });
  });
  it('preskace kombinaciju koja je iscrpila pokusaje', () => {
    const failures = { '7:codex': MAX_FAILURES, '7:grok': MAX_FAILURES };
    expect(selectNext(prs, { failures })).toEqual({ number: 12, provider: 'codex', noDelta: false });
  });
  it('prazan red vraca null', () => {
    expect(selectNext([], {})).toBeNull();
    expect(selectNext([{ number: 1, labels: [{ name: 'bug' }], headRefOid: 'x' }], {})).toBeNull();
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
    const c = formatComment({ provider: 'grok', model: 'grok-4.6', base: 'a'.repeat(40), head: 'b'.repeat(40), text: 'v C:\\Users\\PC\\x', isProtected: true });
    expect(c).not.toContain('Users');
    expect(c).toContain('trece misljenje');
    expect(c).toContain('Savjetodavni');
  });
  it('extractGrokText cita polje result ili vraca sirovo', () => {
    expect(extractGrokText('{"result":"nalaz"}')).toBe('nalaz');
    expect(extractGrokText('{"text":"Pogledat cu diff.## Nalazi\\n1. a.ts:3"}')).toBe('## Nalazi\n1. a.ts:3');
    expect(extractGrokText('goli tekst')).toBe('goli tekst');
  });
});

describe('forbiddenEnv', () => {
  it('odbija API kljuceve, pusta cistu okolinu', () => {
    expect(forbiddenEnv({ XAI_API_KEY: 'x' })).toEqual(['XAI_API_KEY']);
    expect(forbiddenEnv({ OPENAI_API_KEY: '' , PATH: 'p' })).toEqual([]);
  });
});

describe('stripNarration i shimInvocation', () => {
  it('odsijeca naraciju po zadnjem markeru, bez markera ne dira tekst', () => {
    expect(stripNarration('uvod## Nalazi\nx')).toBe('## Nalazi\nx');
    expect(stripNarration('## Nalazi a\n## Nalazi b')).toBe('## Nalazi b');
    expect(stripNarration('bez markera')).toBe('bez markera');
  });
  it('windows ide kroz node ulaznu tocku ili cmd.exe /c, linux nepromijenjeno', () => {
    expect(shimInvocation('grok', ['a'], { platform: 'linux', resolved: { command: 'grok', argsPrefix: [] } })).toEqual({ command: 'grok', args: ['a'] });
    expect(shimInvocation('grok', ['a'], { platform: 'win32', resolved: { command: 'node.exe', argsPrefix: ['b.js'] } })).toEqual({ command: 'node.exe', args: ['b.js', 'a'] });
    expect(shimInvocation('codex', ['a'], { platform: 'win32', resolved: { command: 'codex', argsPrefix: [] } })).toEqual({ command: 'cmd.exe', args: ['/d', '/s', '/c', 'codex.cmd', 'a'] });
  });
});
