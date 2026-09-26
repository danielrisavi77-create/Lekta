import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
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
    expect(claimVersion).toBeGreaterThan(95n);
    expect(lifecycleVersion).toBeGreaterThan(claimVersion);
    expect(recoveryVersion).toBeGreaterThan(lifecycleVersion);

    const versions = names.map((name) => name.split('_', 1)[0]);
    expect(new Set(versions).size).toBe(versions.length);
  });
});
