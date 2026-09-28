/**
 * CLI: zapisi privatni worklist dokaznog AI-audita (JSON plus profilni dosjei).
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
 * Skripta ne potvrduje pravila. Valjan status AI-audita mora doci iz deterministickog validatora.
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
import { loadRepositoryAiEvidenceContext } from './ai-evidence-context-loader';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const profiles = [
  ...VERIFIED_PROFILES_WITH_DRAFTS,
  ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
] as unknown as ThesisProfile[];
const registered = new Set(profiles.map((p) => p.id));
const orphans = DRAFT_PROFILE_IDS.filter((id) => !registered.has(id));

const evidenceContext = await loadRepositoryAiEvidenceContext(root, profiles, SOURCE_REGISTRY as SourceEntry[]);
const report = computeWorklist(profiles, SOURCE_REGISTRY as SourceEntry[], orphans, {
  aiEvidenceResults: evidenceContext.resultsByRule,
});

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

console.log('=== Worklist dokaznog AI-audita ===');
console.log(
  `profila sa scored: ${report.totals.profilesWithScored}, scored ukupno: ${report.totals.scoredTotal}`,
);
console.log(`pravila: ${report.totals.ruleCount}; AI-evidence valjano: ${report.totals.aiEvidenceVerified}; ceka dokaz: ${report.totals.needsAiEvidence}; legacy ljudski: ${report.totals.humanVerified}; nebodovana: ${report.totals.notScored}`);
console.log(`AI paketa lokalno revalidirano: ${Object.keys(evidenceContext.resultsByRule).length}; nevaljano: ${Object.values(evidenceContext.resultsByRule).filter((result) => !result.valid).length}`);
console.log(`dosjea zapisano: ${report.totals.dossiersWritten}${stale.length ? `, uklonjeno: ${stale.length}` : ''}`);
console.log('JSON: data/verification/ai-evidence-worklist.json');
if (orphans.length) console.log(`UPOZORENJE: draft bez profila u registru: ${orphans.join(', ')}`);
console.log('master: data/verification/dossiers/INDEX.md');
