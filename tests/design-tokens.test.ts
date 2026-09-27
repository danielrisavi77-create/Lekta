/**
 * Z5: tipografska ljestvica kao tokeni (design/handoff/ALIGNMENT.md).
 *
 * Dvije tvrdnje, i obje imaju mutaciju, jer gard bez dokaza da grize se ne racuna (CLAUDE.md):
 *   1. `design-system.css` definira svih 8 `--fs-*` koraka s TOCNO onim vrijednostima koje je
 *      ALIGNMENT propisao (token koji se tiho pomakne mijenja izgled svake migrirane deklaracije).
 *   2. NIJEDAN list u `src/` ne REDEFINIRA korak koji je `design-system.css` vec definirao.
 *      Definicija koja postoji nije ista tvrdnja kao definicija koja VRIJEDI: isti razred kvara vec
 *      je izmjeren na `--font-hand` (`page-chrome.css` je vracao Caveat preko ispravljenog
 *      `design-system.css`, gard je bio zelen a preglednik je crtao Comic Sans; vidi
 *      `tests/entry-fonts.test.ts`). Tokenizirana ljestvica ima tocno istu povrsinu napada.
 *   3. Pilot datoteke (`intake.css`, `route-shell.css`) vise ne nose nijedan literal koji je jednak
 *      nekom koraku. Literali koji NE odgovaraju nijednom koraku (.88rem, .92rem, .85rem, .84rem,
 *      .98rem, 19px, 10px, clamp(1.05rem,2.4vw,1.35rem), te 1.8rem i 1rem u media queryju) smiju
 *      ostati i namjerno ih se ne izmislja u nove tokene.
 *
 * Citanje s diska normalizira CR: repo ima `core.autocrlf`, pa ista datoteka iz istog commita ima
 * dvije velicine ovisno o tome kako je stablo materijalizirano (CLAUDE.md).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  DOPUSTENA_GEORGIA, KORIJENSKI, STRANICE_PROZE, UI_SELEKTORI, dokumentStranice, georgiaUSucelju, glasZa,
  jeDokument, jeSerif, listoviStranice, monoUSerifnomNaglasku, naglasakUSerifu, obiteljElementa, podijeliNaVrhu,
  pravilaIz, problemiProzeStranice, specificnost, subjekt, svijet, svjetoviBezSinteze, tezinaBroj, tezineIznad400,
  uiNaSerifu, visereceniOdlomci, type DopustenaGeorgia,
} from './helpers/font-voices';
import { DISK } from './helpers/module-graph';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string): string => readFileSync(join(root, f), 'utf8').replace(/\r/g, '');

/** Ljestvica doslovno iz ALIGNMENT-a Z5. Ime -> vrijednost. */
const LJESTVICA: ReadonlyArray<readonly [string, string]> = [
  ['--fs-display', 'clamp(1.95rem,5.6vw,3.25rem)'],
  ['--fs-h2', 'clamp(1.8rem,4vw,2.7rem)'],
  ['--fs-lead', 'clamp(1rem,1.75vw,1.16rem)'],
  ['--fs-kicker', 'clamp(.84rem,1.7vw,.98rem)'],
  ['--fs-ui', '.9rem'],
  ['--fs-ui-sm', '.82rem'],
  ['--fs-ui-xs', '.76rem'],
  ['--fs-mono-label', '11px'],
];

const bezKomentara = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, ' ');
const bezRazmaka = (s: string): string => s.replace(/\s+/g, '');

/**
 * Doslovna usporedba umjesto regexa gradenog iz niza: escape se kroz alat zna izgubiti, a to je
 * poznat razred kvara u ovom repozitoriju (gard nad `git commit`, kontrolni bajt u regexu).
 * Granica se zato gleda rucno, po susjednom znaku.
 */
function nosiGoluVelicinu(vrijednost: string, korak: string): boolean {
  const rijecniZnak = (z: string): boolean => /[A-Za-z0-9.%-]/.test(z);
  let od = vrijednost.indexOf(korak);
  while (od !== -1) {
    const prije = od === 0 ? '' : vrijednost[od - 1];
    const poslije = vrijednost[od + korak.length] ?? '';
    if (!rijecniZnak(prije) && !rijecniZnak(poslije)) return true;
    od = vrijednost.indexOf(korak, od + 1);
  }
  return false;
}

/** Koraci koje `css` NE definira s propisanom vrijednoscu. Razmaci nisu ugovor, vrijednost jest. */
function nedostajuciKoraci(css: string): string[] {
  const tijelo = bezRazmaka(bezKomentara(css));
  return LJESTVICA
    .filter(([ime, vrijednost]) => !tijelo.includes(ime + ':' + bezRazmaka(vrijednost) + ';'))
    .map(([ime]) => ime);
}

/**
 * Literali u `font-size:` / `font:` deklaracijama koji su jednaki nekom koraku ljestvice.
 * Cista funkcija nad stringom, pa se mutacija podmece bez pisanja po disku.
 */
function zaostaliLiterali(css: string): string[] {
  const nalazi: string[] = [];
  for (const m of bezKomentara(css).matchAll(/(?:^|[;{\s])(font-size|font)\s*:\s*([^;}]+)/g)) {
    const vrijednost = m[2];
    const zbijeno = bezRazmaka(vrijednost);
    for (const [ime, korak] of LJESTVICA) {
      const pogodak = korak.startsWith('clamp(')
        // Clamp se usporeduje bez razmaka: `clamp(1.8rem, 4vw, 2.7rem)` je isti literal.
        ? zbijeno.includes(bezRazmaka(korak))
        // Gola velicina trazi granicu, inace `1.9rem` lazno pali na `.9rem`.
        : nosiGoluVelicinu(vrijednost, korak);
      if (pogodak) nalazi.push(m[1] + ': ' + vrijednost.trim() + ' -> var(' + ime + ')');
    }
  }
  return [...new Set(nalazi)].sort();
}

/**
 * Svaka DEFINICIJA koraka ljestvice u zadanim listovima, redom kojim su listovi predani.
 * `var(--fs-ui)` nije definicija (iza imena stoji `)`, ne `:`), pa upotreba ne pali gard.
 */
function definicijeKoraka(listovi: ReadonlyArray<{ ime: string; css: string }>): string[] {
  const imena = new Set(LJESTVICA.map(([ime]) => ime));
  const nalazi: string[] = [];
  for (const { ime, css } of listovi) {
    for (const m of bezKomentara(css).matchAll(/(--fs-[\w-]+)\s*:/g)) {
      if (imena.has(m[1])) nalazi.push(ime + ': ' + m[1]);
    }
  }
  return nalazi;
}

/** Definicije koje dolaze POSLIJE prve za isti korak, dakle redefinicije. */
function redefinicijeKoraka(listovi: ReadonlyArray<{ ime: string; css: string }>): string[] {
  const vidjeno = new Set<string>();
  const nalazi: string[] = [];
  for (const nalaz of definicijeKoraka(listovi)) {
    const korak = nalaz.slice(nalaz.indexOf(': ') + 2);
    if (vidjeno.has(korak)) nalazi.push(nalaz);
    else vidjeno.add(korak);
  }
  return nalazi;
}

/**
 * Svi CSS listovi u `src/`, s `design-system.css` PRVIM. Redoslijed je dio tvrdnje: prva definicija
 * je ona iz izvora istine, pa je svaka sljedeca redefinicija bez obzira na to gdje lezi.
 */
const IZVOR_ISTINE = 'src/shared/design-system.css';

function listoviSrc(): Array<{ ime: string; css: string }> {
  // Relativna staza se GRADI pri obilasku (uvijek '/'), umjesto da se izvodi iz apsolutne:
  // `join` na Windowsu vraca obrnutu kosu crtu, a `read()` i `IZVOR_ISTINE` govore '/'.
  const hodaj = (rel: string): string[] => readdirSync(join(root, rel), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? hodaj(rel + '/' + e.name) : [rel + '/' + e.name]));
  const staze = hodaj('src').filter((x) => x.endsWith('.css')).sort();
  const poredak = [IZVOR_ISTINE, ...staze.filter((x) => x !== IZVOR_ISTINE)];
  return poredak.map((staza) => ({ ime: staza, css: read(staza) }));
}
/**
 * PILOT DATOTEKE. `route-shell.css` je uklonjen zajedno sa svojim modulom (Z15: mrtva ljuska ruta
 * koju nijedan ulaz nije montirao, zamijenjena `src/shared/site-chrome.css`), pa tvrdnja o njemu
 * nema predmet. Novi list trake je UKLJUCEN u popis, jer je pilot tokenizirane tipografije upravo
 * ono sto on jest: chrome koji vrijedi na svakoj ruti.
 */
const PILOT = ['src/routes/intake/intake.css', 'src/shared/site-chrome.css'];

describe('Z5 tipografska ljestvica', () => {
  it('design-system.css definira svih 8 --fs-* koraka s propisanim vrijednostima', () => {
    expect(nedostajuciKoraci(read('src/shared/design-system.css'))).toEqual([]);
  });

  it('MUTACIJA: pomaknut ili izostavljen korak pada', () => {
    const osnovica = LJESTVICA.map(([i, v]) => '  ' + i + ': ' + v + ';').join('\n');
    expect(nedostajuciKoraci(':root{\n' + osnovica + '\n}'), 'baseline mora biti cist').toEqual([]);
    expect(nedostajuciKoraci(':root{\n' + osnovica.replace(': .9rem', ': .95rem') + '\n}')).toEqual(['--fs-ui']);
    expect(nedostajuciKoraci(':root{\n' + osnovica.replace(/\s*--fs-h2:[^;]+;/, '') + '\n}')).toEqual(['--fs-h2']);
  });

  it('NIJEDAN list u src/ ne redefinira korak koji design-system.css vec definira', () => {
    const listovi = listoviSrc();
    // Prazan obilazak nije cist nalaz: nula listova znaci da citanje ne radi.
    expect(listovi.length, 'nula CSS listova u src/ znaci da obilazak ne radi').toBeGreaterThan(5);
    expect(listovi[0].ime).toBe(IZVOR_ISTINE);
    // Sentinel: izvor istine mora nositi SVIH 8 definicija, inace bi "nula redefinicija" bilo
    // zeleno i nad stablom u kojem ljestvice uopce nema.
    expect(definicijeKoraka([listovi[0]])).toHaveLength(LJESTVICA.length);
    const nalazi = redefinicijeKoraka(listovi);
    expect(nalazi, 'korak koji se redefinira drugdje mijenja izgled bez traga u izvoru istine').toEqual([]);
  });

  it('MUTACIJA: podmetnuta redefinicija koraka pada, a sama upotreba ne', () => {
    const izvor = { ime: IZVOR_ISTINE, css: read(IZVOR_ISTINE) };
    // Baseline: izvor istine sam sa sobom nema nijednu redefiniciju.
    expect(redefinicijeKoraka([izvor]), 'baseline mora biti cist').toEqual([]);
    // Mutacija iz naloga Z6: drugi list vraca `--fs-ui` na svoju vrijednost.
    expect(redefinicijeKoraka([izvor, { ime: 'x.css', css: ':root{--fs-ui:.95rem}' }]))
      .toEqual(['x.css: --fs-ui']);
    // Mutacija: redefinicija unutar SAMOG izvora istine, poslije prve definicije.
    expect(redefinicijeKoraka([{ ime: 'x.css', css: ':root{--fs-ui:.9rem}[data-x]{--fs-ui:.95rem}' }]))
      .toEqual(['x.css: --fs-ui']);
    // Negativne kontrole: upotreba nije definicija, komentar nije kod, a ime koje samo POCINJE
    // kao korak (`--fs-ui-sm` naspram `--fs-ui`) broji se pod svoje ime.
    expect(redefinicijeKoraka([izvor, { ime: 'x.css', css: '.a{font-size:var(--fs-ui)}' }])).toEqual([]);
    expect(redefinicijeKoraka([izvor, { ime: 'x.css', css: '/* --fs-ui: .95rem */' }])).toEqual([]);
    expect(redefinicijeKoraka([{ ime: 'x.css', css: ':root{--fs-ui:.9rem;--fs-ui-sm:.82rem}' }])).toEqual([]);
    // Negativna kontrola: token koji NIJE korak ljestvice nije predmet ovog garda.
    expect(redefinicijeKoraka([{ ime: 'x.css', css: ':root{--fs-neki:1rem}[data-x]{--fs-neki:2rem}' }])).toEqual([]);
  });

  it.each(PILOT)('%s ne nosi nijedan literal koji je jednak koraku', (staza) => {
    expect(zaostaliLiterali(read(staza))).toEqual([]);
  });

  it('MUTACIJA: podmetnut literal u pilot datoteci pada', () => {
    // Baseline: migrirani oblik je cist, i to u oba zapisa (`font-size:` i `font:` kratica).
    expect(
      zaostaliLiterali('.a{font-size:var(--fs-ui)}.b{font: 650 var(--fs-h2)/1 var(--display-serif)}'),
      'baseline mora biti cist',
    ).toEqual([]);
    // Gola velicina, sa i bez razmaka iza dvotocke.
    expect(zaostaliLiterali('.a{font-size:.9rem}')).toEqual(['font-size: .9rem -> var(--fs-ui)']);
    expect(zaostaliLiterali('.a{font-size: .82rem}')).toEqual(['font-size: .82rem -> var(--fs-ui-sm)']);
    expect(zaostaliLiterali('.a{font-size: .76rem}')).toEqual(['font-size: .76rem -> var(--fs-ui-xs)']);
    expect(zaostaliLiterali('.a{font:700 11px/1 var(--mono)}')).toHaveLength(1);
    // Clamp, i kad je napisan s razmacima iza zareza (route-shell ga je tako imao).
    expect(zaostaliLiterali('.a{font-size:clamp(1.95rem,5.6vw,3.25rem)}')).toHaveLength(1);
    expect(zaostaliLiterali('.a{font: 650 clamp(1.8rem, 4vw, 2.7rem)/1 var(--display-serif)}')).toHaveLength(1);
    expect(zaostaliLiterali('.a{font-size:clamp(1rem,1.75vw,1.16rem)}')).toHaveLength(1);
    expect(zaostaliLiterali('.a{font:italic 500 clamp(.84rem,1.7vw,.98rem)/1.3 var(--display-serif)}')).toHaveLength(1);
    // Negativna kontrola: literali koji NISU korak ostaju dopusteni, ukljucujuci one koji korak
    // sadrze kao podniz (`1.9rem` nije `.9rem`, goli `1.8rem` nije `clamp(1.8rem,...)`).
    expect(zaostaliLiterali('.a{font-size:.88rem}.b{font-size:1.9rem}.c{font-size:1.8rem}'
      + '.d{font-size:.85rem}.e{font-size:clamp(1.05rem,2.4vw,1.35rem)}.f{font:700 19px/1 var(--ui)}'
      + '.g{font:700 111px/1 var(--ui)}')).toEqual([]);
  });
});

/**
 * Z2: radiusi gumba (design/handoff/ALIGNMENT.md). Gumb je pecat, dijeli rub s papirom, pa
 * `--radius-btn` i `--radius-btn-lg` postaju 2px, isto kao `--radius`. Provjera ima dvije tvrdnje:
 *   1. Oba tokena u `design-system.css` doslovno iznose 2px.
 *   2. Nijedan CSS u `src/` (osim `admin/**` i `demo/**`, koji imaju vlastiti sustav tokena) nema
 *      LITERAL `border-radius` veci od 2px na selektoru koji sadrzi btn/button/cta, osim pilule
 *      (999px) i kruga (50%) te imenovanih iznimki koje README izricito ne racuna kao gumb
 *      (`.cta`, `.ks-cta`, `.success-cta` je zabiljezena napomena, ne prijava).
 * Selektorski uzorak je isti onaj kojim je paket trazen (`grep -rn "border-radius" src --include=*.css
 * | grep -iE "..."`), pa test i zahtjev gadaju istu populaciju.
 */
const GUMB_SELEKTOR = /\.(?:btn|[a-z-]*button|[a-z-]*cta|lampa-btn|intake-memory-action|intake-error|ps-[a-z-]*btn|display-[a-z-]*btn)\b/i;
const GUMB_IZUZETE_DATOTEKE = ['src/admin/', 'src/demo/'];
const GUMB_IZUZETI_SELEKTORI = ['.cta', '.ks-cta', '.success-cta'];

/**
 * Nalazi u JEDNOM listu: `selektor -> vrijednost` za svaki literal `border-radius` > 2px na
 * selektoru koji izgleda kao gumb, bez pilule/kruga/tokena/imenovane iznimke. Cista funkcija nad
 * stringom (kao `zaostaliLiterali` iznad), pa se mutacija podmece bez pisanja po disku.
 */
function gumbRadiusNalazi(css: string): string[] {
  const nalazi: string[] = [];
  const tijelo = bezKomentara(css);
  const blokRegex = /([^{}]+)\{([^{}]*)\}/g;
  let blok: RegExpExecArray | null;
  while ((blok = blokRegex.exec(tijelo))) {
    const selektor = blok[1].trim();
    if (!GUMB_SELEKTOR.test(selektor)) continue;
    const izuzet = selektor.split(',')
      .some((dio) => GUMB_IZUZETI_SELEKTORI.includes(dio.trim().split(/[\s:]/)[0]));
    if (izuzet) continue;
    const radiusRegex = /border-radius\s*:\s*([^;]+);?/g;
    let r: RegExpExecArray | null;
    while ((r = radiusRegex.exec(blok[2]))) {
      const vrijednost = r[1].trim();
      if (/var\(/.test(vrijednost)) continue; // token, provjeren drugom tvrdnjom
      if (/50%/.test(vrijednost)) continue; // krug (prsten, tocke, gumbi strelice)
      const brojevi = [...vrijednost.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((x) => parseFloat(x[1]));
      if (brojevi.length === 0) continue;
      if (brojevi.length === 1 && brojevi[0] === 999) continue; // pilula (znacke, koraci, cipovi)
      if (Math.max(...brojevi) > 2) nalazi.push(selektor + ' -> ' + vrijednost);
    }
  }
  return nalazi;
}

describe('Z2 radiusi gumba', () => {
  it('--radius-btn i --radius-btn-lg su 2px, isto kao --radius', () => {
    const zbijeno = bezRazmaka(bezKomentara(read('src/shared/design-system.css')));
    expect(zbijeno.includes('--radius:2px;')).toBe(true);
    expect(zbijeno.includes('--radius-btn:2px;')).toBe(true);
    expect(zbijeno.includes('--radius-btn-lg:2px;')).toBe(true);
  });

  it('MUTACIJA: token pomaknut s 2px pada', () => {
    const zbijeno = (css: string): boolean => bezRazmaka(css).includes('--radius-btn:2px;');
    expect(zbijeno(':root{--radius-btn:2px;}'), 'baseline mora biti cist').toBe(true);
    expect(zbijeno(':root{--radius-btn:8px;}')).toBe(false);
  });

  it('nijedan gumb u src/ (osim admin/demo) nema literal border-radius > 2px', () => {
    const staze = listoviSrc().map((l) => l.ime)
      .filter((s) => !GUMB_IZUZETE_DATOTEKE.some((p) => s.startsWith(p)));
    expect(staze.length, 'nula CSS listova znaci da obilazak ne radi').toBeGreaterThan(5);
    const nalazi = staze.flatMap((staza) => gumbRadiusNalazi(read(staza)).map((n) => staza + ' :: ' + n));
    expect(nalazi, 'gumb mora ici kroz --radius-btn/--radius-btn-lg ili ostati pilula/krug').toEqual([]);
  });

  it('MUTACIJA: podmetnut .btn{border-radius:8px} pada, a token ne', () => {
    expect(gumbRadiusNalazi('.btn{border-radius:var(--radius-btn)}'), 'baseline mora biti cist').toEqual([]);
    expect(gumbRadiusNalazi('.btn{border-radius:8px}')).toEqual(['.btn -> 8px']);
    // Pilula i krug ostaju dopusteni na gumbu koji ih izricito trazi (znacka/cip, prsten/strelica).
    expect(gumbRadiusNalazi('.route-cta{border-radius:999px}')).toEqual([]);
    expect(gumbRadiusNalazi('.icon-button{border-radius:50%}')).toEqual([]);
    // Imenovana iznimka (napomena, ne prijava) i datoteka izvan populacije (provjerava se na
    // razini staze, ne ovdje) ne pale gard kad je selektor tocno taj.
    expect(gumbRadiusNalazi('.success-cta{border-radius:10px}')).toEqual([]);
    expect(gumbRadiusNalazi('.cta{border-radius:30px}')).toEqual([]);
    // Negativna kontrola: selektor koji NIJE gumb (nema btn/button/cta) ne pale gard.
    expect(gumbRadiusNalazi('.paper{border-radius:8px}')).toEqual([]);
  });
});

describe('Z3 border-left akcent', () => {
  it('.pv-prijelaz nema lijevi rub kao presudu (design/README.md pravilo 3)', () => {
    const css = bezKomentara(read('src/ui/repair-panel.css'));
    const blok = /\.pv-prijelaz\s*\{([^}]*)\}/.exec(css);
    expect(blok, '.pv-prijelaz mora postojati').not.toBeNull();
    expect(blok?.[1] ?? '').not.toMatch(/border-left/);
    // Ton se nije izgubio nego preselio u tocku uz natpis.
    expect(css).toMatch(/\.pv-prijelaz__naslov::before\s*\{[^}]*border-radius:\s*999px/);
  });
});

/**
 * Z7 (opcija a, odluka vlasnika 2026-09-26): DVA GLASA I JEDAN GOST.
 *
 * Cetiri tvrdnje, svaka s mutacijom, jer gard bez dokaza da grize se ne racuna (CLAUDE.md):
 *   1. Tokeni glasa imaju TOCNO propisanu vrijednost. Token koji se tiho pomakne mijenja pismo
 *      na svakoj ruti, a nijedan postojeci test to ne bi vidio: lanac u `entry-fonts.test.ts`
 *      pita samo je li obitelj UCITANA, ne je li ona koja je odlucena.
 *   2. Nijedan ELEMENT ne dobiva tezinu iznad 400 na display serifu. Instrument Serif taj rez
 *      nema; bez `font-synthesis: none` preglednik ga razvuce, a s njim se zahtjev tiho ignorira.
 *      Oba ishoda su kvar, i nijedan ne pada sam od sebe. Mjeri se POBJEDNIK kaskade, jer je
 *      prva izvedba gledala samo pojedinacno pravilo i bila slijepa na doslovno ime obitelji,
 *      na obitelj u drugom pravilu i na naslijedjen glas (vidi komentar uz `tezineIznad400`).
 *   3. `font-synthesis: none` stoji na korijenu SVAKOG svijeta koji korijenu daje obitelj, ne
 *      samo u `design-system.css`: `admin/` i `demo/` ga ne uvoze, pa su bas one dobile lazni
 *      bold koji tvrdnja 2 sprecava drugdje.
 */
describe('Z7: tokeni glasa i tezina na serifu', () => {
  const DIZAJN = read('src/shared/design-system.css');
  const ZRCALO = read('src/shared/page-chrome.css');

  /** Vrijednost tokena iz lista, bez komentara i bez razmaka (razmaci nisu ugovor). */
  function token(css: string, ime: string): string | null {
    const m = bezKomentara(css).match(new RegExp(ime.replace('--', '--') + '\\s*:\\s*([^;}]+)'));
    return m ? bezRazmaka(m[1]) : null;
  }

  const OCEKIVANO: ReadonlyArray<readonly [string, string]> = [
    ['--display-serif', '"Instrument Serif","Instrument Serif Fallback","Instrument Serif Fallback Times",Georgia,"Times New Roman",serif'],
    ['--mono', '"Geist Mono","Geist Mono Fallback","Geist Mono Fallback Courier",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'],
    ['--ui', 'var(--mono)'],
    ['--sans', 'var(--ui)'],
    ['--ink-serif', 'var(--font-doc)'],
    ['--font-hand', 'var(--display-serif)'],
    ['--font-doc', 'Georgia,"Times New Roman",serif'],
  ];

  it('svaki token glasa nosi tocno odlucenu vrijednost', () => {
    for (const [ime, vrijednost] of OCEKIVANO) {
      expect(token(DIZAJN, ime), ime).toBe(bezRazmaka(vrijednost));
    }
  });

  it('zrcalo u page-chrome.css se ne razilazi s izvorom', () => {
    // STVARAN RAZRED KVARA, ne teorija: `page-chrome.css` redefinira vecinu tokena i vec je jednom
    // vracao `--font-hand` na obitelj koju nista ne ucitava dok je gard bio zelen. Provjeravaju se
    // samo tokeni koje zrcalo UOPCE definira; sto ne definira, nasljedjuje iz izvora.
    let zrcaljenih = 0;
    for (const [ime] of OCEKIVANO) {
      const uZrcalu = token(ZRCALO, ime);
      if (uZrcalu === null) continue;
      zrcaljenih += 1;
      expect(uZrcalu, `${ime} se u zrcalu razilazi od izvora`).toBe(token(DIZAJN, ime));
    }
    expect(zrcaljenih, 'zrcalo ne definira nijedan token glasa, dakle citanje mjeri krivo')
      .toBeGreaterThan(0);
  });

  it('MUTACIJA: pomaknut token se vidi, a razmaci i dalje nisu ugovor', () => {
    // BASELINE: nemutiran list je cist.
    expect(token(':root{--mono:"Geist Mono",monospace}', '--mono'))
      .toBe('"GeistMono",monospace');
    // MUTACIJA: druga obitelj na istom tokenu daje drugu vrijednost, dakle tvrdnja pada.
    expect(token(':root{--mono:"IBM Plex Mono",monospace}', '--mono'))
      .not.toBe('"GeistMono",monospace');
    // KONTROLA SMJERA: isti popis s drugim razmacima i dalje prolazi.
    expect(token(':root{--mono: "Geist Mono" , monospace}', '--mono'))
      .toBe('"GeistMono",monospace');
  });

  /**
   * RAZLAGANJE KASKADE, NE PRETRAGA BLOKA. Prva izvedba ovog garda gledala je SAMO pravilo u
   * kojem obitelj i tezina stoje zajedno, pa je bila slijepa na tri prolaza kojima serif stvarno
   * stize do elementa, i sva tri su izmjerena na stablu nad kojim je bila zelena:
   *   1. doslovno ime obitelji umjesto tokena (`font:600 20px 'Instrument Serif'`, 14 mjesta u
   *      `demo.css`, u commitu koji je tu datoteku i mijenjao),
   *   2. obitelj i tezina u DVA pravila nad istim elementom (`.faq summary{font-weight:850}` uz
   *      `#faq .faq summary{font-family:var(--display-serif)}`),
   *   3. NASLIJEDJEN glas, od pretka ili od korijena svijeta (`body{font:16px/1.6
   *      var(--display-serif)}`), gdje element vlastitu obitelj uopce nema.
   * Zato se racuna POBJEDNIK kaskade (specificnost, pa redoslijed), a ne prva deklaracija koja se
   * nade. Kasnije pravilo koje tezinu vrati na 400 ili obitelj prebaci na mono gasi nalaz.
   *
   * GRANICE SU IMENOVANE, ne presucene: uvjeti `@media` se ne vrednuju (pravilo unutar upita
   * broji se kao da uvijek vrijedi), `!important` se ne cita, a tvornicki rezovi preglednika
   * (`h1`, `strong`, `b`, `summary` su podebljani bez ijedne nase deklaracije) nisu modelirani.
   * Sve tri granice cine gard STROZIM ili jednako strogim, nikad blazim.
   */
  /*
   * MODEL KASKADE ZIVI U `tests/helpers/font-voices.ts` (od popravka Z7(a), da mutacije u
   * `tests/gate-mutations.test.ts` zovu istu funkciju). Povijest odluka ostaje ovdje, uz tvrdnje:
   *
   * KORIJEN SE BIRA PO BLIZINI, NE PO SPECIFICNOSTI. Naslijedjena vrijednost dolazi od NAJBLIZEG
   * pretka koji ju ima, a specificnost usporedjuje samo pravila koja pogadjaju ISTI element.
   * `:root` i `body` su razliciti elementi, pa medju njima odlucuje blizina. Dok je
   * `route-shell.css` na `:root` nosio mrtvo `font-family: var(--sans)`, gard je po specificnosti
   * (`:root` = 100, `body` = 1) citao mono, a preglednik je crtao serif s `body`. Jedna deklaracija
   * koja na stranici nije mijenjala nista drzala je gard slijepim za 131 stvaran nalaz (izmjereno
   * 2026-09-20 na `187e327f`, prije popravka).
   *
   * DVIJE POPULACIJE (nalaz drugog kruga 2026-09-20). Selektor `strong` ne opisuje jedan element
   * nego SVE takve. Presjek (`istiElement`) je za goli `strong` vracao mono iz
   * `.outlook__ceiling strong` i time presutio svaki `strong` izvan tog kontejnera. Strogi prolaz
   * gleda samo pravila koja vrijede za SVAKI takav element. Nalaz je serif ako je serif u bilo kojem.
   *
   * NAGLASAK U SERIFU mjeri ono sto `tezineIznad400` po konstrukciji ne moze: element koji tezinu
   * dobiva od golog `strong` (a vlastito pravilo nema). Tocno taj oblik je 2026-09-20 prosao kroz
   * prvi krug: `.pcard-path` je serif, `src/ui/app.ts` u njega renderira `<strong>`, pa je vrijedilo
   * globalnih 600 na pismu koje rez 600 nema. Obitelj potomka se RAZRJESAVA, ne pretpostavlja:
   * `.result-readiness strong` ima vlastito mono pravilo, pa njegovih 800 nije nalaz (prvi prolaz
   * je to pretpostavljao i dao cetiri lazna nalaza).
   *
   * MONO U SERIFNOM NAGLASKU mjeri razrijesenu obitelj elementa, ne obitelj pravila: isti element
   * zna imati mono pravilo u jednom listu i serifno u drugom (`.trust-row span`, `.local-badge`).
   *
   * UI_SELEKTORI su FIXTURE, ne izvod (selektori koje je krug 2026-09-20 nasao na serifu), pa uz
   * tvrdnju o glasu ide i tvrdnja da svaki od njih POSTOJI u listovima.
   */

  it('nijedan element u src/ ne dobiva tezinu iznad 400 na display serifu', () => {
    // POVIJESNA BILJESKA (nije tvrdnja ovog testa, mjeri se dolje nad zivim stablom):
    // stablo `187e327f` (stanje neposredno prije ovog kruga popravka), s DANASNJIM gardom
    // (commit d2eb5fca, jer glasZa od tog commita prosiruje razrjesenje na potomke bez
    // vlastitog pravila), daje TOCNO 133 nalaza. Broj NIJE 131: 131 je izmjerio stariji
    // gard (de1b3eb9) nad istim stablom, prije nego je d2eb5fca prosirio obuhvat. Broj je
    // dakle vezan uz par (stablo, verzija garda) i mijenja se kad se gard pojaca, pa ovdje
    // ostaje samo kao komentar, ne kao tvrdnja koja usporeduje konstantu sa samom sobom.
    // Reprodukcija (iz korijena repozitorija, Bash):
    //   TMP=$(mktemp -d) && git archive 187e327f | (mkdir -p "$TMP/repo" && tar -x -C "$TMP/repo")
    //   cp tests/design-tokens.test.ts "$TMP/repo/tests/design-tokens.test.ts"
    //   cd "$TMP/repo" && <junction/symlink node_modules na postojecu instalaciju>
    //   npx vitest run tests/design-tokens.test.ts -t "nijedan element u src/ ne dobiva tezinu iznad 400"
    //   (test i dalje pada na donjoj tvrdnji, ali ispisuje duljinu niza nalaza; ta duljina je 133)
    // Mutacije nize dokazuju da gard grize i danas; njih nosi mutacija, ne ova konstanta.
    const listovi = listoviSrc();
    expect(listovi.length, 'nula listova znaci da obilazak ne radi, ne da su cisti')
      .toBeGreaterThan(5);
    // SENTINEL: populacija mora sadrzavati i deklaracije iznad 400, inace bi prazan nalaz bio
    // vakuumski zelen nad stablom u kojem takvih deklaracija uopce nema.
    const teske = pravilaIz(listovi).filter((p) => p.tezina !== null && tezinaBroj(p.tezina) > 400);
    expect(teske.length, 'nula deklaracija iznad 400 znaci da citanje mjeri krivo')
      .toBeGreaterThan(50);
    expect(tezineIznad400(listovi), 'Instrument Serif nema rez iznad 400; zahtjev se ili ignorira ili sintetizira')
      .toEqual([]);
  });

  it('nijedan selektor sucelja ne razrjesava na display serif', () => {
    const listovi = listoviSrc();
    const sva = pravilaIz(listovi);
    // SENTINEL: svaki selektor s popisa mora POSTOJATI u listovima. Popis koji se isprazni
    // (preimenovan selektor, obrisan list) inace prolazi vakuumski.
    const nepostojeci = UI_SELEKTORI
      .filter(([ime, sel]) => !sva.some((p) => p.ime === ime && p.sel === sel))
      .map(([ime, sel]) => `${ime}: ${sel}`);
    expect(nepostojeci, 'selektor s popisa vise ne postoji, pa gard nad njim ne mjeri nista')
      .toEqual([]);
    // SENTINEL: bar jedan od njih mora glas STVARNO nasljedjivati, inace popis mjeri samo
    // pravila koja obitelj deklariraju sama i nasljedjivanje uopce ne dira.
    const naslijedjenih = UI_SELEKTORI
      .filter(([ime, sel]) => glasZa(sva, sel, ime).odakle.startsWith('korijen ')).length;
    expect(naslijedjenih, 'nijedan selektor s popisa ne nasljedjuje glas, pa gard ne mjeri kaskadu')
      .toBeGreaterThan(5);
    expect(uiNaSerifu(listovi), 'glas sucelja je mono; serif je za prozu, ne za cip ni gumb')
      .toEqual([]);
  });

  it('MUTACIJA: serif na body-ju odvodi selektore sucelja na serif, mono ih vraca', () => {
    const popis: ReadonlyArray<readonly [string, string]> = [
      ['x.css', '.route-button'],
      ['x.css', '.status'],
    ];
    // BASELINE: `body` u monu, oba selektora ostaju mono.
    expect(uiNaSerifu(
      [{ ime: 'x.css', css: 'body{font:16px var(--ui)}.route-button{font-weight:800}.status{font-weight:900}' }],
      popis,
    ), 'baseline').toEqual([]);
    // MUTACIJA: `body` na serifu odvodi OBA, jer vlastitu obitelj nemaju.
    expect(uiNaSerifu(
      [{ ime: 'x.css', css: 'body{font:16px var(--display-serif)}.route-button{font-weight:800}.status{font-weight:900}' }],
      popis,
    )).toHaveLength(2);
    // KONTROLA SMJERA: vlastita mono deklaracija nadjacava naslijedjeni serif.
    expect(uiNaSerifu(
      [{ ime: 'x.css', css: 'body{font:16px var(--display-serif)}.route-button{font-family:var(--ui)}.status{font-family:var(--mono)}' }],
      popis,
    )).toEqual([]);
  });

  it('MUTACIJA: serif se vidi kroz token, doslovno ime, drugo pravilo, pretka i korijen', () => {
    const l = (css: string, ime = 'x.css'): Array<{ ime: string; css: string }> => [{ ime, css }];
    // BASELINE: rez 400 na serifu, u oba zapisa.
    expect(tezineIznad400(l('.a{font:400 20px/1 var(--display-serif)}')), 'baseline').toEqual([]);
    expect(tezineIznad400(l('.a{font-family:var(--display-serif);font-weight:400}')), 'baseline').toEqual([]);
    // MUTACIJA 1: kratica `font:` s tokenom, jedini oblik koji je stari gard hvatao.
    expect(tezineIznad400(l('.a{font:650 20px/1 var(--display-serif)}'))).toHaveLength(1);
    // MUTACIJA 2: DOSLOVNO ime obitelji, bez tokena. Tocan oblik iz `demo.css`.
    expect(tezineIznad400(l(".brand-mark{font:600 20px 'Instrument Serif',Georgia,serif}"))).toHaveLength(1);
    // MUTACIJA 3: obitelj i tezina u DVA pravila, specificnije nosi obitelj (`.faq summary`).
    expect(tezineIznad400(l('.faq summary{font-weight:850}#faq .faq summary{font-family:var(--display-serif)}')))
      .toHaveLength(1);
    // MUTACIJA 4: glas dolazi od PRETKA, element vlastitu obitelj nema.
    expect(tezineIznad400(l('.hero{font-family:var(--display-serif)}.hero b{font-weight:700}'))).toHaveLength(1);
    // MUTACIJA 5: glas dolazi od KORIJENA svijeta.
    expect(tezineIznad400(l('body{font:16px/1.6 var(--display-serif)}.x{font-weight:800}'))).toHaveLength(1);
    // MUTACIJA 5b: TOCAN OBLIK KOJI JE GARD PROPUSTAO DO 2026-09-20. `:root` nosi mono i vecu
    // specificnost (100 naprama 1), `body` nosi serif i vecu BLIZINU. Preglednik gleda blizinu,
    // pa `.x` dobiva serif; gard koji korijen bira po specificnosti ovdje vraca prazno i time
    // presuti 131 stvaran nalaz. Poredak deklaracija ne smije nista promijeniti, pa se mjere oba.
    expect(tezineIznad400(l(':root{font-family:var(--ui)}body{font:16px var(--display-serif)}.x{font-weight:800}')))
      .toHaveLength(1);
    expect(tezineIznad400(l('body{font:16px var(--display-serif)}:root{font-family:var(--ui)}.x{font-weight:800}')))
      .toHaveLength(1);
    // KONTROLA SMJERA: obrnuta podjela (blizi `body` mono, dalji `:root` serif) NIJE nalaz.
    expect(tezineIznad400(l(':root{font-family:var(--display-serif)}body{font:16px var(--ui)}.x{font-weight:800}')))
      .toEqual([]);
    // MUTACIJA 5c: DVIJE LJUSKE ISTOG SVIJETA, svaka sa svojim `body`. One se nikad ne ucitavaju
    // zajedno, pa mono u abecedno kasnijem listu ne smije presutjeti serif u ranijem. Tocan
    // oblik: `page-chrome.css` (ljuska aplikacije) i `tool-page.css` (ljuska alata).
    expect(tezineIznad400([
      { ime: 'src/shared/page-chrome.css', css: 'body{font:16px var(--display-serif)}.x{font-weight:800}' },
      { ime: 'src/shared/tool-page.css', css: 'body{font:16px var(--ui)}' },
    ])).toHaveLength(1);
    // BASELINE uz isti oblik: obje ljuske u monu, nema nalaza.
    expect(tezineIznad400([
      { ime: 'src/shared/page-chrome.css', css: 'body{font:16px var(--ui)}.x{font-weight:800}' },
      { ime: 'src/shared/tool-page.css', css: 'body{font:16px var(--ui)}' },
    ])).toEqual([]);
    // MUTACIJA 6: alias biljeske korektora vodi na isto pismo, i s fallbackom u `var()`.
    expect(tezineIznad400(l('.a{font-family:var(--font-hand);font-weight:bold}'))).toHaveLength(1);
    expect(tezineIznad400(l('.a{font-family:var(--display-serif, Georgia);font-weight:600}'))).toHaveLength(1);
  });

  it('MUTACIJA: mono ostaje slobodan, a o nalazu odlucuje POBJEDNIK kaskade', () => {
    const l = (css: string, ime = 'x.css'): Array<{ ime: string; css: string }> => [{ ime, css }];
    // Geist Mono je varijabilan (100 do 900), pa tezina iznad 400 na njemu NIJE nalaz.
    expect(tezineIznad400(l('.a{font:600 11px/1 var(--mono)}'))).toEqual([]);
    expect(tezineIznad400(l('.a{font-family:var(--ui);font-weight:700}'))).toEqual([]);
    expect(tezineIznad400(l(".a{font:600 10px 'Geist Mono',monospace}"))).toEqual([]);
    // KASNIJE pravilo koje tezinu vraca na 400 gasi nalaz (stvaran oblik: `.phase-title`).
    expect(tezineIznad400(l('.t{font-weight:900}.t{font-family:var(--display-serif);font-weight:400}'))).toEqual([]);
    // KASNIJE pravilo koje obitelj prebaci na mono takoder gasi nalaz (`.panel-title`).
    expect(tezineIznad400(l('.p{font-weight:900}.p{font-family:var(--display-serif)}.p{font:600 10px var(--sans)}')))
      .toEqual([]);
    // OBRNUT redoslijed JEST nalaz: mono prvo, serif zadnji, tezina ostaje (`.local-badge`).
    expect(tezineIznad400(l('.b{font:600 10px var(--ui)}.b{font-family:var(--display-serif)}'))).toHaveLength(1);
    // SPECIFICNOST nadjacava redoslijed: goli `h2` serif gubi od `.card h2` mono (`premium.css`).
    expect(tezineIznad400(l('.card h2{font:600 14px var(--ui)}h2{font-family:var(--display-serif)}'))).toEqual([]);
    // Pseudoelement je vlastita kutija: obitelj na `::after` ne odlucuje o elementu.
    expect(tezineIznad400(l('.o{font-weight:800}.o::after{font-family:var(--display-serif)}'))).toEqual([]);
    // Razliciti preci, isti subjekt: `.a h2` ne uzima glas od `.b h2`.
    expect(tezineIznad400(l('.a h2{font-family:var(--display-serif)}.b h2{font-weight:700}'))).toEqual([]);
    // Svijet je granica: korijen `demo` ne odlucuje o listu iz `admin`.
    expect(tezineIznad400([
      { ime: 'src/demo/demo.css', css: ':root{font-family:var(--display-serif)}' },
      { ime: 'src/admin/a.css', css: 'body{font-family:var(--mono)}.z{font-weight:800}' },
    ])).toEqual([]);
    // KONTROLA: velicina od 500px nije tezina.
    expect(tezineIznad400(l('.a{font:400 500px/1 var(--display-serif)}'))).toEqual([]);
  });

  it('svaki serifni kontejner nosi naglasak i za potomka bez vlastitog pravila', () => {
    const listovi = listoviSrc();
    const sva = pravilaIz(listovi);
    // SENTINEL 1: globalno pravilo mora postojati i citati OBA dijela para. Bez njega funkcija
    // nema sto mjeriti (tvornicka tezina je imenovana granica modela), pa bi vratila prazno i
    // izgledala zeleno. Mjeri se NA IZVORU, jer je to jedina deklaracija koja mehanizam ozivljuje.
    const globalno = sva.filter((p) => (p.sel === 'strong' || p.sel === 'b') && p.tezina !== null);
    expect(globalno.map((p) => p.sel).sort(), 'globalno pravilo naglaska je nestalo')
      .toEqual(['b', 'strong']);
    expect(globalno.every((p) => /^var\(\s*--emph-weight\s*,/.test(p.tezina ?? '')),
      'globalno pravilo vise ne cita --emph-weight, pa par vise nista ne mijenja').toBe(true);
    // SENTINEL 2: populacija sintetickih potomaka nije prazna. Nula serifnih pravila znaci da
    // citanje mjeri krivo, ne da je stablo cisto.
    expect(sva.filter((p) => jeSerif(p.obitelj)).length, 'nula serifnih pravila')
      .toBeGreaterThan(100);
    expect(naglasakUSerifu(listovi), 'serif nema rez iznad 400; naglasak u njemu nosi kurziv')
      .toEqual([]);
  });

  it('mono kontejner ne nasljedjuje serifni naglasak', () => {
    const listovi = listoviSrc();
    const sva = pravilaIz(listovi);
    // SENTINEL: mora postojati bar jedno mono pravilo koje par STVARNO vraca, inace tvrdnja mjeri
    // samo pravila koja serifnog pretka nemaju i prolazi vakuumski.
    const vracaju = sva.filter((p) => p.naglasakTezina !== null && !jeSerif(p.obitelj));
    expect(vracaju.length, 'nijedno mono pravilo ne vraca par, pa se obrnuti smjer ne mjeri')
      .toBeGreaterThan(3);
    expect(monoUSerifnomNaglasku(listovi), 'Geist Mono se ucitava samo uspravno, kurziv u njemu ne postoji')
      .toEqual([]);
  });

  it('MUTACIJA: serifni kontejner bez para naglaska pada, i kad potomak nema vlastito pravilo', () => {
    const G = 'strong,b{font-weight:var(--emph-weight,600);font-style:var(--emph-style,normal)}';
    const l = (css: string, ime = 'x.css'): Array<{ ime: string; css: string }> => [{ ime, css: G + css }];
    // BASELINE: serifni kontejner s parom. Potomak nema vlastito pravilo i svejedno je pokriven.
    expect(naglasakUSerifu(l('.pcard-path{font-family:var(--display-serif);--emph-weight:400;--emph-style:italic}')),
      'baseline').toEqual([]);
    // MUTACIJA 1: TOCAN OBLIK KOJI JE PRVI KRUG PROPUSTIO. Serifni kontejner bez para, potomak
    // bez vlastitog pravila: naglasak pada na globalnih 600 u pismu koje rez 600 nema.
    expect(naglasakUSerifu(l('.pcard-path{font-family:var(--display-serif)}')))
      .toHaveLength(2);
    // MUTACIJA 2: par postoji, ali s tezinom koju serif nema.
    expect(naglasakUSerifu(l('.a{font-family:var(--display-serif);--emph-weight:700;--emph-style:italic}')))
      .toHaveLength(2);
    // MUTACIJA 3: rez 400 BEZ kurziva znaci da naglasak ne postoji ni kao tezina ni kao nagib.
    expect(naglasakUSerifu(l('.a{font-family:var(--display-serif);--emph-weight:400;--emph-style:normal}')))
      .toHaveLength(2);
    // MUTACIJA 4: par na PRETKU pokriva potomka, jer se nasljedjuje.
    expect(naglasakUSerifu(l('.wrap{--emph-weight:400;--emph-style:italic}.wrap .a{font-family:var(--display-serif)}')))
      .toEqual([]);
    // KONTROLA: mono kontejner bez para nije nalaz, ondje je 600 stvaran rez.
    expect(naglasakUSerifu(l('.a{font-family:var(--mono)}'))).toEqual([]);
    // KONTROLA: potomak s VLASTITOM tezinom 400 ne ovisi o paru.
    expect(naglasakUSerifu(l('.a{font-family:var(--display-serif)}.a strong{font-weight:400}.a b{font-weight:400}')))
      .toEqual([]);
    // GRANICA: bez globalnog pravila funkcija nema sto mjeriti i vraca prazno. Zato uz nju stoji
    // sentinel koji tvrdi da to pravilo u izvorima postoji.
    expect(naglasakUSerifu([{ ime: 'x.css', css: '.a{font-family:var(--display-serif)}' }])).toEqual([]);
  });

  it('MUTACIJA: mono kontejner unutar serifnog mora vratiti par', () => {
    const l = (css: string, ime = 'x.css'): Array<{ ime: string; css: string }> => [{ ime, css }];
    const SERIF = '.paper{font-family:var(--display-serif);--emph-weight:400;--emph-style:italic}';
    // BASELINE: mono kontejner BEZ serifnog pretka nasljedjuje rezervu, dakle mono naglasak.
    expect(monoUSerifnomNaglasku(l('.chip{font-family:var(--mono)}')), 'baseline').toEqual([]);
    // MUTACIJA: mono kontejner unutar serifnog naslijedio bi kurziv u pismu koje kurziv nema.
    expect(monoUSerifnomNaglasku(l(SERIF + '.paper .chip{font-family:var(--mono)}'))).toHaveLength(1);
    // KONTROLA SMJERA: vlastiti par vraca mono naglasak i gasi nalaz.
    expect(monoUSerifnomNaglasku(
      l(SERIF + '.paper .chip{font-family:var(--mono);--emph-weight:600;--emph-style:normal}'),
    )).toEqual([]);
  });


  it('svaki svijet koji korijenu daje obitelj gasi i sintezu reza', () => {
    const listovi = listoviSrc();
    // Sentinel: bez vise svjetova s obitelji na korijenu tvrdnja bi bila vakuumski zelena.
    const korijeni = pravilaIz(listovi).filter((p) => KORIJENSKI.includes(p.sel) && p.obitelj !== null);
    expect(new Set(korijeni.map((p) => svijet(p.ime))).size, 'manje od dva svijeta s obitelji na korijenu')
      .toBeGreaterThan(1);
    expect(svjetoviBezSinteze(listovi), 'bez font-synthesis: none preglednik razvuce rez 400 u lazni bold')
      .toEqual([]);
  });

  it('MUTACIJA: svijet bez font-synthesis: none pada, a gasilo drugog svijeta ne pomaze', () => {
    // BASELINE: korijen s obitelji i gasilom u ISTOM pravilu.
    expect(svjetoviBezSinteze([{ ime: 'src/a.css', css: ':root{font-synthesis:none;font-family:var(--display-serif)}' }]))
      .toEqual([]);
    // Gasilo smije stajati i u drugom korijenskom pravilu istog svijeta.
    expect(svjetoviBezSinteze([{ ime: 'src/a.css', css: 'html{font-synthesis:none}body{font-family:var(--display-serif)}' }]))
      .toEqual([]);
    // MUTACIJA: obitelj bez gasila.
    expect(svjetoviBezSinteze([{ ime: 'src/a.css', css: 'body{font-family:var(--display-serif)}' }]))
      .toEqual(['proizvod']);
    // MUTACIJA: gasilo u svijetu proizvoda ne pokriva `admin` ni `demo`. Tocan nalaz 2026-09-20:
    // ni jedna ni druga stranica ne uvozi `design-system.css`, a body im je prebacen na serif.
    expect(svjetoviBezSinteze([
      { ime: 'src/shared/design-system.css', css: ':root{font-synthesis:none;font-family:var(--display-serif)}' },
      { ime: 'src/admin/admin-dashboard.css', css: 'body{font-family:var(--display-serif)}' },
      { ime: 'src/demo/demo.css', css: ':root{font-family:var(--mono)}' },
    ])).toEqual(['admin', 'demo']);
  });

  it('font-synthesis: none stoji na korijenu izvora istine', () => {
    const korijen = bezKomentara(DIZAJN).match(/:root\s*\{([\s\S]*?)\n\}/);
    expect(korijen, 'blok :root nije pronadjen, dakle citanje mjeri krivo').not.toBeNull();
    expect(bezRazmaka(korijen ? korijen[1] : '')).toContain('font-synthesis:none');
  });
});

/**
 * Z7(a) POPRAVAK NALAZA PREGLEDA: proza govori serifom, Georgia samo za tudji rad.
 *
 * Tri tvrdnje nad STVARNIM stranicama, svaka s mutacijom ovdje i u `tests/gate-mutations.test.ts`:
 *   1. Svaki visereceni `p`, `dd` i `blockquote` na javnim stranicama dobiva serif. Mjeri se
 *      kaskada razlozena nad DOM-om stranice (`obiteljElementa`), ne selektor: odgovor u FAQ-u
 *      alata nije imao nijedno pravilo s obitelji i naslijedio je mono s `body`.
 *   2. Nijedno pravilo izvan tudjeg rada ne crta Georgiju (`DOPUSTENA_GEORGIA`).
 *   3. Nijedan element stranice ne trazi tezinu iznad 400 na display serifu. Gard nad `src/`
 *      (gore) ne vidi inline `<style>` stranica, a upravo ondje je stajalo `.faq summary` s 700.
 */
describe('Z7(a) popravak: proza i glas tudjeg rada', () => {
  const stranica = (rel: string): { html: string; listovi: Array<{ ime: string; css: string }> } =>
    listoviStranice(root, rel, DISK);

  it('citac selektora: zarez na vrhu, uravnotezene zagrade, specificnost :where i :not', () => {
    expect(podijeliNaVrhu('p:where(:not([class])),dd:where(:not([class]))')).toEqual(['p:where(:not([class]))', 'dd:where(:not([class]))']);
    expect(podijeliNaVrhu(':where(p, dd) .x, .y')).toEqual([':where(p, dd) .x', '.y']);
    expect(subjekt('p:where(:not([class]))')).toBe('p');
    expect(subjekt('.faq details[open] p:not(.x)')).toBe('p');
    // `:where()` ne nosi nista, `:not(x)` nosi x; element ostaje element.
    expect(specificnost('p:where(:not([class]))')).toBe(specificnost('p'));
    expect(specificnost('.a:not([hidden])')).toBe(specificnost('.a.b'));
    expect(specificnost('p:not(div)')).toBe(specificnost('p div'));
    expect(specificnost('#faq .faq p')).toBeGreaterThan(specificnost('.faq details p'));
  });

  it('popis stranica pokriva svaku javnu korijensku stranicu', () => {
    const izuzete = ['admin.html', 'demo.html', 'verification.html'];
    const korijenske = readdirSync(root).filter((x) => x.endsWith('.html') && !izuzete.includes(x)).sort();
    expect(korijenske.length, 'nula stranica znaci da obilazak ne radi').toBeGreaterThan(8);
    expect(korijenske.filter((x) => !(STRANICE_PROZE as readonly string[]).includes(x))).toEqual([]);
  });

  it('svaki visereceni odlomak na svakoj stranici govori serifom', () => {
    let ukupno = 0;
    for (const rel of STRANICE_PROZE) {
      const { html, listovi } = stranica(rel);
      const { odlomaka, uFaqu, problemi } = problemiProzeStranice(html, listovi);
      ukupno += odlomaka;
      // SENTINELI po stranici: /saznaj-vise/ je mjesto nalaza, a FAQ alata je druga polovica naloga.
      if (rel === 'saznaj-vise/index.html') expect(odlomaka, rel).toBeGreaterThan(10);
      if (['citat.html', 'izjava.html', 'kartice.html', 'literatura.html', 'naslovnica.html'].includes(rel)) {
        expect(uFaqu, `${rel}: nula odlomaka u FAQ-u znaci da citac ne vidi odgovore`).toBeGreaterThan(2);
      }
      expect(problemi, `${rel}: mono nikad za recenicu duzu od jednog retka (design/README.md)`).toEqual([]);
    }
    // SENTINEL populacije: prazan skup odlomaka ne bi bio cist nalaz nego slijep citac.
    expect(ukupno).toBeGreaterThan(80);
  });

  it('IZRAVAN SIGNAL: golo pravilo u design-system.css stvarno odlucuje o odgovoru u listi cinjenica', () => {
    // Nizvodno poboljsanje nije dokaz uzroka (CLAUDE.md): tvrdi se da je pobjednik kaskade za
    // `dd` na kartice.html BAS novo pravilo, a ne neko slucajno pravilo koje je vec postojalo.
    const { html, listovi } = stranica('kartice.html');
    const doc = dokumentStranice(html);
    const dd = visereceniOdlomci(doc).find((el) => el.tagName === 'DD');
    expect(dd, 'kartice.html nema visereceni dd').toBeTruthy();
    const { obitelj, odakle } = obiteljElementa(dd as NonNullable<typeof dd>, pravilaIz(listovi));
    expect(odakle).toBe('src/shared/design-system.css: dd:where(:not([class]))');
    expect(jeSerif(obitelj)).toBe(true);
  });

  it('MUTACIJA: odlomak bez pravila nasljedjuje mono i pada; pravilo s klasom nadjacava golo', () => {
    const TIJELO = 'body{font:15px var(--ui)}';
    const PRAVILO = 'p:where(:not([class])),dd:where(:not([class])){font-family:var(--display-serif)}';
    const html = '<body><div class="faq"><details><summary>P</summary><p>Prva recenica. Druga recenica.</p></details></div>'
      + '<p class="meta">Oznaka. Druga oznaka.</p></body>';
    const mjeri = (css: string): string[] => problemiProzeStranice(html, [{ ime: 'x.css', css }]).problemi;
    // BASELINE: golo pravilo daje serif odgovoru, a klasa `.meta` sama dodjeljuje serif.
    expect(mjeri(TIJELO + PRAVILO + '.meta{font-family:var(--display-serif)}'), 'baseline').toEqual([]);
    // MUTACIJA 1: bez golog pravila odgovor u FAQ-u nasljedjuje mono s body (tocan nalaz pregleda).
    expect(mjeri(TIJELO + '.meta{font-family:var(--display-serif)}')).toHaveLength(1);
    // MUTACIJA 2: pravilo s pretkom vraca mono i nadjacava golo pravilo (specificnost, ne redoslijed).
    expect(mjeri(PRAVILO + TIJELO + '.meta{font-family:var(--display-serif)}.faq details p{font-family:var(--mono)}'))
      .toHaveLength(1);
    // KONTROLA: golo pravilo NE dira element s klasom, pa `.meta` bez vlastitog pravila ostaje mono.
    expect(mjeri(TIJELO + PRAVILO)).toEqual([expect.stringContaining('p.meta')]);
    // KONTROLA: jednorecenicni odlomak nije proza u smislu naloga i ne mjeri se.
    expect(problemiProzeStranice('<body><p>Kopirano.</p></body>', [{ ime: 'x.css', css: TIJELO }]).odlomaka).toBe(0);
  });

  it('nijedno pravilo izvan tudjeg rada ne crta Georgiju', () => {
    const listovi = [...listoviSrc()];
    for (const rel of STRANICE_PROZE) {
      for (const m of read(rel).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) listovi.push({ ime: rel, css: m[1] });
    }
    // SENTINEL: citac mora vidjeti Georgiju, inace je "nijedno pravilo" vakuumski zeleno.
    expect(pravilaIz(listovi).filter((p) => jeDokument(p.obitelj)).length).toBeGreaterThanOrEqual(DOPUSTENA_GEORGIA.length);
    expect(georgiaUSucelju(listovi, DOPUSTENA_GEORGIA), 'Georgia glumi tudji rad; u sucelju govori Instrument Serif')
      .toEqual([]);
  });

  it('MUTACIJA: Georgia u pitanju FAQ-a pada, a nestao dopusteni selektor takodjer', () => {
    const DOP: ReadonlyArray<DopustenaGeorgia> = [['x.css', '#tp-sheet', 'faksimil']];
    const FAKS = '#tp-sheet{font-family:var(--ink-serif)}';
    // BASELINE: faksimil smije, FAQ je na serifu proizvoda.
    expect(georgiaUSucelju([{ ime: 'x.css', css: FAKS + '.faq summary{font-family:var(--display-serif)}' }], DOP), 'baseline')
      .toEqual([]);
    // MUTACIJA 1: tocan nalaz pregleda, `.faq summary` na --ink-serif.
    expect(georgiaUSucelju([{ ime: 'x.css', css: FAKS + '.faq summary{font-family:var(--ink-serif);font-weight:700}' }], DOP))
      .toEqual(['x.css: .faq summary -> var(--ink-serif)']);
    // MUTACIJA 2: kroz drugi token i kroz doslovno ime u kratici.
    expect(georgiaUSucelju([{ ime: 'x.css', css: FAKS + '.a{font-family:var(--font-doc)}.b{font:15px/1.7 Georgia,serif}' }], DOP))
      .toHaveLength(2);
    // MUTACIJA 3: dopusteni selektor je nestao (preimenovan), pa popis vise nista ne mjeri.
    expect(georgiaUSucelju([{ ime: 'x.css', css: '.tp-sheet{font-family:var(--ink-serif)}' }], DOP))
      .toEqual(['x.css: .tp-sheet -> var(--ink-serif)', 'x.css: #tp-sheet je dopusten, a ne postoji ili ne nosi Georgiju']);
    // KONTROLA: Georgia kao REZERVA u repu serifnog tokena nije Georgia u sucelju.
    expect(georgiaUSucelju([{ ime: 'x.css', css: FAKS + '.c{font-family:"Instrument Serif",Georgia,serif}' }], DOP)).toEqual([]);
  });

  it('nijedan element nijedne stranice ne trazi tezinu iznad 400 na display serifu', () => {
    let inline = 0;
    for (const rel of STRANICE_PROZE) {
      const { listovi } = stranica(rel);
      inline += listovi.filter((l) => l.ime === rel).length;
      expect(tezineIznad400(listovi), rel).toEqual([]);
    }
    // SENTINEL: bez inline blokova ovaj gard mjeri isto sto i gard nad src/ i nista vise.
    expect(inline).toBeGreaterThan(8);
  });

  it('MUTACIJA: inline pravilo stranice s tezinom 700 na serifu pada', () => {
    const baza = [{ ime: 'src/shared/tool-page.css', css: 'body{font:15px var(--ui)}' }];
    expect(tezineIznad400([{ ime: 'x.html', css: '.faq summary{font-family:var(--display-serif);font-weight:400}' }, ...baza]), 'baseline')
      .toEqual([]);
    expect(tezineIznad400([{ ime: 'x.html', css: '.faq summary{font-family:var(--display-serif);font-weight:700}' }, ...baza]))
      .toHaveLength(1);
  });
});
