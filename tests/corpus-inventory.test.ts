/**
 * Faza 1 (Lekta Error Corpus): inventar provjera je neprazan, potpun i determinist ican.
 *
 * Ne pinajemo tocne brojeve (rastu kako se dodaju provjere) nego INVARIJANTE: svaka provjera
 * ima naslov, intake kodovi su runtime-dokazani, svi COMPILED_CHECK_IDS su prisutni, matrica
 * pokriva sve profile, i dva poziva daju identican rezultat (determinizam za corpus harness).
 *
 * Inventar se gradi JEDNOM (beforeAll) i dijeli medju asertima; determinizam se dokazuje
 * zasebnim, malim buildom. Puni artefakt (tests/corpus/generated/*) generira
 * `npm run corpus:inventory`.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInventory, type Inventory } from './corpus/inventory/extract-check-inventory';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';
import { COMPILED_CHECK_IDS } from '../src/profiles/rule-compiler';

describe('Lekta Error Corpus - inventar provjera (faza 1)', () => {
  let inv: Inventory;
  beforeAll(async () => { inv = await buildInventory({ sampleLimit: 8 }); }, 30000);

  it('gradi neprazan, dobro oblikovan inventar', () => {
    // Staticki scan sam garantira vecinu; runtime dodaje razrijesene naslove.
    expect(inv.checks.length).toBeGreaterThanOrEqual(60);
    expect(inv.counts.scoredChecks).toBeGreaterThanOrEqual(30);
    for (const c of inv.checks) {
      expect(c.title.length, `prazan naslov provjere u ${c.category}`).toBeGreaterThan(0);
      expect(typeof c.category).toBe('string');
    }
    // Bez duplikata (kategorija::naslov je kljuc).
    const keys = inv.checks.map((c) => `${c.category}::${c.title}`);
    expect(new Set(keys).size).toBe(keys.length);

    // Nalazi (issue): staticki scan je bogat.
    expect(inv.counts.uniqueIssueTitles).toBeGreaterThanOrEqual(60);
    for (const i of inv.issues) expect(i.title.length).toBeGreaterThan(0);
  });

  it('runtime-dokazuje sve intake reject kodove + suspicious signal', () => {
    const rejects = inv.intakeCodes.filter((c) => c.code !== 'suspicious');
    expect(rejects.length).toBe(6);
    for (const c of rejects) expect(c.proven, `intake kod ${c.code} nije runtime-dokazan`).toBe(true);
    const susp = inv.intakeCodes.find((c) => c.code === 'suspicious');
    expect(susp?.proven, 'suspicious signal nije runtime-dokazan').toBe(true);
  });

  it('pokriva sve COMPILED_CHECK_IDS i konformansne dimenzije', () => {
    expect([...inv.compiledCheckIds].sort()).toEqual([...COMPILED_CHECK_IDS].sort());
    expect(inv.compiledCheckIds.length).toBe(COMPILED_CHECK_IDS.length);
    for (const d of ['font', 'size', 'spacing', 'margins', 'paper', 'justify', 'toc', 'pagenums', 'sections', 'words', 'struktura', 'fusnote']) {
      expect(inv.scoredDimensions).toContain(d);
    }
  });

  it('profilna matrica pokriva sve profile registra', () => {
    expect(inv.profileMatrix.length).toBe(VERIFIED_PROFILE_REGISTRY.length);
    expect(inv.counts.profiles).toBe(VERIFIED_PROFILE_REGISTRY.length);
    for (const row of inv.profileMatrix) {
      expect(row.profileId.length).toBeGreaterThan(0);
      for (const d of inv.scoredDimensions) expect(row.dims[d] === 0 || row.dims[d] === 1).toBe(true);
    }
  });

  it('je deterministican (isti ulaz -> isti inventar)', async () => {
    const a = await buildInventory({ sampleLimit: 2 });
    const b = await buildInventory({ sampleLimit: 2 });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  }, 30000);

  it('commitani artefakt postoji i parsira se', () => {
    const p = resolve(dirname(fileURLToPath(import.meta.url)), 'corpus/generated/current-check-inventory.json');
    const artifact = JSON.parse(readFileSync(p, 'utf8'));
    expect(artifact.counts.checks).toBeGreaterThanOrEqual(50);
    expect(artifact.counts.profiles).toBe(VERIFIED_PROFILE_REGISTRY.length);
    expect(Array.isArray(artifact.checks)).toBe(true);
  });
});
