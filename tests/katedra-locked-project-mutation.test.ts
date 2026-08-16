import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(import.meta.dirname, '..', 'supabase', 'migrations', '0085_guard_locked_project_mutations.sql'),
  'utf8',
);

describe('locked Katedra project mutation contract', () => {
  it('guards both compatibility and canonical project writes at database level', () => {
    expect(migration).toContain('create or replace function public.prevent_locked_katedra_project_identity_change');
    expect(migration).toContain('create trigger katedra_projects_locked_identity_guard');
    expect(migration).toContain('create trigger academic_projects_locked_identity_guard');
    expect(migration).toContain("new.topic is distinct from old.topic");
    expect(migration).toContain("new.work_type_canonical is distinct from old.work_type_canonical");
    expect(migration).toContain("new.work_type is distinct from old.work_type");
    expect(migration).toContain("raise exception 'Locked Katedra project identity is immutable'");
    expect(migration).toContain("using errcode = '23514'");
  });

  it('does not allow a locked project to be moved to another canonical identity or owner', () => {
    expect(migration).toContain("new.project_id is distinct from old.project_id");
    expect(migration).toContain("new.user_id is distinct from old.user_id");
    expect(migration).toContain("new.id is distinct from old.id");
    expect(migration).toContain("new.legacy_client_project_id is distinct from old.legacy_client_project_id");
  });

  it('does not allow direct Storage reads or uploads without the exact active project Pass', () => {
    expect(migration).toContain('drop policy if exists katedra_temporary_materials_select_own');
    expect(migration).toContain('drop policy if exists katedra_temporary_materials_insert_own');
    expect(migration).toContain('katedra_temporary_materials_select_paid_project');
    expect(migration).toContain('katedra_temporary_materials_insert_paid_project');
    expect(migration).toContain('katedra_temporary_materials_update_paid_project');
    expect(migration).toContain("e.product_id = ('katedra_pass_' || l.product_key)");
    expect(migration).toContain("e.status = 'active'");
    expect(migration).toContain('e.purchase_expires_at > now()');
    expect(migration).not.toContain("e.product_id is null and e.work_type = l.product_key");
  });

  it('does not leave the legacy broad Storage delete policy active', () => {
    expect(migration).toContain('drop policy if exists katedra_temporary_materials_delete_own on storage.objects');
    expect(migration).toContain('katedra_temporary_materials_delete_paid_project');
    expect(migration).toContain('for delete to authenticated');
    expect(migration).toContain('p.id::text = (storage.foldername(name))[2]');
    expect(migration).toContain('m.deleted_at is not null');
    expect(migration).toContain("r.status in ('initializing', 'pending', 'running', 'paused')");
  });

  it('keeps registered payload paths inside the exact user/project/material namespace', () => {
    expect(migration).toContain('create or replace function public.enforce_agent_payload_storage_namespace');
    expect(migration).toContain('create trigger agent_payload_storage_namespace_guard');
    expect(migration).toContain("new.manifest_path = expected_manifest_path");
    expect(migration).toContain("position('/' in substr(new.storage_path");
    expect(migration).toContain("new.material_id = 'run-context'");
    expect(migration).toContain("new.material_id ~ '^agent-result:[A-Za-z0-9._-]+:[123]$'");
  });
});
