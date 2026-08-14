import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(import.meta.dirname, '..', 'supabase', 'migrations', '0075_agent_run_initialization_readiness.sql'),
  'utf8',
);
const recoveryMigration = readFileSync(
  join(import.meta.dirname, '..', 'supabase', 'migrations', '0076_stale_agent_run_recovery.sql'),
  'utf8',
);

describe('agent run initialization readiness contract', () => {
  it('keeps initializing runs out of the worker queue and makes readiness explicit', () => {
    expect(migration).toContain("alter column status set default 'initializing'");
    expect(migration).toContain("where status in ('initializing', 'pending', 'running', 'paused')");
    expect(migration).toContain('create or replace function public.activate_agent_run');
    expect(migration).toContain("m.material_id = 'run-context'");
    expect(migration).toContain("set status = 'pending'");
  });

  it('allows payload attachment and cancellation during initialization', () => {
    expect(migration).toContain("r.status in ('initializing', 'pending', 'running', 'paused')");
    expect(migration).toContain("status in ('initializing', 'pending', 'running', 'paused')");
    expect(migration).toContain('grant execute on function public.activate_agent_run');
  });

  it('recovers stale initialization without exposing a worker-claim path', () => {
    expect(recoveryMigration).toContain('create or replace function public.cleanup_stale_initializing_agent_run');
    expect(recoveryMigration).toContain("candidate.status = 'initializing'");
    expect(recoveryMigration).toContain("set status = 'cancelled'");
    expect(recoveryMigration).toContain("updated_at < now() - interval '10 minutes'");
    expect(recoveryMigration).toContain('grant execute on function public.cleanup_stale_initializing_agent_run');
  });
});
