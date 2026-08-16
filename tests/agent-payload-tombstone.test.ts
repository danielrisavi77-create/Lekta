import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(import.meta.dirname, '..', 'supabase', 'migrations', '0077_agent_payload_tombstone.sql'),
  'utf8',
);
const listingMigration = readFileSync(
  join(import.meta.dirname, '..', 'supabase', 'migrations', '0080_list_active_agent_payloads.sql'),
  'utf8',
);

describe('agent payload tombstone contract', () => {
  it('marks an owned manifest deleted and returns storage paths for cleanup', () => {
    expect(migration).toContain('create or replace function public.tombstone_agent_payload');
    expect(migration).toContain('p_user_id uuid');
    expect(migration).toContain('p_project_id uuid');
    expect(migration).toContain('p_material_id text');
    expect(migration).toContain('for update');
    expect(migration).toContain('set deleted_at = coalesce(m.deleted_at, now())');
    expect(migration).toContain('storage_bucket');
    expect(migration).toContain('storage_path');
    expect(migration).toContain('manifest_path');
  });

  it('defines an explicit policy for materials attached to active runs', () => {
    expect(migration).toContain("status in ('initializing', 'pending', 'running', 'paused')");
    expect(migration).toContain('Cannot delete a material attached to an active agent run');
    expect(migration).toContain('revoke all on function public.tombstone_agent_payload');
    expect(migration).toContain('grant execute on function public.tombstone_agent_payload');
  });

  it('active material list is canonical and excludes tombstoned or expired manifests', () => {
    expect(listingMigration).toContain('create or replace function public.list_active_agent_payloads');
    expect(listingMigration).toContain('m.deleted_at is null');
    expect(listingMigration).toContain('m.expires_at > now()');
    expect(listingMigration).toContain("m.material_id <> 'run-context'");
    expect(listingMigration).toContain("m.material_id not like 'agent-result:%'");
    expect(listingMigration).toContain('e.product_id = (\'katedra_pass_\' || l.product_key)');
    expect(listingMigration).toContain('grant execute on function public.list_active_agent_payloads');
  });
});
