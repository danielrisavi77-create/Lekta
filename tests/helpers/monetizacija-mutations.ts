/**
 * Dijeljeni pomocnici za mutacije Monetizacije V1 (T106: izdvojeno iz tests/gate-mutations.test.ts bez
 * izmjene tijela). Koriste ih tests/gate-mutations-monetizacija-*.test.ts; bonusOutboxModuleSource i
 * MUTATIONS u tests/gate-mutations.test.ts.
 */
import { expect } from 'vitest';
import { resolve } from 'node:path';
import { readTextLf } from './naplata-env';
import { V1_MIGRATION, privilegeProblems, readMigration, runV1 } from './monetizacija-v1-sql';

export const ROK_SQL = 180_000;

export function mutiraj(od: string, u: string): string {
  const sql = readMigration(V1_MIGRATION);
  const mutated = sql.replace(od, u);
  expect(mutated, `mutacija nije primijenjena: ${od.slice(0, 60)}`).not.toBe(sql);
  return mutated;
}

/** Kao mutiraj, ali regexom (neovisno o CRLF-u radne kopije). */
export function mutirajRe(od: RegExp, u: string): string {
  const sql = readMigration(V1_MIGRATION);
  const mutated = sql.replace(od, u);
  expect(mutated, `mutacija nije primijenjena: ${od.source.slice(0, 60)}`).not.toBe(sql);
  return mutated;
}

/** M4: privilegije se mjere u bazi sa zadanim privilegijama Supabasea i u bazi bez njih. */
export async function privilegijeNad(sql: string): Promise<string[]> {
  const sZadanima = await runV1(sql, { supabaseDefaults: true });
  const bez = await runV1(sql);
  try {
    return await privilegeProblems(sZadanima.db, bez.db);
  } finally {
    await sZadanima.db.close();
    await bez.db.close();
  }
}

export function bonusOutboxModuleSource(): string {
  return readTextLf(resolve(process.cwd(), 'supabase', 'functions', 'process-bonus-outbox', 'referrer-reward.ts'));
}
