// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { opportunityMeasurementHealth, rankOpportunityRows, strongestMeasuredOpportunity } from '../src/admin/opportunity-ranking';

describe('rankOpportunityRows', () => {
  it('dovoljni uzorci idu ispred malih, zatim veci udio pa volumen', () => {
    const out = rankOpportunityRows([
      { id: 'mali', affected: 9, denominator: 10, ratePct: 90, basis: 'analysis_event' },
      { id: 'b', affected: 30, denominator: 100, ratePct: 30, basis: 'analysis_event' },
      { id: 'a', affected: 40, denominator: 100, ratePct: 40, basis: 'analysis_event' },
    ]);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'mali']);
    expect(out[2].sample).toBe('low');
  });

  it('event-count proxy ne smije postati najjaci signal ispred direktnog mjerenja', () => {
    const out = rankOpportunityRows([
      { id: 'proxy', affected: 80, denominator: 100, ratePct: 80, basis: 'event_count_proxy' },
      { id: 'manual', affected: 30, denominator: 100, ratePct: 30, basis: 'analysis_event' },
    ]);
    expect(out.map((x) => x.id)).toEqual(['manual', 'proxy']);
  });

  it('event-count proxy ide iza izravnog signala i kad ima veci postotak', () => {
    const out = rankOpportunityRows([
      { id: 'proxy', affected: 80, denominator: 100, ratePct: 80, basis: 'event_count_proxy' },
      { id: 'direct', affected: 30, denominator: 100, ratePct: 30, basis: 'analysis_event' },
    ]);
    expect(out.map((x) => x.id)).toEqual(['direct', 'proxy']);
    expect(out[0].evidence).toBe('direct');
    expect(out[1].evidence).toBe('proxy');
  });

  it('ne izmislja stopu kad je ratePct null', () => {
    const out = rankOpportunityRows([
      { id: 'nema', affected: 0, denominator: 0, ratePct: null, basis: 'analysis_event' },
    ]);
    expect(out[0]).toMatchObject({ ratePct: null, sample: 'low' });
  });
});


const BASE = {
  analysisCompletedEvents: 0,
  opportunityEvents: 0,
  structureGapItems: 0,
  structureBreakdownItems: 0,
  repairAttemptEvents: 0,
  repairNoOpSummaryEvents: 0,
  repairNoOpSummaryItems: 0,
  repairNoOpItems: 0,
  scopeParityMismatches: [],
};

describe('opportunityMeasurementHealth', () => {
  it('zeleno je samo kad neovisni brojači imaju exact parity', () => {
    expect(opportunityMeasurementHealth({
      ...BASE,
      analysisCompletedEvents: 100,
      opportunityEvents: 100,
      structureGapItems: 12,
      structureBreakdownItems: 12,
      repairAttemptEvents: 5,
      repairNoOpSummaryEvents: 5,
      repairNoOpSummaryItems: 7,
      repairNoOpItems: 7,
    })).toEqual({
      kind: 'healthy', analysis: 'healthy', repair: 'healthy',
      analysisDelta: 0, structureDelta: 0, repairNoOpDelta: 0, repairAttemptDelta: 0, scopeMismatches: 0,
    });
  });

  it('mismatch nije tiho zelen: označava nepotpuno mjerenje', () => {
    expect(opportunityMeasurementHealth({
      ...BASE,
      analysisCompletedEvents: 100,
      opportunityEvents: 97,
      structureGapItems: 12,
      structureBreakdownItems: 10,
      repairAttemptEvents: 5,
      repairNoOpSummaryEvents: 5,
      repairNoOpSummaryItems: 7,
      repairNoOpItems: 5,
    })).toMatchObject({ kind: 'partial', analysisDelta: -3, structureDelta: -2, repairNoOpDelta: -2 });
  });

  it('bez baznih analiza i repaira govori no-data, ne healthy', () => {
    expect(opportunityMeasurementHealth(BASE)).toMatchObject({ kind: 'no-data', analysis: 'no-data', repair: 'no-data' });
  });

  it('structure breakdown bez summary/baznih eventa je partial, ne no-data', () => {
    expect(opportunityMeasurementHealth({ ...BASE, structureBreakdownItems: 2 }))
      .toMatchObject({ kind: 'partial', analysis: 'partial', structureDelta: 2 });
  });

  it('repair no-op parity moze samostalno uciniti mjerenje partial', () => {
    expect(opportunityMeasurementHealth({
      ...BASE, repairAttemptEvents: 3, repairNoOpSummaryEvents: 3, repairNoOpSummaryItems: 4, repairNoOpItems: 3,
    })).toMatchObject({ kind: 'partial', repair: 'partial', repairNoOpDelta: -1 });
  });

  it('V3-02: uspjesan repair bez summaryja je partial i uz zdravu analizu', () => {
    expect(opportunityMeasurementHealth({
      ...BASE, analysisCompletedEvents: 1, opportunityEvents: 1, repairAttemptEvents: 1,
    })).toMatchObject({ kind: 'partial', analysis: 'healthy', repair: 'partial', repairAttemptDelta: -1 });
  });

  it('V3-01: ukupna parity uz scoped mismatch je partial', () => {
    expect(opportunityMeasurementHealth({
      ...BASE, analysisCompletedEvents: 1, opportunityEvents: 1, structureGapItems: 1, structureBreakdownItems: 1,
      scopeParityMismatches: [
        { surface: 'structure', profileId: 'A', workType: 'diplomski', summary: 1, breakdown: 0 },
        { surface: 'structure', profileId: 'B', workType: 'diplomski', summary: 0, breakdown: 1 },
      ],
    })).toMatchObject({ kind: 'partial', analysis: 'partial', scopeMismatches: 2 });
  });

  it('V3-03: repair-only prozor ne cini analizu zdravom', () => {
    expect(opportunityMeasurementHealth({ ...BASE, repairAttemptEvents: 1, repairNoOpSummaryEvents: 1 }))
      .toMatchObject({ kind: 'healthy', analysis: 'no-data', repair: 'healthy' });
  });
});

describe('strongestMeasuredOpportunity', () => {
  it('preskace redove bez nazivnika; bez ijednog izmjerenog reda nema signala', () => {
    const ranked = rankOpportunityRows([
      { id: 'prazno', affected: 0, denominator: 0, ratePct: null, basis: 'analysis_event' },
      { id: 'proxy', affected: 2, denominator: 4, ratePct: 50, basis: 'event_count_proxy' },
    ]);
    expect(strongestMeasuredOpportunity(ranked)?.id).toBe('proxy');
    expect(strongestMeasuredOpportunity(ranked.slice(0, 1))).toBeUndefined();
  });
});
