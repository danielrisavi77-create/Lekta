// Pretraziva ploca za <select> polja profila. Nativna OTVORENA lista selecta ne moze se
// stilizirati (OS-ov font i izgled), pa klik/tipkanje otvara vlastitu plohu s trazilicom,
// a <select> ostaje izvor istine: odabir postavlja value i salje change (bubbles), cime sva
// postojeca logika (populate*, syncProfileContext, spekulativna invalidacija, _profileConfirmed)
// radi netaknuto. Strelice gore/dolje na ZATVORENOM selectu namjerno ostaju nativne (brza
// izmjena vrijednosti bez plohe); programatske izmjene vrijednosti ne diraju plohu.

import { escapeHtml } from '../utils/helpers';

export interface ComboOption {
  value: string;
  label: string;
  sub?: string;
  extra?: Record<string, string>;
}

export interface ComboConfig {
  select: HTMLSelectElement | null;
  placeholder: string;
  /** Opcije za plohu; default cita zive <option> elemente selecta pri svakom otvaranju. */
  getOptions?: () => ComboOption[];
  /** Primjena odabira; default postavlja select.value i salje change (bubbles). */
  apply?: (opt: ComboOption) => void;
}

const strip = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

const matchesQuery = (q: string, normalizedHay: string): boolean =>
  strip(q).split(/\s+/).filter(Boolean).every((t) => normalizedHay.includes(t));

let comboSeq = 0;

export function attachSelectSearch(cfg: ComboConfig): void {
  const select = cfg.select;
  if (!select) return;
  const field = select.closest('.field');
  if (!(field instanceof HTMLElement)) return;
  field.classList.add('lek-combo-field');
  const listId = `lekCombo${++comboSeq}`;

  let panel: HTMLDivElement | null = null;
  let input: HTMLInputElement | null = null;
  let list: HTMLDivElement | null = null;
  let options: ComboOption[] = [];
  let visible: ComboOption[] = [];
  let active = -1;

  const defaultOptions = (): ComboOption[] =>
    Array.from(select.options).map((o) => ({ value: o.value, label: o.textContent || o.value }));

  const applyPick = (opt: ComboOption): void => {
    if (cfg.apply) cfg.apply(opt);
    else {
      select.value = opt.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  const onDocDown = (e: MouseEvent): void => {
    const t = e.target;
    if (panel && t instanceof Node && !panel.contains(t) && t !== select) close(false);
  };

  const close = (refocus: boolean): void => {
    if (!panel) return;
    panel.remove();
    panel = null; input = null; list = null; active = -1;
    document.removeEventListener('mousedown', onDocDown, true);
    if (refocus) select.focus({ preventScroll: true });
  };

  const render = (): void => {
    if (!list || !input) return;
    const q = input.value.trim();
    visible = q ? options.filter((o) => matchesQuery(q, strip(`${o.label} ${o.sub || ''}`))) : options;
    if (active >= visible.length) active = visible.length ? 0 : -1;
    if (active < 0 && visible.length) active = Math.max(0, visible.findIndex((o) => o.value === select.value));
    list.innerHTML = visible.length
      ? visible.map((o, i) =>
          `<button type="button" class="lek-combo-opt${i === active ? ' active' : ''}${o.value === select.value ? ' current' : ''}" role="option" id="${listId}-${i}" aria-selected="${o.value === select.value}" data-i="${i}"><span class="lek-combo-label">${escapeHtml(o.label)}</span>${o.sub ? `<span class="lek-combo-sub">${escapeHtml(o.sub)}</span>` : ''}</button>`,
        ).join('')
      : '<div class="lek-combo-empty">Nema rezultata. Pokušaj kraći pojam, radi i bez dijakritike.</div>';
    input.setAttribute('aria-activedescendant', active >= 0 ? `${listId}-${active}` : '');
    list.querySelector('.lek-combo-opt.active')?.scrollIntoView({ block: 'nearest' });
  };

  const onInputKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (visible.length) { active = (active + 1) % visible.length; render(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (visible.length) { active = (active - 1 + visible.length) % visible.length; render(); } }
    else if (e.key === 'Enter') { e.preventDefault(); const pick = active >= 0 ? visible[active] : visible[0]; if (pick) { applyPick(pick); close(true); } }
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') close(false);
  };

  const open = (seed: string): void => {
    if (panel) { input?.focus(); return; }
    options = cfg.getOptions ? cfg.getOptions() : defaultOptions();
    panel = document.createElement('div');
    panel.className = 'lek-combo';
    panel.innerHTML = `<input type="text" class="lek-combo-input" role="combobox" aria-expanded="true" aria-controls="${listId}" aria-autocomplete="list" aria-label="${escapeHtml(cfg.placeholder)}" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(cfg.placeholder)}"><div class="lek-combo-list" role="listbox" id="${listId}"></div>`;
    field.appendChild(panel);
    input = panel.querySelector('.lek-combo-input');
    list = panel.querySelector('.lek-combo-list');
    input?.addEventListener('input', () => { active = -1; render(); });
    input?.addEventListener('keydown', onInputKey);
    // mousedown na listi ne smije maknuti fokus s inputa prije clicka
    list?.addEventListener('mousedown', (e) => e.preventDefault());
    list?.addEventListener('click', (e) => {
      const btn = e.target instanceof Element ? e.target.closest('.lek-combo-opt') : null;
      if (btn instanceof HTMLElement) {
        const pick = visible[Number(btn.dataset.i)];
        if (pick) { applyPick(pick); close(true); }
      }
    });
    document.addEventListener('mousedown', onDocDown, true);
    if (input) input.value = seed;
    active = -1;
    render();
    input?.focus();
  };

  select.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (panel) close(true); else open('');
  });
  select.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))) {
      e.preventDefault();
      open('');
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && /\S/.test(e.key)) {
      e.preventDefault();
      open(e.key);
    }
  });
}
