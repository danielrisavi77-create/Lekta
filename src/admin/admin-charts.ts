/**
 * Lekta Control Center: graficki vokabular. Rucno radjeno u SVG/CSS, bez chart biblioteke.
 *
 * Bez innerHTML za podatke (isti obrazac kao admin-panel.ts, zbog stroge CSP): DOM preko
 * createElement, SVG preko createElementNS. Jedina iznimka su staticke ikone iz ICONS,
 * koje su konstante u ovom fajlu, nikad korisnicki/serverski tekst.
 *
 * Mjere prate dataviz specifikaciju: trake <=24px s 4px zaobljenim krajem, linije 2px,
 * markeri >=8px, ~10-16% ispuna povrsine, mrezne linije 1px pune, 2px razmak u boji podloge
 * izmedju segmenata donuta, legenda uvijek uz >=2 serije, i sr-only tablica uz SVAKI graf
 * (nijedna vrijednost nije dostupna samo preko hovera).
 *
 * Boje serija dolaze iz CSS varijabli --s1..--s8 / --t0..--t3 koje postavlja admin-theme.ts
 * prema korisnikovom izboru palete; ovdje se ne hardkodira nijedan hex.
 */

const NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, String(attrs[k]));
  return n;
}
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

const NUM = new Intl.NumberFormat('hr-HR');
export const fmtCount = (n: number): string => NUM.format(Math.round(n || 0));
export const fmtEur = (n: number): string => `${(n || 0).toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export const fmtEur0 = (n: number): string => `${NUM.format(Math.round(n || 0))} €`;
export const fmtPct = (n: number, d = 1): string => `${(n || 0).toFixed(d).replace('.', ',')}%`;
/** Vrijednost CSS varijable s <html>; grafovi je citaju pri crtanju pa prate aktivnu paletu. */
export const cssVar = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const seriesColors = (): string[] => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => cssVar(`--s${i}`));
export const tierColors = (): string[] => [0, 1, 2, 3].map((i) => cssVar(`--t${i}`));

export const ICONS = {
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M9 13h6M9 17h4"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  euro: '<path d="M4 10h12M4 14h9"/><path d="M19 5.5A7.5 7.5 0 0 0 8 12a7.5 7.5 0 0 0 11 6.5"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  slots: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M5 12l7 7 7-7"/>',
  flat: '<path d="M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  warn: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
} as const;

export type IconName = keyof typeof ICONS;

/** Staticka ikona iz ICONS (konstanta u ovom fajlu, nikad vanjski tekst). */
export function icon(name: IconName, cls?: string): SVGElement {
  const s = svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.1, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  if (cls) s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name];
  return s;
}

/** sr-only tablica uz svaki graf: nijedna vrijednost nije dostupna samo preko hovera. */
export function attachTable(host: HTMLElement, caption: string, cols: string[], rows: Array<Array<string | number>>): void {
  const box = el('div', 'sr-only');
  const t = el('table');
  t.appendChild(el('caption', undefined, caption));
  const thead = el('thead');
  const hr = el('tr');
  cols.forEach((c) => { const th = el('th', undefined, c); th.scope = 'col'; hr.appendChild(th); });
  thead.appendChild(hr);
  t.appendChild(thead);
  const tb = el('tbody');
  rows.forEach((r) => { const tr = el('tr'); r.forEach((v) => tr.appendChild(el('td', undefined, String(v)))); tb.appendChild(tr); });
  t.appendChild(tb);
  box.appendChild(t);
  host.appendChild(box);
  host.setAttribute('role', 'img');
  host.setAttribute('aria-label', caption);
}

/* ── delta ─────────────────────────────────────────────────────────────────────── */

export type GoodDirection = 'up' | 'down' | 'neutral';
export interface Delta { dir: 'up' | 'down' | 'flat'; tone: 'up' | 'down' | 'flat'; text: string }

/**
 * Boja delte prati je li smjer DOBAR za posao, ne sirovi predznak: vise gresaka je rast, ali
 * lose. Ispod 1 postotnog boda je ravno (sum, ne trend).
 */
export function computeDelta(cur: number, prev: number, good: GoodDirection = 'up'): Delta {
  if (!prev) {
    if (!cur) return { dir: 'flat', tone: 'flat', text: '—' };
    return { dir: 'up', tone: good === 'up' ? 'up' : good === 'down' ? 'down' : 'flat', text: 'novo' };
  }
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 1) return { dir: 'flat', tone: 'flat', text: '±0%' };
  const dir: 'up' | 'down' = pct > 0 ? 'up' : 'down';
  const tone: 'up' | 'down' | 'flat' = good === 'neutral' ? 'flat' : dir === good ? 'up' : 'down';
  return { dir, tone, text: `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(1).replace('.', ',')}%` };
}

export function deltaBadge(d: Delta): HTMLElement {
  const s = el('span', `delta ${d.tone}`);
  s.appendChild(icon(d.dir === 'up' ? 'up' : d.dir === 'down' ? 'down' : 'flat'));
  s.appendChild(el('span', undefined, d.text));
  return s;
}

/* ── sparkline ─────────────────────────────────────────────────────────────────── */

export function sparkline(values: number[], stroke: string, height = 34): SVGSVGElement {
  const W = 100, PAD = 3, n = values.length;
  const g = svg('svg', { viewBox: `0 0 ${W} ${height}`, preserveAspectRatio: 'none' });
  g.setAttribute('class', 'tile-spark');
  g.setAttribute('aria-hidden', 'true');
  if (n < 2) return g;
  const mn = Math.min(...values), mx = Math.max(...values), rg = (mx - mn) || 1;
  const X = (i: number) => (i / (n - 1)) * W;
  const Y = (v: number) => height - PAD - ((v - mn) / rg) * (height - PAD * 2);
  const id = `sp${Math.random().toString(36).slice(2, 9)}`;
  const defs = svg('defs');
  const lg = svg('linearGradient', { id, x1: '0', y1: '0', x2: '0', y2: '1' });
  lg.append(
    svg('stop', { offset: '0%', 'stop-color': stroke, 'stop-opacity': '.20' }),
    svg('stop', { offset: '100%', 'stop-color': stroke, 'stop-opacity': '0' }),
  );
  defs.appendChild(lg);
  g.appendChild(defs);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(2)},${Y(v).toFixed(2)}`).join(' ');
  g.appendChild(svg('path', { d: `${d} L${W},${height} L0,${height} Z`, fill: `url(#${id})`, stroke: 'none' }));
  const line = svg('path', { d, fill: 'none', stroke, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' });
  g.appendChild(line);
  g.appendChild(svg('circle', { cx: X(n - 1).toFixed(2), cy: Y(values[n - 1]).toFixed(2), r: 2.6, fill: stroke, stroke: 'var(--surface)', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }));
  return g;
}

function prefersReduced(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function countUp(node: HTMLElement, to: number, render: (n: number) => string): void {
  if (prefersReduced()) { node.textContent = render(to); return; }
  const start = performance.now(), DUR = 900;
  const step = (t: number) => {
    const k = Math.min(1, (t - start) / DUR);
    node.textContent = render(to * (1 - Math.pow(1 - k, 4)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ── KPI kartica ───────────────────────────────────────────────────────────────── */

export interface TileSpec {
  label: string;
  icon: IconName;
  hue: string;
  value: number;
  render: (n: number) => string;
  delta?: Delta;
  note?: string;
  spark?: number[];
}

export function statTile(spec: TileSpec): HTMLElement {
  const card = el('div', 'card tile rise');
  const top = el('div', 'tile-top');
  const chip = el('span', 'chip');
  chip.style.background = `color-mix(in srgb, ${spec.hue} 14%, transparent)`;
  chip.style.color = spec.hue;
  chip.appendChild(icon(spec.icon));
  top.append(chip, el('span', 'tile-label', spec.label));
  card.appendChild(top);
  const v = el('div', 'tile-val', spec.render(0));
  card.appendChild(v);
  countUp(v, spec.value, spec.render);
  const foot = el('div', 'tile-foot');
  if (spec.delta) foot.appendChild(deltaBadge(spec.delta));
  if (spec.note) foot.appendChild(el('span', 'tile-note', spec.note));
  card.appendChild(foot);
  if (spec.spark && spec.spark.length > 1) card.appendChild(sparkline(spec.spark, spec.hue));
  return card;
}

/* ── hero ──────────────────────────────────────────────────────────────────────── */

export interface HeroSpec { label: string; value: number; render: (n: number) => string; sub: string; delta?: Delta; spark?: number[] }

export function heroCard(spec: HeroSpec): HTMLElement {
  const card = el('div', 'card hero rise');
  const grp = el('div', 'hero-grp');
  grp.appendChild(el('div', 'hero-label', spec.label));
  const fig = el('div', 'hero-fig', spec.render(0));
  grp.appendChild(fig);
  countUp(fig, spec.value, spec.render);
  const sub = el('div', 'hero-sub');
  if (spec.delta) {
    const chip = el('span', 'hero-chip');
    chip.appendChild(icon(spec.delta.dir === 'up' ? 'up' : spec.delta.dir === 'down' ? 'down' : 'flat'));
    chip.appendChild(el('span', undefined, spec.delta.text));
    sub.appendChild(chip);
  }
  sub.appendChild(el('span', undefined, spec.sub));
  grp.appendChild(sub);
  card.appendChild(grp);
  if (spec.spark && spec.spark.length > 1) {
    const s = sparkline(spec.spark, 'rgba(255,255,255,.95)', 56);
    s.setAttribute('class', 'hero-spark');
    card.appendChild(s);
  }
  return card;
}

/* ── kartica s naslovom ────────────────────────────────────────────────────────── */

export function cardShell(title: string, sub?: string): { card: HTMLElement; body: HTMLElement } {
  const card = el('div', 'card rise');
  const head = el('div', 'card-head');
  const l = el('div');
  l.appendChild(el('div', 'card-title', title));
  if (sub) l.appendChild(el('div', 'card-sub', sub));
  head.appendChild(l);
  card.appendChild(head);
  return { card, body: card };
}

/* ── donut (<=6 segmenata, 2px razmak u boji podloge) ──────────────────────────── */

export interface Slice { name: string; value: number; color: string }

export function donut(title: string, sub: string, data: Slice[], centerLabel: string, caption: string): HTMLElement {
  const { card } = cardShell(title, sub);
  const wrap = el('div', 'donut-wrap');
  const R = 62, SW = 26, C = 2 * Math.PI * R, GAP = 2.5;
  const total = data.reduce((a, b) => a + b.value, 0) || 1;
  const g = svg('svg', { viewBox: '0 0 172 172' });
  g.setAttribute('role', 'img');
  const rot = svg('g', { transform: 'rotate(-90 86 86)' });
  let acc = 0;
  const segs: SVGCircleElement[] = [];
  data.forEach((d) => {
    const frac = d.value / total;
    const len = Math.max(frac * C - GAP, 0.6);
    const c = svg('circle', { cx: 86, cy: 86, r: R, fill: 'none', stroke: d.color, 'stroke-width': SW, 'stroke-dasharray': `${len} ${C - len}`, 'stroke-dashoffset': -acc * C, 'stroke-linecap': 'butt' });
    c.setAttribute('class', 'donut-seg');
    rot.appendChild(c);
    segs.push(c);
    acc += frac;
  });
  g.appendChild(rot);
  const cv = svg('text', { x: 86, y: 84, 'text-anchor': 'middle' });
  cv.setAttribute('class', 'donut-center-v');
  cv.textContent = fmtCount(total);
  const cl = svg('text', { x: 86, y: 100, 'text-anchor': 'middle' });
  cl.setAttribute('class', 'donut-center-l');
  cl.textContent = centerLabel;
  g.append(cv, cl);
  g.setAttribute('class', 'donut-svg');
  wrap.appendChild(g);

  const lg = el('div', 'legend');
  data.forEach((d, i) => {
    const row = el('div', 'lg-row');
    row.tabIndex = 0;
    const sw = el('span', 'lg-sw');
    sw.style.background = d.color;
    row.append(sw, el('span', 'lg-name', d.name), el('span', 'lg-val', fmtCount(d.value)), el('span', 'lg-pct', fmtPct((d.value / total) * 100, 0)));
    const on = () => { wrap.classList.add('dim'); segs[i].classList.add('hot'); cv.textContent = fmtCount(d.value); cl.textContent = d.name; };
    const off = () => { wrap.classList.remove('dim'); segs[i].classList.remove('hot'); cv.textContent = fmtCount(total); cl.textContent = centerLabel; };
    row.addEventListener('mouseenter', on);
    row.addEventListener('mouseleave', off);
    row.addEventListener('focus', on);
    row.addEventListener('blur', off);
    segs[i].addEventListener('mouseenter', on);
    segs[i].addEventListener('mouseleave', off);
    lg.appendChild(row);
  });
  wrap.appendChild(lg);
  card.appendChild(wrap);
  attachTable(card, caption, ['Kategorija', 'Vrijednost', 'Udio'], data.map((d) => [d.name, d.value, fmtPct((d.value / total) * 100)]));
  return card;
}

/* ── funnel: jedna boja, redoslijed nose polozaj i duljina ─────────────────────── */

export interface FunnelStep { name: string; value: number }

export function funnel(title: string, sub: string, steps: FunnelStep[], caption: string): HTMLElement {
  const { card } = cardShell(title, sub);
  const max = Math.max(1, ...steps.map((s) => s.value));
  steps.forEach((s, i) => {
    const st = el('div', 'fn-step');
    const row = el('div', 'fn-row');
    row.append(el('span', 'fn-name', s.name), el('span', 'fn-num', fmtCount(s.value)));
    st.appendChild(row);
    const track = el('div', 'fn-track');
    const fill = el('i', 'fn-fill');
    track.appendChild(fill);
    st.appendChild(track);
    card.appendChild(st);
    requestAnimationFrame(() => { fill.style.width = `${Math.max(1.5, (s.value / max) * 100)}%`; });
    const next = steps[i + 1];
    if (next) {
      const drop = s.value > 0 ? ((s.value - next.value) / s.value) * 100 : 0;
      const gap = el('div', 'fn-gap');
      const badge = el('span', `fn-drop${drop >= 70 ? ' bad' : ''}`);
      badge.appendChild(icon('arrowDown'));
      badge.appendChild(el('span', undefined, `${fmtPct(drop, 0)} odustaje`));
      gap.append(badge, el('span', 'fn-conn'));
      card.appendChild(gap);
    }
  });
  attachTable(card, caption, ['Korak', 'Broj'], steps.map((s) => [s.name, s.value]));
  return card;
}

/* ── trend: jedna serija (nikad druga os), crosshair + tooltip ─────────────────── */

export interface TrendPoint { label: string; full?: string; value: number }
export interface TrendMarker { label: string; index: number; legend?: string }

export function trend(
  title: string,
  sub: string,
  points: TrendPoint[],
  color: string,
  format: (n: number, axis?: boolean) => string,
  caption: string,
  markers: TrendMarker[] = [],
): HTMLElement {
  const { card } = cardShell(title, sub);
  if (!points.length) {
    card.appendChild(el('p', 'hint', 'Nema podataka za odabrano razdoblje.'));
    return card;
  }
  const W = 720, H = 240, PL = 56, PR = 14, PT = 16, PB = 30, TICKS = 4;
  const n = points.length;
  const maxV = Math.max(...points.map((p) => p.value), 0);
  // ciste vrijednosti na osi: biramo lijep KORAK pa iz njega vrh (inace 0/8/15/23)
  const rawStep = (maxV * 1.08) / TICKS || 1;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= rawStep) ?? 10) * mag;
  const top = step * TICKS;
  const X = (i: number) => (n === 1 ? PL + (W - PL - PR) / 2 : PL + (i / (n - 1)) * (W - PL - PR));
  const Y = (v: number) => H - PB - (v / top) * (H - PT - PB);

  const box = el('div', 'trend-box');
  const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' });
  g.setAttribute('class', 'trend-svg');
  g.setAttribute('role', 'img');

  for (let i = 0; i <= TICKS; i++) {
    const v = step * i, y = Y(v);
    const line = svg('line', { x1: PL, x2: W - PR, y1: y.toFixed(1), y2: y.toFixed(1) });
    line.setAttribute('class', 'gl');
    g.appendChild(line);
    const t = svg('text', { x: PL - 9, y: (y + 3.5).toFixed(1), 'text-anchor': 'end' });
    t.setAttribute('class', 'axl');
    t.textContent = format(v, true);
    g.appendChild(t);
  }
  // x oznake uz minimalni razmak, da zadnja nikad ne naleti na prethodnu
  const every = Math.max(1, Math.round(n / 7));
  const picks: number[] = [];
  points.forEach((_, i) => { if (i % every === 0) picks.push(i); });
  const last = n - 1;
  if (picks[picks.length - 1] !== last) {
    if (X(last) - X(picks[picks.length - 1]) < 62) picks.pop();
    picks.push(last);
  }
  picks.forEach((i) => {
    const t = svg('text', { x: X(i).toFixed(1), y: H - PB + 17, 'text-anchor': 'middle' });
    t.setAttribute('class', 'axl');
    t.textContent = points[i].label;
    g.appendChild(t);
  });

  const gid = `tg${Math.random().toString(36).slice(2, 9)}`;
  const defs = svg('defs');
  const lg = svg('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' });
  lg.append(
    svg('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '.16' }),
    svg('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0' }),
  );
  defs.appendChild(lg);
  g.appendChild(defs);
  const dPath = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' ');
  g.appendChild(svg('path', { d: `${dPath} L${X(n - 1).toFixed(1)},${Y(0).toFixed(1)} L${X(0).toFixed(1)},${Y(0).toFixed(1)} Z`, fill: `url(#${gid})` }));

  markers.forEach((m) => {
    if (m.index < 0 || m.index >= n) return;
    const x = X(m.index);
    const ml = svg('line', { x1: x.toFixed(1), x2: x.toFixed(1), y1: PT, y2: H - PB });
    ml.setAttribute('class', 'mk-line');
    g.appendChild(ml);
    const dot = svg('circle', { cx: x.toFixed(1), cy: PT, r: 4 });
    dot.setAttribute('class', 'mk-dot');
    const tt = svg('title');
    tt.textContent = m.label;
    dot.appendChild(tt);
    g.appendChild(dot);
  });

  const line = svg('path', { d: dPath, stroke: color, 'vector-effect': 'non-scaling-stroke' });
  line.setAttribute('class', 'tline');
  g.appendChild(line);

  const cross = svg('line', { y1: PT, y2: H - PB });
  cross.setAttribute('class', 'cross');
  const cdot = svg('circle', { r: 5, fill: color });
  cdot.setAttribute('class', 'cdot');
  g.append(cross, cdot);

  const tip = el('div', 'ttip');
  const tDate = el('span', 'ttip-d');
  const row = el('div', 'ttip-r');
  const sw = el('span', 'ttip-sw');
  sw.style.background = color;
  const tVal = el('span', 'ttip-v');
  row.append(sw, el('span', undefined, title), tVal);
  tip.append(tDate, row);

  const show = (i: number) => {
    const p = points[i], x = X(i);
    cross.setAttribute('x1', String(x));
    cross.setAttribute('x2', String(x));
    cross.style.opacity = '.45';
    cdot.setAttribute('cx', String(x));
    cdot.setAttribute('cy', String(Y(p.value)));
    cdot.style.opacity = '1';
    tDate.textContent = p.full ?? p.label;
    tVal.textContent = format(p.value);
    tip.style.opacity = '1';
    tip.style.left = `${(x / W) * 100}%`;
    tip.style.top = `${(Y(p.value) / H) * 100}%`;
  };
  const hide = () => { cross.style.opacity = '0'; cdot.style.opacity = '0'; tip.style.opacity = '0'; };
  const hit = svg('rect', { x: PL, y: PT, width: W - PL - PR, height: H - PT - PB, fill: 'transparent' });
  hit.style.cursor = 'crosshair';
  hit.addEventListener('pointermove', (ev) => {
    const r = g.getBoundingClientRect();
    const lx = ((ev.clientX - r.left) / r.width) * W;
    const k = (lx - PL) / (W - PL - PR);
    show(Math.max(0, Math.min(n - 1, Math.round(k * (n - 1)))));
  });
  hit.addEventListener('pointerleave', hide);
  g.appendChild(hit);

  box.append(g, tip);
  card.appendChild(box);
  if (markers.length) {
    const kr = el('div', 'keyrow');
    const k1 = el('span', 'key');
    const i1 = el('i');
    i1.style.background = color;
    k1.append(i1, el('span', undefined, title));
    const k2 = el('span', 'key dash');
    k2.append(el('i'), el('span', undefined, markers[0].legend ?? 'oznaka'));
    kr.append(k1, k2);
    card.appendChild(kr);
  }
  attachTable(card, caption, ['Razdoblje', title], points.map((p) => [p.full ?? p.label, format(p.value)]));
  return card;
}

/* ── bar lista ─────────────────────────────────────────────────────────────────── */

export interface BarRow { name: string; value: number; color?: string; text?: string }

export function barList(title: string, sub: string, rows: BarRow[], color: string, caption: string, cols: [string, string] = ['Stavka', 'Vrijednost'], format: (n: number) => string = fmtCount): HTMLElement {
  const { card } = cardShell(title, sub);
  if (!rows.length) {
    card.appendChild(el('p', 'hint', 'Nema podataka za odabrano razdoblje.'));
    return card;
  }
  const list = el('div', 'bl');
  const max = Math.max(1, ...rows.map((r) => r.value));
  rows.forEach((r) => {
    const row = el('div', 'bl-row');
    row.appendChild(el('span', 'bl-name', r.name));
    const track = el('div', 'bl-track');
    const fill = el('i', 'bl-fill');
    fill.style.background = r.color ?? color;
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el('span', 'bl-val', r.text ?? format(r.value)));
    list.appendChild(row);
    requestAnimationFrame(() => { fill.style.width = `${Math.max(1.5, (r.value / max) * 100)}%`; });
  });
  card.appendChild(list);
  attachTable(card, caption, cols, rows.map((r) => [r.name, r.text ?? format(r.value)]));
  return card;
}

/* ── tablica ───────────────────────────────────────────────────────────────────── */

export interface Column<T> { header: string; numeric?: boolean; render: (row: T) => string | HTMLElement }

export function dataTable<T>(title: string, sub: string, rows: T[], cols: Array<Column<T>>): HTMLElement {
  const { card } = cardShell(title, sub);
  if (!rows.length) {
    card.appendChild(el('p', 'hint', 'Nema podataka za odabrano razdoblje.'));
    return card;
  }
  const wrap = el('div', 'tw');
  const t = el('table');
  const thead = el('thead');
  const hr = el('tr');
  cols.forEach((c) => { const th = el('th', c.numeric ? 'num' : undefined, c.header); th.scope = 'col'; hr.appendChild(th); });
  thead.appendChild(hr);
  t.appendChild(thead);
  const tb = el('tbody');
  rows.forEach((r) => {
    const tr = el('tr');
    cols.forEach((c) => {
      const td = el('td', c.numeric ? 'num' : undefined);
      const out = c.render(r);
      if (typeof out === 'string') td.textContent = out; else td.appendChild(out);
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  wrap.appendChild(t);
  card.appendChild(wrap);
  return card;
}

/** Mali obojeni tag (npr. oznaka razine pokrivenosti). */
export function tag(text: string, color: string, soft: string, ink: string): HTMLElement {
  const s = el('span', 'tag');
  s.style.background = soft;
  s.style.color = ink;
  const i = el('i');
  i.style.background = color;
  s.append(i, el('span', undefined, text));
  return s;
}
