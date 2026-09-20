// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AGENTS, PROMPT_FILE_PLACEHOLDER, SUBSCRIPTION_EXCLUDED_AGENTS, prepareJob, parseResult,
  resolvePromptFileArgs, validateQueue } from '../scripts/agents/core.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const readRepoFile = (relative: string) => readFileSync(join(repoRoot, relative), 'utf8');

const queue = () => ({ tasks: [
  { id: 'T00', title: 'Confirm baseline', status: 'done', dependsOn: [] },
  { id: 'T01', title: 'Repair proof', status: 'ready', dependsOn: ['T00'] },
] });

describe('agent handoff', () => {
  it('passes the complete task on stdin, never through a shell command', () => {
    const q = queue();
    q.tasks[1].title = 'Repair $(touch stolen) `echo secret`';
    const job = prepareJob(q, 'T01', 'implement', 'sol');
    expect(job.command).toBe('codex');
    expect(job.args).toEqual(['exec', '--model', 'gpt-5.6-sol', '--sandbox', 'workspace-write', '--json', '-']);
    expect(job.prompt).toContain('$(touch stolen)');
    expect(job.args.join(' ')).not.toContain('stolen');
  });
  it('refuses an implementation before its dependency is complete', () => {
    const q = queue();
    q.tasks[0].status = 'ready';
    expect(() => prepareJob(q, 'T01', 'implement', 'opus')).toThrow(/T00/);
  });
  it('allows an audit of blocked work without authorizing implementation', () => {
    const q = queue();
    q.tasks[1].status = 'blocked';
    expect(prepareJob(q, 'T01', 'plan', 'astra').args).toContain('read-only');
    expect(() => prepareJob(q, 'T01', 'implement', 'sol')).toThrow(/ready/);
  });
  it('rejects unsupported models and keeps coordinators out of implementation', () => {
    expect(() => prepareJob(queue(), 'T01', 'implement', 'astra')).toThrow(/role/);
    expect(() => prepareJob(queue(), 'T01', 'plan', 'sonnet')).toThrow(/role/);
    expect(() => prepareJob(queue(), 'T01', 'plan', 'unknown')).toThrow(/agent/);
  });
  it('requires a caller-selected Claude budget and limits unattended tool access', () => {
    expect(() => prepareJob(queue(), 'T01', 'implement', 'sonnet')).toThrow(/budget/);
    const job = prepareJob(queue(), 'T01', 'implement', 'sonnet', 3);
    expect(job.args).toContain('--max-budget-usd');
    expect(job.args).toContain('3');
    expect(job.args).toContain('dontAsk');
    expect(job.args).not.toContain('bypassPermissions');
    expect(job.args[job.args.indexOf('--allowedTools') + 1]).not.toContain('Bash(npm run *)');
    expect(() => prepareJob(queue(), 'T01', 'implement', 'sonnet', Infinity)).toThrow(/budget/);
  });
  it('rejects missing dependencies and dependency cycles', () => {
    const q = queue();
    q.tasks[0].dependsOn = ['T01'];
    expect(() => validateQueue(q)).toThrow(/cycle/);
    q.tasks[0].dependsOn = ['MISSING'];
    expect(() => validateQueue(q)).toThrow(/MISSING/);
  });
});

describe('provider results do not replace verification', () => {
  it('rejects a successful process with missing or failed Codex turn evidence', () => {
    expect(parseResult('codex', '', 0).ok).toBe(false);
    expect(parseResult('codex', '{"type":"turn.failed"}\n{"type":"turn.completed"}', 0).ok).toBe(false);
    expect(parseResult('codex', '{"type":"turn.completed"}', 0).ok).toBe(true);
    expect(parseResult('codex', '{"type":"turn.completed"}', 1).ok).toBe(false);
  });
  it('rejects Claude budget/turn errors even when stdout is valid JSON', () => {
    expect(parseResult('claude', '{"subtype":"error_max_turns","is_error":true}', 0).ok).toBe(false);
    expect(parseResult('claude', '{"subtype":"success","is_error":false,"modelUsage":{"claude-opus-4-6":{}}}', 0))
      .toEqual({ ok: true, reportedModels: ['claude-opus-4-6'] });
    expect(parseResult('claude', 'not json', 0).ok).toBe(false);
  });
});

describe('subscription billing mode (autonomy profile)', () => {
  it('never emits a budget flag, refuses Fable and refuses a fake budget', () => {
    const job = prepareJob(queue(), 'T01', 'implement', 'sonnet', undefined, { billingMode: 'subscription' });
    expect(job.args).not.toContain('--max-budget-usd');
    expect(job.args).toContain('dontAsk');
    expect(job.billingMode).toBe('subscription');
    const q = queue();
    q.tasks[1].status = 'blocked';
    expect(() => prepareJob(q, 'T01', 'plan', 'fable', undefined, { billingMode: 'subscription' })).toThrow(/subscription/);
    expect(() => prepareJob(queue(), 'T01', 'implement', 'sonnet', 3, { billingMode: 'subscription' })).toThrow(/budget/);
    expect(() => prepareJob(queue(), 'T01', 'implement', 'sonnet', 3, { billingMode: 'prepaid' })).toThrow(/billing/);
  });
  it('keeps the manual budget mode unchanged by default', () => {
    expect(() => prepareJob(queue(), 'T01', 'implement', 'sonnet')).toThrow(/budget/);
    expect(prepareJob(queue(), 'T01', 'implement', 'sonnet', 3).billingMode).toBe('budget');
    expect(prepareJob(queue(), 'T01', 'implement', 'sol').args).not.toContain('--max-budget-usd');
  });
});

describe('Grok Build CLI je treci provider', () => {
  it('gradi implement args i salje prompt izvan argv', () => {
    const q = queue();
    q.tasks[1].title = 'Repair $(touch stolen) `echo secret`';
    const job = prepareJob(q, 'T01', 'implement', 'grok');
    expect(job.command).toBe('grok');
    expect(job.requestedModel).toBe('grok-4.6');
    expect(job.args).toEqual(['--no-auto-update', '--prompt-file', PROMPT_FILE_PLACEHOLDER,
      '--model', 'grok-4.6', '--output-format', 'json', '--max-turns', '20', '--always-approve']);
    // Prompt ide u datoteku koju cli.mjs upise na mjesto oznake; u argv ga nema.
    expect(job.prompt).toContain('$(touch stolen)');
    expect(job.args.join(' ')).not.toContain('stolen');
    expect(job.args).not.toContain(job.prompt);
    expect(job.args).not.toContain('--max-budget-usd');
  });
  it('plan i review voze read-only sandbox bez odobravanja izmjena', () => {
    const q = queue();
    q.tasks[1].status = 'blocked';
    const plan = prepareJob(q, 'T01', 'plan', 'grok-audit');
    expect(plan.args).toEqual(['--no-auto-update', '--prompt-file', PROMPT_FILE_PLACEHOLDER,
      '--model', 'grok-4.6', '--output-format', 'json', '--max-turns', '20', '--sandbox', 'read-only']);
    expect(plan.args).not.toContain('--always-approve');
    expect(AGENTS.grok.role).toBe('implementer');
    expect(AGENTS['grok-audit'].role).toBe('coordinator');
  });
  it('grok-audit pregledava drugi provider, ali nikad vlastiti', () => {
    const q = queue();
    q.tasks[1].status = 'in_review';
    q.tasks[1].implementationAgent = 'sol';
    expect(() => prepareJob(q, 'T01', 'review', 'grok-audit')).not.toThrow();
    q.tasks[1].implementationAgent = 'grok';
    expect(() => prepareJob(q, 'T01', 'review', 'grok-audit')).toThrow(/different provider/);
    // Obrnuti smjer: Astra i Fable ostaju dopusteni pregledatelji Groka.
    expect(() => prepareJob(q, 'T01', 'review', 'astra')).not.toThrow();
  });
  it('pretplatnicki nacin ne ukljucuje Grok', () => {
    expect(SUBSCRIPTION_EXCLUDED_AGENTS).toEqual(['fable', 'grok', 'grok-audit']);
    expect(() => prepareJob(queue(), 'T01', 'implement', 'grok', undefined, { billingMode: 'subscription' }))
      .toThrow(/subscription/);
    const q = queue();
    q.tasks[1].status = 'blocked';
    expect(() => prepareJob(q, 'T01', 'plan', 'grok-audit', undefined, { billingMode: 'subscription' }))
      .toThrow(/subscription/);
    // Baseline: isti poziv u rucnom nacinu prolazi, dakle zabrana dolazi od nacina naplate.
    expect(prepareJob(q, 'T01', 'plan', 'grok-audit').billingMode).toBe('budget');
  });
  it('rezultat je jedan JSON objekt, a greska nije uspjeh', () => {
    expect(parseResult('grok', '{"type":"result","model":"grok-4.6"}', 0))
      .toEqual({ ok: true, reportedModels: ['grok-4.6'] });
    expect(parseResult('grok', '{"type":"result","is_error":true,"model":"grok-4.6"}', 0).ok).toBe(false);
    expect(parseResult('grok', '{"type":"error","message":"no credit"}', 0).ok).toBe(false);
    expect(parseResult('grok', '{"type":"result"}', 0)).toEqual({ ok: true, reportedModels: [] });
    expect(parseResult('grok', '{"type":"result"}', 1).ok).toBe(false);
    expect(parseResult('grok', 'not json', 0).ok).toBe(false);
    // NDJSON je Codexov oblik; kao Grok rezultat ne smije proci.
    const ndjson = ['{"type":"result"}', '{"type":"result"}'].join(String.fromCharCode(10));
    expect(parseResult('grok', ndjson, 0).ok).toBe(false);
  });
});

/**
 * `job.args` su do Groka bili doslovno izvrsivi, pa nijedan potrosac nije morao nista zamijeniti.
 * Oznaka prompta tu pretpostavku rusi, a potrosaca ima DVA: `scripts/agents/cli.mjs` (rucni put) i
 * `scripts/autonomy/worker.py` (autonomni kontroler). Ovi testovi drze oba imenovana.
 */
describe('oznaka u args ima potrosaca koji je zamjenjuje', () => {
  const preparedArgs = () => {
    const jobs = [];
    const ready = () => queue();
    const blocked = () => { const q = queue(); q.tasks[1].status = 'blocked'; return q; };
    const review = (agent: string) => { const q = queue(); q.tasks[1].status = 'in_review'; q.tasks[1].implementationAgent = agent; return q; };
    for (const [name, agent] of Object.entries(AGENTS)) {
      const budget = agent.command === 'claude' ? 3 : undefined;
      if (agent.role === 'implementer') jobs.push(prepareJob(ready(), 'T01', 'implement', name, budget));
      else {
        jobs.push(prepareJob(blocked(), 'T01', 'plan', name, budget));
        const other = Object.entries(AGENTS).find(([, a]) => a.role === 'implementer' && a.command !== agent.command);
        if (other) jobs.push(prepareJob(review(other[0]), 'T01', 'review', name, budget));
      }
    }
    return jobs.flatMap(job => job.args);
  };

  it('jedina oznaka u bilo kojem poslu je ona koju potrosaci poznaju', () => {
    const args = preparedArgs();
    expect(args.length).toBeGreaterThan(0);
    const placeholders = [...new Set(args.filter(arg => /^__[A-Z0-9_]+__$/.test(arg)))];
    // Nova oznaka bez potrosaca otisla bi providera doslovno; zato je popis zatvoren.
    expect(placeholders).toEqual([PROMPT_FILE_PLACEHOLDER]);
  });

  it('zamjena oznake je zajednicka funkcija, ne prepisan izraz u pozivatelju', () => {
    const args = prepareJob(queue(), 'T01', 'implement', 'grok').args;
    const resolved = resolvePromptFileArgs(args, '/tmp/out/prompt.md');
    expect(resolved).toContain('/tmp/out/prompt.md');
    expect(resolved).not.toContain(PROMPT_FILE_PLACEHOLDER);
    expect(resolved[resolved.indexOf('--prompt-file') + 1]).toBe('/tmp/out/prompt.md');
    // Posao bez oznake prolazi nepromijenjen, pa Codex i Claude ne ovise o putanji prompta.
    const codex = prepareJob(queue(), 'T01', 'implement', 'sol').args;
    expect(resolvePromptFileArgs(codex, undefined)).toEqual(codex);
    // Oznaka bez putanje je greska, ne tiho propustanje.
    expect(() => resolvePromptFileArgs(args, '')).toThrow(/Prompt file/);
    // Oblik koji zamjena po jednakosti ne pokriva mora pasti, ne otici providera doslovno.
    expect(() => resolvePromptFileArgs([`--prompt-file=${PROMPT_FILE_PLACEHOLDER}`], '/tmp/p.md'))
      .toThrow(/Unsubstituted/);
  });

  it('oba potrosaca job.args zamjenjuju oznaku prije poziva', () => {
    // cli.mjs: argv se gradi zajednickom funkcijom, a `job.args` nikad ne ide izravno u spawn.
    const cli = readRepoFile('scripts/agents/cli.mjs');
    expect(cli).toContain('resolvePromptFileArgs(job.args, promptFile)');
    expect(cli).not.toMatch(/spawnSync\(job\.command,\s*job\.args/);
    expect(cli.indexOf('resolvePromptFileArgs(job.args')).toBeLessThan(cli.indexOf('spawnSync(job.command'));

    // worker.py je drugi jezik pa ne moze uvesti funkciju; drzi ga vrijednost oznake i fail-safe grana.
    // Ponasanje te grane dokazuju scripts/autonomy/tests/test_worker.py (unittest, izvan vitesta).
    const worker = readRepoFile('scripts/autonomy/worker.py');
    expect(worker).toContain(`PROMPT_FILE_PLACEHOLDER = "${PROMPT_FILE_PLACEHOLDER}"`);
    expect(worker).toContain('prompt_file_unsubstituted');
    expect(worker.indexOf('PROMPT_FILE_PLACEHOLDER in raw_args')).toBeLessThan(worker.indexOf('tree.start(argv'));
  });
});
