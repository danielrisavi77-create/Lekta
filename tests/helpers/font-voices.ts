import { brotliDecompressSync } from 'node:zlib';

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
