/**
 * GLASOVI KOJE NOSI SVAKA STRANICA: Instrument Serif (govori) i Geist Mono (oznacava i mjeri).
 *
 * Odluka vlasnika 2026-09-20 (`design/handoff/ALIGNMENT.md`, Z7, opcija a) zamijenila je cetiri
 * dotadasnje obitelji (ondje su imenovane) s ove dvije. Posljedica
 * koja se najlakse previdi: Instrument Serif ima SAMO rez 400 i kurziv, bez osi opticke velicine i
 * bez ijedne tezine iznad 400. Hijerarhiju naslova zato nosi velicina ili kurziv; `font-synthesis:
 * none` u `design-system.css` cuva da preglednik ne podmetne lazno podebljanje.
 *
 * Geist Mono je uzet u varijabilnoj inacici jer je mjerljivo manja (172.241 B raspakirano naspram
 * 1.564.438 B statickog paketa s pojedinacnim rezovima), pa registrira ime "Geist Mono Variable".
 *
 * SVE RUTE UCITAVAJU ISTE DVIJE OBITELJI. Razdvajanje podatkovnih glasova na zaseban modul samo za
 * rute s dokumentom time je izgubilo predmet i taj je modul uklonjen: glas tudjeg rada je od sada
 * sistemska Georgia (`--font-doc`), koja se ne ucitava ni na jednoj ruti.
 *
 * KURZIV JE ZASEBAN REZ I PLACA SE ZASEBNO. Nosi ga nadnaslov na papiru, naslovi stupaca u
 * podnozju i biljeska korektora. Ako ikad zatreba rezati bajtove na `/`, ovo je prvo mjesto.
 */
import '@fontsource/instrument-serif/400.css'; // display serif, uspravni rez (latin + latin-ext)
import '@fontsource/instrument-serif/400-italic.css'; // kurziv: nadnaslov, biljeska korektora, veze
import '@fontsource-variable/geist-mono'; // glas sucelja i mjere: gumbi, navigacija, brojevi, sifre
