/**
 * Lekta Control Center: cisti transformi (API JSON -> render-spreman oblik), bez DOM-a.
 * Dijeljena logika kroz svih 6 sekcija zivi ovdje (delta izmedju current/previous, formatiranje);
 * po-sekcijska logika zivi u admin-section-*.ts uz odgovarajuci render modul.
 */

import { fmt } from '../utils/helpers';

export type GoodDirection = 'up' | 'down' | 'neutral';

export interface Delta {
  /** Postotna promjena; null kad prethodni prozor nema osnovicu (0) pa je postotak besmislen. */
  pct: number | null;
  direction: 'up' | 'down' | 'flat';
  /** Je li smjer DOBAR za posao - ovisi o metrici (npr. vise korisnika=dobro, vise gresaka=lose), ne o sirovom predznaku. */
  sentiment: 'good' | 'bad' | 'neutral';
}

const FLAT_THRESHOLD_PCT = 1;

/**
 * current/previous -> Delta. `goodDirection` kaze smjer koji je pozitivan za tu konkretnu
 * metriku (default 'up': vise je bolje). Ispod praga od 1 postotnog boda smatra se ravnim
 * (neutralno), ne slucajni sum prikazan kao trend.
 */
export function computeDelta(current: number, previous: number, goodDirection: GoodDirection = 'up'): Delta {
  if (previous === 0) {
    if (current === 0) return { pct: null, direction: 'flat', sentiment: 'neutral' };
    const sentiment = goodDirection === 'neutral' ? 'neutral' : goodDirection === 'up' ? 'good' : 'bad';
    return { pct: null, direction: 'up', sentiment };
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < FLAT_THRESHOLD_PCT) return { pct, direction: 'flat', sentiment: 'neutral' };
  const direction: 'up' | 'down' = pct > 0 ? 'up' : 'down';
  const sentiment = goodDirection === 'neutral' ? 'neutral' : direction === goodDirection ? 'good' : 'bad';
  return { pct, direction, sentiment };
}

/** Delta -> kratki hrvatski tekst za prikaz uz KPI kariticu ("+18,7%", "novo", "—"). */
export function formatDeltaPct(delta: Delta): string {
  if (delta.pct === null) return delta.direction === 'up' ? 'novo' : '—';
  const sign = delta.pct > 0 ? '+' : delta.pct < 0 ? '−' : '';
  return `${sign}${Math.abs(delta.pct).toFixed(1).replace('.', ',')}%`;
}

/** Cijeli broj, hrvatski tisucni razdjelnik (dijeli fmt s ostatkom app-a, ne izmisljen ovdje). */
export function formatCount(n: number | undefined | null): string {
  return fmt(n ?? 0);
}

/** EUR iznos, hrvatski decimalni zarez, dvije decimale. */
export function formatEur(n: number | undefined | null): string {
  const v = Number(n ?? 0);
  return `${v.toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** Hrvatski postotak, jedna decimala, crtica za null (npr. konverzija bez osnovice). */
export function formatPct(n: number | undefined | null, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n.toFixed(digits).replace('.', ',')}%`;
}
