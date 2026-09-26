import { resolve } from 'node:path';
import { Window } from 'happy-dom';
import { brotliDecompressSync } from 'node:zlib';
import { staticRuntimeImports, type IzvorDatoteka } from './module-graph';

/**
 * CISTI DIO GARDOVA NAD GLASOVIMA PROIZVODA (Z7 opcija a, odluka vlasnika 2026-09-26).
 *
 * Dijele ga `tests/entry-fonts.test.ts` (tvrdnje nad stvarnim stablom) i
 * `tests/gate-mutations.test.ts` (mutacije nad istim ulazom u memoriji). Funkcije NE citaju disk:
 * pozivatelj im daje tekst i bajtove, pa se ista funkcija moze vrtjeti nad nemutiranim i
 * mutiranim ulazom i baseline je tocno ono sto gard mjeri.
 */

/** Dva glasa proizvoda. Sve ostale obitelji su gosti (sistemske) ili metricki zamjenski glasovi. */
export const GLASOVI = ['Geist Mono', 'Instrument Serif'] as const;

/**
 * Svi ulazi proizvoda koji crtaju sucelje: rute, alati, admin i demo. Staze su relativne prema
 * korijenu repozitorija. Dijele ga `tests/entry-fonts.test.ts` i mutacije u
 * `tests/gate-mutations.test.ts`, da popis ruta u gardu i u mutaciji ne moze razici.
 */
export const SVI_ULAZI = [
  'src/routes/intake/main.ts', 'src/routes/workspace/main.ts', 'src/routes/my-work/main.ts',
  'src/routes/learn-more/main.ts', 'src/tools/citat-page.ts', 'src/tools/izjava-page.ts',
  'src/tools/kartice-page.ts', 'src/tools/literatura-page.ts', 'src/tools/naslovnica-page.ts',
  'src/shared/page-boot.ts', 'src/admin/admin-dashboard-boot.ts', 'src/demo/main.ts',
] as const;

/**
 * Obitelji koje je Z7 uklonio (i Caveat, koji je otisao ranije). Trazi se i ime obitelji i ime
 * paketa, jer se vracaju razlicitim putevima: obitelj kroz CSS ili inline stil, paket kroz
 * `import`. Zabrana jednog oblika ostavlja drugi otvorenim.
 */
export const UKLONJENE = [
  'Newsreader', 'Inter Tight', 'IBM Plex', 'Plex Mono', 'Source Serif', 'Caveat',
  'inter-tight', 'newsreader', 'source-serif', 'ibm-plex', 'fontsource/caveat',
] as const;

/** Svaka datoteka u kojoj se neko od uklonjenih imena pojavljuje, kao `ime: zabranjeno`. */
export function zabranjenaImena(datoteke: ReadonlyArray<{ ime: string; tekst: string }>): string[] {
  const nalazi: string[] = [];
  for (const { ime, tekst } of datoteke) {
    for (const zabranjeno of UKLONJENE) {
      if (tekst.includes(zabranjeno)) nalazi.push(`${ime}: ${zabranjeno}`);
    }
  }
  return nalazi.sort();
}

const bezKomentara = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Svaki `@font-face` blok kao mapa svojstvo -> vrijednost (kljucevi malim slovima). */
export function fontFaceBlokovi(css: string): Array<Record<string, string>> {
  return Array.from(bezKomentara(css).matchAll(/@font-face\s*\{([^}]*)\}/g), (m) => {
    const out: Record<string, string> = {};
    for (const dekl of m[1].split(';')) {
      const i = dekl.indexOf(':');
      if (i < 0) continue;
      out[dekl.slice(0, i).trim().toLowerCase()] = dekl.slice(i + 1).trim();
    }
    return out;
  });
}

const imeObitelji = (v: string | undefined): string => (v ?? '').trim().replace(/^["']|["']$/g, '');

/** Obitelji koje neki `@font-face` s `url()` stvarno ucitava (webfontovi, ne lokalni zamjenski). */
export function webfontObitelji(cssTekstovi: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const css of cssTekstovi) {
    for (const b of fontFaceBlokovi(css)) if (/url\(/.test(b.src ?? '')) out.add(imeObitelji(b['font-family']));
  }
  return out;
}

/** Sve obitelji koje ima neki `@font-face`, ukljucivo metricke zamjenske (`local()`). */
export function deklariraneObitelji(cssTekstovi: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const css of cssTekstovi) for (const b of fontFaceBlokovi(css)) out.add(imeObitelji(b['font-family']));
  return out;
}

// --- WOFF2: metrike webfonta citaju se iz STVARNE datoteke, ne prepisuju -----------------------

/** Indeksi poznatih tablica iz WOFF2 specifikacije (5.1); treba ih samo head i hhea. */
const WOFF2_TAGOVI = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep'];

function uintBase128(b: Uint8Array, pos: number): [number, number] {
  let v = 0;
  for (let i = 0; i < 5; i += 1) {
    const x = b[pos + i];
    v = v * 128 + (x & 0x7f);
    if ((x & 0x80) === 0) return [v, pos + i + 1];
  }
  throw new Error('UIntBase128 dulji od 5 bajtova');
}

export interface Metrike { upm: number; ascender: number; descender: number; lineGap: number }

/**
 * `head.unitsPerEm` i `hhea` ascender/descender/lineGap iz WOFF2 datoteke. Tablice head i hhea
 * WOFF2 nikad ne transformira, pa ih je dovoljno pronaci u dekomprimiranom toku.
 */
export function woff2Metrike(bajtovi: Uint8Array): Metrike {
  const dv = new DataView(bajtovi.buffer, bajtovi.byteOffset, bajtovi.byteLength);
  if (String.fromCharCode(...bajtovi.subarray(0, 4)) !== 'wOF2') throw new Error('nije WOFF2');
  const brojTablica = dv.getUint16(12);
  const komprimirano = dv.getUint32(20);
  let pos = 48;
  const tablice: Array<{ tag: string; duljina: number }> = [];
  for (let t = 0; t < brojTablica; t += 1) {
    const zastavice = bajtovi[pos]; pos += 1;
    const indeks = zastavice & 0x3f;
    const verzija = zastavice >> 6;
    let tag: string;
    if (indeks === 63) { tag = String.fromCharCode(...bajtovi.subarray(pos, pos + 4)); pos += 4; } else tag = WOFF2_TAGOVI[indeks] ?? `#${indeks}`;
    let izvorna: number;
    [izvorna, pos] = uintBase128(bajtovi, pos);
    const transformirana = tag === 'glyf' || tag === 'loca' ? verzija === 0 : verzija !== 0;
    let duljina = izvorna;
    if (transformirana) [duljina, pos] = uintBase128(bajtovi, pos);
    tablice.push({ tag, duljina });
  }
  const tok = brotliDecompressSync(bajtovi.subarray(pos, pos + komprimirano));
  const tdv = new DataView(tok.buffer, tok.byteOffset, tok.byteLength);
  const pomak = new Map<string, number>();
  let o = 0;
  for (const { tag, duljina } of tablice) { pomak.set(tag, o); o += duljina; }
  const head = pomak.get('head');
  const hhea = pomak.get('hhea');
  if (head === undefined || hhea === undefined) throw new Error('WOFF2 bez head ili hhea tablice');
  return {
    upm: tdv.getUint16(head + 18),
    ascender: tdv.getInt16(hhea + 4),
    descender: tdv.getInt16(hhea + 6),
    lineGap: tdv.getInt16(hhea + 8),
  };
}

// --- list s fontovima: pravila Z31 --------------------------------------------------------------

export const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
export const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

const postotak = (v: string | undefined): number | null => {
  const m = (v ?? '').match(/^([\d.]+)%$/);
  return m ? Number(m[1]) : null;
};

/**
 * Sve sto list fontova krsi, kao popis recenica. Prazan popis je cist list.
 *
 * `datoteke` je sadrzaj mape (ime -> bajtovi), da se provjeri i da svaki `url()` postoji i da nijedan
 * woff2 u mapi ne visi bez `@font-face`. Pravila:
 *   webfont   obitelj je jedan od dva glasa; `font-display: swap`; `unicode-range` je doslovno
 *             latin ili latin-ext; ime datoteke nosi isti podskup; Instrument Serif samo rez 400.
 *   zamjenski obitelj "<glas> Fallback..."; izvor samo `local()`; nosi size-adjust i sva tri
 *             override svojstva, a override je metrika webfonta podijeljena sa size-adjustom
 *             (tolerancija 0,05 postotnog boda, jer su vrijednosti zaokruzene na dvije decimale).
 */
export function problemiFontova(css: string, datoteke: ReadonlyMap<string, Uint8Array>): string[] {
  const problemi: string[] = [];
  const blokovi = fontFaceBlokovi(css);
  const koristene = new Set<string>();
  const metrikeGlasa = new Map<string, Metrike>();
  for (const b of blokovi) {
    const obitelj = imeObitelji(b['font-family']);
    const src = b.src ?? '';
    if (!/url\(/.test(src)) continue;
    const oznaka = `@font-face "${obitelj}" ${src}`;
    if (!(GLASOVI as readonly string[]).includes(obitelj)) problemi.push(`${oznaka}: obitelj nije glas proizvoda`);
    if (b['font-display'] !== 'swap') problemi.push(`${oznaka}: font-display nije swap`);
    const raspon = (b['unicode-range'] ?? '').replace(/\s+/g, '');
    const podskup = raspon === LATIN ? 'latin' : raspon === LATIN_EXT ? 'latin-ext' : null;
    if (podskup === null) problemi.push(`${oznaka}: unicode-range nije latin ni latin-ext`);
    if (obitelj === 'Instrument Serif' && b['font-weight'] !== '400') problemi.push(`${oznaka}: Instrument Serif ima samo rez 400`);
    for (const m of src.matchAll(/url\(\s*["']?\.\/([^"')]+)["']?\s*\)/g)) {
      const ime = m[1];
      koristene.add(ime);
      const bajtovi = datoteke.get(ime);
      if (!bajtovi) { problemi.push(`${oznaka}: datoteka ${ime} ne postoji`); continue; }
      if (!ime.endsWith('.woff2')) problemi.push(`${oznaka}: ${ime} nije woff2`);
      const podskupIzImena = /-latin-ext-/.test(ime) ? 'latin-ext' : /-latin-/.test(ime) ? 'latin' : null;
      if (podskup !== null && podskupIzImena !== podskup) problemi.push(`${oznaka}: ${ime} nije podskup ${podskup}`);
      if (!metrikeGlasa.has(obitelj)) metrikeGlasa.set(obitelj, woff2Metrike(bajtovi));
    }
  }
  for (const ime of datoteke.keys()) {
    if (ime.endsWith('.woff2') && !koristene.has(ime)) problemi.push(`${ime}: woff2 bez @font-face`);
  }
  for (const b of blokovi) {
    const obitelj = imeObitelji(b['font-family']);
    const src = b.src ?? '';
    if (/url\(/.test(src)) continue;
    const glas = GLASOVI.find((g) => obitelj.startsWith(`${g} Fallback`));
    const oznaka = `@font-face "${obitelj}" ${src}`;
    if (!glas) { problemi.push(`${oznaka}: lokalna obitelj koja nije zamjenski glas proizvoda`); continue; }
    if (!/^local\(/.test(src)) problemi.push(`${oznaka}: zamjenski glas smije imati samo local() izvor`);
    const sa = postotak(b['size-adjust']);
    if (sa === null || sa <= 0) { problemi.push(`${oznaka}: nema size-adjust`); continue; }
    const m = metrikeGlasa.get(glas);
    if (!m) { problemi.push(`${oznaka}: glas ${glas} nema ucitan woff2 iz kojeg bi se citala metrika`); continue; }
    const ocekivano: Array<[string, number]> = [
      ['ascent-override', (m.ascender / m.upm / (sa / 100)) * 100],
      ['descent-override', (-m.descender / m.upm / (sa / 100)) * 100],
      ['line-gap-override', (m.lineGap / m.upm / (sa / 100)) * 100],
    ];
    for (const [svojstvo, vrijednost] of ocekivano) {
      const stvarno = postotak(b[svojstvo]);
      if (stvarno === null) problemi.push(`${oznaka}: nema ${svojstvo}`);
      else if (Math.abs(stvarno - vrijednost) > 0.05) {
        problemi.push(`${oznaka}: ${svojstvo} ${stvarno}% a metrika webfonta uz size-adjust ${sa}% daje ${vrijednost.toFixed(2)}%`);
      }
    }
  }
  return problemi;
}

// --- preload (vite.config.ts) -----------------------------------------------------------------

/** Regexi iz `WANTED` u `fontPreload()`, procitani iz teksta konfiguracije. */
export function preloadObrasci(viteConfig: string): RegExp[] {
  const m = viteConfig.replace(/\r\n/g, '\n').match(/function fontPreload\(\)\s*\{\s*const WANTED = \[([\s\S]*?)\];/);
  if (!m) return [];
  return Array.from(m[1].matchAll(/\/((?:\\.|[^/\n])+)\/([a-z]*)/g), (x) => new RegExp(x[1], x[2]));
}

/**
 * Z31: preload nose SAMO uspravni serif 400 i mono, oba iz podskupa latin. Svaki obrazac mora
 * pogoditi tocno jednu vendoriranu datoteku (obrazac koji ne pogadja nista je mrtav i tiho gasi
 * preload), a skup pogodjenih mora biti tocno taj par.
 */
export function problemiPreloada(obrasci: readonly RegExp[], datoteke: readonly string[]): string[] {
  const problemi: string[] = [];
  if (obrasci.length === 0) return ['WANTED u fontPreload() nije procitan'];
  const pogodjene = new Set<string>();
  for (const r of obrasci) {
    const pogoci = datoteke.filter((d) => r.test(d));
    if (pogoci.length !== 1) problemi.push(`${r} pogadja ${pogoci.length} datoteka, a mora tocno jednu`);
    pogoci.forEach((d) => pogodjene.add(d));
  }
  const dopusteno = (d: string): boolean =>
    /^instrument-serif-latin-400-normal\.woff2$/.test(d) || /^geist-mono-latin-wght-normal\.woff2$/.test(d);
  for (const d of pogodjene) if (!dopusteno(d)) problemi.push(`${d} se preloada, a Z31 dopusta samo serif 400 i mono 400 (latin)`);
  const serif = [...pogodjene].some((d) => d.startsWith('instrument-serif-'));
  const mono = [...pogodjene].some((d) => d.startsWith('geist-mono-'));
  if (!serif) problemi.push('uspravni Instrument Serif 400 se ne preloada');
  if (!mono) problemi.push('Geist Mono se ne preloada');
  return problemi;
}

// --- tokeni glasa -----------------------------------------------------------------------------

/** Prva obitelj tokena (ono sto se crta kad je ucitano), bez navodnika; `null` ako tokena nema. */
export function prvaObiteljTokena(css: string, token: string): string | null {
  const m = bezKomentara(css).match(new RegExp(`${token}\\s*:\\s*([^;}]+)`));
  if (!m) return null;
  return m[1].split(',')[0].trim().replace(/^["']|["']$/g, '');
}

/**
 * Z7(a) obrnuto od opcije (b): `--display-serif` mora poceti Instrument Serifom, `--mono` Geist
 * Monom, a `--ui` mora biti mono (izravno ili kroz alias). Obrnut gard iz 45e88fd1: ondje je
 * pojava tih dviju obitelji bila kvar, ovdje je kvar njihova odsutnost.
 */
export function problemiTokena(css: string): string[] {
  const problemi: string[] = [];
  const serif = prvaObiteljTokena(css, '--display-serif');
  const mono = prvaObiteljTokena(css, '--mono');
  const ui = prvaObiteljTokena(css, '--ui');
  if (serif !== 'Instrument Serif') problemi.push(`--display-serif pocinje s "${serif}", a mora s Instrument Serif`);
  if (mono !== 'Geist Mono') problemi.push(`--mono pocinje s "${mono}", a mora s Geist Mono`);
  if (ui !== 'var(--mono)' && ui !== 'Geist Mono') problemi.push(`--ui je "${ui}", a glas sucelja je mono`);
  return problemi;
}

// --- gardovi nad grafom ruta i nad stablom (nalaz pregleda Z7(a)) --------------------------------
//
// Svaka funkcija ispod je cisti dio jednog garda iz `tests/entry-fonts.test.ts`. Citac obitelji
// (`webfontObitelji`) se predaje kao parametar, jer je upravo citac bio slijepa tocka: citac koji
// vrati prazan skup pretvara "nijedan list ne ucitava X" u vakuumski zelen gard. Zato funkcije
// nose SENTINEL nad citacem, a `tests/gate-mutations.test.ts` podmece i pokvaren citac.

export type CitacObitelji = (cssTekstovi: readonly string[]) => Set<string>;

const popis = (s: Iterable<string>): string => [...s].sort().join(', ');
const jednako = (a: Iterable<string>, b: Iterable<string>): boolean => popis(a) === popis(b);

/**
 * Gard "ulaz ucitava TOCNO dva glasa". Skup webfontova ulaza jednak je skupu koji deklarira list
 * fontova, i taj skup su tocno `GLASOVI`. Imena se izvode iz lista, ne prepisuju.
 */
export function problemiGlasovaUlaza(
  listFontova: string, cssUlaza: readonly string[], citac: CitacObitelji = webfontObitelji,
): string[] {
  const izLista = citac([listFontova]);
  if (izLista.size === 0) return ['citanje fonts.css ne daje nijednu obitelj, dakle gard mjeri krivo'];
  const naUlazu = citac(cssUlaza);
  const problemi: string[] = [];
  if (!jednako(naUlazu, izLista)) problemi.push(`ulaz ucitava [${popis(naUlazu)}], a fonts.css deklarira [${popis(izLista)}]`);
  if (!jednako(naUlazu, GLASOVI)) problemi.push(`ulaz ucitava [${popis(naUlazu)}], a glasovi su tocno [${popis(GLASOVI)}]`);
  return problemi;
}

/**
 * Gard "SVE rute nose ISTE dvije obitelji". `rute` je ulaz -> CSS listovi njegova grafa. Prazna
 * mapa je nalaz, ne cisto stanje: gard bez ijedne rute nije nista izmjerio.
 */
export function problemiRuta(
  rute: ReadonlyMap<string, readonly string[]>, citac: CitacObitelji = webfontObitelji,
): string[] {
  if (rute.size === 0) return ['nijedna ruta nije procitana'];
  const problemi: string[] = [];
  for (const [ulaz, css] of rute) {
    const obitelji = citac(css);
    if (!jednako(obitelji, GLASOVI)) problemi.push(`${ulaz}: ucitava [${popis(obitelji)}], a mora tocno [${popis(GLASOVI)}]`);
  }
  return problemi;
}

/**
 * Gard "nijedna ruta ne ucitava fontove mimo `fonts-core.ts`, i nijedna ne uvozi font kao paket".
 * `graf` su apsolutne staze grafa ulaza (bilo kojim separatorom), `paketi` paketni specifikatori
 * iz istog grafa (`packageImports`).
 */
export function problemiGrafaFontova(ulaz: string, graf: readonly string[], paketi: readonly string[]): string[] {
  const staze = graf.map((p) => p.split(/[\\/]/).join('/'));
  const problemi: string[] = [];
  for (const p of staze.filter((x) => /\/src\/shared\/fonts-(document|data)\.ts$/.test(x))) {
    problemi.push(`${ulaz}: ucitava ${p.slice(p.lastIndexOf('/src/') + 1)}, a zaseban modul glasova je ukinut (Z7)`);
  }
  if (!staze.some((p) => p.endsWith('/src/shared/fonts-core.ts'))) problemi.push(`${ulaz}: graf ne sadrzi src/shared/fonts-core.ts`);
  if (!staze.some((p) => p.endsWith('/src/assets/fonts/fonts.css'))) problemi.push(`${ulaz}: graf ne sadrzi src/assets/fonts/fonts.css`);
  for (const s of paketi.filter((x) => x.startsWith('@fontsource'))) {
    problemi.push(`${ulaz}: uvozi font kao paket (${s}), a fontovi su vendorirani (F19)`);
  }
  return problemi;
}

/**
 * Gard "nijedan drugi list u src/ ne ucitava webfont". SENTINEL nad citacem: u listu fontova
 * citac mora naci tocno dva glasa, inace bi pokvaren citac (prazan skup za svaki list) ostavio
 * gard zelenim bez ijednog mjerenja.
 */
export function listoviSWebfontom(
  listovi: ReadonlyArray<{ ime: string; css: string }>, imeListaFontova: string, citac: CitacObitelji = webfontObitelji,
): string[] {
  const fontovi = listovi.find((l) => l.ime === imeListaFontova);
  if (!fontovi) return [`${imeListaFontova} nije medju listovima, dakle obilazak mjeri krivo`];
  const problemi: string[] = [];
  const uListu = citac([fontovi.css]);
  if (!jednako(uListu, GLASOVI)) {
    problemi.push(`citac u ${imeListaFontova} vidi [${popis(uListu)}], a ondje su tocno [${popis(GLASOVI)}]; gard bi prosao vakuumski`);
  }
  for (const { ime, css } of listovi) {
    if (ime === imeListaFontova) continue;
    const obitelji = citac([css]);
    if (obitelji.size > 0) problemi.push(`${ime}: ucitava webfont [${popis(obitelji)}] mimo ${imeListaFontova}`);
  }
  return problemi;
}

/**
 * Gard "package.json nema instrument-serif ni geist-mono". SENTINEL: bez procitanih ovisnosti
 * (krivo polje, prazan objekt) gard nije nista izmjerio.
 */
export function problemiOvisnosti(pkg: unknown): string[] {
  const polje = (k: string): Record<string, unknown> => {
    const v = typeof pkg === 'object' && pkg !== null ? (pkg as Record<string, unknown>)[k] : undefined;
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  };
  const imena = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
    .flatMap((k) => Object.keys(polje(k)));
  if (imena.length <= 5) return [`procitano ${imena.length} ovisnosti, dakle citanje package.json ne radi`];
  return imena.filter((k) => /instrument-serif|geist-mono/.test(k))
    .map((k) => `${k} je ovisnost, a fontovi su vendorirani u src/assets/fonts/ (F19)`);
}

/** Datoteke licence koje moraju putovati uz vendorirane rezove, po jedna za svaki glas. */
export const LICENCE = ['OFL-geist-mono.txt', 'OFL-instrument-serif.txt'] as const;

/** Gard "OFL licenca putuje uz svaku obitelj". `mapa` je ime datoteke -> tekst. */
export function problemiLicenci(mapa: ReadonlyMap<string, string>): string[] {
  return LICENCE.filter((ime) => !(mapa.get(ime) ?? '').includes('SIL Open Font License, Version 1.1'))
    .map((ime) => `${ime} nedostaje ili nije OFL 1.1`);
}

// ================================================================================================
// KASKADA GLASOVA (Z7 opcija a): model razlaganja kaskade nad STVARNIM listovima.
//
// Do popravka Z7(a) je ovaj model zivio unutar `tests/design-tokens.test.ts`, pa njegovi gardovi
// nisu mogli imati unos u `tests/gate-mutations.test.ts` (mutacija mora zvati ISTU cistu funkciju
// nad stvarnim listom izmijenjenim u memoriji). Preseljen je doslovno; promjene su tri, sve u
// citacu selektora, i svaka ima vlastitu tvrdnju u `tests/design-tokens.test.ts`:
//   1. popis selektora se dijeli zarezom SAMO na vrhu (`:where(p, dd)` je jedan selektor),
//   2. pseudoklase se skidaju s uravnotezenim zagradama (`p:where(:not([class]))` je subjekt `p`),
//   3. specificnost: `:where()` je nula, `:not(x)`, `:is(x)` i `:has(x)` nose specificnost argumenta.
// ================================================================================================

export type ListCss = { ime: string; css: string };

export type Pravilo = {
  ime: string;
  sel: string;
  red: number;
  spec: number;
  obitelj: string | null;
  tezina: string | null;
  sinteza: boolean;
  naglasakTezina: string | null;
  naglasakNagib: string | null;
};

export const SERIF_OBITELJ = /var\(\s*--(?:display-serif|font-hand)\s*[,)]|Instrument Serif/i;
export const MONO_OBITELJ = /var\(\s*--(?:mono|ui|sans)\s*[,)]|Geist Mono/i;
/** Glas tudjeg rada: Georgia, kroz token ili doslovno kao prva obitelj. */
export const DOKUMENT_OBITELJ = /var\(\s*--(?:ink-serif|font-doc)\s*[,)]|^\s*Georgia\b/i;
export const KORIJENSKI = ['body', 'html', ':root'];

/** Svijet kojem list pripada: `admin/` i `demo/` imaju vlastiti korijen i vlastite tokene. */
export const svijet = (ime: string): string =>
  ime.includes('/admin/') ? 'admin' : ime.includes('/demo/') ? 'demo' : 'proizvod';

/** Dijeli niz zarezom samo izvan zagrada (popis selektora, a ne argument `:where()`). */
export function podijeliNaVrhu(s: string): string[] {
  const out: string[] = [];
  let dubina = 0;
  let od = 0;
  for (let i = 0; i < s.length; i += 1) {
    const z = s[i];
    if (z === '(' || z === '[') dubina += 1;
    else if (z === ')' || z === ']') dubina -= 1;
    else if (z === ',' && dubina === 0) { out.push(s.slice(od, i)); od = i + 1; }
  }
  out.push(s.slice(od));
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Skida pseudoklase i pseudoelemente, i one s ugnijezdjenim zagradama. */
export function bezPseudo(x: string): string {
  let s = x;
  for (let i = 0; i < 10; i += 1) {
    const dalje = s.replace(/:{1,2}[a-z-]+\([^()]*\)/g, '');
    if (dalje === s) break;
    s = dalje;
  }
  return s.replace(/:{1,2}[a-z-]+/g, '');
}

/**
 * Slozeni dijelovi selektora; kombinator unutar zagrada ne dijeli. Rezultat se pamti: model pita
 * isti selektor tisuce puta (svako pravilo protiv svakog), a rastavljanje je po znaku.
 */
const DIJELOVI = new Map<string, string[]>();
function dijeloviSelektora(sel: string): string[] {
  const zapamceno = DIJELOVI.get(sel);
  if (zapamceno) return zapamceno;
  const dijelovi = rastavi(sel);
  DIJELOVI.set(sel, dijelovi);
  return dijelovi;
}
function rastavi(sel: string): string[] {
  const dijelovi: string[] = [];
  let dubina = 0;
  let tekuci = '';
  for (const z of sel) {
    if (z === '(' || z === '[') dubina += 1;
    if (z === ')' || z === ']') dubina -= 1;
    if (dubina === 0 && /[\s>+~]/.test(z)) {
      if (tekuci.trim()) dijelovi.push(tekuci.trim());
      tekuci = '';
    } else tekuci += z;
  }
  if (tekuci.trim()) dijelovi.push(tekuci.trim());
  return dijelovi;
}
const jePseudoElement = (sel: string): boolean =>
  (dijeloviSelektora(sel).slice(-1)[0] ?? '').includes('::');
const SUBJEKTI = new Map<string, string>();
export const subjekt = (sel: string): string => {
  let s = SUBJEKTI.get(sel);
  if (s === undefined) { s = bezPseudo(dijeloviSelektora(sel).slice(-1)[0] ?? ''); SUBJEKTI.set(sel, s); }
  return s;
};
const PRECI = new Map<string, string[]>();
const preciSelektora = (sel: string): string[] => {
  let p = PRECI.get(sel);
  if (p === undefined) { p = dijeloviSelektora(sel).slice(0, -1).map(bezPseudo).filter(Boolean); PRECI.set(sel, p); }
  return p;
};

const jePodniz = (a: string[], b: string[]): boolean => {
  let i = 0;
  for (const x of b) if (i < a.length && a[i] === x) i += 1;
  return i === a.length;
};

/**
 * Mogu li dva selektora pogoditi ISTI element: jednak subjekt (zadnji slozeni dio), jednaka
 * vrsta kutije (pseudoelement je vlastita), i preci kraceg su podniz predaka duljeg.
 */
export const istiElement = (x: string, y: string): boolean =>
  subjekt(x) === subjekt(y)
  && jePseudoElement(x) === jePseudoElement(y)
  && (jePodniz(preciSelektora(x), preciSelektora(y))
    || jePodniz(preciSelektora(y), preciSelektora(x)));

/**
 * Specificnost (a,b,c) spljostena u jedan broj; sluzi usporedbi, nije CSS ugovor. `:where()` ne
 * nosi nista, a `:not(x)`, `:is(x)` i `:has(x)` nose specificnost argumenta (najjaci clan popisa).
 */
export function specificnost(sel: string): number {
  let s = sel;
  for (let i = 0; i < 10; i += 1) {
    const dalje = s
      .replace(/:where\([^()]*\)/g, '')
      .replace(/:(?:not|is|has)\(([^()]*)\)/g, (_m, arg: string) => {
        let najjaci = '';
        let max = -1;
        for (const c of podijeliNaVrhu(arg)) {
          const v = specificnost(c);
          if (v > max) { max = v; najjaci = c; }
        }
        // Argument se broji kao da stoji na mjestu pseudoklase; element ostaje element.
        return najjaci.replace(/^([a-z][\w-]*)/i, '\u0000$1');
      });
    if (dalje === s) break;
    s = dalje;
  }
  return (s.match(/#[\w-]+/g) ?? []).length * 10000
    + (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[a-z-]+/g) ?? []).length * 100
    + (s.match(/(^|[\s>+~\u0000])[a-z][\w-]*|::[a-z-]+/g) ?? []).length;
}

/**
 * Tezina kao broj; `normal`, `inherit` i slicno daju NaN, pa ne ulaze u usporedbu s 400.
 *
 * `var(--x, 600)` daje REZERVU (600): to je vrijednost koju element dobiva kad mu nijedan predak
 * varijablu nije postavio. Bez ovoga bi `font-weight: var(--emph-weight, 600)` citao `var` kao
 * rijec, davao NaN i tiho ispao iz usporedbe, pa bi globalno pravilo naglaska bilo nevidljivo
 * bas gardu koji ga mjeri.
 */
export const tezinaBroj = (v: string): number => {
  const rezerva = v.match(/^var\(\s*--[\w-]+\s*,\s*([^)]+)\)$/);
  const x = rezerva ? rezerva[1].trim() : v;
  return (x === 'bold' || x === 'bolder') ? 700 : (/^\d+$/.test(x) ? Number(x) : NaN);
};

const jaci = (a: Pravilo, b: Pravilo | null): Pravilo =>
  !b || a.spec > b.spec || (a.spec === b.spec && a.red > b.red) ? a : b;

/** Sva pravila listova, s deklaracijom obitelji i tezine koja unutar TOG bloka pobjeduje. */
export function pravilaIz(listovi: ReadonlyArray<ListCss>): Pravilo[] {
  const sva: Pravilo[] = [];
  listovi.forEach(({ ime, css }, indeks) => {
    for (const blok of bezKomentara(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = blok[1].trim().replace(/\s+/g, ' ');
      if (sel.startsWith('@') || /^[\d.]+%?$/.test(sel) || sel === 'from' || sel === 'to') continue;
      const tijelo = blok[2];
      let obitelj: string | null = null;
      let tezina: string | null = null;
      for (const m of tijelo.matchAll(/(?:^|[;{\s])font-family\s*:\s*([^;}]+)/g)) obitelj = m[1].trim();
      for (const m of tijelo.matchAll(/(?:^|[;{\s])font\s*:\s*([^;}]+)/g)) {
        if (/^inherit\b/.test(m[1].trim())) continue;
        obitelj = m[1].trim();
        // Kratica `font:` RESETIRA tezinu: bez broja ispred velicine to je 400, ne nasljedjivanje.
        const w = m[1].split(/var\(|['"]/)[0].match(/(?<![\w.])([1-9]\d{2}|bold|bolder)(?![\w.%])/);
        tezina = w ? w[1] : '400';
      }
      // `([^;}]+)`, ne `(\w+)`: `font-weight: var(--emph-weight, 600)` inace stane na `var`.
      for (const m of tijelo.matchAll(/(?:^|[;{\s])font-weight\s*:\s*([^;}]+)/g)) tezina = m[1].trim();
      let naglasakTezina: string | null = null;
      let naglasakNagib: string | null = null;
      for (const m of tijelo.matchAll(/(?:^|[;{\s])--emph-weight\s*:\s*([^;}]+)/g)) naglasakTezina = m[1].trim();
      for (const m of tijelo.matchAll(/(?:^|[;{\s])--emph-style\s*:\s*([^;}]+)/g)) naglasakNagib = m[1].trim();
      const sinteza = /font-synthesis\s*:\s*none/.test(tijelo);
      if (obitelj === null && tezina === null && !sinteza
        && naglasakTezina === null && naglasakNagib === null) continue;
      for (const jedan of podijeliNaVrhu(sel)) {
        sva.push({
          ime,
          sel: jedan,
          red: indeks * 1e7 + (blok.index ?? 0),
          spec: specificnost(jedan),
          obitelj,
          tezina,
          sinteza,
          naglasakTezina,
          naglasakNagib,
        });
      }
    }
  });
  return sva;
}

/**
 * Blizina naslijedjenog glasa: `body` je BLIZI predak svemu na stranici nego `html` i `:root`,
 * koji su uz to isti element. Vrijednost sluzi samo usporedbi, nije CSS ugovor.
 */
const BLIZINA = (sel: string): number => (sel === 'body' ? 2 : 1);

/** Je li razrijeseni glas display serif (mono u istom popisu ga pretekne). */
export const jeSerif = (glas: string | null): boolean =>
  glas !== null && SERIF_OBITELJ.test(glas) && !MONO_OBITELJ.test(glas);

/**
 * PRIMJENJUJE LI SE pravilo `r` na SVAKI element koji pogadja `sel`. Smjer je ovdje bitan i
 * razlikuje ovu funkciju od `istiElement`: `.outlook__ceiling strong` i goli `strong` pogadjaju
 * isti element (onaj unutar tog kontejnera), ali NE pogadjaju istu populaciju. Kad se pita
 * "koje pismo ima `strong`", odgovor smije doci samo od pravila koje vrijedi za svaki `strong`.
 */
const vrijediZaSve = (r: string, sel: string): boolean =>
  subjekt(r) === subjekt(sel)
  && jePseudoElement(r) === jePseudoElement(sel)
  && jePodniz(preciSelektora(r), preciSelektora(sel));

/**
 * Pravila jednog svijeta razvrstana po SUBJEKTU. Oba nacina podudaranja (`istiElement`,
 * `vrijediZaSve`) traze jednak subjekt, a predak se trazi po subjektu pravila, pa je ovo samo brzi
 * put do istog skupa kandidata: redoslijed ne utjece na ishod, jer `jaci` bira po specificnosti pa
 * po polozaju u kaskadi. Indeks se gradi jednom po skupu pravila (mutacije grade novi skup).
 */
type Indeks = { poSubjektu: Map<string, Pravilo[]>; korijeni: Pravilo[] };
const INDEKSI = new WeakMap<Pravilo[], Map<string, Indeks>>();
function indeks(sva: Pravilo[], sv: string): Indeks {
  let poSvijetu = INDEKSI.get(sva);
  if (!poSvijetu) { poSvijetu = new Map(); INDEKSI.set(sva, poSvijetu); }
  let ix = poSvijetu.get(sv);
  if (!ix) {
    ix = { poSubjektu: new Map(), korijeni: [] };
    for (const q of sva) {
      if (svijet(q.ime) !== sv) continue;
      const s = subjekt(q.sel);
      const lista = ix.poSubjektu.get(s);
      if (lista) lista.push(q); else ix.poSubjektu.set(s, [q]);
      if (KORIJENSKI.includes(q.sel)) ix.korijeni.push(q);
    }
    poSvijetu.set(sv, ix);
  }
  return ix;
}

/** Vrijednost jedne naslijedjene osi (obitelj, `--emph-*`) kako je kaskada daje elementu. */
function naslijedjeno(
  sva: Pravilo[],
  sel: string,
  ime: string,
  uzmi: (p: Pravilo) => string | null,
  /** Kad vise ljusaka istog svijeta nudi korijen, koja se vrijednost uzima kao mjerodavna. */
  prednost: ((v: string) => boolean) | null,
  /** `true`: gledaju se samo pravila koja vrijede za SVAKI element sel-a (genericki slucaj). */
  strogo: boolean,
): { v: string | null; odakle: string } {
  // SVIJET JE GRANICA I OVDJE, ne samo na korijenu: `admin/` i `demo/` imaju vlastite listove
  // koji se s proizvodom nikad ne ucitavaju zajedno, pa `.finding-card-body strong` iz `demo.css`
  // ne smije odlucivati o pismu `strong`-a na `/rad/`.
  const ix = indeks(sva, svijet(ime));
  let pobjednik: Pravilo | null = null;
  for (const q of ix.poSubjektu.get(subjekt(sel)) ?? []) {
    if (uzmi(q) === null) continue;
    if (strogo ? !vrijediZaSve(q.sel, sel) : !istiElement(q.sel, sel)) continue;
    pobjednik = jaci(q, pobjednik);
  }
  if (pobjednik) return { v: uzmi(pobjednik), odakle: pobjednik.sel };
  const preci = preciSelektora(sel);
  let najblizi: Pravilo | null = null;
  for (const s of new Set(preci)) {
    for (const q of ix.poSubjektu.get(s) ?? []) {
      if (uzmi(q) !== null) najblizi = jaci(q, najblizi);
    }
  }
  if (najblizi) return { v: uzmi(najblizi), odakle: 'predak ' + najblizi.sel };
  const korijeni = ix.korijeni.filter((q) => uzmi(q) !== null);
  if (korijeni.length === 0) return { v: null, odakle: '' };
  const najblize = Math.max(...korijeni.map((q) => BLIZINA(q.sel)));
  const skupina = korijeni.filter((q) => BLIZINA(q.sel) === najblize);
  // UNUTAR NAJBLIZE SKUPINE GARD JE STROG, i to je namjerno. Vise listova istog svijeta ima
  // vlastiti `body` (`page-chrome.css` je ljuska aplikacije, `tool-page.css` ljuska alata), a
  // one se na stranici NIKAD ne ucitavaju zajedno. Poredati ih u jednu kaskadu i uzeti zadnju
  // znaci da abecedno zadnji list moze presutjeti serif u prvom: izmjereno 2026-09-20, serif
  // vracen u `page-chrome.css` nije dao nijedan nalaz jer `tool-page.css` dolazi poslije njega
  // i nosi mono. Zato: ako IJEDNA ljuska tog svijeta nudi vrijednost koja je nalaz, ona vrijedi.
  const istaknuti = prednost ? skupina.filter((q) => prednost(uzmi(q) as string)) : [];
  let korijen: Pravilo | null = null;
  for (const q of istaknuti.length > 0 ? istaknuti : skupina) korijen = jaci(q, korijen);
  return korijen
    ? { v: uzmi(korijen), odakle: 'korijen ' + korijen.sel }
    : { v: null, odakle: '' };
}

/**
 * Glas koji kaskada daje elementu, istim redom kojim ga nalazi preglednik: vlastita
 * deklaracija, pa najjaci PREDAK koji obitelj deklarira, pa korijen tog svijeta.
 *
 * KORIJEN SE BIRA PO BLIZINI, NE PO SPECIFICNOSTI (vidi `BLIZINA`), i racunaju se DVIJE
 * POPULACIJE: presjek (`istiElement`) i strogi prolaz (`vrijediZaSve`). Nalaz je serif ako je
 * serif U BILO KOJEM od dva prolaza. Povijest obje odluke je u `tests/design-tokens.test.ts`.
 */
export function glasZa(sva: Pravilo[], sel: string, ime: string): { glas: string | null; odakle: string } {
  const uzmi = (p: Pravilo): string | null => p.obitelj;
  const presjek = naslijedjeno(sva, sel, ime, uzmi, jeSerif, false);
  const strogo = naslijedjeno(sva, sel, ime, uzmi, jeSerif, true);
  const izabran = jeSerif(strogo.v) ? strogo : presjek;
  return { glas: izabran.v, odakle: izabran.odakle };
}

/** Elementi kojima kaskada daje display serif I tezinu iznad 400. */
export function tezineIznad400(listovi: ReadonlyArray<ListCss>): string[] {
  const sva = pravilaIz(listovi);
  const nalazi: string[] = [];
  const vidjeno = new Set<string>();
  for (const p of sva) {
    if (p.tezina === null || !(tezinaBroj(p.tezina) > 400)) continue;
    const kljuc = p.ime + '::' + p.sel;
    if (vidjeno.has(kljuc)) continue;
    vidjeno.add(kljuc);
    let pobTezina: Pravilo | null = null;
    for (const q of indeks(sva, svijet(p.ime)).poSubjektu.get(subjekt(p.sel)) ?? []) {
      if (!istiElement(q.sel, p.sel)) continue;
      if (q.tezina !== null) pobTezina = jaci(q, pobTezina);
    }
    // Kasnije ili specificnije pravilo koje tezinu vraca na 400 gasi nalaz.
    if (!pobTezina || !(tezinaBroj(pobTezina.tezina ?? '') > 400)) continue;
    const { glas, odakle } = glasZa(sva, p.sel, p.ime);
    if (!jeSerif(glas)) continue;
    nalazi.push(`${p.ime}: ${p.sel} -> ${pobTezina.tezina} (serif iz ${odakle})`);
  }
  return nalazi;
}

/** Par naglaska (`--emph-weight`, `--emph-style`) kako ga kaskada daje elementu. */
function naglasakZa(sva: Pravilo[], sel: string, ime: string): { tezina: string; nagib: string } {
  const w = naslijedjeno(sva, sel, ime, (p) => p.naglasakTezina, null, false).v;
  const st = naslijedjeno(sva, sel, ime, (p) => p.naglasakNagib, null, false).v;
  // Rezerva je ono sto globalno pravilo upisuje kad par nitko nije postavio: mono naglasak.
  return { tezina: w ?? '600', nagib: st ?? 'normal' };
}

/**
 * NAGLASAK UNUTAR SERIFNOG KONTEJNERA, ZA POTOMKA KOJI VLASTITO PRAVILO NEMA. Za svako pravilo sa
 * serifnom obitelji sintetizira se potomak (`X strong`, `X b`) i kroz istu kaskadu razrjesavaju
 * njegova obitelj i naglasak. Granica: tvornicka tezina (nijedno pravilo tezinu ne deklarira) se
 * ne racuna, pa uz gard ide sentinel da globalno pravilo `strong, b` postoji.
 */
export function naglasakUSerifu(listovi: ReadonlyArray<ListCss>): string[] {
  const sva = pravilaIz(listovi);
  const nalazi: string[] = [];
  for (const p of sva) {
    if (!jeSerif(p.obitelj)) continue;
    for (const potomak of ['strong', 'b']) {
      const sel = p.sel + ' ' + potomak;
      let pobTezina: Pravilo | null = null;
      for (const q of indeks(sva, svijet(p.ime)).poSubjektu.get(subjekt(sel)) ?? []) {
        if (!istiElement(q.sel, sel)) continue;
        if (q.tezina !== null) pobTezina = jaci(q, pobTezina);
      }
      if (pobTezina === null) continue; // tvornicka tezina: imenovana granica, ne mjeri se
      if (!jeSerif(glasZa(sva, sel, p.ime).glas)) continue;
      const par = naglasakZa(sva, sel, p.ime);
      const cita = /^var\(\s*--emph-weight\s*[,)]/.test(pobTezina.tezina ?? '');
      const tezina = cita ? par.tezina : (pobTezina.tezina ?? '');
      if (tezinaBroj(tezina) > 400) {
        nalazi.push(`${p.ime}: ${sel} -> ${tezina} (serif iz ${p.sel})`);
        continue;
      }
      // Rez 400 bez kurziva u serifu znaci da naglasak NE POSTOJI: ni deblje ni nagnuto.
      if (cita && par.nagib !== 'italic') {
        nalazi.push(`${p.ime}: ${sel} -> bez kurziva (serif iz ${p.sel})`);
      }
    }
  }
  return [...new Set(nalazi)];
}

/**
 * OBRNUT SMJER: mono kontejner UNUTAR serifnog naslijedio bi serifni par, pa bi njegov `strong`
 * dobio kurziv u pismu koje kurziv nema. Mjeri se RAZRIJESENA obitelj elementa.
 */
export function monoUSerifnomNaglasku(listovi: ReadonlyArray<ListCss>): string[] {
  const sva = pravilaIz(listovi);
  const nalazi: string[] = [];
  for (const p of sva) {
    if (p.obitelj === null || jeSerif(p.obitelj) || !MONO_OBITELJ.test(p.obitelj)) continue;
    if (jeSerif(glasZa(sva, p.sel, p.ime).glas)) continue;
    const par = naglasakZa(sva, p.sel, p.ime);
    if (par.nagib === 'italic' || tezinaBroj(par.tezina) < 500) {
      nalazi.push(`${p.ime}: ${p.sel} -> naglasak ${par.tezina}/${par.nagib} (mono u serifu)`);
    }
  }
  return [...new Set(nalazi)];
}

/**
 * Selektori sucelja koji ne smiju zavrsiti na serifu. FIXTURE, ne izvod: imenovani su selektori
 * koje je krug 2026-09-20 nasao na serifu. Gard uz njih tvrdi da svaki POSTOJI u listovima.
 */
export const UI_SELEKTORI: ReadonlyArray<readonly [string, string]> = [
  // Traka i podnozje su od Z15 jedan sustav (`site-chrome.css`); `route-shell.css` i stara
  // navigacija iz `page-chrome.css` su uklonjeni, pa su njihovi selektori zamijenjeni zivima.
  ['src/shared/site-chrome.css', '.site-chrome__dest'],
  ['src/shared/site-chrome.css', '.site-chrome__steps'],
  ['src/shared/site-chrome.css', '.site-chrome__stamp'],
  ['src/shared/site-chrome.css', '.site-chrome .lampa-btn'],
  ['src/shared/site-chrome.css', '.site-chrome__sheet-eyebrow'],
  ['src/shared/site-chrome.css', '.site-footer__pravno a'],
  ['src/shared/page-app.css', '.status'],
  ['src/shared/page-app.css', '.catalog-chip'],
  ['src/shared/page-app.css', '.phase-tag'],
  ['src/shared/page-app.css', '.detect-badge'],
  ['src/shared/page-app.css', '.provider-pill'],
  ['src/shared/page-app.css', '.legal-engine-badge'],
  ['src/shared/page-app.css', '.profile-status'],
  ['src/shared/page-app.css', '.authority-status'],
  ['src/shared/page-app.css', '.issue-icon'],
  ['src/shared/page-app.css', '.field label'],
  ['src/shared/page-app.css', '.privacy-pill'],
  ['src/shared/page-app.css', 'details.more>summary'],
];

/** Selektori sucelja kojima kaskada daje display serif. `popis` prosljedjuju samo testovi. */
export function uiNaSerifu(
  listovi: ReadonlyArray<ListCss>,
  popis: ReadonlyArray<readonly [string, string]> = UI_SELEKTORI,
): string[] {
  const sva = pravilaIz(listovi);
  const nalazi: string[] = [];
  for (const [ime, sel] of popis) {
    const { glas, odakle } = glasZa(sva, sel, ime);
    if (jeSerif(glas)) nalazi.push(`${ime}: ${sel} (serif iz ${odakle})`);
  }
  return nalazi;
}

/** Svjetovi koji korijenu daju obitelj, a nigdje ne gase sintezu reza. */
export function svjetoviBezSinteze(listovi: ReadonlyArray<ListCss>): string[] {
  const sObitelji = new Set<string>();
  const sGasilom = new Set<string>();
  for (const p of pravilaIz(listovi)) {
    if (!KORIJENSKI.includes(p.sel)) continue;
    if (p.obitelj !== null) sObitelji.add(svijet(p.ime));
    if (p.sinteza) sGasilom.add(svijet(p.ime));
  }
  return [...sObitelji].filter((s) => !sGasilom.has(s)).sort();
}

// --- PROZA NA STRANICI: kaskada razlozena nad STVARNIM DOM-om stranice ----------------------------
//
// Model iznad radi nad SELEKTORIMA i zato ne zna koji element na stranici stvarno postoji. Pitanje
// "ima li odlomak proze serif" je pitanje o ELEMENTU, pa se ovdje kaskada razlaze nad DOM-om iste
// stranice: pravilo se primjenjuje ako `element.matches(selektor)`, pobjednik je po specificnosti
// pa redoslijedu, a bez pogotka obitelj se nasljedjuje od roditelja (i tako do korijena).
//
// GRANICE SU IMENOVANE: uvjeti `@media` se ne vrednuju (pravilo unutar upita vrijedi uvijek),
// `!important` se ne cita, a stanja (`:hover`, `:focus-visible`) ne vrijede jer ih `matches` na
// mirnoj stranici ne pogadja. Pseudoelementi su vlastite kutije i ne odlucuju o elementu.

/** Minimalan oblik DOM elementa koji ovaj model treba; happy-dom ga daje. */
export interface ElementDom {
  matches(sel: string): boolean;
  readonly parentElement: ElementDom | null;
  readonly tagName: string;
  readonly id: string;
  readonly className: string;
  readonly classList: { contains(c: string): boolean };
  readonly textContent: string | null;
}

/** Prvi glas u popisu obitelji (ili kratici `font:`) je li Georgia, izravno ili kroz token. */
export function jeDokument(obitelj: string | null): boolean {
  if (obitelj === null) return false;
  if (/var\(\s*--(?:ink-serif|font-doc)\s*[,)]/.test(obitelj)) return true;
  return /(^|\s)["']?Georgia["']?$/i.test(obitelj.split(',')[0].trim());
}

/** Moze li element uopce pogoditi subjekt selektora (tag, klase, id); jeftin filtar prije `matches`. */
function moguciSubjekt(el: ElementDom, sel: string): boolean {
  const s = subjekt(sel);
  if (s === '' || s === '*') return true;
  const tag = s.match(/^[a-z][\w-]*/i);
  if (tag && tag[0].toLowerCase() !== el.tagName.toLowerCase()) return false;
  for (const m of s.matchAll(/\.([\w-]+)/g)) if (!el.classList.contains(m[1])) return false;
  const id = s.match(/#([\w-]+)/);
  if (id && id[1] !== el.id) return false;
  return true;
}

const opisElementa = (el: ElementDom): string =>
  el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '')
  + (el.className.trim() ? `.${el.className.trim().split(/\s+/).join('.')}` : '');

/** Obitelj koju kaskada daje elementu na stranici, i odakle je dosla. */
export function obiteljElementa(el: ElementDom, sva: Pravilo[]): { obitelj: string | null; odakle: string } {
  for (let e: ElementDom | null = el; e; e = e.parentElement) {
    let pobjednik: Pravilo | null = null;
    for (const p of sva) {
      if (p.obitelj === null || /^(inherit|unset)\b/.test(p.obitelj) || jePseudoElement(p.sel)) continue;
      if (!moguciSubjekt(e, p.sel)) continue;
      let pogodak = false;
      try { pogodak = e.matches(p.sel); } catch { pogodak = false; }
      if (pogodak) pobjednik = jaci(p, pobjednik);
    }
    if (pobjednik) {
      const preko = e === el ? '' : ` (naslijedjeno s ${opisElementa(e)})`;
      return { obitelj: pobjednik.obitelj, odakle: `${pobjednik.ime}: ${pobjednik.sel}${preko}` };
    }
  }
  return { obitelj: null, odakle: 'nijedno pravilo' };
}

/** Broj recenica u tekstu: zavrsni znak iza kojeg dolazi veliko slovo ili kraj. */
export function brojRecenica(tekst: string): number {
  const t = tekst.replace(/\s+/g, ' ').trim();
  return (t.match(/[.!?](?=\s+["„(]?[A-ZČĆĐŠŽ]|\s*$)/g) ?? []).length;
}

/** Tekstni blokovi (`p`, `dd`, `blockquote`) s barem dvije recenice: proza, ne oznaka. */
export function visereceniOdlomci(korijen: { querySelectorAll(sel: string): ArrayLike<unknown> }): ElementDom[] {
  return Array.from(korijen.querySelectorAll('body p, body dd, body blockquote') as ArrayLike<ElementDom>)
    .filter((el) => brojRecenica(el.textContent ?? '') >= 2);
}

/**
 * Visereceni odlomci kojima kaskada NE daje serif (ni display serif ni Georgiju tudjeg teksta).
 * `design/README.md`: mono nikad za recenicu duzu od jednog retka.
 */
export function prozaBezSerifa(odlomci: readonly ElementDom[], sva: Pravilo[]): string[] {
  const nalazi: string[] = [];
  for (const el of odlomci) {
    const { obitelj, odakle } = obiteljElementa(el, sva);
    if (jeSerif(obitelj) || jeDokument(obitelj)) continue;
    const pocetak = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 48);
    nalazi.push(`${opisElementa(el)} "${pocetak}" -> ${obitelj ?? 'bez obitelji'} (${odakle})`);
  }
  return nalazi;
}

// --- GEORGIA U SUCELJU ------------------------------------------------------------------------

/** Pravilo koje smije nositi glas tudjeg rada, i zasto. Razlog je dio podatka, ne komentar. */
export type DopustenaGeorgia = readonly [ime: string, selektor: string, razlog: string];

/**
 * Pravila koja crtaju Georgiju (`--ink-serif`, `--font-doc` ili doslovno), a nisu na popisu
 * dopustenih. SENTINEL: svaki dopusteni unos mora postojati i stvarno nositi Georgiju, inace bi
 * se popis mogao tiho isprazniti (preimenovan selektor) i gard bi prolazio bez ijednog mjerenja.
 */
export function georgiaUSucelju(listovi: ReadonlyArray<ListCss>, dopusteni: ReadonlyArray<DopustenaGeorgia>): string[] {
  const sva = pravilaIz(listovi);
  const nalazi: string[] = [];
  const kljuc = (ime: string, sel: string): string => `${ime}  ${sel}`;
  const dopusteno = new Set(dopusteni.map(([ime, sel]) => kljuc(ime, sel)));
  const vidjeno = new Set<string>();
  for (const p of sva) {
    if (!jeDokument(p.obitelj)) continue;
    vidjeno.add(kljuc(p.ime, p.sel));
    if (!dopusteno.has(kljuc(p.ime, p.sel))) nalazi.push(`${p.ime}: ${p.sel} -> ${p.obitelj}`);
  }
  for (const [ime, sel] of dopusteni) {
    if (!vidjeno.has(kljuc(ime, sel))) nalazi.push(`${ime}: ${sel} je dopusten, a ne postoji ili ne nosi Georgiju`);
  }
  return [...new Set(nalazi)];
}

// --- LISTOVI JEDNE STRANICE, redom kojim ih preglednik primjenjuje --------------------------------

/**
 * CSS listovi koje stranica stvarno ucitava, u redoslijedu kaskade: prvo inline `<style>` blokovi
 * iz `<head>` (Vite umece `<link>` bundlea POSLIJE njih, vidi biljesku u `literatura.html`), pa
 * listovi iz grafa ulaznog modula, dubinski, redom uvoza (tim redom ih Vite i spaja).
 *
 * Izvor datoteka je parametar (`DISK` ili overlay), pa mutacija u `tests/gate-mutations.test.ts`
 * prolazi kroz isti citac kao gard. `korijen` je apsolutna staza repozitorija.
 */
export function listoviStranice(
  korijen: string, htmlRel: string, izvor: IzvorDatoteka,
): { html: string; listovi: ListCss[] } {
  const put = (rel: string): string => resolve(korijen, rel);
  const html = izvor.procitaj(put(htmlRel)).replace(/\r\n/g, '\n');
  const listovi: ListCss[] = Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g), (m) => ({ ime: htmlRel, css: m[1] }));
  const ulazi = Array.from(html.matchAll(/<script\s+type="module"\s+src="\/([^"]+)"/g), (m) => m[1]);
  const vidjeno = new Set<string>();
  const obidji = (staza: string): void => {
    if (vidjeno.has(staza)) return;
    vidjeno.add(staza);
    if (staza.endsWith('.css')) {
      const rel = staza.slice(korijen.length + 1).split(/[\\/]/).join('/');
      listovi.push({ ime: rel, css: izvor.procitaj(staza).replace(/\r\n/g, '\n') });
      return;
    }
    for (const uvoz of staticRuntimeImports(staza, izvor)) obidji(uvoz);
  };
  for (const u of ulazi) obidji(put(u));
  return { html, listovi };
}

let prozor: Window | null = null;

/**
 * HTML stranice kao DOM, bez izvrsavanja skripti i bez dohvata listova (ovdje se mjeri kaskada
 * iz `listoviStranice`, ne ono sto bi happy-dom sam ucitao). `<details>` se otvaraju: odgovor u
 * FAQ-u je proza koju citatelj vidi cim klikne, a pravila tipa `details[open] p` time vrijede.
 */
export function dokumentStranice(html: string): Document {
  prozor ??= new Window({
    settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true },
  });
  const doc = new prozor.DOMParser().parseFromString(html, 'text/html') as unknown as Document;
  doc.querySelectorAll('details').forEach((d) => d.setAttribute('open', ''));
  return doc;
}

/**
 * Stranice nad cijim se DOM-om mjeri proza. Sve javne HTML stranice koje crtaju proizvod (rute,
 * alati, SEO stranice) i samostalna 404. Admin, demo i interna konzola nisu tu: imaju vlastiti
 * svijet tokena i nisu javni tekst. `tests/design-tokens.test.ts` tvrdi da popis pokriva svaku
 * korijensku `.html` stranicu osim njih, pa se nova stranica ne moze tiho izostaviti.
 */
export const STRANICE_PROZE = [
  'index.html', 'rad/index.html', 'saznaj-vise/index.html', 'moji-radovi/index.html',
  'alati.html', 'citat.html', 'izjava.html', 'kartice.html', 'literatura.html', 'naslovnica.html',
  'citati-i-literatura.html', 'landing_usporedba.html', 'landing_benchmark.html', 'public/404.html',
] as const;

/** Proza jedne stranice: koliko je visereceniih odlomaka, koliko ih je u FAQ-u, i koji nemaju serif. */
export function problemiProzeStranice(html: string, listovi: ReadonlyArray<ListCss>): { odlomaka: number; uFaqu: number; problemi: string[] } {
  const odlomci = visereceniOdlomci(dokumentStranice(html));
  const uFaqu = odlomci.filter((el) => (el as unknown as Element).closest('.faq, .fact-list') !== null).length;
  return { odlomaka: odlomci.length, uFaqu, problemi: prozaBezSerifa(odlomci, pravilaIz(listovi)) };
}

/**
 * GEORGIA SMIJE SAMO ONDJE GDJE GLUMI TUDJI RAD (`design/README.md`: tekst korisnikova dokumenta u
 * faksimilu i isjecak pravilnika; nikad u sucelju). Popis je IZVEDEN IZ KODA: 2026-09-26 su pobrojana
 * sva pravila koja crtaju `--ink-serif`, `--font-doc` ili doslovnu Georgiju (src/**.css, inline stil
 * svake stranice), i svako je razvrstano. Sto je ovdje, crta tekst koji pripada radu (ili ide u
 * rad); sve ostalo je bilo sucelje i prebaceno je na `--display-serif` ili `--mono`.
 */
export const DOPUSTENA_GEORGIA: ReadonlyArray<DopustenaGeorgia> = [
  ['src/shared/page-app.css', '.preview-doc', 'pregled korisnikova dokumenta u modalu'],
  ['src/shared/page-app.css', '.ks-doc-paper', 'faksimil studentskog rada na /saznaj-vise/'],
  ['src/shared/page-app.css', '.ks-doc-paper p', 'odlomci istog faksimila'],
  ['src/shared/pricing-receipt.css', '.pl-letter', 'pismo instituciji: dokument koji student salje, ne sucelje'],
  ['src/ui/results/result-visuals.css', '.cockpit-finding__evidence p', 'isjecak pravilnika uz nalaz'],
  ['citat.html', '.out', 'oblikovan zapis koji ide u rad'],
  ['citat.html', '.out-intext code', 'citatnica u tekstu rada'],
  ['citat.html', '#bulk-input', 'korisnikov zalijepljeni popis literature'],
  ['citat.html', '#bulk-result', 'oblikovan popis koji ide u rad'],
  ['citat.html', '.cite-ex code', 'ogledni zapis iz rada'],
  ['citat.html', '.faq code', 'ogledni zapis iz rada u odgovoru FAQ-a'],
  ['literatura.html', '.lit-item', 'sredjen popis literature, tekst rada'],
  ['literatura.html', '.lit-dupes-list li', 'uklonjeni duplikati iz korisnikova popisa'],
  ['izjava.html', '#st-sheet', 'faksimil izjave o izvornosti'],
  ['naslovnica.html', '#tp-sheet', 'faksimil naslovnice'],
];
