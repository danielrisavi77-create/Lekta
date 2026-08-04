/**
 * Overview: hero broj + KPI red + headline funnel.
 *
 * NAPOMENA o sparklineovima: admin_overview_stats() vraca samo tekuci i prethodni prozor,
 * bez dnevnog niza. Zato ovdje NEMA sparklinea - crtati ih znacilo bi izmisliti tijek koji
 * u podacima ne postoji. Dnevni niz postoji samo u Revenue (stats.trend) i tamo se koristi.
 */

import type { OverviewStats } from './admin-types';
import {
  el, heroCard, statTile, funnel, computeDelta, seriesColors,
  fmtCount, fmtEur, type GoodDirection, type IconName,
} from './admin-charts';

const FUNNEL_LABELS: Record<string, string> = {
  analyzer_engaged: 'Uključen analizator',
  analysis_completed: 'Završena analiza',
  checkout_started: 'Započet checkout',
  purchase_completed: 'Kupnja',
};

interface TileDef {
  key: keyof OverviewStats['current'];
  label: string;
  icon: IconName;
  slot: number;
  good: GoodDirection;
  render: (n: number) => string;
}

const TILES: TileDef[] = [
  { key: 'newUsers', label: 'Novi korisnici', icon: 'users', slot: 6, good: 'up', render: fmtCount },
  { key: 'analysesCompleted', label: 'Završene analize', icon: 'file', slot: 4, good: 'up', render: fmtCount },
  { key: 'purchasesCompleted', label: 'Kupnje', icon: 'cart', slot: 2, good: 'up', render: fmtCount },
  { key: 'newDocumentSlots', label: 'Novi slotovi', icon: 'slots', slot: 0, good: 'up', render: fmtCount },
  { key: 'repairJobsDone', label: 'Dovršeni popravci', icon: 'wrench', slot: 3, good: 'up', render: fmtCount },
  { key: 'facultyRequestsNew', label: 'Zahtjevi za fakultet', icon: 'bell', slot: 5, good: 'up', render: fmtCount },
  { key: 'refunds', label: 'Povrati', icon: 'euro', slot: 7, good: 'down', render: fmtCount },
];

export function renderOverviewSection(container: HTMLElement, stats: OverviewStats): void {
  container.replaceChildren();
  const s = seriesColors();
  const bento = el('div', 'bento');
  container.appendChild(bento);

  const revDelta = computeDelta(stats.current.grossRevenueEur, stats.previous.grossRevenueEur, 'up');
  const hero = heroCard({
    label: 'Bruto prihod · odabrano razdoblje',
    value: stats.current.grossRevenueEur,
    render: fmtEur,
    sub: `prethodno ${fmtEur(stats.previous.grossRevenueEur)}`,
    delta: revDelta,
  });
  hero.classList.add('c4', 'tall');
  bento.appendChild(hero);

  TILES.forEach((t) => {
    const cur = Number(stats.current[t.key] ?? 0);
    const prev = Number(stats.previous[t.key] ?? 0);
    const tile = statTile({
      label: t.label,
      icon: t.icon,
      hue: s[t.slot],
      value: cur,
      render: t.render,
      delta: computeDelta(cur, prev, t.good),
      note: `prethodno ${t.render(prev)}`,
    });
    tile.classList.add('c4');
    bento.appendChild(tile);
  });

  const steps = stats.current.headlineFunnel.map((f) => ({ name: FUNNEL_LABELS[f.event] ?? f.event, value: f.count }));
  const fn = funnel(
    'Put od posjeta do kupnje',
    'Brojanje neovisnih događaja — nije deduplicirano po posjetitelju.',
    steps,
    'Ključni koraci funnela',
  );
  fn.classList.add('c12');
  bento.appendChild(fn);
}
