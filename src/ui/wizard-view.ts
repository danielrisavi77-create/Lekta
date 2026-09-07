/**
 * JEDINI PISAC PRIKAZA (T16, korak B4).
 *
 * Do sada su tri glavne povrsine (`wizardView`, `progressView`, `resultView`) prebacivane rucno,
 * na sest mjesta u `app.ts`, svaki put kao skup od dva do tri `classList` poziva unutar
 * `withViewTransition`. Nista nije jamcilo da su ta tri stanja medjusobno iskljuciva: da netko
 * zaboravi jedan poziv, dva bi prikaza bila vidljiva istovremeno i nijedan test to ne bi vidio.
 *
 * `renderView` uzima STANJE, a ne popis elemenata, pa je iskljucivost svojstvo funkcije a ne
 * discipline pozivatelja: tocno jedan prikaz ostaje bez `hidden`, uvijek.
 *
 * `data-step` se pise SAMO kad je carobnjak vidljiv. Kad nije, `viewFor` vraca `null` i atribut se
 * ne dira: tada ga nitko ne cita, a mijenjati ga znacilo bi izmisljati stanje.
 */
import { viewFor, type WizardState } from './wizard-machine';

const PRIKAZI = ['wizardView', 'progressView', 'resultView'] as const;

export function renderView(stanje: WizardState, doc: Document = document): void {
  const { prikaz, korak } = viewFor(stanje);
  for (const id of PRIKAZI) {
    const el = doc.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== prikaz);
  }
  if (korak !== null) doc.getElementById('wizardView')?.setAttribute('data-step', korak);
}

/**
 * KORAK CAROBNJAKA KAO STANJE. Do 2026-09-07 je `setWizardStep` u `app.ts` pisao `dataset.step`
 * IZRAVNO, mimo `renderView`, pa su postojala dva pisca istog stanja: korak se mogao postaviti
 * a da nista ne jamci da je carobnjak uopce vidljiv. Prijevod broja u stanje pripada ovdje, jer
 * je ovaj modul taj koji tvrdi iskljucivost prikaza.
 *
 * `fileName` se PRIMA, ne cita: modul ostaje bez znanja o odabranom dokumentu, pa je testabilan
 * bez `app.ts` i bez preglednika.
 */
export const KORAK_U_STANJE: Readonly<Record<number, WizardState>> = { 1: 'dokument', 2: 'profil', 3: 'provjera' };

export function showWizardStep(
  korak: number,
  fileName: string | null = null,
  doc: Document = document,
): boolean {
  const stanje = KORAK_U_STANJE[korak];
  if (!stanje) return false;
  renderView(stanje, doc);
  if (stanje === 'profil' && fileName) {
    const f = doc.getElementById('stepFileName');
    if (f) { f.textContent = fileName; f.title = fileName; }
  }
  return true;
}
