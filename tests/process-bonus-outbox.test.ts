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
import { referrerRewardSettlement, tryGrantReferrerReward } from '../supabase/functions/_shared/grant-referrer-reward';
import { fakeAdmin, argOf, eqs, writeOp, type FakeCall, type FakeResult } from './helpers/fake-supabase';
import { referrerRewardDecisionProblems, referrerRewardRetryProblems } from './helpers/monetizacija-v1-guards';

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

  it.each(['ip_match_fraud', 'monthly_cap_reached', 'no_pending_referral', 'ineligible_buyer', 'self_referral'])('trajna odluka %s: done s razlogom, samo dok redak ceka', async (reason) => {
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

/**
 * Nas pregled (M2, Codex popravka referral nagrade): insert prava (unique provider+order_id) moze
 * pasti na 23505 kad je pravo vec izdano ranijim pokusajem, a referral_signups nikad nije prijesao
 * u `rewarded` (izgubljen odgovor izmedju uspjesnog inserta i azuriranja). Fiksni slijed poziva
 * modula testira se laznim klijentom koji odgovara REDOM (bez table/op grananja): tocno onim redom
 * kojim tryGrantReferrerReward stvarno zove bazu.
 */
function sequentialAdmin(
  odgovori: Array<{ data?: unknown; error?: unknown; count?: number }>,
  authResult: { data: { user: { is_anonymous: boolean } | null }; error: unknown } = { data: { user: { is_anonymous: false } }, error: null },
) {
  const pozivi: string[] = [];
  const poziviDetalji: Array<{ tablica: string; operacije: Array<{ metoda: string; argumenti: unknown[] }> }> = [];
  let i = 0;
  const lanac = (tablica: string) => {
    const builder: Record<string, unknown> = {};
    const operacije: Array<{ metoda: string; argumenti: unknown[] }> = [];
    for (const m of ['select', 'insert', 'update', 'eq', 'not', 'gte', 'is', 'maybeSingle', 'single']) {
      builder[m] = (...argumenti: unknown[]) => { operacije.push({ metoda: m, argumenti }); return builder; };
    }
    // oxlint-disable-next-line unicorn/no-thenable
    builder.then = (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => {
      const r = odgovori[i] ?? { data: null, error: null };
      i += 1;
      pozivi.push(tablica);
      poziviDetalji.push({ tablica, operacije });
      return Promise.resolve({ data: null, error: null, count: null, ...r }).then(ok, fail);
    };
    return builder;
  };
  return { from: (tablica: string) => lanac(tablica), auth: { admin: { getUserById: async () => authResult } }, pozivi, poziviDetalji };
}

const SIGNUP = { id: 'signup-1', referrer_user_id: 'ref-1', referred_ip_hash: null };
const PRIJE_INSERTA = [
  { data: SIGNUP, error: null }, // referral_signups select (friend_rewarded)
  { data: [], error: null }, // report_generations (fraud provjera)
  { data: null, error: null, count: 0 }, // referral_signups count (mjesecni strop)
  { data: { id: SIGNUP.id }, error: null }, // atomicno preuzimanje signupa za ovaj order
];
const DUPLICATE_REWARD = { message: 'duplicate key value violates unique constraint "entitlements_provider_order_id_key"', code: '23505' };

describe('tryGrantReferrerReward: nagrada vec dodijeljena (23505) se zatvara idempotentno (M2)', () => {
  it('anonimni kupac ne dodjeljuje preporucitelju placeno pravo', async () => {
    const admin = sequentialAdmin([], { data: { user: { is_anonymous: true } }, error: null });
    expect(await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_1'))
      .toEqual({ granted: false, reason: 'ineligible_buyer' });
    expect(admin.pozivi).toEqual([]);
  });

  it('pad provjere identiteta kupca ostavlja obvezu za retry', async () => {
    const admin = sequentialAdmin([], { data: { user: null }, error: { message: 'auth down' } });
    expect(await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_1'))
      .toEqual({ granted: false, reason: 'error' });
    expect(admin.pozivi).toEqual([]);
  });

  it('odbijanje anonimnog kupca trajno zatvara obvezu bez nagrade', () => {
    expect(referrerRewardSettlement({ granted: false, reason: 'ineligible_buyer' }))
      .toEqual({ settled: true, reason: 'ineligible_buyer' });
  });
  it('23505 na insert: postojece pravo se procita i referral_signups dovrsi (granted, idempotentno)', async () => {
    const admin = sequentialAdmin([
      ...PRIJE_INSERTA,
      { data: null, error: DUPLICATE_REWARD }, // entitlements insert
      { data: { id: 'ent-postojeci' }, error: null }, // entitlements select po order_id
      { data: null, error: null }, // referral_signups update (dovrsavanje)
    ]);
    const ishod = await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_1');
    expect(ishod).toEqual({ granted: true });
  });

  it('23505, ali dovrsavanje azuriranja padne: ponovni pokusaj', async () => {
    const admin = sequentialAdmin([
      ...PRIJE_INSERTA,
      { data: null, error: DUPLICATE_REWARD },
      { data: { id: 'ent-postojeci' }, error: null },
      { data: null, error: { message: 'db down' } }, // update padne
    ]);
    const ishod = await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_1');
    expect(ishod).toEqual({ granted: false, reason: 'error' });
  });

  it('23505, ali postojece pravo se ne moze naci: ponovni pokusaj', async () => {
    const admin = sequentialAdmin([
      ...PRIJE_INSERTA,
      { data: null, error: DUPLICATE_REWARD },
      { data: null, error: null }, // lookup ne nadje nista
    ]);
    const ishod = await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_1');
    expect(ishod).toEqual({ granted: false, reason: 'grant_failed' });
  });

  it.each([1, 2])('pad citanja prije inserta (%i) ne dodjeljuje nagradu', async (failedRead) => {
    const replies = [...PRIJE_INSERTA];
    replies[failedRead] = { data: null, error: { message: 'db down' } };
    const admin = sequentialAdmin(replies);
    expect(await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_1'))
      .toEqual({ granted: false, reason: 'error' });
    expect(admin.pozivi).not.toContain('entitlements');
  });

  it('23505 iz drugog ogranicenja bez nagradnog prava ostaje pending', async () => {
    const admin = sequentialAdmin([
      ...PRIJE_INSERTA,
      { data: null, error: { message: 'duplicate referral code', code: '23505' } },
      { data: null, error: null },
    ]);
    expect(await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_1'))
      .toEqual({ granted: false, reason: 'grant_failed' });
  });

  it('drugi order ne smije preuzeti signup koji je vec rezervirao prvi', async () => {
    const admin = sequentialAdmin([
      { data: { ...SIGNUP, converted_order_id: 'pi_first' }, error: null },
    ]);
    expect(await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_second'))
      .toEqual({ granted: false, reason: 'no_pending_referral' });
    expect(admin.pozivi).toEqual(['referral_signups']);
  });

  it('izgubljena utrka pri preuzimanju signupa ne upisuje entitlement', async () => {
    const admin = sequentialAdmin([
      ...PRIJE_INSERTA.slice(0, 3),
      { data: null, error: null }, // drugi order je preuzeo redak
    ]);
    expect(await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_second'))
      .toEqual({ granted: false, reason: 'no_pending_referral' });
    expect(admin.pozivi).not.toContain('entitlements');
    const preuzimanje = admin.poziviDetalji.at(-1)!;
    expect(preuzimanje.tablica).toBe('referral_signups');
    expect(preuzimanje.operacije).toContainEqual({ metoda: 'eq', argumenti: ['status', 'friend_rewarded'] });
    expect(preuzimanje.operacije).toContainEqual({ metoda: 'is', argumenti: ['converted_order_id', null] });
  });

  it('isti order moze dovrsiti nagradu nakon prekida poslije rezervacije', async () => {
    const admin = sequentialAdmin([
      { data: { ...SIGNUP, converted_order_id: 'pi_1' }, error: null },
      ...PRIJE_INSERTA.slice(1, 3),
      { data: { id: 'ent-svjez' }, error: null },
      { data: null, error: null },
    ]);
    expect(await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_1'))
      .toEqual({ granted: true });
    expect(admin.pozivi.filter((p) => p === 'referral_signups')).toHaveLength(3);
  });

  it('isti rezervirani order moze dovrsiti insert i kad drugi signup u meduvremenu popuni mjesecni strop', async () => {
    const admin = sequentialAdmin([
      { data: { ...SIGNUP, converted_order_id: 'pi_1' }, error: null },
      { data: [], error: null },
      { data: null, error: null, count: 10 },
      { data: { id: 'ent-svjez' }, error: null },
      { data: null, error: null },
    ]);
    expect(await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_1'))
      .toEqual({ granted: true });
  });

  it('mjesecni strop ne prepisuje rezervaciju drugog ordera u utrci', async () => {
    const admin = sequentialAdmin([
      { data: SIGNUP, error: null },
      { data: [], error: null },
      { data: null, error: null, count: 10 },
      { data: null, error: null }, // CAS update vise ne nalazi slobodan signup
    ]);
    expect(await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_second'))
      .toEqual({ granted: false, reason: 'no_pending_referral' });
    expect(admin.pozivi).not.toContain('entitlements');
    expect(admin.poziviDetalji.at(-1)?.operacije)
      .toContainEqual({ metoda: 'is', argumenti: ['converted_order_id', null] });
  });

  it('negativna kontrola: svjez insert uspije, ali azuriranje referral_signups padne -> error (ne tihi granted:true)', async () => {
    const admin = sequentialAdmin([
      ...PRIJE_INSERTA,
      { data: { id: 'ent-svjez' }, error: null }, // entitlements insert uspije
      { data: null, error: { message: 'db down' } }, // referral_signups update padne
    ]);
    const ishod = await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_1');
    expect(ishod).toEqual({ granted: false, reason: 'error' });
  });

  it('negativna kontrola: svjez insert i azuriranje oboje uspiju -> granted, bez 23505 grane', async () => {
    const admin = sequentialAdmin([
      ...PRIJE_INSERTA,
      { data: { id: 'ent-svjez' }, error: null },
      { data: null, error: null },
    ]);
    const ishod = await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_1');
    expect(ishod).toEqual({ granted: true });
  });

  it('already_granted bez potvrdenog signupa nije trajna odluka', () => {
    expect(referrerRewardSettlement({ granted: false, reason: 'already_granted' })).toEqual({ settled: false, reason: 'already_granted' });
  });
});

/**
 * Codex pregled PR #217 runda 2, M2b: svaki uvjet podobnosti koji provodi zajednicka odluka ima
 * negativni test na razini tryGrantReferrerReward (ne ubrizganog granta). Uvjeti koje provodi
 * pozivatelj (iznos > 0, nadogradnja, povrat) mjere se u tests/webhook-mor-handler.test.ts i gore.
 */
describe('tryGrantReferrerReward: uvjeti podobnosti (Codex r2, M2b)', () => {
  it('gard referrerRewardDecisionProblems je cist nad pravim modulom (mutacije izvora su u gate-mutations)', async () => {
    expect(await referrerRewardDecisionProblems({ tryGrantReferrerReward, referrerRewardSettlement })).toEqual([]);
  });

  const nagradnoPravo = (admin: ReturnType<typeof sequentialAdmin>) =>
    admin.poziviDetalji.filter((p) => p.tablica === 'entitlements' && p.operacije.some((o) => o.metoda === 'insert'));

  it('samopreporuka (preporucitelj je sam kupac): self_referral, bez prava i bez daljnjih upita', async () => {
    const admin = sequentialAdmin([{ data: { ...SIGNUP, referrer_user_id: 'buyer-1' }, error: null }]);
    expect(await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_1'))
      .toEqual({ granted: false, reason: 'self_referral' });
    expect(admin.pozivi).toEqual(['referral_signups']);
  });

  it('samopreporuka trajno zatvara obvezu (ponovni pokusaj je ne mijenja)', () => {
    expect(referrerRewardSettlement({ granted: false, reason: 'self_referral' })).toEqual({ settled: true, reason: 'self_referral' });
  });

  it('kupac bez preporuke u stanju friend_rewarded: no_pending_referral, bez prava', async () => {
    const admin = sequentialAdmin([{ data: null, error: null }]);
    expect(await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_1'))
      .toEqual({ granted: false, reason: 'no_pending_referral' });
    expect(nagradnoPravo(admin)).toHaveLength(0);
  });

  it('IP preporucitelja se poklapa: ip_match_fraud, signup fraud_blocked, bez prava', async () => {
    const admin = sequentialAdmin([
      { data: { ...SIGNUP, referred_ip_hash: 'h-ista-mreza' }, error: null },
      { data: [{ ip_hash: 'h-ista-mreza' }], error: null },
      { data: { id: SIGNUP.id }, error: null }, // fraud_blocked
    ]);
    expect(await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_1'))
      .toEqual({ granted: false, reason: 'ip_match_fraud' });
    expect(nagradnoPravo(admin)).toHaveLength(0);
    expect(admin.poziviDetalji.at(-1)?.operacije).toContainEqual({ metoda: 'update', argumenti: [{ status: 'fraud_blocked' }] });
  });

  it('mjesecni strop (10 u 30 dana): monthly_cap_reached, signup converted bez nagrade', async () => {
    const admin = sequentialAdmin([
      { data: SIGNUP, error: null },
      { data: [], error: null },
      { data: null, error: null, count: 10 },
      { data: { id: SIGNUP.id }, error: null }, // converted uz ovaj order
    ]);
    expect(await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_1'))
      .toEqual({ granted: false, reason: 'monthly_cap_reached' });
    expect(nagradnoPravo(admin)).toHaveLength(0);
  });

  it('BASELINE: podoban kupac (ne anoniman, tudja preporuka, druga mreza, ispod stropa) dodjeljuje pravo preporucitelju', async () => {
    const admin = sequentialAdmin([
      ...PRIJE_INSERTA,
      { data: { id: 'ent-svjez' }, error: null },
      { data: null, error: null },
    ]);
    expect(await tryGrantReferrerReward(admin as never, 'buyer-1', 'diplomski', 'pi_1')).toEqual({ granted: true });
    const pravo = nagradnoPravo(admin);
    expect(pravo).toHaveLength(1);
    expect(pravo[0].operacije.find((o) => o.metoda === 'insert')?.argumenti[0]).toMatchObject({ user_id: 'ref-1', provider: 'internal' });
  });
});
