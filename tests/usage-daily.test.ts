// @vitest-environment node
/**
 * T82: dnevni izvjestaj potrosnje. Svi ulazi su SINTETICKE mape u privremenom direktoriju, nikad
 * stvarni ~/.claude, ~/.codex ni ~/.grok. Oblici redaka prate ono sto je izmjereno na disku
 * 2026-09-28 (samo imena polja i brojevi).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  claudeTokens,
  codexDelta,
  collectRecords,
  renderMarkdown,
  summarizeDay,
} from '../scripts/agents/usage-daily.mjs';

const WEIGHTS = { 'claude-sonnet-5': 1, 'claude-opus-5': 2.5 };
const TAJNA = 'TAJNI-SADRZAJ-PORUKE-NE-SMIJE-U-IZVJESTAJ';
const DAN = '2026-09-27';
let home: string;
let repo: string;

const jl = (rows: unknown[]) => `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
const claudeRow = (o: { id: string; req?: string; ts: string; model?: string; cwd?: string; session?: string; usage: object }) => ({
  type: 'assistant',
  sessionId: o.session ?? 'aaaaaaaa-1111-2222-3333-444444444444',
  cwd: o.cwd ?? 'X:\\radno\\Lekta',
  timestamp: o.ts,
  requestId: o.req ?? `req-${o.id}`,
  message: { id: o.id, model: o.model ?? 'claude-sonnet-5', content: [{ type: 'text', text: TAJNA }], usage: o.usage },
});

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'usage-daily-home-'));
  repo = mkdtempSync(join(tmpdir(), 'usage-daily-repo-'));
  const proj = join(home, '.claude', 'projects', 'X--radno-Lekta');
  mkdirSync(join(proj, 'aaaaaaaa-1111-2222-3333-444444444444', 'subagents'), { recursive: true });
  const u = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 10 };
  writeFileSync(join(proj, 'aaaaaaaa.jsonl'), jl([
    { type: 'user', sessionId: 'aaaaaaaa-1111-2222-3333-444444444444', cwd: 'X:\\radno\\Lekta', timestamp: `${DAN}T08:00:00`, message: { content: TAJNA } },
    claudeRow({ id: 'm1', ts: `${DAN}T09:00:00`, usage: u }),
    // Isti odgovor, drugi blok sadrzaja: isti brojevi, mora se brojati JEDNOM.
    claudeRow({ id: 'm1', ts: `${DAN}T09:00:01`, usage: u }),
    // Kasnije u sesiji cwd je worktree; oznaka sesije ostaje prva mapa (Lekta).
    claudeRow({ id: 'm2', ts: `${DAN}T10:00:00`, cwd: 'X:\\radno\\wt-kasnije', usage: u }),
    claudeRow({ id: 'm3', ts: '2026-09-26T10:00:00', usage: u }),
  ]) + '{ovo nije json\n');
  // Podagent u podmapi: rekurzivno citanje, ista sesija.
  writeFileSync(join(proj, 'aaaaaaaa-1111-2222-3333-444444444444', 'subagents', 'agent-x.jsonl'), jl([
    claudeRow({ id: 's1', ts: `${DAN}T11:00:00`, model: 'claude-opus-5', usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 0 } }),
  ]));

  const codexDir = join(home, '.codex', 'sessions', '2026', '09', '27');
  mkdirSync(codexDir, { recursive: true });
  const tot = (input: number, cached: number, output: number) => ({ input_tokens: input, cached_input_tokens: cached, output_tokens: output, cache_write_input_tokens: 0 });
  writeFileSync(join(codexDir, 'rollout-x.jsonl'), jl([
    { type: 'session_meta', timestamp: `${DAN}T07:00:00`, payload: { id: 'cccccccc-9999', cwd: 'X:\\radno\\Lekta' } },
    { type: 'turn_context', timestamp: `${DAN}T07:00:01`, payload: { model: 'gpt-test' } },
    { type: 'event_msg', timestamp: `${DAN}T07:01:00`, payload: { type: 'token_count', info: { total_token_usage: tot(1000, 800, 100) } } },
    // Ponovljen isti kumulativ: razlika 0, ne broji se dvaput.
    { type: 'event_msg', timestamp: `${DAN}T07:01:30`, payload: { type: 'token_count', info: { total_token_usage: tot(1000, 800, 100) } } },
    { type: 'event_msg', timestamp: `${DAN}T07:02:00`, payload: { type: 'token_count', info: { total_token_usage: tot(1500, 1200, 160) } } },
  ]));

  mkdirSync(join(repo, '.artifacts', 'agents'), { recursive: true });
  writeFileSync(join(repo, '.artifacts', 'agents', 'usage.jsonl'), jl([
    { observedAt: `${DAN}T12:00:00Z`, task: 'T82', provider: 'grok', requestedModel: 'grok-test', usage: { inputTokens: 40, outputTokens: 5, cachedInputTokens: 60, costUsd: 0.25 } },
    // Claude redak iz usage.jsonl se NE broji: vec je u transkriptu.
    { observedAt: `${DAN}T12:00:00Z`, task: 'T82', provider: 'claude', requestedModel: 'claude-sonnet-5', usage: { inputTokens: 999999, outputTokens: 999999 } },
  ]));
});

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

describe('usage-daily: tokeni po izvoru', () => {
  it('Claude: citanje kesa NIJE ulaz', () => {
    expect(claudeTokens({ input_tokens: 3, output_tokens: 4, cache_read_input_tokens: 500, cache_creation_input_tokens: 7 }))
      .toEqual({ input: 3, output: 4, cacheRead: 500, cacheWrite: 7 });
  });

  it('Codex: razlika kumulativa, kes se oduzima od ulaza', () => {
    const d = codexDelta({ input_tokens: 1000, cached_input_tokens: 800, output_tokens: 100 }, { input_tokens: 1500, cached_input_tokens: 1200, output_tokens: 160 });
    expect(d).toEqual({ input: 100, output: 60, cacheRead: 400, cacheWrite: 0 });
  });
});

describe('usage-daily: sinteticke mape', () => {
  it('skuplja sva tri izvora, bez duplikata, s podagentom, i broji osteceni redak', () => {
    const { records, stats } = collectRecords({ home, repo });
    const today = records.filter((r: { day: string }) => r.day === DAN);
    const claude = today.filter((r: { provider: string }) => r.provider === 'claude');
    expect(claude).toHaveLength(3); // m1 jednom, m2, podagent s1
    expect(claude.reduce((a: number, r: { input: number }) => a + r.input, 0)).toBe(210);
    const codex = today.filter((r: { provider: string }) => r.provider === 'codex') as Array<{ input: number; cacheRead: number; output: number }>;
    const zbroj = (k: 'input' | 'cacheRead' | 'output') => codex.reduce((a, r) => a + r[k], 0);
    // Prvi dogadjaj 1000 ulaza od kojih 800 kes, drugi +500 od kojih +400 kes; ponovljeni kumulativ 0.
    expect([zbroj('input'), zbroj('cacheRead'), zbroj('output')]).toEqual([300, 1200, 160]);
    const grok = today.filter((r: { provider: string }) => r.provider === 'grok');
    expect(grok).toHaveLength(1);
    expect(stats.malformedLines).toBe(1);
  });

  it('oznaka sesije je kratki ID i PRVA mapa, a tekst poruke nikad ne ulazi u izvjestaj', () => {
    const { records, stats } = collectRecords({ home, repo });
    const s = summarizeDay(records, DAN, WEIGHTS, { weekly: true });
    expect(s.topSessions.map((t: { session: string }) => t.session)).toContain('aaaaaaaa Lekta');
    const md = renderMarkdown(s, stats);
    expect(md).not.toContain(TAJNA);
    expect(md).not.toContain('wt-kasnije');
    expect(md).toContain('## Prijedlozi optimizacije');
    expect(md).toContain('gpt-test'); // model bez tezine je vidljiv i oznacen kao anomalija
    expect(s.anomalies.some((a: string) => a.includes('gpt-test') && a.includes('costWeight'))).toBe(true);
  });

  it('tezina = costWeight x (ulaz + izlaz); citanje kesa ne dize tezinu', () => {
    const { records } = collectRecords({ home, repo });
    const s = summarizeDay(records, DAN, WEIGHTS);
    const sonnet = s.rows.find((r: { model: string }) => r.model === 'claude-sonnet-5');
    expect(sonnet.weight).toBe(1 * (200 + 100));
    const opus = s.rows.find((r: { model: string }) => r.model === 'claude-opus-5');
    expect(opus.weight).toBe(2.5 * (10 + 20));
  });

  it('prazan dan: nula, bez pada, uz anomaliju za providere aktivne ranije', () => {
    const { records, stats } = collectRecords({ home, repo });
    const s = summarizeDay(records, '2026-09-28', WEIGHTS);
    expect(s.rows).toEqual([]);
    expect(s.totalWeight).toBe(0);
    expect(s.anomalies.some((a: string) => a.includes('provider claude'))).toBe(true);
    expect(renderMarkdown(s, stats)).toContain('nema zapisa za ovaj dan');
  });
});
