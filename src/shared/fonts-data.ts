/**
 * PODATKOVNI GLAS (IBM Plex Mono), ODVOJEN OD GLASA DOKUMENTA.
 *
 * `design/README.md` ima cetiri glasa i mono je medju njima JEDINI podatkovni: brojevi, sifre
 * pravila, statusi i eyebrow natpisi. Do Z7 je zivio iskljucivo u `fonts-document.ts`, zajedno sa
 * Source Serif 4 (glas TUDJEG dokumenta), pa se nije mogao uzeti bez njega.
 *
 * ZASTO SE RAZDVAJA (Z7, ulazni ekran `/`): papir ulaza je preslozen u OBRAZAC i time je prvi put
 * dobio mete podatkovnog glasa, kojih dotad nije imao nijednu: broj ulaznog lista, oznake
 * zaglavlja, pecat stanja, brojevi koraka i sitni otisak u podnozju. Bez ovog uvoza bi `var(--mono)`
 * tiho pao na sustavni `ui-monospace`, dakle na Windowsu Consolas. To je TOCNO onaj kvar zbog kojeg
 * `tests/entry-fonts.test.ts` uopce postoji (`.intake-kicker` je tako crtao Consolas), pa bi
 * izostavljanje bilo vracanje vec popravljene greske, ne ustednja.
 *
 * SOURCE SERIF 4 I DALJE NE ULAZI NA `/`: ondje nema nijednog pregleda tudjeg dokumenta. Tu granicu
 * cuva tvrdnja "podatkovni glas dokumenta NE ulazi u graf ulaza" u istom listu testova.
 *
 * JEDNA TEZINA, NAMJERNO. Mjereno u `node_modules`: svaka tezina nosi ~14,7 kB (latin) + ~13,3 kB
 * (latin-ext, a hrvatski ga trazi), dakle ~28 kB po tezini. Ulaz sve svoje mono mete crta u 400,
 * pa se 500 i 600 ovdje NE uvoze; njih i dalje nosi `fonts-document.ts` za rute koje ih imaju.
 */
import '@fontsource/ibm-plex-mono/400.css'; // podatkovni glas: brojevi, oznake, statusi
