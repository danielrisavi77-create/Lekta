/**
 * generate-citation-tools.mjs (build script, plain JS, no TS loader wired for scripts/) resolves
 * each faculty's citation token via scripts/citation-effective-rules.mjs's recommendedCitationOf(),
 * a hand-ported mirror of the ONE field it needs from Option A's real compiler
 * (src/profiles/rule-compiler.ts's compileEffectiveRules). Before this port, the script read
 * `p.rules.recommendedCitation` directly, bypassing ruleEntries entirely: harmless today (every
 * profile still carries recommendedCitation in both places) but silently wrong the moment
 * CLAUDE.md backlog #2 migrates a profile's citation-style key out of `rules` into `ruleEntries`
 * only - the SEO page for that faculty would lose its citation token with the build staying green.
 * This test proves the port agrees with the real TS compiler for every verified profile, so any
 * future drift between the two implementations fails the suite instead of shipping silently.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileEffectiveRules } from '../src/profiles/rule-compiler';
import { recommendedCitationOf } from '../scripts/citation-effective-rules.mjs';
import type { ThesisProfile } from '../src/profiles/profile-schema';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profiles: ThesisProfile[] = JSON.parse(
  readFileSync(path.join(ROOT, 'data/profiles/verified-profiles.json'), 'utf8'),
);

describe('citation-effective-rules.mjs stays in sync with rule-compiler.ts', () => {
  it('recommendedCitationOf() matches compileEffectiveRules().recommendedCitation for every verified profile', () => {
    expect(profiles.length).toBeGreaterThan(0);
    for (const profile of profiles) {
      const fromCompiler = (compileEffectiveRules(profile).recommendedCitation as string | undefined) ?? null;
      const fromScript = recommendedCitationOf(profile);
      expect(fromScript, `profile "${profile.id}"`).toBe(fromCompiler);
    }
  });

  it('overlay preferences a citation-style ruleEntry over the legacy rules baseline (last one wins)', () => {
    const profile = {
      id: 'test-profile',
      rules: { recommendedCitation: 'apa7' },
      ruleEntries: [
        { ruleId: 'r1', checkId: 'citation-style', value: 'ieee' },
      ],
    } as unknown as ThesisProfile;
    expect(recommendedCitationOf(profile)).toBe('ieee');
    expect(compileEffectiveRules(profile).recommendedCitation).toBe('ieee');
  });

  it('bez ruleEntries pada natrag na rules baseline (kao i danas, prije backlog #2 migracije)', () => {
    const profile = { id: 'test-profile', rules: { recommendedCitation: 'harvard' } } as unknown as ThesisProfile;
    expect(recommendedCitationOf(profile)).toBe('harvard');
  });
});
