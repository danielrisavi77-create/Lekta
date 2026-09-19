import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');

describe('versioning lokalnih WordReplica migracija', () => {
  it('nastavlja iza produkcijskog high-water marka bez promjene cetveroznamenkastog ugovora', () => {
    const names = readdirSync(migrationsDir);
    const claim = names.find((name) => name.endsWith('_repair_local_claims.sql'));
    const lifecycle = names.find((name) => name.endsWith('_repair_local_lifecycle.sql'));
    const recovery = names.find((name) => name.endsWith('_repair_local_claim_recovery.sql'));

    expect(claim).toBeDefined();
    expect(lifecycle).toBeDefined();
    expect(recovery).toBeDefined();
    expect(claim).toMatch(/^\d{4}_repair_local_claims\.sql$/);
    expect(lifecycle).toMatch(/^\d{4}_repair_local_lifecycle\.sql$/);
    expect(recovery).toMatch(/^\d{4}_repair_local_claim_recovery\.sql$/);

    const claimVersion = BigInt(claim!.split('_', 1)[0]);
    const lifecycleVersion = BigInt(lifecycle!.split('_', 1)[0]);
    const recoveryVersion = BigInt(recovery!.split('_', 1)[0]);
    const provenProductionFourDigitHighWater = 103n;
    expect(claimVersion).toBeGreaterThan(provenProductionFourDigitHighWater);
    expect(lifecycleVersion).toBeGreaterThan(claimVersion);
    expect(recoveryVersion).toBeGreaterThan(lifecycleVersion);

    const versions = names.map((name) => name.split('_', 1)[0]);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('release uputa navodi iste migracije koje gate stvarno provjerava', () => {
    const releaseGuide = readFileSync(join(root, 'docs', 'LOCAL_REPAIR_RELEASE.md'), 'utf8');
    const recoveryMigration = readFileSync(
      join(migrationsDir, '0106_repair_local_claim_recovery.sql'), 'utf8');

    expect(releaseGuide).toContain('migracije 0104-0106');
    expect(releaseGuide).not.toContain('migracije 0102-0104');
    expect(releaseGuide).not.toContain('migracije 0096-0098');
    expect(recoveryMigration).not.toContain('0096/0097');
  });

  it('izvrsava svaku lokalnu repair migraciju dvaput bez promjene rezultata', async () => {
    const db = new PGlite();
    try {
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
      const migrations = [
        '0104_repair_local_claims.sql',
        '0105_repair_local_lifecycle.sql',
        '0106_repair_local_claim_recovery.sql',
      ].map((name) => readFileSync(join(migrationsDir, name), 'utf8'));

      for (let round = 0; round < 2; round += 1) {
        for (const migration of migrations) await db.exec(migration);
      }

      const table = await db.query<{ name: string }>(
        `select relname as name from pg_class where relname = 'repair_local_jobs'`,
      );
      expect(table.rows).toEqual([{ name: 'repair_local_jobs' }]);
    } finally {
      await db.close();
    }
  });
});
