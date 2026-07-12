// Korektorski stol: ponasanja dekora landinga (index-only, uvozi ga src/main.ts).
// 1. Default osvjetljenje je "radna lampa" (tamni stol). Kad korisnik NEMA spremljenu temu,
//    postavi data-theme="dark" prije ui-boot boot()-a, pa #themeBtn preklopnik radi prirodno
//    (dark -> light = danje svjetlo). Namjerno se NE pise u localStorage: eksplicitni izbor
//    ostaje korisnikov, a ostale stranice zadrzavaju svoj default.
// 2. Traka napretka citanja (3px crvena, fixed top) + parallax svjetla lampe na scroll.
// Progresivno: bez JS-a stranica je staticna radna lampa bez trake, nista ne ovisi o ovome.

const root = document.documentElement;
if (!root.dataset.theme) root.dataset.theme = 'dark';

function prefersReduced(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function setupDesk(): void {
  const bar = document.querySelector<HTMLElement>('.ks-progress > i');
  const lamp = document.querySelector<HTMLElement>('.ks-lamp');
  if (!bar && !lamp) return;
  const reduced = prefersReduced();
  const onScroll = () => {
    if (bar) {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + '%';
    }
    if (lamp && !reduced) lamp.style.transform = `translateY(${window.scrollY * 0.12}px)`;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// Sekcijske scene (Kako radi / Sto ti lektor podcrta / Privatnost): klik samo postavlja
// data-atribut na kontejner + aria-pressed na gumbe; sav prikaz vodi CSS. Bez JS-a je
// vidljiva prva scena, pa je sve progresivno.
function bindScenes(rootSel: string, btnSel: string, attr: string): void {
  const root = document.querySelector<HTMLElement>(rootSel);
  if (!root) return;
  const btns = [...root.querySelectorAll<HTMLElement>(btnSel)];
  btns.forEach((btn) => {
    btn.addEventListener('click', () => {
      root.setAttribute(attr, btn.dataset.k || '0');
      btns.forEach((b) => b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'));
    });
  });
}

function setupSections(): void {
  bindScenes('.ks-kako', '.ks-step', 'data-scene');
  bindScenes('.ks-doc-grid', '.ks-di', 'data-issue');
  bindScenes('.ks-priv', '.ks-priv-btn', 'data-mode');
  // "Otvori puni izvjestaj" u prozoru proizvoda pokrece postojeci demo (guarded).
  document.querySelectorAll<HTMLElement>('.ks-demo-link').forEach((b) => {
    b.addEventListener('click', () => { document.getElementById('demoBtn')?.click(); });
  });
}

// Demo video: autoplay tek kad udje u vidokrug, pauza kad izadje (stedi podatke, preload=none).
// Uz reduced-motion se ne pusta samo od sebe nego dobiva kontrole za rucno pokretanje.
function setupVideo(): void {
  const v = document.querySelector<HTMLVideoElement>('.ks-video');
  if (!v) return;
  if (prefersReduced() || typeof IntersectionObserver !== 'function') { v.controls = true; return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) v.play().catch(() => { v.controls = true; });
      else v.pause();
    }
  }, { threshold: 0.35 });
  io.observe(v);
}

function boot(): void { setupDesk(); setupSections(); setupVideo(); }

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export {};
