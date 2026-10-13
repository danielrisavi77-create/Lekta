// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { observe } from '../scripts/post-deploy-smoke.mjs';

describe('post-deploy-smoke: network retry', () => {
  it('retries one fetch network failure and reports that the retry recovered', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    const result = await observe('https://example.test/asset.js', {}, { fetchImpl, sleepImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(200);
    expect(result.text).toBe('ok');
    expect(result.retries).toBe(1);
  });

  it('does not retry an HTTP error response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    const result = await observe('https://example.test/asset.js', {}, { fetchImpl, sleepImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl).not.toHaveBeenCalled();
    expect(result.status).toBe(503);
    expect(result.retries).toBe(0);
  });

  it('does not retry a non-network TypeError', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Invalid URL'));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    const result = await observe('not-a-url', {}, { fetchImpl, sleepImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl).not.toHaveBeenCalled();
    expect(result.transport).toBe('Invalid URL');
    expect(result.retries).toBe(0);
  });

  it('stops after the single retry if the network error repeats', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    const result = await observe('https://example.test/asset.js', {}, { fetchImpl, sleepImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledTimes(1);
    expect(result.transport).toBe('fetch failed');
    expect(result.retries).toBe(1);
  });
});
