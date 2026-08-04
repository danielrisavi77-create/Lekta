/**
 * Usage: pokrivenost po razini (T0..T3) + popravci po vrsti rada + presjek razina x vrsta.
 * Razine su POREDANE (T0 -> T3), pa nose jednu boju u nijansama (--t0..--t3), ne osam
 * razlicitih: boja tu kodira redoslijed, a ne identitet.
 */

import type { UsageStats } from './admin-types';
import { el, donut, barList, dataTable, tierColors, seriesColors, fmtCount, fmtPct, tag, type Column } from './admin-charts';

const WORK_TYPE: Record<string, string> = {
  seminarski: 'Seminarski', zavrsni: 'Završni', diplomski: 'Diplomski', doktorski: 'Doktorski',
};
const wt = (k: string): string => WORK_TYPE[k] ?? k;
const TIER_LABEL = ['T0 — nema profila', 'T1 — generički', 'T2 — izveden', 'T3 — službeni'];

interface CrossRow { workType: string; tier: number; count: number; share: number }

export function renderUsageSection(container: HTMLElement, stats: UsageStats): void {
  container.replaceChildren();
  const t = tierColors();
  const s = seriesColors();
  const bento = el('div', 'bento');
  container.appendChild(bento);

  const totals: number[] = [0, 0, 0, 0];
  stats.current.slotsByTierAndWorkType.forEach((r) => {
    const i = Math.min(3, Math.max(0, r.tier));
    totals[i] += r.count;
  });
  const grand = totals.reduce((a, b) => a + b, 0);

  const dn = donut(
    'Pokrivenost po razini',
    'Razine su poredane, pa nose jednu boju u nijansama — ne osam različitih.',
    totals.map((v, i) => ({ name: TIER_LABEL[i], value: v, color: t[i] })),
    'slotova',
    'Slotovi po razini pokrivenosti',
  );
  dn.classList.add('c5');
  bento.appendChild(dn);

  const repairs = stats.current.repairJobsByWorkType.map((r) => ({ name: wt(r.workType), value: r.count }));
  const bl = barList(
    'Popravci po vrsti rada',
    'Nominalne kategorije — jedna serija, jedna boja.',
    repairs, s[1], 'Popravci po vrsti rada', ['Vrsta rada', 'Broj'],
  );
  bl.classList.add('c7');
  bento.appendChild(bl);

  const rows: CrossRow[] = stats.current.slotsByTierAndWorkType
    .map((r) => ({ workType: wt(r.workType), tier: r.tier, count: r.count, share: grand ? (r.count / grand) * 100 : 0 }))
    .sort((a, b) => b.count - a.count);

  const cols: Array<Column<CrossRow>> = [
    { header: 'Vrsta rada', render: (r) => r.workType },
    {
      header: 'Razina',
      render: (r) => {
        const i = Math.min(3, Math.max(0, r.tier));
        const weak = i <= 1;
        return tag(`T${i}`, t[i], weak ? 'var(--warning-soft)' : 'var(--good-soft)', weak ? 'var(--warning)' : 'var(--good-ink)');
      },
    },
    { header: 'Slotovi', numeric: true, render: (r) => fmtCount(r.count) },
    { header: 'Udio', numeric: true, render: (r) => fmtPct(r.share) },
  ];
  const table = dataTable('Novi slotovi: razina × vrsta rada', 'Presjek vezanih dokumenata.', rows, cols);
  table.classList.add('c12');
  bento.appendChild(table);

  const ret = stats.retention.find((r) => r.table === 'document_slots');
  if (ret) {
    const note = el('div', 'c12');
    note.appendChild(el('p', 'hint', ret.note));
    bento.appendChild(note);
  }
}
