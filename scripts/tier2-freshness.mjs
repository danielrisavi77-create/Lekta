// scripts/tier2-freshness.mjs
//
// Vrijedi li zapisani Tier 2 dokaz (pravi Word) jos uvijek za kod koji danas stoji u repozitoriju.
// Razlog i izmjereni primjer: `scripts/tier2-freshness-core.mjs`.
//
//   npm run tier2-freshness
//
// Izlazni kod 1 kad je dokaz zastario, inace 0.
//
// NAMJERNO NIJE u `npm run check`: trazi git POVIJEST (`A..HEAD`), a `actions/checkout` u CI-u
// klonira do dubine 1, pa bi ondje pao ili prolazio vakuumski. Uz to Tier 2 je Windows-only, pa ga
// CI ionako ne moze pokrenuti. Ovo je alat za trenutak prije nego repair izmjene odu dalje.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { formatFreshness, tier2Freshness } from './tier2-freshness-core.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROOF = join(ROOT, 'docs', 'generated', 'RELEASE_PROOF.json');

function readProof() {
  if (!existsSync(PROOF)) return null;
  try {
    return JSON.parse(readFileSync(PROOF, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Commiti nad `src/repair/` izmedju zapisanog dokaza i HEAD-a.
 *
 * Kad zapisani commit u ovom klonu ne postoji (plitak klon, ili dokaz s druge grane), to NIJE
 * "nema izmjena" nego nepoznato stanje, pa se javlja kao zastarjelo: tisina bi ovdje bila lazno
 * zeleno tocno onog oblika koji ovaj alat lovi.
 */
function repairCommitsSince(commit) {
  try {
    execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: ROOT, stdio: 'ignore' });
  } catch {
    return [{ sha: commit, subject: '(zapisani commit ne postoji u ovom klonu; dokaz se ne moze provjeriti)' }];
  }
  const out = execFileSync('git', ['log', '--format=%H%x09%s', `${commit}..HEAD`, '--', 'src/repair/'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, ...rest] = line.split('\t');
      return { sha, subject: rest.join('\t') };
    });
}

const proof = readProof();
const since = proof?.commit ? repairCommitsSince(proof.commit) : [];
const status = tier2Freshness(proof, since);
console.log(formatFreshness(status));
process.exit(status.fresh ? 0 : 1);
