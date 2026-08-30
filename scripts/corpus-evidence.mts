/**
 * Stanje MANIFESTA DOKAZA nad lokalnim korpusom: koliko dokumenata uopce smije brojati kao dokaz
 * na stvarnom radu (razina A), i sto tocno nedostaje ostalima.
 *
 * Read-only. Manifest se NE upisuje strojno: ocekivanje i potpis pregleda su ljudski zapis, a
 * upravo je njihovo strojno popunjavanje ono sto bi cijelu mjeru obesmislilo.
 *
 * Pokreni:  npx vite-node scripts/corpus-evidence.mts [--skeleton]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { manifestGaps, countsAsRealDocxProof, type EvidenceManifest } from '../src/corpus/evidence-manifest';

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

let total = 0, admitted = 0, proof = 0;
const gapCounts: Record<string, number> = {};
const withProfile: string[] = [];

for (const f of readdirSync(ROOT).filter((x) => x.endsWith('.docx'))) {
  total++;
  let side: (EvidenceManifest & { profileId?: unknown }) = {};
  try { side = JSON.parse(readFileSync(join(ROOT, f.replace(/\.docx$/, '.json')), 'utf8')); } catch { /* nema */ }
  if (typeof side.profileId === 'string' && side.profileId) { admitted++; withProfile.push(f); }
  if (countsAsRealDocxProof(side)) proof++;
  for (const gap of manifestGaps(side)) gapCounts[gap] = (gapCounts[gap] ?? 0) + 1;
}

console.log(`[korpus] dokumenata ${total} | s profilom ${admitted} | VRIJEDI KAO DOKAZ ${proof}`);
console.log('[korpus] razlozi zbog kojih ostali ne vrijede:');
for (const [gap, n] of Object.entries(gapCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(4)}  ${gap}`);
}
if (proof === 0) {
  console.log('[korpus] NIJEDAN dokument jos ne nosi razinu A. To nije kvar alata nego izostanak');
  console.log('[korpus] ljudskog zapisa: ocekivanje prije pokretanja i potpis vizualnog pregleda.');
  console.log('[korpus] Predlozak za jedan dokument: npx vite-node scripts/corpus-evidence.mts --skeleton');
}
