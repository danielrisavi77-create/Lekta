import { describe, expect, it } from 'vitest';
import { opportunityMeasurementHealth, rankOpportunityRows } from '../src/admin/opportunity-ranking';

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


describe('opportunityMeasurementHealth', () => {
  it('zeleno je samo kad neovisni brojači imaju exact parity', () => {
    expect(opportunityMeasurementHealth({
      analysisCompletedEvents: 100,
      opportunityEvents: 100,
      structureGapItems: 12,
      structureBreakdownItems: 12,
      repairNoOpSummaryEvents: 5,
      repairNoOpSummaryItems: 7,
      repairNoOpItems: 7,
    })).toEqual({ kind: 'healthy', analysisDelta: 0, structureDelta: 0, repairNoOpDelta: 0 });
  });

  it('mismatch nije tiho zelen: označava nepotpuno mjerenje', () => {
    expect(opportunityMeasurementHealth({
      analysisCompletedEvents: 100,
      opportunityEvents: 97,
      structureGapItems: 12,
      structureBreakdownItems: 10,
      repairNoOpSummaryEvents: 5,
      repairNoOpSummaryItems: 7,
      repairNoOpItems: 5,
    })).toEqual({ kind: 'partial', analysisDelta: -3, structureDelta: -2, repairNoOpDelta: -2 });
  });

  it('bez baznih analiza govori no-data, ne healthy', () => {
    expect(opportunityMeasurementHealth({
      analysisCompletedEvents: 0,
      opportunityEvents: 0,
      structureGapItems: 0,
      structureBreakdownItems: 0,
      repairNoOpSummaryEvents: 0,
      repairNoOpSummaryItems: 0,
      repairNoOpItems: 0,
    }).kind).toBe('no-data');
  });

  it('repair no-op parity moze samostalno uciniti mjerenje partial', () => {
    expect(opportunityMeasurementHealth({
      analysisCompletedEvents: 0,
      opportunityEvents: 0,
      structureGapItems: 0,
      structureBreakdownItems: 0,
      repairNoOpSummaryEvents: 3,
      repairNoOpSummaryItems: 4,
      repairNoOpItems: 3,
    })).toEqual({ kind: 'partial', analysisDelta: 0, structureDelta: 0, repairNoOpDelta: -1 });
  });
});
