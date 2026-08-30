// Korektorski stol: ponasanja dekora landinga (index-only, uvozi ga src/main.ts).
// Default "radna lampa" tema postavlja se u ui-boot.ts (dijeljeno za sve stranice).
import { createFrameCoalescer } from '../shared/frame-coalescer';
import { videoViewportAction } from './video-loading-policy';
import { progressPercent, scrollRange } from './scroll-state';

// Ovdje: traka napretka citanja (3px crvena, fixed top) + sekcijske scene + demo video
// + "oznaci rijeseno". Dekorativna lampa ostaje staticna da scroll ne pokrece repaint velike
// radijalne povrsine.

function prefersReduced(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function setupDesk(): void {
  const bar = document.querySelector<HTMLElement>('.ks-progress > i');
  if (!bar) return;
  let availableScroll = 0;
  const measureScrollRange = () => {
    availableScroll = scrollRange(document.documentElement.scrollHeight, window.innerHeight);
  };
  measureScrollRange();
  window.addEventListener('resize', measureScrollRange, { passive: true });
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(measureScrollRange).observe(document.body);
  }
  const renderScrollState = () => {
    bar.style.width = progressPercent(window.scrollY, availableScroll) + '%';
  };
  const scheduleScroll = createFrameCoalescer<void>(renderScrollState);
  let scrollIdleTimer = 0;
  const onScroll = () => {
    document.body.classList.add('is-scrolling');
    if (scrollIdleTimer) window.clearTimeout(scrollIdleTimer);
    scrollIdleTimer = window.setTimeout(() => {
      document.body.classList.remove('is-scrolling');
      scrollIdleTimer = 0;
    }, 120);
    scheduleScroll.schedule(undefined);
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

// Kvalitete demo videa (isti sadrzaj, razlicit enkod); JS prebacuje src cuvajuci poziciju.
const Q_MAP: Record<string, { webm: string; mp4: string }> = {
  '720': { webm: '/assets/demo-720.webm', mp4: '/assets/demo-720.mp4' },
  '1080': { webm: '/assets/demo-1080.webm', mp4: '/assets/demo-1080.mp4' },
  '1440': { webm: '/assets/demo-1440.webm', mp4: '/assets/demo-1440.mp4' },
};

function fmtTime(s: number): string {
  const t = Math.max(0, Math.floor(s || 0));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}

// Demo video s custom KS kontrolama (bez autoplaya i loopa): pokrece se rucno (play overlay ili
// klik na video). Kontrolna traka (play/pauza, +-10s, seek, glasnoca, brzina, kvaliteta, fullscreen)
// pojavi se tek kad demo krene. Protiv stekanja: preload ostaje none sve do eksplicitnog playa;
// izlazak iz vidokruga pauzira, povratak nastavlja samo ako je
// vec sviralo. Na kraju umjesto restarta zavrsni ekran (pecat + ponovi / CTA sa "kreni ovdje" spotom).
function setupVideo(): void {
  const v = document.querySelector<HTMLVideoElement>('.ks-video');
  if (!v) return;
  const stage = v.closest<HTMLElement>('.ks-video-stage');
  const playOverlay = document.getElementById('ksVideoPlay');
  const endOverlay = document.getElementById('ksVideoEnd');
  const ctrl = document.getElementById('ksVctrl');
  const noIO = typeof IntersectionObserver !== 'function';

  const showPlay = (show: boolean) => { if (playOverlay) playOverlay.hidden = !show; };
  const showEnd = (show: boolean) => {
    if (!endOverlay) return;
    endOverlay.hidden = !show;
    if (show) endOverlay.focus();
  };
  const start = () => {
    if (videoViewportAction(true) === 'resume') v.play().catch(() => { v.controls = true; });
  };

  playOverlay?.addEventListener('click', start);
  v.addEventListener('click', () => { if (v.paused || v.ended) start(); else v.pause(); });
  // Prvi play aktivira kontrolnu traku; pauza samo mijenja ikonu (veliki overlay se vise ne vraca).
  v.addEventListener('play', () => {
    stage?.classList.add('ks-playing', 'ks-vc-on');
    if (ctrl) ctrl.hidden = false;
    showPlay(false); showEnd(false);
  });
  v.addEventListener('pause', () => { if (!v.ended) stage?.classList.remove('ks-playing'); });
  // Sakrij kontrolnu traku iz tab-reda po zavrsetku (opacity:0 bez hidden bi ostavio fokus na
  // nevidljivim gumbima iza zavrsnog overlaya, WCAG 2.4.7). 'play' pri replayu vraca hidden=false. AUD-14.
  v.addEventListener('ended', () => { stage?.classList.remove('ks-playing', 'ks-vc-on'); if (ctrl) ctrl.hidden = true; showEnd(true); });

  endOverlay?.querySelector('[data-video-replay]')?.addEventListener('click', () => {
    v.currentTime = 0;
    start();
  });
  endOverlay?.querySelectorAll<HTMLAnchorElement>('[data-video-cta]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const target = document.getElementById('analyzer');
      if (target && !prefersReduced()) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
      const dz = document.getElementById('dropzone');
      if (!dz) return;
      dz.classList.remove('ks-spot');
      window.setTimeout(() => dz.classList.add('ks-spot'), 400);
      window.setTimeout(() => dz.classList.remove('ks-spot'), 4400);
    });
  });

  // Custom kontrolna traka
  if (ctrl && stage) {
    const seek = ctrl.querySelector<HTMLInputElement>('[data-vc=seek]');
    const cur = ctrl.querySelector<HTMLElement>('[data-vc=cur]');
    const durEl = ctrl.querySelector<HTMLElement>('[data-vc=dur]');
    const volbar = ctrl.querySelector<HTMLInputElement>('[data-vc=vol]');
    const speedBtn = ctrl.querySelector<HTMLElement>('[data-vc=speed-btn]');
    const qualBtn = ctrl.querySelector<HTMLElement>('[data-vc=quality-btn]');
    // preservesPitch da ubrzanje ne "chipmunkira" glazbu (uz vendor varijante)
    const anyV = v as unknown as Record<string, unknown>;
    anyV.preservesPitch = true; anyV.mozPreservesPitch = true; anyV.webkitPreservesPitch = true;
    v.volume = 0.85;

    const updateVol = () => {
      const muted = v.muted || v.volume === 0;
      stage.classList.toggle('ks-muted', muted);
      const pct = Math.round((v.muted ? 0 : v.volume) * 100);
      if (volbar) { volbar.value = String(pct); volbar.style.setProperty('--v', pct + '%'); }
    };
    updateVol();

    ctrl.querySelector('[data-vc=play]')?.addEventListener('click', () => { if (v.paused || v.ended) start(); else v.pause(); });
    ctrl.querySelector('[data-vc=back]')?.addEventListener('click', () => { v.currentTime = Math.max(0, v.currentTime - 10); });
    ctrl.querySelector('[data-vc=fwd]')?.addEventListener('click', () => { v.currentTime = Math.min(v.duration || 0, v.currentTime + 10); });
    ctrl.querySelector('[data-vc=mute]')?.addEventListener('click', () => { v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 0.5; updateVol(); });

    seek?.addEventListener('input', () => { if (v.duration) v.currentTime = (Number(seek.value) / 1000) * v.duration; });
    volbar?.addEventListener('input', () => { const val = Number(volbar.value); v.volume = val / 100; v.muted = val === 0; updateVol(); });

    v.addEventListener('timeupdate', () => {
      if (cur) cur.textContent = fmtTime(v.currentTime);
      if (v.duration && seek) { const p = (v.currentTime / v.duration) * 1000; seek.value = String(p); seek.style.setProperty('--p', (p / 10) + '%'); }
    });
    v.addEventListener('loadedmetadata', () => { if (durEl && v.duration) durEl.textContent = fmtTime(v.duration); });
    v.addEventListener('volumechange', updateVol);

    ctrl.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => {
      b.addEventListener('click', () => {
        v.playbackRate = Number(b.dataset.speed);
        if (speedBtn) speedBtn.textContent = b.textContent || '';
        ctrl.querySelectorAll('[data-speed]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
      });
    });

    const canWebm = !!v.canPlayType('video/webm; codecs="vp9, opus"');
    ctrl.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => {
      b.addEventListener('click', () => {
        const map = Q_MAP[b.dataset.q || ''];
        if (!map) return;
        const t = v.currentTime; const wasPlaying = !v.paused && !v.ended;
        v.src = canWebm ? map.webm : map.mp4;
        v.load();
        v.addEventListener('loadedmetadata', () => { try { v.currentTime = t; } catch { /* clamp */ } if (wasPlaying) v.play().catch(() => {}); }, { once: true });
        if (qualBtn) qualBtn.textContent = b.textContent || '';
        ctrl.querySelectorAll('[data-q]').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
      });
    });

    ctrl.querySelector('[data-vc=full]')?.addEventListener('click', () => {
      const doc = document as unknown as Record<string, unknown> & { fullscreenElement?: Element };
      const el = stage as unknown as Record<string, unknown>;
      if (document.fullscreenElement || doc.webkitFullscreenElement) {
        (document.exitFullscreen || (doc.webkitExitFullscreen as (() => void) | undefined))?.call(document);
      } else {
        (el.requestFullscreen as (() => void) | undefined || (el.webkitRequestFullscreen as (() => void) | undefined))?.call(el);
      }
    });

    // Izbornici brzine/kvalitete: klik gumba otvara, klik na stavku/vani i Escape zatvaraju.
    ctrl.querySelectorAll<HTMLElement>('.ks-vc-menu').forEach((menu) => {
      const btn = menu.querySelector<HTMLElement>('.ks-vc-mbtn');
      btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = menu.hasAttribute('data-open');
        ctrl.querySelectorAll('.ks-vc-menu').forEach((m) => m.removeAttribute('data-open'));
        if (!open) { menu.setAttribute('data-open', ''); btn.setAttribute('aria-expanded', 'true'); }
        else btn.setAttribute('aria-expanded', 'false');
      });
      menu.querySelector('.ks-vc-list')?.addEventListener('click', () => {
        menu.removeAttribute('data-open');
        btn?.setAttribute('aria-expanded', 'false');
      });
    });
    document.addEventListener('click', () => ctrl.querySelectorAll('.ks-vc-menu').forEach((m) => {
      m.removeAttribute('data-open');
      m.querySelector('.ks-vc-mbtn')?.setAttribute('aria-expanded', 'false');
    }));
    ctrl.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') ctrl.querySelectorAll('.ks-vc-menu').forEach((m) => m.removeAttribute('data-open'));
    });
  }

  if (noIO) return;
  // Pauza izvan vidokruga; nastavak samo ako je korisnik vec gledao (nikad hladni autoplay).
  let wasPlaying = false;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { if (wasPlaying && !v.ended) v.play().catch(() => {}); }
      else { wasPlaying = !v.paused && !v.ended; if (!v.paused) v.pause(); }
    }
  }, { threshold: 0.35 });
  io.observe(v);
}

// Mini toast u postojeci #toastWrap (isti izgled kao app.ts toast, ali neovisan modul).
function ksToast(msg: string): void {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;
  const n = document.createElement('div');
  n.className = 'toast';
  n.textContent = msg;
  wrap.append(n);
  window.setTimeout(() => n.remove(), 2600);
}

// "Oznaci rijeseno": prezentacijski sloj nad issue retcima koje renderira app.ts.
// #issuesList se ponovno renderira innerHTML-om pri svakoj promjeni filtra, pa
// MutationObserver (childList, bez subtree: vlastiti appendi ne okidaju petlju)
// nakon svakog rendera ponovno doda gumb. Stanje zivi u memoriji: popis vrijedi
// za konkretnu analizu i namjerno se ne sprema.
function setupResolve(): void {
  const list = document.getElementById('issuesList');
  if (!list) return;
  const resolved = new Set<string>();
  const keyOf = (art: Element) => art.querySelector('h4')?.textContent || '';
  const augment = () => {
    list.querySelectorAll<HTMLElement>('article.issue').forEach((art) => {
      const done = resolved.has(keyOf(art));
      art.classList.toggle('ks-done', done);
      let btn = art.querySelector<HTMLButtonElement>('.ks-resolve');
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ks-resolve';
        art.append(btn);
      }
      btn.textContent = done ? '✓ Riješeno' : 'Označi riješeno';
      btn.setAttribute('aria-pressed', done ? 'true' : 'false');
    });
  };
  list.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('.ks-resolve');
    if (!btn) return;
    const art = btn.closest('article.issue');
    if (!art) return;
    const key = keyOf(art);
    const nowDone = !resolved.has(key);
    if (nowDone) resolved.add(key); else resolved.delete(key);
    augment();
    if (nowDone) ksToast('Problem je označen kao riješen. Tako se slaže plan ispravaka.');
  });
  new MutationObserver(augment).observe(list, { childList: true });
  augment();
}

function boot(): void { setupDesk(); setupSections(); setupVideo(); setupResolve(); }

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export {};
