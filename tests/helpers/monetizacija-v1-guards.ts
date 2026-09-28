/**
 * Gardovi Monetizacije V1 (M2), u obliku koji tests/gate-mutations.test.ts moze mutirati.
 *
 * Dva ponasajna garda nad cistim funkcijama (snapshot prava pri kupnji, izracun nadogradnje) i
 * jedan staticki nad izvorom dviju Edge funkcija (da se odluka stvarno koristi tamo gdje se naplacuje
 * i knjizi). Izvrseni handleri se mjere u tests/create-checkout-handler.test.ts i
 * tests/webhook-mor-handler.test.ts; ovo je jeftin sloj za mutacije.
 */
import type { buildEntitlementInsert } from '../../src/report/webhook';
import type { quoteUpgrade, readBoundSlotIntact, UpgradeSource, UpgradeTarget } from '../../src/report/upgrade';
import type { billableMismatch } from '../../src/report/billable-work-type';
import { unambiguousMismatch } from '../../src/report/work-type-estimate';
import type { checkoutMismatch } from '../../src/report/checkout';
import type { entitlementRowFromDb, readAccessRows } from '../../src/report/entitlement-access';
import { decideReportAccess } from '../../src/report/slot-logic';
import type { ReferrerRewardDb, runReferrerRewardObligation } from '../../supabase/functions/process-bonus-outbox/referrer-reward';
import { argOf, fakeAdmin, writeOp, type FakeCall } from './fake-supabase';

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
    slotsUsed: 1, boundSlotIntact: true, ...over,
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
  // Rok potrosnje je rok VEZIVANJA: vrijedi za nevezan Repair, a vezanom nije granica (krug 4).
  if (quote(target(), source({ slotsUsed: 0, boundSlotIntact: undefined, purchaseExpiresAt: new Date(NOW - 1).toISOString() }), 'u1', NOW).ok) {
    problems.push('isteklo pravo se moze nadograditi (rok)');
  }
  // slot_diplomski kupljen dan 0 (kupovni prozor 90), vezan dan 85, slot ziv do dana 99; provjera dan 92.
  const vezanIzvanRoka = quote(target(), source({ slotsUsed: 1, boundSlotIntact: true, purchaseExpiresAt: new Date(NOW - 2 * 86_400_000).toISOString() }), 'u1', NOW);
  if (!vezanIzvanRoka.ok || vezanIzvanRoka.amountCents !== 1000) {
    problems.push('vezan Repair s netaknutim otiskom odbijen jer je istekao rok potrosnje (Repair kupac kaznjen, granica je anonimizacija)');
  }
  // Vezani rad mora biti prepoznatljiv (krug 3 i 4): anonimiziran otisak (purge_document_slots, 0016)
  // bi dao placen Final Pass koji ne prepoznaje nijednu verziju rada. Istek prozora nije granica.
  if (quote(target(), source({ boundSlotIntact: false }), 'u1', NOW).ok) {
    problems.push('pravo s anonimiziranim vezanim slotom se moze nadograditi (Final Pass bez upotrebljivog otiska)');
  }
  if (quote(target(), source({ boundSlotIntact: undefined }), 'u1', NOW).ok) {
    problems.push('neprocitano stanje vezanog slota se tumaci kao netaknut otisak (nije fail-closed)');
  }
  const nevezano = quote(target(), source({ slotsUsed: 0, boundSlotIntact: undefined }), 'u1', NOW);
  if (!nevezano.ok || nevezano.amountCents !== 1000) {
    problems.push('nevezan Repair (slots_used 0) se ne moze nadograditi');
  }
  return problems;
}

type BoundSlotReadFn = typeof readBoundSlotIntact;

/** Lazan klijent za readBoundSlotIntact: vraca zadane retke slota i biljezi filtre. */
function boundSlotDb(data: unknown) {
  const filtri: string[] = [];
  const q = {
    eq(c: string, _v: string) { filtri.push(`eq:${c}`); return q; },
    gt(c: string, _v: string) { filtri.push(`gt:${c}`); return q; },
    lt(c: string, _v: string) { filtri.push(`lt:${c}`); return q; },
    limit(_n: number) { return q; },
    // oxlint-disable-next-line unicorn/no-thenable
    then<A = Odgovor, B = never>(ok?: ((v: Odgovor) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
      return Promise.resolve({ data, error: null }).then(ok, fail);
    },
  };
  return { db: { from: (_t: 'document_slots') => ({ select: (_c: string) => q }) }, filtri };
}

/**
 * KREDIT ZA POPRAVAK (krug 4, odjeljak 14: korisnik koji je prvo kupio Repair ne smije biti
 * kaznjen). Citanje vezanog slota za nadogradnju: slot_zavrsni istekao prije 5 dana, otisak
 * netaknut -> nadogradnja 12,99 - 5,99 prolazi; purgan otisak (0016) -> odbijeno. Granica je
 * anonimizacija, ne istek prozora.
 */
export async function boundSlotReadProblems(read: BoundSlotReadFn, quote: QuoteFn): Promise<string[]> {
  const problems: string[] = [];
  const otisak = { titleNorm: 'rad', authorNorm: 'autor', headings: ['uvod'], sectionCount: 1 };
  const istekao = new Date(NOW - 5 * 86_400_000).toISOString();
  const zavrsni = target({ id: 'pass_zavrsni', workType: 'zavrsni', priceEur: 12.99 });
  const repair = (intact: boolean) => source({ workType: 'zavrsni', paidAmountCents: 599, boundSlotIntact: intact });

  const ziv = boundSlotDb([{ id: 's1', fingerprint: otisak, slot_expires_at: istekao }]);
  const r1 = await read(ziv.db as never, 'ent-1');
  const q1 = quote(zavrsni, repair(r1.ok && r1.intact), 'u1', NOW);
  if (!q1.ok || q1.amountCents !== 700) {
    problems.push('slot istekao prije 5 dana s netaknutim otiskom odbija nadogradnju 12,99 - 5,99 (Repair kupac kaznjen)');
  }
  if (ziv.filtri.some((f) => f.includes('slot_expires_at'))) {
    problems.push('citanje vezanog slota za nadogradnju filtrira po isteku prozora (granica je anonimizacija)');
  }
  const purgan = boundSlotDb([{ id: 's1', fingerprint: { sectionCount: 1 }, slot_expires_at: new Date(NOW - 40 * 86_400_000).toISOString() }]);
  const r2 = await read(purgan.db as never, 'ent-1');
  if (!r2.ok || r2.intact || quote(zavrsni, repair(r2.ok && r2.intact), 'u1', NOW).ok) {
    problems.push('anonimiziran vezani slot (purge 0016) se moze nadograditi (Final Pass bez otiska)');
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
    id: 'slot-1', entitlement_id: 'ent-1', work_type: 'specijalisticki', slot_expires_at: '2026-10-10T00:00:00.000Z',
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

  // KRUG 4, POVRAT NADOGRADNJE: nadogradnja je slot produljila na prozor Final Passa (dan 240),
  // puni povrat je pravo ugasio. Dan 60, isti rad: re-check NE smije biti besplatan. Dva oblika
  // odgovora: upit prava filtrira status (prazno) ili vrati i vraceni redak.
  const dan = (d: number) => new Date(Date.parse(now) + d * 86_400_000).toISOString();
  const produljen = { ...slot, slot_expires_at: dan(240) };
  const vraceno = { ...pravo, status: 'refunded', slots_used: 1 };
  for (const [opis, prava] of [['upit filtrira status', []], ['upit vrati vraceni redak', [vraceno]]] as const) {
    const r = await read(accessDb({ document_slots: { data: [produljen], error: null }, entitlements: { data: prava, error: null } }).db, 'u1', 'specijalisticki', dan(60));
    if (!r.ok) {
      problems.push(`povrat nadogradnje (${opis}): citanje pristupa vraca gresku`);
      continue;
    }
    const d = decideReportAccess({ now: dan(60), workType: 'specijalisticki', fingerprint: slot.fingerprint, activeSlots: r.activeSlots, entitlements: r.entitlements, recentGenerationCount: 0 });
    if (d.decision !== 'payment_required') {
      problems.push(`povrat nadogradnje (${opis}): dan 60 daje ${d.decision} umjesto 402 (vraceno pravo i dalje otvara vezani slot)`);
    }
  }
  // Regresijski par: isto, ali pravo aktivno (nije vraceno) -> besplatan re-check ostaje.
  const aktivno = await read(accessDb({ document_slots: { data: [produljen], error: null }, entitlements: { data: [{ ...pravo, slots_used: 1 }], error: null } }).db, 'u1', 'specijalisticki', dan(60));
  const dAktivno = aktivno.ok
    ? decideReportAccess({ now: dan(60), workType: 'specijalisticki', fingerprint: slot.fingerprint, activeSlots: aktivno.activeSlots, entitlements: aktivno.entitlements, recentGenerationCount: 0 })
    : null;
  if (dAktivno?.decision !== 'recheck') {
    problems.push('aktivno nadogradjeno pravo vise ne daje besplatan re-check vezanog slota (regresija)');
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

/**
 * BEZ FALLBACKA specijalisticki -> diplomski (odjeljak 18), na serverskoj strani: naslovnica
 * specijalistickog rada blokira kupnju (create-checkout) i potrosnju (repair-docx) svake nize vrste
 * rada i predlaze specijalisticki. Bez toga slot_specijalisticki (16,99) zaobilazi diplomski slot (9,99).
 */
export function specialistFallbackProblems(billable: typeof billableMismatch, checkout: typeof checkoutMismatch): string[] {
  const problems: string[] = [];
  const suggest = () => 'diplomski' as const;
  // Ponasanje UZ prekidac M3 (SPECIALIST_TIER_ENABLED = true), izricito ukljucen.
  for (const nize of ['seminarski', 'zavrsni', 'diplomski'] as const) {
    const d = billable(nize, { words: 20_000, titleMarker: 'specialist' }, suggest, true);
    if (!d.block || d.suggestedWorkType !== 'specijalisticki') {
      problems.push(`repair-docx: specijalisticka naslovnica trosi ${nize} slot (fallback specijalisticki -> nize)`);
    }
  }
  if (billable('specijalisticki', { words: 20_000, titleMarker: 'specialist' }, suggest, true).block) {
    problems.push('specijalisticki rad na specijalistickom pravu je blokiran');
  }
  if (billable('doktorski', { words: 20_000, titleMarker: 'specialist' }, suggest, true).block) {
    problems.push('visa vrsta rada (doktorski) je blokirana za specijalisticku naslovnicu');
  }
  const kupnja = checkout('diplomski', { words: 20_000, titleMarker: 'specialist' }, false, true);
  if (!kupnja.block || kupnja.suggestedWorkType !== 'specijalisticki') {
    problems.push('create-checkout: specijalisticka naslovnica kupuje diplomski slot (fallback specijalisticki -> diplomski)');
  }
  if (checkout('diplomski', { words: 20_000, titleMarker: 'specialist' }, true, true).block) {
    problems.push('create-checkout: svjesna potvrda nize vrste vise ne prolazi');
  }
  const specKupnja = checkout('specijalisticki', { words: 40_000, titleMarker: 'doctoral' }, false);
  if (!specKupnja.block || specKupnja.suggestedWorkType !== 'doktorski') {
    problems.push('create-checkout: doktorska naslovnica kupuje specijalisticki proizvod');
  }
  return problems;
}

/**
 * PRIJE M3 (krug 4): klijent jos ne nudi `specijalisticki`, pa server po ZADANOM prekidacu ne smije
 * ni predlagati ni blokirati prema toj vrsti. Za cetiri klijentske vrste odluka je doslovno ona
 * prije M2 (unambiguousMismatch uz prijedlog iz klijentske procjene). `enabled` je izvezena
 * vrijednost SPECIALIST_TIER_ENABLED; M3 je mijenja zajedno s klijentom.
 */
export function specialistTierGateProblems(
  billable: typeof billableMismatch,
  checkout: typeof checkoutMismatch,
  enabled: boolean,
): string[] {
  const problems: string[] = [];
  if (enabled !== false) problems.push('SPECIALIST_TIER_ENABLED je ukljucen prije M3 (klijent specijalisticki jos ne nudi)');
  const suggest = () => 'diplomski' as const;
  for (const nize of ['seminarski', 'zavrsni', 'diplomski'] as const) {
    for (const words of [2_000, 12_000, 20_000]) {
      const sig = { words, titleMarker: 'specialist' as const };
      const d = billable(nize, sig, suggest);
      if (d.suggestedWorkType === 'specijalisticki') {
        problems.push(`prije M3 server predlaze specijalisticki za ${nize} (prijedlog koji klijent ne moze odabrati)`);
      }
      const prije = unambiguousMismatch(nize, sig) ? { block: true, suggestedWorkType: 'diplomski' } : { block: false };
      if (JSON.stringify(d) !== JSON.stringify(prije)) {
        problems.push(`prije M3 ${nize} (${words} rijeci, specijalisticka naslovnica) ne odlucuje kao prije M2`);
      }
    }
  }
  const kupnja = checkout('diplomski', { words: 20_000, titleMarker: 'specialist' }, false);
  if (kupnja.block) problems.push('prije M3 create-checkout blokira diplomski zbog specijalisticke naslovnice');
  return problems;
}

interface StripeSyncOpts {
  apply: boolean;
  live: boolean;
  from: string;
  fromExplicit: boolean;
  json: boolean;
}
type StripeSyncParse = (argv: string[]) => StripeSyncOpts;
type StripeSyncGuard = (opts: StripeSyncOpts, env: Record<string, string | undefined>) => string | null;

function throwsWith(fn: () => unknown, re: RegExp): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return re.test(e instanceof Error ? e.message : String(e));
  }
}

/**
 * ZASTITE scripts/stripe-sync-products.mjs (krug 4): zadano je dry-run bez mreze; `--apply` bez
 * STRIPE_SECRET_KEY, `sk_live_` bez `--live` i `--apply` bez eksplicitnog `--from` se odbijaju; a
 * `main` provjeru radi PRIJE citanja kataloga iz baze (mreza). Izvrseno nad parseArgs i applyGuard,
 * a redoslijed u `main` nad izvorom skripte. Behavior main-a mjeri tests/stripe-sync-products.test.ts.
 */
export function stripeSyncSafetyProblems(parse: StripeSyncParse, guard: StripeSyncGuard, scriptSrc: string): string[] {
  const problems: string[] = [];
  const test = ['sk', 'test', 'gard'].join('_');
  const live = ['sk', 'live', 'gard'].join('_');
  const zadano = parse([]);
  if (zadano.apply !== false) problems.push('stripe-sync: zadano nije dry-run (bez argumenata salje zahtjeve Stripeu)');
  try {
    if (guard(zadano, { STRIPE_SECRET_KEY: live }) !== null) problems.push('stripe-sync: dry-run trazi ili vraca kljuc');
  } catch {
    problems.push('stripe-sync: pokretanje bez argumenata prolazi zastite za --apply (nije dry-run)');
  }
  if (!throwsWith(() => guard(parse(['--apply', '--from=db']), {}), /STRIPE_SECRET_KEY/)) {
    problems.push('stripe-sync: --apply bez STRIPE_SECRET_KEY se ne odbija');
  }
  if (!throwsWith(() => guard(parse(['--apply', '--from=db']), { STRIPE_SECRET_KEY: live }), /--live/)) {
    problems.push('stripe-sync: sk_live_ kljuc prolazi bez --live');
  }
  if (!throwsWith(() => guard(parse(['--apply']), { STRIPE_SECRET_KEY: test }), /--from=db/)) {
    problems.push('stripe-sync: --apply bez eksplicitnog --from zrcali sjeme cijena iz migracija');
  }
  if (!throwsWith(() => guard(parse(['--apply', '--from=migrations']), { STRIPE_SECRET_KEY: test }), /--from=db/)) {
    problems.push('stripe-sync: --apply --from=migrations zrcali sjeme cijena iz migracija umjesto zivog kataloga');
  }
  try {
    if (guard(parse(['--apply', '--from=db', '--live']), { STRIPE_SECRET_KEY: live }) !== live) {
      problems.push('stripe-sync: ispravan --apply --from=db --live ne vraca kljuc');
    }
  } catch {
    problems.push('stripe-sync: ispravan --apply --from=db --live se odbija');
  }
  const src = scriptSrc.replace(/\r\n/g, '\n');
  const start = src.indexOf('export async function main(');
  const end = start >= 0 ? src.indexOf('\n}\n', start) : -1;
  const body = start >= 0 && end > start ? src.slice(start, end) : '';
  const g = body.indexOf('applyGuard(opts, env)');
  const net = body.search(/catalogFromDb\(|readStripeState\(|applyStripePlan\(/);
  if (!body.includes('parseArgs(argv)') || g < 0 || net < 0 || g > net) {
    problems.push('stripe-sync: main cita katalog ili Stripe prije provjere zastita (odbijen --apply ipak ide na mrezu)');
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
  // Krug 4 (nalaz pregleda): povrat SAMO uplate nadogradnje vraca pravo na zapamceni Repair
  // (revert_entitlement_upgrade), i u grani povrata i u grani uplate kad povrat stigne istodobno.
  // Gasenje u refunded smije biti samo pricuva za pravo bez zapamcenog stanja (no_snapshot).
  const poziv = "admin.rpc('revert_entitlement_upgrade', {";
  const granaPovrata = w.indexOf('  if (decision.kind === \'refund\') {');
  const krajPovrata = granaPovrata < 0 ? -1 : w.indexOf("console.error('webhook-mor refund_without_entitlement'", granaPovrata);
  const povrat = granaPovrata >= 0 && krajPovrata > granaPovrata ? w.slice(granaPovrata, krajPovrata) : '';
  const vracanjeUPovratu = povrat.indexOf(poziv);
  const gasenjeNadogradnje = povrat.indexOf(".eq('upgrade_order_id', ev.orderId)\n        .in('id', upgradeIds)");
  if (vracanjeUPovratu < 0 || (gasenjeNadogradnje >= 0 && gasenjeNadogradnje < vracanjeUPovratu)
    || !povrat.includes('if (upgradeIds.length > 0 && !nadogradnjaVracena) {')) {
    problems.push('povrat uplate nadogradnje gasi pravo umjesto da ga vrati na placeni Repair (odjeljak 14)');
  }
  const uplata = w.slice(Math.max(0, w.indexOf('async function bookUpgradePayment(')));
  const vracanjeUUplati = uplata.indexOf(poziv);
  const gasenjeUUplati = uplata.indexOf(".update({ status: 'refunded' })");
  if (vracanjeUUplati < 0 || gasenjeUUplati < 0 || gasenjeUUplati < vracanjeUUplati) {
    problems.push('istodobni povrat uplate nadogradnje gasi pretvoreno pravo umjesto da ga vrati na placeni Repair');
  }
  const pregled = w.indexOf("await settle('needs_manual_review', 'refunded', rucniPregled);");
  const obicno = w.indexOf("await settle('processed', 'refunded');");
  if (pregled < 0 || obicno < 0 || pregled > obicno || !w.slice(Math.max(0, pregled - 200), pregled).includes('if (rucniPregled !== null) {')) {
    problems.push('povrat koji dira nadogradnju zavrsava kao obican processed/refunded, bez trajnog traga u inboxu');
  }
  return problems;
}

/**
 * Codex pregled PR #217, M2: obveza `referrer_reward` cita ishod dodjele. Prolazan pad (`grant_failed`,
 * `error`) mora ostaviti obvezu za ponovni pokusaj (modul baca, radnik redak ostavlja `pending`), a
 * trajna odluka (prijevara po IP-u) zatvara obvezu kao `done` s razlogom i ne ponavlja se. Mjeri se
 * izvrsen modul nad laznom bazom bez povrata.
 */
export async function referrerRewardRetryProblems(run: typeof runReferrerRewardObligation): Promise<string[]> {
  const problems: string[] = [];
  const row = { id: 'ob-1', user_id: 'buyer-1', order_id: 'pi_1', payload: { workType: 'diplomski' } };
  const svijet = () => fakeAdmin((c) => (writeOp(c) === 'select' ? { data: [] } : undefined));
  const outboxPisanja = (calls: FakeCall[]) => calls.filter((c) => c.table === 'bonus_outbox' && writeOp(c) !== 'select');

  for (const reason of ['grant_failed', 'error']) {
    const db = svijet();
    let ishod = 'bacilo';
    try {
      ishod = await run(db.admin as unknown as ReferrerRewardDb, row, async () => ({ granted: false, reason }));
    } catch {
      // ocekivano: obveza ostaje pending za ponovni pokusaj
    }
    if (ishod !== 'bacilo' || outboxPisanja(db.calls).length > 0) {
      problems.push(`${reason}: obveza zavrsi kao ${ishod} umjesto ponovnog pokusaja (nagrada se vise ne pokusava)`);
    }
  }

  const db = svijet();
  let trajno = 'bacilo';
  try {
    trajno = await run(db.admin as unknown as ReferrerRewardDb, row, async () => ({ granted: false, reason: 'ip_match_fraud' }));
  } catch {
    // trajna odluka ne smije bacati
  }
  const zatvoreno = outboxPisanja(db.calls).find((c) => (argOf(c, 'update') as Record<string, unknown> | undefined)?.status === 'done');
  if (trajno !== 'declined' || !zatvoreno || (argOf(zatvoreno, 'update') as Record<string, unknown>).done_reason !== 'ip_match_fraud') {
    problems.push(`trajna odluka ip_match_fraud se ponavlja ili se zatvara bez razloga (${trajno})`);
  }
  return problems;
}
