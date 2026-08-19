/**
 * CLI: zapisi verifikacijski worklist za ljudski pass (data/verification/dossiers/**).
 *
 *   npx vite-node scripts/verification-worklist.mts
 *   npm run worklist
 *
 * Sva logika je u src/verification/worklist.ts (tipizirana, dijeljena s
 * tests/verification-worklist.test.ts, koji pada ako se pravila promijene bez regeneriranja).
 * vite-node jer staging nacrti dolaze preko import.meta.glob, sto obican Node ne razrjesava -
 * ranija .mjs inacica je zato imala vlastitu kopiju merge semantike i nije se mogla uvesti u
 * vitest, pa je commitani izlaz tiho zastario.
 *
 * Skripta NISTA ne proglasava verificiranim; samo priprema dosje da covjek ne kopa po PDF-u.
 */
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
  DRAFT_PROFILE_IDS,
} from '../src/profiles/drafts-runtime';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import { computeWorklist } from '../src/verification/worklist';
import type { ThesisProfile, SourceEntry } from '../src/profiles/profile-schema';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const profiles = [
  ...VERIFIED_PROFILES_WITH_DRAFTS,
  ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
] as unknown as ThesisProfile[];
const registered = new Set(profiles.map((p) => p.id));
const orphans = DRAFT_PROFILE_IDS.filter((id) => !registered.has(id));

const report = computeWorklist(profiles, SOURCE_REGISTRY as SourceEntry[], orphans);

const dossierDir = join(root, 'data', 'verification', 'dossiers');
mkdirSync(dossierDir, { recursive: true });

// Zapisi svjeze, pa OBRISI dosjee koji vise ne pripadaju: profil koji je u medjuvremenu
// proso ljudski audit inace ostavlja datoteku koja i dalje trazi audit.
const written = new Set<string>();
for (const [rel, content] of Object.entries(report.files)) {
  writeFileSync(join(root, rel), content);
  written.add(rel.slice(rel.lastIndexOf('/') + 1));
}
const stale = readdirSync(dossierDir).filter((f) => f.endsWith('.md') && !written.has(f));
for (const f of stale) rmSync(join(dossierDir, f));

console.log('=== Verifikacijski worklist ===');
console.log(
  `profila sa scored: ${report.totals.profilesWithScored}, scored ukupno: ${report.totals.scoredTotal}`,
);
console.log(
  `ljudski potvrdjeno: ${report.totals.human}, za audit (bulk): ${report.totals.bulk}, needs-recheck: ${report.totals.recheck}`,
);
console.log(`dosjea zapisano: ${report.totals.dossiersWritten}${stale.length ? `, uklonjeno: ${stale.length}` : ''}`);
if (orphans.length) console.log(`UPOZORENJE: draft bez profila u registru: ${orphans.join(', ')}`);
console.log('master: data/verification/dossiers/INDEX.md');
