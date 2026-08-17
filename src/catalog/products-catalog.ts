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

/**
 * Redak iz PostgREST-a (snake_case, netipizirana granica) -> tipizirani Product.
 *
 * FAIL-CLOSED NA CIJENI I IDENTITETU (audit CODE-06). Prije su svi fallbackovi isli u smjeru
 * "pretpostavi da je u redu": `price_eur ?? 0` i `active: row.active !== false`. Redak s
 * nedostajucom ili neispravnom cijenom time je postajao AKTIVAN proizvod od 0 EUR, dakle nesto
 * sto se moze prodati besplatno, i to bez ijedne greske. Isto za redak bez `id`.
 *
 * Takav redak se sada oznacava kao NEAKTIVAN umjesto da se odbaci cijeli katalog: jedan pokvaren
 * proizvod ne smije srusiti paywall za sve ostale, ali se ni ne smije prodavati.
 */
export function mapProductRow(row: Record<string, unknown>): Product {
  const audience = row.audience === 'partner' ? 'partner' : 'retail';
  const kind = row.kind as ProductKind;
  const id = String(row.id ?? '');
  // Number(null) je 0 i Number('') je 0, pa se nedostajuca cijena mora prepoznati PRIJE konverzije.
  const rawPrice = row.price_eur;
  const priceEur = rawPrice == null || rawPrice === '' ? Number.NaN : Number(rawPrice);
  const priceUsable = Number.isFinite(priceEur) && priceEur >= 0;
  return {
    id,
    kind,
    audience,
    workType: row.work_type == null ? null : String(row.work_type),
    slotsTotal: Number(row.slots_total ?? 1),
    slotWindowDays: Number(row.slot_window_days ?? 7),
    purchaseWindowDays: Number(row.purchase_window_days ?? 90),
    priceEur: priceUsable ? priceEur : 0,
    morProductId: row.mor_product_id == null ? null : String(row.mor_product_id),
    manualFulfillment: row.manual_fulfillment === true,
    active: row.active !== false && priceUsable && id !== '',
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
  // Odgovor koji NIJE niz je greska, ne prazan katalog (audit CODE-07). Prije se tiho vracao `[]`,
  // pa je pogresna konfiguracija ili PostgREST greska izgledala identicno kao "nema proizvoda u
  // ponudi": paywall bi prikazao prazno stanje umjesto da padne na fallback prikaz.
  if (!Array.isArray(rows)) throw new Error('catalog fetch: odgovor nije niz proizvoda');
  return rows.map((r) => mapProductRow(r as Record<string, unknown>));
}

/** Prikaz cijene u EUR, hrvatski zapis (zarez, dvije decimale). */
export function formatPriceEur(priceEur: number): string {
  return `${priceEur.toFixed(2).replace('.', ',')} EUR`;
}
