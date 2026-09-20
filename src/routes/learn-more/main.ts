import { CHECK_ITEMS } from '../../config/config-loader';
import { renderSiteStats } from '../shared/site-stats-strip';
import { renderPricingReceipt } from '../../shared/pricing-receipt';
import { renderPricingLetter } from '../../shared/pricing-letter';
import { loadProductionConfig, paidOffersLive } from '../../config/production-config';
import '../../shared/fonts-document'; // podatkovni glasovi (Source Serif 4 za dokument-preglede, IBM Plex Mono za brojke)
import '../../shared/ui-boot';
import '../../shared/page-chrome.css';
import '../../shared/page-app.css';

/**
 * ULAZ RUTE `/saznaj-vise/`.
 *
 * Stranicu cini devet landing sekcija, a samo DVIJE trebaju JS: popis provjera (`#checkGrid`) i
 * cjenik (`#pricingReceipt` + `#pricingLetter`). Ostalih sedam je staticki sadrzaj i ne dira se.
 *
 * NE UVOZI `src/ui/app.ts`. To je cijela poanta ove rute: analizator nosi svoje modulsko stanje,
 * intake gate, Web Worker i pola megabajta grafa, a ovoj stranici treba popis provjera i cjenik.
 * Izmjereno pri uvodjenju: da bi ozicenje analizatora radilo na stranici bez radne povrsine,
 * trebalo bi ograditi 154 pristupa DOM-u kroz 39 funkcija. Namjenski ulaz ne treba nijedan.
 *
 * Zato su cjenik i produkcijska konfiguracija izdvojeni iz `app.ts`: bez toga bi ovaj uvoz povukao
 * analizator natrag. Racun cijenu dobiva iz `src/report/pricing.ts`, a plan popravka uvozi samo kao
 * TIP, pa ni on ne povlaci nista iz analizatora.
 */

function renderChecks(root: HTMLElement): void {
  root.innerHTML = (CHECK_ITEMS as Array<[string, string, string]>)
    .map(([ikona, naslov, opis]) => `<article class="check-card" data-reveal><span class="check-icon">${ikona}</span><h3>${naslov}</h3><p>${opis}</p></article>`)
    .join('');
}

/**
 * CJENIK (Z11): racun na stolu + pismo za instituciju, iz JEDNOG izvora cijene.
 *
 * Prije ovoga su tri kartice cjenika crtale zaseban marketinski popis koji nije bio
 * uskladjen s naplatom: nosio je nizu pocetnu cijenu od stvarne i paket rucnog uredjivanja kojeg
 * naplata uopce ne poznaje. Ova ruta zato vise ne zna nijedan iznos; zna samo GDJE se racun montira
 * i je li placena ponuda ziva.
 *
 * Vrsta rada je pocetni odabir izbornika, jer na ovoj stranici jos nema analiziranog rada.
 */
function renderCjenik(receiptRoot: HTMLElement | null, letterRoot: HTMLElement | null, live: boolean, contactEmail: string): void {
  // ODREDISTE CTA-a: ova ruta NEMA analizator ni modal narudzbe (vidi biljesku iznad), pa kupnja
  // ovdje ne moze poceti. Vodi se na ulaz, isto kamo vode i ostale CTA poveznice ove stranice, jer
  // je poveznica koja vodi dalje bolja od gumba bez ucinka.
  if (receiptRoot) renderPricingReceipt(receiptRoot, { workType: 'diplomski', live, cta: { href: '/#analyzer' } });
  if (letterRoot) renderPricingLetter(letterRoot, { contactEmail });
}

function start(): void {
  // Traka s brojkama: preseljena s ulaza `/` (2026-09-06). Podatak je pecen, pa stranica ne
  // vuce registar profila od 194 KB samo da ispise tri broja.
  const stats = document.getElementById('siteStats');
  if (stats) renderSiteStats(document, stats);

  const checks = document.getElementById('checkGrid');
  if (checks) renderChecks(checks);

  // Konfiguracija se cita JEDNOM i prosljedjuje: funkcije je primaju kao argument bas zato da
  // dvije strane ne mogu vidjeti razlicito stanje.
  const productionConfig = loadProductionConfig();
  renderCjenik(
    document.getElementById('pricingReceipt'),
    document.getElementById('pricingLetter'),
    paidOffersLive(productionConfig),
    productionConfig.contactEmail,
  );
}

start();
