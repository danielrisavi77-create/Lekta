/**
 * Klijentski katalog proizvoda (MONETIZATION_PLAN.md sekcije 2, 5, 15 korak 2).
 *
 * Jedina istina o cijenama je tablica `products` (migracija 0002). Klijent NE hardkodira
 * cijene: paywall ih cita iz baze pa promjena `price_eur` mijenja prikaz bez deploya
 * (kriterij 14.2). Citanje ide preko PostgREST-a obicnim `fetch`-om (RLS dopusta anon
 * SELECT uz active=true), bez uvodenja supabase-js u klijentski bundle. `fetch` je
 * injektabilan radi testabilnosti.
 */

export type ProductKind = 'slot' | 'pass' | 'bundle' | 'premium_human';
export type ProductAudience = 'retail' | 'partner';

export interface Product {
  id: string;
  kind: ProductKind;
  audience: ProductAudience;
  workType: string | null;
  slotsTotal: number;
  slotWindowDays: number;
  purchaseWindowDays: number;
  priceEur: number;
  morProductId: string | null;
  manualFulfillment: boolean;
  active: boolean;
  sort: number;
}

/** Redak iz PostgREST-a (snake_case, netipizirana granica) -> tipizirani Product. */
export function mapProductRow(row: Record<string, unknown>): Product {
  const audience = row.audience === 'partner' ? 'partner' : 'retail';
  const kind = row.kind as ProductKind;
  return {
    id: String(row.id ?? ''),
    kind,
    audience,
    workType: row.work_type == null ? null : String(row.work_type),
    slotsTotal: Number(row.slots_total ?? 1),
    slotWindowDays: Number(row.slot_window_days ?? 7),
    purchaseWindowDays: Number(row.purchase_window_days ?? 90),
    priceEur: Number(row.price_eur ?? 0),
    morProductId: row.mor_product_id == null ? null : String(row.mor_product_id),
    manualFulfillment: row.manual_fulfillment === true,
    active: row.active !== false,
    sort: Number(row.sort ?? 0),
  };
}

export interface CatalogConfig {
  /** Supabase projekt URL; prazno znaci katalog nije konfiguriran. */
  supabaseUrl: string;
  /** Supabase anon (public) kljuc; smije u klijent, RLS stiti pisanje. */
  anonKey: string;
}

/**
 * Ucitaj AKTIVNE RETAIL proizvode za paywall, sortirane po `sort`.
 * Baca gresku na neuspjeh (paywall tada zadrzava fallback prikaz).
 */
export async function fetchRetailCatalog(
  config: CatalogConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<Product[]> {
  if (!config.supabaseUrl || !config.anonKey) throw new Error('katalog nije konfiguriran');
  const url =
    `${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1/products` +
    `?select=*&active=eq.true&audience=eq.retail&order=sort.asc`;
  const res = await fetchImpl(url, {
    headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` },
  });
  if (!res.ok) throw new Error(`catalog fetch ${res.status}`);
  const rows = (await res.json()) as unknown;
  return Array.isArray(rows) ? rows.map((r) => mapProductRow(r as Record<string, unknown>)) : [];
}

/** Prikaz cijene u EUR, hrvatski zapis (zarez, dvije decimale). */
export function formatPriceEur(priceEur: number): string {
  return `${priceEur.toFixed(2).replace('.', ',')} EUR`;
}
