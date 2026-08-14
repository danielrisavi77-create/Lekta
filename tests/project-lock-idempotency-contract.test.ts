import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const migration = readFileSync(
  join(ROOT, 'supabase', 'migrations', '0074_atomic_project_lock_idempotency.sql'),
  'utf8',
);

describe('atomic paid project lock contract', () => {
  it('claims the lock through an atomic conflict-safe insert', () => {
    expect(migration).toContain('on conflict do nothing');
    expect(migration).toContain('returning katedra_project_locks.* into inserted_lock');
    expect(migration).not.toMatch(/select l\.\* into existing_lock[\s\S]*?insert into public\.katedra_project_locks/);
  });

  it('reconciles concurrent conflicts under row locks before returning an existing lock', () => {
    expect(migration).toContain('where l.project_id = p_project_id or l.payment_id = p_payment_id');
    expect(migration).toContain('order by l.lock_id');
    expect(migration).toContain('for candidate_lock in');
    expect(migration).toContain('for update');
    expect(migration).toContain('Paid project lock claim could not be reconciled');
    expect(migration).toContain('Payment or project is already bound to a different project');
  });

  it('rechecks every immutable identity field on an idempotent retry', () => {
    expect(migration).toContain('existing_lock.user_id <> p_user_id');
    expect(migration).toContain('existing_lock.project_id <> p_project_id');
    expect(migration).toContain('existing_lock.topic <> p_topic');
    expect(migration).toContain('existing_lock.payment_id <> p_payment_id');
  });
});
