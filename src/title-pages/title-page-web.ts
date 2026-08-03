/**
 * Build-time ulaz za motor slaganja naslovnice (scripts/generate-title-page-tools.mjs, B5).
 *
 * Jedan izvor istine: re-izvozi buildTitlePage/titlePageText (src/tools/title-page.ts) i
 * renderTemplateSheet/lineStyleCss (render-sheet.ts, B5.1). Generator ga esbuildom bundla u
 * IIFE (globalName LektaTitlePage) i evaluira u Node da staticki pregled po fakultetu ostane
 * bajt-vjeran stvarnom klijentskom generatoru (naslovnica-page.ts), bez duplicirane,
 * drift-podlozne reimplementacije - isti obrazac kao src/citations/citation-web.ts.
 *
 * Za razliku od citation-web.ts, ovaj bundle se NE isporucuje pregledniku: SEO stranice po
 * fakultetu su staticke (build-time prerenderiran pregled + CTA na zivi naslovnica.html), bez
 * interaktivnog widgeta, pa se koristi ISKLJUCIVO u Node build koraku.
 */
import { buildTitlePage, titlePageText } from '../tools/title-page';
import { renderTemplateSheet, lineStyleCss } from './render-sheet';
import { LEVEL_SLUGS } from './level-slugs';

export { buildTitlePage, titlePageText, renderTemplateSheet, lineStyleCss, LEVEL_SLUGS };
