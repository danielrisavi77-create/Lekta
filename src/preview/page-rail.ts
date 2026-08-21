/**
 * Stranicna traka Rendgena: popis PROCIJENJENIH stranica s tockicama nalaza po ozbiljnosti i
 * klik-skokom na list. Brojevi nose "~" (procjena); za pravila o broju stranica mjerodavan je
 * Wordov broj, sto zaglavlje trake izgovara kad se brojevi razlikuju.
 */
import type { PageMap } from './page-map';
import type { PreviewFlag, PreviewModel } from './preview-anchors';
import './xray.css';

export interface PageRailEntry {
  page: number;
  counts: { error: number; warning: number; info: number };
}

export interface PageRailModel {
  entries: PageRailEntry[];
  approximate: true;
  calibrated: boolean;
  /** Wordov spremljeni broj stranica, kad postoji i razlikuje se od procjene (za posten header). */
  storedPages?: number | null;
}

export function buildPageRailModel(
  pageMap: PageMap,
  flags: readonly PreviewFlag[],
  model: PreviewModel,
  storedPages?: number | null,
): PageRailModel {
  const entries: PageRailEntry[] = Array.from({ length: Math.max(0, pageMap.pageCount) }, (_, i) => ({
    page: i + 1,
    counts: { error: 0, warning: 0, info: 0 },
  }));
  const posByIndex = new Map<number, number>();
  (model?.paragraphs ?? []).forEach((p, pos) => {
    if (!posByIndex.has(p.index)) posByIndex.set(p.index, pos);
  });
  const lastPage = entries.length || 1;
  for (const f of flags) {
    let page: number | null = null;
    if (f.footnoteId != null) {
      page = lastPage; // fusnotna sekcija zivi na zadnjem listu (poznato v1 ogranicenje)
    } else {
      const pos = posByIndex.get(f.paragraphIndex);
      if (pos != null) page = pageMap.pageOf[pos] ?? null;
    }
    if (page == null || page < 1 || page > entries.length) continue;
    const sev = f.severity === 'error' || f.severity === 'warning' ? f.severity : 'info';
    entries[page - 1].counts[sev]++;
  }
  return { entries, approximate: true, calibrated: pageMap.calibrated, storedPages: storedPages ?? null };
}

export function renderPageRail(
  model: PageRailModel,
  onJump: (page: number) => void,
  doc: Document = document,
): HTMLElement {
  const nav = doc.createElement('nav');
  nav.className = 'lekta-xray-rail';
  nav.setAttribute('aria-label', 'Stranice (procjena)');
  const head = doc.createElement('div');
  head.className = 'lekta-xray-rail__head';
  const differs = model.storedPages != null && model.storedPages !== model.entries.length;
  head.textContent = differs
    ? `~${model.entries.length} str. (Word: ${model.storedPages})`
    : `~${model.entries.length} str.`;
  head.title = 'Brojevi stranica su Lektina procjena. Za pravila o broju stranica mjerodavan je broj u Wordu.';
  nav.appendChild(head);
  const list = doc.createElement('ol');
  list.className = 'lekta-xray-rail__list';
  for (const entry of model.entries) {
    const li = doc.createElement('li');
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'lekta-xray-rail__page';
    btn.dataset.railPage = String(entry.page);
    const total = entry.counts.error + entry.counts.warning + entry.counts.info;
    btn.setAttribute(
      'aria-label',
      `Približno stranica ${entry.page}${total ? `, ${total} označenih nalaza` : ''}`,
    );
    // Kompaktna traka: celija nosi boju najjace ozbiljnosti (data-sev), broj se vidi na prvoj,
    // zadnjoj i celijama s nalazima (CSS), inace na hover/fokus; 23 velika gumba su bila sum.
    const top = entry.counts.error ? 'error' : entry.counts.warning ? 'warning' : entry.counts.info ? 'info' : 'none';
    btn.dataset.sev = top;
    if (entry.page === 1 || entry.page === model.entries.length || total > 0) btn.dataset.labeled = 'true';
    const num = doc.createElement('b');
    num.textContent = `~${entry.page}`;
    btn.appendChild(num);
    const dots = doc.createElement('span');
    dots.className = 'lekta-xray-rail__dots';
    for (const sev of ['error', 'warning', 'info'] as const) {
      const n = entry.counts[sev];
      if (!n) continue;
      const dot = doc.createElement('i');
      dot.className = `lekta-xray-rail__dot lekta-xray-rail__dot--${sev}`;
      if (n > 1) dot.textContent = String(Math.min(n, 99));
      dot.title = `${n} ${sev === 'error' ? 'za ispraviti' : sev === 'warning' ? 'za provjeriti' : 'informativno'}`;
      dots.appendChild(dot);
    }
    btn.appendChild(dots);
    btn.addEventListener('click', () => onJump(entry.page));
    li.appendChild(btn);
    list.appendChild(li);
  }
  nav.appendChild(list);
  return nav;
}
