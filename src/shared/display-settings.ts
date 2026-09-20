/**
 * PANEL "PRILAGODI PRIKAZ" (Z6, design/handoff/ALIGNMENT.md, design/state-display-settings.html).
 *
 * Korisnik prilagodjava PRIKAZ, ne RASPORED. Panel zato nema ni izbor boja ni pomicanje elemenata:
 * crvena ostaje jedini akcent u svakoj kombinaciji, a raspored je isti za sve, da novi korisnik
 * odmah zna sto napraviti (design/README.md, "Prilagodba prikaza" i "Tvrda pravila boje").
 *
 * SVAKA POSTAVKA ZIVI KAO `data-` ATRIBUT NA `<html>`, a ucinak je cisti CSS (`display-settings.css`).
 * Modul ne dira nijedan drugi element stranice i ne zna nista o analizi.
 *
 * TAJ CSS OVAJ MODUL NE UVOZI, nego `src/shared/ui-boot.ts`, koji ucitavaju SVE rute. Razlog:
 * pre-paint skripta atribute upisuje na svakoj stranici, a panel se montira samo na `/` i
 * `/rad/`; da stil dolazi s panelom, izbor napravljen na `/` bio bi mrtav na `/saznaj-vise/`,
 * `/moji-radovi/` i alat-stranicama. Stil prati ATRIBUT, ne kontrolu.
 *
 * GUSTOCA SE NAMJERNO NE NUDI, iako je ALIGNMENT Z6 nabraja. Mjerenje Z4 (2026-09-19) pokazalo je
 * da samo 25 posto razmaka u proizvodu lezi na predlozenoj ljestvici, pa `--space-*` tokeni nisu ni
 * uvedeni: bez njih mnozitelj nema sto mnoziti, a kontrola koja ne mijenja nista gora je od one
 * koje nema, jer korisnik vjeruje da je nesto promijenio. Kad ljestvica bude stvarna, kontrola se
 * dodaje ovdje i u `display-settings.css`, bez ijedne izmjene u pohrani (polje se samo doda).
 *
 * POHRANA JE PODIJELJENA, i to nije nesklad nego ugovor s pre-paint skriptom:
 *   `lekta.theme`    SIROVA vrijednost (`dark` / `light` / `system`), jer je inline skripta u
 *                    <head> cita izravno; JSON navodnici bi razbili FOUC zastitu (isti razlog je
 *                    zapisan uz `rememberTheme` u `src/routes/shared/route-shell.ts`).
 *   `lekta.display`  JEDAN JSON s cetiri polja, kroz `safeStorageGet/Set`.
 */
import { STORAGE_KEYS, safeStorageGet, safeStorageSet } from './browser-storage';
import { suprotnaTema, tamnoNaEkranu } from './display-prefs';

export type Osvjetljenje = 'dark' | 'light' | 'system';
export type PismoZaCitanje = 'default' | 'serif' | 'sans' | 'dyslexic';
export type Kontrast = 'normal' | 'high';
export type Pokret = 'auto' | 'reduce';

export interface DisplaySettings {
  readonly readingFont: PismoZaCitanje;
  readonly contrast: Kontrast;
  readonly motion: Pokret;
}

/** Zadano stanje proizvoda: radna lampa, Newsreader, bez pojacanja i bez prigusenja pokreta. */
export const ZADANO_OSVJETLJENJE: Osvjetljenje = 'dark';
export const ZADANE_POSTAVKE: DisplaySettings = {
  readingFont: 'default', contrast: 'normal', motion: 'auto',
};

const THEME_STORAGE_KEY = 'lekta.theme';
const OSVJETLJENJA: readonly Osvjetljenje[] = ['dark', 'light', 'system'];
const PISMA: readonly PismoZaCitanje[] = ['default', 'serif', 'sans', 'dyslexic'];

function jedanOd<T extends string>(dopusteni: readonly T[], vrijednost: unknown, zadano: T): T {
  return typeof vrijednost === 'string' && (dopusteni as readonly string[]).includes(vrijednost)
    ? vrijednost as T
    : zadano;
}

/**
 * Nepoznat, pokvaren ili djelomican zapis daje ZADANE vrijednosti umjesto iznimke.
 *
 * Pohrana je tudji prostor: korisnik je smije urediti, stara verzija proizvoda ju je mogla napisati
 * drukcije, a `safeStorageGet` na neispravnom JSON-u vrati `fallback`. Nijedan od ta tri slucaja ne
 * smije ostaviti stranicu bez stila.
 */
export function normalizeDisplaySettings(sirovo: unknown): DisplaySettings {
  const zapis = (typeof sirovo === 'object' && sirovo !== null ? sirovo : {}) as Record<string, unknown>;
  return {
    readingFont: jedanOd(PISMA, zapis.readingFont, ZADANE_POSTAVKE.readingFont),
    // `textSize` (stari zapis) se OVDJE NAMJERNO NE CITA: kontrola je uklonjena (Z7 pregled,
    // 2026-09-20), pa i stari `{"textSize":"l"}` zapis mora tiho proci, bez iznimke i bez traga
    // na `<html>`. Vidi biljesku uz uklonjeno mjesto u panelu, nize u ovoj datoteci.
    contrast: zapis.contrast === 'high' ? 'high' : 'normal',
    motion: zapis.motion === 'reduce' ? 'reduce' : 'auto',
  };
}

export function normalizeOsvjetljenje(sirovo: unknown): Osvjetljenje {
  return jedanOd(OSVJETLJENJA, sirovo, ZADANO_OSVJETLJENJE);
}

export function readDisplaySettings(): DisplaySettings {
  return normalizeDisplaySettings(safeStorageGet(STORAGE_KEYS.display, null));
}

export function writeDisplaySettings(postavke: DisplaySettings): void {
  safeStorageSet(STORAGE_KEYS.display, postavke);
}

/** Tema se cita SIROVA (vidi biljesku o pohrani na vrhu). Odbijena pohrana nije greska. */
export function readOsvjetljenje(): Osvjetljenje {
  try {
    return normalizeOsvjetljenje(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return ZADANO_OSVJETLJENJE;
  }
}

export function writeOsvjetljenje(osvjetljenje: Osvjetljenje): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, osvjetljenje);
  } catch {
    // Pohrana je odbijena (privatni prozor, blokirani podaci stranice); izbor vrijedi do kraja sesije.
  }
}

/**
 * Zadana vrijednost NE upisuje atribut, nego ga uklanja.
 *
 * Time `<html>` bez atributa znaci tocno "zadano", pa CSS ne treba pisati pravilo za zadani slucaj,
 * a `system` moze pustiti `prefers-color-scheme` da odluci. Pisanje `data-reading-font="default"`
 * bi radilo jednako, ali bi ostavilo trag koji netko procita kao izbor, a nije.
 */
function postavi(korijen: HTMLElement, atribut: string, vrijednost: string | null): void {
  if (vrijednost === null) korijen.removeAttribute(atribut);
  else korijen.setAttribute(atribut, vrijednost);
}

/**
 * ZASTO `system` NIJE VRIJEDNOST ATRIBUTA, nego njegova ODSUTNOST.
 *
 * Ovo je ugovor koji vrijedi za SVAKI citac teme u proizvodu (pre-paint skripta u <head>,
 * `ui-boot.ts`, `route-shell.ts`, naslijedjeni `src/ui/app.ts`), pa objasnjenje stoji ovdje, na
 * jednom mjestu, umjesto da se prepisuje u svaki od njih.
 *
 * Atribut s vrijednoscu "system" ne bi bio neutralan nego TRECA, NEPOSTOJECA tema: ne bi ga
 * pogodio ni `:not([data-theme])` (jer atribut postoji) ni `[data-theme="light"]` (jer vrijednost
 * nije `light`), pa bi ruta ostala tamna bez obzira na `prefers-color-scheme`, dok bi radio u
 * panelu i dalje pokazivao "Kao sustav". Izmjereno na `/rad/`: naslijedjeni analizator je SIROVU
 * vrijednost iz pohrane bezuvjetno prepisivao u `data-theme` i time gasio "Kao sustav" na jednoj
 * od dvije rute koje tu opciju uopce nude.
 *
 * ZADANO PROIZVODA JE TAMNO, i to nije isto sto i `system`. Kad pohrana NEMA `lekta.theme`,
 * pre-paint skripta upisuje `data-theme="dark"`; sustavna grana vrijedi iskljucivo kad je
 * `system` izricito spremljen. Bez toga bi novi posjetitelj na svijetlom OS-u dobio svijetlu
 * stranicu do prvog kadra pa tamnu cim se boot izvrsi, dakle bljesak, i to u smjeru koji proizvod
 * kao zadano uopce ne nudi (design/README.md: lampa je zadano, dan se pali rucno).
 */
export function applyOsvjetljenje(doc: Document, osvjetljenje: Osvjetljenje): void {
  postavi(doc.documentElement, 'data-theme', osvjetljenje === 'system' ? null : osvjetljenje);
}

export function applyDisplaySettings(doc: Document, postavke: DisplaySettings): void {
  const korijen = doc.documentElement;
  postavi(korijen, 'data-reading-font', postavke.readingFont === 'default' ? null : postavke.readingFont);
  postavi(korijen, 'data-contrast', postavke.contrast === 'high' ? 'high' : null);
  postavi(korijen, 'data-motion', postavke.motion === 'reduce' ? 'reduce' : null);
}

interface Segment<T extends string> { readonly value: T; readonly label: string; readonly opis?: string }

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document, tag: K, klasa?: string, tekst?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (klasa) node.className = klasa;
  if (tekst !== undefined) node.textContent = tekst;
  return node;
}

/** Segmentirani izbor kao PRAVI radio gumbi: citac ekrana tako dobiva skupinu, ne sest gumba. */
function segmenti<T extends string>(
  doc: Document, ime: string, naslov: string, dodatak: string | null,
  opcije: readonly Segment<T>[], klasa: string,
): { blok: HTMLElement; unosi: Map<T, HTMLInputElement> } {
  const blok = el(doc, 'fieldset', 'ps-ctrl');
  const legenda = el(doc, 'legend', 'ps-ctrl__lbl');
  legenda.append(doc.createTextNode(naslov));
  if (dodatak) legenda.append(el(doc, 'small', undefined, dodatak));
  blok.append(legenda);
  const skupina = el(doc, 'div', 'ps-seg ' + klasa);
  const unosi = new Map<T, HTMLInputElement>();
  for (const opcija of opcije) {
    const oznaka = el(doc, 'label', 'ps-seg__opcija');
    const unos = doc.createElement('input');
    unos.type = 'radio';
    unos.name = ime;
    unos.value = opcija.value;
    unos.className = 'ps-seg__unos';
    if (opcija.opis) unos.setAttribute('aria-label', opcija.opis);
    oznaka.append(unos, el(doc, 'span', 'ps-seg__tekst', opcija.label));
    skupina.append(oznaka);
    unosi.set(opcija.value, unos);
  }
  blok.append(skupina);
  return { blok, unosi };
}

function preklopka(
  doc: Document, id: string, naslov: string, opis: string,
): { blok: HTMLElement; unos: HTMLInputElement } {
  const blok = el(doc, 'div', 'ps-ctrl ps-ctrl--preklopka');
  const tekst = el(doc, 'div', 'ps-preklopka__tekst');
  const oznaka = el(doc, 'label', 'ps-ctrl__lbl', naslov);
  oznaka.htmlFor = id;
  tekst.append(oznaka, el(doc, 'p', 'ps-preklopka__opis', opis));
  const unos = doc.createElement('input');
  unos.type = 'checkbox';
  unos.id = id;
  unos.className = 'ps-preklopka__unos';
  blok.append(tekst, unos);
  return { blok, unos };
}

export const PANEL_ID = 'lektaPrikazPanel';

export interface DisplaySettingsController {
  readonly panel: HTMLElement;
  open(): void;
  close(): void;
  dispose(): void;
}

const montirani = new WeakMap<Document, DisplaySettingsController>();

/**
 * Montira panel i gumb `#displayBtn`. Vraca `null` kad gumba nema (svaka stranica koja panel ne
 * nudi), jer tiho stvaranje `<aside>`-a bez nacina da ga se otvori ne bi bilo degradacija nego smece.
 *
 * Panel NIJE modal: pozadina ostaje interaktivna, fokus se ne zarobljava, `inert` se ne postavlja.
 * Korisnik mora vidjeti ucinak svake promjene na stvarnom sadrzaju, a ne na zamracenoj stranici.
 */
export function mountDisplaySettings(doc: Document): DisplaySettingsController | null {
  montirani.get(doc)?.dispose();
  const gumb = doc.getElementById('displayBtn');
  if (!gumb) return null;

  const kontroler = new AbortController();
  const { signal } = kontroler;
  let postavke = readDisplaySettings();
  let osvjetljenje = readOsvjetljenje();
  applyOsvjetljenje(doc, osvjetljenje);
  applyDisplaySettings(doc, postavke);

  const panel = el(doc, 'aside', 'ps');
  panel.id = PANEL_ID;
  panel.hidden = true;
  const naslovId = PANEL_ID + 'Naslov';
  panel.setAttribute('aria-labelledby', naslovId);

  const glava = el(doc, 'div', 'ps__head');
  const naslovBlok = el(doc, 'div');
  naslovBlok.append(el(doc, 'span', 'ps__eyebrow', 'Postavke'));
  const naslov = el(doc, 'h2', 'ps__title', 'Prilagodi prikaz');
  naslov.id = naslovId;
  naslov.tabIndex = -1;
  naslovBlok.append(naslov);
  const zatvori = el(doc, 'button', 'ps__close', '✕');
  zatvori.type = 'button';
  zatvori.setAttribute('aria-label', 'Zatvori postavke prikaza');
  glava.append(naslovBlok, zatvori);

  const tijelo = el(doc, 'div', 'ps__body');

  const svjetlo = segmenti<Osvjetljenje>(doc, 'lektaOsvjetljenje', 'Osvjetljenje', 'lampa', [
    { value: 'dark', label: 'Radna lampa' },
    { value: 'light', label: 'Danje svjetlo' },
    { value: 'system', label: 'Kao sustav' },
  ], 'ps-seg--svjetlo');

  const pismoBlok = el(doc, 'div', 'ps-ctrl');
  const pismoOznaka = el(doc, 'label', 'ps-ctrl__lbl');
  pismoOznaka.append(doc.createTextNode('Pismo za čitanje'), el(doc, 'small', undefined, 'naslovi i opisi'));
  pismoOznaka.htmlFor = 'lektaPismo';
  const pismo = doc.createElement('select');
  pismo.id = 'lektaPismo';
  pismo.className = 'ps-select';
  for (const [vrijednost, natpis] of [
    ['default', 'Newsreader (zadano)'],
    ['serif', 'Sistemski serif'],
    ['sans', 'Sistemski sans'],
    ['dyslexic', 'Pismo za disleksiju'],
  ] as const) {
    const opcija = doc.createElement('option');
    opcija.value = vrijednost;
    opcija.textContent = natpis;
    pismo.append(opcija);
  }
  pismoBlok.append(pismoOznaka, pismo);

  // KONTROLA "VELICINA TEKSTA" JE UKLONJENA (Z7 pregled, 2026-09-20), NE PROSIRENA.
  //
  // Mijenjala je samo KORIJENSKU velicinu (`html:root[data-text-size]`, 15/16/18 px), a
  // tipografija radne povrsine je gotovo sva u px (`page-app.css`), ne u `rem`: korijen se
  // pomakne, uzorak u panelu se vidno promijeni, a stvarni rad jedva. Kontrola koja ne mijenja
  // nista je gora od one koje nema, jer korisnik vjeruje da je nesto promijenio (ista mjera kao
  // uz izostavljenu gustocu, gore u ovoj datoteci). VRATI OVDJE kad `page-app.css` prijede na
  // `rem` ljestvicu (Z5 `--fs-*`); dotad se ni pohrana ni pre-paint skripta ne dotice polja.

  const kontrast = preklopka(doc, 'lektaKontrast', 'Pojačan kontrast',
    'Tamnija tinta na papiru i izraženije linije, bez prigušenog teksta.');
  const pokret = preklopka(doc, 'lektaPokret', 'Manje pokreta',
    'Bez klizanja papira i prijelaza. Postavka sustava se poštuje i bez ovoga.');

  const primjer = el(doc, 'div', 'ps-ctrl');
  const uzorak = el(doc, 'div', 'ps-uzorak');
  uzorak.append(
    el(doc, 'span', 'ps-uzorak__eyebrow', 'Primjer'),
    el(doc, 'p', 'ps-uzorak__tekst',
      'Lijeva margina je 2,0 cm, pravilnik traži 3,0 cm. Ovako će izgledati tekst nalaza.'),
  );
  primjer.append(uzorak);

  tijelo.append(svjetlo.blok, pismoBlok, kontrast.blok, pokret.blok, primjer);

  const noga = el(doc, 'div', 'ps__foot');
  const vrati = el(doc, 'button', 'ps__reset', 'Vrati zadano');
  vrati.type = 'button';
  noga.append(el(doc, 'span', undefined, 'Sprema se u ovom pregledniku. Ne utječe na dokument.'), vrati);

  panel.append(glava, tijelo, noga);
  doc.body.append(panel);

  /** Sucelje uvijek pokazuje STANJE, nikad zadnji klik: jedan pisac, jedan citac. */
  const osvjezi = (): void => {
    for (const [vrijednost, unos] of svjetlo.unosi) unos.checked = vrijednost === osvjetljenje;
    pismo.value = postavke.readingFont;
    kontrast.unos.checked = postavke.contrast === 'high';
    pokret.unos.checked = postavke.motion === 'reduce';
  };

  const spremiPostavke = (promjena: Partial<DisplaySettings>): void => {
    postavke = { ...postavke, ...promjena };
    applyDisplaySettings(doc, postavke);
    writeDisplaySettings(postavke);
    osvjezi();
  };

  const spremiOsvjetljenje = (sljedece: Osvjetljenje): void => {
    osvjetljenje = sljedece;
    applyOsvjetljenje(doc, osvjetljenje);
    writeOsvjetljenje(osvjetljenje);
    osvjezi();
  };

  for (const [vrijednost, unos] of svjetlo.unosi) {
    unos.addEventListener('change', () => { if (unos.checked) spremiOsvjetljenje(vrijednost); }, { signal });
  }
  pismo.addEventListener('change', () => {
    spremiPostavke({ readingFont: jedanOd(PISMA, pismo.value, 'default') });
  }, { signal });
  kontrast.unos.addEventListener('change', () => {
    spremiPostavke({ contrast: kontrast.unos.checked ? 'high' : 'normal' });
  }, { signal });
  pokret.unos.addEventListener('change', () => {
    spremiPostavke({ motion: pokret.unos.checked ? 'reduce' : 'auto' });
  }, { signal });
  vrati.addEventListener('click', () => {
    // "Zadano" znaci zadano proizvoda, dakle i radna lampa, a ne samo cetiri polja iz `lekta.display`:
    // panel osvjetljenje nudi kao petu kontrolu, pa bi njegovo izuzimanje bilo iznenadenje.
    spremiOsvjetljenje(ZADANO_OSVJETLJENJE);
    spremiPostavke(ZADANE_POSTAVKE);
  }, { signal });

  const otvoren = (): boolean => !panel.hidden;
  const open = (): void => {
    if (otvoren()) return;
    panel.hidden = false;
    gumb.setAttribute('aria-expanded', 'true');
    // KLIZANJE IDE U SLJEDECEM KADRU. Dok je `hidden`, element nema kutiju, pa prijelaz nema iz
    // cega krenuti i panel bi samo iskocio. `hidden` je pritom i dalje jedini izvor istine o tome
    // je li panel otvoren; klasa nosi samo polozaj.
    const prozor = doc.defaultView;
    if (prozor && typeof prozor.requestAnimationFrame === 'function') {
      prozor.requestAnimationFrame(() => { if (otvoren()) panel.classList.add('ps--otvoren'); });
    } else {
      panel.classList.add('ps--otvoren');
    }
    naslov.focus();
  };
  const close = (): void => {
    if (!otvoren()) return;
    // Zatvaranje je trenutno, bez izlazne animacije: `hidden` mora pasti u ISTOM potezu u kojem se
    // fokus vraca na gumb, inace citac ekrana nakratko stoji u elementu koji vise nije otvoren.
    panel.classList.remove('ps--otvoren');
    panel.hidden = true;
    gumb.setAttribute('aria-expanded', 'false');
    gumb.focus();
  };

  gumb.setAttribute('aria-expanded', 'false');
  gumb.setAttribute('aria-controls', PANEL_ID);
  gumb.addEventListener('click', () => { if (otvoren()) close(); else open(); }, { signal });
  zatvori.addEventListener('click', close, { signal });
  doc.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Escape' && otvoren()) {
      event.preventDefault();
      close();
    }
  }, { signal });

  // LAMPA U NAVIGACIJI I RADIO U PANELU SU JEDNA ISTA POSTAVKA.
  //
  // `setupThemeToggle` u `src/shared/ui-boot.ts` ozicuje isti gumb, pa bi dva ozicenja preklapala
  // temu dvaput i poništavala se. Preuzimanje se zato OZNACI na samom gumbu, a ui-boot provjerava
  // oznaku UNUTAR svog rukovatelja, ne pri postavljanju: tako redoslijed montaze ne odlucuje o
  // ishodu (montaza ide pri evaluaciji modula, ui-boot boota na DOMContentLoaded, ali oslanjanje
  // na taj redoslijed bilo bi upravo ono sto ovaj repozitorij zove laznim zelenim).
  const lampa = doc.getElementById('themeBtn');
  if (lampa) {
    lampa.dataset.themeOwner = 'display-settings';
    const odraz = (): void => {
      // STANJE, NE ATRIBUT. U nacinu `system` atributa nema, pa ga je citanje `!== 'light'`
      // proglasavalo tamnim i kad je sustav na danjem svjetlu: citac ekrana je tada dobivao
      // "Lampa: ugasi" nad upaljenom lampom. `tamnoNaEkranu` pita `prefers-color-scheme` tocno
      // kad atributa nema, dakle tocno ono sto CSS u tom trenutku radi.
      const tamno = tamnoNaEkranu(doc);
      lampa.setAttribute('aria-pressed', tamno ? 'true' : 'false');
      lampa.setAttribute('aria-label', tamno ? 'Lampa: ugasi' : 'Lampa: upali');
      lampa.setAttribute('title', tamno ? 'Ugasi radnu lampu' : 'Upali radnu lampu');
    };
    odraz();
    lampa.addEventListener('click', () => {
      // Lampa je preklopnik dviju tema. Iz `system` vodi u suprotnost od onoga sto je NA EKRANU,
      // jer bi inace prvi klik izgledao kao da nije napravio nista. Ranija izvedba je racunala iz
      // atributa, kojeg u `system` nema, pa je uz svijetli sustav vodila u `light`, dakle u
      // vrijednost koja se vizualno ne razlikuje od zatecene: tocno tisina koju komentar odbija.
      spremiOsvjetljenje(suprotnaTema(doc));
      odraz();
    }, { signal });
  }

  osvjezi();
  const api: DisplaySettingsController = {
    panel,
    open,
    close,
    dispose(): void {
      montirani.delete(doc);
      kontroler.abort();
      panel.remove();
      gumb.removeAttribute('aria-expanded');
      gumb.removeAttribute('aria-controls');
      if (lampa) delete lampa.dataset.themeOwner;
    },
  };
  montirani.set(doc, api);
  return api;
}
