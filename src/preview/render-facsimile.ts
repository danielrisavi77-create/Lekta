/**
 * Renderer "Vjernog prikaza" (faksimil) za preview modal, druga verzija pored MVP "Oznacenog
 * pregleda" (render-preview.ts). Obje verzije koegzistiraju: MVP je citljiv tijek teksta, faksimil
 * dodaje layout stranice (A4 sirina + prave margine iz sectPr), stvaran bazni font/velicinu i
 * run-oblikovanje (bold/italic/font/velicina po runu), pa odlomak izgleda blize izvornom Wordu.
 *
 * Cista funkcija bez mreze i globalnog stanja; testabilna u happy-dom. XSS-safe po konstrukciji:
 * SAV tekst dokumenta ide kroz createTextNode/textContent (nikad innerHTML), a oblikovanje se
 * postavlja preko element.style.* (CSP dopusta 'unsafe-inline' za style-src, ne za script-src).
 *
 * Dva neovisna sloja nad istim tekstom odlomka:
 *   1) run-formatiranje: iz preview.paragraphs[].runs, rekonstruirano nad `text` (ground truth)
 *      indexOf-obilaskom; runovi koji se ne nadju gube samo OBLIKOVANJE, nikad tekst (praznine
 *      pokriva bazni stil). Rezultat: root.textContent == izvorni tekst odlomka (integritet).
 *   2) highlight: isjecci nalaza omotani u <mark> (crveno/zuto/plavo), identicno render-preview.ts;
 *      preklapajuci se spajaju u jedan <mark>, flag bez lociranog isjecka sidri se na razinu odlomka.
 * Sloj 1 i 2 spajaju se tako da <mark> nosi <span>-ove oblikovanja unutar sebe (npr. bold + zuto).
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
} from './preview-anchors';
import type { RenderedPreview } from './render-preview';

const SEVERITY_RANK: Record<PreviewSeverity, number> = { error: 3, warning: 2, info: 1 };

/** Zadane vrijednosti kad sectPr/dominant podatci nedostaju (A4, standardne margine, TNR 12). */
const DEFAULT_PAGE_W_CM = 21;
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

/** Efektivni bazni stil stranice; run se usporedjuje s njim da se izbjegnu suvisni <span>. */
interface BaseStyle {
  font: string;
  size: number;
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
function paragraphTag(headingLevel: number | null): string {
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
  if (typeof run.size === 'number' && run.size > 0 && run.size !== base.size) span.style.fontSize = run.size + 'pt';
}

/** True ako run nema vidljive razlike od baznog stila (renderira se kao goli tekstni cvor). */
function runIsBase(run: PreviewRun | null, base: BaseStyle): boolean {
  if (!run) return true;
  if (run.bold || run.italic) return false;
  if (run.font && normFont(run.font) !== normFont(base.font)) return false;
  if (typeof run.size === 'number' && run.size > 0 && run.size !== base.size) return false;
  return true;
}

/**
 * U `container` dodaje tekst[from, to), podijeljen po segmentima oblikovanja `segs`: bazni dijelovi
 * kao tekstni cvorovi, ostali kao <span> sa stilom. Poziva se i za goli dio odlomka i za unutrasnjost
 * <mark>-a, pa se oblikovanje i highlight ispravno gnijezde.
 */
function appendStyledText(
  container: HTMLElement,
  text: string,
  from: number,
  to: number,
  segs: FmtSeg[],
  base: BaseStyle,
  doc: Document,
): void {
  if (to <= from) return;
  for (const seg of segs) {
    if (seg.end <= from || seg.start >= to) continue;
    const a = Math.max(seg.start, from);
    const b = Math.min(seg.end, to);
    if (a >= b) continue;
    const piece = text.slice(a, b);
    if (runIsBase(seg.run, base)) {
      container.appendChild(doc.createTextNode(piece));
    } else {
      const span = doc.createElement('span');
      applyRunStyle(span, seg.run as PreviewRun, base);
      span.textContent = piece;
      container.appendChild(span);
    }
  }
}

/**
 * Ispuni element odlomka: run-oblikovanje + <mark> oko lociranih isjecaka. Vraca flag-entrije cija
 * lokacija nije nadjena (prazan isjecak ili podniz ne postoji) da ih pozivatelj sidri na razinu
 * odlomka. Struktura je identicna render-preview.ts, samo se leaf-tekst emitira kroz appendStyledText.
 */
function fillFormattedParagraph(
  el: HTMLElement,
  para: PreviewParagraph,
  paraFlags: FlagEntry[],
  base: BaseStyle,
  doc: Document,
  flagTargets: Map<number, HTMLElement>,
): FlagEntry[] {
  const text = para.text || '';
  const segs = buildFmtSegs(text, para.runs);

  const located: MergedRange[] = [];
  const unlocated: FlagEntry[] = [];
  for (const entry of paraFlags) {
    const ex = entry.flag.excerpt;
    const idx = ex ? text.indexOf(ex) : -1;
    if (idx >= 0) located.push({ start: idx, end: idx + ex.length, entries: [entry] });
    else unlocated.push(entry);
  }

  if (located.length === 0) {
    appendStyledText(el, text, 0, text.length, segs, base, doc);
    return unlocated;
  }

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
    if (m.start > cursor) appendStyledText(el, text, cursor, m.start, segs, base, doc);
    const sev = topSeverity(m.entries);
    const mark = doc.createElement('mark');
    mark.className = `lekta-flag lekta-flag--${sev}`;
    mark.setAttribute('data-flag-severity', sev);
    const titles = [...new Set(m.entries.map((e) => e.flag.title))].join('; ');
    if (titles) mark.title = titles;
    appendStyledText(mark, text, m.start, m.end, segs, base, doc);
    el.appendChild(mark);
    for (const e of m.entries) flagTargets.set(e.flagIndex, mark);
    cursor = m.end;
  }
  if (cursor < text.length) appendStyledText(el, text, cursor, text.length, segs, base, doc);

  return unlocated;
}

/** Ispuni fusnotu: samo tekst + <mark> (footnote preview nema run-oblikovanje). Kao render-preview. */
function fillFootnote(
  body: HTMLElement,
  text: string,
  fnFlags: FlagEntry[],
  doc: Document,
  flagTargets: Map<number, HTMLElement>,
): FlagEntry[] {
  const located: MergedRange[] = [];
  const unlocated: FlagEntry[] = [];
  for (const entry of fnFlags) {
    const ex = entry.flag.excerpt;
    const idx = ex ? text.indexOf(ex) : -1;
    if (idx >= 0) located.push({ start: idx, end: idx + ex.length, entries: [entry] });
    else unlocated.push(entry);
  }
  if (located.length === 0) {
    body.textContent = text;
    return unlocated;
  }
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
    if (m.start > cursor) body.appendChild(doc.createTextNode(text.slice(cursor, m.start)));
    const sev = topSeverity(m.entries);
    const mark = doc.createElement('mark');
    mark.className = `lekta-flag lekta-flag--${sev}`;
    mark.setAttribute('data-flag-severity', sev);
    const titles = [...new Set(m.entries.map((e) => e.flag.title))].join('; ');
    if (titles) mark.title = titles;
    mark.textContent = text.slice(m.start, m.end);
    body.appendChild(mark);
    for (const e of m.entries) flagTargets.set(e.flagIndex, mark);
    cursor = m.end;
  }
  if (cursor < text.length) body.appendChild(doc.createTextNode(text.slice(cursor)));
  return unlocated;
}

function cmOrNull(v: number | null | undefined): number | null {
  return typeof v === 'number' && isFinite(v) && v > 0 ? v : null;
}

/**
 * Sagradi faksimil pregled: stranica (A4 sirina + margine) s odlomcima u stvarnom oblikovanju i
 * inline oznakama nalaza. `options.doc` je za testove; u pregledniku se koristi globalni document.
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

  // Stranica: bijeli list A4 sirine sa stvarnim marginama (padding) i baznom tipografijom.
  const page = doc.createElement('div');
  page.className = 'lekta-fac-page';
  const pageW = cmOrNull(model?.page?.size?.w) ?? DEFAULT_PAGE_W_CM;
  page.style.width = pageW + 'cm';
  const m = model?.page?.margins || null;
  page.style.paddingTop = (cmOrNull(m?.top) ?? DEFAULT_MARGIN_CM) + 'cm';
  page.style.paddingRight = (cmOrNull(m?.right) ?? DEFAULT_MARGIN_CM) + 'cm';
  page.style.paddingBottom = (cmOrNull(m?.bottom) ?? DEFAULT_MARGIN_CM) + 'cm';
  page.style.paddingLeft = (cmOrNull(m?.left) ?? DEFAULT_MARGIN_CM) + 'cm';
  page.style.fontFamily = fontStack(base.font);
  page.style.fontSize = base.size + 'pt';
  root.appendChild(page);

  for (const para of paragraphs) {
    const el = doc.createElement(paragraphTag(para.headingLevel));
    el.id = `lekta-fac-p-${para.index}`;
    el.setAttribute('data-p-index', String(para.index));
    el.className = para.headingLevel ? 'lekta-fac-heading' : 'lekta-fac-para';
    const alignCss = alignToCss(para.align);
    if (alignCss) el.style.textAlign = alignCss;

    const paraFlags = byPara.get(para.index) ?? [];
    if (paraFlags.length) {
      const unlocated = fillFormattedParagraph(el, para, paraFlags, base, doc, flagTargets);
      el.classList.add('lekta-fac-para--flagged');
      if (unlocated.length) {
        el.classList.add('lekta-fac-para--has-unlocated');
        for (const e of unlocated) if (!flagTargets.has(e.flagIndex)) flagTargets.set(e.flagIndex, el);
      }
    } else {
      const segs = buildFmtSegs(para.text || '', para.runs);
      appendStyledText(el, para.text || '', 0, (para.text || '').length, segs, base, doc);
    }
    page.appendChild(el);
  }

  // Fusnote na dnu stranice (odvojene crtom); zaseban koordinatni prostor kao u MVP-u.
  if (footnotes.length) {
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
      if (fnFlags.length) {
        const unlocated = fillFootnote(body, fn.text, fnFlags, doc, flagTargets);
        el.classList.add('lekta-pv-footnote--flagged');
        if (unlocated.length) {
          el.classList.add('lekta-pv-footnote--has-unlocated');
          for (const e of unlocated) if (!flagTargets.has(e.flagIndex)) flagTargets.set(e.flagIndex, el);
        }
      } else {
        body.textContent = fn.text;
      }
      el.appendChild(body);
      section.appendChild(el);
    }
    page.appendChild(section);
  }

  return { root, flagTargets, locatedCount: flagTargets.size };
}
