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
