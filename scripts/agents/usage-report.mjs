#!/usr/bin/env node
/**
 * Izvjestaj o potrosnji agentskih poziva iz `.artifacts/agents/usage.jsonl`.
 *
 * `usage.jsonl` pise ISKLJUCIVO `scripts/agents/cli.mjs` (jedan JSON redak po pokretanju agenta).
 * Ova skripta datoteku SAMO cita; nikad je ne mijenja. Oblik retka (izmjeren iz cli.mjs, ne
 * pretpostavljen):
 *   { observedAt, task, phase, agent, provider, requestedModel, reportedModels,
 *     usage: { inputTokens, cachedInputTokens, cacheWriteInputTokens, outputTokens,
 *              reasoningOutputTokens, totalTokens, costUsd, modelCalls } (bilo koje polje moze biti
 *              null ili nedostajati; `usage` sam moze nedostajati), exitCode, status }
 *
 * `summarizeUsage` je cista funkcija (bez I/O) da bi test mogao podmetnuti proizvoljne zapise
 * ukljucivo rubne slucajeve (zapis bez `usage`, nepoznat model bez `costWeight`, granica razdoblja).
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const USAGE_LOG_PATH = resolve(ROOT, '.artifacts/agents/usage.jsonl');
const ROUTING_CONFIG_PATH = resolve(ROOT, 'config/agent-routing.json');

/**
 * Cita `usage.jsonl` redak po redak. Prazna datoteka ili nepostojeca datoteka vraca prazan niz
 * (poziva ovo mora ispisati "nema zapisa", ne pasti). Redak koji nije valjan JSON se preskace uz
 * upozorenje umjesto da obori cijelo citanje (djelomican pad ulaza ne smije lagati o cjelini, pa se
 * broj preskocenih redaka vraca zajedno s podacima).
 *
 * @param {string} path
 * @returns {{ records: Record<string, unknown>[], malformedLines: number }}
 */
export function readUsageLog(path = USAGE_LOG_PATH) {
  if (!existsSync(path)) return { records: [], malformedLines: 0 };
  const raw = readFileSync(path, 'utf8');
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const records = [];
  let malformedLines = 0;
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        records.push(parsed);
      } else {
        malformedLines += 1;
      }
    } catch {
      malformedLines += 1;
    }
  }
  return { records, malformedLines };
}

/**
 * Ucitava `costWeight` mapu iz `config/agent-routing.json`. Nedostupna ili nevaljana konfiguracija
 * daje praznu mapu (svaki model tad dobiva `costWeight: null` uz upozorenje), nikad izmisljenu
 * tezinu.
 *
 * @param {string} path
 * @returns {Record<string, number>}
 */
export function readCostWeights(path = ROUTING_CONFIG_PATH) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const weights = parsed?.costWeight;
    if (weights && typeof weights === 'object' && !Array.isArray(weights)) return weights;
    return {};
  } catch {
    return {};
  }
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function addNullable(a, b) {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

function emptyBucket() {
  return { calls: 0, failed: 0, inputTokens: null, outputTokens: null, cachedInputTokens: null };
}

function addToBucket(bucket, record, failed) {
  bucket.calls += 1;
  if (failed) bucket.failed += 1;
  const usage = record.usage && typeof record.usage === 'object' ? record.usage : {};
  bucket.inputTokens = addNullable(bucket.inputTokens, numberOrNull(usage.inputTokens));
  bucket.outputTokens = addNullable(bucket.outputTokens, numberOrNull(usage.outputTokens));
  bucket.cachedInputTokens = addNullable(bucket.cachedInputTokens, numberOrNull(usage.cachedInputTokens));
}

/**
 * Model kojem se pripisuje zapis: prvi `reportedModels` ako postoji i neprazan, inace
 * `requestedModel`, inace 'nepoznat'. `reportedModels` je zivi izlaz modela (sto je stvarno
 * odgovorilo), pa ima prednost nad onim sto je trazeno.
 *
 * @param {Record<string, unknown>} record
 * @returns {string}
 */
function modelFor(record) {
  if (Array.isArray(record.reportedModels) && record.reportedModels.length > 0
    && typeof record.reportedModels[0] === 'string' && record.reportedModels[0].length > 0) {
    return record.reportedModels[0];
  }
  if (typeof record.requestedModel === 'string' && record.requestedModel.length > 0) {
    return record.requestedModel;
  }
  return 'nepoznat';
}

function keyFor(record, field, fallback) {
  const value = record[field];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/**
 * Cista funkcija: agregira `records` (vec parsirani `usage.jsonl` retci) u izvjestaj.
 *
 * @param {Record<string, unknown>[]} records
 * @param {{ sinceDate?: Date|null, costWeights?: Record<string, number> }} [options]
 */
export function summarizeUsage(records, options = {}) {
  const sinceDate = options.sinceDate ?? null;
  const costWeights = options.costWeights ?? {};

  const considered = records.filter((record) => {
    if (sinceDate === null) return true;
    const observedAt = typeof record.observedAt === 'string' ? new Date(record.observedAt) : null;
    if (!observedAt || Number.isNaN(observedAt.getTime())) return true; // ne odbacuj tiho, ukljuci
    return observedAt.getTime() >= sinceDate.getTime();
  });

  const byProvider = new Map();
  const byModel = new Map();
  const byPhase = new Map();
  const byTask = new Map();
  const warnings = [];
  const warnedModels = new Set();

  let totalCalls = 0;
  let totalFailed = 0;
  let totalInput = null;
  let totalOutput = null;
  let cacheReadSum = null;
  let cacheDenomSum = null;

  for (const record of considered) {
    const failed = record.status === 'failed' || (typeof record.exitCode === 'number' && record.exitCode !== 0);
    totalCalls += 1;
    if (failed) totalFailed += 1;

    const usage = record.usage && typeof record.usage === 'object' ? record.usage : null;
    if (!usage) warnings.push(`zapis bez usage polja (task=${keyFor(record, 'task', '?')}, agent=${keyFor(record, 'agent', '?')})`);

    const provider = keyFor(record, 'provider', 'nepoznat');
    const providerBucket = byProvider.get(provider) ?? emptyBucket();
    addToBucket(providerBucket, record, failed);
    byProvider.set(provider, providerBucket);

    const phase = keyFor(record, 'phase', 'nepoznato');
    const phaseBucket = byPhase.get(phase) ?? emptyBucket();
    addToBucket(phaseBucket, record, failed);
    byPhase.set(phase, phaseBucket);

    const task = keyFor(record, 'task', 'nepoznat');
    const taskBucket = byTask.get(task) ?? emptyBucket();
    addToBucket(taskBucket, record, failed);
    byTask.set(task, taskBucket);

    const model = modelFor(record);
    const modelBucket = byModel.get(model) ?? { ...emptyBucket(), costWeight: null };
    addToBucket(modelBucket, record, failed);
    const weight = numberOrNull(costWeights[model]);
    modelBucket.costWeight = weight;
    byModel.set(model, modelBucket);
    if (weight === null && !warnedModels.has(model)) {
      warnedModels.add(model);
      warnings.push(`nepoznat costWeight za model "${model}"; tezina kvote je null`);
    }

    if (usage) {
      totalInput = addNullable(totalInput, numberOrNull(usage.inputTokens));
      totalOutput = addNullable(totalOutput, numberOrNull(usage.outputTokens));
      const cachedInput = numberOrNull(usage.cachedInputTokens);
      const inputTokens = numberOrNull(usage.inputTokens);
      if (cachedInput !== null && inputTokens !== null) {
        cacheReadSum = addNullable(cacheReadSum, cachedInput);
        cacheDenomSum = addNullable(cacheDenomSum, cachedInput + inputTokens);
      }
    }
  }

  const withWeightedTokens = (map) => {
    const out = {};
    for (const [key, bucket] of map.entries()) {
      const weightedTokens = ('costWeight' in bucket) && bucket.costWeight !== null
        && bucket.inputTokens !== null && bucket.outputTokens !== null
        ? (bucket.inputTokens + bucket.outputTokens) * bucket.costWeight
        : null;
      out[key] = { ...bucket, ...('costWeight' in bucket ? { weightedTokens } : {}) };
    }
    return out;
  };

  const cacheShare = (cacheDenomSum !== null && cacheDenomSum > 0) ? cacheReadSum / cacheDenomSum : null;

  return {
    recordsConsidered: considered.length,
    recordsTotal: records.length,
    totalCalls,
    totalFailed,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    cacheShare,
    byProvider: withWeightedTokens(byProvider),
    byModel: withWeightedTokens(byModel),
    byPhase: withWeightedTokens(byPhase),
    byTask: withWeightedTokens(byTask),
    warnings,
  };
}

/**
 * Razrjesava `--since` u apsolutni pocetak razdoblja. `null` znaci "od pocetka" (`--all`).
 * Prihvaca relativni oblik `7d`/`24h` ili apsolutni ISO datum (`2026-09-19`).
 *
 * @param {string|undefined} sinceArg
 * @param {Date} now
 * @returns {Date|null}
 */
export function resolveSinceDate(sinceArg, now) {
  if (!sinceArg || sinceArg === 'all') return null;
  const relative = /^(\d+)([dh])$/.exec(sinceArg.trim());
  if (relative) {
    const amount = Number(relative[1]);
    const unitMs = relative[2] === 'd' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    return new Date(now.getTime() - amount * unitMs);
  }
  const parsed = new Date(sinceArg);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Neprepoznat --since oblik: ${sinceArg}`);
  return parsed;
}

function formatTokens(value) {
  return value === null ? 'n/p' : String(Math.round(value));
}

function formatWeighted(value) {
  return value === null ? 'n/p' : value.toFixed(2);
}

function renderBucketTable(title, map) {
  const lines = [title];
  const keys = Object.keys(map).sort();
  if (keys.length === 0) {
    lines.push('  (nema zapisa)');
    return lines;
  }
  for (const key of keys) {
    const b = map[key];
    lines.push(
      `  ${key}: pozivi=${b.calls} pao=${b.failed} `
      + `input=${formatTokens(b.inputTokens)} output=${formatTokens(b.outputTokens)}`
      + ('weightedTokens' in b ? ` tezina-kvote=${b.costWeight ?? 'n/p'} ponderirano=${formatWeighted(b.weightedTokens)}` : ''),
    );
  }
  return lines;
}

/**
 * Sastavlja tekstualni izvjestaj iz `summarizeUsage` rezultata. Cista funkcija, testirana odvojeno
 * od citanja diska.
 *
 * @param {ReturnType<typeof summarizeUsage>} summary
 * @param {{ sinceLabel: string }} meta
 * @returns {string}
 */
export function renderReport(summary, meta) {
  if (summary.recordsConsidered === 0) {
    return `nema zapisa (razdoblje: ${meta.sinceLabel}; ukupno u datoteci: ${summary.recordsTotal})`;
  }
  const lines = [];
  lines.push(`Izvjestaj o potrosnji agenata - razdoblje: ${meta.sinceLabel}`);
  lines.push(`Zapisa u razdoblju: ${summary.recordsConsidered} (ukupno u datoteci: ${summary.recordsTotal})`);
  lines.push(`Pozivi ukupno: ${summary.totalCalls}, pao: ${summary.totalFailed}`);
  lines.push(`Tokeni ukupno: input=${formatTokens(summary.totalInputTokens)} output=${formatTokens(summary.totalOutputTokens)}`);
  lines.push(`Udio kesa (cache_read / (input + cache_read)): ${summary.cacheShare === null ? 'n/p' : `${(summary.cacheShare * 100).toFixed(1)}%`}`);
  lines.push('');
  lines.push(...renderBucketTable('Po provideru:', summary.byProvider));
  lines.push('');
  lines.push(...renderBucketTable('Po modelu (tezina kvote: claude-sonnet-5 = 1):', summary.byModel));
  lines.push('');
  lines.push(...renderBucketTable('Po fazi/ulozi:', summary.byPhase));
  lines.push('');
  lines.push(...renderBucketTable('Po zadatku:', summary.byTask));
  if (summary.warnings.length > 0) {
    lines.push('');
    lines.push('Upozorenja:');
    for (const warning of summary.warnings) lines.push(`  - ${warning}`);
  }
  lines.push('');
  lines.push('Sljedeci korak (nije implementirano): tokeni po spojenom PR-u, kad zapisi dobiju branch/PR polje.');
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { since: '7d', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all') options.since = 'all';
    else if (arg === '--json') options.json = true;
    else if (arg === '--since') { options.since = argv[i + 1]; i += 1; }
    else throw new Error(`Nepoznata opcija: ${arg}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const now = new Date();
  const sinceDate = resolveSinceDate(options.since, now);
  const sinceLabel = sinceDate === null ? 'sve' : `od ${sinceDate.toISOString()}`;

  const { records } = readUsageLog();
  const costWeights = readCostWeights();
  const summary = summarizeUsage(records, { sinceDate, costWeights });

  if (options.json) {
    console.log(JSON.stringify({ meta: { sinceLabel }, summary }, null, 2));
    return;
  }
  console.log(renderReport(summary, { sinceLabel }));
}

const isDirectRun = (process.argv[1] ?? '').replace(/\\/g, '/').endsWith('scripts/agents/usage-report.mjs');
if (isDirectRun) {
  try {
    main();
  } catch (error) {
    console.error(`[agents:usage-report] ${error.message}`);
    process.exitCode = 1;
  }
}
