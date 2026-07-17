/**
 * Drift + korektnost splita verificiranih profila (perf: lazy heavy chunk).
 *
 * verified-profiles.json (izvor istine) dijeli se skriptom scripts/gen-verified-split.mjs na
 * verified-profiles-index.json (light, eager) + verified-profiles-heavy.json (id -> pun profil,
 * lazy). Ovaj test dokazuje da su commitane datoteke u sinkru s izvorom i da se reasembliraju
 * natrag u original (bez publicSources). Ako padne: `node scripts/gen-verified-split.mjs` pa commit.
 */
import { describe, it, expect } from 'vitest';

import rawSrc from '../data/profiles/verified-profiles.json';
import committedIndex from '../data/profiles/verified-profiles-index.json';
import committedHeavy from '../data/profiles/verified-profiles-heavy.json';
import { VERIFIED_PROFILE_REGISTRY, ensureProfileRules } from '../src/profiles/profile-registry';

const src = rawSrc as any[];

// Ista logika kao gen-verified-split.mjs (namjerno duplicirana: test regenerira pa usporedi).
function stripPublicSources(p: any) {
  if (!p.fieldValidation || !('publicSources' in p.fieldValidation)) return p;
  const { publicSources, ...fvRest } = p.fieldValidation;
  return { ...p, fieldValidation: fvRest };
}
function lightEntry(p: any) {
  const light: any = { id: p.id, unitId: p.unitId, programs: p.programs, workTypes: p.workTypes, status: p.status };
  if (p.variant != null) light.variant = p.variant;
  if (p.variantLabel != null) light.variantLabel = p.variantLabel;
  const sample = p.fieldValidation && p.fieldValidation.sample;
  if (sample != null) light.fieldValidation = { sample };
  const rules = p.rules || {};
  const rulesLite: any = {};
  if (rules.recommendedCitation != null) rulesLite.recommendedCitation = rules.recommendedCitation;
  if (rules.citationLocked != null) rulesLite.citationLocked = rules.citationLocked;
  // Zrcali gen-verified-split.mjs: jezik rada je u light indexu (picker ga cita prije heavy chunka).
  if (rules.documentLanguage != null) rulesLite.documentLanguage = rules.documentLanguage;
  if (rules.languageLocked != null) rulesLite.languageLocked = rules.languageLocked;
  if (Object.keys(rulesLite).length) light.rules = rulesLite;
  return light;
}

describe('verified-profiles split: drift + korektnost', () => {
  it('commitani index === regenerirana light projekcija', () => {
    expect(committedIndex).toEqual(src.map(lightEntry));
  });

  it('commitani heavy === strip(original) po id-u', () => {
    const expected: Record<string, any> = {};
    for (const p of src) expected[p.id] = stripPublicSources(p);
    expect(committedHeavy).toEqual(expected);
  });

  it('ensureProfileRules spoji heavy u registry -> pun profil (bez publicSources)', async () => {
    await ensureProfileRules();
    const byId: Record<string, any> = {};
    for (const p of src) byId[p.id] = stripPublicSources(p);
    for (const entry of VERIFIED_PROFILE_REGISTRY as any[]) {
      expect(entry).toEqual(byId[entry.id]);
    }
  });
});
