/**
 * Admin panel (lazy chunk): read-only prikaz agregata bete.
 *
 * Ucitava se TEK na `?admin=1`, pa ne ulazi u glavni bundle koji dobiva svaki posjetitelj.
 * Gradi se ciljano preko DOM API-ja s `textContent` (bez `innerHTML`): nema XSS povrsine i
 * nema inline `<script>`, sto je uskladjeno sa strogim `script-src` u _headers.
 *
 * Prikazuje SAMO brojeve. Ako ikad zatreba pregled pojedinog rada, to je zaseban zahvat koji
 * trazi i izmjenu politike privatnosti; ovaj modul namjerno nema takvu mogucnost.
 */

import './admin-panel.css';
import { fetchAdminStats, toStatTiles, toWorkTypeRows, toAnalyticsRows, type AdminStatsConfig } from './admin-stats.ts';

const WORK_TYPE_LABELS: Record<string, string> = {
  seminarski: 'Seminarski',
  zavrsni: 'Završni',
  diplomski: 'Diplomski',
  doktorski: 'Doktorski',
};

export interface AdminPanelOptions {
  cfg: AdminStatsConfig;
  /** Vraca svjezi access token (app.ts ga osvjezava po potrebi) ili prazan string. */
  getToken: () => Promise<string>;
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Otvori panel. Idempotentno: ponovni poziv osvjezi postojeci umjesto da otvori drugi. */
export async function openAdminPanel(opts: AdminPanelOptions): Promise<void> {
  document.getElementById('adminPanel')?.remove();

  const backdrop = el('div', 'modal-backdrop');
  backdrop.id = 'adminPanel';

  const modal = el('div', 'modal');
  const head = el('div', 'modal-head');
  head.appendChild(el('h3', undefined, 'Beta: pregled brojki'));
  const close = el('button', 'btn btn-ghost btn-sm', 'Zatvori') as HTMLButtonElement;
  close.type = 'button';
  close.onclick = () => backdrop.remove();
  head.appendChild(close);
  modal.appendChild(head);

  const body = el('div', 'modal-body');
  const status = el('p', 'empty', 'Učitavam…');
  body.appendChild(status);
  modal.appendChild(body);

  const actions = el('div', 'modal-actions');
  const refresh = el('button', 'btn btn-secondary btn-sm', 'Osvježi') as HTMLButtonElement;
  refresh.type = 'button';
  actions.appendChild(refresh);
  modal.appendChild(actions);

  backdrop.appendChild(modal);
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
  document.body.appendChild(backdrop);

  async function load(): Promise<void> {
    status.textContent = 'Učitavam…';
    // Ocisti prethodni sadrzaj, zadrzi status redak.
    while (body.childNodes.length > 1) body.removeChild(body.lastChild!);

    const token = await opts.getToken();
    const result = await fetchAdminStats(opts.cfg, token);
    if (!result.ok) {
      status.textContent = result.message;
      return;
    }

    const stats = result.stats;
    status.textContent = stats.generatedAt
      ? `Stanje: ${new Date(stats.generatedAt).toLocaleString('hr-HR')}`
      : 'Stanje osvježeno.';

    const grid = el('div', 'stat-grid');
    for (const tile of toStatTiles(stats)) {
      const card = el('div', 'stat-card');
      card.appendChild(el('span', 'stat-label', tile.label));
      card.appendChild(el('strong', 'stat-value', tile.value));
      if (tile.hint) card.appendChild(el('span', 'stat-hint', tile.hint));
      grid.appendChild(card);
    }
    body.appendChild(grid);

    const rows = toWorkTypeRows(stats);
    if (rows.length) {
      body.appendChild(el('h4', undefined, 'Po vrsti rada'));
      const list = el('ul', 'plain-list');
      for (const row of rows) {
        list.appendChild(el('li', undefined, `${WORK_TYPE_LABELS[row.workType] ?? row.workType}: ${row.count}`));
      }
      body.appendChild(list);
    }

    const analyticsRows = toAnalyticsRows(stats);
    if (analyticsRows.length) {
      body.appendChild(el('h4', undefined, 'Analytics dogadjaji (7 dana)'));
      const list = el('ul', 'plain-list');
      for (const row of analyticsRows) {
        list.appendChild(el('li', undefined, `${row.event}: ${row.count}`));
      }
      body.appendChild(list);
    }
  }

  refresh.onclick = () => { void load(); };
  await load();
}
