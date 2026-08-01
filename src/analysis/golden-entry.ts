/**
 * Golden/sinteticka ulazna tocka za DOCX pipeline (CLAUDE.md golden harness).
 *
 * Izlaze analyzeDocx iz monolita kroz tanak, DOM-free adapter: razrjesava profil iz
 * tipiziranog registra (kao currentProfile() u src/ui/app.ts, ali bez DOM-a) i poziva
 * analyzeDocx s fiksnim, deterministickim postavkama. Koristi ga tests/docx-golden
 * i tests/fpzg-synthetic. NE pokrece UI ni init() (init je ogradjen u src/main.ts).
 */
import { analyzeDocx } from './analyze-docx';
import { VERIFIED_PROFILE_REGISTRY, PROFILE_STATUS } from '../profiles/profile-registry';
import { normalizeCheckFlags } from '../profiles/profile-baseline';
import { citationMeta } from '../citations/citation-meta';
import heavyProfiles from '../../data/profiles/verified-profiles-heavy.json';
import { attachHeadingStructure } from './heading-structure';

// Golden/sinteticki harness NIJE u app bundleu: teska profilna pravila su u zivom app-u lazy
// (profile-registry.ensureProfileRules), ali resolveProfile mora raditi SINKRONO. Ovdje ih spajamo
// EAGER u registry pri ucitavanju modula (mutacija in place), pa golden testovi vide pun profil.
for (const entry of VERIFIED_PROFILE_REGISTRY as unknown as Array<{ id: string }>) {
  const full = (heavyProfiles as Record<string, object>)[entry.id];
  if (full) Object.assign(entry, full);
}

/** Razrjesi profilni objekt koji analyzeDocx ocekuje (spljosteni rules + metapodaci). */
export function resolveProfile(profileId: string) {
  const entry = VERIFIED_PROFILE_REGISTRY.find((p) => p.id === profileId);
  if (!entry) throw new Error(`Nepoznat profileId: ${profileId}`);
  const base: any = structuredClone(entry.rules);
  // Ista normalizacija kao zivi currentProfile() (src/ui/app.ts), sada iz zajednickog modula:
  normalizeCheckFlags(base);
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
  // citationMode kao u currentProfile() (citationMeta(...).mode): bez njega legal/author-year
  // engine ne radi, pa golden korpus ne bi pokrivao pravne fusnote ni autor-godina citate.
  base.citationMode = citationMeta(String(base.recommendedCitation || '')).mode;
  // Napomena: golden/sinteticki korpus NAMJERNO testira SIROVI engine (sve dimenzije bodovane)
  // radi zastite detekcije parsera/audita. Scored/advisory demotion je PRODUKTNA politika koja
  // se primjenjuje samo u zivom currentProfile() (src/ui/app.ts) i pokrivena je jedinicnim
  // testom (tests/scored-advisory.test.ts), da korpus ne bi maskirao regresije detekcije.
  return base;
}

/**
 * Analiziraj jedan .docx (File) odabranim profilom. Ugovor koji harness ocekuje:
 * analyzeFixture(file, { profileId }) => Promise<Result>.
 */
export async function analyzeFixture(file: File, opts: { profileId?: string; settings?: any } = {}) {
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
  const result = await analyzeDocx(file, profile, settings, () => {});
  return attachHeadingStructure(result, profile.headingRules || {});
}
