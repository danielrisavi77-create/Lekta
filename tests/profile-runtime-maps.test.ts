/**
 * Drift + faithfulness guard za PECENE runtime mape (audit performance-01/02).
 *
 * Zivi app.ts vise ne cita drafts/source-registry nego pecene mape (data/profiles/advisory-map.json,
 * repair-map.json). Ovaj test dokazuje:
 *  (1) pecene mape su BIT-identicne izracunu iz izvora (drafts-runtime + source-registry); ako netko
 *      dira drafts ili source-registry a ne regenerira mape, ovo pada (regeneriraj:
 *      `npx vite-node scripts/gen-profile-runtime-maps.mts`).
 *  (2) applyBakedAdvisory (pecena putanja) daje IDENTICAN ishod kao stari applyScoredAdvisory
 *      (racunska putanja) za SVAKI profil -> demotion se nije promijenio premjestanjem u build.
 */
import { describe, it, expect } from 'vitest';
import bakedAdvisory from '../data/profiles/advisory-map.json';
import bakedRepair from '../data/profiles/repair-map.json';
import { DRAFT_PROFILE_IDS, draftRuleEntriesFor } from '../src/profiles/drafts-runtime';
import { computeDemotedAdvisory, applyScoredAdvisory } from '../src/profiles/advisory-demotion';
import { applyBakedAdvisory } from '../src/profiles/profile-runtime-maps';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import type { SourceEntry } from '../src/profiles/profile-schema';

const SOURCES = SOURCE_REGISTRY as SourceEntry[];

/** Ista logika kao scripts/gen-profile-runtime-maps.mts (izvor istine za pecenje). */
function expectedMaps() {
  const advisory: Record<string, string[]> = {};
  const repair: Record<string, unknown[]> = {};
  for (const id of [...DRAFT_PROFILE_IDS].sort()) {
    const entries = draftRuleEntriesFor(id);
    if (entries.length === 0) continue;
    advisory[id] = computeDemotedAdvisory({ id }, entries, SOURCES);
    const r = entries
      .filter((e) => e.autoFixable === true && e.status === 'verified' && e.fixerId && e.checkId)
      .map((e) => ({
        ruleId: e.ruleId,
        checkId: e.checkId,
        label: e.label,
        status: e.status,
        fixerId: e.fixerId,
        autoFixable: e.autoFixable,
      }));
    if (r.length > 0) repair[id] = r;
  }
  return { advisory, repair };
}

const freshBase = () =>
  ({
    checkFont: true, checkSize: true, checkSpacing: true, checkMargins: true,
    checkJustify: true, requireA4: true, requireToc: true, requirePageNumbers: true,
  }) as Record<string, unknown>;

describe('pecene runtime mape: drift i faithfulness', () => {
  it('advisory-map.json == izracun iz izvora (drafts + source-registry)', () => {
    expect(bakedAdvisory).toEqual(expectedMaps().advisory);
  });

  it('repair-map.json == izracun iz izvora', () => {
    expect(bakedRepair).toEqual(expectedMaps().repair);
  });

  it('applyBakedAdvisory bit-identican starom applyScoredAdvisory za SVAKI profil', () => {
    for (const id of Object.keys(bakedAdvisory as Record<string, string[]>)) {
      const b1 = freshBase();
      const d1 = applyScoredAdvisory(b1, { id }, draftRuleEntriesFor(id), SOURCES);
      const b2 = freshBase();
      const d2 = applyBakedAdvisory(b2, id);
      expect(d2).toEqual(d1);
      expect(b2).toEqual(b1);
    }
  });

  it('profil bez ruleEntries: applyBakedAdvisory ne dira base (advisoryDimensions ostaje unset)', () => {
    const base = freshBase();
    const demoted = applyBakedAdvisory(base, 'nepostojeci-profil');
    expect(demoted).toEqual([]);
    expect(base.checkFont).toBe(true);
    expect(base.requireA4).toBe(true);
    expect(base.advisoryDimensions).toBeUndefined();
  });
});
