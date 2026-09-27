/**
 * Drift gard za verifikacijski worklist (data/verification/dossiers/**).
 *
 * Zasto postoji: commitani INDEX.md je tvrdio 2150 bodovanih pravila i 26 za ljudski audit, dok
 * je ziva regeneracija davala 2208 i 38 kroz 8 profila. Ustajali izvjestaj o verifikaciji gori je
 * od nikakvog, jer se po njemu planira ljudski rad. Coverage matrica je takav gard imala
 * (tests/coverage-report.test.ts), dosjei ga nisu.
 *
 * Kad padne: `npm run worklist` pa commitaj regenerirani izlaz.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
  DRAFT_PROFILE_IDS,
} from '../src/profiles/drafts-runtime';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import { computeWorklist, BULK_APPROVAL, ruleEvidenceKey } from '../src/verification/worklist';
import { auditAiEvidence } from '../src/verification/ai-evidence-audit';
import { loadRepositoryAiEvidenceContext } from '../scripts/ai-evidence-context-loader';
import storedCoverage from '../data/coverage/scored-coverage.json';
import type { RuleEntry, ThesisProfile, SourceEntry } from '../src/profiles/profile-schema';
import { createAiEvidenceAuditFixture } from './helpers/ai-evidence-audit-fixture';

const profiles = [
  ...VERIFIED_PROFILES_WITH_DRAFTS,
  ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
] as unknown as ThesisProfile[];
const registered = new Set(profiles.map((p) => p.id));
const orphans = DRAFT_PROFILE_IDS.filter((id) => !registered.has(id));

const evidenceContext = await loadRepositoryAiEvidenceContext(
  process.cwd(),
  profiles,
  SOURCE_REGISTRY as SourceEntry[],
);
const fresh = computeWorklist(profiles, SOURCE_REGISTRY as SourceEntry[], orphans, {
  aiEvidenceResults: evidenceContext.resultsByRule,
});
const DOSSIER_DIR = 'data/verification/dossiers';

/**
 * core.autocrlf=true pretvara ove .md u CRLF na checkoutu, a generator ih pise s \n. Gard cuva
 * SADRZAJ, ne politiku zavrsetaka redaka, pa se usporedjuje normalizirano.
 */
function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

describe('verifikacijski worklist je u koraku s pravilima', () => {
  it('svaka commitana datoteka je identicna svjezem izracunu (inace: npm run worklist)', () => {
    for (const [rel, content] of Object.entries(fresh.files)) {
      const onDisk = normalize(readFileSync(resolve(process.cwd(), rel), 'utf8'));
      expect(onDisk, `${rel} je ustajao`).toBe(content);
    }
  });

  it('u dosjeima nema datoteke koju generator vise ne pise (uklonjen audit ostavlja trag)', () => {
    const expected = new Set(
      Object.keys(fresh.files)
        .filter((rel) => rel.startsWith(`${DOSSIER_DIR}/`))
        .map((rel) => rel.slice(rel.lastIndexOf('/') + 1)),
    );
    const actual = readdirSync(resolve(process.cwd(), DOSSIER_DIR)).filter((f) => f.endsWith('.md'));
    expect([...actual].sort()).toEqual([...expected].sort());
  });

  it('dosje se pise tocno za profile s pravilom koje trazi AI-evidence rad', () => {
    const withWork = [...new Set(fresh.ruleItems.filter((item) => item.action !== 'none').map((item) => item.profileId))].sort();
    const dossiers = Object.keys(fresh.files)
      .filter((rel) => rel.startsWith(`${DOSSIER_DIR}/`) && rel.endsWith('.md') && !rel.endsWith('/INDEX.md'))
      .map((rel) => rel.slice(rel.lastIndexOf('/') + 1, -'.md'.length))
      .sort();
    expect(dossiers).toEqual(withWork);
  });

  it('privatni JSON worklist je projekcija tocno istih ruleItems', () => {
    const serialized = JSON.parse(fresh.files['data/verification/ai-evidence-worklist.json']);
    expect(serialized.ruleCount).toBe(fresh.ruleItems.length);
    expect(serialized.rules).toEqual(fresh.ruleItems);
    expect(serialized.statusCounts).toEqual(
      fresh.ruleItems.reduce<Record<string, number>>((counts, item) => {
        counts[item.status] = (counts[item.status] ?? 0) + 1;
        return counts;
      }, {}),
    );
  });

  it('nijedan draft ne zivi mimo registra profila', () => {
    expect(fresh.orphanDraftProfileIds).toEqual([]);
  });

  it('svako pravilo iz svakog registra ima tocno jedan status worklista ili dokazano stanje', () => {
    const allRules = profiles.flatMap((profile) => (profile.ruleEntries ?? []).map((entry) => `${profile.id}::${entry.ruleId}`));
    const worklistKeys = fresh.ruleItems.map((item) => `${item.profileId}::${item.ruleId}`);

    expect(worklistKeys).toHaveLength(allRules.length);
    expect(new Set(allRules).size).toBe(allRules.length);
    expect([...worklistKeys].sort()).toEqual([...allRules].sort());
    expect(fresh.ruleItems.every((item) => item.status && item.reasonCodes && item.action)).toBe(true);
  });

  it('po profilu izlaže točan broj bodovanih pravila koja još čekaju dokaz', () => {
    for (const row of fresh.rows) {
      const expected = fresh.ruleItems.filter((item) =>
        item.profileId === row.profileId
        && item.action !== 'none',
      ).length;
      expect(row.pendingEvidence, row.profileId).toBe(expected);
    }
  });

  it.each([
    ['owner-bulk-approval', { verifiedBy: BULK_APPROVAL }, 'legacy-bulk-untrusted'],
    ['ai-1pass-batch', { confirmedVia: 'ai-1pass-batch' }, 'legacy-ai-batch-untrusted'],
    ['ai-3pass-batch', { confirmedVia: 'ai-3pass-batch' }, 'legacy-ai-batch-untrusted'],
  ] as const)('%s nije dokazni AI audit bez novog paketa', (_label, status, reasonCode) => {
    const profile: ThesisProfile = {
      id: 'legacy-batch-profile',
      rules: {},
      ruleEntries: [{
        ruleId: `legacy-${_label}`,
        checkId: 'font',
        value: ['Times New Roman'],
        authority: 'general',
        sourceId: 'pravo-upute-oblikovanje-2024',
        sourcePage: 'section 4',
        quote: 'font: Times New Roman',
        status: 'verified',
        ...status,
      }],
    };
    const result = computeWorklist([profile], SOURCE_REGISTRY as SourceEntry[]);
    const row = result.ruleItems.find((item) => item.ruleId === `legacy-${_label}`);
    expect(row?.status).toBe('needs-ai-evidence');
    expect(row?.reasonCodes).toContain(reasonCode);
  });

  it('pojedinačna ljudska potvrda ne zatvara AI-evidence worklist', () => {
    const fixture = createAiEvidenceAuditFixture();
    const profile: ThesisProfile = {
      id: fixture.profileId,
      rules: {},
      ruleEntries: [{
        ...fixture.rule,
        status: 'verified',
        verifiedBy: 'reviewer',
        confirmedVia: 'human',
      }],
    };

    const row = computeWorklist([profile], [fixture.source]).ruleItems[0];

    expect(row.status).toBe('needs-ai-evidence');
    expect(row.reasonCodes).toContain('human-verification-not-ai-audited');
    expect(row.action).toBe('run-ai-evidence-audit');
  });

  it('AI-evidence pravilo izlazi iz worklista samo uz rezultat valjanog deterministickog validatora', () => {
    const fixture = createAiEvidenceAuditFixture();
    const entry: RuleEntry = {
      ...fixture.rule,
      status: 'verified',
      verifiedBy: 'ai-evidence-audit',
      confirmedVia: 'ai-evidence-audit',
      aiEvidence: fixture.evidence,
    };
    const profile: ThesisProfile = { id: fixture.profileId, rules: {}, ruleEntries: [entry] };
    const key = ruleEvidenceKey(fixture.profileId, entry.ruleId);
    const withoutValidation = computeWorklist([profile], [fixture.source]).ruleItems[0];
    expect(withoutValidation.status).toBe('needs-ai-evidence');
    expect(withoutValidation.reasonCodes).toContain('ai-evidence-not-revalidated');

    const valid = auditAiEvidence(fixture);
    const withValidation = computeWorklist([profile], [fixture.source], [], { aiEvidenceResults: { [key]: valid } }).ruleItems[0];
    expect(withValidation.status).toBe('ai-evidence-verified');
    expect(withValidation.action).toBe('none');

    const invalid = auditAiEvidence({
      ...fixture,
      evidence: { ...fixture.evidence, claim: { ...fixture.evidence.claim, value: ['Arial'] } },
    });
    const withInvalidValidation = computeWorklist([profile], [fixture.source], [], { aiEvidenceResults: { [key]: invalid } }).ruleItems[0];
    expect(withInvalidValidation.status).toBe('needs-ai-evidence');
    expect(withInvalidValidation.reasonCodes).toContain('value-mismatch');
  });

  it('poznata netočna GPT-5 provenijencija ostaje označena za ponovni audit i uz valjan legacy paket', () => {
    const fixture = createAiEvidenceAuditFixture();
    const legacyEvidence = { ...fixture.evidence, model: { provider: 'OpenAI', model: 'GPT-5', version: 'runtime-version-not-exposed' } };
    const entry: RuleEntry = { ...fixture.rule, status: 'verified', scored: true,
      confirmedVia: 'ai-evidence-audit', aiEvidence: legacyEvidence };
    const key = ruleEvidenceKey(fixture.profileId, entry.ruleId);
    const result = computeWorklist([{ id: fixture.profileId, rules: {}, ruleEntries: [entry] }], [fixture.source], [], {
      aiEvidenceResults: { [key]: auditAiEvidence({ ...fixture, rule: entry, evidence: legacyEvidence }) },
    });
    expect(result.ruleItems[0]).toMatchObject({ status: 'needs-ai-evidence', action: 'run-ai-evidence-audit' });
    expect(result.ruleItems[0].reasonCodes).toContain('provider-provenance-recheck');
  });

  it('12 ponovno auditiranih paketa je valjano, a preostalih 12 od izvorna 24 čeka ponovni audit', () => {
    const marked = fresh.ruleItems.filter((item) => item.reasonCodes.includes('provider-provenance-recheck'));
    const applied = new Set(['efos-doktorski', 'efos-specijalisticki', 'vuka-prehrambena-zavrsni']);
    const verified = fresh.ruleItems.filter((item) => applied.has(item.profileId) && item.status === 'ai-evidence-verified');
    expect(verified).toHaveLength(12);
    expect(marked).toHaveLength(12);
    expect(marked.every((item) => item.status === 'needs-ai-evidence' && item.action === 'run-ai-evidence-audit')).toBe(true);
  });

  /**
   * Ovo je poanta P0-2: dva broja koja su izgledala kao nepomirena razlika ("2135 vs 2150") mjere
   * dvije razlicite populacije. Worklist broji SVA bodovana pravila jer ih covjek sva mora proci;
   * coverage broji samo strojno provjerljiva jer su ona nazivnik omjera. Test to zakljucava, pa se
   * razlika vise ne moze citati kao kvar ni tiho promijeniti.
   */
  it('scoredTotal je nadskup coverage brojnika, s tocno objasnjenom razlikom', () => {
    expect(fresh.totals.scoredTotal).toBe(storedCoverage.scoredTotal);
    expect(fresh.totals.scoredTotal).toBeGreaterThan(storedCoverage.scoredMachineCheckable);
    expect(fresh.totals.scoredTotal - storedCoverage.scoredMachineCheckable).toBe(
      storedCoverage.scoredNonMachineCheckable,
    );
  });

  it('bulk i human su disjunktni podskupovi bodovanih pravila', () => {
    for (const row of fresh.rows) {
      expect(row.bulk + row.human).toBeLessThanOrEqual(row.scored);
    }
    expect(fresh.totals.bulk + fresh.totals.human).toBe(fresh.totals.scoredTotal);
    expect(BULK_APPROVAL).toBe('owner-bulk-approval');
  });
});
