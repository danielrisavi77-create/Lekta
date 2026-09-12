/**
 * FAZA POPRAVKA KAO VLASTITA POVRSINA (korak B3, 2026-09-12).
 *
 * ZASTO POSTOJI. Panel popravka je do danas fizicki zivio u kartici "Spremnost za predaju", unutar
 * `innerHTML` checkliste koja se prepisuje na svaki toggle. Iz toga je slijedilo dvoje, oboje
 * zapisano u `app.ts`: da korisnik panel nema kako pogoditi ("cak ga ni autor aplikacije nije
 * nasao"), i da se odabir cuvao keSiranjem stvarnog DOM cvora pa re-attachem, jer bi ga prepisivanje
 * inace pojelo.
 *
 * Oboje nestaje kad panel dobije vlastitu povrsinu: mount je staticki element rute, nista ga ne
 * prepisuje, pa odabir prezivljava povratak zato sto ga NISTA NE DIRA, a ne zato sto ga netko
 * spremi i vrati. Mehanizam je jaci od obecanja.
 *
 * OVAJ MODUL NE ZNA ZA POPRAVAK. On vodi samo ulazak i izlazak iz faze, slijetanje i fokus; sto se
 * u panelu nudi i kako se primjenjuje ostaje u `repair-panel.ts`.
 */
import { posalji, stanjeSada } from './wizard-view';
import { repairLanding } from './results/repair-entry';

/** Element koji je fazu otvorio, da se fokus ima kamo vratiti. */
let okidac: HTMLElement | null = null;

function motionReduced(win: Window): boolean {
  try { return win.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/**
 * Ulazak u fazu popravka.
 *
 * Vraca `false` kad tablica prijelaz ne dopusta (npr. iz faze Dokument), i tada NE DIRA nista.
 * Popravak dohvatljiv iz stanja u kojem nema nalaza bio bi ponuda nad praznim.
 */
export function enterRepairPhase(opener: HTMLElement | null = null, doc: Document = document): boolean {
  if (!posalji('na-popravak', doc)) return false;
  okidac = opener;
  const mount = doc.getElementById('repairPanelMount');
  if (!mount) return true; // faza je usla; da panel nije renderiran, to je posao pozivatelja

  // Slijetanje na ODLUKU, ne na vrh panela: `results/repair-entry.ts` bira privolu ili glavni gumb.
  const slijetanje = repairLanding(mount);
  const glatko = doc.defaultView && motionReduced(doc.defaultView) ? 'auto' : 'smooth';
  (slijetanje?.scroll ?? mount).scrollIntoView({ behavior: glatko as ScrollBehavior, block: 'center' });
  const cilj = slijetanje?.focus
    ?? mount.querySelector<HTMLElement>('[data-repair-go]:not(:disabled),button:not(:disabled),a[href]');
  if (cilj) cilj.focus?.({ preventScroll: true });
  else { mount.setAttribute('tabindex', '-1'); (mount as HTMLElement).focus?.({ preventScroll: true }); }
  return true;
}

/**
 * Izlazak iz faze popravka natrag na nalaz.
 *
 * Fokus se VRACA na okidac. Bez toga korisnik tipkovnice nakon povratka pada na vrh dokumenta, sto
 * je isti ugovor koji list profila vec ima (`workspace-entry.spec.ts`).
 */
export function leaveRepairPhase(doc: Document = document): boolean {
  if (!posalji('natrag-na-provjeru', doc)) return false;
  const vrati = okidac;
  okidac = null;
  vrati?.focus?.({ preventScroll: true });
  return true;
}

/** Je li korisnik trenutacno u fazi popravka. */
export function uFaziPopravka(): boolean {
  return stanjeSada() === 'popravak';
}

/**
 * Ozicenje gumba za povratak.
 *
 * Slusac se veze UZ `AbortSignal`, pa ga `disposeAnalyzerApp` doista skida. `bind()` u `app.ts`
 * svoje slusace registrira bez signala i to je priznato ogranicenje; ovaj modul ga ne popravlja,
 * ali ga ni ne povecava.
 */
export function wireRepairPhase(doc: Document, signal: AbortSignal): void {
  doc.getElementById('repairBackToResults')
    ?.addEventListener('click', () => { leaveRepairPhase(doc); }, { signal });
}
