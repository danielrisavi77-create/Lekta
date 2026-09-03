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
import { draftFilePaths } from '../scripts/draft-files';
import { resolve } from 'node:path';
import { buildEvidenceIndex } from '../src/profiles/evidence-projection';
import {
  buildProfileRulesArtifact,
  selectServedProfileFields,
  type ProfileRulesServerArtifact,
  type SourceIndex,
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
// Registar izvora nosi jedini identitet izvora (`id`); profilni `sources` niz ima samo naslov i URL.
// Bez njega ponovni izracun ne bi imao `source` na unosima, pa bi drift test lazno pao.
const registry = JSON.parse(
  readFileSync(resolve(ROOT, 'data', 'sources', 'source-registry.json'), 'utf8'),
) as Array<{ id?: unknown; title?: unknown; url?: unknown }>;
const sourceIndex: SourceIndex = {};
for (const row of registry) {
  if (typeof row?.id !== 'string' || typeof row.title !== 'string' || typeof row.url !== 'string') continue;
  sourceIndex[row.id] = { title: row.title, url: row.url };
}
// Dokazi se citaju iz ISTIH draftova kao u generatoru. Kad bi test gradio bez njih, drift bi
// prijavio razliku koje nema i tjerao na regeneraciju koja bi dokaze IZBRISALA iz artefakta.
const draftFiles = draftFilePaths(ROOT)
  .map((rel) => JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8')) as Record<string, unknown>);
const evidenceIndex = buildEvidenceIndex(draftFiles, sourceIndex);


describe('profile-rules serverski artefakt', () => {
  it('commitani artefakt === ponovni izracun iz izvora (drift)', () => {
    const rebuilt = buildProfileRulesArtifact(verified, repairMap, sha256Hex, sourceIndex, evidenceIndex);
    expect(artifactText.trimEnd()).toBe(JSON.stringify(rebuilt));
  });

  /**
   * VEZA IZVOR-PRAVILO. Citat bez razrijesenog izvora je tvrdnja bez uporista: sucelje bi
   * prikazalo doslovan navod a ne bi moglo reci iz kojeg dokumenta dolazi. Izmjereno pri
   * uvodjenju: 91 unos s citatom, svih 91 razrijesivo iz registra.
   */
  it('svaki unos s doslovnim citatom ima razrijesen izvor (naslov i URL)', () => {
    const quoted: string[] = [];
    const unresolved: string[] = [];
    for (const [id, entry] of Object.entries(artifact.profiles)) {
      for (const raw of entry.repairEntries) {
        const e = raw as { quote?: unknown; sourceId?: unknown; source?: { title?: unknown; url?: unknown } };
        if (typeof e.quote !== 'string' || !e.quote.trim()) continue;
        quoted.push(`${id}:${String(e.sourceId)}`);
        if (typeof e.source?.title !== 'string' || typeof e.source?.url !== 'string') {
          unresolved.push(`${id}:${String(e.sourceId)}`);
        }
      }
    }
    expect(quoted.length, 'nijedan citat nije pronadjen, mjerenje je vakuumsko').toBeGreaterThan(50);
    expect(unresolved, 'citati bez razrijesenog izvora').toEqual([]);
  });

  /**
   * Registar uz naslov i URL drzi i `snapshotHash`, koji je PRIRODNI KANARINAC iz
   * klasifikacijskog manifesta. Iz njega ovim putem izlaze samo naslov, URL i id.
   */
  it('razrijeseni izvor ne iznosi provenijenciju iz registra', () => {
    for (const [id, entry] of Object.entries(artifact.profiles)) {
      for (const raw of entry.repairEntries) {
        const src = (raw as { source?: Record<string, unknown> }).source;
        if (!src) continue;
        expect(Object.keys(src).sort(), `${id}: izvor nosi visak polja`).toEqual(['id', 'title', 'url']);
      }
    }
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
    // Isporuka od 2026-08-31 dodaje razrijesen `source` (naslov i URL iz registra izvora).
    // Invarijanta se time NE popusta: nakon skidanja tog jednog polja unos mora biti
    // BAJT-JEDNAK zapisu iz repair-mape, pa nikakva druga izmjena ne moze proci nezapazeno.
    let withEntries = 0;
    let attached = 0;
    for (const [id, entry] of Object.entries(artifact.profiles)) {
      const expected = Array.isArray(repairMap[id]) ? repairMap[id] : [];
      const stripped = entry.repairEntries.map((raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
        const { source, ...rest } = raw as Record<string, unknown>;
        if (source) attached += 1;
        return rest;
      });
      expect(stripped, `${id}: serirani unosi odlutali od repair-mape`).toEqual(expected);
      if (entry.repairEntries.length > 0) withEntries += 1;
    }
    expect(withEntries).toBeGreaterThan(300);
    expect(attached, 'nijedan izvor nije prikacen, veza je mrtva').toBeGreaterThan(50);
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
