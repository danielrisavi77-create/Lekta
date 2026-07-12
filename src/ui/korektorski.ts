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

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupDesk);
else setupDesk();

export {};
