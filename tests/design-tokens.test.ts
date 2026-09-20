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
const PILOT = ['src/routes/intake/intake.css', 'src/routes/shared/route-shell.css'];

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
 * Z7 (2026-09-20, opcija a): DVA GLASA I JEDAN GOST.
 *
 * Tri tvrdnje, svaka s mutacijom, jer gard bez dokaza da grize se ne racuna (CLAUDE.md):
 *   1. Tokeni glasa imaju TOCNO propisanu vrijednost. Token koji se tiho pomakne mijenja pismo
 *      na svakoj ruti, a nijedan postojeci test to ne bi vidio: lanac u `entry-fonts.test.ts`
 *      pita samo je li obitelj UCITANA, ne je li ona koja je odlucena.
 *   2. Nijedna deklaracija na display serifu ne trazi tezinu iznad 400. Instrument Serif taj rez
 *      nema; bez `font-synthesis: none` preglednik ga razvuce, a s njim se zahtjev tiho ignorira.
 *      Oba ishoda su kvar, i nijedan ne pada sam od sebe.
 *   3. `font-synthesis: none` stoji na korijenu.
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
    ['--display-serif', '"Instrument Serif",Georgia,"Times New Roman",serif'],
    ['--mono', '"Geist Mono Variable","Geist Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'],
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
    expect(token(':root{--mono:"Geist Mono Variable",monospace}', '--mono'))
      .toBe('"GeistMonoVariable",monospace');
    // MUTACIJA: druga obitelj na istom tokenu daje drugu vrijednost, dakle tvrdnja pada.
    expect(token(':root{--mono:"IBM Plex Mono",monospace}', '--mono'))
      .not.toBe('"GeistMonoVariable",monospace');
    // KONTROLA SMJERA: isti popis s drugim razmacima i dalje prolazi.
    expect(token(':root{--mono: "Geist Mono Variable" , monospace}', '--mono'))
      .toBe('"GeistMonoVariable",monospace');
  });

  /** Deklaracije koje display serifu (ili njegovu aliasu) daju tezinu iznad 400. */
  function tezineIznad400(css: string): string[] {
    const SERIF = /var\(\s*--(?:display-serif|font-hand)\s*[,)]/;
    const nalazi: string[] = [];
    for (const blok of bezKomentara(css).matchAll(/\{([^{}]*)\}/g)) {
      const tijelo = blok[1];
      for (const m of tijelo.matchAll(/font\s*:\s*([^;}]*)/g)) {
        if (!SERIF.test(m[1])) continue;
        const prije = m[1].split('var(')[0];
        const w = prije.match(/(?<![\w.])([1-9]\d{2})(?![\w.%])/);
        if (w && Number(w[1]) > 400) nalazi.push(m[0].trim().slice(0, 70));
      }
      if (!new RegExp('font-family\\s*:\\s*' + SERIF.source).test(tijelo)) continue;
      for (const m of tijelo.matchAll(/font-weight\s*:\s*([1-9]\d{2}|bold|bolder)/g)) {
        if (m[1] === 'bold' || m[1] === 'bolder' || Number(m[1]) > 400) nalazi.push(m[0].trim());
      }
    }
    return nalazi;
  }

  it('nijedan list u src/ ne trazi tezinu iznad 400 na display serifu', () => {
    const hodaj = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? hodaj(join(dir, e.name)) : [join(dir, e.name)]));
    const listovi = hodaj(join(root, 'src')).filter((f) => f.endsWith('.css'));
    expect(listovi.length, 'nula listova znaci da obilazak ne radi, ne da su cisti')
      .toBeGreaterThan(5);
    const nalazi = listovi.flatMap((f) => tezineIznad400(readFileSync(f, 'utf8'))
      .map((n) => `${f.slice(root.length + 1).split(/[\\/]/).join('/')}: ${n}`));
    expect(nalazi, 'Instrument Serif nema rez iznad 400; zahtjev se ili ignorira ili sintetizira')
      .toEqual([]);
  });

  it('MUTACIJA: tezina iznad 400 se vidi u OBA zapisa, mono ostaje slobodan', () => {
    // BASELINE.
    expect(tezineIznad400('.a{font:400 20px/1 var(--display-serif)}')).toEqual([]);
    expect(tezineIznad400('.a{font-family:var(--display-serif);font-weight:400}')).toEqual([]);
    // MUTACIJA 1: kratica `font:`.
    expect(tezineIznad400('.a{font:650 20px/1 var(--display-serif)}')).toHaveLength(1);
    // MUTACIJA 2: odvojena `font-weight`, ukljucujuci oblik s fallbackom u `var()`.
    expect(tezineIznad400('.a{font-family:var(--display-serif, Georgia);font-weight:600}'))
      .toHaveLength(1);
    // MUTACIJA 3: alias za biljesku korektora vodi na isto pismo.
    expect(tezineIznad400('.a{font-family:var(--font-hand);font-weight:bold}')).toHaveLength(1);
    // KONTROLA SMJERA: mono ima pune tezine, pa 600 na njemu NIJE nalaz.
    expect(tezineIznad400('.a{font:600 11px/1 var(--mono)}')).toEqual([]);
    expect(tezineIznad400('.a{font-family:var(--ui);font-weight:700}')).toEqual([]);
    // KONTROLA: velicina od 500px nije tezina.
    expect(tezineIznad400('.a{font:400 500px/1 var(--display-serif)}')).toEqual([]);
  });

  it('font-synthesis: none stoji na korijenu', () => {
    const korijen = bezKomentara(DIZAJN).match(/:root\s*\{([\s\S]*?)\n\}/);
    expect(korijen, 'blok :root nije pronadjen, dakle citanje mjeri krivo').not.toBeNull();
    expect(bezRazmaka(korijen ? korijen[1] : '')).toContain('font-synthesis:none');
  });
});
