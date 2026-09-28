// @vitest-environment node
// Doctor i fixture po modelu (scripts/agents/model-probe.mjs): lazni CLI, pravi ocjenjivac (node --test).
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FIXTURE_FILES, IMPLEMENT_SCHEMA, assertKnownClaudeModel, assertSubscriptionEnv, fixtureArgs, gradeTests,
  probeModel, runFixture, structuredOutputProblems,
} from '../scripts/agents/model-probe.mjs';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'lekta-probe-')); dirs.push(d); return d; };

const MODEL = 'claude-opus-5-5';
const RIJESENJE = [
  'const K = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;',
  'const V = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };',
  'export function rimskiUBroj(s) {',
  "  if (typeof s !== 'string' || !s || !K.test(s)) throw new RangeError('x');",
  '  let z = 0; for (let i = 0; i < s.length; i++) z += V[s[i]] < (V[s[i + 1]] ?? 0) ? -V[s[i]] : V[s[i]];',
  '  return z;',
  '}',
].join('\n');
const STRUCTURED = { scope: 'rimski.mjs', changes: [{ file: 'rimski.mjs', summary: 'implementacija' }],
  testsRun: [{ command: 'node --test rimski.test.mjs', result: 'pass' }], risks: [], nextStep: 'pregled' };

function cliResult(over: Record<string, unknown> = {}, model = MODEL) {
  return JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'OK', duration_ms: 1000, num_turns: 3,
    usage: { output_tokens: 10 }, modelUsage: { 'claude-haiku-4-5-20251001': { outputTokens: 3 }, [model]: { outputTokens: 10 } }, ...over });
}

/** Lazni `claude`: po zelji pise datoteke u cwd (kao da je model radio) i vraca zadani stdout. */
function fakeClaude(stdout: string, write: Record<string, string> = {}, calls: unknown[][] = []) {
  return (command: string, args: string[], opts: { cwd: string }) => {
    calls.push([command, args, opts]);
    for (const [name, content] of Object.entries(write)) writeFileSync(join(opts.cwd, name), content);
    return { status: 0, stdout, stderr: '' };
  };
}

describe('probeModel (doctor --model)', () => {
  it('prolazi kad trazeni model stvarno ima izlazne tokene i odgovor je OK', () => {
    const calls: unknown[][] = [];
    const r = probeModel(MODEL, { env: {}, spawn: fakeClaude(cliResult(), {}, calls) });
    expect(r.ok).toBe(true);
    expect(r.line).toMatch(/^claude-opus-5-5: ok \| exit 0 \| subtype success/);
    expect((calls[0] as [string, string[]])[1]).toEqual(['-p', '--model', MODEL, '--output-format', 'json', '--max-turns', '1', '--tools', '']);
  });

  it('pada kad je CLI pozvao samo pomocni model, iako modelMatches ne bi prigovorio', () => {
    const samoHaiku = cliResult({ modelUsage: { 'claude-haiku-4-5-20251001': { outputTokens: 3 }, [MODEL]: { outputTokens: 0 } } });
    expect(probeModel(MODEL, { env: {}, spawn: fakeClaude(samoHaiku) })).toMatchObject({ ok: false, reason: 'model_not_called' });
  });

  it('pada na gresku CLI-ja i na neocekivan odgovor', () => {
    expect(probeModel(MODEL, { env: {}, spawn: fakeClaude(cliResult({ subtype: 'error_max_turns', is_error: true })) }).reason).toBe('contract');
    expect(probeModel(MODEL, { env: {}, spawn: fakeClaude(cliResult({ result: 'Naravno! OK' })) }).reason).toBe('unexpected_answer');
  });

  it('API kljuc u okolini je greska prije ikakvog poziva', () => {
    const calls: unknown[][] = [];
    for (const name of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_API_KEY']) {
      expect(() => probeModel(MODEL, { env: { [name]: 'x' }, spawn: fakeClaude(cliResult(), {}, calls) })).toThrow(/API credentials/);
    }
    expect(calls).toHaveLength(0);
    expect(() => assertSubscriptionEnv({})).not.toThrow();
  });

  it('prima samo Claude model iz configa', () => {
    const config = { models: { [MODEL]: {}, 'gpt-x': {} } };
    expect(() => assertKnownClaudeModel(config, MODEL)).not.toThrow();
    for (const bad of ['claude-nema', 'gpt-x', '', '--dangerously-skip-permissions']) expect(() => assertKnownClaudeModel(config, bad)).toThrow();
  });
});

describe('fixture: implement na malom zadatku', () => {
  it('ocjenjivac: stub pada, rjesenje prolazi 5 od 5', () => {
    const d = tmp();
    for (const [n, c] of Object.entries(FIXTURE_FILES)) writeFileSync(join(d, n), c);
    expect(gradeTests(d)).toMatchObject({ ok: false, pass: 0, fail: 5 });
    writeFileSync(join(d, 'rimski.mjs'), RIJESENJE);
    expect(gradeTests(d)).toEqual({ ok: true, pass: 5, fail: 0 });
  });

  it('cijeli run: ugovor, shema, stvarni testovi i tokeni trazenog modela', () => {
    const r = runFixture(MODEL, 'medium', { env: {}, dir: tmp(), spawn: fakeClaude(cliResult({ structured_output: STRUCTURED }), { 'rimski.mjs': RIJESENJE }) });
    expect(r).toMatchObject({ ok: true, contractOk: true, schemaOk: true, testTampered: false, claimMatchesReality: true, outputTokens: 10, tests: { pass: 5 } });
  });

  it('model koji izmijeni test ne prolazi, a ocjenjivac mjeri izvorni test', () => {
    const slab = "export function rimskiUBroj() { return 3; }\n";
    const lazniTest = "import { test } from 'node:test'; test('a', () => {}); test('b', () => {}); test('c', () => {}); test('d', () => {}); test('e', () => {});\n";
    const d = tmp();
    const r = runFixture(MODEL, 'medium', { env: {}, dir: d, spawn: fakeClaude(cliResult({ structured_output: STRUCTURED }), { 'rimski.mjs': slab, 'rimski.test.mjs': lazniTest }) });
    expect(r).toMatchObject({ ok: false, testTampered: true, claimMatchesReality: false });
    expect(r.tests.ok).toBe(false);
    expect(readFileSync(join(d, 'rimski.test.mjs'), 'utf8')).toBe(FIXTURE_FILES['rimski.test.mjs']);
  });

  it('bez structured_output ili s krivim oblikom ugovor izlaza pada', () => {
    const bez = runFixture(MODEL, 'medium', { env: {}, dir: tmp(), spawn: fakeClaude(cliResult(), { 'rimski.mjs': RIJESENJE }) });
    expect(bez).toMatchObject({ ok: false, schemaOk: false, schemaProblems: ['nema structured_output'] });
    expect(structuredOutputProblems({ ...STRUCTURED, extra: 1 })).not.toEqual([]);
    expect(structuredOutputProblems({ ...STRUCTURED, testsRun: [{ command: 'x', result: 'ok' }] })).not.toEqual([]);
    expect(structuredOutputProblems(STRUCTURED)).toEqual([]);
  });

  it('argumenti: shema ide u --json-schema, effort je iz zatvorenog skupa, alati su ograniceni', () => {
    const args = fixtureArgs(MODEL, 'high');
    expect(JSON.parse(args[args.indexOf('--json-schema') + 1])).toEqual(IMPLEMENT_SCHEMA);
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('Read,Edit,Write,Bash(node --test *)');
    expect(() => fixtureArgs(MODEL, 'max')).toThrow();
  });
});
