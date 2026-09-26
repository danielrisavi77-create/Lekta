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
  acceptEvent,
  isFullRefund,
  type StripeEvent,
  type StripeWebhookPayload,
} from '../../../src/report/webhook.ts';
import { mapProductRow, type Product } from '../../../src/catalog/products-catalog.ts';
import { stripeAmountCents } from '../../../src/report/checkout.ts';
import {
  validateReferral,
  referralRewardEntitlement,
  rewardIsPullable,
  semesterStart,
  REFERRAL_WELCOME_DISCOUNT,
} from '../../../src/report/referral.ts';
import { tryGrantReferrerReward } from '../_shared/grant-referrer-reward.ts';

const PROVIDER = 'stripe';

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
  /** Ocekivani Stripe Connect racun; prazno = obican racun, provjera se preskace. */
  accountId: string;
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
  if (rewardErr && (rewardErr as any).code !== '23505') {
    console.error('webhook-mor referral_reward_failed', { orderId: ev.orderId, code: (rewardErr as any).code });
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
async function pullReferralSignupReward(admin: any, orderId: string): Promise<void> {
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
          // Stripe nema pojam trgovine; kad dogadjaj nosi Connect racun, on ide u isti stupac.
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

  /** Zabiljezi ishod obrade uz zapis u inboxu. Nikad ne baca. */
  const settle = async (outcome: string, detail?: string): Promise<void> => {
    if (!eventRowId) return;
    try {
      await admin
        .from('webhook_events')
        .update({ outcome, outcome_detail: detail ?? null, processed_at: new Date().toISOString() })
        .eq('id', eventRowId);
    } catch (e) {
      console.error('webhook-mor inbox_settle_failed', { eventRowId, detail: String(e) });
    }
  };

  // PORIJEKLO I VRSTA DOGADJAJA (audit PAY-04/PAY-05). Ispravan potpis dokazuje samo da
  // posiljatelj zna tajnu, NE i da dogadjaj dolazi iz naseg produkcijskog okruzenja ni da je
  // vrsta koju znamo knjiziti. Bez ove provjere bi valjano potpisan testni dogadjaj dodijelio
  // pravo pravo pristupa. Provjera ide PRIJE svakog upisa, ukljucujuci refund granu.
  const gate = acceptEvent(ev, {
    allowTestMode: deps.allowTestMode,
    expectedAccountId: deps.accountId,
  });
  if (!gate.ok) {
    // 200: dogadjaj je testni, tudji ili nas se ne tice, dakle za nas trajno neobradiv. Retry ga
    // ne bi popravio, a 5xx bi providera natjerao da ga ponavlja do isteka prozora.
    const detail = {
      reason: gate.reason,
      eventName: ev.eventName,
      livemode: ev.livemode,
      accountId: ev.accountId,
      orderId: ev.orderId,
    };
    // Ignorirana vrsta je ocekivan promet (Stripe salje mnogo toga), pa ne ide u ERROR kanal;
    // odbijeno porijeklo ide, jer znaci ili krivu konfiguraciju ili pokusaj.
    if (gate.reason === 'event_ignored') console.info('webhook-mor event_ignored', detail);
    else console.error('webhook-mor event_refused', detail);
    await settle(gate.reason === 'event_ignored' ? 'ignored' : 'refused', gate.reason);
    return json({ ok: true, action: gate.reason === 'event_ignored' ? 'ignored' : 'event_refused', reason: gate.reason }, 200);
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

  // refund: blokiraj daljnje vezivanje slotova iz tog entitlementa (sekcija 6.7)
  if (ev.refunded) {
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
    // Pad ovog upisa se dotad progutao, a dogadjaj se javljao kao obradjen: korisnik bi dobio
    // novac natrag i ZADRZAO pravo pristupa, bez traga da je gasenje palo (nalaz adversarijalnog
    // pregleda, 2026-09-23). 500 je ovdje ispravan odgovor: Stripe ponovi dostavu.
    const { data: refundedRows, error: refundErr } = await admin
      .from('entitlements')
      .update({ status: 'refunded' })
      .eq('provider', PROVIDER)
      .eq('order_id', ev.orderId)
      .select('id');
    if (refundErr) {
      console.error('webhook-mor refund_update_failed', { orderId: ev.orderId, error: refundErr.message });
      await settle('failed', `refund_update: ${refundErr.message}`);
      return json({ error: 'refund_failed' }, 500);
    }
    // Povrat za PaymentIntent bez naseg entitlementa: ili tudja naplata (Payment Link, fakture),
    // ili povrat koji je stigao PRIJE uplate (Stripe ne jamci redoslijed). 200 jer retry tudju
    // naplatu ne popravlja, ali GLASNO i s tragom u inboxu, da se drugi slucaj moze rucno
    // provjeriti umjesto da se prikaze kao uspjesno ugasen entitlement.
    if (!Array.isArray(refundedRows) || refundedRows.length === 0) {
      console.error('webhook-mor refund_without_entitlement', { orderId: ev.orderId });
      await settle('processed', 'refund_without_entitlement');
      return json({ ok: true, action: 'refund_without_entitlement' }, 200);
    }
    await pullReferralReward(admin, ev.orderId); // povuci nepotrosenu referral nagradu (0005, 6.7)
    await pullReferralSignupReward(admin, ev.orderId); // isto za pozovi-prijatelja nagradu (0013)
    await settle('processed', 'refunded');
    return json({ ok: true, action: 'refunded' });
  }

  // Od ovdje nadalje se knjizi pravo pristupa, pa je vlasnik dogadjaja obavezan. PaymentIntent
  // bez `metadata[user_id]` NIJE nastao kroz create-checkout (koji ga uvijek postavlja): to je
  // tudja naplata na istom Stripe racunu, npr. rucni Payment Link iz buildPaymentUrl. Isti razred
  // kao nepoznat proizvod: trajno neobradiv, pa 200 da ga Stripe ne ponavlja danima, uz zapis.
  if (!ev.userId) {
    console.warn('webhook-mor foreign_event_ignored', { orderId: ev.orderId, reason: 'missing_user_metadata' });
    await settle('ignored', 'missing_user_metadata');
    return json({ ok: true, action: 'ignored', reason: 'missing_user_metadata' }, 200);
  }

  // proizvod iz kataloga po KATALOSKOM id-u iz metadata (sekcija 6.2). Prije 2026-09-23 se
  // trazio po `mor_product_id`; taj put je uklonjen zajedno s MoR providerom, jer bi inace
  // svaka Stripe uplata tiho zavrsila kao `unknown_product`.
  const { data: prow } = await admin.from('products').select('*').eq('id', ev.productId).maybeSingle();
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

  // rucni fulfillment (premium_human): otvori manual_orders, bez entitlementa (6.3)
  if (product.manualFulfillment) {
    const { error } = await admin
      .from('manual_orders')
      .insert({ user_id: ev.userId, product_id: product.id, order_id: ev.orderId, provider: PROVIDER });
    if (error && (error as any).code === '23505') {
      await settle('processed', 'manual_order_duplicate');
      return json({ ok: true, action: 'duplicate_ignored' });
    }
    if (error) {
      await settle('failed', `manual_order_insert: ${error.message}`);
      return json({ error: 'insert_failed', detail: error.message }, 500);
    }
    await settle('processed', 'manual_order_created');
    return json({ ok: true, action: 'manual_order_created' });
  }

  if (!product.workType) {
    console.error('webhook-mor product_without_work_type', { productId: product.id });
    await settle('failed', `product_without_work_type: ${product.id}`);
    return json({ error: 'product_misconfigured' }, 500);
  }

  // NAPLACENI IZNOS NASPRAM KATALOGA (nalaz adversarijalnog pregleda, 2026-09-23). Iznos je pri
  // stvaranju PaymentIntenta bio serverski, pa ga klijent nije mogao podvaliti; ali izmedju
  // stvaranja i naplate cjenik se moze promijeniti, a dotad se to nigdje nije ni vidjelo.
  //
  // Pravo se IPAK knjizi: novac je stvarno naplacen i kupcu se ne smije uskratiti ono za sto je
  // platio zbog nase promjene cjenika. Razlika se glasno zapisuje i ostaje u inboxu, pa postoji
  // trag za rucnu ispravku umjesto tihog razilazenja.
  const ocekivanoCenti = stripeAmountCents(Number(product.priceEur));
  const naplacenoOdstupa = ev.totalCents !== null && ev.totalCents !== ocekivanoCenti;
  const valutaOdstupa = !!ev.currency && ev.currency !== 'EUR';
  if (naplacenoOdstupa || valutaOdstupa) {
    console.error('webhook-mor amount_mismatch', {
      orderId: ev.orderId,
      productId: product.id,
      ocekivanoCenti,
      naplacenoCenti: ev.totalCents,
      currency: ev.currency,
    });
  }

  // entitlement (6.4); idempotentno preko unique (provider, order_id)
  const { error } = await admin
    .from('entitlements')
    .insert(buildEntitlementInsert(product, ev, PROVIDER, Date.now()));
  if (error && (error as any).code === '23505') {
    // TOCKA OPORAVKA (audit P1-07). Dosad je ovaj put izlazio PRIJE bonusa, pa je obveza koja je
    // pri prvom pokusaju pala ostajala izgubljena zauvijek. Sada retry jos jednom osigura da
    // obveze postoje; radnik ih preuzme i izvrsi.
    await enqueueBonuses(admin, ev, product);
    await settle('processed', 'entitlement_duplicate');
    return json({ ok: true, action: 'duplicate_ignored' });
  }
  if (error) {
    await settle('failed', `entitlement_insert: ${error.message}`);
    return json({ error: 'insert_failed', detail: error.message }, 500);
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

  await settle(
    'processed',
    naplacenoOdstupa || valutaOdstupa
      ? `entitlement_created; amount_mismatch ocekivano=${ocekivanoCenti} naplaceno=${ev.totalCents} valuta=${ev.currency}`
      : 'entitlement_created',
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
