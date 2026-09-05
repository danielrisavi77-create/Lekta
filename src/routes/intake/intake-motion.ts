/**
 * ULAZNA SEKVENCA: papir slijece na stol, sadrzaj se slaze za njim.
 *
 * SUZDRZANO NAMJERNO (odluka vlasnika 2026-09-05): jedna sekvenca od ~600 ms na ucitavanju i nista
 * poslije. Nema trajnih petlji, disanja ni lebdenja: prvi dojam smije biti skup, deseti dolazak ne
 * smije biti umoran. Lampa koja prati kursor i papir koji reagira na povlacenje vec postoje
 * (`hero-depth.ts` i `.is-dragging`), pa se ovdje ne dupliciraju.
 *
 * BEZ BIBLIOTEKE, i to je mjerenje a ne nacelo: `motion` (v12) je vec ovisnost projekta, ali ga
 * staticki uvoz u ovaj ulaz gura pocetni graf s 160 na 172 KB i obara budzet. Za pet elemenata koji
 * mijenjaju samo `opacity` i `transform` Web Animations API daje isti rezultat uz NULA bajtova, a
 * `element.animate()` postoji u svim ciljanim preglednicima. Biblioteka bi se isplatila za opruge,
 * layout animacije ili scroll, dakle nista od ovoga.
 *
 * TRI UGOVORA:
 *
 * 1. UPOTREBLJIVOST NE CEKA ANIMACIJU. Papir je klikabilan od prvog kadra: animiraju se samo
 *    `opacity` i `transform`, nikad `display`, `visibility` ni razmjestaj. Korisnik koji klikne
 *    tijekom sekvence dobiva file picker, ne cekanje.
 *
 * 2. `prefers-reduced-motion` GASI SEKVENCU U CIJELOSTI, a ne ubrzava je. Tada se ne poziva
 *    nijedna animacija, pa nema ni jednog kadra pomaka.
 *
 * 3. ZAVRSNO STANJE JE BAZNO STANJE. Elementi u HTML-u nemaju pocetnu neprozirnost 0 (bez JS-a i pri
 *    gresci stranica je potpuno vidljiva); sekvenca ih SAMA gura u pocetni kadar pa vraca, uz
 *    `fill: 'backwards'` da se pocetni kadar primijeni tek s pocetkom animacije. Obrnuto bi znacilo
 *    prazan zaslon svakome kome skripta ne prodje.
 */

const PAPIR_MS = 560;
const SADRZAJ_MS = 420;
const REP_MS = 420;
const KORAK_MS = 55;
const PODIZANJE_PX = 18;
/** Bazna rotacija papira iz `intake.css`; zavrsni kadar mora biti tocno ona. */
const PAPIR_ROTACIJA = '-.35deg';
const MEKAN_DOSKOK = 'cubic-bezier(.22, 1, .36, 1)';

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function pokreni(el: Element, keyframes: Keyframe[], duration: number, delay = 0): void {
  // `fill: 'backwards'` drzi prvi kadar SAMO za trajanja kasnjenja; nakon zavrsetka element pada
  // natrag na stil iz CSS-a, pa animacija ne ostavlja inline stanje koje bi kasnije nesto pregazilo.
  el.animate(keyframes, { duration, delay, easing: MEKAN_DOSKOK, fill: 'backwards' });
}

export function playIntakeEntry(doc: Document): void {
  if (reducedMotion()) return;
  if (typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return;

  const paper = doc.getElementById('intakeDropzone');
  if (!paper) return;

  pokreni(paper, [
    { opacity: 0, transform: 'translateY(-22px) scale(1.015) rotate(0deg)' },
    { opacity: 1, transform: `translateY(0) scale(1) rotate(${PAPIR_ROTACIJA})` },
  ], PAPIR_MS);

  const sadrzaj = paper.querySelectorAll('.intake-kicker, .intake-title, .intake-lead, .intake-cta, .intake-hint');
  sadrzaj.forEach((el, i) => {
    pokreni(el, [
      { opacity: 0, transform: `translateY(${PODIZANJE_PX}px)` },
      { opacity: 1, transform: 'translateY(0)' },
    ], SADRZAJ_MS, 90 + i * KORAK_MS);
  });

  // Brojke i poveznice dolaze zadnje i tise: signal povjerenja, ne glavni glas stranice. Bez pomaka,
  // samo pojavljivanje, da oko ostane na papiru.
  const rep = [doc.getElementById('intakeMeta'), doc.querySelector('.intake-stats'), doc.querySelector('.intake-links')];
  rep.forEach((el, i) => {
    if (el) pokreni(el, [{ opacity: 0 }, { opacity: 1 }], REP_MS, 240 + i * 70);
  });
}
