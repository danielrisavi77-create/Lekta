import type { OpportunityStats, OpportunityRow } from './admin-types';
import { opportunityMeasurementHealth, rankOpportunityRows } from './opportunity-ranking';
import {
  el, heroCard, statTile, dataTable, computeDelta, seriesColors,
  fmtCount, fmtPct, type Column,
} from './admin-charts';

const LABELS: Record<string, string> = {
  manual_gap: 'Analize s ručnim nalazima',
  unmeasurable_gap: 'Analize s nemjerljivim provjerama',
  structure_gap: 'Analize s poznatim strukturnim preskokom',
  profile_not_verified: 'Potvrde profila bez verified statusa',
  repair_gap: 'Repair runovi s neriješenim ciljevima',
  paywall_checkout_gap_proxy: 'Paywall → checkout event-gap',
  checkout_purchase_gap_proxy: 'Checkout → kupnja event-gap',
};

const BASIS: Record<string, string> = {
  analysis_event: 'analize s privolom',
  profile_event: 'potvrde profila s privolom',
  repair_event: 'provjereni repair runovi s privolom',
  event_count_proxy: 'broj anonimnih događaja, nije cohort',
};

function opportunityLabel(row: OpportunityRow): string {
  return LABELS[row.id] ?? row.id;
}

export function renderOpportunitiesSection(container: HTMLElement, stats: OpportunityStats): void {
  container.replaceChildren();
  const s = seriesColors();
  const bento = el('div', 'bento');

  const ranked = rankOpportunityRows(stats.current.opportunities);
  const strongest = ranked[0];
  const health = opportunityMeasurementHealth(stats.current);

  bento.appendChild(heroCard({
    label: 'Najjači izmjereni signal',
    value: strongest?.ratePct ?? 0,
    render: (n) => fmtPct(n, 1),
    sub: strongest
      ? `${opportunityLabel(strongest)} · ${fmtCount(strongest.affected)}/${fmtCount(strongest.denominator)} opažanja`
      : 'Nema dovoljno podataka u odabranom razdoblju.',
  }));

  const healthCard = el('div', 'card c12 rise');
  healthCard.appendChild(el('div', 'card-title', 'Zdravlje mjerenja'));
  const healthText = health.kind === 'healthy'
    ? `Exact parity: analysis_completed ${fmtCount(stats.current.analysisCompletedEvents)} = opportunity_summary ${fmtCount(stats.current.opportunityEvents)}; structure summary ${fmtCount(stats.current.structureGapItems)} = breakdown ${fmtCount(stats.current.structureBreakdownItems)}.`
    : health.kind === 'no-data'
      ? 'Nema baznih analiza u odabranom razdoblju; report nema što potvrditi.'
      : `Mjerenje je nepotpuno: analysis parity Δ ${health.analysisDelta >= 0 ? '+' : ''}${health.analysisDelta}; structure parity Δ ${health.structureDelta >= 0 ? '+' : ''}${health.structureDelta}. Rangiranje koristi nepotpun uzorak dok se parity ne vrati na nulu.`;
  healthCard.appendChild(el('p', 'hint', healthText));
  bento.appendChild(healthCard);

  bento.appendChild(statTile({
    label: 'Opportunity eventi',
    icon: 'file',
    hue: s[0],
    value: stats.current.opportunityEvents,
    render: fmtCount,
    delta: computeDelta(stats.current.opportunityEvents, stats.previous.opportunityEvents, 'neutral'),
    note: 'anonimni uzorak s privolom',
  }));

  bento.appendChild(statTile({
    label: 'Manual gap',
    icon: 'warn',
    hue: s[1],
    value: stats.current.manualAnalyses,
    render: fmtCount,
    delta: computeDelta(stats.current.manualAnalyses, stats.previous.manualAnalyses, 'down'),
    note: 'analize s barem jednim manual nalazom',
  }));

  bento.appendChild(statTile({
    label: 'Nemjerljivo',
    icon: 'inbox',
    hue: s[2],
    value: stats.current.unmeasurableAnalyses,
    render: fmtCount,
    delta: computeDelta(stats.current.unmeasurableAnalyses, stats.previous.unmeasurableAnalyses, 'down'),
    note: 'analize s barem jednom unmeasurable provjerom',
  }));

  bento.appendChild(statTile({
    label: 'Repair gap',
    icon: 'wrench',
    hue: s[3],
    value: stats.current.repairGapRuns,
    render: fmtCount,
    delta: computeDelta(stats.current.repairGapRuns, stats.previous.repairGapRuns, 'down'),
    note: `${fmtCount(stats.current.repairUnresolvedChecks)} ciljnih provjera ostalo otvoreno`,
  }));

  const structureColumns: Array<Column<(typeof stats.current.structureGaps)[number]>> = [
    { header: 'Podsustav', render: (r) => r.category ?? '—' },
    { header: 'Razlog', render: (r) => r.kind },
    { header: 'Broj', numeric: true, render: (r) => fmtCount(r.count) },
  ];
  const structureTable = dataTable(
    'Gdje analiza preskače strukturu',
    `Ukupno ${fmtCount(stats.current.structureGapItems)} zabilježenih preskoka u poznatim strukturiranim analizatorima.`,
    stats.current.structureGaps,
    structureColumns,
  );
  structureTable.classList.add('c6');
  bento.appendChild(structureTable);

  const noOpColumns: Array<Column<(typeof stats.current.repairNoOpReasons)[number]>> = [
    { header: 'Razlog fixera', render: (r) => r.kind },
    { header: 'Broj', numeric: true, render: (r) => fmtCount(r.count) },
  ];
  const noOpTable = dataTable(
    'Zašto fixer odustaje',
    `Ukupno ${fmtCount(stats.current.repairNoOpItems)} klasificiranih no-op/preskočenih stavki.`,
    stats.current.repairNoOpReasons,
    noOpColumns,
  );
  noOpTable.classList.add('c6');
  bento.appendChild(noOpTable);

  const columns: Array<Column<(typeof ranked)[number]>> = [
    { header: 'Prilika', render: (r) => opportunityLabel(r) },
    { header: 'Zahvaćeno', numeric: true, render: (r) => fmtCount(r.affected) },
    { header: 'Uzorak', numeric: true, render: (r) => fmtCount(r.denominator) },
    { header: 'Udio', numeric: true, render: (r) => r.ratePct == null ? '—' : fmtPct(r.ratePct, 1) },
    { header: 'Osnova', render: (r) => `${BASIS[r.basis] ?? r.basis}${r.sample === 'low' ? ' · mali uzorak' : ''}` },
  ];
  const table = dataTable(
    'Rangirane prilike',
    'Redoslijed nije subjektivni score: izravna mjerenja prije proxyja, zatim dovoljni uzorci (n≥20), udio zahvaćenih i volumen.',
    ranked,
    columns,
  );
  table.classList.add('c12');
  bento.appendChild(table);

  const caveat = el('div', 'card c12 rise');
  caveat.appendChild(el('div', 'card-title', 'Granice dokaza'));
  caveat.appendChild(el(
    'p',
    'hint',
    'Opportunity Report vidi samo anonimne događaje korisnika koji su pristali na analitiku. Paywall/checkout razlike su event-count proxy, ne deduplicirani abandonment po korisniku ili sesiji.',
  ));
  if (stats.missingSignals.length) {
    caveat.appendChild(el(
      'p',
      'hint',
      `Još nije instrumentirano: ${stats.missingSignals.join(', ')}. To se ne prikazuje kao nula. Poznati structure skipovi iznad nisu isto što i potpuni inspectionCoverage cijelog OOXML paketa.`,
    ));
  }
  bento.appendChild(caveat);

  container.appendChild(bento);
}
