/**
 * process-bonus-outbox, obveza `referrer_reward` (F21, stavka 1): nagrada preporucitelju se ne
 * isplacuje za vracen novac.
 *
 * Kriterij izvan diffa: docs/agents/orchestrator-backlog.md F21 (1) "obveza referrer_reward u
 * bonus_outbox koja ostane 'pending' ne otkazuje se pri povratu, a process-bonus-outbox je kasnije
 * izvrsava bez citanja oznake povrata" i MONETIZACIJA_V1.md odjeljak 29 "refund zatvara entitlement i
 * sve vezane referral/bonus posljedice". Mjeri se izvrseni modul nad laznom bazom.
 */
import { describe, it, expect } from 'vitest';

import { runReferrerRewardObligation, orderFullyRefunded, type ReferrerRewardDb } from '../supabase/functions/process-bonus-outbox/referrer-reward';
import { fakeAdmin, argOf, eqs, writeOp, type FakeCall, type FakeResult } from './helpers/fake-supabase';
import { referrerRewardRetryProblems } from './helpers/monetizacija-v1-guards';

const ROW = { id: 'ob-1', user_id: 'buyer-1', order_id: 'pi_1', payload: { userId: 'buyer-1', workType: 'diplomski' } };
const REFUND_DETAILS = ['refund_pending', 'refund_consequences_failed', 'refund_without_entitlement', 'refunded'];

/** Lazna baza u kojoj povrat "stize" nakon zadanog broja citanja oznake (0 = vec je tu). */
function scenario(opts: { refundAfterMarkerReads?: number | null; entitlementRefunded?: boolean; markerError?: boolean } = {}) {
  let markerReads = 0;
  const db = fakeAdmin((c: FakeCall): FakeResult | undefined => {
    if (c.table === 'webhook_events' && writeOp(c) === 'select') {
      if (opts.markerError) return { error: { message: 'db down' } };
      const refundedNow = opts.refundAfterMarkerReads != null && markerReads >= opts.refundAfterMarkerReads;
      markerReads += 1;
      return { data: refundedNow ? [{ id: 'evt-refund' }] : [] };
    }
    if (c.table === 'entitlements' && writeOp(c) === 'select') {
      if (eqs(c).status === 'refunded') return { data: opts.entitlementRefunded ? [{ id: 'ent-1' }] : [] };
      // pullReferralSignupReward: nagrada upravo izdana, nepotrosena
      return { data: { id: 'reward-ent', slots_used: 0 } };
    }
    if (c.table === 'referral_signups' && writeOp(c) === 'select') {
      return { data: [{ id: 'signup-1', referrer_reward_entitlement_id: 'reward-ent' }] };
    }
    return undefined;
  });
  const granted: string[] = [];
  const grant = async (_a: never, _u: string, _w: string, orderId: string) => {
    granted.push(orderId);
    return { granted: true };
  };
  return { db, granted, grant };
}

const outboxWrites = (calls: FakeCall[]) => calls.filter((c) => c.table === 'bonus_outbox' && writeOp(c) !== 'select');

describe('process-bonus-outbox: referrer_reward i povrat', () => {
  it('bez povrata: nagrada se dodjeljuje, redak ne dira modul (done postavlja radnik)', async () => {
    const { db, granted, grant } = scenario();
    const ishod = await runReferrerRewardObligation(db.admin as unknown as ReferrerRewardDb, ROW, grant);
    expect(ishod).toBe('granted');
    expect(granted).toEqual(['pi_1']);
    expect(outboxWrites(db.calls)).toHaveLength(0);
    const oznaka = db.calls.find((c) => c.table === 'webhook_events')!;
    expect(eqs(oznaka)).toEqual({ provider: 'stripe', order_id: 'pi_1' });
    expect(oznaka.ops.find((o) => o.op === 'in')?.args).toEqual(['outcome_detail', REFUND_DETAILS]);
  });

  it('povrat zabiljezen PRIJE izvrsenja: nagrada se NE dodjeljuje, obveza se otkazuje (samo dok ceka)', async () => {
    const { db, granted, grant } = scenario({ refundAfterMarkerReads: 0 });
    const ishod = await runReferrerRewardObligation(db.admin as unknown as ReferrerRewardDb, ROW, grant);
    expect(ishod).toBe('cancelled_refunded');
    expect(granted).toEqual([]);
    const w = outboxWrites(db.calls);
    expect(w).toHaveLength(1);
    expect(argOf(w[0], 'update')).toEqual({ status: 'cancelled', last_error: 'refunded' });
    expect(eqs(w[0])).toEqual({ id: 'ob-1', status: 'pending' });
  });

  it('pravo kupca vec refunded (bez oznake u inboxu): isto se ne isplacuje', async () => {
    const { db, granted, grant } = scenario({ entitlementRefunded: true });
    expect(await runReferrerRewardObligation(db.admin as unknown as ReferrerRewardDb, ROW, grant)).toBe('cancelled_refunded');
    expect(granted).toEqual([]);
  });

  it('povrat stigao IZMEDJU provjere i dodjele: izdana nagrada se povlaci i obveza otkazuje', async () => {
    const { db, granted, grant } = scenario({ refundAfterMarkerReads: 1 });
    const ishod = await runReferrerRewardObligation(db.admin as unknown as ReferrerRewardDb, ROW, grant);
    expect(ishod).toBe('revoked_refunded');
    expect(granted).toEqual(['pi_1']);
    const voided = db.calls.find((c) => c.table === 'entitlements' && writeOp(c) === 'update');
    expect(voided && argOf(voided, 'update')).toEqual({ status: 'void' });
    expect(voided && eqs(voided)).toEqual({ id: 'reward-ent' });
    const w = outboxWrites(db.calls);
    expect(w.map((c) => argOf(c, 'update'))).toEqual([{ status: 'cancelled', last_error: 'refunded' }]);
  });

  it('pad citanja oznake BACA (redak ostaje pending za ponovni pokusaj), nagrada se ne dodjeljuje naslijepo', async () => {
    const { db, granted, grant } = scenario({ markerError: true });
    await expect(runReferrerRewardObligation(db.admin as unknown as ReferrerRewardDb, ROW, grant)).rejects.toThrow(/refund_marker_lookup/);
    expect(granted).toEqual([]);
    expect(outboxWrites(db.calls)).toHaveLength(0);
  });

  it('payload bez workType baca prije ikakvog citanja', async () => {
    const { db, grant } = scenario();
    await expect(
      runReferrerRewardObligation(db.admin as unknown as ReferrerRewardDb, { ...ROW, payload: {} }, grant),
    ).rejects.toThrow(/workType/);
    expect(db.calls).toHaveLength(0);
  });

  it('orderFullyRefunded cita inbox pa pravo kupca', async () => {
    const { db } = scenario({ entitlementRefunded: true });
    expect(await orderFullyRefunded(db.admin as unknown as ReferrerRewardDb, 'pi_1')).toBe(true);
    expect(db.calls.map((c) => c.table)).toEqual(['webhook_events', 'entitlements']);
    expect(eqs(db.calls[1])).toEqual({ provider: 'stripe', order_id: 'pi_1', status: 'refunded' });
  });
});

/**
 * KRUG 4 (6c): povrat UPLATE NADOGRADNJE gasi isti redak (order_id = Repair uplata) u `refunded`.
 * To nije povrat izvorne Repair uplate, pa nagrada preporucitelju za Repair ostaje.
 */
describe('process-bonus-outbox: povrat nadogradnje nije povrat izvorne uplate', () => {
  /** Oznake punog povrata po PaymentIntentu i retci prava kupca u stanju refunded. */
  function world(markeri: string[], refundedRows: Array<{ id: string; upgrade_order_id: string | null }>) {
    return fakeAdmin((c: FakeCall): FakeResult | undefined => {
      if (c.table === 'webhook_events' && writeOp(c) === 'select') {
        return { data: markeri.includes(String(eqs(c).order_id)) ? [{ id: `evt-${String(eqs(c).order_id)}` }] : [] };
      }
      if (c.table === 'entitlements' && writeOp(c) === 'select') return { data: eqs(c).status === 'refunded' ? refundedRows : [] };
      return undefined;
    });
  }
  const nadogradjen = { id: 'ent-1', upgrade_order_id: 'pi_up' };

  it('vracena SAMO uplata nadogradnje (oznaka na pi_up): Repair uplata NIJE vracena, nagrada se dodjeljuje', async () => {
    const db = world(['pi_up'], [nadogradjen]);
    expect(await orderFullyRefunded(db.admin as unknown as ReferrerRewardDb, 'pi_1')).toBe(false);
    const granted: string[] = [];
    const ishod = await runReferrerRewardObligation(db.admin as unknown as ReferrerRewardDb, ROW, async (_a, _u, _w, o) => { granted.push(o); return { granted: true }; });
    expect(ishod).toBe('granted');
    expect(granted).toEqual(['pi_1']);
  });

  it('vracena izvorna Repair uplata nadogradjenog prava (oznaka na pi_1): vraceno', async () => {
    expect(await orderFullyRefunded(world(['pi_1'], [nadogradjen]).admin as unknown as ReferrerRewardDb, 'pi_1')).toBe(true);
  });

  it('nadogradjen redak refunded bez ikakve oznake (npr. rucno ugasen): fail-safe, vraceno', async () => {
    expect(await orderFullyRefunded(world([], [nadogradjen]).admin as unknown as ReferrerRewardDb, 'pi_1')).toBe(true);
  });

  it('nenadogradjen redak refunded: vraceno (kao i dosad)', async () => {
    expect(await orderFullyRefunded(world([], [{ id: 'ent-1', upgrade_order_id: null }]).admin as unknown as ReferrerRewardDb, 'pi_1')).toBe(true);
  });
});

/**
 * Codex pregled PR #217, M2: ishod dodjele se cita. Prolazan pad (`grant_failed`, `error`) BACA, pa
 * radnik redak ostavlja `pending` i ponovi ga; trajna odluka zatvara obvezu kao `done` s razlogom i
 * vise se ne ponavlja. Isti gard (referrerRewardRetryProblems) mutira tests/gate-mutations.test.ts.
 */
describe('process-bonus-outbox: ishod dodjele nagrade (M2)', () => {
  it('gard referrerRewardRetryProblems je cist nad pravim modulom', async () => {
    expect(await referrerRewardRetryProblems(runReferrerRewardObligation)).toEqual([]);
  });

  it.each(['grant_failed', 'error'])('%s: obveza ostaje pending (modul baca), bez zapisa u bonus_outbox', async (reason) => {
    const { db } = scenario();
    await expect(
      runReferrerRewardObligation(db.admin as unknown as ReferrerRewardDb, ROW, async () => ({ granted: false, reason })),
    ).rejects.toThrow(`referrer_reward_retry: ${reason}`);
    expect(outboxWrites(db.calls)).toHaveLength(0);
  });

  it('nepoznat oblik rezultata (npr. undefined) nije zatvaranje nego ponovni pokusaj', async () => {
    const { db } = scenario();
    await expect(
      runReferrerRewardObligation(db.admin as unknown as ReferrerRewardDb, ROW, async () => undefined),
    ).rejects.toThrow('referrer_reward_retry: nepoznat_ishod');
  });

  it.each(['ip_match_fraud', 'monthly_cap_reached', 'no_pending_referral'])('trajna odluka %s: done s razlogom, samo dok redak ceka', async (reason) => {
    const { db } = scenario();
    const ishod = await runReferrerRewardObligation(db.admin as unknown as ReferrerRewardDb, ROW, async () => ({ granted: false, reason }));
    expect(ishod).toBe('declined');
    const w = outboxWrites(db.calls);
    expect(w).toHaveLength(1);
    expect(argOf(w[0], 'update')).toMatchObject({ status: 'done', last_error: null, done_reason: reason });
    expect(eqs(w[0])).toEqual({ id: 'ob-1', status: 'pending' });
  });

  it('negativna kontrola: nagrada dodijeljena (granted) ne pise done_reason; redak zatvara radnik', async () => {
    const { db, granted, grant } = scenario();
    expect(await runReferrerRewardObligation(db.admin as unknown as ReferrerRewardDb, ROW, grant)).toBe('granted');
    expect(granted).toEqual(['pi_1']);
    expect(outboxWrites(db.calls)).toHaveLength(0);
  });
});
