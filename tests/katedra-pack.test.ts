/**
 * Drift + korektnost katedra-pack.json (izvoz za sestrinski proizvod Katedra).
 *
 * Vidi CLAUDE.md "Lekta nikad ne generira niti ne prepravlja sadrzaj rada": ovo je
 * jednosmjeran, cisto informativan izvoz (Lekta -> Katedra), racunat cistom funkcijom
 * (src/integrations/katedra-pack.ts) da generator (scripts/generate-katedra-pack.mts) i
 * ovaj test ne dupliciraju logiku. Ako padne: `npm run pack:katedra` pa commit.
 */
import { describe, it, expect } from 'vitest';

import committedPack from '../dist-packs/katedra-pack.json';
import statusLabels from '../data/profiles/profile-status.json';
import { VERIFIED_PROFILES_WITH_DRAFTS } from '../src/profiles/drafts-runtime';
import { ZAGREB_CATALOG } from '../src/catalog/catalog-loader';
import { buildKatedraPack, KATEDRA_PACK_SCHEMA_VERSION } from '../src/integrations/katedra-pack';

describe('katedra-pack: drift + korektnost', () => {
  it('commitani dist-packs/katedra-pack.json === svjezi izracun (drift guard)', () => {
    const fresh = buildKatedraPack(VERIFIED_PROFILES_WITH_DRAFTS, ZAGREB_CATALOG, statusLabels);
    expect(committedPack).toEqual(fresh);
  });

  it('sadrzi samo verified/partial profile, nikad research/generic', () => {
    expect(committedPack.profiles.length).toBeGreaterThan(0);
    for (const p of committedPack.profiles) {
      expect(['verified', 'partial']).toContain(p.status);
    }
  });

  it('svaki profil u packu pripada nekoj jedinici u units indeksu', () => {
    const unitIds = new Set(committedPack.units.map((u) => u.id));
    for (const p of committedPack.profiles) {
      expect(unitIds.has(p.unitId)).toBe(true);
    }
  });

  it('meta.schemaVersion je stabilna, versionirana vrijednost', () => {
    expect(committedPack.meta.schemaVersion).toBe(KATEDRA_PACK_SCHEMA_VERSION);
  });

  it('pack nikad ne nosi tekst dokumenta ili sadrzaj rada, samo profil-metapodatke', () => {
    const json = JSON.stringify(committedPack);
    expect(json).not.toMatch(/paragraphs|documentText|fileContent/i);
  });
});
