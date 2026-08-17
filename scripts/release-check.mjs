#!/usr/bin/env node
// scripts/release-check.mjs
//
// JEDNA naredba koja vrti SVE razine dokaza i o tome ostavlja potpisan trag (audit P0-13).
//
// Problem koji rjesava: dokazi su postojali, ali razasuti. `npm run check`, `conformance`,
// `test:slow`, `test:ux`, `verify:strict-open` i `verify:word` pokretali su se rucno i odvojeno,
// pa nitko nije mogao reci JE LI za konkretan commit ikad izvedena Tier 2 provjera pravim Wordom.
// Odgovor "mislim da jesam" nije dokaz, a kod DOCX-a je Word jedini pravi sudac: `npm run check`
// je samo Tier 0 i ne otvara dokument nijednim stvarnim uredivacem.
//
// Rezultat je `docs/generated/RELEASE_PROOF.json`: commit, vrijeme, i ishod po razini.
// `scripts/verify-deploy-dist.mjs` ga cita i moze odbiti deploy koji nema svjez dokaz.
//
// Pokretanje:
//   npm run release:check              # sve razine
//   npm run release:check -- --only=check,conformance
//   npm run release:check -- --dry-run # samo ispisi plan, nista ne pokreci
//
// Word razine su Windows-only i traze instaliran Word. Kad nisu dostupne, biljeze se kao
// `unavailable`, a dokaz se NE oznacava potpunim. To je namjerno: nedostupna provjera nije
// prolazna provjera, i upravo je to razlika koju je audit prijavio kao nedostajucu.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'generated', 'RELEASE_PROOF.json');

/**
 * Razine dokaza, redom od najjeftinije do najskuplje.
 *
 * `required` znaci da bez nje dokaz nije potpun. `windowsOnly` razine se preskacu drugdje, ali
 * se NE biljeze kao prolaz.
 */
const TIERS = [
  { id: 'check', label: 'Tier 0: tsc + vitest + build', cmd: 'npm run check', required: true },
  { id: 'edge', label: 'Tier 0: deno typecheck Edge funkcija', cmd: 'npm run check:edge', required: true },
  { id: 'conformance', label: 'Tier 0: conformance matrica', cmd: 'npm run conformance', required: true },
  { id: 'slow', label: 'Tier 0: spori repair testovi', cmd: 'npm run test:slow', required: true },
  { id: 'ux', label: 'Tier 0: Playwright UX', cmd: 'npm run test:ux', required: true },
  { id: 'strict-open', label: 'Tier 1: python-docx strict open', cmd: 'npm run verify:strict-open', required: true },
  { id: 'word', label: 'Tier 2: pravi Microsoft Word', cmd: 'npm run verify:word', required: true, windowsOnly: true },
  { id: 'word-worst', label: 'Tier 2: Word, najgori slucaj', cmd: 'npm run verify:word:worst', required: true, windowsOnly: true },
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').map((s) => s.trim())) : null;

function headCommit() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function gitDirty() {
  try {
    return execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim().length > 0;
  } catch {
    return true;
  }
}

const selected = TIERS.filter((t) => !only || only.has(t.id));
if (!selected.length) {
  console.error(`[release-check] FAIL: --only ne odgovara nijednoj razini. Poznate: ${TIERS.map((t) => t.id).join(', ')}`);
  process.exit(1);
}

if (dryRun) {
  console.log('[release-check] plan (nista se ne pokrece):');
  for (const t of selected) {
    const skip = t.windowsOnly && process.platform !== 'win32' ? '  [preskace se: nije Windows]' : '';
    console.log(`  ${t.id.padEnd(12)} ${t.cmd}${skip}`);
  }
  process.exit(0);
}

const commit = headCommit();
const dirty = gitDirty();
if (dirty) {
  console.warn('[release-check] UPOZORENJE: radno stablo nije cisto. Dokaz se vezuje uz commit, pa');
  console.warn('  necommitane izmjene NISU pokrivene ovim zapisom.');
}

const results = [];
let hardFailure = false;

for (const tier of selected) {
  if (tier.windowsOnly && process.platform !== 'win32') {
    console.log(`\n=== ${tier.label} -> NEDOSTUPNO (nije Windows) ===`);
    results.push({ id: tier.id, label: tier.label, status: 'unavailable', reason: 'not-windows' });
    continue;
  }
  console.log(`\n=== ${tier.label} ===`);
  const started = Date.now();
  try {
    execSync(tier.cmd, { cwd: ROOT, stdio: 'inherit' });
    const ms = Date.now() - started;
    console.log(`--- ${tier.id}: PROLAZ (${Math.round(ms / 1000)} s)`);
    results.push({ id: tier.id, label: tier.label, status: 'pass', durationMs: ms });
  } catch {
    const ms = Date.now() - started;
    console.error(`--- ${tier.id}: PAD (${Math.round(ms / 1000)} s)`);
    results.push({ id: tier.id, label: tier.label, status: 'fail', durationMs: ms });
    if (tier.required) hardFailure = true;
    // Ne prekidamo: vrijedi znati koje JOS razine padaju, jer se inace popravlja jedna po jedna
    // kroz vise visesatnih ciklusa.
  }
}

const missingRequired = TIERS.filter(
  (t) => t.required && !results.some((r) => r.id === t.id && r.status === 'pass'),
).map((t) => t.id);

const proof = {
  commit,
  dirtyWorkingTree: dirty,
  createdAt: new Date().toISOString(),
  platform: process.platform,
  partial: !!only,
  // Potpun je samo kad je SVAKA obavezna razina stvarno prosla. Nedostupna razina ne racuna se
  // kao prolaz: to je razlika zbog koje je Word i bio "provjera koja postoji ali nije gate".
  complete: missingRequired.length === 0,
  missingRequired,
  results,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(proof, null, 2) + '\n', 'utf8');

console.log(`\n[release-check] zapisano ${path.relative(ROOT, OUT)}`);
console.log(`[release-check] potpun dokaz: ${proof.complete ? 'DA' : 'NE'}`);
if (missingRequired.length) console.log(`[release-check] bez prolaza: ${missingRequired.join(', ')}`);

process.exit(hardFailure ? 1 : 0);
