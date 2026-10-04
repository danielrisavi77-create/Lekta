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
  constraintDropProblems,
  definerOwnerProblems,
  idempotencyProblems,
  partialRefundSqlProblems,
  privilegeProblems,
  runV1,
  snapshotProblems,
  upgradeRevertSqlProblems,
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

  it('krug 4: puni povrat uplate nadogradnje vraca placeni Repair (tocno stanje prije), dan 60 nije besplatan, drugi prolaz no-op', async () => {
    run = await runV1();
    expect(await upgradeRevertSqlProblems(run.db)).toEqual([]);
  }, ROK);

  it('Codex PR #217 M1: djelomican povrat se vodi u bazi; povrat prije pretvorbe je odbija, povrat nakon nje trazi rucni pregled', async () => {
    run = await runV1();
    expect(await partialRefundSqlProblems(run.db)).toEqual([]);
  }, ROK);
});

describe('0207: privilegije (Codex PR #217, M4)', () => {
  it('anon i authenticated nemaju nista na offer_codes ni EXECUTE na RPC-ima; service_role ima izricite grantove', async () => {
    const sZadanima = await runV1(undefined, { supabaseDefaults: true });
    const bez = await runV1();
    try {
      expect(await privilegeProblems(sZadanima.db, bez.db)).toEqual([]);
    } finally {
      await sZadanima.db.close();
      await bez.db.close();
    }
  }, ROK);
});

describe('0207: brisanje CHECK ogranicenja (Codex PR #217, M3)', () => {
  it('brisu se samo zadana ogranicenja s ocekivanim vrijednostima; nepoznato obara migraciju i ostaje', async () => {
    expect(await constraintDropProblems()).toEqual([]);
  }, ROK);
});

describe('0207: vlasnik SECURITY DEFINER funkcija (Codex PR #217 runda 2, M4)', () => {
  it('i kad 0207 primijeni druga uloga: tri funkcije pripadaju postgres, SECURITY DEFINER, prazan search_path', async () => {
    expect(await definerOwnerProblems()).toEqual([]);
  }, ROK);
});
