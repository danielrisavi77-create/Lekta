// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  prepareJob, parseGrokVersion, parseResult, validateQueue,
  PROMPT_FILE_PLACEHOLDER, SUBSCRIPTION_EXCLUDED_AGENTS,
} from '../scripts/agents/core.mjs';

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
      .toEqual({ ok: true, reportedModels: ['grok-4.6-build'] });
    expect(parseResult('grok', JSON.stringify({ text: '', stopReason: 'end_turn', num_turns: 1, modelUsage: {} }), 0).ok).toBe(false);
    expect(parseResult('grok', '{"type":"result","is_error":false,"model":"grok-4.6"}', 0).ok).toBe(false);
    expect(parseResult('grok', '{"type":"result","is_error":true,"model":"grok-4.6"}', 0).ok).toBe(false);
  });
  it('accepts the captured Grok 1.0.34 contract fixture', () => {
    const stdout = readFileSync('tests/fixtures/grok-result-1.0.34.json', 'utf8');
    expect(parseResult('grok', stdout, 0))
      .toEqual({ ok: true, reportedModels: ['grok-4.6-build'] });
  });
  /**
   * PROVENIJENCIJA FIXTURA. Oba su snimka nastala na razvojnom stroju 2026-09-21 s Grok CLI 1.0.34:
   * uspjeh u 00:12:50, odmah nakon `grok login --device-code`, greska u 00:11:14, prije prijave.
   * Snimci su lezali u sesijskom scratchpadu (`grok-probe-live.log`, `grok-probe-workspace.log`); taj
   * je direktorij privremen i namjerno ne ide u repozitorij, pa su fixture jedini trajni zapis.
   * Izmijenjena su TOCNO tri polja, jer nose identitet i sadrzaj zive sesije: `sessionId`, `requestId`
   * i `thought`. Sve ostalo, ukljucujuci brojke potrosnje, doslovno je iz snimka; uvlaka i prijelomi
   * redaka nisu mjerodavni jer parser radi `JSON.parse`.
   * Zato test ispod, osim presude parsera, tvrdi jos dvoje sto rucno pisan fixture ne bi imao: zivi
   * skup polja i internu relaciju `total_cost_usd_ticks === total_cost_usd * 1e10`. Ta je relacija
   * jeftin dokaz da brojke nisu napisane nego izmjerene; rucno zaokruzena cijena je obara.
   * Uspjesan odgovor NEMA polje `type`; greska ga ima. `parseResult` se ovime ne mijenja: fixture
   * postoje da svaka buduca izmjena parsera padne ako prestane tocno presuditi bas ZIVI oblik, a ne
   * samo skraceni oblik iz rucno pisanih nizova iznad.
   */
  it('presuduje zive Grok 1.0.34 odgovore, i uspjeh i gresku', () => {
    const success = readFileSync('tests/fixtures/agents/grok-success.json', 'utf8');
    const failure = readFileSync('tests/fixtures/agents/grok-error.json', 'utf8');
    expect(parseResult('grok', success, 0)).toEqual({ ok: true, reportedModels: ['grok-4.6-build'] });
    expect(parseResult('grok', failure, 1).ok).toBe(false);
    // Cak i kad bi CLI pogresno izasao s 0, oblik greske sam po sebi nije uspjeh.
    expect(parseResult('grok', failure, 0).ok).toBe(false);
    // Fixture nosi ZIVI skup polja, ne samo ona koja parser gleda.
    const parsed = JSON.parse(success);
    expect(Object.keys(parsed).sort()).toEqual([
      'modelUsage', 'num_turns', 'requestId', 'sessionId', 'stopReason',
      'text', 'thought', 'total_cost_usd', 'total_cost_usd_ticks', 'usage',
    ]);
    expect(parsed.type).toBeUndefined();
    expect(Object.keys(parsed.usage).sort()).toEqual([
      'cache_creation_input_tokens', 'cache_read_input_tokens', 'input_tokens',
      'output_tokens', 'reasoning_tokens', 'total_tokens',
    ]);
    expect(Object.keys(parsed.modelUsage)).toEqual(['grok-4.6-build']);
    // Izmjerene brojke, ne zaokruzene: CLI izvjestava cijenu i u tickovima od 1e-10 USD, pa su
    // dvije vrijednosti vezane. Fixture napisan napamet (npr. 0.0148 uz 148 tickova) ovdje pada.
    expect(parsed.total_cost_usd).toBe(0.01476756);
    expect(parsed.total_cost_usd_ticks).toBe(147675600);
    expect(Math.round(parsed.total_cost_usd * 1e10)).toBe(parsed.total_cost_usd_ticks);
    expect(parsed.modelUsage['grok-4.6-build'].costUSD).toBe(parsed.total_cost_usd);
    // Zbroj potrosnje je takodjer iz mjerenja: ulaz plus procitani predmemorirani ulaz plus izlaz
    // daje ukupno, dok je `reasoning_tokens` sadrzan u izlazu (27 od 28), a ne dodan na njega.
    const u = parsed.usage;
    expect(u.input_tokens + u.cache_read_input_tokens + u.output_tokens).toBe(u.total_tokens);
    expect(u.reasoning_tokens).toBeLessThanOrEqual(u.output_tokens);
    expect(parsed.modelUsage['grok-4.6-build'].inputTokens).toBe(u.input_tokens);
    expect(parsed.modelUsage['grok-4.6-build'].cacheReadInputTokens).toBe(u.cache_read_input_tokens);
    const failureParsed = JSON.parse(failure);
    expect(failureParsed.type).toBe('error');
    // Ziva poruka nije skracena: CLI sam nudi `XAI_API_KEY` kao izlaz, a bas to pretplatnicki
    // profil zabranjuje, pa je cijela recenica dio ugovora koji fixture cuva.
    expect(failureParsed.message).toContain('grok login --device-code');
    expect(failureParsed.message).toContain('XAI_API_KEY');
    // Redakcija: nijedan zivi identifikator ni sadrzaj razmisljanja ne smije zavrsiti u repozitoriju.
    expect(parsed.sessionId).toBe('00000000-0000-0000-0000-000000000000');
    expect(parsed.requestId).toBe('00000000-0000-0000-0000-000000000001');
    expect(parsed.thought).toBe('[redigirano]');
  });
  it('classifies Grok versions against the verified minimum', () => {
    expect(parseGrokVersion('grok 1.0.34 (3736acbc8658)'))
      .toEqual({ version: '1.0.34', supported: true });
    expect(parseGrokVersion('grok 1.0.33 (old)'))
      .toEqual({ version: '1.0.33', supported: false });
    expect(parseGrokVersion('unexpected')).toEqual({ version: null, supported: false });
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
  /**
   * Odluka vlasnika 2026-09-21: Grok radi na SuperGrok pretplatu (`grok login`), dakle oba aliasa
   * moraju biti U pretplatnickom profilu. Popis iskljucenih je prikovan tocnom vrijednoscu jer je
   * jedina stvar koja tu odluku moze tiho vratiti unatrag.
   */
  it('iskljucuje samo Fable iz pretplatnickog profila', () => {
    expect([...SUBSCRIPTION_EXCLUDED_AGENTS]).toEqual(['fable']);
    expect(Object.isFrozen(SUBSCRIPTION_EXCLUDED_AGENTS)).toBe(true);
    expect(SUBSCRIPTION_EXCLUDED_AGENTS).not.toContain('grok');
    expect(SUBSCRIPTION_EXCLUDED_AGENTS).not.toContain('build');
  });
  it('pusta oba Grok aliasa u pretplatnicki profil kad okolina nema xAI kljuc', () => {
    const plan = prepareJob(queue(), 'T01', 'plan', 'grok', undefined, { billingMode: 'subscription', env: {} });
    expect(plan.command).toBe('grok');
    expect(plan.billingMode).toBe('subscription');
    expect(plan.args).not.toContain('--max-budget-usd');
    const impl = prepareJob(queue(), 'T01', 'implement', 'build', undefined, { billingMode: 'subscription', env: {} });
    expect(impl.command).toBe('grok');
    expect(impl.args).toContain('--always-approve');
    // Prazan kljuc nije postavljen kljuc.
    expect(prepareJob(queue(), 'T01', 'plan', 'grok', undefined, { billingMode: 'subscription', env: { XAI_API_KEY: '' } }).command)
      .toBe('grok');
  });
  /**
   * NOVI GARD: `XAI_API_KEY` bi Grok CLI prebacio s pretplate na naplatu po pozivu, pa je u
   * pretplatnickom nacinu greska prije pripreme, po uzoru na `--budget-usd` za Claude.
   */
  it('odbija xAI kljuc u okolini u pretplatnickom nacinu, za oba aliasa', () => {
    const env = { XAI_API_KEY: 'xai-placeholder' };
    expect(() => prepareJob(queue(), 'T01', 'plan', 'grok', undefined, { billingMode: 'subscription', env }))
      .toThrow(/XAI_API_KEY/);
    expect(() => prepareJob(queue(), 'T01', 'implement', 'build', undefined, { billingMode: 'subscription', env }))
      .toThrow(/XAI_API_KEY/);
    expect(() => prepareJob(queue(), 'T01', 'plan', 'grok', undefined, { billingMode: 'subscription', env }))
      .toThrow(/subscription/);
    // Rucni nacin naplate je nepromijenjen: kljuc je ondje legitiman.
    expect(prepareJob(queue(), 'T01', 'plan', 'grok', undefined, { env }).command).toBe('grok');
    expect(prepareJob(queue(), 'T01', 'implement', 'build', undefined, { env }).command).toBe('grok');
    // Gard je uzak: ne dira ne-Grok providere.
    expect(() => prepareJob(queue(), 'T01', 'implement', 'sol', undefined, { billingMode: 'subscription', env }))
      .not.toThrow();
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

/**
 * ZASTO OVAJ BLOK POSTOJI. Otvaranje pretplatnickog profila cini Grok posao pripremljivim, ali
 * presudu o ishodu u autonomnom lancu ne donosi `parseResult` iz `scripts/agents/core.mjs` nego
 * njegovo python zrcalo `parse_provider_output` u `scripts/autonomy/worker.py`. Fixture iznad
 * prikivaju samo JS stranu, pa bi bez ovoga ostalo neprimijeceno da zrcalo jos nema granu za Grok.
 *
 * IZMJERENO 2026-09-23 izravnim pozivom te funkcije nad commitanim fixturama (python, uvoz
 * `autonomy.worker` iz `scripts/`): viseredni uspjeh daje
 * `{ok: False, reason: 'neispravan ili truncirani JSON'}`, jednoredni uspjeh daje
 * `{ok: False, reason: 'codex bez turn.completed ili s greskom'}`, dok kontrolni Claude oblik daje
 * `{ok: True}`, sto pokazuje da sama funkcija radi. Dakle svaki USPJESAN Grok posao u autonomiji
 * dobiva verdict pada i kontroler ga moze ponavljati na teret pretplatnicke kvote.
 *
 * `scripts/autonomy/**` je ovim zadatkom zabranjen za izmjenu, pa se kvar ovdje ne popravlja nego
 * PRIKIVA, zajedno s biljeskom u `docs/agents/README.md`. Test je dvosmjeran: cim zrcalo dobije
 * granu za Grok, tvrdnja ispod pada i tjera da se biljeska i ovaj blok maknu, umjesto da ostanu
 * kao zastarjela tvrdnja o kvaru koji vise ne postoji.
 */
describe('python zrcalo presude jos ne poznaje Grok (prikovan poznat kvar)', () => {
  const mirrorSource = () => readFileSync('scripts/autonomy/worker.py', 'utf8');
  /** Tijelo funkcije se izdvaja strukturno, od njezine `def` do sljedece `def` u nultom stupcu. */
  const parseProviderOutputBody = (source: string): string => {
    const lines = source.split(/\r?\n/);
    const start = lines.findIndex((line) => line.startsWith('def parse_provider_output('));
    // Preimenovanje funkcije ne smije tiho proci kao "nema grane za Grok".
    expect(start).toBeGreaterThan(-1);
    const rest = lines.slice(start + 1);
    const end = rest.findIndex((line) => line.startsWith('def '));
    return (end === -1 ? rest : rest.slice(0, end)).join('\n');
  };

  it('zrcalo grana samo na claude, a inace trazi codex turn.completed', () => {
    const body = parseProviderOutputBody(mirrorSource());
    expect(body).toContain('command == "claude"');
    expect(body).toContain('turn.completed');
    // Jezgra tvrdnje: nijedna grana ne spominje Grok, pa uspjeh pada u codex granu.
    expect(body.toLowerCase()).not.toContain('grok');
  });

  it('zivi Grok uspjeh nema nista sto bi ga u codex grani spasilo', () => {
    const success = readFileSync('tests/fixtures/agents/grok-success.json', 'utf8');
    const parsed = JSON.parse(success);
    // Codex grana trazi dogadjaj s `type === 'turn.completed'`; zivi uspjeh nema ni polje `type`.
    expect(parsed.type).toBeUndefined();
    expect(success).not.toContain('turn.completed');
    // Uz to je fixture viseredni JSON, pa `json.loads` po retku pada vec na prvom retku.
    expect(success.trim().split(/\r?\n/).length).toBeGreaterThan(1);
    expect(success.trim().split(/\r?\n/)[0].trim()).toBe('{');
    // Suprotnost, radi kontrole: JS strana isti taj snimak presudjuje tocno.
    expect(parseResult('grok', success, 0)).toEqual({ ok: true, reportedModels: ['grok-4.6-build'] });
  });

  it('biljeska o kvaru stoji u vodicu dok kvar traje', () => {
    const readme = readFileSync('docs/agents/README.md', 'utf8');
    expect(readme).toContain('parse_provider_output');
    expect(readme).toContain('scripts/autonomy/worker.py');
  });
});
