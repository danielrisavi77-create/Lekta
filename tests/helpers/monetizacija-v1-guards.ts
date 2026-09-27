/**
 * Gardovi Monetizacije V1 (M2), u obliku koji tests/gate-mutations.test.ts moze mutirati.
 *
 * Dva ponasajna garda nad cistim funkcijama (snapshot prava pri kupnji, izracun nadogradnje) i
 * jedan staticki nad izvorom dviju Edge funkcija (da se odluka stvarno koristi tamo gdje se naplacuje
 * i knjizi). Izvrseni handleri se mjere u tests/create-checkout-handler.test.ts i
 * tests/webhook-mor-handler.test.ts; ovo je jeftin sloj za mutacije.
 */
import type { buildEntitlementInsert } from '../../src/report/webhook';
import type { quoteUpgrade, UpgradeSource, UpgradeTarget } from '../../src/report/upgrade';
import type { billableMismatch } from '../../src/report/billable-work-type';
import type { checkoutMismatch } from '../../src/report/checkout';
import type { entitlementRowFromDb, readAccessRows } from '../../src/report/entitlement-access';
import { decideReportAccess } from '../../src/report/slot-logic';

type BuildFn = typeof buildEntitlementInsert;
type QuoteFn = typeof quoteUpgrade;

/**
 * SNAPSHOT PRAVA PRI KUPNJI (MONETIZACIJA_V1.md odjeljak 13 i 29): entitlement nosi offer_code i
 * prava ponude kakva su bila u trenutku kupnje, kao KOPIJU, i stvarno naplaceni iznos.
 */
export function entitlementSnapshotProblems(build: BuildFn): string[] {
  const problems: string[] = [];
  const katalog = ['full_report', 'repair', 'repair_diff', 'recheck'];
  const row = build(
    { id: 'slot_diplomski', workType: 'diplomski', slotsTotal: 1, purchaseWindowDays: 90, slotWindowDays: 14, offerCode: 'repair_v1', capabilities: katalog },
    { userId: 'u1', orderId: 'pi_1', amountReceivedCents: 999 },
    'stripe',
    0,
  ) as unknown as Record<string, unknown>;
  if (row.offer_code !== 'repair_v1') problems.push('entitlement ne snapshotira offer_code pri kupnji');
  const caps = row.capabilities;
  if (!Array.isArray(caps) || caps.join(',') !== katalog.join(',')) {
    problems.push('entitlement ne snapshotira prava ponude pri kupnji');
  }
  // Promjena kataloga NAKON kupnje ne smije promijeniti kupljeno.
  katalog.push('buduce_pravo');
  if (Array.isArray(caps) && caps.includes('buduce_pravo')) {
    problems.push('snapshot prava dijeli niz s katalogom (promjena kataloga mijenja vec kupljeno pravo)');
  }
  if (row.slot_window_days !== 14) {
    problems.push('entitlement ne snapshotira prozor slota pri kupnji (prozor bi se citao iz zivog kataloga)');
  }
  if (row.paid_amount_cents !== 999) problems.push('entitlement ne biljezi stvarno naplaceni iznos (nadogradnja ga ne bi mogla priznati)');
  return problems;
}

const NOW = Date.UTC(2026, 8, 27);
const LATER = new Date(NOW + 30 * 86_400_000).toISOString();

function target(over: Partial<UpgradeTarget> = {}): UpgradeTarget {
  return { id: 'pass_diplomski', kind: 'pass', active: true, workType: 'diplomski', offerCode: 'final_pass_v1', priceEur: 19.99, ...over };
}

function source(over: Partial<UpgradeSource> = {}): UpgradeSource {
  return {
    id: 'ent-1', userId: 'u1', workType: 'diplomski', status: 'active', provider: 'stripe', slotsTotal: 1,
    offerCode: 'repair_v1', paidAmountCents: 999, purchaseExpiresAt: LATER, upgradeOrderId: null,
    slotsUsed: 1, boundSlotLive: true, ...over,
  };
}

/**
 * IZRACUN NADOGRADNJE (odjeljak 14): razlika, nikad puna cijena ponovno; jednom; ista vrsta rada;
 * samo stvarno placeno; tudje pravo ne postoji.
 */
export function upgradeQuoteProblems(quote: QuoteFn): string[] {
  const problems: string[] = [];
  const ok = quote(target(), source(), 'u1', NOW);
  if (!ok.ok) {
    problems.push('valjana nadogradnja (diplomski 9,99 -> 19,99) je odbijena');
  } else {
    if (ok.amountCents === 1999) problems.push('nadogradnja naplacuje punu cijenu Final Passa (vec placeni Repair nije odbijen)');
    else if (ok.amountCents !== 1000) problems.push(`nadogradnja diplomski daje ${ok.amountCents} centi umjesto 1000`);
  }
  const spec = quote(target({ workType: 'specijalisticki', priceEur: 29.99 }), source({ workType: 'specijalisticki', paidAmountCents: 1699 }), 'u1', NOW);
  if (!spec.ok || spec.amountCents !== 1300) problems.push('nadogradnja specijalisticki nije 1300 centi');
  if (quote(target(), source({ upgradeOrderId: 'pi_prije' }), 'u1', NOW).ok) {
    problems.push('vec nadogradjeno pravo se moze nadograditi ponovno (nije jednom)');
  }
  if (quote(target({ workType: 'doktorski', priceEur: 39.99 }), source(), 'u1', NOW).ok) {
    problems.push('nadogradnja prelazi na drugu vrstu rada');
  }
  if (quote(target(), source({ provider: 'internal' }), 'u1', NOW).ok) {
    problems.push('interna nagrada (neplaceno) umanjuje cijenu nadogradnje');
  }
  if (quote(target(), source({ paidAmountCents: null }), 'u1', NOW).ok) {
    problems.push('nepoznat placeni iznos se pogadja umjesto da se nadogradnja odbije');
  }
  if (quote(target(), source(), 'u2', NOW).ok) problems.push('tudje pravo se moze nadograditi');
  if (quote(target(), source({ purchaseExpiresAt: new Date(NOW - 1).toISOString() }), 'u1', NOW).ok) {
    problems.push('isteklo pravo se moze nadograditi (rok)');
  }
  // Vezani rad mora biti ziv (nalaz pregleda kruga 3): istekao slot cron anonimizira, pa bi placen
  // Final Pass produljio prazan otisak koji ne prepoznaje nijednu verziju rada.
  if (quote(target(), source({ boundSlotLive: false }), 'u1', NOW).ok) {
    problems.push('pravo s isteklim vezanim slotom se moze nadograditi (Final Pass bez upotrebljivog otiska)');
  }
  if (quote(target(), source({ boundSlotLive: undefined }), 'u1', NOW).ok) {
    problems.push('neprocitano stanje vezanog slota se tumaci kao ziv slot (nije fail-closed)');
  }
  const nevezano = quote(target(), source({ slotsUsed: 0, boundSlotLive: undefined }), 'u1', NOW);
  if (!nevezano.ok || nevezano.amountCents !== 1000) {
    problems.push('nevezan Repair (slots_used 0) se ne moze nadograditi');
  }
  return problems;
}

/**
 * OZICENJE: odluka se stvarno koristi gdje se naplacuje (create-checkout) i gdje se knjizi
 * (webhook-mor), a webhook snapshot cita iz istog upita kao cijenu.
 */
export function upgradeWiringProblems(checkoutSrc: string, webhookSrc: string): string[] {
  const c = checkoutSrc.replace(/\r\n/g, '\n');
  const w = webhookSrc.replace(/\r\n/g, '\n');
  const problems: string[] = [];
  if (!/const quote = quoteUpgrade\(product, source, user\.id, nowMs\);/.test(c)) {
    problems.push('create-checkout ne racuna nadogradnju kroz quoteUpgrade za prijavljenog korisnika');
  }
  if (!/amountCents = quote\.amountCents;/.test(c)) {
    problems.push('create-checkout iznos nadogradnje ne uzima iz quoteUpgrade (klijentski ili puni iznos)');
  }
  if (!/\.eq\('id', upgradeFrom\)\s*\.eq\('user_id', user\.id\)/.test(c)) {
    problems.push('create-checkout cita pravo za nadogradnju bez filtra na prijavljenog korisnika');
  }
  if (/body\.(amount|amountCents|priceEur|alreadyPaid)/.test(c)) {
    problems.push('create-checkout cita iznos iz tijela zahtjeva');
  }
  if (!w.includes(".select('*, offer_codes(capabilities)')")) {
    problems.push('webhook ne cita prava ponude u istom upitu kao cijenu (snapshot ne bi odgovarao kupnji)');
  }
  if (!w.includes('buildEntitlementInsert({ ...product, ...snapshot }')) {
    problems.push('webhook ne upisuje snapshot prava uz entitlement');
  }
  if (!/chargedAmountVerdict\(ev, quote\.amountCents\)/.test(w)) {
    problems.push('webhook naplatu nadogradnje ne usporedjuje s razlikom iz quoteUpgrade');
  }
  if (!w.includes("admin.rpc('apply_entitlement_upgrade'")) {
    problems.push('webhook nadogradnju ne pretvara atomski (apply_entitlement_upgrade)');
  }
  const grana = w.indexOf('if (ev.upgradeFromEntitlementId) {');
  const puna = w.indexOf('const ocekivanoCenti = stripeAmountCents(');
  if (grana < 0 || puna < 0 || !(grana < puna)) {
    problems.push('uplata nadogradnje prolazi usporedbu s punom cijenom prije svoje grane');
  }
  return problems;
}

/**
 * F21 stavka 1, strana radnika (process-bonus-outbox): nagrada preporucitelju se izvrsava samo kroz
 * runReferrerRewardObligation, koja oznaku povrata cita PRIJE i POSLIJE dodjele, a zavrsni status
 * retka pise samo dok je redak jos `pending` (webhook ga je mozda otkazao). Izvrsen modul mjeri
 * tests/process-bonus-outbox.test.ts; ovo je jeftin staticki sloj za mutacije.
 */
export function bonusOutboxWorkerProblems(moduleSrc: string, indexSrc: string): string[] {
  const m = moduleSrc.replace(/\r\n/g, '\n');
  const i = indexSrc.replace(/\r\n/g, '\n');
  const problems: string[] = [];
  const fnStart = m.indexOf('export async function runReferrerRewardObligation(');
  const fnEnd = fnStart >= 0 ? m.indexOf('\n}\n', fnStart) : -1;
  const fn = fnStart >= 0 && fnEnd > fnStart ? m.slice(fnStart, fnEnd) : '';
  const grant = fn.indexOf('await grant(');
  const checks = [...fn.matchAll(/if \(await orderFullyRefunded\(admin, row\.order_id\)\)/g)].map((x) => x.index ?? -1);
  if (grant < 0 || !checks.some((c) => c < grant)) {
    problems.push('radnik izvrsava nagradu preporucitelju bez citanja oznake povrata prije dodjele');
  }
  if (grant < 0 || !checks.some((c) => c > grant) || !/pullReferralSignupReward\(admin, row\.order_id\)/.test(fn.slice(grant))) {
    problems.push('radnik nakon dodjele ne cita povrat ponovno i ne povlaci nagradu (povrat u prozoru ostaje isplacen)');
  }
  if (!/\.in\('outcome_detail', REFUND_MARKERS\)/.test(m)) {
    problems.push('radnik ne cita oznaku punog povrata iz REFUND_MARKERS');
  }
  if (/tryGrantReferrerReward\(admin/.test(i) || !i.includes('runReferrerRewardObligation(')) {
    problems.push('process-bonus-outbox dodjeljuje nagradu mimo runReferrerRewardObligation (bez provjere povrata)');
  }
  const done = i.indexOf("status: 'done'");
  if (done < 0 || !/\.eq\('status', 'pending'\)/.test(i.slice(done, i.indexOf(';', done)))) {
    problems.push('radnik oznacava obvezu izvrsenom i kad ju je povrat vec otkazao (done bez uvjeta pending)');
  }
  return problems;
}

/**
 * ODLUKA O PRISTUPU CITA SNAPSHOT (odjeljci 13 i 29, "promjena buduceg kataloga ne oduzima staro
 * pravo"). Mjeri se na mjestu koje pravo stvarno provodi: mapiranje retka iz baze u EntitlementRow i
 * odluka decideReportAccess nad njim, s kupljenim prozorom 180 i danasnjim katalogom 90.
 */
export function entitlementAccessProblems(fromDb: typeof entitlementRowFromDb, select: string): string[] {
  const problems: string[] = [];
  const now = '2026-09-27T12:00:00.000Z';
  const base = { id: 'ent-1', status: 'active', slots_used: 0, slots_total: 1, purchase_expires_at: '2027-09-27T12:00:00.000Z' };
  const kupljeno = fromDb({ ...base, work_type: 'diplomski', slot_window_days: 180, products: { slot_window_days: 90 } });
  if (!kupljeno || kupljeno.slotWindowDays !== 180) {
    problems.push('odluka o pristupu cita prozor iz zivog kataloga umjesto snapshota prava (promjena kataloga mijenja kupljeno)');
  } else {
    const fp = { titleNorm: 'rad', authorNorm: 'autor', headings: ['uvod'], sectionCount: 1 };
    const d = decideReportAccess({ now, workType: 'diplomski', fingerprint: fp, activeSlots: [], entitlements: [kupljeno], recentGenerationCount: 0 });
    const ocekivano = new Date(Date.parse(now) + 180 * 86_400_000).toISOString();
    if (d.decision !== 'new_slot' || d.newSlot.slotExpiresAt !== ocekivano) {
      problems.push('vezani slot ne dobiva kupljeni prozor (180 dana) nego drugi');
    }
  }
  const stari = fromDb({ ...base, work_type: 'diplomski', slot_window_days: null, products: { slot_window_days: 120 } });
  if (!stari || stari.slotWindowDays !== 120) {
    problems.push('stariji redak bez snapshota gubi prozor svog proizvoda');
  }
  const spec = fromDb({ ...base, work_type: 'specijalisticki', slot_window_days: 21, products: null });
  if (!spec || spec.workType !== 'specijalisticki') {
    problems.push('pravo za specijalisticki se ispusta ili prepisuje u drugu vrstu rada pri citanju');
  }
  if (!/(^|,\s*)slot_window_days\s*(,|$)/.test(select)) {
    problems.push('upit prava ne cita snapshot prozora (entitlements.slot_window_days)');
  }
  if (/(^|[\s,])products\(/.test(select) || !select.includes('products!product_id(')) {
    problems.push('ugradnja products nema eksplicitan hint veze (drugi FK prema products bi dao PGRST201)');
  }
  return problems;
}

/**
 * OZICENJE POTROSNJE PRAVA: generate-report i repair-docx prihvacaju svaku prodajnu vrstu rada
 * (specijalisticki iz 0207), citaju slotove i pravo ZAJEDNICKIM citanjem (readAccessRows, izvrsno
 * testirano u accessRowsProblems), i neuspjelo citanje NE tumace kao "nema prava" (to bi placenom
 * korisniku vratilo 402).
 */
export function entitlementConsumerProblems(sources: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const [ime, raw] of Object.entries(sources)) {
    const src = raw.replace(/\r\n/g, '\n');
    if (/isReportWorkType\(/.test(src) || !/isBillableWorkType\((body|meta)\.workType\)/.test(src)) {
      problems.push(`${ime}: vrsta rada se provjerava klijentskim popisom (specijalisticki pravo nije moguce potrositi)`);
    }
    const citanje = src.indexOf('readAccessRows(admin as unknown as AccessDb, user.id, workType, now)');
    if (citanje < 0 || src.includes(".from('entitlements')") || src.includes('.select(ENTITLEMENT_ACCESS_SELECT)')) {
      problems.push(`${ime}: pravo se ne cita zajednickim citanjem readAccessRows (snapshot prozora, provjera greske)`);
    }
    if (/products\(slot_window_days\)/.test(src)) {
      problems.push(`${ime}: ugradnja products(...) bez hinta veze`);
    }
    const err = citanje < 0 ? -1 : src.indexOf('if (!access.ok)', citanje);
    const odluka = citanje < 0 ? -1 : src.indexOf('decideReportAccess(', citanje);
    if (err < 0 || odluka < 0 || err > odluka) {
      problems.push(`${ime}: greska upita prava se guta prije odluke (PGRST201 postaje 402 za placenog korisnika)`);
    }
    if (!src.includes('entitlements: access.entitlements') || !src.includes('activeSlots: access.activeSlots')) {
      problems.push(`${ime}: odluka o pristupu ne dobiva slotove i prava iz zajednickog citanja`);
    }
  }
  return problems;
}

type ReadAccessFn = typeof readAccessRows;
type Odgovor = { data: unknown; error: unknown };

/** Lazan klijent za readAccessRows: svaka tablica vraca zadani odgovor, filtri se biljeze. */
function accessDb(odgovori: Record<'document_slots' | 'entitlements', Odgovor>) {
  const filtri: Record<string, Array<[string, string, string]>> = { document_slots: [], entitlements: [] };
  const db = {
    from(table: 'document_slots' | 'entitlements') {
      return {
        select(_columns: string) {
          const q = {
            eq(c: string, v: string) {
              filtri[table].push(['eq', c, v]);
              return q;
            },
            gt(c: string, v: string) {
              filtri[table].push(['gt', c, v]);
              return q;
            },
            // oxlint-disable-next-line unicorn/no-thenable
            then<A = Odgovor, B = never>(
              ok?: ((v: Odgovor) => A | PromiseLike<A>) | null,
              fail?: ((e: unknown) => B | PromiseLike<B>) | null,
            ): PromiseLike<A | B> {
              return Promise.resolve(odgovori[table]).then(ok, fail);
            },
          };
          return q;
        },
      };
    },
  };
  return { db, filtri };
}

/**
 * ZAJEDNICKO CITANJE PRISTUPA (readAccessRows), izvrseno: pad bilo kojeg upita je `ok: false`
 * (nikad prazan popis prava), upiti su suzeni na korisnika, vrstu rada, aktivan status i zivi slot,
 * a pravo nosi snapshot prozora.
 */
export async function accessRowsProblems(read: ReadAccessFn): Promise<string[]> {
  const problems: string[] = [];
  const now = '2026-09-27T12:00:00.000Z';
  const pravo = {
    id: 'ent-1', work_type: 'specijalisticki', status: 'active', slots_used: 0, slots_total: 1,
    purchase_expires_at: '2027-01-01T00:00:00.000Z', slot_window_days: 21, products: { slot_window_days: 90 },
  };
  const slot = {
    id: 'slot-1', work_type: 'specijalisticki', slot_expires_at: '2026-10-10T00:00:00.000Z',
    fingerprint: { titleNorm: 'rad', authorNorm: 'autor', headings: ['uvod'], sectionCount: 1 },
  };

  const dobro = accessDb({ document_slots: { data: [slot], error: null }, entitlements: { data: [pravo], error: null } });
  const ok = await read(dobro.db, 'u1', 'specijalisticki', now);
  if (!ok.ok) {
    problems.push('ispravno citanje pristupa vraca gresku');
  } else {
    if (ok.entitlements.length !== 1 || ok.entitlements[0].slotWindowDays !== 21) {
      problems.push('citanje pristupa gubi pravo ili njegov snapshot prozora');
    }
    if (ok.activeSlots.length !== 1 || ok.activeSlots[0].id !== 'slot-1') problems.push('citanje pristupa gubi aktivni slot');
  }
  const f = dobro.filtri;
  const ima = (t: string, op: string, c: string, v: string) => f[t].some(([o, cc, vv]) => o === op && cc === c && vv === v);
  if (!ima('entitlements', 'eq', 'user_id', 'u1') || !ima('document_slots', 'eq', 'user_id', 'u1')) {
    problems.push('citanje pristupa nije suzeno na korisnika (tudje pravo)');
  }
  if (!ima('entitlements', 'eq', 'work_type', 'specijalisticki') || !ima('document_slots', 'eq', 'work_type', 'specijalisticki')) {
    problems.push('citanje pristupa nije suzeno na vrstu rada');
  }
  if (!ima('entitlements', 'eq', 'status', 'active')) problems.push('citanje pristupa uzima i vraceno ili ponisteno pravo');
  if (!ima('document_slots', 'gt', 'slot_expires_at', now)) problems.push('citanje pristupa uzima istekao slot');

  const padPrava = await read(
    accessDb({ document_slots: { data: [slot], error: null }, entitlements: { data: null, error: { message: 'PGRST201' } } }).db,
    'u1', 'specijalisticki', now,
  );
  if (padPrava.ok) problems.push('pad upita prava se cita kao "nema prava" (placeni korisnik dobiva 402)');
  const padSlota = await read(
    accessDb({ document_slots: { data: null, error: { message: 'timeout' } }, entitlements: { data: [pravo], error: null } }).db,
    'u1', 'specijalisticki', now,
  );
  if (padSlota.ok) problems.push('pad upita slotova se cita kao "nema slota" (recheck bi potrosio novo pravo)');
  return problems;
}

/**
 * JEDAN STRANI KLJUC entitlements -> products kroz sve migracije. Drugi (npr.
 * upgraded_from_product_id references products) cini ugradnju products(...) dvosmislenom.
 * Parsira naredbe koje stvaraju ili mijenjaju entitlements i broji `references products`.
 */
export function entitlementProductFkCount(migrations: readonly { name: string; sql: string }[]): { count: number; where: string[] } {
  const where: string[] = [];
  let count = 0;
  for (const m of migrations) {
    const sql = m.sql.replace(/\r\n/g, '\n').replace(/--[^\n]*/g, '');
    for (const stmt of sql.split(';')) {
      if (!/\b(create\s+table(\s+if\s+not\s+exists)?|alter\s+table(\s+if\s+exists)?(\s+only)?)\s+(public\.)?entitlements\b/i.test(stmt)) continue;
      const n = [...stmt.matchAll(/references\s+(public\.)?products\s*\(/gi)].length;
      if (n > 0) { count += n; where.push(`${m.name} (${n})`); }
    }
  }
  return { count, where };
}

/**
 * BEZ FALLBACKA specijalisticki -> diplomski (odjeljak 18), na serverskoj strani: naslovnica
 * specijalistickog rada blokira kupnju (create-checkout) i potrosnju (repair-docx) svake nize vrste
 * rada i predlaze specijalisticki. Bez toga slot_specijalisticki (16,99) zaobilazi diplomski slot (9,99).
 */
export function specialistFallbackProblems(billable: typeof billableMismatch, checkout: typeof checkoutMismatch): string[] {
  const problems: string[] = [];
  const suggest = () => 'diplomski' as const;
  for (const nize of ['seminarski', 'zavrsni', 'diplomski'] as const) {
    const d = billable(nize, { words: 20_000, titleMarker: 'specialist' }, suggest);
    if (!d.block || d.suggestedWorkType !== 'specijalisticki') {
      problems.push(`repair-docx: specijalisticka naslovnica trosi ${nize} slot (fallback specijalisticki -> nize)`);
    }
  }
  if (billable('specijalisticki', { words: 20_000, titleMarker: 'specialist' }, suggest).block) {
    problems.push('specijalisticki rad na specijalistickom pravu je blokiran');
  }
  if (billable('doktorski', { words: 20_000, titleMarker: 'specialist' }, suggest).block) {
    problems.push('visa vrsta rada (doktorski) je blokirana za specijalisticku naslovnicu');
  }
  const kupnja = checkout('diplomski', { words: 20_000, titleMarker: 'specialist' }, false);
  if (!kupnja.block || kupnja.suggestedWorkType !== 'specijalisticki') {
    problems.push('create-checkout: specijalisticka naslovnica kupuje diplomski slot (fallback specijalisticki -> diplomski)');
  }
  if (checkout('diplomski', { words: 20_000, titleMarker: 'specialist' }, true).block) {
    problems.push('create-checkout: svjesna potvrda nize vrste vise ne prolazi');
  }
  const specKupnja = checkout('specijalisticki', { words: 40_000, titleMarker: 'doctoral' }, false);
  if (!specKupnja.block || specKupnja.suggestedWorkType !== 'doktorski') {
    problems.push('create-checkout: doktorska naslovnica kupuje specijalisticki proizvod');
  }
  return problems;
}

/**
 * POVRAT KOJI DIRA NADOGRADNJU OSTAVLJA TRAJAN TRAG (nalaz pregleda kruga 3, odjeljak 29 "refund
 * zatvara entitlement i sve vezane posljedice"). Puni povrat izvorne Repair uplate nadogradjenog
 * prava gasi Final Pass, a uplata nadogradnje ostaje naplacena; povrat uplate nadogradnje ostavlja
 * placeni Repair bez prava. Oba slucaja moraju u inbox kao `needs_manual_review` uz biljesku, a ne
 * samo kao redak u logu koji istekne. Izvrseno se mjeri u tests/webhook-mor-handler.test.ts.
 */
export function upgradeRefundTraceProblems(webhookSrc: string): string[] {
  const w = webhookSrc.replace(/\r\n/g, '\n');
  const problems: string[] = [];
  if (!w.includes('rucniPregled = `refund_of_upgraded_entitlement: ')) {
    problems.push('povrat izvorne uplate nadogradjenog prava ne sastavlja biljesku za rucni pregled');
  }
  if (!w.includes('rucniPregled = `upgrade_refunded: ')) {
    problems.push('povrat uplate nadogradnje ne sastavlja biljesku za rucni pregled (placeni Repair bez prava samo u logu)');
  }
  const pregled = w.indexOf("await settle('needs_manual_review', 'refunded', rucniPregled);");
  const obicno = w.indexOf("await settle('processed', 'refunded');");
  if (pregled < 0 || obicno < 0 || pregled > obicno || !w.slice(Math.max(0, pregled - 200), pregled).includes('if (rucniPregled !== null) {')) {
    problems.push('povrat koji dira nadogradnju zavrsava kao obican processed/refunded, bez trajnog traga u inboxu');
  }
  return problems;
}
