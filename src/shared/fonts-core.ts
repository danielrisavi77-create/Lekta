/**
 * GLASOVI KOJE NOSI SVAKA STRANICA: Instrument Serif (govori) i Geist Mono (oznacava i mjeri).
 *
 * Odluka vlasnika 2026-09-26 (`design/handoff/ALIGNMENT.md`, Z7, opcija a) zamijenila je cetiri
 * dotadasnje obitelji (ondje su imenovane) s ove dvije, u CIJELOM proizvodu. Posljedica koja se
 * najlakse previdi: Instrument Serif ima SAMO rez 400 i kurziv, bez osi opticke velicine i bez
 * ijedne tezine iznad 400. Hijerarhiju naslova zato nosi velicina ili kurziv; `font-synthesis:
 * none` u `design-system.css` cuva da preglednik ne podmetne lazno podebljanje.
 *
 * DATOTEKE SU VENDORIRANE, NE PAKETI. `src/assets/fonts/` nosi sest woff2 rezova (latin i
 * latin-ext), OFL licence i jedan list s @font-face pravilima i metrickim zamjenskim glasovima.
 * Paketi se ne dodaju u package.json jer je node_modules dijeljen izmedju sesija (F19 u
 * docs/agents/orchestrator-backlog.md).
 *
 * SVE RUTE UCITAVAJU ISTE DVIJE OBITELJI. Razdvajanje podatkovnih glasova na zaseban modul samo za
 * rute s dokumentom time je izgubilo predmet i taj je modul uklonjen: glas tudjeg rada je od sada
 * sistemska Georgia (`--font-doc`), koja se ne ucitava ni na jednoj ruti.
 *
 * KURZIV JE ZASEBAN REZ I PLACA SE ZASEBNO, ali se NE preloada: preglednik ga skida tek kad ga
 * stranica crta (nadnaslov, biljeska korektora, tekstualna veza). Preload nose samo uspravni serif
 * 400 i mono (vidi `fontPreload` u vite.config.ts).
 */
import '../assets/fonts/fonts.css';
