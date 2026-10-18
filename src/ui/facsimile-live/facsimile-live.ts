/**
 * FAKSIMIL: SVE U JEDNOM (ALIGNMENT Z35): PRIKAZ. Lijeni modul; otvara ga stol Z34
 * (`result-live.ts`) dinamickim uvozom tek na klik "Otvori faksimil", pa ni graf rute `/rad/` ni
 * lijeni Z34 ne nose ovaj kod ni njegov CSS. Stari prikaz (stol Z8 s faksimilom Z9) ostaje iza
 * postojeceg prekidaca `?resultRenderer=legacy`.
 *
 * Sloj preko cijelog prozora (`role="dialog"`), jer predlozak je zasebna stranica s povratkom "←
 * Natrag na presudu". Plan je ZAJEDNICKI sa Z34: ukljucivanje zahvata ovdje mijenja odabir na
 * presudi (i obrnuto), a "Napravit ću sam" zivi u stanju Z34, pa prezivi zatvaranje.
 *
 * Sve odluke o tome STO se crta su u `facsimile-live-model.ts`. Ovdje su samo DOM, mjerenje polozaja
 * (tocka, biljeska i nit stoje uz STVARNI redak odlomka, izmjeren nakon crtanja) i dogadaji.
 * POKRET (Z31): samo `transform`, `opacity` i `clip-path`; pod smanjenim pokretom nista se ne mice.
 */
import './facsimile-live.css';
import { pokretPrigusen } from '../../shared/display-prefs';
import { releaseModal, trapModal } from '../modal-utils';
import type { VisualFindingModel } from '../results/visual-result-model';
import {
  prebaci, vidljiviZahvati,
  type IzgledStranice, type LiveStavka, type TrakaStranica, type UlogaNalaza, type ZahvatPlana,
} from '../result-live/result-live-model';
import {
  biljeske, duhPravilnika, isjecak, listNalaza, mjernaOznaka, natpisLista, ocitanje, odlomakNakon, ozbiljnostFx,
  planOblika, planRedak, popravakVidljiv, proredOznaka, raspored, redCekanja, sidro, stranice,
  type FxOdlomak, type FxPreview, type PlanOblika, type Raspored,
} from './facsimile-live-model';

export interface FaksimilOpcije {
  readonly nalazi: readonly VisualFindingModel[];
  readonly uloge: readonly UlogaNalaza[];
  readonly preview: FxPreview | null;
  readonly traka: TrakaStranica;
  readonly sada: IzgledStranice;
  readonly stavke: readonly LiveStavka[];
  readonly zahvati: readonly ZahvatPlana[];
  readonly repairAvailable: boolean;
  readonly autoritativno: boolean;
  readonly score: number | null;
  readonly ceiling: number | null;
  /** "rad.docx · profil" za zaglavlje; `null` kad presuda nema ni jedno ni drugo. */
  readonly naslov: string | null;
  /** Nalaz koji je bio na kartici presude. */
  readonly pocetni: number;
  /** Nalazi oznaceni "Napravit ću sam"; skup je u vlasnistvu Z34. */
  readonly rucno: Set<string>;
  readonly odabir: () => ReadonlySet<string>;
  readonly postaviOdabir: (novi: Set<string>) => void;
  readonly naPlan: () => void;
  /** Zatvaranje vraca odabrani nalaz, da ga presuda pokaze. */
  readonly naZatvori: (odabrani: number) => void;
  readonly esc: (v: string) => string;
}

export interface FaksimilHandle {
  zatvori(): void;
}

type Sloj = 'notes' | 'dots' | 'rulers' | 'ghost';
type Objasnjenje = Sloj | 'slider';

/** Objasnjenja slojeva, doslovno iz predloska (`FX_TIP`). */
const FX_TIP: Readonly<Record<Objasnjenje, { readonly icon: string; readonly t: string; readonly d: string }>> = {
  notes: { icon: '✎', t: 'Bilješke', d: 'Korektorske bilješke uz desni rub stranice. Svaka kaže što je izmjereno i što traži pravilnik, a tanka nit je vodi do točke u retku. Klik otvara nalaz u kartici.' },
  dots: { icon: '●', t: 'Točke', d: 'Točka na rubu stranice stoji uz redak u kojem je nalaz. Crvena i jantarna znače da nalaz čeka, zelena da je u planu ili ga radiš sam.' },
  rulers: { icon: '↔', t: 'Mjerne linije', d: 'Crta izmjerenu lijevu marginu i prored ravno na stranici, s brojkom. Kad pokažeš popravak margine, crta se pomakne na 2,5 cm.' },
  ghost: { icon: '▢', t: 'Duh pravilnika', d: 'Iscrtkani okvir pokazuje gdje bi tekst stajao po pravilniku. Obojeni pojas lijevo je razlika u margini, vodoravne linije su prored 1,5.' },
  slider: { icon: '⇆', t: 'Prije / poslije', d: 'Ručka preko stranice: lijevo je rad nakon plana popravka, desno kakav je sada. Vuci ručku ili je pomiči strelicama. Jantarno ostaje ono što radiš sam.' },
};

const PT_PO_CM = 72 / 2.54;
const ZADANA_STRANICA = { w: 21, h: 29.7 };
const MIRUJE_MS = 500;
const TIP_DODIR_MS = 3500;
const LIST_MS = 560;
const CSS_PORAVNANJE: Readonly<Record<string, string>> = { lijevo: 'left', desno: 'right', 'u sredini': 'center', obostrano: 'justify' };
const SERIFNO = ['times', 'serif', 'georgia', 'garamond', 'minion', 'cambria', 'book antiqua', 'palatino'];

/** CSS stog pisma; ime koje nije cisto ime pisma pada na pismo dokumenta. */
function pismoCss(ime: string | null): string {
  if (!ime || !/^[\p{L}\p{N} .-]{1,40}$/u.test(ime)) return 'var(--font-doc)';
  const serif = SERIFNO.some((h) => ime.toLowerCase().includes(h));
  return `'${ime}', ${serif ? "'Liberation Serif', Georgia, 'Times New Roman', serif" : "Carlito, 'Liberation Sans', Arial, sans-serif"}`;
}

const zaokruzi = (n: number): string => (Math.round(n * 1000) / 1000).toString();

export function otvoriFaksimil(doc: Document, o: FaksimilOpcije): FaksimilHandle {
  const win = doc.defaultView;
  const esc = o.esc;
  const nalazi = o.nalazi;
  const st = stranice(o.preview, o.traka);
  const velicina = o.preview?.page && typeof o.preview.page.size === 'object' && o.preview.page.size !== null
    ? o.preview.page.size as { w?: unknown; h?: unknown } : null;
  const W = typeof velicina?.w === 'number' && velicina.w > 5 && velicina.w < 60 ? velicina.w : ZADANA_STRANICA.w;
  const H = typeof velicina?.h === 'number' && velicina.h > 5 && velicina.h < 90 ? velicina.h : ZADANA_STRANICA.h;
  const cqw = (cm: number): string => `${zaokruzi((cm / W) * 100)}cqw`;
  const ptu = `${zaokruzi((100 / (W * PT_PO_CM)))}cqw`;
  const duh = duhPravilnika(o.stavke, o.zahvati);
  // Prije / poslije samo kad plan nudi vidljivu promjenu (isto pravilo kao "Sada / Nakon plana" u Z34).
  const imaKlizac = o.repairAvailable && vidljiviZahvati(o.stavke, o.zahvati).length > 0;
  const tiho = pokretPrigusen(doc);
  const mis = win?.matchMedia?.('(hover: hover)').matches ?? true;

  let sel = Math.max(0, Math.min(nalazi.length - 1, o.pocetni));
  // Nalaz bez sidra otvara list s prvim naslovom 1. razine (pocetak tijela, kao stranica Z34).
  const prviNaslov = Math.max(0, st.stranice.findIndex((s) => s.odlomci.some((p) => p.razina === 1)));
  let k = (nalazi[sel] ? listNalaza(st, nalazi[sel]) : null) ?? prviNaslov;
  const L: Record<Sloj, boolean> = { notes: true, dots: true, rulers: false, ghost: false };
  let klizac = false;
  let split = 50;
  let pokazan: number | null = null;
  let hov: Objasnjenje | null = null;
  let tipX = 0;
  let strelica = 24;
  let tipRok = 0;
  let miruje = 0;
  let vuce = false;
  let zatvoren = false;
  const ciscenja: Array<() => void> = [];

  const ras = (): Raspored => raspored(win?.innerWidth ?? 1440, win?.innerHeight ?? 900, mis);

  /* ---------------------------------------------------------------- kostur */

  const root = doc.createElement('div');
  root.className = 'fl';
  root.dataset.fl = '';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Faksimil');
  const sloj = (kljuc: Sloj, natpis: string): string =>
    `<button type="button" class="fl-pill" data-fl-layer="${kljuc}" aria-describedby="fl-explain"><span class="fl-pill__dot fl-pill__dot--${kljuc}" aria-hidden="true"></span>${natpis}</button>`;
  root.innerHTML = '<div class="fl-glow" aria-hidden="true"></div>'
    + '<header class="fl-head">'
    + '<span class="fl-brand"><span class="fl-mark" aria-hidden="true">L<i></i></span><span class="fl-word">Lekta</span></span>'
    + (o.naslov ? `<span class="fl-doc">${esc(o.naslov)}</span>` : '')
    + '<button type="button" class="fl-back" data-fl-back>← Natrag na presudu</button>'
    + '</header>'
    + '<div class="fl-main">'
    + '<div class="fl-layers" role="group" aria-label="Slojevi"><span class="fl-k">SLOJEVI</span>'
    + sloj('notes', 'BILJEŠKE') + sloj('dots', 'TOČKE') + sloj('rulers', 'MJERNE LINIJE') + sloj('ghost', 'DUH PRAVILNIKA')
    + (imaKlizac
      ? '<span class="fl-sep" aria-hidden="true"></span><button type="button" class="fl-pill fl-pill--slider" data-fl-slider aria-describedby="fl-explain">⇆ PRIJE / POSLIJE</button>'
      : '')
    + '</div>'
    + '<div class="fl-tipbar" data-fl-tipbar></div>'
    + '<div class="fl-grid" data-fl-grid>'
    + '<section class="fl-pagecol" aria-label="Stranica rada">'
    + '<div class="fl-pagehead">'
    + '<span class="fl-readout" data-fl-readout aria-live="polite"><span class="fl-readout__o" aria-hidden="true"></span><span data-fl-readout-t></span></span>'
    + '<span class="fl-nav"><button type="button" class="fl-nav__b" data-fl-flip="-1" aria-label="Prethodna stranica">←</button>'
    + '<span class="fl-nav__t" data-fl-natpis></span>'
    + '<button type="button" class="fl-nav__b" data-fl-flip="1" aria-label="Sljedeća stranica">→</button></span>'
    + '</div>'
    + '<div class="fl-page" data-fl-page></div>'
    + '</section>'
    + '<aside class="fl-notes" data-fl-notes aria-label="Bilješke"></aside>'
    + '<ol class="fl-list" data-fl-list aria-label="Bilješke"></ol>'
    + '<article class="fl-card" data-fl-card aria-live="polite"></article>'
    + '<svg class="fl-threads" data-fl-threads aria-hidden="true"></svg>'
    + '</div>'
    + '<section class="fl-queue" data-fl-queue aria-label="Red čekanja i stranice"></section>'
    + '</div>';

  const q = <T extends Element = HTMLElement>(s: string): T | null => root.querySelector<T>(s);

  /* ---------------------------------------------------------------- oblik lista */

  const ulogaOd = (i: number): UlogaNalaza => o.uloge[i] ?? { kind: 'bez' };
  const stavkeNalaza = (i: number): LiveStavka[] => {
    const u = ulogaOd(i);
    return u.kind === 'zahvat' ? o.stavke.filter((s) => u.ruleIds.includes(s.ruleId)) : [];
  };
  /** Oblik "Pokaži popravak": zahvati SAMO tog nalaza, primijenjeni na stranicu (dokument se ne dira). */
  const obliciPokazanog = (): PlanOblika | null => {
    if (pokazan === null) return null;
    const u = ulogaOd(pokazan);
    return u.kind === 'zahvat' ? planOblika(stavkeNalaza(pokazan), new Set(u.ruleIds)) : null;
  };

  const stilOdlomka = (p: FxOdlomak): string => [
    p.pt !== null ? `--fl-pt:${zaokruzi(p.pt)}` : '',
    p.prored !== null ? `--fl-lh:${zaokruzi(p.prored * 1.15)}` : '',
    p.poravnanje ? `text-align:${CSS_PORAVNANJE[p.poravnanje]}` : '',
    p.prije !== null ? `margin-top:calc(${zaokruzi(p.prije)} * var(--fl-ptu))` : '',
    p.poslije !== null ? `margin-bottom:calc(${zaokruzi(p.poslije)} * var(--fl-ptu))` : '',
    p.podebljano ? 'font-weight:700' : '',
    p.kurziv ? 'font-style:italic' : '',
    p.font ? `font-family:${pismoCss(p.font)}` : '',
  ].filter(Boolean).join(';');

  const tekstHtml = (
    odlomci: readonly FxOdlomak[],
    margine: IzgledStranice['margine'],
    oznake: ReadonlyMap<number, string>,
    sloj: 'now' | 'after',
  ): string => {
    const m = margine;
    const pad = m ? `padding:${cqw(m.top)} ${cqw(m.right)} ${cqw(m.bottom)} ${cqw(m.left)}` : '';
    const font = `font-family:${pismoCss(o.sada.font)}`;
    const base = o.sada.velicinaPt ?? 12;
    return `<div class="fl-text${sloj === 'after' ? ' fl-text--after' : ''}" data-fl-text="${sloj}" lang="hr" style="--fl-ptu:${ptu};--fl-pt:${zaokruzi(base)};${font};${pad}">`
      + odlomci.map((p) => {
        const hit = oznake.get(p.index);
        return `<p data-fx-par="${p.razina !== null ? 'h' : 'p'}"${sloj === 'now' ? ` data-fl-p="${p.index}"` : ''}`
          + `${hit ? ` data-fl-hit="${hit}"` : ''} style="${stilOdlomka(p)}">${esc(p.text)}</p>`;
      }).join('')
      + '</div>';
  };

  /* ---------------------------------------------------------------- slojevi i objasnjenje */

  const vidljiv = (s: Sloj): boolean => L[s] || hov === s;
  const klizacVidljiv = (): boolean => klizac || hov === 'slider';

  const crtajSlojeve = (): void => {
    root.querySelectorAll<HTMLButtonElement>('[data-fl-layer]').forEach((b) => {
      const s = b.dataset.flLayer as Sloj;
      b.setAttribute('aria-pressed', String(L[s]));
      b.toggleAttribute('data-peek', !L[s] && hov === s);
      // Sloj bez podataka se ne nudi: mjerne linije trebaju izmjerenu marginu, duh pravila iz plana.
      const ima = s === 'rulers' ? mjernaOznaka(o.sada, duh, false) !== null : s === 'ghost' ? duh !== null : true;
      b.hidden = !ima;
    });
    const sl = q<HTMLButtonElement>('[data-fl-slider]');
    sl?.setAttribute('aria-pressed', String(klizac));
  };

  const crtajTip = (): void => {
    const bar = q('[data-fl-tipbar]');
    if (!bar) return;
    if (!hov) {
      bar.innerHTML = mis && ras().lampa
        ? '<p class="fl-tiphint">Zadrži miš iznad sloja: objasnit ću što radi i odmah ga pokazati na stranici.</p>'
        : '';
      return;
    }
    const t = FX_TIP[hov];
    const ukljuceno = hov === 'slider' ? klizac : L[hov];
    bar.innerHTML = `<div id="fl-explain" class="fl-tip" data-fl-tip="${hov}" role="tooltip" style="margin-left:${tipX}px">`
      + `<span class="fl-tip__arrow" aria-hidden="true" style="left:${strelica}px"></span>`
      + `<span class="fl-tip__icon fl-tip__icon--${hov}" aria-hidden="true">${t.icon}</span>`
      + `<span class="fl-tip__t">${t.t}</span>`
      + `<span class="fl-tip__d">${t.d}<span class="fl-tip__foot">${ukljuceno ? 'Uključeno · klik isključuje' : 'Pregled na stranici · klik uključuje'}</span></span>`
      + '</div>';
  };

  const objasni = (kljuc: Objasnjenje, gumb: HTMLElement): void => {
    const bar = q('[data-fl-tipbar]');
    if (bar) {
      const r = bar.getBoundingClientRect();
      const b = gumb.getBoundingClientRect();
      const c = b.left + b.width / 2 - r.left;
      const w = Math.min(620, r.width);
      tipX = Math.round(Math.max(0, Math.min(c - 60, r.width - w)));
      strelica = Math.round(Math.max(14, Math.min(w - 26, c - tipX - 6)));
    }
    win?.clearTimeout(tipRok);
    hov = kljuc;
    // Na dodirnom ekranu objasnjenje izadje na dodir i nestane nakon 3,5 s (Z35, tocka 1).
    if (!mis) tipRok = win?.setTimeout(() => { hov = null; crtajTip(); crtajSlojeve(); crtajStranicu(); }, TIP_DODIR_MS) ?? 0;
    crtajTip();
    crtajSlojeve();
    crtajStranicu();
  };
  const zaboravi = (): void => {
    if (!mis || hov === null) return;
    hov = null;
    crtajTip();
    crtajSlojeve();
    crtajStranicu();
  };

  /* ---------------------------------------------------------------- stranica */

  const crtajStranicu = (): void => {
    const page = q('[data-fl-page]');
    if (!page) return;
    const s = st.stranice[k];
    const pok = obliciPokazanog();
    const odlomciSada = (s?.odlomci ?? []).map((p) => (pok ? odlomakNakon(p, pok) : p));
    const margineSada = pok?.margine ?? o.sada.margine;
    const oznake = new Map<number, string>();
    const f = nalazi[sel];
    const sp = f ? sidro(f) : null;
    if (sp !== null) oznake.set(sp, pokazan === sel ? 'pop' : 'sel');
    page.style.aspectRatio = `${W} / ${H}`;
    page.dataset.mode = klizacVidljiv() ? 'slider' : 'now';
    const brojLista = s?.broj ?? null;
    let html = tekstHtml(odlomciSada, margineSada, oznake, 'now');
    if (pok?.brojStranice && brojLista !== null) html += `<span class="fl-pn" aria-hidden="true">${brojLista}</span>`;

    // Duh pravilnika: okvir, pojas razlike u margini, linije proreda, oval broja. Samo iz pravila.
    if (vidljiv('ghost') && duh) {
      const m = duh.margine;
      const sm = o.sada.margine;
      const korak = duh.prored !== null ? (duh.prored * 1.15 * (o.sada.velicinaPt ?? 12)) / (W * PT_PO_CM) * 100 : null;
      const okvir = m ?? sm;
      html += '<div class="fl-ghost" data-fl-ghost aria-hidden="true">'
        + (m && sm && Math.abs(m.left - sm.left) >= 0.005
          ? `<div class="fl-ghost__band" style="left:${cqw(Math.min(m.left, sm.left))};width:${cqw(Math.abs(m.left - sm.left))};top:${cqw(m.top)};bottom:${cqw(m.bottom)}"></div>`
          : '')
        + (okvir
          ? `<div class="fl-ghost__frame${m ? '' : ' fl-ghost__frame--bez'}" style="left:${cqw(okvir.left)};right:${cqw(okvir.right)};top:${cqw(okvir.top)};bottom:${cqw(okvir.bottom)}${korak !== null ? `;--fl-korak:${zaokruzi(korak)}cqw` : ''}"${korak !== null ? ' data-fl-prored' : ''}></div>`
          : '')
        + (duh.brojStranice && (m ?? sm) ? `<div class="fl-ghost__oval" style="bottom:${cqw(Math.max(0.4, ((m ?? sm)?.bottom ?? 2.5) / 2 - 0.45))}"></div>` : '')
        + '</div>';
    }
    // Mjerne linije: izmjerena lijeva margina s brojkom, zagrada proreda uz prvi odlomak koji ga nosi.
    const oznakaMargine = mjernaOznaka(o.sada, duh, !!pok?.margine);
    if (vidljiv('rulers') && oznakaMargine && margineSada) {
      const prvi = odlomciSada.find((p) => p.razina === null && p.prored !== null);
      html += '<div class="fl-rulers" data-fl-rulers aria-hidden="true">'
        + `<div class="fl-rulers__line" style="left:${cqw(margineSada.left)}"></div>`
        + `<span class="fl-rulers__label" data-fl-margin-label>${esc(oznakaMargine)}</span>`
        + (prvi ? `<div class="fl-rulers__lh" data-fl-lh-za="${prvi.index}"><span>${esc(proredOznaka(prvi) ?? '')}</span></div>` : '')
        + '</div>';
    }
    // Klizac: gornji sloj je stranica NAKON PLANA (odabrani zahvati), rezan clip-pathom.
    if (klizacVidljiv()) {
      const plan = planOblika(o.stavke, o.odabir());
      const rucni = new Map<number, string>();
      nalazi.forEach((n, i) => { const a = sidro(n); if (a !== null && ulogaOd(i).kind !== 'zahvat') rucni.set(a, 'rucno'); });
      html += `<div class="fl-after" data-fl-after aria-hidden="true" style="clip-path:inset(0 ${100 - split}% 0 0)">`
        + tekstHtml((s?.odlomci ?? []).map((p) => odlomakNakon(p, plan)), plan.margine ?? o.sada.margine, rucni, 'after')
        + (plan.brojStranice && brojLista !== null ? `<span class="fl-pn">${brojLista}</span>` : '')
        + '</div>'
        + `<div class="fl-split" aria-hidden="true" style="left:${split}%"></div>`
        + `<button type="button" class="fl-handle" data-fl-handle style="left:${split}%" aria-label="Povuci: lijevo je popravljeno, desno je sada">⇆</button>`;
    }
    html += '<div class="fl-fx" aria-hidden="true"><div class="fl-lamp" data-fl-lamp></div><div class="fl-ring" data-fl-ring></div></div>'
      + '<div class="fl-dots" data-fl-dots></div>'
      + '<div class="fl-leaf" data-fl-leaf aria-hidden="true"></div>';
    page.innerHTML = html;
    const natpis = q('[data-fl-natpis]');
    if (natpis) natpis.textContent = natpisLista(st, k);
    root.querySelectorAll<HTMLButtonElement>('[data-fl-flip]').forEach((b) => {
      const d = Number(b.dataset.flFlip);
      b.disabled = k + d < 0 || k + d >= st.stranice.length;
    });
    ocitaj(null);
    crtajBiljeske();
  };

  /** Ocitanje iznad stranice: mjera pod misem, ili uputa kad mis ne miruje nad tekstom. */
  const ocitaj = (tekst: string | null): void => {
    const r = q('[data-fl-readout]');
    const t = q('[data-fl-readout-t]');
    if (!r || !t) return;
    r.toggleAttribute('data-still', tekst !== null);
    const novo = tekst !== null ? `Ispod miša: ${tekst}`
      : ras().lampa ? 'Zadrži miš na tekstu i izmjerit ću ga'
        : `${natpisLista(st, k)} · povuci prstom za sljedeću`;
    // Isti tekst se ne upisuje nanovo: `aria-live` bi ga inace najavljivao na svaki pomak misa.
    if (t.textContent !== novo) t.textContent = novo;
  };

  /* ---------------------------------------------------------------- biljeske, tocke, konac */

  const mjereBiljeske = (i: number): string => {
    const f = nalazi[i];
    return [f.measured, f.expected].filter(Boolean).map((x) => esc(x as string)).join(' → ');
  };

  const crtajBiljeske = (): void => {
    const aside = q('[data-fl-notes]');
    const lista = q('[data-fl-list]');
    if (!aside || !lista) return;
    const rc = redCekanja(nalazi, o.uloge, o.odabir(), o.rucno);
    const bj = vidljiv('notes') ? biljeske(st, k, nalazi) : [];
    aside.innerHTML = bj.map((b, n) => {
      const f = nalazi[b.i];
      const m = mjereBiljeske(b.i);
      return `<button type="button" class="fl-note fl-note--${ozbiljnostFx(f, o.autoritativno).ton}" data-fl-note="${b.i}"`
        + `${b.i === sel ? ' data-sel' : ''}${rc.rijeseno[b.i] ? ' data-done' : ''} style="--fl-rot:${n % 2 ? -1.4 : 1.4}deg">`
        + `<span class="fl-note__t">${esc(f.title)}</span>${m ? `<span class="fl-note__m">${m}</span>` : ''}</button>`;
    }).join('');
    lista.innerHTML = bj.map((b) => {
      const f = nalazi[b.i];
      const m = mjereBiljeske(b.i);
      return `<li><button type="button" class="fl-li" data-fl-note="${b.i}"${b.i === sel ? ' data-sel' : ''}${rc.rijeseno[b.i] ? ' data-done' : ''}>`
        + `<span class="fl-li__t">${esc(f.title)}</span>${m ? `<span class="fl-li__m">${m}</span>` : ''}</button></li>`;
    }).join('');
    const tocke = q('[data-fl-dots]');
    if (tocke) {
      const naRetku = new Map<number, number>();
      tocke.innerHTML = vidljiv('dots') ? biljeske(st, k, nalazi).filter((b) => b.sidro !== null).map((b) => {
        const f = nalazi[b.i];
        const j = naRetku.get(b.sidro as number) ?? 0;
        naRetku.set(b.sidro as number, j + 1);
        const ton = rc.rijeseno[b.i] ? 'done' : ozbiljnostFx(f, o.autoritativno).ton;
        return `<button type="button" class="fl-dot fl-dot--${ton}" data-fl-dot="${b.i}" data-fl-za="${b.sidro}"`
          + `${b.i === sel ? ' data-sel' : ''} style="--fl-pomak:${j * 16}px" aria-label="${esc(`Nalaz: ${f.title}`)}"><span></span></button>`;
      }).join('') : '';
    }
    win?.requestAnimationFrame(() => postavi());
  };

  /** Polozaji iz STVARNOG rasporeda: tocka uz prvi redak odlomka, biljeska u visini tocke, nit izmedju. */
  const postavi = (): void => {
    if (zatvoren) return;
    const page = q('[data-fl-page]');
    const tekst = q('[data-fl-text="now"]');
    if (!page || !tekst) return;
    const yOdlomka = (indeks: string | undefined): number | null => {
      const p = indeks ? tekst.querySelector<HTMLElement>(`[data-fl-p="${indeks}"]`) : null;
      if (!p) return null;
      const lh = Number.parseFloat(win?.getComputedStyle(p).lineHeight ?? '') || 16;
      return p.offsetTop + Math.min(p.offsetHeight, lh) / 2;
    };
    root.querySelectorAll<HTMLElement>('[data-fl-dot]').forEach((d) => {
      const y = yOdlomka(d.dataset.flZa);
      d.style.top = `${y ?? 0}px`;
      d.hidden = y === null;
    });
    const lh = q('[data-fl-lh-za]');
    if (lh) {
      const p = tekst.querySelector<HTMLElement>(`[data-fl-p="${lh.dataset.flLhZa}"]`);
      if (p) {
        const r = Number.parseFloat(win?.getComputedStyle(p).lineHeight ?? '') || 16;
        lh.style.top = `${p.offsetTop}px`;
        lh.style.height = `${Math.min(p.offsetHeight, r * 2)}px`;
      }
    }
    const aside = q('[data-fl-notes]');
    const grid = q('[data-fl-grid]');
    const svg = q<SVGSVGElement>('[data-fl-threads]');
    if (!aside || !grid || !svg) return;
    const uz = ras().biljeske === 'uz' && aside.offsetParent !== null;
    const pr = page.getBoundingClientRect();
    const ar = aside.getBoundingClientRect();
    let dno = 0;
    aside.querySelectorAll<HTMLElement>('[data-fl-note]').forEach((n) => {
      const i = n.dataset.flNote;
      const d = root.querySelector<HTMLElement>(`[data-fl-dot="${i}"]`);
      // Sredina tocke je njen `top` (margina -22 px je samo za metu od 44 px); crta biljeske je 18 px od vrha.
      const zeljeno = d && !d.hidden ? pr.top + (Number.parseFloat(d.style.top) || 0) - ar.top - 18 : dno;
      const top = Math.max(dno, Math.round(zeljeno));
      n.style.top = `${top}px`;
      dno = top + n.offsetHeight + 8;
    });
    aside.style.minHeight = uz ? `${Math.max(dno, pr.height)}px` : '';
    // Konac: od tocke do biljeske, kroz razmak izmedju stranice i stupca. Samo kad su biljeske uz stranicu.
    if (!uz || !ras().konac || !vidljiv('notes') || !vidljiv('dots')) { svg.innerHTML = ''; return; }
    const gr = grid.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${Math.round(gr.width)} ${Math.round(gr.height)}`);
    svg.setAttribute('width', String(Math.round(gr.width)));
    svg.setAttribute('height', String(Math.round(gr.height)));
    const niti: string[] = [];
    aside.querySelectorAll<HTMLElement>('[data-fl-note]').forEach((n) => {
      const d = root.querySelector<HTMLElement>(`[data-fl-dot="${n.dataset.flNote}"]`);
      if (!d || d.hidden) return;
      const dr = d.getBoundingClientRect();
      const nr = n.getBoundingClientRect();
      const x1 = dr.left + dr.width / 2 - gr.left;
      const y1 = dr.top + dr.height / 2 - gr.top;
      const x2 = nr.left - gr.left;
      const y2 = nr.top + 18 - gr.top;
      const c = (x2 - x1) / 2;
      const ja = Number(n.dataset.flNote) === sel;
      niti.push(`<path d="M ${zaokruzi(x1)} ${zaokruzi(y1)} C ${zaokruzi(x1 + c)} ${zaokruzi(y1)}, ${zaokruzi(x2 - c)} ${zaokruzi(y2)}, ${zaokruzi(x2)} ${zaokruzi(y2)}"`
        + ` class="fl-thread${ja ? ' fl-thread--sel' : ''}" data-fl-thread="${n.dataset.flNote}"></path>`);
    });
    svg.innerHTML = niti.join('');
  };

  /* ---------------------------------------------------------------- kartica */

  const crtajKarticu = (): void => {
    const card = q('[data-fl-card]');
    const f = nalazi[sel];
    if (!card || !f) { if (card) card.innerHTML = ''; return; }
    const oz = ozbiljnostFx(f, o.autoritativno);
    const u = ulogaOd(sel);
    const rc = redCekanja(nalazi, o.uloge, o.odabir(), o.rucno);
    const rij = rc.rijeseno[sel];
    const kljuc = f.exactEvidence ? 'PRAVILNIK' : 'OČEKIVANO';
    // Mjere neovisno jedna o drugoj (kao Z34): izmjereno bez ocekivanog se ne skriva, a precrtano je
    // samo kad postoji ocekivano s kojim se ne slaze.
    const izmj = f.measured ? `<span data-fl-izmjereno><span class="fl-mr__k">IZMJERENO</span>${f.expected ? `<s>${esc(f.measured)}</s>` : esc(f.measured)}</span>` : '';
    const ocek = f.expected ? `<span data-fl-ocekivano><span class="fl-mr__k">${kljuc}</span>${esc(f.expected)}</span>` : '';
    const mjera = izmj || ocek
      ? `<div class="fl-mr${izmj && ocek ? '' : ' fl-mr--jedno'}">${izmj}${izmj && ocek ? '<span class="fl-mr__a" aria-hidden="true">→</span>' : ''}${ocek}</div>`
      : '';
    const isj = isjecak(f);
    const figura = isj
      ? '<figure class="fl-fig" data-fl-isjecak><figcaption><span>' + esc(isj.izvor) + '</span>'
        + (isj.mjesto ? `<span>${esc(isj.mjesto)}</span>` : '') + '</figcaption>'
        + `<p><span class="fl-fig__k">${esc(isj.recenica)}</span></p></figure>`
      : '';
    let gumb = '';
    if (f.status === 'open' && u.kind === 'zahvat') {
      gumb = rij
        ? '<button type="button" class="fl-res" data-fl-res aria-pressed="true">U planu ✓</button>'
        : '<button type="button" class="fl-res" data-fl-res aria-pressed="false">Uključi u plan</button>';
    } else if (f.status === 'open') {
      gumb = rij
        ? '<button type="button" class="fl-res" data-fl-res aria-pressed="true">Radim sam ✓</button>'
        : '<button type="button" class="fl-res" data-fl-res aria-pressed="false">Napravit ću sam</button>';
    }
    const pregled = popravakVidljiv(u, o.stavke, o.zahvati)
      ? (pokazan === sel
        ? '<button type="button" class="fl-prev" data-fl-prev aria-pressed="true">Sakrij popravak</button>'
        : '<button type="button" class="fl-prev" data-fl-prev aria-pressed="false">Pokaži popravak na stranici</button>')
      : '';
    card.innerHTML = `<div class="fl-card__top"><span>NALAZ ${sel + 1} OD ${nalazi.length}</span>`
      + `<span class="fl-card__sev" data-ton="${oz.ton}"><span aria-hidden="true"></span>${oz.tekst}</span></div>`
      + `<h2 class="fl-card__t" tabindex="-1">${esc(f.title)}</h2>`
      + mjera + figura
      + (gumb || pregled ? `<div class="fl-card__do">${gumb}${pregled}</div>` : '')
      + (f.explanation ? `<p class="fl-card__note">${esc(f.explanation)}</p>` : '');
    card.dataset.findingId = f.id;
  };

  /* ---------------------------------------------------------------- red cekanja i stranice */

  const crtajRed = (): void => {
    const sek = q('[data-fl-queue]');
    if (!sek) return;
    const rc = redCekanja(nalazi, o.uloge, o.odabir(), o.rucno);
    const stavke = nalazi.map((f, i) =>
      `<button type="button" class="fl-q" data-fl-q="${i}" aria-current="${i === sel}"${rc.rijeseno[i] ? ' data-done' : ''}>`
      + `<span class="fl-q__n" data-ton="${rc.rijeseno[i] ? 'done' : ozbiljnostFx(f, o.autoritativno).ton}">${String(i + 1).padStart(2, '0')}</span>`
      + `<span class="fl-q__t">${esc(f.title)}</span></button>`).join('');
    const pecat = rc.sve ? `<span class="fl-stamp" data-fl-stamp${tiho ? ' data-tiho' : ''}>Plan spreman</span>` : '';
    // Celije su stvarne stranice (samo uz pouzdanu kartu); mete su samo uz mis, na dodir su karta.
    const s = o.traka.poStranici;
    const celije = st.pouzdano && st.ukupno !== null ? Array.from({ length: st.ukupno }, (_, j) => {
      const klasa = `fl-tile${s.has(j + 1) ? ' fl-tile--hit' : ''}${j === k ? ' fl-tile--cur' : ''}`;
      return mis
        ? `<button type="button" class="${klasa}" data-fl-tile="${j}" aria-label="Stranica ${j + 1}"></button>`
        : `<span class="${klasa}"></span>`;
    }).join('') : '';
    const plan = o.repairAvailable && o.zahvati.length > 0;
    const redak = planRedak(o.odabir(), o.zahvati, o.score, o.ceiling);
    const nastavi = rc.sve && plan && o.zahvati.some((z) => o.odabir().has(z.ruleId))
      ? `<div class="fl-done" data-fl-done><button type="button" class="fl-go" data-fl-go>Nastavi na plan popravka →</button><span>${esc(redak)}</span></div>`
      : '';
    const uputa = rc.sve
      ? 'Sve je pregledano. Automatski zahvati su u planu, ručne radiš sam u Wordu.'
      : 'Prekriži svaki nalaz: automatske uključi u plan, ručne označi "Napravit ću sam".'
        + (celije ? ' Jantarna stranica ima nalaz na jednom mjestu.' : '');
    sek.innerHTML = `<div class="fl-qrow"><span class="fl-k" data-fl-count>RED ČEKANJA · ${rc.n} / ${nalazi.length}</span>${stavke}${pecat}</div>`
      + (celije ? `<div class="fl-tiles" style="--fl-n:${st.ukupno}"${mis ? '' : ' aria-hidden="true"'}>${celije}</div>` : '')
      + `<p class="fl-hint">${esc(uputa)}</p>`
      + nastavi;
  };

  const sve = (): void => { crtajSlojeve(); crtajTip(); crtajStranicu(); crtajKarticu(); crtajRed(); };

  /* ---------------------------------------------------------------- listanje */

  const listaj = (novi: number): void => {
    const n = Math.max(0, Math.min(st.stranice.length - 1, novi));
    if (n === k) return;
    const d = n > k ? 1 : -1;
    k = n;
    crtajStranicu();
    crtajRed();
    const lf = q('[data-fl-leaf]');
    if (tiho || !lf || typeof lf.animate !== 'function') return;
    lf.style.transformOrigin = d > 0 ? 'left center' : 'right center';
    lf.animate([
      { transform: 'perspective(1600px) rotateY(0)', opacity: 1 },
      { transform: `perspective(1600px) rotateY(${d > 0 ? -92 : 92}deg)`, opacity: 0.15 },
    ], { duration: LIST_MS, easing: 'cubic-bezier(.4,0,.2,1)' });
  };

  const odaberi = (i: number): void => {
    if (i < 0 || i >= nalazi.length) return;
    sel = i;
    pokazan = null;
    const naListu = listNalaza(st, nalazi[i]);
    crtajKarticu();
    crtajRed();
    if (naListu !== null && naListu !== k) listaj(naListu);
    else crtajStranicu();
  };

  /* ---------------------------------------------------------------- dogadaji */

  const zatvori = (): void => {
    if (zatvoren) return;
    zatvoren = true;
    win?.clearTimeout(tipRok);
    win?.clearTimeout(miruje);
    ciscenja.forEach((c) => { try { c(); } catch { /* ostala ciscenja i dalje idu */ } });
    releaseModal(root);
    root.remove();
    doc.documentElement.removeAttribute('data-fl-open');
    o.naZatvori(sel);
  };

  const naKlik = (e: MouseEvent): void => {
    const c = e.target as HTMLElement | null;
    if (!c || typeof c.closest !== 'function') return;
    if (c.closest('[data-fl-back]')) { zatvori(); return; }
    const sl = c.closest<HTMLElement>('[data-fl-layer]');
    if (sl) {
      const s = sl.dataset.flLayer as Sloj;
      L[s] = !L[s];
      if (!mis) objasni(s, sl); else { crtajTip(); crtajSlojeve(); crtajStranicu(); }
      return;
    }
    const kl = c.closest<HTMLElement>('[data-fl-slider]');
    if (kl) {
      klizac = !klizac;
      split = 50;
      pokazan = null;
      if (!mis) objasni('slider', kl); else { crtajTip(); crtajSlojeve(); crtajStranicu(); crtajKarticu(); }
      return;
    }
    const flip = c.closest<HTMLButtonElement>('[data-fl-flip]');
    if (flip) { if (!flip.disabled) listaj(k + Number(flip.dataset.flFlip)); return; }
    const tile = c.closest<HTMLElement>('[data-fl-tile]');
    if (tile) { listaj(Number(tile.dataset.flTile)); return; }
    const izbor = c.closest<HTMLElement>('[data-fl-note], [data-fl-dot], [data-fl-q]');
    if (izbor) { odaberi(Number(izbor.dataset.flNote ?? izbor.dataset.flDot ?? izbor.dataset.flQ)); return; }
    if (c.closest('[data-fl-res]')) {
      const f = nalazi[sel];
      const u = ulogaOd(sel);
      if (u.kind === 'zahvat') o.postaviOdabir(prebaci(u, o.odabir()));
      else if (o.rucno.has(f.id)) o.rucno.delete(f.id);
      else o.rucno.add(f.id);
      crtajKarticu();
      crtajRed();
      crtajBiljeske();
      q<HTMLElement>('[data-fl-res]')?.focus();
      return;
    }
    if (c.closest('[data-fl-prev]')) {
      pokazan = pokazan === sel ? null : sel;
      klizac = false;
      crtajSlojeve();
      crtajStranicu();
      crtajKarticu();
      q<HTMLElement>('[data-fl-prev]')?.focus();
      return;
    }
    if (c.closest('[data-fl-go]')) {
      const naPlan = o.naPlan;
      zatvori();
      naPlan();
    }
  };
  root.addEventListener('click', naKlik);

  // Objasnjenje sloja: prelazak misem ili fokus tipkovnicom; sloj se za to vrijeme pokaze na stranici.
  const naUlaz = (e: Event): void => {
    const b = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-fl-layer], [data-fl-slider]');
    if (!b || (e.type === 'pointerover' && !mis)) return;
    const kljuc = (b.dataset.flLayer as Sloj | undefined) ?? 'slider';
    if (hov !== kljuc) objasni(kljuc, b);
  };
  const naIzlaz = (e: Event): void => {
    const b = (e.target as HTMLElement | null)?.closest?.('[data-fl-layer], [data-fl-slider]');
    const kamo = (e as PointerEvent | FocusEvent).relatedTarget as Node | null;
    if (!b || (kamo && b.contains(kamo))) return;
    zaboravi();
  };
  root.addEventListener('pointerover', naUlaz);
  root.addEventListener('focusin', naUlaz);
  root.addEventListener('pointerout', naIzlaz);
  root.addEventListener('focusout', naIzlaz);

  // Lampa, blijedenje biljeski i povecalo: samo misem i samo nad tekstom (nikad nad marginama).
  const naPomak = (e: PointerEvent): void => {
    if (!ras().lampa || vuce || e.pointerType === 'touch') return;
    const page = q('[data-fl-page]');
    if (!page) return;
    const r = page.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    page.style.setProperty('--fl-mx', `${Math.round(x)}px`);
    page.style.setProperty('--fl-my', `${Math.round(y)}px`);
    page.dataset.lampa = 'true';
    const aside = q('[data-fl-notes]');
    const ar = aside?.getBoundingClientRect();
    aside?.querySelectorAll<HTMLElement>('[data-fl-note]').forEach((n) => {
      const ny = n.offsetTop + n.offsetHeight / 2 + (ar ? ar.top - r.top : 0);
      n.toggleAttribute('data-far', Number(n.dataset.flNote) !== sel && Math.abs(ny - y) > r.height * 0.16);
    });
    win?.clearTimeout(miruje);
    page.removeAttribute('data-still');
    ocitaj(null);
    const par = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-fl-text="now"] [data-fx-par]');
    if (!par) return;
    miruje = win?.setTimeout(() => {
      if (zatvoren) return;
      const indeks = Number(par.dataset.flP);
      const s = st.stranice[k];
      const p = s?.odlomci.find((x) => x.index === indeks);
      if (!p) return;
      const pok = obliciPokazanog();
      const lijevo = klizacVidljiv() && (x / r.width) * 100 < split;
      const prikaz = lijevo ? odlomakNakon(p, planOblika(o.stavke, o.odabir())) : pok ? odlomakNakon(p, pok) : p;
      page.dataset.still = 'true';
      ocitaj(ocitanje(prikaz));
    }, MIRUJE_MS) ?? 0;
  };
  const naOdlazak = (): void => {
    const page = q('[data-fl-page]');
    win?.clearTimeout(miruje);
    page?.removeAttribute('data-lampa');
    page?.removeAttribute('data-still');
    root.querySelectorAll('[data-far]').forEach((n) => n.removeAttribute('data-far'));
    ocitaj(null);
  };
  const stranicaEl = q('[data-fl-page]');
  stranicaEl?.addEventListener('pointermove', naPomak);
  stranicaEl?.addEventListener('pointerleave', naOdlazak);

  // Klizac: vuce se SAMO rucka (pointer capture), ili strelicama.
  const postaviRez = (n: number): void => {
    split = Math.max(0, Math.min(100, Math.round(n)));
    const after = q('[data-fl-after]');
    if (after) after.style.clipPath = `inset(0 ${100 - split}% 0 0)`;
    root.querySelectorAll<HTMLElement>('.fl-split, [data-fl-handle]').forEach((el) => { el.style.left = `${split}%`; });
  };
  const pomakni = (clientX: number): void => {
    const r = q('[data-fl-page]')?.getBoundingClientRect();
    if (r && r.width > 0) postaviRez(((clientX - r.left) / r.width) * 100);
  };
  stranicaEl?.addEventListener('pointerdown', (e) => {
    const h = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-fl-handle]');
    if (!h) return;
    e.preventDefault();
    vuce = true;
    h.setPointerCapture?.(e.pointerId);
  });
  stranicaEl?.addEventListener('pointermove', (e) => { if (vuce) pomakni(e.clientX); });
  const pusti = (): void => { vuce = false; };
  stranicaEl?.addEventListener('pointerup', pusti);
  stranicaEl?.addEventListener('pointercancel', pusti);

  // Listanje prstom: vodoravni potez preko stranice (osim dok je klizac ukljucen).
  let dodirX: number | null = null;
  stranicaEl?.addEventListener('touchstart', (e) => { dodirX = e.touches[0]?.clientX ?? null; }, { passive: true });
  stranicaEl?.addEventListener('touchend', (e) => {
    const x = e.changedTouches[0]?.clientX;
    if (dodirX === null || x === undefined || klizacVidljiv()) return;
    const dx = x - dodirX;
    dodirX = null;
    if (Math.abs(dx) > 60) listaj(k + (dx < 0 ? 1 : -1));
  });

  const naTipku = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); zatvori(); return; }
    const h = (e.target as HTMLElement | null)?.closest?.('[data-fl-handle]');
    if (!h || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    postaviRez(split + (e.key === 'ArrowRight' ? 5 : -5));
  };
  root.addEventListener('keydown', naTipku);

  // Raspored ovisi o sirini: biljeske uz stranicu ili popis, nit, lampa. Mjeri se nanovo pri promjeni.
  let okvir = 0;
  const naVelicinu = (): void => {
    win?.cancelAnimationFrame(okvir);
    okvir = win?.requestAnimationFrame(() => { crtajTip(); ocitaj(null); postavi(); }) ?? 0;
  };
  win?.addEventListener('resize', naVelicinu);
  ciscenja.push(() => win?.removeEventListener('resize', naVelicinu));
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(naVelicinu);
    const grid = q('[data-fl-grid]');
    if (grid) ro.observe(grid);
    ciscenja.push(() => ro.disconnect());
  }

  doc.body.append(root);
  doc.documentElement.setAttribute('data-fl-open', '');
  sve();
  trapModal(root);
  root.dataset.flReady = 'true';
  return { zatvori };
}
