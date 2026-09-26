import { describe, expect, it } from 'vitest';
import { resolveProfile } from '../src/analysis/golden-entry';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { applyFixers } from '../src/repair/apply-fixers';
import { buildDefaultRepairRequests } from '../src/repair/default-selection';
import { applyScoredAdvisory } from '../src/profiles/advisory-demotion';
import { normalizeCheckFlags } from '../src/profiles/profile-baseline';
import { draftRuleEntriesFor, VERIFIED_PROFILES_WITH_DRAFTS } from '../src/profiles/drafts-runtime';
import { compileEffectiveRules } from '../src/profiles/rule-compiler';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import { buildAllRepairableItems } from '../src/ui/repair-item-assembly';
import { DEEP_CAPABLE } from '../src/ui/repair-panel';
import { documentText } from './helpers/closed-loop-runner';
import { buildViolatingDocx } from './helpers/violating-docx';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('FFOS closed-loop dokaz po profilnoj osi', () => {
  it('generirani FFOS dokument krsi i mjeri obveznu velicinu osnovnog fonta', async () => {
    const profileId = 'ffos-diplomski';
    const draftProfile = (VERIFIED_PROFILES_WITH_DRAFTS as Array<{ id: string }>).find((p) => p.id === profileId);
    expect(draftProfile, 'FFOS profil mora biti registriran s draft pravilima').toBeDefined();

    const base = resolveProfile(profileId) as Record<string, unknown>;
    const profile = {
      ...base,
      ...compileEffectiveRules(draftProfile as never),
    } as Record<string, unknown>;
    normalizeCheckFlags(profile);
    applyScoredAdvisory(
      profile as never,
      draftProfile as never,
      draftRuleEntriesFor(profileId),
      SOURCE_REGISTRY as never,
    );

    const generated = await buildViolatingDocx(profile);
    expect(generated.violated, 'FFOS 12 pt pravilo nije izazvano u DOCX-fixturi').toContain('font-size');
    expect(generated.targets['font-size']).toEqual({ fontSizePt: 12 });

    const before = await analyzeFixture(new File([generated.bytes], `${profileId}.docx`, { type: DOCX_MIME }), {
      profileId,
      profile,
    });
    const sizeCheckBefore = before.checks?.find((check) => check.id === 'format.size.body');
    expect(sizeCheckBefore?.max, 'analiza FFOS pravila o velicini mora biti bodovana').toBeGreaterThan(0);
    expect(sizeCheckBefore?.earned).toBeLessThan(sizeCheckBefore?.max ?? Infinity);
    const beforeText = await documentText(generated.bytes);

    const items = buildAllRepairableItems({ result: before, profile, entries: draftRuleEntriesFor(profileId) });
    const requests = buildDefaultRepairRequests(items as never).map((request) =>
      DEEP_CAPABLE.has(request.fixerId) ? { ...request, params: { ...request.params, deep: true } } : request,
    );
    expect(await documentText(generated.bytes), 'slaganje ponuda ne smije mijenjati ulazni DOCX').toBe(beforeText);
    const repaired = await applyFixers(generated.bytes, requests);
    expect(repaired.integrityFailure, 'FFOS popravak mora sacuvati ispravnost DOCX paketa').toBeFalsy();

    const recommendations = buildAllRepairableItems({
      result: before,
      profile,
      entries: draftRuleEntriesFor(profileId),
      includeNonViolated: true,
    } as never).filter((item: { recommended?: boolean }) => item.recommended === true);
    for (const recommendation of recommendations as Array<{ fixerId: string; ruleId: string; params?: unknown }>) {
      await applyFixers(generated.bytes, [{
        fixerId: recommendation.fixerId,
        ruleId: recommendation.ruleId,
        params: recommendation.params,
      }] as never);
    }
    expect(await documentText(generated.bytes), 'izolirano mjerenje preporuka ne smije mijenjati ulazni DOCX').toBe(beforeText);

    const after = await analyzeFixture(new File([repaired.docxBytes], `${profileId}-fixed.docx`, { type: DOCX_MIME }), {
      profileId,
      profile,
    });
    const sizeCheckAfter = after.checks?.find((check) => check.id === 'format.size.body');
    expect(sizeCheckAfter?.max).toBe(sizeCheckBefore?.max);
    expect(sizeCheckAfter?.earned, 'popravak mora rijesiti bodovanu FFOS os velicine fonta').toBeGreaterThanOrEqual(
      sizeCheckAfter?.max ?? Infinity,
    );
    expect(await documentText(repaired.docxBytes), 'repair ne smije mijenjati vidljivi tekst rada').toBe(beforeText);
  });
});
