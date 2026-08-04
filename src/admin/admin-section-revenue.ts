/**
 * Revenue: hero + KPI + dnevni trend (s oznakama promjene cijene) + raspodjela po proizvodu.
 * Neto je PROCJENA (feeAssumptions.verified je uvijek false) i sucelje to mora reci glasno:
 * MoR naknada nije potvrdjena ugovorom, pa se broj ne smije koristiti za izvjestavanje.
 */

import type { RevenueStats } from './admin-types';
import {
  el, heroCard, statTile, trend, donut, dataTable, icon, computeDelta, seriesColors,
  fmtCount, fmtEur, fmtEur0, type Column, type TrendMarker,
} from './admin-charts';

const WORK_TYPE: Record<string, string> = {
  seminarski: 'Seminarski', zavrsni: 'Završni', diplomski: 'Diplomski', doktorski: 'Doktorski',
};

export function renderRevenueSection(container: HTMLElement, stats: RevenueStats): void {
  container.replaceChildren();
  const s = seriesColors();
  const bento = el('div', 'bento');
  container.appendChild(bento);

  const dGross = computeDelta(stats.current.grossEur, stats.previous.grossEur, 'up');
  const hero = heroCard({
    label: 'Bruto prihod · odabrano razdoblje',
    value: stats.current.grossEur,
    render: fmtEur,
    sub: `prethodno ${fmtEur(stats.previous.grossEur)}`,
    delta: dGross,
    spark: stats.trend.length > 1 ? stats.trend.map((t) => t.grossEur) : undefined,
  });
  hero.classList.add('c4');
  bento.appendChild(hero);

  const t1 = statTile({
    label: 'Kupnje', icon: 'cart', hue: s[2], value: stats.current.purchaseCount, render: fmtCount,
    delta: computeDelta(stats.current.purchaseCount, stats.previous.purchaseCount, 'up'),
    note: stats.current.purchaseCount ? `prosjek ${fmtEur(stats.current.grossEur / stats.current.purchaseCount)}` : undefined,
  });
  t1.classList.add('c4');
  const t2 = statTile({
    label: 'Povrati', icon: 'bell', hue: s[5], value: stats.current.refundCount, render: fmtCount,
    delta: computeDelta(stats.current.refundCount, stats.previous.refundCount, 'down'),
    note: fmtEur(stats.current.refundsEur),
  });
  t2.classList.add('c4');
  bento.append(t1, t2);

  const t3 = statTile({
    label: 'Neto (procjena)', icon: 'euro', hue: s[7], value: stats.current.estimatedNetAfterMorFeeEur, render: fmtEur,
    delta: computeDelta(stats.current.estimatedNetAfterMorFeeEur, stats.previous.estimatedNetAfterMorFeeEur, 'up'),
    note: 'nije knjigovodstveno potvrđeno',
  });
  t3.classList.add('c4');
  bento.appendChild(t3);

  const calloutWrap = el('div', 'c8');
  const callout = el('div', 'callout rise');
  callout.appendChild(icon('warn'));
  const pctFee = (stats.feeAssumptions.morFeePct * 100).toFixed(0);
  callout.appendChild(el('span', undefined,
    `Neto iznos je procjena uz pretpostavljenu naknadu posrednika (${pctFee}% + ${fmtEur(stats.feeAssumptions.morFeeFixedEur)} po transakciji). `
    + 'Pretpostavka nije potvrđena ugovorom i ne smije se koristiti za izvještavanje.'));
  calloutWrap.appendChild(callout);
  bento.appendChild(calloutWrap);

  const points = stats.trend.map((p) => ({ label: p.date.slice(8) + '.' + p.date.slice(5, 7) + '.', full: p.date, value: p.grossEur }));
  const byDate = new Map(stats.trend.map((p, i) => [p.date, i]));
  const markers: TrendMarker[] = stats.priceChanges
    .map((pc) => ({
      index: byDate.get(pc.date) ?? -1,
      label: `Promjena cijene · ${pc.productId}${pc.oldValue && pc.newValue ? ` (${pc.oldValue} → ${pc.newValue})` : ''}`,
      legend: 'promjena cijene',
    }))
    .filter((m) => m.index >= 0);
  const tr = trend(
    'Prihod po danu',
    'Jedna serija na jednoj osi.',
    points,
    s[1],
    (n, axis) => (axis ? fmtEur0(n) : fmtEur(n)),
    'Bruto prihod po danu',
    markers,
  );
  tr.classList.add('c8');
  bento.appendChild(tr);

  const prod = stats.current.byProduct.slice(0, 6);
  const dn = donut(
    'Udio po proizvodu',
    'Bruto prihod u razdoblju.',
    prod.map((p, i) => ({ name: p.productId, value: Math.round(p.grossEur), color: s[i % s.length] })),
    'ukupno €',
    'Prihod po proizvodu',
  );
  dn.classList.add('c4');
  bento.appendChild(dn);

  const cols: Array<Column<RevenueStats['current']['byProduct'][number]>> = [
    { header: 'Proizvod', render: (r) => r.productId },
    { header: 'Kupnje', numeric: true, render: (r) => fmtCount(r.purchaseCount) },
    { header: 'Bruto', numeric: true, render: (r) => fmtEur(r.grossEur) },
    { header: 'Po kupnji', numeric: true, render: (r) => (r.purchaseCount ? fmtEur(r.grossEur / r.purchaseCount) : '—') },
  ];
  const table = dataTable('Po proizvodu', 'Bruto prihod i broj kupnji.', stats.current.byProduct, cols);
  table.classList.add('c12');
  bento.appendChild(table);

  if (stats.current.byWorkType.length) {
    const wtCols: Array<Column<RevenueStats['current']['byWorkType'][number]>> = [
      { header: 'Vrsta rada', render: (r) => WORK_TYPE[r.workType] ?? r.workType },
      { header: 'Kupnje', numeric: true, render: (r) => fmtCount(r.purchaseCount) },
      { header: 'Bruto', numeric: true, render: (r) => fmtEur(r.grossEur) },
    ];
    const wt = dataTable('Po vrsti rada', 'Raspodjela prihoda.', stats.current.byWorkType, wtCols);
    wt.classList.add('c12');
    bento.appendChild(wt);
  }
}
