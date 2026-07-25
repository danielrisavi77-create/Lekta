/**
 * Zoom za faksimil (pregled dokumenta i usporedba prije/poslije).
 *
 * ZASTO transform, a ne mijenjanje dimenzija: stranica je u PRAVIM centimetrima
 * (`render-facsimile.ts` postavlja width/minHeight u cm), a font i margine u pt/cm. Da se zumira
 * mijenjanjem sirine, prijelomi redaka bi se pomaknuli i faksimil vise ne bi bio vjeran. `scale()`
 * skalira sve jednako, pa raspored ostaje bajt-jednak, samo manji.
 *
 * Zadano je "prilagodi sirini": puni A4 (21 cm ~ 794 px) u pola sirine modala trazi stalno
 * skrolanje, sto je i bila pritužba.
 */

export interface FacsimileZoom {
  setZoom(z: number): void;
  getZoom(): number;
  fitWidth(): void;
  fitPage(): void;
  getState(): FacsimileZoomState;
  setState(state: FacsimileZoomState): void;
  subscribe(listener: () => void): () => void;
  /** Ponovno izmjeri prirodnu visinu (nakon promjene sadrzaja). */
  remeasure(): void;
  destroy(): void;
}

export interface FacsimileZoomState {
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
}

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

export function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/**
 * Poveži zoom na skrolabilni `pane` koji sadrzi `root` (korijen faksimila).
 * Umeće omotac izmedju njih: omotac nosi VISINU (da skrolanje ostane ispravno), a `root` transform.
 */
export function attachFacsimileZoom(pane: HTMLElement, root: HTMLElement): FacsimileZoom {
  const box = pane.ownerDocument.createElement('div');
  box.className = 'lekta-fac-zoombox';
  root.parentNode?.insertBefore(box, root);
  box.appendChild(root);

  root.style.transformOrigin = 'top left';
  let zoom = 1;
  let naturalH = 0;
  let naturalW = 0;
  const listeners = new Set<() => void>();
  const pointers = new Map<number, { x: number; y: number }>();
  let panStart: { x: number; y: number; left: number; top: number } | null = null;
  let pinchStart: { distance: number; zoom: number; contentX: number; contentY: number } | null = null;

  const measure = (): void => {
    // Mjeri se BEZ transformacije, inace bi svako sljedece mjerenje bilo skalirano.
    const prev = root.style.transform;
    root.style.transform = '';
    naturalH = root.scrollHeight || root.offsetHeight || 0;
    const page = root.querySelector('.lekta-fac-page') as HTMLElement | null;
    naturalW = page?.offsetWidth || root.scrollWidth || root.offsetWidth || 0;
    root.style.transform = prev;
  };

  const apply = (): void => {
    root.style.transform = zoom === 1 ? '' : `scale(${zoom})`;
    // Omotac preuzima skaliranu visinu; bez toga transform ne mijenja skrolabilnu povrsinu
    // pa se dno dokumenta ne moze doseci (ili ostane prazan prostor kad je zoom < 1).
    box.style.height = naturalH ? `${Math.round(naturalH * zoom)}px` : '';
    box.style.width = naturalW ? `${Math.round(naturalW * zoom)}px` : '';
    for (const listener of listeners) listener();
  };

  measure();

  const fit = (includeHeight: boolean): void => {
    const availW = pane.clientWidth - 24;
    const availH = pane.clientHeight - 24;
    if (naturalW <= 0 || availW <= 0) return;
    const widthZoom = availW / naturalW;
    const heightZoom = includeHeight && naturalH > 0 && availH > 0 ? availH / naturalH : ZOOM_MAX;
    zoom = clampZoom(Math.min(widthZoom, heightZoom));
    apply();
    pane.scrollLeft = 0;
    pane.scrollTop = 0;
  };

  const api: FacsimileZoom = {
    getZoom: () => zoom,
    setZoom(z: number) { zoom = clampZoom(z); apply(); },
    fitWidth() { fit(false); },
    fitPage() { fit(true); },
    getState: () => ({ zoom, scrollLeft: pane.scrollLeft, scrollTop: pane.scrollTop }),
    setState(state: FacsimileZoomState) {
      zoom = clampZoom(state?.zoom);
      apply();
      pane.scrollLeft = Math.max(0, Number(state?.scrollLeft) || 0);
      pane.scrollTop = Math.max(0, Number(state?.scrollTop) || 0);
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); },
    remeasure() { measure(); apply(); },
    destroy() {
      pane.removeEventListener('pointerdown', onPointerDown);
      pane.removeEventListener('pointermove', onPointerMove);
      pane.removeEventListener('pointerup', onPointerEnd);
      pane.removeEventListener('pointercancel', onPointerEnd);
      listeners.clear();
      pointers.clear();
      pane.style.touchAction = '';
    },
  };

  const distance = (): number => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  };
  const midpoint = (): { x: number; y: number } => {
    const [a, b] = [...pointers.values()];
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0, y: 0 };
  };
  function onPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'touch') return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pane.setPointerCapture?.(event.pointerId);
    if (pointers.size === 1) panStart = { x: event.clientX, y: event.clientY, left: pane.scrollLeft, top: pane.scrollTop };
    if (pointers.size === 2) {
      const mid = midpoint();
      pinchStart = {
        distance: Math.max(1, distance()),
        zoom,
        contentX: (pane.scrollLeft + mid.x - pane.getBoundingClientRect().left) / zoom,
        contentY: (pane.scrollTop + mid.y - pane.getBoundingClientRect().top) / zoom,
      };
      panStart = null;
    }
  }
  function onPointerMove(event: PointerEvent): void {
    if (!pointers.has(event.pointerId)) return;
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2 && pinchStart) {
      const mid = midpoint();
      api.setZoom(pinchStart.zoom * distance() / pinchStart.distance);
      const rect = pane.getBoundingClientRect();
      pane.scrollLeft = Math.max(0, pinchStart.contentX * zoom - (mid.x - rect.left));
      pane.scrollTop = Math.max(0, pinchStart.contentY * zoom - (mid.y - rect.top));
    } else if (pointers.size === 1 && panStart) {
      pane.scrollLeft = Math.max(0, panStart.left - (event.clientX - panStart.x));
      pane.scrollTop = Math.max(0, panStart.top - (event.clientY - panStart.y));
    }
  }
  function onPointerEnd(event: PointerEvent): void {
    pointers.delete(event.pointerId);
    pinchStart = null;
    const remaining = [...pointers.values()][0];
    panStart = remaining ? { x: remaining.x, y: remaining.y, left: pane.scrollLeft, top: pane.scrollTop } : null;
  }
  pane.style.touchAction = 'none';
  pane.addEventListener('pointerdown', onPointerDown);
  pane.addEventListener('pointermove', onPointerMove);
  pane.addEventListener('pointerup', onPointerEnd);
  pane.addEventListener('pointercancel', onPointerEnd);
  return api;
}

/**
 * Traka kontrola (−, postotak, +, Prilagodi sirini). Vraca element koji pozivatelj umetne gdje zeli.
 * Jedna traka smije voditi VISE zoomova (usporedba prije/poslije mora imati isti zum u obje kolone,
 * inace se stranice ne daju usporediti).
 */
export function createZoomControls(doc: Document, targets: FacsimileZoom[]): HTMLElement {
  const bar = doc.createElement('div');
  bar.className = 'lekta-fac-zoombar';

  const label = doc.createElement('span');
  label.className = 'lekta-fac-zoomval';

  const sync = (): void => { label.textContent = `${Math.round((targets[0]?.getZoom() ?? 1) * 100)} %`; };
  const applyAll = (fn: (t: FacsimileZoom) => void): void => { for (const t of targets) fn(t); sync(); };

  const btn = (text: string, title: string, onClick: () => void): HTMLButtonElement => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-ghost btn-sm';
    b.textContent = text;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.onclick = onClick;
    return b;
  };

  bar.appendChild(btn('−', 'Smanji', () => applyAll((t) => t.setZoom(t.getZoom() - ZOOM_STEP))));
  bar.appendChild(label);
  bar.appendChild(btn('+', 'Povećaj', () => applyAll((t) => t.setZoom(t.getZoom() + ZOOM_STEP))));
  bar.appendChild(btn('Prilagodi širini', 'Cijela stranica u širinu', () => applyAll((t) => t.fitWidth())));
  bar.appendChild(btn('Cijela stranica', 'Prikaži cijelu stranicu', () => applyAll((t) => t.fitPage())));

  sync();
  for (const target of targets) target.subscribe(sync);
  return bar;
}
