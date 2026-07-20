/**
 * "Pokaži što je popravljeno": faksimil PRIJE i POSLIJE, jedan uz drugi.
 *
 * ZASTO OVAKO, A NE WORDOVE REVIZIJE: popravak najvise mijenja `styles.xml` (font, prored,
 * poravnanje, razmaci), a OOXML revizije (`w:ins`/`w:del`/`w:pPrChange`) postoje samo unutar
 * `document.xml`. Promjena DEFINICIJE STILA se u Wordu ne moze prikazati kao revizija, pa bi
 * dokument s ukljucenim pracenjem promjena pokazao tek mrvicu stvarnog posla i time zavarao.
 * Faksimil pokazuje ucinak onako kako ga korisnik zapravo vidi, ukljucujuci i te promjene.
 *
 * Lazy chunk: ucitava se tek na klik, pa faksimil renderer ne ulazi u glavni bundle.
 */

import './repair-diff.css';
import { renderFacsimile } from '../preview/render-facsimile.ts';
import { attachFacsimileZoom, createZoomControls, type FacsimileZoom } from '../preview/facsimile-zoom.ts';

type PreviewModel = Parameters<typeof renderFacsimile>[0];

/** Mjesto strukturne promjene: indeksi odlomka u modelu prije i poslije (mogu se razlikovati). */
export interface LocatedChange {
  before: number | null;
  after: number | null;
}

/**
 * Nadji GDJE se dokument strukturno promijenio, usporedbom teksta odlomaka.
 *
 * Serverski changelog kaze STO je popravljeno, ali ne i gdje: promjene stila (font, prored,
 * margine) vrijede za cijeli dokument i nemaju jedno mjesto. Locirati se daju samo strukturne
 * promjene (obrisani prazni odlomci, umetnut Sadrzaj ili prijelom sekcije), i to bas usporedbom
 * teksta. Nakon razlike se pokusava resinkronizirati, da jedan obrisan odlomak ne prijavi sve
 * ostale kao promijenjene.
 *
 * Cista funkcija (bez DOM-a) da se ponasanje moze testirati.
 */
export function locateChanges(before: PreviewModel, after: PreviewModel, limit = 50): LocatedChange[] {
  const b = ((before as { paragraphs?: Array<{ index: number; text: string }> })?.paragraphs) ?? [];
  const a = ((after as { paragraphs?: Array<{ index: number; text: string }> })?.paragraphs) ?? [];
  const out: LocatedChange[] = [];
  let i = 0;
  let j = 0;
  while (i < b.length && j < a.length && out.length < limit) {
    if (b[i].text === a[j].text) { i++; j++; continue; }
    out.push({ before: b[i]?.index ?? null, after: a[j]?.index ?? null });
    // Resinkronizacija: odlomak obrisan (pomakni "prije") ili umetnut (pomakni "poslije").
    if (b[i + 1] && b[i + 1].text === a[j].text) { i++; continue; }
    if (a[j + 1] && a[j + 1].text === b[i].text) { j++; continue; }
    i++; j++;
  }
  // Rep: ostatak jednog modela znaci dodano/obrisano na kraju.
  if (out.length < limit && (i < b.length || j < a.length)) {
    out.push({ before: i < b.length ? (b[i]?.index ?? null) : null, after: j < a.length ? (a[j]?.index ?? null) : null });
  }
  return out;
}

export interface RepairChange {
  ruleId: string;
  beforeLabel: string;
  afterLabel: string;
}

export interface RepairDiffOptions {
  before: PreviewModel;
  after: PreviewModel;
  changelog: RepairChange[];
  fileName?: string;
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Broj odlomaka u modelu; koristi se samo za posten sazetak "koliko ih je uklonjeno". */
function paragraphCount(model: PreviewModel): number {
  const p = (model as { paragraphs?: unknown[] } | null)?.paragraphs;
  return Array.isArray(p) ? p.length : 0;
}

export function openRepairDiff(opts: RepairDiffOptions): void {
  document.getElementById('repairDiff')?.remove();

  const backdrop = el('div', 'modal-backdrop');
  backdrop.id = 'repairDiff';
  const modal = el('div', 'modal modal--diff');

  const head = el('div', 'modal-head');
  head.appendChild(el('h3', undefined, 'Što je popravljeno'));
  const close = el('button', 'btn btn-ghost btn-sm', 'Zatvori') as HTMLButtonElement;
  close.type = 'button';
  close.onclick = () => backdrop.remove();
  head.appendChild(close);
  modal.appendChild(head);

  const body = el('div', 'modal-body');

  // Popis promjena: dolazi sa servera (changelog), pa pokriva i ono sto se na stranici tesko vidi
  // (npr. margine). Prazan changelog se ne prikazuje umjesto da pise "0 promjena".
  if (opts.changelog.length) {
    const list = el('ul', 'diff-changelog');
    for (const c of opts.changelog) {
      const li = el('li');
      li.appendChild(el('span', 'diff-before', c.beforeLabel || c.ruleId));
      li.appendChild(el('span', 'diff-arrow', ' → '));
      li.appendChild(el('strong', 'diff-after', c.afterLabel));
      list.appendChild(li);
    }
    body.appendChild(list);
  }

  const removed = paragraphCount(opts.before) - paragraphCount(opts.after);
  if (removed > 0) {
    body.appendChild(el('p', 'diff-note', `Uklonjeno praznih odlomaka: ${removed}.`));
  }

  const grid = el('div', 'diff-grid');
  const zooms: FacsimileZoom[] = [];
  const panes: HTMLElement[] = [];
  for (const side of [
    { label: 'Prije', model: opts.before, cls: 'diff-col--before' },
    { label: 'Poslije', model: opts.after, cls: 'diff-col--after' },
  ]) {
    const col = el('div', `diff-col ${side.cls}`);
    col.appendChild(el('h4', 'diff-col-title', side.label));
    const pane = el('div', 'diff-pane');
    try {
      // Bez oznaka nalaza (prazan flags): ovdje se usporedjuje OBLIKOVANJE, pa bi crvene tocke
      // iz analize samo odvlacile paznju s onoga sto se stvarno promijenilo.
      const root = renderFacsimile(side.model, []).root;
      pane.appendChild(root);
      zooms.push(attachFacsimileZoom(pane, root));
    } catch {
      pane.appendChild(el('p', 'empty', 'Pregled ove verzije nije dostupan.'));
    }
    col.appendChild(pane);
    panes.push(pane);
    grid.appendChild(col);
  }
  body.appendChild(grid);
  modal.appendChild(body);

  backdrop.appendChild(modal);
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
  document.body.appendChild(backdrop);

  // Zoom tek nakon umetanja u DOM: prije toga pane nema sirinu pa "prilagodi sirini" ne moze racunati.
  // Jedna traka vodi OBJE kolone; razlicit zum lijevo i desno ucinio bi usporedbu besmislenom.
  if (zooms.length) {
    head.insertBefore(createZoomControls(document, zooms), head.lastChild);
    for (const z of zooms) { z.remeasure(); z.fitWidth(); }
  }

  // Skok na mjesto promjene: faksimil svakom odlomku vec daje data-p-index, pa nije trebalo
  // dirati renderer. Obje kolone skacu zajedno, svaka na svoj indeks (razlikuju se kad je
  // odlomak obrisan).
  const jumpTo = (change: LocatedChange): void => {
    const idx = [change.before, change.after];
    panes.forEach((pane, k) => {
      const n = idx[k];
      if (n == null) return;
      const target = pane.querySelector(`[data-p-index="${n}"]`) as HTMLElement | null;
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: 'auto' });
      target.classList.remove('repair-flash');
      void target.offsetWidth;
      target.classList.add('repair-flash');
    });
  };

  const located = locateChanges(opts.before, opts.after);
  if (located.length) {
    const nav = el('div', 'diff-jumps');
    nav.appendChild(el('span', 'diff-jumps-label', `Mjesta promjena (${located.length}):`));
    located.forEach((c, n) => {
      const b = el('button', 'btn btn-ghost btn-sm', String(n + 1)) as HTMLButtonElement;
      b.type = 'button';
      b.title = 'Skoči na ovu promjenu';
      b.onclick = () => jumpTo(c);
      nav.appendChild(b);
    });
    body.insertBefore(nav, grid);
    // Otvori odmah na prvoj promjeni, da se ne mora tražiti skrolanjem.
    requestAnimationFrame(() => jumpTo(located[0]));
  } else {
    body.insertBefore(
      el('p', 'diff-note', 'Promjene su oblikovne (font, prored, margine) i vrijede za cijeli dokument, pa nemaju jedno mjesto u tekstu.'),
      grid,
    );
  }

  // Sinkronizirano skrolanje: bez njega je usporedba dugog rada bezvrijedna jer stranice
  // odmah odu iz koraka. Zastavica sprjecava beskonacnu petlju natrag.
  let syncing = false;
  for (const pane of panes) {
    pane.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      for (const other of panes) if (other !== pane) other.scrollTop = pane.scrollTop;
      requestAnimationFrame(() => { syncing = false; });
    });
  }
}
