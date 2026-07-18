// scripts/citation-effective-rules.mjs
//
// Side-effect-free port of the ONE field generate-citation-tools.mjs needs from Option A's
// compiler (src/profiles/rule-compiler.ts): recommendedCitation, after ruleEntries are folded
// over the legacy rules baseline. Build scripts are plain .mjs (no TS loader wired up for
// scripts/), so this mirrors compileEffectiveRules's baseline+overlay algorithm for just this
// key instead of pulling in the whole TS compiler. tests/citation-tools-effective-rules.test.ts
// proves it agrees with the real compiler for every profile, so drift fails the test suite
// instead of silently losing a citation token when CLAUDE.md backlog #2 migrates a profile's
// recommendedCitation out of `rules` and into `ruleEntries` only.
//
// Keep in sync with the 'citation-style' case in src/profiles/rule-compiler.ts's applyEntry().

/** @param {{rules?: {recommendedCitation?: string}, ruleEntries?: Array<{checkId?: string, value?: unknown}>}} profile */
export function recommendedCitationOf(profile) {
  let token = profile?.rules?.recommendedCitation ?? null;
  for (const entry of profile?.ruleEntries ?? []) {
    if (entry.checkId === 'citation-style') token = entry.value;
  }
  return token || null;
}
