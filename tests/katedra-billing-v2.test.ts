import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const migration = readFileSync(
  join(ROOT, 'supabase', 'migrations', '0068_katedra_billing_v2.sql'),
  'utf8',
);
const accountingMigration = readFileSync(
  join(ROOT, 'supabase', 'migrations', '0079_fix_billing_daily_ceiling.sql'),
  'utf8',
);
const pendingMigration = readFileSync(
  join(ROOT, 'supabase', 'migrations', '0083_billing_pending_marker.sql'),
  'utf8',
);

describe('Katedra billing v2 contract', () => {
  it('adds project and request scoped idempotent billing attempts', () => {
    expect(migration).toContain('create table if not exists public.katedra_billing_attempts');
    expect(migration).toMatch(/request_id\s+text primary key/);
    expect(migration).toMatch(/project_id\s+uuid not null references public\.academic_projects/);
    expect(migration).toMatch(/status\s+text not null check \(status in \('reserved', 'settled', 'released', 'pending_reconciliation'\)\)/);
    expect(migration).toContain('create or replace function public.katedra_consume(');
    expect(migration).toContain('p_project_id uuid');
    expect(migration).toContain('p_request_id text');
    expect(migration).toContain("then 'already_settled'");
  });

  it('defines a durable pending marker for provider attempts without usage', () => {
    expect(pendingMigration).toContain('create or replace function public.katedra_mark_pending(');
    expect(pendingMigration).toContain("'pending_reconciliation'");
    expect(pendingMigration).toContain('katedra_request_reservations');
    expect(pendingMigration).toContain('pg_advisory_xact_lock');
    expect(pendingMigration).toContain('revoke all on function public.katedra_mark_pending');
  });

  it('defines atomic distributed request reservation and release RPCs', () => {
    expect(migration).toContain('create table if not exists public.katedra_request_reservations');
    expect(migration).toContain('create or replace function public.katedra_reserve_request');
    expect(migration).toContain('create or replace function public.katedra_release_request');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("status', 'concurrency'");
    expect(migration).toContain("status', 'rate'");
  });

  it('keeps billing state server-only and requires project ownership', () => {
    expect(migration).toContain('alter table public.katedra_billing_attempts enable row level security');
    expect(migration).toContain('alter table public.katedra_request_reservations enable row level security');
    expect(migration).toContain("p.id = p_project_id and p.user_id = p_user and p.deleted_at is null");
    expect(migration).toContain('revoke all on function public.katedra_consume');
    expect(migration).toContain('grant execute on function public.katedra_consume');
    expect(migration).not.toMatch(/prompt|completion_text|output_text|extracted_text/i);
  });

  it('dnevni limit ne troĹˇi na otpuĹˇtene rezervacije bez stvarne naplate', () => {
    expect(accountingMigration).toContain('create or replace function public.katedra_reserve_request');
    expect(accountingMigration).toContain("b.status in ('settled', 'pending_reconciliation')");
    expect(accountingMigration).toContain('b.charged');
    expect(accountingMigration).toContain("when r.status = 'reserved' then r.estimated_charge");
    expect(accountingMigration).toContain('not exists (');
    expect(accountingMigration).toContain('from public.katedra_billing_attempts b');
  });
});
