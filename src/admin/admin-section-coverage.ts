/**
 * Coverage & Demand: koji fakulteti i programi se najvise traze.
 * Samo stvarno izmjerena potraznja (faculty_requests) - bez izmisljenog "opportunity score"
 * koji bi trazio ulaze (komercijalna namjera, jaz u pokrivenosti) koje ova RPC ne vraca.
 */

import type { CoverageStats, CoverageCell } from './admin-types';
import { el, heroCard, statTile, barList, dataTable, computeDelta, seriesColors, fmtCount, type Column } from './admin-charts';

const WORK_TYPE: Record<string, string> = {
  seminarski: 'Seminarski', zavrsni: 'Završni', diplomski: 'Diplomski', doktorski: 'Doktorski',
};
const facultyName = (c: CoverageCell): string => c.facultyNameRaw ?? c.facultyId ?? 'nepoznato';

export function renderCoverageSection(container: HTMLElement, stats: CoverageStats): void {
  container.replaceChildren();
  const s = seriesColors();
  const bento = el('div', 'bento');
  container.appendChild(bento);

  const dTotal = computeDelta(stats.current.totalRequests, stats.previous.totalRequests, 'up');
  const hero = heroCard({
    label: 'Zahtjevi za nepokrivene fakultete',
    value: stats.current.totalRequests,
    render: fmtCount,
    sub: `prethodno ${fmtCount(stats.previous.totalRequests)}`,
    delta: dTotal,
  });
  hero.classList.add('c4');
  bento.appendChild(hero);

  const t1 = statTile({
    label: 'Različitih fakulteta', icon: 'users', hue: s[6],
    value: stats.current.distinctFaculties, render: fmtCount,
    delta: computeDelta(stats.current.distinctFaculties, stats.previous.distinctFaculties, 'up'),
    note: 'u zahtjevima',
  });
  t1.classList.add('c4');
  const t2 = statTile({
    label: 'S ostavljenim e-mailom', icon: 'bell', hue: s[4],
    value: stats.current.withEmail, render: fmtCount,
    delta: computeDelta(stats.current.withEmail, stats.previous.withEmail, 'up'),
    note: stats.current.totalRequests ? `${Math.round((stats.current.withEmail / stats.current.totalRequests) * 100)}% zahtjeva` : undefined,
  });
  t2.classList.add('c4');
  bento.append(t1, t2);

  const top = stats.current.topCells.slice(0, 10);
  if (top.length) {
    const bl = barList(
      'Najtraženiji fakulteti',
      'Broj zahtjeva u odabranom razdoblju.',
      top.map((c) => ({ name: facultyName(c), value: c.totalRequests })),
      s[2], 'Zahtjevi po fakultetu', ['Fakultet', 'Zahtjevi'],
    );
    bl.classList.add('c12');
    bento.appendChild(bl);
  }

  const cols: Array<Column<CoverageCell>> = [
    { header: 'Fakultet', render: (r) => facultyName(r) },
    { header: 'Program', render: (r) => r.programId ?? '—' },
    { header: 'Vrsta rada', render: (r) => (r.workType ? WORK_TYPE[r.workType] ?? r.workType : '—') },
    { header: 'Zahtjevi', numeric: true, render: (r) => fmtCount(r.totalRequests) },
    { header: 'Jedinstveni', numeric: true, render: (r) => fmtCount(r.uniqueRequesters) },
    { header: 'S e-mailom', numeric: true, render: (r) => fmtCount(r.withEmail) },
  ];
  const table = dataTable('Rangirano po potražnji', 'Fakultet, program i vrsta rada.', stats.current.topCells, cols);
  table.classList.add('c12');
  bento.appendChild(table);

  const ret = stats.retention.find((r) => r.table === 'faculty_requests');
  if (ret) {
    const note = el('div', 'c12');
    note.appendChild(el('p', 'hint', ret.note));
    bento.appendChild(note);
  }
}
