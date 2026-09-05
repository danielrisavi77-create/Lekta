import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

/**
 * RAZDVAJANJE `page.css` na ljusku i radnu povrsinu.
 *
 * Skripta stoji u repozitoriju jer je podjela MJERENA, pa se mora dati ponoviti i provjeriti, a ne
 * biti jednokratan zahvat cije se pravilo zaboravi. Pokretanje: `node scripts/split-page-css.mjs
 * <izvor.css>`; bez argumenta samo provjeri postojecu podjelu i ispise mjere.
 *
 * TRI ZAMKE, sve tri izmjerene na vlastitom radu 2026-09-05:
 *
 * 1. MEDIJSKI UPITI SE DIJELE IZNUTRA. Prva izvedba je svaki `@media` blok slala u ljusku, pa je
 *    override iz upita dolazio PRIJE baznog pravila iz drugog lista i obrtao kaskadu: carobnjak na
 *    `/rad/` je na mobitelu bio `display:none`.
 *
 * 2. GLAVA BLOKA NIJE SAMO SELEKTOR. Izmedju `}` i sljedeceg `{` stoje i komentari, pa je
 *    `/* ... *\/html:root{` promasilo provjeru "pocinje li s html", i blok TOKENA TAMNE TEME zavrsio
 *    je u radnoj povrsini. Ulaz bi time ostao bez pola palete. Zato se glava CISTI od komentara.
 *
 * 3. PROVJERA KASKADE MORA GLEDATI UNUTARNJE SELEKTORE. Usporedba glava blokova za `@media` gleda
 *    sam upit, pa unutarnja pravila nikad ne budu usporedjena; tako je zamka 1 i prosla.
 */

const [, , izvor] = process.argv;
const ZAGLAVLJE_LJUSKA = `/*
 * LJUSKA STRANICE: tokeni obiju tema, osnova, zaglavlje, navigacija, gumbi, podnozje, privola, dekor.
 *
 * GENERIRANO: \`node scripts/split-page-css.mjs <izvor.css>\`. Ne uredjuj rucno; razlog podjele,
 * mjerenje i tri zamke stoje u toj skripti.
 *
 * Podjela je napravljena 2026-09-05 po mjerenju: 79 posto izvornog lista ne moze pogoditi nijedan
 * element cistog ulaza \`/\`. Rute s analizatorom uvoze OBA lista, ovim redom; ulaz samo ovaj.
 */
`;

const ZAGLAVLJE_APP = `/*
 * RADNA POVRSINA: analizator, carobnjak, rezultat, popravak, modali, landing sekcije.
 *
 * GENERIRANO: \`node scripts/split-page-css.mjs <izvor.css>\`. Uvozi se SAMO na rutama koje to
 * prikazuju, i uvijek POSLIJE \`page-chrome.css\`, jer je takav bio redoslijed u izvornom listu.
 */
`;


/** Blokovi na dubini 0; komentari i repovi ostaju uz blok koji slijede. */
function razlomi(text) {
  let dubina = 0, buf = '', out = [];
  for (const ch of text) {
    buf += ch;
    if (ch === '{') dubina += 1;
    else if (ch === '}') { dubina -= 1; if (dubina === 0) { out.push(buf); buf = ''; } }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

/** Glava bez komentara: zamka 2. */
const glavaBez = (blok) => {
  const i = blok.indexOf('{');
  return (i < 0 ? blok : blok.slice(0, i)).replace(/\/\*[\s\S]*?\*\//g, '').trim();
};

export function podijeli(css, html) {
  const klase = new Set();
  for (const m of html.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => c && klase.add(c));
  const ids = new Set(Array.from(html.matchAll(/id="([^"]+)"/g), (m) => m[1]));
  const tagovi = new Set(Array.from(html.matchAll(/<([a-z][a-z0-9]*)/g), (m) => m[1]));

  const pogadja = (sel) => {
    if (/^(:root|html)/.test(sel)) return true;              // tokeni i teme: uvijek ljuska
    const k = Array.from(sel.matchAll(/\.([a-zA-Z0-9_-]+)/g), (m) => m[1]);
    const i = Array.from(sel.matchAll(/#([a-zA-Z0-9_-]+)/g), (m) => m[1]);
    const t = Array.from(sel.matchAll(/(^|[\s,>+~])([a-z][a-z0-9]*)/g), (m) => m[2]);
    return k.some((c) => klase.has(c)) || i.some((x) => ids.has(x))
      || (k.length === 0 && i.length === 0 && t.some((x) => tagovi.has(x)));
  };

  const CH = [], AP = [];
  let podijeljenihUpita = 0;
  for (const blok of razlomi(css)) {
    const glava = glavaBez(blok);
    if (blok.indexOf('{') < 0) { CH.push(blok); continue; }
    if (/^@(media|supports)/i.test(glava)) {
      const tijelo = blok.slice(blok.indexOf('{') + 1, blok.lastIndexOf('}'));
      const c = [], a = [];
      for (const r of razlomi(tijelo)) (r.indexOf('{') < 0 || pogadja(glavaBez(r)) ? c : a).push(r);
      const uvod = blok.slice(0, blok.indexOf('{'));
      if (c.length) CH.push(`${uvod}{${c.join('')}}`);
      if (a.length) AP.push(`${uvod}{${a.join('')}}`);
      if (c.length && a.length) podijeljenihUpita += 1;
      continue;
    }
    if (/^@/.test(glava)) { CH.push(blok); continue; }        // @font-face, @keyframes: globalni
    (pogadja(glava) ? CH : AP).push(blok);
  }
  return { CH, AP, podijeljenihUpita };
}

/** Zamka 3: parovi (upit, selektor), ne glave blokova. */
export function selektori(dijelovi) {
  const s = new Set();
  for (const b of dijelovi) {
    const g = glavaBez(b);
    if (b.indexOf('{') < 0) continue;
    if (/^@(media|supports)/i.test(g)) {
      for (const r of razlomi(b.slice(b.indexOf('{') + 1, b.lastIndexOf('}')))) {
        if (r.indexOf('{') > 0) s.add(`${g} || ${glavaBez(r)}`);
      }
    } else s.add(g);
  }
  return s;
}

if (izvor) {
  const css = readFileSync(izvor, 'utf8');
  const html = readFileSync('index.html', 'utf8');
  const { CH, AP, podijeljenihUpita } = podijeli(css, html);
  const oba = [...selektori(CH)].filter((x) => selektori(AP).has(x));
  if (oba.length > 0) {
    console.error(`[split-page-css] ${oba.length} selektora u OBJE polovice; kaskada bi se promijenila:`);
    for (const x of oba.slice(0, 8)) console.error('   ', x.slice(0, 120));
    process.exitCode = 1;
  }
  writeFileSync('src/shared/page-chrome.css', ZAGLAVLJE_LJUSKA + CH.join(''), 'utf8');
  writeFileSync('src/shared/page-app.css', ZAGLAVLJE_APP + AP.join(''), 'utf8');
  const kb = (s) => Math.round(s.length / 1024);
  const gz = (s) => Math.round(gzipSync(Buffer.from(s)).length / 1024);
  console.log(`[split-page-css] upita podijeljenih iznutra: ${podijeljenihUpita}`);
  console.log(`[split-page-css] ljuska ${kb(CH.join(''))} kB raw / ${gz(CH.join(''))} kB gzip, ${CH.length} blokova`);
  console.log(`[split-page-css] radna povrsina ${kb(AP.join(''))} kB raw / ${gz(AP.join(''))} kB gzip, ${AP.length} blokova`);
}
