import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(import.meta.dirname, '..', 'supabase', 'migrations', '0069_attach_agent_payloads.sql'),
  'utf8',
);

describe('agent payload attachment contract', () => {
  it('binds only unassigned, live payload metadata to an owned active run', () => {
    expect(migration).toContain('create or replace function public.attach_agent_payloads_to_run');
    expect(migration).toContain('m.run_id is null or not exists');
    expect(migration).toContain("r.status in ('pending', 'running', 'paused')");
    expect(migration).toContain('m.expires_at > now()');
    expect(migration).toContain('m.material_id = any');
  });

  it('keeps the function behind authenticated/service-role grants', () => {
    expect(migration).toContain('revoke all on function public.attach_agent_payloads_to_run');
    expect(migration).toContain('to authenticated, service_role');
    expect(migration).not.toMatch(/insert into public\.agent_payload_manifests/i);
  });
});
