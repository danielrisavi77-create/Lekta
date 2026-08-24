// scripts/verify-dist-classification.mjs
//
// Post-build sken emitiranih artefakata (faza A): dist/ + dist-packs/ ne smiju
// sadrzavati kanarince ni never-markere privatnog sloja. Ovo je obrana nad
// POSLJEDICOM i pokriva i puteve koji zaobilaze Rollup graf (SEO generatori u
// netlify lancu, kopije iz public/), za razliku od classification-guard vite
// plugina koji pada na krivom importu u samom buildu.
//
// Pokretanje:
//   - node scripts/verify-dist-classification.mjs   (CI korak nakon npm run check)
//   - iz scripts/verify-deploy-dist.mjs kao zadnji korak netlify lanca
//
// Prije skena se radi SELF-TEST: svaki kanarinac iz manifesta mora postojati u
// svojoj izvornoj datoteci. Tiho izbrisan kanarinac inace pretvara sken u
// vakuumski prolaz (isti obrazac laznog zelenog kao integrityFailure u repairu).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest, classifyPath } from './security/classification.mjs';
import { NEVER_KEY_MARKERS, findKeyMarkers, findValues } from './security/never-markers.mjs';

/** Basename privatnih izvora koji se ni pod kojim imenom staze ne smiju naci medju artefaktima. */
const FORBIDDEN_BASENAMES = [
  'ledger.json',
  'source-registry.json',
  'verified-profiles.json',
  'scored-value-drift.json',
  'profile-rules-server.json',
];

/** Rekurzivno pokupi sve datoteke ispod korijena (staze apsolutne). Symlink
 *  direktoriji se preskacu (zastita od ciklusa; u distu ih legitimno nema). */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * Chunk-layout tvrdnja za bulk artefakte (heavy profili, repair-map): dok ih manifest
 * dopusta moraju postojati kao ZASEBNI lijeni chunkovi, a nakon flipa na forbidden
 * (faza B3) ne smiju postojati NIKAKO. Zivi ovdje, a ne samo u vitest testu, jer se
 * u `npm run check` vitest vrti PRIJE vite builda pa se test nad svjezim distom u
 * CI-ju nikad ne izvodi (revizija 2026-08-23, nalaz 6); ovaj sken ide POSLIJE builda
 * u check.yml i u netlify lancu.
 */
function checkBulkChunkLayout(rootDir, manifest, violations) {
  const assetsDir = resolve(rootDir, 'dist', 'assets');
  if (!existsSync(assetsDir)) {
    violations.push('dist/assets ne postoji (build nije emitirao chunkove?)');
    return;
  }
  const assets = readdirSync(assetsDir);
  const cases = [
    ['data/profiles/verified-profiles-heavy.json', /^verified-profiles-heavy-.*\.js$/],
    ['data/profiles/repair-map.json', /^repair-map-.*\.js$/],
  ];
  for (const [source, chunkPattern] of cases) {
    const rule = classifyPath(source, manifest.rules);
    const present = assets.some((name) => chunkPattern.test(name));
    if (rule && rule.bundle === 'allowed' && !present) {
      violations.push(`${source}: manifest kaze allowed, a zaseban lijeni chunk (${chunkPattern}) ne postoji u dist/assets`);
    }
    if ((!rule || rule.bundle !== 'allowed') && present) {
      violations.push(`${source}: manifest kaze ${rule ? rule.bundle : 'nepokriveno'}, a chunk (${chunkPattern}) jos postoji u dist/assets`);
    }
  }
}

/**
 * Izvrsi cijeli sken. Vraca popis prekrsaja (prazan = cisto); baca samo na
 * neispravan manifest ili nepostojeci dist (pozivatelj odlucuje sto je fatalno).
 * @param {{ rootDir?: string }} [opts]
 */
export function runClassificationScan(opts = {}) {
  const rootDir = opts.rootDir ?? resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
  const manifest = loadManifest(rootDir);
  /** @type {string[]} */
  const violations = [];

  // 1) Self-test kanarinaca u IZVORIMA (anti-trulez: brisanje kanarinca rusi provjeru).
  for (const canary of manifest.canaries) {
    const srcFile = resolve(rootDir, canary.mustExistIn);
    if (!existsSync(srcFile) || !readFileSync(srcFile).includes(canary.value)) {
      violations.push(`SELF-TEST: kanarinac (${canary.kind}) nije pronadjen u izvoru ${canary.mustExistIn}`);
    }
  }

  // 2) Sken emitiranih artefakata.
  const targets = [resolve(rootDir, 'dist'), resolve(rootDir, 'dist-packs')].filter((d) => existsSync(d));
  if (!targets.some((d) => d.endsWith('dist'))) {
    throw new Error('[verify-dist-classification] dist/ ne postoji; pokreni vite build prije skena.');
  }
  checkBulkChunkLayout(rootDir, manifest, violations);
  const canaryValues = manifest.canaries.map((c) => c.value);
  for (const target of targets) {
    for (const file of walk(target)) {
      const relative = file.slice(rootDir.length + 1).replace(/\\/g, '/');
      const base = (file.replace(/\\/g, '/').split('/').pop() ?? '').toLowerCase();
      if (FORBIDDEN_BASENAMES.includes(base)) {
        violations.push(`${relative}: privatni izvor po imenu (${base}) medju artefaktima`);
        continue;
      }
      const content = readFileSync(file);
      for (const marker of findKeyMarkers(content, NEVER_KEY_MARKERS)) {
        violations.push(`${relative}: never-marker kljuc "${marker}" (polje privatnog sloja u javnom artefaktu)`);
      }
      for (const marker of findValues(content, canaryValues)) {
        violations.push(`${relative}: kanarinac "${marker.slice(0, 40)}..." je procurio u artefakt`);
      }
    }
  }
  return violations;
}

let invokedDirectly = false;
try {
  invokedDirectly = Boolean(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url));
} catch {
  // uvezen iz vitest/happy-dom okoline (import.meta.url nije file:): nije CLI poziv
}
if (invokedDirectly) {
  const violations = runClassificationScan();
  if (violations.length) {
    console.error(`[verify-dist-classification] ${violations.length} prekrsaj(a):`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log('[verify-dist-classification] OK: bez kanarinaca i never-markera u dist/ i dist-packs/, self-test kanarinaca u izvorima prolazi.');
}
