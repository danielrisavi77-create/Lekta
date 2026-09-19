/**
 * PANEL "PRILAGODI PRIKAZ" (Z6, design/handoff/ALIGNMENT.md).
 *
 * Tri razine se mjere odvojeno, jer se lako zamijene jedna za drugu:
 *   1. PONASANJE u DOM-u (happy-dom): kontrola -> atribut na `<html>` -> zapis u pohranu.
 *   2. UGOVOR S PRE-PAINT SKRIPTOM: ista pravila zapisana dvaput (modul i inline skripta u
 *      <head>), pa se moraju slagati; razilazenje se vidi kao bljesak, koji nijedan jedinicni
 *      test ne hvata.
 *   3. SPECIFICNOST CSS-a: `page-chrome.css` duplicira primitive pod `html:root`, pa selektor
 *      koji je "ocito dovoljan" tiho gubi. Ovo je izmjereno, ne pretpostavljeno.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ZADANE_POSTAVKE, ZADANO_OSVJETLJENJE, PANEL_ID,
  applyDisplaySettings, applyOsvjetljenje, mountDisplaySettings,
  normalizeDisplaySettings, normalizeOsvjetljenje, readDisplaySettings,
  type DisplaySettingsController,
} from '../src/shared/display-settings';
import { STORAGE_KEYS } from '../src/shared/browser-storage';

const ROOT = resolve(__dirname, '..');
/** Citanje s diska normalizira CR: repo ima `core.autocrlf` (CLAUDE.md). */
const read = (f: string): string => readFileSync(resolve(ROOT, f), 'utf8').replace(/\r/g, '');

const DISPLAY_KEY = STORAGE_KEYS.display;
const THEME_KEY = 'lekta.theme';

function navigacija(): string {
  return '<button class="lampa-btn" id="themeBtn" type="button"></button>'
    + '<button class="lampa-btn" id="displayBtn" type="button" aria-expanded="false"'
    + ' aria-controls="lektaPrikazPanel"></button>';
}

function postavi(html = navigacija()): DisplaySettingsController {
  document.body.innerHTML = html;
  const api = mountDisplaySettings(document);
  expect(api, 'montaza mora uspjeti kad #displayBtn postoji').not.toBeNull();
  return api!;
}

const radio = (ime: string, vrijednost: string): HTMLInputElement => {
  const unos = document.querySelector<HTMLInputElement>(
    `input[name="${ime}"][value="${vrijednost}"]`,
  );
  expect(unos, `nedostaje radio ${ime}=${vrijednost}`).not.toBeNull();
  return unos!;
};

/** Klik korisnika, ne programski `checked`: radio se mijenja `click`om, promjena javlja `change`. */
function izaberi(unos: HTMLInputElement): void {
  unos.checked = true;
  unos.dispatchEvent(new Event('change', { bubbles: true }));
}

function spremljeno(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(DISPLAY_KEY) || 'null') as Record<string, unknown>;
}

let api: DisplaySettingsController | null = null;

beforeEach(() => {
  localStorage.clear();
  for (const atribut of ['data-theme', 'data-reading-font', 'data-text-size', 'data-contrast', 'data-motion']) {
    document.documentElement.removeAttribute(atribut);
  }
});

afterEach(() => {
  api?.dispose();
  api = null;
  document.body.innerHTML = '';
});

describe('Z6 postavke prikaza: normalizacija', () => {
  it('prazna, pokvarena i djelomicna pohrana daju ZADANO, bez iznimke', () => {
    expect(normalizeDisplaySettings(null)).toEqual(ZADANE_POSTAVKE);
    expect(normalizeDisplaySettings('nije objekt')).toEqual(ZADANE_POSTAVKE);
    expect(normalizeDisplaySettings(42)).toEqual(ZADANE_POSTAVKE);
    expect(normalizeDisplaySettings({ readingFont: 'comic', textSize: 'xxl', contrast: 1, motion: [] }))
      .toEqual(ZADANE_POSTAVKE);
    // Djelomican zapis zadrzava ono sto je valjano i dopunjuje ostalo.
    expect(normalizeDisplaySettings({ textSize: 'l' }))
      .toEqual({ ...ZADANE_POSTAVKE, textSize: 'l' });
  });

  it('MUTACIJA: pokvaren JSON u localStorage ne baca nego pada na zadano', () => {
    localStorage.setItem(DISPLAY_KEY, '{ovo nije json');
    expect(() => readDisplaySettings()).not.toThrow();
    expect(readDisplaySettings()).toEqual(ZADANE_POSTAVKE);
    // Kontrola: ispravan zapis se STVARNO cita, inace bi gornja tvrdnja prolazila vakuumski.
    localStorage.setItem(DISPLAY_KEY, JSON.stringify({ ...ZADANE_POSTAVKE, contrast: 'high' }));
    expect(readDisplaySettings().contrast).toBe('high');
  });

  it('osvjetljenje prima tocno tri vrijednosti', () => {
    expect(normalizeOsvjetljenje('light')).toBe('light');
    expect(normalizeOsvjetljenje('system')).toBe('system');
    expect(normalizeOsvjetljenje('sepia')).toBe(ZADANO_OSVJETLJENJE);
    expect(normalizeOsvjetljenje(null)).toBe(ZADANO_OSVJETLJENJE);
  });
});

describe('Z6 postavke prikaza: atributi na <html>', () => {
  it('ZADANA vrijednost UKLANJA atribut, ne upisuje ga', () => {
    applyDisplaySettings(document, { readingFont: 'serif', textSize: 'l', contrast: 'high', motion: 'reduce' });
    applyDisplaySettings(document, ZADANE_POSTAVKE);
    const korijen = document.documentElement;
    for (const atribut of ['data-reading-font', 'data-text-size', 'data-contrast', 'data-motion']) {
      expect(korijen.hasAttribute(atribut), atribut).toBe(false);
    }
  });

  it('`system` UKLANJA data-theme, dark i light ga postavljaju', () => {
    applyOsvjetljenje(document, 'light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    applyOsvjetljenje(document, 'system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    applyOsvjetljenje(document, 'dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

describe('Z6 postavke prikaza: panel', () => {
  it('svaka kontrola postavlja tocan atribut i sprema tocan JSON', () => {
    api = postavi();
    const korijen = document.documentElement;

    izaberi(radio('lektaOsvjetljenje', 'light'));
    expect(korijen.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');

    const pismo = document.getElementById('lektaPismo') as HTMLSelectElement;
    pismo.value = 'dyslexic';
    pismo.dispatchEvent(new Event('change', { bubbles: true }));
    expect(korijen.getAttribute('data-reading-font')).toBe('dyslexic');

    izaberi(radio('lektaVelicina', 'l'));
    expect(korijen.getAttribute('data-text-size')).toBe('l');

    const kontrast = document.getElementById('lektaKontrast') as HTMLInputElement;
    kontrast.checked = true;
    kontrast.dispatchEvent(new Event('change', { bubbles: true }));
    expect(korijen.getAttribute('data-contrast')).toBe('high');

    const pokret = document.getElementById('lektaPokret') as HTMLInputElement;
    pokret.checked = true;
    pokret.dispatchEvent(new Event('change', { bubbles: true }));
    expect(korijen.getAttribute('data-motion')).toBe('reduce');

    // JEDAN JSON, cetiri polja; tema u njemu NE zivi (pre-paint je cita sirovu).
    expect(spremljeno()).toEqual({
      readingFont: 'dyslexic', textSize: 'l', contrast: 'high', motion: 'reduce',
    });
    expect(Object.keys(spremljeno())).not.toContain('theme');
  });

  it('ponovna inicijalizacija iz pohrane vraca atribute i stanje kontrola', () => {
    localStorage.setItem(THEME_KEY, 'system');
    localStorage.setItem(DISPLAY_KEY, JSON.stringify({
      readingFont: 'sans', textSize: 's', contrast: 'high', motion: 'auto',
    }));
    api = postavi();
    const korijen = document.documentElement;
    expect(korijen.hasAttribute('data-theme'), '`system` ne smije upisati atribut').toBe(false);
    expect(korijen.getAttribute('data-reading-font')).toBe('sans');
    expect(korijen.getAttribute('data-text-size')).toBe('s');
    expect(korijen.getAttribute('data-contrast')).toBe('high');
    expect(korijen.hasAttribute('data-motion')).toBe(false);
    // Sucelje pokazuje STANJE, ne zadnji klik.
    expect(radio('lektaOsvjetljenje', 'system').checked).toBe(true);
    expect(radio('lektaVelicina', 's').checked).toBe(true);
    expect((document.getElementById('lektaPismo') as HTMLSelectElement).value).toBe('sans');
    expect((document.getElementById('lektaKontrast') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('lektaPokret') as HTMLInputElement).checked).toBe(false);
  });

  it('klik na #themeBtn mijenja temu I sinkronizira radio u panelu', () => {
    api = postavi();
    expect(radio('lektaOsvjetljenje', 'dark').checked).toBe(true);
    const lampa = document.getElementById('themeBtn') as HTMLButtonElement;
    lampa.click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(radio('lektaOsvjetljenje', 'light').checked).toBe(true);
    expect(radio('lektaOsvjetljenje', 'dark').checked).toBe(false);
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    lampa.click();
    expect(radio('lektaOsvjetljenje', 'dark').checked).toBe(true);
  });

  it('iz `system` lampa vodi u SUPROTNO od onoga sto je na ekranu, ne u tisinu', () => {
    localStorage.setItem(THEME_KEY, 'system');
    api = postavi();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    (document.getElementById('themeBtn') as HTMLButtonElement).click();
    // Bez atributa ekran je tamna tema (zadano), pa prvi klik mora dati svjetlo.
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('gumb otvara i zatvara; Escape zatvara i VRACA fokus na gumb', () => {
    api = postavi();
    const gumb = document.getElementById('displayBtn') as HTMLButtonElement;
    const panel = document.getElementById(PANEL_ID) as HTMLElement;
    expect(panel.hidden).toBe(true);

    gumb.click();
    expect(panel.hidden).toBe(false);
    expect(gumb.getAttribute('aria-expanded')).toBe('true');
    expect(panel.contains(document.activeElement), 'fokus mora uci u panel').toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel.hidden).toBe(true);
    expect(gumb.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(gumb);

    // Escape nad ZATVORENIM panelom ne smije nista raditi (inace krade tudji Escape).
    const prije = document.activeElement;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.activeElement).toBe(prije);
  });

  it('PANEL NIJE MODAL: pozadina ostaje interaktivna', () => {
    api = postavi(navigacija() + '<button id="pozadina" type="button"></button>');
    (document.getElementById('displayBtn') as HTMLButtonElement).click();
    const pozadina = document.getElementById('pozadina') as HTMLButtonElement;
    expect(pozadina.inert).toBeFalsy();
    let kliknut = false;
    pozadina.addEventListener('click', () => { kliknut = true; });
    pozadina.click();
    expect(kliknut).toBe(true);
    expect(document.body.style.overflow).toBe('');
  });

  it('"Vrati zadano" vraca i cetiri polja i osvjetljenje', () => {
    localStorage.setItem(THEME_KEY, 'light');
    localStorage.setItem(DISPLAY_KEY, JSON.stringify({
      readingFont: 'dyslexic', textSize: 'l', contrast: 'high', motion: 'reduce',
    }));
    api = postavi();
    (document.querySelector('.ps__reset') as HTMLButtonElement).click();
    expect(document.documentElement.getAttribute('data-theme')).toBe(ZADANO_OSVJETLJENJE);
    for (const atribut of ['data-reading-font', 'data-text-size', 'data-contrast', 'data-motion']) {
      expect(document.documentElement.hasAttribute(atribut), atribut).toBe(false);
    }
    expect(spremljeno()).toEqual(ZADANE_POSTAVKE);
  });

  it('bez #displayBtn se ne montira nista: nema <aside> koji se ne moze otvoriti', () => {
    document.body.innerHTML = '<button id="themeBtn" type="button"></button>';
    expect(mountDisplaySettings(document)).toBeNull();
    expect(document.getElementById(PANEL_ID)).toBeNull();
  });

  it('dispose cisti panel, atribute gumba i oznaku preuzimanja lampe', () => {
    const kontroler = postavi();
    const lampa = document.getElementById('themeBtn') as HTMLButtonElement;
    expect(lampa.dataset.themeOwner).toBe('display-settings');
    kontroler.dispose();
    expect(document.getElementById(PANEL_ID)).toBeNull();
    expect(lampa.dataset.themeOwner).toBeUndefined();
    expect(document.getElementById('displayBtn')!.hasAttribute('aria-controls')).toBe(false);
  });
});

describe('Z6 ugovor s pre-paint skriptom i CSS-om', () => {
  const INDEX = read('index.html');
  const RAD = read('rad/index.html');
  const CSS = read('src/shared/display-settings.css');
  const SUSTAV = read('src/shared/design-system.css');
  const CHROME = read('src/shared/page-chrome.css');
  const inline = (html: string): string => (
    html.match(/<script(?![^>]*\bsrc=)(?![^>]*type="application)[^>]*>[\s\S]*?<\/script>/)?.[0] ?? ''
  );

  it('inline skripta je ista na obje stranice i razumije `system` i sva cetiri polja', () => {
    const skripta = inline(INDEX);
    expect(skripta, 'ulaz mora imati pre-paint skriptu').not.toBe('');
    expect(inline(RAD)).toBe(skripta);
    expect(skripta).toContain("_t!=='system'");
    for (const polje of ['readingFont', 'textSize', 'contrast', 'motion']) {
      expect(skripta, `pre-paint ne primjenjuje ${polje}, pa ce ta postavka bljesnuti`).toContain(polje);
    }
    expect(skripta).toContain("localStorage.getItem('lekta.display')");
  });

  it('obje stranice nose gumb #displayBtn uz #themeBtn', () => {
    for (const [ime, html] of [['index', INDEX], ['rad', RAD]] as const) {
      expect(html, ime).toContain('id="displayBtn"');
      expect(html, ime).toContain('id="themeBtn"');
      expect(html, ime).toContain('aria-controls="lektaPrikazPanel"');
      expect(html, ime).toContain('data-lucide="sliders-horizontal"');
    }
    // ID mora odgovarati onome sto modul stvarno stvara; inace aria-controls pokazuje u prazno.
    expect(PANEL_ID).toBe('lektaPrikazPanel');
  });

  it('CSS nosi ucinak svake kontrole, a nijedna ne uvodi novu boju marke', () => {
    for (const pravilo of [
      'data-reading-font="serif"', 'data-reading-font="sans"', 'data-reading-font="dyslexic"',
      'data-text-size="s"', 'data-text-size="l"', 'data-contrast="high"', 'data-motion="reduce"',
    ]) {
      expect(CSS, `nedostaje ucinak za ${pravilo}`).toContain(pravilo);
    }
    expect(CSS).toContain('font-size: 15px');
    expect(CSS).toContain('font-size: 18px');
    expect(CSS).toContain('--paper-muted: #4A4438');
    expect(CSS).toContain('--desk-muted: var(--desk-ink)');
    expect(CSS).toContain('--paper-line: #B8AE96');
    // GUSTOCA SE NE NUDI (mjerenje Z4): kontrola bez `--space-*` tokena ne bi mijenjala nista.
    expect(CSS).not.toContain('data-density');
    // Crvena je jedini akcent: panel ne smije uvesti nijednu novu boju marke.
    const heksovi = new Set(Array.from(CSS.matchAll(/#[0-9A-Fa-f]{6}/g), (m) => m[0].toUpperCase()));
    expect([...heksovi].sort(), 'panel smije nositi samo dva izmjerena tona kontrasta').toEqual(['#4A4438', '#B8AE96']);
  });

  it('pismo za disleksiju NE ucitava webfont, a lanac zavrsava na ucitanom glasu', () => {
    expect(CSS).not.toMatch(/@font-face|@import|https?:/);
    const m = /data-reading-font="dyslexic"\][^{]*\{([^}]*)\}/.exec(CSS);
    expect(m, 'nedostaje pravilo za disleksiju').not.toBeNull();
    expect(m![1]).toContain('"OpenDyslexic"');
    // Kraj lanca je `var(--ui)`, obitelj koju proizvod STVARNO ucitava. Bez toga bi neinstalirano
    // pismo palo na sustavni fallback, sto je upravo kvar zbog kojeg postoji tests/entry-fonts.
    expect(m![1].trim().endsWith('var(--ui);')).toBe(true);
  });

  it('SPECIFICNOST: grana `prefers-color-scheme` tuce duplicirane primitive iz page-chrome.css', () => {
    // IZMJERENO, NE PRETPOSTAVLJENO: `page-chrome.css` namjerno duplicira primitive pod `html:root`
    // da tuce bundle `:root`. Goli `:root:not([data-theme])` ima ISTU specificnost (0,2,0), pa bi
    // odlucio redoslijed ucitavanja, a page-chrome.css dolazi poslije: "kao sustav" bi tiho ostao
    // taman. Ovaj gard mjeri tocno tu razliku.
    expect(CHROME, 'page-chrome.css vise ne duplicira primitive; provjeri je li gard jos potreban')
      .toContain('html:root{');
    const grana = /@media \(prefers-color-scheme: light\) \{\s*([^{]+)\{/.exec(SUSTAV);
    expect(grana, 'design-system.css nema granu za `prefers-color-scheme: light`').not.toBeNull();
    const selektor = grana![1].trim();
    expect(selektor).toBe('html:root:not([data-theme])');
    // Grana mora nositi vrijednosti danjeg svjetla, ne biti prazna ljuska.
    const blok = SUSTAV.slice(SUSTAV.indexOf(selektor));
    expect(blok).toContain('--paper: #FDFBF3');
    expect(blok).toContain('--desk: #DFD8C6');
  });

  it('modul NE ulazi u route-shell: panel je oprema `/` i `/rad/`, ne dijeljene ljuske', () => {
    const shell = read('src/routes/shared/route-shell.ts');
    expect(shell).not.toContain('display-settings');
    // Panel ondje ne zivi, ali `system` mora vrijediti i na rutama koje ga nemaju: inace izbor
    // napravljen na `/` izgleda pokvaren cim korisnik ode na `/saznaj-vise/`.
    expect(shell).toContain("storedTheme() !== 'system'");
    for (const ulaz of ['src/routes/intake/main.ts', 'src/routes/workspace/main.ts']) {
      expect(read(ulaz), ulaz).toContain('mountDisplaySettings(document)');
    }
  });

  it('ui-boot ustupa #themeBtn panelu i postuje `system`', () => {
    const boot = read('src/shared/ui-boot.ts');
    expect(boot).toContain('btn.dataset.themeOwner');
    expect(boot).toContain("spremljenaTema !== 'system'");
  });
});
