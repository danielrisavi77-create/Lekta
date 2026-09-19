/**
 * KOREKTORSKI STOL: ozicenje. `desk-view.ts` daje HTML, `desk-model.ts` vezu nalaz <-> mjesto.
 *
 * Brif vlasnika (2026-09-08): "Klik na nalaz pomakne dokument. Klik na oznaceno mjesto aktivira
 * nalaz."
 *
 * DELEGACIJA, NE IZRAVNI SLUSACI, i to je nuznost: stol ponovno crta desnu plocu na svaku promjenu
 * nalaza, pa bi slusac na pojedinacnom gumbu umro s karticom koju drzi. Prvi klik bi radio, drugi
 * ne, sto izgleda kao nasumican kvar.
 *
 * DOKUMENT SE MONTIRA IZVANA (`mountDocument`), jer je faksimil tezak lijeni modul. Time je i ovo
 * ozicenje mjerljivo bez preglednika: test ubaci vlastite mete umjesto stvarnog dokumenta.
 */
import type { DeskItem } from './desk-model';
import { repairPlanFooterHtml } from './repair-plan-view';
import type { RepairPlan } from './repair-plan';
import { deskHtml, deskNav, deskPaneHtml, deskPlanPaneHtml } from './desk-view';
import type { ResultsCockpitAction } from './results-cockpit';
import type { VisualFindingModel } from './visual-result-model';

/** Ono sto renderer dokumenta vrati; `renderFacsimile` ovo zadovoljava strukturno. */
export interface DeskDocument {
  readonly flagTargets: ReadonlyMap<number, HTMLElement>;
}

export interface DeskMountOptions {
  readonly items: readonly DeskItem<VisualFindingModel>[];
  readonly repairAvailable: boolean;
  readonly esc: (v: string) => string;
  readonly mountDocument: (host: HTMLElement) => Promise<DeskDocument | null>;
  /** HTML plana ispravaka; bez njega stol nema drugi nacin rada i gumb se ne nudi. */
  readonly planHtml?: string | null;
  /** Model plana (T09); bez njega promjena odabira ne moze ponovno iscrtati podnozje. */
  plan?: RepairPlan | null;
  readonly onAction?: (action: ResultsCockpitAction) => void;
  /** Testovi ubacuju vlastito pomicanje; produkcija koristi `scrollIntoView`. */
  readonly scrollTo?: (el: HTMLElement) => void;
  /**
   * Odakle poceti. Stol se PONOVNO MONTIRA na svaku radnju nad nalazom, pa bi bez ovoga korisnik
   * koji potvrdi peti nalaz zavrsio natrag na prvom, kao da je radnja ponistila napredak. Uhvatio
   * CI (`browser-matrix`, 2026-09-08), jer je kartica na kojoj test radi nestala iz DOM-a.
   */
  readonly startIndex?: number;
}

export interface DeskHandle {
  readonly index: number;
  goTo(index: number): void;
  dispose(): void;
}

function zadanoPomicanje(el: HTMLElement): void {
  const win = el.ownerDocument.defaultView;
  // Mirno pomicanje je ukras; korisnik koji je trazio manje pokreta ga ne dobiva.
  const tiho = win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  try {
    el.scrollIntoView({ block: 'center', behavior: tiho ? 'auto' : 'smooth' });
  } catch {
    // happy-dom i stariji motori nemaju objektni oblik; pomak nije bitan za ispravnost.
    try { el.scrollIntoView(); } catch { /* nema sto */ }
  }
}

/**
 * Prevede klik unutar kartice u radnju ljuske. Isti skup radnji koji `renderResultsCockpit` vec
 * salje, jer kartica je ISTA (`priority-findings.ts`); stol joj samo mijenja okvir.
 */
function radnjaZaKlik(cilj: HTMLElement): ResultsCockpitAction | null {
  const kartica = cilj.closest<HTMLElement>('[data-finding-id]');
  const findingId = kartica?.dataset.findingId;
  if (!findingId) return null;
  if (cilj.closest('[data-finding-jump]')) return { kind: 'preview', findingId };
  if (cilj.closest('[data-finding-confirm]')) return { kind: 'confirm', findingId };
  if (cilj.closest('[data-finding-reopen]')) return { kind: 'reopen', findingId };
  if (cilj.closest('[data-finding-ignore-save]')) {
    const reason = kartica?.querySelector<HTMLInputElement>('[data-finding-ignore-reason]')?.value.trim() ?? '';
    // Bez razloga se nista ne salje: "zanemareno bez razloga" je tocno ono sto ledger ne smije
    // primiti, jer poslije nitko ne moze rekonstruirati odluku.
    return reason ? { kind: 'ignore', findingId, reason } : null;
  }
  const akcija = cilj.closest<HTMLElement>('[data-finding-action]')?.dataset.findingAction;
  if (akcija === 'repair') return { kind: 'repair', findingId };
  if (akcija === 'preview') return { kind: 'preview', findingId };
  return null;
}

export function mountDesk(section: HTMLElement, o: DeskMountOptions): DeskHandle {
  const pomakni = o.scrollTo ?? zadanoPomicanje;
  // Stisce se u raspon: popis se izmedju dviju montaza mogao skratiti (zanemaren nalaz).
  let index = deskNav(o.items.length, o.startIndex ?? 0).index;
  let nacin: 'nalazi' | 'plan' = 'nalazi';
  let mete: ReadonlyMap<number, HTMLElement> | null = null;
  let odbacen = false;

  section.innerHTML = deskHtml(o.items[index] ?? null, deskNav(o.items.length, index), o.repairAvailable, o.esc, o.items, !!o.planHtml);

  const nacrtajPlocu = (): void => {
    const stara = section.querySelector<HTMLElement>('[data-desk-pane]');
    if (!stara) return;
    const nova = section.ownerDocument.createElement('div');
    nova.innerHTML = nacin === 'plan' && o.planHtml
      ? deskPlanPaneHtml(o.planHtml)
      : deskPaneHtml(o.items[index] ?? null, deskNav(o.items.length, index), o.repairAvailable, o.esc, o.items, !!o.planHtml);
    const zamjena = nova.firstElementChild;
    if (zamjena) stara.replaceWith(zamjena);
  };

  /**
   * Oznaka aktivnog mjesta zivi na META, ne na kartici: dokument je taj koji mora pokazati GDJE.
   * Prethodna se gasi uvijek, i kad nova ne postoji, inace bi na ekranu ostale dvije oznake i
   * korisnik ne bi znao koja vrijedi za nalaz koji cita.
   */
  const oznaciMjesto = (): void => {
    mete?.forEach((el) => el.removeAttribute('data-desk-active'));
    const flagIndex = o.items[index]?.flagIndex;
    if (flagIndex == null) return;
    const meta = mete?.get(flagIndex);
    if (!meta) return;
    meta.setAttribute('data-desk-active', 'true');
    pomakni(meta);
  };

  const goTo = (kamo: number): void => {
    const n = deskNav(o.items.length, kamo);
    if (!o.items.length) return;
    index = n.index;
    nacrtajPlocu();
    oznaciMjesto();
  };

  const naKlik = (e: Event): void => {
    const cilj = e.target as HTMLElement | null;
    if (!cilj || typeof cilj.closest !== 'function') return;
    const kamo = cilj.closest<HTMLElement>('[data-desk-go]');
    if (kamo) {
      // Prazan `data-desk-go` je ugasen gumb na kraju popisa; ne omata se na drugi kraj.
      const v = kamo.dataset.deskGo;
      if (v) goTo(Number(v));
      return;
    }
    if (cilj.closest('[data-desk-plan-open]')) { nacin = 'plan'; nacrtajPlocu(); o.onAction?.({ kind: 'plan-opened' }); return; }
    if (cilj.closest('[data-desk-plan-close]')) { nacin = 'nalazi'; nacrtajPlocu(); oznaciMjesto(); return; }
    if (cilj.closest('[data-repair-plan-go]')) {
      // T09: plan NE izvodi popravak sam (motor, privola i naplata zive u panelu), ali ODABIR putuje s radnjom:
      // ljuska ga preda kontroleru toka (`RepairPanelHandle.applySelection`), pa je odabir u planu i prije slanja
      // ISTI. Do sada se odabir iz plana odbacivao i panel je sam birao "prekrseno".
      o.onAction?.({ kind: 'repair-safe', ruleIds: planOdabir() });
      return;
    }
    if (cilj.closest('[data-finding-ignore]')) {
      cilj.closest<HTMLElement>('[data-finding-id]')?.querySelector<HTMLElement>('[data-finding-ignore-form]')?.removeAttribute('hidden');
      return;
    }
    if (cilj.closest('[data-finding-ignore-cancel]')) {
      cilj.closest<HTMLElement>('[data-finding-ignore-form]')?.setAttribute('hidden', '');
      return;
    }
    const radnja = radnjaZaKlik(cilj);
    if (radnja) o.onAction?.(radnja);
  };

  section.addEventListener('click', naKlik);

  /** Trenutni odabir u planu, iz stvarnih kontrola; prazan niz kad plan nije iscrtan. */
  const planOdabir = (): string[] =>
    Array.from(section.querySelectorAll<HTMLInputElement>('[data-repair-plan-item]'))
      .filter((cb) => cb.checked)
      .map((cb) => cb.dataset.repairPlanItem ?? '')
      .filter(Boolean);

  // Promjena odabira u planu: brojac i sazetak se ponovno iscrtaju iz ISTE logike koja crta pocetno stanje.
  const naPromjenu = (e: Event): void => {
    const cb = e.target as HTMLInputElement | null;
    if (!cb || typeof cb.matches !== 'function' || !cb.matches('[data-repair-plan-item]')) return;
    cb.dataset.odabrano = cb.checked ? 'da' : 'ne';
    const podnozje = section.querySelector<HTMLElement>('[data-repair-plan-footer]');
    if (podnozje && o.plan) podnozje.innerHTML = repairPlanFooterHtml(o.plan, planOdabir(), o.esc);
  };
  section.addEventListener('change', naPromjenu);

  const domacin = section.querySelector<HTMLElement>('[data-desk-doc]');
  if (domacin) {
    void o.mountDocument(domacin).then((dokument) => {
      // Rezultat je mogao biti zamijenjen dok je tezak modul stizao; tada se nista ne dira.
      if (odbacen || !dokument) return;
      mete = dokument.flagTargets;
      mete.forEach((el, flagIndex) => {
        el.addEventListener('click', () => {
          // OBRNUT SMJER: mjesto aktivira nalaz. Po `flagIndex`, jer zastavica bez nalaza (npr.
          // registar duge recenice) ne smije nista pomaknuti.
          const i = o.items.findIndex((it) => it.flagIndex === flagIndex);
          if (i >= 0) goTo(i);
        });
      });
      oznaciMjesto();
    }).catch(() => {
      // Dokument je POMOC, ne uvjet: nalazi i navigacija rade i bez njega. Stol bez dokumenta je
      // losiji stol, ali prazna desna strana bi bila kvar.
    });
  }

  return {
    get index() { return index; },
    goTo,
    dispose() {
      odbacen = true;
      section.removeEventListener('click', naKlik);
      section.removeEventListener('change', naPromjenu);
    },
  };
}
