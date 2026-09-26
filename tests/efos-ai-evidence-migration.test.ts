import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VERIFIED_PROFILES_WITH_DRAFTS } from '../src/profiles/drafts-runtime';
import type { SourceEntry, ThesisProfile } from '../src/profiles/profile-schema';
import { ruleEvidenceKey } from '../src/verification/worklist';
import { applyAiEvidenceProfile } from '../src/verification/apply-ai-evidence-profile';
import { approveFromAi } from '../src/verification/verification-actions';
import type { AiEvidenceAudit } from '../src/verification/ai-evidence-audit';
import { loadRepositoryAiEvidenceContext } from '../scripts/ai-evidence-context-loader';

const ROOT = resolve(__dirname, '..');
const sources = JSON.parse(
  readFileSync(resolve(ROOT, 'data/sources/source-registry.json'), 'utf8'),
) as SourceEntry[];
const ledger = JSON.parse(
  readFileSync(resolve(ROOT, 'data/verification/ledger.json'), 'utf8'),
) as Array<{ id: string; profileId: string; ruleId: string; action: string }>;
const efos = VERIFIED_PROFILES_WITH_DRAFTS.find((profile) => profile.id === 'efos-doktorski') as ThesisProfile;
const efosSpecialist = VERIFIED_PROFILES_WITH_DRAFTS.find((profile) => profile.id === 'efos-specijalisticki') as ThesisProfile;
const efosGeneral = VERIFIED_PROFILES_WITH_DRAFTS.find((profile) => profile.id === 'efos-opci-akademski-rad') as ThesisProfile;
const efstGeneral = VERIFIED_PROFILES_WITH_DRAFTS.find((profile) => profile.id === 'efst-opci-akademski-rad') as ThesisProfile;

describe('EFOS doktorski AI-evidence migracija', () => {
  it('svih pet bodovanih pravila veže uz točan službeni snapshot i prolazne closed-loop manifeste', async () => {
    const context = await loadRepositoryAiEvidenceContext(ROOT, [efos], sources);
    const entries = efos.ruleEntries ?? [];
    const aiEntries = entries.filter((entry) => entry.confirmedVia === 'ai-evidence-audit');

    expect(entries).toHaveLength(5);
    expect(aiEntries).toHaveLength(5);
    expect(context.gateContext.snapshotTextsBySourceId['efos-upute-studentski-2023'])
      .toMatch(/doktorski rad/i);
    for (const entry of aiEntries) {
      expect(context.resultsByRule[ruleEvidenceKey(efos.id, entry.ruleId)], entry.ruleId)
        .toEqual({ valid: true, reasons: [] });
      const evidence = entry.aiEvidence!;
      const approval = approveFromAi(
        efos.id,
        { ...entry, status: 'verified', verifiedBy: 'owner-bulk-approval' },
        sources.find((source) => source.id === entry.sourceId),
        {
          now: '2026-09-25',
          snapshotBytes: context.gateContext.snapshotBytesBySourceId[entry.sourceId!]!,
          snapshotSha256: context.gateContext.snapshotHashesBySourceId[entry.sourceId!]!,
          currentRepairSourceHash: context.gateContext.currentRepairSourceHash,
          ruleValueSha256: context.gateContext.ruleValueHashesByRule[ruleEvidenceKey(efos.id, entry.ruleId)],
          snapshotText: context.gateContext.snapshotTextsBySourceId[entry.sourceId!]!,
          manifest: context.gateContext.manifestsById[evidence.execution.manifestId] ?? null,
        },
        evidence,
      );
      expect(approval.ok, entry.ruleId).toBe(true);
      if (!approval.ok || !approval.entry || !approval.ledger?.[0]) {
        throw new Error((approval.errors ?? []).join('; ') || `AI potvrda nije proizvela prijelaz za ${entry.ruleId}.`);
      }
      expect(approval.entry).toMatchObject({
        confirmedVia: entry.confirmedVia,
        modalitySource: 'ai-evidence-audit',
        verifiedHash: evidence.snapshotHash,
      });
      expect(ledger).toContainEqual(expect.objectContaining({
        id: approval.ledger[0].id,
        profileId: efos.id,
        ruleId: entry.ruleId,
        action: 'ai-confirmed',
      }));
    }
  });

  it('specijalistički profil veže svih pet pravila uz službeni snapshot i vlastite prolazne manifeste', async () => {
    const context = await loadRepositoryAiEvidenceContext(ROOT, [efosSpecialist], sources);
    const entries = efosSpecialist.ruleEntries ?? [];
    const aiEntries = entries.filter((entry) => entry.confirmedVia === 'ai-evidence-audit');

    expect(entries).toHaveLength(5);
    expect(aiEntries).toHaveLength(5);
    for (const entry of aiEntries) {
      expect(context.resultsByRule[ruleEvidenceKey(efosSpecialist.id, entry.ruleId)], entry.ruleId)
        .toEqual({ valid: true, reasons: [] });
      expect(ledger).toContainEqual(expect.objectContaining({
        id: `led-${entry.ruleId}-ai-confirmed-2026-09-25`,
        profileId: efosSpecialist.id,
        ruleId: entry.ruleId,
        action: 'ai-confirmed',
      }));
    }
  });

});

describe('EFOS opći akademski AI-evidence migracija', () => {
  it('stvarno spremljeni AI-paketi pokrivaju svih pet bodovanih pravila', async () => {
    const context = await loadRepositoryAiEvidenceContext(ROOT, [efosGeneral], sources, {
      targetProfileIds: [efosGeneral.id],
    });
    const scoredEntries = (efosGeneral.ruleEntries ?? []).filter((entry) => entry.scored === true);
    expect(scoredEntries).toHaveLength(5);
    expect(scoredEntries.every((entry) => entry.aiEvidence)).toBe(true);
    for (const entry of scoredEntries) {
      expect(context.resultsByRule[ruleEvidenceKey(efosGeneral.id, entry.ruleId)], entry.ruleId)
        .toEqual({ valid: true, reasons: [] });
    }
    const pendingProfile = {
      ...efosGeneral,
      ruleEntries: (efosGeneral.ruleEntries ?? []).map((entry) => entry.scored === true
        ? { ...entry, confirmedVia: 'ai-1pass-batch' as const }
        : entry),
    };
    const application = applyAiEvidenceProfile(pendingProfile, {
      now: '2026-09-25',
      sourcesById: Object.fromEntries(sources.map((source) => [source.id, source])),
      snapshotBytesBySourceId: context.gateContext.snapshotBytesBySourceId,
      snapshotTextsBySourceId: context.gateContext.snapshotTextsBySourceId,
      snapshotHashesBySourceId: context.gateContext.snapshotHashesBySourceId,
      currentRepairSourceHash: context.gateContext.currentRepairSourceHash,
      ruleValueHashesByRule: context.gateContext.ruleValueHashesByRule,
      manifestsById: context.gateContext.manifestsById,
    });
    expect(application.ok, application.ok ? '' : application.errors.join('; ')).toBe(true);
    if (!application.ok) return;
    expect(application.profile.ruleEntries?.filter((entry) => entry.scored === true)
      .every((entry) => entry.confirmedVia === 'ai-evidence-audit')).toBe(true);
    expect(application.ledger).toHaveLength(5);
    const persistedEvents = ledger.filter((event) =>
      event.profileId === efosGeneral.id && event.action === 'ai-confirmed',
    );
    expect(persistedEvents).toHaveLength(5);
    for (const entry of scoredEntries) {
      expect(persistedEvents).toContainEqual(expect.objectContaining({
        profileId: efosGeneral.id,
        ruleId: entry.ruleId,
        action: 'ai-confirmed',
      }));
    }
  });

  it('svih pet pravila prolazi AI audit s doslovnim citatima i stvarnim closed-loop manifestima', async () => {
    const context = await loadRepositoryAiEvidenceContext(ROOT, [efosGeneral], sources, {
      targetProfileIds: [efosGeneral.id],
    });
    const scoredEntries = (efosGeneral.ruleEntries ?? []).filter((entry) => entry.scored === true);
    const source = sources.find((item) => item.id === 'efos-upute-studentski-2023');
    const sourcePage = 'Odjeljak 2, tiskana str. 2';
    const claims: Record<string, { value: unknown; scope: 'body' | 'whole'; quote: string }> = {
      font: {
        value: ['Times New Roman'],
        scope: 'body',
        quote: 'rad treba pisati fontom Times New Roman veličine 12 točaka uz prored 1,5',
      },
      'font-size': {
        value: [12],
        scope: 'body',
        quote: 'rad treba pisati fontom Times New Roman veličine 12 točaka uz prored 1,5',
      },
      'line-spacing': {
        value: 1.5,
        scope: 'body',
        quote: 'rad treba pisati fontom Times New Roman veličine 12 točaka uz prored 1,5',
      },
      margins: {
        value: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
        scope: 'whole',
        quote: 'veličina je stranice A4 (210x297 mm), a rubnice trebaju biti sljedeće veličine: lijeva 25 mm, desna 25 mm, gornja i donja po 25 mm',
      },
      'paper-size': {
        value: true,
        scope: 'whole',
        quote: 'veličina je stranice A4 (210x297 mm), a rubnice trebaju biti sljedeće veličine: lijeva 25 mm, desna 25 mm, gornja i donja po 25 mm',
      },
    };
    const evidenceEntries = [];

    expect(scoredEntries).toHaveLength(5);
    expect(source).toBeDefined();
    for (const entry of scoredEntries) {
      const claim = claims[entry.checkId];
      expect(claim, entry.checkId).toBeDefined();
      const manifest = Object.values(context.gateContext.manifestsById)
        .find((candidate) => candidate.ruleId === entry.ruleId);
      expect(manifest, entry.ruleId).toBeDefined();
      const rule = {
        ...entry,
        sourcePage,
        quote: claim.quote,
        status: 'verified' as const,
        confirmedVia: 'ai-1pass-batch' as const,
      };
      const evidence: AiEvidenceAudit = {
        schemaVersion: 1,
        profileId: efosGeneral.id,
        ruleId: entry.ruleId,
        sourceId: source!.id,
        sourceUrl: source!.url,
        fetchedAt: source!.fetchedAt!,
        snapshotHash: source!.snapshotHash!,
        sourcePage,
        quote: claim.quote,
        claim: { value: claim.value, modality: 'directive', scope: claim.scope },
        passes: [
          { pass: 'extract', verdict: 'confirm', note: `Izvor navodi ${JSON.stringify(claim.value)} za ${claim.scope}.` },
          { pass: 'quote-check', verdict: 'confirm', note: 'Citat je doslovno pronađen u službenom DOCX snapshotu, odjeljak 2.' },
          { pass: 'refute', verdict: 'confirm', note: 'U odjeljku s općim oblikovanjem nema suprotne vrijednosti za ovu os.' },
        ],
        agree: true,
        summary: `Službeni EFOS izvor i izvršni manifest potvrđuju vrijednost osi ${entry.checkId}.`,
        model: { provider: 'OpenAI', model: 'GPT-5', version: 'runtime-version-not-exposed' },
        execution: {
          manifestId: manifest!.manifestId,
          testId: manifest!.testId,
          command: manifest!.command,
          inputHash: manifest!.inputHash,
          outputHash: manifest!.outputHash,
          ranAt: manifest!.ranAt,
        },
      };
      evidenceEntries.push({ ...rule, aiEvidence: evidence });
    }
    const evidenceEntriesById = new Map(evidenceEntries.map((entry) => [entry.ruleId, entry]));
    const application = applyAiEvidenceProfile(
      {
        ...efosGeneral,
        ruleEntries: (efosGeneral.ruleEntries ?? []).map((entry) => evidenceEntriesById.get(entry.ruleId) ?? entry),
      },
      {
        now: '2026-09-25',
        sourcesById: { [source!.id]: source },
        snapshotBytesBySourceId: context.gateContext.snapshotBytesBySourceId,
        snapshotTextsBySourceId: context.gateContext.snapshotTextsBySourceId,
        snapshotHashesBySourceId: context.gateContext.snapshotHashesBySourceId,
        currentRepairSourceHash: context.gateContext.currentRepairSourceHash,
        ruleValueHashesByRule: context.gateContext.ruleValueHashesByRule,
        manifestsById: context.gateContext.manifestsById,
      },
    );
    expect(application.ok, application.ok ? '' : application.errors.join('; ')).toBe(true);
    if (!application.ok) return;
    expect(application.profile.ruleEntries).toHaveLength(6);
    expect(application.profile.ruleEntries?.filter((entry) => entry.scored === true)).toHaveLength(5);
    expect(application.profile.ruleEntries?.filter((entry) => entry.scored === true)
      .every((entry) => entry.confirmedVia === 'ai-evidence-audit')).toBe(true);
    expect(application.ledger).toHaveLength(5);
    expect(application.ledger.every((event) => event.action === 'ai-confirmed')).toBe(true);
  });
});

describe('EFST opći akademski AI-evidence migracija', () => {
  it('svih pet bodovanih pravila prolazi svježu provjeru službenog izvora i closed-loop manifesta', async () => {
    const context = await loadRepositoryAiEvidenceContext(ROOT, [efstGeneral], sources, {
      targetProfileIds: [efstGeneral.id],
    });
    const scoredEntries = (efstGeneral.ruleEntries ?? []).filter((entry) => entry.scored === true);
    const aiEntries = scoredEntries.filter((entry) => entry.confirmedVia === 'ai-evidence-audit');
    const exactSourcePage = 'Odjeljak 4, tiskana str. 7';
    const exactQuote = 'Za oblikovanje teksta koristi se font Times New Roman, veličina 12, uz prored od 1,5. '
      + 'Tekst treba biti poravnat uz lijevi i desni rub stranice. Margine trebaju biti udaljene 2,5 cm od '
      + 'gornjeg, donjeg, lijevog i desnog ruba stranice.';

    expect(scoredEntries).toHaveLength(5);
    expect(aiEntries).toHaveLength(5);
    for (const entry of aiEntries) {
      expect(entry.sourcePage, entry.ruleId).toBe(exactSourcePage);
      expect(entry.quote, entry.ruleId).toBe(exactQuote);
      expect(entry.aiEvidence?.sourcePage, entry.ruleId).toBe(exactSourcePage);
      expect(entry.aiEvidence?.quote, entry.ruleId).toBe(exactQuote);
      expect(context.resultsByRule[ruleEvidenceKey(efstGeneral.id, entry.ruleId)], entry.ruleId)
        .toEqual({ valid: true, reasons: [] });
      expect(ledger).toContainEqual(expect.objectContaining({
        profileId: efstGeneral.id,
        ruleId: entry.ruleId,
        action: 'ai-confirmed',
      }));
    }
  });
});

describe('VUKA prehrambena završni AI-evidence migracija', () => {
  it('dvije bodovane obveze veže uz službeni DOCX i prolazne closed-loop manifeste', async () => {
    const profile = VERIFIED_PROFILES_WITH_DRAFTS.find((item) => item.id === 'vuka-prehrambena-zavrsni') as ThesisProfile;
    const context = await loadRepositoryAiEvidenceContext(ROOT, [profile], sources, {
      targetProfileIds: [profile.id],
    });
    const scoredEntries = (profile.ruleEntries ?? []).filter((entry) => entry.scored === true);
    const aiEntries = scoredEntries.filter((entry) => entry.confirmedVia === 'ai-evidence-audit');
    const exactSourcePage = 'Odjeljak 4, naslov "Kod pisanja završnog rada mora se udovoljiti sljedećim zahtjevima"';
    const exactQuote = 'u radu se koristi visina slova 12 točaka, a naslova 14 podebljano te prored 1,5.';

    expect(scoredEntries.map((entry) => entry.checkId).sort()).toEqual(['font-size', 'line-spacing']);
    expect(aiEntries).toHaveLength(2);
    for (const entry of aiEntries) {
      expect(entry.sourcePage, entry.ruleId).toBe(exactSourcePage);
      expect(entry.quote, entry.ruleId).toBe(exactQuote);
      expect(entry.aiEvidence?.sourcePage, entry.ruleId).toBe(exactSourcePage);
      expect(entry.aiEvidence?.quote, entry.ruleId).toBe(exactQuote);
      expect(context.resultsByRule[ruleEvidenceKey(profile.id, entry.ruleId)], entry.ruleId)
        .toEqual({ valid: true, reasons: [] });
      expect(ledger).toContainEqual(expect.objectContaining({
        profileId: profile.id,
        ruleId: entry.ruleId,
        action: 'ai-confirmed',
      }));
    }
    expect((profile.ruleEntries ?? []).find((entry) => entry.checkId === 'font')?.scored).not.toBe(true);
  });
});

describe('VUKA lovstvo završni AI-evidence migracija', () => {
  it('dvije bodovane obveze veže uz točan službeni DOCX i vlastite prolazne manifeste', async () => {
    const profile = VERIFIED_PROFILES_WITH_DRAFTS.find((item) => item.id === 'vuka-lovstvo-zavrsni') as ThesisProfile;
    const context = await loadRepositoryAiEvidenceContext(ROOT, [profile], sources, {
      targetProfileIds: [profile.id],
    });
    const scoredEntries = (profile.ruleEntries ?? []).filter((entry) => entry.scored === true);
    const aiEntries = scoredEntries.filter((entry) => entry.confirmedVia === 'ai-evidence-audit');
    const sourcePages: Record<string, string> = {
      'vuka-lovstvo-zavrsni--font-size': 'Poglavlje "Način pisanja završnog rada"',
      'vuka-lovstvo-zavrsni--paper-size': 'Poglavlje "Način pisanja završnog rada"',
    };
    const quotes: Record<string, string> = {
      'vuka-lovstvo-zavrsni--font-size': 'rad ne može biti pisan ili tiskan znakovima manjim od 3 (tri) niti većim od 4 (četiri) milimetra (visina slova 12 točaka, a naslova 14 podebljano).',
      'vuka-lovstvo-zavrsni--paper-size': 'rad se piše ili tiska samo na licu čistog bijelog papira formata A4, težine 80 g/m2.',
    };

    expect(scoredEntries.map((entry) => entry.checkId).sort()).toEqual(['font-size', 'paper-size']);
    expect(aiEntries).toHaveLength(2);
    for (const entry of aiEntries) {
      expect(entry.sourcePage, entry.ruleId).toBe(sourcePages[entry.ruleId]);
      expect(entry.quote, entry.ruleId).toBe(quotes[entry.ruleId]);
      expect(entry.aiEvidence?.sourcePage, entry.ruleId).toBe(sourcePages[entry.ruleId]);
      expect(entry.aiEvidence?.quote, entry.ruleId).toBe(quotes[entry.ruleId]);
      expect(context.resultsByRule[ruleEvidenceKey(profile.id, entry.ruleId)], entry.ruleId)
        .toEqual({ valid: true, reasons: [] });
      expect(ledger).toContainEqual(expect.objectContaining({
        profileId: profile.id,
        ruleId: entry.ruleId,
        action: 'ai-confirmed',
      }));
    }
  });
});
