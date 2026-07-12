// Hero "zivi pregled" (Tinta i papir): jednom-na-load timeline preko data-anim atributa.
// Sve animacije su cisti CSS keyframeovi u index.html (Val 4a sloj); ovaj modul samo
// postavlja okidac NAKON prvog painta (H1 ostaje LCP) i sinkronizira brojcani tick score
// kartice. BAZNO CSS stanje = finalno anotirano stanje, pa je reduced-motion / no-JS
// prikaz ispravan bez ijednog JS grananja. Modul je index-only (import iz src/main.ts).

function prefersReduced(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// easeOutBack: blagi spring overshoot (71 -> ~74 -> 71) bez animacijske biblioteke.
function easeOutBack(p: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}

function setup(): void {
  const root = document.querySelector<HTMLElement>('.hero-demo');
  if (!root) return;
  const replay = document.getElementById('heroReplay');
  if (prefersReduced()) { replay?.remove(); return; }

  const num = root.querySelector<HTMLElement>('.hs-num');
  const score = root.querySelector<HTMLElement>('.hero-score');
  const TARGET = 71;
  let raf = 0;

  const countUp = () => {
    if (!num) return;
    cancelAnimationFrame(raf);
    const t0 = performance.now();
    const DUR = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / DUR);
      num.textContent = String(Math.max(0, Math.round(TARGET * easeOutBack(p))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  };

  // animationstart za hd-score-in okida TEK kad animation-delay (2.6s) istekne,
  // pa je tick savrseno sinkroniziran s pojavom kartice, bez vlastitog timera.
  score?.addEventListener('animationstart', (e) => {
    if ((e as AnimationEvent).animationName === 'hd-score-in') countUp();
  });

  const run = () => {
    cancelAnimationFrame(raf);
    if (num) num.textContent = '0';
    root.removeAttribute('data-anim');
    void root.offsetWidth; // reflow: cisti restart CSS animacija
    root.setAttribute('data-anim', 'run');
  };

  // Dvostruki rAF: okidac tek nakon prvog painta, da animacija ne dira LCP.
  requestAnimationFrame(() => requestAnimationFrame(run));
  replay?.addEventListener('click', run);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
else setup();
