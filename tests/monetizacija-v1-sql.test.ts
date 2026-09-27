/**
 * Monetizacija V1 (M2), krug 3: migracija 0207 IZVRSENA u stvarnom Postgresu (PGlite), dvaput.
 *
 * Nalaz pregleda kruga 3: kljucna SQL logika (apply_entitlement_upgrade, trigger snapshota,
 * backfill prije promjene prozora, drugi prolaz kao no-op) bila je dokazana samo regexima nad
 * tekstom migracije. Ovdje se izvrsava: stvarne migracije na kojima 0207 stoji, pa 0207, pa 0207
 * ponovno. Tvrdnje i baza su u tests/helpers/monetizacija-v1-sql.ts; mutacije koje dokazuju da
 * tvrdnje grizu su u tests/gate-mutations.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  catalogProblems,
  idempotencyProblems,
  runV1,
  snapshotProblems,
  upgradeSqlProblems,
  type V1Run,
} from './helpers/monetizacija-v1-sql';

const ROK = 120_000;

describe('0207 u stvarnom Postgresu', () => {
  let run: V1Run | null = null;

  afterEach(async () => {
    await run?.db.close();
    run = null;
  });

  it('drugi prolaz je no-op: katalog, pricing_changelog, prava i ogranicenja ostaju isti', async () => {
    run = await runV1();
    expect(await idempotencyProblems(run)).toEqual([]);
  }, ROK);

  it('katalog V1, cijena kroz set_product_price, specijalisticki u svakom Lektinom work_type CHECK-u, cancelled obveza', async () => {
    run = await runV1();
    expect(await catalogProblems(run.db)).toEqual([]);
  }, ROK);

  it('snapshot prava: staro pravo zadrzava kupljeni prozor, trigger snapshotira, katalog ne mijenja kupljeno', async () => {
    run = await runV1();
    expect(await snapshotProblems(run)).toEqual([]);
  }, ROK);

  it('apply_entitlement_upgrade: isto pravo, jednom, ista vrsta rada, samo dok je vezani rad ziv', async () => {
    run = await runV1();
    expect(await upgradeSqlProblems(run.db)).toEqual([]);
  }, ROK);
});
