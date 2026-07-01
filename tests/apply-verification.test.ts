import { describe, it, expect } from 'vitest';

import { applyPatches, mergeLedger, type RulePatch } from '../src/verification/apply-verification';
import { confirmVerification } from '../src/verification/verification-actions';
import { isRuleScored, runVerificationGate } from '../src/verification/verification-gate';
import { computePublishedRules } from '../src/verification/published-rules';
import { LAW_DRAFTS } from '../src/profiles/profile-registry';
import { SOURCE_REGISTRY, findSource } from '../src/verification/verification-registry';
import type {
  ThesisProfile,
  SourceEntry,
  DraftsStagingFile,
  VerificationLedgerEntry,
} from '../src/profiles/profile-schema';

const NOW = '2026-06-30';
const PROFILE_ID = 'pravo-integrirani-diplomski';

/** Prvo flagship pravilo spremno za verifikaciju (sluzbeni autoritet + izvor + citat + stranica). */
function pickVerifiable() {
  const entries = LAW_DRAFTS.profiles[PROFILE_ID] ?? [];
  const entry = entries.find(
    (e) => e.authority === 'general' && e.sourceId && e.sourcePage && e.quote,
  );
  if (!entry) throw new Error('nema verifikabilnog flagship pravila u stagingu');
  return entry;
}

describe('apply-verification: zatvaranje petlje konzola -> staging', () => {
  it('potvrdjeno pravilo nakon primjene postaje scored i prolazi gate', () => {
    const entry = pickVerifiable();
    const source = findSource(entry.sourceId!);

    // 1. covjek potvrdi u konzoli (cista akcija)
    const res = confirmVerification(PROFILE_ID, entry, source, {
      sourcePage: entry.sourcePage!,
      quote: entry.quote!,
      verifiedBy: 'daniel',
      now: NOW,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // 2. primijeni zakrpu na staging
    const patch: RulePatch = { profileId: PROFILE_ID, ruleId: entry.ruleId, entry: res.entry };
    const applied = applyPatches(LAW_DRAFTS as DraftsStagingFile, [patch]);
    expect(applied.applied).toContain(entry.ruleId);
    expect(applied.skipped).toEqual([]);

    // 3. pravilo je sada scored
    const updated = applied.profiles[PROFILE_ID].find((e) => e.ruleId === entry.ruleId)!;
    expect(updated.status).toBe('verified');
    expect(isRuleScored(updated)).toBe(true);

    // 4. profil sa primijenjenim stagingom prolazi gate bez gresaka
    const profile: ThesisProfile = { id: PROFILE_ID, rules: {}, ruleEntries: applied.profiles[PROFILE_ID] };
    expect(runVerificationGate([profile], SOURCE_REGISTRY as SourceEntry[], { now: NOW })).toEqual([]);

    // 5. published-rules sada broji to pravilo kao bodovano
    const pub = computePublishedRules(profile, SOURCE_REGISTRY as SourceEntry[]);
    expect(pub.scored.some((e) => e.ruleId === entry.ruleId)).toBe(true);
  });

  it('zakrpa za nepostojeci profil/pravilo se preskace, ne rusi', () => {
    const r1 = applyPatches(LAW_DRAFTS as DraftsStagingFile, [
      { profileId: 'ne-postoji', ruleId: 'x', entry: { ruleId: 'x', checkId: 'font', value: 1 } },
    ]);
    expect(r1.applied).toEqual([]);
    expect(r1.skipped[0].reason).toContain('nije u stagingu');

    const r2 = applyPatches(LAW_DRAFTS as DraftsStagingFile, [
      { profileId: PROFILE_ID, ruleId: 'nepostojeci-rule', entry: { ruleId: 'nepostojeci-rule', checkId: 'font', value: 1 } },
    ]);
    expect(r2.skipped[0].reason).toContain('nije u profilu');
  });

  it('ne mijenja ulaznu staging mapu (cista funkcija)', () => {
    const entry = pickVerifiable();
    const before = JSON.stringify(LAW_DRAFTS.profiles[PROFILE_ID]);
    applyPatches(LAW_DRAFTS as DraftsStagingFile, [
      { profileId: PROFILE_ID, ruleId: entry.ruleId, entry: { ...entry, status: 'verified' } },
    ]);
    expect(JSON.stringify(LAW_DRAFTS.profiles[PROFILE_ID])).toBe(before);
  });
});

describe('mergeLedger: append-only, idempotentno', () => {
  const a: VerificationLedgerEntry = {
    id: 'led-x-verified-2026-06-30',
    ruleId: 'x',
    profileId: 'p',
    action: 'verified',
    actor: 'daniel',
    timestamp: NOW,
    sourceId: 's',
    sourcePage: 'odjeljak 4',
    quote: 'q',
  };

  it('dodaje novi zapis', () => {
    const r = mergeLedger([], [a]);
    expect(r.added).toEqual(['led-x-verified-2026-06-30']);
    expect(r.ledger).toHaveLength(1);
  });

  it('ne duplicira po id-u', () => {
    const r = mergeLedger([a], [a]);
    expect(r.added).toEqual([]);
    expect(r.ledger).toHaveLength(1);
  });
});
