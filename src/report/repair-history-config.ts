/**
 * Konfiguracija povijesti popravaka, IZDVOJENA u vlastiti modul bez ijedne ovisnosti.
 *
 * Zasto ne stoji uz `fetchRepairJobs` u `repair-history.ts`: `app.ts` taj modul ucitava LIJENO
 * (`import('../report/repair-history')`), da klijent za povijest ne udje u glavni chunk. Staticki
 * uvoz radi jedne male funkcije ponistio bi tu odluku i porastao bi bundle, sto `bundleSizeGuard`
 * s pravom hvata.
 *
 * Do 2026-09-04 je izvedba stajala unutar `app.ts`, pa bi je svaka nova ruta morala prepisati.
 * Staza `delete-repair-job` se IZVODI iz projektnog URL-a i nema vlastitu postavku.
 */

export interface RepairHistoryConfig {
  /** Supabase projekt URL (za PostgREST + Storage sign). */
  supabaseUrl: string;
  /** Supabase anon kljuc (apikey gate; RLS + user JWT rade autorizaciju). */
  anonKey: string;
  /** URL delete-repair-job Edge Functiona; prazno znaci brisanje nije konfigurirano. */
  deleteEndpoint: string;
}

export function repairHistoryConfigFrom(config: {
  supabaseUrl?: unknown; supabaseAnonKey?: unknown;
} | null | undefined): RepairHistoryConfig {
  const supabaseUrl = String(config?.supabaseUrl ?? '').trim();
  return {
    supabaseUrl,
    anonKey: String(config?.supabaseAnonKey ?? '').trim(),
    deleteEndpoint: supabaseUrl ? `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/delete-repair-job` : '',
  };
}
