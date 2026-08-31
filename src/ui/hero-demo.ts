// Hero "zivi pregled" (Korektorski stol): papiri sjednu na stol, plavi sken prijede preko
// A4 lista, rukopisne korekture iskacu dok sken prolazi, digitalni nalaz izbroji do 71,
// pa se dva nalaza prekrize u zeleno. WAAPI orkestracija (port iz dizajn-mockupa).
// Bazno stanje u markupu JE finalno anotirano stanje: bez JS-a i uz reduced-motion prikaz
// je ispravan bez grananja. S JS-om se stage "naoruza" (hd-armed sakrije dijelove) pa
// play() animira natrag do istog finalnog stanja; replay resetira preko cancel() animacija.

const EASE = 'cubic-bezier(.22,1,.36,1)';
const POP = 'cubic-bezier(.34,1.4,.5,1)';
const SCAN_EASE = 'cubic-bezier(.45,.05,.35,1)';
const TARGET = 71;
const STAGE_W = 504;
const STAGE_H = 660;

function prefersReduced(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function setup(): void {
  const root = document.querySelector<HTMLElement>('.hero-demo');
  if (!root) return;
  const replay = document.getElementById('heroReplay');
  const stage = root.querySelector<HTMLElement>('.hd-stage');

  // Pozornica je fiksni 504x660 layout; skaliramo je prema sirini stupca (mockup ponasanje).
  if (stage && typeof ResizeObserver === 'function') {
    const measure = () => {
      const w = root.clientWidth;
      const s = Math.min(1, w / STAGE_W);
      // Fit-scale ide u NEOVISNO svojstvo `scale`, ne u `transform`: `transform` na .hd-stage
      // je rezerviran za naginjanje scene iz hero-depth.ts. Oba se komponiraju (translate,
      // rotate, scale, pa transform) i dijele isti transform-origin, pa je kadar identican.
      stage.style.scale = String(s);
      root.style.height = `${Math.round(STAGE_H * s)}px`;
    };
    new ResizeObserver(measure).observe(root);
    measure();
  }

  if (prefersReduced()) { replay?.remove(); return; }

  const h = (k: string) => root.querySelector<HTMLElement>(`[data-hero="${k}"]`);
  let timers: number[] = [];
  let raf = 0;
  let autoReplays = 0;

  // Marketing: hero "zivi pregled" je nas najjaci wordless value-prop. Nakon sto demo zavrsi i
  // korisnik zastane (dwell), pustimo ga JOS JEDNOM da ponovno pokazemo proizvod na djelu. Cap 1
  // (nikad loop) da ne odvlaci paznju ni ne trosi bateriju; presko0ci ako je tab skriven ili je
  // hero izasao iz vidnog polja. Rucni replay (clearTimers) otkazuje nudge (korisnik je vec ukljucen).
  const maybeReplay = (): void => {
    if (autoReplays >= 1 || document.hidden) return;
    const rect = root.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top >= vh * 0.6 || rect.bottom <= vh * 0.2) return;
    autoReplays += 1;
    play();
  };
  const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };
  const clearTimers = () => {
    timers.forEach((t) => window.clearTimeout(t));
    timers = [];
    if (raf) window.cancelAnimationFrame(raf);
  };

  const ALL = ['back', 'sheet', 'postit', 'score', 'scorechip', 'a1', 'a2', 'a3', 'a3line', 'f2', 'f3', 'scan'];

  function play(): void {
    clearTimers();
    const st = h('strike');
    const ci = h('circle');
    const sv = h('scoreval');

    // Reset: prekini prijasnje fill:forwards animacije pa sakrij sve dijelove.
    ALL.forEach((k) => {
      const el = h(k);
      if (!el) return;
      el.getAnimations().forEach((a) => a.cancel());
      el.style.opacity = '0';
    });
    if (st) st.style.textDecorationColor = 'transparent';
    if (ci) ci.style.borderColor = 'transparent';
    if (sv) sv.textContent = '0';

    const anim = (k: string, kf: Keyframe[], opt: KeyframeAnimationOptions): Animation | null => {
      const el = h(k);
      if (!el) return null;
      return el.animate(kf, { fill: 'forwards', ...opt });
    };

    // 1. papiri sjedaju na stol
    anim('back', [
      { opacity: 0, transform: 'rotate(8deg) translateY(24px)' },
      { opacity: 1, transform: 'rotate(5deg) translateY(0)' },
    ], { duration: 560, easing: EASE });
    const sheetAnim = anim('sheet', [
      { opacity: 0, transform: 'rotate(-5deg) translateY(28px)' },
      { opacity: 1, transform: 'rotate(-2.5deg) translateY(0)' },
    ], { delay: 140, duration: 620, easing: EASE });
    // Nakon ulaza oslobodi transform (cancel vraca CSS rotate pa hover-ispravljanje radi).
    if (sheetAnim) {
      sheetAnim.finished.then(() => {
        const el = h('sheet');
        if (el) el.style.opacity = '1';
        sheetAnim.cancel();
      }).catch(() => { /* replay je prekinuo ulaz */ });
    }
    anim('postit', [
      { opacity: 0, transform: 'rotate(12deg) scale(.7)' },
      { opacity: 1, transform: 'rotate(6deg) scale(1)' },
    ], { delay: 520, duration: 460, easing: POP });

    // 2. sken preko papira
    anim('scan', [
      { opacity: 0, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'translateY(60px)', offset: 0.1 },
      { opacity: 1, transform: 'translateY(540px)', offset: 0.9 },
      { opacity: 0, transform: 'translateY(586px)' },
    ], { delay: 900, duration: 1800, easing: SCAN_EASE });

    // 3. lektorske oznake iskacu dok sken prolazi
    later(() => { if (st) { st.style.transition = 'text-decoration-color .3s'; st.style.textDecorationColor = 'var(--red-deep)'; } }, 1350);
    later(() => { if (ci) { ci.style.transition = 'border-color .3s'; ci.style.borderColor = 'var(--red-deep)'; } }, 1550);
    const pop = (k: string, ms: number, rot: string) => later(() => {
      const el = h(k);
      if (!el) return;
      el.style.opacity = '1';
      el.animate([
        { opacity: 0, transform: `${rot} scale(1.5)` },
        { opacity: 1, transform: `${rot} scale(.96)`, offset: 0.7 },
        { opacity: 1, transform: `${rot} scale(1)` },
      ], { duration: 380, easing: POP });
    }, ms);
    pop('a1', 1450, 'rotate(0deg)');
    pop('a2', 1850, 'rotate(180deg)');
    later(() => {
      const el = h('a3line');
      if (el) { el.style.opacity = '1'; el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240 }); }
    }, 2150);
    pop('a3', 2250, 'rotate(-2deg)');

    // 4. digitalni nalaz + brojac
    later(() => {
      const sc = h('score');
      if (sc) {
        sc.style.opacity = '1';
        sc.animate([
          { opacity: 0, transform: 'rotate(1.5deg) translateY(14px)' },
          { opacity: 1, transform: 'rotate(1.5deg) translateY(0)' },
        ], { duration: 460, easing: EASE });
      }
      const start = performance.now();
      const dur = 900;
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        if (sv) sv.textContent = String(Math.round(eased * TARGET));
        if (p < 1) { raf = window.requestAnimationFrame(tick); return; }
        const ch = h('scorechip');
        if (ch) { ch.style.opacity = '1'; ch.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280 }); }
      };
      raf = window.requestAnimationFrame(tick);
    }, 2750);

    // 5. dva ispravka: crveno prelazi u zeleno (rotacija zelenih zivi u CSS --hd-rot)
    const fix = (redK: string, greenK: string, ms: number) => later(() => {
      const r = h(redK);
      const g = h(greenK);
      if (r) r.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
      if (!g) return;
      g.style.opacity = '1';
      const rot = getComputedStyle(g).getPropertyValue('--hd-rot').trim() || 'rotate(0deg)';
      g.animate([
        { opacity: 0, transform: `${rot} scale(1.4)` },
        { opacity: 1, transform: `${rot} scale(.97)`, offset: 0.65 },
        { opacity: 1, transform: `${rot} scale(1)` },
      ], { duration: 420, easing: POP });
    }, ms);
    fix('a2', 'f2', 3600);
    later(() => {
      const l = h('a3line');
      if (l) l.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
    }, 3920);
    fix('a3', 'f3', 3950);
    // ~5s dwell nakon zavrsetka demoa: jednokratni auto-replay (uvjeti u maybeReplay).
    later(maybeReplay, 9400);
  }

  // "Naoruzaj" stage odmah (sakrij animirane dijelove prije prvog painta koliko je moguce),
  // pa pusti pregled s malim zaostatkom da H1 ostane LCP.
  root.classList.add('hd-armed');
  window.setTimeout(play, 300);
  replay?.addEventListener('click', play);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
else setup();

export {};
