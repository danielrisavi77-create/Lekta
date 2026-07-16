// Zajednicki boot za sve stranice (index, citat, usporedba):
//  1. self-hostani akademski serif (Source Serif 4, latin + latin-ext za hrvatski),
//  2. Lucide ikone: zamjenjuje <i data-lucide="..."> jedinstvenim stroke setom.
// Bez mreze prema trecim stranama; font se bundla lokalno (unicode-range skida
// samo latin i latin-ext za hrvatski sadrzaj).
import '@fontsource-variable/source-serif-4'; // dokument-pregledi (naslovnica/izjava/citat/literatura zrcale Word izlaz)
import '@fontsource-variable/inter-tight'; // self-hostan UI/body sans (Tinta i papir); latin + latin-ext za hrvatski
import '@fontsource-variable/newsreader/opsz.css'; // display serif s optical-size osi (naslovi)
import '@fontsource-variable/newsreader/opsz-italic.css'; // italic za naglasne rijeci u naslovima
import '@fontsource/ibm-plex-mono/400.css'; // podatkovni glas: brojevi, rule-code eyebrows, folio tagovi
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import 'open-props/easings'; // samo easing krivulje (bez boja/sjena, da topla paleta ostane netaknuta)
import './design-system.css'; // JEDINI izvor tokena (boje/tipografija/radius/sjene/fokus) za sve stranice
import './motion.css'; // dijeljeni sloj gibanja: tokeni gibanja, tekstura papira, View Transitions, tipografija
import './skip-link.css'; // pristupacni "Preskoci na sadrzaj" (BL-P1-01)
import './a11y.css'; // dijeljeni a11y sloj: forced-colors fokus fallback (BL-P2-02)
import { setupSkipLink } from './skip-link';
import { createIcons, SunMoon, Menu, Lock, Upload, CheckCircle, AlertTriangle, AlertCircle, Info, SlidersHorizontal, ClipboardCheck, X, ChevronDown, Wrench, BadgeCheck, Zap, Lamp } from 'lucide';

// Korektorski stol: "radna lampa" (tamni stol) je default na SVIM stranicama. Kad korisnik
// nema spremljenu temu, postavi data-theme="dark" prije boota, pa #themeBtn preklopnik radi
// prirodno (dark -> light = danje svjetlo). Namjerno bez pisanja u localStorage: eksplicitni
// izbor ostaje korisnikov. FOUC skripta u <head> i dalje samo vraca SPREMLJENU temu.
if (typeof document !== 'undefined' && !document.documentElement.dataset.theme) {
  document.documentElement.dataset.theme = 'dark';
}

const EASE_OUT = [0.22, 1, 0.36, 1];
function prefersReduced() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
      icons: { SunMoon, Menu, Lock, Upload, CheckCircle, AlertTriangle, AlertCircle, Info, SlidersHorizontal, ClipboardCheck, X, ChevronDown, Wrench, BadgeCheck, Zap, Lamp },
      attrs: { 'aria-hidden': 'true', 'stroke-width': 2 },
    });
  } catch (e) {
    // Ikona koja fali ne smije srusiti stranicu; glif fallback ostaje u markupu.
  }
}

// Dinamicki renderan sadrzaj (rezultat analize, QA konzola) ubacuje <i data-lucide>
// nakon prvog prolaza, pa app.ts poziva ovaj refresh da ih pretvori u SVG.
(window as any).__lektaIcons = renderIcons;

// Reveal-on-scroll uz progresivno pobojlsanje: klasu `reveal-ready` postavljamo cim se
// modul izvrsi, pa je bez JS-a sadrzaj odmah vidljiv (nema skrivenih [data-reveal] elemenata).
// S JS-om se kartice pojavljuju kad udu u vidokrug; stagger je po stupcu (setTimeout, ne CSS
// delay, da hover kasnije nema zaostatak). Postuje prefers-reduced-motion.
document.documentElement.classList.add('reveal-ready');
// Reveal preko native IntersectionObservera (bez ovisnosti): klasa .reveal-in je idempotentna,
// CSS prijelaz na karticama odraduje animaciju; stagger po stupcu setTimeoutom (ne CSS delay,
// da kasniji hover nema zaostatak). .reveal-ready gejtira skriveno stanje pa je bez JS-a vidljivo.
function setupReveal() {
  const els = document.querySelectorAll<HTMLElement>('[data-reveal]:not(.reveal-in)');
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
  els.forEach((el, i) => { el.dataset.revealDelay = String((i % 4) * 70); io.observe(el); });
}
// app.ts injektira check-kartice nakon boota pa ponovno skenira nove [data-reveal] elemente.
(window as any).__lektaReveal = setupReveal;

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
  card.style.willChange = 'transform';
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    card.style.transition = 'transform 0s';
    card.style.transform = `perspective(900px) rotateX(${(-py * MAX).toFixed(2)}deg) rotateY(${(px * MAX).toFixed(2)}deg) translateY(-4px)`;
  });
  card.addEventListener('pointerleave', () => {
    card.style.transition = 'transform .5s var(--ease-spring, ease)';
    card.style.transform = rest;
  });
}

// "Alati" padajuci izbornik kao disclosure: gumb otvara/zatvara klikom i tipkovnicom
// (Enter/Space okidaju click na <button>), sto radi na touchu gdje hover ne postoji.
// Na tool stranicama CSS otvara popis preko [aria-expanded="true"]; :hover ostaje za misa.
function setupNavTools() {
  const navs = [...document.querySelectorAll<HTMLElement>('.nav-tools')];
  navs.forEach((nav) => {
    const btn = nav.querySelector<HTMLElement>('.nav-tools-btn');
    if (!btn) return;
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // ne daj document-klik listeneru da odmah zatvori
      btn.setAttribute('aria-expanded', btn.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
    });
    nav.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') { btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
    });
  });
  // Klik izvan zatvara sve otvorene izbornike.
  if (navs.length) {
    document.addEventListener('click', () => {
      navs.forEach((nav) => nav.querySelector('.nav-tools-btn')?.setAttribute('aria-expanded', 'false'));
    });
  }
}

// Prebacivanje teme (svijetla/tamna) + sprema u lekta.theme. Pre-paint restore ostaje inline
// u <head> svake stranice (izbjegava bljesak); ovdje je samo klik-ponasanje, jedan izvor za sve
// stranice (prije duplicirano inline u svakom tool HTML-u i u app.ts za index).
function setupThemeToggle() {
  const btn = document.getElementById('themeBtn');
  if (!btn) return;
  // BL-P3-08: stanje i naziv prate aktivnu temu, pa je preklopnik jasan i citacu zaslona.
  const reflect = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    btn.setAttribute('aria-label', dark ? 'Ugasi radnu lampu' : 'Upali radnu lampu');
    btn.setAttribute('title', dark ? 'Ugasi radnu lampu' : 'Upali radnu lampu');
  };
  reflect();
  btn.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('lekta.theme', dark ? 'light' : 'dark'); } catch { /* storage odbijen */ }
    reflect();
  });
}

// Mobilni hamburger izbornik: #mobileMenuBtn otvara/zatvara #mobileNav, klik na link zatvara.
function setupMobileNav() {
  const btn = document.getElementById('mobileMenuBtn');
  const nav = document.getElementById('mobileNav');
  if (!btn || !nav) return;
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  nav.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) {
      nav.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

// Topbar dobiva hairline + blur tek nakon 24px scrolla (na vrhu je proziran, stopljen s papirom).
function setupTopbarScroll() {
  const bar = document.querySelector<HTMLElement>('header.topbar');
  if (!bar) return;
  const onScroll = () => bar.classList.toggle('scrolled', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

function boot() {
  setupSkipLink(); renderIcons(); setupReveal(); animateHero(); setupTilt(); setupNavTools(); setupThemeToggle(); setupMobileNav(); setupTopbarScroll();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
