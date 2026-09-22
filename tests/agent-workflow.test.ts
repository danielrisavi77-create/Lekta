// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { prepareJob, parseGrokVersion, parseResult, validateQueue, PROMPT_FILE_PLACEHOLDER } from '../scripts/agents/core.mjs';

const queue = () => ({ tasks: [
  { id: 'T00', title: 'Confirm baseline', status: 'done', dependsOn: [] },
  { id: 'T01', title: 'Repair proof', status: 'ready', dependsOn: ['T00'] },
] });

describe('agent context budget contract', () => {
  it('keeps root AGENTS as a compact map and detailed rules on demand', () => {
    const root = readFileSync('AGENTS.md', 'utf8');
    const detailed = readFileSync('docs/agents/PROJECT_RULES.md', 'utf8');
    expect(root.split('\n').length).toBeLessThanOrEqual(120);
    expect(root.length).toBeLessThan(8_000);
    expect(root).toContain('docs/agents/PROJECT_RULES.md');
    expect(detailed.length).toBeGreaterThan(20_000);

    const job = prepareJob(queue(), 'T01', 'plan', 'astra');
    expect(job.prompt).toContain('relevant headings of docs/agents/PROJECT_RULES.md');
    expect(job.prompt).not.toContain('Read AGENTS.md, CLAUDE.md and docs/agents/README.md');
  });
});

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
  it('delivers the Grok prompt through a file placeholder, never in argv', () => {
    const q = queue();
    q.tasks[1].title = 'Repair $(touch stolen) `echo secret`';
    const job = prepareJob(q, 'T01', 'implement', 'build');
    expect(job.command).toBe('grok');
    expect(job.args[0]).toBe('--no-auto-update');
    expect(job.args).toContain('--prompt-file');
    expect(job.args).toContain(PROMPT_FILE_PLACEHOLDER);
    expect(job.args).toContain('--always-approve');
    expect(job.args).toContain('grok-4.6');
    expect(job.args.slice(job.args.indexOf('--sandbox'), job.args.indexOf('--sandbox') + 2)).toEqual(['--sandbox', 'workspace']);
    expect(job.args.join(' ')).not.toContain('stolen');
    expect(job.prompt).toContain('$(touch stolen)');
    const plan = prepareJob(q, 'T01', 'plan', 'grok');
    expect(plan.args).not.toContain('--always-approve');
    expect(plan.args.slice(plan.args.indexOf('--sandbox'), plan.args.indexOf('--sandbox') + 2)).toEqual(['--sandbox', 'read-only']);
    expect(plan.command).toBe('grok');
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
    expect(() => prepareJob(queue(), 'T01', 'implement', 'grok')).toThrow(/role/);
    expect(() => prepareJob(queue(), 'T01', 'plan', 'build')).toThrow(/role/);
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
  it('rejects same-provider review for Grok Build and allows cross-provider review', () => {
    const q = queue();
    q.tasks[1].status = 'in_review';
    q.tasks[1].implementationAgent = 'build';
    expect(() => prepareJob(q, 'T01', 'review', 'grok')).toThrow(/different provider/);
    expect(prepareJob(q, 'T01', 'review', 'astra').command).toBe('codex');
    q.tasks[1].implementationAgent = 'sol';
    expect(prepareJob(q, 'T01', 'review', 'grok').command).toBe('grok');
  });
  it('allows a read-only implementer alias to review a different provider', () => {
    const q = queue();
    q.tasks[1].status = 'in_review';
    q.tasks[1].implementationAgent = 'sol';
    const review = prepareJob(q, 'T01', 'review', 'opus', 2);
    expect(review.command).toBe('claude');
    expect(review.args).toContain('Read,Glob,Grep');
    expect(review.args).not.toContain('Write');
  });
  it('uses the compact orchestration contract instead of forcing three root/runbook rereads', () => {
    const job = prepareJob(queue(), 'T01', 'plan', 'astra');
    expect(job.prompt).toContain('docs/agents/ORCHESTRATION.md');
    expect(job.prompt).not.toContain('Read AGENTS.md, CLAUDE.md and docs/agents/README.md');
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
      .toMatchObject({ ok: true, reportedModels: ['claude-opus-4-6'] });
    expect(parseResult('claude', 'not json', 0).ok).toBe(false);
  });
  it('accepts parseable non-error Grok JSON and rejects explicit errors', () => {
    expect(parseResult('grok', '', 0).ok).toBe(false);
    expect(parseResult('grok', '{"model":"grok-4.6","ok":false}', 0).ok).toBe(false);
    expect(parseResult('grok', '{"error":"boom"}', 0).ok).toBe(false);
    expect(parseResult('grok', '{"model":"grok-4.6","result":"done"}', 1).ok).toBe(false);
    expect(parseResult('grok', '{"model":"grok-4.6","result":"done"}', 0).ok).toBe(false);
    const liveShape = JSON.stringify({
      text: 'LEKTA_GROK_SMOKE_OK', stopReason: 'end_turn', num_turns: 1,
      modelUsage: { 'grok-4.6-build': { modelCalls: 1 } },
    });
    expect(parseResult('grok', liveShape, 0))
      .toMatchObject({ ok: true, reportedModels: ['grok-4.6-build'] });
    expect(parseResult('grok', JSON.stringify({ text: '', stopReason: 'end_turn', num_turns: 1, modelUsage: {} }), 0).ok).toBe(false);
    expect(parseResult('grok', '{"type":"result","is_error":false,"model":"grok-4.6"}', 0).ok).toBe(false);
    expect(parseResult('grok', '{"type":"result","is_error":true,"model":"grok-4.6"}', 0).ok).toBe(false);
  });
  it('accepts the captured Grok 1.0.34 contract fixture', () => {
    const stdout = readFileSync('tests/fixtures/grok-result-1.0.34.json', 'utf8');
    expect(parseResult('grok', stdout, 0))
      .toMatchObject({
        ok: true,
        reportedModels: ['grok-4.6-build'],
        usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14, costUsd: 0.00001, modelCalls: 1 },
      });
  });
  it('classifies Grok versions against the verified minimum', () => {
    expect(parseGrokVersion('grok 1.0.34 (3736acbc8658)'))
      .toEqual({ version: '1.0.34', supported: true });
    expect(parseGrokVersion('grok 1.0.33 (old)'))
      .toEqual({ version: '1.0.33', supported: false });
    expect(parseGrokVersion('unexpected')).toEqual({ version: null, supported: false });
  });
  it('normalizes real Codex turn usage without counting cache twice', () => {
    const stdout = readFileSync('scripts/autonomy/tests/fixtures/codex-exec-json-tool-use-2026-09-20.stdout.ndjson', 'utf8');
    expect(parseResult('codex', stdout, 0).usage).toEqual({
      inputTokens: 53791,
      cachedInputTokens: 36352,
      cacheWriteInputTokens: 0,
      outputTokens: 213,
      reasoningOutputTokens: 93,
      totalTokens: 54004,
      costUsd: null,
      modelCalls: null,
    });
  });
  it('aggregates Claude modelUsage into the same contract', () => {
    const stdout = JSON.stringify({
      subtype: 'success', is_error: false,
      modelUsage: {
        'claude-sonnet': { inputTokens: 7, outputTokens: 2, cacheReadInputTokens: 3, costUSD: 1, modelCalls: 1 },
        'claude-opus': { inputTokens: 5, outputTokens: 1, cacheReadInputTokens: 2, costUSD: 2, modelCalls: 1 },
      },
    });
    expect(parseResult('claude', stdout, 0).usage).toEqual({
      inputTokens: 12,
      cachedInputTokens: 5,
      cacheWriteInputTokens: null,
      outputTokens: 3,
      reasoningOutputTokens: null,
      totalTokens: 15,
      costUsd: 3,
      modelCalls: 2,
    });
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
  it('rejects Grok agents in the subscription profile because xAI billing is not covered', () => {
    expect(() => prepareJob(queue(), 'T01', 'implement', 'build', undefined, { billingMode: 'subscription' }))
      .toThrow(/not included/);
    expect(() => prepareJob(queue(), 'T01', 'plan', 'grok', undefined, { billingMode: 'subscription' }))
      .toThrow(/not included/);
  });
  it('uses a separate included-account profile only for Grok aliases', () => {
    expect(prepareJob(queue(), 'T01', 'plan', 'grok', undefined, { billingMode: 'included_account' }).billingMode)
      .toBe('included_account');
    expect(prepareJob(queue(), 'T01', 'implement', 'build', undefined, { billingMode: 'included_account' }).command)
      .toBe('grok');
    expect(() => prepareJob(queue(), 'T01', 'plan', 'astra', undefined, { billingMode: 'included_account' }))
      .toThrow(/included-account/);
  });
});


describe('agent process boundary helpers', () => {
  it('spawns Grok with a prompt file, no prompt argv, no stdin and no shell', async () => {
    const { spawnJob } = await import('../scripts/agents/cli.mjs');
    const job = prepareJob(queue(), 'T01', 'plan', 'grok');
    let call: { command?: string; args?: string[]; options?: Record<string, unknown> } = {};
    const fakeSpawn = (command: string, args: string[], options: Record<string, unknown>) => {
      call = { command, args, options };
      return { status: 0, stdout: '{"type":"result","is_error":false}', stderr: '' };
    };
    const promptFile = '/tmp/lekta-prompt.md';
    spawnJob(job, promptFile, process.cwd(), fakeSpawn as never);
    expect(call.command).toBe('grok');
    expect(call.args).toContain(promptFile);
    expect(call.args).not.toContain(job.prompt);
    expect(call.args).not.toContain(PROMPT_FILE_PLACEHOLDER);
    expect(call.options).toMatchObject({ input: undefined, shell: false });
  });
});

// Autonomni kontroler ne smije pisati u docs/agents/tasks.json (koordinatorova domena), a fazu pregleda
// prepareJob je dosad citao iskljucivo iz njega, pa review nije mogao proci ni kad je planTask ispravan.
describe('review phase asserted by the controller, not by the queue file', () => {
  it('still refuses a review the queue has not marked in_review', () => {
    expect(() => prepareJob(queue(), 'T01', 'review', 'astra')).toThrow(/in_review/);
    expect(() => prepareJob(queue(), 'T01', 'review', 'astra', undefined, {})).toThrow(/in_review/);
  });
  it('accepts an explicit override and leaves the queue object untouched', () => {
    const q = queue();
    const job = prepareJob(q, 'T01', 'review', 'astra', undefined, {
      overrideTask: { status: 'in_review', implementationAgent: 'sonnet' },
    });
    expect(job.command).toBe('codex');
    expect(job.args).toContain('read-only');
    expect(q.tasks[1].status).toBe('ready');
    expect(q.tasks[1].implementationAgent).toBeUndefined();
    // Prompt nosi PRAVI zadatak iz reda, ne kontrolerovu tvrdnju o fazi.
    expect(job.prompt).toContain('"status": "ready"');
    expect(job.prompt).not.toContain('in_review');
  });
  it('keeps the different-provider rule biting through the override', () => {
    expect(() => prepareJob(queue(), 'T01', 'review', 'astra', undefined, {
      overrideTask: { status: 'in_review', implementationAgent: 'sol' },
    })).toThrow(/different provider/);
    expect(() => prepareJob(queue(), 'T01', 'review', 'astra', undefined, {
      overrideTask: { status: 'in_review', implementationAgent: 'astra' },
    })).toThrow(/implementationAgent/);
    expect(() => prepareJob(queue(), 'T01', 'review', 'astra', undefined, {
      overrideTask: { status: 'in_review', implementationAgent: 'nobody' },
    })).toThrow(/implementationAgent/);
  });
  it('cannot be used to loosen the implement readiness check', () => {
    const q = queue();
    q.tasks[1].status = 'blocked';
    expect(() => prepareJob(q, 'T01', 'implement', 'sol', undefined, {
      overrideTask: { status: 'ready' },
    })).toThrow(/ready/);
    const p = queue();
    p.tasks[0].status = 'ready';
    expect(() => prepareJob(p, 'T01', 'implement', 'sol', undefined, {
      overrideTask: { status: 'ready', dependsOn: [] },
    })).toThrow(/T00/);
  });
});
