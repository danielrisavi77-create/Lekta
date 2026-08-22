import { describe, expect, it } from 'vitest';
import { sanitizeEventData } from '../src/analytics/event-sanitizer';

describe('sanitizeEventData', () => {
  it('zadrzava samo postojece dopustene primitivne telemetry podatke', () => {
    const data = {
      event: 'payload_event', package: 'format', profileId: 'fpzg', workType: 'diplomski',
      scoreBand: '80-89', provider: 'stripe', source: 'json', total: 12, found: 8,
      missing: 2, flagged: 1, checked: 10, profileStatus: 'verified', pick: 'all',
      sizeBucket: 'small', category: 'formatting', issueCount: 4, kind: 'repair',
      manual: true, count: 3, score: 87, demo: false, method: 'upload', product: 'pro',
      ruleId: 'page-margins', changes: 2, stored: 1, ms: 250,
      fileName: 'diplomski-rad.docx', document: 'sadrzaj dokumenta', text: 'autorski tekst',
      excerpt: 'isjecak', citation: 'Horvat, 2026.', bytes: new Uint8Array([1, 2, 3]),
      nested: { score: 100 }, items: ['ne salji'], unexpected: 'ne salji',
    };

    expect(sanitizeEventData(data)).toEqual({
      event: 'payload_event', package: 'format', profileId: 'fpzg', workType: 'diplomski',
      scoreBand: '80-89', provider: 'stripe', source: 'json', total: 12, found: 8,
      missing: 2, flagged: 1, checked: 10, profileStatus: 'verified', pick: 'all',
      sizeBucket: 'small', category: 'formatting', issueCount: 4, kind: 'repair',
      manual: true, count: 3, score: 87, demo: false, method: 'upload', product: 'pro',
      ruleId: 'page-margins', changes: 2, stored: 1, ms: 250,
    });
  });

  it('odbacuje dopusteni kljuc kada vrijednost nije primitivna', () => {
    expect(sanitizeEventData({ score: { value: 87 }, manual: ['true'], package: null })).toEqual({});
  });
});
