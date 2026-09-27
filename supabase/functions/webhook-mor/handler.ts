// Lekta Edge Function: webhook-mor, JEZGRA HANDLERA (Deno i Node).
//
// Izdvojeno iz index.ts 2026-09-26 (F18 krug 2) da se put handlera moze IZVRSITI u testu:
// index.ts cita okolinu i stvara Supabase klijent, a ovdje je sva obrada dogadjaja. Opis toka,
// odluka i povijesnih razloga stoji u zaglavlju index.ts i uz svaki korak nize.
//
// deno-lint-ignore-file no-explicit-any
import { readTextBounded } from '../_shared/read-body.ts';
import {
  verifyStripeSignature,
  parseStripeEvent,
  isoAfterDays,
  isPassProduct,
  makePassCouponCode,
  PASS_COUPON_VALID_DAYS,
  buildEntitlementInsert,
  entitlementSnapshotOf,
  acceptEvent,
  classifyStripeEvent,
  isNotableIgnore,
  isFullRefund,
  chargedAmountVerdict,
  type ChargedAmountVerdict,
  type StripeEvent,
  type StripeWebhookPayload,
} from '../../../src/report/webhook.ts';
import { isSoldByLektaCheckout, mapProductRow, type Product } from '../../../src/catalog/products-catalog.ts';
import { stripeAmountCents } from '../../../src/report/checkout.ts';
import {
  validateReferral,
  referralRewardEntitlement,
  rewardIsPullable,
  semesterStart,
  REFERRAL_WELCOME_DISCOUNT,
} from '../../../src/report/referral.ts';
import { tryGrantReferrerReward } from '../_shared/grant-referrer-reward.ts';
import { mapUpgradeSourceRow, quoteUpgrade, readBoundSlotLive, UPGRADE_SOURCE_COLUMNS } from '../../../src/report/upgrade.ts';

const PROVIDER = 'stripe';

/**
 * `outcome_detail` inbox zapisa koji znace da je za PaymentIntent zabiljezen PUNI povrat. Uplata
 * koja stigne nakon (ili istodobno s) takvim zapisom ne smije ostaviti aktivno pravo ni otvorenu
 * rucnu narudzbu (premium_human): obje grane uplate prvo pisu, pa citaju oznaku.
 * `refund_pending` se upisuje PRIJE citanja prava i ostaje i kad obrada povrata padne.
 * `refund_consequences_failed` znaci da je pravo vec ugaseno, a sporedne posljedice (rucna narudzba,
 * pass kupon) jos nisu zatvorene i Stripe povrat ponavlja; i to je zabiljezen puni povrat.
 */
export const REFUND_MARKERS = ['refund_pending', 'refund_consequences_failed', 'refund_without_entitlement', 'refunded'];

/**
 * Sve sto handler dobiva izvana. Okolina (`Deno.env`) i Supabase klijent se citaju SAMO u
 * index.ts; ovdje stizu kao vrijednosti, pa se handler moze izvrsiti u Vitestu s laznom bazom
 * (tests/webhook-mor-handler.test.ts). Tako se kriteriji F18 (entitlement, duplikat, povrat)
 * mjere na stvarnom putu handlera, a ne samo na cistim funkcijama iz src/report/webhook.ts.
 */
export interface WebhookDeps {
  /** Service role klijent; stvara se tek nakon provjere potpisa, kao i prije izdvajanja. */
  admin: () => any;
  /**
   * Signing secret Stripe webhook endpointa (`whsec_...`). Prazno = potpis se ne moze
   * provjeriti, pa `verifyStripeSignature` odbija SVE dogadjaje s razlogom `missing_secret`.
   * Namjerno fail-closed.
   */
  webhookSecret: string;
  /** Testni (livemode=false) dogadjaji se prihvacaju samo uz izricitu zastavicu. */
  allowTestMode: boolean;
  /** Sat u milisekundama; samo testovi ga zamjenjuju. */
  now?: () => number;
  /** Nagrada preporucitelju (0013); samo testovi je zamjenjuju. */
  grantReferrerReward?: typeof tryGrantReferrerReward;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Postgres kod za povredu unique ogranicenja. */
const UNIQUE_VIOLATION = '23505';

/**
 * Kod greske baze (npr. `23505`) bez `any`: PostgREST gresku vraca kao objekt nepoznatog oblika,
 * pa se `code` cita tek nakon provjere da postoji i da je niz znakova.
 */
function dbErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** Tekst greske baze (samo za log i inbox, nikad za odgovor). */
function dbErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
}

/** Retci odgovora baze kao zapisi; sve sto nije niz objekata je prazan popis. */
function dbRows(data: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(data)) return [];
  return data.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null);
}

// Razrijesi referrer iz koda. Partner kodovi u partner_accounts.referral_code.
// TODO(integracija): registar retail korisnickih kodova (zasad samo partnerski).
async function resolveReferrer(admin: any, code: string): Promise<string | null> {
  const { data } = await admin.from('partner_accounts').select('user_id').eq('referral_code', code).maybeSingle();
  return data?.user_id ?? null;
}

// Atribucija referala (sekcija 8): tek uz TEK kreiran entitlement (pozivatelj to jamci).
async function attributeReferral(admin: any, ev: StripeEvent): Promise<void> {
  const referrerUserId = await resolveReferrer(admin, ev.referralCode);
  if (!referrerUserId) return; // nepoznat kod

  // referred smije imati referral samo na PRVU kupnju (bez ranijeg entitlementa osim ovog ordera)
  const { count: prior } = await admin
    .from('entitlements')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ev.userId)
    .neq('order_id', ev.orderId);

  // krediti referrera u tekucem semestru (cap 5)
  const { count: credits } = await admin
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_user_id', referrerUserId)
    .eq('status', 'credited')
    .gte('credited_at', semesterStart(Date.now()));

  const decision = validateReferral({
    referrerUserId,
    referredUserId: ev.userId,
    referredHasPriorEntitlement: (prior ?? 0) > 0,
    referrerCreditsThisSemester: credits ?? 0,
  });
  if (!decision.ok) {
    console.warn('webhook-mor referral rejected', { reason: decision.reason, orderId: ev.orderId });
    return;
  }

  // AUD-28: ON CONFLICT (converted_order_id) DO NOTHING preko unique constraint-a
  // referrals_converted_order_key (0024). Retry istog ordera NE stvara drugi referral kredit.
  const { data: refIns } = await admin
    .from('referrals')
    .upsert({
      referrer_user_id: referrerUserId,
      referred_user_id: ev.userId,
      code: ev.referralCode,
      status: 'credited',
      converted_order_id: ev.orderId,
      credited_at: new Date().toISOString(),
    }, { onConflict: 'converted_order_id', ignoreDuplicates: true })
    .select('id');

  // Kad je upsert preskocen (postojeci kredit za ovaj order), refetch postojeceg reda da interna
  // nagrada koristi ISTI referral.id (order_id = reward:referral:{id}); tako ju unique(provider,
  // order_id) deduplicira i retry ne kreira drugu nagradu (novi id -> novi order_id -> nema guarda).
  let refId: string | null = refIns && refIns.length === 1 ? refIns[0].id : null;
  if (!refId) {
    const { data: existingRef } = await admin
      .from('referrals')
      .select('id')
      .eq('converted_order_id', ev.orderId)
      .maybeSingle();
    refId = existingRef?.id ?? null;
  }
  if (!refId) return; // bez referral.id nema stabilnog kljuca nagrade; ne kreiraj nista

  // nagrada referreru: interni entitlement (1 seminarski slot); unique(provider,order_id) stiti od duplog
  const reward = referralRewardEntitlement(refId);
  const { error: rewardErr } = await admin.from('entitlements').insert({
    user_id: referrerUserId,
    work_type: reward.workType,
    slots_total: reward.slotsTotal,
    product_id: reward.productId,
    order_id: reward.orderId,
    provider: reward.provider,
    purchase_expires_at: isoAfterDays(Date.now(), 90),
  });
  // 23505 = nagrada za ovaj referral vec postoji (retry): idempotentno, nastavi na kupon.
  if (rewardErr && dbErrorCode(rewardErr) !== UNIQUE_VIOLATION) {
    console.error('webhook-mor referral_reward_failed', { orderId: ev.orderId, code: dbErrorCode(rewardErr) });
  }

  // welcome kupon za referred (zapis; primjena -20% pri naplati je integracija). AUD-28:
  // ON CONFLICT (source_order_id, reason) DO NOTHING preko coupon_grants_order_reason_key (0024).
  await admin.from('coupon_grants').upsert({
    user_id: ev.userId,
    code: `WELCOME-${ev.referralCode}`,
    reason: 'referral_welcome',
    source_order_id: ev.orderId,
    expires_at: isoAfterDays(Date.now(), 120),
  }, { onConflict: 'source_order_id,reason', ignoreDuplicates: true });
  void REFERRAL_WELCOME_DISCOUNT; // -20% se postavlja u Stripe kupon konfiguraciji (TODO)
}

// Refund izvorne kupnje povlaci NEPOTROSENU referral nagradu (potrosenu pusti, false-allow).
async function pullReferralReward(admin: any, orderId: string): Promise<void> {
  const { data: refs } = await admin.from('referrals').select('id').eq('converted_order_id', orderId);
  for (const r of refs ?? []) {
    const { data: ent } = await admin
      .from('entitlements')
      .select('id, slots_used')
      .eq('provider', 'internal')
      .eq('order_id', `reward:referral:${r.id}`)
      .maybeSingle();
    if (ent && rewardIsPullable(ent.slots_used)) {
      await admin.from('entitlements').update({ status: 'void' }).eq('id', ent.id);
    }
  }
}

// Isto za "pozovi-prijatelja" nagradu (0013): refund kupnje koja je okinula preporuciteljevu
// nagradu povlaci tu nagradu ako je NEPOTROSENA (potrosenu pusti, false-allow, 6.7). Precizno preko
// converted_order_id; status signupa se vraca na 'converted' pa vise ne trosi mjesecni strop.
// Izvezeno za process-bonus-outbox (F21): radnik koji je nagradu dodijelio nakon povrata je povlaci.
export async function pullReferralSignupReward(admin: any, orderId: string): Promise<void> {
  const { data: signups } = await admin
    .from('referral_signups')
    .select('id, referrer_reward_entitlement_id')
    .eq('converted_order_id', orderId)
    .eq('status', 'rewarded');
  for (const s of signups ?? []) {
    if (!s.referrer_reward_entitlement_id) continue;
    const { data: ent } = await admin
      .from('entitlements')
      .select('id, slots_used')
      .eq('id', s.referrer_reward_entitlement_id)
      .maybeSingle();
    if (ent && rewardIsPullable(ent.slots_used)) {
      await admin.from('entitlements').update({ status: 'void' }).eq('id', ent.id);
      await admin.from('referral_signups').update({ status: 'converted' }).eq('id', s.id);
    }
  }
}

type RefundConsequences =
  | { ok: true; manualOrderFound: boolean; manualOrdersClosed: number; couponsRevoked: number; obligationsCancelled: number }
  | { ok: false; step: string; error: string };

/** Odgovor PostgREST upita, onoliko koliko ga posljedice povrata citaju. */
interface DbResponse {
  data: unknown;
  error: unknown;
}

/** Lanac filtera supabase-js: thenable koji se moze dalje suziti. */
interface DbFilter extends PromiseLike<DbResponse> {
  eq(column: string, value: string): DbFilter;
  in(column: string, values: readonly string[]): DbFilter;
}

/**
 * Najuzi oblik Supabase klijenta koji `closeRefundConsequences` treba. Tipiziran umjesto `any`, pa
 * tsc i deno check vide krivo ime metode ili krivi oblik argumenta (nalaz pregleda 2026-09-27).
 */
interface RefundConsequencesDb {
  from(table: 'manual_orders' | 'coupon_grants' | 'bonus_outbox'): {
    select(columns: string): DbFilter;
    update(values: Record<string, string>): DbFilter;
  };
}

/**
 * Klijent koji closePaymentAfterRefund treba (F21, stavka 3: bez `any`): gasenje prava u
 * `entitlements` i sve tablice sporednih posljedica. Nagrade (referrals, referral_signups) citaju
 * pullReferralReward i pullReferralSignupReward, koje primaju isti klijent.
 */
interface PaymentRefundDb {
  from(table: 'entitlements' | 'manual_orders' | 'coupon_grants' | 'bonus_outbox' | 'referrals' | 'referral_signups'): {
    select(columns: string): DbFilter;
    update(values: Record<string, string>): DbFilter;
  };
}

/** Redak `manual_orders` kakvog posljedice citaju. */
interface ManualOrderRow {
  id: string;
  status: string | null;
}

/** Redak `coupon_grants` kakvog posljedice citaju; `expiresAt` null znaci bez roka. */
interface CouponGrantRow {
  id: string;
  expiresAt: string | null;
}

function manualOrderRows(data: unknown): ManualOrderRow[] {
  return dbRows(data).map((r) => ({ id: String(r.id), status: typeof r.status === 'string' ? r.status : null }));
}

function couponGrantRows(data: unknown): CouponGrantRow[] {
  return dbRows(data).map((r) => ({
    id: String(r.id),
    expiresAt: r.expires_at === null || r.expires_at === undefined ? null : String(r.expires_at),
  }));
}

/**
 * POSLJEDICE PUNOG POVRATA IZVAN `entitlements` (odluka vlasnika 2026-09-27). Do tada je puni
 * povrat gasio samo entitlement i referral nagrade: rucna narudzba (premium_human, bez
 * entitlementa) ostajala je `pending`, pa bi covjek odradio placen posao za vracen novac, a pass
 * kupon iz iste kupnje ostajao je upotrebljiv.
 *
 *  - `manual_orders` istog pruzatelja i PaymentIntenta dobiva `status = 'refunded'` (vrijednost vec
 *    postoji u CHECK-u migracije 0003).
 *  - pass kupon (`coupon_grants`, `reason = 'pass_bonus'`, `source_order_id = orderId`) se povlaci
 *    tako da istekne SADA. Tablica nema stupac statusa, a redak se ne brise: unique
 *    (source_order_id, reason) iz 0024 tako i dalje sprjecava da ga ponovljena uplata izda iznova.
 *  - obveze iz `bonus_outbox` za isti PaymentIntent koje jos cekaju (`pending`) se otkazuju
 *    (`cancelled`, migracija 0207; F21 stavka 1). Bez toga bi radnik process-bonus-outbox kasnije
 *    izvrsio nagradu preporucitelju za vracen novac. Radnik uz to i sam cita oznaku povrata prije i
 *    poslije izvrsenja (process-bonus-outbox/referrer-reward.ts), pa se prozor zatvara s obje strane.
 *
 * IDEMPOTENTNO U STROGOM SMISLU: prvo se cita, a pise se samo ono sto jos nije zatvoreno. Drugi isti
 * povrat ne salje nijedan upis u ove dvije tablice. Nikad ne baca; pad citanja ili upisa vraca
 * `ok: false`. Refund grana je zove TEK NAKON gasenja prava, pa pad ovdje ne ostavlja aktivno
 * pravo; pozivatelj odgovara 500 uz oznaku `refund_consequences_failed` (Stripe ponovi).
 */
async function closeRefundConsequences(
  admin: RefundConsequencesDb,
  orderId: string,
  nowMs: number,
): Promise<RefundConsequences> {
  try {
    const { data: orders, error: ordersErr } = await admin
      .from('manual_orders')
      .select('id, status')
      .eq('provider', PROVIDER)
      .eq('order_id', orderId);
    if (ordersErr) return { ok: false, step: 'manual_orders_lookup', error: dbErrorMessage(ordersErr) };
    const orderRows = manualOrderRows(orders);
    const openOrderIds = orderRows.filter((r) => r.status !== 'refunded').map((r) => r.id);
    if (openOrderIds.length > 0) {
      const { error: closeErr } = await admin
        .from('manual_orders')
        .update({ status: 'refunded' })
        .eq('provider', PROVIDER)
        .eq('order_id', orderId)
        .in('id', openOrderIds);
      if (closeErr) return { ok: false, step: 'manual_orders_update', error: dbErrorMessage(closeErr) };
    }

    const { data: coupons, error: couponsErr } = await admin
      .from('coupon_grants')
      .select('id, expires_at')
      .eq('source_order_id', orderId)
      .eq('reason', 'pass_bonus');
    if (couponsErr) return { ok: false, step: 'coupon_grants_lookup', error: dbErrorMessage(couponsErr) };
    // Kupon bez roka (null) nikad ne istjece, pa je aktivan; povlaci se kao i onaj s rokom u buducnosti.
    const activeCouponIds = couponGrantRows(coupons)
      .filter((c) => c.expiresAt === null || Date.parse(c.expiresAt) > nowMs)
      .map((c) => c.id);
    if (activeCouponIds.length > 0) {
      const { error: revokeErr } = await admin
        .from('coupon_grants')
        .update({ expires_at: new Date(nowMs).toISOString() })
        .eq('source_order_id', orderId)
        .eq('reason', 'pass_bonus')
        .in('id', activeCouponIds);
      if (revokeErr) return { ok: false, step: 'coupon_grants_update', error: dbErrorMessage(revokeErr) };
    }

    const { data: obveze, error: obvezeErr } = await admin
      .from('bonus_outbox')
      .select('id')
      .eq('order_id', orderId)
      .eq('status', 'pending');
    if (obvezeErr) return { ok: false, step: 'bonus_outbox_lookup', error: dbErrorMessage(obvezeErr) };
    const pendingIds = dbRows(obveze).map((r) => String(r.id));
    if (pendingIds.length > 0) {
      const { error: cancelErr } = await admin
        .from('bonus_outbox')
        .update({ status: 'cancelled', last_error: 'refunded' })
        .eq('order_id', orderId)
        .eq('status', 'pending')
        .in('id', pendingIds);
      if (cancelErr) return { ok: false, step: 'bonus_outbox_update', error: dbErrorMessage(cancelErr) };
    }
    return {
      ok: true,
      manualOrderFound: orderRows.length > 0,
      manualOrdersClosed: openOrderIds.length,
      couponsRevoked: activeCouponIds.length,
      obligationsCancelled: pendingIds.length,
    };
  } catch (e) {
    return { ok: false, step: 'threw', error: String(e) };
  }
}

/**
 * Sve sto uplata mora zatvoriti kad NAKON svog upisa vidi oznaku punog povrata istog
 * PaymentIntenta: pravo, referral nagrade i sporedne posljedice (pass kupon, rucna narudzba).
 *
 * Zove se na oba mjesta gdje grana entitlementa cita oznaku: prije bonusa (povrat je stigao prije
 * uplate) i NAKON bonusa (povrat je stigao dok su se bonusi upisivali). Drugo mjesto zatvara
 * prozor u kojem je povrat procitao `coupon_grants` i `referral_signups` prije nego ih je uplata
 * upisala, pa bi kupon i nagrada preporucitelju ostali aktivni za vracen novac (nalaz pregleda
 * 2026-09-27). Isti dogovor pisi-pa-citaj kao za entitlement i manual_orders. Idempotentno: vec
 * zatvoreno se ne dira, pa ponovljena dostava uplate ne mijenja nista.
 */
async function closePaymentAfterRefund(
  admin: PaymentRefundDb,
  ev: StripeEvent,
  productId: string,
  nowMs: number,
): Promise<{ ok: true } | { ok: false; step: string; error: string }> {
  const { error: voidErr } = await admin
    .from('entitlements')
    .update({ status: 'refunded' })
    .eq('provider', PROVIDER)
    .eq('order_id', ev.orderId)
    .eq('product_id', productId);
  if (voidErr) return { ok: false, step: 'entitlement_update', error: dbErrorMessage(voidErr) };
  await pullReferralReward(admin, ev.orderId);
  await pullReferralSignupReward(admin, ev.orderId);
  const sporedno = await closeRefundConsequences(admin, ev.orderId, nowMs);
  if (!sporedno.ok) return { ok: false, step: sporedno.step, error: sporedno.error };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// OUTBOX ZA OBVEZE NAKON KUPNJE (audit P1-07, migracija 0100).
//
// Tri bonusa nakon entitlementa (nagrada preporucitelju, pass kupon, referral atribucija) love
// svoju gresku i nastavljaju, da tranzijentni pad ne srusi handler u 500. To je ispravno (AUD-28
// nize), ali uhvacena greska se dosad SAMO LOGIRALA: nigdje nije ostajao zapis da obveza postoji,
// pa je nitko nikad nije ponovio. Iduci webhook za isti order izlazi na `duplicate_ignored` PRIJE
// bonusa, dakle korisnik je platio a obecano ne stigne NIKAD.
//
// Sada se obveza ZAPISE prije nego se pokusa izvrsiti. Pokusaj i dalje ide odmah (korisnik bonus
// najcesce dobije u istoj sekundi); ako padne, redak ostaje `pending` i radnik ga ponovi.
type BonusKind = 'referrer_reward' | 'pass_coupon' | 'referral_attribution';

/** Koje obveze ovaj order uopce stvara. Jedno mjesto, da se upis i izvrsenje ne raziđu. */
function plannedBonuses(ev: StripeEvent, product: Product): Array<{ kind: BonusKind; payload: Record<string, unknown> }> {
  const out: Array<{ kind: BonusKind; payload: Record<string, unknown> }> = [
    { kind: 'referrer_reward', payload: { userId: ev.userId, workType: product.workType ?? '' } },
  ];
  if (isPassProduct(product.kind)) {
    out.push({ kind: 'pass_coupon', payload: { userId: ev.userId } });
  }
  if (ev.referralCode) {
    out.push({ kind: 'referral_attribution', payload: { referralCode: ev.referralCode } });
  }
  return out;
}

/**
 * Zapisi obveze. Poziva se i na putu `duplicate_ignored`, i to je namjerno: bas taj retry je dosad
 * bio slijepa ulica, a ovako postaje TOCKA OPORAVKA. Webhook koji ponovno stigne za vec obradjen
 * order jos jednom osigura da obveze postoje.
 *
 * Ne baca: upis outboxa ne smije srusiti handler kojem je jezgra (entitlement) vec uspjela.
 */
async function enqueueBonuses(admin: any, ev: StripeEvent, product: Product): Promise<void> {
  const rows = plannedBonuses(ev, product).map((b) => ({
    user_id: ev.userId, order_id: ev.orderId, kind: b.kind, payload: b.payload,
  }));
  if (!rows.length) return;
  try {
    const { error } = await admin.from('bonus_outbox')
      .upsert(rows, { onConflict: 'order_id,kind', ignoreDuplicates: true });
    if (error) console.error('webhook-mor bonus_outbox_enqueue_failed', { orderId: ev.orderId, error: error.message });
  } catch (e) {
    console.error('webhook-mor bonus_outbox_enqueue_threw', { orderId: ev.orderId, error: String(e) });
  }
}

/** Oznaci obvezu izvrsenom. Tiho na gresci: radnik ce je ionako ponoviti, a dvostruko izvrsenje
 *  je bezopasno jer su svi bonusi idempotentni preko vlastitih unique indeksa. */
async function markBonusDone(admin: any, orderId: string, kind: BonusKind): Promise<void> {
  try {
    await admin.from('bonus_outbox')
      .update({ status: 'done', done_at: new Date().toISOString(), last_error: null })
      .eq('order_id', orderId).eq('kind', kind);
  } catch (e) {
    console.error('webhook-mor bonus_outbox_mark_failed', { orderId, kind, error: String(e) });
  }
}

// Gornja granica sirovog tijela webhooka (audit P1-06). Vidi _shared/read-body.ts.
const MAX_WEBHOOK_BODY_BYTES = 512 * 1024;

export function createWebhookHandler(deps: WebhookDeps): (req: Request) => Promise<Response> {
 return async (req: Request): Promise<Response> => {
 try {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // GRANICA TIJELA PRIJE POTPISA (audit P1-06). Ovo je javan endpoint s `verify_jwt = false`:
  // svatko na internetu smije poslati zahtjev, a HMAC ga odbija TEK NAKON sto je tijelo vec
  // procitano. `req.text()` bez granice znaci da nepotpisan zahtjev moze alocirati koliko god
  // posiljatelj hoce, prije nego je ijedna provjera stigla reci ne.
  //
  // Granica je namjerno velikodusna prema stvarnom prometu: najveci Stripe `payment_intent.*`
  // dogadjaj s punim objektom i metadatom je reda velicine desetak KiB.
  const rawBody = await readTextBounded(req, MAX_WEBHOOK_BODY_BYTES);
  if (!rawBody.ok) return json({ error: 'payload_too_large' }, 413);
  const raw = rawBody.text;
  // Potpis nosi i vrijeme (`t=`): stari valjan zahtjev se odbija, pa presretnut zahtjev nije
  // vjecno upotrebljiv (replay). Razlog ide u log, klijent dobije samo genericko.
  const sig = await verifyStripeSignature(raw, req.headers.get('Stripe-Signature'), deps.webhookSecret, deps.now?.());
  if (!sig.ok) {
    console.error('webhook-mor invalid_signature', { reason: sig.reason });
    return json({ error: 'invalid_signature' }, 401);
  }
  // JSON se parsira TOCNO JEDNOM i tek nakon sto je potpis prosao.
  let parsed: StripeWebhookPayload;
  try { parsed = JSON.parse(raw) as StripeWebhookPayload; } catch { return json({ error: 'bad_request' }, 400); }
  const ev = parseStripeEvent(parsed);
  // orderId se NE trazi ovdje nego tek nakon gatea: dogadjaji koje ne obradjujemo (a Stripe ih
  // salje mnogo) nemaju PaymentIntent, a moraju zavrsiti u inboxu i dobiti 200, ne 400.

  const admin = deps.admin();

  // INBOX (audit PAY-06..08, PAY-14): zapisi dogadjaj PRIJE obrade, pa tek onda odlucuj.
  //
  // Bez ovoga je pad izmedju potpisa i entitlementa gubio dogadjaj bez traga, a nemapiran
  // proizvod je vracao 200 pa ga provider vise nikad ne bi poslao: korisnik plati, entitlement
  // ne nastane, jedini trag je redak u logu koji istekne. Providerov retry prozor je
  // ogranicen, pa se na njega nije smjelo oslanjati kao na mehanizam oporavka.
  //
  // Upis inboxa NE SMIJE srusiti obradu: ako on padne, kupnja je i dalje vaznija od zapisa.
  // Zato se greska logira i ide se dalje, a `eventRowId` ostaje null.
  const eventRowId = await (async (): Promise<string | null> => {
    try {
      const { data, error } = await admin
        .from('webhook_events')
        .insert({
          provider: PROVIDER,
          event_name: ev.eventName,
          order_id: ev.orderId,
          // Stripe nema pojam trgovine. Dogadjaj koji nosi povezani (Connect) racun gate nize
          // odbija, ali ga inbox cuva u istom stupcu da se vidi s kojeg je racuna dosao.
          store_id: ev.accountId || null,
          test_mode: ev.testMode,
          raw_payload: JSON.parse(raw),
          signature_valid: true,
        })
        .select('id')
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    } catch (e) {
      console.error('webhook-mor inbox_insert_failed', { orderId: ev.orderId, detail: String(e) });
      return null;
    }
  })();

  /**
   * Zabiljezi ishod obrade uz zapis u inboxu. Nikad ne baca. Vraca je li zapis stvarno upisan:
   * vecini puteva je to samo trag, ali oznaka punog povrata (REFUND_MARKERS) je ulaz u odluku
   * uplate, pa ga taj put mora znati (Codex pregled kruga 3).
   */
  //
  // `note` (F21, stavka 2): korak i greska sporednog pada idu u `outcome_note` (migracija 0207), a
  // `outcome_detail` ostaje TOCNO oznaka iz REFUND_MARKERS, jer je citanje oznake doslovna usporedba.
  const settle = async (outcome: string | null, detail?: string, note?: string): Promise<boolean> => {
    if (!eventRowId) return false;
    try {
      const { data, error } = await admin
        .from('webhook_events')
        .update({
          outcome,
          outcome_detail: detail ?? null,
          processed_at: new Date().toISOString(),
          ...(note ? { outcome_note: note.slice(0, 500) } : {}),
        })
        .eq('id', eventRowId)
        .select('id');
      if (error) throw error;
      // Update bez greske koji nije pogodio redak nije upis (Codex pregled kruga 3).
      return Array.isArray(data) && data.length > 0;
    } catch (e) {
      console.error('webhook-mor inbox_settle_failed', { eventRowId, detail: String(e) });
      return false;
    }
  };

  // PORIJEKLO DOGADJAJA (audit PAY-04/PAY-05). Ispravan potpis dokazuje samo da posiljatelj zna
  // tajnu, NE i da dogadjaj dolazi iz naseg produkcijskog okruzenja. Bez ove provjere bi valjano
  // potpisan testni dogadjaj dodijelio pravo pravo pristupa. Provjera ide PRIJE svakog upisa,
  // ukljucujuci refund granu. VRSTU dogadjaja ovdje NE gledamo: o njoj odlucuje klasifikator nize,
  // inace vracen novac pod imenom koje nije `charge.refunded` nikad ne bi stigao do grane koja ga
  // glasno prijavljuje (nalaz pregleda kruga 2 pri spajanju mastera, 2026-09-26).
  // Racun se ne konfigurira: dogadjaj s bilo kojim povezanim racunom (`account`) nije nastao iz
  // naseg checkouta, koji PaymentIntent uvijek stvara na vlastitom racunu (acceptEvent).
  const gate = acceptEvent(ev, { allowTestMode: deps.allowTestMode });
  if (!gate.ok) {
    // 200: dogadjaj je testni ili tudji, dakle za nas trajno neobradiv. Retry ga ne bi popravio,
    // a 5xx bi providera natjerao da ga ponavlja do isteka prozora. Odbijeno porijeklo ide u ERROR,
    // jer znaci ili krivu konfiguraciju ili pokusaj; grana nije tiha (nalaz pregleda na masteru
    // 2026-09-23: 200 bez retryja i bez retka u logu skriva potpuni prekid prihoda).
    console.error('webhook-mor event_refused', {
      reason: gate.reason,
      eventName: ev.eventName,
      livemode: ev.livemode,
      accountId: ev.accountId,
      orderId: ev.orderId,
    });
    await settle('refused', gate.reason);
    return json({ ok: true, action: 'event_refused', reason: gate.reason }, 200);
  }

  // KLASIFIKACIJA (cista odluka, classifyStripeEvent u src/report/webhook.ts). Ide TEK nakon
  // inboxa i nakon gatea porijekla: dogadjaj koji nije nas ne smije se ni klasificirati.
  // Knjizi se samo `payment_intent.succeeded` sa statusom `succeeded` i pozitivnim
  // `amount_received`; povrat samo iz `charge.refunded`; potvrdjena naplata bez `user_id` je
  // `needs_manual_link`. Stripe ekvivalent zastita s mastera (31b802ad, 81a89f2f, daf5f53a),
  // prenesen pri spajanju u design/pack3.
  const decision = classifyStripeEvent(ev);

  if (decision.kind === 'ignored') {
    // Dogadjaj se zove kao uplata, a objekt naplatu ne potvrdjuje, ili je vracen novac pod
    // drugim imenom, ili je vrsta koju ne obradjujemo (pretplacen visak). 200 jer retry ne bi
    // promijenio ishod; trag ostaje u inboxu I u logu.
    // OVA GRANA SE LOGIRA UVIJEK: odluka pociva na obliku tudjeg objekta, pa bi njegova promjena
    // bez retka u logu pretvorila SVAKU kupnju u tihi 200. Razlozi koji se ticu novca idu na
    // ERROR (NOTABLE_IGNORE_PREFIXES), ostalo na WARN. Upit nad inboxom je u docs/GO_LIVE_NAPLATA.md.
    const detalji = {
      reason: decision.reason,
      eventName: ev.eventName,
      status: ev.status,
      amountReceivedCents: ev.amountReceivedCents,
      refundedCents: ev.refundedCents,
      orderId: ev.orderId,
      testMode: ev.testMode,
    };
    if (isNotableIgnore(decision)) console.error('webhook-mor ignored_needs_attention', detalji);
    else console.warn('webhook-mor ignored_foreign_event', detalji);
    await settle('ignored', decision.reason);
    return json({ ok: true, action: 'ignored', reason: decision.reason ?? 'nepodrzan_dogadjaj' }, 200);
  }

  // Od ovdje se dogadjaj stvarno knjizi, pa je PaymentIntent id (kljuc) obavezan. Bez njega je
  // to naplata koja nije nastala kroz create-checkout (npr. izravna naplata iz dashboarda), dakle
  // TRAJNO neobradiva za nas. 200, ne 4xx: Stripe 4xx ponavlja do tri dana, a endpoint s trajnim
  // neuspjesima upozorava i zna iskljuciti, cime bi prestali stizati i pravi dogadjaji kupnje.
  // Dogadjaj ostaje u inboxu, pa se moze pregledati i replayati.
  if (!ev.orderId) {
    console.warn('webhook-mor foreign_event_ignored', { eventName: ev.eventName, reason: 'missing_payment_intent' });
    await settle('ignored', 'missing_payment_intent');
    return json({ ok: true, action: 'ignored', reason: 'missing_payment_intent' }, 200);
  }

  // POTVRDJENA NAPLATA BEZ KORISNIKA (Stripe ekvivalent masterova `needs_manual_link` iz 31b802ad
  // i 81a89f2f). Klasifikator je potvrdio naplatu (status `succeeded`, `amount_received` > 0), a
  // `metadata[user_id]` nema: novac je naplacen i pravo nema komu pripasti. 400 ne dolazi u obzir
  // (dogadjaj bi nestao), a WARN uz `ignored` bi ga utopio u konfiguracijskom sumu. Zato vlastiti
  // ishod i ERROR, jer to netko MORA vidjeti; rucno vezivanje je u docs/GO_LIVE_NAPLATA.md, 5.1.
  // Djelomicni indeks `webhook_events_unresolved` ovaj ishod NE pokriva, pa upit ide po `outcome`.
  //
  // Iznimka je samo PaymentIntent koji u metadati izricito nosi TUDJI proizvod (Katedra pass na
  // istom racunu): to nije Lektina naplata, pa ide istim putem kao tudji proizvod nize (WARN).
  if (decision.kind === 'needs_manual_link') {
    if (ev.productId && !isSoldByLektaCheckout(ev.productId)) {
      console.warn('webhook-mor foreign_event_ignored', {
        orderId: ev.orderId,
        reason: 'foreign_product',
        productId: ev.productId,
      });
      await settle('ignored', `foreign_product: ${ev.productId}`);
      return json({ ok: true, action: 'ignored', reason: 'foreign_product' }, 200);
    }
    console.error('webhook-mor needs_manual_link', {
      reason: decision.reason,
      orderId: ev.orderId,
      productId: ev.productId,
      amountReceivedCents: ev.amountReceivedCents,
      currency: ev.currency,
      testMode: ev.testMode,
    });
    await settle('needs_manual_link', decision.reason);
    return json({ ok: true, action: 'needs_manual_link', reason: decision.reason }, 200);
  }

  // refund: blokiraj daljnje vezivanje slotova iz tog entitlementa (sekcija 6.7)
  //
  // U ovu granu se ulazi SAMO iz dogadjaja `charge.refunded` (odluka: classifyStripeEvent), ne po
  // zastavici `ev.refunded`: ona je istinita i za Refund objekt pod drugim imenom (isRefundBearing),
  // a grana nize pise po `ev.orderId` (gasi entitlement, povlaci referral nagrade).
  if (decision.kind === 'refund') {
    // DJELOMICAN povrat ne smije oduzeti cijelo pravo pristupa (PAY-09): korisnik koji je dobio
    // natrag dio iznosa i dalje je platio uslugu. Puni povrat i dalje gasi entitlement.
    if (!isFullRefund(ev)) {
      console.error('webhook-mor partial_refund_kept', {
        orderId: ev.orderId,
        totalCents: ev.totalCents,
        refundedCents: ev.refundedCents,
      });
      await settle('processed', 'partial_refund_noted');
      return json({ ok: true, action: 'partial_refund_noted' }, 200);
    }
    // OZNAKA PUNOG POVRATA PRIJE ICEGA DRUGOG (Codex pregled kruga 3). Stripe ne jamci redoslijed:
    // puni povrat moze stici dok je `payment_intent.succeeded` jos u retryju ili se obradjuje
    // ISTODOBNO. Povrat zato PRVO trajno upise oznaku u inbox (REFUND_MARKERS), pa tek onda cita
    // entitlements. Uplata radi zrcalno: prvo upise pravo, pa procita oznaku. Kako obje strane
    // pisu prije nego citaju, barem jedna vidi upis druge i pravo se ugasi. Oznaka se na putu
    // greske NE brise (ostaje `refund_pending`), pa je sigurnost ocuvana i do Stripeova retryja.
    // Bez upisane oznake taj dogovor ne vrijedi, pa je 500 i Stripe povrat ponovi.
    // Ishod ostaje NULL ("jos traje") dok povrat ne zavrsi, pa zapeo povrat ulazi u djelomicni
    // indeks neobradjenih dogadjaja (0092, webhook_events_unresolved) i vidi se u nadzoru.
    if (!(await settle(null, 'refund_pending'))) {
      console.error('webhook-mor refund_marker_failed', { orderId: ev.orderId });
      return json({ error: 'refund_marker_failed' }, 500);
    }

    // TUDJI PRODUKT NA ISTOM RACUNU (nalaz pregleda F18 krug 2). Katedra knjizi svoje passove u
    // istu tablicu entitlements, s istim provider 'stripe'. Ovaj webhook njihov povrat ne smije
    // obraditi kao svoj: to je Katedrino pravo i Katedrin tok povrata.
    //
    // Pad citanja je 500 (Stripe ponovi), ne "nema retka": inace bi prolazna greska baze povrat
    // proglasila tudjim ili nepostojecim i nikad ga ne bi ponovila (Codex pregled kruga 3).
    const { data: refundTargets, error: lookupErr } = await admin
      .from('entitlements')
      .select('id, product_id, upgrade_order_id, upgrade_paid_cents')
      .eq('provider', PROVIDER)
      .eq('order_id', ev.orderId);
    if (lookupErr) {
      console.error('webhook-mor refund_lookup_failed', { orderId: ev.orderId, error: lookupErr.message });
      await settle('failed', 'refund_pending');
      return json({ error: 'refund_failed' }, 500);
    }
    const targets = dbRows(refundTargets).map((r) => ({
      id: String(r.id),
      productId: String(r.product_id ?? ''),
      upgradeOrderId: typeof r.upgrade_order_id === 'string' ? r.upgrade_order_id : '',
      upgradePaidCents: typeof r.upgrade_paid_cents === 'number' ? r.upgrade_paid_cents : null,
    }));
    // Povrat IZVORNE (Repair) uplate prava koje je vec nadogradjeno u Final Pass gasi i nadogradnju,
    // a uplata nadogradnje ostaje naplacena. Pravo se svejedno gasi (sigurnije), ali to netko mora
    // vidjeti i odluciti o povratu nadogradnje. Trag je TRAJAN (nalaz pregleda kruga 3): ishod
    // `needs_manual_review` uz `outcome_note` s PaymentIntentom i iznosom nadogradnje, ne samo redak
    // u logu koji istekne. `outcome_detail` ostaje `refunded` (REFUND_MARKERS).
    const nadogradjeni = targets.filter((r) => r.upgradeOrderId !== '');
    let rucniPregled: string | null = null;
    if (nadogradjeni.length > 0) {
      console.error('webhook-mor refund_of_upgraded_entitlement', {
        orderId: ev.orderId,
        upgradeOrderIds: nadogradjeni.map((r) => r.upgradeOrderId),
      });
      rucniPregled = `refund_of_upgraded_entitlement: ${nadogradjeni
        .map((r) => `pravo=${r.id} nadogradnja=${r.upgradeOrderId} naplaceno_nadogradnje=${r.upgradePaidCents ?? 'nepoznato'}`)
        .join('; ')}`;
    }
    const foreignTarget = targets.find((r) => !isSoldByLektaCheckout(r.productId));
    if (foreignTarget) {
      console.warn('webhook-mor foreign_event_ignored', {
        orderId: ev.orderId,
        reason: 'foreign_product',
        productId: foreignTarget.productId,
      });
      await settle('ignored', `foreign_product: ${foreignTarget.productId}`);
      return json({ ok: true, action: 'ignored', reason: 'foreign_product' }, 200);
    }
    // Update ide SAMO po id-ovima Lektinih redaka procitanih gore. Redak koji bi se izmedju
    // citanja i upisa pojavio pod istim PaymentIntentom (npr. Katedrin) tako ostaje netaknut.
    const ownIds: string[] = targets.map((r) => r.id);

    // POVRAT UPLATE NADOGRADNJE (Monetizacija V1, odjeljak 14). Nadogradnja ne stvara vlastiti redak
    // nego pretvara postojeci, pa njezin PaymentIntent stoji u `upgrade_order_id`, ne u `order_id`.
    // Bez ovog citanja bi povrat nadogradnje zavrsio kao `refund_without_entitlement`, a Final Pass
    // bi ostao aktivan za vracen novac. Pad citanja je 500 (Stripe ponovi), isto kao gore.
    let upgradeIds: string[] = [];
    let upgradeSources: string[] = [];
    if (ownIds.length === 0) {
      const { data: upgradeRows, error: upgradeLookupErr } = await admin
        .from('entitlements')
        .select('id, order_id, paid_amount_cents')
        .eq('upgrade_order_id', ev.orderId);
      if (upgradeLookupErr) {
        console.error('webhook-mor refund_lookup_failed', { orderId: ev.orderId, error: dbErrorMessage(upgradeLookupErr) });
        await settle('failed', 'refund_pending');
        return json({ error: 'refund_failed' }, 500);
      }
      upgradeIds = dbRows(upgradeRows).map((r) => String(r.id));
      upgradeSources = dbRows(upgradeRows).map(
        (r) => `pravo=${String(r.id)} izvorna_uplata=${String(r.order_id ?? '')} naplaceno_repair=${typeof r.paid_amount_cents === 'number' ? r.paid_amount_cents : 'nepoznato'}`,
      );
    }

    // PRAVO SE GASI PRIJE SPOREDNIH POSLJEDICA (nalaz pregleda 2026-09-27). Dotad je
    // closeRefundConsequences isla prva, pa je pad upisa u manual_orders ili coupon_grants vracao
    // 500 PRIJE gasenja entitlementa: kupac je imao vracen novac i aktivno pravo dok Stripe ne
    // ponovi, a nakon iscrpljenog retryja zauvijek. Opoziv prava sada ne ovisi o sporednim
    // tablicama. Pad OVOG upisa je 500 uz ocuvanu oznaku `refund_pending`: korisnik bi inace dobio
    // novac natrag i ZADRZAO pravo, bez traga da je gasenje palo (adversarijalni pregled 2026-09-23).
    let pravoUgaseno = false;
    if (ownIds.length > 0) {
      const { data: refundedRows, error: refundErr } = await admin
        .from('entitlements')
        .update({ status: 'refunded' })
        .eq('provider', PROVIDER)
        .eq('order_id', ev.orderId)
        .in('id', ownIds)
        .select('id');
      if (refundErr) {
        console.error('webhook-mor refund_update_failed', { orderId: ev.orderId, error: dbErrorMessage(refundErr) });
        await settle('failed', 'refund_pending');
        return json({ error: 'refund_failed' }, 500);
      }
      pravoUgaseno = dbRows(refundedRows).length > 0;
      if (pravoUgaseno) {
        await pullReferralReward(admin, ev.orderId); // povuci nepotrosenu referral nagradu (0005, 6.7)
        await pullReferralSignupReward(admin, ev.orderId); // isto za pozovi-prijatelja nagradu (0013)
      }
    }
    // Nadogradjeno pravo se gasi CIJELO: nadogradnja ga je pretvorila u Final Pass, a stanje prije
    // nje se ne cuva zasebno. Placeni Repair dio tako ostaje bez prava, pa je redak ERROR: operater
    // odlucuje o povratu ili rucnom vracanju Repaira (docs/GO_LIVE_NAPLATA.md). Sigurnije je oduzeti
    // previse nego ostaviti Final Pass za vracen novac.
    if (upgradeIds.length > 0) {
      const { data: upgradeRefunded, error: upgradeRefundErr } = await admin
        .from('entitlements')
        .update({ status: 'refunded' })
        .eq('upgrade_order_id', ev.orderId)
        .in('id', upgradeIds)
        .select('id');
      if (upgradeRefundErr) {
        console.error('webhook-mor refund_update_failed', { orderId: ev.orderId, error: dbErrorMessage(upgradeRefundErr) });
        await settle('failed', 'refund_pending');
        return json({ error: 'refund_failed' }, 500);
      }
      if (dbRows(upgradeRefunded).length > 0) {
        pravoUgaseno = true;
        console.error('webhook-mor upgrade_refunded', { orderId: ev.orderId, entitlementIds: upgradeIds });
        // Placeni Repair dio ostaje bez prava: trajan trag uz inbox, isto kao gore.
        rucniPregled = `upgrade_refunded: ${upgradeSources.join('; ')}`;
      }
    }

    // SPOREDNE POSLJEDICE (odluka vlasnika 2026-09-27): rucna narudzba istog PaymentIntenta se
    // otkazuje, pass kupon iz iste kupnje se povlaci. Ide i kad entitlementa nema, jer rucna
    // narudzba (premium_human) pravo nema, pa bi je izlaz `refund_without_entitlement` inace
    // preskocio. Samo PUNI povrat dolazi dovde; djelomicni je izasao gore kao
    // `partial_refund_noted`. Pad je 500 (Stripe ponovi) uz oznaku `refund_consequences_failed` u
    // inboxu: pravo je vec ugaseno, a otvoreno je samo sporedno. I ta je oznaka u REFUND_MARKERS,
    // pa uplata koja stigne u medjuvremenu i dalje vidi puni povrat. Ponovljen povrat je no-op za
    // ono sto je vec zatvoreno (gasenje prava, povlacenje nagrada i posljedice su idempotentni).
    const posljedice = await closeRefundConsequences(admin, ev.orderId, deps.now?.() ?? Date.now());
    if (!posljedice.ok) {
      console.error('webhook-mor refund_consequences_failed', {
        orderId: ev.orderId,
        step: posljedice.step,
        error: posljedice.error,
        entitlementRefunded: pravoUgaseno,
      });
      await settle('failed', 'refund_consequences_failed', `${posljedice.step}: ${posljedice.error}`);
      return json({ error: 'refund_failed' }, 500);
    }

    // Rucna narudzba nema entitlement, a povrat ju je upravo zatvorio (ili je vec bila zatvorena),
    // pa je ishod `refunded`, isti kao za entitlement.
    if (pravoUgaseno || posljedice.manualOrderFound) {
      // Povrat koji dira nadogradnju ostavlja jednu uplatu bez prava: ishod `needs_manual_review`
      // ulazi u dnevni upit rucnog pregleda (docs/GO_LIVE_NAPLATA.md 5.1 i 5.2), a oznaka punog
      // povrata ostaje `refunded` pa je uplata i radnik bonusa i dalje vide.
      if (rucniPregled !== null) {
        await settle('needs_manual_review', 'refunded', rucniPregled);
        return json({ ok: true, action: 'refunded', review: rucniPregled.slice(0, rucniPregled.indexOf(':')) });
      }
      await settle('processed', 'refunded');
      return json({ ok: true, action: 'refunded' });
    }

    // Povrat za PaymentIntent bez naseg entitlementa i bez rucne narudzbe: ili tudja naplata
    // (Payment Link, fakture), ili povrat koji je stigao PRIJE uplate. 200 jer retry tudju naplatu
    // ne popravlja; oznaka ostaje u REFUND_MARKERS, pa uplata koja stigne kasnije pravo odmah gasi.
    console.error('webhook-mor refund_without_entitlement', { orderId: ev.orderId });
    await settle('processed', 'refund_without_entitlement');
    return json({ ok: true, action: 'refund_without_entitlement' }, 200);
  }

  // Od ovdje nadalje se knjizi pravo pristupa. Vlasnik dogadjaja je sigurno poznat: potvrdjena
  // naplata bez `metadata[user_id]` je vec izasla gore kao `needs_manual_link` (klasifikator).

  // proizvod iz kataloga po KATALOSKOM id-u iz metadata (sekcija 6.2). Prije 2026-09-23 se
  // trazio po `mor_product_id`; taj put je uklonjen zajedno s MoR providerom, jer bi inace
  // svaka Stripe uplata tiho zavrsila kao `unknown_product`.
  // `offer_codes(capabilities)`: prava ponude se citaju U ISTOM upitu kao cijena, pa snapshot na
  // entitlementu odgovara katalogu u trenutku kupnje (Monetizacija V1, odjeljak 13).
  const { data: prow, error: productErr } = await admin
    .from('products')
    .select('*, offer_codes(capabilities)')
    .eq('id', ev.productId)
    .maybeSingle();
  // Prolazna greska baze NIJE nepoznat proizvod (Codex pregled kruga 3). Da se tretira kao
  // nepoznat, placena kupnja bi dobila 200 i Stripe je nikad ne bi ponovio. 500 = retry.
  if (productErr) {
    console.error('webhook-mor product_lookup_failed', { orderId: ev.orderId, error: productErr.message });
    await settle('failed', `product_lookup: ${productErr.message}`);
    return json({ error: 'product_lookup_failed' }, 500);
  }
  const product = prow ? mapProductRow(prow as Record<string, unknown>) : null;
  if (!product) {
    // Nepoznat id -> log ERROR + alert; 200 bez entitlementa da provider ne retry-a (6.2).
    console.error('webhook-mor unknown_product', { productId: ev.productId, orderId: ev.orderId });
    // I dalje 200: retry ne bi popravio nepostojec proizvod, samo bi potrosio providerov prozor.
    // Razlika je u tome sto dogadjaj sada TRAJNO postoji u webhook_events, pa se nakon ispravka
    // kataloga moze replayati umjesto da placena kupnja ostane bez traga.
    await settle('unknown_product', `productId=${ev.productId}`);
    return json({ ok: true, action: 'unknown_product_logged' }, 200);
  }

  // PROIZVOD KOJI LEKTA NE PRODAJE (nalaz pregleda F18 krug 2). Katedra pass je u istoj tablici
  // products, ali ga Lektin checkout odbija (resolveCheckout), a Katedra ga knjizi sama i uz
  // `academic_project_id`. Da ga ovaj webhook knjizi, zauzeo bi unique(provider, order_id) prije
  // Katedre i upisao pravo bez projekta koje Katedrini gardovi ne priznaju. 200 bez upisa, jer je
  // za nas trajno neobradiv; dogadjaj ostaje u inboxu.
  if (!isSoldByLektaCheckout(product.id)) {
    console.warn('webhook-mor foreign_event_ignored', {
      orderId: ev.orderId,
      reason: 'foreign_product',
      productId: product.id,
    });
    await settle('ignored', `foreign_product: ${product.id}`);
    return json({ ok: true, action: 'ignored', reason: 'foreign_product' }, 200);
  }

  // NADOGRADNJA Repair -> Final Pass (Monetizacija V1, odjeljak 14). Iznos nadogradnje NIJE puna
  // kataloska cijena nego razlika (ciljna cijena minus vec placeno za isto pravo), pa ova uplata ne
  // smije proci kroz usporedbu s punom cijenom nize. Pretvara se postojece pravo, bez novog retka.
  if (ev.upgradeFromEntitlementId) {
    return await bookUpgradePayment(admin, ev, product, settle, deps.now?.() ?? Date.now());
  }

  // NAPLACENI IZNOS NASPRAM KATALOGA (nalaz adversarijalnog pregleda 2026-09-23; odluka vlasnika
  // 2026-09-27). Iznos je pri stvaranju PaymentIntenta bio serverski, pa ga klijent nije mogao
  // podvaliti; ali izmedju stvaranja i naplate cjenik se moze promijeniti, a PaymentIntent moze
  // nastati i izvan create-checkouta (npr. rucno u Stripe sucelju) uz tudji iznos ili valutu.
  //
  // Uplata MANJA od kataloske cijene, ili u valuti koja nije EUR, NE daje pravo: ni entitlement ni
  // rucnu narudzbu. Ishod je `needs_manual_review` (operater odlucuje: povrat ili rucno vezivanje,
  // docs/GO_LIVE_NAPLATA.md, 5.1), ERROR redak i 200, jer Stripe retry iznos ne bi promijenio.
  // Provjera ide PRIJE svakog upisa (rucna narudzba, entitlement, bonusi) i pise samo u VLASTITI
  // redak inboxa, pa oznaku punog povrata istog PaymentIntenta (REFUND_MARKERS) ne dira.
  // Uplata VECA od kataloske cijene i dalje daje pravo; razlika ostaje zapisana (amount_mismatch).
  //
  // NEUPOTREBLJIVA KATALOSKA CIJENA (nalaz pregleda 2026-09-27). mapProductRow cijenu null ili
  // neispravnu pretvara u 0 i proizvod oznacava neaktivnim. Ocekivani iznos je tada bio 0 centi, pa
  // je SVAKA pozitivna uplata prolazila kao `above_catalog` i dobivala pravo. create-checkout takav
  // proizvod ne prodaje (resolveCheckout odbija neaktivan, `invalid_price` odbija iznos <= 0), pa
  // uplata za njega nije nastala iz naseg cjenika. FAIL-CLOSED: neaktivan proizvod ili cijena koja
  // ne daje pozitivan iznos u centima ne daje pravo nego ide na rucni pregled
  // (`catalog_price_unusable`).
  const ocekivanoCenti = stripeAmountCents(Number(product.priceEur));
  const cijenaUpotrebljiva = product.active && Number.isFinite(ocekivanoCenti) && ocekivanoCenti > 0;
  const iznos: ChargedAmountVerdict | { kind: 'needs_manual_review'; reason: 'catalog_price_unusable'; detail: string } =
    cijenaUpotrebljiva
      ? chargedAmountVerdict(ev, ocekivanoCenti)
      : {
        kind: 'needs_manual_review',
        reason: 'catalog_price_unusable',
        detail: `catalog_price_unusable aktivan=${product.active} ocekivano=${Number.isFinite(ocekivanoCenti) ? ocekivanoCenti : 'nepoznato'} ` +
          `naplaceno=${ev.totalCents === null ? 'nepoznato' : ev.totalCents} valuta=${ev.currency || 'nepoznata'}`,
      };

  // PONOVLJENA DOSTAVA VEC PROKNJIZENE UPLATE (nalaz pregleda 2026-09-27). Iznos se usporedjuje s
  // cjenikom u trenutku OBRADE, ne kupnje. Stripe retry iste uplate nakon promjene cijene (ili nakon
  // sto je proizvod povucen) zavrsio bi kao `needs_manual_review`, iako je pravo vec upisano, a
  // obveze bonusa mozda cekaju oporavak kroz `duplicate_ignored` (audit P1-07). Zato se PRIJE
  // odluke o rucnom pregledu provjeri postoji li vec zapis ISTE uplate: entitlement (rucna narudzba
  // za premium_human) s istim PaymentIntentom i ISTIM korisnikom. Ako postoji, dogadjaj ide putem
  // duplikata, gdje se i dalje cita oznaka povrata i zapisuju obveze bonusa. Zapis drugog korisnika
  // nije ponavljanje nego sukob, pa uplata ispod kataloga i tada ide na rucni pregled. Citanje se
  // radi samo kad bi odluka inace bila rucni pregled, pa put uobicajene kupnje ostaje isti.
  let vecProknjizeno = false;
  if (iznos.kind === 'needs_manual_review') {
    const { data: zapis, error: zapisErr } = await admin
      .from(product.manualFulfillment ? 'manual_orders' : 'entitlements')
      .select('id, user_id')
      .eq('provider', PROVIDER)
      .eq('order_id', ev.orderId)
      .maybeSingle();
    if (zapisErr) {
      console.error('webhook-mor replay_lookup_failed', { orderId: ev.orderId, error: dbErrorMessage(zapisErr) });
      await settle('failed', `replay_lookup: ${dbErrorMessage(zapisErr)}`);
      return json({ error: 'internal' }, 500);
    }
    const redak = typeof zapis === 'object' && zapis !== null && !Array.isArray(zapis) ? (zapis as Record<string, unknown>) : null;
    vecProknjizeno = redak !== null && String(redak.user_id ?? '') === ev.userId;
  }
  if (iznos.kind === 'needs_manual_review' && !vecProknjizeno) {
    console.error('webhook-mor needs_manual_review', {
      reason: iznos.reason,
      orderId: ev.orderId,
      productId: product.id,
      ocekivanoCenti,
      naplacenoCenti: ev.totalCents,
      currency: ev.currency,
    });
    await settle('needs_manual_review', iznos.detail);
    return json({ ok: true, action: 'needs_manual_review', reason: iznos.reason }, 200);
  }

  // rucni fulfillment (premium_human): otvori manual_orders, bez entitlementa (6.3)
  if (product.manualFulfillment) {
    // Ponovljena dostava vec otvorene narudzbe (vecProknjizeno, gore) ne pise nista novo.
    const { error } = vecProknjizeno
      ? { error: null }
      : await admin
        .from('manual_orders')
        .insert({ user_id: ev.userId, product_id: product.id, order_id: ev.orderId, provider: PROVIDER });
    const narudzbaVecPostoji = vecProknjizeno || dbErrorCode(error) === UNIQUE_VIOLATION;
    if (error && !narudzbaVecPostoji) {
      // Tekst greske baze ide SAMO u log i inbox, nikad u odgovor (odluka vlasnika 2026-09-27).
      console.error('webhook-mor manual_order_insert_failed', { orderId: ev.orderId, error: dbErrorMessage(error) });
      await settle('failed', `manual_order_insert: ${dbErrorMessage(error)}`);
      return json({ error: 'insert_failed' }, 500);
    }

    // POVRAT STIGAO PRIJE ILI ISTODOBNO S UPLATOM, ZA RUCNU NARUDZBU (nalaz pregleda kruga 2 za
    // odluku vlasnika 2026-09-27). Isti dogovor kao za entitlement nize: narudzba se PRVO upise, pa
    // se TEK ONDA cita oznaka punog povrata istog PaymentIntenta. Povrat radi zrcalno (oznaka, pa
    // citanje manual_orders u closeRefundConsequences), pa barem jedna strana vidi upis druge.
    // Bez ovoga je povrat obradjen prije uplate (Stripe ne jamci redoslijed, a prvi pokusaj uplate
    // mogao je pasti pa cekati retry) nalazio praznu manual_orders, a retry uplate je potom otvarao
    // `pending` narudzbu za vec vracen novac, bez ijednog kasnijeg dogadjaja koji bi je zatvorio.
    // I duplikat (23505) prolazi ovuda: retry nakon povrata ne smije javiti `duplicate_ignored` dok
    // je narudzba jos otvorena. Zatvaranje je isto kao na strani povrata i ne dira vec zatvoreno.
    // Pad citanja ili zatvaranja je 500 (retry prolazi kroz 23505 i opet dolazi ovamo).
    const { data: oznakaPovrata, error: oznakaErr } = await admin
      .from('webhook_events')
      .select('id')
      .eq('provider', PROVIDER)
      .eq('order_id', ev.orderId)
      .in('outcome_detail', REFUND_MARKERS)
      .limit(1);
    if (oznakaErr) {
      console.error('webhook-mor refund_marker_lookup_failed', { orderId: ev.orderId, error: dbErrorMessage(oznakaErr) });
      await settle('failed', `refund_marker_lookup: ${dbErrorMessage(oznakaErr)}`);
      return json({ error: 'refund_marker_lookup_failed' }, 500);
    }
    if (Array.isArray(oznakaPovrata) && oznakaPovrata.length > 0) {
      const zatvoreno = await closeRefundConsequences(admin, ev.orderId, deps.now?.() ?? Date.now());
      if (!zatvoreno.ok) {
        console.error('webhook-mor refund_consequences_failed', {
          orderId: ev.orderId,
          step: zatvoreno.step,
          error: zatvoreno.error,
        });
        await settle('failed', `refunded_before_payment: ${zatvoreno.step}: ${zatvoreno.error}`);
        return json({ error: 'refund_failed' }, 500);
      }
      console.error('webhook-mor manual_order_refunded_before_payment', {
        orderId: ev.orderId,
        productId: product.id,
        manualOrdersClosed: zatvoreno.manualOrdersClosed,
      });
      await settle('processed', 'refunded_before_payment');
      return json({ ok: true, action: 'refunded_before_payment' }, 200);
    }

    if (narudzbaVecPostoji) {
      await settle('processed', 'manual_order_duplicate');
      return json({ ok: true, action: 'duplicate_ignored' });
    }
    await settle('processed', 'manual_order_created');
    return json({ ok: true, action: 'manual_order_created' });
  }

  if (!product.workType) {
    console.error('webhook-mor product_without_work_type', { productId: product.id });
    await settle('failed', `product_without_work_type: ${product.id}`);
    return json({ error: 'product_misconfigured' }, 500);
  }

  // NAPLACENO VISE OD KATALOGA: pravo se knjizi (kupac je platio barem trazenu cijenu), a razlika
  // se glasno zapisuje i ostaje u inboxu, pa postoji trag za rucnu ispravku. Manji iznos i tudja
  // valuta su vec izasli gore kao `needs_manual_review`.
  if (iznos.kind === 'above_catalog') {
    console.error('webhook-mor amount_mismatch', {
      orderId: ev.orderId,
      productId: product.id,
      ocekivanoCenti,
      naplacenoCenti: ev.totalCents,
      currency: ev.currency,
    });
  }

  // entitlement (6.4); idempotentno preko unique (provider, order_id). Ponovljena dostava vec
  // proknjizene uplate (vecProknjizeno, gore) ne pokusava upis: redak istog korisnika vec postoji.
  let vecPostoji = vecProknjizeno;
  if (!vecPostoji) {
    // SNAPSHOT PRAVA PRI KUPNJI (Monetizacija V1, odjeljak 13). Proizvod bez offer_code ili bez
    // ugradjenih prava se ne knjizi s praznim snapshotom: 500 (Stripe ponovi dok se katalog ne
    // ispravi), isto kao proizvod bez work_type. Ponovljena dostava vec proknjizene uplate ovamo ne
    // ulazi, pa ispravak kataloga ne treba za vec upisano pravo.
    const snapshot = entitlementSnapshotOf(product);
    if (!snapshot) {
      console.error('webhook-mor product_without_offer', { productId: product.id, orderId: ev.orderId });
      await settle('failed', `product_without_offer: ${product.id}`);
      return json({ error: 'product_misconfigured' }, 500);
    }
    const { error } = await admin
      .from('entitlements')
      .insert(buildEntitlementInsert({ ...product, ...snapshot }, ev, PROVIDER, Date.now()));
    if (error && dbErrorCode(error) !== UNIQUE_VIOLATION) {
      // Tekst greske baze ide SAMO u log i inbox, nikad u odgovor (odluka vlasnika 2026-09-27).
      console.error('webhook-mor entitlement_insert_failed', {
        orderId: ev.orderId,
        code: dbErrorCode(error),
        error: dbErrorMessage(error),
      });
      await settle('failed', `entitlement_insert: ${dbErrorMessage(error)}`);
      return json({ error: 'insert_failed' }, 500);
    }

    // 23505 NIJE DOKAZ DA JE TO ISTA KUPNJA (odluka vlasnika 2026-09-27). unique(provider, order_id)
    // kaze samo da za ovaj PaymentIntent redak VEC postoji, ne i ciji je. Dotad se svaki 23505
    // tumacio kao "vec obradjeno" i dogadjaj je nastavljao na bonuse i `duplicate_ignored`, iako
    // pravo mozda pripada drugom korisniku (npr. rucno vezivanje na krivi racun ili podmetnuta
    // metadata). Zato se postojeci redak cita i vlasnik usporedjuje PRIJE citanja oznake povrata i
    // prije ikakvog bonusa. Nepodudaran vlasnik: `conflict_other_user`, ERROR redak, 200 bez novog
    // prava i bez bonusa. Pad citanja je 500 (retry); redak koji nakon 23505 ne postoji ne dokazuje
    // nista, pa je i to 500.
    if (error) {
      const { data: postojece, error: vlasnikErr } = await admin
        .from('entitlements')
        .select('id, user_id')
        .eq('provider', PROVIDER)
        .eq('order_id', ev.orderId)
        .maybeSingle();
      if (vlasnikErr || !postojece) {
        const razlog = vlasnikErr ? dbErrorMessage(vlasnikErr) : 'redak_ne_postoji';
        console.error('webhook-mor entitlement_owner_lookup_failed', { orderId: ev.orderId, error: razlog });
        await settle('failed', `entitlement_owner_lookup: ${razlog}`);
        return json({ error: 'internal' }, 500);
      }
      if (String(postojece.user_id ?? '') !== ev.userId) {
        console.error('webhook-mor conflict_other_user', {
          orderId: ev.orderId,
          productId: product.id,
          eventUserId: ev.userId,
          existingUserId: postojece.user_id ?? null,
          existingEntitlementId: postojece.id ?? null,
        });
        await settle(
          'conflict_other_user',
          `entitlement=${String(postojece.id ?? '')} postojeci_korisnik=${String(postojece.user_id ?? '')} korisnik_dogadjaja=${ev.userId}`,
        );
        return json({ ok: true, action: 'conflict_other_user' }, 200);
      }
      vecPostoji = true;
    }
  }

  // POVRAT STIGAO PRIJE ILI ISTODOBNO S UPLATOM (Codex pregled kruga 3). Pravo je upisano (ili je
  // vec postojalo), pa se TEK SADA cita oznaka punog povrata istog PaymentIntenta. Povrat radi
  // zrcalno (oznaka pa citanje prava), pa barem jedna strana vidi drugu. Ako je oznaka tu, pravo
  // se gasi i ne izdaje se nijedan bonus; ono sto je izdao raniji pokusaj iste uplate (pass kupon,
  // nagrade) zatvara closePaymentAfterRefund. Greska citanja je 500: retry prolazi kroz 23505 i
  // ponovno dolazi ovamo, a bonusi se ne izdaju naslijepo za mozda vraceni novac.
  {
    const { data: marker, error: markerErr } = await admin
      .from('webhook_events')
      .select('id')
      .eq('provider', PROVIDER)
      .eq('order_id', ev.orderId)
      .in('outcome_detail', REFUND_MARKERS)
      .limit(1);
    if (markerErr) {
      console.error('webhook-mor refund_marker_lookup_failed', { orderId: ev.orderId, error: dbErrorMessage(markerErr) });
      await settle('failed', `refund_marker_lookup: ${dbErrorMessage(markerErr)}`);
      return json({ error: 'refund_marker_lookup_failed' }, 500);
    }
    if (Array.isArray(marker) && marker.length > 0) {
      const zatvoreno = await closePaymentAfterRefund(admin, ev, product.id, deps.now?.() ?? Date.now());
      if (!zatvoreno.ok) {
        console.error('webhook-mor refund_consequences_failed', { orderId: ev.orderId, step: zatvoreno.step, error: zatvoreno.error });
        await settle('failed', `refunded_before_payment: ${zatvoreno.step}: ${zatvoreno.error}`);
        return json({ error: 'refund_failed' }, 500);
      }
      console.error('webhook-mor refunded_before_payment', { orderId: ev.orderId, productId: product.id });
      await settle('processed', 'refunded_before_payment');
      return json({ ok: true, action: 'refunded_before_payment' }, 200);
    }
  }

  if (vecPostoji) {
    // TOCKA OPORAVKA (audit P1-07). Dosad je ovaj put izlazio PRIJE bonusa, pa je obveza koja je
    // pri prvom pokusaju pala ostajala izgubljena zauvijek. Sada retry jos jednom osigura da
    // obveze postoje; radnik ih preuzme i izvrsi.
    await enqueueBonuses(admin, ev, product);
    await settle('processed', 'entitlement_duplicate');
    return json({ ok: true, action: 'duplicate_ignored' });
  }

  // AUD-28: entitlement je JEZGRA i vec je kreiran (idempotentan preko unique(provider,order_id)).
  // Post-entitlement bonusi (referrer nagrada, pass kupon, referral atribucija) NE SMIJU srusiti
  // handler u 500 ako transientno padnu: provider bi retryjao, pogodio 23505 na entitlementu i vratio
  // 'duplicate_ignored', pa bi kupon/atribucija za taj order ostali TRAJNO nekreirani. Zato svaki
  // bonus lovi svoju gresku i nastavlja (logira se), a jezgra ostaje uspjesna (200). Pred-entitlement
  // greske i dalje idu na top-level catch -> 500 -> Stripe retry (tada entitlement bude kreiran).

  // Referral (pozovi-prijatelja, 0013): kupceva placena kupnja nagraduje preporucitelja internim
  // entitlementom. Fail-safe (interni try/catch); ZASEBAN od attributeReferral (0005 program).
  // Obveze se zapisuju PRIJE pokusaja: pad usred izvrsenja tako ostavlja `pending` redak, a ne
  // prazninu (audit P1-07).
  await enqueueBonuses(admin, ev, product);

  await (deps.grantReferrerReward ?? tryGrantReferrerReward)(admin, ev.userId, product.workType, ev.orderId);
  await markBonusDone(admin, ev.orderId, 'referrer_reward');

  // pass bonus kupon (6.5): samo uz tek kreiran entitlement (ne na duplikat)
  if (isPassProduct(product.kind)) {
    try {
      // AUD-28: ON CONFLICT (source_order_id, reason) DO NOTHING preko
      // coupon_grants_order_reason_key (0024); retry ne duplira pass_bonus kupon.
      await admin.from('coupon_grants').upsert({
        user_id: ev.userId,
        code: makePassCouponCode(ev.orderId),
        reason: 'pass_bonus',
        source_order_id: ev.orderId,
        expires_at: isoAfterDays(Date.now(), PASS_COUPON_VALID_DAYS),
      }, { onConflict: 'source_order_id,reason', ignoreDuplicates: true });
      await markBonusDone(admin, ev.orderId, 'pass_coupon');
    } catch (e) {
      // Redak ostaje `pending`: radnik ga ponovi. Prije je ovdje zavrsavao trag.
      console.error('webhook-mor pass_coupon_failed', { orderId: ev.orderId, error: String(e) });
    }
    // TODO(integracija): kreiraj -20% Stripe kupon (vrijedi na slot_zavrsni/slot_diplomski)
    // i posalji kod korisniku mailom. Zakljucaj da ne vrijedi na partner proizvode (sekcija 7).
  }

  // referral atribucija (sekcija 6.6 / 8): samo uz tek kreiran entitlement (duplikat je vec izasao gore)
  if (ev.referralCode) {
    try {
      await attributeReferral(admin, ev);
      await markBonusDone(admin, ev.orderId, 'referral_attribution');
    } catch (e) {
      // Redak ostaje `pending`: radnik ga ponovi.
      console.error('webhook-mor attribute_referral_failed', { orderId: ev.orderId, error: String(e) });
    }
  }

  // PROZOR ISTODOBNOG POVRATA ZA BONUSE (nalaz pregleda 2026-09-27). Oznaka povrata je gore
  // procitana PRIJE bonusa. Puni povrat koji stigne izmedju tog citanja i upisa kupona (ili nagrade
  // preporucitelju) upise oznaku, ugasi pravo i procita coupon_grants i referral_signups dok su
  // jos prazni, pa kupon i nagrada nastanu tek nakon njegova citanja i ostanu aktivni za vracen
  // novac. Isti dogovor pisi-pa-citaj kao za entitlement i manual_orders: bonusi su upisani, pa se
  // oznaka cita PONOVNO. Ako je tu, opoziva se sve sto je ova uplata izdala (closePaymentAfterRefund,
  // idempotentno). Greska citanja je 500: retry prolazi kroz 23505 i citanje prije bonusa, koje
  // tada isto zatvara sve izdano.
  {
    const { data: kasniPovrat, error: kasniErr } = await admin
      .from('webhook_events')
      .select('id')
      .eq('provider', PROVIDER)
      .eq('order_id', ev.orderId)
      .in('outcome_detail', REFUND_MARKERS)
      .limit(1);
    if (kasniErr) {
      console.error('webhook-mor refund_marker_lookup_failed', { orderId: ev.orderId, error: dbErrorMessage(kasniErr) });
      await settle('failed', `refund_marker_recheck: ${dbErrorMessage(kasniErr)}`);
      return json({ error: 'refund_marker_lookup_failed' }, 500);
    }
    if (dbRows(kasniPovrat).length > 0) {
      const zatvoreno = await closePaymentAfterRefund(admin, ev, product.id, deps.now?.() ?? Date.now());
      if (!zatvoreno.ok) {
        console.error('webhook-mor refund_consequences_failed', { orderId: ev.orderId, step: zatvoreno.step, error: zatvoreno.error });
        await settle('failed', `refunded_during_payment: ${zatvoreno.step}: ${zatvoreno.error}`);
        return json({ error: 'refund_failed' }, 500);
      }
      console.error('webhook-mor refunded_during_payment', { orderId: ev.orderId, productId: product.id });
      await settle('processed', 'refunded_during_payment');
      return json({ ok: true, action: 'refunded_during_payment' }, 200);
    }
  }

  await settle(
    'processed',
    iznos.kind === 'above_catalog' ? `entitlement_created; ${iznos.detail}` : 'entitlement_created',
  );
  return json({ ok: true, action: 'entitlement_created' });
 } catch (e) {
  // Pred-entitlement greska (potpis, parsiranje, entitlement insert): vrati 500 pa provider
  // retryja i entitlement na kraju bude kreiran. Post-entitlement bonusi su vec ulovljeni gore.
  console.error('[webhook-mor]', e);
  return json({ error: 'internal' }, 500);
 }
};
}

// ---------------------------------------------------------------------------
// NADOGRADNJA Repair -> Final Pass (Monetizacija V1, odjeljak 14). Stoji na kraju datoteke da
// staticki gardovi nad redoslijedom glavnog toka (tests/webhook.test.ts) i dalje vide glavni tok prvi.
/** Upit supabase-js graditelja kakvog nadogradnja koristi (thenable koji se dalje suzava). */
interface UpgradeQuery extends PromiseLike<DbResponse> {
  eq(column: string, value: string): UpgradeQuery;
  gt(column: string, value: string): UpgradeQuery;
  in(column: string, values: readonly string[]): UpgradeQuery;
  limit(count: number): UpgradeQuery;
  select(columns: string): UpgradeQuery;
  maybeSingle(): PromiseLike<DbResponse>;
}

/** Najuzi oblik Supabase klijenta koji nadogradnja treba; bez `any`. */
interface UpgradeDb {
  from(table: 'entitlements' | 'webhook_events' | 'document_slots'): {
    select(columns: string): UpgradeQuery;
    update(values: Record<string, string>): UpgradeQuery;
  };
  rpc(fn: 'apply_entitlement_upgrade', args: Record<string, string | number | null>): PromiseLike<DbResponse>;
}

/** Zapis ishoda u inbox (settle iz handlera). */
type Settle = (outcome: string | null, detail?: string) => Promise<boolean>;

/**
 * UPLATA NADOGRADNJE Repair -> Final Pass (Monetizacija V1, odjeljak 14). Pretvara POSTOJECE pravo
 * (isti entitlement, isti vezani slot i otisak dokumenta), ne stvara drugo.
 *
 *  1. Izvorno pravo se cita po id-u iz metadate. Ako ga je vec pretvorila OVA uplata, to je
 *     ponovljena dostava: nista se ne pise.
 *  2. Iznos se provjerava ISTOM odlukom kao u create-checkoutu (quoteUpgrade: ciljna cijena iz
 *     products.price_eur minus paid_amount_cents istog prava) i chargedAmountVerdict. Pravo koje
 *     nije kandidat (tudje, vec nadogradjeno, isteklo, druga vrsta rada) ili uplata ispod razlike
 *     ide na rucni pregled: novac je naplacen, a pretvorba nije dopustena.
 *  3. apply_entitlement_upgrade (0207) pretvara pravo atomski i jednom; `unavailable` znaci da ga
 *     je u medjuvremenu promijenilo nesto drugo (npr. druga uplata nadogradnje), pa rucni pregled.
 *  4. Pisi pa citaj, kao i obicna uplata: tek nakon pretvorbe se cita oznaka punog povrata ISTE
 *     uplate; ako je tu, nadogradjeno pravo se gasi.
 * Nadogradnja ne izdaje bonuse (pass kupon, nagrada preporucitelju): to su posljedice prve kupnje.
 */
async function bookUpgradePayment(
  admin: UpgradeDb,
  ev: StripeEvent,
  product: Product,
  settle: Settle,
  nowMs: number,
): Promise<Response> {
  const { data: srow, error: sourceErr } = await admin
    .from('entitlements')
    .select(UPGRADE_SOURCE_COLUMNS)
    .eq('id', ev.upgradeFromEntitlementId)
    .maybeSingle();
  if (sourceErr) {
    console.error('webhook-mor upgrade_source_lookup_failed', { orderId: ev.orderId, error: dbErrorMessage(sourceErr) });
    await settle('failed', `upgrade_source_lookup: ${dbErrorMessage(sourceErr)}`);
    return json({ error: 'internal' }, 500);
  }
  const source = mapUpgradeSourceRow(srow);
  const ponovljeno = source !== null && source.userId === ev.userId && source.upgradeOrderId === ev.orderId;

  let iznosIznad = '';
  if (!ponovljeno) {
    // POVRAT OVE UPLATE VEC ZABILJEZEN (Stripe ne jamci redoslijed): pravo se ne pretvara uopce, pa
    // placeni Repair ostaje netaknut. Drugo citanje nakon pretvorbe (nize) pokriva samo istodobni
    // povrat; bez ovog prvog bi povrat koji je stigao prije uplate ugasio i Repair.
    const { data: ranijiPovrat, error: ranijiErr } = await admin
      .from('webhook_events')
      .select('id')
      .eq('provider', PROVIDER)
      .eq('order_id', ev.orderId)
      .in('outcome_detail', REFUND_MARKERS)
      .limit(1);
    if (ranijiErr) {
      console.error('webhook-mor refund_marker_lookup_failed', { orderId: ev.orderId, error: dbErrorMessage(ranijiErr) });
      await settle('failed', `refund_marker_lookup: ${dbErrorMessage(ranijiErr)}`);
      return json({ error: 'refund_marker_lookup_failed' }, 500);
    }
    if (dbRows(ranijiPovrat).length > 0) {
      console.error('webhook-mor refunded_before_payment', { orderId: ev.orderId, productId: product.id, upgrade: true, converted: false });
      await settle('processed', 'refunded_before_payment');
      return json({ ok: true, action: 'refunded_before_payment' }, 200);
    }

    // Vezani rad mora biti jos ziv (isto pravilo kao create-checkout; apply_entitlement_upgrade ga
    // ponavlja atomski). Slot je mogao isteci izmedju checkouta i uplate: tada rucni pregled.
    if (source && source.slotsUsed > 0) {
      const slot = await readBoundSlotLive(admin, source.id, new Date(nowMs).toISOString());
      if (!slot.ok) {
        console.error('webhook-mor upgrade_source_lookup_failed', { orderId: ev.orderId, error: slot.error });
        await settle('failed', `upgrade_slot_lookup: ${slot.error}`);
        return json({ error: 'internal' }, 500);
      }
      source.boundSlotLive = slot.live;
    }
    const quote = quoteUpgrade(product, source, ev.userId, nowMs);
    const iznos = quote.ok ? chargedAmountVerdict(ev, quote.amountCents) : null;
    const razlog = !quote.ok
      ? quote.error
      : iznos && iznos.kind === 'needs_manual_review'
        ? iznos.reason
        : null;
    if (razlog !== null || !source) {
      const reason = razlog ?? 'upgrade_source_not_found';
      console.error('webhook-mor upgrade_needs_manual_review', {
        reason,
        orderId: ev.orderId,
        productId: product.id,
        sourceEntitlementId: ev.upgradeFromEntitlementId,
        naplacenoCenti: ev.totalCents,
        currency: ev.currency,
      });
      await settle(
        'needs_manual_review',
        `upgrade:${reason} izvor=${ev.upgradeFromEntitlementId} naplaceno=${ev.totalCents === null ? 'nepoznato' : ev.totalCents}`,
      );
      return json({ ok: true, action: 'needs_manual_review', reason }, 200);
    }
    if (iznos && iznos.kind === 'above_catalog') iznosIznad = iznos.detail;

    const { data: ishod, error: rpcErr } = await admin.rpc('apply_entitlement_upgrade', {
      p_entitlement_id: source.id,
      p_user_id: ev.userId,
      p_upgrade_order_id: ev.orderId,
      p_target_product_id: product.id,
      p_upgrade_paid_cents: ev.amountReceivedCents ?? ev.totalCents,
      p_purchase_expires_at: isoAfterDays(nowMs, product.purchaseWindowDays),
      p_slot_expires_at: isoAfterDays(nowMs, product.slotWindowDays),
    });
    if (rpcErr) {
      console.error('webhook-mor upgrade_apply_failed', { orderId: ev.orderId, error: dbErrorMessage(rpcErr) });
      await settle('failed', `upgrade_apply: ${dbErrorMessage(rpcErr)}`);
      return json({ error: 'insert_failed' }, 500);
    }
    if (ishod !== 'upgraded' && ishod !== 'duplicate') {
      console.error('webhook-mor upgrade_needs_manual_review', {
        reason: 'upgrade_source_unavailable',
        orderId: ev.orderId,
        productId: product.id,
        sourceEntitlementId: source.id,
        ishod: String(ishod ?? ''),
      });
      await settle('needs_manual_review', `upgrade:upgrade_source_unavailable izvor=${source.id} ishod=${String(ishod ?? '')}`);
      return json({ ok: true, action: 'needs_manual_review', reason: 'upgrade_source_unavailable' }, 200);
    }
  }

  // Pisi pa citaj (isti dogovor kao obicna uplata): povrat ove uplate koji je stigao prije ili
  // istodobno vidi pretvoreno pravo, ili ova grana vidi njegovu oznaku.
  const { data: oznaka, error: oznakaErr } = await admin
    .from('webhook_events')
    .select('id')
    .eq('provider', PROVIDER)
    .eq('order_id', ev.orderId)
    .in('outcome_detail', REFUND_MARKERS)
    .limit(1);
  if (oznakaErr) {
    console.error('webhook-mor refund_marker_lookup_failed', { orderId: ev.orderId, error: dbErrorMessage(oznakaErr) });
    await settle('failed', `refund_marker_lookup: ${dbErrorMessage(oznakaErr)}`);
    return json({ error: 'refund_marker_lookup_failed' }, 500);
  }
  if (dbRows(oznaka).length > 0) {
    const { error: gasiErr } = await admin
      .from('entitlements')
      .update({ status: 'refunded' })
      .eq('id', ev.upgradeFromEntitlementId)
      .eq('upgrade_order_id', ev.orderId);
    if (gasiErr) {
      console.error('webhook-mor refund_consequences_failed', {
        orderId: ev.orderId,
        step: 'upgrade_entitlement_update',
        error: dbErrorMessage(gasiErr),
      });
      await settle('failed', `refunded_before_payment: upgrade_entitlement_update: ${dbErrorMessage(gasiErr)}`);
      return json({ error: 'refund_failed' }, 500);
    }
    console.error('webhook-mor refunded_before_payment', { orderId: ev.orderId, productId: product.id, upgrade: true });
    await settle('processed', 'refunded_before_payment');
    return json({ ok: true, action: 'refunded_before_payment' }, 200);
  }

  if (ponovljeno) {
    await settle('processed', 'upgrade_duplicate');
    return json({ ok: true, action: 'duplicate_ignored' });
  }
  await settle('processed', iznosIznad ? `entitlement_upgraded; ${iznosIznad}` : 'entitlement_upgraded');
  return json({ ok: true, action: 'entitlement_upgraded' });
}
