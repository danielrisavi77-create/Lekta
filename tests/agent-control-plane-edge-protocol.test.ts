// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLeaseClaim } from '../scripts/agents/control-plane-client.mjs';
import {
  PROTOCOL_VERSION,
  canonicalScopeJson,
  payloadScopeHashValid,
  sha256Hex,
  statusForControlResult,
  timingSafeTokenHashMatch,
  validateEnvelope,
} from '../ops/agent-control-plane/function/protocol.ts';

const edgeSource = readFileSync(resolve('ops/agent-control-plane/function/index.ts'), 'utf8');

describe('agent control-plane edge protocol', () => {
  it('prihvaca samo protocolVersion 1 i poznate operacije', () => {
    expect(validateEnvelope({
      protocolVersion: PROTOCOL_VERSION,
      operation: 'claim',
      payload: {},
    })).toMatchObject({ ok: true, operation: 'claim' });

    expect(validateEnvelope({
      protocolVersion: PROTOCOL_VERSION,
      operation: 'validate',
      payload: {},
    })).toMatchObject({ ok: true, operation: 'validate' });

    expect(validateEnvelope({
      protocolVersion: 2,
      operation: 'claim',
      payload: {},
    })).toMatchObject({ ok: false, code: 'protocol_mismatch' });

    expect(validateEnvelope({
      protocolVersion: PROTOCOL_VERSION,
      operation: 'destroy',
      payload: {},
    })).toMatchObject({ ok: false, code: 'unknown_operation' });
  });

  it('2A claim hash prolazi 2B backend kanonizaciju', async () => {
    const claim = buildLeaseClaim({
      task: {
        id: 'T42',
        status: 'ready',
        workScope: {
          read: ['src/z.ts', 'src/a.ts'],
          write: ['tests/x.test.ts', 'src/ui/**'],
          forbidden: ['supabase/**'],
        },
      },
      sessionName: 'lekta-03',
      baseSha: 'a'.repeat(40),
    });

    expect(await payloadScopeHashValid(claim)).toBe(true);
    expect(canonicalScopeJson(claim.scope)).toBe(JSON.stringify({
      read: ['src/a.ts', 'src/z.ts'],
      write: ['src/ui/**', 'tests/x.test.ts'],
      forbidden: ['supabase/**'],
    }));
    expect(claim.scopeHash).toBe(await sha256Hex(canonicalScopeJson(claim.scope)!));
  });

  it('odbija izmijenjeni scope uz stari hash', async () => {
    const claim = buildLeaseClaim({
      task: {
        id: 'T42',
        status: 'in_progress',
        workScope: { write: ['src/ui/**'] },
      },
      sessionName: 'lekta-03',
      baseSha: 'b'.repeat(40),
    });
    const tampered = {
      ...claim,
      scope: { ...claim.scope, write: ['src/repair/**'] },
    };
    expect(await payloadScopeHashValid(tampered)).toBe(false);
  });

  it('token usporedba radi prema pohranjenom SHA-256 hashu', async () => {
    const hash = await sha256Hex('abc');
    expect(await timingSafeTokenHashMatch('abc', hash)).toBe(true);
    expect(await timingSafeTokenHashMatch('abd', hash)).toBe(false);
    expect(await timingSafeTokenHashMatch(null, hash)).toBe(false);
    expect(await timingSafeTokenHashMatch('abc', 'nije-hash')).toBe(false);
  });

  it('ne koristi Supabase admin kljuc kao control-plane credential', () => {
    expect(edgeSource).toContain("agent_control.control_settings");
    expect(edgeSource).toContain("admin_token_sha256");
    expect(edgeSource).toContain("x-lekta-lease-token");
    expect(edgeSource).toContain("agent_control.validate_lease");
    expect(edgeSource).not.toContain('SUPABASE_SECRET_KEYS');
    expect(edgeSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('mapira konflikt i malformed backend odgovor na odgovarajuci HTTP status', () => {
    expect(statusForControlResult({ protocolVersion: 1, ok: true })).toBe(200);
    expect(statusForControlResult({ protocolVersion: 1, ok: false, code: 'lease_conflict' })).toBe(409);
    expect(statusForControlResult({ protocolVersion: 1, ok: false, code: 'lease_not_found' })).toBe(404);
    expect(statusForControlResult({ protocolVersion: 1, ok: false, code: 'session_identity_conflict' })).toBe(409);
    expect(statusForControlResult({ protocolVersion: 1, ok: false, code: 'lease_capability_mismatch' })).toBe(409);
    expect(statusForControlResult({ protocolVersion: 1, ok: false, code: 'lease_validation_mismatch' })).toBe(403);
    expect(statusForControlResult({ ok: true })).toBe(502);
  });
});
