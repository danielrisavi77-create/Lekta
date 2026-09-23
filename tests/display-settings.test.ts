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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ZADANE_POSTAVKE, ZADANO_OSVJETLJENJE, PANEL_ID,
  applyDisplaySettings, applyOsvjetljenje, mountDisplaySettings,
  normalizeDisplaySettings, normalizeOsvjetljenje, readDisplaySettings,
  type DisplaySettingsController,
} from '../src/shared/display-settings';
import { STORAGE_KEYS } from '../src/shared/browser-storage';
import { pokretPrigusen, suprotnaTema, tamnoNaEkranu } from '../src/shared/display-prefs';
import { playIntakeEntry } from '../src/routes/intake/intake-motion';
import { initAnalyzerApp } from '../src/ui/app';

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

/**
 * SUSTAVNA PREFERENCIJA SE PODMECE, NE PRETPOSTAVLJA.
 *
 * Izmjereno: happy-dom prijavljuje `prefers-color-scheme: light` (dark = false), a raniji test je
 * u komentaru tvrdio suprotno ("bez atributa ekran je tamna tema") i svejedno bio zelen, jer kod
 * `matchMedia` uopce nije pitao. Test koji ovisi o tvornickoj postavci okoline mjeri okolinu, ne
 * proizvod, pa se obje grane ovdje postavljaju izricito.
 */
function podmetniSustav(preferencije: Record<string, boolean>): () => void {
  const prozor = window as unknown as { matchMedia?: unknown };
  const izvorni = prozor.matchMedia;
  prozor.matchMedia = (upit: string) => ({
    matches: preferencije[upit] === true,
    media: upit,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  });
  return () => { prozor.matchMedia = izvorni; };
}

const SUSTAV_TAMAN = { '(prefers-color-scheme: dark)': true };
const SUSTAV_SVIJETAO = { '(prefers-color-scheme: dark)': false };

let api: DisplaySettingsController | null = null;
let vratiSustav: (() => void) | null = null;

beforeEach(() => {
  localStorage.clear();
  for (const atribut of ['data-theme', 'data-reading-font', 'data-contrast', 'data-motion']) {
    document.documentElement.removeAttribute(atribut);
  }
});

afterEach(() => {
  api?.dispose();
  api = null;
  vratiSustav?.();
  vratiSustav = null;
  document.body.innerHTML = '';
});

describe('Z6 postavke prikaza: normalizacija', () => {
  it('prazna, pokvarena i djelomicna pohrana daju ZADANO, bez iznimke', () => {
    expect(normalizeDisplaySettings(null)).toEqual(ZADANE_POSTAVKE);
    expect(normalizeDisplaySettings('nije objekt')).toEqual(ZADANE_POSTAVKE);
    expect(normalizeDisplaySettings(42)).toEqual(ZADANE_POSTAVKE);
    expect(normalizeDisplaySettings({ readingFont: 'comic', contrast: 1, motion: [] }))
      .toEqual(ZADANE_POSTAVKE);
  });

  // Z7: kontrola "Velicina teksta" je uklonjena. STARI zapis koji jos nosi `textSize` (od
  // korisnika koji ga je izabrao prije uklanjanja) mora tiho proci: bez iznimke i bez tog polja
  // u normaliziranom rezultatu, jer normalizeDisplaySettings ga vise ne cita.
  it('stari zapis s `textSize` se IGNORIRA: ne baca i ne ostavlja polje u rezultatu', () => {
    expect(normalizeDisplaySettings({ textSize: 'l' })).toEqual(ZADANE_POSTAVKE);
    expect(normalizeDisplaySettings({ textSize: 'l' })).not.toHaveProperty('textSize');
    expect(() => normalizeDisplaySettings({ textSize: 'l' })).not.toThrow();
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
    applyDisplaySettings(document, { readingFont: 'serif', contrast: 'high', motion: 'reduce' });
    applyDisplaySettings(document, ZADANE_POSTAVKE);
    const korijen = document.documentElement;
    for (const atribut of ['data-reading-font', 'data-contrast', 'data-motion']) {
      expect(korijen.hasAttribute(atribut), atribut).toBe(false);
    }
    // Kontrola je uklonjena: `applyDisplaySettings` vise ne smije postaviti `data-text-size`.
    expect(korijen.hasAttribute('data-text-size')).toBe(false);
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

    const kontrast = document.getElementById('lektaKontrast') as HTMLInputElement;
    kontrast.checked = true;
    kontrast.dispatchEvent(new Event('change', { bubbles: true }));
    expect(korijen.getAttribute('data-contrast')).toBe('high');

    const pokret = document.getElementById('lektaPokret') as HTMLInputElement;
    pokret.checked = true;
    pokret.dispatchEvent(new Event('change', { bubbles: true }));
    expect(korijen.getAttribute('data-motion')).toBe('reduce');

    // JEDAN JSON, tri polja; tema u njemu NE zivi (pre-paint je cita sirovu).
    expect(spremljeno()).toEqual({
      readingFont: 'dyslexic', contrast: 'high', motion: 'reduce',
    });
    expect(Object.keys(spremljeno())).not.toContain('theme');
    expect(Object.keys(spremljeno())).not.toContain('textSize');
  });

  it('kontrola "Velicina teksta" je uklonjena: nema radio grupe lektaVelicina u panelu', () => {
    api = postavi();
    expect(document.querySelector('input[name="lektaVelicina"]')).toBeNull();
    expect(document.getElementById('lektaVelicina')).toBeNull();
  });

  it('ponovna inicijalizacija iz pohrane vraca atribute i stanje kontrola', () => {
    localStorage.setItem(THEME_KEY, 'system');
    localStorage.setItem(DISPLAY_KEY, JSON.stringify({
      readingFont: 'sans', contrast: 'high', motion: 'auto',
    }));
    api = postavi();
    const korijen = document.documentElement;
    expect(korijen.hasAttribute('data-theme'), '`system` ne smije upisati atribut').toBe(false);
    expect(korijen.getAttribute('data-reading-font')).toBe('sans');
    expect(korijen.getAttribute('data-contrast')).toBe('high');
    expect(korijen.hasAttribute('data-motion')).toBe(false);
    // Sucelje pokazuje STANJE, ne zadnji klik.
    expect(radio('lektaOsvjetljenje', 'system').checked).toBe(true);
    expect((document.getElementById('lektaPismo') as HTMLSelectElement).value).toBe('sans');
    expect((document.getElementById('lektaKontrast') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('lektaPokret') as HTMLInputElement).checked).toBe(false);
  });

  it('stari zapis s `textSize` u pohrani ne baca i ne postavlja `data-text-size` pri montazi', () => {
    localStorage.setItem(DISPLAY_KEY, JSON.stringify({
      readingFont: 'default', textSize: 'l', contrast: 'normal', motion: 'auto',
    }));
    expect(() => { api = postavi(); }).not.toThrow();
    expect(document.documentElement.hasAttribute('data-text-size')).toBe(false);
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

  // IZ `system` LAMPA MORA GLEDATI EKRAN, NE ATRIBUT. Ranija izvedba je racunala iz `data-theme`,
  // kojeg u `system` nema, pa je uvijek tvrdila tamno: uz svijetli sustav je javljala "Lampa:
  // ugasi" nad upaljenom lampom, a prvi klik je vodio u `light`, dakle u ono sto je vec na ekranu.
  // Obje grane se mjere, jer je kvar vidljiv samo u jednoj.
  it('iz `system` uz TAMAN sustav: stanje je tamno, prvi klik pali danje svjetlo', () => {
    vratiSustav = podmetniSustav(SUSTAV_TAMAN);
    localStorage.setItem(THEME_KEY, 'system');
    api = postavi();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    const lampa = document.getElementById('themeBtn') as HTMLButtonElement;
    expect(lampa.getAttribute('aria-pressed')).toBe('true');
    expect(lampa.getAttribute('aria-label')).toBe('Lampa: ugasi');
    lampa.click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('iz `system` uz SVIJETAO sustav: stanje je svijetlo, prvi klik pali lampu', () => {
    vratiSustav = podmetniSustav(SUSTAV_SVIJETAO);
    localStorage.setItem(THEME_KEY, 'system');
    api = postavi();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    const lampa = document.getElementById('themeBtn') as HTMLButtonElement;
    expect(lampa.getAttribute('aria-pressed')).toBe('false');
    expect(lampa.getAttribute('aria-label')).toBe('Lampa: upali');
    expect(lampa.getAttribute('title')).toBe('Upali radnu lampu');
    lampa.click();
    // Kljucna tvrdnja: NE `light`. Klik koji vodi u vrijednost koja je vec na ekranu je tisina.
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(radio('lektaOsvjetljenje', 'dark').checked).toBe(true);
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
      readingFont: 'dyslexic', contrast: 'high', motion: 'reduce',
    }));
    api = postavi();
    (document.querySelector('.ps__reset') as HTMLButtonElement).click();
    expect(document.documentElement.getAttribute('data-theme')).toBe(ZADANO_OSVJETLJENJE);
    for (const atribut of ['data-reading-font', 'data-contrast', 'data-motion']) {
      expect(document.documentElement.hasAttribute(atribut), atribut).toBe(false);
    }
    expect(spremljeno()).toEqual(ZADANE_POSTAVKE);
  });

  it('bez IJEDNOG otvaraca se ne montira nista: nema <aside> koji se ne moze otvoriti', () => {
    document.body.innerHTML = '<button id="themeBtn" type="button"></button>';
    expect(mountDisplaySettings(document)).toBeNull();
    expect(document.getElementById(PANEL_ID)).toBeNull();
  });

  /**
   * F10 (odluka 2026-09-23): PANEL IMA DVA OTVARACA, `#displayBtn` I `[data-display-open]`.
   *
   * Gumb "Aa i Prikaz" u mobilnom listu je do F10 bio POSREDNIK koji je klik proslijedivao na
   * `#displayBtn`, jer je panel zivio samo na `/` i `/rad/`. Sada je otvarac kao i traka; drugi
   * `id` pritom NE dobiva, jer dva elementa s istim `id` ostaju nevaljan HTML.
   */
  it('otvarac iz mobilnog lista otvara ISTI panel, bez drugog #displayBtn', () => {
    api = postavi(navigacija() + '<button type="button" data-display-open>Aa</button>');
    const panel = document.getElementById(PANEL_ID)!;
    const list = document.querySelector<HTMLElement>('[data-display-open]')!;
    expect(panel.hidden, 'panel je zatvoren do prvog klika').toBe(true);
    list.click();
    expect(panel.hidden).toBe(false);
    // JEDAN panel, ne dva: otvarac ga otvara, ne stvara vlastiti.
    expect(document.querySelectorAll(`#${PANEL_ID}`)).toHaveLength(1);
    expect(document.querySelectorAll('#displayBtn')).toHaveLength(1);
    list.click();
    expect(panel.hidden, 'drugi klik zatvara, kao i na gumbu u traci').toBe(true);
  });

  it('OBA otvaraca nose aria-expanded i aria-controls, i oba prate stanje panela', () => {
    api = postavi(navigacija() + '<button type="button" data-display-open>Aa</button>');
    const traka = document.getElementById('displayBtn')!;
    const list = document.querySelector<HTMLElement>('[data-display-open]')!;
    for (const el of [traka, list]) {
      expect(el.getAttribute('aria-controls'), 'otvarac mora reci sto kontrolira').toBe(PANEL_ID);
      expect(el.getAttribute('aria-expanded')).toBe('false');
    }
    // Stanje je JEDNO, pa ga oba moraju prijaviti: citac ekrana inace na jednom od njih laze.
    list.click();
    expect(traka.getAttribute('aria-expanded')).toBe('true');
    expect(list.getAttribute('aria-expanded')).toBe('true');
    api.close();
    expect(traka.getAttribute('aria-expanded')).toBe('false');
    expect(list.getAttribute('aria-expanded')).toBe('false');
  });

  it('Esc vraca fokus na otvarac KOJI JE PANEL OTVORIO, ne uvijek na gumb u traci', () => {
    // Na mobitelu je `#displayBtn` skriven (`display: none` pod 820px u site-chrome.css), pa bi
    // fiksno vracanje fokusa ondje korisnika ostavilo na nefokusabilnom elementu.
    api = postavi(navigacija() + '<button type="button" data-display-open>Aa</button>');
    const list = document.querySelector<HTMLElement>('[data-display-open]')!;
    list.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById(PANEL_ID)!.hidden).toBe(true);
    expect(document.activeElement, 'fokus se nije vratio na otvarac iz lista').toBe(list);
  });

  it('BASELINE: otvaranje iz trake vraca fokus u traku, pa tvrdnja iznad nije vakuumska', () => {
    api = postavi(navigacija() + '<button type="button" data-display-open>Aa</button>');
    const traka = document.getElementById('displayBtn')!;
    traka.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.activeElement).toBe(traka);
  });

  it('dispose cisti atribute SVIH otvaraca, ne samo prvog', () => {
    const kontroler = postavi(navigacija() + '<button type="button" data-display-open>Aa</button>');
    const list = document.querySelector<HTMLElement>('[data-display-open]')!;
    // BASELINE: prije dispose-a atribut stoji.
    expect(list.hasAttribute('aria-controls')).toBe(true);
    kontroler.dispose();
    expect(list.hasAttribute('aria-controls')).toBe(false);
    expect(list.hasAttribute('aria-expanded')).toBe(false);
    expect(document.getElementById('displayBtn')!.hasAttribute('aria-controls')).toBe(false);
  });

  it('panel radi i kad na stranici stoji SAMO otvarac iz lista (bez #displayBtn)', () => {
    // Nije danasnji markup, ali je ugovor funkcije: otvarac je otvarac, bez obzira koji.
    document.body.innerHTML = '<button id="themeBtn" type="button"></button>'
      + '<button type="button" data-display-open>Aa</button>';
    const kontroler = mountDisplaySettings(document);
    expect(kontroler, 'otvarac postoji, pa montaza ne smije vratiti null').not.toBeNull();
    api = kontroler!;
    document.querySelector<HTMLElement>('[data-display-open]')!.click();
    expect(document.getElementById(PANEL_ID)!.hidden).toBe(false);
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
    for (const polje of ['readingFont', 'contrast', 'motion']) {
      expect(skripta, `pre-paint ne primjenjuje ${polje}, pa ce ta postavka bljesnuti`).toContain(polje);
    }
    expect(skripta).toContain("localStorage.getItem('lekta.display')");
    // Kontrola je uklonjena (Z7 pregled): pre-paint vise NE smije ni citati ni primjenjivati `textSize`.
    expect(skripta).not.toContain('textSize');
  });

  /**
   * PRE-PAINT SE IZVRSAVA, NE CITA.
   *
   * Do sada je ugovor bio mjeren tvrdnjama nad TEKSTOM skripte (`toContain`), a tekst ne kaze sto
   * skripta RADI. Bljesak svijetle teme je tocno kvar koji tekstualna tvrdnja ne vidi: skripta je
   * sadrzavala `_t!=='system'` i prolazila, a novom posjetitelju bez `lekta.theme` nije postavljala
   * NISTA, pa je do prvog kadra vrijedila `@media (prefers-color-scheme: light)` grana i stranica
   * je bljesnula svijetlo prije nego je `ui-boot` upisao tamnu temu.
   *
   * `document` se podmece kao objekt s jednim svojstvom, jer skripta iz njega cita tocno jedno
   * (`documentElement`); `localStorage` je obicna mapa. Time test mjeri SKRIPTU, ne okolinu.
   */
  interface Stanje { theme: string | null; readingFont: string | null; contrast: string | null; motion: string | null }

  const tijeloSkripte = (html: string): string => {
    const m = /<script>([\s\S]*?)<\/script>/.exec(html);
    expect(m, 'stranica nema inline pre-paint skriptu').not.toBeNull();
    return m![1];
  };

  const izvrsiPrePaint = (tijelo: string, pohrana: Record<string, string>): Stanje => {
    const doc = document.implementation.createHTMLDocument('pre-paint');
    const korijen = doc.documentElement;
    const lager = { getItem: (k: string) => (Object.prototype.hasOwnProperty.call(pohrana, k) ? pohrana[k] : null) };
    // eslint-disable-next-line no-new-func
    new Function('document', 'localStorage', tijelo)({ documentElement: korijen }, lager);
    return {
      theme: korijen.getAttribute('data-theme'),
      readingFont: korijen.getAttribute('data-reading-font'),
      contrast: korijen.getAttribute('data-contrast'),
      motion: korijen.getAttribute('data-motion'),
    };
  };

  /**
   * TRI PREKRSAJA IZUZECA ZA admin.html, mjerena IZVODJENJEM (pregled Z7, 2026-09-20).
   *
   * Do sada je izuzece cuvala tvrdnja `not.toContain("||'dark'")`, dakle doslovan niz. Niz nije
   * ponasanje: ista bi se tema nametnula napisana kao `_t || "dark"`, kroz ternarni izraz ili iz
   * druge varijable, a gard bi ostao zelen. Skripta se zato POKRECE, kao i ostale ovdje.
   *
   * Vraca IMENOVAN popis, ne zastavicu, da se vidi KOJI je ugovor pao.
   */
  const prekrsajiIzuzeca = (tijelo: string): string[] => {
    const nalazi: string[] = [];
    const izvrsiSPracenjem = (pohrana: Record<string, string>) => {
      const citano: string[] = [];
      const doc = document.implementation.createHTMLDocument('pre-paint');
      const korijen = doc.documentElement;
      const lager = {
        getItem: (k: string) => {
          citano.push(k);
          return Object.prototype.hasOwnProperty.call(pohrana, k) ? pohrana[k] : null;
        },
      };
      // eslint-disable-next-line no-new-func
      new Function('document', 'localStorage', tijelo)({ documentElement: korijen }, lager);
      const atributi = [...korijen.attributes].map((a) => a.name).filter((ime) => ime.startsWith('data-'));
      return { citano, atributi, theme: korijen.getAttribute('data-theme') };
    };
    const prazno = izvrsiSPracenjem({});
    if (prazno.theme !== null) nalazi.push(`nametnuta tema na praznoj pohrani: ${prazno.theme}`);
    const pun = izvrsiSPracenjem({
      'lekta.display': JSON.stringify({ readingFont: 'serif', contrast: 'high', motion: 'reduce' }),
    });
    if (pun.citano.includes('lekta.display')) nalazi.push('cita lekta.display');
    const prikaz = pun.atributi.filter((ime) => ime !== 'data-theme');
    if (prikaz.length) nalazi.push(`upisuje atribute prikaza: ${prikaz.join(', ')}`);
    return nalazi;
  };

  it('PRAZNA POHRANA daje `data-theme="dark"`, dakle nema bljeska svijetle teme', () => {
    // Zadano proizvoda je TAMNO (design/README.md: lampa je zadano, dan se pali rucno), pa
    // sustavna grana NE smije vrijediti za posjetitelja koji nije nista izabrao.
    expect(izvrsiPrePaint(tijeloSkripte(INDEX), {}).theme).toBe('dark');
    expect(izvrsiPrePaint(tijeloSkripte(RAD), {}).theme).toBe('dark');
  });

  it('`system` ostavlja `<html>` BEZ atributa, `light` i `dark` ga postavljaju', () => {
    const tijelo = tijeloSkripte(INDEX);
    expect(izvrsiPrePaint(tijelo, { 'lekta.theme': 'system' }).theme).toBeNull();
    expect(izvrsiPrePaint(tijelo, { 'lekta.theme': 'light' }).theme).toBe('light');
    expect(izvrsiPrePaint(tijelo, { 'lekta.theme': 'dark' }).theme).toBe('dark');
  });

  it('tri polja prikaza se primjenjuju, a zadane vrijednosti NE ostavljaju trag', () => {
    const tijelo = tijeloSkripte(INDEX);
    const pun = izvrsiPrePaint(tijelo, {
      'lekta.theme': 'light',
      'lekta.display': JSON.stringify({ readingFont: 'serif', contrast: 'high', motion: 'reduce' }),
    });
    expect(pun).toEqual({ theme: 'light', readingFont: 'serif', contrast: 'high', motion: 'reduce' });
    const zadano = izvrsiPrePaint(tijelo, {
      'lekta.display': JSON.stringify({ readingFont: 'default', contrast: 'normal', motion: 'auto' }),
    });
    expect(zadano).toEqual({ theme: 'dark', readingFont: null, contrast: null, motion: null });
  });

  it('stari zapis s `textSize` u pre-paintu se ignorira: nema `data-text-size` na `<html>`', () => {
    const tijelo = tijeloSkripte(INDEX);
    const pun = izvrsiPrePaint(tijelo, {
      'lekta.display': JSON.stringify({ readingFont: 'serif', textSize: 'l', contrast: 'high', motion: 'reduce' }),
    });
    expect(pun).toEqual({ theme: 'dark', readingFont: 'serif', contrast: 'high', motion: 'reduce' });
    expect((pun as Record<string, unknown>).textSize).toBeUndefined();
  });

  it('pokvaren `lekta.display` ne ostavlja stranicu bez teme', () => {
    // Pohrana je tudji prostor; pad u pre-paint skripti znaci stranicu bez ijednog atributa.
    expect(izvrsiPrePaint(tijeloSkripte(INDEX), { 'lekta.display': '{nije json' }).theme).toBe('dark');
  });

  it('MUTACIJA: stara skripta (bez zadanog `dark`) pada na praznoj pohrani', () => {
    // Doslovno tijelo skripte prije ovog popravka. Ako novi gard ne bi grizao, i ovo bi prolazilo.
    const staro = "try{var _e=document.documentElement,_t=localStorage.getItem('lekta.theme');"
      + "if(_t&&_t!=='system')_e.dataset.theme=_t;}catch(e){}";
    expect(izvrsiPrePaint(staro, {}).theme).toBeNull();
    expect(izvrsiPrePaint(tijeloSkripte(INDEX), {}).theme).toBe('dark');
    // Kontrola smjera: mutacija se razlikuje SAMO u tom jednom slucaju, ne u svima.
    expect(izvrsiPrePaint(staro, { 'lekta.theme': 'light' }).theme).toBe('light');
  });

  it('SVE stranice PROIZVODA s pre-paint skriptom nose bajt-identicnu skriptu', () => {
    // Jedan CSP sha256 pokriva cijelu ovu skupinu (public/_headers); razilazenje na bilo kojoj
    // stranici znaci da preglednik ondje blokira skriptu, dakle bljesak na tocno toj ruti.
    // admin.html NIJE u ovom popisu: vidi tvrdnju odmah ispod (vlastiti sustav teme).
    const stranice = [
      'index.html', 'rad/index.html', 'moji-radovi/index.html', 'saznaj-vise/index.html',
      'alati.html', 'citat.html', 'citati-i-literatura.html', 'izjava.html',
      'kartice.html', 'landing_benchmark.html', 'landing_usporedba.html', 'literatura.html',
      'naslovnica.html',
    ];
    const kanon = tijeloSkripte(INDEX);
    for (const put of stranice) expect(tijeloSkripte(read(put)), put).toBe(kanon);
    expect(stranice.length, 'popis stranica se suzio; provjeri je li ruta izgubila pre-paint').toBe(13);
    expect(stranice, 'admin.html ima VLASTITI sustav teme, ne smije se vratiti u ovaj popis')
      .not.toContain('admin.html');
  });

  // Z7: kontrola "Velicina teksta" je uklonjena. Ni pre-paint (sve stranice iznad + admin.html) ni
  // GENERATORI koji tu skriptu ugradjuju u staticke stranice (`scripts/generate-*.mjs`) vise ne
  // smiju spominjati `textSize`/`data-text-size`, jer bi svaka novogenerirana stranica inace i
  // dalje nosila ukinutu kontrolu.
  it('NIJEDAN HTML u repou ni generator vise ne sadrzi `data-text-size`/`textSize` u pre-paintu', () => {
    const stranice = [
      'index.html', 'rad/index.html', 'moji-radovi/index.html', 'saznaj-vise/index.html',
      'alati.html', 'citat.html', 'citati-i-literatura.html', 'izjava.html',
      'kartice.html', 'landing_benchmark.html', 'landing_usporedba.html', 'literatura.html',
      'naslovnica.html', 'admin.html',
    ];
    const generatori = [
      'scripts/generate-faculty-pages.mjs', 'scripts/generate-title-page-tools.mjs',
      'scripts/generate-competitor-pages.mjs', 'scripts/generate-citation-tools.mjs',
    ];
    for (const put of [...stranice, ...generatori]) {
      const sadrzaj = read(put);
      expect(sadrzaj, `${put} spominje textSize`).not.toContain('textSize');
      expect(sadrzaj, `${put} spominje data-text-size`).not.toContain('data-text-size');
    }
  });

  /**
   * ADMIN.HTML JE IZUZET, I TO SE MJERI NAD NJEGOVIM SADRZAJEM (pregled Z6, 2026-09-20).
   *
   * Control Center ima vlastiti sustav teme (`src/admin/admin-theme.ts` + `admin-dashboard.css`):
   * bazni `:root` je SVIJETAO, tamno se pali pod `prefers-color-scheme:dark` i pod
   * `[data-theme="dark"]`. Stranica namjerno ne uvozi ni `ui-boot` ni `display-settings.css`.
   *
   * Prosirena skripta ostalih ruta radi tocno dvije stvari koje toj stranici smetaju: bezuvjetno
   * upisuje `data-theme="dark"` (pa prilagodba sustavu prestaje postojati, i onaj tko koristi
   * svijetli OS dobiva tamni Control Center) i upisuje cetiri `data-` atributa prikaza koje ondje
   * nijedan list ne cita. Gard je zato nad ODSUTNOSCU oba obrasca, imenovano, a ne nad duljinom
   * skripte: kratka skripta koja opet nosi zadani `dark` bila bi isti kvar.
   */
  it('admin.html NE nosi prosireni pre-paint: mjereno IZVODJENJEM, ne tekstom', () => {
    const admin = read('admin.html');
    const tijelo = tijeloSkripte(admin);
    expect(tijelo, 'admin.html mora imati vlastitu pre-paint skriptu').not.toBe('');
    expect(prekrsajiIzuzeca(tijelo)).toEqual([]);
    // KONTROLA SMJERA: izuzece nije "obrisi sve". Izricit izbor i dalje vrijedi, u oba smjera.
    expect(izvrsiPrePaint(tijelo, { 'lekta.theme': 'dark' }).theme).toBe('dark');
    expect(izvrsiPrePaint(tijelo, { 'lekta.theme': 'light' }).theme).toBe('light');
    // MUTACIJA I BASELINE ODJEDNOM: ista procedura nad PROSIRENIM oblikom (index.html) prijavi sva
    // tri prekrsaja. Bez toga bi tvrdnja iznad bila vakuumska, jer ne bi bilo dokaza da procedura
    // uopce moze nesto naci.
    const prosireni = prekrsajiIzuzeca(tijeloSkripte(INDEX));
    expect(prosireni, `prosireni oblik ne pada; procedura ne mjeri nista: ${prosireni.join(' | ')}`)
      .toHaveLength(3);
    expect(prosireni.join(' | ')).toContain('nametnuta tema na praznoj pohrani: dark');
    expect(prosireni.join(' | ')).toContain('cita lekta.display');
    expect(prosireni.join(' | ')).toContain('upisuje atribute prikaza');
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
      'data-contrast="high"', 'data-motion="reduce"',
    ]) {
      expect(CSS, `nedostaje ucinak za ${pravilo}`).toContain(pravilo);
    }
    // Kontrola "Velicina teksta" je uklonjena (Z7 pregled): CSS vise ne smije nositi ni njezin
    // selektor ni njezine korijenske vrijednosti.
    expect(CSS).not.toContain('data-text-size');
    expect(CSS).not.toContain('ps-seg--velicina');
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

  /**
   * SPECIFICNOST SE RACUNA, NE PROCJENJUJE.
   *
   * Komentari u tri lista su je do sada tvrdili rijecima i BILI SU KRIVI: `html:root` je (0,1,1),
   * a ne (0,2,0), pa je i zakljucak o tome tko koga tuce bio slucajno tocan. Kriva aritmetika je
   * ovdje skupa: `html:root[data-contrast="high"]` (0,2,1) je bio IZJEDNACEN s
   * `html:root:not([data-theme])` (0,2,1), a obje grane postavljaju `--desk-muted` i
   * `--paper-line`, pa je kombinacija "kao sustav" + svijetao OS + "pojacan kontrast" ovisila o
   * tome kako bundler poslozi listove.
   *
   * Brojac je namjerno malen i cita SAMO oblike koji se u ovim listovima pojavljuju.
   */
  type Triple = readonly [number, number, number];

  const specificnost = (selektor: string): Triple => {
    let a = 0; let b = 0; let c = 0;
    let s = selektor.trim();
    // `:not(X)` / `:is(X)` / `:has(X)` nose specificnost svog argumenta, a sami po sebi nista.
    for (;;) {
      const m = /:(?:not|is|has)\(([^()]*)\)/.exec(s);
      if (!m) break;
      const [ua, ub, uc] = specificnost(m[1]);
      a += ua; b += ub; c += uc;
      s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
    }
    const pojedi = (uzorak: RegExp): number => {
      const n = (s.match(uzorak) ?? []).length;
      s = s.replace(uzorak, ' ');
      return n;
    };
    a += pojedi(/#[A-Za-z_-][\w-]*/g);
    b += pojedi(/\[[^\]]*\]/g);      // atributi PRIJE elemenata: vrijednost nosi slova
    b += pojedi(/\.[A-Za-z_-][\w-]*/g);
    c += pojedi(/::[A-Za-z-]+/g);    // pseudo-element PRIJE pseudo-klase: dvije dvotocke
    b += pojedi(/:[A-Za-z-]+/g);
    c += pojedi(/[A-Za-z][\w-]*/g);
    return [a, b, c] as const;
  };

  const strogoVeca = (x: Triple, y: Triple): boolean => {
    for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] > y[i];
    return false;
  };

  /**
   * Selektor bloka koji SADRZI zadanu deklaraciju. Trazi se unatrag od deklaracije (`{` koji joj
   * prethodi), jer bi trazenje unaprijed uhvatilo `{` SLJEDECEG pravila; komentari se maknu, jer
   * oba lista selektore objasnjavaju i rijecima (proza nije kod).
   */
  const selektorBloka = (sirovo: string, deklaracija: string): string => {
    const css = sirovo.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const od = css.indexOf(deklaracija);
    expect(od, `deklaracija ${deklaracija} nije nadjena`).toBeGreaterThan(-1);
    const otvaranje = css.lastIndexOf('{', od);
    const granica = Math.max(css.lastIndexOf('}', otvaranje), css.lastIndexOf('{', otvaranje - 1));
    return css.slice(granica + 1, otvaranje).trim().replace(/\s+/g, ' ');
  };

  /** Selektor koji u listu stoji DOSLOVNO; vraca ga bez zavrsne viticaste zagrade. */
  const doslovanSelektor = (sirovo: string, doslovno: string): string => {
    expect(sirovo.replace(/\/\*[\s\S]*?\*\//g, ' '), `list nema selektor ${doslovno}`).toContain(doslovno);
    return doslovno.replace(/\s*\{$/, '');
  };

  it('BASELINE: brojac specificnosti daje poznate vrijednosti', () => {
    // Bez ovoga bi gard ispod prolazio i s brojacem koji uvijek vraca istu vrijednost.
    expect(specificnost('html:root')).toEqual([0, 1, 1]);
    expect(specificnost(':root:not([data-theme])')).toEqual([0, 2, 0]);
    expect(specificnost('html:root:not([data-theme])')).toEqual([0, 2, 1]);
    expect(specificnost('html:root[data-theme="light"]')).toEqual([0, 2, 1]);
    expect(specificnost('html:root[data-contrast="high"]')).toEqual([0, 2, 1]);
    expect(specificnost('html:root[data-contrast="high"][data-contrast]')).toEqual([0, 3, 1]);
    expect(strogoVeca([0, 3, 1], [0, 2, 1])).toBe(true);
    expect(strogoVeca([0, 2, 1], [0, 2, 1]), 'izjednacenje NIJE pobjeda').toBe(false);
    expect(strogoVeca([0, 2, 1], [0, 3, 1])).toBe(false);
  });

  it('SPECIFICNOST: kontrastna grana strogo tuce i sustavnu i svijetlu granu teme', () => {
    const kontrast = specificnost(selektorBloka(CSS, '--paper-muted: #4A4438'));
    const sustav = specificnost(doslovanSelektor(SUSTAV, 'html:root:not([data-theme]) {'));
    const svijetlo = specificnost(doslovanSelektor(CHROME, 'html:root[data-theme="light"]{'));
    expect(kontrast, 'kontrastna grana').toEqual([0, 3, 1]);
    expect(sustav, 'sustavna grana').toEqual([0, 2, 1]);
    expect(strogoVeca(kontrast, sustav), '"kao sustav" + svijetao OS + pojacan kontrast').toBe(true);
    expect(strogoVeca(kontrast, svijetlo), 'danje svjetlo + pojacan kontrast').toBe(true);
  });

  it('MUTACIJA: stari, jednostruki kontrastni selektor NE tuce sustavnu granu', () => {
    const stari = specificnost('html:root[data-contrast="high"]');
    const sustav = specificnost(doslovanSelektor(SUSTAV, 'html:root:not([data-theme]) {'));
    expect(stari).toEqual(sustav);
    expect(strogoVeca(stari, sustav), 'stari selektor je bio IZJEDNACEN, dakle ovisan o redoslijedu').toBe(false);
    // Kontrola: mutacija pada tocno na onome sto popravak mijenja, ne na svemu.
    expect(strogoVeca(specificnost(selektorBloka(CSS, '--paper-muted: #4A4438')), sustav)).toBe(true);
  });

  it('modul NE ulazi u dijeljenu traku, a montira ga ui-boot za sve rute', () => {
    // `src/routes/shared/route-shell.ts` je uklonjen u Z15 (mrtva ljuska koju nijedan ulaz nije
    // montirao); dijeljeni chrome je sada `src/shared/site-chrome.ts`, i on je STVARNO ozicen na
    // svakoj ruti preko `ui-boot.ts`. Tvrdnja je time postala jaca, ne slabija: mjeri modul koji
    // korisnik doista skine.
    const chrome = read('src/shared/site-chrome.ts');
    // MJERI SE UVOZ, NE POMEN. Modul panel SPOMINJE (objasnjava kome ustupa lampu), a to je
    // upravo ono sto ovdje treba stajati; kvar bi bio da ga UVOZI i montira po svakoj ruti.
    expect(chrome).not.toMatch(/from '[^']*display-settings'/);
    expect(chrome).not.toContain('mountDisplaySettings');
    // Traka lampu preuzima SAMO ako je slobodna, i unutar rukovatelja provjerava vlasnika, pa
    // panel na `/` i `/rad/` ostaje jedini koji mijenja temu (inace bi se preklopila dvaput).
    expect(chrome).toContain('btn.dataset.themeOwner');
    // OD F10 PANEL MONTIRA `ui-boot.ts`, JEDNIM POZIVOM ZA SVE RUTE. Rute ga vise NE zovu, i to
    // je druga strana iste tvrdnje: dva montera istog panela bila bi dva vlasnika lampe.
    // `mountDisplaySettings` prethodnu montazu vec odbaci, ali dvostruk poziv ostaje besmislen.
    expect(read('src/shared/ui-boot.ts')).toContain('mountDisplaySettings(document)');
    for (const ulaz of ['src/routes/intake/main.ts', 'src/routes/workspace/main.ts']) {
      expect(read(ulaz), `${ulaz}: panel montira ui-boot, ne ruta`).not.toContain('mountDisplaySettings(document)');
    }
  });

  /**
   * UCINAK PRATI ATRIBUT, NE KONTROLU.
   *
   * Pre-paint skripta upisuje `data-reading-font`, `data-contrast` i `data-motion` na SVAKOJ
   * stranici, a panel se montira samo na `/` i `/rad/`. Dok je stil dolazio s panelom, ta tri
   * atributa su na ostalim rutama stajala MRTVA: korisnik izabere pismo za citanje na `/`, ode na
   * `/saznaj-vise/` i ondje se ne dogodi nista.
   */
  const RUTE = [
    'src/routes/intake/main.ts', 'src/routes/workspace/main.ts',
    'src/routes/learn-more/main.ts', 'src/routes/my-work/main.ts',
    'src/main.ts', 'src/shared/page-boot.ts',
  ] as const;
  const UVOZ_UCINKA = "import './display-settings.css'";

  /** Dobiva li ruta ucinak postavki, i kojim putem. Cista funkcija, pa se smije mutirati. */
  const rutaDobivaUcinak = (ruta: string, boot: string, panel: string): boolean => (
    ruta.includes('display-settings.css')
    || (/ui-boot/.test(ruta) && boot.includes(UVOZ_UCINKA))
    || (ruta.includes('mountDisplaySettings') && panel.includes(UVOZ_UCINKA))
  );

  it('ucinak postavki ulazi kroz ui-boot, pa vrijedi na SVIM rutama', () => {
    const boot = read('src/shared/ui-boot.ts');
    const panel = read('src/shared/display-settings.ts');
    expect(boot, 'ui-boot mora uvoziti ucinak postavki').toContain(UVOZ_UCINKA);
    expect(panel, 'panel vise ne nosi vlastiti stil; inace ga rute bez panela opet nemaju')
      .not.toContain(UVOZ_UCINKA);
    for (const ruta of RUTE) {
      const izvor = read(ruta);
      expect(izvor, `${ruta} mora bootati ui-boot`).toMatch(/ui-boot/);
      expect(izvor, `${ruta} ne smije uvoziti list dvaput`).not.toContain('display-settings.css');
      expect(rutaDobivaUcinak(izvor, boot, panel), ruta).toBe(true);
    }
  });

  /**
   * F10 (odluka 2026-09-23): PANEL JE NA SVIM RUTAMA, JEDNIM POZIVOM PO STRANICI.
   *
   * Prije F10 je JS panela zivio na tocno dvije rute, pa je gumb "Aa i Prikaz" u mobilnom listu
   * ostalih 11 stranica bio POSREDNIK koji se pri montazi ukloni: kontrola koja se obeca i onda
   * nestane. Tvrdnja se time okrenula: nijedna ruta panel ne smije montirati sama, a `ui-boot`,
   * koji sve rute bootaju, mora.
   */
  it('JS panela dolazi kroz ui-boot, pa vrijedi na SVIM rutama, i to jednim pozivom', () => {
    const boot = read('src/shared/ui-boot.ts');
    expect((boot.match(/mountDisplaySettings\(document\)/g) ?? []).length,
      'jedan poziv po stranici, inace se panel montira dvaput').toBe(1);
    const sMontazom = RUTE.filter((r) => read(r).includes('mountDisplaySettings(document)'));
    expect(sMontazom, 'nijedna ruta ne smije montirati panel sama').toEqual([]);
    for (const ruta of RUTE) expect(read(ruta), `${ruta} mora bootati ui-boot`).toMatch(/ui-boot/);
    // `/` je `routes/intake/main.ts`, `/rad/` je `routes/workspace/main.ts`; obje i dalje bootaju
    // ui-boot, pa panel imaju kao i prije, samo drugim putem.
    expect(read('index.html')).toContain('src="/src/routes/intake/main.ts"');
    expect(read('rad/index.html')).toContain('src="/src/routes/workspace/main.ts"');
  });

  /** Stranice koje traku nose; svaka mora imati OTVARAC panela, inace je kontrola obecanje. */
  const STRANICE_S_TRAKOM = [
    'index.html', 'rad/index.html', 'alati.html', 'citat.html', 'izjava.html', 'kartice.html',
    'literatura.html', 'naslovnica.html', 'citati-i-literatura.html', 'landing_usporedba.html',
    'landing_benchmark.html', 'saznaj-vise/index.html', 'moji-radovi/index.html',
  ] as const;

  it.each(STRANICE_S_TRAKOM)('%s nosi JEDAN #displayBtn i otvarac u mobilnom listu', (rel) => {
    const html = read(rel);
    expect((html.match(/id="displayBtn"/g) ?? []).length,
      'dva elementa s istim id su nevaljan HTML').toBe(1);
    expect(html, 'mobilni list mora nositi otvarac, ne posrednik').toContain('data-display-open');
    expect(html, 'posrednik je uklonjen, ne ostavljen uz novi').not.toContain('data-site-chrome-display-proxy');
    // Otvarac u listu NEMA `id`, jer `#displayBtn` ostaje jedinstven u dokumentu.
    expect(html).toContain('<button class="site-chrome__sheet-aa" type="button" data-display-open>');
  });

  it('MUTACIJA: uz stari raspored (list uz panel) rute bez panela ostaju bez ucinka', () => {
    const boot = read('src/shared/ui-boot.ts');
    const panel = read('src/shared/display-settings.ts');
    const bootBez = boot.replace(UVOZ_UCINKA + ';', '');
    const panelS = UVOZ_UCINKA + ';\n' + panel;
    expect(rutaDobivaUcinak(read('src/routes/learn-more/main.ts'), bootBez, panelS)).toBe(false);
    expect(rutaDobivaUcinak(read('src/routes/my-work/main.ts'), bootBez, panelS)).toBe(false);
    // Kontrola smjera: ruta koja je panel montirala SAMA je i tada radila, pa se kvar nije vidio
    // ondje gdje se gledalo. Rute to od F10 vise ne rade, pa se stari raspored glumi doslovno.
    const starimRasporedom = read('src/routes/intake/main.ts') + '\nmountDisplaySettings(document);';
    expect(rutaDobivaUcinak(starimRasporedom, bootBez, panelS)).toBe(true);
    // BASELINE: sa STVARNIM izvorima obje rute bez panela dobivaju ucinak.
    expect(rutaDobivaUcinak(read('src/routes/learn-more/main.ts'), boot, panel)).toBe(true);
  });

  it('ui-boot ustupa #themeBtn panelu i postuje `system`', () => {
    const boot = read('src/shared/ui-boot.ts');
    expect(boot).toContain('btn.dataset.themeOwner');
    expect(boot).toContain("spremljenaTema !== 'system'");
  });
});

describe('Z6 citanje STANJA, ne atributa', () => {
  // Cetiri mjesta su darkness racunala iz `data-theme` (`display-settings.ts`, `ui-boot.ts` i dva
  // puta `route-shell.ts`), a atribut u nacinu `system` NE POSTOJI. Citac je zato jedan i dijeljen;
  // ovdje se mjeri njegovo ponasanje, a ne prepisuje njegova logika.
  it('bez atributa odlucuje `prefers-color-scheme`, s atributom odlucuje atribut', () => {
    vratiSustav = podmetniSustav(SUSTAV_SVIJETAO);
    expect(tamnoNaEkranu(document)).toBe(false);
    expect(suprotnaTema(document)).toBe('dark');
    vratiSustav();
    vratiSustav = podmetniSustav(SUSTAV_TAMAN);
    expect(tamnoNaEkranu(document)).toBe(true);
    expect(suprotnaTema(document)).toBe('light');
    // Atribut NADJACAVA sustav u oba smjera: izricit izbor nije prijedlog.
    document.documentElement.dataset.theme = 'light';
    expect(tamnoNaEkranu(document)).toBe(false);
    document.documentElement.dataset.theme = 'dark';
    vratiSustav();
    vratiSustav = podmetniSustav(SUSTAV_SVIJETAO);
    expect(tamnoNaEkranu(document)).toBe(true);
  });

  it('preglednik bez `matchMedia` dobiva ZADANO proizvoda (radna lampa), ne iznimku', () => {
    const prozor = window as unknown as { matchMedia?: unknown };
    const izvorni = prozor.matchMedia;
    prozor.matchMedia = undefined;
    try {
      expect(tamnoNaEkranu(document)).toBe(true);
      expect(pokretPrigusen(document)).toBe(false);
    } finally {
      prozor.matchMedia = izvorni;
    }
  });

  it('NIJEDAN preklopnik teme vise ne racuna tamu iz `data-theme`', () => {
    // Gard nad ODSUTNOSCU obrasca: kvar se vraca kao "ocito dovoljno" citanje atributa, jedno po
    // jedno mjesto, i svako izgleda bezazleno. Popis je imenovan, ne prebrojan.
    for (const put of ['src/shared/ui-boot.ts', 'src/shared/site-chrome.ts', 'src/shared/display-settings.ts']) {
      const izvor = read(put);
      expect(izvor, `${put} mora citati stanje kroz display-prefs`).toMatch(/from '[^']*display-prefs'/);
      const sirovo = izvor.match(/dataset\.theme\s*(===|!==)\s*'(dark|light)'/g) ?? [];
      expect(sirovo, `${put} opet racuna temu iz atributa: ${sirovo.join(', ')}`).toEqual([]);
    }
  });
});

describe('Z6 "Manje pokreta" zaustavlja i Web Animations API', () => {
  // MJERI SE POKRET, NE PRISUTNOST CSS PRAVILA. `data-motion="reduce"` gasi `animation` i
  // `transition`, a ulazna sekvenca na `/` animira kroz `element.animate()`, koji ni o jednom od
  // ta dva svojstva ne ovisi: CSS ju nije mogao zaustaviti. Brojac poziva je zato jedini dokaz.
  function brojacAnimacija(): { broj: () => number; vrati: () => void } {
    const proto = Element.prototype as unknown as { animate?: unknown };
    const izvorni = proto.animate;
    let broj = 0;
    proto.animate = function animate() { broj += 1; return { cancel() {}, finish() {} }; };
    return { broj: () => broj, vrati: () => { proto.animate = izvorni; } };
  }

  function papir(): void {
    document.body.innerHTML = '<div id="intakeDropzone">'
      + '<p class="intake-kicker">a</p><h1 class="intake-title">b</h1>'
      + '<p class="intake-lead">c</p><div class="intake-cta">d</div><p class="intake-hint">e</p>'
      + '</div>';
  }

  it('BASELINE: bez prigusenja sekvenca stvarno animira', () => {
    vratiSustav = podmetniSustav({});
    const brojac = brojacAnimacija();
    try {
      papir();
      playIntakeEntry(document);
      expect(brojac.broj(), 'sekvenca ne animira nista; gard bi bio vakuumski zelen').toBeGreaterThan(0);
    } finally { brojac.vrati(); }
  });

  it('`data-motion="reduce"` gasi SVE pozive `animate`, ne samo CSS animacije', () => {
    vratiSustav = podmetniSustav({});
    const brojac = brojacAnimacija();
    try {
      papir();
      document.documentElement.dataset.motion = 'reduce';
      playIntakeEntry(document);
      expect(brojac.broj(), 'WAAPI sekvenca je odigrala uz rucno ugasen pokret').toBe(0);
    } finally { brojac.vrati(); }
  });

  it('sustavni `prefers-reduced-motion` i dalje gasi sekvencu, bez ijednog atributa', () => {
    vratiSustav = podmetniSustav({ '(prefers-reduced-motion: reduce)': true });
    const brojac = brojacAnimacija();
    try {
      papir();
      playIntakeEntry(document);
      expect(brojac.broj()).toBe(0);
      expect(pokretPrigusen(document)).toBe(true);
    } finally { brojac.vrati(); }
  });

  it('preklopka u panelu doista upisuje atribut koji sekvenca cita', () => {
    vratiSustav = podmetniSustav({});
    api = postavi();
    const preklopka = document.getElementById('lektaPokret') as HTMLInputElement;
    preklopka.checked = true;
    preklopka.dispatchEvent(new Event('change', { bubbles: true }));
    expect(pokretPrigusen(document)).toBe(true);
  });
});

/**
 * PARITET SVIJETLIH GRANA.
 *
 * Isti izbor "kao sustav" pogadja DVA selektora: `html:root[data-theme="light"]` (izricit izbor) i
 * `html:root:not([data-theme])` unutar `prefers-color-scheme: light` (sustav). Sve sto prvi
 * postavlja mora postavljati i drugi, inace `system` daje TRECI izgled koji nitko nije nacrtao.
 *
 * Uzorak ovdje nije dovoljan i to je izmjereno: raniji gard je provjeravao dva tokena (`--paper`,
 * `--desk`) i bio zelen dok je `--red-on-desk` ostajao na tamnom #FF7A5C nad svijetlim stolom
 * (1,80:1 umjesto 4,94:1, na `.footer-col-h` koji `/rad/` stvarno nosi). Zato se usporedjuje
 * CIJELA populacija tokena, a ne izabrani primjeri.
 */
function blokIza(css: string, selektor: string): string | null {
  const pocetak = css.indexOf(selektor);
  if (pocetak < 0) return null;
  // Selektor SMIJE zavrsiti otvorenom viticom (tako se razlikuje blok tokena od pravila nad
  // potomkom). Tada je ta viticasta VEC pronadjena, pa se ne smije traziti sljedeca: prvi pokusaj
  // je zbog toga citao blok koji dolazi POSLIJE i prijavio 23 lazno nedostajuca tokena.
  const otvorena = selektor.endsWith('{')
    ? pocetak + selektor.length - 1
    : css.indexOf('{', pocetak + selektor.length);
  if (otvorena < 0) return null;
  let dubina = 0;
  for (let i = otvorena; i < css.length; i += 1) {
    if (css[i] === '{') dubina += 1;
    else if (css[i] === '}') {
      dubina -= 1;
      if (dubina === 0) return css.slice(otvorena + 1, i);
    }
  }
  return null;
}

/** Razmaci i redoslijed nisu ugovor, pa se vrijednost normalizira prije usporedbe. */
function tokeni(blok: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const [, ime, vrijednost] of blok.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g)) {
    mapa.set(ime, vrijednost.replace(/\s+/g, ' ').trim());
  }
  return mapa;
}

/** Vraca IMENOVANE razlike, nikad samo broj: 2026-08-31 je bas broj sakrio zamjenu jedne stavke. */
function razlikeSvijetlihGrana(css: string): string[] {
  const izricito = blokIza(css, 'html:root[data-theme="light"]{');
  const sustav = blokIza(css, 'html:root:not([data-theme]){');
  if (izricito === null) return ['nema bloka html:root[data-theme="light"]'];
  if (sustav === null) return ['nema bloka html:root:not([data-theme])'];
  const a = tokeni(izricito);
  const b = tokeni(sustav);
  const razlike: string[] = [];
  for (const [ime, vrijednost] of a) {
    if (!b.has(ime)) razlike.push(`nedostaje u sustavnoj grani: ${ime}`);
    else if (b.get(ime) !== vrijednost) razlike.push(`razlicita vrijednost: ${ime}`);
  }
  for (const ime of b.keys()) if (!a.has(ime)) razlike.push(`visak u sustavnoj grani: ${ime}`);
  return razlike;
}

describe('Z6 `system` daje ISTI izgled kao izricito danje svjetlo', () => {
  it('page-chrome.css: svaki token izricite svijetle teme postoji i u sustavnoj grani', () => {
    const css = read('src/shared/page-chrome.css');
    expect(css).toContain('@media (prefers-color-scheme:light){html:root:not([data-theme]){');
    const razlike = razlikeSvijetlihGrana(css);
    expect(razlike, razlike.join('\n')).toEqual([]);
    // Prirodni kanarinac: token koji NE postoji u design-system.css, pa ga je uzorak i propustio.
    expect(blokIza(css, 'html:root:not([data-theme]){')).toContain('--red-on-desk:#A62B23');
  });

  it('page-chrome.css: i komponentne korekcije svijetle teme imaju sustavni par', () => {
    const css = read('src/shared/page-chrome.css');
    // `.ks-step`/`.ks-di` nose `opacity:.85`, a povratak na 1 je postojao samo pod izricitim
    // atributom; u `system` je na svijetlom stolu ostajalo prigusenje koje komentar uz to pravilo
    // sam mjeri kao pad ispod praga (3,95:1 / 3,77:1 / 3,48:1).
    const izricite = [...css.matchAll(/html:root\[data-theme="light"\]\s+([^,{]+)/g)].map((m) => m[1].trim());
    expect(izricite.length, 'nema nijedne komponentne korekcije; gard bi bio vakuumski').toBeGreaterThan(0);
    for (const meta of izricite) {
      expect(css, `nedostaje sustavni par za ${meta}`).toContain(`html:root:not([data-theme]) ${meta}`);
    }
  });

  it('design-system.css: primitivi obiju svijetlih grana se poklapaju', () => {
    // Ondje je grana pisana s razmacima i uvlakama, pa se poklapanje mjeri nad NORMALIZIRANIM
    // vrijednostima, ne nad bajtovima.
    const css = read('src/shared/design-system.css');
    const izricito = tokeni(blokIza(css, '[data-theme="light"]') ?? '');
    const sustav = tokeni(blokIza(css, 'html:root:not([data-theme])') ?? '');
    expect(izricito.size, 'nema izricite svijetle teme u design-system.css').toBeGreaterThan(10);
    for (const [ime, vrijednost] of izricito) {
      expect(sustav.get(ime), `design-system.css: ${ime} nedostaje ili se razlikuje u sustavnoj grani`)
        .toBe(vrijednost);
    }
  });

  it('MUTACIJA: izostavljen i promijenjen token u sustavnoj grani MORAJU pasti', () => {
    const cjelovit = 'html:root[data-theme="light"]{--a:#111;--b:#222}'
      + '@media (prefers-color-scheme:light){html:root:not([data-theme]){--a:#111;--b:#222}}';
    expect(razlikeSvijetlihGrana(cjelovit), 'BASELINE: nemutiran ulaz mora biti cist').toEqual([]);
    const bezTokena = 'html:root[data-theme="light"]{--a:#111;--b:#222}'
      + '@media (prefers-color-scheme:light){html:root:not([data-theme]){--a:#111}}';
    expect(razlikeSvijetlihGrana(bezTokena)).toEqual(['nedostaje u sustavnoj grani: --b']);
    const drugaVrijednost = 'html:root[data-theme="light"]{--a:#111;--b:#222}'
      + '@media (prefers-color-scheme:light){html:root:not([data-theme]){--a:#111;--b:#999}}';
    expect(razlikeSvijetlihGrana(drugaVrijednost)).toEqual(['razlicita vrijednost: --b']);
  });
});

describe('Z6 na `/rad/`: naslijedjeni analizator ne gazi izbor "kao sustav"', () => {
  // MJERI SE STVARNI REDOSLIJED S `/rad/`, NAD STVARNIM MARKUPOM TE STRANICE.
  //
  // `src/routes/workspace/main.ts` montira panel pa odmah zove `initAnalyzerApp`, a `initLegacy` je
  // SIROVU vrijednost `lekta.theme` bezuvjetno upisivao u `data-theme`. Za `system` je to vracalo
  // `data-theme="system"`, cime ni `:not([data-theme])` ni `[data-theme="light"]` vise ne pogadjaju,
  // dok radio u panelu i dalje pokazuje "Kao sustav": kontrola izgleda ukljuceno a ne radi nista.
  //
  // Goli DOM ovdje ne bi bio dokaz: `initLegacy` bez `#analyzer` i `#dropzone` uopce ne krene
  // (`hasLegacyPage`), pa bi test mjerio tok koji na `/rad/` nitko ne izvodi. Zato se ucitava
  // stvarno tijelo `rad/index.html`, bez `<script>` oznaka (module loader happy-doma ih odbija).
  const stranica = read('rad/index.html');
  const tijelo = stranica.slice(stranica.indexOf('<body'), stranica.lastIndexOf('</body>'));
  const markup = tijelo.slice(tijelo.indexOf('>') + 1).replace(/<script[\s\S]*?<\/script>/g, '');

  let vratiFetch: (() => void) | null = null;

  beforeEach(() => {
    // Analizator na montazi dohvaca pravila profila; test ne smije ici na mrezu.
    const globalno = globalThis as unknown as { fetch?: unknown };
    const izvorni = globalno.fetch;
    globalno.fetch = vi.fn(async () => new Response('{}', { status: 503 }));
    vratiFetch = () => { globalno.fetch = izvorni; };
  });

  afterEach(() => { vratiFetch?.(); vratiFetch = null; });

  function pokreniRutu(tema: string): string | null {
    localStorage.setItem(THEME_KEY, tema);
    document.body.innerHTML = markup;
    expect(document.getElementById('analyzer'), 'rad/index.html mora nositi #analyzer').not.toBeNull();
    expect(document.getElementById('dropzone'), 'rad/index.html mora nositi #dropzone').not.toBeNull();
    api = mountDisplaySettings(document);
    expect(api, 'rad/index.html mora nositi #displayBtn').not.toBeNull();
    initAnalyzerApp(document);
    return document.documentElement.getAttribute('data-theme');
  }

  it('`system` ostaje BEZ atributa i nakon sto se analizator montira', () => {
    vratiSustav = podmetniSustav(SUSTAV_SVIJETAO);
    expect(pokreniRutu('system')).toBeNull();
    expect(radio('lektaOsvjetljenje', 'system').checked).toBe(true);
  });

  it('BASELINE: izricite teme analizator i dalje vraca, pa popravak nije "obrisi sve"', () => {
    vratiSustav = podmetniSustav(SUSTAV_SVIJETAO);
    expect(pokreniRutu('light')).toBe('light');
  });
});

/**
 * Z6 PREGLED: USTUPANJE #themeBtn SE MJERI IZVODJENJEM, NE CITANJEM IZVORA.
 *
 * Do sada su ta dva ponasanja (`btn.dataset.themeOwner` i postovanje `system`) bila cuvana samo
 * tvrdnjama nad TEKSTOM `ui-boot.ts`. Tekst dokazuje da niz postoji, ne da se izvodi u pravom
 * trenutku, a tu je cijela razlika: provjera vlasnistva mora biti UNUTAR rukovatelja, jer panel
 * gumb preuzima TEK POSLIJE (staticki uvoz `ui-boot` se izvede prije `start()` u
 * `src/routes/intake/main.ts`, koji tek onda zove `mountDisplaySettings`). Ista tvrdnja citana iz
 * teksta prolazi i kad provjera stoji u trenutku POSTAVLJANJA, dakle kad je bezvrijedna.
 *
 * Modul se ucitava dinamicki uz `vi.resetModules()`, jer mu je ponasanje u top-level kodu
 * (zadana tamna tema) jednokratno po registru modula.
 */
describe('Z6 ui-boot: izvodjenje, ne tekst', () => {
  /** Ucita `ui-boot` iznova, nad vec pripremljenim DOM-om i pohranom. */
  async function ucitajUiBoot(): Promise<void> {
    vi.resetModules();
    await import('../src/shared/ui-boot');
  }

  it('uz spremljeno `system` ui-boot NE upisuje data-theme', async () => {
    vratiSustav = podmetniSustav(SUSTAV_SVIJETAO);
    localStorage.setItem(THEME_KEY, 'system');
    document.body.innerHTML = navigacija();
    await ucitajUiBoot();
    expect(document.documentElement.hasAttribute('data-theme'),
      '`system` je izricit izbor da temu odredi OS; atribut ga gasi').toBe(false);
  });

  it('BASELINE: bez spremljene teme ui-boot i dalje pali radnu lampu', async () => {
    vratiSustav = podmetniSustav(SUSTAV_SVIJETAO);
    document.body.innerHTML = navigacija();
    await ucitajUiBoot();
    // Bez ove kontrole bi gornja tvrdnja prolazila i nad modulom koji ne radi NISTA.
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  /**
   * OD F10 PANEL PREUZIMA GUMB UNUTAR ISTOG `boot()`-a, pa se ustupanje mjeri nad PRAVIM panelom.
   *
   * Do F10 je panel montirala ruta (`routes/intake/main.ts`), dakle POSLIJE `ui-boot`-a, i ovaj
   * test je tudjeg vlasnika glumio rucno prikacenim rukovateljem. Sada ga `ui-boot` montira sam,
   * pa je tvrdnja postala jaca: mjeri se stvarni par (`setupThemeToggle` + panel), ne replika.
   */
  it('panel montiran iz ui-boota preuzme gumb, pa klik mijenja temu TOCNO JEDNOM', async () => {
    vratiSustav = podmetniSustav(SUSTAV_SVIJETAO);
    document.body.innerHTML = navigacija();
    await ucitajUiBoot();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    const btn = document.getElementById('themeBtn') as HTMLElement;
    expect(btn.dataset.themeOwner, 'panel iz ui-boota mora preuzeti lampu').toBe('display-settings');
    expect(document.getElementById(PANEL_ID), 'ui-boot mora montirati panel').not.toBeNull();

    btn.click();
    // Da su odradila OBA rukovatelja (ui-boot i panel), tema bi se promijenila dvaput i vratila na
    // `dark`: vidljiv treptaj bez promjene. Jedna promjena znaci da je ui-boot ustupio gumb.
    expect(document.documentElement.getAttribute('data-theme'),
      'tema je promijenjena dvaput ili nijednom; ui-boot nije ustupio gumb').toBe('light');
    // Panel je jedini pisac, pa i njegov radio mora pokazivati novo stanje (jedan pisac, jedan citac).
    expect(radio('lektaOsvjetljenje', 'light').checked).toBe(true);
  });

  it('MUTACIJA: dva ziva ozicenja iste lampe ponistavaju promjenu (zato ui-boot ustupa)', async () => {
    vratiSustav = podmetniSustav(SUSTAV_SVIJETAO);
    document.body.innerHTML = navigacija();
    await ucitajUiBoot();
    const btn = document.getElementById('themeBtn') as HTMLElement;
    // BASELINE: s jednim piscem klik daje `light` (tvrdnja iznad).
    // Podmetnut DRUGI pisac, tocno onakav kakav bi `ui-boot` bio bez provjere vlasnistva.
    btn.addEventListener('click', () => {
      document.documentElement.dataset.theme = suprotnaTema(document);
    });
    btn.click();
    expect(document.documentElement.getAttribute('data-theme'),
      'dva pisca moraju ponistiti promjenu; inace ovaj gard ne mjeri nista').toBe('dark');
  });

  /**
   * Doslovna izvedba rukovatelja, u dvije varijante koje se razlikuju SAMO po trenutku provjere.
   * Replika je vezana uz produkciju tvrdnjom nad izvorom odmah ispod (provjera mora stajati IZA
   * `addEventListener('click'`, dakle unutar rukovatelja).
   */
  function ozici(doc: Document, provjeraPriPostavljanju: boolean): void {
    const btn = doc.getElementById('themeBtn') as HTMLElement | null;
    if (!btn) return;
    if (provjeraPriPostavljanju && btn.dataset.themeOwner) return;
    btn.addEventListener('click', () => {
      if (!provjeraPriPostavljanju && btn.dataset.themeOwner) return;
      doc.documentElement.dataset.theme = suprotnaTema(doc);
    });
  }

  function odigraj(provjeraPriPostavljanju: boolean): string | null {
    document.body.innerHTML = navigacija();
    document.documentElement.dataset.theme = 'dark';
    ozici(document, provjeraPriPostavljanju);
    const btn = document.getElementById('themeBtn') as HTMLElement;
    btn.dataset.themeOwner = 'panel';
    btn.addEventListener('click', () => { document.documentElement.dataset.theme = suprotnaTema(document); });
    btn.click();
    return document.documentElement.getAttribute('data-theme');
  }

  it('MUTACIJA: provjera vlasnistva premjestena u trenutak postavljanja pada', () => {
    vratiSustav = podmetniSustav(SUSTAV_SVIJETAO);
    // BASELINE: ispravan raspored (provjera u rukovatelju) daje jednu promjenu, kao ui-boot gore.
    expect(odigraj(false), 'baseline mora biti cist').toBe('light');
    // Mutacija: oznaka jos ne postoji kad se listener kaci, pa provjera nikad nikoga ne zaustavi.
    expect(odigraj(true), 'mutacija nije promijenila ishod; gard ne grize').toBe('dark');
  });

  it('izvor stvarno drzi provjeru UNUTAR rukovatelja, pa replika iznad opisuje produkciju', () => {
    const boot = read('src/shared/ui-boot.ts');
    const kacenje = boot.indexOf("btn.addEventListener('click'");
    const provjera = boot.indexOf('if (btn.dataset.themeOwner) return;');
    expect(kacenje, 'nema klik rukovatelja na #themeBtn').toBeGreaterThan(0);
    expect(provjera, 'nema provjere vlasnistva').toBeGreaterThan(0);
    expect(provjera, 'provjera je izvan rukovatelja: vrijedi samo dok panel montira prije boota')
      .toBeGreaterThan(kacenje);
  });
});
