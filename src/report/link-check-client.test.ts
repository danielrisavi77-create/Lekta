import { describe, expect, it, vi } from 'vitest';
import { checkLinks } from './link-check-client';

describe('link check client', () => {
  it('šalje samo URL-ove i ograničava duplikate', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [], warnings: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await checkLinks('/api/link-check', ['https://example.org', 'https://example.org', 'javascript:alert(1)']);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ urls: ['https://example.org'] });
    vi.unstubAllGlobals();
  });
});
