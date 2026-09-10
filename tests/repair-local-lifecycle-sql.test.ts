import { afterEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');

function oneMigration(suffix: string): string {
  const matches = readdirSync(migrationsDir).filter((name) => name.endsWith(suffix));
  expect(matches, `mora postojati tocno jedna ${suffix} migracija`).toHaveLength(1);
  return readFileSync(join(migrationsDir, matches[0]), 'utf8');
}

async function databaseWithMigrations(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table public.document_slots (id uuid primary key);
    create table public.repair_jobs (
      id uuid primary key,
      user_id uuid not null references auth.users(id),
      slot_id uuid references public.document_slots(id),
      original_path text not null default 'owner/job/original.docx',
      result_path text not null default 'owner/job/fixed.docx'
    );
    grant select on public.repair_jobs to service_role;
  `);
  await db.exec(oneMigration('_repair_local_claims.sql'));
  await db.exec(oneMigration('_repair_local_lifecycle.sql'));
  return db;
}

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SLOT_ID = '22222222-2222-4222-8222-222222222222';
const JOB_ID = '33333333-3333-4333-8333-333333333333';
const SOURCE_HASH = 'a'.repeat(64);
const TARGET_HASH = 'b'.repeat(64);
const CLAIM_HASH = 'c'.repeat(64);
const DEVICE_HASH = 'd'.repeat(64);
const OUTPUT_HASH = 'e'.repeat(64);
const REPORT_HASH = 'f'.repeat(64);
const CHECKPOINT_HASH = '1'.repeat(64);
const CONTRACT_KEY_ID = 'lekta-2026-08';
const CONTRACT = {
  contractVersion: 1,
  jobId: JOB_ID,
  userId: USER_ID,
  sourceSha256: SOURCE_HASH,
  targetSha256: TARGET_HASH,
  contractSignature: {
    algorithm: 'ES256-P1363',
    keyId: CONTRACT_KEY_ID,
    value: 'A'.repeat(86),
  },
};

async function seedClaimed(db: PGlite): Promise<void> {
  await db.query('insert into auth.users (id) values ($1)', [USER_ID]);
  await db.query('insert into public.document_slots (id) values ($1)', [SLOT_ID]);
  await db.query(
    'insert into public.repair_jobs (id, user_id, slot_id) values ($1, $2, $3)',
    [JOB_ID, USER_ID, SLOT_ID],
  );
  await db.query(
    `insert into public.repair_local_jobs (
      job_id, user_id, slot_id, source_sha256, source_size,
      target_sha256, target_size, repair_contract, contract_key_id,
      claim_token_sha256, claim_expires_at
    ) values ($1, $2, $3, $4, 1200, $5, 1300, $6::jsonb,
              $7, $8, now() + interval '10 minutes')`,
    [JOB_ID, USER_ID, SLOT_ID, SOURCE_HASH, TARGET_HASH, JSON.stringify(CONTRACT), CONTRACT_KEY_ID, CLAIM_HASH],
  );
  await db.exec('set role service_role');
  const claim = await db.query(
    'select * from public.claim_local_repair_job($1, $2, $3, $4)',
    [JOB_ID, CLAIM_HASH, 'A'.repeat(122), DEVICE_HASH],
  );
  expect(claim.rows).toHaveLength(1);
}

async function advance(
  db: PGlite,
  sequence: number,
  event: string,
  checkpointSha256: string | null = null,
  outputSha256: string | null = null,
  reportSha256: string | null = null,
  deviceHash: string = DEVICE_HASH,
  eventSha256: string = '4'.repeat(64),
) {
  return db.query(
    `select * from public.advance_local_repair_job(
      $1, $2, $3, $4, now(), $5, $6, $7, $8
    )`,
    [JOB_ID, deviceHash, sequence, event, checkpointSha256, outputSha256, reportSha256, eventSha256],
  );
}

describe('atomski lifecycle lokalnog WordReplica posla', () => {
  let db: PGlite | null = null;

  afterEach(async () => {
    await db?.close();
    db = null;
  });

  it('idempotentno prihvaca tocno isti processing receipt, ali odbija izmijenjeni replay', async () => {
    db = await databaseWithMigrations();
    await seedClaimed(db);

    const first = await advance(db, 1, 'processing');
    const replay = await advance(db, 1, 'processing');
    const changedReplay = await advance(db, 1, 'processing', null, null, null, DEVICE_HASH, '5'.repeat(64));

    expect(first.rows).toEqual([{ local_state: 'processing', device_event_sequence: 1 }]);
    expect(replay.rows).toEqual([{ local_state: 'processing', device_event_sequence: 1 }]);
    expect(changedReplay.rows).toHaveLength(0);
  });

  it('dovrsava processing posao s potpisanim hashom nove rekonstruirane datoteke', async () => {
    db = await databaseWithMigrations();
    await seedClaimed(db);

    const premature = await advance(db, 1, 'completed', null, OUTPUT_HASH, REPORT_HASH);
    expect(premature.rows).toHaveLength(0);
    await advance(db, 1, 'processing');
    const completed = await advance(db, 2, 'completed', null, OUTPUT_HASH, REPORT_HASH, DEVICE_HASH, '6'.repeat(64));
    const exactRetry = await advance(db, 2, 'completed', null, OUTPUT_HASH, REPORT_HASH, DEVICE_HASH, '6'.repeat(64));
    const changedRetry = await advance(db, 2, 'completed', null, '3'.repeat(64), REPORT_HASH, DEVICE_HASH, '7'.repeat(64));

    expect(completed.rows).toEqual([{ local_state: 'completed', device_event_sequence: 2 }]);
    expect(exactRetry.rows).toEqual([{ local_state: 'completed', device_event_sequence: 2 }]);
    expect(changedRetry.rows).toHaveLength(0);
    await db.exec('reset role');
    const persisted = await db.query<{
      local_state: string;
      output_sha256: string;
      completion_report_sha256: string;
      completed_at: Date | string;
    }>(
      `select local_state, output_sha256, completion_report_sha256, completed_at
       from public.repair_local_jobs where job_id = $1`,
      [JOB_ID],
    );
    expect(persisted.rows[0]).toMatchObject({
      local_state: 'completed',
      output_sha256: OUTPUT_HASH,
      completion_report_sha256: REPORT_HASH,
    });
    expect(persisted.rows[0].completed_at).toBeTruthy();
  });

  it('podrzava retry checkpoint bez dopustanja drugom uredjaju da nastavi', async () => {
    db = await databaseWithMigrations();
    await seedClaimed(db);
    await advance(db, 1, 'processing');

    const wrongDevice = await advance(db, 2, 'retryable', CHECKPOINT_HASH, null, null, '2'.repeat(64));
    const retryable = await advance(db, 2, 'retryable', CHECKPOINT_HASH);
    const resumed = await advance(db, 3, 'processing');

    expect(wrongDevice.rows).toHaveLength(0);
    expect(retryable.rows).toEqual([{ local_state: 'retryable', device_event_sequence: 2 }]);
    expect(resumed.rows).toEqual([{ local_state: 'processing', device_event_sequence: 3 }]);
  });
});
