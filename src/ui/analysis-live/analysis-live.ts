/**
 * ANALIZA UZIVO (ALIGNMENT Z33, varijanta A): PRIKAZ. Lijeni modul; ucitava ga `progress-scan.ts`
 * dinamickim uvozom tek kad analiza pocne, pa statican graf rute `/rad/` ne nosi ni ovaj kod ni
 * njegov CSS.
 *
 * Sve odluke o tome STO se crta zive u `analysis-live-model.ts` (cist, testiran). Ovdje je samo
 * DOM: kostur se gradi jednom, a svaki okvir mijenja tekst, atribute i CSS varijable. Pokret je
 * iskljucivo `transform`, `opacity` i `clip-path` (Z31); let cedulje je Web Animations API na
 * KLONU, pa original nikad ne mijenja raspored.
 *
 * Rezultat ne kasni vise od trajanja otkrivanja (`revealDuration`, najvise oko 4 s), a pod
 * `prefers-reduced-motion`, u skrivenoj kartici, na "Preskoči" i na "Pregledaj nalaze" ne kasni
 * uopce. "Napravi plan popravka" otvara rezultat i, kad je ekran rezultata gotov (ukljucivo panel
 * popravka), pokrece ISTI ulaz u popravak kao primarni gumb kokpita, pa nema drugog puta do plana.
 *
 * "Preskoči" nije u predlosku; odstupanje je zapisano u F31 (`docs/agents/orchestrator-backlog.md`).
 */
import './analysis-live.css';
import { pokretPrigusen } from '../../shared/display-prefs';
import { buildLivePlan, readingFrame, revealFrame, revealDuration, FLIGHT, type LiveFrame, type LivePlan } from './analysis-live-model';

export interface LiveHandle {
  start(profile: unknown): void;
  progress(pct: number): void;
  reveal(result: unknown): Promise<void>;
}

const MARK_ROWS = ['font', 'margine', 'prored', 'uvlaka', 'brojevi'] as const;

/** Kako je korisnik napustio otkrivanje: sto ekran rezultata treba uciniti kad bude gotov. */
type Izlaz = 'presuda' | 'plan';

/**
 * Ceka da ekran rezultata objavi spremnost: `#resultView[data-result-ready]` prvo `0` (crtanje
 * pocinje), pa `1` (gotov je i panel popravka; vidi `src/ui/result-ready-signal.ts`). Kokpit se
 * do tada jos jednom precrta, pa fokus ili klik prije toga zavrse na cvoru koji nestane.
 * Vraca funkciju za odustajanje; bez spremnosti u 20 s ne cini nista.
 */
function poSpremnostiRezultata(cin: () => void): () => void {
  const rv = document.getElementById('resultView');
  if (!rv || typeof MutationObserver !== 'function') return () => {};
  let poceo = false;
  let rok = 0;
  const obs = new MutationObserver((zapisi) => {
    const sad = rv.getAttribute('data-result-ready');
    if (sad === '0' || zapisi.some((z) => z.oldValue === '0')) poceo = true;
    if (!poceo || sad !== '1') return;
    odustani();
    cin();
  });
  const odustani = (): void => { obs.disconnect(); window.clearTimeout(rok); };
  obs.observe(rv, { attributes: true, attributeFilter: ['data-result-ready'], attributeOldValue: true });
  rok = window.setTimeout(odustani, 20_000);
  return odustani;
}

/** Fokus na presudu rezultata, ali samo ako ga korisnik vec nije odnio drugamo. */
function fokusNaPresudu(): void {
  const a = document.activeElement;
  if (a && a !== document.body && !a.closest('#progressView')) return;
  const h = document.getElementById('cockpitVerdictTitle');
  if (!h) return;
  if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
  h.focus({ preventScroll: true });
}

const ULAZ_U_POPRAVAK = '#resultCockpit [data-cockpit-primary][data-cockpit-action="repair-safe"]';

/** Ulaz u plan popravka: primarni gumb kokpita kad nosi `repair-safe`, inace samo presuda. */
function otvoriPlan(): void {
  const gumb = document.querySelector<HTMLButtonElement>(ULAZ_U_POPRAVAK);
  if (gumb && !gumb.disabled) gumb.click();
  else fokusNaPresudu();
}

/**
 * Fokus (ne klik) na isti ulaz u popravak: fokus je bio na "Napravi plan popravka" kad je
 * otkrivanje zavrsilo samo od sebe, pa ga dobiva gumb s istom radnjom na ekranu rezultata.
 */
function fokusNaPlan(): void {
  const a = document.activeElement;
  if (a && a !== document.body && !a.closest('#progressView')) return;
  const gumb = document.querySelector<HTMLButtonElement>(ULAZ_U_POPRAVAK);
  if (gumb && !gumb.disabled) gumb.focus({ preventScroll: true });
  else fokusNaPresudu();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

function setText(node: Element | null | undefined, text: string): void {
  if (node && node.textContent !== text) node.textContent = text;
}

function profileText(profile: unknown): { name: string; source: string } {
  const p = (profile && typeof profile === 'object' ? profile : {}) as { name?: unknown; sources?: Array<{ title?: unknown }> };
  const source = Array.isArray(p.sources) ? p.sources.find((s) => typeof s?.title === 'string')?.title : '';
  return { name: typeof p.name === 'string' ? p.name : '', source: typeof source === 'string' ? source : '' };
}

/** Kostur iz predloska. Tekstovi su doslovno iz `Analysis.dc.html` (varijanta A). */
function skeleton(): HTMLElement {
  const root = el('div', 'z33');
  root.innerHTML = [
    '<section class="z33-desk">',
    // JEDINA ziva regija ekrana (Z33-06): jedna cjelovita recenica kad rezultat stigne, nikad slovo po slovo.
    '<p class="sr-only" data-z33="najava" aria-live="polite"></p>',
    '<div class="z33-col" aria-hidden="true">',
    '<div class="z33-status"><span data-z33="status"></span><span data-z33="pages"></span></div>',
    '<div class="z33-sheetrow">',
    '<div class="z33-stack">',
    '<div class="z33-under z33-under--2"></div><div class="z33-under z33-under--1"></div><div class="z33-flip"></div>',
    '<div class="z33-sheet" lang="hr"><div class="z33-text" data-z33="text"></div>',
    MARK_ROWS.map((r) => `<div class="z33-mark z33-mark--${r}" data-z33-mark="${r}"><i class="z33-shape"></i><span class="z33-pencil"></span></div>`).join(''),
    '<div class="z33-lamp"></div><div data-z33="edge"></div><div class="z33-stamp" data-z33="stamp"></div></div>',
    '</div>',
    '<div class="z33-notes" data-z33="notes"></div>',
    '</div></div>',
    '<div class="z33-aside">',
    '<div class="z33-profile"><span class="z33-label">MJERI PREMA</span><span class="z33-profile-name" data-z33="profile"></span><span class="z33-faint" data-z33="source"></span></div>',
    '<div class="z33-score" aria-hidden="true"><span class="z33-score-num" data-z33="score">100</span><span class="z33-score-note"><span>ocjena forme</span><span data-z33="scorenote"></span></span></div>',
    '<ol class="z33-rows" data-z33="rows" aria-hidden="true"></ol>',
    '<div class="z33-stats"><span><b data-z33="s-pages"></b>stranica<small data-z33="n-pages"></small></span><span><b data-z33="s-words"></b>riječi<small data-z33="n-words"></small></span><span><b data-z33="s-sources"></b>izvora<small data-z33="n-sources"></small></span></div>',
    '<div class="z33-notify"><span data-z33="remaining" aria-hidden="true"></span><button type="button" class="z33-link" data-z33="notify" hidden>Javi mi kad bude gotovo</button><button type="button" class="z33-link" data-z33="skip" hidden>Preskoči</button></div>',
    '</div>',
    '</section>',
    '<section class="z33-result">',
    '<div class="z33-res-top">',
    '<div class="z33-verdict-slot" data-z33="verdictslot">',
    '<div class="z33-verdict-wait" aria-hidden="true">PRESUDA · PIŠE SE NAKON ZADNJE PROVJERE</div>',
    '<div class="z33-verdict" data-z33="verdict" hidden><div class="z33-verdict-lead">',
    '<span class="z33-eyebrow" data-z33="eyebrow"></span>',
    '<h3 class="z33-verdict-title"><span data-z33="verdicttext"></span><span class="z33-caret" aria-hidden="true">|</span></h3>',
    '<p class="z33-verdict-meta" data-z33="summary"></p>',
    '<div class="z33-verdict-meta z33-verdict-actions"><button type="button" class="z33-cta" data-z33="plan" hidden>Napravi plan popravka</button><button type="button" class="z33-link z33-link--paper" data-z33="open">Pregledaj nalaze</button></div>',
    '</div><div class="z33-ring" data-z33="ring" aria-hidden="true"><span data-z33="ringnum"></span></div></div>',
    '</div>',
    '<div class="z33-cats" aria-hidden="true"><span class="z33-label z33-label--paper">KATEGORIJE</span><div data-z33="cats"></div></div>',
    '</div>',
    '<div class="z33-findings" aria-hidden="true"><div class="z33-findings-head"><span>NALAZI</span><span data-z33="found"></span></div><div data-z33="slots"></div></div>',
    '</section>',
  ].join('');
  return root;
}

export function mountAnalysisLive(view: HTMLElement): LiveHandle {
  const root = skeleton();
  const q = (name: string): HTMLElement => root.querySelector(`[data-z33="${name}"]`) as HTMLElement;
  // Ekran provjere je `role=status` s `aria-live`; tipkanje presude i ispis nalaza u njemu bi se
  // citali slovo po slovo. Recenicu faze nosi `#progressMessage`, a rezultat jedna najava u kosturu.
  // Live se gasi PRIJE umetanja kostura, da ni sam kostur ne bude procitan kao promjena (Z33-06).
  view.setAttribute('aria-live', 'off');
  const poruka = view.querySelector('#progressMessage');
  poruka?.setAttribute('aria-live', 'polite');
  const sidro = view.querySelector('.pv-local');
  if (sidro) sidro.before(root); else view.append(root);
  view.dataset.z33 = '';

  const notifyBtn = q('notify') as HTMLButtonElement;
  const canNotify = typeof window.Notification === 'function';
  notifyBtn.hidden = !canNotify;
  const skipBtn = q('skip') as HTMLButtonElement;
  const planBtn = q('plan') as HTMLButtonElement;
  let notify = false;
  notifyBtn.addEventListener('click', async () => {
    // Dopustenje se trazi TEK na klik, nikad pri ucitavanju.
    let perm = Notification.permission;
    if (!notify && perm === 'default') {
      try { perm = await Notification.requestPermission(); } catch { perm = 'denied'; }
    }
    notify = !notify && perm === 'granted';
    setText(notifyBtn, notify ? 'Javit ću ti kad bude gotovo ✓' : 'Javi mi kad bude gotovo');
    notifyBtn.dataset.on = notify ? 'true' : 'false';
  });

  let loop = 0;
  // Osigurac otkrivanja (Z33-01): svako otkrivanje ima svoj, a `stop` ga gasi, pa osigurac
  // preskocenog ili zamijenjenog otkrivanja ne moze zavrsiti sljedece.
  let ograda = 0;
  let finish: ((prirodno: boolean) => void) | null = null;
  let clones: HTMLElement[] = [];
  let flown = new Set<number>();
  let scrolled = false;
  let renderedPlan: LivePlan | null = null;
  // Ceka spremnost ekrana rezultata nakon "Preskoči", "Pregledaj nalaze" ili plana; nova analiza je gasi.
  let cekaRezultat: () => void = () => {};
  // Dok je true, pomaci motora crtaju fazu citanja; nakon dolaska rezultata kasni pomak ne smije
  // prebrisati otkriveno (ni zavrsno) stanje.
  let reading = false;
  // True samo dok `izadji` zavrsava otkrivanje; razlikuje klik od prirodnog kraja.
  let rucniIzlaz = false;

  // prirodno=true samo kad otkrivanje zavrsi samo od sebe ili rezultat preuzima ekran;
  // otkazivanje i zamjena analize zavrsavaju bez obavijesti.
  const stop = (prirodno = false): void => {
    if (loop) cancelAnimationFrame(loop);
    loop = 0;
    window.clearTimeout(ograda);
    ograda = 0;
    clones.forEach((c) => c.remove());
    clones = [];
    const f = finish;
    finish = null;
    f?.(prirodno);
  };

  function buildPlanDom(plan: LivePlan | null): void {
    if (renderedPlan === plan && plan) return;
    renderedPlan = plan;
    const text = q('text');
    text.replaceChildren(...(plan && plan.sheet.length
      ? plan.sheet.map((p) => el('p', p.heading ? 'z33-h' : '', p.text))
      : Array.from({ length: 9 }, (_, i) => el('i', i % 4 === 0 ? 'z33-line z33-line--short' : 'z33-line'))));
    // Polozaje tragova i cedulja racuna model iz sidra nalaza u radu (F31 d); ovdje se samo crtaju.
    const findings = plan ? plan.findings : [];
    q('edge').replaceChildren(...findings.map((f) => {
      const m = el('i', 'z33-edge');
      m.style.top = `${f.top.toFixed(2)}%`;
      m.dataset.located = f.at == null ? 'false' : 'true';
      m.style.setProperty('--z33-dy', `${(120 - f.top * 1.414).toFixed(1)}cqw`);
      return m;
    }));
    q('notes').replaceChildren(...findings.map((f, j) => {
      const note = el('div', 'z33-note');
      note.style.top = `${f.noteTop.toFixed(2)}%`;
      note.style.setProperty('--z33-rot', j % 2 ? '-2deg' : '2deg');
      note.append(el('span', 'z33-note-title'), el('span', 'z33-note-meta'));
      return note;
    }));
  }

  function rowsDom(frame: LiveFrame): void {
    const list = q('rows');
    if (list.children.length !== frame.rows.length) {
      list.replaceChildren(...frame.rows.map(() => {
        const li = el('li', 'z33-row');
        li.append(el('span', 'z33-icon'), el('span', 'z33-row-label'), el('span', 'z33-count'));
        return li;
      }));
    }
    frame.rows.forEach((r, i) => {
      const li = list.children[i] as HTMLElement;
      li.dataset.state = r.state;
      setText(li.children[0], r.icon);
      setText(li.children[1], r.label);
      setText(li.children[2], r.count);
    });
  }

  function slotsDom(frame: LiveFrame): void {
    const host = q('slots');
    while (host.children.length > frame.slots.length) host.lastElementChild?.remove();
    while (host.children.length < frame.slots.length) {
      const slot = el('div', 'z33-slot');
      const filled = el('div', 'z33-slot-on');
      const meta = el('span', 'z33-slot-meta');
      meta.append(el('s', ''), document.createTextNode(''));
      filled.append(el('span', 'z33-slot-n'), el('span', 'z33-dot'), el('span', 'z33-slot-title'), meta);
      slot.append(el('div', 'z33-slot-wait'), filled);
      host.append(slot);
    }
    frame.slots.forEach((s, j) => {
      const slot = host.children[j] as HTMLElement;
      slot.dataset.state = s.state;
      slot.dataset.severity = s.severity;
      setText(slot.children[0], s.state === 'placeholder' ? s.label : '');
      const on = slot.children[1];
      setText(on.children[0], s.state === 'filled' ? s.label : '');
      setText(on.children[2], s.title);
      const meta = on.children[3] as HTMLElement;
      meta.dataset.visible = s.metaVisible ? 'true' : 'false';
      setText(meta.children[0], s.measured);
      const rest = s.expected ? (s.measured ? ' → ' : '') + s.expected : '';
      if (meta.lastChild && meta.lastChild.textContent !== rest) meta.lastChild.textContent = rest;
    });
  }

  function apply(frame: LiveFrame, plan: LivePlan | null): void {
    root.dataset.phase = frame.phase;
    buildPlanDom(plan);
    setText(q('status'), frame.statusLine);
    setText(q('score'), frame.score);
    q('score').dataset.long = frame.score.length > 3 ? 'true' : 'false';
    setText(q('scorenote'), frame.scoreNote);
    for (const [name, c] of [['s-pages', frame.stats.pages], ['s-words', frame.stats.words], ['s-sources', frame.stats.sources]] as const) {
      const b = q(name);
      setText(b, c.text);
      b.dataset.unknown = c.title ? 'true' : 'false';
      // Brojac bez broja nosi razlog u `title` cijele celije, ne praznu oznaku; kratka vidljiva
      // oznaka ispod brojke vrijedi i za citac zaslona i na dodir, gdje `title` ne postoji.
      setText(q(name.replace('s-', 'n-')), c.note);
      if (c.title) b.parentElement?.setAttribute('title', c.title); else b.parentElement?.removeAttribute('title');
    }
    setText(q('remaining'), view.querySelector('#progressMessage')?.textContent ?? '');
    notifyBtn.hidden = !canNotify || !frame.notify;
    skipBtn.hidden = !frame.skip;
    planBtn.hidden = !frame.verdict.plan;
    rowsDom(frame);
    for (const row of MARK_ROWS) {
      const mark = root.querySelector(`[data-z33-mark="${row}"]`) as HTMLElement;
      const m = frame.marks.find((x) => x.row === row);
      mark.dataset.tone = m ? m.tone : 'off';
      setText(mark.lastElementChild, m ? (m.tone === 'pass' ? '✓' : m.label) : '');
    }
    const notes = q('notes').children;
    frame.notes.forEach((n, j) => {
      const note = notes[j] as HTMLElement | undefined;
      if (!note) return;
      note.dataset.visible = n.visible ? 'true' : 'false';
      setText(note.children[0], n.title);
      setText(note.children[1], n.meta);
    });
    const edge = q('edge').children;
    frame.edge.forEach((e, j) => {
      const m = edge[j] as HTMLElement | undefined;
      if (!m) return;
      m.dataset.visible = e.visible ? 'true' : 'false';
      m.dataset.gathered = e.gathered ? 'true' : 'false';
    });
    const stamp = q('stamp');
    stamp.dataset.on = frame.stamp ? 'true' : 'false';
    setText(stamp, frame.stamp ?? '');
    slotsDom(frame);
    setText(q('found'), frame.foundLine);
    const cats = q('cats');
    if (cats.children.length !== frame.cats.length) {
      cats.replaceChildren(...frame.cats.map(() => {
        const row = el('div', 'z33-cat');
        row.append(el('span', 'z33-cat-label'), el('span', 'z33-cat-status'));
        return row;
      }));
    }
    frame.cats.forEach((c, i) => {
      const row = cats.children[i] as HTMLElement;
      row.dataset.tone = c.tone;
      setText(row.children[0], c.label);
      setText(row.children[1], c.status);
    });
    const verdict = q('verdict');
    verdict.hidden = !frame.verdict.shown;
    q('verdictslot').dataset.shown = frame.verdict.shown ? 'true' : 'false';
    setText(q('verdicttext'), frame.verdict.text);
    verdict.dataset.caret = frame.verdict.caret ? 'true' : 'false';
    verdict.dataset.meta = frame.verdict.metaVisible ? 'true' : 'false';
    for (const id of frame.flying) if (!flown.has(id)) fly(id);
  }

  function fly(j: number): void {
    flown.add(j);
    const src = q('notes').children[j] as HTMLElement | undefined;
    const tgt = q('slots').children[j] as HTMLElement | undefined;
    if (!src || !tgt || typeof src.animate !== 'function') return;
    const a = src.getBoundingClientRect();
    const b = tgt.getBoundingClientRect();
    const clone = src.cloneNode(true) as HTMLElement;
    clone.classList.add('z33-note--flying');
    Object.assign(clone.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px` });
    document.body.append(clone);
    clones.push(clone);
    const dx = b.left + 40 - a.left;
    const dy = b.top + 8 - a.top;
    const anim = clone.animate([
      { transform: 'rotate(2deg)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) rotate(-6deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(.9)`, opacity: 0 },
    ], { duration: FLIGHT, easing: 'cubic-bezier(.5, 0, .2, 1)' });
    anim.onfinish = () => { clone.remove(); clones = clones.filter((c) => c !== clone); };
  }

  function ping(score: number | null, nalazi: string): void {
    if (!notify || !canNotify || Notification.permission !== 'granted') return;
    try {
      new Notification('Lekta', { body: `Provjera je gotova: ${score == null ? '' : `ocjena ${score}, `}${nalazi}.` });
    } catch { /* obavijest je usluga, ne uvjet */ }
  }

  // Glatko samo kad korisnik ne trazi prigusen pokret (Z33-05); postavka se cita u trenutku skrola.
  function toVerdict(): void {
    const target = q('verdictslot');
    try { target.scrollIntoView({ behavior: pokretPrigusen(document) ? 'auto' : 'smooth', block: 'start' }); } catch { /* stari preglednik */ }
  }

  // Sva tri izlaza zavrsavaju otkrivanje odmah (zavrsno stanje, rezultat preuzima ekran); razlikuju
  // se samo po tome sto se dogodi kad je ekran rezultata gotov.
  /**
   * Fokus `a` je bio u odlaznom ekranu provjere (bilo koji gumb: "Preskoči", obavijest, "Pregledaj
   * nalaze", plan, "Prekini") kad je otkrivanje zavrsilo samo od sebe. Ekran se sakrije i fokus bi
   * pao na `body`; zato ide na odgovarajucu kontrolu rezultata kad je rezultat spreman (Z33-07).
   */
  const cuvajFokus = (a: Element | null): void => {
    if (!a || a === document.body || !view.contains(a)) return;
    cekaRezultat();
    cekaRezultat = poSpremnostiRezultata(a === planBtn ? fokusNaPlan : fokusNaPresudu);
  };

  const izadji = (kamo: Izlaz): void => {
    if (!finish) return;
    cekaRezultat();
    cekaRezultat = poSpremnostiRezultata(kamo === 'plan' ? otvoriPlan : fokusNaPresudu);
    rucniIzlaz = true;
    try { stop(true); } finally { rucniIzlaz = false; }
  };
  q('open').addEventListener('click', () => izadji('presuda'));
  skipBtn.addEventListener('click', () => izadji('presuda'));
  planBtn.addEventListener('click', () => izadji('plan'));

  return {
    start(profile) {
      stop();
      cekaRezultat();
      reading = true;
      flown = new Set();
      scrolled = false;
      const p = profileText(profile);
      setText(q('profile'), p.name);
      setText(q('source'), p.source);
      setText(q('najava'), '');
      apply(readingFrame(0), null);
    },
    progress(pct) {
      if (finish && pct === 0) { stop(); return; }
      if (reading) apply(readingFrame(pct), null);
    },
    reveal(result) {
      stop();
      reading = false;
      const plan = buildLivePlan(result);
      const wide = window.matchMedia?.('(min-width: 980px)')?.matches ?? true;
      flown = new Set();
      scrolled = false;
      setText(q('profile'), plan.profile);
      if (plan.source) setText(q('source'), plan.source);
      setText(q('eyebrow'), plan.eyebrow);
      setText(q('summary'), plan.summary);
      const ring = q('ring');
      ring.hidden = plan.score == null;
      ring.style.setProperty('--z33-ring', String(plan.score ?? 0));
      setText(q('ringnum'), plan.score == null ? '' : String(plan.score));
      const nalazi = revealFrame(plan, Infinity, wide).scoreNote;
      // Jedna cjelovita najava za citac zaslona, upisana jednom (Z33-06).
      const ocjena = plan.score == null ? '' : `, ocjena forme ${plan.score}`;
      setText(q('najava'), `Provjera je gotova. ${plan.verdict}${ocjena}. ${plan.summary}`);
      // Zavrsno stanje odmah: prigusen pokret ili kartica koju nitko ne gleda.
      if (pokretPrigusen(document) || document.hidden) {
        const fokus = document.activeElement;
        apply(revealFrame(plan, Infinity, wide), plan);
        cuvajFokus(fokus);
        ping(plan.score, nalazi);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const t0 = performance.now();
        const onHidden = (): void => { if (document.hidden) stop(true); };
        // Korisnik koji sam pomakne prikaz (kotacic, prst, tipke za skrol) cita ili dodiruje nesto
        // drugo: otkrivanje mu tada ne odvlaci stranicu do presude (Z33-05).
        const SKROL_TIPKE = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
        const onUserScroll = (e: Event): void => {
          if (e.type !== 'keydown' || SKROL_TIPKE.has((e as KeyboardEvent).key)) scrolled = true;
        };
        const SKROL_DOGADAJI = ['wheel', 'touchmove', 'keydown'] as const;
        finish = (prirodno) => {
          document.removeEventListener('visibilitychange', onHidden);
          for (const d of SKROL_DOGADAJI) window.removeEventListener(d, onUserScroll);
          // Otkrivanje je zavrsilo samo od sebe: fokus se cita PRIJE crtanja zavrsnog stanja, jer
          // skriveni gumb gubi fokus. Klik vec ceka spremnost rezultata u `izadji`.
          const fokus = prirodno && !rucniIzlaz ? document.activeElement : null;
          apply(revealFrame(plan, Infinity, wide), plan);
          cuvajFokus(fokus);
          if (prirodno) ping(plan.score, nalazi);
          resolve();
        };
        document.addEventListener('visibilitychange', onHidden);
        for (const d of SKROL_DOGADAJI) window.addEventListener(d, onUserScroll, { passive: true });
        // Prvi okvir otkrivanja odmah, ne tek u sljedecem kadru: "Preskoči" postoji od pocetka.
        apply(revealFrame(plan, 0, wide), plan);
        const tick = (): void => {
          // Prigusen pokret ukljucen usred otkrivanja (Z33-12): CSS gasi animacije, ali tipkanje,
          // let cedulja i skrol idu iz JS-a, pa se otkrivanje odmah zavrsava.
          if (pokretPrigusen(document)) { loop = 0; stop(true); return; }
          const frame = revealFrame(plan, performance.now() - t0, wide);
          apply(frame, plan);
          if (frame.scrollToVerdict && !scrolled) { scrolled = true; toVerdict(); }
          if (frame.done) { loop = 0; stop(true); return; }
          loop = requestAnimationFrame(tick);
        };
        loop = requestAnimationFrame(tick);
        // Ograda: rAF stoji u nekim okruzenjima (pozadinska kartica, testni preglednik bez slika);
        // rezultat ne smije cekati dulje od otkrivanja ni tada.
        const ovaj = finish;
        ograda = window.setTimeout(() => { if (finish === ovaj) stop(true); }, revealDuration(plan, wide) + 500);
      });
    },
  };
}
