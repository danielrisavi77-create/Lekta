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
import { computeDemotedAdvisory, applyScoredAdvisory, driftDemotedFor } from '../src/profiles/advisory-demotion';
import { applyBakedAdvisory } from '../src/profiles/profile-runtime-maps';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import type { SourceEntry } from '../src/profiles/profile-schema';

const SOURCES = SOURCE_REGISTRY as SourceEntry[];

/** checkId-jevi cije *RepairableItem funkcije citaju profil.ruleEntries izravno (vidi gen-profile-runtime-maps.mts). */
const ASSISTED_RULE_ENTRY_CHECK_IDS = new Set([
  'bibliography-rules',
  'citation-sync-rules',
  'legal-footnote-repair-rules',
  'section-surgery-rules',
  'required-section-rules',
  'element-caption-rules',
  'table-figure-rescue-rules',
]);

/** Ista logika kao scripts/gen-profile-runtime-maps.mts (izvor istine za pecenje). */
function expectedMaps() {
  const advisory: Record<string, string[]> = {};
  const repair: Record<string, unknown[]> = {};
  for (const id of [...DRAFT_PROFILE_IDS].sort()) {
    const entries = draftRuleEntriesFor(id);
    if (entries.length === 0) continue;
    advisory[id] = computeDemotedAdvisory({ id }, entries, SOURCES);
    // Os s raskorakom tvrdnje i zrcala ispada i iz REPAIR mape (vidi gen-profile-runtime-maps.mts):
    // inace demotija zaustavi krivo bodovanje, a popravak i dalje upise vrijednost iz zrcala.
    const drifted = new Set(driftDemotedFor(id));
    const r = entries
      .filter((e) => !(e.checkId && drifted.has(e.checkId)))
      .filter(
        (e) =>
          (e.autoFixable === true && e.status === 'verified' && e.fixerId && e.checkId) ||
          (e.status === 'advisory' && e.recommendedFixerId && e.checkId),
      )
      .map((e) => {
        // Provenijencija za dokazni cip (stranica/odjeljak upute + datum provjere). Mora pratiti
        // scripts/gen-profile-runtime-maps.mts; ovaj test i postoji da ta dva ne odlutaju.
        const provenance = {
          ...(e.sourcePage != null ? { sourcePage: e.sourcePage } : {}),
          ...(e.lastVerified != null ? { lastVerified: e.lastVerified } : {}),
        };
        return e.autoFixable === true
          ? {
              ruleId: e.ruleId,
              checkId: e.checkId,
              label: e.label,
              status: e.status,
              fixerId: e.fixerId,
              autoFixable: e.autoFixable,
              ...provenance,
            }
          : {
              ruleId: e.ruleId,
              checkId: e.checkId,
              label: e.label,
              status: e.status,
              fixerId: e.recommendedFixerId,
              recommended: true,
              value: e.value,
              ...provenance,
            };
      });
    const assisted = entries
      .filter(
        (e) =>
          e.checkId != null &&
          ASSISTED_RULE_ENTRY_CHECK_IDS.has(e.checkId) &&
          // Mora pratiti gen-profile-runtime-maps.mts: uz 'verified' prolazi i 'advisory'
          // (strojno dokazano uporiste u izvoru, ali NE smije bodovati; demotira asRecommendation).
          (e.status === 'verified' || e.status === 'advisory') &&
          e.sourceId != null &&
          e.sourcePage != null &&
          e.quote != null,
      )
      .map((e) => ({
        ruleId: e.ruleId,
        checkId: e.checkId,
        status: e.status,
        sourceId: e.sourceId,
        sourcePage: e.sourcePage,
        quote: e.quote,
        value: e.value,
      }));
    const all = [...r, ...assisted];
    if (all.length > 0) repair[id] = all;
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
