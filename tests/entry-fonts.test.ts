import { existsSync, readFileSync } from 'node:fs';
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
      if (!mozePogoditi(selektor)) continue;
      for (const m of tijelo.matchAll(/(?:^|[;{\s])font(?:-family)?\s*:\s*([^;}]+)/g)) {
        const vrijednost = m[1];
        // `var(--x)` bez fallbacka i `var(--x, fallback)`: oba nose ime tokena.
        const ref = vrijednost.match(/var\(\s*(--[\w-]+)\s*(?:,([^)]*))?\)/);
        if (!ref) continue;
        const definicije = tokeni.get(ref[1]);
        if (definicije === undefined) {
          nalazi.push({ vrsta: 'nepoznat-token', selektor, detalj: `${ref[1]} nije definiran nigdje u listovima ulaza` });
          continue;
        }
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
