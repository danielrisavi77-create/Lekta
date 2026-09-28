// Deterministicka usporedba slijepog izvlacenja s pravilom profila. Ne pise nista osim sazetka na stdout.
// node compare-extraction.mjs <scratch> <sourceId> <luna|sol>
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [S, sourceId, pass] = process.argv.slice(2);
const stable = (v) => v === null || typeof v !== 'object' ? JSON.stringify(v) ?? 'undefined'
  : Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;

const inBundle = JSON.parse(readFileSync(join(S, 'in', `${sourceId}.json`), 'utf8'));
const outPath = join(S, 'out', `${sourceId}.${pass}.json`);
if (!existsSync(outPath)) { console.log(JSON.stringify({ ok: false, error: 'izlaz-ne-postoji' })); process.exit(1); }
let out;
// Codex zna pisati kroz PowerShell Set-Content -Encoding utf8, koji dodaje BOM.
try { out = JSON.parse(readFileSync(outPath, 'utf8').replace(/^﻿/, '')); } catch { console.log(JSON.stringify({ ok: false, error: 'izlaz-nije-json' })); process.exit(1); }

const expected = pass === 'sol' ? null : new Set(inBundle.rules.map((r) => `${r.profileId}/${r.ruleId}`));
const matched = []; const mismatched = []; const insufficient = []; const conflict = []; const unknown = [];
const seen = new Set();
for (const r of out.rules ?? []) {
  const key = `${r.profileId}/${r.ruleId}`;
  if (seen.has(key)) { unknown.push(key); continue; }
  seen.add(key);
  const truthPath = join(S, 'truth', `${r.profileId}.json`);
  const truth = existsSync(truthPath) ? JSON.parse(readFileSync(truthPath, 'utf8'))[r.ruleId] : undefined;
  if (!truth) { unknown.push(key); continue; }
  if (r.verdict === 'conflict') { conflict.push(key); continue; }
  if (r.verdict !== 'extracted') { insufficient.push(key); continue; }
  const diffs = ['value', 'modality', 'scope'].filter((k) => stable(r[k]) !== stable(truth[k]));
  (diffs.length ? mismatched : matched).push(diffs.length ? { key, diffs } : key);
}
const missing = expected ? [...expected].filter((k) => !seen.has(k)) : [];
const modelOk = typeof out.model?.model === 'string' && out.model.model.length > 0;
console.log(JSON.stringify({
  ok: modelOk && !unknown.length, model: out.model?.model ?? null,
  matched: matched.length, matchedRuleIds: matched.map((k) => k.split('/')[1]), mismatched, insufficient, conflict, missing, unknown,
  // Ponovni pokusaj ima smisla samo za izvlacenje koje se ne slaze ili izostalo; conflict je stvarni nalaz izvora.
  retryableRuleIds: [...mismatched.map((m) => m.key), ...insufficient, ...missing].map((k) => k.split('/')[1]),
}));
