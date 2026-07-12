// Korektorski stol: ponasanja dekora landinga (index-only, uvozi ga src/main.ts).
// Default "radna lampa" tema postavlja se u ui-boot.ts (dijeljeno za sve stranice).
// Ovdje: traka napretka citanja (3px crvena, fixed top) + parallax svjetla lampe na
// scroll + sekcijske scene + demo video + "oznaci rijeseno". Sve progresivno.

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

// Demo video: bez autoplaya i bez loopa, pokrece se iskljucivo rucno (play overlay ili klik
// na video). Protiv stekanja: preload ostaje none dok je sekcija daleko, a IO s velikim
// rootMarginom unaprijed bufferira prije nego korisnik stigne kliknuti. Izlazak iz vidokruga
// pauzira, povratak nastavlja samo ako je vec sviralo. Na kraju se umjesto restarta pokaze
// zavrsni ekran (pecat + ponovi / CTA na analizator sa "kreni ovdje" spotom na dropzoni).
// Uz reduced-motion ili bez IO: native kontrole, bez play overlaya, zavrsni ekran ostaje.
function setupVideo(): void {
  const v = document.querySelector<HTMLVideoElement>('.ks-video');
  if (!v) return;
  const playOverlay = document.getElementById('ksVideoPlay');
  const endOverlay = document.getElementById('ksVideoEnd');
  const basic = prefersReduced() || typeof IntersectionObserver !== 'function';
  if (basic) { v.controls = true; playOverlay?.remove(); }

  const showPlay = (show: boolean) => { if (playOverlay && !basic) playOverlay.hidden = !show; };
  const showEnd = (show: boolean) => {
    if (!endOverlay) return;
    endOverlay.hidden = !show;
    if (show) endOverlay.focus();
  };
  const start = () => { showEnd(false); v.play().catch(() => { v.controls = true; showPlay(false); }); };

  playOverlay?.addEventListener('click', start);
  if (!basic) v.addEventListener('click', () => { if (v.paused) start(); else v.pause(); });
  v.addEventListener('play', () => { showPlay(false); showEnd(false); });
  v.addEventListener('pause', () => { if (!v.ended) showPlay(true); });
  v.addEventListener('ended', () => { showPlay(false); showEnd(true); });

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

  if (basic) return;
  // Pauza izvan vidokruga; nastavak samo ako je korisnik vec gledao (nikad hladni autoplay).
  let wasPlaying = false;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { if (wasPlaying && !v.ended) v.play().catch(() => {}); }
      else { wasPlaying = !v.paused && !v.ended; if (!v.paused) v.pause(); }
    }
  }, { threshold: 0.35 });
  io.observe(v);
  // Prefetch: kad se sekcija priblizi na ~900px, bufferiraj unaprijed. load() resetira
  // reprodukciju pa se smije pozvati samo dok nista jos nije pusteno.
  let started = false;
  v.addEventListener('play', () => { started = true; }, { once: true });
  const pre = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    pre.disconnect();
    if (!started) { v.preload = 'auto'; v.load(); }
  }, { rootMargin: '900px 0px' });
  pre.observe(v);
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
