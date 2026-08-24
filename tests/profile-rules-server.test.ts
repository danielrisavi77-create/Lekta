/**
 * Drift i korektnost pecenog serverskog artefakta profile-rules isporuke (faza B0).
 * Commitani data/generated/profile-rules-server.json mora biti IDENTICAN ponovnom
 * izracunu iz izvora (verified-profiles.json + repair-map.json) kroz dijeljeni
 * builder (src/profiles/profile-rules-contract.ts). Ako padne:
 * `npm run gen-profile-rules-server` pa commit.
 *
 * Uz drift, cuva i minimizaciju: nijedan isporuceni profil ne nosi profileLabel,
 * catalogPrograms ni fieldValidation.publicSources (ondje zivi kanarinac, pa je
 * njegova odsutnost iz artefakta dokaz da strip radi), a artefakt kao cjelina ne
 * sadrzi nijedan never-marker kljuc ni kanarinac vrijednost iz manifesta.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildProfileRulesArtifact,
  selectServedProfileFields,
  type ProfileRulesServerArtifact,
} from '../src/profiles/profile-rules-contract';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore .mjs moduli bez deklaracija; tsconfig include je samo src
import { loadManifest } from '../scripts/security/classification.mjs';
// @ts-ignore isto
import { findKeyMarkers, findValues } from '../scripts/security/never-markers.mjs';

const ROOT = resolve(__dirname, '..');
const sha256Hex = (input: string) => createHash('sha256').update(input, 'utf8').digest('hex');

const artifactText = readFileSync(resolve(ROOT, 'data', 'generated', 'profile-rules-server.json'), 'utf8');
const artifact = JSON.parse(artifactText) as ProfileRulesServerArtifact;
const verified = JSON.parse(
  readFileSync(resolve(ROOT, 'data', 'profiles', 'verified-profiles.json'), 'utf8'),
) as Array<Record<string, unknown>>;
const repairMap = JSON.parse(
  readFileSync(resolve(ROOT, 'data', 'profiles', 'repair-map.json'), 'utf8'),
) as Record<string, unknown[]>;

describe('profile-rules serverski artefakt', () => {
  it('commitani artefakt === ponovni izracun iz izvora (drift)', () => {
    const rebuilt = buildProfileRulesArtifact(verified, repairMap, sha256Hex);
    expect(artifactText.trimEnd()).toBe(JSON.stringify(rebuilt));
  });

  it('svaki profil iz izvora istine je isporucen, i nijedan visak', () => {
    const sourceIds = new Set(verified.map((p) => String(p.id)));
    const servedIds = new Set(Object.keys(artifact.profiles));
    expect(servedIds).toEqual(sourceIds);
    expect(servedIds.size).toBeGreaterThan(400);
  });

  it('minimizacija: bez profileLabel, catalogPrograms i publicSources u isporuci', () => {
    for (const [id, entry] of Object.entries(artifact.profiles)) {
      expect('profileLabel' in entry.profile, `${id}: profileLabel isporucen`).toBe(false);
      expect('catalogPrograms' in entry.profile, `${id}: catalogPrograms isporucen`).toBe(false);
      const fv = entry.profile.fieldValidation as Record<string, unknown> | undefined;
      if (fv) expect('publicSources' in fv, `${id}: publicSources isporucen`).toBe(false);
    }
  });

  it('repairEntries prate repair-map (svaki profil s mapom nosi svoje unose)', () => {
    let withEntries = 0;
    for (const [id, entry] of Object.entries(artifact.profiles)) {
      const expected = Array.isArray(repairMap[id]) ? repairMap[id] : [];
      expect(entry.repairEntries).toEqual(expected);
      if (entry.repairEntries.length > 0) withEntries += 1;
    }
    expect(withEntries).toBeGreaterThan(300);
  });

  it('artefakt ne sadrzi never-marker kljuceve ni kanarince iz manifesta', () => {
    expect(findKeyMarkers(artifactText)).toEqual([]);
    const manifest = loadManifest(ROOT) as { canaries: Array<{ value: string }> };
    expect(findValues(artifactText, manifest.canaries.map((c) => c.value))).toEqual([]);
  });

  it('negativna kontrola: strip publicSources stvarno grize', () => {
    const doctored = {
      id: 'proba',
      profileLabel: 'x',
      catalogPrograms: [],
      fieldValidation: { sample: 1, publicSources: [{ pid: 'p:1', sha256: 'abc' }] },
      rules: { font: ['Times New Roman'] },
    };
    const served = selectServedProfileFields(doctored as unknown as Record<string, unknown>);
    expect('profileLabel' in served).toBe(false);
    expect('catalogPrograms' in served).toBe(false);
    expect('publicSources' in (served.fieldValidation as Record<string, unknown>)).toBe(false);
    expect((served.fieldValidation as Record<string, unknown>).sample).toBe(1);
    expect(served.rules).toEqual({ font: ['Times New Roman'] });
  });
});
