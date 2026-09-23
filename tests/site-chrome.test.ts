/**
 * TRAKA I PODNOZJE KAO SUSTAV (ALIGNMENT Z15, prvi krug).
 *
 * ZASTO BAS OVAJ GARD. Markup trake je STATICAN i stoji u svakoj stranici (obrazlozenje je u
 * zaglavlju `src/shared/site-chrome.ts`: produkcijski gardovi ga citaju iz HTML-a, a navigacija
 * mora raditi bez JavaScripta). Staticki markup po stranicama se, medjutim, moze RAZICI, i tada
 * "jedan izvor" postaje obecanje bez mjere. Ovaj list zato mjeri dvoje:
 *
 *   1. SVE stranice nose ISTU traku (cetiri odredista, isti identiteti, isti natpisi, isti
 *      poredak, jedna kvacica, jedna lampa, jedan mobilni list) i ISTO pravno podnozje.
 *   2. Ponasanje iz `site-chrome.ts` radi NAD TIM STVARNIM markupom, ne nad izmisljenim: svaki
 *      DOM test uzima zaglavlje i podnozje iz prave datoteke.
 *
 * Svaka tvrdnja ima mutaciju, i svaka mutacija ima baseline nad neizmijenjenim markupom: gard koji
 * vristi na sve jednako je bezvrijedan kao gard koji ne vidi nista.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import {
  SITE_CHROME_DESTINATIONS,
  SITE_CHROME_SCROLL_THRESHOLD,
  applySiteChromeStage,
  disposeSiteChrome,
  isSiteChromeStage,
  lampOverlayTheme,
  markActiveDestination,
  mountSiteChrome,
  siteChromeLowestPrice,
  siteChromeSteps,
  siteChromeToolCount,
  siteChromePlateLabel,
  setSiteChromeScore,
  setSiteChromeStage,
  SITE_CHROME_PLATE_EMPTY,
} from '../src/shared/site-chrome';
import { unitKratica } from '../src/coverage/site-stats';
import { WORK_TYPE_ORDER, WORK_TYPE_TIERS, formatEurAmount } from '../src/report/pricing';
import { legalDocuments } from '../src/legal/legal-content';

const ROOT = resolve(__dirname, '..');
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8');

/** Stil bez komentara: gard nad CSS-om ne smije naci tvrdnju u tekstu koji preglednik ne cita. */
const bezKomentara = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * SVE stranice koje po nalogu Z15 nose traku. Popis je IMENOVAN, ne prebrojan: nova stranica koja
 * traku zaboravi montirati mora se vidjeti kao izostanak imena, ne kao promjena broja.
 */
const STRANICE = [
  'index.html',
  'rad/index.html',
  'alati.html',
  'citat.html',
  'izjava.html',
  'kartice.html',
  'literatura.html',
  'naslovnica.html',
  'citati-i-literatura.html',
  'landing_usporedba.html',
  'landing_benchmark.html',
  'saznaj-vise/index.html',
  'moji-radovi/index.html',
] as const;

/** Zaglavlje kao tekst; usporedbe su neosjetljive na CR (CLAUDE.md, tekstualne usporedbe). */
function zaglavlje(html: string): string {
  const od = html.indexOf('<header class="topbar site-chrome"');
  const doIdx = html.indexOf('</header>', od);
  expect(od, 'stranica ne nosi traku Z15').toBeGreaterThan(-1);
  expect(doIdx, 'zaglavlje trake nije zatvoreno').toBeGreaterThan(od);
  return html.slice(od, doIdx + '</header>'.length).split('\r\n').join('\n');
}

function podnozje(html: string): string {
  const od = html.indexOf('<footer class="site-footer" data-site-footer="legal">');
  const doIdx = html.indexOf('</footer>', od);
  expect(od, 'stranica ne nosi pravni minimum podnozja').toBeGreaterThan(-1);
  return html.slice(od, doIdx + '</footer>'.length).split('\r\n').join('\n');
}

/** Cista funkcija nad tekstom, pa se smije mutirati: odredista iz `[data-site-chrome-dests]`. */
export function odredistaIzTrake(header: string): Array<{ id: string; href: string; label: string }> {
  const od = header.indexOf('data-site-chrome-dests');
  const doIdx = header.indexOf('</nav>', od);
  if (od < 0 || doIdx < 0) return [];
  const blok = header.slice(od, doIdx);
  return [...blok.matchAll(/<a class="site-chrome__dest" data-site-chrome-dest="([^"]+)" href="([^"]+)">([^<]+)<\/a>/g)]
    .map((m) => ({ id: m[1], href: m[2], label: m[3] }));
}

/**
 * Pravilo za natpis koraka iz MOBILNOG bloka (`@media (max-width: 819px)`), ne iz cijelog lista.
 * Cista funkcija nad tekstom, pa se smije mutirati; prazan rezultat znaci da pravila ondje nema.
 */
export function mobilnoPraviloNatpisa(css: string): string {
  const bezK = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const mobilni = bezK.match(/@media \(max-width: 819px\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  return mobilni.match(/\.site-chrome__step-label \{[^}]*\}/)?.[0] ?? '';
}

/** Odrediste poveznice "Sve pravno" iz podnozja; cista funkcija nad tekstom, pa se smije mutirati. */
export function svePravnoOdrediste(foot: string): string | null {
  return foot.match(/<a class="site-footer__sve" href="([^"]+)">/)?.[1] ?? null;
}

/** Kanonska poveznica stvarne stranice, iz `<link rel="canonical">` u njenom `<head>`. */
function kanonskaOd(rel: string): string {
  const html = read(rel);
  const m = html.match(/<link rel="canonical" href="([^"]+)">/);
  if (!m) throw new Error(`${rel}: nema <link rel="canonical">`);
  return m[1]!;
}

/**
 * `canonicalHref` je izostavljiv jer vecina testova ne ovisi o identitetu STRANICE, samo o
 * markupu trake; `null` (zadano) ostavlja `<head>` prazan, pa `markActiveDestination` ne moze
 * pogresno tvrditi "ovo JE ta stranica" (Z15 popravak F4). `document.head` se ovdje UVIJEK
 * postavlja, ne samo kad je argument dan, jer test koji dodje NAKON testa sa kanonskim linkom
 * bi ga inace naslijedio (isti `document` kroz cijeli list).
 */
function dom(html: string, canonicalHref: string | null = null): Document {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-motion');
  document.head.innerHTML = canonicalHref ? `<link rel="canonical" href="${canonicalHref}">` : '';
  document.body.innerHTML = html;
  return document;
}

describe('Z15 traka: ISTI markup na svim stranicama', () => {
  it.each(STRANICE)('%s nosi traku s cetiri kanonska odredista u tocnom poretku', (rel) => {
    const odredista = odredistaIzTrake(zaglavlje(read(rel)));
    expect(odredista).toEqual(SITE_CHROME_DESTINATIONS.map((d) => ({ id: d.id, href: d.href, label: d.label })));
  });

  it('MUTACIJA: izbaceno, preimenovano i prerasporedjeno odrediste svi padaju', () => {
    const header = zaglavlje(read('alati.html'));
    const osnovica = odredistaIzTrake(header);
    // BASELINE: neizmijenjena traka je cista, inace tvrdnje ispod nista ne dokazuju.
    expect(osnovica).toHaveLength(4);

    const bezCjenika = header.replace(/<a class="site-chrome__dest" data-site-chrome-dest="pricing"[^>]*>[^<]*<\/a>\n?/, '');
    expect(bezCjenika, 'podmetanje se nije primilo; provjeri oznaku odredista').not.toBe(header);
    expect(odredistaIzTrake(bezCjenika)).toHaveLength(3);

    const preimenovan = header.replace('>Pribor<', '>Alati<');
    expect(preimenovan).not.toBe(header);
    expect(odredistaIzTrake(preimenovan).map((d) => d.label)).not.toEqual(osnovica.map((d) => d.label));

    const drugiHref = header.replace('href="/fakulteti/"', 'href="/fakulteti.html"');
    expect(drugiHref).not.toBe(header);
    expect(odredistaIzTrake(drugiHref)).not.toEqual(osnovica);
  });

  it.each(STRANICE)('%s nosi JEDNU kvacicu, JEDNU lampu i JEDAN mobilni list', (rel) => {
    const header = zaglavlje(read(rel));
    expect((header.match(/data-site-chrome-marker/g) ?? []).length).toBe(1);
    expect((header.match(/id="themeBtn"/g) ?? []).length).toBe(1);
    expect((header.match(/id="mobileNav"/g) ?? []).length).toBe(1);
    expect((header.match(/id="mobileMenuBtn"/g) ?? []).length).toBe(1);
    // Hamburger MORA imenovati list koji otvara, inace citac ekrana ne zna gdje se stanje mijenja.
    expect(header).toContain('aria-controls="mobileNav"');
    expect(header).toContain('aria-expanded="false"');
  });

  it.each(STRANICE)('%s: mobilni list je navigacijska prekretnica s imenom', (rel) => {
    const header = zaglavlje(read(rel));
    // `<nav>` JE landmark po HTML-u, pa `role="navigation"` na njemu nije potreban; ime jest, jer
    // stranica ima vise navigacija (traka, list, podnozje) i bez imena se ne razlikuju.
    expect(header).toMatch(/<nav class="site-chrome__sheet" id="mobileNav" aria-label="Mobilna navigacija">/);
  });

  it('MUTACIJA: list bez imena i list bez landmarka padaju', () => {
    const header = zaglavlje(read('alati.html'));
    const bezImena = header.replace(' aria-label="Mobilna navigacija"', '');
    expect(bezImena).not.toBe(header);
    expect(bezImena).not.toMatch(/<nav class="site-chrome__sheet" id="mobileNav" aria-label="Mobilna navigacija">/);
    const div = header.replace('<nav class="site-chrome__sheet" id="mobileNav"', '<div class="site-chrome__sheet" id="mobileNav"');
    expect(div).not.toBe(header);
    expect(div).not.toMatch(/<nav class="site-chrome__sheet" id="mobileNav" aria-label="Mobilna navigacija">/);
    // BASELINE.
    expect(header).toMatch(/<nav class="site-chrome__sheet" id="mobileNav" aria-label="Mobilna navigacija">/);
  });
});

describe('Z15: pecat i sredina po vrsti stranice', () => {
  it('marketinske stranice nose pecat "Provjeri rad", `/rad/` ga NE nosi', () => {
    for (const rel of ['alati.html', 'citat.html', 'saznaj-vise/index.html', 'moji-radovi/index.html']) {
      expect(zaglavlje(read(rel)), rel).toContain('class="site-chrome__stamp"');
    }
    // Na `/rad/` korisnik VEC provjerava rad; pecat bi vodio na ekran na kojem je dosao.
    expect(zaglavlje(read('rad/index.html'))).not.toContain('site-chrome__stamp');
    // Ulaz `/` je isti slucaj: pecat bi vodio na sam sebe, a ekran ima jednu radnju (papir).
    expect(zaglavlje(read('index.html'))).not.toContain('site-chrome__stamp');
  });

  it('`/rad/`: sredina trake nosi ime dokumenta, ocjenu i stepper', () => {
    const header = zaglavlje(read('rad/index.html'));
    expect(header).toContain('id="radDocName"');
    expect(header).toContain('data-site-chrome-score');
    expect(header).toContain('data-site-chrome-steps');
    // Z15 popravak: pocetna faza je BEZ koraka ("01 Nalazi" jos nije tocna tvrdnja dok dokument
    // nije ni odabran). `site-chrome.ts` je preuzima na mount i tok analize je mijenja dalje
    // (`tests/site-chrome.test.ts` "tok analize STVARNO zove setSiteChromeStage" ispod).
    expect(header).toContain('data-site-chrome-stage="scanning"');
    const koraci = [...header.matchAll(/data-site-chrome-step="([^"]+)"/g)].map((m) => m[1]);
    expect(koraci).toEqual(['findings', 'plan', 'payment', 'done']);
  });

  it('stepper je OTISAO iz kokpita rezultata: jedan izvor, jedno mjesto', () => {
    // Do Z15 ga je crtao kokpit, pa je stajao ISPOD ljepljive trake i bio djelomicno skriven.
    const kokpit = read('src/ui/results/results-cockpit.ts');
    expect(kokpit).not.toContain('cockpitStepsHtml(');
    expect(kokpit).not.toContain('export function cockpitSteps');
    expect(read('src/ui/results/result-visuals.css')).not.toContain('.cockpit-step {');
  });

  it('nijedna stranica OSIM `/rad/` ne nosi stepper u traki', () => {
    for (const rel of STRANICE.filter((r) => r !== 'rad/index.html')) {
      expect(zaglavlje(read(rel)), rel).not.toContain('data-site-chrome-steps');
    }
  });
});

describe('Z15 koraci: model i primjena', () => {
  it('stanje analize nema korake, jer nalaza jos nema', () => {
    expect(siteChromeSteps('scanning')).toEqual([]);
    expect(siteChromeSteps('findings')).toHaveLength(4);
    expect(siteChromeSteps('findings').filter((k) => k.active)).toHaveLength(1);
  });

  it('faza iz atributa se PROVJERAVA, jer je atribut tekst', () => {
    expect(isSiteChromeStage('plan')).toBe(true);
    expect(isSiteChromeStage('nepoznato')).toBe(false);
    expect(isSiteChromeStage(undefined)).toBe(false);
  });

  it('primjena faze ostavlja TOCNO jedan aktivan korak, ostali su aria-disabled', () => {
    const doc = dom(zaglavlje(read('rad/index.html')));
    const host = doc.querySelector<HTMLElement>('[data-site-chrome-steps]')!;
    applySiteChromeStage(host, 'payment');
    const koraci = [...host.querySelectorAll('[data-site-chrome-step]')];
    expect(koraci.filter((k) => k.getAttribute('aria-current') === 'step')).toHaveLength(1);
    expect(koraci.find((k) => k.getAttribute('aria-current') === 'step')!.getAttribute('data-site-chrome-step')).toBe('payment');
    for (const korak of koraci.filter((k) => !k.hasAttribute('aria-current'))) {
      expect(korak.getAttribute('aria-disabled')).toBe('true');
      // `disabled` na `li` preglednik tiho zanemari, pa bi korak izgledao dostupan.
      expect(korak.hasAttribute('disabled')).toBe(false);
      expect(korak.tagName).toBe('LI');
    }
  });

  it('MUTACIJA: dvije aktivne faze ne mogu nastati, a scanning sve sklapa', () => {
    const doc = dom(zaglavlje(read('rad/index.html')));
    const host = doc.querySelector<HTMLElement>('[data-site-chrome-steps]')!;
    applySiteChromeStage(host, 'plan');
    applySiteChromeStage(host, 'done');
    expect([...host.querySelectorAll('[aria-current="step"]')]).toHaveLength(1);
    applySiteChromeStage(host, 'scanning');
    expect(host.hidden).toBe(true);
    // BASELINE: povratak u fazu ga vraca, pa `hidden` nije jednosmjerna vrata.
    applySiteChromeStage(host, 'findings');
    expect(host.hidden).toBe(false);
  });
});

describe('Z15 kvacica: prati aktivno odrediste', () => {
  it('stranica pribora ima TOCNO jedno `aria-current="page"`, i to Pribor', () => {
    const doc = dom(zaglavlje(read('alati.html')), kanonskaOd('alati.html'));
    mountSiteChrome(doc);
    const aktivni = [...doc.querySelectorAll('[data-site-chrome-dest][aria-current="page"]')];
    // Dva su: jedan u traci, jedan u mobilnom listu; oba su ISTO odrediste.
    expect(new Set(aktivni.map((a) => a.getAttribute('data-site-chrome-dest')))).toEqual(new Set(['tools']));
    const marker = doc.querySelector<HTMLElement>('[data-site-chrome-marker]')!;
    expect(marker.dataset.siteChromeMarkerFor).toBe('tools');
    expect(marker.hidden).toBe(false);
  });

  it('kvacica PUTUJE: promjena aktivnog odredista pomice metu', () => {
    // Bez kanonske poveznice ovaj test namjerno ne tvrdi "page" naspram "true" (to je F4 test
    // ispod); ovdje je predmet SAMO da se metu pomakne tocno jedno odrediste.
    const doc = dom(zaglavlje(read('alati.html')));
    const chrome = doc.querySelector<HTMLElement>('[data-site-chrome]')!;
    const marker = doc.querySelector<HTMLElement>('[data-site-chrome-marker]')!;
    markActiveDestination(chrome, 'tools');
    expect(marker.dataset.siteChromeMarkerFor).toBe('tools');
    markActiveDestination(chrome, 'faculties');
    expect(marker.dataset.siteChromeMarkerFor).toBe('faculties');
    expect([...doc.querySelectorAll('[data-site-chrome-dests] [aria-current]')]
      .map((a) => a.getAttribute('data-site-chrome-dest'))).toEqual(['faculties']);
  });

  it('bez aktivnog odredista kvacice NEMA, umjesto da stoji na prvom', () => {
    // Ulaz `/` i `/rad/` nisu nijedno od cetiri odredista; kvacica na prvom bi lagala.
    const doc = dom(zaglavlje(read('index.html')));
    mountSiteChrome(doc);
    const marker = doc.querySelector<HTMLElement>('[data-site-chrome-marker]')!;
    expect(marker.hidden).toBe(true);
    expect(marker.dataset.siteChromeMarkerFor).toBeUndefined();
    expect(doc.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });

  it('MUTACIJA: nepoznat identitet aktivnog odredista ne oznaci nista i ne pogodi pogresno', () => {
    const doc = dom(zaglavlje(read('alati.html')), kanonskaOd('alati.html'));
    const chrome = doc.querySelector<HTMLElement>('[data-site-chrome]')!;
    markActiveDestination(chrome, 'nepostojece');
    expect(doc.querySelectorAll('[aria-current]')).toHaveLength(0);
    // BASELINE i kontrola smjera: poznat identitet i dalje oznaci tocno jedno odrediste u traci.
    markActiveDestination(chrome, 'tools');
    expect(doc.querySelectorAll('[data-site-chrome-dests] [aria-current="page"]')).toHaveLength(1);
  });

  /**
   * F4 (Z15 popravak): `aria-current="page"` samo kad odrediste vodi BAS na ovu stranicu.
   * Sest alat-stranica (citat, izjava, kartice, literatura, naslovnica, citati-i-literatura)
   * dijeli `data-site-chrome-active="tools"` s `alati.html`, ali "Pribor" vodi NA `/alati.html`,
   * ne na njih: prije popravka su sve dobivale "page", cega citac ekrana ne bi trebao tvrditi
   * na sest razlicitih stranica istovremeno.
   */
  it('F4: sest alat-stranica dijeli odjeljak "tools" ali SAMO alati.html je "page"', () => {
    for (const rel of ['citat.html', 'izjava.html', 'kartice.html', 'literatura.html', 'naslovnica.html', 'citati-i-literatura.html']) {
      const doc = dom(zaglavlje(read('alati.html')), kanonskaOd(rel));
      mountSiteChrome(doc);
      const pribor = doc.querySelector('[data-site-chrome-dests] [data-site-chrome-dest="tools"]')!;
      expect(pribor.getAttribute('aria-current'), `${rel}: "Pribor" ne bi smio tvrditi da je ova stranica`).toBe('true');
      expect(doc.querySelectorAll('[aria-current="page"]'), rel).toHaveLength(0);
    }
    const nula = dom(zaglavlje(read('alati.html')), kanonskaOd('alati.html'));
    mountSiteChrome(nula);
    expect(nula.querySelector('[data-site-chrome-dests] [data-site-chrome-dest="tools"]')!.getAttribute('aria-current')).toBe('page');
  });
});

describe('Z15 lampa: overlay ciljne teme, tema i pohrana', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-motion');
  });
  afterEach(() => disposeSiteChrome(document));

  it('klik mijenja `data-theme` I pohranu `lekta.theme`', () => {
    const doc = dom(zaglavlje(read('alati.html')));
    doc.documentElement.dataset.theme = 'dark';
    mountSiteChrome(doc);
    doc.getElementById('themeBtn')!.click();
    expect(doc.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('lekta.theme')).toBe('light');
    doc.getElementById('themeBtn')!.click();
    expect(doc.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('lekta.theme')).toBe('dark');
  });

  it('overlay je boje CILJNE teme i nestaje; pod `data-motion="reduce"` ga NEMA', () => {
    const doc = dom(zaglavlje(read('alati.html')));
    doc.documentElement.dataset.theme = 'dark';
    mountSiteChrome(doc);
    expect(lampOverlayTheme(doc)).toBe('light');
    doc.getElementById('themeBtn')!.click();
    const overlay = doc.querySelector<HTMLElement>('.site-chrome__reveal');
    expect(overlay, 'lampa nije nacrtala overlay').not.toBeNull();
    expect(overlay!.dataset.siteChromeReveal).toBe('light');
    // Z15 popravak F5: overlay nosi VLASTITI data-theme (ciljne teme), da CSS procita
    // `var(--desk)` cilja umjesto onoga sto trenutno stoji na <html>-u.
    expect(overlay!.dataset.theme).toBe('light');
    overlay!.remove();

    // PRIGUSEN POKRET: samo swap, bez otkrivanja. Isto vrijedi za `prefers-reduced-motion`, koji
    // `pokretPrigusen` cita iz istog izvora kao i ovaj atribut.
    doc.documentElement.dataset.motion = 'reduce';
    doc.getElementById('themeBtn')!.click();
    expect(doc.querySelector('.site-chrome__reveal')).toBeNull();
    // Tema se I DALJE mijenja: prigusen pokret gasi otkrivanje, ne kontrolu. Prvi klik iznad je
    // vec prebacio u `light`, pa je ovaj drugi klik natrag u `dark`.
    expect(doc.documentElement.dataset.theme).toBe('dark');
  });

  it('BOJA OVERLAYA NE OVISI O REDOSLIJEDU MONTAZE: panel Z6 prebaci temu, krug je ipak ciljne boje', () => {
    // KVAR KOJI OVO CUVA. `mountDisplaySettings` se na `/` i `/rad/` zove pri evaluaciji modula
    // (`routes/intake/main.ts`, `routes/workspace/main.ts`), a `mountSiteChrome` na
    // `DOMContentLoaded`, pa je panel svoj rukovatelj registrirao PRVI. Dok je lampa slusala klik
    // na samom gumbu, rukovatelji su se izvodili po redoslijedu registracije: panel je temu vec
    // prebacio, a `playLamp` je citao promijenjeno stanje i crtao krug boje iz koje se IZLAZI.
    // Izmjereno: tema poslije klika `light`, overlay `dark`, dakle taman krug preko svijetle
    // stranice. Popravak je faza KAPTURE na dokumentu, koja ide prije ciljne faze na gumbu.
    const doc = dom(zaglavlje(read('rad/index.html')));
    doc.documentElement.dataset.theme = 'dark';
    const btn = doc.getElementById('themeBtn')!;
    // TUDJI RUKOVATELJ, REGISTRIRAN PRVI, tocno kao panel Z6: preuzme vlasnistvo i prebaci temu.
    btn.dataset.themeOwner = 'display-settings';
    btn.addEventListener('click', () => {
      doc.documentElement.dataset.theme = doc.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    });
    mountSiteChrome(doc);
    btn.click();
    expect(doc.documentElement.dataset.theme, 'sentinel: vlasnik nije prebacio temu').toBe('light');
    const overlay = doc.querySelector<HTMLElement>('.site-chrome__reveal');
    expect(overlay, 'lampa nije nacrtala overlay').not.toBeNull();
    expect(overlay!.dataset.siteChromeReveal, 'krug nije boje CILJNE teme').toBe('light');
    // KONTROLA SMJERA, dakle dokaz da tvrdnja gore nije vakuumska: da se boja racunala POSLIJE
    // swapa (stari kod), `lampOverlayTheme` bi nad istim dokumentom vratio suprotnu vrijednost.
    expect(lampOverlayTheme(doc)).toBe('dark');
  });

  it('VLASNISTVO: kad gumb preuzme panel Z6, traka temu NE mijenja (inace se preklopi dvaput)', () => {
    const doc = dom(zaglavlje(read('rad/index.html')));
    doc.documentElement.dataset.theme = 'dark';
    const btn = doc.getElementById('themeBtn')!;
    btn.dataset.themeOwner = 'display-settings';
    mountSiteChrome(doc);
    btn.click();
    expect(doc.documentElement.dataset.theme, 'traka je pregazila vlasnika gumba').toBe('dark');
    expect(localStorage.getItem('lekta.theme')).toBeNull();
    // Overlay je i dalje nacrtan: pokret pripada traci, odluka o temi vlasniku.
    expect(doc.querySelector('.site-chrome__reveal')).not.toBeNull();
    // BASELINE: bez tudjeg vlasnika ista traka temu mijenja, pa tvrdnja gore nije vakuumska.
    disposeSiteChrome(doc);
    const drugi = dom(zaglavlje(read('rad/index.html')));
    drugi.documentElement.dataset.theme = 'dark';
    mountSiteChrome(drugi);
    drugi.getElementById('themeBtn')!.click();
    expect(drugi.documentElement.dataset.theme).toBe('light');
  });
});

describe('Z15 mobilni list: otvaranje, Esc i fokus', () => {
  afterEach(() => disposeSiteChrome(document));

  it('hamburger otvara list, Esc ga zatvara i VRACA fokus na hamburger', () => {
    const doc = dom(zaglavlje(read('alati.html')));
    mountSiteChrome(doc);
    const btn = doc.getElementById('mobileMenuBtn')!;
    const sheet = doc.getElementById('mobileNav')!;
    expect(sheet.classList.contains('open')).toBe(false);

    btn.click();
    expect(sheet.classList.contains('open')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    // Fokus ulazi U LIST: bez toga tipkovnicni korisnik otvori izbornik i ostane izvan njega.
    expect(sheet.contains(doc.activeElement)).toBe(true);

    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(sheet.classList.contains('open')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(doc.activeElement).toBe(btn);
  });

  it('klik IZVAN lista zatvara, klik unutar lista ne zatvara sam po sebi', () => {
    const doc = dom(zaglavlje(read('alati.html')) + '<main id="izvan">tekst</main>');
    mountSiteChrome(doc);
    const btn = doc.getElementById('mobileMenuBtn')!;
    const sheet = doc.getElementById('mobileNav')!;
    btn.click();
    expect(sheet.classList.contains('open')).toBe(true);
    sheet.querySelector<HTMLElement>('.site-chrome__sheet-eyebrow')!.click();
    expect(sheet.classList.contains('open'), 'klik unutar lista ga je zatvorio').toBe(true);
    doc.getElementById('izvan')!.click();
    expect(sheet.classList.contains('open')).toBe(false);
  });

  it('MUTACIJA: drugi klik na hamburger zatvara, a ne otvara dvaput', () => {
    const doc = dom(zaglavlje(read('alati.html')));
    mountSiteChrome(doc);
    const btn = doc.getElementById('mobileMenuBtn')!;
    const sheet = doc.getElementById('mobileNav')!;
    btn.click();
    btn.click();
    expect(sheet.classList.contains('open')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  /**
   * F10 (odluka 2026-09-23): "Aa i Prikaz" U LISTU JE OTVARAC, NE POSREDNIK.
   *
   * Do F10 je panel "Prilagodi prikaz" zivio samo na `/` i `/rad/`, pa je gumb u listu bio
   * posrednik (`data-site-chrome-display-proxy`) koji je klik proslijedivao na `#displayBtn`, a
   * na ostalih 11 stranica se pri montazi UKLANJAO: kontrola koja se obeca i onda nestane.
   * Panel se od F10 montira na svim rutama kroz `ui-boot.ts`, pa je gumb obican otvarac.
   *
   * OVAJ LIST MJERI SAMO TRAKU. Da otvarac stvarno otvara panel mjeri `tests/display-settings.test.ts`
   * (ondje je i panel), jer traka panel NE UVOZI. Ovdje se cuva ono sto je trakin posao:
   * posrednika vise nema, otvarac stoji na svakoj stranici, `#displayBtn` je jedinstven, i klik
   * na otvarac ZATVARA list (inace panel iskoci ispod lista koji ga prekriva).
   */
  it('otvarac panela stoji u listu i NIJE uklonjen, a posrednika vise nema', () => {
    for (const rel of ['alati.html', 'rad/index.html', 'saznaj-vise/index.html']) {
      const doc = dom(zaglavlje(read(rel)));
      mountSiteChrome(doc);
      expect(doc.querySelector('[data-display-open]'), `${rel}: otvarac je uklonjen`).not.toBeNull();
      expect(doc.querySelector('[data-site-chrome-display-proxy]'), `${rel}: posrednik je ostao`).toBeNull();
      expect(doc.querySelectorAll('#displayBtn'), `${rel}: #displayBtn nije jedinstven`).toHaveLength(1);
      disposeSiteChrome(doc);
    }
  });

  it('klik na otvarac panela ZATVARA mobilni list', () => {
    const doc = dom(zaglavlje(read('alati.html')));
    mountSiteChrome(doc);
    const btn = doc.getElementById('mobileMenuBtn')!;
    const sheet = doc.getElementById('mobileNav')!;
    btn.click();
    // BASELINE: list je otvoren, inace tvrdnja ispod ne dokazuje nista.
    expect(sheet.classList.contains('open')).toBe(true);
    doc.querySelector<HTMLElement>('[data-display-open]')!.click();
    expect(sheet.classList.contains('open'), 'panel bi iskocio ispod otvorenog lista').toBe(false);
  });

  it('MUTACIJA: preimenovan otvarac ostavlja list otvoren, i traka vise ne uvozi posrednik', () => {
    const header = zaglavlje(read('alati.html'));
    // BASELINE je u testu iznad; ovdje se mjeri da tvrdnja ovisi BAS o imenu atributa.
    const preimenovan = header.replace('data-display-open', 'data-nesto-drugo');
    expect(preimenovan, 'podmetanje se nije primilo; provjeri oznaku otvaraca').not.toBe(header);
    const doc = dom(preimenovan);
    mountSiteChrome(doc);
    doc.getElementById('mobileMenuBtn')!.click();
    doc.querySelector<HTMLElement>('.site-chrome__sheet-aa')!.click();
    expect(doc.getElementById('mobileNav')!.classList.contains('open'),
      'mutacija nije promijenila ishod; gard ne mjeri ime atributa').toBe(true);
    disposeSiteChrome(doc);

    // Posrednik je UKLONJEN iz modula, ne ostavljen kao rezerva (Z15 pravilo).
    const modul = read('src/shared/site-chrome.ts');
    expect(modul).not.toContain('function wireDisplayProxy');
    expect(modul).toContain("'a, [data-display-open]'");
  });
});

describe('Z15 stanje nakon skrola', () => {
  afterEach(() => disposeSiteChrome(document));

  it('prag je 40px: ispod njega trake nema u tankom stanju, iznad ima', () => {
    expect(SITE_CHROME_SCROLL_THRESHOLD).toBe(40);
    const doc = dom(zaglavlje(read('alati.html')));
    mountSiteChrome(doc);
    const chrome = doc.querySelector<HTMLElement>('[data-site-chrome]')!;
    expect(chrome.classList.contains('site-chrome--scrolled')).toBe(false);
    Object.defineProperty(doc.defaultView!, 'scrollY', { value: 41, configurable: true });
    doc.defaultView!.dispatchEvent(new Event('scroll'));
    expect(chrome.classList.contains('site-chrome--scrolled')).toBe(true);
    Object.defineProperty(doc.defaultView!, 'scrollY', { value: 12, configurable: true });
    doc.defaultView!.dispatchEvent(new Event('scroll'));
    expect(chrome.classList.contains('site-chrome--scrolled')).toBe(false);
  });

  it('`rad/index.html` pocinje bez faze (scanning): nijedan korak nije aktivan i traka je skrivena', () => {
    // Z15 popravak: prije Z15 popravka je statican atribut tvrdio "findings" od prvog kadra, dakle
    // prije nego je dokument uopce odabran. `scanning` vraca PRAZAN popis koraka (site-chrome.ts),
    // pa `applySiteChromeStage` host sakrije - to je isto stanje kao "jos nema koraka".
    expect(read('rad/index.html')).toContain('data-site-chrome-stage="scanning"');
    expect(read('rad/index.html')).not.toContain('data-site-chrome-stage="findings"');
    const doc = dom(zaglavlje(read('rad/index.html')));
    mountSiteChrome(doc);
    const steps = doc.querySelector<HTMLElement>('[data-site-chrome-steps]')!;
    expect(steps.hidden).toBe(true);
    for (const item of [...steps.querySelectorAll('[data-site-chrome-step]')]) {
      expect(item.hasAttribute('aria-current')).toBe(false);
      expect(item.getAttribute('aria-disabled')).toBe('true');
    }
  });

  it('`setSiteChromeStage` je uzak izlaz prema traci: findings otkriva korake, scanning ih ponovno skriva', () => {
    const doc = dom(zaglavlje(read('rad/index.html')));
    mountSiteChrome(doc);
    setSiteChromeStage(doc, 'findings');
    const steps = doc.querySelector<HTMLElement>('[data-site-chrome-steps]')!;
    expect(steps.hidden).toBe(false);
    const nalazi = steps.querySelector('[data-site-chrome-step="findings"]')!;
    expect(nalazi.getAttribute('aria-current')).toBe('step');
    setSiteChromeStage(doc, 'scanning');
    expect(steps.hidden).toBe(true);
    expect(nalazi.hasAttribute('aria-current')).toBe(false);
  });

  it('tok analize STVARNO zove `setSiteChromeStage`, ne samo definira ga (mutacija: brisanje poziva)', () => {
    // Tekstualna tvrdnja umjesto punog mounta rute: `main.ts` i `results-cockpit.ts` vuku puni
    // analizator i DOM cijele radne povrsine, sto ovaj list namjerno ne mounta. Gard je zato nad
    // IZVOROM, kao `ui-boot.ts vise ne ozicuje izbornik` gore - ista disciplina, ista slabost
    // (ne vidi da je poziv na krivom mjestu), ista snaga (vidi da je poziv uklonjen).
    const main = read('src/routes/workspace/main.ts');
    expect(main).toContain('setSiteChromeStage');
    expect(main).toContain("setSiteChromeStage(document, 'scanning')");
    const kokpit = read('src/ui/results/results-cockpit.ts');
    expect(kokpit).toContain('setSiteChromeStage');
    expect(kokpit).toContain("setSiteChromeStage(mount.ownerDocument, 'findings')");
  });

  it('ocjena u traci se prazni pri novom dokumentu, ne cim novi kokpit nacrta svoju', () => {
    // Bez ovoga bi traka do prvog nacrtanog kokpita pokazivala ocjenu PROSLOG dokumenta dok
    // Lekta cita novi - ista lazna tvrdnja kao stepper prije Z15 popravka gore, samo na broju.
    const main = read('src/routes/workspace/main.ts');
    expect(main).toContain('setSiteChromeScore');
    expect(main).toContain('setSiteChromeScore(document, null)');
  });

  it('sredina `/rad/` NE odlazi pod 820px, jer Z16 trazi stepper u dva reda', () => {
    // Bez ove tvrdnje bi pravilo "logo, lampa, hamburger" (Z15, marketinska traka) tiho odnijelo i
    // identitet dokumenta na radnoj povrsini, sto dva Playwright garda na 390 px mjere kao kvar.
    //
    // KOMENTARI SE ODREZUJU PRIJE MJERENJA. Prva verzija ovog garda je trazila `grid-column: 1 / -1`
    // po cijelom listu i ostala zelena nakon sto je pravilo preslo na `grid-area`, jer je taj niz
    // nasla u KOMENTARU koji opisuje stari kvar. Gard koji cita komentar ne mjeri stil.
    const css = bezKomentara(read('src/shared/site-chrome.css'));
    expect(css).toContain('.site-chrome[data-site-chrome="workspace"] .site-chrome__mid');
    // Znacka "Lokalno" i ocjena i dalje odlaze na 720px, kako je odluceno prije Z15.
    expect(css).toMatch(/@media \(max-width: 720px\) \{\s*\.site-chrome__doc \.local-badge/);
  });

  it('zaglavlje `/rad/` na desktopu ostaje jedan red: bez wrapa NA SREDINI ili sa zbijenom znackom', () => {
    // happy-dom ne racuna layout (nema pravog visinskog mjerenja), pa je tvrdnja STRUKTURNA:
    // ili `.site-chrome__mid` na baznoj razini (izvan svih @media upita) nema `flex-wrap: wrap`,
    // ili znacka "Lokalno" u traci dokumenta ima zbijeni oblik koji je mjeren i ne gura sirinu
    // (5px/10px padding, 11px font - vidi komentar uz `.site-chrome__doc .local-badge` gore).
    // Vizualnu visinu na 1180 px mjeri orkestrator (Playwright nije dio ovog kruga gatea).
    const puni = bezKomentara(read('src/shared/site-chrome.css'));
    const prviMedia = puni.indexOf('@media');
    const bazniSloj = prviMedia === -1 ? puni : puni.slice(0, prviMedia);
    const midWrapa = /\.site-chrome__mid\s*\{[^}]*flex-wrap:\s*wrap/.test(bazniSloj);
    const znackaZbijena = /\.site-chrome__doc \.local-badge\s*\{[^}]*margin-top:\s*0[^}]*padding:\s*5px 10px[^}]*font-size:\s*var\(--fs-mono-label\)/.test(bazniSloj);
    expect(midWrapa && !znackaZbijena, 'ni bez wrapa ni sa zbijenom znackom').toBe(false);
  });

  it('mobilna mreza ima IZRICITO mjesto: logo i kontrole u prvom redu, sredina u drugom', () => {
    // Auto-placement je uz `grid-column: 1 / -1` na sredini davao TRI reda (logo / dokument /
    // lampa+hamburger) i zaglavlje od 177 px na 390 px. Izricito mjesto to rjesava, a visinu na
    // pravom pregledniku mjeri `tests/ux/workspace-viewports.spec.ts` (proracun 124 px).
    const css = bezKomentara(read('src/shared/site-chrome.css'));
    const mobilni = css.match(/@media \(max-width: 819px\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(mobilni, 'sentinel: nema mobilnog bloka').not.toBe('');
    expect(mobilni).toMatch(/\.site-chrome__left \{ grid-area: 1 \/ 1 \/ 2 \/ 2; \}/);
    expect(mobilni).toMatch(/\.site-chrome__right \{ grid-area: 1 \/ 2 \/ 2 \/ 3; \}/);
    expect(mobilni).toMatch(/grid-area: 2 \/ 1 \/ 3 \/ -1;/);
    // Tanko stanje na mobitelu NE smije dodavati 16 px: izmjereno 122 px naspram 113 px.
    expect(mobilni).toMatch(/header\.site-chrome--scrolled \{ padding-block: 2px; \}/);
  });

  /**
   * F13 (odluka 2026-09-23): ISPOD 820px KORACI SU "01 02 03 04", BEZ NATPISA.
   *
   * Cetiri pilule s natpisima su 330 px, pa na 390 px ne stoje uz ime dokumenta i zaglavlje probija
   * proracun od 124 px koji mjeri `tests/ux/workspace-viewports.spec.ts`. `display: none` bi natpis
   * izbacio i iz PRISTUPACNOG drveta, pa bi citac ekrana citao samo "01": zato vizualno skrivanje
   * (`clip-path`), koje natpis ostavlja u imenu koraka.
   *
   * PRAVILO MORA BITI UNUTAR `@media (max-width: 819px)`, i to se mjeri odvojeno. Isti `clip-path`
   * u OSNOVNOM sloju sakrio bi natpise na svakoj sirini, dakle i na 1180 px, gdje je stepper s
   * natpisima cijela poanta koraka. Tvrdnja "pravilo postoji negdje u listu" bi oba stanja
   * proglasila jednakima.
   */
  it('natpis koraka se na mobitelu skriva VIZUALNO, ne iz pristupacnog imena', () => {
    const header = zaglavlje(read('rad/index.html'));
    const natpisi = [...header.matchAll(/class="site-chrome__step-label">([^<]+)</g)].map((m) => m[1]);
    // Natpisi dolaze iz MODELA koraka, ne iz prepisanog popisa: preimenovan korak pada ovdje.
    expect(natpisi).toEqual(siteChromeSteps('findings').map((k) => k.label));
    // Broj ostaje vidljiv, jer je on cijeli mobilni stepper ("01 02 03 04").
    const brojevi = [...header.matchAll(/class="site-chrome__step-num">([^<]+)</g)].map((m) => m[1]);
    expect(brojevi).toEqual(siteChromeSteps('findings').map((k) => k.ordinal));

    const pravilo = mobilnoPraviloNatpisa(read('src/shared/site-chrome.css'));
    expect(pravilo, 'sentinel: u mobilnom bloku nema pravila za natpis koraka').not.toBe('');
    expect(pravilo).toContain('clip-path: inset(50%)');
    expect(pravilo, 'natpis nestao iz pristupacnog drveta').not.toContain('display: none');
  });

  it('pravilo NIJE u osnovnom sloju, pa na sirokom zaslonu natpisi ostaju', () => {
    const css = bezKomentara(read('src/shared/site-chrome.css'));
    const prviMedia = css.indexOf('@media');
    const bazniSloj = prviMedia === -1 ? css : css.slice(0, prviMedia);
    expect(bazniSloj, 'sentinel: nema baznog sloja').not.toBe('');
    expect(bazniSloj, 'natpisi koraka bi nestali i na 1180 px').not.toContain('.site-chrome__step-label');
  });

  it('MUTACIJA: pravilo izvan mobilnog bloka i `display: none` umjesto clip-patha oba padaju', () => {
    const css = bezKomentara(read('src/shared/site-chrome.css'));
    // BASELINE: nad stvarnim listom pravilo je u mobilnom bloku i skriva vizualno.
    expect(mobilnoPraviloNatpisa(css)).toContain('clip-path: inset(50%)');

    // 1. Preseljeno u osnovni sloj: `mobilnoPraviloNatpisa` ga vise ne nalazi, pa gard pada.
    const izvanBloka = css.replace(/ {2}\.site-chrome__step-label \{[^}]*\}\r?\n/, '');
    expect(izvanBloka, 'podmetanje se nije primilo; provjeri uvlaku pravila').not.toBe(css);
    expect(mobilnoPraviloNatpisa(izvanBloka)).toBe('');

    // 2. `display: none` u mobilnom bloku: natpis nestaje i iz pristupacnog drveta.
    const sakriven = css.replace('clip-path: inset(50%)', 'display: none');
    expect(sakriven).not.toBe(css);
    expect(mobilnoPraviloNatpisa(sakriven)).toContain('display: none');
    expect(mobilnoPraviloNatpisa(sakriven)).not.toContain('clip-path: inset(50%)');
  });

  it('list nosi ucinke tankog stanja: padding, blur, crvena nit i manji logo', () => {
    const css = read('src/shared/site-chrome.css');
    expect(css).toContain('padding-block: 8px');
    expect(css).toContain('backdrop-filter: blur(14px)');
    expect(css).toMatch(/\.site-chrome--scrolled \.site-chrome__thread \{ opacity: \.7; \}/);
    expect(css).toMatch(/\.site-chrome--scrolled \.ks-mark \{ width: 24px/);
  });
});

describe('Z15 ocjena u traki', () => {
  it('ocjena se ispise samo kad je poznata; `null` je skriva', () => {
    const doc = dom(zaglavlje(read('rad/index.html')));
    setSiteChromeScore(doc, 71);
    const cell = doc.querySelector<HTMLElement>('[data-site-chrome-score]')!;
    expect(cell.hidden).toBe(false);
    expect(cell.textContent).toBe('71');
    setSiteChromeScore(doc, null);
    expect(cell.hidden).toBe(true);
    expect(cell.textContent).toBe('');
  });

  it('bez trake je no-op, pa kokpit ne mora znati na kojoj je ruti', () => {
    dom('<main></main>');
    expect(() => setSiteChromeScore(document, 71)).not.toThrow();
  });
});

/**
 * F8: MJEDENA PLOCICA NOSI "FPZG · Dipl.", IZ PECENOG INDEKSA.
 *
 * Tri stvari se mjere odvojeno, jer padaju iz razlicitih razloga:
 *   1. INDEKS je pecen, i pecena vrijednost odgovara svjezem izracunu (to cuva `tests/site-stats.test.ts`);
 *      ovdje se tvrdi samo da indeks NOSI kljuceve koje plocica cita.
 *   2. NATPIS je cista funkcija nad zapisom pohrane, pa se pokriva bez DOM-a i bez pohrane.
 *   3. MARKUP nosi zamjenski natpis staticki, jer stranica bez JavaScripta pohranu ne cita.
 */
describe('F8 plocica profila: kratica iz pecenog indeksa', () => {
  afterEach(() => { localStorage.clear(); disposeSiteChrome(document); });

  const STATS = JSON.parse(read('data/coverage/site-stats.json')) as {
    units: Record<string, { kratica: string }>;
    workTypes: Record<string, string>;
  };

  it('peceni indeks nosi jedinice i razine koje plocica cita', () => {
    // SENTINEL: bez ovoga bi svaka tvrdnja nize prolazila nad praznim indeksom.
    expect(Object.keys(STATS.units).length).toBeGreaterThan(100);
    expect(STATS.units.fpzg?.kratica).toBe('FPZG');
    // Kratice razina su doslovno one iz naloga F8; kljuc je POHRANJENI identifikator (F15).
    expect(STATS.workTypes).toEqual({
      seminar: 'Sem.', final: 'Zavr.', graduate: 'Dipl.', specialist: 'Spec.', doctoral: 'Dokt.',
    });
  });

  it('pravilo izvodjenja kratice je deterministicko i zapisano, ne pogodjeno', () => {
    // Akronim (najvise sest slova) ide u verzal; ime ide u veliko pocetno slovo.
    expect(unitKratica('fpzg')).toBe('FPZG');
    expect(unitKratica('pmf')).toBe('PMF');
    expect(unitKratica('sois-ft')).toBe('SOIS-FT');
    expect(unitKratica('algebra')).toBe('Algebra');
    expect(unitKratica('matematika')).toBe('Matematika');
    // Pravilo mora stajati U KODU, jer izvedena vrijednost nije tvrdnja s izvorom (CLAUDE.md).
    const izvor = read('src/coverage/site-stats.ts');
    expect(izvor).toContain('DETERMINISTICKI IZVEDENA, NE VERIFICIRANA TVRDNJA');
    // Svaka pecena kratica se mora dati REPRODUCIRATI istim pravilom; inace je negdje prepisana.
    for (const [unitId, unit] of Object.entries(STATS.units)) {
      expect(unit.kratica, unitId).toBe(unitKratica(unitId));
    }
  });

  it('poznat unit + workType daje "FPZG · Dipl."', () => {
    expect(siteChromePlateLabel({ unit: 'fpzg', workType: 'graduate' })).toBe('FPZG · Dipl.');
    expect(siteChromePlateLabel({ unit: 'pmf', workType: 'doctoral' })).toBe('PMF · Dokt.');
  });

  it('bez preferenci, s nepoznatim unitom i s pokvarenim zapisom daje zamjenski natpis', () => {
    expect(siteChromePlateLabel(null)).toBe(SITE_CHROME_PLATE_EMPTY);
    expect(siteChromePlateLabel({})).toBe(SITE_CHROME_PLATE_EMPTY);
    // NEPOZNAT UNIT NE BACA I NE POGADJA: stara pohrana ili rucno uredjen `localStorage`.
    expect(() => siteChromePlateLabel({ unit: 'ne-postoji', workType: 'graduate' })).not.toThrow();
    expect(siteChromePlateLabel({ unit: 'ne-postoji', workType: 'graduate' })).toBe(SITE_CHROME_PLATE_EMPTY);
    // Zapis koji nije objekt, i polja koja nisu tekst (JSON iz tudje ruke).
    expect(siteChromePlateLabel('fpzg')).toBe(SITE_CHROME_PLATE_EMPTY);
    expect(siteChromePlateLabel({ unit: 7, workType: 'graduate' })).toBe(SITE_CHROME_PLATE_EMPTY);
  });

  it('razina bez kratice daje SAMO kraticu ustanove, ne poluprazno "FPZG · "', () => {
    // `article` i `project` nisu razine studija, pa kratice nemaju (site-stats.ts).
    expect(siteChromePlateLabel({ unit: 'fpzg', workType: 'article' })).toBe('FPZG');
    expect(siteChromePlateLabel({ unit: 'fpzg' })).toBe('FPZG');
    expect(siteChromePlateLabel({ unit: 'fpzg', workType: 'nepoznato' })).toBe('FPZG');
  });

  it('montaza upise natpis iz pohrane, a aria-disabled i "Uskoro" ostaju do Z13', () => {
    localStorage.setItem('lekta.preferences.v2', JSON.stringify({ unit: 'fpzg', workType: 'graduate' }));
    const doc = dom(zaglavlje(read('alati.html')));
    mountSiteChrome(doc);
    const plate = doc.querySelector<HTMLElement>('[data-site-chrome-profile]')!;
    expect(plate.textContent).toContain('FPZG · Dipl.');
    // Klik ostaje bez ucinka do ladice Z13; odluka F8 to izricito cuva.
    expect(plate.getAttribute('aria-disabled')).toBe('true');
    expect(plate.getAttribute('title')).toBe('Uskoro');
  });

  it('bez pohrane montaza ostavlja zamjenski natpis, ne prazan gumb', () => {
    localStorage.clear();
    const doc = dom(zaglavlje(read('alati.html')));
    mountSiteChrome(doc);
    const slot = doc.querySelector<HTMLElement>('[data-site-chrome-profile-label]')!;
    expect(slot.textContent).toBe(SITE_CHROME_PLATE_EMPTY);
  });

  it.each(STRANICE)('%s: plocica nosi mjesto za natpis i staticki "Odaberi profil"', (rel) => {
    const header = zaglavlje(read(rel));
    expect(header).toContain('<span data-site-chrome-profile-label>Odaberi profil</span>');
    // Stari prepisan natpis "Profil" ne smije ostati uz novi (Z15 pravilo: uklonjeno, ne oboje).
    expect(header).not.toContain('aria-hidden="true"></span>Profil</button>');
  });

  it('MUTACIJA: prepisan natpis u markupu i prazan indeks oba padaju', () => {
    const header = zaglavlje(read('alati.html'));
    // BASELINE.
    expect(header).toContain('<span data-site-chrome-profile-label>Odaberi profil</span>');
    expect(siteChromePlateLabel({ unit: 'fpzg', workType: 'graduate' })).toBe('FPZG · Dipl.');

    // Prepisan natpis: montaza ga ne bi imala gdje upisati, pa bi plocica lagala o profilu.
    const prepisan = header.replace('<span data-site-chrome-profile-label>Odaberi profil</span>', 'FPZG · Dipl.');
    expect(prepisan, 'podmetanje se nije primilo; provjeri oznaku plocice').not.toBe(header);
    const doc = dom(prepisan);
    localStorage.setItem('lekta.preferences.v2', JSON.stringify({ unit: 'pmf', workType: 'doctoral' }));
    mountSiteChrome(doc);
    expect(doc.querySelector('[data-site-chrome-profile-label]'), 'mutacija nije uklonila mjesto').toBeNull();
    expect(doc.querySelector<HTMLElement>('[data-site-chrome-profile]')!.textContent)
      .not.toContain('PMF · Dokt.');
    disposeSiteChrome(doc);

    // Prazan indeks: natpis pada na zamjenski, ne na pogodjenu kraticu iz `unitId`-a.
    expect(siteChromePlateLabel({ unit: 'nema-ga-u-indeksu' })).toBe(SITE_CHROME_PLATE_EMPTY);
    expect(siteChromePlateLabel({ unit: 'nema-ga-u-indeksu' })).not.toBe('Nema-Ga-U-Indeksu');
  });

  it('plocica cita ISTI put ucitavanja JSON-a kao traka s brojkama', () => {
    // Bez ove tvrdnje bi plocica mogla dobiti drugi (zivi) izvor kratica, dakle drugi izvor istine.
    const chrome = read('src/shared/site-chrome.ts');
    const strip = read('src/routes/shared/site-stats-strip.ts');
    expect(chrome).toContain("data/coverage/site-stats.json'");
    expect(strip).toContain("data/coverage/site-stats.json'");
    expect(chrome, 'traka ne smije vuci registar profila').not.toContain('profile-registry');
    expect(chrome, 'traka ne smije vuci katalog').not.toContain('catalog-loader');
  });
});

describe('Z15 brojke mobilnog lista dolaze IZ IZVORA', () => {
  it('najniza cijena se IZVODI iz `src/report/pricing.ts`, ne prepisuje', () => {
    const najniza = Math.min(...WORK_TYPE_ORDER.map((w) => WORK_TYPE_TIERS[w].priceEur));
    expect(siteChromeLowestPrice()).toBe(`od ${formatEurAmount(najniza)} €`);
    // KONTROLA SMJERA: predlozak crta "od 4,99 €", a to nije iznos iz cjenika. Da je natpis
    // prepisan iz predloska, ova tvrdnja bi pala, i zato stoji.
    expect(siteChromeLowestPrice()).not.toBe('od 4,99 €');
  });

  it('broj alata se IZVODI iz javnog direktorija, bez samog rasadnika', () => {
    expect(siteChromeToolCount()).toBeGreaterThan(0);
    const direktorij = JSON.parse(read('src/routes/shared/public-route-directory.json')) as {
      groups: Array<{ id: string; destinations: Array<{ id: string; release: string }> }>;
    };
    const skupina = direktorij.groups.find((g) => g.id === 'free-tools')!;
    const ocekivano = skupina.destinations.filter((d) => d.release === 'core' && d.id !== 'tools').length;
    expect(siteChromeToolCount()).toBe(ocekivano);
  });

  it('montaza puni napomene lista, i nijedna ne ostaje prazna bez razloga', () => {
    const doc = dom(zaglavlje(read('alati.html')));
    mountSiteChrome(doc);
    const cijena = doc.querySelector<HTMLElement>('[data-site-chrome-note="price"]')!;
    const alati = doc.querySelector<HTMLElement>('[data-site-chrome-note="tools"]')!;
    const profili = doc.querySelector<HTMLElement>('[data-site-chrome-note="profiles"]')!;
    expect(cijena.textContent).toBe(siteChromeLowestPrice());
    expect(alati.textContent).toBe(`${siteChromeToolCount()} alata`);
    expect(profili.textContent).toMatch(/^[0-9.]+ profil/);
    disposeSiteChrome(doc);
  });

  it('napomena o radovima IZOSTAJE kad je pohrana prazna, umjesto da tvrdi nulu iz zraka', () => {
    localStorage.clear();
    const doc = dom(zaglavlje(read('alati.html')));
    mountSiteChrome(doc);
    const radovi = doc.querySelector<HTMLElement>('[data-site-chrome-note="work"]')!;
    expect(radovi.hidden).toBe(true);
    expect(radovi.textContent).toBe('');
    disposeSiteChrome(doc);

    localStorage.setItem('lekta.history.v2', JSON.stringify([{ a: 1 }, { a: 2 }]));
    const drugi = dom(zaglavlje(read('alati.html')));
    mountSiteChrome(drugi);
    expect(drugi.querySelector<HTMLElement>('[data-site-chrome-note="work"]')!.textContent).toBe('2 rada');
    localStorage.clear();
    disposeSiteChrome(drugi);
  });
});

describe('Z15 podnozje: pravni minimum', () => {
  const S_PODNOZJEM = STRANICE;

  it.each(S_PODNOZJEM)('%s nosi cetiri pravne poveznice, "Sve pravno" i jednu recenicu', (rel) => {
    const foot = podnozje(read(rel));
    const poveznice = [...foot.matchAll(/<a class="legal-open" data-legal="([^"]+)" href="([^"]+)">([^<]+)<\/a>/g)];
    expect(poveznice.map((m) => m[1])).toEqual(['privacy', 'terms', 'processing', 'cookies']);
    expect(foot).toContain('Sve pravno');
    expect(foot).toContain('Automatska provjera je lokalna');
    expect(foot).toContain('Nije provjera plagijata ni službena potvrda fakulteta');
    // JEDNA recenica, ne odlomak: podnozje nije mjesto za odricanje od odgovornosti u cijelosti.
    expect((foot.match(/<p class="site-footer__nota">/g) ?? []).length).toBe(1);
  });

  it('MUTACIJA: izbacena pravna poveznica i izgubljeno "Sve pravno" padaju', () => {
    const foot = podnozje(read('index.html'));
    const bezKolacica = foot.replace(/<a class="legal-open" data-legal="cookies"[^>]*>[^<]*<\/a>\n?/, '');
    expect(bezKolacica).not.toBe(foot);
    expect([...bezKolacica.matchAll(/data-legal="([^"]+)"/g)].map((m) => m[1])).not.toContain('cookies');
    const bezSvega = foot.replace('Sve pravno', 'Pravno');
    expect(bezSvega).not.toBe(foot);
    // BASELINE.
    expect(foot).toContain('Sve pravno');
    expect([...foot.matchAll(/data-legal="([^"]+)"/g)].map((m) => m[1])).toContain('cookies');
  });

  /**
   * F6: "Sve pravno" VODI NA STRANICU KOJA POSTOJI.
   *
   * Odluka 2026-09-23 (docs/agents/orchestrator-backlog.md, Track F): do Z20 poveznica vodi na
   * `/privatnost.html`, jer indeks `/pravno/` jos nije stvoren. Tvrdnja zato nije "href je ovaj
   * tekst" nego "odrediste je medju stranicama koje generator STVARNO pece": prvo je prepisana
   * vrijednost, drugo je mjera. Do 2026-09-23 je odrediste bilo `/uvjeti-koristenja.html`, isto
   * tako generirana stranica; promijenjena je odlukom, ne kvarom.
   */
  const GENERIRANI_SLUGOVI = Object.values(legalDocuments()).map((doc) => doc.slug);
  const GENERIRANA_ODREDISTA = GENERIRANI_SLUGOVI.map((slug) => `/${slug}.html`);

  it('generator pravnih stranica NABRAJA "privatnost", pa odrediste nije obecanje', () => {
    expect(GENERIRANI_SLUGOVI).toContain('privatnost');
    // Popis se cita iz `legalDocuments()`, a generator mora pisati BAS te slugove: bez ove dvije
    // tvrdnje bi gard mjerio modul koji skripta ne koristi, dakle ne bi mjerio nista o `dist/`.
    const generator = read('scripts/generate-legal-pages.mjs');
    expect(generator).toContain('legal.legalDocuments(');
    expect(generator).toContain('`${doc.slug}.html`');
  });

  it.each(STRANICE)('%s: "Sve pravno" vodi na /privatnost.html i najavljuje Z20 indeks', (rel) => {
    const foot = podnozje(read(rel));
    expect(svePravnoOdrediste(foot)).toBe('/privatnost.html');
    expect(GENERIRANA_ODREDISTA, 'odrediste nije medju pecenim pravnim stranicama')
      .toContain(svePravnoOdrediste(foot));
    // Privremenost mora stajati U MARKUPU, inace je sljedeca sesija cita kao konacnu odluku.
    expect(foot, `${rel} ne najavljuje Z20 indeks`).toContain('Z20');
    expect(foot).toContain('/pravno/');
  });

  it('MUTACIJA: odrediste koje generator ne pece pada, a izgubljena najava Z20 takodjer', () => {
    const foot = podnozje(read('index.html'));
    // BASELINE: neizmijenjeno podnozje je cisto, inace tvrdnje ispod nista ne dokazuju.
    expect(svePravnoOdrediste(foot)).toBe('/privatnost.html');
    expect(GENERIRANA_ODREDISTA).toContain('/privatnost.html');

    // Z20 indeks JOS NE POSTOJI: da ga netko upise prije nego ga generator pece, gard pada.
    const naIndeks = foot.replace('href="/privatnost.html">Sve pravno', 'href="/pravno/">Sve pravno');
    expect(naIndeks, 'podmetanje se nije primilo; provjeri oznaku poveznice').not.toBe(foot);
    expect(GENERIRANA_ODREDISTA).not.toContain(svePravnoOdrediste(naIndeks));

    // Vracanje na staro odrediste je i dalje VALJANO (i ono je generirano), pa ovaj gard ne bi pao
    // na njemu; ono sto pada je tvrdnja o dogovorenom odredistu, i zato stoji doslovno gore.
    const staro = foot.replace('href="/privatnost.html">Sve pravno', 'href="/uvjeti-koristenja.html">Sve pravno');
    expect(GENERIRANA_ODREDISTA).toContain(svePravnoOdrediste(staro));
    expect(svePravnoOdrediste(staro)).not.toBe('/privatnost.html');

    const bezNajave = foot.split('Z20').join('Z-dvadeset');
    expect(bezNajave).not.toBe(foot);
    expect(bezNajave).not.toContain('Z20');
  });

  it('`/rad/` zadrzava "Postavke privatnosti", jer privola se mora dati promijeniti', () => {
    expect(podnozje(read('rad/index.html'))).toContain('id="privacySettingsBtn"');
  });

  it('puno podnozje je DRUGI krug, i stranice koje ga cekaju to imaju zapisano', () => {
    // Bez ovoga bi pravni minimum na sadrzajnim stranicama izgledao kao konacna odluka.
    for (const rel of ['saznaj-vise/index.html']) {
      expect(read(rel), rel).toContain('TODO (Z15, drugi krug)');
    }
  });
});

describe('Z15: stari markup i mrtva pravila su UKLONJENI, ne ostavljeni uz nove', () => {
  it('nijedna stranica ne nosi staru navigaciju', () => {
    for (const rel of STRANICE) {
      const html = read(rel);
      for (const stari of ['class="nav-links"', 'class="nav-tools"', 'class="mobile-nav"', 'class="intake-nav"', 'class="footer-inner"']) {
        expect(html, `${rel} i dalje nosi ${stari}`).not.toContain(stari);
      }
    }
  });

  it('dijeljeni listovi ne nose pravila stare navigacije', () => {
    for (const list of ['src/shared/page-chrome.css', 'src/shared/tool-page.css']) {
      const css = read(list).replace(/\/\*[\s\S]*?\*\//g, ' ');
      for (const selektor of ['.nav-links', '.nav-tools', '.mobile-nav', '.mobile-menu', '.footer-inner']) {
        expect(css, `${list} i dalje nosi ${selektor}`).not.toContain(selektor);
      }
    }
    const intake = read('src/routes/intake/intake.css').replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(intake).not.toContain('.intake-nav');
    expect(intake).not.toContain('.intake-footer');
  });

  it('`ui-boot.ts` vise ne ozicuje izbornik ni skrol trake, nego montira traku', () => {
    const boot = read('src/shared/ui-boot.ts');
    expect(boot).toContain('mountSiteChrome(document)');
    expect(boot).toContain("import './site-chrome.css'");
    for (const stari of ['setupMobileNav(', 'setupTopbarScroll(', 'setupNavTools(']) {
      expect(boot, `${stari} bi bio drugo zivo ozicenje istog gumba`).not.toContain(stari);
    }
  });

  /** Selektori koje traka vise ne koristi nigdje: stari .nav-rad blok radne povrsine (page-app.css),
   * stara marketinska navigacija (.nav-links/.mobile-nav/.mobile-menu) i staro podnozje
   * (.footer-bottom). Provjera je nad CSS-om bez komentara: komentar smije SPOMENUTI ime klase kao
   * povijesnu biljesku, pravilo ga smije definirati - ni jedno ni drugo ne smije PRAVILO ostaviti. */
  const MRTVI_SELEKTORI = ['.nav-links', '.mobile-nav', '.mobile-menu', '.footer-bottom', '.nav-rad', '.rad-doc'];

  it('dijeljeni listovi radne povrsine (page-app.css, premium.css) ne nose mrtve selektore', () => {
    for (const list of ['src/shared/page-app.css', 'src/shared/premium.css']) {
      const css = bezKomentara(read(list));
      for (const selektor of MRTVI_SELEKTORI) {
        expect(css, `${list} i dalje nosi ${selektor}`).not.toContain(selektor);
      }
    }
  });

  /** `alati.html` je jedina sadrzajna stranica u dopustenom popisu putanja za Z15 popravak F1
   * (docs/agents/orchestrator-backlog.md F14 raspravlja opseg): njen inline <style> je ociscen.
   * `citat.html`, `izjava.html`, `kartice.html`, `literatura.html`, `naslovnica.html`,
   * `citati-i-literatura.html`, `landing_usporedba.html`, `landing_benchmark.html` I DALJE nose
   * `.nav-links`/`.mobile-nav`/`.mobile-menu` u inline <style> blokovima (isti mrtvi razred), ali
   * NISU u dopustenom popisu putanja ovog kruga popravka, pa gard nad njima namjerno NIJE ovdje:
   * dodavanje bi ih ili slagalo kao MRTVE bez ovlasti za popravak, ili tiho preskocilo tvrdnju o
   * "svugdje". Prosirenje je F14 pitanje vlasniku. */
  it('`alati.html` inline <style> ne nosi mrtve selektore', () => {
    const style = read('alati.html').replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const selektor of MRTVI_SELEKTORI) {
      expect(style, `alati.html i dalje nosi ${selektor}`).not.toContain(selektor);
    }
  });
});
