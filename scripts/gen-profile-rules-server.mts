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
import { buildProfileRulesArtifact } from '../src/profiles/profile-rules-contract';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const sha256Hex = (input: string) => createHash('sha256').update(input, 'utf8').digest('hex');

const verified = JSON.parse(
  readFileSync(resolve(ROOT, 'data', 'profiles', 'verified-profiles.json'), 'utf8'),
) as Array<Record<string, unknown>>;
const repairMap = JSON.parse(
  readFileSync(resolve(ROOT, 'data', 'profiles', 'repair-map.json'), 'utf8'),
) as Record<string, unknown[]>;

const artifact = buildProfileRulesArtifact(verified, repairMap, sha256Hex);

const outPath = resolve(ROOT, 'data', 'generated', 'profile-rules-server.json');
writeFileSync(outPath, `${JSON.stringify(artifact)}\n`, 'utf8');

const ids = Object.keys(artifact.profiles);
const withRepair = ids.filter((id) => artifact.profiles[id].repairEntries.length > 0).length;
console.log(
  `[gen-profile-rules-server] OK: ${ids.length} profila (${withRepair} s repair unosima), ` +
  `datasetVersion ${artifact.datasetVersion.slice(0, 12)}..., zapisano u data/generated/profile-rules-server.json`,
);
