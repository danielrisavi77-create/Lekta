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
  /** Ponovno izmjeri prirodnu visinu (nakon promjene sadrzaja). */
  remeasure(): void;
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

  root.style.transformOrigin = 'top center';
  let zoom = 1;
  let naturalH = 0;
  let naturalW = 0;

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
  };

  measure();

  const api: FacsimileZoom = {
    getZoom: () => zoom,
    setZoom(z: number) { zoom = clampZoom(z); apply(); },
    fitWidth() {
      // Rezerva za unutarnji razmak i eventualni okomiti scrollbar.
      const avail = pane.clientWidth - 24;
      if (naturalW > 0 && avail > 0) { zoom = clampZoom(avail / naturalW); apply(); }
    },
    remeasure() { measure(); apply(); },
  };
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
    b.onclick = onClick;
    return b;
  };

  bar.appendChild(btn('−', 'Smanji', () => applyAll((t) => t.setZoom(t.getZoom() - ZOOM_STEP))));
  bar.appendChild(label);
  bar.appendChild(btn('+', 'Povećaj', () => applyAll((t) => t.setZoom(t.getZoom() + ZOOM_STEP))));
  bar.appendChild(btn('Prilagodi širini', 'Cijela stranica u širinu', () => applyAll((t) => t.fitWidth())));

  sync();
  return bar;
}
