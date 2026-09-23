import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { webhookHandlerProblems } from './helpers/webhook-handler-source';

import {
  classifyLemonEvent,
  isNotableIgnore,
  IGNORE_REASON_PREFIXES,
  NOTABLE_IGNORE_PREFIXES,
  parseLemonEvent,
  verifyLemonSignature,
  isoAfterDays,
  isPassProduct,
  makePassCouponCode,
  PASS_COUPON_VALID_DAYS,
  buildEntitlementInsert,
  acceptEvent,
  isFullRefund,
  type LemonWebhookPayload,
} from '../src/report/webhook';

describe('parseLemonEvent', () => {
  it('order_created: izvlaci orderId, userId, variantId (mor_product_id)', () => {
    const payload: LemonWebhookPayload = {
      meta: { event_name: 'order_created', custom_data: { user_id: 'u1', product_id: 'slot_diplomski' } },
      data: { id: 999, attributes: { status: 'paid', first_order_item: { variant_id: 555 } } },
    };
    expect(parseLemonEvent(payload)).toEqual({
      eventName: 'order_created',
      // `status` je dodan 2026-09-22: bez njega se placena narudzba nije razlikovala od one koja
      // jos nije placena, a obje dolaze kao `order_created`.
      status: 'paid',
      orderId: '999',
      userId: 'u1',
      variantId: '555',
      referralCode: '',
      refunded: false,
      // Polja porijekla i iznosa (audit PAY-03..05, PAY-09). Kad ih payload ne nosi, moraju biti
      // prazna/null, NIKAD izmisljena vrijednost: `acceptEvent` na temelju praznog storeId odbija
      // dogadjaj, a to je ispravno, jer neprovjerljivo porijeklo nije isto sto i ispravno.
      storeId: '',
      testMode: false,
      totalCents: null,
      refundedCents: null,
      currency: '',
    });
  });
  it('izvlaci referral_code iz custom_data', () => {
    const payload: LemonWebhookPayload = {
      meta: { event_name: 'order_created', custom_data: { user_id: 'u1', referral_code: 'PART-9' } },
      data: { id: 1, attributes: { first_order_item: { variant_id: 5 } } },
    };
    expect(parseLemonEvent(payload).referralCode).toBe('PART-9');
  });
  it('order_refunded -> refunded true', () => {
    const payload: LemonWebhookPayload = {
      meta: { event_name: 'order_refunded', custom_data: { user_id: 'u1' } },
      data: { id: 999, attributes: { status: 'refunded' } },
    };
    expect(parseLemonEvent(payload).refunded).toBe(true);
  });
  it('prazan payload ne baca (prazni stringovi)', () => {
    const ev = parseLemonEvent({});
    expect(ev.orderId).toBe('');
    expect(ev.userId).toBe('');
  });
});

describe('verifyLemonSignature (HMAC-SHA256)', () => {
  const secret = 'whsec_test';
  const raw = '{"meta":{"event_name":"order_created"}}';
  const validSig = createHmac('sha256', secret).update(raw).digest('hex');

  it('ispravan potpis -> true', async () => {
    expect(await verifyLemonSignature(raw, validSig, secret)).toBe(true);
  });
  it('pogresan secret -> false', async () => {
    expect(await verifyLemonSignature(raw, validSig, 'krivi')).toBe(false);
  });
  it('pogresan potpis -> false', async () => {
    expect(await verifyLemonSignature(raw, 'deadbeef', secret)).toBe(false);
  });
  it('prazan secret ili potpis -> false', async () => {
    expect(await verifyLemonSignature(raw, validSig, '')).toBe(false);
    expect(await verifyLemonSignature(raw, null, secret)).toBe(false);
  });
  it('velika/mala slova potpisa ne mijenjaju rezultat', async () => {
    expect(await verifyLemonSignature(raw, validSig.toUpperCase(), secret)).toBe(true);
  });
});

describe('buildEntitlementInsert (kriteriji 14.3/14.4)', () => {
  const now = Date.UTC(2026, 0, 1);
  it('slot proizvod: tocan product_id/work_type/slots_total + rok = now + purchase_window_days', () => {
    const row = buildEntitlementInsert(
      { id: 'slot_diplomski', workType: 'diplomski', slotsTotal: 1, purchaseWindowDays: 90 },
      { userId: 'u1', orderId: 'o1' },
      'lemonsqueezy',
      now,
    );
    expect(row).toEqual({
      user_id: 'u1',
      work_type: 'diplomski',
      slots_total: 1,
      product_id: 'slot_diplomski',
      order_id: 'o1',
      provider: 'lemonsqueezy',
      purchase_expires_at: new Date(now + 90 * 86400000).toISOString(),
    });
  });
  it('pass proizvod nosi 6 seminarskih slotova', () => {
    const row = buildEntitlementInsert(
      { id: 'pass_semestralni', workType: 'seminarski', slotsTotal: 6, purchaseWindowDays: 180 },
      { userId: 'u1', orderId: 'o2' },
      'lemonsqueezy',
      now,
    );
    expect(row.slots_total).toBe(6);
    expect(row.work_type).toBe('seminarski');
  });
});

describe('isoAfterDays', () => {
  it('dodaje dane u ISO', () => {
    const base = Date.UTC(2026, 0, 1); // 2026-01-01
    expect(isoAfterDays(base, 90)).toBe(new Date(base + 90 * 86400000).toISOString());
  });
});

describe('pass kupon', () => {
  it('isPassProduct samo za kind=pass', () => {
    expect(isPassProduct('pass')).toBe(true);
    expect(isPassProduct('slot')).toBe(false);
    expect(isPassProduct('bundle')).toBe(false);
  });
  it('makePassCouponCode deterministican i prefiksiran', () => {
    expect(makePassCouponCode('order-1234567890')).toBe(makePassCouponCode('order-1234567890'));
    expect(makePassCouponCode('order-1234567890').startsWith('PASS-')).toBe(true);
    expect(makePassCouponCode('')).toBe('PASS-BONUS');
  });
  it('kupon vrijedi 120 dana', () => {
    expect(PASS_COUPON_VALID_DAYS).toBe(120);
  });
});

/**
 * PAY-04 / PAY-05: ispravan HMAC potpis dokazuje samo da posiljatelj zna tajnu. Ne dokazuje da
 * dogadjaj pripada NASOJ trgovini ni da dolazi iz produkcijskog nacina rada. Bez ovog gatea bi
 * valjano potpisan dogadjaj tudje trgovine, ili testna kupnja, proizveli pravo pravo pristupa.
 */
describe('acceptEvent (porijeklo dogadjaja)', () => {
  const OPTS = { expectedStoreId: '42', allowTestMode: false };

  it('prihvaca dogadjaj nase trgovine iz produkcijskog nacina', () => {
    expect(acceptEvent({ storeId: '42', testMode: false }, OPTS)).toEqual({ ok: true });
  });

  it('odbija tudju trgovinu', () => {
    expect(acceptEvent({ storeId: '99', testMode: false }, OPTS)).toEqual({ ok: false, reason: 'store_mismatch' });
  });

  it('odbija testni nacin rada dok nije izricito dopusten', () => {
    expect(acceptEvent({ storeId: '42', testMode: true }, OPTS)).toEqual({ ok: false, reason: 'test_mode_refused' });
    expect(acceptEvent({ storeId: '42', testMode: true }, { ...OPTS, allowTestMode: true })).toEqual({ ok: true });
  });

  /**
   * Fail-closed: nekonfiguriran ili nedostajuci store id NE SMIJE znaciti "propusti sve". Tise
   * propustanje bi znacilo da webhook prima dogadjaje bilo koje trgovine, a da nitko ne zna da
   * gate uopce nije aktivan.
   */
  it('odbija kad porijeklo nije provjerljivo', () => {
    expect(acceptEvent({ storeId: '42', testMode: false }, { ...OPTS, expectedStoreId: '' }))
      .toEqual({ ok: false, reason: 'store_unverifiable' });
    expect(acceptEvent({ storeId: '', testMode: false }, OPTS))
      .toEqual({ ok: false, reason: 'store_unverifiable' });
  });
});

/**
 * PAY-09: djelomican povrat ne smije oduzeti cijelo pravo pristupa. Korisnik kojem je vracen dio
 * iznosa i dalje je platio uslugu.
 */
describe('isFullRefund', () => {
  it('nije povrat dok refunded nije postavljen', () => {
    expect(isFullRefund({ refunded: false, totalCents: 1699, refundedCents: 1699 })).toBe(false);
  });

  it('djelomican povrat nije potpun', () => {
    expect(isFullRefund({ refunded: true, totalCents: 1699, refundedCents: 500 })).toBe(false);
  });

  it('puni povrat je potpun, kao i povrat veci od iznosa', () => {
    expect(isFullRefund({ refunded: true, totalCents: 1699, refundedCents: 1699 })).toBe(true);
    expect(isFullRefund({ refunded: true, totalCents: 1699, refundedCents: 1700 })).toBe(true);
  });

  it('bez poznatih iznosa tretira povrat kao potpun (sigurnije za korisnika)', () => {
    expect(isFullRefund({ refunded: true, totalCents: null, refundedCents: null })).toBe(true);
    expect(isFullRefund({ refunded: true, totalCents: 1699, refundedCents: null })).toBe(true);
  });
});

/**
 * KLASIFIKACIJA DOGADJAJA (blokeri lansiranja, 2026-09-22).
 *
 * Do ove promjene je handler svaki `order_created` koji je prosao potpis i porijeklo tretirao kao
 * PLACEN, bez gledanja na `attributes.status`. Lemon Squeezy isti event_name salje i za narudzbu u
 * statusu `pending`, `unpaid` ili `failed`, pa bi neplacena narudzba dobila puno pravo pristupa.
 * Dogadjaji pretplata i licenci nisu nasi, ali bi pali u istu granu i zavrsili kao `unknown_product`,
 * dakle kao kvar koji netko mora gledati.
 */
describe('classifyLemonEvent', () => {
  const base = { eventName: 'order_created', status: 'paid', userId: 'u1', refunded: false };

  it('order_created + status paid -> paid', () => {
    expect(classifyLemonEvent(base)).toEqual({ kind: 'paid' });
  });

  it.each(['pending', 'unpaid', 'failed'])('order_created + status %s -> ignored', (status) => {
    const out = classifyLemonEvent({ ...base, status });
    expect(out.kind).toBe('ignored');
    expect(out.reason).toBe(`order_status:${status}`);
  });

  it('order_created bez statusa -> ignored (prazno nije "placeno")', () => {
    expect(classifyLemonEvent({ ...base, status: '' })).toEqual({
      kind: 'ignored',
      reason: 'order_status:nepoznat',
    });
  });

  it('subscription_created -> ignored (nije nas proizvod)', () => {
    const out = classifyLemonEvent({ ...base, eventName: 'subscription_created' });
    expect(out.kind).toBe('ignored');
    expect(out.reason).toBe('nepodrzan_dogadjaj:subscription_created');
  });

  it('license_key_created -> ignored', () => {
    expect(classifyLemonEvent({ ...base, eventName: 'license_key_created' }).kind).toBe('ignored');
  });

  it('nepoznat event_name -> ignored, razlog ga imenuje', () => {
    const out = classifyLemonEvent({ ...base, eventName: 'nesto_novo_od_providera' });
    expect(out).toEqual({ kind: 'ignored', reason: 'nepodrzan_dogadjaj:nesto_novo_od_providera' });
  });

  it('order_refunded -> refund', () => {
    expect(classifyLemonEvent({ eventName: 'order_refunded', status: 'refunded', userId: 'u1', refunded: true }))
      .toEqual({ kind: 'refund' });
  });

  /**
   * Placena narudzba bez `meta.custom_data.user_id`: novac JE naplacen, pa se dogadjaj ne smije
   * odbaciti. Prije je handler na to vracao 400, i to PRIJE upisa u inbox, pa bi kupnja nestala bez
   * traga.
   */
  it('paid bez user_id -> needs_manual_link (ne 400, ne ignored)', () => {
    expect(classifyLemonEvent({ ...base, userId: '' })).toEqual({
      kind: 'needs_manual_link',
      reason: 'bez_user_id',
    });
  });

  /** Povrat se obradjuje po `order_id` (gasenje entitlementa, povlacenje nagrade), userId mu ne treba. */
  it('refund bez user_id -> refund', () => {
    expect(classifyLemonEvent({ eventName: 'order_refunded', status: '', userId: '', refunded: true }))
      .toEqual({ kind: 'refund' });
  });

  /**
   * NALAZ PREGLEDA 2026-09-23, i to je SUZENJE u odnosu na medjuverziju.
   *
   * Medjuverzija je u refund granu ulazila po zastavici `ev.refunded`, koju parser racuna i iz
   * `attributes.status === 'refunded'` i iz `attributes.refunded === true`, dakle BEZ obzira na
   * `event_name`. Refund grana handlera pise `update entitlements ... where order_id = ev.orderId`
   * i povlaci referral nagrade po istom id-u. Kod `subscription_payment_refunded` je `data.id` id
   * pretplatnickog RACUNA, ne narudzbe, pa bi numericki pogodak tiho ugasio pravo pristupa kupcu
   * koji je uredno platio, uz ishod `processed` koji nijedan upit iz runbooka ne vraca.
   *
   * Refund je zato vezan uz IME dogadjaja. Vracen novac pod drugim imenom nije tiho odbacen nego
   * `ignored` s razlogom `povrat_bez_order_refunded:*`, koji je `isNotableIgnore` (ERROR u logu) i
   * ima svoj redak u runbooku.
   */
  it.each(['subscription_payment_refunded', 'order_updated', 'nesto_novo_od_providera'])(
    'zastavica refunded pod imenom %s NE ulazi u refund granu (tudji id), nego glasno u ignored',
    (eventName) => {
      const out = classifyLemonEvent({ eventName, status: 'refunded', userId: '', refunded: true });
      expect(out).toEqual({ kind: 'ignored', reason: `povrat_bez_order_refunded:${eventName}` });
      expect(isNotableIgnore(out)).toBe(true);
    },
  );

  it('order_created sa statusom refunded je ignored po statusu, i to glasno', () => {
    // `order_created` nikad ne dolazi za narudzbu koja vec ima entitlement (salje se pri nastanku),
    // pa tu nema sto gasiti; ishod je zato ignored uz razlog koji netko mora pogledati.
    const out = classifyLemonEvent({ ...base, status: 'refunded', refunded: true });
    expect(out).toEqual({ kind: 'ignored', reason: 'order_status:refunded' });
    expect(isNotableIgnore(out)).toBe(true);
  });

  it('parser racuna refunded iz attributes.refunded, ali ime dogadjaja odlucuje', () => {
    const ev = parseLemonEvent({
      meta: { event_name: 'order_updated' },
      data: { id: 77, attributes: { refunded: true, total: 1699, refunded_amount: 1699 } },
    });
    expect(ev.refunded).toBe(true);
    expect(classifyLemonEvent(ev)).toEqual({ kind: 'ignored', reason: 'povrat_bez_order_refunded:order_updated' });
  });

  it('order_refunded je refund bez obzira na status i na user_id', () => {
    for (const status of ['refunded', '', 'paid']) {
      expect(classifyLemonEvent({ eventName: 'order_refunded', status, userId: '', refunded: true }))
        .toEqual({ kind: 'refund' });
    }
    // Zastavica nije uvjet: i kad je parser ne postavi, ime dogadjaja je dovoljno.
    expect(classifyLemonEvent({ eventName: 'order_refunded', status: '', userId: 'u1', refunded: false }))
      .toEqual({ kind: 'refund' });
  });

  /**
   * Usporedba statusa je bila doslovna i osjetljiva na velika slova, dok isti parser `currency`
   * normalizira. Velikim slovom napisan `Paid` bi tako postao `ignored`, dakle placena kupnja bez
   * prava pristupa i bez retryja.
   */
  it.each(['PAID', 'Paid', ' paid '])('status %s je i dalje placeno', (status) => {
    expect(classifyLemonEvent({ ...base, status })).toEqual({ kind: 'paid' });
  });

  it('status Refunded velikim slovom na order_created je glasan ignored', () => {
    const ev = parseLemonEvent({
      meta: { event_name: 'order_created' },
      data: { id: 78, attributes: { status: 'Refunded' } },
    });
    expect(ev.refunded).toBe(true); // parser i dalje vidi povrat
    const out = classifyLemonEvent(ev);
    expect(out).toEqual({ kind: 'ignored', reason: 'order_status:refunded' });
    expect(isNotableIgnore(out)).toBe(true);
  });

  it('razlog za ignored ostaje u malim slovima (stabilan strojni kljuc)', () => {
    expect(classifyLemonEvent({ ...base, status: 'PENDING' }).reason).toBe('order_status:pending');
  });

  /** Klase se razlikuju: novac na jednoj strani, konfiguracijski sum na drugoj. */
  it('isNotableIgnore razlikuje razloge koji se ticu novca od tudjeg dogadjaja', () => {
    expect(isNotableIgnore(classifyLemonEvent({ ...base, status: 'pending' }))).toBe(true);
    expect(isNotableIgnore(classifyLemonEvent({ ...base, status: '' }))).toBe(true);
    expect(isNotableIgnore(classifyLemonEvent({
      eventName: 'subscription_payment_refunded', status: 'refunded', userId: '', refunded: true,
    }))).toBe(true);
    expect(isNotableIgnore(classifyLemonEvent({ ...base, eventName: 'subscription_created' }))).toBe(false);
    expect(isNotableIgnore({ reason: undefined })).toBe(false);
    expect(isNotableIgnore({ reason: '' })).toBe(false);
  });

  /**
   * Popisi prefiksa nisu ukras: `tests/naplata-runbook.test.ts` iz njih izvodi sto runbook mora
   * opisati, a handler iz njih bira ERROR ili WARN razinu. Nov razlog bez retka u popisu bio bi
   * ishod koji nitko nema po cemu naci.
   */
  it('svaki razlog koji klasifikator proizvede ima prefiks iz popisa', () => {
    const slucajevi = [
      { ...base, status: 'pending' },
      { ...base, eventName: 'subscription_created' },
      { eventName: 'order_updated', status: 'refunded', userId: '', refunded: true },
    ];
    for (const ev of slucajevi) {
      const reason = String(classifyLemonEvent(ev).reason ?? '');
      expect(IGNORE_REASON_PREFIXES.some((p) => reason.startsWith(p)), reason).toBe(true);
    }
    for (const prefix of NOTABLE_IGNORE_PREFIXES) expect(IGNORE_REASON_PREFIXES).toContain(prefix);
  });

  it('parseLemonEvent i classifyLemonEvent se slazu na stvarnom payloadu', () => {
    // Bez ovoga bi klasifikacija mogla biti tocna nad rucno slozenim objektom, a kriva nad onim
    // sto parser stvarno proizvede (npr. da `status` ostane prazan).
    const paid = parseLemonEvent({
      meta: { event_name: 'order_created', custom_data: { user_id: 'u1' } },
      data: { id: 7, attributes: { status: 'paid', first_order_item: { variant_id: 5 } } },
    });
    expect(classifyLemonEvent(paid)).toEqual({ kind: 'paid' });

    const pending = parseLemonEvent({
      meta: { event_name: 'order_created', custom_data: { user_id: 'u1' } },
      data: { id: 8, attributes: { status: 'pending' } },
    });
    expect(classifyLemonEvent(pending).kind).toBe('ignored');
  });
});

/**
 * Tvrdnja o EDGE FUNKCIJI, citanjem izvora. Deno kod se pod vitestom ne izvodi, pa se ne moze
 * tvrditi da handler radi; moze se tvrditi da odluku vise ne donosi sam.
 *
 * Mjeri se tocno ono sto je bio kvar: kombinirana provjera `!ev.orderId || !ev.userId` koja je
 * placenu narudzbu bez user_id odbijala s 400 PRIJE upisa u inbox.
 */
describe('webhook-mor izvor: odluka je u coreu, ne u handleru', () => {
  const SRC = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '..', 'supabase/functions/webhook-mor/index.ts'),
    'utf8',
  );

  it('izvor je procitan (prazna datoteka ne smije "proci")', () => {
    expect(SRC.length).toBeGreaterThan(2000);
  });

  it('vise ne postoji kombinirana orderId+userId provjera s 400', () => {
    expect(SRC).not.toMatch(/!ev\.orderId\s*\|\|\s*!ev\.userId/);
  });

  it('400 je ostao samo za nedostajuci orderId', () => {
    expect(SRC).toMatch(/if \(!ev\.orderId\) return json\(\{ error: 'bad_request' \}, 400\);/);
  });

  it('BASELINE: izvor nema nijedan od poznatih kvarova', () => {
    const problems = webhookHandlerProblems(SRC);
    expect(problems, problems.join('; ')).toEqual([]);
  });

  it('gard grize: vraceni orderId+userId uvjet se prijavi', () => {
    // MUTACIJA u memoriji: tocan oblik koji je stajao u izvoru do 2026-09-22.
    const mutated = SRC.replace('if (!ev.orderId) return json', 'if (!ev.orderId || !ev.userId) return json');
    expect(mutated).not.toBe(SRC);
    expect(webhookHandlerProblems(mutated).join('; ')).toContain('user_id');
  });

  it('gard grize: uklonjen poziv klasifikatora se prijavi', () => {
    const mutated = SRC.split('classifyLemonEvent(ev)').join('({ kind: "paid" })');
    expect(webhookHandlerProblems(mutated).join('; ')).toContain('classifyLemonEvent');
  });

  it('redoslijed ostaje: potpis -> parse -> orderId -> inbox -> acceptEvent -> klasifikacija', () => {
    // Gate porijekla (PAY-04/05) NE SMIJE se pomaknuti iza klasifikacije: dogadjaj tudje trgovine
    // ili testni dogadjaj ne smije se ni klasificirati.
    const at = (needle: string): number => {
      const idx = SRC.indexOf(needle);
      expect(idx, `nema uzorka u izvoru: ${needle}`).toBeGreaterThan(-1);
      return idx;
    };
    const signature = at('verifyLemonSignature(raw');
    const parse = at('parseLemonEvent(parsed)');
    const orderIdGuard = at('if (!ev.orderId)');
    const inbox = at(".from('webhook_events')");
    const gate = at('acceptEvent(ev, {');
    const classify = at('classifyLemonEvent(ev)');
    expect(signature).toBeLessThan(parse);
    expect(parse).toBeLessThan(orderIdGuard);
    expect(orderIdGuard).toBeLessThan(inbox);
    expect(inbox).toBeLessThan(gate);
    expect(gate).toBeLessThan(classify);
  });

  it('ignorirani dogadjaj vraca 200 s razlogom i biljezi se u inbox', () => {
    expect(SRC).toContain("settle('ignored'");
    expect(SRC).toMatch(/return json\(\{ ignored: true, reason: [^}]*\}, 200\)/);
  });

  it('paid bez user_id biljezi se kao needs_manual_link i vraca 200', () => {
    expect(SRC).toContain("settle('needs_manual_link'");
    expect(SRC).toMatch(/return json\(\{ ok: true, action: 'needs_manual_link' \}, 200\)/);
  });

  /**
   * NALAZ PREGLEDA 2026-09-23: grana `ignored` bila je jedina zavrsna grana bez ijednog log retka,
   * a odluka joj pociva na usporedbi statusa s `paid`. Promjena vrijednosti kod providera bi tako
   * pretvorila svaku kupnju u 200 bez retryja, bez ijednog traga u logu.
   */
  it("grana 'ignored' logira, i to razlicito za neplacenu narudzbu i tudji dogadjaj", () => {
    expect(SRC).toContain("console.error('webhook-mor ignored_needs_attention'");
    expect(SRC).toContain("console.warn('webhook-mor ignored_foreign_event'");
    expect(SRC).toContain('isNotableIgnore(decision)');
  });

  it("gard grize: utisana grana 'ignored' se prijavi", () => {
    // MUTACIJA u memoriji: makni oba log retka iz te grane, tocno stanje prve verzije ove promjene.
    const mutated = SRC
      .replace("if (isNotableIgnore(decision)) console.error('webhook-mor ignored_needs_attention', detalji);", '')
      .replace("else console.warn('webhook-mor ignored_foreign_event', detalji);", '');
    expect(mutated).not.toBe(SRC);
    expect(webhookHandlerProblems(mutated).join('; ')).toContain("grana 'ignored' nema log retka");
  });
});
