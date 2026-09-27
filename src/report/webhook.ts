/**
 * Webhook core (MONETIZATION_PLAN.md sekcija 6). Pruzatelj naplate: Stripe.
 *
 * Ciste, testabilne funkcije koje Deno Edge Function (webhook-mor) zove: provjera
 * `Stripe-Signature` potpisa s vremenskom tolerancijom, normalizacija Stripe dogadjaja, izracun
 * rokova i parametri pass kupona. Mapiranje proizvoda i DB upisi su u Edge Functionu (I/O),
 * odluke su ovdje (pokriva ih npr. check).
 *
 * Prelazak s ranijeg Merchant of Record providera na Stripe je odluka vlasnika 2026-09-23
 * (F18 u docs/agents/orchestrator-backlog.md). Stripe NIJE Merchant of Record, pa PDV
 * obracunava i prijavljuje vlasnik.
 */

/**
 * Dogadjaji koje ovaj webhook stvarno KNJIZI. Sve ostalo se prima, klasificira i ignorira uz 200
 * (classifyStripeEvent). Vrstu NE filtrira acceptEvent, da vracen novac pod drugim imenom stigne do
 * klasifikatora i bude glasan (nalaz pregleda kruga 2 pri spajanju mastera, 2026-09-26).
 */
export const STRIPE_HANDLED_EVENTS = ['payment_intent.succeeded', 'charge.refunded'] as const;
export type StripeHandledEvent = (typeof STRIPE_HANDLED_EVENTS)[number];

/** Stripe webhook payload (labava granica; citamo samo sto trebamo). */
export interface StripeWebhookPayload {
  id?: string;
  type?: string;
  /** true = produkcijski dogadjaj. false = testni nacin rada. Nedostaje = neprovjerljivo. */
  livemode?: boolean;
  /** Connect racun s kojeg dogadjaj dolazi; kod obicnog racuna ga Stripe ne salje. */
  account?: string;
  data?: {
    object?: {
      /** PaymentIntent id (`pi_...`) kod payment_intent.*; kod charge.* i refund.* je to `payment_intent`. */
      id?: string;
      /** Stripe vrsta objekta: `payment_intent`, `charge`, `refund`... */
      object?: string;
      payment_intent?: string;
      /** PaymentIntent: `succeeded`, `processing`, `requires_payment_method`... Charge: `succeeded`, `failed`... */
      status?: string;
      /** PaymentIntent: naplaceno. Charge: ukupan iznos naplate. Oboje u centima. */
      amount?: number;
      amount_received?: number;
      amount_refunded?: number;
      currency?: string;
      refunded?: boolean;
      metadata?: { user_id?: string; product_id?: string; referral_code?: string; upgrade_from_entitlement_id?: string };
    };
  };
}

export interface StripeEvent {
  /** Stripe `type`, npr. `payment_intent.succeeded`. */
  eventName: string;
  /**
   * `data.object.status` doslovno (npr. `succeeded`, `processing`); prazno ako ga nema.
   *
   * Ime dogadjaja samo po sebi ne dokazuje da je novac naplacen: to tvrdi Stripe, a mi ga ovdje
   * provjeravamo drugi put, iz samog objekta (vidi classifyStripeEvent).
   */
  status: string;
  /** `amount_received` PaymentIntenta u centima (stvarno naplaceno), ili null kad ga payload ne nosi. */
  amountReceivedCents: number | null;
  /** Kljuc knjizenja: PaymentIntent id. Isti za uplatu i za njezin povrat. */
  orderId: string;
  userId: string;
  /** `products.id` iz `metadata[product_id]`; webhook po njemu trazi proizvod u katalogu. */
  productId: string;
  /** Referral kod iz metadata (atribucija, sekcija 8); prazno ako ga nema. */
  referralCode: string;
  /**
   * Nadogradnja Repair -> Final Pass (Monetizacija V1, odjeljak 14): id prava koje ova uplata
   * pretvara, iz `metadata[upgrade_from_entitlement_id]` koju postavlja create-checkout. Prazno =
   * obicna kupnja.
   */
  upgradeFromEntitlementId: string;
  refunded: boolean;
  /** `livemode` iz payloada; null kad ga payload ne nosi (vidi acceptEvent, fail-closed). */
  livemode: boolean | null;
  /** Testni nacin rada. Testni dogadjaj NE SMIJE proizvesti pravo pravo pristupa. */
  testMode: boolean;
  /** Povezani (Connect) racun iz payloada; prazno ako ga nema, sto je jedino prihvatljivo (acceptEvent). */
  accountId: string;
  /** Ukupno naplaceno u centima, ili null ako ga payload ne nosi. */
  totalCents: number | null;
  /** Vraceni iznos u centima, ili null. Manje od totalCents = djelomicni povrat. */
  refundedCents: number | null;
  /** Valuta (npr. "EUR"), velikim slovima; prazno ako je nema. */
  currency: string;
}

/**
 * Je li povrat POTPUN. Djelomican povrat ne smije oduzeti cijelo pravo pristupa (PAY-09).
 *
 * Kad iznosi nisu poznati (stariji ili krnji payload), vraca se true, jer je za korisnika
 * sigurnije previse oduzeti nego naplatiti nesto sto je vraceno; ta se odluka vidi u logu.
 */
export function isFullRefund(ev: Pick<StripeEvent, 'refunded' | 'totalCents' | 'refundedCents'>): boolean {
  if (!ev.refunded) return false;
  if (ev.totalCents === null || ev.refundedCents === null) return true;
  return ev.refundedCents >= ev.totalCents;
}

/**
 * Razlozi uz ishod `needs_manual_review`: naplacen iznos ne dokazuje da je kataloska cijena
 * placena. Runbook (docs/GO_LIVE_NAPLATA.md, 5.1) mora opisati svaki.
 */
export const MANUAL_REVIEW_REASONS = Object.freeze(['amount_below_catalog', 'currency_not_eur'] as const);
export type ManualReviewReason = (typeof MANUAL_REVIEW_REASONS)[number];

export type ChargedAmountVerdict =
  | { kind: 'ok' }
  /** Naplaceno VISE od kataloga (npr. cjenik snizen izmedju checkouta i naplate): pravo se daje, uz trag. */
  | { kind: 'above_catalog'; detail: string }
  /** Naplaceno MANJE od kataloga ili u drugoj valuti: pravo se NE daje, ceka se covjek. */
  | { kind: 'needs_manual_review'; reason: ManualReviewReason; detail: string };

/**
 * Pokriva li naplaceni iznos katalosku cijenu (odluka vlasnika 2026-09-27).
 *
 * Do tada je handler svako odstupanje samo logirao i pravo svejedno upisivao. Uplata MANJA od
 * kataloske cijene (ili u valuti koja nije EUR, pa se centi ne mogu ni usporediti) sada NE daje
 * pravo: ishod je `needs_manual_review`, a operater odlucuje o povratu ili rucnom vezivanju.
 * Uplata VECA od kataloske cijene i dalje daje pravo, jer je kupac platio barem ono sto se trazi;
 * razlika ostaje zapisana kao `amount_mismatch`.
 *
 * Nepoznat naplaceni iznos se ne tumaci kao dovoljan: bez broja nema dokaza da je cijena placena.
 * Obje vrijednosti i valuta idu u `detail`, da operater iz inboxa vidi razliku bez Stripe sucelja.
 */
export function chargedAmountVerdict(
  ev: Pick<StripeEvent, 'totalCents' | 'currency'>,
  expectedCents: number,
): ChargedAmountVerdict {
  const detail =
    `ocekivano=${expectedCents} naplaceno=${ev.totalCents === null ? 'nepoznato' : ev.totalCents} ` +
    `valuta=${ev.currency || 'nepoznata'}`;
  if (ev.currency !== 'EUR') {
    return { kind: 'needs_manual_review', reason: 'currency_not_eur', detail: `currency_not_eur ${detail}` };
  }
  if (ev.totalCents === null || ev.totalCents < expectedCents) {
    return { kind: 'needs_manual_review', reason: 'amount_below_catalog', detail: `amount_below_catalog ${detail}` };
  }
  if (ev.totalCents > expectedCents) return { kind: 'above_catalog', detail: `amount_mismatch ${detail}` };
  return { kind: 'ok' };
}

/**
 * Dolazi li dogadjaj iz NASEG okruzenja, prije ikakvog dodjeljivanja prava (PAY-04, PAY-05).
 *
 * Potpis dokazuje samo da posiljatelj zna tajnu, ne i da dogadjaj dolazi iz NASEG okruzenja.
 * Testni dogadjaj s ispravnim potpisom inace bi proizveo pravo pravo pristupa.
 *
 * Ovdje se provjerava SAMO PORIJEKLO, kao na masteru (ondje je acceptEvent gledao trgovinu i test
 * mode). VRSTU dogadjaja odlucuje classifyStripeEvent. Do kruga 2 spajanja je ova funkcija i vrstu
 * odbijala (`event_ignored`) PRIJE klasifikatora, pa grana `povrat_bez_charge_refunded:` nije bila
 * dohvatljiva ni za jedan dogadjaj koji handler primi: `refund.created` ili `charge.refund.updated`
 * zavrsili bi kao WARN konfiguracijski sum, a entitlement bi ostao `paid` (nalaz pregleda,
 * 2026-09-26).
 *
 * FAIL-CLOSED, isti duh kao prijasnji prazan `LS_STORE_ID` koji je odbijao sve: `livemode`
 * koji payload ne nosi je NEPROVJERLJIVO porijeklo, ne "vjerojatno produkcija".
 *
 * ISTI RACUN U OBJE FUNKCIJE NAPLATE (Stripe ekvivalent drugog dijela masterova 4addb5db, nalaz
 * pregleda kruga 3, 2026-09-27). Na masteru su checkout i webhook citali istu tajnu trgovine, pa se
 * nisu mogli razici oko toga cija je narudzba. Na Stripeu je identitet racuna odredjen kljucem:
 * `create-checkout` stvara PaymentIntent s `STRIPE_SECRET_KEY`, bez zaglavlja `Stripe-Account`,
 * dakle UVIJEK na vlastitom racunu, a Stripe Connect Lekta ne koristi. Dogadjaj takvog
 * PaymentIntenta NIKAD ne nosi polje `account` (Stripe ga salje samo za dogadjaj povezanog
 * racuna). Zato je svaki dogadjaj S poljem `account` dogadjaj koji nas checkout nije mogao
 * stvoriti, i odbija se kao `account_mismatch`. Do kruga 3 ovdje je stajala tajna
 * `STRIPE_ACCOUNT_ID` koju je citao samo webhook: postavljena, odbila bi SVAKU nasu kupnju
 * (checkout je na racunu platforme, dogadjaj bez `account`), uz 200 bez retryja. Tajna je uklonjena
 * iz obje funkcije, a preflight je odbija kad je postavljena (scripts/verify-naplata-secrets.mjs).
 */
export function acceptEvent(
  ev: Pick<StripeEvent, 'livemode' | 'accountId'>,
  opts: { allowTestMode: boolean },
):
  | { ok: true }
  | { ok: false; reason: 'livemode_unverifiable' | 'test_mode_refused' | 'account_mismatch' } {
  if (ev.livemode === null) return { ok: false, reason: 'livemode_unverifiable' };
  if (!ev.livemode && !opts.allowTestMode) return { ok: false, reason: 'test_mode_refused' };
  // Bilo koji povezani racun, i prazan razmak, znaci dogadjaj koji nije s naseg racuna.
  if (String(ev.accountId ?? '') !== '') return { ok: false, reason: 'account_mismatch' };
  return { ok: true };
}

/** Statusi Stripe Refund objekta kod kojih novac NIJE vracen (povrat je propao ili je otkazan). */
const REFUND_NOT_RETURNED_STATUSES = new Set(['failed', 'canceled']);

/**
 * Nosi li dogadjaj VRACEN NOVAC, bez obzira na ime. Stripe povrat javlja kao `charge.refunded`
 * (Charge) i kao `refund.created`, `refund.updated` i `charge.refund.updated` (objekt je Refund,
 * bez polja `refunded`). Samo `charge.refunded` se KNJIZI kao povrat; Refund objekt pod drugim
 * imenom je `povrat_bez_charge_refunded:*` (classifyStripeEvent, ERROR u logu).
 *
 * Tri namjerne granice (Codex pregled kruga 2, 2026-09-26, svaka potvrdjena testom):
 *  - Refund sa statusom `failed` ili `canceled` NIJE vracen novac (npr. `refund.failed`), pa nije
 *    ni ERROR; inace bi propao povrat dizao lazan alarm "povrat nije proveden".
 *  - `amount_refunded` i `refunded` na Chargeu NISU signal izvan `charge.refunded`: ostaju na
 *    objektu zauvijek, a Stripe povrat ne javlja kroz `charge.updated` (taj dogadjaj nosi izmjenu
 *    opisa, metapodataka ili naknadno hvatanje). Kao signal bi svaki kasniji `charge.updated`
 *    ponovno dizao ERROR za vec obradjen povrat.
 *  - Isto vrijedi za `payment_intent.*`: ime odlucuje granu, zastavica iz objekta ne.
 */
export function isRefundBearing(eventName: string, obj: { object?: string; status?: string }): boolean {
  if (eventName === 'charge.refunded') return true;
  const refundObject = obj.object === 'refund' || eventName.startsWith('refund.') || eventName.startsWith('charge.refund.');
  if (!refundObject) return false;
  return !REFUND_NOT_RETURNED_STATUSES.has(String(obj.status ?? '').trim().toLowerCase());
}

/**
 * Normaliziraj Stripe payload u ravni event.
 *
 * `orderId` je UVIJEK PaymentIntent id: kod `payment_intent.succeeded` je to `data.object.id`,
 * kod `charge.refunded` (i kod Refund objekta, `refund.*`) je to `data.object.payment_intent`.
 * Time uplata i njezin povrat dijele isti kljuc, pa refund pogodi tocno onaj entitlement koji je
 * uplata stvorila, a povrat pod drugim imenom u inboxu nosi PaymentIntent za rucnu obradu.
 */
export function parseStripeEvent(payload: StripeWebhookPayload): StripeEvent {
  const eventName = String(payload.type ?? '');
  const obj = payload.data?.object ?? {};
  const meta = obj.metadata ?? {};
  // Charge i Refund nose PaymentIntent u polju `payment_intent`; `id` im je `ch_...` ili `re_...`.
  const isCharge = eventName.startsWith('charge.') || eventName.startsWith('refund.') || obj.object === 'refund';
  // Kod naplate bez PaymentIntenta (naslijedjena izravna naplata) orderId ostaje PRAZAN, a ne
  // charge id: kljuc koji ne moze pogoditi nijedan entitlement lagao bi da je povrat proveden.
  const orderId = String((isCharge ? obj.payment_intent : (obj.id ?? obj.payment_intent)) ?? '');
  const refunded = isRefundBearing(eventName, obj);
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  // PaymentIntent nosi stvarno naplaceno u `amount_received`; Charge ukupan iznos u `amount`.
  const totalCents = isCharge ? num(obj.amount) : (num(obj.amount_received) ?? num(obj.amount));
  const livemode = typeof payload.livemode === 'boolean' ? payload.livemode : null;
  return {
    eventName,
    status: String(obj.status ?? ''),
    // Charge nema `amount_received`; kod povrata ga zato namjerno ne izmisljamo iz `amount`.
    amountReceivedCents: isCharge ? null : num(obj.amount_received),
    orderId,
    userId: String(meta.user_id ?? ''),
    productId: String(meta.product_id ?? ''),
    referralCode: String(meta.referral_code ?? ''),
    upgradeFromEntitlementId: String(meta.upgrade_from_entitlement_id ?? '').trim(),
    refunded,
    livemode,
    testMode: livemode === false,
    accountId: String(payload.account ?? ''),
    totalCents,
    refundedCents: num(obj.amount_refunded),
    currency: String(obj.currency ?? '').toUpperCase(),
  };
}

/**
 * Sto webhook smije napraviti s dogadjajem koji je prosao potpis i porijeklo.
 *
 * `needs_manual_link`: naplata je POTVRDJENA (kao kod `paid`), ali dogadjaj nema
 * `metadata[user_id]`, pa se pravo ne moze upisati nikome. Stripe ekvivalent masterova ishoda iz
 * 31b802ad i 81a89f2f: novac je naplacen, pa dogadjaj ne smije nestati ni utonuti u WARN sum;
 * handler ga pise na ERROR razini i s vlastitim ishodom u inboxu.
 */
export type StripeEventKind = 'paid' | 'refund' | 'needs_manual_link' | 'ignored';

export interface StripeClassification {
  kind: StripeEventKind;
  /** Kratak strojni razlog; upisuje se u `webhook_events.outcome_detail` i vraca pozivatelju. */
  reason?: string;
}

/**
 * ODLUKA STO S DOGADJAJEM. Cista funkcija; handler (supabase/functions/webhook-mor/handler.ts)
 * je samo zove. Stripe ekvivalent zastita koje je master 2026-09-22/23 uveo za prijasnjeg
 * pruzatelja (31b802ad, 81a89f2f, daf5f53a), prenesen pri spajanju mastera u design/pack3.
 *
 * KNJIZI SE SAMO STVARNO NAPLACENO. `payment_intent.succeeded` je `paid` tek kad objekt sam
 * potvrdjuje naplatu: `status` je `succeeded` (usporedba bez razmaka i u malim slovima) i
 * `amount_received` je pozitivan broj. Ime dogadjaja samo po sebi nije dovoljno: dogadjaj s
 * drugim statusom ili bez naplacenog iznosa nije kupnja, i ne smije dodijeliti pravo pristupa.
 * Takav dogadjaj je `ignored` s imenovanim razlogom (`payment_status:*`, `amount_received:*`),
 * 200 jer retry ne bi promijenio ishod, i ERROR u logu jer se tice stvarnog novca.
 *
 * POTVRDJENA NAPLATA BEZ KORISNIKA je `needs_manual_link` (razlog `missing_user_metadata`), ne
 * `ignored`: novac je naplacen, a pravo nema komu pripasti. Povrat userId ne treba (ide po
 * PaymentIntentu), pa `charge.refunded` ostaje `refund` i bez njega.
 *
 * POVRAT SAMO IZ `charge.refunded`, PO IMENU, NE PO ZASTAVICI. `ev.refunded` je istinit i za
 * Refund objekt pod drugim imenom (`refund.created`, `charge.refund.updated`; isRefundBearing). Refund
 * grana handlera pise `update entitlements ... where order_id = ev.orderId` i povlaci referral
 * nagrade po istom id-u, pa u nju smije uci samo dogadjaj kojemu je `orderId` sigurno
 * PaymentIntent povrata (`charge.payment_intent`). Vracen novac pod drugim imenom nije tiho
 * odbacen nego `ignored` s razlogom `povrat_bez_charge_refunded:*` (ERROR u logu).
 *
 * Ova funkcija je JEDINO mjesto odluke o vrsti: `acceptEvent` provjerava samo porijeklo, pa svaki
 * potpisan dogadjaj iz naseg okruzenja stize ovamo. Vrsta koja ne nosi novac je
 * `nepodrzan_dogadjaj:*` (WARN, konfiguracijski sum); vrsta koja nosi vracen novac je
 * `povrat_bez_charge_refunded:*` (ERROR). Obje su dohvatljive iz izvrsenog handlera
 * (tests/webhook-mor-handler.test.ts), ne samo iz izolirane funkcije.
 */
export function classifyStripeEvent(
  ev: Pick<StripeEvent, 'eventName' | 'status' | 'amountReceivedCents' | 'refunded' | 'userId'>,
): StripeClassification {
  if (ev.eventName === 'charge.refunded') return { kind: 'refund' };
  if (ev.eventName === 'payment_intent.succeeded') {
    const status = ev.status.trim().toLowerCase();
    if (status !== 'succeeded') return { kind: 'ignored', reason: `payment_status:${status || 'nepoznat'}` };
    const received = ev.amountReceivedCents;
    if (received === null || !(received > 0)) {
      return { kind: 'ignored', reason: `amount_received:${received === null ? 'nepoznat' : String(received)}` };
    }
    if (!ev.userId.trim()) return { kind: 'needs_manual_link', reason: 'missing_user_metadata' };
    return { kind: 'paid' };
  }
  if (ev.refunded) return { kind: 'ignored', reason: `povrat_bez_charge_refunded:${ev.eventName || 'nepoznat'}` };
  return { kind: 'ignored', reason: `nepodrzan_dogadjaj:${ev.eventName || 'nepoznat'}` };
}

/**
 * Svi prefiksi koje `classifyStripeEvent` moze staviti u `webhook_events.outcome_detail` uz ishod
 * `ignored`. Runbook mora opisati svaki (gard: `tests/naplata-runbook.test.ts`).
 */
export const IGNORE_REASON_PREFIXES = Object.freeze([
  'payment_status:',
  'amount_received:',
  'povrat_bez_charge_refunded:',
  'nepodrzan_dogadjaj:',
]);

/**
 * Prefiksi razloga koje netko MORA pogledati. Handler ih pise na ERROR razini, ostale na WARN.
 *
 * `payment_status:` i `amount_received:` ticu se dogadjaja koji se zove kao uplata, a nije
 * potvrdio naplatu: ako se pretpostavka o Stripeovu obliku ikad pokaze krivom, SVAKA kupnja bi
 * postala `ignored` + 200 bez retryja, i ovo je jedino mjesto na kojem se to vidi.
 * `povrat_bez_charge_refunded:` je vracen novac koji namjerno nismo obradili.
 */
export const NOTABLE_IGNORE_PREFIXES = Object.freeze([
  'payment_status:',
  'amount_received:',
  'povrat_bez_charge_refunded:',
]);

/** Je li `ignored` dogadjaj takav da ga netko MORA pogledati. */
export function isNotableIgnore(c: Pick<StripeClassification, 'reason'>): boolean {
  const reason = String(c.reason ?? '');
  return reason !== '' && NOTABLE_IGNORE_PREFIXES.some((p) => reason.startsWith(p));
}

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Usporedba iste duljine bez ranog izlaza (otpornije na timing). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Najveca dopustena razlika izmedju `t` iz potpisa i naseg sata, u sekundama.
 *
 * Bez nje bi jednom presretnut valjan zahtjev bio upotrebljiv zauvijek (replay): potpis ostaje
 * matematicki ispravan koliko god da je star, jer tajna se ne mijenja.
 */
export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

/** Razlozen ishod provjere potpisa; razlog ide u log, nikad u odgovor klijentu. */
export type StripeSignatureResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'missing_secret' | 'missing_signature' | 'malformed_header' | 'timestamp_out_of_tolerance' | 'signature_mismatch';
    };

/** Rastavi `Stripe-Signature` zaglavlje oblika `t=1699999999,v1=abc,v1=def`. */
export function parseStripeSignatureHeader(header: string): { timestamp: number | null; signatures: string[] } {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === 't') {
      const n = Number(value);
      if (Number.isFinite(n)) timestamp = n;
    } else if (key === 'v1' && value) {
      signatures.push(value.toLowerCase());
    }
  }
  return { timestamp, signatures };
}

/**
 * Provjeri Stripe potpis: HMAC-SHA256 tajnim kljucem nad `${t}.${raw}`, hex, timing-safe.
 *
 * Prihvaca se ako se IJEDAN `v1` podudara (Stripe ih salje vise za vrijeme rotacije tajne).
 * `nowMs` je injektabilan da se istekao potpis moze dokazati bez cekanja od pet minuta.
 * Prazan tajni kljuc odbija SVE: nekonfiguriran gate ne smije znaciti "propusti sve".
 */
export async function verifyStripeSignature(
  raw: string,
  header: string | null | undefined,
  secret: string,
  nowMs: number = Date.now(),
  toleranceSeconds: number = STRIPE_SIGNATURE_TOLERANCE_SECONDS,
): Promise<StripeSignatureResult> {
  if (!secret) return { ok: false, reason: 'missing_secret' };
  if (!header) return { ok: false, reason: 'missing_signature' };
  const { timestamp, signatures } = parseStripeSignatureHeader(header);
  if (timestamp === null || signatures.length === 0) return { ok: false, reason: 'malformed_header' };
  if (Math.abs(Math.floor(nowMs / 1000) - timestamp) > toleranceSeconds) {
    return { ok: false, reason: 'timestamp_out_of_tolerance' };
  }
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = toHex(await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${raw}`)));
  // Sve kandidate provjeravamo do kraja: ranim izlazom bi trajanje odavalo koji je kandidat blizi.
  let matched = false;
  for (const candidate of signatures) {
    if (timingSafeEqual(mac, candidate)) matched = true;
  }
  return matched ? { ok: true } : { ok: false, reason: 'signature_mismatch' };
}

/** ISO vrijeme za `now + days` (rok potrosnje entitlementa ili trajanje kupona). */
export function isoAfterDays(nowMs: number, days: number): string {
  return new Date(nowMs + days * 24 * 3600 * 1000).toISOString();
}

/** Podskup proizvoda koji webhook treba za entitlement (izbjegava vezanje na cijeli Product). */
export interface EntitlementProduct {
  id: string;
  workType: string | null;
  slotsTotal: number;
  purchaseWindowDays: number;
  /** Verzionirana ponuda (products.offer_code, migracija 0206). */
  offerCode: string;
  /** Prava ponude (offer_codes.capabilities) u trenutku kupnje. */
  capabilities: readonly string[];
}

export interface EntitlementInsert {
  user_id: string;
  work_type: string;
  slots_total: number;
  product_id: string;
  order_id: string;
  provider: string;
  purchase_expires_at: string;
  /** SNAPSHOT ponude pri kupnji (MONETIZACIJA_V1.md odjeljak 13, Snapshot prava). */
  offer_code: string;
  /** SNAPSHOT prava pri kupnji: kopija, ne referenca na katalog. */
  capabilities: string[];
  /** Stvarno naplaceno u centima; jedino ono smije umanjiti cijenu nadogradnje (odjeljak 14). */
  paid_amount_cents: number | null;
}

/**
 * Proizvod kojem se prava ne mogu snapshotirati (nema offer_code ili ugradjenih prava). Webhook ga
 * NE knjizi s praznim snapshotom nego vraca 500 (`product_without_offer`), isto kao proizvod bez
 * work_type: pravo bez zapisa o tome sto je kupljeno ne bi se kasnije moglo obraniti.
 */
export function entitlementSnapshotOf(product: {
  offerCode: string | null;
  capabilities: readonly string[] | null;
}): { offerCode: string; capabilities: readonly string[] } | null {
  if (!product.offerCode || !product.capabilities || product.capabilities.length === 0) return null;
  return { offerCode: product.offerCode, capabilities: product.capabilities };
}

/**
 * Redak entitlementa iz proizvoda + eventa (kriteriji 14.3/14.4): tocni product_id, work_type,
 * slots_total (npr. pass -> 6) i purchase_expires_at = now + purchase_window_days.
 *
 * SNAPSHOT PRAVA (Monetizacija V1). offer_code i prava se prepisuju u redak u trenutku kupnje, kao
 * KOPIJA niza, pa kasnija promjena kataloga (drugi offer_code, drugi skup prava) ne mijenja ono sto
 * je vec kupljeno. `paid_amount_cents` je stvarno naplacen iznos iz dogadjaja; nepoznat ostaje null.
 */
export function buildEntitlementInsert(
  product: EntitlementProduct,
  ev: { userId: string; orderId: string; amountReceivedCents?: number | null; totalCents?: number | null },
  provider: string,
  nowMs: number,
): EntitlementInsert {
  const paid = ev.amountReceivedCents ?? ev.totalCents ?? null;
  return {
    user_id: ev.userId,
    work_type: product.workType ?? '',
    slots_total: product.slotsTotal,
    product_id: product.id,
    order_id: ev.orderId,
    provider,
    purchase_expires_at: isoAfterDays(nowMs, product.purchaseWindowDays),
    offer_code: product.offerCode,
    capabilities: [...product.capabilities],
    paid_amount_cents: typeof paid === 'number' && Number.isInteger(paid) && paid >= 0 ? paid : null,
  };
}

// Pass bonus kupon (sekcija 6.5): jednokratni -20%, vrijedi na slot_zavrsni i slot_diplomski.
export const PASS_COUPON_DISCOUNT = 20;
export const PASS_COUPON_VALID_DAYS = 120;
export const PASS_COUPON_APPLIES_TO = ['slot_zavrsni', 'slot_diplomski'] as const;

export function isPassProduct(kind: string): boolean {
  return kind === 'pass';
}

/** Deterministicni kod kupona iz orderId (re-delivery ne stvara novi zapis jer se kupon
 *  izdaje samo uz tek kreiran entitlement). */
export function makePassCouponCode(orderId: string): string {
  const tail = orderId.replace(/[^A-Za-z0-9]/g, '').slice(-10).toUpperCase();
  return `PASS-${tail || 'BONUS'}`;
}
