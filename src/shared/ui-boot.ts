// @ts-nocheck
// Zajednicki boot za sve stranice (index, citat, usporedba):
//  1. self-hostani akademski serif (Source Serif 4, latin + latin-ext za hrvatski),
//  2. Lucide ikone: zamjenjuje <i data-lucide="..."> jedinstvenim stroke setom.
// Bez mreze prema trecim stranama; font se bundla lokalno (unicode-range skida
// samo latin i latin-ext za hrvatski sadrzaj).
import '@fontsource-variable/source-serif-4';
import 'open-props/easings'; // samo easing krivulje (bez boja/sjena, da topla paleta ostane netaknuta)
import './motion.css'; // dijeljeni sloj gibanja: tokeni, tekstura papira, View Transitions, tipografija
import { createIcons, SunMoon, Menu, Lock, Upload, CheckCircle, AlertTriangle, AlertCircle, Info, SlidersHorizontal, ClipboardCheck } from 'lucide';

const EASE_OUT = [0.22, 1, 0.36, 1];
function prefersReduced() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Motion se ucitava lijeno (zaseban chunk, ne blokira prvi paint); animacije su cisto
// progresivno pobojlsanje. app.ts (rezultati) koristi window.__lektaAnimate kad je spreman.
const motionReady: Promise<any> = prefersReduced()
  ? Promise.resolve(null)
  : import('motion').then((m) => { (window as any).__lektaAnimate = m.animate; return m; }).catch(() => null);

function renderIcons() {
  try {
    createIcons({
      icons: { SunMoon, Menu, Lock, Upload, CheckCircle, AlertTriangle, AlertCircle, Info, SlidersHorizontal, ClipboardCheck },
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
  motionReady.then((m) => {
    if (!m) return;
    const copy = Array.from(document.querySelectorAll<HTMLElement>('.hero-copy > *'));
    const preview = document.querySelector<HTMLElement>('.preview-card');
    const items = preview ? [...copy, preview] : copy;
    if (!items.length) return;
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

// "Alati" padajuci izbornik je CSS-only (hover + focus-within). Sinkroniziramo aria-expanded
// da citaci ekrana najavljuju otvoreno/zatvoreno stanje (inace samo aria-haspopup, bez stanja).
function setupNavTools() {
  document.querySelectorAll<HTMLElement>('.nav-tools').forEach((nav) => {
    const btn = nav.querySelector<HTMLElement>('.nav-tools-btn');
    if (!btn) return;
    btn.setAttribute('aria-expanded', 'false');
    const set = (v: boolean) => btn.setAttribute('aria-expanded', String(v));
    nav.addEventListener('mouseenter', () => set(true));
    nav.addEventListener('mouseleave', () => set(false));
    nav.addEventListener('focusin', () => set(true));
    nav.addEventListener('focusout', (e) => { if (!nav.contains(e.relatedTarget as Node)) set(false); });
  });
}

function boot() { renderIcons(); setupReveal(); animateHero(); setupTilt(); setupNavTools(); }
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
