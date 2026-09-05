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

interface Nalaz { vrsta: 'nepoznat-token' | 'obitelj-bez-fonta'; selektor: string; detalj: string }

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

export function provjeriGlasove({ cssTekstovi, html, ucitane }: Ulaz): { nalazi: Nalaz[]; obitelji: Set<string> } {
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
        const ref = vrijednost.match(/var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)/);
        if (!ref) continue;
        const definicije = tokeni.get(ref[1]);
        // NEPOZNAT TOKEN SE PRIJAVLJUJE UVIJEK, i za selektor koji podudaranje ne vidi.
        //
        // Podudaranje selektora zna biti prekratko: `.skip-link` element UBACUJE JavaScript, pa ga
        // u HTML-u nema i provjera ga preskoci. Tocno ondje je do 2026-09-05 zivio `--font-sans`,
        // token koji ne postoji (zove se `--sans`), pa je fallback na SVIH 14 ruta hvatao "Inter
        // Variable", obitelj koju nista ne ucitava. Nepostojeci token je kvar bez obzira na to
        // koga selektor pogadja: vrijednost tada bira fallback, dakle slucaj, a ne autor.
        if (definicije === undefined) {
          nalazi.push({ vrsta: 'nepoznat-token', selektor, detalj: `${ref[1]} nije definiran nigdje u listovima ulaza` });
          continue;
        }
        // Obitelj se provjerava samo ako selektor uopce moze pogoditi stranicu: pravilo koje se
        // nikad ne primijeni ne crta nista, pa bi prijava bila lazna uzbuna.
        if (!mozePogoditi(selektor)) continue;
        for (const prva of new Set(definicije.flatMap((d) => razrijesi(d)))) {
          obitelji.add(prva);
          if (SUSTAVNE.has(prva.toLowerCase())) continue;
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

  it('ulaz ucitava TOCNO dva glasa: Newsreader govori, Inter Tight oznacava', () => {
    const { ucitane } = ulazSaDiska();
    expect([...ucitane].sort()).toEqual(['Inter Tight Variable', 'Newsreader Variable']);
  });

  it('podatkovni glasovi NE ulaze u graf ulaza', () => {
    // Source Serif 4 i IBM Plex Mono imaju posao na `/rad/` i alat-stranicama, ne ovdje. Bez ove
    // tvrdnje bi ih jedan uvoz vratio, i traka s brojkama bi opet dobila treci glas.
    const graf = [...collectStaticGraph(ULAZ)].map((p) => p.split(/[\\/]/).join('/'));
    expect(graf.filter((p) => p.endsWith('/src/shared/fonts-document.ts'))).toEqual([]);
    expect(graf.some((p) => p.endsWith('/src/shared/fonts-core.ts'))).toBe(true);
  });

  it('rute s dokumentima I DALJE nose podatkovne glasove', () => {
    // Suzavanje ulaza ne smije osiromasiti `/rad/`: ondje mono nosi ocjene i sifre pravila, a
    // Source Serif zrcali Wordov izlaz u pregledima.
    for (const ulaz of ['src/routes/workspace/main.ts', 'src/tools/citat-page.ts']) {
      const graf = [...collectStaticGraph(resolve(ROOT, ulaz))].map((p) => p.split(/[\\/]/).join('/'));
      expect(graf.some((p) => p.endsWith('/src/shared/fonts-document.ts')), ulaz).toBe(true);
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

  /** Komentari NISU podaci: `--ink-serif:` u proznom komentaru davao je "Word" i "list papira". */
  const bezKomentara = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

  /** Cisti dio globalnog garda, izdvojen da se moze mutirati sintetskim ulazom. */
  function imenaBezFonta(listovi: Array<{ ime: string; css: string }>, ucitane: Set<string>): string[] {
    const nalazi: string[] = [];
    for (const { ime: kratko, css: sirovo } of listovi) {
      const css = bezKomentara(sirovo);
      const provjeri = (vrijednost: string, oznaka: string): void => {
        const ime = prvaObitelj(vrijednost);
        if (!ime || SUSTAVNE.has(ime.toLowerCase()) || ucitane.has(ime)) return;
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
    expect(ucitane.size, 'nula ucitanih obitelji znaci da citanje paketa ne radi, ne da ih nema').toBeGreaterThan(2);

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
