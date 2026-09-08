/**
 * KOREKTORSKI STOL: ozicenje. `desk-view.ts` daje HTML, `desk-model.ts` vezu nalaz <-> mjesto,
 * a ovaj modul ih spaja u zivo sucelje.
 *
 * Brif vlasnika (2026-09-08): "Klik na nalaz pomakne dokument. Klik na oznaceno mjesto aktivira
 * nalaz. To daje 'aha' trenutak koji screenshot score dashboarda nikada nece dati."
 *
 * DELEGACIJA, NE IZRAVNI SLUSACI, i to nije stil nego nuznost. Stol PONOVNO CRTA desnu plocu na
 * svaku promjenu nalaza, pa bi slusaci zakaceni na pojedinacne gumbe umrli zajedno s karticom koju
 * su drzali. Prvi klik bi radio, drugi ne, i to bi izgledalo kao nasumican kvar. Jedan slusac na
 * sekciji prezivi svako ponovno crtanje.
 *
 * DOKUMENT SE MONTIRA IZVANA (`mountDocument`), jer je faksimil tezak modul koji se ucitava lijeno.
 * Time je i ovaj modul mjerljiv bez preglednika: test ubaci vlastite mete umjesto stvarnog
 * dokumenta. Bez toga bi se ozicenje moglo dokazati samo Playwrightom, dakle sporo i tek na CI-u.
 */
import type { DeskItem } from './desk-model';
import { deskHtml, deskNav, deskPaneHtml } from './desk-view';
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
  readonly onAction?: (action: ResultsCockpitAction) => void;
  /** Testovi ubacuju vlastito pomicanje; produkcija koristi `scrollIntoView`. */
  readonly scrollTo?: (el: HTMLElement) => void;
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
  let index = 0;
  let mete: ReadonlyMap<number, HTMLElement> | null = null;
  let odbacen = false;

  section.innerHTML = deskHtml(o.items[0] ?? null, deskNav(o.items.length, 0), o.repairAvailable, o.esc);

  const nacrtajPlocu = (): void => {
    const stara = section.querySelector<HTMLElement>('[data-desk-pane]');
    if (!stara) return;
    const nova = section.ownerDocument.createElement('div');
    nova.innerHTML = deskPaneHtml(o.items[index] ?? null, deskNav(o.items.length, index), o.repairAvailable, o.esc);
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

  const domacin = section.querySelector<HTMLElement>('[data-desk-doc]');
  if (domacin) {
    void o.mountDocument(domacin).then((dokument) => {
      // Rezultat je mogao biti zamijenjen dok je tezak modul stizao; tada se nista ne dira.
      if (odbacen || !dokument) return;
      mete = dokument.flagTargets;
      mete.forEach((el, flagIndex) => {
        el.addEventListener('click', () => {
          // OBRNUT SMJER: mjesto aktivira nalaz. Trazi se po `flagIndex`, jer zastavica i nalaz
          // dolaze razlicitim putevima i presjek je manji od oba skupa; zastavica bez nalaza
          // (npr. registar duge recenice) ne smije nista pomaknuti.
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
    },
  };
}
