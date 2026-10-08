/**
 * Mutacije Monetizacije V1: nagrada preporucitelja, citanje pristupa, katalog i 0207 baseline.
 * T106: izdvojeno iz tests/gate-mutations.test.ts doslovno (isti naslov bloka i testova), da PGlite
 * testovi ne drze jednog Vitest radnika 137 s u jednoj datoteci. Ugovor isti: cisti baseline, pa mutacija
 * koja mora oboriti gard.
 */
import { describe, it, expect } from 'vitest';
import esbuild from 'esbuild';
import { resolve } from 'node:path';
import { readTextLf } from './helpers/naplata-env';
import { quoteUpgrade, readBoundSlotIntact } from '../src/report/upgrade';
import { accessRowsProblems, referrerRewardDecisionProblems, referrerRewardRetryProblems, boundSlotReadProblems } from './helpers/monetizacija-v1-guards';
import type * as GrantModul from '../supabase/functions/_shared/grant-referrer-reward';
import type * as RadnikModul from '../supabase/functions/process-bonus-outbox/referrer-reward';
import { ACTIVE_SLOT_SELECT, readAccessRows } from '../src/report/entitlement-access';
import type { SlotRow } from '../src/report/slot-logic';
import { catalogProblems, idempotencyProblems, runV1, snapshotProblems, upgradeSqlProblems } from './helpers/monetizacija-v1-sql';
import { ROK_SQL, bonusOutboxModuleSource, mutirajRe } from './helpers/monetizacija-mutations';

/**
 * Monetizacija V1 (M2) krug 3: asinkroni gardovi. Zajednicko citanje pristupa se IZVRSAVA, a 0207 se
 * izvrsava u stvarnom Postgresu (PGlite, tests/helpers/monetizacija-v1-sql.ts). Isti ugovor kao
 * MUTATIONS: cisti baseline, pa mutacija koja mora oboriti gard.
 */
describe('mutacije: Monetizacija V1 izvrseni gardovi', () => {
  /**
   * Codex pregled PR #217 runda 2: mutacija nagrade mora pogoditi PRODUKCIJSKI izvor, ne ubrizganu
   * funkciju. Tekst supabase/functions/_shared/grant-referrer-reward.ts se mijenja zamjenom, a
   * mutirani modul i radnik koji ga uvozi (process-bonus-outbox/referrer-reward.ts) prevode se
   * esbuildom i stvarno izvrsavaju; radnikov uvoz zajednicke odluke dobiva MUTIRANI modul. Zamjena
   * koja ne pogodi tekst obara test, pa gard ne moze tiho postati slijep nakon preoblikovanja izvora.
   * Bez privremenih datoteka: modulski runner Vitesta odbija uvoz izvan korijena projekta.
   */
  const GRANT_IZVOR = resolve(process.cwd(), 'supabase', 'functions', '_shared', 'grant-referrer-reward.ts');

  function mutirajNagradu(od: string, u: string): string {
    const izvor = readTextLf(GRANT_IZVOR);
    const mutiran = izvor.replace(od, u);
    expect(mutiran, `zamjena nije pogodila izvor nagrade: ${od}`).not.toBe(izvor);
    return mutiran;
  }

  /** Izvrsi TypeScript izvor kao CommonJS modul; svaki uvoz mora biti zadan u `uvozi`. */
  function izvrsiIzvor(izvor: string, uvozi: Record<string, unknown>): unknown {
    const { code } = esbuild.transformSync(izvor, { loader: 'ts', format: 'cjs' });
    const modul: { exports: Record<string, unknown> } = { exports: {} };
    const zahtjev = (ime: string): unknown => {
      if (!(ime in uvozi)) throw new Error(`neocekivan uvoz u mutiranom izvoru: ${ime}`);
      return uvozi[ime];
    };
    new Function('module', 'exports', 'require', code)(modul, modul.exports, zahtjev);
    return modul.exports;
  }

  async function nagradniModuliIz(grantIzvor: string) {
    const grant = izvrsiIzvor(grantIzvor, {}) as typeof GrantModul;
    const worker = izvrsiIzvor(bonusOutboxModuleSource(), {
      '../_shared/grant-referrer-reward.ts': grant,
      '../webhook-mor/handler.ts': await import('../supabase/functions/webhook-mor/handler'),
    }) as typeof RadnikModul;
    return { grant, worker };
  }

  it('Codex PR #217 r2: nemutirani izvor nagrade kroz isti ucitavac je cist (gard odluke i gard radnika)', async () => {
    const { grant, worker } = await nagradniModuliIz(readTextLf(GRANT_IZVOR));
    expect(await referrerRewardDecisionProblems(grant)).toEqual([]);
    expect(await referrerRewardRetryProblems(worker.runReferrerRewardObligation)).toEqual([]);
  });

  it('Codex PR #217 M2: izvor koji svaki ishod zatvara (stanje f466d454, zanemaren ishod) obara oba garda', async () => {
    const { grant, worker } = await nagradniModuliIz(mutirajNagradu(
      'return { settled: r.granted === false && TRAJNI_RAZLOZI.has(reason), reason };',
      'return { settled: true, reason };',
    ));
    const radnik = await referrerRewardRetryProblems(worker.runReferrerRewardObligation);
    expect(radnik.some((x) => x.startsWith('grant_failed:'))).toBe(true);
    expect(radnik.some((x) => x.startsWith('error:'))).toBe(true);
    expect((await referrerRewardDecisionProblems(grant)).some((x) => x.startsWith('prolazan ishod'))).toBe(true);
  });

  it('Codex PR #217 M2: izvor u kojem je ip_match_fraud prolazan pad (ponavlja se) obara gard radnika', async () => {
    const { worker } = await nagradniModuliIz(mutirajNagradu("'self_referral', 'ip_match_fraud', ", "'self_referral', "));
    expect((await referrerRewardRetryProblems(worker.runReferrerRewardObligation)).some((x) => x.includes('ip_match_fraud se ponavlja'))).toBe(true);
  });

  it.each([
    ['anonimni kupac', "    if (buyer.user.is_anonymous) return { granted: false, reason: 'ineligible_buyer' };\n", ''],
    ['samopreporuka', "    if (signup.referrer_user_id === buyerUserId) return { granted: false, reason: 'self_referral' };\n", ''],
    ['IP preporucitelja se poklapa', 'referrerIpHashes.has(signup.referred_ip_hash)', 'false'],
    ['mjesecni strop', 'count >= MAX_REWARDED_PER_MONTH && !signup.converted_order_id', 'false'],
    // Codex pregled delte (G-1): filtri upita, ne samo grane odluke.
    ['signup vec nagradjen', "      .eq('referred_user_id', buyerUserId)\n      .eq('status', 'friend_rewarded')\n", "      .eq('referred_user_id', buyerUserId)\n"],
    ['IP trece osobe', "      .eq('user_id', signup.referrer_user_id)\n", ''],
    // Filtri upita brojanja mjesecnog stropa (rezultat ispod stropa ne smije zbrajati tudje ni nenagradjene retke).
    ['brojanje stropa', "      .eq('referrer_user_id', signup.referrer_user_id)\n      .eq('status', 'rewarded')\n", "      .eq('status', 'rewarded')\n"],
    ['brojanje stropa', "      .eq('referrer_user_id', signup.referrer_user_id)\n      .eq('status', 'rewarded')\n", "      .eq('referrer_user_id', signup.referrer_user_id)\n"],
    ['signup preuzeo drugi order', 'signup.converted_order_id && signup.converted_order_id !== buyerOrderId', 'false'],
    ['signup preuzeo drugi order', 'signup.converted_order_id && signup.converted_order_id !== buyerOrderId', 'signup.converted_order_id && signup.converted_order_id === buyerOrderId'],
  ])('Codex PR #217 r2 M2b: izvor bez uvjeta "%s" obara gard odluke', async (uvjet, od, u) => {
    const { grant } = await nagradniModuliIz(mutirajNagradu(od, u));
    expect((await referrerRewardDecisionProblems(grant)).some((x) => x.startsWith(`${uvjet}:`))).toBe(true);
  });

  it('readAccessRows: baseline cist; citanje koje guta gresku upita obara gard', async () => {
    expect(await accessRowsProblems(readAccessRows)).toEqual([]);
    const mutant: typeof readAccessRows = async (db, u, w, n) => {
      const r = await readAccessRows(db, u, w, n);
      return r.ok ? r : { ok: true, activeSlots: [], entitlements: [] };
    };
    expect((await accessRowsProblems(mutant)).some((p) => p.includes('"nema prava"'))).toBe(true);
  });

  it('krug 4: citanje pristupa koje slot uzima bez obzira na status prava (stanje kruga 3) obara gard povrata nadogradnje', async () => {
    expect(await accessRowsProblems(readAccessRows)).toEqual([]);
    const mutant: typeof readAccessRows = async (db, u, w, n) => {
      const r = await readAccessRows(db, u, w, n);
      if (!r.ok) return r;
      // Slotovi kao prije kruga 4: svaki zivi slot, bez veze na entitlement_id i status prava.
      const raw = await db.from('document_slots').select(ACTIVE_SLOT_SELECT).eq('user_id', u).eq('work_type', w).gt('slot_expires_at', n);
      const activeSlots = (Array.isArray(raw.data) ? raw.data : []).map((x) => {
        const s = x as Record<string, unknown>;
        return { id: String(s.id), workType: w, fingerprint: s.fingerprint, slotExpiresAt: String(s.slot_expires_at) } as SlotRow;
      });
      return { ...r, activeSlots };
    };
    expect((await accessRowsProblems(mutant)).some((p) => p.includes('povrat nadogradnje') && p.includes('umjesto 402'))).toBe(true);
  });

  it('krug 4: citanje vezanog slota po isteku prozora (stara granica) obara gard kredita za popravak', async () => {
    expect(await boundSlotReadProblems(readBoundSlotIntact, quoteUpgrade)).toEqual([]);
    const staro: typeof readBoundSlotIntact = async (admin, id) => {
      const q = admin.from('document_slots').select('id, fingerprint, slot_expires_at').eq('entitlement_id', id);
      const { data, error } = await q;
      if (error) return { ok: false, error: String(error) };
      const zivi = (Array.isArray(data) ? data : []).filter((r) => Date.parse(String((r as Record<string, unknown>).slot_expires_at)) > Date.UTC(2026, 8, 27));
      return { ok: true, intact: zivi.length > 0 };
    };
    expect((await boundSlotReadProblems(staro, quoteUpgrade)).some((p) => p.includes('istekao prije 5 dana'))).toBe(true);
    const bezOtiska: typeof readBoundSlotIntact = async (admin, id) => {
      const r = await readBoundSlotIntact(admin, id);
      return r.ok ? { ok: true, intact: true } : r;
    };
    expect((await boundSlotReadProblems(bezOtiska, quoteUpgrade)).some((p) => p.includes('anonimiziran vezani slot'))).toBe(true);
  });

  it('catalogProblems: baseline cist nad 0207', async () => {
    const run = await runV1();
    try {
      expect(await catalogProblems(run.db)).toEqual([]);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('catalogProblems: do_obrane ostaje active=true -> gard obara', async () => {
    const mutated = mutirajRe(/set active = false(\r?\n\s+where id in \('slot_zavrsni_do_obrane')/, 'set active = true$1');
    const run = await runV1(mutated);
    try {
      expect((await catalogProblems(run.db)).some((p) => p.startsWith('slot_zavrsni_do_obrane:') || p.startsWith('slot_diplomski_do_obrane:'))).toBe(true);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('catalogProblems: specijalisticki izostavljen iz work_type CHECK-a repair_jobs -> gard obara', async () => {
    const mutated = mutirajRe(
      /(add constraint repair_jobs_work_type_check\r?\n\s+check \(work_type in \('seminarski', 'zavrsni', 'diplomski', )'specijalisticki', /,
      '$1',
    );
    const run = await runV1(mutated);
    try {
      expect((await catalogProblems(run.db)).some((p) => p.startsWith('repair_jobs: work_type CHECK'))).toBe(true);
    } finally {
      await run.db.close();
    }
  }, ROK_SQL);

  it('0207 baseline: idempotencija, snapshot i nadogradnja u bazi su cisti', async () => {
    const run = await runV1();
    try {
      // Nadogradnja prva: snapshotProblems mijenja katalog (namjerno, da dokaze da kupljeno ostaje).
      expect(await upgradeSqlProblems(run.db)).toEqual([]);
      expect(await snapshotProblems(run)).toEqual([]);
    } finally {
      await run.db.close();
    }
    const drugi = await runV1();
    try {
      expect(await idempotencyProblems(drugi)).toEqual([]);
    } finally {
      await drugi.db.close();
    }
  }, ROK_SQL);
});
