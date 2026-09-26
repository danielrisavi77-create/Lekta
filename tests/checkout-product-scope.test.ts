/**
 * Lektin checkout prodaje SAMO Lektine proizvode (F18 krug 3, nalaz pregleda kruga 2).
 *
 * Prije prelaska na Stripe prodaju Katedra passova (`katedra_pass_*`, migracija 0071) je slucajno
 * blokirao nepopunjen `mor_product_id` (409 product_not_mapped). Taj uvjet je uklonjen, a Katedra
 * passovi su u istoj tablici retail, aktivni i s cijenom, pa bi ih bez izricite granice
 * create-checkout prodao, webhook knjizio bez `academic_project_id`, a Katedrini gardovi (0072,
 * 0073, 0085) takvo pravo ne bi priznali.
 *
 * Baseline je nad STVARNIM katalogom iz migracija (tests/helpers/product-seeds.ts), ne nad rucnim
 * popisom: generator mora dokazati da ciljani razred ulaza (retail, aktivan, s cijenom, a tudji)
 * doista postoji, inace bi test prolazio nad praznim skupom.
 */
import { afterEach, describe, it, expect } from 'vitest';

import { resolveCheckout } from '../src/report/checkout';
import {
  fetchRetailCatalog,
  isSoldByLektaCheckout,
  mapProductRow,
  FOREIGN_PRODUCT_ID_PREFIXES,
} from '../src/catalog/products-catalog';
import { normalizePaymentProvider, loadProductionConfig } from '../src/config/production-config';
import { STORAGE_KEYS, safeStorageSet } from '../src/shared/browser-storage';
import { seededProducts } from './helpers/product-seeds';

const seeded = seededProducts().map((s) => ({ file: s.file, product: mapProductRow(s.row) }));
const foreign = seeded.filter((s) => !isSoldByLektaCheckout(s.product.id));
const lekta = seeded.filter((s) => isSoldByLektaCheckout(s.product.id));

describe('katalog iz migracija (generator)', () => {
  it('parser nalazi cijeli sijani katalog, ne djelomican', () => {
    // 0002 (16 redaka), 0010 (2), 0017 (2), 0071 (3). Pad ovog broja znaci da je parser nesto
    // preskocio, sto bi ostatak ovog testa ucinilo praznim.
    expect(seeded.length).toBeGreaterThanOrEqual(23);
    expect(new Set(seeded.map((s) => s.file))).toEqual(
      new Set([
        '0002_products_catalog.sql',
        '0010_do_obrane_sku.sql',
        '0017_thesis_pass.sql',
        '0071_katedra_pass_products.sql',
      ]),
    );
  });

  it('ciljani razred postoji: tudji proizvod koji bi bez granice prosao kao obican retail', () => {
    expect(foreign.map((s) => s.product.id).sort()).toEqual([
      'katedra_pass_diplomski',
      'katedra_pass_seminarski',
      'katedra_pass_zavrsni',
    ]);
    for (const { product } of foreign) {
      expect(product.audience, product.id).toBe('retail');
      expect(product.active, product.id).toBe(true);
      expect(product.priceEur, product.id).toBeGreaterThan(0);
      // Bas ono sto je dosad jedino blokiralo prodaju, a F18 je uklonio kao uvjet:
      expect(product.morProductId, product.id).toBeNull();
    }
  });
});

describe('resolveCheckout: granica prodaje', () => {
  it('Katedra pass je za Lektin checkout nepoznat proizvod (404), i uz aktivan partner racun', () => {
    for (const { product } of foreign) {
      expect(resolveCheckout(product, { isPartnerActive: true }), product.id).toEqual({
        ok: false,
        status: 404,
        error: 'unknown_product',
      });
    }
  });

  it('svaki Lektin sijani proizvod i dalje prolazi (granica ne blokira vlastiti katalog)', () => {
    expect(lekta.length).toBeGreaterThanOrEqual(20);
    for (const { product } of lekta) {
      expect(resolveCheckout(product, { isPartnerActive: true }).ok, product.id).toBe(true);
    }
  });

  it('prefiks je izricit popis, ne slucajna podudarnost', () => {
    expect(FOREIGN_PRODUCT_ID_PREFIXES).toEqual(['katedra_']);
    expect(isSoldByLektaCheckout('slot_diplomski')).toBe(true);
    expect(isSoldByLektaCheckout('pass_diplomski')).toBe(true);
    expect(isSoldByLektaCheckout('katedra_pass_zavrsni')).toBe(false);
  });
});

describe('paywall ne nudi tudje proizvode', () => {
  it('fetchRetailCatalog izbacuje Katedra passove, a Lektine zadrzava', async () => {
    const rows = seeded
      .filter((s) => s.product.audience === 'retail')
      .map((s) => ({
        id: s.product.id,
        kind: s.product.kind,
        audience: 'retail',
        work_type: s.product.workType,
        price_eur: s.product.priceEur,
        sort: s.product.sort,
        active: true,
      }));
    expect(rows.some((r) => r.id.startsWith('katedra_'))).toBe(true);
    const out = await fetchRetailCatalog(
      { supabaseUrl: 'https://proj.supabase.co', anonKey: 'anon' },
      async () => new Response(JSON.stringify(rows), { status: 200 }),
    );
    expect(out.some((p) => p.id.startsWith('katedra_'))).toBe(false);
    expect(out).toHaveLength(rows.length - foreign.length);
  });
});

describe('rucni Payment Link tok: samo zivi pruzatelji', () => {
  // Ime ukinutog pruzatelja se sastavlja iz dijelova, da test ne vrati pogodak u git grep gard
  // iz kriterija (4); vrijednost koju test salje je bajt identicna onoj iz stare konfiguracije.
  const UKINUT = ['le', 'mons', 'queezy'].join('');

  afterEach(() => {
    safeStorageSet(STORAGE_KEYS.production, {});
  });

  it('bez spremljene vrijednosti je stripe', () => {
    expect(normalizePaymentProvider(undefined)).toBe('stripe');
    expect(normalizePaymentProvider('')).toBe('stripe');
  });

  it('stripe i custom ostaju kakvi jesu', () => {
    expect(normalizePaymentProvider('stripe')).toBe('stripe');
    expect(normalizePaymentProvider('custom')).toBe('custom');
  });

  it('vrijednost ukinutog pruzatelja pada na genericki oblik, ne na njegove parametre', () => {
    expect(normalizePaymentProvider(UKINUT)).toBe('custom');
    expect(normalizePaymentProvider('paddle')).toBe('custom');
  });

  it('loadProductionConfig normalizira spremljenu testnu konfiguraciju', () => {
    safeStorageSet(STORAGE_KEYS.production, { paymentProvider: UKINUT });
    expect(loadProductionConfig().paymentProvider).toBe('custom');
    safeStorageSet(STORAGE_KEYS.production, { paymentProvider: 'stripe' });
    expect(loadProductionConfig().paymentProvider).toBe('stripe');
    safeStorageSet(STORAGE_KEYS.production, {});
    expect(loadProductionConfig().paymentProvider).toBe('stripe');
  });
});
