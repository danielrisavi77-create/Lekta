// @ts-nocheck
// Zajednicki boot za sve stranice (index, citat, usporedba):
//  1. self-hostani akademski serif (Source Serif 4, latin + latin-ext za hrvatski),
//  2. Lucide ikone: zamjenjuje <i data-lucide="..."> jedinstvenim stroke setom.
// Bez mreze prema trecim stranama; font se bundla lokalno (unicode-range skida
// samo latin i latin-ext za hrvatski sadrzaj).
import '@fontsource-variable/source-serif-4';
import 'open-props/easings'; // samo easing krivulje (bez boja/sjena, da topla paleta ostane netaknuta)
import { createIcons, SunMoon, Menu, Lock, Upload, CheckCircle, AlertTriangle, AlertCircle, Info, SlidersHorizontal, ClipboardCheck } from 'lucide';

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
function setupReveal() {
  const els = document.querySelectorAll<HTMLElement>('[data-reveal]:not(.reveal-in)');
  const reduce = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || typeof IntersectionObserver === 'undefined') {
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

function boot() { renderIcons(); setupReveal(); }
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
