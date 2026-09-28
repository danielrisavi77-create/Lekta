#!/usr/bin/env node
/**
 * T82: dnevni izvjestaj potrosnje tokena (Claude Code, Codex, Grok) na ovom stroju.
 *
 * Izvori, SAMO citanje:
 *   Claude Code  ~/.claude/projects/**\/*.jsonl (rekurzivno, pa i podagenti). Redak s
 *                `message.usage` i `message.model`. Isti odgovor se u transkriptu ponavlja po
 *                bloku sadrzaja s istim brojevima, pa se broji jednom po `message.id` + `requestId`.
 *   Codex        ~/.codex/sessions/YYYY/MM/DD/*.jsonl. `event_msg/token_count` nosi KUMULATIVNI
 *                `total_token_usage` po sesiji; po danu se zbrajaju razlike uzastopnih dogadjaja.
 *                Codexov `input_tokens` ukljucuje `cached_input_tokens`, pa se kes oduzima od ulaza.
 *                Model je iz zadnjeg `turn_context` prije dogadjaja.
 *   Grok         lokalni CLI ne pise potrosnju (~/.grok/sessions/.../summary.json nema tokena), pa
 *                Grok pokriva samo `.artifacts/agents/usage.jsonl` (redci s `provider: grok`).
 *                Claude i Codex redci iz te datoteke se NE broje, jer su vec u transkriptima.
 *
 * Privatnost: izvjestaj nikad ne sadrzi tekst poruka. Sesija je oznacena prvih 8 znakova ID-a i
 * imenom zadnje mape radnog direktorija (projekt ili worktree), bez ostatka putanje.
 *
 * Tezina = costWeight(model) x (ulaz + izlaz), kao u `usage-report.mjs`; citanje kesa nije ulaz.
 * Model bez tezine u `config/agent-routing.json` dobiva null, nikad izmisljenu vrijednost.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCostWeights, readUsageLog } from './usage-report.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Lokalni datum YYYY-MM-DD za trenutak (izvjestaj je po lokalnom danu vlasnika). */
export function localDay(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/** Claude API: `input_tokens` NE ukljucuje citanje ni pisanje kesa. */
export function claudeTokens(usage) {
  return {
    input: num(usage?.input_tokens),
    output: num(usage?.output_tokens),
    cacheRead: num(usage?.cache_read_input_tokens),
    cacheWrite: num(usage?.cache_creation_input_tokens),
  };
}

/** Codex: `input_tokens` UKLJUCUJE `cached_input_tokens`; razlika dvaju kumulativnih stanja. */
export function codexDelta(prev, cur) {
  const d = (k) => Math.max(0, num(cur?.[k]) - num(prev?.[k]));
  const cached = d('cached_input_tokens');
  return {
    input: Math.max(0, d('input_tokens') - cached),
    output: d('output_tokens'),
    cacheRead: cached,
    cacheWrite: d('cache_write_input_tokens'),
  };
}

function* walkJsonl(dir, minMtimeMs = 0) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) yield* walkJsonl(p, minMtimeMs);
    // Datoteka zadnji put mijenjana prije najranijeg trazenog dana ne moze imati zapis iz njega.
    else if (name.endsWith('.jsonl') && st.mtimeMs >= minMtimeMs) yield p;
  }
}

function readJsonl(path, stats) {
  const out = [];
  let text;
  try { text = readFileSync(path, 'utf8'); } catch { stats.unreadableFiles += 1; return out; }
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { stats.malformedLines += 1; }
  }
  return out;
}

const label = (id, cwd) => `${String(id ?? '?').slice(0, 8)} ${cwd ? basename(String(cwd).replace(/[\\/]+$/, '')) : '?'}`;

/** @returns {{ records: object[], stats: { malformedLines: number, unreadableFiles: number } }} */
export function collectRecords({ home = homedir(), repo = ROOT, sinceDay = null } = {}) {
  const stats = { malformedLines: 0, unreadableFiles: 0 };
  const records = [];
  const minMtimeMs = sinceDay ? new Date(`${sinceDay}T00:00:00`).getTime() : 0;
  // Sesija se grupira po ID-u; projekt je mapa NAJRANIJEG zapisa sesije (cwd se tijekom sesije
  // mijenja, a datoteke se ne citaju kronoloski). Oznaka se zato dodjeljuje tek nakon citanja.
  const firstCwd = new Map();
  const claudeRecords = [];

  const seen = new Set();
  for (const file of walkJsonl(join(home, '.claude', 'projects'), minMtimeMs)) {
    for (const j of readJsonl(file, stats)) {
      const m = j?.message;
      if (!m?.usage || !m.model || m.model === '<synthetic>') continue;
      const key = `${m.id ?? j.uuid}|${j.requestId ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const day = localDay(j.timestamp);
      if (!day) continue;
      const ts = Date.parse(j.timestamp);
      const known = firstCwd.get(j.sessionId);
      if (j.sessionId && j.cwd && (!known || ts < known.ts)) firstCwd.set(j.sessionId, { ts, cwd: j.cwd });
      claudeRecords.push({ provider: 'claude', model: m.model, day, sessionId: j.sessionId, cwd: j.cwd, ...claudeTokens(m.usage) });
    }
  }
  for (const { sessionId, cwd, ...r } of claudeRecords) {
    records.push({ ...r, session: label(sessionId, firstCwd.get(sessionId)?.cwd ?? cwd) });
  }

  for (const file of walkJsonl(join(home, '.codex', 'sessions'), minMtimeMs)) {
    let model = null, session = label(basename(file, '.jsonl').slice(-36), null), prev = null;
    for (const j of readJsonl(file, stats)) {
      const pl = j?.payload;
      if (j?.type === 'session_meta' && pl) session = label(pl.id ?? pl.session_id, pl.cwd);
      if (j?.type === 'turn_context' && pl?.model) model = pl.model;
      if (pl?.type !== 'token_count' || !pl.info?.total_token_usage) continue;
      const cur = pl.info.total_token_usage;
      const delta = codexDelta(prev, cur);
      prev = cur;
      const day = localDay(j.timestamp);
      if (!day || delta.input + delta.output + delta.cacheRead + delta.cacheWrite === 0) continue;
      records.push({ provider: 'codex', model: model ?? 'nepoznat', day, session, ...delta });
    }
  }

  const { records: logged, malformedLines } = readUsageLog(join(repo, '.artifacts', 'agents', 'usage.jsonl'));
  stats.malformedLines += malformedLines;
  for (const r of logged) {
    if (r.provider !== 'grok') continue;
    const day = localDay(r.observedAt);
    if (!day) continue;
    const u = r.usage ?? {};
    records.push({
      provider: 'grok',
      model: (Array.isArray(r.reportedModels) && r.reportedModels[0]) || r.requestedModel || 'nepoznat',
      day,
      session: label(r.task ?? r.agent, null).replace(/ \?$/, ''),
      input: num(u.inputTokens),
      output: num(u.outputTokens),
      cacheRead: num(u.cachedInputTokens),
      cacheWrite: num(u.cacheWriteInputTokens),
      costUsd: typeof u.costUsd === 'number' ? u.costUsd : null,
    });
  }
  return { records, stats };
}

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDay(d);
}

const weightOf = (r, weights) => (typeof weights[r.model] === 'number' ? weights[r.model] * (r.input + r.output) : null);

/** Cista agregacija za jedan dan uz prethodnih 7 dana kao usporedbu. */
export function summarizeDay(records, day, weights, { weekly = false } = {}) {
  const today = records.filter((r) => r.day === day);
  const history = records.filter((r) => r.day < day && r.day >= addDays(day, -7));

  const models = new Map();
  for (const r of today) {
    const k = `${r.provider}\u0000${r.model}`;
    const m = models.get(k) ?? { provider: r.provider, model: r.model, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, weight: 0, weightKnown: true, costUsd: null };
    m.input += r.input; m.output += r.output; m.cacheRead += r.cacheRead; m.cacheWrite += r.cacheWrite;
    const w = weightOf(r, weights);
    if (w == null) m.weightKnown = false; else m.weight += w;
    if (typeof r.costUsd === 'number') m.costUsd = (m.costUsd ?? 0) + r.costUsd;
    models.set(k, m);
  }
  const rows = [...models.values()].map((m) => ({ ...m, weight: m.weightKnown ? m.weight : null }))
    .sort((a, b) => a.provider.localeCompare(b.provider) || (b.weight ?? -1) - (a.weight ?? -1));

  const sessionWeights = (list) => {
    const s = new Map();
    for (const r of list) {
      const w = weightOf(r, weights);
      if (w == null) continue;
      const k = `${r.day}\u0000${r.provider}\u0000${r.session}`;
      s.set(k, { provider: r.provider, session: r.session, weight: (s.get(k)?.weight ?? 0) + w });
    }
    return [...s.values()];
  };
  const todaySessions = sessionWeights(today).sort((a, b) => b.weight - a.weight);
  const histSessions = sessionWeights(history);
  const avgSession = histSessions.length ? histSessions.reduce((a, s) => a + s.weight, 0) / histSessions.length : null;

  const total = (list) => list.reduce((a, r) => a + (weightOf(r, weights) ?? 0), 0);
  const histDays = new Set(history.map((r) => r.day));
  const avgDay = histDays.size ? total(history) / 7 : null;

  const input = today.reduce((a, r) => a + r.input, 0);
  const cacheRead = today.reduce((a, r) => a + r.cacheRead, 0);
  const cacheShare = input + cacheRead > 0 ? cacheRead / (input + cacheRead) : null;

  const anomalies = [];
  if (avgSession) {
    for (const s of todaySessions) if (s.weight > 3 * avgSession) anomalies.push(`sesija ${s.session} (${s.provider}) ima tezinu ${fmt(s.weight)}, vise od 3x prosjeka sesije prethodnih 7 dana (${fmt(avgSession)})`);
  }
  for (const p of new Set(history.map((r) => r.provider))) {
    if (!today.some((r) => r.provider === p)) anomalies.push(`provider ${p} je bio aktivan u prethodnih 7 dana, a danas nema nijednog zapisa`);
  }
  for (const r of rows) if (r.weight == null) anomalies.push(`model ${r.model} (${r.provider}) nema costWeight u config/agent-routing.json, pa tezina nije izracunata`);

  const suggestions = [];
  if (weekly) {
    const week = records.filter((r) => r.day <= day && r.day > addDays(day, -7));
    const byProv = new Map();
    for (const r of week) {
      const b = byProv.get(r.provider) ?? { input: 0, cacheRead: 0 };
      b.input += r.input; b.cacheRead += r.cacheRead; byProv.set(r.provider, b);
    }
    for (const [p, b] of byProv) {
      const share = b.input + b.cacheRead > 0 ? b.cacheRead / (b.input + b.cacheRead) : null;
      if (share != null && share < 0.5) suggestions.push(`${p}: udio kesa u tjednu je ${pct(share)}, ispod 50 %; dulje sesije sa stabilnim uvodom i manje hladnih startova podizu ga`);
    }
    const wTotal = total(week);
    const heavy = week.filter((r) => (weights[r.model] ?? 0) >= 2.5).reduce((a, r) => a + (weightOf(r, weights) ?? 0), 0);
    if (wTotal > 0 && heavy / wTotal > 0.5) suggestions.push(`${pct(heavy / wTotal)} tjedne tezine otpada na modele s costWeight >= 2,5; docs i light zadatke iz docs/agents/tasks.json usmjeriti na claude-sonnet-5`);
    const perProjectDay = new Map();
    for (const s of sessionWeights(week)) {
      const k = s.session.split(' ').slice(1).join(' ');
      perProjectDay.set(k, (perProjectDay.get(k) ?? 0) + 1);
    }
    for (const [proj, n] of perProjectDay) if (n > 35) suggestions.push(`projekt ${proj}: ${n} sesija u tjednu; provjeriti ponovljene runove istog zadatka`);
    if (!suggestions.length) suggestions.push('nema prijedloga: brojke ne pokazuju ocito rasipanje');
  }

  return {
    day,
    rows,
    topSessions: todaySessions.slice(0, 5),
    cacheShare,
    totalWeight: total(today),
    avgDay,
    historyDays: histDays.size,
    anomalies,
    suggestions: weekly ? suggestions : null,
  };
}

function fmt(n) {
  return n == null ? 'n/a' : Math.round(n).toLocaleString('hr-HR');
}
function pct(x) {
  return x == null ? 'n/a' : `${(x * 100).toFixed(1).replace('.', ',')} %`;
}

export function renderMarkdown(s, stats) {
  const L = [];
  L.push(`# Potrosnja tokena ${s.day}`, '');
  L.push(`Ukupna tezina: ${fmt(s.totalWeight)}; prosjek dana u prethodnih 7 dana: ${fmt(s.avgDay)} (dana sa zapisom: ${s.historyDays}). Udio kesa: ${pct(s.cacheShare)}.`, '');
  L.push('## Po provideru i modelu', '');
  L.push('| Provider | Model | Ulaz | Izlaz | Kes citanje | Kes pisanje | Tezina |', '| --- | --- | ---: | ---: | ---: | ---: | ---: |');
  if (!s.rows.length) L.push('| - | nema zapisa za ovaj dan | 0 | 0 | 0 | 0 | 0 |');
  for (const r of s.rows) L.push(`| ${r.provider} | ${r.model} | ${fmt(r.input)} | ${fmt(r.output)} | ${fmt(r.cacheRead)} | ${fmt(r.cacheWrite)} | ${fmt(r.weight)}${r.costUsd != null ? ` (${r.costUsd.toFixed(2)} USD)` : ''} |`);
  L.push('', '## Top 5 sesija po tezini', '');
  if (!s.topSessions.length) L.push('- nema');
  for (const t of s.topSessions) L.push(`- ${t.session} (${t.provider}): ${fmt(t.weight)}`);
  L.push('', '## Anomalije', '');
  if (!s.anomalies.length) L.push('- nema');
  for (const a of s.anomalies) L.push(`- ${a}`);
  if (s.suggestions) {
    L.push('', '## Prijedlozi optimizacije', '');
    for (const p of s.suggestions) L.push(`- ${p}`);
  }
  L.push('', `Preskoceno ostecenih JSON redaka: ${stats.malformedLines}; necitljivih datoteka: ${stats.unreadableFiles}. Grok je pokriven samo kroz .artifacts/agents/usage.jsonl.`, '');
  return L.join('\n');
}

function parseArgs(argv) {
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  return {
    json: argv.includes('--json'),
    weeklyFlag: argv.includes('--weekly'),
    day: opt('--day'),
    repo: opt('--repo'),
    home: opt('--home'),
    outDir: opt('--out-dir'),
  };
}

function main(argv) {
  const a = parseArgs(argv);
  const repo = resolve(a.repo ?? ROOT);
  const day = a.day ?? localDay(new Date(Date.now() - 24 * 3600 * 1000));
  const weekly = a.weeklyFlag || new Date(`${day}T12:00:00`).getDay() === 0;
  const weights = readCostWeights(join(repo, 'config', 'agent-routing.json'));
  const { records, stats } = collectRecords({ home: a.home ?? homedir(), repo, sinceDay: addDays(day, -8) });
  const summary = summarizeDay(records, day, weights, { weekly });
  if (a.json) {
    process.stdout.write(`${JSON.stringify({ ...summary, stats }, null, 2)}\n`);
    return;
  }
  const md = renderMarkdown(summary, stats);
  const outDir = a.outDir ?? join(homedir(), 'Lekta-usage');
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${day}.md`);
  writeFileSync(out, md, 'utf8');
  process.stdout.write(`${md}\nZapisano: ${out}\n`);
}

const entry = (process.argv[1] ?? '').replace(/\\/g, '/');
if (entry.endsWith('scripts/agents/usage-daily.mjs')) main(process.argv.slice(2));
