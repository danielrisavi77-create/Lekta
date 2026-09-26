import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectStaticGraph, packageImports } from './helpers/module-graph';
import {
  GLASOVI, deklariraneObitelji, preloadObrasci, problemiFontova, problemiPreloada, problemiTokena,
  webfontObitelji, woff2Metrike, zabranjenaImena,
} from './helpers/font-voices';

/**
 * KOJE SE OBITELJI CRTAJU NA ULAZU `/`.
 *
 * Ovaj gard postoji zato sto su 2026-09-05 na ulazu izmjerene PET obitelji, a dvije od njih
 * nitko nije izabrao:
 *
 *   1. `--font-hand: "Caveat", cursive` -- Caveat je uvozio jedino `src/main.ts`, koji nakon reza
 *      ruta nije ulaz nijedne stranice. Token je uzivo padao na sustavni `cursive`, dakle na
 *      Windowsu Comic Sans, i to na `/` i na `/rad/`.
 *   2. `.intake-kicker` je trazio `var(--font-mono, ...)`, a token se zove `--mono`. Nepostojeci
 *      token tiho uzme fallback, pa se nadnaslov crtao sustavnim `ui-monospace` (Consolas).
 *
 * Obje su tihe: CSS ne prijavljuje ni nepostojeci token ni obitelj bez `@font-face`. Zato se
 * mjeri LANAC: selektor koji moze pogoditi ulaz -> token -> obitelj -> `@font-face` u grafu.
 *
 * OGRANICENJE KOJE SE IMENUJE: podudaranje selektora je priblizno (klase, ID-jevi i goli tagovi
 * iz HTML-a), pa gard moze PROPUSTITI pravilo koje se u pregledniku ipak primijeni. Ne moze,
 * medjutim, lazno OPTUZITI, jer prijavljuje samo ono sto je nasao u dohvatu.
 */

const ROOT = resolve(__dirname, '..');
const ULAZ = resolve(ROOT, 'src/routes/intake/main.ts');

/** Generici i sustavne obitelji: njih preglednik ima, ne ucitavaju se. */
const SUSTAVNE = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-monospace', 'ui-serif',
  'ui-sans-serif', 'ui-rounded', 'inherit', 'initial', 'unset', 'revert', '-apple-system',
  'blinkmacsystemfont', 'segoe ui', 'roboto', 'helvetica neue', 'helvetica', 'arial', 'georgia',
  'times new roman', 'palatino linotype', 'palatino', 'iowan old style', 'menlo', 'consolas',
  'sfmono-regular', 'courier new', 'noto sans', 'liberation sans', 'apple color emoji',
  'segoe ui emoji', 'segoe ui symbol', 'emoji',
]);

/**
 * PISMA KOJA KORISNIK INSTALIRA SAM, i koja se NAMJERNO ne ucitavaju (Z6, `--display-serif` pod
 * `data-reading-font="dyslexic"`).
 *
 * Gard inace tvrdi tocno suprotno ("ime bez ijednog @font-face je uvijek kvar"), i to s razlogom:
 * preglednik tiho uzme sljedecu obitelj. Ovdje je to POSLJEDICA KOJU SE ZELI, a ne promasaj:
 * OpenDyslexic i Atkinson Hyperlegible se ne smiju skidati svima koji ih ne trebaju, a lanac
 * od Z7 zavrsava na sistemskom sansu (`--ui` je sada mono, a mono za citanje nije olaksanje). Iznimka je zato imenovana i uska, ne prosirenje
 * `SUSTAVNE`: bilo koje trece ime i dalje pada. Gard nad krajem lanca:
 * `tests/display-settings.test.ts`.
 */
const LOKALNE = new Set(['opendyslexic', 'atkinson hyperlegible']);

/** Obitelj koju nista ne ucitava, a to nije kvar: sustavna ili izricito dopustena lokalna. */
const smijeBezFonta = (ime: string): boolean => {
  const k = ime.toLowerCase();
  return SUSTAVNE.has(k) || LOKALNE.has(k);
};

interface Nalaz { vrsta: 'nepoznat-token' | 'obitelj-bez-fonta'; selektor: string; detalj: string }

/**
 * Vrijednost koja po OBLIKU ne moze biti ime obitelji: duljina, goli broj ili izracun.
 *
 * Ovo je zamjena za pozicijsku heuristiku "obitelj je zadnja referenca". Pozicija je bila tocna
 * samo za oblik koji je Z5 zatekao (`font: <tezina> var(--velicina)/<broj> var(--obitelj)`), a
 * pada na dva oblika koja CSS jednako dopusta:
 *   `font: 700 var(--fs-ui)/var(--lh) Georgia, serif`  zadnja referenca je VISINA RETKA
 *   `font-family: var(--primary), var(--fallback)`     zadnja referenca je FALLBACK, ne ono
 *                                                      sto se crta
 * Oblik vrijednosti ne ovisi o redoslijedu, pa oba citanja daju isti ishod.
 */
function nijeObitelj(vrijednost: string): boolean {
  const v = vrijednost.trim();
  if (/^(clamp|calc|min|max)\s*\(/i.test(v)) return true;
  return /^[+-]?[0-9.]+(px|rem|em|%|vw|vh|vmin|vmax|pt|pc|cm|mm|in|ch|ex|q)?$/i.test(v);
}

interface Ulaz {
  /** Sadrzaj svakog CSS lista koji ulaz ucitava. */
  cssTekstovi: string[];
  /** HTML ulazne stranice, radi priblizne provjere moze li selektor uopce pogoditi. */
  html: string;
  /** Obitelji za koje graf ulaza stvarno donosi `@font-face`. */
  ucitane: Set<string>;
}

function blokovi(text: string): string[] {
  let dubina = 0; let buf = ''; const out: string[] = [];
  for (const ch of text) {
    buf += ch;
    if (ch === '{') dubina += 1;
    else if (ch === '}') { dubina -= 1; if (dubina === 0) { out.push(buf); buf = ''; } }
  }
  return out;
}

/** Cijela deklaracija bez komentara; za `@media` se gleda TIJELO, ne upit. */
function pravila(css: string): Array<{ selektor: string; tijelo: string }> {
  const out: Array<{ selektor: string; tijelo: string }> = [];
  for (const blok of blokovi(css)) {
    const i = blok.indexOf('{');
    if (i < 0) continue;
    const glava = blok.slice(0, i).replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const tijelo = blok.slice(i + 1, blok.lastIndexOf('}'));
    if (/^@(media|supports|layer)/i.test(glava)) { out.push(...pravila(tijelo)); continue; }
    if (glava.startsWith('@')) continue;
    out.push({ selektor: glava, tijelo });
  }
  return out;
}

/**
 * KOMENTARI NISU PODACI, i to vrijedi za OBJE polovice ovog lista.
 *
 * Globalni gard (`imenaBezFonta`) je komentare skidao od pocetka, jer je proza `--ink-serif:` u
 * biljesci davala obitelji "Word" i "list papira". Provjera ULAZA to nije radila, i rupa je bila
 * latentna tocno dok ulaz nije imao nijednu mono metu: `design-system.css` u uvodnoj biljesci
 * pise `(--mono: brojevi, score, rule-kodovi, statusi, eyebrows)`, pa je citac tu recenicu citao
 * kao definiciju tokena i prijavljivao obitelj "brojevi" koju nista ne ucitava. Izmjereno u Z7,
 * cim je papir dobio mono oznake: pet laznih nalaza na pet selektora.
 */
const bezKomentara = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

export function provjeriGlasove(ulaz: Ulaz): { nalazi: Nalaz[]; obitelji: Set<string> } {
  const { html, ucitane } = ulaz;
  const cssTekstovi = ulaz.cssTekstovi.map(bezKomentara);
  const klase = new Set<string>();
  for (const m of html.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => c && klase.add(c));
  const ids = new Set(Array.from(html.matchAll(/id="([^"]+)"/g), (m) => m[1]));
  const mozePogoditi = (selektor: string): boolean => {
    const k = Array.from(selektor.matchAll(/\.([\w-]+)/g), (m) => m[1]);
    const i = Array.from(selektor.matchAll(/#([\w-]+)/g), (m) => m[1]);
    if (k.some((c) => klase.has(c)) || i.some((x) => ids.has(x))) return true;
    return k.length === 0 && i.length === 0
      && /^(:root|html|body|h[1-6]|p|a|b|strong|button|em|small|label|nav|footer|span|input|svg|\*)/.test(selektor);
  };

  // 1. SVE definicije svakog tokena, ne samo zadnja.
  //
  // Prva izvedba je uzimala "zadnju vidjenu", u nadi da to odgovara kaskadi. Ne odgovara: redoslijed
  // dolazi iz obilaska grafa uvoza, a ne iz redoslijeda ucitavanja listova. Gard je zato PROPUSTIO
  // stvaran kvar: `page-chrome.css` je ponovno definirao `--font-hand:"Caveat"` preko ispravljenog
  // `design-system.css` (56 od 62 tokena stoji u oba lista), a preglednik je crtao Caveat dok je
  // gard bio zelen. Uhvatila ga je tek izmjera `getComputedStyle` u pregledniku.
  //
  // Zato se provjeravaju SVE definicije: dovoljno je da JEDNA vodi u neucitanu obitelj.
  const tokeni = new Map<string, string[]>();
  for (const css of cssTekstovi) {
    for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
      const popis = tokeni.get(m[1]) ?? [];
      popis.push(m[2].trim());
      tokeni.set(m[1], popis);
    }
  }

  // 2. Token -> SVE moguce prve obitelji, kroz lanac aliasa (`--sans: var(--ui)`).
  const razrijesi = (izraz: string, dubina = 0): string[] => {
    if (dubina > 8) return [];
    const alias = izraz.match(/^var\((--[\w-]+)\)$/);
    if (alias) {
      return (tokeni.get(alias[1]) ?? []).flatMap((dalje) => razrijesi(dalje, dubina + 1));
    }
    const prva = izraz.split(',')[0].trim().replace(/^["']|["']$/g, '');
    return prva ? [prva] : [];
  };

  const nalazi: Nalaz[] = [];
  const obitelji = new Set<string>();
  for (const css of cssTekstovi) {
    for (const { selektor, tijelo } of pravila(css)) {
      for (const m of tijelo.matchAll(/(?:^|[;{\s])font(?:-family)?\s*:\s*([^;}]+)/g)) {
        const vrijednost = m[1];
        // `var(--x)` bez fallbacka i `var(--x, fallback)`: oba nose ime tokena.
        const reference = [...vrijednost.matchAll(/var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)/g)];
        if (reference.length === 0) continue;
        // NEPOZNAT TOKEN SE PRIJAVLJUJE UVIJEK, i za selektor koji podudaranje ne vidi.
        //
        // Podudaranje selektora zna biti prekratko: `.skip-link` element UBACUJE JavaScript, pa ga
        // u HTML-u nema i provjera ga preskoci. Tocno ondje je do 2026-09-05 zivio `--font-sans`,
        // token koji ne postoji (zove se `--sans`), pa je fallback na SVIH 14 ruta hvatao "Inter
        // Variable", obitelj koju nista ne ucitava. Nepostojeci token je kvar bez obzira na to
        // koga selektor pogadja: vrijednost tada bira fallback, dakle slucaj, a ne autor.
        // Provjeravaju se SVE reference u deklaraciji, ne samo prva: kratica `font:` ih od Z5
        // (tipografska ljestvica) nosi dvije, velicinu i obitelj.
        const nepoznati = reference.filter((r) => tokeni.get(r[1]) === undefined);
        for (const r of nepoznati) {
          nalazi.push({ vrsta: 'nepoznat-token', selektor, detalj: `${r[1]} nije definiran nigdje u listovima ulaza` });
        }
        if (nepoznati.length > 0) continue;
        // OBITELJ JE PRVA REFERENCA KOJA PO OBLIKU MOZE BITI OBITELJ, ne prva i ne zadnja.
        //
        // Do Z6 je ovdje stajalo "zadnja referenca", sto je bilo tocno samo za oblik koji je Z5
        // zatekao. `font: 700 var(--fs-ui)/var(--lh) Georgia, serif` zadnjom referencom cini
        // VISINU RETKA, a `font-family: var(--primary), var(--fallback)` fallback, dakle ono sto
        // se NE crta dok je prva ucitana. Oblik (duljina, broj, clamp) se cita iz vrijednosti, pa
        // ne ovisi o redoslijedu; vidi `nijeObitelj`.
        const ref = reference.find((r) => (tokeni.get(r[1]) ?? []).some((d) => !nijeObitelj(d)));
        if (ref === undefined) continue;
        const definicije = tokeni.get(ref[1]);
        if (definicije === undefined) continue;
        // Obitelj se provjerava samo ako selektor uopce moze pogoditi stranicu: pravilo koje se
        // nikad ne primijeni ne crta nista, pa bi prijava bila lazna uzbuna.
        if (!mozePogoditi(selektor)) continue;
        for (const prva of new Set(definicije.flatMap((d) => razrijesi(d)))) {
          obitelji.add(prva);
          if (smijeBezFonta(prva)) continue;
          if (!ucitane.has(prva)) {
            nalazi.push({ vrsta: 'obitelj-bez-fonta', selektor, detalj: `${ref[1]} trazi "${prva}", a ulaz za nju ne ucitava @font-face` });
          }
        }
      }
    }
  }
  return { nalazi, obitelji };
}

/** Sadrzaj svakog CSS lista u statickom grafu ulaza. */
function cssGrafa(ulaz: string): string[] {
  return [...collectStaticGraph(resolve(ROOT, ulaz))].filter((p) => p.endsWith('.css')).map((p) => readFileSync(p, 'utf8'));
}

function ulazSaDiska(): Ulaz {
  const cssTekstovi = cssGrafa('src/routes/intake/main.ts');
  return {
    cssTekstovi,
    html: readFileSync(resolve(ROOT, 'index.html'), 'utf8'),
    // Obitelj je "ucitana" kad za nju u grafu postoji @font-face: webfont (`url()`) ili metricki
    // zamjenski glas (`local()`). Oba su deklaracije koje preglednik zna razrijesiti.
    ucitane: deklariraneObitelji(cssTekstovi),
  };
}

const FONTOVI_CSS = resolve(ROOT, 'src/assets/fonts/fonts.css');

/** Svi ulazi proizvoda koji crtaju sucelje: rute, alati, admin i demo. */
const SVI_ULAZI = [
  'src/routes/intake/main.ts', 'src/routes/workspace/main.ts', 'src/routes/my-work/main.ts',
  'src/routes/learn-more/main.ts', 'src/tools/citat-page.ts', 'src/tools/izjava-page.ts',
  'src/tools/kartice-page.ts', 'src/tools/literatura-page.ts', 'src/tools/naslovnica-page.ts',
  'src/shared/page-boot.ts', 'src/admin/admin-dashboard-boot.ts', 'src/demo/main.ts',
];

describe('glasovi ulaza /', () => {
  it('svaki font token dohvatljiv s ulaza je definiran i ima ucitanu obitelj', () => {
    const { nalazi } = provjeriGlasove(ulazSaDiska());
    expect(nalazi, nalazi.map((n) => `${n.vrsta}: ${n.selektor} -- ${n.detalj}`).join('\n')).toEqual([]);
  });

  it('ulaz ucitava TOCNO dva glasa: serif govori, mono oznacava', () => {
    // IMENA SE IZVODE IZ `src/assets/fonts/fonts.css`, NE PREPISUJU: skup webfontova koji ulaz
    // ucitava JEDNAK je skupu koji list fontova deklarira, i ima tocno dva clana (Z7 opcija a).
    const izLista = webfontObitelji([readFileSync(FONTOVI_CSS, 'utf8')]);
    expect(izLista.size, 'citanje fonts.css ne daje nijednu obitelj, dakle mjeri krivo').toBeGreaterThan(0);
    const naUlazu = webfontObitelji(ulazSaDiska().cssTekstovi);
    expect([...naUlazu].sort()).toEqual([...izLista].sort());
    expect([...naUlazu].sort(), 'dva glasa i nijedan vise').toEqual([...GLASOVI]);
  });

  it('nijedna ruta ne ucitava fontove mimo `fonts-core.ts`, i nijedna ne uvozi font kao paket', () => {
    // ZASEBAN MODUL ZA "PODATKOVNE GLASOVE" VISE NE POSTOJI (Z7): dvije obitelji nosi svaka ruta.
    // Ime se i dalje imenuje: ovo je jedini nacin da se ne vrati tiho, s vlastitim uvozima.
    // Uz to fontovi od Z7(a) NISU paketi nego vendorirane datoteke, pa `@fontsource` uvoz u grafu
    // znaci da je netko vratio ovisnost koju dijeljeni node_modules ne smije nositi (F19).
    for (const ulaz of SVI_ULAZI) {
      const graf = [...collectStaticGraph(resolve(ROOT, ulaz))].map((p) => p.split(/[\\/]/).join('/'));
      expect(graf.filter((p) => /\/src\/shared\/fonts-(document|data)\.ts$/.test(p)), ulaz).toEqual([]);
      expect(graf.some((p) => p.endsWith('/src/shared/fonts-core.ts')), ulaz).toBe(true);
      expect(graf.some((p) => p.endsWith('/src/assets/fonts/fonts.css')), ulaz).toBe(true);
      expect(packageImports(resolve(ROOT, ulaz)).filter((s) => s.startsWith('@fontsource')), ulaz).toEqual([]);
    }
  });

  it('SVE rute nose ISTE dvije obitelji', () => {
    const ulazne = [...webfontObitelji(ulazSaDiska().cssTekstovi)].sort();
    expect(ulazne).toEqual([...GLASOVI]);
    for (const ulaz of SVI_ULAZI) {
      expect([...webfontObitelji(cssGrafa(ulaz))].sort(), ulaz).toEqual(ulazne);
    }
  });

  it('nijedan token ni u jednom listu vise ne imenuje Caveat', () => {
    // Provjera je nad SVIM listovima obiju ruta, ne samo nad `design-system.css`. Uza tvrdnja je
    // vec jednom bila zelena dok je `page-chrome.css` isti token vracao na Caveat.
    const listovi = [...collectStaticGraph(ULAZ), ...collectStaticGraph(resolve(ROOT, 'src/routes/workspace/main.ts'))]
      .filter((p) => p.endsWith('.css'));
    const krivi = listovi.filter((p) => /--font-hand\s*:[^;}]*Caveat/.test(readFileSync(p, 'utf8')));
    expect(krivi).toEqual([]);
    const moduli = [...collectStaticGraph(ULAZ), ...collectStaticGraph(resolve(ROOT, 'src/routes/workspace/main.ts'))];
    expect(moduli.filter((p) => p.includes('caveat'))).toEqual([]);
  });

  // --- CIJELI PROIZVOD, NE SAMO ULAZ ---------------------------------------------------------

  const hodajSrc = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = resolve(dir, e.name);
    return e.isDirectory() ? hodajSrc(p) : [p];
  });

  /** Svaka obitelj za koju IJEDAN list u `src/` ima @font-face (webfont ili zamjenski). */
  function sveUcitaneObitelji(): Set<string> {
    return deklariraneObitelji(hodajSrc(resolve(ROOT, 'src')).filter((p) => p.endsWith('.css')).map((p) => readFileSync(p, 'utf8')));
  }

  /**
   * PRVA obitelj u vrijednosti, dakle ona koja se stvarno crta kad je ucitana. Sto dolazi IZA nje
   * su fallbackovi i smiju imenovati bilo sto (`"Inter Tight Variable","Inter Tight",system-ui` je
   * ispravno napisan stack, ne kvar). Provjeravanje svih imena davalo je lazne nalaze upravo na
   * takvim stackovima.
   */
  function prvaObitelj(vrijednost: string): string | null {
    // Funkcijski pozivi ispadaju PRIJE dijeljenja po zarezu, inace `clamp(30px,5vw,60px)` pukne na
    // svom vlastitom zarezu i "clamp(30px" postane ime obitelji. Petlja radi zbog ugnijezdjenih.
    let ocisceno = vrijednost;
    for (let i = 0; i < 5; i += 1) {
      const sljedece = ocisceno.replace(/[\w-]+\([^()]*\)/g, ' ');
      if (sljedece === ocisceno) break;
      ocisceno = sljedece;
    }
    const bezVar = ocisceno.replace(/!\s*important/gi, ' ').trim();
    if (!bezVar) return null;
    const prvi = bezVar.split(',')[0].trim();
    const uNavodnicima = prvi.match(/["']([^"']+)["']\s*$/);
    if (uNavodnicima) return uNavodnicima[1];
    // Kratica `font:` nosi i velicinu i tezinu; obitelj je ono sto ostane na kraju.
    const rijeci = prvi.split(/\s+/).filter(Boolean);
    // Kosa crta hvata ostatak visine retka (`clamp(...)/1.3` ostavi `/1.3` kad funkcija ispadne).
    const odbaci = /^([/\d.]|italic$|oblique$|normal$|bold$|bolder$|lighter$|small-caps$|inherit$|initial$|unset$|revert$)/i;
    const rep: string[] = [];
    for (let i = rijeci.length - 1; i >= 0; i -= 1) {
      if (odbaci.test(rijeci[i])) break;
      rep.unshift(rijeci[i]);
    }
    return rep.length ? rep.join(' ') : null;
  }


  /** Cisti dio globalnog garda, izdvojen da se moze mutirati sintetskim ulazom. */
  function imenaBezFonta(listovi: Array<{ ime: string; css: string }>, ucitane: Set<string>): string[] {
    const nalazi: string[] = [];
    for (const { ime: kratko, css: sirovo } of listovi) {
      const css = bezKomentara(sirovo);
      const provjeri = (vrijednost: string, oznaka: string): void => {
        const ime = prvaObitelj(vrijednost);
        if (!ime || smijeBezFonta(ime) || ucitane.has(ime)) return;
        nalazi.push(`${kratko}: ${oznaka}"${ime}"`);
      };
      for (const { tijelo } of pravila(css)) {
        for (const m of tijelo.matchAll(/(?:^|[;{\s])font(?:-family)?\s*:\s*([^;}]+)/g)) provjeri(m[1], '');
      }
      // Tokeni nose imena obitelji i kad nisu unutar `font:` deklaracije.
      for (const m of css.matchAll(/--[\w-]*(?:serif|sans|mono|font|ui)[\w-]*\s*:\s*([^;}]+)/g)) provjeri(m[1], 'token -> ');
    }
    return [...new Set(nalazi)].sort();
  }

  it('NIJEDAN list u src/ ne imenuje obitelj koju nijedan modul ne ucitava', () => {
    // Ovo je siri gard od gornjih: ne pita "sto ulaz crta" nego "postoji li ime bez fonta IGDJE".
    // Izmjereno 2026-09-05 u pregledniku, po svih 15 ruta, prije popravka:
    //   "Inter Variable"  na 14 ruta  (skip-link, token `--font-sans` ne postoji)
    //   "Inter Tight" i "Newsreader" na demo.html (nevarijabilna imena; paketi registriraju
    //                                              "Inter Tight Variable" i "Newsreader Variable")
    //   "Caveat"          na demo.html (obitelj uklonjena iz proizvoda)
    //   goli `monospace`  na citat.html (`<code>` bez ijednog pravila -> UA Courier New)
    // Nijedan od njih nije bio na ulazu, pa ih guard nad `/` po konstrukciji nije mogao vidjeti.
    const ucitane = sveUcitaneObitelji();
    // SENTINEL, NE OPIS STANJA: nula obitelji znaci da citanje @font-face pravila ne radi, pa bi
    // cijeli gard prosao vakuumski. Uz njega stoji IMENOVANA tvrdnja o tome KOJE su: dva glasa i
    // po jedan metricki zamjenski glas za svaki lokalni font (Z7 opcija a, `fonts.css`).
    expect(ucitane.size, 'nula ucitanih obitelji znaci da citanje @font-face ne radi, ne da ih nema').toBeGreaterThan(0);
    expect([...ucitane].sort()).toEqual([
      'Geist Mono', 'Geist Mono Fallback', 'Geist Mono Fallback Courier',
      'Instrument Serif', 'Instrument Serif Fallback', 'Instrument Serif Fallback Times',
    ]);

    const hodaj = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = resolve(dir, e.name);
      return e.isDirectory() ? hodaj(p) : [p];
    });
    const listovi = hodaj(resolve(ROOT, 'src')).filter((x) => x.endsWith('.css'))
      .map((p) => ({ ime: p.split(/[\\/]/).slice(-2).join('/'), css: readFileSync(p, 'utf8') }));
    expect(listovi.length, 'nula listova znaci da obilazak ne radi, ne da su cisti').toBeGreaterThan(5);

    const nalazi = imenaBezFonta(listovi, ucitane);
    expect(nalazi, 'ime bez ijednog @font-face je uvijek kvar: preglednik tiho uzme sljedecu obitelj').toEqual([]);
  });

  // --- UKLONJENE OBITELJI: ime se ne smije vratiti nijednim putem --------------------------
  //
  // Popis imena i cisti dio garda zive u `tests/helpers/font-voices.ts`, jer istu funkciju
  // mutira i `tests/gate-mutations.test.ts`.

  /** Sve datoteke proizvoda u kojima se ime obitelji uopce moze pojaviti. */
  function datotekeProizvoda(): Array<{ ime: string; tekst: string }> {
    const hodaj = (dir: string): string[] => {
      if (!existsSync(dir)) return [];
      return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const put = resolve(dir, e.name);
        if (e.isDirectory()) return e.name === 'node_modules' ? [] : hodaj(put);
        return [put];
      });
    };
    const korijeni = ['src', 'rad', 'saznaj-vise', 'moji-radovi', 'public', 'scripts', 'prototype'];
    const putevi = korijeni.flatMap((k) => hodaj(resolve(ROOT, k)));
    putevi.push(resolve(ROOT, 'vite.config.ts'));
    // Sve HTML stranice u korijenu (ulaz, alati, SEO stranice), osim interne konzole: `verification.html`
    // ne ide u javni build (DEPLOY=1 je izostavlja), ne ucitava nijedan webfont i njezine tokene seli Z30.
    for (const e of readdirSync(ROOT, { withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.html') && e.name !== 'verification.html') putevi.push(resolve(ROOT, e.name));
    }
    return putevi
      .map((p) => ({ p, ime: p.slice(ROOT.length + 1).split(/[\\/]/).join('/') }))
      // IZUZECA SU IMENOVANA, NE PRESUCENA:
      //   scripts/demo-video/  scena za snimanje promo videa, s vlastitim samostalnim rezovima. Nije
      //                        ruta proizvoda i ne ide u bundle; prelazak scene na nove glasove je
      //                        zaseban posao (vidi izvjestaj Z7(a)).
      //   package.json         stari font paketi OSTAJU kao ovisnosti dok se ne uklone
      //                        koordinirano, jer je node_modules dijeljen (F19). Zato se ni ne cita.
      .filter(({ ime }) => !ime.startsWith('scripts/demo-video/'))
      .filter(({ p }) => /\.(css|ts|tsx|mts|mjs|js|html|json)$/.test(p) && existsSync(p))
      .map(({ p, ime }) => ({ ime, tekst: readFileSync(p, 'utf8') }));
  }

  it('Z7: nijedna uklonjena obitelj se ne imenuje nigdje u proizvodu', () => {
    const datoteke = datotekeProizvoda();
    // SENTINEL: prazan obilazak bi "prosao" bez ijedne procitane datoteke.
    expect(datoteke.length, 'nula datoteka znaci da obilazak ne radi, ne da su ciste')
      .toBeGreaterThan(50);
    for (const nuzna of ['src/shared/design-system.css', 'scripts/generate-legal-pages.mjs', 'public/404.html', 'vite.config.ts', 'index.html', 'kartice.html']) {
      expect(datoteke.some((d) => d.ime === nuzna), `${nuzna} nije procitan`).toBe(true);
    }
    expect(zabranjenaImena(datoteke), 'uklonjena obitelj se vratila u proizvod').toEqual([]);
  });

  it('kontrola i mutacija: gard vidi svaki od pet oblika povratka', () => {
    // BASELINE: tekst bez ijednog zabranjenog imena mora biti cist, inace bi "prolazio" i gard
    // koji vristi na sve.
    expect(zabranjenaImena([{ ime: 'a.css', tekst: ':root{--mono:"Geist Mono",monospace}' }]))
      .toEqual([]);
    // MUTACIJE: po jedna za svaki put kojim se ime vraca.
    expect(zabranjenaImena([{ ime: 'a.css', tekst: '.x{font-family:"Newsreader Variable",serif}' }]))
      .toEqual(['a.css: Newsreader']);
    expect(zabranjenaImena([{ ime: 'b.ts', tekst: "import '@fontsource-variable/inter-tight';" }]))
      .toEqual(['b.ts: inter-tight']);
    expect(zabranjenaImena([{ ime: 'c.json', tekst: '"@fontsource/ibm-plex-mono": "^5.2.7"' }]))
      .toEqual(['c.json: ibm-plex']);
    expect(zabranjenaImena([{ ime: 'd.html', tekst: '<p style="font-family:Source Serif 4">x</p>' }]))
      .toEqual(['d.html: Source Serif']);
    expect(zabranjenaImena([{ ime: 'e.css', tekst: '.hand{font:500 24px Caveat,cursive}' }]))
      .toEqual(['e.css: Caveat']);
    // KONTROLA: gard trazi DOSLOVNO ime, pa ne pada na tudju rijec koja ga sadrzi u drugom smislu
    // (`currency-caveat` je razred autoriteta izvora, ne pismo).
    expect(zabranjenaImena([{ ime: 'f.ts', tekst: "'official-source-with-currency-caveat'" }]))
      .toEqual([]);
  });

  // --- NEGATIVNE KONTROLE: gard bez dokaza da grize ne racuna se -----------------------------

  const OSNOVA: Ulaz = {
    html: '<div class="x"><p id="y">t</p></div>',
    cssTekstovi: [':root{--a:"Inter Tight Variable",sans-serif;--b:var(--a)}.x{font-family:var(--a)}'],
    ucitane: new Set(['Inter Tight Variable']),
  };

  it('kontrola: nemutiran ulaz je cist', () => {
    expect(provjeriGlasove(OSNOVA).nalazi).toEqual([]);
  });

  it('mutacija: obitelj koju nista ne ucitava (kvar tipa Caveat)', () => {
    const nalazi = provjeriGlasove({ ...OSNOVA, cssTekstovi: [':root{--hand:"Caveat",cursive}.x{font-family:var(--hand)}'] }).nalazi;
    expect(nalazi).toHaveLength(1);
    expect(nalazi[0].vrsta).toBe('obitelj-bez-fonta');
    expect(nalazi[0].detalj).toContain('Caveat');
  });

  it('kratica `font:` s tokeniziranom velicinom (Z5): obitelj se bira po OBLIKU vrijednosti', () => {
    // Kontrola: velicina kao token nije obitelj, pa ispravno napisana kratica mora biti cista.
    // Bez ovoga je `var(--fs-kicker)` razrjesavan u "clamp(.84rem" i prijavljivan kao obitelj.
    const listovi = ':root{--fs-kicker:clamp(.84rem,1.7vw,.98rem);--display-serif:"Newsreader Variable",serif}';
    expect(provjeriGlasove({
      html: '<div class="x">t</div>',
      cssTekstovi: [listovi + '.x{font:italic 500 var(--fs-kicker)/1.3 var(--display-serif)}'],
      ucitane: new Set(['Newsreader Variable']),
    }).nalazi).toEqual([]);
    // Mutacija: kvar u obitelji se kroz istu kraticu I DALJE vidi (gard nije samo usutkan).
    const kvar = provjeriGlasove({
      html: '<div class="x">t</div>',
      cssTekstovi: [':root{--fs-kicker:clamp(.84rem,1.7vw,.98rem);--display-serif:"Caveat",cursive}'
        + '.x{font:italic 500 var(--fs-kicker)/1.3 var(--display-serif)}'],
      ucitane: new Set(['Newsreader Variable']),
    }).nalazi;
    expect(kvar.map((n) => n.vrsta)).toEqual(['obitelj-bez-fonta']);
    expect(kvar[0].detalj).toContain('Caveat');
    // Mutacija: nepostojeci token na MJESTU VELICINE se i dalje prijavljuje, iako nije obitelj.
    expect(provjeriGlasove({
      html: '<div class="x">t</div>',
      cssTekstovi: [listovi + '.x{font:italic 500 var(--fs-nema)/1.3 var(--display-serif)}'],
      ucitane: new Set(['Newsreader Variable']),
    }).nalazi.map((n) => n.vrsta)).toEqual(['nepoznat-token']);
  });

  it('Z7: PROZA u komentaru nije definicija tokena, a stvarna definicija i dalje jest', () => {
    // STVARAN NALAZ, ne izmisljen slucaj. `design-system.css` u uvodnoj biljesci pise
    // `(--mono: brojevi, score, rule-kodovi, statusi, eyebrows)`. Dok ulaz nije imao nijednu mono
    // metu, to nitko nije vidio; cim ih je Z7 papir dobio, gard je prijavio pet laznih nalaza s
    // obitelji "brojevi". Provjera ulaza zato skida komentare, kao i globalna polovica lista.
    const proza = '/* --mono: brojevi, score, statusi */';
    const stvarno = ':root{--mono:"IBM Plex Mono",monospace}';
    expect(provjeriGlasove({
      html: '<div class="x">t</div>',
      cssTekstovi: [proza + stvarno + '.x{font-family:var(--mono)}'],
      ucitane: new Set(['IBM Plex Mono']),
    }).nalazi, 'proza u komentaru ne smije proizvesti obitelj').toEqual([]);
    // MUTACIJA: ista recenica napisana kao STVARNA deklaracija mora i dalje pasti, inace bi
    // skidanje komentara oslijepilo gard za pravi kvar.
    const kvar = provjeriGlasove({
      html: '<div class="x">t</div>',
      cssTekstovi: [':root{--mono:brojevi,monospace}.x{font-family:var(--mono)}'],
      ucitane: new Set(['IBM Plex Mono']),
    }).nalazi;
    expect(kvar.map((n) => n.vrsta)).toEqual(['obitelj-bez-fonta']);
    expect(kvar[0].detalj).toContain('brojevi');
  });
  it('Z6: visina retka kao token NIJE obitelj (`font: 700 var(--fs-ui)/var(--lh) Georgia, serif`)', () => {
    // Pozicijska heuristika ("zadnja referenca") je ovdje birala `--lh`, razrjesavala ga u "1.5" i
    // prijavljivala broj kao obitelj bez fonta. Oblik vrijednosti to rjesava bez redoslijeda.
    const tokeni = ':root{--fs-ui:.9rem;--lh:1.5;--display-serif:"Newsreader Variable",serif}';
    expect(provjeriGlasove({
      html: '<div class="x">t</div>',
      cssTekstovi: [tokeni + '.x{font: 700 var(--fs-ui)/var(--lh) Georgia, serif}'],
      ucitane: new Set(['Newsreader Variable']),
    }).nalazi).toEqual([]);
    // MUTACIJA: cim ista kratica dobije referencu koja PO OBLIKU jest obitelj, gard je opet vidi.
    const kvar = provjeriGlasove({
      html: '<div class="x">t</div>',
      cssTekstovi: [':root{--fs-ui:.9rem;--lh:1.5;--hand:"Caveat",cursive}'
        + '.x{font: 700 var(--fs-ui)/var(--lh) var(--hand)}'],
      ucitane: new Set(['Newsreader Variable']),
    }).nalazi;
    expect(kvar.map((n) => n.vrsta)).toEqual(['obitelj-bez-fonta']);
    expect(kvar[0].detalj).toContain('Caveat');
  });

  it('Z6: `font-family: var(--primary), var(--fallback)` mjeri PRVU, jer se ona crta', () => {
    // Zadnja referenca je fallback, dakle ono sto se NE crta dok je prva ucitana. Kvar u prvoj se
    // mora vidjeti i kad je fallback uredan.
    const nalazi = provjeriGlasove({
      html: '<div class="x">t</div>',
      cssTekstovi: [':root{--primary:"Caveat",cursive;--fallback:"Newsreader Variable",serif}'
        + '.x{font-family: var(--primary), var(--fallback)}'],
      ucitane: new Set(['Newsreader Variable']),
    }).nalazi;
    expect(nalazi.map((n) => n.vrsta)).toEqual(['obitelj-bez-fonta']);
    expect(nalazi[0].detalj).toContain('--primary');
    // Kontrola: uredna prva referenca je cista i kad je fallback obitelj bez fonta, jer se ne crta.
    expect(provjeriGlasove({
      html: '<div class="x">t</div>',
      cssTekstovi: [':root{--primary:"Newsreader Variable",serif;--fallback:"Caveat",cursive}'
        + '.x{font-family: var(--primary), var(--fallback)}'],
      ucitane: new Set(['Newsreader Variable']),
    }).nalazi).toEqual([]);
  });

  it('mutacija: token koji ne postoji (kvar tipa --font-mono)', () => {
    const nalazi = provjeriGlasove({ ...OSNOVA, cssTekstovi: ['.x{font:650 11px/1.4 var(--font-mono,ui-monospace,monospace)}'] }).nalazi;
    expect(nalazi).toHaveLength(1);
    expect(nalazi[0].vrsta).toBe('nepoznat-token');
    expect(nalazi[0].detalj).toContain('--font-mono');
  });

  it('mutacija: kvar sakriven u medijskom upitu se i dalje vidi', () => {
    // `@media` blok se rastavlja iznutra; da se gleda samo glava, upit bi bio slijepa tocka.
    const nalazi = provjeriGlasove({ ...OSNOVA, cssTekstovi: [':root{--a:"Inter Tight Variable"}@media (max-width:600px){.x{font-family:var(--nema)}}'] }).nalazi;
    expect(nalazi.map((n) => n.vrsta)).toEqual(['nepoznat-token']);
  });

  it('mutacija: alias koji vodi u neucitanu obitelj (--sans -> --ui -> X)', () => {
    const nalazi = provjeriGlasove({
      ...OSNOVA,
      cssTekstovi: [':root{--ui:"Nepostojeci Sans",sans-serif;--sans:var(--ui)}.x{font-family:var(--sans)}'],
    }).nalazi;
    expect(nalazi).toHaveLength(1);
    expect(nalazi[0].detalj).toContain('Nepostojeci Sans');
  });

  it('mutacija: drugi list VRACA token na neucitanu obitelj (stvarni kvar, propusten jednom)', () => {
    // Tocno oblik koji je gard prvi put propustio: `design-system.css` popravljen, `page-chrome.css`
    // ga vraca. Redoslijed listova NE SMIJE odlucivati o ishodu, pa se provjeravaju obje definicije.
    const listovi = [
      ':root{--hand:var(--display-serif);--display-serif:"Newsreader Variable",serif}',
      ':root{--hand:"Caveat",cursive}',
    ];
    for (const poredak of [listovi, [...listovi].reverse()]) {
      const nalazi = provjeriGlasove({
        html: '<div class="x">t</div>',
        cssTekstovi: [...poredak, '.x{font-family:var(--hand)}'],
        ucitane: new Set(['Newsreader Variable']),
      }).nalazi;
      expect(nalazi.map((n) => n.vrsta)).toEqual(['obitelj-bez-fonta']);
      expect(nalazi[0].detalj).toContain('Caveat');
    }
  });

  // --- MUTACIJE GLOBALNOG GARDA: po jedna za svaki kvar koji je stvarno nasao 2026-09-05 -----

  const UCITANE = new Set(['Inter Tight Variable', 'Newsreader Variable', 'IBM Plex Mono']);
  const globalno = (css: string): string[] => imenaBezFonta([{ ime: 'x.css', css }], UCITANE);

  it('kontrola: ispravno napisan stack je cist, ukljucujuci fallbackove i kraticu `font:`', () => {
    expect(globalno(':root{--ui:"Inter Tight Variable","Inter Tight",system-ui,sans-serif}'
      + '.a{font-family:var(--ui)}'
      + '.b{font:italic 500 clamp(.84rem,1.7vw,.98rem)/1.3 "Newsreader Variable",Georgia,serif}'
      + '.c{font:600 10px/1 var(--ui) !important}'
      + '.d{font-family:inherit}'
      + 'code{font-family:"IBM Plex Mono",ui-monospace,monospace}')).toEqual([]);
  });

  it('Z6: lokalno pismo za disleksiju je DOPUSTENO, bilo koje trece ime i dalje nije', () => {
    // Kontrola: imenovana iznimka prolazi, i u tokenu i u deklaraciji.
    expect(globalno(':root{--display-serif:"OpenDyslexic","Atkinson Hyperlegible",system-ui}')).toEqual([]);
    expect(globalno('.a{font-family:"OpenDyslexic",system-ui}')).toEqual([]);
    // MUTACIJA: iznimka je popis, ne rupa. Cetvrto ime pada kao i prije.
    expect(globalno(':root{--display-serif:"Lexend Deca",system-ui}')).toEqual(['x.css: token -> "Lexend Deca"']);
    expect(globalno('.a{font-family:"OpenDyslexicMono",system-ui}')).toEqual(['x.css: "OpenDyslexicMono"']);
  });

  it('mutacija: nevarijabilno ime uz varijabilni paket (kvar s demo.html)', () => {
    // `@fontsource-variable/newsreader` registrira "Newsreader Variable"; golo "Newsreader" nije
    // ucitano nigdje, pa je cijela demo stranica padala na Georgiju.
    expect(globalno('.a{font:500 25px Newsreader,Georgia,serif}')).toEqual(['x.css: "Newsreader"']);
  });

  it('mutacija: token cije ime nije ucitano (kvar sa skip-linkom)', () => {
    expect(globalno(':root{--font-x:"Inter Variable",system-ui}')).toEqual(['x.css: token -> "Inter Variable"']);
  });

  it('mutacija: uklonjena obitelj se vraca kroz bilo koji list (Caveat)', () => {
    expect(globalno('.hand{font:500 24px Caveat,cursive}')).toEqual(['x.css: "Caveat"']);
  });

  it('kontrola: komentar nije podatak', () => {
    // Prva izvedba je citala i prozu: `--ink-serif:` u komentaru davao je "Word" i "list papira".
    expect(globalno('/* --ink-serif: zrcali Word, a --font-doc glumi "tudeg rada" */'
      + ':root{--ink-serif:"Newsreader Variable",serif}')).toEqual([]);
  });

  it('kontrola: prazan skup listova ne smije proci kao cist nalaz', () => {
    // Sam `imenaBezFonta` nad nicim vraca prazno; zato tvrdnja o broju listova stoji U TESTU, ne
    // ovdje. Ova kontrola cuva da se ta razlika ne izgubi pri refaktoru.
    expect(imenaBezFonta([], UCITANE)).toEqual([]);
    expect(globalno('.a{font-family:Caveat}')).toHaveLength(1);
  });

  it('kontrola: selektor koji NE moze pogoditi ulaz se ne prijavljuje', () => {
    // `--ink-serif` postoji u `tool-page.css`, koji ulaz ucitava, ali njegove mete (listovi
    // dokumenta) na `/` ne postoje. Prijava toga bila bi lazna uzbuna.
    const nalazi = provjeriGlasove({
      ...OSNOVA,
      cssTekstovi: [':root{--ink:"Source Serif 4 Variable",serif}.nema-me-na-ulazu{font-family:var(--ink)}'],
    }).nalazi;
    expect(nalazi).toEqual([]);
  });
});

/**
 * Z7 OPCIJA (a): Instrument Serif i Geist Mono SU glasovi proizvoda.
 *
 * OBRNUT GARD. Pod opcijom (b) (commit 45e88fd1) ovdje je stajala zabrana: nijedna font
 * deklaracija u `src/` CSS-u ne smije imenovati te dvije obitelji. Odluka vlasnika 2026-09-26
 * ("z7:a") tu je odluku ukinula, pa je kvar sada OBRNUT: token koji ih NE imenuje, list fontova
 * koji krsi Z31, ili preload koji nosi vise od dva reza.
 *
 * Paket i dalje NE SMIJE biti ovisnost: fontovi su vendorirani u `src/assets/fonts/`, jer je
 * node_modules dijeljen izmedju sesija i `npm install` bi drugima srusio build (F19).
 *
 * Svaka tvrdnja ovdje ima cist baseline i mutaciju u `tests/gate-mutations.test.ts` (id `z7a/...`).
 */
describe('Z7(a): Instrument Serif i Geist Mono su glasovi proizvoda (obrnut gard opcije b)', () => {
  const MAPA = resolve(ROOT, 'src/assets/fonts');
  const datoteke = (): Map<string, Uint8Array> =>
    new Map(readdirSync(MAPA).map((ime) => [ime, new Uint8Array(readFileSync(resolve(MAPA, ime)))]));

  it('tokeni glasa u izvoru i u svakom svijetu s vlastitim tokenima pocinju s dva glasa', () => {
    // Izvor istine mora definirati sva tri tokena.
    expect(problemiTokena(readFileSync(resolve(ROOT, 'src/shared/design-system.css'), 'utf8'))).toEqual([]);
    // Zrcalo i svjetovi s vlastitim tokenima (admin, demo) definiraju samo dio; provjerava se ono
    // sto definiraju, a nedefiniran token ("null") nije nalaz jer ga ondje nasljedjuje izvor.
    let definiranih = 0;
    for (const list of ['src/shared/page-chrome.css', 'src/admin/admin-dashboard.css', 'src/demo/demo.css']) {
      const problemi = problemiTokena(readFileSync(resolve(ROOT, list), 'utf8'));
      definiranih += 3 - problemi.filter((p) => p.includes('"null"')).length;
      expect(problemi.filter((p) => !p.includes('"null"')), list).toEqual([]);
    }
    expect(definiranih, 'nijedan svijet ne definira token glasa, dakle citanje mjeri krivo').toBeGreaterThan(3);
  });

  it('list fontova postuje Z31: dva glasa, latin + latin-ext, swap, metricki zamjenski glasovi', () => {
    const d = datoteke();
    expect([...d.keys()].filter((k) => k.endsWith('.woff2')), 'mapa bez woff2 znaci da citanje ne radi').toHaveLength(6);
    expect(problemiFontova(readFileSync(FONTOVI_CSS, 'utf8'), d)).toEqual([]);
  });

  it('metrike se citaju iz stvarnog woff2, ne prepisuju', () => {
    // SENTINEL citaca: vrijednosti koje su tablice head i hhea dale pri vendoriranju (isti rez,
    // procitan iz .woff inacice istog paketa). Bez ove tvrdnje bi pokvaren citac mogao vratiti bilo
    // sto, a gard nad override vrijednostima bi mjerio samo sam sebe.
    const d = datoteke();
    expect(woff2Metrike(d.get('instrument-serif-latin-400-normal.woff2')!)).toEqual({ upm: 1000, ascender: 990, descender: -310, lineGap: 0 });
    expect(woff2Metrike(d.get('geist-mono-latin-wght-normal.woff2')!)).toEqual({ upm: 1000, ascender: 1005, descender: -295, lineGap: 0 });
  });

  it('preload nose samo uspravni serif 400 i mono 400, oba latin', () => {
    const obrasci = preloadObrasci(readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf8'));
    expect(obrasci.length, 'WANTED nije procitan').toBeGreaterThan(0);
    expect(problemiPreloada(obrasci, [...datoteke().keys()])).toEqual([]);
  });

  it('nijedan drugi list u src/ ne ucitava webfont', () => {
    const hodaj = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = resolve(dir, e.name);
      return e.isDirectory() ? hodaj(p) : [p];
    });
    const listovi = hodaj(resolve(ROOT, 'src')).filter((p) => p.endsWith('.css'));
    expect(listovi, 'fonts.css nije medju listovima, dakle obilazak mjeri krivo').toContain(FONTOVI_CSS);
    const drugi = listovi.filter((p) => p !== FONTOVI_CSS)
      .filter((p) => webfontObitelji([readFileSync(p, 'utf8')]).size > 0)
      .map((p) => p.slice(ROOT.length + 1));
    expect(drugi).toEqual([]);
  });

  it('OFL licenca putuje uz svaku obitelj', () => {
    for (const ime of ['OFL-instrument-serif.txt', 'OFL-geist-mono.txt']) {
      expect(readFileSync(resolve(MAPA, ime), 'utf8'), ime).toContain('SIL Open Font License, Version 1.1');
    }
  });

  it('package.json nema instrument-serif ni geist-mono kao ovisnost (vendorirano)', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
    const sveOvisnosti = Object.keys({
      ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.optionalDependencies || {}),
    });
    expect(sveOvisnosti.length, 'package.json bez ovisnosti znaci da citanje ne radi').toBeGreaterThan(5);
    expect(sveOvisnosti.filter((k) => /instrument-serif|geist-mono/.test(k))).toEqual([]);
  });
});
