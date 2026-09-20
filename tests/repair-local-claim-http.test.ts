import { describe, expect, it } from 'vitest';

import { handleLocalRepairClaimHttp } from '../src/repair/local-runner/claim-http.ts';

describe('local repair claim HTTP', () => {
  it('vraca 409 bez bearer tokena i zabranjuje cache kada posao vise nije claimable', async () => {
    const claimToken = 'A'.repeat(43);
    let received: unknown = null;
    const response = await handleLocalRepairClaimHttp(new Request('https://edge/repair-local-claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jobId: '33333333-3333-4333-8333-333333333333',
        claimToken,
        devicePublicKeySpki: 'B'.repeat(122),
      }),
    }), {
      claim: async (input) => {
        received = input;
        return { ok: false, code: 'not-claimable' };
      },
    });

    const text = await response.text();
    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(text)).toEqual({ error: 'not_claimable' });
    expect(text).not.toContain(claimToken);
    expect(received).toEqual({
      jobId: '33333333-3333-4333-8333-333333333333',
      claimToken,
      devicePublicKeySpki: 'B'.repeat(122),
    });
  });

  it('pretvara backend kvar u genericki 500 bez curenja claim tokena', async () => {
    const claimToken = 'C'.repeat(43);
    const response = await handleLocalRepairClaimHttp(new Request('https://edge/repair-local-claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jobId: '33333333-3333-4333-8333-333333333333',
        claimToken,
        devicePublicKeySpki: 'D'.repeat(122),
      }),
    }), {
      claim: async () => {
        throw new Error(`database unavailable for ${claimToken}`);
      },
    });

    const text = await response.text();
    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(text)).toEqual({ error: 'internal' });
    expect(text).not.toContain(claimToken);
  });

  it('odbija JSON veci od 64 KiB prije claim logike i ne vraca bearer token', async () => {
    const claimToken = 'E'.repeat(43);
    let claimCalls = 0;
    const body = JSON.stringify({
      jobId: '33333333-3333-4333-8333-333333333333',
      claimToken,
      devicePublicKeySpki: 'F'.repeat(122),
      padding: 'x'.repeat(64 * 1024),
    });
    const response = await handleLocalRepairClaimHttp(new Request('https://edge/repair-local-claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }), {
      claim: async () => {
        claimCalls += 1;
        return { ok: false, code: 'not-claimable' };
      },
    });

    const text = await response.text();
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(text)).toEqual({ error: 'bad_request' });
    expect(text).not.toContain(claimToken);
    expect(claimCalls).toBe(0);
  });

  it('prekida chunked tijelo bez Content-Length cim prijedje 64 KiB', async () => {
    let pulls = 0;
    let cancelled = false;
    let claimCalls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(40 * 1024).fill(0x78));
        if (pulls >= 4) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request('https://edge/repair-local-claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    expect(request.headers.get('content-length')).toBeNull();

    const response = await handleLocalRepairClaimHttp(request, {
      claim: async () => {
        claimCalls += 1;
        return { ok: false, code: 'not-claimable' };
      },
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bad_request' });
    expect(claimCalls).toBe(0);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(4);
  });
});
