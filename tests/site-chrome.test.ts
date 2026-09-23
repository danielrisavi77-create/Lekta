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
  setSiteChromeScore,
} from '../src/shared/site-chrome';
import { WORK_TYPE_ORDER, WORK_TYPE_TIERS, formatEurAmount } from '../src/report/pricing';

const ROOT = resolve(__dirname, '..');
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8');

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

function dom(html: string): Document {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-motion');
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
    expect(header).toContain('data-site-chrome-stage="findings"');
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
    const doc = dom(zaglavlje(read('alati.html')));
    mountSiteChrome(doc);
    const aktivni = [...doc.querySelectorAll('[data-site-chrome-dest][aria-current="page"]')];
    // Dva su: jedan u traci, jedan u mobilnom listu; oba su ISTO odrediste.
    expect(new Set(aktivni.map((a) => a.getAttribute('data-site-chrome-dest')))).toEqual(new Set(['tools']));
    const marker = doc.querySelector<HTMLElement>('[data-site-chrome-marker]')!;
    expect(marker.dataset.siteChromeMarkerFor).toBe('tools');
    expect(marker.hidden).toBe(false);
  });

  it('kvacica PUTUJE: promjena aktivnog odredista pomice metu', () => {
    const doc = dom(zaglavlje(read('alati.html')));
    const chrome = doc.querySelector<HTMLElement>('[data-site-chrome]')!;
    const marker = doc.querySelector<HTMLElement>('[data-site-chrome-marker]')!;
    markActiveDestination(chrome, 'tools');
    expect(marker.dataset.siteChromeMarkerFor).toBe('tools');
    markActiveDestination(chrome, 'faculties');
    expect(marker.dataset.siteChromeMarkerFor).toBe('faculties');
    expect([...doc.querySelectorAll('[data-site-chrome-dests] [aria-current="page"]')]
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
    const doc = dom(zaglavlje(read('alati.html')));
    const chrome = doc.querySelector<HTMLElement>('[data-site-chrome]')!;
    markActiveDestination(chrome, 'nepostojece');
    expect(doc.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
    // BASELINE i kontrola smjera: poznat identitet i dalje oznaci tocno jedno odrediste u traci.
    markActiveDestination(chrome, 'tools');
    expect(doc.querySelectorAll('[data-site-chrome-dests] [aria-current="page"]')).toHaveLength(1);
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

  it('"Aa" u listu je POSREDNIK: bez `#displayBtn` se ukloni, s njim proslijedi klik', () => {
    // Bez panela (alat-stranica) kontrola bez ucinka ne smije stajati na ekranu.
    const bez = dom(zaglavlje(read('alati.html')));
    mountSiteChrome(bez);
    expect(bez.querySelector('[data-site-chrome-display-proxy]')).toBeNull();
    disposeSiteChrome(bez);

    // S panelom (`/rad/`) klik posrednika mora pogoditi bas `#displayBtn`, bez drugog istog id-a.
    const sa = dom(zaglavlje(read('rad/index.html')));
    mountSiteChrome(sa);
    const proxy = sa.querySelector<HTMLElement>('[data-site-chrome-display-proxy]');
    expect(proxy, '`/rad/` nosi panel, pa posrednik mora ostati').not.toBeNull();
    let klikova = 0;
    sa.getElementById('displayBtn')!.addEventListener('click', () => { klikova += 1; });
    proxy!.click();
    expect(klikova).toBe(1);
    expect(sa.querySelectorAll('#displayBtn')).toHaveLength(1);
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

  it('sredina `/rad/` NE odlazi pod 820px, jer Z16 trazi stepper u dva reda', () => {
    // Bez ove tvrdnje bi pravilo "logo, lampa, hamburger" (Z15, marketinska traka) tiho odnijelo i
    // identitet dokumenta na radnoj povrsini, sto dva Playwright garda na 390 px mjere kao kvar.
    const css = read('src/shared/site-chrome.css');
    expect(css).toContain('.site-chrome[data-site-chrome="workspace"] .site-chrome__mid');
    expect(css).toMatch(/grid-column: 1 \/ -1/);
    // Znacka "Lokalno" i ocjena i dalje odlaze na 720px, kako je odluceno prije Z15.
    expect(css).toMatch(/@media \(max-width: 720px\) \{\s*\.site-chrome__doc \.local-badge/);
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
});
