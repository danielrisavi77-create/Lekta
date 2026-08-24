/**
 * Snapshot izvora mora biti onaj protiv kojeg je pravilo verificirano.
 *
 *   node scripts/verify-source-hashes.mjs [--all]
 *
 * Zasto postoji: `VERIFICATION_PIPELINE.md` sekcija 6 trazi da nijedno bodovano pravilo nema izvor
 * ciji se `snapshotHash` promijenio nakon `lastVerified`. `runVerificationGate` to provjerava, ali
 * SAMO usporedbom dva zapisana broja (`entry.verifiedHash` naspram `src.snapshotHash`). Nista nikad
 * nije racunalo sha256 STVARNE DATOTEKE na disku, pa je cijela tvrdnja o nepromjenjivosti snapshota
 * pocivala na tome da nitko nije dirao 257 MB PDF-ova. Zapis koji nitko ne provjerava nije dokaz.
 *
 * Zadano se provjeravaju samo izvori koje bodovana pravila stvarno citaju: oni odlucuju o ocjeni.
 * `--all` provjerava cijeli registar (sporije, za rucnu reviziju).
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readdirSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = JSON.parse(readFileSync(join(root, 'data/sources/source-registry.json'), 'utf8'));

/** ruleEntries iz svih staging draftova, bez vite-node (obican fs walk). */
function draftEntries() {
  const base = join(root, 'data', 'profiles');
  const out = [];
  for (const unit of readdirSync(base, { withFileTypes: true })) {
    if (!unit.isDirectory()) continue;
    const dir = join(base, unit.name, 'drafts');
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      const groups = data.profiles
        ? Object.entries(data.profiles)
        : [[data.profileId, data.entries ?? []]];
      for (const [, entries] of groups) for (const e of entries ?? []) out.push(e);
    }
  }
  return out;
}

/**
 * IZVEDENI `scored`, isti uvjet kao `isRuleScored` u src/verification/verification-gate.ts:
 * verified + sluzben autoritet + sourceId + sourcePage + quote. Pohranjena zastavica `scored` NIJE
 * mjerodavna: 275 pravila vezu motor bez nje, a s njima i 11 izvora koji su tako ispadali iz opsega
 * ove provjere (fpzg-drsc08-doktorski, pravo-katedra-*, pravo-studij-* i drugi).
 * Duplicirano u JS-u jer se skripta vrti pod cistim Node-om, bez TS lanca; ako se uvjet promijeni
 * ondje, mora i ovdje.
 */
const OFFICIAL_AUTHORITIES = new Set(['binding', 'program-page', 'general']);

function ruleIsScored(e) {
  return (
    e.status === 'verified' &&
    OFFICIAL_AUTHORITIES.has(e.authority) &&
    e.sourceId != null &&
    e.sourcePage != null &&
    e.quote != null
  );
}

/** Izvori koje BODOVANA pravila citaju; oni odlucuju o ocjeni pa se provjeravaju uvijek. */
export function scoredSourceIds() {
  const ids = new Set();
  for (const e of draftEntries()) {
    if (!ruleIsScored(e)) continue;
    if (e.sourceId) ids.add(e.sourceId);
    for (const add of e.additionalSources ?? []) if (add.sourceId) ids.add(add.sourceId);
  }
  return ids;
}

/**
 * Vraca popis nesuglasja. Prazan popis znaci da svaka provjerena datoteka na disku ima tocno onaj
 * sha256 koji registar tvrdi.
 */
export function checkSourceHashes({ all = false, sources = null, only = null } = {}) {
  // `sources` i `only` postoje zbog MUTACIJSKOG testa: gard se mora moci pokrenuti nad podmetnutim
  // registrom, inace se njegova cvrstoca ne moze dokazati bez diranja stvarnih 233 MB na disku.
  const registry = sources ?? SOURCES;
  const wanted = only ? new Set(only) : all ? null : scoredSourceIds();
  const problems = [];
  let checked = 0;
  let bytes = 0;
  for (const src of registry) {
    if (wanted && !wanted.has(src.id)) continue;
    if (!src.snapshotPath) {
      problems.push({ id: src.id, kind: 'no-snapshot-path' });
      continue;
    }
    const abs = join(root, ...src.snapshotPath.split('/'));
    if (!existsSync(abs)) {
      problems.push({ id: src.id, kind: 'missing-file', path: src.snapshotPath });
      continue;
    }
    if (!src.snapshotHash) {
      problems.push({ id: src.id, kind: 'no-hash', path: src.snapshotPath });
      continue;
    }
    const actual = createHash('sha256').update(readFileSync(abs)).digest('hex');
    checked += 1;
    bytes += statSync(abs).size;
    if (actual !== src.snapshotHash) {
      problems.push({
        id: src.id,
        kind: 'hash-mismatch',
        path: src.snapshotPath,
        expected: src.snapshotHash,
        actual,
      });
    }
  }
  return { problems, checked, bytes };
}

// Na Windowsu `file://${argv[1]}` NE odgovara `import.meta.url` (pogon daje `file:///C:/...`),
// pa se usporedjuje kroz pathToFileURL. Bez toga skripta tiho ne radi nista kad se pokrene izravno.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const all = process.argv.includes('--all');
  const { problems, checked, bytes } = checkSourceHashes({ all });
  console.log('=== Integritet snapshota izvora ===');
  console.log(`provjereno: ${checked} datoteka (${(bytes / 1024 / 1024).toFixed(1)} MB)${all ? ', CIJELI registar' : ', samo izvori bodovanih pravila'}`);
  for (const problem of problems) {
    console.log(`  ${problem.kind.toUpperCase()} [${problem.id}] ${problem.path ?? ''}`);
    if (problem.expected) console.log(`    registar: ${problem.expected}\n    na disku: ${problem.actual}`);
  }
  console.log(problems.length ? `\nNESUGLASJA: ${problems.length}` : '\nsve se slaze');
  process.exit(problems.length ? 1 : 0);
}
