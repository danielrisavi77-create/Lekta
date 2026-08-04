/**
 * Operations: "je li sve u redu odmah" - statusna traka (najgore od tri podsustava) + kartice.
 * Statusne boje su rezervirana skala (good/warning/critical) i uvijek idu uz ikonu i tekst,
 * nikad samo boja; nikad se ne koriste kao boja serije.
 */

import type { OperationsStats, OperationsRepairBucket, OperationsGenerationsBucket, OperationsPreflightBucket } from './admin-types';
import { el, icon, seriesColors, fmtCount, fmtPct } from './admin-charts';

type Health = 'ok' | 'warn' | 'danger' | 'none';

function rate(bad: number, total: number): number { return total > 0 ? bad / total : 0; }
function grade(bad: number, total: number, warnAt = 0.05, dangerAt = 0.15): Health {
  if (!total) return 'none';
  const r = rate(bad, total);
  return r < warnAt ? 'ok' : r < dangerAt ? 'warn' : 'danger';
}
const TROUBLE = new Set(['denied', 'rate_limited', 'repair_failed']);

function worst(list: Health[]): Health {
  if (list.includes('danger')) return 'danger';
  if (list.includes('warn')) return 'warn';
  return list.every((h) => h === 'none') ? 'none' : 'ok';
}

const BANNER: Record<Health, string> = {
  ok: 'Svi sustavi rade normalno',
  warn: 'Nešto traži pažnju',
  danger: 'Nešto ne radi kako treba',
  none: 'Nema podataka za odabrano razdoblje',
};

function subsystem(title: string, health: Health, hue: string, pctOk: number | null, metrics: Array<[string, string]>): HTMLElement {
  const card = el('div', 'card subsystem rise c4');
  const head = el('div', 'card-head');
  const left = el('div', 'sub-head');
  const dot = el('span', `dot-live ${health}`);
  left.append(dot, el('span', 'card-title', title));
  head.appendChild(left);
  if (pctOk !== null) {
    const t = el('span', `tag st-${health}`);
    t.appendChild(el('span', undefined, fmtPct(pctOk, 1)));
    head.appendChild(t);
  }
  card.appendChild(head);
  metrics.forEach(([k, v]) => {
    const row = el('div', 'sub-metric');
    row.append(el('span', undefined, k), el('span', undefined, v));
    card.appendChild(row);
  });
  if (pctOk !== null) {
    const meter = el('div', 'meter');
    const fill = el('i');
    fill.style.background = hue;
    meter.appendChild(fill);
    card.appendChild(meter);
    requestAnimationFrame(() => { fill.style.width = `${Math.max(0, Math.min(100, pctOk))}%`; });
  }
  return card;
}

export function renderOperationsSection(container: HTMLElement, stats: OperationsStats): void {
  container.replaceChildren();
  const s = seriesColors();
  const bento = el('div', 'bento');
  container.appendChild(bento);

  const repair: OperationsRepairBucket = stats.current.repair;
  const gens: OperationsGenerationsBucket = stats.current.generations;
  const pre: OperationsPreflightBucket = stats.current.preflight;

  const hRepair = grade(repair.failed, repair.total);
  const preTotal = pre.done + pre.error;
  const hPre = grade(pre.error, preTotal);
  const trouble = gens.byStatus.filter((x) => TROUBLE.has(x.status)).reduce((a, b) => a + b.count, 0);
  const hGens = grade(trouble, gens.total, 0.1, 0.25);
  const overall = worst([hRepair, hPre, hGens]);

  const bWrap = el('div', 'c12');
  const banner = el('div', `banner ${overall}`);
  banner.appendChild(icon(overall === 'ok' ? 'check' : overall === 'none' ? 'inbox' : 'warn'));
  banner.appendChild(el('span', undefined, BANNER[overall]));
  bWrap.appendChild(banner);
  bento.appendChild(bWrap);

  bento.appendChild(subsystem('Popravak dokumenata', hRepair, s[7],
    repair.total ? (repair.done / repair.total) * 100 : null,
    [
      ['Ukupno', fmtCount(repair.total)],
      ['Dovršeno', fmtCount(repair.done)],
      ['Neuspjelo', fmtCount(repair.failed)],
      ['Prosjek izmjena', String(repair.avgChangesCount).replace('.', ',')],
      ['Korisnika', fmtCount(repair.distinctUsers)],
    ]));

  bento.appendChild(subsystem('Provjera prije predaje', hPre, s[4],
    preTotal ? (pre.done / preTotal) * 100 : null,
    [
      ['Dovršeno', fmtCount(pre.done)],
      ['Greška', fmtCount(pre.error)],
      ['Prosječno trajanje', pre.avgDurationMs != null ? `${(pre.avgDurationMs / 1000).toFixed(1).replace('.', ',')} s` : '—'],
      ...pre.bySeverity.slice(0, 2).map((x): [string, string] => [x.severity, fmtCount(x.count)]),
    ]));

  bento.appendChild(subsystem('Generiranje izvještaja', hGens, s[1],
    gens.total ? ((gens.total - trouble) / gens.total) * 100 : null,
    [
      ['Ukupno', fmtCount(gens.total)],
      ...gens.byStatus.slice(0, 4).map((x): [string, string] => [x.status, fmtCount(x.count)]),
    ]));

  const ret = stats.retention.find((r) => r.table === 'report_generations');
  if (ret) {
    const note = el('div', 'c12');
    note.appendChild(el('p', 'hint', ret.note));
    bento.appendChild(note);
  }
}
