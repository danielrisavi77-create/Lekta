// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migration = readFileSync(
  join(root, 'supabase', 'migrations', '0210_repair_request_idempotency.sql'),
  'utf8',
);
const deliveryRecoveryMigration = readFileSync(
  join(root, 'supabase', 'migrations', '0211_repair_delivery_recovery.sql'),
  'utf8',
);
const recoveryLeaseMigration = readFileSync(
  join(root, 'supabase', 'migrations', '0212_repair_request_recovery_lease.sql'),
  'utf8',
);
const deliveryMarkerMigration = readFileSync(
  join(root, 'supabase', 'migrations', '0213_repair_request_delivery_marker.sql'),
  'utf8',
);
const repairJobFingerprintMigration = readFileSync(
  join(root, 'supabase', 'migrations', '0214_repair_job_request_fingerprint.sql'),
  'utf8',
);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_REQUEST_ID = '55555555-5555-4555-8555-555555555555';
const JOB_ID = '44444444-4444-4444-8444-444444444444';
const RECOVERY_REQUEST_ID = '88888888-8888-4888-8888-888888888888';
const RECOVERY_RETRY_REQUEST_ID = '99999999-9999-4999-8999-999999999999';
const FINGERPRINT = 'a'.repeat(64);

describe('repair request idempotency SQL', () => {
  let db: PGlite | null = null;

  afterEach(async () => {
    await db?.close();
    db = null;
  });

  it('binds at most one stored repair job to a semantic request per user', async () => {
    db = new PGlite();
    await db.exec(`
      create schema auth;
      create table auth.users (id uuid primary key);
      create table public.repair_jobs (
        id uuid primary key,
        user_id uuid not null references auth.users(id)
      );
    `);
    await db.exec(repairJobFingerprintMigration);
    await db.exec(repairJobFingerprintMigration);
    await db.query('insert into auth.users(id) values ($1), ($2)', [USER_ID, OTHER_USER_ID]);

    await db.query(
      'insert into public.repair_jobs(id, user_id, request_fingerprint) values ($1, $2, $3)',
      [JOB_ID, USER_ID, FINGERPRINT],
    );
    await expect(db.query(
      'insert into public.repair_jobs(id, user_id, request_fingerprint) values ($1, $2, $3)',
      ['66666666-6666-4666-8666-666666666666', USER_ID, FINGERPRINT],
    )).rejects.toThrow(/repair_jobs_user_request_fingerprint_uidx/);

    // The same semantic input remains independent across accounts, and historical rows may be null.
    await db.query(
      'insert into public.repair_jobs(id, user_id, request_fingerprint) values ($1, $2, $3), ($4, $2, null)',
      ['77777777-7777-4777-8777-777777777777', OTHER_USER_ID, FINGERPRINT, '88888888-8888-4888-8888-888888888888'],
    );
    await expect(db.query(
      'insert into public.repair_jobs(id, user_id, request_fingerprint) values ($1, $2, $3)',
      ['99999999-9999-4999-8999-999999999999', USER_ID, 'invalid'],
    )).rejects.toThrow(/repair_jobs_request_fingerprint_check/);
  });

  it('counts storage-delivery failures while keeping the attempt outcome constrained', async () => {
    db = new PGlite();
    await db.exec(`
      create table public.repair_attempt_log (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null,
        outcome text not null default 'pending',
        constraint repair_attempt_log_outcome_check
          check (outcome in ('pending', 'no_change', 'integrity_failed'))
      );
    `);
    await db.exec(deliveryRecoveryMigration);
    await db.exec(deliveryRecoveryMigration);
    await db.query("insert into public.repair_attempt_log(user_id, outcome) values ($1, 'delivery_failed')", [USER_ID]);
    await expect(db.query("insert into public.repair_attempt_log(user_id, outcome) values ($1, 'unexpected')", [USER_ID]))
      .rejects.toThrow(/repair_attempt_log_outcome_check/);
  });

  it('marks paid delivery recovery atomically with the slot and rolls both back on a missing request', async () => {
    db = new PGlite();
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create table public.repair_request_keys (
        user_id uuid not null,
        request_id uuid not null,
        request_fingerprint text not null,
        status text not null,
        job_id uuid,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (user_id, request_id)
      );
      create table public.document_slots (
        id uuid primary key default gen_random_uuid(),
        entitlement_id uuid not null,
        user_id uuid not null,
        work_type text not null,
        fingerprint jsonb not null,
        label text not null,
        slot_expires_at timestamptz not null,
        profile_ref text,
        coverage_tier smallint
      );
      grant select, insert, update, delete on public.repair_request_keys, public.document_slots to service_role;
      create function public.consume_slot_and_bind(
        p_entitlement_id uuid,
        p_user_id uuid,
        p_work_type text,
        p_fingerprint jsonb,
        p_label text,
        p_slot_expires_at timestamptz,
        p_profile_ref text,
        p_coverage_tier smallint
      ) returns public.document_slots
      language plpgsql security definer set search_path = public as $$
      declare v_slot public.document_slots%rowtype;
      begin
        insert into public.document_slots (
          entitlement_id, user_id, work_type, fingerprint, label, slot_expires_at, profile_ref, coverage_tier
        ) values (
          p_entitlement_id, p_user_id, p_work_type, p_fingerprint, p_label, p_slot_expires_at, p_profile_ref, p_coverage_tier
        ) returning * into v_slot;
        return v_slot;
      end;
      $$;
    `);
    await db.exec(recoveryLeaseMigration);
    await db.exec(deliveryMarkerMigration);
    await db.query(
      "insert into public.repair_request_keys(user_id, request_id, request_fingerprint, status) values ($1, $2, $3, 'processing'), ($1, $4, $5, 'retryable')",
      [USER_ID, REQUEST_ID, FINGERPRINT, OTHER_REQUEST_ID, 'b'.repeat(64)],
    );
    await db.exec('set role service_role');

    await db.query(
      `select public.consume_repair_slot_and_bind(
        $1, $2, $3, $4::jsonb, $5, now() + interval '1 day', null, null, $6, $7
      )`,
      ['66666666-6666-4666-8666-666666666666', USER_ID, 'diplomski', '{"title":"test"}', 'Test', REQUEST_ID, FINGERPRINT],
    );
    const marked = await db.query(
      'select status, recovery_attempt from public.repair_request_keys where user_id = $1 and request_id = $2',
      [USER_ID, REQUEST_ID],
    );
    expect(marked.rows[0]).toEqual({ status: 'processing', recovery_attempt: true });

    await db.query(
      "update public.repair_request_keys set updated_at = now() - interval '15 minutes' where user_id = $1 and request_id = $2",
      [USER_ID, REQUEST_ID],
    );
    expect((await db.query(
      'select public.repair_request_status($1, $2) as state',
      [USER_ID, REQUEST_ID],
    )).rows[0].state).toMatchObject({ status: 'processing', jobId: null });

    await db.query(
      "update public.repair_request_keys set updated_at = now() - interval '31 minutes' where user_id = $1 and request_id = $2",
      [USER_ID, REQUEST_ID],
    );
    expect((await db.query(
      'select public.repair_request_status($1, $2) as state',
      [USER_ID, REQUEST_ID],
    )).rows[0].state).toMatchObject({ status: 'completed_unstored', jobId: null });
    expect((await db.query(
      'select public.claim_repair_request($1, $2, $3) as state',
      [USER_ID, REQUEST_ID, FINGERPRINT],
    )).rows[0].state).toMatchObject({ status: 'processing', claimed: true, recovery: true });

    await expect(db.query(
      `select public.consume_repair_slot_and_bind(
        $1, $2, $3, $4::jsonb, $5, now() + interval '1 day', null, null, $6, $7
      )`,
      ['77777777-7777-4777-8777-777777777777', USER_ID, 'diplomski', '{"title":"rollback"}', 'Rollback', OTHER_REQUEST_ID, 'b'.repeat(64)],
    )).rejects.toThrow(/repair_request_state_unavailable/);
    expect((await db.query('select count(*)::int as count from public.document_slots')).rows[0].count).toBe(1);
    await db.exec('reset role');
  });

  it('claims once across IDs, rejects key reuse, and returns the saved completion', async () => {
    db = new PGlite();
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create table public.repair_jobs (id uuid primary key, user_id uuid not null references auth.users(id));
      grant insert on public.repair_jobs to service_role;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
      create schema cron;
      create table cron.job (
        jobid bigserial primary key, jobname text unique not null, schedule text not null, command text not null
      );
      create function cron.schedule(job_name text, job_schedule text, job_command text)
        returns bigint language plpgsql as $$
        declare result_id bigint;
        begin
          insert into cron.job(jobname, schedule, command)
          values (job_name, job_schedule, job_command) returning jobid into result_id;
          return result_id;
        end $$;
      create function cron.unschedule(job_name text) returns boolean language plpgsql as $$
        begin delete from cron.job where jobname = $1; return found; end $$;
    `);
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(recoveryLeaseMigration);
    await db.exec(recoveryLeaseMigration);
    await db.query('insert into auth.users(id) values ($1), ($2)', [USER_ID, OTHER_USER_ID]);

    await db.exec('set role service_role');
    const claim = (userId: string, requestId = REQUEST_ID, fingerprint = FINGERPRINT) => db!.query(
      'select public.claim_repair_request($1, $2, $3) as state',
      [userId, requestId, fingerprint],
    );

    expect((await claim(USER_ID)).rows[0].state).toMatchObject({ status: 'processing', claimed: true });
    expect((await claim(USER_ID)).rows[0].state).toMatchObject({ status: 'processing', claimed: false });
    // Separate tabs with different IDs still cannot claim the same semantic request.
    expect((await claim(USER_ID, OTHER_REQUEST_ID)).rows[0].state).toMatchObject({ status: 'processing', claimed: false });
    expect((await claim(USER_ID, REQUEST_ID, 'b'.repeat(64))).rows[0].state).toMatchObject({ status: 'conflict', claimed: false });

    await db.query('insert into public.repair_jobs(id, user_id) values ($1, $2)', [JOB_ID, USER_ID]);
    const finished = await db.query(
      'select public.finish_repair_request($1, $2, $3, $4, $5) as finished',
      [USER_ID, REQUEST_ID, FINGERPRINT, 'completed', JOB_ID],
    );
    expect(finished.rows[0].finished).toBe(true);
    expect((await claim(USER_ID, OTHER_REQUEST_ID)).rows[0].state).toMatchObject({ status: 'completed', claimed: false, jobId: JOB_ID });

    const recoveryFingerprint = 'b'.repeat(64);
    expect((await claim(USER_ID, OTHER_REQUEST_ID, recoveryFingerprint)).rows[0].state)
      .toMatchObject({ status: 'processing', claimed: true });
    const unstored = await db.query(
      'select public.finish_repair_request($1, $2, $3, $4, null) as finished',
      [USER_ID, OTHER_REQUEST_ID, recoveryFingerprint, 'completed_unstored'],
    );
    expect(unstored.rows[0].finished).toBe(true);
    const recovered = await claim(USER_ID, '66666666-6666-4666-8666-666666666666', recoveryFingerprint);
    expect(recovered.rows[0].state).toMatchObject({ status: 'processing', claimed: true, recovery: true });
    const duplicateRecovery = await claim(USER_ID, '77777777-7777-4777-8777-777777777777', recoveryFingerprint);
    expect(duplicateRecovery.rows[0].state).toMatchObject({ status: 'processing', claimed: false });

    // The same UUID is an independent key for another authenticated account.
    expect((await claim(OTHER_USER_ID)).rows[0].state).toMatchObject({ status: 'processing', claimed: true });
    await db.exec('reset role');
    const cronJobs = await db.query<{ jobname: string }>('select jobname from cron.job');
    expect(cronJobs.rows).toEqual([{ jobname: 'purge-repair-request-keys' }]);
  });

  it('marks stale processing unknown, then accepts a late definitive completion', async () => {
    db = new PGlite();
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create table public.repair_jobs (id uuid primary key, user_id uuid not null references auth.users(id));
      grant insert on public.repair_jobs to service_role;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
      create schema cron;
      create table cron.job (
        jobid bigserial primary key, jobname text unique not null, schedule text not null, command text not null
      );
      create function cron.schedule(job_name text, job_schedule text, job_command text)
        returns bigint language plpgsql as $$
        declare result_id bigint;
        begin
          insert into cron.job(jobname, schedule, command)
          values (job_name, job_schedule, job_command) returning jobid into result_id;
          return result_id;
        end $$;
      create function cron.unschedule(job_name text) returns boolean language plpgsql as $$
        begin delete from cron.job where jobname = $1; return found; end $$;
    `);
    await db.exec(migration);
    await db.exec(recoveryLeaseMigration);
    await db.query('insert into auth.users(id) values ($1)', [USER_ID]);
    await db.exec('set role service_role');
    await db.query('select public.claim_repair_request($1, $2, $3)', [USER_ID, REQUEST_ID, FINGERPRINT]);
    await db.query("update public.repair_request_keys set updated_at = now() - interval '11 minutes' where user_id = $1 and request_id = $2", [USER_ID, REQUEST_ID]);

    const status = await db.query(
      'select public.repair_request_status($1, $2) as state',
      [USER_ID, REQUEST_ID],
    );
    expect(status.rows[0].state).toMatchObject({ status: 'unknown', jobId: null });

    await db.query('insert into public.repair_jobs(id, user_id) values ($1, $2)', [JOB_ID, USER_ID]);
    const finished = await db.query(
      'select public.finish_repair_request($1, $2, $3, $4, $5) as finished',
      [USER_ID, REQUEST_ID, FINGERPRINT, 'completed', JOB_ID],
    );
    expect(finished.rows[0].finished).toBe(true);
    expect((await db.query('select public.repair_request_status($1, $2) as state', [USER_ID, REQUEST_ID])).rows[0].state)
      .toMatchObject({ status: 'completed', jobId: JOB_ID });

    const recoveryFingerprint = 'b'.repeat(64);
    expect((await db.query(
      'select public.claim_repair_request($1, $2, $3) as state',
      [USER_ID, RECOVERY_REQUEST_ID, recoveryFingerprint],
    )).rows[0].state).toMatchObject({ status: 'processing', claimed: true });
    expect((await db.query(
      'select public.finish_repair_request($1, $2, $3, $4, null) as finished',
      [USER_ID, RECOVERY_REQUEST_ID, recoveryFingerprint, 'completed_unstored'],
    )).rows[0].finished).toBe(true);

    expect((await db.query(
      'select public.claim_repair_request($1, $2, $3) as state',
      [USER_ID, OTHER_REQUEST_ID, recoveryFingerprint],
    )).rows[0].state).toMatchObject({ status: 'processing', claimed: true, recovery: true });
    await db.query(
      "update public.repair_request_keys set updated_at = now() - interval '15 minutes' where user_id = $1 and request_id = $2",
      [USER_ID, OTHER_REQUEST_ID],
    );
    expect((await db.query(
      'select public.repair_request_status($1, $2) as state',
      [USER_ID, OTHER_REQUEST_ID],
    )).rows[0].state).toMatchObject({ status: 'processing', jobId: null });
    expect((await db.query(
      'select public.claim_repair_request($1, $2, $3) as state',
      [USER_ID, RECOVERY_RETRY_REQUEST_ID, recoveryFingerprint],
    )).rows[0].state).toMatchObject({ status: 'processing', claimed: false });
    await db.query(
      "update public.repair_request_keys set updated_at = now() - interval '31 minutes' where user_id = $1 and request_id = $2",
      [USER_ID, OTHER_REQUEST_ID],
    );
    expect((await db.query(
      'select public.claim_repair_request($1, $2, $3) as state',
      [USER_ID, RECOVERY_RETRY_REQUEST_ID, recoveryFingerprint],
    )).rows[0].state).toMatchObject({ status: 'completed_unstored', claimed: false });
    expect((await db.query(
      'select recovery_attempt from public.repair_request_keys where user_id = $1 and request_id = $2',
      [USER_ID, OTHER_REQUEST_ID],
    )).rows[0].recovery_attempt).toBe(false);

    expect((await db.query(
      'select public.claim_repair_request($1, $2, $3) as state',
      [USER_ID, RECOVERY_REQUEST_ID, recoveryFingerprint],
    )).rows[0].state).toMatchObject({ status: 'processing', claimed: true, recovery: true });
    await db.query(
      "update public.repair_request_keys set updated_at = now() - interval '31 minutes' where user_id = $1 and request_id = $2",
      [USER_ID, RECOVERY_REQUEST_ID],
    );
    expect((await db.query(
      'select public.repair_request_status($1, $2) as state',
      [USER_ID, RECOVERY_REQUEST_ID],
    )).rows[0].state).toMatchObject({ status: 'completed_unstored', jobId: null });
    expect((await db.query(
      'select recovery_attempt from public.repair_request_keys where user_id = $1 and request_id = $2',
      [USER_ID, RECOVERY_REQUEST_ID],
    )).rows[0].recovery_attempt).toBe(false);
  });

  it('retains uncertain and billable outcomes while purging old non-billable records', async () => {
    db = new PGlite();
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create table public.repair_jobs (id uuid primary key, user_id uuid not null references auth.users(id));
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
      create schema cron;
      create table cron.job (
        jobid bigserial primary key, jobname text unique not null, schedule text not null, command text not null
      );
      create function cron.schedule(job_name text, job_schedule text, job_command text)
        returns bigint language plpgsql as $$
        declare result_id bigint;
        begin
          insert into cron.job(jobname, schedule, command)
          values (job_name, job_schedule, job_command) returning jobid into result_id;
          return result_id;
        end $$;
      create function cron.unschedule(job_name text) returns boolean language plpgsql as $$
        begin delete from cron.job where jobname = $1; return found; end $$;
    `);
    await db.exec(migration);
    await db.exec(recoveryLeaseMigration);
    await db.query('insert into auth.users(id) values ($1)', [USER_ID]);
    await db.query('insert into public.repair_jobs(id, user_id) values ($1, $2)', [JOB_ID, USER_ID]);
    await db.query(`
      insert into public.repair_request_keys(user_id, request_id, request_fingerprint, status, job_id, created_at, updated_at)
      values
        ($1, $2, $6, 'unknown', null, now() - interval '31 days', now() - interval '31 days'),
        ($1, $3, $7, 'completed_unstored', null, now() - interval '31 days', now() - interval '31 days'),
        ($1, $4, $8, 'no_change', null, now() - interval '31 days', now() - interval '31 days'),
        ($1, $5, $9, 'completed', $10, now() - interval '31 days', now() - interval '31 days')
    `, [
      USER_ID,
      REQUEST_ID,
      OTHER_REQUEST_ID,
      '66666666-6666-4666-8666-666666666666',
      '77777777-7777-4777-8777-777777777777',
      'a'.repeat(64),
      'b'.repeat(64),
      'c'.repeat(64),
      'd'.repeat(64),
      JOB_ID,
    ]);

    const purged = await db.query('select public.purge_repair_request_keys(30) as count');
    expect(purged.rows[0].count).toBe(1);
    const rows = await db.query<{ status: string }>(
      'select status from public.repair_request_keys where user_id = $1 order by status',
      [USER_ID],
    );
    expect(rows.rows.map((row) => row.status)).toEqual(['completed', 'completed_unstored', 'unknown']);
  });

  it('exposes request state only to its owner', async () => {
    db = new PGlite();
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create table public.repair_jobs (id uuid primary key, user_id uuid not null references auth.users(id));
      grant insert on public.repair_jobs to service_role;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
      create schema cron;
      create table cron.job (
        jobid bigserial primary key, jobname text unique not null, schedule text not null, command text not null
      );
      create function cron.schedule(job_name text, job_schedule text, job_command text)
        returns bigint language plpgsql as $$
        declare result_id bigint;
        begin
          insert into cron.job(jobname, schedule, command)
          values (job_name, job_schedule, job_command) returning jobid into result_id;
          return result_id;
        end $$;
      create function cron.unschedule(job_name text) returns boolean language plpgsql as $$
        begin delete from cron.job where jobname = $1; return found; end $$;
    `);
    await db.exec(migration);
    await db.exec(recoveryLeaseMigration);
    await db.query('insert into auth.users(id) values ($1), ($2)', [USER_ID, OTHER_USER_ID]);
    await db.exec('set role service_role');
    await db.query('select public.claim_repair_request($1, $2, $3)', [USER_ID, REQUEST_ID, FINGERPRINT]);
    await db.query('select public.claim_repair_request($1, $2, $3)', [OTHER_USER_ID, REQUEST_ID, FINGERPRINT]);
    await db.exec('reset role');

    await db.exec(`select set_config('request.jwt.claim.sub', '${USER_ID}', false); set role authenticated`);
    const visible = await db.query<{ user_id: string }>('select user_id from public.repair_request_keys');
    expect(visible.rows).toEqual([{ user_id: USER_ID }]);
    await db.exec('reset role');
  });
});
