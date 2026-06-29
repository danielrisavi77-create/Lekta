/**
 * Golden/sinteticka ulazna tocka za DOCX pipeline (CLAUDE.md golden harness).
 *
 * Izlaze analyzeDocx iz monolita kroz tanak, DOM-free adapter: razrjesava profil iz
 * tipiziranog registra (kao currentProfile() u src/main.ts, ali bez DOM-a) i poziva
 * analyzeDocx s fiksnim, deterministickim postavkama. Koristi ga tests/docx-golden
 * i tests/fpzg-synthetic. NE pokrece UI ni init() (init je ogradjen u src/main.ts).
 */
// @ts-nocheck
import { analyzeDocx } from '../main';
import { VERIFIED_PROFILE_REGISTRY, PROFILE_STATUS } from '../profiles/profile-registry';

/** Razrjesi profilni objekt koji analyzeDocx ocekuje (spljosteni rules + metapodaci). */
export function resolveProfile(profileId) {
  const entry = VERIFIED_PROFILE_REGISTRY.find((p) => p.id === profileId);
  if (!entry) throw new Error(`Nepoznat profileId: ${profileId}`);
  const base = structuredClone(entry.rules);
  // Normalizacija identicna currentProfile() u src/main.ts:
  base.checkFont = base.checkFont !== false;
  base.checkSize = base.checkSize !== false;
  base.checkSpacing = base.checkSpacing !== false;
  base.checkMargins = base.checkMargins !== false;
  base.checkJustify = base.checkJustify !== false;
  base.requireA4 = !!base.requireA4;
  base.name = entry.profileLabel;
  base.statusKey = entry.status;
  base.status = (PROFILE_STATUS[entry.status] || {}).label || entry.status;
  base.verified = entry.status === 'verified';
  base.definitionId = entry.id;
  base.sources = entry.sources || [];
  base.facts = entry.facts || [];
  base.verifiedAt = entry.verifiedAt || null;
  base.documentDate = entry.documentDate || null;
  base.manualChecks = (entry.rules && entry.rules.manualChecks) || [];
  base.normativeScope = entry.normativeScope || [];
  base.advisoryScope = entry.advisoryScope || [];
  base.sourceHierarchy = entry.sourceHierarchy || [];
  base.selection = { workType: (entry.workTypes || [])[0] || 'final' };
  return base;
}

/**
 * Analiziraj jedan .docx (File) odabranim profilom. Ugovor koji harness ocekuje:
 * analyzeFixture(file, { profileId }) => Promise<Result>.
 */
export async function analyzeFixture(file, opts = {}) {
  const profileId = opts.profileId || VERIFIED_PROFILE_REGISTRY[0].id;
  const profile = resolveProfile(profileId);
  const settings = {
    profileId,
    workType: profile.selection.workType,
    citationStyle: 'fpzg',
    language: 'hr',
    strictness: 'standard',
    methodology: 'auto',
    selectionIds: {},
    ...(opts.settings || {}),
  };
  return analyzeDocx(file, profile, settings, () => {});
}
