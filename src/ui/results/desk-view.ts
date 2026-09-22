/**
 * KOREKTORSKI STOL: prikaz. Raspored je 58% dokument, 42% nalazi.
 *
 * NAVIGACIJA NE OMATA: stol na kojem se vrtis u krug ne moze odgovoriti na "jesam li gotov".
 *
 * KARTICU CRTA `priority-findings.ts`: druga izvedba iste kartice bi se s prvom razisla. Stol
 * dodaje samo svoje - traku o opsegu, pager, red cekanja i vezu prema planu.
 */
import type { DeskItem } from './desk-model';
import { trakaZaOpseg } from './desk-model';
import { queueHtml, queueRedci } from './desk-queue';
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
  if (n === 0) return { index: 0, ukupno: 0, prethodni: null, sljedeci: null, oznaka: '0 od 0' };
  const i = Math.min(Math.max(0, Math.trunc(index)), n - 1);
  return {
    index: i,
    ukupno: n,
    prethodni: i > 0 ? i - 1 : null,
    sljedeci: i < n - 1 ? i + 1 : null,
    oznaka: `${i + 1} od ${n}`,
  };
}

/**
 * Sto stoji iznad dokumenta kad nalaz nema svoje mjesto. 61% nalaza ne moze pokazati odlomak
 * (mjereno), pa je to vecinski slucaj: dokument ostaje NEOZNACEN uz recenicu koja kaze zasto.
 *
 * Cetvrti slucaj nastaje tek pri spajanju: nalaz IMA sidro, ali zastavica nije iscrtana. Sutnja
 * bi ondje bila najgora, jer korisnik trazi oznaku koje nema.
 */
export function deskTraka(item: DeskItem): string | null {
  // NEPOZNAT OPSEG NE DOBIVA TRAKU: `trakaZaOpseg` za `unavailable` vraca `scope.reason`, a isti
  // razlog kartica vec ispisuje u retku "Gdje:", pa su se na snimci (2026-09-08, nalaz 03)
  // vidjele DVIJE identicne recenice jedna iznad druge.
  if (item.finding.scope.kind === 'unavailable') return null;
  const opseg = trakaZaOpseg(item.finding.scope);
  if (opseg) return opseg;
  if (item.flagIndex === null) return 'Mjesto je poznato, ali nije označeno u ovom prikazu.';
  return null;
}

/**
 * PAGER (Z8). Desna strana stola nosi JEDNU karticu, pa navigacija vise nije podnozje popisa nego
 * zaglavlje kartice: polozaj "Nalaz 3 od 6" i dvije okrugle strelice.
 *
 * RIJEC "Nalaz" STOJI IZVAN `[data-desk-count]`, a brojka ostaje `nav.oznaka` ("3 od 6"). Taj
 * element je ugovor: `tests/desk-mount.test.ts` cita tocno njegov tekst kao polozaj stola, pa bi
 * upisivanje cijele recenice u njega pretvorilo mjeru polozaja u mjeru copyja. Predlozak pise
 * "Nalaz 1 od 6", pa je Z8 pager uskladen s njim (MAJOR odluka orkestratora): stariji separator
 * kosa crta zamijenjen je rijecju "od" u JEDNOM cvoru teksta, bez skrivenih duplikata za testove.
 *
 * Razredi gumba se NE mijenjaju: `desk-nav__btn--prev/next` i prazan `data-desk-go` uz `disabled`
 * su ugovor s delegacijom u `mountDesk` i s gardom da navigacija NE OMATA.
 */
export function deskNavHtml(nav: DeskNav, esc: (v: string) => string): string {
  const gumb = (kamo: number | null, smjer: 'prev' | 'next', natpis: string, opis: string): string =>
    `<button type="button" class="desk-nav__btn desk-nav__btn--${smjer}" data-desk-go="${kamo ?? ''}"`
    + `${kamo === null ? ' disabled' : ''} aria-label="${esc(opis)}">`
    + `<span aria-hidden="true">${natpis}</span></button>`;
  return '<nav class="desk-pager" data-desk-nav aria-label="Kretanje po nalazima">'
    + `<span class="desk-pager__count">Nalaz <span data-desk-count>${esc(nav.oznaka)}</span></span>`
    + '<span class="desk-pager__btns">'
    + gumb(nav.prethodni, 'prev', '&#8592;', 'Prethodni nalaz')
    + gumb(nav.sljedeci, 'next', '&#8594;', 'Sljedeći nalaz')
    + '</span></nav>';
}

/**
 * Desna strana stola: PAGER, pa JEDNA kartica, pa RED CEKANJA (Z8).
 *
 * Do Z8 je kartica zivjela UNUTAR reda cekanja, kao detalj otvorenog retka, pa je s devet redaka
 * iznad sebe pocinjala ispod pregiba. Z8 vadi karticu iz popisa i daje joj pager; popis se time NE
 * ukida nego se spusta ISPOD kartice. Z9 ga ondje izricito i trazi ("ispod red cekanja"), i to je
 * jedino mjesto na ekranu koje odgovara na "sto me jos ceka" imenom, a ne brojkom: pager kaze
 * koliko ih je, DNA traka kakve su vrste, ali nijedno ne kaze STO.
 */
export function deskPaneHtml(
  item: DeskItem<VisualFindingModel> | null,
  nav: DeskNav,
  repairAvailable: boolean,
  esc: (v: string) => string,
  // OBAVEZAN, bez zadane vrijednosti: red cekanja nabraja SVE nalaze, a ne samo prikazani.
  svi: readonly DeskItem<VisualFindingModel>[],
  planDostupan = false,
): string {
  if (!item) return '<div class="desk-pane" data-desk-pane><p class="desk-prazno">Nema otvorenih nalaza.</p></div>';
  const traka = deskTraka(item);
  const detalj = (traka ? `<p class="desk-traka" data-desk-traka>${esc(traka)}</p>` : '')
    // `nav.index + 1` je REDOSLIJED NA STOLU, isti broj koji stoji u pageru ("3 / 9").
    // Kad se dvije brojke na istom ekranu ne slazu, korisnik to cita kao kvar.
    + priorityFindingHtml(item.finding, repairAvailable, nav.index + 1);
  // ULAZ U PLAN STOJI UZ NALAZE, jer se ondje i donosi odluka da se nesto popravi. Do 2026-09-08
  // je jedini ulaz bio CTA uz ocjenu, koji vodi na panel skriven u kartici "Spremnost za predaju";
  // kod je uz taj CTA sam pisao da ga "ni autor aplikacije nije nasao".
  const uPlan = planDostupan
    ? '<button type="button" class="desk-plan-open" data-desk-plan-open>Otvori plan ispravaka'
      + ' <span aria-hidden="true">&#8594;</span></button>'
    : '';
  // PAGER JE ZAGLAVLJE KARTICE, ne podnozje popisa: kad je kartica jedna, polozaj i strelice
  // moraju stajati iznad nje, inace korisnik do njih dode tek nakon cijelog nalaza.
  //
  // RED CEKANJA VISE NE NOSI DETALJ (cetvrti argument izostaje): kartica stoji iznad njega, pa bi
  // isti nalaz bio nacrtan dvaput. Redci ostaju klikabilni kroz isti `data-desk-go`.
  return '<div class="desk-pane" data-desk-pane>'
    + deskNavHtml(nav, esc)
    + detalj
    + uPlan
    + queueHtml(queueRedci(svi, repairAvailable), nav.index, esc)
    + '</div>';
}

/**
 * Desna strana u nacinu PLAN. Plan ZAMJENJUJE popis nalaza, ne stoji uz njega: to su dva pogleda
 * na isti posao ("sto nije u redu" i "sto cu s tim"), pa jedan ispod drugoga trazi da korisnik
 * dvaput procita iste stavke.
 *
 * Povratak je uvijek ponudjen, jer plan je ODLUKA, a odluka bez izlaza nije odluka.
 */
export function deskPlanPaneHtml(planHtml: string): string {
  return '<div class="desk-pane desk-pane--plan" data-desk-pane>'
    + '<button type="button" class="desk-natrag" data-desk-plan-close>'
    + '<span aria-hidden="true">&#8592;</span> Natrag na nalaze</button>'
    + planHtml
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
  planDostupan = false,
): string {
  return '<section class="desk" data-desk aria-label="Korektorski stol">'
    // `tabindex` i `role` NISU ukras: pano ima vlastiti skrol, pa bez njih korisnik tipkovnice
    // ne moze pomaknuti dokument. axe to prijavljuje kao `scrollable-region-focusable`, i
    // prijavio je 2026-09-08 na TRI ekrana odjednom cim je stol ozicen. Naziv je obavezan uz
    // `role="region"`, inace citac ekrana najavi podrucje koje nema ime.
    + '<div class="desk-doc" data-desk-doc tabindex="0" role="region" aria-label="Dokument">'
    + '<p class="desk-doc__cekanje">Pripremam prikaz dokumenta…</p></div>'
    + deskPaneHtml(item, nav, repairAvailable, esc, svi, planDostupan)
    + '</section>';
}
