/**
 * Lekta Control Center: primjena palete + galerija za odabir.
 *
 * Izbor je KORISNIKOV i trajan (localStorage, po pregledniku) - nije fiksiran u kodu. Zato
 * ovdje nema "prave" palete: `admin-palettes.ts` nosi sve provjerene, a ovaj modul ih samo
 * primjenjuje i pamti izbor.
 *
 * Boje se postavljaju kao inline custom properties na <html>. Inline pobjeduje i :root i
 * blok za tamnu temu, pa paleta nikad ne ostane napola primijenjena. Serije se razlikuju po
 * temi NAMJERNO: nijansa dovoljno duboka da izgleda bogato na bijelom padne ispod 3:1
 * kontrasta na tamnoj podlozi, pa svaka tema ima svoj provjereni skup.
 */

import { PALETTES, PALETTE_BUCKETS, PALETTE_LEVELS, DEFAULT_PALETTE_ID, paletteById, type AdminPalette } from './admin-palettes';

const STORAGE_KEY = 'lekta.admin.palette';
const THEME_KEY = 'lekta.theme';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function currentMode(): 'light' | 'dark' {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredPalette(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && paletteById(v)) return v;
  } catch {
    /* storage odbijen (privatno pregledavanje) - pada na default */
  }
  return DEFAULT_PALETTE_ID;
}

let activeId = readStoredPalette();
export function activePaletteId(): string { return activeId; }
export function activePalette(): AdminPalette { return paletteById(activeId) ?? PALETTES[0]; }

/** Primijeni paletu na dokument. Ne pamti izbor - to radi selectPalette(). */
export function applyPalette(id: string): void {
  const p = paletteById(id);
  if (!p) return;
  activeId = id;
  const dark = currentMode() === 'dark';
  const s = document.documentElement.style;
  (dark ? p.seriesDark : p.series).forEach((hex, i) => s.setProperty(`--s${i + 1}`, hex));
  (dark ? p.tierDark : p.tier).forEach((hex, i) => s.setProperty(`--t${i}`, hex));
  const acc = dark ? p.accentDark : p.accent;
  s.setProperty('--accent', acc[0]);
  s.setProperty('--accent-2', acc[1]);
  s.setProperty('--accent-soft', `color-mix(in srgb, ${acc[0]} ${dark ? 26 : 12}%, ${dark ? '#16141F' : '#FFFFFF'})`);
  s.setProperty('--shadow-accent', `0 8px 30px color-mix(in srgb, ${acc[0]} ${dark ? 34 : 28}%, transparent)`);
  document.querySelectorAll<HTMLElement>('.gcard').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === id)));
  document.querySelectorAll<HTMLElement>('.pal').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === id)));
}

/** Primijeni I zapamti. `onChange` prekopava grafove (citaju CSS varijable pri crtanju). */
export function selectPalette(id: string, onChange?: () => void): void {
  applyPalette(id);
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* storage odbijen */ }
  onChange?.();
}

/** Prebaci svijetlo/tamno, zapamti, pa ponovno primijeni paletu (akcent i serije se razlikuju po temi). */
export function toggleMode(onChange?: () => void): void {
  const next = currentMode() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* storage odbijen */ }
  applyPalette(activeId);
  onChange?.();
}

/* ── galerija ───────────────────────────────────────────────────────────────────── */

let bucketFilter = 'sve';
let levelFilter = 'sve';
let query = '';

function paletteCard(p: AdminPalette, onChange?: () => void): HTMLElement {
  const b = el('button', 'gcard');
  b.type = 'button';
  b.dataset.id = p.id;
  b.setAttribute('aria-pressed', String(p.id === activeId));
  b.title = `${p.name} · ${p.note} — razlučivost ΔE ${p.cvd.toFixed(1)} (daltonizam) / ${p.nv.toFixed(1)} (normalan vid), provjereno u obje teme`;
  const grad = el('div', 'gc-grad');
  grad.style.background = `linear-gradient(135deg, ${p.accent[0]}, ${p.accent[1]})`;
  const dots = el('div', 'gc-dots');
  p.series.forEach((hex) => { const i = el('i'); i.style.background = hex; dots.appendChild(i); });
  b.append(grad, dots, el('div', 'gc-name', p.name), el('div', 'gc-meta', `${p.note} · ΔE ${p.cvd.toFixed(1)}`));
  b.addEventListener('click', () => selectPalette(p.id, onChange));
  return b;
}

function renderGrid(onChange?: () => void): void {
  const grid = document.getElementById('galGrid');
  if (!grid) return;
  const q = query.trim().toLowerCase();
  const list = PALETTES.filter((p) =>
    (bucketFilter === 'sve' || p.bucket === bucketFilter)
    && (levelFilter === 'sve' || String(p.level) === levelFilter)
    && (!q || p.name.toLowerCase().includes(q)));
  const shown = document.getElementById('galShown');
  if (shown) shown.textContent = `${list.length} / ${PALETTES.length}`;
  grid.replaceChildren();
  if (!list.length) {
    grid.appendChild(el('div', 'gal-empty', 'Nema palete za odabrane filtere.'));
    return;
  }
  // jedan fragment: ~450 kartica pojedinacno ubaceno nepotrebno trese layout
  const frag = document.createDocumentFragment();
  list.forEach((p) => frag.appendChild(paletteCard(p, onChange)));
  grid.appendChild(frag);
}

/** Ozici traku s paletama i galeriju. `onChange` se zove nakon svake promjene palete. */
export function setupPalettePicker(onChange?: () => void): void {
  // kratka traka: po jedan predstavnik svake skupine boja; ostalo je u galeriji
  const bar = document.getElementById('palbar');
  if (bar) {
    const seen = new Set<string>();
    for (const p of PALETTES) {
      if (seen.has(p.bucket)) continue;
      seen.add(p.bucket);
      const b = el('button', 'pal');
      b.type = 'button';
      b.dataset.id = p.id;
      b.title = p.name;
      b.setAttribute('aria-pressed', String(p.id === activeId));
      const sw = el('span', 'pal-sw');
      [p.accent[0], p.series[1], p.series[4], p.accent[1]].forEach((hex) => { const i = el('i'); i.style.background = hex; sw.appendChild(i); });
      const tx = el('span', 'pal-txt');
      tx.append(el('span', 'pal-name', p.name.split(' → ')[0]), el('span', 'pal-note', p.note));
      b.append(sw, tx);
      b.addEventListener('click', () => selectPalette(p.id, onChange));
      bar.appendChild(b);
    }
  }

  const filters = document.getElementById('galFilters');
  if (filters) {
    PALETTE_BUCKETS.forEach(([id, label]) => {
      const c = el('button', 'fchip', label);
      c.type = 'button';
      c.dataset.k = 'hue';
      c.setAttribute('aria-pressed', String(id === 'sve'));
      c.addEventListener('click', () => {
        bucketFilter = id;
        filters.querySelectorAll<HTMLElement>('.fchip[data-k="hue"]').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
        renderGrid(onChange);
      });
      filters.appendChild(c);
    });
    const sep = el('span', 'gal-sep');
    filters.appendChild(sep);
    PALETTE_LEVELS.forEach(([id, label]) => {
      const c = el('button', 'fchip', label);
      c.type = 'button';
      c.dataset.k = 'dark';
      c.setAttribute('aria-pressed', String(id === 'sve'));
      c.addEventListener('click', () => {
        levelFilter = id;
        filters.querySelectorAll<HTMLElement>('.fchip[data-k="dark"]').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
        renderGrid(onChange);
      });
      filters.appendChild(c);
    });
    const search = el('input', 'gal-search');
    search.type = 'search';
    search.placeholder = 'Traži boju…';
    search.setAttribute('aria-label', 'Traži paletu po boji');
    search.addEventListener('input', () => { query = search.value; renderGrid(onChange); });
    filters.appendChild(search);
    const shown = el('span', 'gal-count');
    shown.id = 'galShown';
    filters.appendChild(shown);
  }

  const gal = document.getElementById('gal');
  const back = document.getElementById('galBack');
  const open = () => { gal?.classList.add('open'); back?.classList.add('open'); renderGrid(onChange); };
  const close = () => { gal?.classList.remove('open'); back?.classList.remove('open'); };
  document.getElementById('openGal')?.addEventListener('click', open);
  document.getElementById('galClose')?.addEventListener('click', close);
  back?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  const count = document.getElementById('galCount');
  if (count) count.textContent = `(${PALETTES.length})`;

  applyPalette(activeId);
}
