/**
 * KOREKTORSKI STOL: prikaz. Model veze nalaz <-> mjesto zivi u `desk-model.ts`; ovdje je samo ono
 * sto korisnik vidi.
 *
 * Brif vlasnika (2026-09-08): "Digitalni korektor koji sjedi uz tvoj Word. Ne dashboard, ne
 * tablica provjera, ne score app. Klik na nalaz pomakne dokument, klik na oznaceno mjesto aktivira
 * nalaz." Raspored je 58% dokument, 42% nalazi.
 *
 * JEDAN NALAZ ODJEDNOM, i to je cijela razlika prema popisu kartica. Popis trazi da korisnik sam
 * bira gdje gledati; stol mu daje jedno mjesto i jedno pitanje, pa navigacija ("1 / 6") nosi
 * osjecaj napretka koji tablica nema.
 *
 * NAVIGACIJA NE OMATA. Na zadnjem nalazu "Sljedeci problem" je ugasen, a ne vraca na prvi.
 * Korektorski stol na kojem se vrtis u krug ne moze reci jesi li gotov, a upravo to je pitanje
 * zbog kojeg korisnik broji.
 *
 * KARTICU NALAZA CRTA `priority-findings.ts`, ne ovaj modul. Druga izvedba iste kartice bi se
 * razisla s prvom (mjereno na ovom repozitoriju vise puta: dvije izvedbe istog pravila se prije ili
 * kasnije raziđu), pa stol dodaje SAMO ono sto je njegovo: traku o opsegu i navigaciju.
 */
import type { DeskItem } from './desk-model';
import { trakaZaOpseg } from './desk-model';
import { priorityFindingHtml } from './priority-findings';
import type { VisualFindingModel } from './visual-result-model';

export interface DeskNav {
  /** 0-based polozaj u popisu. Prikaz ga ispisuje kao `index + 1`. */
  readonly index: number;
  readonly ukupno: number;
  /** `null` znaci "nema kamo", pa je gumb ugasen. Bez omatanja, vidi zaglavlje. */
  readonly prethodni: number | null;
  readonly sljedeci: number | null;
  readonly oznaka: string;
}

/** Polozaj se STISCE u raspon, jer izvor indeksa je klik i moze zaostati za novim rezultatom. */
export function deskNav(ukupno: number, index: number): DeskNav {
  const n = Math.max(0, Math.trunc(ukupno));
  if (n === 0) return { index: 0, ukupno: 0, prethodni: null, sljedeci: null, oznaka: '0 / 0' };
  const i = Math.min(Math.max(0, Math.trunc(index)), n - 1);
  return {
    index: i,
    ukupno: n,
    prethodni: i > 0 ? i - 1 : null,
    sljedeci: i < n - 1 ? i + 1 : null,
    oznaka: `${i + 1} / ${n}`,
  };
}

/**
 * Sto stoji iznad dokumenta kad nalaz nema svoje mjesto.
 *
 * IZMJERENO PRIJE GRADNJE (19 golden fixtura, 233 nalaza): sidro ima 6%, podrucje 16%, cijeli
 * dokument 45%, nepoznato 33%. Dakle 61% nalaza NE MOZE pokazati odlomak, i to je vecina. Stol
 * zato ne smije biti gradjen oko okvira: kad mjesta nema, dokument ostaje NEOZNACEN, a iznad njega
 * stoji recenica koja kaze zasto. Vlasnik je taj izbor potvrdio ("ne izmisljati okvir na prvoj
 * stranici").
 *
 * Cetvrti slucaj nastaje tek pri spajanju i zato ga model ne zna: nalaz IMA sidro, ali zastavica
 * za to mjesto nije iscrtana (prikaz je skracen, ili registar nema svoj nalaz). Sutjeti bi ovdje
 * bilo najgore: korisnik bi trazio oznaku koje nema.
 */
export function deskTraka(item: DeskItem): string | null {
  const opseg = trakaZaOpseg(item.finding.scope);
  if (opseg) return opseg;
  if (item.flagIndex === null) return 'Mjesto je poznato, ali nije označeno u ovom prikazu.';
  return null;
}

export function deskNavHtml(nav: DeskNav, esc: (v: string) => string): string {
  const gumb = (kamo: number | null, smjer: 'prev' | 'next', natpis: string): string =>
    `<button type="button" class="desk-nav__btn desk-nav__btn--${smjer}" data-desk-go="${kamo ?? ''}"`
    + `${kamo === null ? ' disabled' : ''}>${natpis}</button>`;
  return '<nav class="desk-nav" data-desk-nav aria-label="Kretanje po nalazima">'
    + gumb(nav.prethodni, 'prev', '<span aria-hidden="true">&#8592;</span> Prethodni')
    + `<span class="desk-nav__count" data-desk-count>${esc(nav.oznaka)}</span>`
    + gumb(nav.sljedeci, 'next', 'Sljedeći problem <span aria-hidden="true">&#8594;</span>')
    + '</nav>';
}

/** Desna strana stola: traka o opsegu, kartica nalaza, navigacija. */
export function deskPaneHtml(
  item: DeskItem<VisualFindingModel> | null,
  nav: DeskNav,
  repairAvailable: boolean,
  esc: (v: string) => string,
): string {
  if (!item) return '<div class="desk-pane" data-desk-pane><p class="desk-prazno">Nema otvorenih nalaza.</p></div>';
  const traka = deskTraka(item);
  return '<div class="desk-pane" data-desk-pane>'
    + (traka ? `<p class="desk-traka" data-desk-traka>${esc(traka)}</p>` : '')
    // `nav.index + 1` je REDOSLIJED NA STOLU, isti broj koji stoji u "1 / 6". Kartica ga ispisuje
    // kao svoj redni broj, pa se dvije brojke na ekranu slazu umjesto da se natjecu.
    + priorityFindingHtml(item.finding, repairAvailable, nav.index + 1)
    + deskNavHtml(nav, esc)
    + '</div>';
}

/**
 * Cijeli stol. Lijeva strana je SAMO domacin: faksimil se montira izvana (`data-desk-doc`), jer
 * renderer dokumenta je tezak modul koji se ucitava lijeno, i ljuska rezultata ga ne smije povuci
 * u svoj graf.
 */
export function deskHtml(
  item: DeskItem<VisualFindingModel> | null,
  nav: DeskNav,
  repairAvailable: boolean,
  esc: (v: string) => string,
): string {
  return '<section class="desk" data-desk aria-label="Korektorski stol">'
    // `tabindex` i `role` NISU ukras: pano ima vlastiti skrol, pa bez njih korisnik tipkovnice
    // ne moze pomaknuti dokument. axe to prijavljuje kao `scrollable-region-focusable`, i
    // prijavio je 2026-09-08 na TRI ekrana odjednom cim je stol ozicen. Naziv je obavezan uz
    // `role="region"`, inace citac ekrana najavi podrucje koje nema ime.
    + '<div class="desk-doc" data-desk-doc tabindex="0" role="region" aria-label="Dokument">'
    + '<p class="desk-doc__cekanje">Pripremam prikaz dokumenta…</p></div>'
    + deskPaneHtml(item, nav, repairAvailable, esc)
    + '</section>';
}
