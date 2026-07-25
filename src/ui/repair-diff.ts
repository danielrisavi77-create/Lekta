/**
 * "Sto je popravljeno": prikaz razlike PRIJE/POSLIJE popravka, u dva jednakovrijedna nacina.
 *
 * ZASTO OVAKO, A NE WORDOVE REVIZIJE: popravak najvise mijenja `styles.xml` (font, prored,
 * poravnanje, razmaci), a OOXML revizije (`w:ins`/`w:del`/`w:pPrChange`) postoje samo unutar
 * `document.xml`. Promjena DEFINICIJE STILA se u Wordu ne moze prikazati kao revizija, pa bi
 * dokument s ukljucenim pracenjem promjena pokazao tek mrvicu stvarnog posla i time zavarao.
 *
 * DVIJE RAZINE PRIKAZA:
 *  - Oblikovne promjene (font, prored, margine) vrijede za CIJELI dokument i nemaju jedno mjesto
 *    u tekstu, pa se prikazuju kao popis (changelog sa servera), gore.
 *  - Promjene koje STVARNO imaju lokaciju (obrisan/dodan odlomak, promijenjen tekst naslova) crtaju
 *    se u samom tekstu: lijevo (prije) crveno = uklonjeno, desno (poslije) zeleno = dodano/ispravno.
 *    Na razini rijeci gdje se tekst mijenja (npr. "Uvod" -> "UVOD").
 *
 * DVA NACINA, jer isti prikaz ne radi na svim ekranima:
 *  - "Popis promjena" (zadano na mobitelu): jedan stupac, svaka promjena kao redak s prije/poslije.
 *  - "Usporedba" (zadano na sirem ekranu): dva faksimila jedan uz drugi, s oznakama u tekstu.
 * Oznake su ISKLJUCIVO u ovom pregledu; PREUZETI .docx je uvijek cist (mijenjaju se samo bajtovi
 * dokumenta koje je popravak stvarno dirnuo, nikad ovaj prikaz).
 *
 * Lazy chunk: ucitava se tek na klik, pa faksimil renderer ne ulazi u glavni bundle.
 */

import './repair-diff.css';
import { renderFacsimile } from '../preview/render-facsimile.ts';
import { attachFacsimileZoom, createZoomControls, type FacsimileZoom } from '../preview/facsimile-zoom.ts';
import { buildDiffOps, type DiffOp, type WordToken } from './repair-diff-model.ts';

// Natrag-kompatibilni izvoz (stari kod/testovi jos uvoze locateChanges odavde).
export { locateChanges, type LocatedChange } from './repair-diff-model.ts';

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

/** Broj odlomaka u modelu; koristi se za posten sazetak "koliko ih je uklonjeno". */
function paragraphCount(model: PreviewModel): number {
  const p = (model as { paragraphs?: unknown[] } | null)?.paragraphs;
  return Array.isArray(p) ? p.length : 0;
}

function hasParagraphs(model: PreviewModel): boolean {
  return paragraphCount(model) > 0;
}

/** Labela promjene za popis: "Naslov N" / "Odlomak" / "Prazan red". */
function opLabel(op: DiffOp): string {
  if (typeof op.headingLevel === 'number' && op.headingLevel >= 1) return `Naslov ${op.headingLevel}`;
  const isBlank = op.kind === 'delete' ? !op.beforeText.trim() : op.kind === 'insert' ? !op.afterText.trim() : false;
  if (isBlank) return 'Prazan red';
  return 'Odlomak';
}

/** [start, end) rasponi promijenjenih tokena; susjedni se spajaju. Offset je znakovni, u `text`. */
function changedRanges(words: WordToken[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let off = 0;
  for (const w of words) {
    const len = w.text.length;
    if (w.changed && len > 0) {
      const last = ranges[ranges.length - 1];
      if (last && last[1] === off) last[1] = off + len;
      else ranges.push([off, off + len]);
    }
    off += len;
  }
  return ranges;
}

/**
 * Omota znakovne raspone [start,end) unutar elementa u <mark class=cls>, cuvajuci run-oblikovanje.
 * Preskace podstablo oznaka fusnota (sup[data-fn-ref]), jer njihove znamenke NISU dio para.text pa bi
 * pomaknule offsete. Obrada ide zdesna nalijevo po cvoru da splitText ne pokvari ranije offsete.
 */
function markRanges(root: HTMLElement, ranges: Array<[number, number]>, cls: string): void {
  if (!ranges.length) return;
  const doc = root.ownerDocument;
  const nodes: Array<{ node: Text; start: number; end: number }> = [];
  let off = 0;
  const walk = (n: Node): void => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === 3) {
        const len = (c as Text).data.length;
        nodes.push({ node: c as Text, start: off, end: off + len });
        off += len;
      } else if (c.nodeType === 1) {
        const elc = c as Element;
        if (elc.hasAttribute && elc.hasAttribute('data-fn-ref')) continue; // znamenka fusnote, ne tekst
        walk(c);
      }
    }
  };
  walk(root);

  for (const info of nodes) {
    const subs: Array<[number, number]> = [];
    for (const [rs, re] of ranges) {
      const a = Math.max(rs, info.start);
      const b = Math.min(re, info.end);
      if (a < b) subs.push([a - info.start, b - info.start]);
    }
    if (!subs.length) continue;
    subs.sort((x, y) => x[0] - y[0]);
    let node = info.node;
    for (let si = subs.length - 1; si >= 0; si--) {
      const [s, e] = subs[si];
      let target = node;
      if (s > 0) target = node.splitText(s); // node = [0,s), target = [s,len)
      if (e - s < target.data.length) target.splitText(e - s); // target = [s,e)
      const mark = doc.createElement('mark');
      mark.className = cls;
      target.parentNode?.insertBefore(mark, target);
      mark.appendChild(target);
      // Za sljedeci (lijevi) raspon koristimo [0,s) dio, koji je ostao u `node`.
    }
  }
}

/**
 * Oznaci jedan faksimil (jednu stranu) prema promjenama: obrisani odlomci crveno (samo lijevo),
 * dodani zeleno (samo desno), promijenjen tekst rijec po rijec crveno/zeleno na svojoj strani.
 */
function decoratePane(pane: HTMLElement, ops: DiffOp[], side: 'before' | 'after'): void {
  for (const op of ops) {
    const idx = side === 'before' ? op.before : op.after;
    if (idx == null) continue;
    const target = pane.querySelector(`[data-p-index="${idx}"]`) as HTMLElement | null;
    if (!target) continue;
    if (op.kind === 'delete') {
      target.classList.add('lekta-diff-p', 'lekta-diff-p--del');
    } else if (op.kind === 'insert') {
      target.classList.add('lekta-diff-p', 'lekta-diff-p--ins');
    } else {
      target.classList.add('lekta-diff-p', side === 'before' ? 'lekta-diff-p--chg-del' : 'lekta-diff-p--chg-ins');
      const words = side === 'before' ? op.beforeWords : op.afterWords;
      if (words) markRanges(target, changedRanges(words), side === 'before' ? 'lekta-diff-w lekta-diff-w--del' : 'lekta-diff-w lekta-diff-w--ins');
    }
  }
}

/** Dodaj tokene (rijeci) u redak popisa; promijenjeni dobivaju oznaku boje, ostali su obican tekst. */
function appendWords(container: HTMLElement, words: WordToken[], cls: string): void {
  for (const w of words) {
    if (w.changed && w.text.trim()) {
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = w.text;
      container.appendChild(s);
    } else {
      container.appendChild(document.createTextNode(w.text));
    }
  }
}

const LIST_TEXT_CAP = 160;
function shortText(t: string): string {
  const s = t.trim();
  return s.length > LIST_TEXT_CAP ? s.slice(0, LIST_TEXT_CAP - 1) + '…' : s;
}

/** Sagradi "Popis promjena": jedan stupac, svaka promjena kao redak s prije/poslije. Mobilni default. */
function buildList(ops: DiffOp[]): HTMLElement {
  const list = el('ol', 'lekta-diff-list');
  for (const op of ops) {
    const li = el('li', 'lekta-diff-item');
    li.appendChild(el('span', 'lekta-diff-item-tag', opLabel(op)));
    const rows = el('div', 'lekta-diff-item-rows');
    if (op.kind === 'replace') {
      const before = el('p', 'lekta-diff-line lekta-diff-line--before');
      appendWords(before, op.beforeWords ?? [{ text: op.beforeText, changed: true }], 'lekta-diff-w lekta-diff-w--del');
      const after = el('p', 'lekta-diff-line lekta-diff-line--after');
      appendWords(after, op.afterWords ?? [{ text: op.afterText, changed: true }], 'lekta-diff-w lekta-diff-w--ins');
      rows.appendChild(before);
      rows.appendChild(after);
    } else if (op.kind === 'delete') {
      const line = el('p', 'lekta-diff-line lekta-diff-line--before');
      line.appendChild(el('span', 'lekta-diff-kind', 'Uklonjeno'));
      line.appendChild(document.createTextNode(op.beforeText.trim() ? ' ' + shortText(op.beforeText) : ' (prazan odlomak)'));
      rows.appendChild(line);
    } else {
      const line = el('p', 'lekta-diff-line lekta-diff-line--after');
      line.appendChild(el('span', 'lekta-diff-kind', 'Dodano'));
      line.appendChild(document.createTextNode(op.afterText.trim() ? ' ' + shortText(op.afterText) : ' (prazan odlomak)'));
      rows.appendChild(line);
    }
    li.appendChild(rows);
    list.appendChild(li);
  }
  return list;
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

  // Oblikovne promjene (font, margine, prored...) dolaze sa servera i vrijede za cijeli dokument.
  // Prazan changelog se ne prikazuje umjesto da pise "0 promjena".
  if (opts.changelog.length) {
    const wrap = el('div', 'lekta-diff-formatting');
    wrap.appendChild(el('p', 'lekta-diff-formatting-head', 'Oblikovanje (vrijedi za cijeli dokument):'));
    const clist = el('ul', 'diff-changelog');
    for (const c of opts.changelog) {
      const li = el('li');
      li.appendChild(el('span', 'diff-before', c.beforeLabel || c.ruleId));
      li.appendChild(el('span', 'diff-arrow', ' → '));
      li.appendChild(el('strong', 'diff-after', c.afterLabel));
      clist.appendChild(li);
    }
    wrap.appendChild(clist);
    body.appendChild(wrap);
  }

  const ops = buildDiffOps(opts.before, opts.after);
  const canCompare = hasParagraphs(opts.before) && hasParagraphs(opts.after);

  // Kad nema odlomaka ni s jedne strane (npr. ponovna analiza nije uspjela), ne lazi da su promjene
  // "samo oblikovne": jasno reci da usporedba teksta nije dostupna.
  if (!canCompare) {
    if (!opts.changelog.length) {
      body.appendChild(el('p', 'diff-note', 'Popravljeni dokument je preuzet, ali usporedba prije/poslije na ovom uređaju nije dostupna.'));
    } else {
      body.appendChild(el('p', 'diff-note', 'Promjene su oblikovne (gore) i vrijede za cijeli dokument.'));
    }
    modal.appendChild(body);
    backdrop.appendChild(modal);
    backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
    document.body.appendChild(backdrop);
    return;
  }

  if (ops.length === 0) {
    body.appendChild(el('p', 'diff-note', opts.changelog.length
      ? 'U tekstu nema promjena; sve je oblikovne naravi (gore) i vrijedi za cijeli dokument.'
      : 'U tekstu nema promjena.'));
  }

  // Prebacivac nacina prikaza (isti obrazac kao preview modal): Popis / Usporedba.
  const startMobile = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 720px)').matches;
  let mode: 'popis' | 'usporedba' = startMobile ? 'popis' : 'usporedba';

  const modes = el('div', 'preview-modes lekta-diff-modes');
  modes.setAttribute('role', 'tablist');
  modes.setAttribute('aria-label', 'Način prikaza razlike');
  const listBtn = el('button', 'pv-mode', ops.length ? `Popis promjena (${ops.length})` : 'Popis promjena') as HTMLButtonElement;
  const cmpBtn = el('button', 'pv-mode', 'Usporedba') as HTMLButtonElement;
  for (const b of [listBtn, cmpBtn]) { b.type = 'button'; b.setAttribute('role', 'tab'); }

  const viewHost = el('div', 'lekta-diff-viewhost');
  const zooms: FacsimileZoom[] = [];
  let zoombar: HTMLElement | null = null;
  let gridBuilt: HTMLElement | null = null;
  let panes: HTMLElement[] = [];

  // Popis se gradi odmah (jeftino). Usporedba (dva faksimila) se gradi lijeno, na prvi prijelaz.
  const listView = ops.length ? buildList(ops) : el('p', 'diff-note', 'Nema promjena u tekstu za prikaz.');

  const buildGrid = (): HTMLElement => {
    if (gridBuilt) return gridBuilt;
    const grid = el('div', 'diff-grid');
    panes = [];
    for (const side of [
      { label: 'Prije', model: opts.before, cls: 'diff-col--before' as const, which: 'before' as const },
      { label: 'Poslije', model: opts.after, cls: 'diff-col--after' as const, which: 'after' as const },
    ]) {
      const col = el('div', `diff-col ${side.cls}`);
      col.appendChild(el('h4', 'diff-col-title', side.label));
      const pane = el('div', 'diff-pane');
      try {
        // Bez oznaka nalaza (prazan flags): ovdje se usporedjuje POPRAVAK, a ne analiza.
        const rootEl = renderFacsimile(side.model, []).root;
        pane.appendChild(rootEl);
        decoratePane(pane, ops, side.which); // oznake se dodaju PRIJE zooma (ispravna izmjerena visina)
        zooms.push(attachFacsimileZoom(pane, rootEl));
      } catch {
        pane.appendChild(el('p', 'empty', 'Pregled ove verzije nije dostupan.'));
      }
      col.appendChild(pane);
      panes.push(pane);
      grid.appendChild(col);
    }

    // Sinkronizirano skrolanje: bez njega je usporedba dugog rada bezvrijedna. Zastavica sprjecava petlju.
    let syncing = false;
    for (const pane of panes) {
      pane.addEventListener('scroll', () => {
        if (syncing) return;
        syncing = true;
        for (const other of panes) if (other !== pane) other.scrollTop = pane.scrollTop;
        requestAnimationFrame(() => { syncing = false; });
      });
    }
    gridBuilt = grid;
    return grid;
  };

  const jumpTo = (change: DiffOp): void => {
    const idx = [change.before, change.after];
    panes.forEach((pane, k) => {
      const n = idx[k];
      if (n == null) return;
      const t = pane.querySelector(`[data-p-index="${n}"]`) as HTMLElement | null;
      if (!t) return;
      t.scrollIntoView({ block: 'center', behavior: 'auto' });
      t.classList.remove('lekta-diff-flash');
      void t.offsetWidth;
      t.classList.add('lekta-diff-flash');
    });
  };

  // Navigacija "Mjesta promjena" (samo u usporedbi; u popisu je svaka promjena vec vidljiv redak).
  const nav = el('div', 'diff-jumps');
  if (ops.length) {
    nav.appendChild(el('span', 'diff-jumps-label', `Skoči na promjenu:`));
    ops.forEach((op, n) => {
      const b = el('button', 'btn btn-ghost btn-sm', String(n + 1)) as HTMLButtonElement;
      b.type = 'button';
      b.title = opLabel(op);
      b.onclick = () => jumpTo(op);
      nav.appendChild(b);
    });
  }

  const setMode = (next: 'popis' | 'usporedba'): void => {
    mode = next;
    listBtn.classList.toggle('is-active', next === 'popis');
    cmpBtn.classList.toggle('is-active', next === 'usporedba');
    listBtn.setAttribute('aria-selected', next === 'popis' ? 'true' : 'false');
    cmpBtn.setAttribute('aria-selected', next === 'usporedba' ? 'true' : 'false');
    viewHost.textContent = '';
    if (next === 'popis') {
      viewHost.appendChild(listView);
      nav.style.display = 'none';
      if (zoombar) zoombar.style.display = 'none';
    } else {
      const grid = buildGrid();
      // Zoom traka i skokovi tek kad grid postoji i JEDNOM (kontrole vode obje kolone).
      if (!zoombar && zooms.length) {
        zoombar = createZoomControls(document, zooms);
        head.insertBefore(zoombar, head.lastChild);
      }
      if (zoombar) zoombar.style.display = '';
      nav.style.display = ops.length ? '' : 'none';
      viewHost.appendChild(grid);
      // Zoom mora mjeriti tek nakon umetanja u DOM (prije toga pane nema sirinu).
      for (const z of zooms) { z.remeasure(); z.fitWidth(); }
    }
  };

  listBtn.onclick = () => setMode('popis');
  cmpBtn.onclick = () => setMode('usporedba');
  modes.appendChild(listBtn);
  modes.appendChild(cmpBtn);

  // Prebacivac je uvijek dostupan kad usporedba postoji: i kad su promjene samo oblikovne, korisnik
  // moze prijeci na faksimil i vidjeti ih jedan uz drugi.
  body.appendChild(modes);
  body.appendChild(nav);
  body.appendChild(viewHost);
  modal.appendChild(body);

  backdrop.appendChild(modal);
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
  document.body.appendChild(backdrop);

  setMode(mode);
  if (mode === 'usporedba' && ops.length) requestAnimationFrame(() => jumpTo(ops[0]));
}
