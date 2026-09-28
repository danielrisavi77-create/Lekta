// Usporedba ruleId iz PR #221 dokumenta s run5 (prihvaceno, oboreno, izvuceno) i sidrenjem. Samo cita.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
const S = process.argv[2];
const doc = readFileSync(`${S}/pr221-prijedlozi.md`, 'utf8');
const ids = [...new Set(doc.match(/\b[a-z0-9]+(?:-[a-z0-9]+)*--[a-z0-9-]+\b/g) ?? [])].sort();
const acc = new Set(); const ref = new Map();
for (const f of readdirSync(`${S}/run5/verdict`)) {
  const v = JSON.parse(readFileSync(`${S}/run5/verdict/${f}`, 'utf8').replace(/^﻿/, ''));
  for (const x of v.accepted ?? []) acc.add(x);
  for (const r of v.refuted ?? []) ref.set(r.ruleId, r.reason);
}
// Stanje u run5 pripremi: je li pravilo uopce bilo u paketima, ili blokirano (i zasto).
const plan = JSON.parse(readFileSync(`${S}/run5/plan.json`, 'utf8'));
const blocked = new Map(plan.blocked.map((b) => [b.ruleId, b.code]));
const inBundles = new Set();
for (const f of readdirSync(`${S}/run5/in`)) for (const r of JSON.parse(readFileSync(`${S}/run5/in/${f}`, 'utf8')).rules) inBundles.add(r.ruleId);
const anchorProfiles = new Set(readFileSync(`${S}/run4/anchor-targets.txt`, 'utf8').split(/\r?\n/).filter(Boolean));
const rows = ids.map((id) => {
  const prof = id.split('--')[0];
  const status = acc.has(id) ? 'prihvaceno-run5' : ref.has(id) ? 'oboreno-run5' : blocked.has(id) ? `blokirano:${blocked.get(id)}` : inBundles.has(id) ? 'izvuceno-nije-prihvaceno' : 'izvan-run5';
  return { id, status, sidrenje: anchorProfiles.has(prof), razlog: ref.get(id) };
});
const count = rows.reduce((m, r) => ((m[r.status.split(':')[0]] = (m[r.status.split(':')[0]] ?? 0) + 1), m), {});
console.log(JSON.stringify({ ukupno: ids.length, count }, null, 1));
for (const r of rows.filter((r) => /^(pravri|unidu)/.test(r.id) || r.status === 'oboreno-run5')) console.log(`${r.id} | ${r.status}${r.razlog ? ' | ' + r.razlog.slice(0, 140) : ''}`);
console.log('--- izvan run5 (prvih 30):');
console.log(rows.filter((r) => r.status === 'izvan-run5').map((r) => r.id).slice(0, 30).join(', '));
// Preporuka iz #221 tablice po retku, ukrizeno sa stanjem run5.
const rec = new Map();
for (const line of doc.split(/\r?\n/)) { const m = line.match(/^\|\s*`([^`]+)`\s*\|\s*([a-z-]+)\s*\|/); if (m) rec.set(m[1], m[2]); }
const cross = {};
for (const r of rows) { const k = `${rec.get(r.id) ?? '?'} x ${r.status}`; (cross[k] ??= []).push(r.id); }
console.log('=== KRIZ');
for (const [k, v] of Object.entries(cross).sort()) console.log(`${k} (${v.length}): ${v.join(', ')}`);
console.log('=== run5 prihvaceni unidu:', [...acc].filter((x) => x.startsWith('unidu')).join(', '));
