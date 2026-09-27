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
import type { entitlementRowFromDb } from '../../src/report/entitlement-access';
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
    offerCode: 'repair_v1', paidAmountCents: 999, purchaseExpiresAt: LATER, upgradeOrderId: null, ...over,
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
 * (specijalisticki iz 0206), citaju pravo zajednickim upitom i mapiranjem, i gresku upita NE
 * tumace kao "nema prava" (to bi placenom korisniku vratilo 402).
 */
export function entitlementConsumerProblems(sources: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const [ime, raw] of Object.entries(sources)) {
    const src = raw.replace(/\r\n/g, '\n');
    if (/isReportWorkType\(/.test(src) || !/isBillableWorkType\((body|meta)\.workType\)/.test(src)) {
      problems.push(`${ime}: vrsta rada se provjerava klijentskim popisom (specijalisticki pravo nije moguce potrositi)`);
    }
    if (!src.includes('.select(ENTITLEMENT_ACCESS_SELECT)') || !src.includes('entitlementRowsFromDb(entitlements')) {
      problems.push(`${ime}: pravo se ne cita zajednickim upitom i mapiranjem (snapshot prozora)`);
    }
    if (/products\(slot_window_days\)/.test(src)) {
      problems.push(`${ime}: ugradnja products(...) bez hinta veze`);
    }
    const upit = src.indexOf('.select(ENTITLEMENT_ACCESS_SELECT)');
    const err = src.indexOf('if (slotsError || entitlementsError)', upit);
    const odluka = src.indexOf('decideReportAccess(', upit);
    if (!/\{ data: entitlements, error: entitlementsError \}/.test(src) || upit < 0 || err < 0 || odluka < 0 || err > odluka) {
      problems.push(`${ime}: greska upita prava se guta prije odluke (PGRST201 postaje 402 za placenog korisnika)`);
    }
  }
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
