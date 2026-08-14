import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const migrationPath = join(
  ROOT,
  'supabase',
  'migrations',
  '0073_harden_katedra_agent_resume_scope.sql',
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('resume_agent_run entitlement contract', () => {
  it('ships an authoritative migration that replaces the direct resume RPC', () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toContain('create or replace function public.resume_agent_run');
  });

  it('requires the paused run owner, locked project and exact active unexpired Pass in the UPDATE path', () => {
    expect(migration).toMatch(/where r\.run_id = p_run_id\s+and r\.user_id = p_user_id\s+and r\.status = 'paused'/);
    expect(migration).toMatch(/from public\.katedra_project_locks l\s+where l\.project_id = r\.project_id\s+and l\.user_id = r\.user_id\s+and l\.status = 'locked'/);
    expect(migration).toMatch(/from public\.entitlements e\s+where e\.user_id = r\.user_id\s+and e\.academic_project_id = r\.project_id\s+and e\.product_id = \('katedra_pass_' \|\| l\.product_key\)\s+and e\.status = 'active'\s+and e\.purchase_expires_at > now\(\)/);
  });

  it('keeps direct authenticated callers and service_role callers explicitly authorized', () => {
    expect(migration).toContain("coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'");
    expect(migration).toMatch(/language plpgsql\s+security definer\s+set search_path = public, pg_temp/);
    expect(migration).toContain('revoke all on function public.resume_agent_run(uuid, uuid)');
    expect(migration).toContain('from public, anon;');
    expect(migration).toContain('grant execute on function public.resume_agent_run(uuid, uuid)');
    expect(migration).toContain('to authenticated, service_role;');
  });
});
