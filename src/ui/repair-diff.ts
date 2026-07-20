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

type PreviewModel = Parameters<typeof renderFacsimile>[0];

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
      pane.appendChild(renderFacsimile(side.model, []).root);
    } catch {
      pane.appendChild(el('p', 'empty', 'Pregled ove verzije nije dostupan.'));
    }
    col.appendChild(pane);
    grid.appendChild(col);
  }
  body.appendChild(grid);
  modal.appendChild(body);

  backdrop.appendChild(modal);
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
  document.body.appendChild(backdrop);

  // Sinkronizirano skrolanje: bez njega je usporedba dugog rada bezvrijedna jer stranice
  // odmah odu iz koraka. Zastavica sprjecava beskonacnu petlju natrag.
  const panes = Array.from(grid.querySelectorAll<HTMLElement>('.diff-pane'));
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
