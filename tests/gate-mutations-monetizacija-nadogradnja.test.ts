/**
 * Mutacije Monetizacije V1: nadogradnja, povrat i djelomican povrat (krug 4, Codex M1).
 * T106: izdvojeno iz tests/gate-mutations.test.ts doslovno (isti naslov bloka i testova), da PGlite
 * testovi ne drze jednog Vitest radnika 137 s u jednoj datoteci. Ugovor isti: cisti baseline, pa mutacija
 * koja mora oboriti gard.
 */
import { describe, it, expect } from 'vitest';
import { partialRefundSqlProblems, runV1, upgradeRevertSqlProblems, upgradeSqlProblems } from './helpers/monetizacija-v1-sql';
import { ROK_SQL, mutiraj, mutirajRe } from './helpers/monetizacija-mutations';

/**
 * Monetizacija V1 (M2) krug 3: asinkroni gardovi. Zajednicko citanje pristupa se IZVRSAVA, a 0207 se
 * izvrsava u stvarnom Postgresu (PGlite, tests/helpers/monetizacija-v1-sql.ts). Isti ugovor kao
 * MUTATIONS: cisti baseline, pa mutacija koja mora oboriti gard.
 */
describe('mutacije: Monetizacija V1 izvrseni gardovi', () => {
  it('apply_entitlement_upgrade bez provjere vezanog slota: nadogradnja anonimiziranog rada obara gard', async () => {
    const mutated = mutiraj('  if v_ent.slots_used > 0 and not found then', '  if false then');
    const run = await runV1(mutated);
    try {
      expect((await upgradeSqlProblems(run.db)).some((p) => p.includes('anonimiziran vezani slot'))).toBe(true);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('krug 4: apply_entitlement_upgrade sa starom granicom (slot_expires_at > now) odbija istekao, a netaknut slot i obara gard', async () => {
    const mutated = mutirajRe(/and s\.fingerprint \?\| array\['authorNorm', 'titleNorm', 'headings'\]/, 'and s.slot_expires_at > now()');
    const run = await runV1(mutated);
    try {
      expect((await upgradeSqlProblems(run.db)).some((p) => p.includes('istekao prije 5 dana'))).toBe(true);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('krug 4: apply_entitlement_upgrade s rokom potrosnje i za vezano pravo odbija vezan Repair izvan roka i obara gard', async () => {
    const mutated = mutirajRe(/(or v_ent\.status <> 'active')/, '$1 or v_ent.purchase_expires_at <= now()');
    const run = await runV1(mutated);
    try {
      expect((await upgradeSqlProblems(run.db)).some((p) => p.includes('rok potrosnje istekao'))).toBe(true);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('krug 4: apply_entitlement_upgrade bez roka potrosnje za nevezano pravo obara gard', async () => {
    const mutated = mutirajRe(/if v_ent\.slots_used = 0 and v_ent\.purchase_expires_at <= now\(\) then/, 'if false then');
    const run = await runV1(mutated);
    try {
      expect((await upgradeSqlProblems(run.db)).some((p) => p.includes('nevezan izvan roka potrosnje'))).toBe(true);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('krug 4: povrat nadogradnje baseline cist nad svjezom bazom', async () => {
    const run = await runV1();
    try {
      expect(await upgradeRevertSqlProblems(run.db)).toEqual([]);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('krug 4: revert_entitlement_upgrade bez vracanja slota ostavlja produljen prozor i obara gard (dan 60 besplatan)', async () => {
    const mutated = mutirajRe(/  update public\.document_slots s\r?\n     set slot_expires_at = least\(/, '  update public.document_slots s\n     set slot_expires_at = greatest(');
    const run = await runV1(mutated);
    try {
      expect((await upgradeRevertSqlProblems(run.db)).some((p) => p.includes('dan 60'))).toBe(true);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('krug 4: povrat nadogradnje koji gasi pravo (umjesto vracanja Repaira) obara gard placenog Repaira', async () => {
    const mutated = mutirajRe(/         upgrade_reverted_at = now\(\)\r?\n   where id = v_ent\.id;/, "         upgrade_reverted_at = now(),\n         status = 'refunded'\n   where id = v_ent.id;");
    const run = await runV1(mutated);
    try {
      expect((await upgradeRevertSqlProblems(run.db)).some((p) => p.includes('Repair kupac kaznjen'))).toBe(true);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('krug 4: pretvorba koja ne pamti istek slota prije nadogradnje obara gard (ozivljen slot ostaje produljen)', async () => {
    const mutated = mutirajRe(/upgraded_from_slot_expires_at = v_slot_prije,/, 'upgraded_from_slot_expires_at = null,');
    const run = await runV1(mutated);
    try {
      expect((await upgradeRevertSqlProblems(run.db)).some((p) => p.includes('ozivljen slot'))).toBe(true);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('krug 4: povrat nadogradnje koji ozivljava vec ugaseno pravo obara gard', async () => {
    const mutated = mutirajRe(/  if v_ent\.status <> 'active' then\r?\n    return 'inactive';\r?\n  end if;\r?\n/, '');
    const run = await runV1(mutated);
    try {
      expect((await upgradeRevertSqlProblems(run.db)).some((p) => p.includes('ugasenog prava'))).toBe(true);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('Codex PR #217 M1: djelomican povrat baseline cist nad svjezom bazom', async () => {
    const run = await runV1();
    try {
      expect(await partialRefundSqlProblems(run.db)).toEqual([]);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('Codex PR #217 M1: pretvorba bez provjere djelomicnog povrata (stanje f466d454) obara gard', async () => {
    const mutated = mutirajRe(/  if v_ent\.refunded_cents > 0\r?\n     or exists \(/, '  if false\n     and exists (');
    const run = await runV1(mutated);
    try {
      const p = await partialRefundSqlProblems(run.db);
      expect(p.some((x) => x.startsWith('povrat prije pretvorbe: apply_entitlement_upgrade vraca upgraded'))).toBe(true);
      expect(p.some((x) => x.includes('povrat uplate nadogradnje prije pretvorbe'))).toBe(true);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('Codex PR #217 M1: pretvorba koja cita samo oznaku izvorne uplate (ne refunded_cents) obara gard', async () => {
    const mutated = mutirajRe(/  if v_ent\.refunded_cents > 0\r?\n     or exists \(/, '  if exists (');
    const run = await runV1(mutated);
    try {
      expect((await partialRefundSqlProblems(run.db)).some((x) => x.includes('samo refunded_cents'))).toBe(true);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('Codex PR #217 M1: povrat nakon pretvorbe koji ne javlja nadogradjeno pravo obara gard', async () => {
    const mutated = mutirajRe(/      v_ishod := 'upgraded_needs_review';/, "      v_ishod := 'noted';");
    const run = await runV1(mutated);
    try {
      expect((await partialRefundSqlProblems(run.db)).some((x) => x.includes('Final Pass tiho ostaje'))).toBe(true);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('Codex PR #217 M1: povrat koji ne vodi iznos u bazi obara gard', async () => {
    const mutated = mutirajRe(/set refunded_cents = greatest\(refunded_cents, coalesce\(p_refunded_cents, 0\)\)/, 'set refunded_cents = refunded_cents');
    const run = await runV1(mutated);
    try {
      expect((await partialRefundSqlProblems(run.db)).some((x) => x.includes('iznos se ne vodi u bazi'))).toBe(true);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);
});
