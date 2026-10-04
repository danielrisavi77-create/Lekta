import type { OpportunityStats, OpportunityRow } from './admin-types';
import { opportunityMeasurementHealth, rankOpportunityRows, strongestMeasuredOpportunity } from './opportunity-ranking';
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

const NOOP_META: Record<string, { label: string; class: string }> = {
  'invalid-params': { label: 'Neispravan zahtjev motora', class: 'bug' },
  'stale-anchor': { label: 'Sidro se promijenilo', class: 'reliability' },
  'unsupported-structure': { label: 'Nepodržana struktura', class: 'capability' },
  'no-target': { label: 'Meta nije pronađena', class: 'inspect' },
  'unclassified': { label: 'Neklasificirani razlog', class: 'instrumentation' },
  'already-ok': { label: 'Već je usklađeno', class: 'benign' },
};

function opportunityLabel(row: OpportunityRow): string {
  return LABELS[row.id] ?? row.id;
}

function scopeLabel(row: { profileId?: string; workType?: string }): string {
  return `${row.profileId || 'unknown'} · ${row.workType || 'unknown'}`;
}

export function renderOpportunitiesSection(container: HTMLElement, stats: OpportunityStats): void {
  container.replaceChildren();
  const s = seriesColors();
  const bento = el('div', 'bento');

  const ranked = rankOpportunityRows(stats.current.opportunities);
  const strongest = strongestMeasuredOpportunity(ranked);
  const health = opportunityMeasurementHealth(stats.current);
  const delta = (n: number) => `${n >= 0 ? '+' : ''}${n}`;

  // Rang signala ovisi o zdravlju ANALITIKE; zdrava repair telemetrija bez ijedne analize ne daje
  // "najjaci signal". Prazan nazivnik je prazno stanje, nikad 0 % (Codex V3-03 na #163).
  const hero = heroCard({
    label: !strongest
      ? 'Nema izmjerenog signala'
      : health.kind === 'partial'
        ? 'Privremeni signal · mjerenje nepotpuno'
        : 'Najjači izmjereni signal',
    value: strongest?.ratePct ?? 0,
    render: (n) => strongest ? fmtPct(n, 1) : '—',
    sub: strongest
      ? `${opportunityLabel(strongest)} · ${fmtCount(strongest.affected)}/${fmtCount(strongest.denominator)} opažanja`
      : 'Nijedna prilika nema nazivnik u odabranom razdoblju.',
  });
  hero.classList.add('c12');
  bento.appendChild(hero);

  const healthCard = el('div', 'card c12 rise');
  healthCard.appendChild(el('div', 'card-title', 'Zdravlje mjerenja'));
  const analysisText = health.analysis === 'healthy'
    ? `Analiza: exact parity, analysis_completed ${fmtCount(stats.current.analysisCompletedEvents)} = opportunity_summary ${fmtCount(stats.current.opportunityEvents)}; structure summary ${fmtCount(stats.current.structureGapItems)} = breakdown ${fmtCount(stats.current.structureBreakdownItems)}, i po profilu i vrsti rada.`
    : health.analysis === 'no-data'
      ? 'Analiza: nema baznih analiza u odabranom razdoblju.'
      : `Analiza: mjerenje je nepotpuno, analysis parity Δ ${delta(health.analysisDelta)}; structure parity Δ ${delta(health.structureDelta)}.`;
  const repairText = health.repair === 'healthy'
    ? `Repair: exact parity, repair_result_ok ${fmtCount(stats.current.repairAttemptEvents)} = repair_noop_summary ${fmtCount(stats.current.repairNoOpSummaryEvents)}; no-op summary ${fmtCount(stats.current.repairNoOpSummaryItems)} = breakdown ${fmtCount(stats.current.repairNoOpItems)}, i po profilu i vrsti rada.`
    : health.repair === 'no-data'
      ? 'Repair: nema V3 repair telemetrije u odabranom razdoblju.'
      : `Repair: mjerenje je nepotpuno, summary prema rezultatima Δ ${delta(health.repairAttemptDelta)}; no-op parity Δ ${delta(health.repairNoOpDelta)}.`;
  healthCard.appendChild(el('p', 'hint', analysisText));
  healthCard.appendChild(el('p', 'hint', repairText));
  if (health.scopeMismatches > 0) {
    const scopes = stats.current.scopeParityMismatches
      .map((m) => `${m.surface}: ${scopeLabel(m)} ${fmtCount(m.summary)}≠${fmtCount(m.breakdown)}`)
      .join('; ');
    healthCard.appendChild(el('p', 'hint', `Parity po obuhvatu ne odgovara (${fmtCount(health.scopeMismatches)}): ${scopes}. Tablice ispod mogu pripisati preskok krivom profilu dok se to ne vrati na nulu.`));
  }
  bento.appendChild(healthCard);

  const tile1 = statTile({
    label: 'Opportunity eventi',
    icon: 'file',
    hue: s[0],
    value: stats.current.opportunityEvents,
    render: fmtCount,
    delta: computeDelta(stats.current.opportunityEvents, stats.previous.opportunityEvents, 'neutral'),
    note: 'anonimni uzorak s privolom',
  });
  tile1.classList.add('c3');
  bento.appendChild(tile1);

  const tile2 = statTile({
    label: 'Manual gap',
    icon: 'warn',
    hue: s[1],
    value: stats.current.manualAnalyses,
    render: fmtCount,
    delta: computeDelta(stats.current.manualAnalyses, stats.previous.manualAnalyses, 'down'),
    note: 'analize s barem jednim manual nalazom',
  });
  tile2.classList.add('c3');
  bento.appendChild(tile2);

  const tile3 = statTile({
    label: 'Nemjerljivo',
    icon: 'inbox',
    hue: s[2],
    value: stats.current.unmeasurableAnalyses,
    render: fmtCount,
    delta: computeDelta(stats.current.unmeasurableAnalyses, stats.previous.unmeasurableAnalyses, 'down'),
    note: 'analize s barem jednom unmeasurable provjerom',
  });
  tile3.classList.add('c3');
  bento.appendChild(tile3);

  const tile4 = statTile({
    label: 'Repair gap',
    icon: 'wrench',
    hue: s[3],
    value: stats.current.repairGapRuns,
    render: fmtCount,
    delta: computeDelta(stats.current.repairGapRuns, stats.previous.repairGapRuns, 'down'),
    note: `${fmtCount(stats.current.repairUnresolvedChecks)} ciljnih provjera ostalo otvoreno`,
  });
  tile4.classList.add('c3');
  bento.appendChild(tile4);

  const structureColumns: Array<Column<(typeof stats.current.structureGaps)[number]>> = [
    { header: 'Profil · vrsta', render: (r) => scopeLabel(r) },
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
    { header: 'Profil · vrsta', render: (r) => scopeLabel(r) },
    { header: 'Razlog fixera', render: (r) => NOOP_META[r.kind]?.label ?? r.kind },
    { header: 'Razred', render: (r) => NOOP_META[r.kind]?.class ?? 'unknown' },
    { header: 'Broj', numeric: true, render: (r) => fmtCount(r.count) },
  ];
  const noOpTable = dataTable(
    'Ishodi preskočenih fixera',
    `Ukupno ${fmtCount(stats.current.repairNoOpItems)} klasificiranih preskoka; "već je usklađeno" je benign ishod, ne razvojni kvar.`,
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
