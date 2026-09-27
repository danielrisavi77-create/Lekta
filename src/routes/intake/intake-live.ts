/**
 * ZIVI LIST NA ULAZU (ALIGNMENT Z32, varijanta B): pribor uz list, vrata ubacivanja, podizanje
 * lista pri povlacenju, ime datoteke u zaglavlju i pecat koji prati provjeru.
 *
 * TOK DOKUMENTA NE ZIVI OVDJE. Provjeru, zapis u IndexedDB i navigaciju i dalje vodi
 * `intake-controller.ts` sa svoja tri ugovora (navigacija tek nakon `put`, utrke po tokenu,
 * fallback bez SPA hacka). Ovaj modul mu daje samo cetiri kuke (`canAccept`, `onBlocked`,
 * `onFileChosen`, `onSessionStored`) i crta ono sto se na listu vidi.
 *
 * STO JE SVJESNO IZOSTAVLJENO, i zasto:
 *
 *   "Pregledano · 71" i "Klikni list za nalaz". Ocjenu racuna analizator na `/rad/`, a ulaz ga
 *   namjerno ne uvozi (pola megabajta grafa, `tests/intake-entry-boundary.test.ts`). Pecat zato
 *   staje na "Čitam" i primopredaja nastavlja kao i prije Z32 (automatski prijelaz na `/rad/`).
 *   Stanje "gotovo" bez stvarne ocjene bilo bi izmisljen broj, a "Ubaci drugi rad" bez njega
 *   nema pocetnog stanja iz kojeg bi se vracao.
 *
 *   Margina i prored "po pravilniku". Stvarna pravila profila su na mrezi i u lijenom chunku
 *   (`src/profiles/`), kojeg ulaz ne smije vuci. Potvrda zato mijenja unutarnju marginu i prored
 *   lista JEDNOM i NEUTRALNO (ista vrijednost za svaki fakultet), a list ne ispisuje mjere koje
 *   ne zna; ispisuje samo kraticu potvrdjenog fakulteta.
 *
 *   Izbornik fakulteta na ulazu. Fakultet NIJE uvjet za ubacivanje (odluka vlasnika 2026-09-27:
 *   "Ne treba upisati faks odmah, nego aplikacija automatski prepoznaje. Ako je prepozna, onda
 *   korisnik može odabrati sam"). `/rad/` ga prepoznaje iz dokumenta i ondje ga student
 *   potvrdjuje ili mijenja. Kartica na ulazu zato samo nudi potvrdu predodabira (postavke ili
 *   `?unit=`), a bez njega istinito kaze da ce fakultet biti prepoznat iz rada. "Promijeni" vodi
 *   na postojeci odabir po fakultetu (`/fakulteti/`), cija stranica vraca na `/?unit=...`.
 */

import { pokretPrigusen } from '../../shared/display-prefs';
import {
  predodabirFakulteta, procitajIzborUlaza, procitajPostavke, rokZaPovratak, spremnostUlaza,
  veziPotvrduZaSesiju, veziRokZaSesiju, zapisiPotvrdu, zapisiRok, type Predodabir,
} from '../../shared/intake-choice';
import { pecatRoka, type RokStanje } from './deadline-stamp';

/** Stanja kontrolera (`data-intake-state`) u kojima ulaz stvarno cita dokument. */
const STANJA_CITANJA = new Set(['checking', 'saving', 'ready']);

/** Tekst pecata provjere za stanje kontrolera; tekstovi su doslovno iz predloska. */
export function tekstPecataProvjere(stanje: string | undefined): string {
  return stanje !== undefined && STANJA_CITANJA.has(stanje) ? 'Čitam' : 'Čeka provjeru';
}

/**
 * Natpis izvora uz oznaku "Fakultet" (predlozak: "PREPOZNATO IZ PROFILA" / "POTVRĐENO").
 * "Prepoznato iz profila" vrijedi SAMO kad predodabir dolazi iz zapamcenih postavki; fakultet iz
 * `?unit=` linka nije prepoznat iz profila nego ga je donijela poveznica, pa tako i pise.
 */
export function izvorFakulteta(predodabir: Predodabir | null, potvrden: boolean): string {
  if (!predodabir) return '';
  if (potvrden) return ' · potvrđeno';
  return predodabir.izvor === 'postavke' ? ' · prepoznato iz profila' : ' · s poveznice';
}

/** Kartica bez predodabira: fakultet se ne trazi na ulazu, `/rad/` ga prepoznaje iz dokumenta. */
const NAPOMENA_BEZ_FAKULTETA = 'Prepoznat ćemo ga iz rada.';

/** Poruka kad korisnik pokusa ubaciti rad prije nego je rok odlucen (klik ili ispustanje). */
export const PORUKA_ODBIJENO = 'Rad nije primljen: prvo upiši rok predaje ili označi „Još ne znam rok“.';

/** Koliko milisekundi traje jedno slovo pri upisu imena (predlozak: 32 ms). */
const SLOVO_MS = 32;

export interface IntakeLive {
  canAccept(): boolean;
  onBlocked(): void;
  onFileChosen(name: string): void;
  onSessionStored(sessionId: string): void;
  /** Ispustanje izvan lista predaje se kontroleru kroz ovu kuku (povezuje se nakon montaze). */
  poveziOdabir(odabir: (file: File) => void): void;
  destroy(): void;
}

export interface IntakeLiveOptions {
  search: string;
  danas?: () => Date;
}

function el<T extends Element>(doc: Document, sel: string): T | null {
  return doc.querySelector<T>(sel);
}

export function mountIntakeLive(doc: Document, options: IntakeLiveOptions): IntakeLive {
  const danas = options.danas ?? (() => new Date());
  const stage = el<HTMLElement>(doc, '#intakeStage');
  const paper = el<HTMLElement>(doc, '#intakeDropzone');
  const gumb = el<HTMLElement>(doc, '.intake-paper__gumb');
  const hint = el<HTMLElement>(doc, '#intakeHint');
  const pecat = el<HTMLElement>(doc, '[data-intake-pecat]');
  const rokPecat = el<HTMLElement>(doc, '[data-intake-rok-pecat]');
  const ime = el<HTMLElement>(doc, '[data-intake-ime]');
  const listFakultet = el<HTMLElement>(doc, '[data-intake-list-fakultet]');
  const fakultet = el<HTMLElement>(doc, '[data-intake-fakultet]');
  const napomena = el<HTMLElement>(doc, '[data-intake-fakultet-napomena]');
  const izvor = el<HTMLElement>(doc, '[data-intake-fakultet-izvor]');
  const greska = el<HTMLElement>(doc, '#intakeError');
  const potvrdi = el<HTMLButtonElement>(doc, '[data-intake-potvrdi]');
  const promijeni = el<HTMLAnchorElement>(doc, '[data-intake-promijeni]');
  const rokPolje = el<HTMLInputElement>(doc, '[data-intake-rok]');
  const neznam = el<HTMLInputElement>(doc, '[data-intake-rok-neznam]');
  const prigusen = (): boolean => pokretPrigusen(doc);

  const predodabir = predodabirFakulteta(options.search, procitajPostavke());
  let potvrden = false;
  // Istekao rok iz proslog posjeta se ne vraca: sam bi otvorio vrata za novi rad.
  let rok: RokStanje = rokZaPovratak(procitajIzborUlaza().rok, danas());
  let odabir: ((file: File) => void) | null = null;

  // --- vrata ubacivanja ------------------------------------------------------------------
  // Vrata otvara SAMO rok; fakultet nije uvjet (vidi zaglavlje).
  const spremnost = () => spremnostUlaza({ rok });

  const osvjeziVrata = (): void => {
    const s = spremnost();
    gumb?.setAttribute('aria-disabled', s.spremno ? 'false' : 'true');
    if (hint) hint.textContent = s.natpis;
    stage?.toggleAttribute('data-intake-spreman', s.spremno);
    // Poruku o odbijenom radu brise samo onaj tko ju je napisao; greske kontrolera ostaju njegove.
    if (s.spremno && greska?.hasAttribute('data-intake-vrata')) {
      greska.removeAttribute('data-intake-vrata');
      greska.textContent = '';
      greska.hidden = true;
    }
  };

  // --- kartica fakulteta -----------------------------------------------------------------
  const osvjeziFakultet = (): void => {
    if (fakultet) {
      fakultet.textContent = predodabir ? predodabir.natpis : '';
      fakultet.hidden = !predodabir;
    }
    if (napomena) {
      napomena.textContent = NAPOMENA_BEZ_FAKULTETA;
      napomena.hidden = Boolean(predodabir);
    }
    if (izvor) izvor.textContent = izvorFakulteta(predodabir, potvrden);
    // Bez predodabira nema sto potvrditi ni mijenjati: fakultet se bira na `/rad/`.
    if (promijeni) promijeni.hidden = !predodabir;
    if (potvrdi) {
      potvrdi.hidden = !predodabir;
      potvrdi.disabled = !predodabir;
      potvrdi.setAttribute('aria-pressed', potvrden ? 'true' : 'false');
      potvrdi.textContent = potvrden ? '✓ Potvrđeno' : 'Potvrdi';
    }
    // PROMJENA LISTA PO ODABIRU (Z32 tocka 2): atribut pali neutralnu marginu i prored u CSS-u,
    // jednom po potvrdi. Kratica je jedina tvrdnja koju list o fakultetu ispisuje.
    paper?.toggleAttribute('data-fakultet-potvrden', potvrden);
    if (listFakultet) listFakultet.textContent = potvrden && predodabir ? predodabir.kratko : '';
  };

  const onPotvrdi = (): void => {
    if (!predodabir) return;
    potvrden = !potvrden;
    zapisiPotvrdu(potvrden ? {
      unit: predodabir.unit, program: predodabir.program, workType: predodabir.workType, sesija: null, at: Date.now(),
    } : null);
    osvjeziFakultet();
    osvjeziVrata();
  };

  // --- rok ---------------------------------------------------------------------------------
  let zadnjiPecatRoka: string | null = null;
  const osvjeziRok = (animiraj: boolean): void => {
    if (rokPolje) {
      rokPolje.disabled = rok.neznam;
      if (rokPolje.value !== (rok.datum ?? '')) rokPolje.value = rok.datum ?? '';
    }
    if (neznam) neznam.checked = rok.neznam;
    const tekst = pecatRoka(rok, danas());
    if (rokPecat) {
      rokPecat.textContent = tekst ?? '';
      rokPecat.hidden = tekst === null;
      // Pecat PADNE samo kad se tekst promijeni i samo uz pokret; obnova iz pohrane ga samo otisne.
      if (animiraj && tekst !== null && tekst !== zadnjiPecatRoka && !prigusen() && typeof rokPecat.animate === 'function') {
        rokPecat.animate([
          { opacity: 0, transform: 'rotate(4deg) scale(1.5)' },
          { opacity: 1, transform: 'rotate(4deg) scale(1)' },
        ], { duration: 320, easing: 'cubic-bezier(.34, 1.4, .5, 1)' });
      }
    }
    zadnjiPecatRoka = tekst;
  };

  const onRok = (): void => {
    const datum = rokPolje?.value ? rokPolje.value : null;
    rok = { datum, neznam: false };
    zapisiRok(rok);
    osvjeziRok(true);
    osvjeziVrata();
  };

  const onNeznam = (): void => {
    const oznaceno = Boolean(neznam?.checked);
    rok = oznaceno ? { datum: null, neznam: true } : { datum: rokPolje?.value || null, neznam: false };
    zapisiRok(rok);
    osvjeziRok(true);
    osvjeziVrata();
  };

  // --- pecat provjere --------------------------------------------------------------------
  const osvjeziPecat = (): void => {
    if (pecat) pecat.textContent = tekstPecataProvjere(stage?.dataset.intakeState);
  };
  const promatrac = typeof MutationObserver === 'function' && stage
    ? new MutationObserver(osvjeziPecat)
    : null;
  if (promatrac && stage) promatrac.observe(stage, { attributes: true, attributeFilter: ['data-intake-state'] });

  // --- ime datoteke slovo po slovo ---------------------------------------------------------
  let tipkanje: ReturnType<typeof setInterval> | null = null;
  const stani = (): void => { if (tipkanje !== null) { clearInterval(tipkanje); tipkanje = null; } };
  const onFileChosen = (name: string): void => {
    stani();
    if (!ime) return;
    if (prigusen()) { ime.textContent = name; ime.classList.remove('is-tipka'); return; }
    let n = 0;
    ime.textContent = '';
    ime.classList.add('is-tipka');
    tipkanje = setInterval(() => {
      n += 1;
      ime.textContent = name.slice(0, n);
      if (n >= name.length) { stani(); ime.classList.remove('is-tipka'); }
    }, SLOVO_MS);
  };

  // --- podizanje lista pri povlacenju (cijeli ekran) -------------------------------------
  let dubina = 0;
  const spusti = (): void => { dubina = 0; paper?.classList.remove('is-podignut'); };
  const nosiDatoteku = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const onDragEnter = (e: DragEvent): void => {
    if (!nosiDatoteku(e)) return;
    dubina += 1;
    if (stage?.dataset.intakeState === 'idle' || stage?.dataset.intakeState === 'error') paper?.classList.add('is-podignut');
  };
  const onDragLeave = (e: DragEvent): void => {
    if (!nosiDatoteku(e)) return;
    dubina = Math.max(0, dubina - 1);
    if (dubina === 0) spusti();
  };
  // Bez `preventDefault` na `dragover` preglednik ispustanje izvan lista tretira kao otvaranje
  // datoteke u kartici, pa bi student izgubio stranicu.
  const onDragOver = (e: DragEvent): void => { if (nosiDatoteku(e)) e.preventDefault(); };
  const onDrop = (e: DragEvent): void => {
    spusti();
    // Ispustanje NA list vec je obradio kontroler (i pozvao `preventDefault`).
    if (e.defaultPrevented || !nosiDatoteku(e)) return;
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    if (!spremnost().spremno) { onBlocked(); return; }
    odabir?.(file);
  };

  // --- vrata: sto kad korisnik pokusa prerano --------------------------------------------
  function onBlocked(): void {
    // Rad NIJE primljen, i to se kaze (poruka s `role="alert"`), a fokus ide na rok, jedino sto
    // vrata traze; na mobitelu (pribor je ispod lista) ekran se sam pomakne do njega.
    if (greska) {
      greska.textContent = PORUKA_ODBIJENO;
      greska.hidden = false;
      greska.setAttribute('data-intake-vrata', '');
    }
    const cilj = rokPolje && !rokPolje.disabled ? rokPolje : neznam;
    cilj?.focus();
  }

  potvrdi?.addEventListener('click', onPotvrdi);
  rokPolje?.addEventListener('change', onRok);
  rokPolje?.addEventListener('input', onRok);
  neznam?.addEventListener('change', onNeznam);
  doc.addEventListener('dragenter', onDragEnter);
  doc.addEventListener('dragleave', onDragLeave);
  doc.addEventListener('dragover', onDragOver);
  doc.addEventListener('drop', onDrop);

  osvjeziFakultet();
  osvjeziRok(false);
  osvjeziVrata();
  osvjeziPecat();

  return {
    canAccept: () => spremnost().spremno,
    onBlocked,
    onFileChosen,
    onSessionStored(sessionId: string): void {
      // Rok se veze za sesiju UVIJEK (Z34 i Z36 citaju rok tog rada); potvrda samo ako je dana.
      veziRokZaSesiju(sessionId, rok);
      if (potvrden) veziPotvrduZaSesiju(sessionId);
    },
    poveziOdabir(fn): void { odabir = fn; },
    destroy(): void {
      stani();
      promatrac?.disconnect();
      potvrdi?.removeEventListener('click', onPotvrdi);
      rokPolje?.removeEventListener('change', onRok);
      rokPolje?.removeEventListener('input', onRok);
      neznam?.removeEventListener('change', onNeznam);
      doc.removeEventListener('dragenter', onDragEnter);
      doc.removeEventListener('dragleave', onDragLeave);
      doc.removeEventListener('dragover', onDragOver);
      doc.removeEventListener('drop', onDrop);
    },
  };
}
