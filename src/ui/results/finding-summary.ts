/**
 * SAZETAK NALAZA: ono sto korisnik vidi PRVO na ekranu rezultata.
 *
 * Brif vlasnika (2026-09-07): "Najveca vrijednost Lekte nije 'Tvoj rad ima 71/100' nego
 * 'Nasao sam sest stvari. Tri mogu popraviti automatski. Ovu rijesi prvu.'" Do tada je ocjena
 * imala vizualni autoritet: tamni uredaj 321x353 px s halom, dok su nalazi pocinjali na y=690,
 * dakle ispod pregiba. Vlastita arhitektura pritom vec trazi NALAZ PRIJE OCJENE.
 *
 * DVIJE OSI, I NE SMIJU SE ZBRAJATI ZAJEDNO. Motor ima dvije ciste particije istog skupa:
 *
 *   po OZBILJNOSTI (`result-readiness.ts`)      po POPRAVLJIVOSTI (`analysis/triage.ts`)
 *     blockers      severity === 'error'          auto      stroj popravi sam
 *     improvements  severity === 'warning'        assisted  stroj predlozi, covjek potvrdi
 *     manualReviews sve ostalo                    manual    samo covjek
 *     zbroj = svi nalazi                          zbroj = svi nalazi
 *
 * Vlasnikova skica ("6 stvari / 3 automatski / 2 provjeriti / 1 blokira") mijesa ih: prva tri
 * retka bi se zbrajala u ukupno, a cetvrti presijeca, jer blokator moze biti i automatski
 * popravljiv. Postavljen kao jos jedan redak istog stupca cita se kao dio zbroja, pa kad se ne
 * zbroji, izgleda kao kvar. Zato `razine` (ozbiljnost) i `automatski` (popravljivost) izlaze
 * kao DVA polja, a prikaz ih razdvaja crtom i rijecju "od toga".
 *
 * "BLOKIRA" JE TVRDNJA O FAKULTETOVOM PRAVILU, ne o nasoj heuristici. `result-readiness.ts` to
 * vec cuva: bez verificiranog izvora ista se cinjenica iznosi kao odstupanje koje treba
 * provjeriti. `autoritativno` prenosi tu istu odluku, pa se rijec ne pojavljuje na generickom
 * profilu.
 */
import type { VisualReadinessSignals, VisualScoreModel } from './visual-result-model';
// Ista izvedba mnozine kao ostatak kokpita. Vlastita kopija bi bila drugo pravilo za isti jezik,
// a dvije izvedbe istog pravila se prije ili kasnije raziđu.
import { pluralHr } from './plural-hr';

export interface SummaryRazina {
  /** Koliko ih je. Redak s nulom se ne crta: nula nije nalaz nego odsutnost nalaza. */
  readonly broj: number;
  readonly tekst: string;
  readonly ton: 'blok' | 'dorada' | 'provjera';
}

export interface FindingSummary {
  /** Zbroj svih nalaza; jednak zbroju `razine`, jer dolaze s ISTE osi. */
  readonly ukupno: number;
  readonly razine: readonly SummaryRazina[];
  /**
   * Koliko ih stroj moze popraviti sam. DRUGA OS, pa se ne zbraja s `razine`; `null` kad popravak
   * na ovoj ruti nije dostupan, jer bi "0 automatski" tada tvrdilo nemoc motora umjesto odsutnost
   * ponude.
   */
  readonly automatski: number | null;
  /** Ocjena kao SEKUNDARAN podatak; `null` kad profil ne boduje. */
  readonly ocjena: { readonly vrijednost: number; readonly od: number } | null;
  /**
   * Koliko je pravila provjereno. Stoji UMJESTO ocjene kad je profil ne daje: bez toga bi
   * nebodovan rezultat izgledao kao da provjera nije ni napravljena, a jest, samo se ne boduje.
   */
  readonly provjerenoPravila: number;
}



export function findingSummary(
  signals: VisualReadinessSignals,
  score: VisualScoreModel,
  autoritativno: boolean,
  popravakDostupan: boolean,
): FindingSummary {
  const b = Math.max(0, signals.blockers);
  const d = Math.max(0, signals.warnings);
  const p = Math.max(0, signals.manualReviews);
  const razine: SummaryRazina[] = [];
  if (b > 0) {
    razine.push({
      broj: b,
      // Bez verificiranog pravila ne smijemo reci da nesto blokira predaju; ista cinjenica
      // ostaje, tvrdnja se spusta na ono sto mozemo potkrijepiti.
      tekst: autoritativno
        ? `${pluralHr(b, ['blokira', 'blokiraju', 'blokira'])} predaju`
        : `${pluralHr(b, ['traži', 'traže', 'traži'])} tvoju provjeru prije predaje`,
      ton: autoritativno ? 'blok' : 'provjera',
    });
  }
  if (d > 0) razine.push({ broj: d, tekst: 'treba doraditi', ton: 'dorada' });
  if (p > 0) razine.push({ broj: p, tekst: 'trebaš provjeriti sam', ton: 'provjera' });

  return {
    ukupno: b + d + p,
    razine,
    automatski: popravakDostupan ? Math.max(0, signals.automaticFixes) : null,
    ocjena: score.kind === 'scored' ? { vrijednost: score.value, od: score.max } : null,
    provjerenoPravila: Math.max(0, signals.totalChecks),
  };
}

/** Naslov sazetka. Jednina i mnozina se razlikuju, jer "1 stvari" izgleda kao kvar. */
export function summaryNaslov(ukupno: number): string {
  if (ukupno === 0) return 'Nema otvorenih nalaza';
  return `${ukupno} ${pluralHr(ukupno, ['stvar traži', 'stvari traže', 'stvari traži'])} tvoju pažnju`;
}

/**
 * PRIKAZ. Ocjena je namjerno u istom bloku, ali kao sporedan podatak: mali broj desno, bez halo
 * prstena i bez tamnog uredaja. Ostaje na ekranu jer je i dalje istinita i korisna, samo vise
 * ne odreduje sto ce korisnik prvo procitati.
 */
export function findingSummaryHtml(s: FindingSummary, esc: (v: string) => string): string {
  const razine = s.razine
    .map((r) => `<li class="fsum-razina" data-ton="${esc(r.ton)}"><b>${r.broj}</b> ${esc(r.tekst)}</li>`)
    .join('');
  // "od toga" nosi cijelu tezinu razdvajanja osi: bez te dvije rijeci redak se cita kao jos jedan
  // pribrojnik, a on to nije.
  const auto = s.automatski === null
    ? ''
    // "mogu popraviti" je PRVO LICE (ja, Lekta), pa se ne mijenja po broju: "1 mogu popraviti"
    // i "3 mogu popraviti" su oba ispravna. Vlasnikova skica je vec tako napisana.
    : `<p class="fsum-auto"><span>od toga</span> <b>${s.automatski}</b> mogu popraviti automatski</p>`;
  const ocjena = s.ocjena === null
    ? `<div class="fsum-ocjena fsum-ocjena--nema" data-cockpit-score="none"><b>${s.provjerenoPravila}</b>`
      + `<span>Provjereno ${s.provjerenoPravila} ${pluralHr(s.provjerenoPravila, ['pravilo', 'pravila', 'pravila'])}</span>`
      + '<small>ovaj profil ne boduje</small></div>'
    : `<div class="fsum-ocjena" data-cockpit-score="scored"><b>${s.ocjena.vrijednost}</b><span>/ ${s.ocjena.od}</span><small>tehnička ocjena</small></div>`;
  return `<div class="fsum" data-finding-summary>`
    + `<div class="fsum-glavno"><h3 class="fsum-naslov">${esc(summaryNaslov(s.ukupno))}</h3>`
    + (razine ? `<ul class="fsum-razine">${razine}</ul>` : '')
    + auto + '</div>' + ocjena + '</div>';
}
