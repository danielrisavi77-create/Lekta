/**
 * Renderer "Vjernog prikaza" (faksimil) za preview modal, druga verzija pored MVP "Oznacenog
 * pregleda" (render-preview.ts). Obje verzije koegzistiraju: MVP je citljiv tijek teksta, faksimil
 * dodaje layout stranice (A4 sirina + prave margine iz sectPr), stvaran bazni font/velicinu,
 * run-oblikovanje (bold/italic/font/velicina po runu), PAGINACIJU (podjela na listove po prijelomima
 * stranica iz dokumenta, s brojevima stranica) i fusnote u stvarnom oblikovanju.
 *
 * Cista funkcija bez mreze i globalnog stanja; testabilna u happy-dom. XSS-safe po konstrukciji:
 * SAV tekst dokumenta ide kroz createTextNode/textContent (nikad innerHTML), a oblikovanje se
 * postavlja preko element.style.* (CSP dopusta 'unsafe-inline' za style-src, ne za script-src).
 *
 * Dva neovisna sloja nad istim tekstom (odlomka ili fusnote):
 *   1) run-formatiranje: iz `runs`, rekonstruirano nad `text` (ground truth) indexOf-obilaskom;
 *      runovi koji se ne nadju gube samo OBLIKOVANJE, nikad tekst. root.textContent == izvorni tekst.
 *   2) highlight: isjecci nalaza omotani u <mark> (crveno/zuto/plavo), identicno render-preview.ts.
 * Sloj 1 i 2 spajaju se tako da <mark> nosi <span>-ove oblikovanja unutar sebe (npr. bold + zuto).
 *
 * Paginacija (A): dokument OOXML ne nosi prave prijelome stranica osim eksplicitnih (w:br type=page)
 * i Wordovih hintova (lastRenderedPageBreak). Dijelimo na listove po `pageBreakAfter` (koji ih oba
 * pokriva); gdje hintova nema, dokument je jedan dugi list. Ovo je faithful gdje Word ima zabiljezene
 * prijelome, a caption posteno kaze da se prijelomi mogu razlikovati. Fusnote idu na dno ZADNJEG lista.
 *
 * Vraca isti oblik kao render-preview (root, flagTargets, locatedCount) pa bocna lista nalaza i
 * skrolanje u src/ui/app.ts rade bez ijedne izmjene.
 */
import type {
  PreviewFlag,
  PreviewParagraph,
  PreviewSeverity,
  PreviewRun,
  PreviewModel,
  PreviewFootnoteMark,
} from './preview-anchors';
import type { RenderedPreview } from './render-preview';

const SEVERITY_RANK: Record<PreviewSeverity, number> = { error: 3, warning: 2, info: 1 };

/** Zadane vrijednosti kad sectPr/dominant podatci nedostaju (A4, standardne margine, TNR 12). */
const DEFAULT_PAGE_W_CM = 21;
const DEFAULT_PAGE_H_CM = 29.7;
const DEFAULT_MARGIN_CM = 2.5;
const DEFAULT_BASE_SIZE_PT = 12;
const DEFAULT_BASE_FONT = 'Times New Roman';

/** Grubi popis serifnih obitelji za izbor fallback stoga; sve ostalo tretiramo kao bezserifno. */
const SERIF_HINTS = ['times', 'serif', 'georgia', 'garamond', 'minion', 'cambria', 'book antiqua', 'palatino', 'liberation serif'];

function isSerif(font: string | null | undefined): boolean {
  const f = (font || '').toLowerCase();
  return SERIF_HINTS.some((h) => f.includes(h));
}

/** CSS font-family stog: trazena obitelj (navedena) + razuman fallback po serif/bezserif klasi.
 *  Iz fallbacka izbacuje obitelj jednaku trazenoj da se ne pojavi dvaput (npr. Arial + Arial). */
function fontStack(font: string | null | undefined): string {
  const name = (font || '').trim().replace(/"/g, '');
  const fb = isSerif(name)
    ? ['"Liberation Serif"', 'Georgia', '"Times New Roman"', 'serif']
    : ['"Liberation Sans"', 'Arial', 'Helvetica', 'sans-serif'];
  if (!name) return fb.join(', ');
  const low = name.toLowerCase();
  const rest = fb.filter((f) => f.replace(/"/g, '').toLowerCase() !== low);
  return `"${name}", ${rest.join(', ')}`;
}

function normFont(font: string | null | undefined): string {
  return (font || '').trim().toLowerCase();
}

interface FlagEntry {
  flag: PreviewFlag;
  flagIndex: number;
}

/** Efektivni bazni stil; run se usporedjuje s njim da se izbjegnu suvisni <span>.
 *  applySize=false (fusnote): ne primjenjuj razlike u velicini (CSS skalira cijeli odjeljak). */
interface BaseStyle {
  font: string;
  size: number;
  applySize?: boolean;
}

interface FmtSeg {
  start: number;
  end: number;
  run: PreviewRun | null; // null = bazni stil (prazan raspon izmedju runova)
}

interface MergedRange {
  start: number;
  end: number;
  entries: FlagEntry[];
}

function topSeverity(entries: FlagEntry[]): PreviewSeverity {
  let best: PreviewSeverity = 'info';
  for (const { flag } of entries) if (SEVERITY_RANK[flag.severity] > SEVERITY_RANK[best]) best = flag.severity;
  return best;
}

/** Ime elementa za odlomak: naslovi 1..6 -> h1..h6 (klamp), ostalo -> p. */
function paragraphTag(headingLevel: number | null | undefined): string {
  if (typeof headingLevel === 'number' && headingLevel >= 1) return 'h' + Math.min(6, Math.floor(headingLevel));
  return 'p';
}

/** OOXML w:jc -> CSS text-align (vraca null kad je zadano/lijevo, da se ne postavlja suvisno). */
function alignToCss(align: string | null | undefined): string | null {
  switch ((align || '').toLowerCase()) {
    case 'both':
    case 'distribute':
      return 'justify';
    case 'center':
      return 'center';
    case 'right':
    case 'end':
      return 'right';
    default:
      return null;
  }
}

/**
 * Rekonstruira segmente oblikovanja nad `text` iz `runs`. Svaki run se trazi indexOf-om od kursora
 * (pa se ponovljeni identican run veze za sljedecu pojavu); praznine izmedju su bazni stil, cime je
 * cijeli raspon [0, N) pokriven bez rupa. Run koji se ne nadje (ni triman) preskace se: njegov tekst
 * ostaje pokriven baznim segmentom, dakle tekst se NE gubi, samo oblikovanje tog runa.
 */
function buildFmtSegs(text: string, runs: PreviewRun[] | undefined): FmtSeg[] {
  const N = text.length;
  if (!Array.isArray(runs) || !runs.length || !N) return [{ start: 0, end: N, run: null }];
  const segs: FmtSeg[] = [];
  let cursor = 0;
  for (const r of runs) {
    if (cursor >= N) break;
    const raw = r && typeof r.text === 'string' ? r.text : '';
    if (!raw) continue;
    let idx = text.indexOf(raw, cursor);
    let len = raw.length;
    if (idx < 0) {
      const trimmed = raw.trim();
      if (trimmed) {
        idx = text.indexOf(trimmed, cursor);
        len = trimmed.length;
      }
    }
    if (idx < 0) continue; // run nije lociran: preskace se (tekst pokriva bazni segment)
    if (idx > cursor) segs.push({ start: cursor, end: idx, run: null });
    segs.push({ start: idx, end: idx + len, run: r });
    cursor = idx + len;
  }
  if (cursor < N) segs.push({ start: cursor, end: N, run: null });
  if (!segs.length) segs.push({ start: 0, end: N, run: null });
  return segs;
}

/** Postavi razlike runa u odnosu na bazni stil na `span` (samo ono sto stvarno odstupa). */
function applyRunStyle(span: HTMLElement, run: PreviewRun, base: BaseStyle): void {
  if (run.bold) span.style.fontWeight = '700';
  if (run.italic) span.style.fontStyle = 'italic';
  if (run.font && normFont(run.font) !== normFont(base.font)) span.style.fontFamily = fontStack(run.font);
  if (base.applySize !== false && typeof run.size === 'number' && run.size > 0 && run.size !== base.size) span.style.fontSize = run.size + 'pt';
  const deco: string[] = [];
  if (run.underline) deco.push('underline');
  if (run.strike) deco.push('line-through');
  if (deco.length) span.style.textDecoration = deco.join(' ');
  if (run.caps) span.style.textTransform = 'uppercase'; // w:caps: prikazi velikim, tekst ostaje unesen
  else if (run.smallCaps) span.style.fontVariant = 'small-caps';
  if (run.color) span.style.color = run.color;
}

/** True ako run nema vidljive razlike od baznog stila (renderira se kao goli tekstni cvor). */
function runIsBase(run: PreviewRun | null, base: BaseStyle): boolean {
  if (!run) return true;
  if (run.bold || run.italic) return false;
  if (run.underline || run.strike || run.caps || run.smallCaps || run.color) return false;
  if (run.font && normFont(run.font) !== normFont(base.font)) return false;
  if (base.applySize !== false && typeof run.size === 'number' && run.size > 0 && run.size !== base.size) return false;
  return true;
}

/** Dodaj komad teksta[c1,c2) kao goli cvor (bazni stil) ili <span> (odstupanje od baze). */
function emitPiece(container: HTMLElement, text: string, c1: number, c2: number, run: PreviewRun | null, base: BaseStyle, doc: Document): void {
  if (c2 <= c1) return;
  const piece = text.slice(c1, c2);
  if (runIsBase(run, base)) {
    container.appendChild(doc.createTextNode(piece));
  } else {
    const span = doc.createElement('span');
    applyRunStyle(span, run as PreviewRun, base);
    span.textContent = piece;
    container.appendChild(span);
  }
}

/** Ubaci superscript broj fusnote (in-text marker) u `container`. */
function emitFootnoteMark(container: HTMLElement, id: number, doc: Document): void {
  const sup = doc.createElement('sup');
  sup.className = 'lekta-fac-fnmark';
  sup.setAttribute('data-fn-ref', String(id));
  sup.textContent = String(id);
  container.appendChild(sup);
}

/**
 * U `container` dodaje tekst[from, to), podijeljen po segmentima oblikovanja `segs`: bazni dijelovi
 * kao tekstni cvorovi, ostali kao <span> sa stilom. Ubacuje in-text oznake fusnota (`markers`, sortirane
 * po offsetu) na tocnom mjestu. Poziva se i za goli dio odlomka i za unutrasnjost <mark>-a, pa se
 * oblikovanje, highlight i marker ispravno gnijezde. Marker na offsetu == `to` obradjuje pozivatelj.
 */
function appendStyledText(
  container: HTMLElement,
  text: string,
  from: number,
  to: number,
  segs: FmtSeg[],
  base: BaseStyle,
  doc: Document,
  markers: PreviewFootnoteMark[] | null,
): void {
  if (to <= from) return;
  for (const seg of segs) {
    if (seg.end <= from || seg.start >= to) continue;
    const a = Math.max(seg.start, from);
    const b = Math.min(seg.end, to);
    if (a >= b) continue;
    let cur = a;
    if (markers) {
      for (const mk of markers) {
        if (mk.offset < a || mk.offset >= b) continue; // [a, b): marker na granici pripada sljedecem segmentu
        if (mk.offset > cur) emitPiece(container, text, cur, mk.offset, seg.run, base, doc);
        emitFootnoteMark(container, mk.id, doc);
        cur = mk.offset;
      }
    }
    if (cur < b) emitPiece(container, text, cur, b, seg.run, base, doc);
  }
}

/**
 * Ispuni element: run-oblikovanje + <mark> oko lociranih isjecaka nad `text`/`runs`. Vraca flag-
 * entrije cija lokacija nije nadjena (prazan isjecak ili podniz ne postoji) da ih pozivatelj sidri na
 * razinu elementa. Isti kod za tijelo i fusnote (fusnote prosljedjuju bazu s applySize=false).
 */
function fillFormatted(
  el: HTMLElement,
  text: string,
  runs: PreviewRun[] | undefined,
  entries: FlagEntry[],
  base: BaseStyle,
  doc: Document,
  flagTargets: Map<number, HTMLElement>,
  markers?: PreviewFootnoteMark[],
): FlagEntry[] {
  const segs = buildFmtSegs(text, runs);
  const mk = markers && markers.length ? [...markers].sort((a, b) => a.offset - b.offset) : null;
  const located: MergedRange[] = [];
  const unlocated: FlagEntry[] = [];
  for (const entry of entries) {
    const ex = entry.flag.excerpt;
    const idx = ex ? text.indexOf(ex) : -1;
    if (idx >= 0) located.push({ start: idx, end: idx + ex.length, entries: [entry] });
    else unlocated.push(entry);
  }

  if (located.length === 0) {
    appendStyledText(el, text, 0, text.length, segs, base, doc, mk);
  } else {
    located.sort((a, b) => a.start - b.start || a.end - b.end);
    const merged: MergedRange[] = [];
    for (const r of located) {
      const last = merged[merged.length - 1];
      if (last && r.start < last.end) {
        last.end = Math.max(last.end, r.end);
        last.entries.push(...r.entries);
      } else {
        merged.push({ start: r.start, end: r.end, entries: [...r.entries] });
      }
    }

    let cursor = 0;
    for (const m of merged) {
      if (m.start > cursor) appendStyledText(el, text, cursor, m.start, segs, base, doc, mk);
      const sev = topSeverity(m.entries);
      const mark = doc.createElement('mark');
      mark.className = `lekta-flag lekta-flag--${sev}`;
      mark.setAttribute('data-flag-severity', sev);
      const titles = [...new Set(m.entries.map((e) => e.flag.title))].join('; ');
      if (titles) mark.title = titles;
      appendStyledText(mark, text, m.start, m.end, segs, base, doc, mk);
      el.appendChild(mark);
      for (const e of m.entries) flagTargets.set(e.flagIndex, mark);
      cursor = m.end;
    }
    if (cursor < text.length) appendStyledText(el, text, cursor, text.length, segs, base, doc, mk);
  }

  // Oznake fusnota na samom kraju odlomka (offset == duljina teksta): appendStyledText ih ne emitira
  // (raspon je [a, b) pa je krajnji offset iskljucen), pa ih dodajemo ovdje, nakon svog teksta.
  if (mk) for (const m of mk) if (m.offset >= text.length) emitFootnoteMark(el, m.id, doc);

  return unlocated;
}

function cmOrNull(v: number | null | undefined): number | null {
  return typeof v === 'number' && isFinite(v) && v > 0 ? v : null;
}

/** Napravi jedan A4 list sa sirinom, marginama (padding) i baznom tipografijom. */
function makeSheet(model: PreviewModel, base: BaseStyle, doc: Document): HTMLElement {
  const page = doc.createElement('div');
  page.className = 'lekta-fac-page';
  page.style.width = (cmOrNull(model?.page?.size?.w) ?? DEFAULT_PAGE_W_CM) + 'cm';
  page.style.minHeight = (cmOrNull(model?.page?.size?.h) ?? DEFAULT_PAGE_H_CM) + 'cm';
  const m = model?.page?.margins || null;
  page.style.paddingTop = (cmOrNull(m?.top) ?? DEFAULT_MARGIN_CM) + 'cm';
  page.style.paddingRight = (cmOrNull(m?.right) ?? DEFAULT_MARGIN_CM) + 'cm';
  page.style.paddingBottom = (cmOrNull(m?.bottom) ?? DEFAULT_MARGIN_CM) + 'cm';
  page.style.paddingLeft = (cmOrNull(m?.left) ?? DEFAULT_MARGIN_CM) + 'cm';
  page.style.fontFamily = fontStack(base.font);
  page.style.fontSize = base.size + 'pt';
  return page;
}

/** Dodaj odlomak (body) na dani list. */
/**
 * Je li odlomak redak Sadrzaja: naslov, tabulator, pa SAMO broj stranice do kraja.
 * Namjerno usko (broj mora biti zadnji): obicni tabulatori usred recenice se ne diraju.
 */
function isTocLine(text: string): boolean {
  return /\t[ \t]*\d+[ \t]*$/.test(text);
}

/**
 * Pretvori redak Sadrzaja u "naslov ....... broj": tabulator se OMOTA u `.lekta-fac-toc-lead`,
 * koji preko CSS-a (flex:1 + isprekidani rub) crta tockice i gura broj na desnu marginu.
 *
 * INTEGRITET: tabulator ostaje kao TEKST unutar spana, a tockice su rub (ne znakovi), pa
 * `root.textContent` ostaje bajt-identican izvornom tekstu (invarijanta iz zaglavlja modula).
 * Word leader crta prema tab-stopu, kojeg u modelu nemamo; ovo je najbliza vjerna rekonstrukcija.
 */
function applyTocLeader(el: HTMLElement, doc: Document): void {
  let target: Text | null = null;
  const walk = (n: Node): void => {
    for (const child of Array.from(n.childNodes)) {
      if (child.nodeType === 3) {
        if ((child as Text).data.includes('\t')) target = child as Text;
      } else walk(child);
    }
  };
  walk(el);
  if (!target) return;

  const node: Text = target;
  const at = node.data.lastIndexOf('\t');
  if (at < 0) return;
  const tabNode = node.splitText(at); // tabNode pocinje tabulatorom
  tabNode.splitText(1);               // odvoji broj stranice u svoj cvor
  const lead = doc.createElement('span');
  lead.className = 'lekta-fac-toc-lead';
  tabNode.parentNode?.insertBefore(lead, tabNode);
  lead.appendChild(tabNode);
  el.classList.add('lekta-fac-toc');
}

function appendParagraph(
  container: HTMLElement,
  para: PreviewParagraph,
  byPara: Map<number, FlagEntry[]>,
  base: BaseStyle,
  doc: Document,
  flagTargets: Map<number, HTMLElement>,
): void {
  const el = doc.createElement(paragraphTag(para.headingLevel));
  el.id = `lekta-fac-p-${para.index}`;
  el.setAttribute('data-p-index', String(para.index));
  el.className = para.headingLevel ? 'lekta-fac-heading' : 'lekta-fac-para';
  const alignCss = alignToCss(para.align);
  if (alignCss) el.style.textAlign = alignCss;

  // Stvarna velicina odlomka: element dobiva pravu velicinu iz dokumenta (ne sinteticku CSS heading
  // velicinu), a runovi odstupaju samo kad se od nje razlikuju. Tako naslov dobiva svoju velicinu.
  const paraSize = cmOrNull(para.size);
  const pBase: BaseStyle = { font: base.font, size: paraSize ?? base.size };
  if (paraSize) el.style.fontSize = paraSize + 'pt';

  // Okomiti razmaci i prored iz dokumenta (naslovnica pozicionira tekst upravo njima). Razmak 0 je
  // znacajan (znaci "bez razmaka") pa se postavlja i tada; null (nije zadan) prepusta CSS zadanom.
  const sb = para.spaceBefore, sa = para.spaceAfter;
  if (typeof sb === 'number' && isFinite(sb) && sb >= 0) el.style.marginTop = sb + 'pt';
  if (typeof sa === 'number' && isFinite(sa) && sa >= 0) el.style.marginBottom = sa + 'pt';
  const lh = cmOrNull(para.lineHeight);
  if (lh) el.style.lineHeight = String(lh);

  const paraFlags = byPara.get(para.index) ?? [];
  const unlocated = fillFormatted(el, para.text || '', para.runs, paraFlags, pBase, doc, flagTargets, para.markers);
  // Nakon punjenja (da run-oblikovanje, nalazi i oznake fusnota ostanu netaknuti): redak Sadrzaja
  // dobiva tockasti leader i desno poravnat broj stranice.
  if (isTocLine(para.text || '')) applyTocLeader(el, doc);
  if (paraFlags.length) el.classList.add('lekta-fac-para--flagged');
  if (unlocated.length) {
    el.classList.add('lekta-fac-para--has-unlocated');
    for (const e of unlocated) if (!flagTargets.has(e.flagIndex)) flagTargets.set(e.flagIndex, el);
  }

  // Ugradjene slike (grb/logo) idu nakon teksta odlomka. Renderiraju se SAMO data: URI-ji
  // (obrana u dubinu; model ionako proizvodi samo data: URI), pa nema mrezne ni skriptne povrsine.
  const images = para.images;
  if (images && images.length) {
    for (const im of images) {
      if (!im || typeof im.src !== 'string' || !im.src.startsWith('data:')) continue;
      const img = doc.createElement('img');
      img.className = 'lekta-fac-img';
      img.src = im.src;
      img.alt = '';
      // Postavi samo jednu dimenziju (sirinu ako je poznata) i prepusti drugu automatici + CSS
      // max-width:100%, da omjer ostane ocuvan i preveliki logo ne prijedje sirinu stranice.
      const w = cmOrNull(im.wCm), h = cmOrNull(im.hCm);
      if (w) img.style.width = w + 'cm';
      else if (h) img.style.height = h + 'cm';
      el.appendChild(img);
    }
  }

  // Prazan odlomak (bez teksta i bez slike) mora zauzeti visinu retka kao u Wordu, inace se okomiti
  // razmaci naslovnice srusce. <br> daje liniju, a textContent ostaje prazan (integritet ocuvan).
  if (!el.childNodes.length) el.appendChild(doc.createElement('br'));

  container.appendChild(el);
}

/**
 * Emitiraj odlomke jednog A4 lista: obicni odlomci idu izravno, a UZASTOPNI odlomci iste tablice
 * (`para.cell.tableId`) skupljaju se u pravi `<table>` (mentor|student i sl.) umjesto okomitog slaganja.
 */
function appendBlocks(
  page: HTMLElement,
  paras: PreviewParagraph[],
  byPara: Map<number, FlagEntry[]>,
  base: BaseStyle,
  doc: Document,
  flagTargets: Map<number, HTMLElement>,
): void {
  let i = 0;
  while (i < paras.length) {
    const cell = paras[i].cell;
    if (!cell) {
      appendParagraph(page, paras[i], byPara, base, doc, flagTargets);
      i++;
      continue;
    }
    const tid = cell.tableId;
    const tblParas: PreviewParagraph[] = [];
    while (i < paras.length && paras[i].cell && (paras[i].cell as { tableId: number }).tableId === tid) {
      tblParas.push(paras[i]);
      i++;
    }
    appendTable(page, tblParas, byPara, base, doc, flagTargets);
  }
}

/** Sagradi `<table>` iz odlomaka jedne tablice, grupirano po (row, col) iz `para.cell`. Celije nose
 *  vlastite odlomke (s poravnanjem/oblikovanjem), pa mentor/student sjede jedan pored drugog. */
function appendTable(
  page: HTMLElement,
  paras: PreviewParagraph[],
  byPara: Map<number, FlagEntry[]>,
  base: BaseStyle,
  doc: Document,
  flagTargets: Map<number, HTMLElement>,
): void {
  const rowsMap = new Map<number, Map<number, PreviewParagraph[]>>();
  let maxCol = 0;
  for (const p of paras) {
    const c = p.cell;
    if (!c) continue;
    if (c.col > maxCol) maxCol = c.col;
    let r = rowsMap.get(c.row);
    if (!r) { r = new Map(); rowsMap.set(c.row, r); }
    let list = r.get(c.col);
    if (!list) { list = []; r.set(c.col, list); }
    list.push(p);
  }
  const ncols = maxCol + 1;
  const table = doc.createElement('table');
  table.className = 'lekta-fac-table';
  const rowKeys = [...rowsMap.keys()].sort((a, b) => a - b);
  for (const rk of rowKeys) {
    const tr = doc.createElement('tr');
    const rowCells = rowsMap.get(rk) as Map<number, PreviewParagraph[]>;
    for (let ci = 0; ci < ncols; ci++) {
      const td = doc.createElement('td');
      if (ncols > 1) td.style.width = (100 / ncols).toFixed(4) + '%';
      for (const p of rowCells.get(ci) ?? []) appendParagraph(td, p, byPara, base, doc, flagTargets);
      if (!td.childNodes.length) td.appendChild(doc.createElement('br'));
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  page.appendChild(table);
}

/**
 * Sagradi faksimil pregled: jedan ili vise A4 listova (po prijelomima stranica), s odlomcima u
 * stvarnom oblikovanju i inline oznakama nalaza. `options.doc` je za testove.
 */
export function renderFacsimile(
  model: PreviewModel,
  flags: PreviewFlag[],
  options: { doc?: Document } = {},
): RenderedPreview {
  const doc = options.doc ?? (globalThis as { document?: Document }).document;
  if (!doc) throw new Error('renderFacsimile: nema dostupnog document objekta.');

  const paragraphs = model?.paragraphs ?? [];
  const footnotes = model?.footnotes ?? [];
  const flagTargets = new Map<number, HTMLElement>();

  const base: BaseStyle = {
    font: (model?.baseFont || DEFAULT_BASE_FONT).trim(),
    size: cmOrNull(model?.baseSize) ?? DEFAULT_BASE_SIZE_PT,
  };
  // Fusnote: isti font/velicina za usporedbu, ali BEZ primjene razlike u velicini (CSS skalira odjeljak).
  const fnBase: BaseStyle = { font: base.font, size: base.size, applySize: false };

  // Grupiraj flagove: tijelo po 1-based indeksu odlomka, fusnote po id-u (isti kljucevi kao MVP).
  const byPara = new Map<number, FlagEntry[]>();
  const byFn = new Map<number, FlagEntry[]>();
  const push = (map: Map<number, FlagEntry[]>, key: number, entry: FlagEntry) => {
    const list = map.get(key);
    if (list) list.push(entry);
    else map.set(key, [entry]);
  };
  flags.forEach((flag, flagIndex) => {
    if (flag.footnoteId != null) push(byFn, flag.footnoteId, { flag, flagIndex });
    else push(byPara, flag.paragraphIndex, { flag, flagIndex });
  });

  const root = doc.createElement('div');
  root.className = 'lekta-facsimile';
  if (model?.truncated) root.setAttribute('data-truncated', 'true');

  // Podjela na listove po prijelomima stranica (pageBreakAfter). Bez prijeloma = jedan list.
  const pages: PreviewParagraph[][] = [[]];
  for (const para of paragraphs) {
    pages[pages.length - 1].push(para);
    if (para.pageBreakAfter) pages.push([]);
  }
  if (pages.length > 1 && pages[pages.length - 1].length === 0) pages.pop();
  const multiPage = pages.length > 1;

  pages.forEach((group, pi) => {
    const page = makeSheet(model, base, doc);
    if (multiPage) page.setAttribute('data-page', String(pi + 1));
    appendBlocks(page, group, byPara, base, doc, flagTargets);

    // Fusnote na dnu ZADNJEG lista (odvojene crtom); zaseban koordinatni prostor kao u MVP-u.
    if (pi === pages.length - 1 && footnotes.length) {
      const section = doc.createElement('section');
      section.className = 'lekta-pv-footnotes lekta-fac-footnotes';
      const head = doc.createElement('h3');
      head.className = 'lekta-pv-fn-head';
      head.textContent = 'Fusnote';
      section.appendChild(head);
      for (const fn of footnotes) {
        const el = doc.createElement('div');
        el.className = 'lekta-pv-footnote';
        el.id = `lekta-fac-fn-${fn.id}`;
        el.setAttribute('data-fn-id', String(fn.id));
        const num = doc.createElement('sup');
        num.className = 'lekta-pv-fn-num';
        num.textContent = String(fn.id);
        el.appendChild(num);
        const body = doc.createElement('span');
        const fnFlags = byFn.get(fn.id) ?? [];
        // Fusnote nemaju in-text oznake (markers), pa ih fillFormatted ne dobiva.
        const unlocated = fillFormatted(body, fn.text || '', fn.runs, fnFlags, fnBase, doc, flagTargets);
        if (fnFlags.length) el.classList.add('lekta-pv-footnote--flagged');
        if (unlocated.length) {
          el.classList.add('lekta-pv-footnote--has-unlocated');
          for (const e of unlocated) if (!flagTargets.has(e.flagIndex)) flagTargets.set(e.flagIndex, el);
        }
        el.appendChild(body);
        section.appendChild(el);
      }
      page.appendChild(section);
    }

    // Broj stranice (samo kad ima vise listova); sjedi u donjoj margini.
    if (multiPage) {
      const pn = doc.createElement('div');
      pn.className = 'lekta-fac-pagenum';
      pn.setAttribute('aria-hidden', 'true');
      pn.textContent = String(pi + 1);
      page.appendChild(pn);
    }
    root.appendChild(page);
  });

  return { root, flagTargets, locatedCount: flagTargets.size };
}
