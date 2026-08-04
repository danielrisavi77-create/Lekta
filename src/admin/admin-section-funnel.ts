/**
 * Funnel: puni korak-po-korak prikaz + usporedba s prethodnim razdobljem.
 * basis je uvijek "event_count" - analytics_events nema session identifikator, pa ovo NIJE
 * deduplicirani funnel po posjetitelju i sucelje to mora reci, ne sakriti.
 */

import type { FunnelStats } from './admin-types';
import { el, funnel, dataTable, deltaBadge, computeDelta, fmtCount, type Column } from './admin-charts';

const LABELS: Record<string, string> = {
  landing_view: 'Posjet stranice',
  analyzer_engaged: 'Otvoren analizator',
  file_selected: 'Odabrana datoteka',
  analysis_started: 'Analiza pokrenuta',
  analysis_completed: 'Analiza završena',
  paywall_viewed: 'Prikazan paywall',
  checkout_started: 'Checkout otvoren',
  purchase_completed: 'Kupnja dovršena',
};
const label = (e: string): string => LABELS[e] ?? e;

interface Row { name: string; cur: number; prev: number }

export function renderFunnelSection(container: HTMLElement, stats: FunnelStats): void {
  container.replaceChildren();
  const bento = el('div', 'bento');
  container.appendChild(bento);

  const hint = el('div', 'c12');
  hint.appendChild(el('p', 'hint',
    'Brojanje neovisnih događaja (basis: event_count). analytics_events ne sadrži identifikator '
    + 'sesije, pa ovo nije deduplicirani funnel po posjetitelju nego koliko je puta svaki korak okinut.'));
  bento.appendChild(hint);

  const steps = stats.current.map((s) => ({ name: label(s.event), value: s.count }));
  const fn = funnel('Lijevak konverzije', 'Odabrano razdoblje.', steps, 'Lijevak konverzije');
  fn.classList.add('c7');
  bento.appendChild(fn);

  const prevBy = new Map(stats.previous.map((s) => [s.event, s.count]));
  const rows: Row[] = stats.current.map((s) => ({ name: label(s.event), cur: s.count, prev: prevBy.get(s.event) ?? 0 }));

  const ratios = rows.slice(0, -1).map((r, i) => ({
    name: `${r.name} → ${rows[i + 1].name}`,
    value: r.cur > 0 ? (rows[i + 1].cur / r.cur) * 100 : 0,
  }));
  const ratioCard = dataTable<{ name: string; value: number }>(
    'Prijelaz između koraka',
    'Postotak koji prijeđe u sljedeći korak.',
    ratios,
    [
      { header: 'Prijelaz', render: (r) => r.name },
      { header: 'Prolaz', numeric: true, render: (r) => `${r.value.toFixed(1).replace('.', ',')}%` },
    ],
  );
  ratioCard.classList.add('c5');
  bento.appendChild(ratioCard);

  const cols: Array<Column<Row>> = [
    { header: 'Korak', render: (r) => r.name },
    { header: 'Tekuće', numeric: true, render: (r) => fmtCount(r.cur) },
    { header: 'Prethodno', numeric: true, render: (r) => fmtCount(r.prev) },
    { header: 'Promjena', numeric: true, render: (r) => deltaBadge(computeDelta(r.cur, r.prev, 'up')) },
  ];
  const table = dataTable('Usporedba s prethodnim razdobljem', 'Isti koraci, prethodni prozor jednake duljine.', rows, cols);
  table.classList.add('c12');
  bento.appendChild(table);

  const ret = stats.retention.find((r) => r.table === 'analytics_events');
  if (ret) {
    const note = el('div', 'c12');
    note.appendChild(el('p', 'hint', ret.note));
    bento.appendChild(note);
  }
}
