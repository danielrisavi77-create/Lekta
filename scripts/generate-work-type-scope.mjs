// Generira data/work-type-scope.json: okvirni opseg TEKSTA (znakovi/rijeci, NE stranice) po
// NAPLATNOJ vrsti rada, IZVEDEN iskljucivo iz sluzbenih fakultetskih pravila. Ne izmislja
// vrijednosti: agregira rules.wordMin/wordMax (verified-profiles.json) i rulesByWorkType.*.charMin/
// charMax (legal-departments.json). Pokrivenost je danas tanka (v. "gaps" u izlazu i memoriju
// paid-repair-monetization-plan), pa se emitira SIROVI min-max + broj uzoraka + provenijencija,
// nikad "prosjek" koji bi lazno sugerirao potpunost. Advisory heuristika (nije bodovano pravilo),
// pa ne krsi tvrdo pravilo "ne izmisljaj bodovana pravila" - bodovani profilni charMin/wordMin ostaju
// netaknuti u data/**.
//
// Pokreni: node scripts/generate-work-type-scope.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KARTICA_CHARS = 1800;

// Profilske (engine) oznake vrste rada -> naplatne vrste. Kopija REPORT_WORK_TYPE iz
// src/report/report-client.ts (drzi se sinkronizirano; test moze usporediti).
const REPORT_WORK_TYPE = {
  seminar: 'seminarski',
  final: 'zavrsni',
  graduate: 'diplomski',
  specialist: 'diplomski',
  doctoral: 'doktorski',
  article: 'zavrsni',
  project: 'zavrsni',
};
const BILLING_TIERS = ['seminarski', 'zavrsni', 'diplomski', 'doktorski'];

function loadJson(rel) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) throw new Error(`Nedostaje ${rel}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

// Sirovi zapis: (id, tier, kind[words|chars], min, max, mode) iz jednog izvora pravila.
function collectRanges(entry, rulesObj, workType, id, out) {
  if (!rulesObj) return;
  const tier = REPORT_WORK_TYPE[workType];
  if (!tier) return;
  const wMin = num(rulesObj.wordMin), wMax = num(rulesObj.wordMax);
  if (wMin != null || wMax != null) {
    out.push({ id, tier, kind: 'words', min: wMin, max: wMax, mode: rulesObj.wordCountMode || entry.rules?.wordCountMode || null });
  }
  const cMin = num(rulesObj.charMin), cMax = num(rulesObj.charMax);
  if (cMin != null || cMax != null) {
    out.push({ id, tier, kind: 'chars', min: cMin, max: cMax, mode: rulesObj.charCountMode || entry.rules?.charCountMode || null });
  }
}

function gather(entries, out) {
  for (const e of entries) {
    const id = e.id || e.unitId || '(bez-id)';
    const workTypes = Array.isArray(e.workTypes) ? e.workTypes : [];
    // (a) top-level rules: primijeni na SVE vrste rada profila
    for (const wt of workTypes) collectRanges(e, e.rules, wt, id, out);
    // (b) rulesByWorkType: primijeni na tocno tu vrstu (kljuc je profilska oznaka)
    if (e.rulesByWorkType && typeof e.rulesByWorkType === 'object') {
      for (const [wt, ro] of Object.entries(e.rulesByWorkType)) collectRanges(e, ro, wt, id, out);
    }
  }
}

const raw = [];
gather(loadJson('data/profiles/verified-profiles.json'), raw);
gather(loadJson('data/profiles/legal-departments.json'), raw);

// Agregacija po (tier, kind): min = najnizi donji prag, max = najvisi gornji prag, uz uzorke.
function aggregate(kind, tier) {
  const rows = raw.filter((r) => r.kind === kind && r.tier === tier);
  if (!rows.length) return null;
  const lows = rows.map((r) => r.min).filter((x) => x != null);
  const highs = rows.map((r) => r.max).filter((x) => x != null);
  const samples = rows
    .map((r) => ({ id: r.id, min: r.min, max: r.max, mode: r.mode }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    min: lows.length ? Math.min(...lows) : null,
    max: highs.length ? Math.max(...highs) : null,
    sampleCount: rows.length,
    samples,
  };
}

const tiers = {};
const gaps = [];
for (const tier of BILLING_TIERS) {
  const words = aggregate('words', tier);
  const chars = aggregate('chars', tier);
  tiers[tier] = { words, chars, anchored: !!(words || chars) };
  if (!words && !chars) gaps.push(`${tier}: nijedno fakultetsko pravilo ne definira opseg teksta (nema sidra; oslon na naslovnicki marker i genericki fallback).`);
  else {
    if (!words) gaps.push(`${tier}: nema rasponā u rijecima (samo znakovi, ${chars.sampleCount} uzor.).`);
    if (!chars) gaps.push(`${tier}: nema rasponā u znakovima (samo rijeci, ${words.sampleCount} uzor.).`);
    if (words && words.sampleCount < 3) gaps.push(`${tier}: samo ${words.sampleCount} uzorak/uzoraka za rijeci; raspon je statisticki tanak.`);
  }
}

const output = {
  $generatedBy: 'scripts/generate-work-type-scope.mjs',
  note: 'Okvirni opseg TEKSTA (rijeci/znakovi, NE stranice) po naplatnoj vrsti rada, IZVEDEN iz sluzbenih fakultetskih pravila. Sirovi min-max preko svih profila s pravilom + provenijencija; ne izmislja i ne racuna prosjeke. Pokrivenost je tanka pa je enforcement primarno na naslovnicki marker, opseg samo kao potvrda daleko-izvan-raspona.',
  karticaChars: KARTICA_CHARS,
  billingTiers: BILLING_TIERS,
  reportWorkTypeMap: REPORT_WORK_TYPE,
  tiers,
  gaps,
};

const dest = join(ROOT, 'data/work-type-scope.json');
writeFileSync(dest, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(`work-type-scope.json zapisan (${raw.length} sirovih pravila). Rupe: ${gaps.length}`);
for (const g of gaps) console.log('  - ' + g);
