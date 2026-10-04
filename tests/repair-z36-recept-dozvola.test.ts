/**
 * Z36: serverska dozvola umetanja zapisa literature nastaje iz ISTOG uvjeta kao plan.
 *
 * Lanac: profil -> `citationEntryInsertionAllowed` (src/ui/repair-items.ts) -> recept
 * (src/repair/recipe.ts, DOCUMENT_CONDITIONAL) -> peceni autoritet (`buildParamAuthority`) ->
 * `resolveParams` na serveru. Nijedan profil u data/ danas nema dozvolu, pa se ovdje jedan stvarni
 * profil (fer-diplomski) nadopuni sintetickim pravilom; registar se suzi na taj profil da recept bude
 * jeftin. Za svaki od tri uvjeta (dozvola, verificirano pravilo, author-year) peceni zapis izostaje.
 */
import { describe, expect, it, vi } from 'vitest';

const PROFILE_ID = 'fer-diplomski';
const variant = vi.hoisted(() => ({ rule: null as null | Record<string, unknown> }));

vi.mock('../src/profiles/profile-registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/profiles/profile-registry')>();
  return { ...actual, VERIFIED_PROFILE_REGISTRY: actual.VERIFIED_PROFILE_REGISTRY.filter((entry) => entry.id === 'fer-diplomski') };
});

vi.mock('../src/analysis/golden-entry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/analysis/golden-entry')>();
  return {
    ...actual,
    resolveProfile: (id: string) => {
      const profile = actual.resolveProfile(id) as Record<string, unknown>;
      if (!variant.rule) return profile;
      return { ...profile, ruleEntries: [...(Array.isArray(profile.ruleEntries) ? profile.ruleEntries : []), variant.rule] };
    },
  };
});

const { buildRecipe, buildParamAuthority } = await import('../src/repair/recipe');
const { resolveParams } = await import('../src/repair/param-authority');
const { ensureRepairMapHeavy } = await import('../src/profiles/profile-runtime-maps');
await ensureRepairMapHeavy();

const RULE_ID = 'citation-bibliography-sync-assisted';
const FIXER_ID = 'citation-bibliography-sync-fixer';
const syncRule = (value: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  checkId: 'citation-sync-rules', status: 'verified', sourceId: 'test-synthetic', sourcePage: '1', quote: 'sintetičko pravilo za test', value, ...extra,
});

function bakedFor(rule: Record<string, unknown> | null) {
  variant.rule = rule;
  try {
    const recipe = buildRecipe();
    expect(recipe.map((profile) => profile.id)).toEqual([PROFILE_ID]);
    return buildParamAuthority(recipe)[PROFILE_ID]?.[RULE_ID];
  } finally {
    variant.rule = null;
  }
}

const request = {
  version: 1,
  citations: [{ id: 'c1', paragraphIndex: 1, start: 0, end: 11, anchorFingerprint: 'citation-1', replacementText: 'Novak, 2022', reason: 'r' }],
  entries: [{ id: 'e1', paragraphIndices: [], anchorFingerprint: 'biblio-3', action: 'add', citationId: 'c1', insertionAnchor: { paragraphIndex: 3, anchorFingerprint: 'biblio-3' } }],
  mappings: [{ citationId: 'c1', bibliographyEntryId: 'e1', confirmed: true }],
};

describe('Z36: dozvola iz profila do pecenog serverskog autoriteta', () => {
  it('puni uvjet peče dozvolu, a server tada propusta dodani zapis', () => {
    const baked = bakedFor(syncRule({ mode: 'author-year', allowMissingEntryInsertion: true }));
    expect(baked).toEqual({ f: FIXER_ID, p: { allowMissingEntryInsertion: true } });
    const resolved = resolveParams(PROFILE_ID, RULE_ID, FIXER_ID, request, { [PROFILE_ID]: { [RULE_ID]: baked! } });
    expect(resolved.params).toEqual(request);
  });

  it.each([
    ['bez allowMissingEntryInsertion', syncRule({ mode: 'author-year' })],
    ['pravilo nije verificirano', syncRule({ mode: 'author-year', allowMissingEntryInsertion: true }, { status: 'draft' })],
    ['pravilo je preporuka (advisory)', syncRule({ mode: 'author-year', allowMissingEntryInsertion: true }, { status: 'advisory' })],
    ['nacin nije author-year', syncRule({ mode: 'numeric', allowMissingEntryInsertion: true })],
    ['bez pravila', null],
  ])('%s: nema pecene dozvole, a server uklanja dodani zapis', (_label, rule) => {
    const baked = bakedFor(rule);
    expect(baked).toBeUndefined();
    const resolved = resolveParams(PROFILE_ID, RULE_ID, FIXER_ID, request, buildParamAuthority(buildRecipe()));
    expect(resolved.params.entries).toEqual([]);
    expect(resolved.params.mappings).toEqual([]);
  });
});
