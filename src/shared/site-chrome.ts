/**
 * TRAKA I PODNOZJE KAO SUSTAV (ALIGNMENT Z15, PRVI KRUG).
 *
 * JEDAN IZVOR ZA PONASANJE I STIL, MARKUP JE STATICAN, I TO JE ODLUKA, NE PROPUST.
 *
 * Nalog je dopustao dvoje: JS koji traku gradi iz placeholdera, ili staticki markup iz istog
 * predloska. Izabran je STATICKI markup, i to zato sto ga produkcijski gardovi vec zahtijevaju:
 *
 *   - `tests/display-settings.test.ts` cita `index.html` i `rad/index.html` i trazi da OBA nose
 *     `id="displayBtn"`, `id="themeBtn"` i `aria-controls="lektaPrikazPanel"` U HTML-u; jedan test
 *     doslovno uzima tijelo `rad/index.html` kao markup i na njemu montira panel.
 *   - `tests/a11y-batch-2026-07-18.test.ts` cita osam stranica i trazi `<button class="lampa-btn"
 *     id="themeBtn"` s `aria-label` koji sadrzi "Lampa", te `#mobileNav` s `role="navigation"`.
 *
 * Traka koju gradi JS tim gardovima ne bi bila vidljiva, pa bi svaki od njih trebalo prepisati u
 * tvrdnju nad IZVOROM modula, dakle u slabiju tvrdnju. Staticki markup uz to radi bez JavaScripta
 * (odredista su prave poveznice), sto je za navigaciju i SEO jaci ishod od placeholdera.
 *
 * "Jedan izvor" je zato ovdje podijeljen po prirodi stvari, i svaki dio ima svoj cuvar:
 *   izgled     `site-chrome.css` (jedan list, uvozi ga `ui-boot.ts`, dakle svaka stranica)
 *   ponasanje  ovaj modul (kvacica, stanje skrola, lampa, mobilni list, koraci)
 *   markup     jednak blok na svakoj stranici, a JEDNAKOST MJERI `tests/site-chrome.test.ts`
 *
 * Bez te posljednje tvrdnje bi "jedan izvor" bio obecanje; s njom je mjera koja pada kad se
 * stranice raziduju.
 *
 * STO OVAJ KRUG NE RADI (drugi krug Z15): puno podnozje (kolofon, "Stanje stola", potpis koji se
 * puni tintom) i ozicenje View Transitions API-ja. `view-transition-name: nav-marker` je u CSS-u
 * pripremljen, ali nista ne pokrece prijelaz izmedu dokumenata.
 */
import PLATE_INDEX from '../../data/coverage/unit-kratice.json';
import { WORK_TYPE_ORDER, WORK_TYPE_TIERS, formatEurAmount } from '../report/pricing';
import { releasedPublicRouteGroups } from '../routes/shared/public-route-directory';
import { STORAGE_KEYS, safeStorageGet } from './browser-storage';
import { hrPlural } from '../routes/shared/site-stats-strip';
import { pokretPrigusen, suprotnaTema, tamnoNaEkranu } from './display-prefs';

/** Cetiri odredista trake; identiteti su STABILNI, natpisi su copy iz predloska. */
export const SITE_CHROME_DESTINATIONS: ReadonlyArray<{ readonly id: string; readonly label: string; readonly href: string }> = [
  { id: 'how', label: 'Kako radi', href: '/saznaj-vise/#how' },
  { id: 'pricing', label: 'Cjenik', href: '/saznaj-vise/#cjenik' },
  { id: 'tools', label: 'Pribor', href: '/alati.html' },
  { id: 'faculties', label: 'Po fakultetu', href: '/fakulteti/' },
];

/** Prag u pikselima nakon kojeg traka prelazi u tanko stanje (Z15: `>40px`). */
export const SITE_CHROME_SCROLL_THRESHOLD = 40;

/**
 * KORACI EKRANA `/rad/` (Z8, od Z15 zive u TRAKI, ne u kokpitu).
 *
 * Do Z15 ih je crtao `results-cockpit.ts`, pa su na `/rad/` stajali ISPOD ljepljive trake i bili
 * djelomicno skriveni. Model je ostao isti (isti identiteti, isti natpisi, isti jedan aktivan),
 * samo je mjesto crtanja preseljeno. `scanning` i dalje vraca PRAZAN niz: dok Lekta cita rad,
 * nema nalaza, pa bi "01 Nalazi" tvrdio posao koji nije obavljen.
 */
export type SiteChromeStage = 'scanning' | 'findings' | 'plan' | 'payment' | 'done';

export interface SiteChromeStep {
  readonly id: Exclude<SiteChromeStage, 'scanning'>;
  readonly ordinal: string;
  readonly label: string;
  readonly active: boolean;
}

const KORACI: ReadonlyArray<readonly [SiteChromeStep['id'], string, string]> = [
  ['findings', '01', 'Nalazi'],
  ['plan', '02', 'Plan'],
  ['payment', '03', 'Plaćanje'],
  ['done', '04', 'Rezultat'],
];

export function siteChromeSteps(stage: SiteChromeStage): readonly SiteChromeStep[] {
  if (stage === 'scanning') return [];
  return KORACI.map(([id, ordinal, label]) => ({ id, ordinal, label, active: id === stage }));
}

/** Je li vrijednost jedna od poznatih faza; atribut u HTML-u je tekst, pa se mora provjeriti. */
export function isSiteChromeStage(value: string | undefined | null): value is SiteChromeStage {
  return value === 'scanning' || value === 'findings' || value === 'plan' || value === 'payment' || value === 'done';
}

/**
 * NEAKTIVAN KORAK NIJE KONTROLA. `disabled` na `li` preglednik tiho zanemari, pa bi citac ekrana
 * korak najavio kao dostupan; `aria-disabled` kaze istu stvar na elementu koji kontrola nije.
 */
export function applySiteChromeStage(host: HTMLElement, stage: SiteChromeStage): void {
  const steps = siteChromeSteps(stage);
  const items = [...host.querySelectorAll<HTMLElement>('[data-site-chrome-step]')];
  host.hidden = steps.length === 0;
  for (const item of items) {
    const korak = steps.find((k) => k.id === item.dataset.siteChromeStep);
    item.classList.toggle('site-chrome__step--active', korak?.active === true);
    if (korak?.active === true) {
      item.setAttribute('aria-current', 'step');
      item.removeAttribute('aria-disabled');
    } else {
      item.removeAttribute('aria-current');
      item.setAttribute('aria-disabled', 'true');
    }
  }
}

/** Najniza cijena iz JEDINOG izvora cijene (`src/report/pricing.ts`), nikad prepisana. */
export function siteChromeLowestPrice(): string {
  const lowest = WORK_TYPE_ORDER
    .map((workType) => WORK_TYPE_TIERS[workType].priceEur)
    .reduce((min, price) => (price < min ? price : min));
  return `od ${formatEurAmount(lowest)} €`;
}

/** Broj alata: skupina `free-tools` iz javnog direktorija, bez samog rasadnika ("Svi alati"). */
export function siteChromeToolCount(): number {
  const group = releasedPublicRouteGroups.find((g) => g.id === 'free-tools');
  if (!group) return 0;
  return group.destinations.filter((destination) => destination.id !== 'tools').length;
}

/** Broj profila iz pecenog `unit-kratice.json`, isto kao traka s brojkama na `/saznaj-vise/`. */
export function siteChromeProfileNote(): string {
  const n = PLATE_INDEX.profiles;
  return `${n.toLocaleString('hr-HR')} ${hrPlural(n, 'profil', 'profila', 'profila')}`;
}

/** Natpis na plocici bez odabranog profila; copy predlozak nema, pa je ovo doslovna odluka F8. */
export const SITE_CHROME_PLATE_EMPTY = 'Odaberi profil';

/**
 * NATPIS MJEDENE PLOCICE (F8, odluka 2026-09-23): "FPZG · Dipl.".
 *
 * IZVOR JE PECEN INDEKS, NE REGISTAR PROFILA. Registar je 194 KB lazy chunk, a traka stoji na
 * svakoj stranici; zato `data/coverage/unit-kratice.json` (MALI artefakt, BEZ naziva ustanove;
 * usporedi `data/coverage/site-stats.json` koji naziv nosi za `/saznaj-vise/`) daje
 * `units[unitId]` i `workTypes[workType]`, a `npm run gen-site-stats` pece OBA artefakta iz ISTOG
 * izracuna (`computePlateIndex` u `src/coverage/site-stats.ts`). Kratica je pritom DETERMINISTICKI
 * IZVEDENA iz `unitId`-a, ne verificirana tvrdnja s izvorom; pravilo izvodjenja i razlog stoje u
 * `src/coverage/site-stats.ts`.
 *
 * NEPOZNATO NE BACA I NE IZMISLJA. Jedinica koje u indeksu nema (stara pohrana, korisnik je uredio
 * `localStorage`, jedinica uklonjena iz kataloga) daje zamjenski natpis, ne prazan gumb i ne
 * pogodjenu kraticu. Razina bez kratice (`article`, `project`: nisu razine studija) daje samo
 * kraticu ustanove, jer poluprazno "FPZG · " tvrdi da nesto fali.
 *
 * Cista funkcija nad zapisom pohrane, pa je test smije pozvati bez DOM-a i bez pohrane.
 */
export function siteChromePlateLabel(zapis: unknown): string {
  const prefs = (typeof zapis === 'object' && zapis !== null ? zapis : {}) as Record<string, unknown>;
  const unitId = typeof prefs.unit === 'string' ? prefs.unit : '';
  const units = PLATE_INDEX.units as Record<string, string | undefined>;
  const kratica = unitId !== '' ? units[unitId] : undefined;
  if (typeof kratica !== 'string' || kratica === '') return SITE_CHROME_PLATE_EMPTY;
  const workType = typeof prefs.workType === 'string' ? prefs.workType : '';
  const razine = PLATE_INDEX.workTypes as Record<string, string | undefined>;
  const razina = workType !== '' ? razine[workType] : undefined;
  return typeof razina === 'string' && razina !== '' ? `${kratica} · ${razina}` : kratica;
}

/** Natpis plocice iz pohrane ovog preglednika; odbijena pohrana daje zamjenski natpis. */
export function siteChromePlateFromStorage(): string {
  return siteChromePlateLabel(safeStorageGet(STORAGE_KEYS.preferences, null));
}

/**
 * Koliko ZAVRSENIH provjera ovaj preglednik pamti. `null` kad pohrana zakaze ili zapis nije
 * polje: napomena tada ne stoji, jer izmisljena brojka je gora od nijedne.
 */
export function siteChromeWorkNote(): string | null {
  const zapis: unknown = safeStorageGet(STORAGE_KEYS.history, null);
  if (!Array.isArray(zapis)) return null;
  const n = zapis.length;
  return `${n} ${hrPlural(n, 'rad', 'rada', 'radova')}`;
}

/**
 * Napomene mobilnog lista dolaze IZ IZVORA gdje izvor postoji. Predlozak crta najnizu cijenu, broj
 * profila i broj zapamcenih radova kao GOTOVE brojke; nijedna od njih nije prepisana, jer bi prva
 * promjena cjenika ili registra ucinila traku lazljivom. Iznosi se ovdje uz to NE SMIJU navesti ni
 * u komentaru: `tests/pricing-receipt.test.ts` trazi da nijedan iznos iz `WORK_TYPE_TIERS` ne stoji
 * nigdje u `src/` osim u `src/report/pricing.ts`, i pao je na ovom komentaru. Copy bez izvora
 * ("besplatno", "3 min") ostaje doslovan.
 */
export function siteChromeNote(kind: string): string | null {
  if (kind === 'price') return siteChromeLowestPrice();
  if (kind === 'profiles') return siteChromeProfileNote();
  if (kind === 'tools') return `${siteChromeToolCount()} alata`;
  if (kind === 'work') return siteChromeWorkNote();
  return null;
}

/**
 * Upise natpis plocice nad POSTOJECIM markupom. Staticki natpis je "Odaberi profil", pa stranica
 * bez JavaScripta ne tvrdi profil koji ne moze procitati; s JS-om se natpis zamijeni kraticom.
 * `aria-disabled` i `title="Uskoro"` ostaju NETAKNUTI (odluka F8: ladica Z13 ne postoji).
 */
function fillPlate(root: ParentNode): void {
  const slot = root.querySelector<HTMLElement>('[data-site-chrome-profile-label]');
  if (!slot) return;
  slot.textContent = siteChromePlateFromStorage();
}

function fillNotes(root: ParentNode): void {
  for (const slot of root.querySelectorAll<HTMLElement>('[data-site-chrome-note]')) {
    const text = siteChromeNote(slot.dataset.siteChromeNote ?? '');
    if (text === null) { slot.hidden = true; slot.textContent = ''; continue; }
    slot.hidden = false;
    slot.textContent = text;
  }
}

/**
 * PUTANJA TRENUTNE STRANICE, IZ `<link rel="canonical">`. Markup trake je isti predlozak na svih
 * 13 stranica, pa `data-site-chrome-active="tools"` sam po sebi ne kaze JE LI ovo `/alati.html` ili
 * jedna od sest alat-stranica koje isto pripadaju odjeljku "Pribor" a vode NA njega, ne jesu on.
 * Kanonska poveznica je jedina vrijednost koja je vec razlicita po stranici bez dodirivanja HTML-a
 * svake od njih (Z15 popravak F4).
 */
function trenutnaPutanja(doc: Document): string | null {
  const href = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
  if (!href) return null;
  try { return new URL(href, 'https://lekta.invalid/').pathname; } catch { return null; }
}

/** Putanja odredista bez sidra/upita, u istom obliku kao `trenutnaPutanja`. */
function putanjaOdredista(href: string): string {
  return href.split('#')[0]!.split('?')[0]!;
}

/**
 * AKTIVNO ODREDISTE I KVACICA KOJA PUTUJE.
 *
 * `left` se racuna iz izmjerenih pravokutnika, pa je u pregledniku tocan, a u happy-domu nula.
 * Zato se uz stil upisuje i `data-site-chrome-marker-for`: identitet mete je ono sto se DA
 * provjeriti bez rasporeda, i tvrdnja "kvacica prati aktivno odrediste" ne ovisi o layout motoru.
 *
 * `aria-current="page"` SAMO kad odrediste vodi bas na OVU stranicu (kanonska putanja se poklapa
 * s `href`-om, bez sidra); inace, dok je odjeljak aktivan, `aria-current="true"` kaze da stranica
 * PRIPADA odjeljku, ne da je odrediste. Prije Z15 popravka je sest alat-stranica davalo "page" na
 * "Pribor", iako link vodi na `/alati.html`, drugu stranicu (Z15 F4).
 */
export function markActiveDestination(chrome: HTMLElement, active: string | null): void {
  const links = [...chrome.querySelectorAll<HTMLElement>('[data-site-chrome-dest]')];
  const putanja = trenutnaPutanja(chrome.ownerDocument);
  let target: HTMLElement | null = null;
  for (const link of links) {
    const on = active !== null && link.dataset.siteChromeDest === active;
    if (on) {
      const href = link.getAttribute('href');
      const jeOvaStranica = putanja !== null && href !== null && putanjaOdredista(href) === putanja;
      link.setAttribute('aria-current', jeOvaStranica ? 'page' : 'true');
      if (link.closest('[data-site-chrome-dests]')) target = link;
    } else {
      link.removeAttribute('aria-current');
    }
  }
  const marker = chrome.querySelector<HTMLElement>('[data-site-chrome-marker]');
  if (!marker) return;
  if (!target) {
    marker.hidden = true;
    delete marker.dataset.siteChromeMarkerFor;
    return;
  }
  marker.hidden = false;
  marker.dataset.siteChromeMarkerFor = active ?? '';
  const parent = marker.parentElement;
  if (!parent || typeof target.getBoundingClientRect !== 'function') return;
  const okvir = parent.getBoundingClientRect();
  const meta = target.getBoundingClientRect();
  marker.style.left = `${Math.round(meta.left - okvir.left + 8)}px`;
}

/** Boja overlaya lampe je boja CILJNE teme, pa se stol otkriva u onome u sto ide, ne iz cega. */
export function lampOverlayTheme(doc: Document): 'dark' | 'light' {
  return tamnoNaEkranu(doc) ? 'light' : 'dark';
}

function playLamp(doc: Document, btn: HTMLElement): void {
  if (pokretPrigusen(doc)) return;
  const overlay = doc.createElement('div');
  overlay.className = 'site-chrome__reveal';
  const cilj = lampOverlayTheme(doc);
  overlay.dataset.siteChromeReveal = cilj;
  // Z15 popravak F5: `data-theme` CILJNE teme na overlayu (ne na <html>, koji tek treba
  // preci u nju) je jedini nacin da CSS procita `var(--desk)` CILJA umjesto trenutnog stanja,
  // bez duplog zapisa boje (design-system.css ostaje jedini izvor tokena).
  overlay.dataset.theme = cilj;
  overlay.setAttribute('aria-hidden', 'true');
  if (typeof btn.getBoundingClientRect === 'function') {
    const r = btn.getBoundingClientRect();
    overlay.style.setProperty('--lx', `${Math.round(r.left + r.width / 2)}px`);
    overlay.style.setProperty('--ly', `${Math.round(r.top + r.height / 2)}px`);
  }
  doc.body.append(overlay);
  const ukloni = (): void => overlay.remove();
  overlay.addEventListener('animationend', ukloni, { once: true });
  // Pojas i tregeri: bez `animationend` (ugasene animacije, prekinut prijelaz stranice) overlay ne
  // smije ostati preko stranice. Trajanje je isto kao u listu (.9s) plus rezerva.
  doc.defaultView?.setTimeout(ukloni, 1200);
}

/**
 * VLASNISTVO NAD LAMPOM SE NE OTIMA.
 *
 * Isti `#themeBtn` mogu ozicavati tri modula: ovaj, `ui-boot.ts` i panel "Prilagodi prikaz"
 * (`display-settings.ts`, od F10 na SVIM rutama, jer klik mora i osvjeziti radio u panelu). Dva
 * ziva ozicenja preklopila bi temu dvaput i ponistila je. Zato:
 *
 *   - ovaj modul preuzima gumb SAMO ako ga nitko nije preuzeo (`btn.dataset.themeOwner`),
 *   - panel montira POSLIJE i oznaku prepise na sebe; ovaj rukovatelj tada crta samo overlay,
 *   - `ui-boot.ts` provjerava oznaku unutar svog rukovatelja i ustupa.
 *
 * Oznaka se cita UNUTAR rukovatelja, ne pri postavljanju: redoslijed montaze time ne odlucuje o
 * ishodu, sto je isti razlog zbog kojeg je tako napisan i `ui-boot.ts`.
 *
 * KAPTURA NA DOKUMENTU, NE BUBBLE NA GUMBU, I TO JE CIJELI POPRAVAK BOJE OVERLAYA.
 *
 * Boja overlaya je boja CILJNE teme, a "ciljna" se racuna iz stanja PRIJE swapa. Dok je rukovatelj
 * stajao na samom gumbu, redoslijed registracije je odlucivao o boji: panel Z6 se montira pri
 * evaluaciji modula (`routes/intake/main.ts`, `routes/workspace/main.ts`; od F10 oba montira
 * `ui-boot.ts`), a ovaj modul na `DOMContentLoaded`, pa je na `/` i `/rad/` panel PRVI prebacio
 * temu i `playLamp` je citao vec promijenjeno stanje. Izmjereno: prelazak u svijetlu temu crtao
 * je TAMAN krug preko svijetle stranice. Listeneri na istoj meti idu po redoslijedu registracije
 * bez obzira na `capture`, ali faza KAPTURE na dokumentu po specifikaciji ide prije ciljne faze
 * na gumbu, pa ovako boja ne ovisi o tome koji se modul montirao prvi.
 */
export function wireSiteLamp(doc: Document, signal: AbortSignal): void {
  const btn = doc.getElementById('themeBtn');
  if (!btn) return;
  if (!btn.dataset.themeOwner) btn.dataset.themeOwner = 'site-chrome';
  doc.addEventListener('click', (event) => {
    const meta = event.target as HTMLElement | null;
    if (!meta || typeof meta.closest !== 'function' || meta.closest('#themeBtn') !== btn) return;
    playLamp(doc, btn);
    if (btn.dataset.themeOwner !== 'site-chrome') return;
    const next = suprotnaTema(doc);
    doc.documentElement.dataset.theme = next;
    try { localStorage.setItem('lekta.theme', next); } catch { /* pohrana odbijena; tema vrijedi do kraja sesije */ }
    const dark = tamnoNaEkranu(doc);
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    btn.setAttribute('aria-label', dark ? 'Lampa: ugasi' : 'Lampa: upali');
    btn.setAttribute('title', dark ? 'Ugasi radnu lampu' : 'Upali radnu lampu');
  }, { capture: true, signal });
}

function fokusiraj(el: HTMLElement | null): void {
  if (el && typeof el.focus === 'function') el.focus();
}

/**
 * MOBILNI LIST (<820px): pada na stol, Esc i klik izvan ga zatvaraju, fokus ulazi u list i vraca
 * se na hamburger. Bez vracanja fokusa tipkovnicni korisnik nakon zatvaranja stoji na `body`, pa
 * mu je sljedeci Tab pocetak stranice, a ne mjesto s kojeg je krenuo.
 */
export function wireSiteMenu(doc: Document, signal: AbortSignal): void {
  const btn = doc.getElementById('mobileMenuBtn');
  const sheet = doc.getElementById('mobileNav');
  if (!btn || !sheet) return;
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'mobileNav');
  const zatvori = (vratiFokus: boolean): void => {
    if (!sheet.classList.contains('open')) return;
    sheet.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    if (vratiFokus) fokusiraj(btn);
  };
  const otvori = (): void => {
    sheet.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    fokusiraj(sheet.querySelector<HTMLElement>('a, button'));
  };
  btn.addEventListener('click', (event) => {
    event.stopPropagation(); // inace ga document-klik ispod zatvori u istom dogadjaju
    if (sheet.classList.contains('open')) zatvori(true); else otvori();
  }, { signal });
  sheet.addEventListener('click', (event) => {
    const meta = (event.target as HTMLElement | null)?.closest('a, [data-display-open]');
    if (meta) zatvori(false);
  }, { signal });
  doc.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Escape') zatvori(true);
  }, { signal });
  doc.addEventListener('click', (event) => {
    if (!sheet.classList.contains('open')) return;
    const target = event.target as HTMLElement | null;
    if (target && (sheet.contains(target) || btn.contains(target))) return;
    zatvori(false);
  }, { signal });
}

/*
 * "Aa · Prikaz" U MOBILNOM LISTU VISE NIJE POSREDNIK (F10, odluka 2026-09-23).
 *
 * Do F10 je panel "Prilagodi prikaz" zivio samo na `/` i `/rad/`, pa je gumb u listu bio POSREDNIK
 * (`data-site-chrome-display-proxy`) koji je klik proslijedivao na `#displayBtn`, a na stranicama
 * bez panela se pri montazi UKLANJAO. Panel se od F10 montira na svim rutama kroz `ui-boot.ts`, pa
 * posrednik nema koga posredovati: gumb u listu je obican otvarac `[data-display-open]` koji
 * `display-settings.ts` ozicuje ravno na panel. `#displayBtn` pritom ostaje JEDINSTVEN u dokumentu
 * (gard u `tests/site-chrome.test.ts`), jer dva elementa s istim `id` su i dalje nevaljan HTML.
 *
 * Ovaj modul time o panelu ne zna nista osim imena atributa u listu (gornji `wireSiteMenu` ga
 * zatvara na klik), i to je namjerno: traka panel NE UVOZI (gard u `tests/display-settings.test.ts`).
 */

const montirani = new WeakMap<Document, AbortController>();

export function disposeSiteChrome(doc: Document): void {
  const kontroler = montirani.get(doc);
  if (!kontroler) return;
  montirani.delete(doc);
  kontroler.abort();
}

export interface SiteChromeHandle {
  /** Ponovno izmjeri polozaj kvacice (npr. nakon promjene sirine ili fonta). */
  readonly refresh: () => void;
  /** Postavi fazu koraka na `/rad/`; bez stepera u traci je no-op. */
  readonly setStage: (stage: SiteChromeStage) => void;
  /** Ocjena uz ime dokumenta; `null` je skriva. */
  readonly setScore: (score: number | null) => void;
}

/**
 * Montira ponasanje trake nad POSTOJECIM markupom. Vraca `null` kad stranica traku ne nosi, pa
 * modul smije boot-ati svugdje bez provjere po ruti.
 */
export function mountSiteChrome(doc: Document): SiteChromeHandle | null {
  const chrome = doc.querySelector<HTMLElement>('[data-site-chrome]');
  if (!chrome) return null;
  disposeSiteChrome(doc);
  const kontroler = new AbortController();
  montirani.set(doc, kontroler);
  const signal = kontroler.signal;

  const active = chrome.dataset.siteChromeActive ?? null;
  markActiveDestination(chrome, active === '' ? null : active);
  fillNotes(chrome);
  fillPlate(chrome);
  const footer = doc.querySelector<HTMLElement>('[data-site-footer]');
  if (footer) fillNotes(footer);

  const steps = chrome.querySelector<HTMLElement>('[data-site-chrome-steps]');
  const stage = chrome.dataset.siteChromeStage;
  // ZADANA FAZA JE `scanning` (bez koraka), NE `findings`. Prije nego je dokument odabran, traka ne
  // smije tvrditi "01 Nalazi": to je posao koji jos nije obavljen (Z15 popravak). Stranica bez
  // atributa ili s nepoznatom vrijednosti pada na isto sigurno stanje kao stranica koja ga eksplicitno
  // postavi na `scanning`.
  if (steps) applySiteChromeStage(steps, isSiteChromeStage(stage) ? stage : 'scanning');

  const refresh = (): void => markActiveDestination(chrome, active === '' ? null : active);
  const view = doc.defaultView;
  if (view) {
    const onScroll = (): void => {
      chrome.classList.toggle('site-chrome--scrolled', view.scrollY > SITE_CHROME_SCROLL_THRESHOLD);
    };
    onScroll();
    view.addEventListener('scroll', onScroll, { passive: true, signal });
    view.addEventListener('resize', refresh, { passive: true, signal });
  }

  wireSiteLamp(doc, signal);
  wireSiteMenu(doc, signal);

  return {
    refresh,
    setStage: (next: SiteChromeStage): void => { if (steps) applySiteChromeStage(steps, next); },
    setScore: (score: number | null): void => {
      const cell = chrome.querySelector<HTMLElement>('[data-site-chrome-score]');
      if (!cell) return;
      if (score === null || !Number.isFinite(score)) { cell.hidden = true; cell.textContent = ''; return; }
      cell.hidden = false;
      cell.textContent = String(Math.round(score));
    },
  };
}

/**
 * OCJENA U TRAKI, IZ KOKPITA. Kokpit je jedino mjesto koje ocjenu vec zna, pa je ovo uzak izlaz
 * prema traci, bez ikakvog znanja o modelu rezultata na strani trake. Bez montirane trake je
 * no-op, pa kokpit ne mora znati na kojoj je ruti.
 */
export function setSiteChromeScore(doc: Document, score: number | null): void {
  const chrome = doc.querySelector<HTMLElement>('[data-site-chrome]');
  const cell = chrome?.querySelector<HTMLElement>('[data-site-chrome-score]');
  if (!cell) return;
  if (score === null || !Number.isFinite(score)) { cell.hidden = true; cell.textContent = ''; return; }
  cell.hidden = false;
  cell.textContent = String(Math.round(score));
}

/**
 * PLOCICA U TRAKI, NAKON STO KORISNIK ODABERE USTANOVU I VRSTU RADA. Isti uzak izlaz kao
 * `setSiteChromeScore`: pozivatelj (`app.ts`) ne treba drzati referencu na `SiteChromeHandle` iz
 * `mountSiteChrome`, samo dokument. Ponovno cita pohranu (`siteChromePlateFromStorage`), pa poziv
 * nakon `savePreferences()` osvjezi plocicu bez reloada. Bez montirane trake je no-op.
 */
export function setSiteChromePlate(doc: Document): void {
  const chrome = doc.querySelector<HTMLElement>('[data-site-chrome]');
  const slot = chrome?.querySelector<HTMLElement>('[data-site-chrome-profile-label]');
  if (!slot) return;
  slot.textContent = siteChromePlateFromStorage();
}

/**
 * FAZA U TRAKI, IZ TOKA ANALIZE (Z15 popravak). Isti uzak izlaz kao `setSiteChromeScore`: pozivatelj
 * (main.ts, results-cockpit.ts) ne treba drzati referencu na `SiteChromeHandle` iz `mountSiteChrome`,
 * samo dokument. Bez montirane trake je no-op.
 */
export function setSiteChromeStage(doc: Document, stage: SiteChromeStage): void {
  const chrome = doc.querySelector<HTMLElement>('[data-site-chrome]');
  const steps = chrome?.querySelector<HTMLElement>('[data-site-chrome-steps]');
  if (!steps) return;
  applySiteChromeStage(steps, stage);
  if (chrome) chrome.dataset.siteChromeStage = stage;
}
