/**
 * KOREKTORSKI STOL: prikaz. Raspored je 58% dokument, 42% nalazi.
 *
 * NAVIGACIJA NE OMATA: na zadnjem nalazu "Sljedeci problem" je ugasen. Stol na kojem se vrtis u
 * krug ne moze odgovoriti na "jesam li gotov", a to je pitanje zbog kojeg korisnik broji.
 *
 * KARTICU CRTA `priority-findings.ts`, ne ovaj modul: druga izvedba iste kartice bi se s prvom
 * prije ili kasnije razisla. Stol dodaje samo svoje - traku o opsegu, popis i navigaciju.
 */
import type { DeskItem } from './desk-model';
import { trakaZaOpseg } from './desk-model';
import { priorityFindingHtml } from './priority-findings';
import { queueHtml, queueRedci } from './desk-queue';
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
 * Sto stoji iznad dokumenta kad nalaz nema svoje mjesto. 61% nalaza ne moze pokazati odlomak
 * (mjereno), pa je to vecinski slucaj: dokument ostaje NEOZNACEN uz recenicu koja kaze zasto,
 * umjesto izmisljenog okvira.
 *
 * Cetvrti slucaj model ne zna, jer nastaje tek pri spajanju: nalaz IMA sidro, ali zastavica nije
 * iscrtana. Sutnja bi ondje bila najgora, jer korisnik trazi oznaku koje nema.
 */
export function deskTraka(item: DeskItem): string | null {
  // NEPOZNAT OPSEG NE DOBIVA TRAKU, jer bi ponovio ono sto kartica vec pise. `trakaZaOpseg` za
  // `unavailable` vraca `scope.reason`, a isti taj razlog kartica ispisuje u retku "Gdje:", pa su
  // se na ekranu pojavile DVIJE identicne recenice jedna iznad druge (vidjeno na snimci
  // 2026-09-08, nalaz 03). Za `document` i `region` traka govori nesto sto kartica ne kaze: zasto
  // u dokumentu lijevo nema nijedne oznake.
  if (item.finding.scope.kind === 'unavailable') return null;
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

/**
 * Desna strana stola: RED CEKANJA s otvorenim detaljem odabranog, pa navigacija.
 *
 * Popis odgovara na "sto sve me ceka", navigacija na "vodi me redom". Oba su jeftina jer dijele
 * isti `data-desk-go`, a samo jedan od njih ne bi bio dovoljan: jedna kartica ne kaze je li
 * ostatak tezak ni sitan, a sam popis ne vodi kroz posao.
 */
export function deskPaneHtml(
  item: DeskItem<VisualFindingModel> | null,
  nav: DeskNav,
  repairAvailable: boolean,
  esc: (v: string) => string,
  // OBAVEZAN, bez zadane vrijednosti. Zadano `[item]` je izmisljalo jednoclani popis, pa kad se ne
  // bi poklopio s polozajem, NIJEDAN redak ne bi bio odabran i detalj bi tiho nestao s ekrana.
  svi: readonly DeskItem<VisualFindingModel>[],
): string {
  if (!item) return '<div class="desk-pane" data-desk-pane><p class="desk-prazno">Nema otvorenih nalaza.</p></div>';
  const traka = deskTraka(item);
  const detalj = (traka ? `<p class="desk-traka" data-desk-traka>${esc(traka)}</p>` : '')
    // `nav.index + 1` je REDOSLIJED NA STOLU, isti broj koji stoji u "3 / 9" i u retku popisa.
    // Kad se dvije brojke na istom ekranu ne slazu, korisnik to cita kao kvar.
    + priorityFindingHtml(item.finding, repairAvailable, nav.index + 1);
  return '<div class="desk-pane" data-desk-pane>'
    + queueHtml(queueRedci(svi, repairAvailable), nav.index, esc, detalj)
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
  svi: readonly DeskItem<VisualFindingModel>[],
): string {
  return '<section class="desk" data-desk aria-label="Korektorski stol">'
    // `tabindex` i `role` NISU ukras: pano ima vlastiti skrol, pa bez njih korisnik tipkovnice
    // ne moze pomaknuti dokument. axe to prijavljuje kao `scrollable-region-focusable`, i
    // prijavio je 2026-09-08 na TRI ekrana odjednom cim je stol ozicen. Naziv je obavezan uz
    // `role="region"`, inace citac ekrana najavi podrucje koje nema ime.
    + '<div class="desk-doc" data-desk-doc tabindex="0" role="region" aria-label="Dokument">'
    + '<p class="desk-doc__cekanje">Pripremam prikaz dokumenta…</p></div>'
    + deskPaneHtml(item, nav, repairAvailable, esc, svi)
    + '</section>';
}
