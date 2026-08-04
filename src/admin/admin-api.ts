/**
 * Lekta Control Center: tipizirani fetch klijent prema admin-stats Edge funkciji (novi
 * {view,range,...} put). Isti obrazac kao src/admin/admin-stats.ts (fetchAdminStats): injektabilan
 * `fetch` za testabilnost, iste Croatian poruke za 401/403 da staro i novo sucelje nikad ne
 * divergiraju u tekstu.
 */

import type { Period, SectionId, SectionStatsMap } from './admin-types';

export interface AdminApiConfig {
  endpoint: string;
}

export type AdminApiResult<T> = { ok: true; stats: T } | { ok: false; message: string };

function periodToBody(period: Period): Record<string, unknown> {
  const body: Record<string, unknown> = { range: period.kind };
  if (period.kind === 'custom') {
    body.from = period.fromDate;
    body.to = period.toDate;
  }
  return body;
}

async function postAdmin<T>(
  cfg: AdminApiConfig,
  token: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<AdminApiResult<T>> {
  if (!cfg.endpoint) return { ok: false, message: 'admin endpoint nije konfiguriran' };
  if (!token) return { ok: false, message: 'potrebna je prijava' };
  try {
    const res = await fetchImpl(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.status === 401) return { ok: false, message: 'prijava je istekla, prijavi se ponovno' };
    if (res.status === 403) return { ok: false, message: 'ovaj račun nema administratorska prava' };
    if (res.status === 400) {
      const errBody = await res.json().catch(() => null as { error?: string } | null);
      return { ok: false, message: `neispravan zahtjev (${errBody?.error ?? res.status})` };
    }
    if (!res.ok) return { ok: false, message: `dohvat nije uspio (${res.status})` };
    const parsed = await res.json().catch(() => null);
    const stats = parsed && typeof parsed === 'object' ? (parsed as { stats?: T }).stats : null;
    if (!stats || typeof stats !== 'object') return { ok: false, message: 'nevaljan odgovor poslužitelja' };
    return { ok: true, stats };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'mrežna greška' };
  }
}

/**
 * Dohvati agregate za jednu sekciju. `extra` nosi per-view parametre (funnel: {events},
 * coverage: {limit}) - server ih tiho ignorira na viewovima koji ih ne koriste (vidi
 * admin-dispatch.ts), pa pozivatelj ne mora znati koji view sto prihvaca.
 */
export function fetchSectionStats<K extends SectionId>(
  view: K,
  cfg: AdminApiConfig,
  token: string,
  period: Period,
  extra: Record<string, unknown> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<AdminApiResult<SectionStatsMap[K]>> {
  return postAdmin<SectionStatsMap[K]>(cfg, token, { view, ...periodToBody(period), ...extra }, fetchImpl);
}
