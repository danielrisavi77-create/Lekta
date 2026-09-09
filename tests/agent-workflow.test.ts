// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { prepareJob, parseResult, validateQueue } from '../scripts/agents/core.mjs';

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
