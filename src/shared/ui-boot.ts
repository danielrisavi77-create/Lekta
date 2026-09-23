// Zajednicki boot za sve stranice (index, citat, usporedba):
//  1. dva glasa koja nosi SVAKA stranica (Newsreader + Inter Tight; vidi `fonts-core.ts`),
//  2. Lucide ikone: zamjenjuje <i data-lucide="..."> jedinstvenim stroke setom.
// Bez mreze prema trecim stranama; font se bundla lokalno (unicode-range skida
// samo latin i latin-ext za hrvatski sadrzaj).
//
// PODATKOVNI GLASOVI (Source Serif 4, IBM Plex Mono) OVDJE NAMJERNO VISE NISU: zive u
// `fonts-document.ts` i uvozi ih stranica koja im ima mete. Do 2026-09-05 su stajali ovdje, pa
// je i cisti ulaz `/` skidao mono koji na njemu nema nijednu metu. Stranice koje su ovaj modul
// bootale IZRAVNO idu preko `page-boot.ts`, koji oba skupa spaja.
import './fonts-core';
import 'open-props/easings'; // samo easing krivulje (bez boja/sjena, da topla paleta ostane netaknuta)
import './design-system.css'; // JEDINI izvor tokena (boje/tipografija/radius/sjene/fokus) za sve stranice
import './tool-page.css'; // dijeljeni chrome (topbar/nav/gumbi/hero/card/footer/KS tema) za alat-stranice
import './motion.css'; // dijeljeni sloj gibanja: tokeni gibanja, tekstura papira, View Transitions, tipografija
import './premium.css'; // Korektorski stol+: dubina, vizualizacije i lagani 3D slojevi
import './skip-link.css'; // pristupacni "Preskoci na sadrzaj" (BL-P1-01)
import './a11y.css'; // dijeljeni a11y sloj: forced-colors fokus fallback (BL-P2-02)
// UCINAK POSTAVKI PRIKAZA (Z6) IDE OVDJE, NE UZ PANEL. Pre-paint skripta u <head> upisuje
// `data-reading-font`, `data-contrast` i `data-motion` na SVAKOJ stranici, pa
// bi bez ovog uvoza ti atributi na rutama koje panel ne montiraju (/saznaj-vise/, /moji-radovi/,
// alat-stranice preko page-boot) stajali MRTVI: postavka koju je korisnik izabrao na `/` ondje ne
// bi radila nista. Sam panel (JS) i dalje zivi samo na `/` i `/rad/`; ovdje ide iskljucivo stil.
// Uvoz je NAMJERNO posljednji u nizu listova ovog modula, da ucinak dodje poslije primitiva iz
// `design-system.css`. Specificnost je pritom mjerena, ne pretpostavljena (vidi zaglavlje tog
// lista): `page-chrome.css` se ucitava JOS kasnije, pa ucinak ne smije ovisiti o redoslijedu.
import './display-settings.css';
// TRAKA I PODNOZJE KAO SUSTAV (Z15). List je JEDINI izvor izgleda trake i pravnog podnozja na
// svim stranicama, a `site-chrome.ts` jedini izvor njihova ponasanja. Uvoz stoji POSLIJE
// `tool-page.css`, jer taj list nosi zatecene `.topbar`/`.nav` ostatke; kolizija se ipak ne
// rjesava redoslijedom nego specificnoscu (`header.site-chrome`), da ucinak ne ovisi o poretku.
import './site-chrome.css';
import { setupSkipLink } from './skip-link';
import { mountSiteChrome } from './site-chrome';
import { pokretPrigusen, suprotnaTema, tamnoNaEkranu } from './display-prefs';
import { setupPremiumVisuals } from './premium-visuals';
import { createFrameCoalescer } from './frame-coalescer';
import { shouldDeferReveal } from './reveal-policy';
import { createIcons, SunMoon, Menu, Lock, Upload, CheckCircle, AlertTriangle, AlertCircle, Info, SlidersHorizontal, ClipboardCheck, X, ChevronDown, Wrench, BadgeCheck, Zap, Lamp, Share2, Wand2 } from 'lucide';

// Korektorski stol: "radna lampa" (tamni stol) je default na SVIM stranicama. Kad korisnik
// nema spremljenu temu, postavi data-theme="dark" prije boota, pa #themeBtn preklopnik radi
// prirodno (dark -> light = danje svjetlo). Namjerno bez pisanja u localStorage: eksplicitni
// izbor ostaje korisnikov. FOUC skripta u <head> i dalje samo vraca SPREMLJENU temu.
//
// IZNIMKA JE `system` (Z6, panel "Prilagodi prikaz"): ta vrijednost je IZRICIT izbor da temu
// odredi `prefers-color-scheme`, a odreduje je odsutnost atributa. Bez ove provjere bi boot
// pregazio taj izbor tamnom temom na svakom ucitavanju, pa bi kontrola izgledala kao da ne radi.
if (typeof document !== 'undefined' && !document.documentElement.dataset.theme) {
  let spremljenaTema: string | null = null;
  try { spremljenaTema = localStorage.getItem('lekta.theme'); } catch { /* pohrana odbijena */ }
  if (spremljenaTema !== 'system') document.documentElement.dataset.theme = 'dark';
}

const EASE_OUT = [0.22, 1, 0.36, 1];
// RUCNI IZBOR VRIJEDI JEDNAKO KAO SUSTAVNI. `data-motion="reduce"` iz panela "Prilagodi prikaz"
// gasi CSS animacije i prijelaze, ali NE gasi `element.animate()`; WAAPI ne ovisi ni o svojstvu
// `animation` ni o `transition`, pa ga `animation: none !important` ne dira. Svaki poziv ovdje
// ide kroz `pokretPrigusen`, koji pita OBA izvora.
function prefersReduced() {
  return pokretPrigusen(document);
}

// Motion se ucitava lijeno (zaseban chunk, ne blokira prvi paint); animacije su cisto
// progresivno pobojlsanje. app.ts (rezultati) koristi window.__lektaAnimate kad je spreman.
// Import se okida tek na zahtjev (animateHero), pa tool stranice bez animacijskih meta
// (.hero-copy/.preview-card) uopce ne skidaju motion chunk.
let motionPromise: Promise<any> | null = null;
function motionReady(): Promise<any> {
  if (prefersReduced()) return Promise.resolve(null);
  if (!motionPromise) {
    motionPromise = import('motion').then((m) => { (window as any).__lektaAnimate = m.animate; return m; }).catch(() => null);
  }
  return motionPromise;
}

function renderIcons() {
  try {
    createIcons({
      icons: { SunMoon, Menu, Lock, Upload, CheckCircle, AlertTriangle, AlertCircle, Info, SlidersHorizontal, ClipboardCheck, X, ChevronDown, Wrench, BadgeCheck, Zap, Lamp, Share2, Wand2 },
      attrs: { 'aria-hidden': 'true', 'stroke-width': 2 },
    });
  } catch (e) {
    // Ikona koja fali ne smije srusiti stranicu; glif fallback ostaje u markupu.
  }
}

// Dinamicki renderan sadrzaj (rezultat analize, QA konzola) ubacuje <i data-lucide>
// nakon prvog prolaza, pa app.ts poziva ovaj refresh da ih pretvori u SVG.
(window as any).__lektaIcons = renderIcons;

// Reveal je progresivno poboljsanje, ali sadrzaj je po defaultu odmah vidljiv. Samo elementi s
// data-reveal-mode="deferred" koriste ulaz pri ulasku u viewport, pa dugi landing ne izgleda kao
// da se ucitava u komadima tijekom scrolla.
document.documentElement.classList.add('reveal-ready');
// Reveal preko native IntersectionObservera (bez ovisnosti): klasa .reveal-in je idempotentna,
// CSS prijelaz na karticama odraduje animaciju; stagger po stupcu setTimeoutom (ne CSS delay,
// da kasniji hover nema zaostatak). .reveal-ready gejtira skriveno stanje pa je bez JS-a vidljivo.
function setupReveal() {
  const allEls = [...document.querySelectorAll<HTMLElement>('[data-reveal]:not(.reveal-in)')];
  allEls.filter((el) => !shouldDeferReveal(el)).forEach((el) => el.classList.add('reveal-in'));
  const els = allEls.filter(shouldDeferReveal);
  if (!els.length) return;
  if (prefersReduced() || typeof IntersectionObserver === 'undefined') {
    els.forEach((el) => el.classList.add('reveal-in'));
    return;
  }
  const io = new IntersectionObserver((entries, obs) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target as HTMLElement;
      const delay = Number(el.dataset.revealDelay || 0);
      if (delay) window.setTimeout(() => el.classList.add('reveal-in'), delay);
      else el.classList.add('reveal-in');
      obs.unobserve(el);
    }
  }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
  // Stagger po GRUPI (isti roditelj): svako sljedece reveal-dijete kasni STEP vise, do CAP koraka.
  // Cist sweep unutar reda umjesto globalnog i%4 koji se ne poravna s vizualnim grupama (grupa od 3
  // kartice znala je dobiti npr. 210/0/70 pa bi zadnja uletjela prva). Sekcijski blok (jedini reveal
  // u roditelju) nema kasnjenje. HTML-postavljeni data-reveal-delay ima prednost.
  const STEP = 70, CAP = 5;
  els.forEach((el) => {
    if (el.dataset.revealDelay === undefined) {
      const group = el.parentElement?.querySelectorAll(':scope > [data-reveal]');
      const idx = group && group.length > 1 ? Array.prototype.indexOf.call(group, el) : 0;
      el.dataset.revealDelay = String(Math.min(idx, CAP) * STEP);
    }
    io.observe(el);
  });
}
// app.ts injektira check-kartice nakon boota pa ponovno skenira nove [data-reveal] elemente.
(window as any).__lektaReveal = setupReveal;

// Dekorativne animacije ne smiju raditi dok je njihova sekcija izvan viewporta. To je osobito
// važno na rezultatu analize: landing i privatnost ostaju u DOM-u ispod njega, ali korisniku nisu
// vidljivi i ne trebaju trošiti frameove. Obuhvaćamo i CSS i WAAPI animacije, jer hero-demo koristi
// element.animate(), koji `animation-play-state` sam po sebi ne zaustavlja.
function pauseOffscreenMotion() {
  if (prefersReduced() || typeof IntersectionObserver === 'undefined') return;
  const targets = [...document.querySelectorAll<HTMLElement>('.ks-priv-scena')];
  if (!targets.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      (entry.target as HTMLElement).classList.toggle('motion-offscreen', !entry.isIntersecting);
    });
  }, { rootMargin: '120px 0px' });
  targets.forEach((target) => io.observe(target));
}

// Hero: fina ulazna kaskada na load (ease-out, stagger). Progresivno: elementi su vidljivi po
// defaultu, Motion samo poboljsava ulaz. Djeca .hero-copy nemaju hover pa nema sukoba stilova.
function animateHero() {
  if (prefersReduced()) return;
  // Mete se traze PRIJE poziva motionReady(): bez njih se motion chunk uopce ne ucitava.
  const copy = Array.from(document.querySelectorAll<HTMLElement>('.hero-copy > *'));
  const preview = document.querySelector<HTMLElement>('.preview-card');
  const items = preview ? [...copy, preview] : copy;
  if (!items.length) return;
  motionReady().then((m) => {
    if (!m) return;
    m.animate(items, { opacity: [0, 1], y: [22, 0] }, { duration: 0.62, delay: m.stagger(0.07), ease: EASE_OUT });
  });
}

// Blagi 3D tilt hero preview kartice prema pokazivacu (bez ovisnosti: realtime transform,
// spring povratak preko CSS prijelaza). Preskace se na reduced-motion i na touch uredajima;
// preview-card nema CSS hover pa nema sukoba stilova.
function setupTilt() {
  if (prefersReduced()) return;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(hover: none)').matches) return;
  const card = document.querySelector<HTMLElement>('.preview-card');
  if (!card) return;
  const MAX = 6;
  const rest = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0)';
  let bounds: DOMRect | null = null;
  const coalescer = createFrameCoalescer<string>((transform) => {
    card.style.transform = transform;
  });
  card.addEventListener('pointerenter', () => {
    bounds = card.getBoundingClientRect();
    card.style.willChange = 'transform';
    card.style.transition = 'transform 0s';
  });
  card.addEventListener('pointermove', (e) => {
    if (!bounds) bounds = card.getBoundingClientRect();
    const px = (e.clientX - bounds.left) / bounds.width - 0.5;
    const py = (e.clientY - bounds.top) / bounds.height - 0.5;
    coalescer.schedule(`perspective(900px) rotateX(${(-py * MAX).toFixed(2)}deg) rotateY(${(px * MAX).toFixed(2)}deg) translateY(-4px)`);
  });
  card.addEventListener('pointerleave', () => {
    coalescer.cancel();
    card.style.transition = 'transform .5s var(--ease-spring, ease)';
    card.style.transform = rest;
    card.style.willChange = 'auto';
    bounds = null;
  });
}

// Prebacivanje teme (svijetla/tamna) + sprema u lekta.theme. Pre-paint restore ostaje inline
// u <head> svake stranice (izbjegava bljesak); ovdje je samo klik-ponasanje, jedan izvor za sve
// stranice (prije duplicirano inline u svakom tool HTML-u i u app.ts za index).
function setupThemeToggle() {
  const btn = document.getElementById('themeBtn');
  if (!btn) return;
  // BL-P3-08: stanje i naziv prate aktivnu temu, pa je preklopnik jasan i citacu zaslona.
  // WCAG 2.5.3 (Label in Name): aria-label MORA sadrzavati vidljivi tekst gumba ("Lampa",
  // <span class="lampa-txt">), inace glasovna kontrola ("klikni Lampa") ne pogodi element.
  const reflect = () => {
    // STANJE, NE ATRIBUT: u nacinu `system` atributa nema, pa je `=== 'dark'` tvrdio svijetlo i
    // kad je sustav taman. Isti razred kvara kao u `display-settings.ts`; jedan citac za oba.
    const dark = tamnoNaEkranu(document);
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    btn.setAttribute('aria-label', dark ? 'Lampa: ugasi' : 'Lampa: upali');
    btn.setAttribute('title', dark ? 'Ugasi radnu lampu' : 'Upali radnu lampu');
  };
  reflect();
  btn.addEventListener('click', () => {
    // PREUZIMANJE GUMBA: na `/` i `/rad/` isti gumb ozicuje i panel "Prilagodi prikaz"
    // (`src/shared/display-settings.ts`), jer ondje klik mora i osvjeziti radio u panelu i
    // razumjeti vrijednost `system`. Dva ziva ozicenja preklopila bi temu dvaput, dakle nikako.
    //
    // Oznaka se cita UNUTAR rukovatelja, ne pri postavljanju: tako redoslijed montaze ne odlucuje
    // o ishodu. Provjera pri postavljanju bila bi tocna samo dok panel montira prije `boot()`, a
    // oslanjanje na taj redoslijed je upravo ono sto ovaj repozitorij zove laznim zelenim.
    if (btn.dataset.themeOwner) return;
    const next = suprotnaTema(document);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('lekta.theme', next); } catch { /* storage odbijen */ }
    reflect();
  });
}

// MOBILNI IZBORNIK I STANJE SKROLA SU OD Z15 U `site-chrome.ts`, NE OVDJE.
//
// `setupMobileNav` je otvarao `#mobileNav` bez upravljanja fokusom, bez Escapea i bez klika
// izvan, a `setupTopbarScroll` je ukljucivao hairline na 24px. Traka Z15 ima jedan prag (40px),
// jednu crvenu nit i jedan list koji pada na stol; dva ziva ozicenja istog gumba preklopila bi
// izbornik dvaput, pa su ova dva ovdje UKLONJENA, a ne zadrzana kao rezerva.
// Isto vrijedi za `setupNavTools`: padajuci "Alati" je nestao jer je Pribor sad odrediste trake.

function boot() {
  // TRAKA IDE PRVA: ona preuzima `#themeBtn` (vidi `wireSiteLamp`), pa `setupThemeToggle` nize
  // zatim ustupa. Ispravnost ne ovisi o ovom poretku (oznaka se cita UNUTAR rukovatelja), ali
  // aria stanje lampe je time tocno od prvog kadra.
  mountSiteChrome(document);
  setupSkipLink(); renderIcons(); setupReveal(); pauseOffscreenMotion(); animateHero(); setupTilt(); setupPremiumVisuals(); setupThemeToggle();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
