import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(import.meta.dirname, '..', 'supabase', 'migrations', '0082_replace_agent_payloads_for_run.sql'),
  'utf8',
);

describe('atomic agent payload replacement contract', () => {
  it('validates the complete requested set before mutating the run selection', () => {
    expect(migration).toContain('create or replace function public.replace_agent_payloads_for_run');
    expect(migration).toContain('count(*)');
    expect(migration).toContain('raise exception');
    expect(migration).toContain("m.run_id = p_run_id");
    expect(migration).toContain("set run_id = null");
  });

  it('never detaches the run context or generated result payloads', () => {
    expect(migration).toContain("m.material_id <> 'run-context'");
    expect(migration).toContain("m.material_id not like 'agent-result:%'");
  });

  it('keeps the replacement RPC owner and role scoped', () => {
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain('revoke all on function public.replace_agent_payloads_for_run');
    expect(migration).toContain('to authenticated, service_role');
  });

  it('locks the run and requested payload rows before checking eligibility', () => {
    expect(migration).toMatch(/from public\.agent_runs[\s\S]*for update/);
    expect(migration).toMatch(/from public\.agent_payload_manifests[\s\S]*for update/);
  });
});
