import { CHECK_ITEMS } from '../../config/config-loader';
import { renderSiteStats } from '../shared/site-stats-strip';
import { PRICING_TIERS } from '../../config/pricing-tiers';
import { loadProductionConfig, paidOffersLive } from '../../config/production-config';
import '../../shared/fonts-document'; // podatkovni glasovi (Source Serif 4 za dokument-preglede, IBM Plex Mono za brojke)
import '../../shared/ui-boot';
import '../../shared/page-chrome.css';
import '../../shared/page-app.css';

/**
 * ULAZ RUTE `/saznaj-vise/`.
 *
 * Stranicu cini devet landing sekcija, a samo DVIJE trebaju JS: `#checkGrid` i `#pricingGrid`.
 * Ostalih sedam je staticki sadrzaj i ovdje se ne dira.
 *
 * NE UVOZI `src/ui/app.ts`. To je cijela poanta ove rute: analizator nosi svoje modulsko stanje,
 * intake gate, Web Worker i pola megabajta grafa, a ovoj stranici treba popis provjera i cjenik.
 * Izmjereno pri uvodjenju: da bi ozicenje analizatora radilo na stranici bez radne povrsine,
 * trebalo bi ograditi 154 pristupa DOM-u kroz 39 funkcija. Namjenski ulaz ne treba nijedan.
 *
 * Zato su `PRICING_TIERS` i produkcijska konfiguracija prethodno izdvojeni iz `app.ts`: bez toga
 * bi ovaj uvoz povukao analizator natrag.
 */

function renderChecks(root: HTMLElement): void {
  root.innerHTML = (CHECK_ITEMS as Array<[string, string, string]>)
    .map(([ikona, naslov, opis]) => `<article class="check-card" data-reveal><span class="check-icon">${ikona}</span><h3>${naslov}</h3><p>${opis}</p></article>`)
    .join('');
}

/**
 * Cjenik. Oblik je NAMJERNO isti kao u `app.ts`: ista klasa, isti redoslijed, ista oznaka.
 * Dvije kopije istog prikaza razisle bi se, pa se razlika mjeri gardom
 * (`tests/learn-more-route.test.ts`), a ne pamcenjem.
 */
function renderPricing(root: HTMLElement, live: boolean): void {
  const pilot = import.meta.env.VITE_LEKTA_STUDENT_PILOT === 'true';
  const config = loadProductionConfig();
  const pilotPurchaseReady = live && !!String(config.reportEndpoint).trim()
    && !!String(config.checkoutEndpoint).trim() && !!String(config.repairEndpoint).trim();
  if (pilot) {
    const note = document.getElementById('guaranteeNote');
    if (note) note.textContent = pilotPurchaseReady
      ? 'Dijagnoza ostaje na tvom uređaju. Kupnja je dostupna, a stvarni ishod popravka potvrđuje ponovna provjera dokumenta.'
      : 'Dijagnoza ostaje na tvom uređaju. Kupnja trenutačno nije dostupna. Nakon popravka stvarni ishod potvrđuje ponovna provjera dokumenta.';
  }
  root.innerHTML = PRICING_TIERS.map((p) => {
    const soon = p.id !== 'free' && (p.id === 'perwork' && pilot ? !pilotPurchaseReady : !live);
    const description = !pilot && p.id === 'free' ? 'Automatski audit dokumenta, lokalno u pregledniku.'
      : !pilot && p.id === 'perwork' ? 'Puni izvještaj i automatski popravak, cijena prema vrsti rada.' : p.desc;
    const features = !pilot && p.id === 'free'
      ? ['Ocjena i pregled po kategorijama', 'Popis mogućih problema i napomena', 'Bez registracije, dokument ostaje na uređaju']
      : p.features;
    const badge = soon ? '<span class="popular soon">USKORO</span>' : (p.featured ? '<span class="popular">PREPORUČENO</span>' : '');
    // NAPOMENA O GRANICI: kad placena ponuda ozivi, `order` staza treba odrediste. Modal narudzbe
    // zivi u zatecenoj stranici i ova ruta ga NE nosi, pa se takav paket vodi na pocetak umjesto
    // da dobije gumb koji nista ne radi. Gumb bez ucinka je gori od poveznice koja vodi dalje.
    const cta = soon
      ? '<button class="btn btn-secondary" type="button" disabled aria-disabled="true">Uskoro</button>'
      : (p.cta.order
        ? `<a class="btn btn-secondary" href="/?paket=${p.cta.order}">${p.cta.label}</a>`
        : `<a class="btn ${p.featured ? 'btn-primary' : 'btn-secondary'}" href="${p.cta.href}">${p.cta.label}</a>`);
    return `<article class="price-card ${p.featured ? 'featured' : ''}${soon ? ' soon' : ''}">${badge}<h3>${p.name}</h3><div class="price">${p.price}</div><p>${description}</p><ul class="features">${features.map((x) => `<li>${x}</li>`).join('')}</ul>${cta}</article>`;
  }).join('');
}

function start(): void {
  // Traka s brojkama: preseljena s ulaza `/` (2026-09-06). Podatak je pecen, pa stranica ne
  // vuce registar profila od 194 KB samo da ispise tri broja.
  const stats = document.getElementById('siteStats');
  if (stats) renderSiteStats(document, stats);

  const checks = document.getElementById('checkGrid');
  if (checks) renderChecks(checks);

  const pricing = document.getElementById('pricingGrid');
  if (import.meta.env.VITE_LEKTA_STUDENT_PILOT === 'true') {
    const side = document.querySelector<HTMLElement>('#pricing .ks-sec-side');
    if (side) side.textContent = 'Besplatna lokalna dijagnoza uključuje nalaze, dokaze i Word upute. Plaća se popravljen DOCX nakon ponovne provjere, po fiksnoj cijeni vrste rada.';
  }
  // Konfiguracija se cita JEDNOM i prosljedjuje: funkcije je primaju kao argument bas zato da
  // dvije strane ne mogu vidjeti razlicito stanje.
  if (pricing) renderPricing(pricing, paidOffersLive(loadProductionConfig()));
}

start();
