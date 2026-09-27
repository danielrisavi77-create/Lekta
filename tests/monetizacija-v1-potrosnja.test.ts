/**
 * Monetizacija V1 (M2), krug 2: kupljeno pravo se mora moci POTROSITI, i to pod uvjetima pod kojima je
 * kupljeno. Tri nalaza pregleda, svaki s vlastitim izravnim signalom:
 *
 *  1. Drugi FK entitlements -> products (upgraded_from_product_id) bi ugradnju `products(...)` u
 *     generate-report i repair-docx ucinio dvosmislenom (PGRST201), a greska se gutala pa bi placeni
 *     korisnik dobio 402. Signal: jedan FK kroz sve migracije (tests/monetizacija-v1-migracija.test.ts),
 *     eksplicitan hint u zajednickom upitu i provjera greske u oba potrosaca (ovdje).
 *  2. "specijalisticki prolazi kroz cijeli pricing/catalog/checkout/entitlement tok" (odjeljak 29),
 *     SERVERSKI dio: potrosaci su vrstu rada provjeravali klijentskim popisom (isReportWorkType) i
 *     odbijali je s 400. Signal: cijeli serverski tok od resolveCheckout do vezanog slota, s vrstom
 *     rada provjerenom ISTIM validatorom kao handler (isBillableWorkType), bez casta. Krug 3: server
 *     vise ne dopusta fallback specijalisticki -> diplomski (odjeljak 18) ni na kupnji ni na popravku.
 *     KLIJENTSKI dio kriterija (pricing selector, WORK_TYPE_TIERS/ORDER, picker) NIJE ispunjen u M2:
 *     pripada M3, pa je kriterij u izvjestaju "djelomicno, ceka M3", ne "ispunjeno".
 *  3. "promjena buduceg kataloga ne oduzima staro pravo": prozor slota se citao iz zivog products.
 *     Signal: odluka o pristupu nad retkom sa snapshotom 180 i katalogom 90 veze slot na 180.
 *
 * Granica M3: klijentski izbornik i cjenik (src/report/pricing.ts) se NE mijenjaju; to se ovdje
 * izricito provjerava, da serverska vrsta rada ne procuri u klijent s cijenom.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { seededProducts } from './helpers/product-seeds';
import {
  accessRowsProblems,
  entitlementAccessProblems,
  entitlementConsumerProblems,
  specialistFallbackProblems,
} from './helpers/monetizacija-v1-guards';
import { mapProductRow } from '../src/catalog/products-catalog';
import { resolveCheckout } from '../src/report/checkout';
import { buildEntitlementInsert } from '../src/report/webhook';
import { decideReportAccess } from '../src/report/slot-logic';
import { computeFingerprint } from '../src/fingerprint/fingerprint';
import { WORK_TYPE_ORDER, WORK_TYPE_TIERS, isReportWorkType } from '../src/report/pricing';
import { BILLABLE_WORK_TYPES, billableMismatch, isBillableWorkType } from '../src/report/billable-work-type';
import { ENTITLEMENT_ACCESS_SELECT, entitlementRowFromDb, entitlementRowsFromDb, readAccessRows } from '../src/report/entitlement-access';
import { checkoutMismatch } from '../src/report/checkout';
import { estimateWorkType } from '../src/report/work-type-estimate';

const read = (...p: string[]) => readFileSync(resolve(process.cwd(), ...p), 'utf8');
const SOURCES = {
  'generate-report': read('supabase', 'functions', 'generate-report', 'index.ts'),
  'repair-docx': read('supabase', 'functions', 'repair-docx', 'index.ts'),
};

const NOW = '2026-09-27T12:00:00.000Z';
const at = (days: number) => new Date(Date.parse(NOW) + days * 86_400_000).toISOString();
const rad = computeFingerprint({
  title: 'Upravljanje rizicima u javnoj nabavi',
  author: 'Iva Ivic',
  headings: [
    { level: 1, text: '1. Uvod' },
    { level: 1, text: '2. Metodologija' },
    { level: 1, text: '3. Zakljucak' },
  ],
});

describe('nalaz 1: ugradnja proizvoda je jednoznacna i greska upita nije "nema prava"', () => {
  it('zajednicki upit cita snapshot prozora i ugradjuje products s hintom veze', () => {
    expect(entitlementAccessProblems(entitlementRowFromDb, ENTITLEMENT_ACCESS_SELECT)).toEqual([]);
  });

  it('generate-report i repair-docx koriste zajednicki upit, mapiranje i provjeru greske', () => {
    expect(entitlementConsumerProblems(SOURCES)).toEqual([]);
  });

  it('generator: oba potrosaca su doista pronadjena i citaju pravo zajednickim citanjem', () => {
    for (const [ime, src] of Object.entries(SOURCES)) {
      expect(src.includes('readAccessRows('), ime).toBe(true);
      expect(src.includes('decideReportAccess('), ime).toBe(true);
    }
  });

  it('zajednicko citanje, IZVRSENO: pad upita je greska (500), ne "nema prava" (402); upiti suzeni', async () => {
    expect(await accessRowsProblems(readAccessRows)).toEqual([]);
  });
});

describe('nalaz 2: "specijalisticki prolazi kroz cijeli pricing/catalog/checkout/entitlement tok"', () => {
  const products = new Map(seededProducts().map((s) => [String(s.row.id), s]));

  it('server prihvaca specijalisticki; klijentski izbornik i cjenik JOS nemaju specijalisticki (M3, kriterij djelomican)', () => {
    expect(BILLABLE_WORK_TYPES).toEqual(['seminarski', 'zavrsni', 'diplomski', 'specijalisticki', 'doktorski']);
    expect(isBillableWorkType('specijalisticki')).toBe(true);
    expect(isBillableWorkType('specialist')).toBe(false);
    expect(isBillableWorkType('diplomski ')).toBe(false);
    expect(isReportWorkType('specijalisticki')).toBe(false);
    expect(WORK_TYPE_ORDER).toEqual(['seminarski', 'zavrsni', 'diplomski', 'doktorski']);
    expect(Object.keys(WORK_TYPE_TIERS)).not.toContain('specijalisticki');
    // Nijedna cijena ni prozor u serverskom modulu vrste rada.
    expect(read('src', 'report', 'billable-work-type.ts').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')).not.toMatch(/\d+\.\d{2}/);
  });

  it.each([
    ['slot_specijalisticki', 21],
    ['pass_specijalisticki', 240],
  ] as const)('%s: checkout -> webhook redak -> citanje prava -> vezan slot s kupljenim prozorom', (id, prozor) => {
    const seed = products.get(id);
    expect(seed, `${id} nije sijan ni u jednoj migraciji`).toBeDefined();
    const product = { ...mapProductRow(seed!.row), slotWindowDays: prozor, offerCode: id.startsWith('slot_') ? 'repair_v1' : 'final_pass_v1' };

    const checkout = resolveCheckout(product, { isPartnerActive: false });
    expect(checkout.ok).toBe(true);

    const insert = buildEntitlementInsert(
      { ...product, capabilities: ['full_report', 'repair'] },
      { userId: 'u1', orderId: `pi_${id}`, amountReceivedCents: Math.round(product.priceEur * 100) },
      'stripe',
      Date.parse(NOW),
    );
    expect(insert.work_type).toBe('specijalisticki');
    expect(insert.slot_window_days).toBe(prozor);

    // Handler provjerava vrstu rada iz zahtjeva ISTIM validatorom; ovdje bez casta.
    const zahtjev: unknown = 'specijalisticki';
    expect(isBillableWorkType(zahtjev)).toBe(true);
    if (!isBillableWorkType(zahtjev)) return;

    // Redak kako ga PostgREST vraca za ENTITLEMENT_ACCESS_SELECT nakon inserta.
    const redak = {
      id: 'ent-spec', work_type: insert.work_type, status: 'active', slots_used: 0, slots_total: insert.slots_total,
      purchase_expires_at: insert.purchase_expires_at, slot_window_days: insert.slot_window_days,
      products: { slot_window_days: prozor },
    };
    const odluka = decideReportAccess({
      now: NOW, workType: zahtjev, fingerprint: rad, activeSlots: [], entitlements: entitlementRowsFromDb([redak]), recentGenerationCount: 0,
    });
    expect(odluka).toMatchObject({ decision: 'new_slot', entitlementId: 'ent-spec' });
    if (odluka.decision === 'new_slot') expect(odluka.newSlot.slotExpiresAt).toBe(at(prozor));
  });

  it('specijalisticko pravo se ne trosi za diplomski ni doktorski zahtjev (bez fallbacka)', () => {
    const redak = { id: 'ent-spec', work_type: 'specijalisticki', status: 'active', slots_used: 0, slots_total: 1, purchase_expires_at: at(90), slot_window_days: 21 };
    for (const workType of ['diplomski', 'doktorski'] as const) {
      const d = decideReportAccess({ now: NOW, workType, fingerprint: rad, activeSlots: [], entitlements: entitlementRowsFromDb([redak]), recentGenerationCount: 0 });
      expect(d.decision, workType).toBe('payment_required');
    }
  });

  it('nepoznata vrsta rada u retku se ispusta, ne prepisuje u drugu', () => {
    const redak = { id: 'x', work_type: 'specialist', status: 'active', slots_used: 0, slots_total: 1, purchase_expires_at: at(90) };
    expect(entitlementRowFromDb(redak)).toBeNull();
  });

  it('blokada jeftinije vrste: specijalisticki blokira samo doktorska naslovnica; ostale vrste doslovno kao prije', () => {
    const suggest = (s: Parameters<typeof estimateWorkType>[0]) => estimateWorkType(s).workType;
    expect(billableMismatch('specijalisticki', { words: 40_000, titleMarker: 'doctoral' }, suggest)).toEqual({ block: true, suggestedWorkType: 'doktorski' });
    expect(billableMismatch('specijalisticki', { words: 40_000, titleMarker: 'specialist' }, suggest)).toEqual({ block: false });
    // Krug 3 (odjeljak 18): specijalisticka naslovnica na diplomskom slotu se blokira i predlaze specijalisticki.
    expect(billableMismatch('diplomski', { words: 20_000, titleMarker: 'specialist' }, suggest)).toEqual({ block: true, suggestedWorkType: 'specijalisticki' });
    expect(billableMismatch('specijalisticki', { words: 500_000, titleMarker: null }, suggest)).toEqual({ block: false });
    expect(billableMismatch('seminarski', { words: 5000, titleMarker: 'doctoral' }, suggest)).toEqual({ block: true, suggestedWorkType: 'doktorski' });
    expect(billableMismatch('doktorski', { words: 5000, titleMarker: 'seminar' }, suggest)).toEqual({ block: false });
  });
});

describe('krug 3: bez fallbacka specijalisticki -> diplomski na serveru (odjeljak 18)', () => {
  it('repair-docx (billableMismatch) i create-checkout (checkoutMismatch) blokiraju nizu vrstu za specijalisticku naslovnicu', () => {
    expect(specialistFallbackProblems(billableMismatch, checkoutMismatch)).toEqual([]);
  });

  it('scenarij iz pregleda: specijalisticki rad + odabran diplomski -> 409 s prijedlogom specijalisticki, potvrda i dalje prolazi', () => {
    expect(checkoutMismatch('diplomski', { words: 25_000, titleMarker: 'specialist' }, false)).toEqual({ block: true, suggestedWorkType: 'specijalisticki' });
    expect(checkoutMismatch('diplomski', { words: 25_000, titleMarker: 'specialist' }, true)).toEqual({ block: false });
    // Ostale vrste doslovno kao prije kruga 3.
    expect(checkoutMismatch('diplomski', { words: 20_000, titleMarker: 'graduate' }, false)).toEqual({ block: false });
    expect(checkoutMismatch('seminarski', { words: 2000, titleMarker: 'graduate' }, false)).toMatchObject({ block: true });
  });
});

describe('nalaz 3: "promjena buduceg kataloga ne oduzima staro pravo" na mjestu koje pravo provodi', () => {
  it('kupljen Final Pass (180) ostaje 180 i kad katalog kasnije skrati prozor na 90', () => {
    const redak = { id: 'ent-pass', work_type: 'diplomski', status: 'active', slots_used: 0, slots_total: 1, purchase_expires_at: at(180), slot_window_days: 180, products: { slot_window_days: 90 } };
    const d = decideReportAccess({ now: NOW, workType: 'diplomski', fingerprint: rad, activeSlots: [], entitlements: entitlementRowsFromDb([redak]), recentGenerationCount: 0 });
    expect(d.decision).toBe('new_slot');
    if (d.decision === 'new_slot') expect(d.newSlot.slotExpiresAt).toBe(at(180));
  });

  it('i obrnuto: produljenje u katalogu ne mijenja staro pravo (pravo je ono kupljeno, ne danasnje)', () => {
    const redak = { id: 'ent-dok', work_type: 'doktorski', status: 'active', slots_used: 0, slots_total: 1, purchase_expires_at: at(120), slot_window_days: 14, products: { slot_window_days: 30 } };
    const [row] = entitlementRowsFromDb([redak]);
    expect(row.slotWindowDays).toBe(14);
  });

  it('stariji redak bez snapshota i dalje dobiva prozor svog proizvoda (npr. do_obrane 120)', () => {
    const redak = { id: 'ent-old', work_type: 'zavrsni', status: 'active', slots_used: 0, slots_total: 1, purchase_expires_at: at(60), slot_window_days: null, products: { slot_window_days: 120 } };
    expect(entitlementRowsFromDb([redak])[0].slotWindowDays).toBe(120);
  });
});
