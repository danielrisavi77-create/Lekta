import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectStaticGraph, packageImports } from './helpers/module-graph';

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
 * zavrsava na `var(--ui)`, koji JEST ucitan. Iznimka je zato imenovana i uska, ne prosirenje
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

/** Ime obitelji iz stvarnog `@fontsource` paketa, ne iz pogodjenog imena specifikatora. */
function obiteljIzPaketa(specifier: string): string | null {
  const kandidati = [
    resolve(ROOT, 'node_modules', specifier),
    resolve(ROOT, 'node_modules', specifier, 'index.css'),
  ];
  const put = kandidati.find((p) => existsSync(p) && p.endsWith('.css'));
  if (!put) return null;
  const m = readFileSync(put, 'utf8').match(/font-family:\s*['"]([^'"]+)['"]/);
  return m ? m[1] : null;
}

function ulazSaDiska(): Ulaz {
  const graf = [...collectStaticGraph(ULAZ)];
  const ucitane = new Set<string>();
  for (const specifier of packageImports(ULAZ)) {
    if (!specifier.startsWith('@fontsource')) continue;
    const obitelj = obiteljIzPaketa(specifier);
    if (obitelj) ucitane.add(obitelj);
  }
  return {
    cssTekstovi: graf.filter((p) => p.endsWith('.css')).map((p) => readFileSync(p, 'utf8')),
    html: readFileSync(resolve(ROOT, 'index.html'), 'utf8'),
    ucitane,
  };
}

describe('glasovi ulaza /', () => {
  it('svaki font token dohvatljiv s ulaza je definiran i ima ucitanu obitelj', () => {
    const { nalazi } = provjeriGlasove(ulazSaDiska());
    expect(nalazi, nalazi.map((n) => `${n.vrsta}: ${n.selektor} -- ${n.detalj}`).join('\n')).toEqual([]);
  });

  it('ulaz ucitava TOCNO dva glasa: serif govori, mono oznacava', () => {
    // IMENA SE IZVODE IZ `fonts-core.ts`, NE PREPISUJU. Odluka vlasnika 2026-09-20 (Z7, opcija a)
    // zamijenila je cetiri obitelji s dvije; do tada je ovdje stajao doslovan popis, pa je svaka
    // izmjena modula trazila i izmjenu garda, sto je tocno obrnuto od onoga sto gard treba raditi.
    // Tvrdnja je sada: skup koji ulaz ucitava JEDNAK je skupu koji `fonts-core.ts` uvozi, i ima
    // tocno dva clana. Ako se modulu doda treca obitelj, ovo pada bez prepisivanja imena.
    const { ucitane } = ulazSaDiska();
    const izModula = new Set<string>();
    for (const specifier of packageImports(resolve(ROOT, 'src/shared/fonts-core.ts'))) {
      const obitelj = obiteljIzPaketa(specifier);
      if (obitelj) izModula.add(obitelj);
    }
    expect(izModula.size, 'citanje fonts-core.ts ne daje nijednu obitelj, dakle mjeri krivo')
      .toBeGreaterThan(0);
    expect([...ucitane].sort()).toEqual([...izModula].sort());
    expect([...ucitane].sort(), 'dva glasa i nijedan vise').toHaveLength(2);
  });

  it('nijedna ruta ne ucitava fontove mimo `fonts-core.ts`', () => {
    // ZASEBAN MODUL ZA "PODATKOVNE GLASOVE" VISE NE POSTOJI, i to je posljedica Z7, ne cistka.
    // Dok su obitelji bile cetiri, `fonts-document.ts` je dvije od njih drzao izvan ulaza `/`, da
    // cisti ulaz ne skida mono bez mete. Sada su dvije i nosi ih svaka ruta, pa je modul uklonjen.
    // Ime se i dalje imenuje: ovo je jedini nacin da se ne vrati tiho, s vlastitim uvozima.
    const svi = ['src/routes/intake/main.ts', 'src/routes/workspace/main.ts',
      'src/routes/my-work/main.ts', 'src/routes/learn-more/main.ts', 'src/tools/citat-page.ts'];
    for (const ulaz of svi) {
      const graf = [...collectStaticGraph(resolve(ROOT, ulaz))].map((p) => p.split(/[\\/]/).join('/'));
      expect(graf.filter((p) => /\/src\/shared\/fonts-(document|data)\.ts$/.test(p)), ulaz).toEqual([]);
      expect(graf.some((p) => p.endsWith('/src/shared/fonts-core.ts')), ulaz).toBe(true);
    }
  });

  it('SVE rute nose ISTE dvije obitelji', () => {
    // Do Z7 je ovdje stajalo obrnuto: rute s dokumentom morale su nositi VISE od ulaza. Sada je
    // tvrdnja jednakost, jer glas tudjeg rada nije vise webfont nego sistemska Georgia.
    const ulazne = [...ulazSaDiska().ucitane].sort();
    for (const ulaz of ['src/routes/workspace/main.ts', 'src/tools/citat-page.ts',
      'src/routes/my-work/main.ts']) {
      const ucitane = new Set<string>();
      for (const specifier of packageImports(resolve(ROOT, ulaz))) {
        const obitelj = obiteljIzPaketa(specifier);
        if (obitelj) ucitane.add(obitelj);
      }
      expect([...ucitane].sort(), ulaz).toEqual(ulazne);
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

  /** Svaka obitelj za koju IJEDAN modul u `src/` uvozi `@fontsource` paket. */
  function sveUcitaneObitelji(): Set<string> {
    const ucitane = new Set<string>();
    const hodaj = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = resolve(dir, e.name);
      return e.isDirectory() ? hodaj(p) : [p];
    });
    for (const p of hodaj(resolve(ROOT, 'src'))) {
      if (!/\.(ts|tsx|mts)$/.test(p)) continue;
      for (const m of readFileSync(p, 'utf8').matchAll(/from\s+['"](@fontsource[^'"]+)['"]|import\s+['"](@fontsource[^'"]+)['"]/g)) {
        const obitelj = obiteljIzPaketa(m[1] || m[2]);
        if (obitelj) ucitane.add(obitelj);
      }
    }
    return ucitane;
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
    // SENTINEL, NE OPIS STANJA: nula obitelji znaci da citanje `@fontsource` paketa ne radi, pa bi
    // cijeli gard prosao vakuumski. Prag je bio `> 2` dok ih je bilo pet; Z7 ih je sveo na dvije,
    // pa se prag spusta na `> 0` i uz njega stoji IMENOVANA tvrdnja o tome KOJE su to dvije.
    expect(ucitane.size, 'nula ucitanih obitelji znaci da citanje paketa ne radi, ne da ih nema').toBeGreaterThan(0);
    expect([...ucitane].sort()).toEqual(['Geist Mono Variable', 'Instrument Serif']);

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

  /**
   * Cetiri obitelji koje je Z7 (2026-09-20) uklonio, plus Caveat, koji je otisao ranije.
   *
   * Trazi se i IME OBITELJI i IME PAKETA, jer se vracaju razlicitim putevima: obitelj kroz CSS
   * ili inline stil, paket kroz `import` ili `package.json`. Zabrana samo jednog oblika ostavlja
   * drugi otvorenim, a oba daju isti ishod: stranica koja crta pismo koje nitko nije izabrao.
   */
  const UKLONJENE = [
    'Newsreader', 'Inter Tight', 'IBM Plex', 'Source Serif', 'Caveat',
    'inter-tight', 'newsreader', 'source-serif', 'ibm-plex', 'fontsource/caveat',
  ];

  /** Cist dio garda, izdvojen da se moze mutirati sintetskim ulazom. */
  function zabranjenaImena(datoteke: Array<{ ime: string; tekst: string }>): string[] {
    const nalazi: string[] = [];
    for (const { ime, tekst } of datoteke) {
      for (const zabranjeno of UKLONJENE) {
        if (tekst.includes(zabranjeno)) nalazi.push(`${ime}: ${zabranjeno}`);
      }
    }
    return nalazi.sort();
  }

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
    const korijeni = ['src', 'rad', 'saznaj-vise', 'moji-radovi', 'public', 'scripts'];
    const putevi = korijeni.flatMap((k) => hodaj(resolve(ROOT, k)));
    putevi.push(resolve(ROOT, 'index.html'), resolve(ROOT, 'package.json'));
    return putevi
      .filter((p) => /\.(css|ts|tsx|mts|mjs|js|html|json)$/.test(p) && existsSync(p))
      .map((p) => ({ ime: p.slice(ROOT.length + 1).split(/[\\/]/).join('/'), tekst: readFileSync(p, 'utf8') }));
  }

  it('Z7: nijedna uklonjena obitelj se ne imenuje nigdje u proizvodu', () => {
    const datoteke = datotekeProizvoda();
    // SENTINEL: prazan obilazak bi "prosao" bez ijedne procitane datoteke.
    expect(datoteke.length, 'nula datoteka znaci da obilazak ne radi, ne da su ciste')
      .toBeGreaterThan(50);
    expect(datoteke.some((d) => d.ime === 'package.json'), 'package.json nije procitan').toBe(true);
    expect(zabranjenaImena(datoteke), 'uklonjena obitelj se vratila u proizvod').toEqual([]);
  });

  it('kontrola i mutacija: gard vidi svaki od pet oblika povratka', () => {
    // BASELINE: tekst bez ijednog zabranjenog imena mora biti cist, inace bi "prolazio" i gard
    // koji vristi na sve.
    expect(zabranjenaImena([{ ime: 'a.css', tekst: ':root{--mono:"Geist Mono Variable",monospace}' }]))
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
