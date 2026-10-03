// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schemaPath = resolve('ops/agent-control-plane/schema.sql');
const sql = readFileSync(schemaPath, 'utf8');

describe('agent control-plane SQL contract', () => {
  it('ostaje izvan produkcijskog Supabase migration stabla', () => {
    expect(schemaPath.replace(/\\/g, '/')).toContain('/ops/agent-control-plane/schema.sql');
    expect(schemaPath.replace(/\\/g, '/')).not.toContain('/supabase/migrations/');
  });

  it('ima zatvorene dollar-quoted function blokove bez ostataka patcha', () => {
    const functionCount = (sql.match(/create or replace function agent_control\./g) ?? []).length;
    const opens = (sql.match(/\nas \$\$\n/g) ?? []).length;
    const closes = (sql.match(/\n\$\$;/g) ?? []).length;

    expect(functionCount).toBe(16);
    expect(opens).toBe(functionCount);
    expect(closes).toBe(functionCount);
    expect(sql).not.toMatch(/\nas \$\n/);
    expect(sql).not.toContain('(payload jsonb)\nreturns jsonb\nlanguage plpgsql\nsecurity invoker\nset search_path = \'\'\nas $\n');
  });

  it('serializira sve write mutacije transakcijskim advisory lockom', () => {
    expect((sql.match(/pg_advisory_xact_lock\(1279341101\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(sql).toContain('agent_leases_one_active_task_idx');
    expect(sql).toContain('agent_leases_one_active_session_idx');
  });

  it('privatna schema nema javne grantove ni security definer funkcije', () => {
    expect(sql).toContain('revoke all on schema agent_control from public, anon, authenticated, service_role;');
    expect(sql).toContain('create table if not exists agent_control.control_settings');
    expect(sql).toContain('alter table agent_control.control_settings enable row level security;');
    expect(sql).toContain('alter table agent_control.agent_sessions enable row level security;');
    expect(sql).toContain('alter table agent_control.agent_leases enable row level security;');
    expect(sql).toContain('alter table agent_control.agent_path_leases enable row level security;');
    expect(sql).toContain('alter table agent_control.agent_events enable row level security;');
    expect(sql).toContain('revoke execute on all functions in schema agent_control from public, anon, authenticated, service_role;');
    expect(sql.toLowerCase()).not.toContain('security definer');
    expect(sql.toLowerCase()).not.toMatch(/\bgrant\s+(select|insert|update|delete|execute|usage)\b/);
  });

  it('implementira potrebne lifecycle operacije i write konflikt', () => {
    for (const fn of [
      'register_session',
      'heartbeat_session',
      'claim_lease',
      'renew_lease',
      'expand_lease',
      'release_lease',
      'validate_lease',
      'snapshot_state',
      'dispatch',
    ]) {
      expect(sql).toContain(`function agent_control.${fn}`);
    }
    expect(sql).toContain("'lease_conflict'");
    expect(sql).toContain("'task_busy'");
    expect(sql).toContain("'session_busy'");
    expect(sql).toContain("'lease_requires_expand'");
    expect(sql).toContain("'session_identity_conflict'");
    expect(sql).toContain("'lease_capability_mismatch'");
    expect(sql).toContain("'lease_validation_mismatch'");
    expect(sql).toContain('capability_hash text not null');
    expect(sql).toContain("'metadata', l.metadata");
  });

  it('capability hash ostaje privatan i validate koristi isti koordinacijski lock', () => {
    const validateStart = sql.indexOf('function agent_control.validate_lease');
    const snapshotStart = sql.indexOf('function agent_control.snapshot_state');
    const validateBlock = sql.slice(validateStart, snapshotStart);
    const snapshotEnd = sql.indexOf('function agent_control.dispatch');
    const snapshotBlock = sql.slice(snapshotStart, snapshotEnd);

    expect(validateBlock).toContain('v_capability_hash');
    expect(validateBlock).toContain('language plpgsql\nstable\nsecurity invoker');
    expect(validateBlock).not.toContain('pg_advisory_xact_lock(1279341101)');
    expect(sql).toContain('agent_leases_one_active_capability_idx');
    expect(snapshotBlock).not.toContain("'capabilityHash'");
    expect(snapshotBlock).not.toContain('capability_hash');
  });

  it('path overlap ne koristi LIKE nad korisnickom putanjom', () => {
    const start = sql.indexOf('function agent_control.paths_overlap');
    const end = sql.indexOf('function agent_control.canonical_scope_valid');
    const overlap = sql.slice(start, end);
    expect(overlap).not.toMatch(/\blike\b/i);
    expect(overlap).toContain("left(a_root, length(b_root) + 1) = b_root || '/'");
    expect(overlap).toContain("left(b_root, length(a_root) + 1) = a_root || '/'");
  });

  it('backend odbija nekanonske apsolutne i trailing-slash scopeove', () => {
    const start = sql.indexOf('function agent_control.valid_scope_pattern');
    const end = sql.indexOf('function agent_control.scope_root');
    const validator = sql.slice(start, end);
    expect(validator).toContain("left(value, 2) = './'");
    expect(validator).toContain("value ~ '^[A-Za-z]:/'");
    expect(validator).toContain("right(value, 1) = '/'");
  });
});
