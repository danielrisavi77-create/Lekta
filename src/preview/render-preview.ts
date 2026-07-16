/**
 * Renderer "Oznacenog pregleda" (preview modal, slice 3).
 *
 * Cista funkcija: iz preview.paragraphs (analyzeDocx, slice 1) i PreviewFlag[] (collectPreviewFlags,
 * slice 2) gradi DOM stablo u kojem su usidreni isjecci omotani u <mark> (crveno/zuto/plavo po
 * ozbiljnosti). NE koristi innerHTML: sav tekst dokumenta ide kroz createTextNode/textContent, pa je
 * XSS-safe po konstrukciji (tekst rada je nepovjerljiv ulaz). Ne dira mrezu ni stanje; testabilno u
 * happy-dom (vitest.config environment).
 *
 * Ogranicenja MVP-a (slice 3):
 *   - Isjecak se trazi kao PRVA pojava podniza u odlomku (indexOf); ponovljeni isjecak istice se
 *     jednom. Preklapajuci isjecci u istom odlomku spajaju se u jedan <mark> (ozbiljnost = najveca),
 *     a spojeni tekst se NIKAD ne gubi ni duplicira (root.textContent == izvorni tekst odlomka).
 *   - Flag bez isjecka ili cija se pojava ne nadje sidri se na razini ODLOMKA (skrola na odlomak),
 *     ne na tocan podniz. Flag ciji odlomak nije u pregledu (npr. preview.truncated) izostaje iz
 *     flagTargets (bocna lista ga i dalje moze prikazati, samo bez skrolanja).
 */
import type { PreviewFlag, PreviewParagraph, PreviewSeverity } from './preview-anchors';

export interface PreviewModelInput {
  paragraphs: PreviewParagraph[];
  truncated?: boolean;
}

export interface RenderedPreview {
  /** Korijenski element pregleda (za umetanje u tijelo modala). */
  root: HTMLElement;
  /**
   * Za svaki flag (kljuc = indeks u ulaznom `flags` nizu) element na koji se skrola:
   * <mark> ako je isjecak lociran, inace element odlomka. Flag ciji odlomak nije u pregledu
   * (truncated) NEMA unos.
   */
  flagTargets: Map<number, HTMLElement>;
  /** Broj flagova kojima je pronadjena lokacija (isjecak ili barem odlomak) = flagTargets.size. */
  locatedCount: number;
}

const SEVERITY_RANK: Record<PreviewSeverity, number> = { error: 3, warning: 2, info: 1 };

function topSeverity(entries: Array<{ flag: PreviewFlag }>): PreviewSeverity {
  let best: PreviewSeverity = 'info';
  for (const { flag } of entries) {
    if (SEVERITY_RANK[flag.severity] > SEVERITY_RANK[best]) best = flag.severity;
  }
  return best;
}

/** Ime elementa za odlomak: naslovi 1..6 -> h1..h6 (klamp), ostalo -> p. */
function paragraphTag(headingLevel: number | null): string {
  if (typeof headingLevel === 'number' && headingLevel >= 1) return 'h' + Math.min(6, Math.floor(headingLevel));
  return 'p';
}

interface FlagEntry {
  flag: PreviewFlag;
  flagIndex: number;
}

interface MergedRange {
  start: number;
  end: number;
  entries: FlagEntry[];
}

/**
 * Ispuni element odlomka: tekst + <mark> oko lociranih isjecaka. Vraca entrije cija se lokacija
 * NIJE nasla (prazan isjecak ili podniz ne postoji) da ih pozivatelj sidri na razini odlomka.
 */
function fillParagraph(
  el: HTMLElement,
  text: string,
  paraFlags: FlagEntry[],
  doc: Document,
  flagTargets: Map<number, HTMLElement>,
): FlagEntry[] {
  const located: MergedRange[] = [];
  const unlocated: FlagEntry[] = [];

  for (const entry of paraFlags) {
    const ex = entry.flag.excerpt;
    const idx = ex ? text.indexOf(ex) : -1;
    if (idx >= 0) located.push({ start: idx, end: idx + ex.length, entries: [entry] });
    else unlocated.push(entry);
  }

  if (located.length === 0) {
    el.textContent = text;
    return unlocated;
  }

  // Spoji preklapajuce raspone da se tekst ne duplicira (jedan <mark> nosi vise flagova).
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
    if (m.start > cursor) el.appendChild(doc.createTextNode(text.slice(cursor, m.start)));
    const sev = topSeverity(m.entries);
    const mark = doc.createElement('mark');
    mark.className = `lekta-flag lekta-flag--${sev}`;
    mark.setAttribute('data-flag-severity', sev);
    const titles = [...new Set(m.entries.map((e) => e.flag.title))].join('; ');
    if (titles) mark.title = titles;
    mark.textContent = text.slice(m.start, m.end);
    el.appendChild(mark);
    for (const e of m.entries) flagTargets.set(e.flagIndex, mark);
    cursor = m.end;
  }
  if (cursor < text.length) el.appendChild(doc.createTextNode(text.slice(cursor)));

  return unlocated;
}

/**
 * Sagradi DOM pregled dokumenta s inline oznakama nalaza.
 * `options.doc` je za testove; u pregledniku se koristi globalni document.
 */
export function renderPreview(
  model: PreviewModelInput,
  flags: PreviewFlag[],
  options: { doc?: Document } = {},
): RenderedPreview {
  const doc = options.doc ?? (globalThis as { document?: Document }).document;
  if (!doc) throw new Error('renderPreview: nema dostupnog document objekta.');

  const paragraphs = model?.paragraphs ?? [];
  const flagTargets = new Map<number, HTMLElement>();

  // Grupiraj flagove po 1-based indeksu odlomka, zadrzavajuci originalni indeks u nizu.
  const byPara = new Map<number, FlagEntry[]>();
  flags.forEach((flag, flagIndex) => {
    const list = byPara.get(flag.paragraphIndex);
    if (list) list.push({ flag, flagIndex });
    else byPara.set(flag.paragraphIndex, [{ flag, flagIndex }]);
  });

  const root = doc.createElement('div');
  root.className = 'lekta-preview';
  if (model?.truncated) root.setAttribute('data-truncated', 'true');

  for (const para of paragraphs) {
    const el = doc.createElement(paragraphTag(para.headingLevel));
    el.id = `lekta-pv-p-${para.index}`;
    el.setAttribute('data-p-index', String(para.index));
    el.className = para.headingLevel ? 'lekta-pv-heading' : 'lekta-pv-para';

    const paraFlags = byPara.get(para.index) ?? [];
    if (paraFlags.length) {
      const unlocated = fillParagraph(el, para.text, paraFlags, doc, flagTargets);
      el.classList.add('lekta-pv-para--flagged');
      // Flag bez lociranog isjecka sidri se na razinu odlomka (ako vec nije lociran drugdje).
      if (unlocated.length) {
        el.classList.add('lekta-pv-para--has-unlocated');
        for (const e of unlocated) if (!flagTargets.has(e.flagIndex)) flagTargets.set(e.flagIndex, el);
      }
    } else {
      el.textContent = para.text;
    }
    root.appendChild(el);
  }

  return { root, flagTargets, locatedCount: flagTargets.size };
}
