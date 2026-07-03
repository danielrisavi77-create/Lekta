/**
 * Golden/sinteticka ulazna tocka za DOCX pipeline (CLAUDE.md golden harness).
 *
 * Izlaze analyzeDocx iz monolita kroz tanak, DOM-free adapter: razrjesava profil iz
 * tipiziranog registra (kao currentProfile() u src/main.ts, ali bez DOM-a) i poziva
 * analyzeDocx s fiksnim, deterministickim postavkama. Koristi ga tests/docx-golden
 * i tests/fpzg-synthetic. NE pokrece UI ni init() (init je ogradjen u src/main.ts).
 */
import { analyzeDocx } from '../ui/app';
import { VERIFIED_PROFILE_REGISTRY, PROFILE_STATUS } from '../profiles/profile-registry';

/** Razrjesi profilni objekt koji analyzeDocx ocekuje (spljosteni rules + metapodaci). */
export function resolveProfile(profileId: string) {
  const entry = VERIFIED_PROFILE_REGISTRY.find((p) => p.id === profileId);
  if (!entry) throw new Error(`Nepoznat profileId: ${profileId}`);
  const base: any = structuredClone(entry.rules);
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
  // citationMode kao u currentProfile() (citationMeta(...).mode): bez njega legal/author-year
  // engine ne radi, pa golden korpus ne bi pokrivao pravne fusnote ni autor-godina citate.
  const CITATION_MODE: Record<string, string> = {
    fpzg: 'author-year',
    'pravo-fusnote': 'legal-notes',
    'pravo-social-author': 'author-year',
    apa7: 'author-year',
    harvard: 'author-year',
    'chicago-author': 'author-year',
    'chicago-notes': 'notes',
    mla9: 'author-page',
    vancouver: 'numeric',
    ieee: 'numeric',
    custom: 'custom',
  };
  base.citationMode = CITATION_MODE[base.recommendedCitation] || 'custom';
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
  return analyzeDocx(file, profile, settings, () => {});
}
