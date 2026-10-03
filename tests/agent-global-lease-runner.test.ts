// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  buildImplementerEnvironment,
  validateGlobalLeaseSync,
} from '../scripts/agents/global-lease-runner.mjs';

const ENV = {
  LEKTA_GLOBAL_LEASE_ENFORCED: '1',
  LEKTA_GLOBAL_LEASE_ID: '123e4567-e89b-42d3-a456-426614174000',
  LEKTA_GLOBAL_LEASE_TOKEN: 'lease-token-' + 'x'.repeat(32),
  LEKTA_SESSION_NAME: 'lekta-03',
  LEKTA_CONTROL_PLANE_URL: 'https://control.example/functions/v1/lekta-control-plane',
  LEKTA_CONTROL_PLANE_ADMIN_TOKEN: 'admin-secret',
};

describe('global lease runner adapter', () => {
  it('worker env zadrzava lease capability, ali uklanja admin token', () => {
    const env = buildImplementerEnvironment(ENV, {
      taskId: 'T99',
      scopeEnforced: true,
      baseSha: 'a'.repeat(40),
    });
    expect(env.LEKTA_CONTROL_PLANE_ADMIN_TOKEN).toBeUndefined();
    expect(env.LEKTA_GLOBAL_LEASE_TOKEN).toBe(ENV.LEKTA_GLOBAL_LEASE_TOKEN);
    expect(env.LEKTA_GLOBAL_LEASE_ID).toBe(ENV.LEKTA_GLOBAL_LEASE_ID);
    expect(env.LEKTA_GLOBAL_LEASE_BASE_SHA).toBe('a'.repeat(40));
    expect(env.LEKTA_ROLE).toBe('implementer');
    expect(env.LEKTA_TASK_ID).toBe('T99');
    expect(env.LEKTA_SCOPE_ENFORCED).toBe('1');
  });

  it('disabled enforcement ne pokrece validate child proces', () => {
    const spawn = vi.fn();
    expect(validateGlobalLeaseSync({
      root: '/repo',
      taskId: 'T99',
      baseSha: 'a'.repeat(40),
      env: {},
      spawn,
    })).toEqual({ enforced: false, leaseId: null, expiresAt: null });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('validate child proces ne dobiva admin token niti capability kroz argv', () => {
    const spawn = vi.fn(() => ({
      status: 0,
      stdout: JSON.stringify({
        protocolVersion: 1,
        ok: true,
        leaseId: ENV.LEKTA_GLOBAL_LEASE_ID,
        expiresAt: '2026-10-02T22:00:00Z',
      }),
      stderr: '',
    }));

    expect(validateGlobalLeaseSync({
      root: '/repo',
      taskId: 'T99',
      baseSha: 'a'.repeat(40),
      env: ENV,
      spawn,
    })).toEqual({
      enforced: true,
      leaseId: ENV.LEKTA_GLOBAL_LEASE_ID,
      expiresAt: '2026-10-02T22:00:00Z',
    });

    const [, args, options] = spawn.mock.calls[0];
    expect(args).toContain('validate');
    expect(args).toContain(ENV.LEKTA_GLOBAL_LEASE_ID);
    expect(args).not.toContain(ENV.LEKTA_GLOBAL_LEASE_TOKEN);
    expect(options.env.LEKTA_CONTROL_PLANE_ADMIN_TOKEN).toBeUndefined();
    expect(options.env.LEKTA_GLOBAL_LEASE_TOKEN).toBe(ENV.LEKTA_GLOBAL_LEASE_TOKEN);
  });

  it('validation failure je blocker, ne warning', () => {
    const spawn = vi.fn(() => ({
      status: 1,
      stdout: '',
      stderr: '[agents:lease] Control-plane lease_expired: Lease vise nije aktivan.\n',
    }));
    expect(() => validateGlobalLeaseSync({
      root: '/repo',
      taskId: 'T99',
      baseSha: 'a'.repeat(40),
      env: ENV,
      spawn,
    })).toThrow(/lease_expired/);
  });
});
