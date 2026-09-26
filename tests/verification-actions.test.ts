import { describe, it, expect } from 'vitest';

import {
  pendingRules,
  confirmVerification,
  makeAdvisory,
  retireRule,
  willScore,
  approveFromAi,
} from '../src/verification/verification-actions';
import { runVerificationGate } from '../src/verification/verification-gate';
import { SOURCE_REGISTRY, findSource } from '../src/verification/verification-registry';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import type { ThesisProfile, RuleEntry, SourceEntry } from '../src/profiles/profile-schema';
import { createAiEvidenceAuditFixture } from './helpers/ai-evidence-audit-fixture';

const NOW = '2026-06-30';
const UPUTE = 'pravo-upute-oblikovanje-2024';
/** Sinteticki izvor bez snapshota: testira politiku neovisno o stanju zivog registra. */
const NO_SNAPSHOT_SOURCE: SourceEntry = {
  id: 'test-no-snapshot',
  kind: 'guidelines',
  title: 'Test izvor bez snapshota',
  url: 'https://example.test/no-snapshot',
  fetchedAt: null,
  snapshotPath: null,
  snapshotHash: null,
  validityClass: 'stable',
  lastChecked: null,
};
const NO_SNAPSHOT_SOURCE_ID = NO_SNAPSHOT_SOURCE.id;

function draftEntry(over: Partial<RuleEntry> = {}): RuleEntry {
  return {
    ruleId: 'r-font',
    checkId: 'font',
    value: ['Times New Roman'],
    machineCheckable: true,
    authority: 'general',
    sourceId: UPUTE,
    sourcePage: null,
    quote: null,
    status: 'draft',
    ...over,
  };
}

describe('pendingRules', () => {
  it('vraca iskljucivo draft i needs-recheck; zivi staging smije biti prazan', () => {
    const profiles = [
      ...VERIFIED_PROFILES_WITH_DRAFTS,
      ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
    ] as unknown as ThesisProfile[];
    // Zivi red cekanja je od 2026-07-18 ispraznjen (0 draft / 0 needs-recheck u data/):
    // to je ciljno stanje verifikacijske petlje, ne greska, pa se duljina nad zivim
    // podacima vise ne tvrdi. Invarijanta vrijedi za sve sto pendingRules vrati.
    for (const p of pendingRules(profiles)) {
      expect(p.entry.status === 'draft' || p.entry.status === 'needs-recheck').toBe(true);
    }
    // Pozitivna provjera na sintetickom profilu (neovisna o stanju zivih podataka):
    // draft i needs-recheck se hvataju, verified se preskace.
    const synthetic = {
      id: 'test-pending-synthetic',
      rules: {},
      ruleEntries: [
        draftEntry(),
        draftEntry({ ruleId: 'r-size', checkId: 'font-size', status: 'needs-recheck' }),
        draftEntry({ ruleId: 'r-margins', checkId: 'margins', status: 'verified' }),
      ],
    } as unknown as ThesisProfile;
    const mine = pendingRules([...profiles, synthetic]).filter(
      (p) => p.profileId === 'test-pending-synthetic',
    );
    expect(mine.map((p) => p.entry.ruleId).sort()).toEqual(['r-font', 'r-size']);
  });
});

describe('confirmVerification: covjek proglasava verified', () => {
  const source = findSource(UPUTE);

  it('potvrda postavlja polja i stampa verifiedHash', () => {
    const res = confirmVerification('p1', draftEntry(), source, {
      sourcePage: 'odjeljak 4',
      quote: 'font: Times New Roman',
      verifiedBy: 'daniel',
      now: NOW,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entry.status).toBe('verified');
    expect(res.entry.sourcePage).toBe('odjeljak 4');
    expect(res.entry.verifiedHash).toBe(source!.snapshotHash);
    expect(res.entry.lastVerified).toBe(NOW);
    expect(willScore(res.entry)).toBe(true);
    expect(res.ledger.action).toBe('verified');
    expect(res.ledger.ruleId).toBe('r-font');
  });

  it('potvrdeno pravilo prolazi CI vrata bez gresaka', () => {
    const res = confirmVerification('p1', draftEntry(), source, {
      sourcePage: 'odjeljak 4',
      quote: 'font: Times New Roman',
      verifiedBy: 'daniel',
      now: NOW,
    });
    if (!res.ok) throw new Error('ocekivao ok');
    const profiles: ThesisProfile[] = [{ id: 'p1', rules: {}, ruleEntries: [res.entry] }];
    expect(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW })).toEqual([]);
  });

  it('odbija bez sourcePage i quote', () => {
    const res = confirmVerification('p1', draftEntry(), source, {
      sourcePage: '',
      quote: '',
      verifiedBy: 'daniel',
      now: NOW,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.includes('sourcePage'))).toBe(true);
    expect(res.errors.some((e) => e.includes('quote'))).toBe(true);
  });

  it('odbija mentorski autoritet (nije sluzbeni)', () => {
    const res = confirmVerification('p1', draftEntry({ authority: 'mentor-or-course' }), source, {
      sourcePage: 'odjeljak 4',
      quote: 'x',
      verifiedBy: 'daniel',
      now: NOW,
    });
    expect(res.ok).toBe(false);
  });

  it('odbija izvor bez snapshota', () => {
    const noSnap = NO_SNAPSHOT_SOURCE;
    const res = confirmVerification('p1', draftEntry({ sourceId: NO_SNAPSHOT_SOURCE_ID }), noSnap, {
      sourcePage: 'cl. 5',
      quote: 'x',
      verifiedBy: 'daniel',
      now: NOW,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.some((e) => e.includes('snapshot'))).toBe(true);
  });

  it('binding trazi drugi par ociju razlicit od verifiedBy', () => {
    const bad = confirmVerification('p1', draftEntry({ authority: 'binding' }), source, {
      sourcePage: 'cl. 5',
      quote: 'x',
      verifiedBy: 'daniel',
      reviewedBy: 'daniel',
      now: NOW,
    });
    expect(bad.ok).toBe(false);

    const good = confirmVerification('p1', draftEntry({ authority: 'binding' }), source, {
      sourcePage: 'cl. 5',
      quote: 'x',
      verifiedBy: 'daniel',
      reviewedBy: 'mentor',
      now: NOW,
    });
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    expect(good.entry.reviewedBy).toBe('mentor');
    const profiles: ThesisProfile[] = [{ id: 'p1', rules: {}, ruleEntries: [good.entry] }];
    expect(runVerificationGate(profiles, SOURCE_REGISTRY as SourceEntry[], { now: NOW })).toEqual([]);
  });
});

describe('approveFromAi: dokazni audit bez ljudskog odobrenja', () => {
  it('valjan paket potvrduje pravilo bez approver polja', () => {
    const fixture = createAiEvidenceAuditFixture();
    const res = approveFromAi(
      fixture.profileId,
      fixture.rule,
      fixture.source,
      { now: NOW, snapshotBytes: fixture.snapshotBytes, snapshotSha256: fixture.snapshotSha256,
        currentRepairSourceHash: fixture.currentRepairSourceHash, ruleValueSha256: fixture.ruleValueSha256,
        snapshotText: fixture.snapshotText, manifest: fixture.manifest },
      fixture.evidence,
    );
    expect(res.ok).toBe(true);
    expect(res.entry?.status).toBe('verified');
    expect(res.entry?.confirmedVia).toBe('ai-evidence-audit');
    expect(res.entry?.verifiedBy).toBe('ai-evidence-audit');
    expect(res.entry?.reviewedBy).toBeNull();
    expect(res.entry?.aiEvidence).toEqual(fixture.evidence);
    expect(willScore(res.entry!)).toBe(true);
  });

  it('valjan AI audit može zamijeniti verified legacy bulk potvrdu', () => {
    const fixture = createAiEvidenceAuditFixture();
    const legacyBulk: RuleEntry = {
      ...fixture.rule,
      status: 'verified',
      verifiedBy: 'owner-bulk-approval',
      confirmedVia: null,
    };
    const res = approveFromAi(
      fixture.profileId,
      legacyBulk,
      fixture.source,
      { now: NOW, snapshotBytes: fixture.snapshotBytes, snapshotSha256: fixture.snapshotSha256,
        currentRepairSourceHash: fixture.currentRepairSourceHash, ruleValueSha256: fixture.ruleValueSha256,
        snapshotText: fixture.snapshotText, manifest: fixture.manifest },
      fixture.evidence,
    );
    expect(res.ok).toBe(true);
    expect(res.entry?.confirmedVia).toBe('ai-evidence-audit');
    expect(res.entry?.verifiedBy).toBe('ai-evidence-audit');
    expect(res.entry?.modalitySource).toBe('ai-evidence-audit');
    expect(res.ledger).toHaveLength(1);
    expect(res.ledger?.[0]).toMatchObject({ action: 'ai-confirmed', actor: 'ai-evidence-audit' });
  });

  it('valjan AI audit može zamijeniti pojedinačnu ljudsku potvrdu bez ljudskog potpisa', () => {
    const fixture = createAiEvidenceAuditFixture();
    const individuallyVerified: RuleEntry = {
      ...fixture.rule,
      status: 'verified',
      verifiedBy: 'reviewer',
      confirmedVia: 'human',
    };
    const res = approveFromAi(
      fixture.profileId,
      individuallyVerified,
      fixture.source,
      { now: NOW, snapshotBytes: fixture.snapshotBytes, snapshotSha256: fixture.snapshotSha256,
        currentRepairSourceHash: fixture.currentRepairSourceHash, ruleValueSha256: fixture.ruleValueSha256,
        snapshotText: fixture.snapshotText, manifest: fixture.manifest },
      fixture.evidence,
    );
    expect(res.ok).toBe(true);
    expect(res.entry).toMatchObject({
      status: 'verified',
      confirmedVia: 'ai-evidence-audit',
      verifiedBy: 'ai-evidence-audit',
      reviewedBy: null,
      aiEvidence: fixture.evidence,
    });
    expect(res.ledger).toHaveLength(1);
    expect(res.ledger?.[0]).toMatchObject({ action: 'ai-confirmed', actor: 'ai-evidence-audit' });
  });

  it('ne mijenja ljudsku potvrdu ni ledger kad AI dokaz za nju nije valjan', () => {
    const fixture = createAiEvidenceAuditFixture();
    const individuallyVerified: RuleEntry = {
      ...fixture.rule,
      status: 'verified',
      verifiedBy: 'reviewer',
      confirmedVia: 'human',
    };
    const invalidEvidence = {
      ...fixture.evidence,
      claim: { ...fixture.evidence.claim, value: ['Arial'] },
    };
    const res = approveFromAi(
      fixture.profileId,
      individuallyVerified,
      fixture.source,
      { now: NOW, snapshotBytes: fixture.snapshotBytes, snapshotText: fixture.snapshotText, manifest: fixture.manifest },
      invalidEvidence,
    );
    expect(res.ok).toBe(false);
    expect(res.errors?.join(' ')).toContain('value-mismatch');
    expect(res.entry).toBeUndefined();
    expect(res.ledger).toBeUndefined();
  });

  it('zapisuje samo AI-evidence potvrdu u append-only ledger', () => {
    const fixture = createAiEvidenceAuditFixture();
    const res = approveFromAi(
      fixture.profileId,
      fixture.rule,
      fixture.source,
      { now: NOW, snapshotBytes: fixture.snapshotBytes, snapshotSha256: fixture.snapshotSha256,
        currentRepairSourceHash: fixture.currentRepairSourceHash, ruleValueSha256: fixture.ruleValueSha256,
        snapshotText: fixture.snapshotText, manifest: fixture.manifest },
      fixture.evidence,
    );
    expect(res.ledger).toHaveLength(1);
    expect(res.ledger?.[0]).toMatchObject({ action: 'ai-confirmed', actor: 'ai-evidence-audit' });
  });

  it('odbija nevaljanu vrijednost i ne nudi ljudski red kao fallback', () => {
    const fixture = createAiEvidenceAuditFixture();
    const invalid = { ...fixture.evidence, claim: { ...fixture.evidence.claim, value: ['Arial'] } };
    const res = approveFromAi(
      fixture.profileId,
      fixture.rule,
      fixture.source,
      { now: NOW, snapshotBytes: fixture.snapshotBytes, snapshotText: fixture.snapshotText, manifest: fixture.manifest },
      invalid,
    );
    expect(res.ok).toBe(false);
    expect(res.errors?.join(' ')).toContain('value-mismatch');
    expect(res.errors?.join(' ')).not.toMatch(/rucnu provjeru|human review/i);
  });

  it('odbija valjan paket za profil u kojem pravilo ne postoji', () => {
    const fixture = createAiEvidenceAuditFixture();
    const res = approveFromAi(
      'different-profile',
      fixture.rule,
      fixture.source,
      { now: NOW, snapshotBytes: fixture.snapshotBytes, snapshotText: fixture.snapshotText, manifest: fixture.manifest },
      fixture.evidence,
    );
    expect(res.ok).toBe(false);
    expect(res.errors?.join(' ')).toContain('profile-id-mismatch');
  });

  it('agree bez dokaznog paketa ne mijenja pravilo niti stvara ledger zapis', () => {
    const fixture = createAiEvidenceAuditFixture();
    const res = approveFromAi(
      fixture.profileId,
      fixture.rule,
      fixture.source,
      { now: NOW, snapshotBytes: fixture.snapshotBytes, snapshotText: fixture.snapshotText, manifest: fixture.manifest },
      undefined,
    );
    expect(res.ok).toBe(false);
    expect(res.errors?.join(' ')).toContain('evidence-missing');
    expect(res.entry).toBeUndefined();
    expect(res.ledger).toBeUndefined();
  });

  it('izvor bez snapshot-a ne moze potvrditi AI-evidence pravilo', () => {
    const fixture = createAiEvidenceAuditFixture();
    const sourceWithoutSnapshot = { ...fixture.source, snapshotPath: null, snapshotHash: null, fetchedAt: null };
    const res = approveFromAi(
      fixture.profileId,
      fixture.rule,
      sourceWithoutSnapshot,
      { now: NOW, snapshotBytes: fixture.snapshotBytes, snapshotText: fixture.snapshotText, manifest: fixture.manifest },
      fixture.evidence,
    );
    expect(res.ok).toBe(false);
    expect(res.errors?.join(' ')).toContain('source-snapshot-missing');
    expect(res.ledger).toBeUndefined();
  });
});

describe('makeAdvisory i retireRule', () => {
  it('advisory ne boduje', () => {
    const res = makeAdvisory('p1', draftEntry(), { actor: 'daniel', now: NOW });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entry.status).toBe('advisory');
    expect(willScore(res.entry)).toBe(false);
    expect(res.ledger.action).toBe('advisory');
  });

  it('retire povlaci pravilo', () => {
    const res = retireRule('p1', draftEntry(), { actor: 'daniel', now: NOW });
    if (!res.ok) throw new Error('ocekivao ok');
    expect(res.entry.status).toBe('retired');
    expect(res.ledger.action).toBe('retired');
  });
});
