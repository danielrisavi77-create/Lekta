/**
 * Generalizirani verifikacijski worklist za LJUDSKI pass preko cijelog porta.
 *
 * Za razliku od scripts/verification-dossier.mjs (samo pravo/law-drafts), ovo globa SVE
 * draftove (agregirani + fan-out, ista merge semantika kao recompute-coverage) i priprema
 * audit dosjee za scored pravila koja su odobrena masovno (verifiedBy=owner-bulk-approval)
 * pa ih covjek jos nije pojedinacno potvrdio. Za svako pravilo ispisuje vrijednost, izvor,
 * lokator (sourcePage), DOSLOVNI citat i putanju PDF snapshota - da covjek otvori izvor na
 * lokatoru i provjeri vrijednost protiv citata, pa u konzoli/rucno Potvrdi (verifiedBy=ime).
 *
 * NE proglasava nista; samo priprema worklist. Pise:
 *   data/verification/dossiers/<profileId>.md   (po profilu s bulk-pending pravilima)
 *   data/verification/dossiers/INDEX.md          (master worklist s brojacima)
 *
 * Pokretanje: node scripts/verification-worklist.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (rel) => JSON.parse(readFileSync(p(rel), 'utf8'));

const sources = readJson('data/sources/source-registry.json');
const srcById = new Map(sources.map((s) => [s.id, s]));
const OFFICIAL = new Set(['binding', 'program-page', 'general']);
const BULK = 'owner-bulk-approval';

function snapshotted(sourceId) {
  const s = srcById.get(sourceId);
  return !!s && s.snapshotPath != null && s.snapshotHash != null;
}
function isScored(e) {
  return (
    e.status === 'verified' &&
    OFFICIAL.has(e.authority) &&
    e.sourceId != null &&
    e.sourcePage != null &&
    e.quote != null &&
    snapshotted(e.sourceId)
  );
}

// --- merge draftova (agregirani pobjedjuje, fan-out popunjava; kao recompute-coverage) ---
const merged = {};
const fanout = {};
for (const fac of readdirSync(p('data/profiles/'), { withFileTypes: true })) {
  if (!fac.isDirectory()) continue;
  let files;
  try {
    files = readdirSync(p(`data/profiles/${fac.name}/drafts/`));
  } catch {
    continue;
  }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const d = JSON.parse(readFileSync(p(`data/profiles/${fac.name}/drafts/${f}`), 'utf8'));
    if (d && d.profiles) for (const [id, es] of Object.entries(d.profiles)) merged[id] = es;
    else if (d && d.profileId && d.entries) (fanout[d.profileId] ??= []).push(...d.entries);
  }
}
for (const [id, es] of Object.entries(fanout)) if (!merged[id]) merged[id] = es;

mkdirSync(p('data/verification/dossiers'), { recursive: true });

const rows = [];
let dossiersWritten = 0;
let totalBulk = 0;

for (const profileId of Object.keys(merged).sort()) {
  const entries = merged[profileId];
  const scored = entries.filter(isScored);
  const bulk = scored.filter((e) => e.verifiedBy === BULK);
  const human = scored.filter((e) => e.verifiedBy && e.verifiedBy !== BULK);
  const recheck = entries.filter((e) => e.status === 'needs-recheck');
  rows.push({ profileId, bulk: bulk.length, human: human.length, scored: scored.length, recheck: recheck.length });
  if (!bulk.length && !recheck.length) continue;
  totalBulk += bulk.length;

  const out = [];
  out.push(`# Verifikacijski dosje: ${profileId}`);
  out.push('');
  out.push('Covjek potvrdjuje, AI ne proglasava verified. Otvori PDF snapshot na lokatoru (sourcePage), provjeri VRIJEDNOST protiv DOSLOVNOG citata, pa postavi verifiedBy=svoje ime (i po zelji reviewedBy).');
  out.push('');
  out.push(`Scored ukupno: ${scored.length}. Vec ljudski potvrdjeno: ${human.length}. Za audit (bulk): ${bulk.length}. Needs-recheck: ${recheck.length}.`);
  out.push('');

  if (bulk.length) {
    out.push(`## Za audit - masovno odobreno (${bulk.length})`);
    out.push('');
    for (const e of bulk) {
      const s = srcById.get(e.sourceId) || {};
      out.push(`### ${e.checkId} - ${e.label ?? e.ruleId}`);
      out.push(`- Vrijednost: \`${JSON.stringify(e.value)}\``);
      out.push(`- Autoritet: ${e.authority}`);
      out.push(`- Izvor: ${e.sourceId} - ${e.sourcePage}`);
      out.push(`- Snapshot: \`${s.snapshotPath ?? '(nema)'}\``);
      out.push(`- Citat: "${e.quote}"`);
      out.push('');
    }
  }

  if (recheck.length) {
    out.push(`## Needs-recheck (${recheck.length})`);
    out.push('');
    for (const e of recheck) {
      out.push(`- \`${e.checkId}\` - ${e.label ?? e.ruleId}: izvor ${e.sourceId ?? '(nema)'}${e.quote ? `, citat "${e.quote}"` : ', bez citata - treba ponovno citanje izvora'}`);
    }
    out.push('');
  }

  writeFileSync(p(`data/verification/dossiers/${profileId}.md`), out.join('\n') + '\n');
  dossiersWritten += 1;
}

// --- master INDEX worklist ---
const idx = [];
idx.push('# Verifikacijski worklist (ljudski pass)');
idx.push('');
idx.push('Audit masovno odobrenih (owner-bulk-approval) scored pravila. Otvori dosje profila, provjeri svako pravilo protiv izvora na lokatoru, pa u konzoli/rucno postavi verifiedBy=svoje ime.');
idx.push('');
const withBulk = rows.filter((r) => r.bulk || r.recheck);
const bulkSum = rows.reduce((n, r) => n + r.bulk, 0);
const humanSum = rows.reduce((n, r) => n + r.human, 0);
const recheckSum = rows.reduce((n, r) => n + r.recheck, 0);
idx.push(`Profila sa scored: ${rows.filter((r) => r.scored).length}. Scored ukupno: ${rows.reduce((n, r) => n + r.scored, 0)}.`);
idx.push(`Vec ljudski potvrdjeno: ${humanSum}. Za audit (bulk): ${bulkSum}. Needs-recheck: ${recheckSum}. Dosjea zapisano: ${dossiersWritten}.`);
idx.push('');
idx.push('| Profil | Za audit (bulk) | Ljudski OK | Scored | Recheck | Dosje |');
idx.push('|---|---:|---:|---:|---:|---|');
for (const r of withBulk.sort((a, b) => b.bulk - a.bulk || (a.profileId < b.profileId ? -1 : 1))) {
  idx.push(`| ${r.profileId} | ${r.bulk} | ${r.human} | ${r.scored} | ${r.recheck} | [${r.profileId}.md](${r.profileId}.md) |`);
}
idx.push('');
writeFileSync(p('data/verification/dossiers/INDEX.md'), idx.join('\n') + '\n');

console.log(`Worklist: ${dossiersWritten} dosjea, ${bulkSum} bulk za audit, ${humanSum} vec ljudski, ${recheckSum} recheck.`);
console.log('Master: data/verification/dossiers/INDEX.md');
