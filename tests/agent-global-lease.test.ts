// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  buildGlobalLeaseValidation,
  globalLeaseEnforced,
  scrubControlPlaneAdminToken,
  validateGlobalLease,
} from '../scripts/agents/global-lease.mjs';

const TASK = {
  id: 'T99',
  status: 'in_progress',
  workScope: {
    read: ['src/read/**'],
    write: ['src/ui/**'],
    forbidden: ['src/ui/secrets.ts'],
  },
};

const ENV = {
  LEKTA_GLOBAL_LEASE_ENFORCED: '1',
  LEKTA_GLOBAL_LEASE_ID: '123e4567-e89b-42d3-a456-426614174000',
  LEKTA_GLOBAL_LEASE_TOKEN: 'x'.repeat(48),
  LEKTA_SESSION_NAME: 'lekta-03',
  LEKTA_GLOBAL_LEASE_BASE_SHA: 'a'.repeat(40),
  LEKTA_CONTROL_PLANE_URL: 'https://control.example/functions/v1/lekta-control-plane',
  LEKTA_CONTROL_PLANE_ADMIN_TOKEN: 'admin-secret',
};

describe('global lease worker boundary', () => {
  it('enforcement je opt-in', () => {
    expect(globalLeaseEnforced({})).toBe(false);
    expect(globalLeaseEnforced({ LEKTA_GLOBAL_LEASE_ENFORCED: '1' })).toBe(true);
  });

  it('admin token se nikad ne prosljedjuje workeru', () => {
    const safe = scrubControlPlaneAdminToken(ENV);
    expect(safe.LEKTA_CONTROL_PLANE_ADMIN_TOKEN).toBeUndefined();
    expect(safe.LEKTA_GLOBAL_LEASE_TOKEN).toBe(ENV.LEKTA_GLOBAL_LEASE_TOKEN);
    expect(safe.LEKTA_GLOBAL_LEASE_ID).toBe(ENV.LEKTA_GLOBAL_LEASE_ID);
  });

  it('gradi validation identitet iz taska, sessiona i lease base SHA-a', () => {
    const payload = buildGlobalLeaseValidation({ env: ENV, task: TASK });
    expect(payload).toMatchObject({
      leaseId: ENV.LEKTA_GLOBAL_LEASE_ID,
      taskId: 'T99',
      sessionName: 'lekta-03',
      baseSha: 'a'.repeat(40),
    });
    expect(payload?.scopeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('explicitni baseSha runnera ima prednost nad env fallbackom', () => {
    const payload = buildGlobalLeaseValidation({
      env: ENV,
      task: TASK,
      baseSha: 'b'.repeat(40),
    });
    expect(payload?.baseSha).toBe('b'.repeat(40));
  });

  it('fail-closed baca ako enforcement nema lease identitet', () => {
    expect(() => buildGlobalLeaseValidation({
      env: { ...ENV, LEKTA_GLOBAL_LEASE_ID: '' },
      task: TASK,
    })).toThrow(/leaseId/);
    expect(() => buildGlobalLeaseValidation({
      env: { ...ENV, LEKTA_SESSION_NAME: '' },
      task: TASK,
    })).toThrow(/sessionName/);
  });

  it('remote validation vraca samo nesenzitivni status', async () => {
    const request = vi.fn(async (payload) => ({
      protocolVersion: 1,
      ok: true,
      leaseId: payload.leaseId,
      expiresAt: '2026-10-02T22:00:00Z',
    }));
    await expect(validateGlobalLease({
      env: ENV,
      task: TASK,
      request,
    })).resolves.toEqual({
      enforced: true,
      leaseId: ENV.LEKTA_GLOBAL_LEASE_ID,
      expiresAt: '2026-10-02T22:00:00Z',
    });
    expect(JSON.stringify(request.mock.calls)).not.toContain('admin-secret');
  });

  it('disabled enforcement ne radi nikakav network poziv', async () => {
    const request = vi.fn();
    await expect(validateGlobalLease({
      env: {},
      task: TASK,
      request,
    })).resolves.toEqual({ enforced: false, leaseId: null, expiresAt: null });
    expect(request).not.toHaveBeenCalled();
  });
});
