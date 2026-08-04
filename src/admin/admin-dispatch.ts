/**
 * Lekta Control Center: tijelo POST zahtjeva -> koja RPC funkcija i s kojim parametrima.
 *
 * Izomorfno, dijeli se s Edge funkcijom `admin-stats` (vidi supabase/functions/admin-stats/
 * index.ts) - JWT+admin_users provjera ostaje TAMO nepromijenjena, ovaj modul samo odlucuje
 * KOJU rpc pozvati nakon sto je pozivatelj vec dokazano admin. Ovdje se validira allowlista
 * `view`-a, raspon (preko admin-range.ts) i sitni per-view parametri (funnel eventi, coverage
 * limit) - nikad se ne vjeruje sirovom tijelu dalje od toga.
 *
 * VAZNO: p_events/p_limit se dodaju u rpcParams SAMO kad ih pozivatelj posalje, nikad kao
 * `null` - PostgREST .rpc() primjenjuje SQL DEFAULT samo kad kljuc IZOSTAJE iz params objekta,
 * ne kad je eksplicitno null.
 */

import { resolveAdminRange, isAdminRangeError, type AdminRange } from './admin-range.ts';

export type AdminView = 'overview' | 'funnel' | 'revenue' | 'operations' | 'usage' | 'coverage';

export interface AdminRpcCall {
  /** undefined = legacy prazno tijelo, stari admin_beta_stats() put (admin-panel.ts, nepromijenjeno). */
  view?: AdminView;
  rpcName: string;
  rpcParams: Record<string, unknown>;
}

export type AdminDispatchErrorCode = 'bad_view' | 'bad_range' | 'bad_events' | 'bad_limit' | 'range_too_large';

export interface AdminDispatchError {
  error: AdminDispatchErrorCode;
}

const VIEW_RPC: Record<AdminView, string> = {
  overview: 'admin_overview_stats',
  funnel: 'admin_funnel_stats',
  revenue: 'admin_revenue_stats',
  operations: 'admin_operations_stats',
  usage: 'admin_usage_stats',
  coverage: 'admin_coverage_stats',
};

const VALID_VIEWS = new Set<string>(Object.keys(VIEW_RPC));
const VALID_RANGES = new Set<string>(['today', '7d', '30d', 'custom']);
const EVENT_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_FUNNEL_EVENTS = 12;
const MIN_COVERAGE_LIMIT = 1;
const MAX_COVERAGE_LIMIT = 200;

export function buildAdminRpcCall(body: unknown): AdminRpcCall | AdminDispatchError {
  const b: Record<string, unknown> = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  // Legacy: tijelo bez `view` (ukljucujuci golo `{}`) -> nepromijenjen stari put.
  if (b.view === undefined) {
    return { rpcName: 'admin_beta_stats', rpcParams: {} };
  }

  if (typeof b.view !== 'string' || !VALID_VIEWS.has(b.view)) return { error: 'bad_view' };
  const view = b.view as AdminView;

  // Bez eksplicitnog range-a, razuman default (isto sto bi UI otvorio prvi put).
  const rangeKind = typeof b.range === 'string' ? b.range : '7d';
  if (!VALID_RANGES.has(rangeKind)) return { error: 'bad_range' };

  const resolved = resolveAdminRange(rangeKind as AdminRange, {
    fromDate: typeof b.from === 'string' ? b.from : undefined,
    toDate: typeof b.to === 'string' ? b.to : undefined,
  });
  if (isAdminRangeError(resolved)) return resolved;

  const rpcParams: Record<string, unknown> = { p_from: resolved.from, p_to: resolved.to };

  if (view === 'funnel' && b.events !== undefined) {
    const events = b.events;
    const valid =
      Array.isArray(events) &&
      events.length > 0 &&
      events.length <= MAX_FUNNEL_EVENTS &&
      events.every((e) => typeof e === 'string' && EVENT_NAME_RE.test(e));
    if (!valid) return { error: 'bad_events' };
    rpcParams.p_events = events;
  }

  if (view === 'coverage' && b.limit !== undefined) {
    const limit = Number(b.limit);
    if (!Number.isInteger(limit) || limit < MIN_COVERAGE_LIMIT || limit > MAX_COVERAGE_LIMIT) return { error: 'bad_limit' };
    rpcParams.p_limit = limit;
  }

  return { view, rpcName: VIEW_RPC[view], rpcParams };
}
