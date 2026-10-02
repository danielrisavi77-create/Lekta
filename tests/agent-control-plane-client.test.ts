// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildLeaseClaim,
  controlPlaneConfigFromEnv,
  requestControlPlane,
} from '../scripts/agents/control-plane-client.mjs';

describe('agent control-plane config', () => {
  it('trazi URL i admin token', () => {
    expect(() => controlPlaneConfigFromEnv({})).toThrow(/LEKTA_CONTROL_PLANE_URL/);
    expect(() => controlPlaneConfigFromEnv({
      LEKTA_CONTROL_PLANE_URL: 'https://control.example/functions/v1/lease',
    })).toThrow(/LEKTA_CONTROL_PLANE_ADMIN_TOKEN/);
  });

  it('za udaljeni endpoint zahtijeva HTTPS, a localhost moze HTTP', () => {
    expect(() => controlPlaneConfigFromEnv({
      LEKTA_CONTROL_PLANE_URL: 'http://control.example/lease',
      LEKTA_CONTROL_PLANE_ADMIN_TOKEN: 'secret',
    })).toThrow(/HTTPS/);

    expect(controlPlaneConfigFromEnv({
      LEKTA_CONTROL_PLANE_URL: 'http://127.0.0.1:54321/functions/v1/lease',
      LEKTA_CONTROL_PLANE_ADMIN_TOKEN: 'secret',
    })).toEqual({
      baseUrl: 'http://127.0.0.1:54321/functions/v1/lease',
      adminToken: 'secret',
    });
  });
});

describe('global lease claim contract', () => {
  const base = {
    task: {
      id: 'T01',
      workScope: {
        read: ['src/z.ts', 'src/a.ts'],
        write: ['tests/x.test.ts', 'src/ui/**'],
        forbidden: ['supabase/**'],
      },
    },
    sessionName: 'lekta-03',
    baseSha: 'A'.repeat(40),
    ttlSeconds: 900,
    branch: 'agent/t01',
    environmentKind: 'anthropic_cloud',
  };

  it('normalizira scope i daje deterministicki hash', () => {
    const first = buildLeaseClaim(base);
    const second = buildLeaseClaim({
      ...base,
      task: {
        ...base.task,
        workScope: {
          read: ['src/a.ts', 'src/z.ts'],
          write: ['src/ui/**', 'tests/x.test.ts'],
          forbidden: ['supabase/**'],
        },
      },
    });

    expect(first).toMatchObject({
      taskId: 'T01',
      sessionName: 'lekta-03',
      baseSha: 'a'.repeat(40),
      ttlSeconds: 900,
      scope: {
        read: ['src/a.ts', 'src/z.ts'],
        write: ['src/ui/**', 'tests/x.test.ts'],
        forbidden: ['supabase/**'],
      },
      metadata: {
        branch: 'agent/t01',
        environmentKind: 'anthropic_cloud',
      },
    });
    expect(first.scopeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.scopeHash).toBe(first.scopeHash);
  });

  it('odbija claim bez write scopea ili s nevaljanim identitetom/TTL-om', () => {
    expect(() => buildLeaseClaim({
      ...base,
      task: { id: 'T01', workScope: { read: ['src/**'] } },
    })).toThrow(/workScope\.write/);
    expect(() => buildLeaseClaim({ ...base, sessionName: 'lekta 03' })).toThrow(/sessionName/);
    expect(() => buildLeaseClaim({ ...base, baseSha: 'abc' })).toThrow(/40/);
    expect(() => buildLeaseClaim({ ...base, ttlSeconds: 30 })).toThrow(/120 do 3600/);
  });
});

describe('control-plane HTTP boundary', () => {
  const config = {
    baseUrl: 'https://control.example/functions/v1/lekta-control-plane',
    adminToken: 'top-secret-token',
  };

  it('salje samo POST JSON i token u zaglavlju', async () => {
    let seen: { url?: unknown; init?: RequestInit } = {};
    const fakeFetch = async (url: unknown, init?: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ ok: true, leaseId: 'lease-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const result = await requestControlPlane('claim', { taskId: 'T01' }, {
      config,
      fetchImpl: fakeFetch as typeof fetch,
    });

    expect(result).toEqual({ ok: true, leaseId: 'lease-1' });
    expect(seen.url).toBe(config.baseUrl);
    expect(seen.init?.method).toBe('POST');
    expect(seen.init?.headers).toMatchObject({
      'content-type': 'application/json',
      'x-lekta-control-token': config.adminToken,
    });
    expect(JSON.parse(String(seen.init?.body))).toEqual({
      protocolVersion: 1,
      operation: 'claim',
      payload: { taskId: 'T01' },
    });
  });

  it('fail-closed odbija backend gresku i redaktira token', async () => {
    const fakeFetch = async () => new Response(JSON.stringify({
      ok: false,
      code: 'lease_conflict',
      message: `token ${config.adminToken} ne smije izaci`,
    }), { status: 409 });

    let message = '';
    try {
      await requestControlPlane('claim', {}, { config, fetchImpl: fakeFetch as typeof fetch });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('lease_conflict');
    expect(message).toContain('[REDACTED]');
    expect(message).not.toContain(config.adminToken);
  });

  it('odbija nevaljan JSON i odgovor bez ok=true', async () => {
    await expect(requestControlPlane('health', {}, {
      config,
      fetchImpl: (async () => new Response('nije-json', { status: 200 })) as typeof fetch,
    })).rejects.toThrow(/nevaljan JSON/);

    await expect(requestControlPlane('health', {}, {
      config,
      fetchImpl: (async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 })) as typeof fetch,
    })).rejects.toThrow(/ok=true/);
  });
});
