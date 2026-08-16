import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const migration = readFileSync(
  join(ROOT, 'supabase', 'migrations', '0067_agentic_run_contract.sql'),
  'utf8',
);
const hardenedScopeMigration = readFileSync(
  join(ROOT, 'supabase', 'migrations', '0078_harden_agent_run_lifecycle.sql'),
  'utf8',
);
const exactScopeMigration = readFileSync(
  join(ROOT, 'supabase', 'migrations', '0081_harden_create_and_register_scope.sql'),
  'utf8',
);

describe('agenticni Katedra run contract', () => {
  it('definira canonical lock, run, step i temporary manifest entitete', () => {
    expect(migration).toContain('create table if not exists public.katedra_project_locks');
    expect(migration).toContain('create table if not exists public.agent_runs');
    expect(migration).toContain('create table if not exists public.agent_steps');
    expect(migration).toContain('create table if not exists public.agent_payload_manifests');
    expect(migration).toContain("create unique index if not exists agent_runs_one_active_per_project_idx");
    expect(migration).toContain('create or replace function public.pause_agent_run');
    expect(migration).toContain('create or replace function public.resume_agent_run');
    expect(migration).toContain('create or replace function public.cancel_agent_run');
  });

  it('zaštićuje ownership, RLS i least-privilege grantove', () => {
    expect(migration).toContain('alter table public.katedra_project_locks enable row level security');
    expect(migration).toContain('alter table public.agent_runs enable row level security');
    expect(migration).toContain('alter table public.agent_steps enable row level security');
    expect(migration).toContain("revoke all on table public.%I from anon, authenticated");
    expect(migration).toContain("grant all privileges on table public.%I to service_role");
    expect(migration).toContain("p.user_id = p_user_id and p.deleted_at is null");
    expect(migration).toContain("e.academic_project_id = p_project_id");
    expect(migration).toContain('An active paid project entitlement is required for temporary payloads');
  });

  it('claim je atomaran, a completion provjerava lease, pokušaj i requeue granicu', () => {
    expect(migration).toContain('for update skip locked');
    expect(migration).toContain("s.status = 'running' and s.lease_expires_at <= now()");
    expect(hardenedScopeMigration).toContain("lease_expires_at = now() + interval '5 minutes'");
    expect(migration).toContain("p_attempt not between 1 and 3");
    expect(migration).toContain("p_requeue and (p_status <> 'failed' or p_attempt >= 3)");
    expect(migration).toContain("current_step.lease_owner <> p_worker_id");
    expect(migration).toContain('p_worker_id text,');
    expect(migration).toContain("status = 'completed'");
  });

  it('privremeni payload ima maksimalni TTL i ne sprema akademski tekst u shared tablice', () => {
    expect(migration).toContain("interval '7 days'");
    expect(migration).toContain('deleted_at is null');
    expect(migration).toContain('returning m.manifest_id, m.storage_bucket, m.storage_path, m.manifest_path');
    expect(migration).not.toMatch(/extracted_text|manuscript|document_body/i);
  });

  it('worker claim i payload attach uvijek koriste toÄŤan zakljuÄŤani proizvod', () => {
    expect(hardenedScopeMigration).toContain('create or replace function public.claim_agent_step');
    expect(hardenedScopeMigration).toContain("e.product_id = ('katedra_pass_' || locked_product)");
    expect(hardenedScopeMigration).toContain("raise exception 'An active exact Katedra Pass is required for the agent run'");
    expect(hardenedScopeMigration).toContain("previous.status in ('initializing', 'pending', 'running', 'paused')");
    expect(hardenedScopeMigration).toContain('create or replace function public.attach_agent_payloads_to_run');
    expect(hardenedScopeMigration).toContain('and e.product_id = (\'katedra_pass_\' || l.product_key)');
  });

  it('completion ne moĹľe oĹľivjeti otkazani ili terminalni run', () => {
    expect(hardenedScopeMigration).toContain('create or replace function public.complete_agent_step');
    expect(hardenedScopeMigration).toContain('select r.* into current_run');
    expect(hardenedScopeMigration).toContain('for update;');
    expect(hardenedScopeMigration).toContain("current_run.status not in ('pending', 'running', 'paused')");
    expect(hardenedScopeMigration).toContain("Agent run is no longer active");
    expect(hardenedScopeMigration).toContain('current_step.lease_expires_at <= now()');
    expect(hardenedScopeMigration).toContain("Agent step lease has expired");
    expect(hardenedScopeMigration).toContain("where run_id = p_run_id and status in ('pending', 'running', 'paused')");
  });
  it('create run i register payload zahtijevaju tocno zakljucani proizvod', () => {
    expect(exactScopeMigration).toContain('create or replace function public.create_agent_run');
    expect(exactScopeMigration).toContain("l.status = 'locked'");
    expect(exactScopeMigration).toContain("e.product_id = ('katedra_pass_' || l.product_key)");
    expect(exactScopeMigration).toContain('create or replace function public.register_agent_payload');
    expect(exactScopeMigration).toContain('An active exact Katedra Pass is required for temporary payloads');
  });
});
