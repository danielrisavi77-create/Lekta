/**
 * Lekta Control Center: orkestracija. Toolbar/tab wiring, dohvat po sekciji uz 60s kes,
 * loading/empty/error stanja. Render logika po sekciji zivi u admin-section-*.ts; ovaj modul
 * samo odlucuje KADA fetchati/renderirati, ne KAKO iscrtati graf.
 */

import { createInitialState, isSlotFresh, invalidateAllSlots, type AdminState } from './admin-state';
import { resolveAdminToken, consumeMagicLinkFragment } from './admin-auth';
import { renderAdminAuthGate, renderSetPasswordStep } from './admin-auth-gate';
import { fetchSectionStats, type AdminApiConfig } from './admin-api';
import { ADMIN_CONFIG } from './admin-config';
import { SECTION_IDS, type Period, type PeriodKind, type SectionId } from './admin-types';
import type { CoverageStats, FunnelStats, OperationsStats, OverviewStats, RevenueStats, UsageStats } from './admin-types';
import { renderOverviewSection } from './admin-section-overview';
import { renderFunnelSection } from './admin-section-funnel';
import { renderRevenueSection } from './admin-section-revenue';
import { renderOperationsSection } from './admin-section-operations';
import { renderUsageSection } from './admin-section-usage';
import { renderCoverageSection } from './admin-section-coverage';
import { setupPalettePicker, toggleMode } from './admin-theme';
import { icon as chartIcon } from './admin-charts';

const API_CFG: AdminApiConfig = { endpoint: ADMIN_CONFIG.adminStatsEndpoint };

function dispatchRender(id: SectionId, container: HTMLElement, stats: unknown): void {
  switch (id) {
    case 'overview': renderOverviewSection(container, stats as OverviewStats); return;
    case 'funnel': renderFunnelSection(container, stats as FunnelStats); return;
    case 'revenue': renderRevenueSection(container, stats as RevenueStats); return;
    case 'operations': renderOperationsSection(container, stats as OperationsStats); return;
    case 'usage': renderUsageSection(container, stats as UsageStats); return;
    case 'coverage': renderCoverageSection(container, stats as CoverageStats); return;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function renderLoading(container: HTMLElement): void {
  container.replaceChildren();
  const grid = el('div', 'bento');
  const heights = ['230px', '150px', '150px', '150px', '150px', '300px'];
  const spans = ['c4', 'c4', 'c4', 'c4', 'c4', 'c12'];
  heights.forEach((h, i) => {
    const sk = el('div', `chart-skeleton ${spans[i]}`);
    sk.style.height = h;
    grid.appendChild(sk);
  });
  container.appendChild(grid);
}

function renderError(container: HTMLElement, message: string, onRetry: () => void): void {
  container.replaceChildren();
  const empty = el('div', 'empty');
  empty.appendChild(chartIcon('warn'));
  const p = document.createElement('p');
  p.textContent = message;
  empty.appendChild(p);
  const retry = el('button', 'btn btn-secondary btn-sm') as HTMLButtonElement;
  retry.type = 'button';
  retry.textContent = 'Pokušaj ponovno';
  retry.addEventListener('click', onRetry);
  empty.appendChild(retry);
  container.appendChild(empty);
}

export class AdminShell {
  private state: AdminState = createInitialState();
  private root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async boot(): Promise<void> {
    // Ako je ovo povratak s klika na magic-link u e-mailu, sesija je u URL fragmentu - spremi
    // je PRIJE provjere postojece sesije, da resolveAdminToken odmah nadje svjeze spremljenu.
    const fromMagicLink = consumeMagicLinkFragment();
    let token = await resolveAdminToken();

    // Gate/interstitial ide u ZASEBAN mount, ne u this.root: toolbar/tabovi/main iz admin.html
    // se samo privremeno SAKRIJU (ne unistavaju/ne re-buildaju) dok traje prijava.
    const chrome = [document.querySelector('.topbar'), document.querySelector('.palbar'), document.getElementById('adminContent')];

    if (!token) {
      chrome.forEach((el) => el?.classList.add('hidden'));
      const gateMount = document.createElement('div');
      document.body.appendChild(gateMount);
      token = await renderAdminAuthGate(gateMount);
      gateMount.remove();
      chrome.forEach((el) => el?.classList.remove('hidden'));
    } else if (fromMagicLink) {
      // Svjez magic-link login OVOG boota (ne stara perzistirana sesija) - ponudi lozinku za
      // sljedeci put, isti korak kao nakon rucnog unosa koda u admin-auth-gate.ts.
      chrome.forEach((el) => el?.classList.add('hidden'));
      const promptMount = document.createElement('div');
      document.body.appendChild(promptMount);
      await renderSetPasswordStep(promptMount, token);
      promptMount.remove();
      chrome.forEach((el) => el?.classList.remove('hidden'));
    }
    this.state.token = token;
    this.renderShellChrome();
    this.wireToolbar();
    void this.loadSection(this.state.section, { force: false });
  }

  private renderShellChrome(): void {
    // Ljuska (toolbar/tabovi/main) je vec u admin.html; ovdje se samo bira aktivnu granu.
    this.setActiveRangeButton(this.state.period.kind);
  }

  private panelFor(id: SectionId): HTMLElement | null {
    return this.root.querySelector<HTMLElement>(`main [data-section="${id}"]`);
  }

  private setActiveRangeButton(kind: PeriodKind): void {
    document.querySelectorAll<HTMLElement>('.seg').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.range === kind));
    });
    const select = document.getElementById('rangeSelect') as HTMLSelectElement | null;
    if (select) select.value = kind;
    const customRow = document.getElementById('rangeCustom');
    customRow?.classList.toggle('hidden', kind !== 'custom');
  }

  private chooseRangeKind(kind: PeriodKind): void {
    if (kind === 'custom') {
      this.setActiveRangeButton('custom');
      return; // ceka eksplicitni "Primijeni" (vidi wireRangeApply) - ne fetcha odmah
    }
    this.setPeriod({ kind });
  }

  private wireToolbar(): void {
    document.querySelectorAll<HTMLElement>('.seg').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.range as PeriodKind | undefined;
        if (kind) this.chooseRangeKind(kind);
      });
    });

    const rangeSelect = document.getElementById('rangeSelect') as HTMLSelectElement | null;
    rangeSelect?.addEventListener('change', () => {
      this.chooseRangeKind(rangeSelect.value as PeriodKind);
    });

    const applyBtn = document.getElementById('rangeApply');
    applyBtn?.addEventListener('click', () => {
      const fromInput = document.getElementById('rangeFrom') as HTMLInputElement | null;
      const toInput = document.getElementById('rangeTo') as HTMLInputElement | null;
      const fromDate = fromInput?.value || undefined;
      const toDate = toInput?.value || undefined;
      if (!fromDate || !toDate) return;
      this.setPeriod({ kind: 'custom', fromDate, toDate });
    });

    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn?.addEventListener('click', () => {
      refreshBtn.classList.add('is-loading');
      void this.loadSection(this.state.section, { force: true }).finally(() => refreshBtn.classList.remove('is-loading'));
    });

    document.querySelectorAll<HTMLElement>('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const id = tab.dataset.section as SectionId | undefined;
        if (id) this.switchSection(id);
      });
    });

    // Paleta je KORISNIKOV trajni izbor (localStorage). Grafovi citaju CSS varijable pri
    // crtanju, pa svaka promjena mora ponovno iscrtati aktivnu sekciju.
    setupPalettePicker(() => this.repaint());
    document.getElementById('themeBtn')?.addEventListener('click', () => toggleMode(() => this.repaint()));

    const select = document.getElementById('sectionSelect') as HTMLSelectElement | null;
    select?.addEventListener('change', () => {
      const id = select.value as SectionId;
      this.switchSection(id);
    });
  }

  /** Ponovno iscrtaj aktivnu sekciju iz kesa (boje se citaju iz CSS varijabli pri crtanju). */
  private repaint(): void {
    const container = this.panelFor(this.state.section);
    const slot = this.state.slots[this.state.section];
    if (container && slot.status === 'ready' && slot.data) dispatchRender(this.state.section, container, slot.data);
  }

  private switchSection(id: SectionId): void {
    this.state.section = id;
    document.querySelectorAll<HTMLElement>('.tab').forEach((tab) => {
      const active = tab.dataset.section === id;
      tab.setAttribute('aria-selected', String(active));
    });
    const select = document.getElementById('sectionSelect') as HTMLSelectElement | null;
    if (select) select.value = id;
    SECTION_IDS.forEach((sec) => this.panelFor(sec)?.classList.toggle('hidden', sec !== id));
    void this.loadSection(id, { force: false });
  }

  private setPeriod(period: Period): void {
    this.state.period = period;
    this.setActiveRangeButton(period.kind);
    invalidateAllSlots(this.state);
    void this.loadSection(this.state.section, { force: true });
  }

  private async loadSection(id: SectionId, opts: { force: boolean }): Promise<void> {
    const container = this.panelFor(id);
    if (!container) return;
    const slot = this.state.slots[id];

    if (!opts.force && isSlotFresh(slot)) {
      dispatchRender(id, container, slot.data);
      return;
    }

    slot.status = 'loading';
    renderLoading(container);

    // Uhvati REFERENCU tekuceg perioda: setPeriod uvijek dodijeli NOV objekt, pa != usporedba
    // dolje pouzdano otkriva "korisnik je promijenio raspon dok je ovaj fetch bio u letu" -
    // bez toga bi zastarjeli odgovor (stari raspon) mogao prepisati svjeziji koji je vec stigao.
    const requestedPeriod = this.state.period;
    const res = await fetchSectionStats(id, API_CFG, this.state.token, requestedPeriod);

    // Korisnik je mozda prebacio sekciju ili promijenio raspon dok je fetch bio u letu - ne
    // prikazuj zastarjeli odgovor niti prepisuj slot koji je u meduvremenu vec osvjezen.
    if (this.state.section !== id || this.state.period !== requestedPeriod) return;

    if (!res.ok) {
      slot.status = 'error';
      slot.message = res.message;
      renderError(container, res.message, () => void this.loadSection(id, { force: true }));
      return;
    }

    slot.status = 'ready';
    slot.data = res.stats;
    slot.fetchedAt = Date.now();
    dispatchRender(id, container, res.stats);
  }
}

export function bootAdminDashboard(root: HTMLElement): void {
  const shell = new AdminShell(root);
  void shell.boot();
}
