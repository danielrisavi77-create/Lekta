import { describe, expect, it } from 'vitest';
import { emitAnalysisOpportunitySignals, emitRepairNoOpSignals } from '../src/analytics/opportunity-emit';
import { opportunityContextFor, trackRepairResultOk } from '../src/analytics/repair-result';

describe('Opportunity emitter V3', () => {
  it('analiza emitira summary i samo sanitizirani structure breakdown', () => {
    const events: Array<{ event: string; data?: Record<string, unknown> }> = [];
    const track = (event: string, data?: Record<string, unknown>) => { events.push({ event, data }); };

    emitAnalysisOpportunitySignals(track, {
      checks: [{ status: 'unmeasurable' }],
      details: {
        profileDefinitionId: 'fpzg-diplomski',
        triage: { counts: { auto: 1, assisted: 0, manual: 0, total: 1 } },
        typographyStructure: { skipped: [{ reason: 'unsupported textbox: privatni detalj' }] },
      },
      settings: { workType: 'diplomski' },
    }, 'verified');

    expect(events.map((x) => x.event)).toEqual(['opportunity_summary', 'analysis_structure_gap']);
    expect(events[0].data).toMatchObject({
      profileId: 'fpzg-diplomski',
      workType: 'diplomski',
      unknown: 1,
      structureGaps: 1,
    });
    expect(events[1].data).toEqual({
      profileId: 'fpzg-diplomski',
      workType: 'diplomski',
      category: 'typography',
      kind: 'unsupported-structure',
      count: 1,
    });
    expect(JSON.stringify(events)).not.toContain('privatni detalj');
  });

  it('repair emitira tocno jedan parity summary i grupirane razloge bez ruleId-a', () => {
    const events: Array<{ event: string; data?: Record<string, unknown> }> = [];
    const track = (event: string, data?: Record<string, unknown>) => { events.push({ event, data }); };

    emitRepairNoOpSignals(track, {
      'tajni-rule-a': 'unsupported-structure',
      'tajni-rule-b': 'unsupported-structure',
      'tajni-rule-c': 'already-ok',
    }, { profileId: 'pravo-diplomski', workType: 'diplomski' });

    expect(events.map((x) => x.event)).toEqual([
      'repair_noop_summary',
      'repair_noop_reason',
      'repair_noop_reason',
    ]);
    expect(events[0].data).toEqual({
      profileId: 'pravo-diplomski',
      workType: 'diplomski',
      count: 3,
    });
    expect(events.slice(1).map((x) => x.data)).toEqual([
      { profileId: 'pravo-diplomski', workType: 'diplomski', kind: 'unsupported-structure', count: 2 },
      { profileId: 'pravo-diplomski', workType: 'diplomski', kind: 'already-ok', count: 1 },
    ]);
    expect(JSON.stringify(events)).not.toContain('tajni-rule');
  });

  it('repair bez preskoka ipak emitira summary count=0, da nula nije isto sto i nestala instrumentacija', () => {
    const events: Array<{ event: string; data?: Record<string, unknown> }> = [];
    emitRepairNoOpSignals((event, data) => { events.push({ event, data }); }, {}, {
      profileId: 'fpzg-diplomski',
      workType: 'diplomski',
    });

    expect(events).toEqual([{
      event: 'repair_noop_summary',
      data: { profileId: 'fpzg-diplomski', workType: 'diplomski', count: 0 },
    }]);
  });

  it('trackRepairResultOk salje neovisni repair_result_ok pa summary i breakdown s istim kontekstom', () => {
    const events: Array<{ event: string; data?: Record<string, unknown> }> = [];
    const context = opportunityContextFor({ details: { profileDefinitionId: 'fpzg-diplomski' }, settings: { workType: 'diplomski' } });
    trackRepairResultOk((event, data) => { events.push({ event, data }); }, { 'tajni-rule': 'no-target' }, context);

    expect(events).toEqual([
      { event: 'repair_result_ok', data: { profileId: 'fpzg-diplomski', workType: 'diplomski' } },
      { event: 'repair_noop_summary', data: { profileId: 'fpzg-diplomski', workType: 'diplomski', count: 1 } },
      { event: 'repair_noop_reason', data: { profileId: 'fpzg-diplomski', workType: 'diplomski', kind: 'no-target', count: 1 } },
    ]);
  });

  it('opportunityContextFor ne izmislja profil ni vrstu rada', () => {
    expect(opportunityContextFor(null)).toEqual({ profileId: '', workType: '' });
    expect(opportunityContextFor({ details: { profileDefinitionId: 7 as unknown as string } })).toEqual({ profileId: '', workType: '' });
  });
});
