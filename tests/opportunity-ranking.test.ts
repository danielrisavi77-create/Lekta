import { describe, expect, it } from 'vitest';
import { rankOpportunityRows } from '../src/admin/opportunity-ranking';

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

  it('ne izmislja stopu kad je ratePct null', () => {
    const out = rankOpportunityRows([
      { id: 'nema', affected: 0, denominator: 0, ratePct: null, basis: 'analysis_event' },
    ]);
    expect(out[0]).toMatchObject({ ratePct: null, sample: 'low' });
  });
});
