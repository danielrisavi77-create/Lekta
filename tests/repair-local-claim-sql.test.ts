import { afterEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');

function localMigration(suffix: string): string {
  const matches = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(suffix));
  expect(matches, `mora postojati tocno jedna ${suffix} migracija`).toHaveLength(1);
  return readFileSync(join(migrationsDir, matches[0]), 'utf8');
}

async function databaseWithMigration(): Promise<PGlite> {
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
  await db.exec(localMigration('_repair_local_claims.sql'));
  await db.exec(localMigration('_repair_local_lifecycle.sql'));
  await db.exec(localMigration('_repair_local_claim_recovery.sql'));
  return db;
}

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SLOT_ID = '22222222-2222-4222-8222-222222222222';
const JOB_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_USER_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_SLOT_ID = '55555555-5555-4555-8555-555555555555';
const SOURCE_HASH = 'a'.repeat(64);
const TARGET_HASH = 'b'.repeat(64);
const CLAIM_HASH = 'c'.repeat(64);
const OTHER_CLAIM_HASH = 'e'.repeat(64);
const DEVICE_HASH = 'd'.repeat(64);
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

describe('jednokratni lokalni claim', () => {
  let db: PGlite | null = null;

  afterEach(async () => {
    await db?.close();
    db = null;
  });

  it('atomski dopusta tocno jednom uredjaju da preuzme placeni posao', async () => {
    db = await databaseWithMigration();
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
    const claim = (publicKey: string, keyHash: string) => db!.query(
      'select * from public.claim_local_repair_job($1, $2, $3, $4)',
      [JOB_ID, CLAIM_HASH, publicKey, keyHash],
    );
    const [first, second] = await Promise.all([
      claim('A'.repeat(122), '1'.repeat(64)),
      claim('B'.repeat(122), '2'.repeat(64)),
    ]);

    const winners = [first, second].filter((result) => result.rows.length === 1);
    expect(winners).toHaveLength(1);
    expect(winners[0].rows[0]).toMatchObject({
      job_id: JOB_ID,
      local_state: 'claimed',
    });

    await db.exec('reset role');
    const persisted = await db.query<{
      local_state: string;
      device_public_key_spki: string;
      device_key_sha256: string;
      claim_token_sha256: string | null;
    }>(
      `select local_state, device_public_key_spki, device_key_sha256, claim_token_sha256
       from public.repair_local_jobs where job_id = $1`,
      [JOB_ID],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0].local_state).toBe('claimed');
    expect(persisted.rows[0].claim_token_sha256).toBeNull();
    expect([
      ['A'.repeat(122), '1'.repeat(64)],
      ['B'.repeat(122), '2'.repeat(64)],
    ]).toContainEqual([
      persisted.rows[0].device_public_key_spki,
      persisted.rows[0].device_key_sha256,
    ]);
  });

  it('istom uredjaju obnavlja URL claim nakon izgubljenog odgovora, ali samo prije processinga', async () => {
    db = await databaseWithMigration();
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
    const claim = (token: string, publicKey: string, deviceHash: string) => db!.query(
      'select * from public.claim_local_repair_job($1, $2, $3, $4)',
      [JOB_ID, token, publicKey, deviceHash],
    );
    const first = await claim(CLAIM_HASH, 'A'.repeat(122), DEVICE_HASH);
    const sameDeviceRetry = await claim(CLAIM_HASH, 'A'.repeat(122), DEVICE_HASH);
    const wrongDevice = await claim(CLAIM_HASH, 'B'.repeat(122), '2'.repeat(64));
    const wrongToken = await claim(OTHER_CLAIM_HASH, 'A'.repeat(122), DEVICE_HASH);

    expect(first.rows).toHaveLength(1);
    expect(sameDeviceRetry.rows).toHaveLength(1);
    expect(wrongDevice.rows).toHaveLength(0);
    expect(wrongToken.rows).toHaveLength(0);

    const processing = await db.query(
      `select * from public.advance_local_repair_job(
        $1, $2, 1, 'processing', now(), null, null, null, $3
      )`,
      [JOB_ID, DEVICE_HASH, '4'.repeat(64)],
    );
    expect(processing.rows).toEqual([{ local_state: 'processing', device_event_sequence: 1 }]);
    expect((await claim(CLAIM_HASH, 'A'.repeat(122), DEVICE_HASH)).rows).toHaveLength(0);

    await db.exec('reset role');
    const persisted = await db.query<{
      claim_token_sha256: string | null;
      claim_recovery_token_sha256: string | null;
    }>(
      `select claim_token_sha256, claim_recovery_token_sha256
       from public.repair_local_jobs where job_id = $1`,
      [JOB_ID],
    );
    expect(persisted.rows[0]).toEqual({
      claim_token_sha256: null,
      claim_recovery_token_sha256: null,
    });
  });

  it.each(['expired', 'revoked'] as const)('%s posao nije claimable i cisti bearer materijal', async (state) => {
    db = await databaseWithMigration();
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
    if (state === 'expired') {
      await db.exec("update public.repair_local_jobs set claim_expires_at = now() - interval '1 second'");
    } else {
      await db.exec("update public.repair_local_jobs set local_state = 'revoked'");
    }

    await db.exec('set role service_role');
    const result = await db.query(
      'select * from public.claim_local_repair_job($1, $2, $3, $4)',
      [JOB_ID, CLAIM_HASH, 'A'.repeat(122), DEVICE_HASH],
    );
    expect(result.rows).toHaveLength(0);
    await db.exec('reset role');

    const persisted = await db.query<{
      local_state: string;
      claim_token_sha256: string | null;
      claim_recovery_token_sha256: string | null;
    }>(
      `select local_state, claim_token_sha256, claim_recovery_token_sha256
       from public.repair_local_jobs where job_id = $1`,
      [JOB_ID],
    );
    expect(persisted.rows[0]).toEqual({
      local_state: state,
      claim_token_sha256: null,
      claim_recovery_token_sha256: null,
    });
  });

  it('odbija redak ciji contract_key_id nije kljuc potpisanog ugovora', async () => {
    db = await databaseWithMigration();
    await db.query('insert into auth.users (id) values ($1)', [USER_ID]);
    await db.query('insert into public.document_slots (id) values ($1)', [SLOT_ID]);
    await db.query(
      'insert into public.repair_jobs (id, user_id, slot_id) values ($1, $2, $3)',
      [JOB_ID, USER_ID, SLOT_ID],
    );

    await expect(db.query(
      `insert into public.repair_local_jobs (
        job_id, user_id, slot_id, source_sha256, source_size,
        target_sha256, target_size, repair_contract, contract_key_id,
        claim_token_sha256, claim_expires_at
      ) values ($1, $2, $3, $4, 1200, $5, 1300, $6::jsonb,
                'attacker-key', $7, now() + interval '10 minutes')`,
      [JOB_ID, USER_ID, SLOT_ID, SOURCE_HASH, TARGET_HASH, JSON.stringify(CONTRACT), CLAIM_HASH],
    )).rejects.toThrow();
  });

  it.each([
    ['drugog korisnika', OTHER_USER_ID, SLOT_ID],
    ['drugi placeni slot', USER_ID, OTHER_SLOT_ID],
  ])('ne dopusta da lokalni entitlement koristi %s umjesto identiteta repair joba', async (
    _label,
    localUserId,
    localSlotId,
  ) => {
    db = await databaseWithMigration();
    await db.query('insert into auth.users (id) values ($1), ($2)', [USER_ID, OTHER_USER_ID]);
    await db.query('insert into public.document_slots (id) values ($1), ($2)', [SLOT_ID, OTHER_SLOT_ID]);
    await db.query(
      'insert into public.repair_jobs (id, user_id, slot_id) values ($1, $2, $3)',
      [JOB_ID, USER_ID, SLOT_ID],
    );
    const contract = { ...CONTRACT, userId: localUserId };

    await expect(db.query(
      `insert into public.repair_local_jobs (
        job_id, user_id, slot_id, source_sha256, source_size,
        target_sha256, target_size, repair_contract, contract_key_id,
        claim_token_sha256, claim_expires_at
      ) values ($1, $2, $3, $4, 1200, $5, 1300, $6::jsonb,
                $7, $8, now() + interval '10 minutes')`,
      [JOB_ID, localUserId, localSlotId, SOURCE_HASH, TARGET_HASH,
        JSON.stringify(contract), CONTRACT_KEY_ID, CLAIM_HASH],
    )).rejects.toThrow();
  });
});
