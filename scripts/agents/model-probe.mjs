/**
 * Doctor i fixture za pojedini Claude model (docs/agents/ROUTING.md, "Kako dodati novi model").
 *
 * `agents doctor` provjerava samo da CLI postoji. Ovdje je drugi korak: stvaran poziv modela kroz
 * prijavljenu pretplatu i provjera da izlaz zadovoljava isti ugovor kao runner (`parseResult`), uz
 * stroze pravilo da trazeni model mora stvarno imati izlazne tokene u `modelUsage` (CLI uz njega
 * zna pozvati i pomocni model, pa `modelMatches` sam nije dovoljan).
 *
 * Fixture je mali implement zadatak s determinističkim ishodom u privremenoj mapi izvan repozitorija.
 * Ocjenjivac ne vjeruje modelu: prije mjerenja vraca izvorni test i sam pokrece `node --test`.
 *
 * Trosak: samo pretplata. API kljuc u okolini je greska prije poziva, isto kao u `--subscription`
 * nacinu runnera, jer bi CLI tada naplacivao po pozivu.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseResult } from './core.mjs';

const API_KEY_ENV = Object.freeze(['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_API_KEY']);
const EFFORTS = ['low', 'medium', 'high', 'xhigh'];

export function assertSubscriptionEnv(env = process.env) {
  const leaked = API_KEY_ENV.filter((name) => env[name]);
  if (leaked.length) throw new Error(`model probe refuses API credentials in the environment: ${leaked.join(', ')}`);
}

/** Samo Claude modeli iz configa; proizvoljan string nikad ne ide u argv. */
export function assertKnownClaudeModel(config, model) {
  if (!model || !model.startsWith('claude-') || !Object.hasOwn(config?.models ?? {}, model)) {
    throw new Error(`Unknown Claude model in config/agent-routing.json: ${model}`);
  }
}

/**
 * Pokrene `claude` s promptom na stdinu i procita rezultat kroz runnerov `parseResult`.
 * `tokens` su izlazni tokeni TRAZENOG modela iz `modelUsage`; null ako ga CLI nije stvarno pozvao.
 */
function runClaude(spawn, model, args, input, spawnOptions) {
  const run = spawn('claude', args, { input, encoding: 'utf8', shell: false, killSignal: 'SIGKILL', ...spawnOptions });
  const parsed = parseResult('claude', run.stdout ?? '', run.status);
  let result = null;
  try { result = JSON.parse(run.stdout ?? ''); } catch { /* parsed.ok je vec false */ }
  const part = result?.modelUsage?.[model];
  const n = Number(part?.outputTokens ?? part?.output_tokens);
  return { run, parsed, result, tokens: Number.isFinite(n) && n > 0 ? n : null };
}

const PROBE_PROMPT = 'Odgovori tocno jednom rijeci: OK';

export function probeModel(model, options = {}) {
  const spawn = options.spawn ?? spawnSync;
  assertSubscriptionEnv(options.env);
  const { run, parsed, result, tokens } = runClaude(spawn, model,
    ['-p', '--model', model, '--output-format', 'json', '--max-turns', '1', '--tools', ''], PROBE_PROMPT,
    { cwd: options.cwd, timeout: 180_000 });
  const answer = String(result?.result ?? '').trim();
  const ok = parsed.ok && tokens !== null && answer === 'OK';
  const reason = !parsed.ok ? 'contract' : tokens === null ? 'model_not_called' : answer !== 'OK' ? 'unexpected_answer' : null;
  return {
    ok, reason,
    line: `${model}: ${ok ? 'ok' : `failed (${reason})`} | exit ${run.status} | subtype ${result?.subtype ?? '-'} | modelUsage [${parsed.reportedModels.join(', ')}] | ${model} outputTokens ${tokens ?? '-'} | ${result?.duration_ms ?? '-'} ms`,
  };
}

// --- Fixture: implement na malom zadatku ---

export const FIXTURE_FILES = Object.freeze({
  'rimski.mjs': [
    '/** Pretvara kanonski rimski broj (1 do 3999, velika slova) u cijeli broj; sve ostalo baca RangeError. */',
    'export function rimskiUBroj(s) {',
    "  throw new Error('nije implementirano');",
    '}',
    '',
  ].join('\n'),
  'rimski.test.mjs': [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { rimskiUBroj } from './rimski.mjs';",
    '',
    "test('osnovni', () => { assert.equal(rimskiUBroj('III'), 3); assert.equal(rimskiUBroj('LVIII'), 58); });",
    "test('oduzimanje', () => { assert.equal(rimskiUBroj('IV'), 4); assert.equal(rimskiUBroj('MCMXCIV'), 1994); });",
    "test('granice', () => { assert.equal(rimskiUBroj('I'), 1); assert.equal(rimskiUBroj('MMMCMXCIX'), 3999); });",
    "test('nekanonski oblik', () => { for (const s of ['IIII', 'IC', 'VX', 'MMMM', 'IIV']) assert.throws(() => rimskiUBroj(s), RangeError, s); });",
    "test('nije rimski', () => { for (const s of ['', 'iv', 'X I', 'ABC', 12]) assert.throws(() => rimskiUBroj(s), RangeError, String(s)); });",
    '',
  ].join('\n'),
});

/** Isti povrat koji runner trazi od implementatora (prepareJob), kao shema za --json-schema. */
export const IMPLEMENT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['scope', 'changes', 'testsRun', 'risks', 'nextStep'],
  properties: {
    scope: { type: 'string', minLength: 1 },
    changes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['file', 'summary'],
      properties: { file: { type: 'string', minLength: 1 }, summary: { type: 'string', minLength: 1 } } } },
    testsRun: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['command', 'result'],
      properties: { command: { type: 'string', minLength: 1 }, result: { enum: ['pass', 'fail'] } } } },
    risks: { type: 'array', items: { type: 'string' } },
    nextStep: { type: 'string' },
  },
});

const FIXTURE_PROMPT = [
  'Implementiraj funkciju rimskiUBroj u rimski.mjs tako da prodju testovi u rimski.test.mjs.',
  'Ne mijenjaj rimski.test.mjs. Pokreni testove naredbom: node --test rimski.test.mjs',
  'Vrati strukturirani izlaz: scope, changes (datoteka i sazetak), testsRun (naredba i pass/fail), risks, nextStep.',
].join('\n');

/** Minimalna provjera za IMPLEMENT_SCHEMA; ne oslanja se na to da je CLI sam validirao. */
export function structuredOutputProblems(value) {
  const problems = [];
  const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const exact = (v, keys, where) => {
    if (!obj(v)) { problems.push(`${where}: nije objekt`); return false; }
    const own = Object.keys(v);
    if (own.length !== keys.length || !keys.every((k) => own.includes(k))) problems.push(`${where}: polja ${own.join(',')}`);
    return true;
  };
  const str = (v, where) => { if (typeof v !== 'string' || !v.trim()) problems.push(`${where}: prazan tekst`); };
  if (!exact(value, IMPLEMENT_SCHEMA.required, '$')) return problems;
  str(value.scope, '$.scope');
  if (typeof value.nextStep !== 'string') problems.push('$.nextStep: nije tekst');
  if (!Array.isArray(value.risks) || value.risks.some((r) => typeof r !== 'string')) problems.push('$.risks');
  if (!Array.isArray(value.changes)) problems.push('$.changes: nije niz');
  else value.changes.forEach((c, i) => { if (exact(c, ['file', 'summary'], `$.changes[${i}]`)) { str(c.file, `$.changes[${i}].file`); str(c.summary, `$.changes[${i}].summary`); } });
  if (!Array.isArray(value.testsRun)) problems.push('$.testsRun: nije niz');
  else value.testsRun.forEach((t, i) => {
    if (exact(t, ['command', 'result'], `$.testsRun[${i}]`)) {
      str(t.command, `$.testsRun[${i}].command`);
      if (!['pass', 'fail'].includes(t.result)) problems.push(`$.testsRun[${i}].result`);
    }
  });
  return problems;
}

export function fixtureArgs(model, effort) {
  if (!EFFORTS.includes(effort)) throw new Error(`Unknown effort: ${effort}`);
  return ['-p', '--model', model, '--effort', effort, '--output-format', 'json', '--json-schema', JSON.stringify(IMPLEMENT_SCHEMA),
    '--max-turns', '15', '--permission-mode', 'dontAsk', '--tools', 'Read,Edit,Write,Bash',
    '--allowedTools', 'Read,Edit,Write,Bash(node --test *)'];
}

/** Vraca izvorni test i sam pokrece node --test; broji iz TAP sazetka, ne iz tvrdnje modela. */
export function gradeTests(dir, spawn = spawnSync) {
  writeFileSync(join(dir, 'rimski.test.mjs'), FIXTURE_FILES['rimski.test.mjs']);
  const run = spawn(process.execPath, ['--test', '--test-reporter=tap', 'rimski.test.mjs'], { cwd: dir, encoding: 'utf8', timeout: 60_000, shell: false });
  const count = (name) => Number((run.stdout ?? '').match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1] ?? NaN);
  const pass = count('pass');
  const fail = count('fail');
  return { pass, fail, ok: run.status === 0 && pass === 5 && fail === 0 };
}

export function runFixture(model, effort, options = {}) {
  const spawn = options.spawn ?? spawnSync;
  assertSubscriptionEnv(options.env);
  const dir = options.dir ?? mkdtempSync(join(tmpdir(), 'lekta-model-fixture-'));
  for (const [name, content] of Object.entries(FIXTURE_FILES)) writeFileSync(join(dir, name), content);
  const { parsed, result, tokens } = runClaude(spawn, model, fixtureArgs(model, effort), FIXTURE_PROMPT,
    { cwd: dir, timeout: 20 * 60_000, maxBuffer: 32 * 1024 * 1024 });
  const structured = result?.structured_output;
  const schemaProblems = structured === undefined ? ['nema structured_output'] : structuredOutputProblems(structured);
  const testTampered = readFileSync(join(dir, 'rimski.test.mjs'), 'utf8') !== FIXTURE_FILES['rimski.test.mjs'];
  const tests = gradeTests(dir, options.gradeSpawn ?? spawnSync);
  const claimsPass = Array.isArray(structured?.testsRun) && structured.testsRun.some((t) => t?.result === 'pass');
  return {
    model, effort, dir,
    contractOk: parsed.ok && tokens !== null,
    reportedModels: parsed.reportedModels,
    schemaOk: schemaProblems.length === 0, schemaProblems,
    testTampered,
    tests,
    claimMatchesReality: claimsPass === tests.ok,
    outputTokens: tokens,
    outputTokensAll: parsed.usage.outputTokens,
    durationMs: result?.duration_ms ?? null,
    numTurns: result?.num_turns ?? null,
    notionalCostUsd: parsed.usage.costUsd,
    ok: parsed.ok && tokens !== null && schemaProblems.length === 0 && !testTampered && tests.ok,
  };
}
