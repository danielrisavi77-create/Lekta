// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { opportunitySignalForEvent, repairNoOpSignals, repairNoOpSummarySignal, structureGapSignalsForEvent } from '../src/analytics/opportunity-signal';

describe('opportunitySignalForEvent', () => {
  it('izvodi samo agregirane brojace bez teksta rada', () => {
    const out = opportunitySignalForEvent({
      checks: [{ status: 'pass' }, { status: 'unmeasurable' }, { status: 'unmeasurable' }],
      details: {
        profileDefinitionId: 'fpzg-diplomski',
        triage: { counts: { auto: 4, assisted: 2, manual: 3, total: 9 } },
      },
      settings: { workType: 'diplomski' },
    }, 'verified');

    expect(out).toEqual({
      profileId: 'fpzg-diplomski',
      profileStatus: 'verified',
      workType: 'diplomski',
      auto: 4,
      assisted: 2,
      manual: 3,
      unknown: 2,
      structureGaps: 0,
      total: 9,
      kind: 'manual',
    });
    expect(JSON.stringify(out)).not.toContain('tekst');
  });

  it('nevalidne brojace svodi na nulu i ne baca na djelomicnom rezultatu', () => {
    expect(opportunitySignalForEvent({
      checks: null,
      details: { triage: { counts: { auto: -1, assisted: 'x', manual: null, total: undefined } } },
    }, '')).toMatchObject({
      profileId: '',
      profileStatus: 'generic',
      workType: '',
      auto: 0,
      assisted: 0,
      manual: 0,
      unknown: 0,
      structureGaps: 0,
      total: 0,
      kind: 'clear',
    });
  });

  it('unknown ima prednost pred structure gapom i assisted kad nema manual nalaza', () => {
    expect(opportunitySignalForEvent({
      checks: [{ status: 'unmeasurable' }],
      details: {
        triage: { counts: { auto: 2, assisted: 1, manual: 0, total: 3 } },
        typographyStructure: { skipped: [{ reason: 'unsupported-structure' }] },
      },
    }, 'partial').kind).toBe('unknown');
  });

  it('strukturirane skip razloge svodi na sigurni enum bez slanja izvornog razloga', () => {
    const signals = structureGapSignalsForEvent({
      details: {
        typographyStructure: { skipped: [{ reason: 'unsupported textbox: tajni detalj' }, { reason: 'unsupported run' }] },
        consistencyStructure: { skipped: [{ reason: 'stale-anchor: odlomak 42' }] },
        linkDoiStructure: { skipped: [{ reason: 'nepoznat slobodni tekst' }] },
      },
    });
    expect(signals).toEqual([
      { category: 'typography', kind: 'unsupported-structure', count: 2 },
      { category: 'consistency', kind: 'stale-anchor', count: 1 },
      { category: 'link-doi', kind: 'other', count: 1 },
    ]);
    expect(JSON.stringify(signals)).not.toContain('tajni detalj');
    expect(JSON.stringify(signals)).not.toContain('odlomak 42');
  });

  it('prepoznaje stvarni hrvatski vokabular capability gapova iz analizatora', () => {
    const signals = structureGapSignalsForEvent({
      details: {
        typographyStructure: { skipped: [{ reason: 'složena Word struktura (polje, poveznica, tablica, SDT ili revizija)' }] },
        consistencyStructure: { skipped: [{ reason: 'odlomci unutar tablice nisu podržani u V1' }] },
        linkDoiStructure: { skipped: [{ reason: 'složena Word struktura ili polje' }] },
        requiredSectionsStructure: { skipped: [{ reason: 'dokument sadrži tekstualne okvire ili customXml strukture; analizirana su samo izravna body-level sidra' }] },
      },
    });
    expect(signals).toEqual([
      { category: 'typography', kind: 'unsupported-structure', count: 1 },
      { category: 'consistency', kind: 'unsupported-structure', count: 1 },
      { category: 'link-doi', kind: 'unsupported-structure', count: 1 },
      { category: 'required-sections', kind: 'unsupported-structure', count: 1 },
    ]);
  });

  it('repair no-op razloge grupira bez ruleId-a i odbacuje nepoznatu vrijednost u unclassified', () => {
    expect(repairNoOpSignals({
      'rule-1': 'unsupported-structure',
      'rule-2': 'unsupported-structure',
      'rule-3': 'invalid-params',
      'tajni-rule-id': 'slobodni tekst',
    })).toEqual([
      { kind: 'unsupported-structure', count: 2 },
      { kind: 'invalid-params', count: 1 },
      { kind: 'unclassified', count: 1 },
    ]);
  });

  it('structure gap nosi samo interni profil i vrstu rada kao kontekst', () => {
    expect(structureGapSignalsForEvent({
      details: {
        profileDefinitionId: 'fpzg-diplomski',
        typographyStructure: { skipped: [{ reason: 'unsupported run' }] },
      },
      settings: { workType: 'diplomski' },
    })).toEqual([
      { profileId: 'fpzg-diplomski', workType: 'diplomski', category: 'typography', kind: 'unsupported-structure', count: 1 },
    ]);
  });

  it('repair no-op summary i breakdown imaju isti agregirani count i isti sigurni kontekst', () => {
    const reasons = {
      'rule-1': 'unsupported-structure',
      'rule-2': 'already-ok',
      'rule-3': 'unsupported-structure',
    };
    const context = { profileId: 'pravo-diplomski', workType: 'diplomski' };
    const breakdown = repairNoOpSignals(reasons, context);
    expect(breakdown).toEqual([
      { profileId: 'pravo-diplomski', workType: 'diplomski', kind: 'unsupported-structure', count: 2 },
      { profileId: 'pravo-diplomski', workType: 'diplomski', kind: 'already-ok', count: 1 },
    ]);
    expect(repairNoOpSummarySignal(reasons, context)).toEqual({
      profileId: 'pravo-diplomski',
      workType: 'diplomski',
      count: 3,
    });
    expect(breakdown.reduce((sum, x) => sum + x.count, 0)).toBe(3);
  });
});
