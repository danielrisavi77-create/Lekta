/**
 * Stanje MANIFESTA DOKAZA nad lokalnim korpusom: koliko dokumenata uopce smije brojati kao dokaz
 * na stvarnom radu (razina A), i sto tocno nedostaje ostalima.
 *
 * Ne upisuje manifest: ocekivanje i potpis pregleda su ljudski zapis, a upravo bi ih strojno
 * popunjavanje obesmislilo. Nije, medjutim, posve bez nuspojava: pokrenuta kroz `vite-node` povlaci
 * vite plugin `generate-citation-tools`, koji pise u `dist/` (gitignored). Nijedna pracena datoteka
 * se ne mijenja.
 *
 * Pokreni:  npx vite-node scripts/corpus-evidence.mts [--skeleton]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
import { manifestGaps, proofMethodGaps, countsAsRealDocxProof, type EvidenceManifest, type ProofMethod } from '../src/corpus/evidence-manifest';

const ROOT = process.env.LEKTA_CORPUS_ROOT || 'C:/Users/PC/LektaCorpus/corpus';

if (process.argv.includes('--skeleton')) {
  console.log(JSON.stringify({
    expected: {
      findings: [{ checkId: 'page.margins', expectFail: true, because: 'zasto to ocekujes' }],
      recordedAt: new Date().toISOString(),
      recordedBy: 'Ime Prezime',
    },
    visualReview: { reviewedAt: '', reviewedBy: '', verdict: 'slaze-se', note: '' },
    runs: [],
  }, null, 2));
  process.exit(0);
}

if (!existsSync(ROOT)) {
  console.log(`[korpus] ${ROOT} ne postoji na ovom stroju; nema sto mjeriti.`);
  process.exit(0);
}

let method: ProofMethod | null = null;
try {
  method = JSON.parse(readFileSync(join(ROOT_REPO, 'data/verification/proof-method.json'), 'utf8'));
} catch { method = null; }
const methodGaps = proofMethodGaps(method);

let total = 0, admitted = 0, proof = 0;
const gapCounts: Record<string, number> = {};
const withProfile: string[] = [];

for (const f of readdirSync(ROOT).filter((x) => x.endsWith('.docx'))) {
  total++;
  let side: (EvidenceManifest & { profileId?: unknown }) = {};
  try { side = JSON.parse(readFileSync(join(ROOT, f.replace(/\.docx$/, '.json')), 'utf8')); } catch { /* nema */ }
  if (typeof side.profileId === 'string' && side.profileId) { admitted++; withProfile.push(f); }
  if (countsAsRealDocxProof(side, method)) proof++;
  for (const gap of manifestGaps(side)) gapCounts[gap] = (gapCounts[gap] ?? 0) + 1;
}

console.log(`[korpus] dokumenata ${total} | s profilom ${admitted} | VRIJEDI KAO DOKAZ ${proof}`);
if (methodGaps.length) {
  console.log('[korpus] METODA NIJE POTPISANA, pa nijedan dokument ne moze vrijediti kao dokaz:');
  for (const g of methodGaps) console.log(`   ${g}`);
  console.log('[korpus] potpis ide u data/verification/proof-method.json (signedBy, signedAt).');
}
console.log('[korpus] razlozi zbog kojih ostali ne vrijede:');
for (const [gap, n] of Object.entries(gapCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(4)}  ${gap}`);
}
if (proof === 0) {
  console.log('[korpus] NIJEDAN dokument jos ne nosi razinu A.');
  console.log('[korpus] Po dokumentu treba: ocekivanje zapisano PRIJE runa (npm run corpus-oracle),');
  console.log('[korpus] sam run, i provjera renderiranog (npm run verify:word ili ljudski pregled).');
  console.log('[korpus] Uz to metoda mora biti potpisana JEDNOM, u proof-method.json.');
}
