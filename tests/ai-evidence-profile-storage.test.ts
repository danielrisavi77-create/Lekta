import { describe, expect, it } from 'vitest';
import type { ThesisProfile, VerificationLedgerEntry } from '../src/profiles/profile-schema';
import { prepareAiEvidenceProfilePersistence } from '../src/verification/ai-evidence-profile-storage';

const original = {
  ruleId: 'target--font',
  checkId: 'font',
  value: ['Times New Roman'],
  sourceId: 'official-source',
  sourcePage: 'str. 2',
  quote: 'Točan navod.',
  status: 'verified' as const,
  confirmedVia: 'ai-1pass-batch',
};
const updated = {
  ...original,
  scored: true,
  status: 'verified' as const,
  confirmedVia: 'ai-evidence-audit',
  aiEvidence: { schemaVersion: 1 },
};
const event: VerificationLedgerEntry = {
  id: 'led-target--font-ai-confirmed-2026-09-25',
  profileId: 'target',
  ruleId: 'target--font',
  action: 'ai-confirmed',
  actor: 'ai-evidence-audit',
  timestamp: '2026-09-25',
  sourceId: 'official-source',
  sourcePage: 'str. 2',
  quote: 'Točan navod.',
};

describe('prepareAiEvidenceProfilePersistence', () => {
  it('mijenja samo ciljani profil i čuva postojeće profile, metapodatke i append-only događaje', () => {
    const draftDocument = {
      profileId: 'target',
      metadata: { keep: true },
      entries: [original, { ruleId: 'target--advisory', status: 'advisory' }],
    };
    const existingLedger = [{ ...event, id: 'unrelated-orphan', profileId: 'other', ruleId: 'other--font' }];

    const result = prepareAiEvidenceProfilePersistence(
      draftDocument,
      { id: 'target', ruleEntries: [updated, { ruleId: 'target--advisory', status: 'advisory' }] } as ThesisProfile,
      existingLedger,
      [event],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draftDocument).toMatchObject({
      profileId: 'target',
      metadata: { keep: true },
      entries: [updated, { ruleId: 'target--advisory', status: 'advisory' }],
    });
    expect(result.ledger).toEqual([...existingLedger, event]);
  });

  it('odbija koliziju ledger ID-ja atomski, bez djelomičnog plana', () => {
    const conflicting = { ...event, quote: 'drugačiji sadržaj' };
    const result = prepareAiEvidenceProfilePersistence(
      { profileId: 'target', entries: [original] },
      { id: 'target', ruleEntries: [updated] } as ThesisProfile,
      [conflicting],
      [event],
    );

    expect(result).toEqual({ ok: false, errors: expect.arrayContaining([expect.stringContaining('kolizija')]) });
  });

  it('odbija zamjenu ako ciljani ruleId nedostaje u izvornom draftu', () => {
    const result = prepareAiEvidenceProfilePersistence(
      { profileId: 'target', entries: [] },
      { id: 'target', ruleEntries: [updated] } as ThesisProfile,
      [],
      [event],
    );

    expect(result).toEqual({ ok: false, errors: expect.arrayContaining([expect.stringContaining('nedostaje')]) });
  });

  it('odbija djelomičan AI-prijelaz ako bodovano pravilo ostane bez AI-dokaza', () => {
    const secondScored = { ...original, ruleId: 'target--paper-size', checkId: 'paper-size', scored: true };
    const result = prepareAiEvidenceProfilePersistence(
      { profileId: 'target', entries: [original, secondScored] },
      {
        id: 'target',
        ruleEntries: [updated, secondScored],
      } as ThesisProfile,
      [],
      [event],
    );

    expect(result).toEqual({ ok: false, errors: expect.arrayContaining([expect.stringContaining('sva bodovana pravila')]) });
  });
});
