/**
 * Pece serverski artefakt profile-rules isporuke (faza B plana zastite baze pravila):
 * data/profiles/verified-profiles.json + data/profiles/repair-map.json ->
 * data/generated/profile-rules-server.json.
 *
 * Pokretanje: npm run gen-profile-rules-server (vite-node, kao repair-recipe).
 * Logika slaganja zivi u src/profiles/profile-rules-contract.ts (dijeljena s Edge
 * funkcijom i testovima); ovdje je samo I/O. Drift cuva tests/profile-rules-server.test.ts.
 * Artefakt je server-only (data/generated/** je forbidden u data/classification.json)
 * i NIKAD ne smije u browser bundle.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProfileRulesArtifact, type SourceIndex } from '../src/profiles/profile-rules-contract';
import { buildEvidenceIndex } from '../src/profiles/evidence-projection';
import { draftFilePaths } from './draft-files';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const sha256Hex = (input: string) => createHash('sha256').update(input, 'utf8').digest('hex');

const verified = JSON.parse(
  readFileSync(resolve(ROOT, 'data', 'profiles', 'verified-profiles.json'), 'utf8'),
) as Array<Record<string, unknown>>;
const repairMap = JSON.parse(
  readFileSync(resolve(ROOT, 'data', 'profiles', 'repair-map.json'), 'utf8'),
) as Record<string, unknown[]>;

// Registar izvora je jedini nositelj identiteta izvora (`id`), a profilni `sources` niz ima samo
// naslov i URL. Bez ovog indeksa citat u sucelju ne moze reci IZ KOJEG dokumenta dolazi.
// Iz registra izlaze SAMO title i url; `snapshotHash` je kanarinac i ostaje ovdje.
const registry = JSON.parse(
  readFileSync(resolve(ROOT, 'data', 'sources', 'source-registry.json'), 'utf8'),
) as Array<{ id?: unknown; title?: unknown; url?: unknown }>;
const sourceIndex: SourceIndex = {};
for (const row of registry) {
  if (typeof row?.id !== 'string' || typeof row.title !== 'string' || typeof row.url !== 'string') continue;
  sourceIndex[row.id] = { title: row.title, url: row.url };
}

// DOKAZI iz autorskih draftova. Ucitavaju se ovdje, a projiciraju u `evidence-projection.ts`,
// koji propusta tocno sest polja; draft nosi i potpise verifikatora i kanarince, koji NE izlaze.
const draftFiles = draftFilePaths(ROOT)
  .map((rel) => JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8')) as Record<string, unknown>);
const evidenceIndex = buildEvidenceIndex(draftFiles, sourceIndex);

const artifact = buildProfileRulesArtifact(verified, repairMap, sha256Hex, sourceIndex, evidenceIndex);

const outPath = resolve(ROOT, 'data', 'generated', 'profile-rules-server.json');
writeFileSync(outPath, `${JSON.stringify(artifact)}\n`, 'utf8');

const ids = Object.keys(artifact.profiles);
const withRepair = ids.filter((id) => artifact.profiles[id].repairEntries.length > 0).length;
const withSource = ids.reduce((n, id) => n + artifact.profiles[id].repairEntries
  .filter((e) => !!(e as { source?: unknown }).source).length, 0);
console.log(
  `[gen-profile-rules-server] OK: ${ids.length} profila (${withRepair} s repair unosima), ` +
  `${withSource} unosa s razrijesenim izvorom, datasetVersion ${artifact.datasetVersion.slice(0, 12)}..., zapisano u data/generated/profile-rules-server.json`,
);
