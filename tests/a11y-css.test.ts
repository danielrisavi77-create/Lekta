/**
 * Cuva tri a11y CSS popravka: fokus prsten dovoljnog kontrasta (BL-P3-05, WCAG 1.4.11) na svih 8
 * stranica, minimalnu velicinu male mete 24x24 (BL-P3-04, WCAG 2.5.8) na index.html gumbima, i
 * kombinaciju "pojacan kontrast + danje svjetlo" iz panela "Prilagodi prikaz" (Z6).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => readFileSync(join(root, f), 'utf8');
const PAGES = [
  'index.html', 'citat.html', 'kartice.html', 'naslovnica.html',
  'literatura.html', 'izjava.html', 'alati.html', 'landing_usporedba.html', 'landing_benchmark.html',
];

describe('fokus prsten kontrast (BL-P3-05)', () => {
  // Token je centraliziran u dijeljeni design-system.css (jedini izvor istine za tokene),
  // pa se ne duplicira vise inline u svakoj stranici. Jamstvo ostaje identicno.
  it('design-system.css definira neproziran dvotonski --focus prsten', () => {
    expect(read('src/shared/design-system.css')).toContain('--focus: 0 0 0 2px var(--panel),0 0 0 4px var(--brand)');
  });
  it.each(PAGES)('%s ne uvodi stari slabi prsten rgba .22', (page) => {
    expect(read(page)).not.toContain('rgba(51,64,126,.22)'); // stari slabi prsten uklonjen
  });
});

describe('velicina male mete 24px (BL-P3-04)', () => {
  // Stil je 2026-09-03 izdvojen iz inline `<style>` bloka u `src/shared/page.css`, jer je
  // 203 KB inline CSS-a cinilo 71 posto `index.html` i drzalo `/rad/` nestiliziranim.
  // Citaju se OBOJE: pravila su u CSS-u, ali markup na koji se odnose je i dalje u HTML-u.
  const css = read('src/shared/page-chrome.css') + read('src/shared/page-app.css') + read('index.html');
  it.each(['remove-file', 'wl-close'])('.%s ima min 24x24 i centriran sadrzaj', (cls) => {
    const re = new RegExp(`\\.${cls}\\{[^}]*min-width:24px;min-height:24px;display:inline-grid;place-items:center[^}]*\\}`);
    expect(css).toMatch(re);
  });

  // `.cockpit-link` i `.cockpit-allchecks` su tekstualne poveznice s `padding:0` u kokpitu
  // rezultata (result-visuals.css): sirina je dovoljna (tekst), visina od ~20px nije bila. Ovdje
  // je meta samo VISINA (min-height 24px), ne kvadratna 24x24 kao gore, jer poveznica ostaje
  // sirok tekstualni redak, ne ikona.
  const cockpitCss = read('src/ui/results/result-visuals.css');
  it.each(['cockpit-link', 'cockpit-allchecks'])('.%s ima min-height 24px bez mijenjanja izgleda teksta', (cls) => {
    // `^` na pocetku retka: obje klase se pojavljuju i kao dio KOMBINIRANIH selektora drugdje u
    // datoteci (npr. `.result-cockpit .cockpit-allchecks {` za ulazni pokret), a to NIJE deklaracija
    // koju ovaj gard cuva. Vlastiti blok pocinje tocno s `.<klasa> {` na pocetku retka.
    const blok = new RegExp(`^\\.${cls} \\{[^}]*\\}`, 'm').exec(cockpitCss);
    expect(blok, `blok .${cls} nije nadjen`).toBeTruthy();
    expect(blok![0]).toMatch(/min-height:\s*24px/);
  });
});

/**
 * Z6: POJACAN KONTRAST U DANJEM SVJETLU.
 *
 * Kontrola "Pojacan kontrast" spusta `--paper-muted`, a "Danje svjetlo" podize papir. Kombinacija
 * je najsvjetlija podloga koju proizvod moze proizvesti, pa je ona mjerodavna, ne zadana tamna.
 *
 * VRIJEDNOSTI SE CITAJU IZ IZVORA, ne prepisuju: gard s prepisanom bojom ostaje zelen dokazujuci
 * nesto o nizu koji vise nije u CSS-u (zabiljezen razred kvara u ovom repozitoriju). Racun je isti
 * kao u `tests/contrast-tinted-surfaces.test.ts`.
 */
describe('pojacan kontrast u danjem svjetlu (Z6)', () => {
  const AA = 4.5;
  type Rgb = readonly [number, number, number];
  const hex = (value: string): Rgb => {
    const h = value.replace('#', '').trim();
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as unknown as Rgb;
  };
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]: Rgb): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const ratio = (a: Rgb, b: Rgb): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  /**
   * Vrijednost tokena unutar PRVOG bloka koji odgovara zadanom selektoru.
   *
   * KOMENTARI NISU KOD: oba lista objasnjavaju specificnost rijecima, pa se selektor pojavi i u
   * prozi. Bez uklanjanja komentara gard trazi token u recenici i javlja da ga nema.
   */
  /**
   * REGEX SE NE GRADI KROZ TEMPLATE LITERAL. `\s` u template literalu NIJE escape sekvenca nego
   * samo slovo `s`, pa je obrazac do sada glasio `--<token>s*:s*(...)`. Prolazio je slucajno (`s*`
   * je matchao NULA slova pa je dvotocka odmah slijedila), ali je istovremeno gadjao
   * `--paper-mutedsss:` i NIJE gadjao `--paper-muted : #4A4438`. To je imenovan razred kvara u
   * ovom repozitoriju (gard nad `git commit`, kontrolni bajt u generiranom regexu).
   */
  // Izvor se uzima iz PRAVOG literalnog regexa (`.source`), pa u ovom listu nema nijednog
  // backslasha unutar niza: escape koji prolazi kroz alat zna se izgubiti, i upravo se izgubio.
  const OBRAZAC_VRIJEDNOSTI = /\s*:\s*([^;}]+)/.source;

  const tokenUBloku = (sirovo: string, selektor: string, token: string): string => {
    const css = sirovo.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const od = css.indexOf(selektor);
    expect(od, `selektor ${selektor} nije nadjen`).toBeGreaterThan(-1);
    const blok = css.slice(css.indexOf('{', od), css.indexOf('}', od));
    const m = new RegExp('--' + token + OBRAZAC_VRIJEDNOSTI).exec(blok);
    expect(m, `token --${token} nije nadjen u bloku ${selektor}`).toBeTruthy();
    return m![1].trim();
  };

  it('obrazac tokena hvata razmak prije dvotocke, a ne hvata duzi naziv', () => {
    const ispravan = new RegExp('--paper-muted' + OBRAZAC_VRIJEDNOSTI);
    expect(ispravan.exec('--paper-muted : #4A4438;')?.[1].trim(), 'razmak prije dvotocke').toBe('#4A4438');
    expect(ispravan.exec('--paper-muted:#4A4438;')?.[1].trim()).toBe('#4A4438');
    expect(ispravan.exec('--paper-mutedsss: #000;'), 'duzi naziv NIJE isti token').toBeNull();
  });

  it('MUTACIJA: obrazac s izgubljenim escapeom grijesi u oba smjera', () => {
    // Doslovno ono u sto se `\s` unutar template literala srusi: obicno slovo `s`.
    const pokvaren = new RegExp('--paper-muted' + 's*:s*([^;}]+)');
    expect(pokvaren.exec('--paper-muted : #4A4438;'), 'lazno negativan').toBeNull();
    expect(pokvaren.exec('--paper-mutedsss: #000;'), 'lazno pozitivan').not.toBeNull();
    // BASELINE, i ujedno objasnjenje zasto kvar nikad nije pao: na obliku koji list STVARNO ima
    // (`--token: vrijednost`) oba obrasca daju istu vrijednost cim se pozove `.trim()`, koji ovaj
    // gard i inace zove. Razlikuju se samo u vodecem razmaku, koji `trim` pojede.
    const ispravan = new RegExp('--paper-muted' + OBRAZAC_VRIJEDNOSTI);
    const uzorak = '--paper-muted: #4A4438;';
    expect(pokvaren.exec(uzorak)![1]).toBe(' #4A4438');
    expect(pokvaren.exec(uzorak)![1].trim()).toBe(ispravan.exec(uzorak)![1].trim());
  });

  const DISPLAY = read('src/shared/display-settings.css');
  const SUSTAV = read('src/shared/design-system.css');

  it('prigusen tekst prolazi AA na OBA papira danjeg svjetla', () => {
    const muted = hex(tokenUBloku(DISPLAY, '[data-contrast="high"]', 'paper-muted'));
    const paper = hex(tokenUBloku(SUSTAV, '[data-theme="light"] {', 'paper'));
    const paper2 = hex(tokenUBloku(SUSTAV, '[data-theme="light"] {', 'paper-2'));
    // Sentinel: bez ovoga bi promjena imena tokena ucinila obje tvrdnje ispod vakuumskim.
    for (const [ime, rgb] of [['paper-muted', muted], ['paper', paper], ['paper-2', paper2]] as const) {
      expect(rgb.every((c) => Number.isFinite(c)), `--${ime}`).toBe(true);
    }
    expect(ratio(muted, paper), 'pojacan kontrast na --paper').toBeGreaterThanOrEqual(AA);
    expect(ratio(muted, paper2), 'pojacan kontrast na --paper-2').toBeGreaterThanOrEqual(AA);
  });

  it('pojacanje je STVARNO pojacanje: tamnije od zadanog prigusenog tona', () => {
    // Kontrola smjera. Kontrola koja obeca "pojacan kontrast" a da ga ne pojaca gora je od nikakve.
    const pojacan = hex(tokenUBloku(DISPLAY, '[data-contrast="high"]', 'paper-muted'));
    const zadani = hex(tokenUBloku(SUSTAV, ':root {', 'paper-muted'));
    const paper = hex(tokenUBloku(SUSTAV, '[data-theme="light"] {', 'paper'));
    expect(ratio(pojacan, paper)).toBeGreaterThan(ratio(zadani, paper));
  });
});

/**
 * RACUN (Z11): PECAT I ONEMOGUCEN "USKORO" GUMB PROLAZE AA NA OBJE PAPIRNATE PODLOGE, U OBJE TEME.
 *
 * `pricing-receipt.css` nije u popisu `PAGES` iznad (nije stranica, nego dijeljeni CSS uvezen u
 * vise ruta), pa dobiva vlastiti kontrastni test, istim racunom kao ostatak ove datoteke.
 * `--ok-on-soft` i `--paper-ink` su definirani JEDNOM u `:root` (ne mijenjaju se po temi), a
 * `--paper`/`--paper-2` se mijenjaju po temi, pa se provjeravaju OBJE varijante.
 */
describe('racun: pecat i onemoguceni gumb "Uskoro" kontrast (Z11)', () => {
  const AA = 4.5;
  type Rgb = readonly [number, number, number];
  const hex = (value: string): Rgb => {
    const h = value.replace('#', '').trim();
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as unknown as Rgb;
  };
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]: Rgb): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const ratio = (a: Rgb, b: Rgb): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const OBRAZAC_VRIJEDNOSTI = /\s*:\s*([^;}]+)/.source;
  const tokenUBloku = (sirovo: string, selektor: string, token: string): string => {
    const css = sirovo.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const od = css.indexOf(selektor);
    expect(od, `selektor ${selektor} nije nadjen`).toBeGreaterThan(-1);
    const blok = css.slice(css.indexOf('{', od), css.indexOf('}', od));
    const m = new RegExp('--' + token + OBRAZAC_VRIJEDNOSTI).exec(blok);
    expect(m, `token --${token} nije nadjen u bloku ${selektor}`).toBeTruthy();
    return m![1].trim();
  };

  const SUSTAV = read('src/shared/design-system.css');
  const RACUN = read('src/shared/pricing-receipt.css');

  const okOnSoft = hex(tokenUBloku(SUSTAV, ':root {', 'ok-on-soft'));
  const paperInk = hex(tokenUBloku(SUSTAV, ':root {', 'paper-ink'));
  const paperTamno = hex(tokenUBloku(SUSTAV, ':root {', 'paper'));
  const paper2Tamno = hex(tokenUBloku(SUSTAV, ':root {', 'paper-2'));
  const paperSvijetlo = hex(tokenUBloku(SUSTAV, '[data-theme="light"] {', 'paper'));
  const paper2Svijetlo = hex(tokenUBloku(SUSTAV, '[data-theme="light"] {', 'paper-2'));

  it('CSS stvarno koristi --ok-on-soft na pecatu i --paper-ink/--paper-2 na gumbu "Uskoro"', () => {
    const pecatBlok = RACUN.slice(RACUN.indexOf('.pr-stamp {'), RACUN.indexOf('}', RACUN.indexOf('.pr-stamp {')));
    expect(pecatBlok).toContain('color: var(--ok-on-soft)');
    const gumbBlok = RACUN.slice(RACUN.indexOf('.pr-btn--soon {'), RACUN.indexOf('}', RACUN.indexOf('.pr-btn--soon {')));
    expect(gumbBlok).toContain('color: var(--paper-ink)');
    expect(gumbBlok).toContain('background: var(--paper-2)');
    expect(gumbBlok).not.toMatch(/opacity\s*:/);
  });

  it('pecat (--ok-on-soft na papiru) prolazi AA u OBJE teme', () => {
    expect(ratio(okOnSoft, paperTamno), 'tamna tema, --paper').toBeGreaterThanOrEqual(AA);
    expect(ratio(okOnSoft, paper2Tamno), 'tamna tema, --paper-2').toBeGreaterThanOrEqual(AA);
    expect(ratio(okOnSoft, paperSvijetlo), 'svijetla tema, --paper').toBeGreaterThanOrEqual(AA);
    expect(ratio(okOnSoft, paper2Svijetlo), 'svijetla tema, --paper-2').toBeGreaterThanOrEqual(AA);
  });

  it('gumb "Uskoro" (--paper-ink na --paper-2) prolazi AA u OBJE teme', () => {
    expect(ratio(paperInk, paper2Tamno), 'tamna tema').toBeGreaterThanOrEqual(AA);
    expect(ratio(paperInk, paper2Svijetlo), 'svijetla tema').toBeGreaterThanOrEqual(AA);
  });

  it('MUTACIJA: staro stanje gumba (--paper-muted na --paper-line) pada AA', () => {
    const paperMuted = hex(tokenUBloku(SUSTAV, ':root {', 'paper-muted'));
    const paperLine = hex(tokenUBloku(SUSTAV, ':root {', 'paper-line'));
    expect(ratio(paperMuted, paperLine)).toBeLessThan(AA);
  });
});

/**
 * TRAKA I PODNOZJE Z15: KONTRAST TEKSTA U OBJE TEME I VELICINA MALE METE.
 *
 * Traka je JEDNA za cijeli proizvod, pa je i jedan pad kontrasta pad na svakoj stranici. Zato se
 * ovdje mjeri lanac kao i u ostatku ovog lista: koji TOKEN `site-chrome.css` stvarno koristi ->
 * vrijednost tog tokena iz `design-system.css` -> odnos prema podlozi koju traka stvarno ima.
 *
 * MJERODAVNE SU OBJE PODLOGE STOLA (`--desk` i `--desk-2`), i to je izmjereno: `--desk-muted` na
 * svijetlom `--desk-2` daje 4,61:1, dakle prolazi tek za deseti dio, a na `--desk` 5,09:1. Uzorak
 * od jedne podloge bi taj rub sakrio.
 *
 * VRIJEDNOSTI SE CITAJU IZ IZVORA. Prepisana boja ostaje zelena dokazujuci nesto o nizu koji vise
 * nije u CSS-u; to je imenovan razred kvara u ovom repozitoriju.
 */
describe('Z15 traka: kontrast teksta u obje teme, meta >= 24px', () => {
  const AA = 4.5;
  const META = 24;
  type Rgb = readonly [number, number, number];
  const hex = (value: string): Rgb => {
    const h = value.replace('#', '').trim();
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as unknown as Rgb;
  };
  /** `rgba(...)` se MORA stopiti s podlogom prije mjerenja; prozirnost nije boja. */
  const stopi = (value: string, bg: Rgb): Rgb => {
    const m = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/);
    if (!m) return hex(value);
    const a = m[4] === undefined ? 1 : Number(m[4]);
    return [1, 2, 3].map((i) => Math.round(a * Number(m[i]) + (1 - a) * bg[i - 1])) as unknown as Rgb;
  };
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]: Rgb): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const ratio = (a: Rgb, b: Rgb): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const OBRAZAC = /\s*:\s*([^;}]+)/.source;
  const tokenUBloku = (sirovo: string, selektor: string, token: string): string => {
    const css = sirovo.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const od = css.indexOf(selektor);
    expect(od, `selektor ${selektor} nije nadjen`).toBeGreaterThan(-1);
    const blok = css.slice(css.indexOf('{', od), css.indexOf('}', od));
    const m = new RegExp('--' + token + OBRAZAC).exec(blok);
    expect(m, `token --${token} nije nadjen u bloku ${selektor}`).toBeTruthy();
    return m![1].trim();
  };

  const SUSTAV = read('src/shared/design-system.css');
  const TRAKA = read('src/shared/site-chrome.css');
  const TEME: ReadonlyArray<readonly ['dark' | 'light', string]> = [
    ['dark', ':root {'],
    ['light', '[data-theme="light"] {'],
  ];

  it('traka STVARNO koristi mjerene tokene, pa mjerenje nije o tudjim vrijednostima', () => {
    // Sentinel: bez ovoga bi preimenovanje tokena u listu ucinilo sve tvrdnje ispod vakuumskima.
    expect(TRAKA).toContain('color: var(--desk-muted)');
    expect(TRAKA).toContain('color: var(--desk-faint)');
    expect(TRAKA).toContain('color: var(--on-red)');
    expect(TRAKA).toContain('background: var(--red)');
  });

  it.each(TEME)('%s: prigusen i blijed tekst trake prolaze AA na OBJE podloge stola', (_tema, selektor) => {
    const desk = hex(tokenUBloku(SUSTAV, selektor, 'desk'));
    const desk2 = hex(tokenUBloku(SUSTAV, selektor, 'desk-2'));
    for (const ime of ['desk-muted', 'desk-faint'] as const) {
      const sirovo = tokenUBloku(SUSTAV, selektor, ime);
      expect(ratio(stopi(sirovo, desk), desk), `--${ime} na --desk`).toBeGreaterThanOrEqual(AA);
      expect(ratio(stopi(sirovo, desk2), desk2), `--${ime} na --desk-2`).toBeGreaterThanOrEqual(AA);
    }
  });

  it.each(TEME)('%s: pecat "Provjeri rad" (--on-red na --red) prolazi AA', (_tema, selektor) => {
    const red = hex(tokenUBloku(SUSTAV, selektor, 'red'));
    const onRed = hex(tokenUBloku(SUSTAV, selektor, 'on-red'));
    expect(ratio(onRed, red)).toBeGreaterThanOrEqual(AA);
  });

  it('mjedena plocica profila prolazi AA na TAMNIJEM kraju svog gradijenta', () => {
    // Gradijent ide #C9A96A -> #A98649; mjerodavan je tamniji kraj, jer ondje je odnos najlosiji.
    expect(ratio(hex('#26221B'), hex('#A98649'))).toBeGreaterThanOrEqual(AA);
    // KONTROLA SMJERA: mjeri se stvarno TAMNIJI kraj, ne slucajno svjetliji.
    expect(ratio(hex('#26221B'), hex('#A98649'))).toBeLessThan(ratio(hex('#26221B'), hex('#C9A96A')));
  });

  it('MUTACIJA: prozirnost se NE smije preskociti pri mjerenju', () => {
    // `rgba(237,231,220,.72)` citan kao neproziran dao bi 13,5:1 umjesto 8,1:1 na tamnom stolu, pa
    // bi gard prolazio i za ton koji je na ekranu gotovo neciljiv. Mjeri se stopljena vrijednost.
    const desk = hex('#191512');
    const stopljen = stopi('rgba(237, 231, 220, .40)', desk);
    const kaoNeproziran = hex('#EDE7DC');
    expect(ratio(stopljen, desk)).toBeLessThan(ratio(kaoNeproziran, desk));
    // BASELINE: stvarni ton (.72) i dalje prolazi, dakle tvrdnja nije "sve pada".
    expect(ratio(stopi('rgba(237, 231, 220, .72)', desk), desk)).toBeGreaterThanOrEqual(AA);
  });

  /** Interaktivne mete trake; ime je ugovor, pa se popis NE broji nego imenuje. */
  const METE = [
    '.site-chrome__dest',
    '.site-chrome__work',
    '.site-chrome__plate',
    '.site-chrome__stamp',
    '.site-chrome .lampa-btn',
    '.site-chrome__burger',
    '.site-chrome__sheet-item',
    '.site-chrome__sheet-aa',
    '.site-footer__pravno a',
  ] as const;

  /** Cista funkcija nad tekstom lista, pa se smije mutirati. */
  const visinaMete = (css: string, selektor: string): number => {
    const escapiran = selektor.replace(/[.*+?^${}()|[\]\\]/g, (znak) => '\\' + znak);
    const re = new RegExp('(?:^|\\})\\s*' + escapiran + '\\s*\\{([^}]*)\\}', 'm');
    const blok = re.exec(css.replace(/\/\*[\s\S]*?\*\//g, ' '));
    if (!blok) return 0;
    const m = /min-height:\s*(\d+(?:\.\d+)?)px/.exec(blok[1]);
    return m ? Number(m[1]) : 0;
  };

  it.each(METE)('%s ima min-height >= 24px (WCAG 2.5.8)', (selektor) => {
    expect(visinaMete(TRAKA, selektor)).toBeGreaterThanOrEqual(META);
  });

  it('MUTACIJA: izbrisan `min-height` se vidi, i mjeri se TOCAN selektor', () => {
    const bez = TRAKA.replace(/(\.site-chrome__dest \{[^}]*)min-height: 24px;\s*/, '$1');
    expect(bez, 'podmetanje se nije primilo; provjeri oznaku mete').not.toBe(TRAKA);
    expect(visinaMete(bez, '.site-chrome__dest')).toBeLessThan(META);
    // BASELINE i kontrola smjera: nepostojeci selektor daje 0, pa nula NIJE dokaz o postojanju.
    expect(visinaMete(TRAKA, '.site-chrome__dest')).toBeGreaterThanOrEqual(META);
    expect(visinaMete(TRAKA, '.site-chrome__nepostojece')).toBe(0);
  });
});
