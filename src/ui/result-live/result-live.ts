/**
 * REZULTAT: SVE U JEDNOM (ALIGNMENT Z34): PRIKAZ. Lijeni modul; ucitava ga `results-cockpit.ts`
 * dinamickim uvozom tek kad stvarni rezultat (ne test, ne `clear`) ima nalaze, pa statican graf
 * rute `/rad/` ne nosi ni ovaj kod ni njegov CSS. Zamjenjuje stanje `blocked` iz Z8; plan,
 * placanje i gotovo ostaju iz Z8 (Z36 ih kasnije zamjenjuje).
 *
 * LIST PRESUDE OSTAJE ISTI CVOR. Kokpit ga crta sinkrono, s ugovorima koje drze tok popravka i
 * specovi (`data-cockpit-primary`, `repair-entry`, `#cockpitVerdictTitle`); ovaj modul ga samo
 * POJACAVA (traka s rokom, dva luka, brojanje, pecat u toku), nikad ne mijenja gumb ispod prsta.
 * Stol (jezicci, stranica, hrpa kartica, traka stranica) i ladica plana su njegovi.
 *
 * Sve odluke o tome STO se crta zive u `result-live-model.ts` (cist, testiran). Pokret je samo
 * `transform`, `opacity` i `clip-path` (Z31); let cedulje je Web Animations API na klonu.
 */
import './result-live.css';
import { pokretPrigusen } from '../../shared/display-prefs';
import { rokZaSesiju } from '../../shared/intake-choice';
import { parseSessionFragment } from '../../session/local-document-session';
import { pluralHr } from '../results/plural-hr';
import { decisionHtml, evidenceHtml, locationHtml, recommendation } from '../results/priority-findings';
import { radnjaZaKlik } from '../results/desk-mount';
import type { DeskItem } from '../results/desk-model';
import type { ResultsCockpitAction } from '../results/results-cockpit';
import type { VisualFindingModel } from '../results/visual-result-model';
import {
  filtriraj, izgledNakon, izgledSada, jezicakNalaza, jezicci, ladica, natpisMjesta, opsegMjerenja, oznakaTrake, pocetniOdabir,
  polozaj, prebaci, prsten, rokTekst, stranicaNalaza, stranicaZaNalaz, trakaStranica, ulogaNalaza, uPlanu, vidljiviZahvati,
  zahvatiPlana, type IzgledStranice, type Jezicak, type LivePreview, type LiveStavka, type TrakaStranica, type ZahvatPlana,
} from './result-live-model';

export interface LiveStanje {
  readonly kljuc: string;
  readonly selId: string | null;
  readonly cat: Jezicak;
  /** Odabir koji je korisnik PROMIJENIO; `null` dok je plan zadani. */
  readonly odabir: readonly string[] | null;
  readonly mode: 'now' | 'after';
  /** Ulazni trenutak (brojanje, pecat) je vec odigran za ovaj rezultat. */
  readonly odigrano: boolean;
}

interface LiveOptions {
  readonly items: readonly DeskItem<VisualFindingModel>[];
  readonly planItems: readonly LiveStavka[];
  readonly repairAvailable: boolean;
  readonly authoritative: boolean;
  readonly score: number | null;
  readonly ceiling: number | null;
  readonly preview: unknown;
  readonly storedPages: unknown;
  /** `checks` rezultata: opseg mjerenja po jezicku (Codex R2). */
  readonly checks: unknown;
  readonly kljuc: string;
  readonly stanje: LiveStanje | null;
  readonly esc: (v: string) => string;
  readonly onAction?: (action: ResultsCockpitAction, opener?: HTMLElement) => void;
}

export interface LiveHandle {
  stanje(): LiveStanje;
  /** Odabir za ulaz u popravak, samo kad ga je korisnik promijenio; inace `null` (tok bira sam). */
  odabir(): string[] | null;
  dispose(): void;
}

const SIROKO = '(min-width: 900px)';
const ZUM = 1.8;
const STRANICA_CM = 21;

/** Natpisi ozbiljnosti, doslovno iz predloska (`RL_SEV`). */
function ozbiljnost(f: VisualFindingModel, autoritativno: boolean): { tekst: string; ton: 'blok' | 'dorada' | 'provjera' } {
  // Bez verificiranog pravila nalaz ne smije tvrditi da blokira predaju (isto pravilo kao sazetak).
  if (f.severity === 'error' && autoritativno) return { tekst: 'Blokira predaju', ton: 'blok' };
  if (f.severity === 'warning' || f.severity === 'error') return { tekst: 'Treba doraditi', ton: 'dorada' };
  return { tekst: 'Provjeri sam', ton: 'provjera' };
}

/** Ime pisma iz dokumenta ili parametara popravka; sve sto nije cisto ime pada na pismo rada. */
function pismo(ime: string | null): string {
  return ime && /^[\p{L}\p{N} .-]{1,40}$/u.test(ime) ? `"${ime}", var(--font-doc)` : 'var(--font-doc)';
}

/** CSS varijable sloja stranice iz izgleda: velicine su u postotku sirine stranice (cqw). */
function varijableSloja(el: HTMLElement, iz: IzgledStranice): void {
  const cqw = (cm: number): string => `${((cm / STRANICA_CM) * 100).toFixed(2)}cqw`;
  const m = iz.margine ?? { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };
  el.style.setProperty('--rl-ff', pismo(iz.font));
  el.style.setProperty('--rl-fs', `${(((iz.velicinaPt ?? 12) / 595.3) * 100).toFixed(2)}cqw`);
  el.style.setProperty('--rl-lh', String(iz.prored ? Math.max(1, iz.prored * 1.15) : 1.15));
  el.style.setProperty('--rl-pad', `${cqw(m.top)} ${cqw(m.right)} ${cqw(m.bottom)} ${cqw(m.left)}`);
}

/**
 * Montaza je TRANSAKCIJSKA (Codex R1): iznimka usred montaze pocisti ono sto je vec postavljeno
 * (ladica u `body`, promatraci, slusaci na domacinu) i baci dalje, pa kokpit vraca POTPUN Z8 bez
 * ostataka Z34 koji bi uz njega dvaput slali radnje.
 */
export function mountResultLive(mount: HTMLElement, host: HTMLElement, o: LiveOptions): LiveHandle {
  const ciscenja: Array<() => void> = [];
  try {
    return postavi(mount, host, o, ciscenja);
  } catch (e) {
    for (const c of ciscenja) { try { c(); } catch { /* ostala ciscenja i dalje idu */ } }
    host.innerHTML = '';
    delete mount.dataset.rlReady;
    throw e;
  }
}

function postavi(mount: HTMLElement, host: HTMLElement, o: LiveOptions, ciscenja: Array<() => void>): LiveHandle {
  const doc = mount.ownerDocument;
  const win = doc.defaultView;
  const esc = o.esc;
  const preview = (typeof o.preview === 'object' && o.preview !== null ? o.preview : null) as LivePreview | null;
  const items = o.items;
  const nalazi = items.map((it) => it.finding);
  const zahvati: ZahvatPlana[] = zahvatiPlana(o.planItems, o.repairAvailable);
  const uloge = nalazi.map((f) => ulogaNalaza(f, zahvati));
  const traka: TrakaStranica = trakaStranica(preview, o.storedPages, items);
  const opseg = opsegMjerenja(o.checks);
  const vidljivi = vidljiviZahvati(o.planItems, zahvati);
  const sada = izgledSada(preview);
  const p = prsten(o.score, o.ceiling);

  const prije = o.stanje && o.stanje.kljuc === o.kljuc ? o.stanje : null;
  let cat: Jezicak = prije?.cat ?? 'all';
  let selId: string | null = prije?.selId ?? null;
  let odabir = new Set<string>(prije?.odabir ?? pocetniOdabir(zahvati));
  let dirty = prije?.odabir != null;
  let mode: 'now' | 'after' = prije?.mode === 'after' && vidljivi.length ? 'after' : 'now';
  const odigrano = prije?.odigrano === true;
  const tiho = pokretPrigusen(doc);
  const siroko = (): boolean => win?.matchMedia?.(SIROKO)?.matches ?? true;
  let odbacen = false;

  const indeksOdabranog = (): number => {
    const lista = filtriraj(nalazi, cat);
    const i = selId ? nalazi.findIndex((f) => f.id === selId) : -1;
    return lista.includes(i) ? i : lista[0] ?? 0;
  };

  /* ---------------------------------------------------------------- list presude */

  const pojacajPresudu = (): void => {
    const list = mount.querySelector<HTMLElement>('[data-cockpit-verdict-sheet]');
    if (!list) return;
    list.dataset.rl = 'true';
    const obrva = list.querySelector<HTMLElement>('[data-cockpit-eyebrow]');
    const sesija = parseSessionFragment(win?.location.hash ?? '');
    const rok = rokTekst(sesija ? rokZaSesiju(sesija) : null, new Date());
    if (obrva && !list.querySelector('[data-rl-trakica]')) {
      const trakica = doc.createElement('div');
      trakica.className = 'rl-trakica';
      trakica.dataset.rlTrakica = '';
      obrva.replaceWith(trakica);
      trakica.append(obrva);
      if (rok) {
        const r = doc.createElement('span');
        r.className = 'rl-rok';
        r.dataset.rlRok = '';
        r.innerHTML = '<span class="rl-rok__tocka" aria-hidden="true"></span>' + esc(rok);
        trakica.append(r);
      }
    }
    const ring = list.querySelector<HTMLElement>('.cockpit-ring[data-cockpit-score="scored"]');
    const jezgra = ring?.querySelector<HTMLElement>('.cockpit-ring__core');
    const pecat = list.querySelector<HTMLElement>('[data-cockpit-stamp]');
    if (ring && p) {
      ring.classList.add('rl-ring');
      ring.style.setProperty('--rl-ceil', String(p.strop ?? p.sada));
      ring.setAttribute('aria-label', p.opis);
      const legenda = doc.createElement('p');
      legenda.className = 'rl-legend';
      legenda.dataset.rlLegend = '';
      legenda.innerHTML = `<span class="rl-legend__red"><i class="rl-sw rl-sw--sada" aria-hidden="true"></i>sada <b>${p.sada}</b></span>`
        + (p.strop !== null
          ? `<span class="rl-legend__red" data-rl-strop><i class="rl-sw rl-sw--strop" aria-hidden="true"></i>najviše <b>${p.strop}</b> ako svi zahvati uspiju</span>`
          : '');
      const natpis = ring.parentElement?.querySelector('.cockpit-ring__label');
      (natpis ?? ring).after(legenda);
    }
    // ULAZNI TRENUTAK: ocjena raste od 0 do stvarne (1,2 s), tek onda padne pecat, u toku stranice.
    // Pod smanjenim pokretom i pri ponovnom crtanju istog rezultata sve je odmah u zavrsnom stanju.
    if (!jezgra || !p || tiho || odigrano) { if (pecat) pecat.dataset.rlStamp = 'stoji'; return; }
    if (pecat) pecat.dataset.rlStamp = 'ceka';
    const cilj = p.sada;
    const t0 = win?.performance.now() ?? 0;
    let okvir = 0;
    const korak = (t: number): void => {
      if (odbacen) return;
      const u = Math.min(1, (t - t0) / 1200);
      jezgra.textContent = String(Math.round(cilj * (1 - Math.pow(1 - u, 3))));
      if (u < 1) { okvir = win?.requestAnimationFrame(korak) ?? 0; return; }
      if (pecat) pecat.dataset.rlStamp = 'pada';
    };
    jezgra.textContent = '0';
    okvir = win?.requestAnimationFrame(korak) ?? 0;
    ciscenja.push(() => { win?.cancelAnimationFrame(okvir); jezgra.textContent = String(cilj); });
  };

  /* ---------------------------------------------------------------- jezicci */

  const jezicciHtml = (): string => jezicci(nalazi, opseg).map((j) => {
    const aktivan = j.key === cat;
    // Kvacica SAMO za izmjerenu kategoriju bez nalaza (Codex R2); nula bez mjerenja nije "uredno".
    const broj = j.stanje === 'cisto' ? '<span class="rl-tab__n" aria-label="izmjereno, nema nalaza">✓</span>'
      : j.stanje === 'nemjereno' ? '<span class="rl-tab__n rl-tab__n--nemjereno">nije mjereno</span>'
        : `<span class="rl-tab__n">${j.n}</span>`;
    return `<button type="button" role="tab" class="rl-tab" data-rl-tab="${j.key}" aria-selected="${aktivan}"`
      + ` tabindex="${aktivan ? 0 : -1}"${j.prazan ? ' disabled aria-disabled="true"' : ''}>`
      + `<span>${esc(j.label)}</span>${broj}</button>`;
  }).join('');

  /* ---------------------------------------------------------------- kartica */

  const kontrolaHtml = (i: number): string => {
    const uloga = uloge[i];
    if (uloga.kind === 'rucno') {
      return '<p class="rl-manual" data-rl-manual>Ovo dodaješ sam. Lekta ne mijenja sadržaj rada, samo oblik.</p>';
    }
    if (uloga.kind !== 'zahvat') return '';
    const u = uPlanu(uloga, odabir);
    const siguran = zahvati.some((z) => z.vrsta === 'siguran' && uloga.ruleIds.includes(z.ruleId));
    // Natpisi su doslovno iz predloska, BEZ "· +N": bodovi po zahvatu ne postoje (F37). Atribut nosi
    // `ruleId`-eve zahvata, da se odabir moze usporediti s panelom popravka.
    const ids = esc(uloga.ruleIds.join(' '));
    return '<div class="rl-plan">'
      + (u
        ? `<button type="button" class="rl-toggle rl-toggle--on" data-rl-toggle="${ids}" aria-pressed="true">U planu ✓</button>`
        : `<button type="button" class="rl-toggle" data-rl-toggle="${ids}" aria-pressed="false">Uključi u plan</button>`)
      + (siguran ? '<span class="rl-plan__note">Lekta ovo popravlja sama</span>' : '')
      + '</div>';
  };

  const karticaHtml = (i: number): string => {
    const f = nalazi[i];
    const lista = filtriraj(nalazi, cat);
    const pol = polozaj(lista, i);
    const oz = ozbiljnost(f, o.authoritative);
    const jez = jezicakNalaza(f.category) ?? 'Provjera';
    // MJERE NEOVISNO JEDNA O DRUGOJ (Codex R3): izmjereno bez ocekivanog se ne skriva. Precrtano je
    // samo kad postoji ocekivano s kojim se ne slaze. "Pravilnik" samo uz verificiran citat pravila;
    // bez njega ocekivano nije tvrdnja pravilnika nego profila, pa stoji natpis Z8 "Očekivano".
    const izmjereno = f.measured
      ? '<span data-rl-izmjereno><span class="rl-mr__k">Izmjereno</span>' + (f.expected ? '<s>' + esc(f.measured) + '</s>' : esc(f.measured)) + '</span>'
      : '';
    const ocekivano = f.expected
      ? `<span data-rl-ocekivano><span class="rl-mr__k">${f.exactEvidence ? 'Pravilnik' : 'Očekivano'}</span>` + esc(f.expected) + '</span>'
      : '';
    const mjera = izmjereno || ocekivano
      ? `<div class="rl-mr${izmjereno && ocekivano ? '' : ' rl-mr--jedno'}">` + izmjereno
        + (izmjereno && ocekivano ? '<span aria-hidden="true" class="rl-mr__arrow">→</span>' : '') + ocekivano + '</div>'
      : '';
    const gumb = (kamo: number | null, smjer: 'prev' | 'next', znak: string, opis: string): string =>
      `<button type="button" class="rl-nav desk-nav__btn desk-nav__btn--${smjer}" data-rl-go="${kamo ?? ''}"`
      + `${kamo === null ? ' disabled' : ''} aria-label="${opis}"><span aria-hidden="true">${znak}</span></button>`;
    return `<article class="rl-card cockpit-finding cockpit-finding--${esc(f.status)}" data-cockpit-finding data-rl-card`
      + ` data-finding-id="${esc(f.id)}">`
      + '<div class="rl-card__head" data-desk-nav>'
      + `<span class="rl-card__pos">Nalaz <span data-desk-count>${pol.oznaka}</span></span>`
      + `<span class="rl-card__nav">${gumb(pol.prethodni, 'prev', '←', 'Prethodni nalaz')}${gumb(pol.sljedeci, 'next', '→', 'Sljedeći nalaz')}</span>`
      + '</div>'
      + `<p class="rl-card__eyebrow" data-ton="${oz.ton}"><span class="rl-dot" aria-hidden="true"></span>${oz.tekst} · ${esc(jez)}</p>`
      + `<h3 class="rl-card__title" tabindex="-1">${esc(f.title)}</h3>`
      + mjera
      + (f.explanation ? `<p class="rl-card__why">${esc(f.explanation)}</p>` : '')
      // Uputa, mjesto i dokaz iz ISTIH funkcija kao kartica Z8 (Codex R3, R5).
      + `<p class="rl-card__do" data-rl-uputa><span class="rl-mr__k">Što napraviti</span>${recommendation(f, o.repairAvailable)}</p>`
      + `<div class="rl-card__where">${locationHtml(f)}</div>`
      + evidenceHtml(f)
      + kontrolaHtml(i)
      + `<div class="rl-card__decide">${decisionHtml(f)}</div>`
      + '</article>';
  };

  /* ---------------------------------------------------------------- stranica */

  const stranicaHtml = (i: number): string => {
    const s = stranicaZaNalaz(preview, nalazi[i].scope, traka);
    if (!s.odlomci.length) return '';
    const tekstSloja = (sloj: 'now' | 'after'): string => s.odlomci.map((pp) =>
      `<p${pp.heading ? ' class="rl-h"' : ''}${sloj === 'now' ? ` data-rl-p="${pp.index}"` : ''}>${esc(pp.text)}</p>`).join('');
    // Stranica iz Wordovih tragova je priblizna (`kartaStranica`, F37), pa natpis to i kaze.
    const natpis = natpisMjesta(nalazi[i].scope, s, traka);
    const prekidac = vidljivi.length
      ? '<div class="rl-mode" role="group" aria-label="Prikaz stranice">'
        + `<button type="button" data-rl-mode="now" aria-pressed="${mode === 'now'}">SADA</button>`
        + `<button type="button" data-rl-mode="after" aria-pressed="${mode === 'after'}">NAKON PLANA</button></div>`
      : '';
    const rucni = nalazi.map((f, j) => (uloge[j].kind === 'rucno' ? f.title : null)).filter((t): t is string => !!t);
    return '<div class="rl-pagecol" data-rl-pagecol>'
      + `<div class="rl-pagebar"><span class="rl-label" data-rl-pagelabel>${esc(natpis)}</span>${prekidac}</div>`
      + `<div class="rl-page" data-rl-page data-mode="${mode}"${s.sidro !== null ? ` data-rl-sidro="${s.sidro}"` : ''}>`
      + '<div class="rl-zoom" data-rl-zoom>'
      + `<div class="rl-text" data-rl-text="now" lang="hr">${tekstSloja('now')}</div>`
      + `<div class="rl-text rl-text--after" data-rl-text="after" lang="hr" aria-hidden="true">${tekstSloja('after')}</div>`
      + `<span class="rl-pn" aria-hidden="true">${s.broj ?? ''}</span>`
      + '</div></div>'
      // Cedulja je mala: tri naslova i broj ostalih, a puni popis nosi svaka kartica.
      + (rucni.length
        ? `<p class="rl-note" data-rl-note>Ovo dodaješ sam: ${esc(rucni.slice(0, 3).join(', '))}${rucni.length > 3 ? ` i još ${rucni.length - 3}` : ''}.</p>`
        : '')
      + '</div>';
  };

  /* ---------------------------------------------------------------- traka stranica */

  /**
   * Skupine nalaza bez stranice tijela (Codex R5): cijeli rad, fusnote i nalazi kojima se stranica
   * ne moze pripisati. Svaka je gumb koji otvara svoj prvi nalaz, pa nijedan nalaz ne nestaje iz
   * trake bez traga. Redoslijed indeksa je redoslijed stola.
   */
  const skupine = (): Array<readonly ['cijeli' | 'fusnote' | 'bez', string, readonly number[]]> => [
    ['cijeli', 'Cijeli rad', traka.cijeliRad],
    ['fusnote', 'Fusnote', traka.fusnote],
    ['bez', 'Bez stranice', traka.bezStranice],
  ];

  const trakaHtml = (i: number): string => {
    const ukupno = traka.ukupno;
    const sel = stranicaNalaza(traka, i);
    // CELIJE SU KARTA, NE METE (Codex R8): na 360 px s deset stranica celija je uza od 32 px. Mete su
    // gumbi stranica s nalazima ispod karte, svaki najmanje 44 x 44 px; karta je `aria-hidden`.
    const celije = ukupno === null ? '' : Array.from({ length: ukupno }, (_, k) => {
      const n = k + 1;
      const hit = traka.poStranici.has(n);
      return `<span class="rl-cell${hit ? ' rl-cell--hit' : ''}${sel === n ? ' rl-cell--cur' : ''}"></span>`;
    }).join('');
    const stranice = [...traka.poStranici.entries()].sort(([a], [b]) => a - b).map(([n, ind]) =>
      `<button type="button" class="rl-go${sel === n ? ' rl-go--cur' : ''}" data-rl-page-go="${n}"`
      + ` aria-label="Oko stranice ${n}, ${ind.length} ${pluralHr(ind.length, ['nalaz', 'nalaza', 'nalaza'])}"><span>str. ${n}</span></button>`).join('');
    const skup = skupine().filter(([, , ind]) => ind.length).map(([kljuc, ime, ind]) =>
      `<button type="button" class="rl-go rl-go--skup${ind.includes(i) ? ' rl-go--cur' : ''}" data-rl-skup="${kljuc}"`
      + ` aria-label="${ime}, ${ind.length} ${pluralHr(ind.length, ['nalaz', 'nalaza', 'nalaza'])}"><span>${ime} · ${ind.length}</span></button>`).join('');
    const c = traka.cijeliRad.length;
    const recenice = [
      c ? `Crvena crta: ${c} ${pluralHr(c, ['nalaz vrijedi', 'nalaza vrijede', 'nalaza vrijedi'])} za cijeli rad.` : '',
      // Pripis je PRIBLIZAN (Codex R9): stranica moze nositi vise mjesta, a Word zna stranicu samo kroz tragove prijeloma.
      traka.poStranici.size ? 'Jantarna stranica nosi nalaze; pripis stranici je približan.' : '',
      traka.fusnote.length ? 'Fusnote su zaseban dio rada i nemaju stranicu na traci.' : '',
      ukupno === null ? 'Word nije zapisao broj stranica, pa nalazi nisu pripisani stranicama.'
        : !traka.pouzdano && traka.bezStranice.length ? 'Wordovi prijelomi ne odgovaraju broju stranica, pa nalazi nisu pripisani stranicama.' : '',
    ];
    const legenda = recenice.filter(Boolean).join(' ');
    const naslov = ukupno === null ? 'Gdje su nalazi' : `Gdje su nalazi · ${ukupno} ${pluralHr(ukupno, ['stranica', 'stranice', 'stranica'])}`;
    return '<div class="rl-strip" data-rl-strip>'
      + `<div class="rl-strip__head"><span>${naslov}</span>`
      + `<span data-rl-pagenote>${esc(oznakaTrake(nalazi[i].scope, sel))}</span></div>`
      + (c ? '<div class="rl-strip__line" aria-hidden="true"></div>' : '')
      + (celije ? `<div class="rl-strip__cells" style="--rl-n:${ukupno}" aria-hidden="true">${celije}</div>` : '')
      + (stranice || skup ? `<div class="rl-strip__go" role="group" aria-label="Skok na nalaze">${stranice}${skup}</div>` : '')
      + (legenda ? `<p class="rl-strip__legend">${legenda}</p>` : '')
      + '</div>';
  };

  /* ---------------------------------------------------------------- crtanje */

  host.innerHTML = '<div class="rl" data-rl>'
    + `<div id="nalazi" class="rl-tabs" role="tablist" aria-label="Kategorije" data-rl-tabs>${jezicciHtml()}</div>`
    + '<section class="rl-desk" data-rl-desk aria-label="Korektorski stol">'
    + '<div class="rl-pagewrap" data-rl-pagewrap></div>'
    + '<div class="rl-cardcol"><div class="rl-stack" data-rl-stack>'
    + '<div class="rl-under rl-under--2" aria-hidden="true"></div><div class="rl-under rl-under--1" aria-hidden="true"></div>'
    + '<div class="rl-slot" data-rl-slot aria-live="polite"></div></div>'
    + '<div data-rl-stripwrap></div></div>'
    + '</section></div>';

  const q = <T extends HTMLElement>(sel: string): T | null => host.querySelector<T>(sel);

  const zumiraj = (): void => {
    const page = q<HTMLElement>('[data-rl-page]');
    const zum = q<HTMLElement>('[data-rl-zoom]');
    if (!page || !zum) return;
    page.querySelectorAll('[data-rl-hit]').forEach((el) => el.removeAttribute('data-rl-hit'));
    const sidro = page.dataset.rlSidro;
    const meta = sidro ? page.querySelector<HTMLElement>(`[data-rl-p="${sidro}"]`) : null;
    if (meta && mode === 'now') meta.setAttribute('data-rl-hit', 'true');
    // ZUM SAMO S SIDROM i samo u prikazu SADA; pod smanjenim pokretom nema zuma, ostaje oznaka.
    if (!meta || mode !== 'now' || tiho || page.clientHeight <= 0) {
      zum.style.transform = '';
      return;
    }
    const y = ((meta.offsetTop + meta.offsetHeight / 2) / page.clientHeight) * 100;
    zum.style.transformOrigin = `50% ${Math.max(0, Math.min(100, y)).toFixed(1)}%`;
    zum.style.transform = `scale(${ZUM})`;
  };

  const crtajStranicu = (): void => {
    const wrap = q<HTMLElement>('[data-rl-pagewrap]');
    if (!wrap) return;
    const i = indeksOdabranog();
    // Mobitel (< 900 px): bez stranice rada; kartice, traka i ladica ostaju.
    wrap.innerHTML = siroko() ? stranicaHtml(i) : '';
    host.querySelector<HTMLElement>('[data-rl-desk]')?.toggleAttribute('data-rl-bez-stranice', !wrap.innerHTML);
    const sad = q<HTMLElement>('[data-rl-text="now"]');
    const nak = q<HTMLElement>('[data-rl-text="after"]');
    const page = q<HTMLElement>('[data-rl-page]');
    if (sad) varijableSloja(sad, sada);
    const poslije = izgledNakon(sada, o.planItems, odabir);
    if (nak) varijableSloja(nak, poslije);
    page?.toggleAttribute('data-rl-broj', poslije.brojStranice);
    const v = preview?.page && typeof preview.page.size === 'object' && preview.page.size !== null
      ? preview.page.size as { w?: unknown; h?: unknown } : null;
    if (page && typeof v?.w === 'number' && typeof v?.h === 'number' && v.w > 0 && v.h > 0) {
      page.style.aspectRatio = `${v.w} / ${v.h}`;
    }
    zumiraj();
  };

  const crtajKarticu = (): void => {
    const slot = q<HTMLElement>('[data-rl-slot]');
    if (slot) slot.innerHTML = nalazi.length ? karticaHtml(indeksOdabranog()) : '';
    const sw = q<HTMLElement>('[data-rl-stripwrap]');
    if (sw) sw.innerHTML = trakaHtml(indeksOdabranog());
  };

  /* ---------------------------------------------------------------- ladica */

  const imaLadicu = o.repairAvailable && zahvati.length > 0;
  let ladicaEl: HTMLElement | null = null;
  const crtajLadicu = (): void => {
    if (!ladicaEl) return;
    const l = ladica(odabir, zahvati, o.score, o.ceiling);
    const n = ladicaEl.querySelector<HTMLElement>('[data-rl-tray-n]');
    const r = ladicaEl.querySelector<HTMLElement>('[data-rl-tray-r]');
    const go = ladicaEl.querySelector<HTMLButtonElement>('[data-rl-plan-go]');
    if (n) { n.textContent = `${l.zahvata} ${pluralHr(l.zahvata, ['zahvat', 'zahvata', 'zahvata'])}`; n.dataset.rlTrayN = String(l.zahvata); }
    if (r) {
      const [ocj, strop] = l.racun ? l.racun.split(' → ') : ['', ''];
      r.innerHTML = l.racun ? `${esc(ocj)} → <b>${esc(strop)}</b>` : '';
      r.hidden = !l.racun;
    }
    if (go) go.disabled = l.zahvata === 0;
  };
  if (imaLadicu) {
    ladicaEl = doc.createElement('div');
    ladicaEl.className = 'rl-tray';
    ladicaEl.dataset.rlTray = '';
    ladicaEl.setAttribute('aria-hidden', 'true');
    ladicaEl.setAttribute('inert', '');
    ladicaEl.setAttribute('role', 'region');
    ladicaEl.setAttribute('aria-label', 'Plan popravka');
    // Cijena: klijent nema mjerodavan izvor (naplata je na serverskom katalogu), pa ladica nosi
    // POSTOJECU recenicu toka popravka (`repair-price-slider.ts`), ne iznos iz predloska (F37).
    ladicaEl.innerHTML = '<span class="rl-tray__k">Plan popravka</span>'
      + '<span class="rl-tray__n" data-rl-tray-n></span>'
      + '<span class="rl-tray__r" data-rl-tray-r></span>'
      + '<span class="rl-tray__p">Cijena ne ovisi o odabiru.</span>'
      // `data-repair-plan-go` i `repair-plan-continue` su ugovor plana Z8 (T09): ista radnja, isti odabir.
      + '<button type="button" class="rl-tray__go" data-rl-plan-go data-repair-plan-go data-testid="repair-plan-continue">'
      + 'Napravi plan <span aria-hidden="true">→</span></button>';
    // Ladica je u `body`, ne u kokpitu: list rada (`.analyzer-wrap`) je zarotiran, a `transform`
    // pretka pretvara `position: fixed` u polozaj unutar tog pretka.
    doc.body.append(ladicaEl);
    // Uklanjanje je ciscenje od trenutka umetanja, pa ga pokrije i djelomicna montaza (Codex R1).
    const el = ladicaEl;
    ciscenja.push(() => { el.remove(); mount.removeAttribute('data-rl-tray-open'); });
    crtajLadicu();
  }

  /** Ladica je vidljiva kad je presuda izasla iz pogleda, a stol je jos na ekranu. */
  let presudaVidljiva = true;
  let stolVidljiv = false;
  const azurirajLadicu = (): void => {
    if (!ladicaEl) return;
    const otvorena = !presudaVidljiva && stolVidljiv;
    ladicaEl.dataset.open = String(otvorena);
    ladicaEl.setAttribute('aria-hidden', String(!otvorena));
    ladicaEl.toggleAttribute('inert', !otvorena);
    mount.toggleAttribute('data-rl-tray-open', otvorena);
  };
  if (ladicaEl && typeof IntersectionObserver === 'function') {
    const list = mount.querySelector('[data-cockpit-verdict-sheet]');
    const io = new IntersectionObserver((zapisi) => {
      for (const z of zapisi) {
        if (z.target === list) presudaVidljiva = z.isIntersecting;
        else stolVidljiv = z.isIntersecting;
      }
      azurirajLadicu();
    }, { threshold: [0, 0.15] });
    if (list) io.observe(list);
    io.observe(host);
    ciscenja.push(() => io.disconnect());
  }

  /* ---------------------------------------------------------------- pokret */

  const odleti = (od: HTMLElement, natpis: string): void => {
    const cilj = ladicaEl?.dataset.open === 'true' ? ladicaEl : mount.querySelector<HTMLElement>('.cockpit-ring');
    if (tiho || !cilj || typeof doc.body.animate !== 'function') return;
    const a = od.getBoundingClientRect();
    const b = cilj.getBoundingClientRect();
    const c = doc.createElement('div');
    c.className = 'rl-fly';
    c.textContent = natpis;
    c.style.left = `${a.left}px`;
    c.style.top = `${a.top}px`;
    doc.body.append(c);
    const dx = b.left + b.width / 2 - a.left - 40;
    const dy = b.top + b.height / 2 - a.top - 16;
    const anim = c.animate([
      { transform: 'rotate(2deg)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 70}px) rotate(-6deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(.5)`, opacity: 0 },
    ], { duration: 850, easing: 'ease-in-out' });
    anim.onfinish = () => c.remove();
    ciscenja.push(() => c.remove());
  };

  /**
   * FOKUS PREZIVLJAVA ZAMJENU KARTICE (Codex R6). Kartica i traka se crtaju nanovo, pa bi fokus
   * pao na `body` i korisnik tipkovnice izgubio mjesto. Pamti se ULOGA fokusiranog elementa
   * (strelica, stranica, skupina), ne cvor, i vraca na isti element nove kartice; kad ga nema ili je
   * ugasen (kraj popisa), na drugu strelicu, a bez nje na naslov kartice.
   */
  const ulogaFokusa = (): string | null => {
    const a = doc.activeElement as HTMLElement | null;
    if (!a || !host.contains(a)) return null;
    if (a.matches('.desk-nav__btn--next')) return 'next';
    if (a.matches('.desk-nav__btn--prev')) return 'prev';
    if (a.dataset.rlPageGo) return `[data-rl-page-go="${a.dataset.rlPageGo}"]`;
    if (a.dataset.rlSkup) return `[data-rl-skup="${a.dataset.rlSkup}"]`;
    return null;
  };
  const vratiFokus = (uloga: string): void => {
    const gumb = (smjer: string): HTMLButtonElement | null => q<HTMLButtonElement>(`[data-rl-card] .desk-nav__btn--${smjer}:not([disabled])`);
    const cilj = uloga === 'next' ? gumb('next') ?? gumb('prev')
      : uloga === 'prev' ? gumb('prev') ?? gumb('next')
        : q<HTMLElement>(uloga);
    (cilj ?? q<HTMLElement>('.rl-card__title'))?.focus();
  };

  let listanje = 0;
  let generacijaListanja = 0;
  /** Nalaz prema kojem kartica upravo leti; drugi klik na strelicu racuna od njega, ne od stare kartice. */
  let naCekanju: number | null = null;
  const prekiniListanje = (): void => {
    generacijaListanja += 1;
    if (listanje) win?.clearTimeout(listanje);
    listanje = 0;
    naCekanju = null;
    const slot = q<HTMLElement>('[data-rl-slot]');
    if (slot) slot.dataset.anim = '';
  };
  /** Gornja kartica odleti ustranu; promjena filtra ili rezima otkazuje zastarjelo odrediste. */
  const listaj = (novi: number, smjer: 1 | -1): void => {
    prekiniListanje();
    const generacija = generacijaListanja;
    const slot = q<HTMLElement>('[data-rl-slot]');
    const zamijeni = (): void => {
      if (odbacen || generacija !== generacijaListanja) return;
      const uloga = ulogaFokusa();
      naCekanju = null;
      selId = nalazi[novi]?.id ?? null;
      crtajKarticu();
      crtajStranicu();
      if (uloga) vratiFokus(uloga);
    };
    if (tiho || !slot) { zamijeni(); return; }
    naCekanju = novi;
    slot.dataset.anim = smjer > 0 ? 'out' : 'outR';
    listanje = win?.setTimeout(() => {
      if (odbacen || generacija !== generacijaListanja) return;
      listanje = 0;
      zamijeni();
      slot.dataset.anim = smjer > 0 ? 'in' : 'inR';
      win?.requestAnimationFrame(() => win.requestAnimationFrame(() => {
        if (generacija === generacijaListanja) slot.dataset.anim = '';
      }));
    }, 200) ?? 0;
  };
  ciscenja.push(prekiniListanje);

  /* ---------------------------------------------------------------- dogadaji */

  const naKlik = (e: Event): void => {
    const cilj = e.target as HTMLElement | null;
    if (!cilj || typeof cilj.closest !== 'function') return;
    const tab = cilj.closest<HTMLButtonElement>('[data-rl-tab]');
    if (tab) {
      if (tab.disabled) return;
      prekiniListanje();
      cat = tab.dataset.rlTab as Jezicak;
      selId = nalazi[filtriraj(nalazi, cat)[0] ?? 0]?.id ?? null;
      const tabs = q<HTMLElement>('[data-rl-tabs]');
      if (tabs) tabs.innerHTML = jezicciHtml();
      q<HTMLElement>(`[data-rl-tab="${cat}"]`)?.focus();
      crtajKarticu();
      crtajStranicu();
      return;
    }
    const go = cilj.closest<HTMLButtonElement>('[data-rl-go]');
    if (go) {
      if (go.disabled) return;
      // Susjed se racuna od nalaza prema kojem kartica vec leti, pa dvostruki klik pomakne dvaput.
      const pol = polozaj(filtriraj(nalazi, cat), naCekanju ?? indeksOdabranog());
      const natrag = go.classList.contains('desk-nav__btn--prev');
      const kamo = natrag ? pol.prethodni : pol.sljedeci;
      if (kamo !== null) listaj(kamo, natrag ? -1 : 1);
      return;
    }
    const strana = cilj.closest<HTMLElement>('[data-rl-page-go]');
    const skupina = cilj.closest<HTMLElement>('[data-rl-skup]');
    if (strana || skupina) {
      const k = skupina?.dataset.rlSkup;
      const ind = strana ? traka.poStranici.get(Number(strana.dataset.rlPageGo))
        : skupine().find(([kljuc]) => kljuc === k)?.[2];
      const prvi = ind?.[0];
      if (prvi === undefined) return;
      cat = 'all';
      const tabs = q<HTMLElement>('[data-rl-tabs]');
      if (tabs) tabs.innerHTML = jezicciHtml();
      listaj(prvi, 1);
      return;
    }
    const nacin = cilj.closest<HTMLElement>('[data-rl-mode]');
    if (nacin) {
      prekiniListanje();
      mode = nacin.dataset.rlMode === 'after' ? 'after' : 'now';
      const page = q<HTMLElement>('[data-rl-page]');
      if (page) page.dataset.mode = mode;
      host.querySelectorAll<HTMLElement>('[data-rl-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rlMode === mode)));
      zumiraj();
      return;
    }
    const preklop = cilj.closest<HTMLButtonElement>('[data-rl-toggle]');
    if (preklop) {
      prekiniListanje();
      const i = indeksOdabranog();
      const bio = uPlanu(uloge[i], odabir);
      odabir = prebaci(uloge[i], odabir);
      dirty = true;
      const uloga = uloge[i];
      if (!bio && uloga.kind === 'zahvat') odleti(preklop, `+ ${uloga.label}`);
      crtajKarticu();
      crtajStranicu();
      crtajLadicu();
      q<HTMLButtonElement>('[data-rl-toggle]')?.focus();
      return;
    }
    if (cilj.closest('[data-finding-ignore]')) {
      cilj.closest<HTMLElement>('[data-finding-id]')?.querySelector<HTMLElement>('[data-finding-ignore-form]')?.removeAttribute('hidden');
      return;
    }
    if (cilj.closest('[data-finding-ignore-cancel]')) {
      cilj.closest<HTMLElement>('[data-finding-ignore-form]')?.setAttribute('hidden', '');
      return;
    }
    const radnja = radnjaZaKlik(cilj);
    if (radnja) o.onAction?.(radnja);
  };
  host.addEventListener('click', naKlik);
  ciscenja.push(() => host.removeEventListener('click', naKlik));

  /** Strelice lijevo/desno pomicu fokus po jezicima (obrazac tablist). */
  const naTipku = (e: KeyboardEvent): void => {
    const tab = (e.target as HTMLElement | null)?.closest?.<HTMLButtonElement>('[data-rl-tab]');
    if (!tab || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
    const svi = Array.from(host.querySelectorAll<HTMLButtonElement>('[data-rl-tab]:not([disabled])'));
    const k = svi.indexOf(tab);
    const dalje = svi[(k + (e.key === 'ArrowRight' ? 1 : -1) + svi.length) % svi.length];
    e.preventDefault();
    dalje?.focus();
  };
  host.addEventListener('keydown', naTipku);
  ciscenja.push(() => host.removeEventListener('keydown', naTipku));

  const naLadicu = (e: Event): void => {
    const go = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-rl-plan-go]');
    if (!go) return;
    // Ladica uvijek salje SVOJ plan: broj koji pise u ladici je odabir koji ide u popravak.
    o.onAction?.({ kind: 'repair-safe', ruleIds: [...odabir] }, go);
  };
  ladicaEl?.addEventListener('click', naLadicu);

  const mq = win?.matchMedia?.(SIROKO);
  const naSirinu = (): void => crtajStranicu();
  mq?.addEventListener?.('change', naSirinu);
  ciscenja.push(() => mq?.removeEventListener?.('change', naSirinu));

  pojacajPresudu();
  crtajKarticu();
  crtajStranicu();
  mount.dataset.rlReady = 'true';

  return {
    stanje: () => ({ kljuc: o.kljuc, selId: nalazi[indeksOdabranog()]?.id ?? null, cat, odabir: dirty ? [...odabir] : null, mode, odigrano: true }),
    odabir: () => (dirty ? [...odabir] : null),
    dispose() {
      odbacen = true;
      ciscenja.forEach((c) => c());
      ladicaEl?.removeEventListener('click', naLadicu);
      delete mount.dataset.rlReady;
    },
  };
}
