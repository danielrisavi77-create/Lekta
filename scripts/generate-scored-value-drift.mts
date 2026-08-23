/**
 * Generator artefakta raskoraka izmedju VERIFICIRANE TVRDNJE i vrijednosti koju motor BODUJE.
 *
 * Pokreni:  npm run scored-value-drift
 * (vite-node jer draftovi dolaze preko import.meta.glob; obican Node to ne razrjesava.)
 *
 * Izlaz `data/verification/scored-value-drift.json` ima dvije uloge:
 *  1. DOKAZ: popis svakog raskoraka s izvorom i lokatorom, da vlasnik odlucuje s dokazom pred sobom.
 *  2. ULAZ U DEMOTIJU: `demotedByProfile` cita `advisory-demotion.ts` i gasi bodovanje osi na kojoj
 *     se tvrdnja i motor ne slazu, dok se slucaj ne presudi.
 *
 * Logika je u `src/verification/scored-value-drift.ts` da je drift guard
 * (`tests/scored-value-drift.test.ts`) moze ponovno izracunati; ovdje je samo pisanje na disk.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import { buildScoredValueDrift } from '../src/verification/scored-value-drift';
import type { ThesisProfile, SourceEntry } from '../src/profiles/profile-schema';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const payload = buildScoredValueDrift(
  [...VERIFIED_PROFILES_WITH_DRAFTS, ...LEGAL_DEPARTMENTS_WITH_DRAFTS] as unknown as ThesisProfile[],
  SOURCE_REGISTRY as SourceEntry[],
);

const out = join(root, 'data', 'verification', 'scored-value-drift.json');
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log('[scored-value-drift]', JSON.stringify(payload.counts));
console.log('[scored-value-drift] zapisano:', out);
