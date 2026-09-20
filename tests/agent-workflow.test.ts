// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AGENTS, PROMPT_FILE_PLACEHOLDER, SUBSCRIPTION_EXCLUDED_AGENTS, prepareJob, parseResult,
  resolvePromptFileArgs, validateQueue } from '../scripts/agents/core.mjs';
import { buildSpawnArgs, isEntryModule, spawnJob } from '../scripts/agents/cli.mjs';
import { spawnSync } from 'node:child_process';
import { rmdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
    // Prazan objekt nema NIJEDAN dokaz dovrsenog kruga; odsutnost `is_error` nije uspjeh.
    expect(parseResult('grok', '{}', 0).ok).toBe(false);
    // Potroseni krugovi su neuspjeh i kod Claudea; `subtype` s prefiksom `error` ne smije proci.
    expect(parseResult('grok', '{"type":"result","subtype":"error_max_turns"}', 0).ok).toBe(false);
    expect(parseResult('grok', '{"type":"result","subtype":"error_during_execution"}', 0).ok).toBe(false);
    // Baseline uz isti oblik: uredan `subtype` prolazi, pa odbijanje dolazi od prefiksa `error`.
    expect(parseResult('grok', '{"type":"result","subtype":"success","model":"grok-4.6"}', 0))
      .toEqual({ ok: true, reportedModels: ['grok-4.6'] });
    // NDJSON je Codexov oblik; kao Grok rezultat ne smije proci.
    const ndjson = ['{"type":"result"}', '{"type":"result"}'].join(String.fromCharCode(10));
    expect(parseResult('grok', ndjson, 0).ok).toBe(false);
  });
});

/**
 * `job.args` su do Groka bili doslovno izvrsivi, pa nijedan potrosac nije morao nista zamijeniti.
 * Oznaka prompta tu pretpostavku rusi. Potrosac je `scripts/agents/cli.mjs` (rucni put); autonomni
 * `scripts/autonomy/worker.py` Grok danas ne moze ni pokrenuti, jer uvijek salje `--subscription`, a
 * `SUBSCRIPTION_EXCLUDED_AGENTS` tada baca. Zato je izvan ovog garda dok se o tome ne odluci zasebno.
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

  /**
   * Prva izvedba ovog garda bila je TEKSTUALNA (`toContain` nad izvorom `cli.mjs`) i nije grizla:
   * mutacija koja `resolvePromptFileArgs` ostavi kao mrtav izraz, a spawna alias `const args = job.args`,
   * prolazi svaku takvu tvrdnju i Groku salje doslovnu oznaku. Zato se sada IZVODI ista funkcija koju
   * `cli.mjs` stvarno predaje `spawnSync`. Mutaciju drzi `tests/gate-mutations.test.ts`.
   */
  it('cli.mjs gradi spawn argumente funkcijom koja oznaku stvarno zamijeni', () => {
    const promptFile = '/tmp/out/T01-1-2/prompt.md';
    const grok = buildSpawnArgs(prepareJob(queue(), 'T01', 'implement', 'grok'), promptFile);
    expect(grok.join(' ')).not.toContain(PROMPT_FILE_PLACEHOLDER);
    expect(grok).toContain(promptFile);
    expect(grok[grok.indexOf('--prompt-file') + 1]).toBe(promptFile);

    // Provider bez oznake mora proci nepromijenjen, inace bi Codex i Claude ovisili o putanji prompta.
    for (const agent of ['sol', 'sonnet'] as const) {
      const job = prepareJob(queue(), 'T01', 'implement', agent, agent === 'sonnet' ? 3 : undefined);
      expect(buildSpawnArgs(job, promptFile)).toEqual(job.args);
    }
    // I bez putanje prompta, jer je cli.mjs pise tek uz sam poziv.
    const codex = prepareJob(queue(), 'T01', 'implement', 'sol');
    expect(buildSpawnArgs(codex, undefined)).toEqual(codex.args);

    // Posao bez `args` je greska, ne prazan argv koji provider protumaci kao interaktivni poziv.
    expect(() => buildSpawnArgs({ command: 'grok' }, promptFile)).toThrow(/args/);
  });
});

/**
 * Prethodni krug je gard nad izgradnjom argumenata sveo na `buildSpawnArgs`, ali NIJEDNA tvrdnja
 * nije vezala tu funkciju uz stvarni poziv provideru: mutacija `spawnSync(job.command, job.args, ...)`
 * u `main()` prolazila je cijeli suite, a Grok bi u produkciji dobio doslovni `--prompt-file
 * __PROMPT_FILE__` i trazio datoteku tog imena u cwd-u. Zato se ovdje izvodi `spawnJob`, jedini
 * poziv provideru, i mjeri se ono sto proces STVARNO dobije. Tvrdnju nad izvorom `cli.mjs` (da
 * `main()` taj poziv ne zaobilazi) drzi `tests/gate-mutations.test.ts`.
 */
describe('spawnJob je jedini poziv provideru i mjeri se ono sto proces dobije', () => {
  type Recorded = { command: string; args: string[]; options: Record<string, unknown> };

  const recorder = () => {
    const calls: Recorded[] = [];
    const spawn = (command: string, args: string[], options: Record<string, unknown>) => {
      calls.push({ command, args, options });
      return { status: 0, stdout: '', stderr: '', error: undefined, signal: null };
    };
    return { calls, spawn };
  };

  it('Grok dobije putanju prompta, nikad oznaku, i prompt ne prolazi kroz ljusku', () => {
    const { calls, spawn } = recorder();
    const promptFile = '/tmp/out/T01-1-2/prompt.md';
    const job = prepareJob(queue(), 'T01', 'implement', 'grok');
    spawnJob(job, promptFile, '/repo', spawn as never);
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe('grok');
    expect(calls[0].args.join(' ')).not.toContain(PROMPT_FILE_PLACEHOLDER);
    expect(calls[0].args[calls[0].args.indexOf('--prompt-file') + 1]).toBe(promptFile);
    // argv je polje, tekst ide na stdin: naslov zadatka nikad ne postaje naredba ljuske.
    expect(calls[0].options.shell).toBe(false);
    expect(calls[0].options.input).toBe(job.prompt);
    expect(calls[0].options.cwd).toBe('/repo');
  });

  it('Codex i Claude dobiju svoj argv nepromijenjen', () => {
    const { calls, spawn } = recorder();
    const codex = prepareJob(queue(), 'T01', 'implement', 'sol');
    spawnJob(codex, '/tmp/out/prompt.md', '/repo', spawn as never);
    expect(calls[0].args).toEqual(codex.args);
    const claude = prepareJob(queue(), 'T01', 'implement', 'sonnet', 3);
    spawnJob(claude, '/tmp/out/prompt.md', '/repo', spawn as never);
    expect(calls[1].args).toEqual(claude.args);
  });

  it('posao bez args ne postaje prazan argv koji provider cita kao interaktivni poziv', () => {
    const { calls, spawn } = recorder();
    expect(() => spawnJob({ command: 'grok' }, '/tmp/p.md', '/repo', spawn as never)).toThrow(/args/);
    expect(calls).toHaveLength(0);
  });
});

/**
 * Straza ulazne tocke koja usporeduje URL oblike (`import.meta.url === pathToFileURL(argv[1]).href`)
 * je tocna samo dok u stazi nema poveznice. ESM ulaznu tocku Node razrjesava na realpath, pa
 * `node <junction>\cli.mjs help` ispise NISTA i vrati 0. Junction na stablo je mehanizam koji ovaj
 * repozitorij izricito propisuje za worktreeve, pa bi se `npm run agents -- run ... --execute` tiho
 * pretvorio u no-op: nijedan model pozvan, nijedan artefakt napisan, a pozivatelj vidi exit 0.
 */
describe('cli.mjs se izvodi i kad je dohvacen kroz poveznicu', () => {
  const agentsDir = resolve(process.cwd(), 'scripts/agents');
  const cli = join(agentsDir, 'cli.mjs');
  const runHelp = (entry: string) =>
    spawnSync(process.execPath, [entry, 'help'], { encoding: 'utf8', timeout: 60_000 });

  const withLink = (body: (link: string) => void) => {
    const link = join(tmpdir(), `lekta-agents-${process.pid}-${Date.now()}`);
    symlinkSync(agentsDir, link, process.platform === 'win32' ? 'junction' : 'dir');
    try { body(link); } finally {
      try { rmdirSync(link); } catch { try { unlinkSync(link); } catch { /* poveznica je vec uklonjena */ } }
    }
  };

  it('help ispis nije prazan ni izravno ni kroz junction na scripts/agents', () => {
    const direct = runHelp(cli);
    // Tvrdi se ISPIS, ne izlazni kod: prazan ispis uz kod 0 je upravo kvar zbog kojeg test postoji.
    expect(`${direct.stdout ?? ''}${direct.stderr ?? ''}`.trim()).not.toBe('');
    expect(direct.stdout).toContain('--agent');
    withLink((link) => {
      const linked = runHelp(join(link, 'cli.mjs'));
      expect(`${linked.stdout ?? ''}${linked.stderr ?? ''}`.trim(),
        'cli.mjs kroz poveznicu nije ispisao nista: straza ulazne tocke nije okinula').not.toBe('');
      expect(linked.stdout).toBe(direct.stdout);
    });
  });

  it('straza okida na sebi i kroz poveznicu, a ne na tudjoj datoteci', () => {
    const self = pathToFileURL(cli).href;
    expect(isEntryModule(self, cli)).toBe(true);
    expect(isEntryModule(self, join(agentsDir, 'core.mjs'))).toBe(false);
    expect(isEntryModule(self, undefined as never)).toBe(false);
    withLink((link) => {
      expect(isEntryModule(self, join(link, 'cli.mjs'))).toBe(true);
      // Kontrola: URL oblici se kroz poveznicu NE poklapaju, pa razlika dolazi od razrjesavanja staze.
      expect(self === pathToFileURL(join(link, 'cli.mjs')).href).toBe(false);
    });
  });
});
