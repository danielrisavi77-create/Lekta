/**
 * USPOREDBA DVAJU ALATA: klasifikacija ishoda i tvrdnja o netrivijalnosti.
 *
 * Vodic ovog repozitorija kaze da vise prolaza ISTIM alatom nije provjera nego slaganje. Ovaj modul
 * nosi onaj dio usporedbe koji mora biti provjerljiv odvojeno od alata koji ju izvodi: presudu o
 * tome sto koji par brojki znaci, i presudu o tome mjeri li usporedba uopce nesto.
 *
 * Stoji u `src/` a ne u `tests/helpers/` iz istog razloga kao `docx-shapes.ts`: `tsconfig.json` ima
 * `include: ["src"]`, pa se sve izvan toga ne typechecka. Ne ulazi u bundle i to je zapisano u
 * `data/classification.json`.
 */

/**
 * Cetiri ishoda mjerenja i dva koja kazu da mjerenja nije ni bilo.
 *
 * `katedra-nije-mjerila` je namjerno ODVOJEN od `nitko`. Prvi znaci da druga strana nije dala
 * odgovor, drugi da ga je dala i da je bio prazan. Spojeni bi izgledali isto, a znace suprotno:
 * jedno je rupa u mjerenju, drugo je slaganje.
 *
 * `lekta-ne-mjeri` je ista razlika na NASOJ strani i uveden je 2026-09-10, nakon sto je izostanak te
 * razlike proizveo 17 laznih razilazenja. Lektina provjera nije univerzalna: `reference.uncited` i
 * `citation.author-year.missing-reference` emitiraju se samo za profile koji citiranje propisuju.
 * Dok je odsutnost provjere brojana kao `lekta = 0`, artefakt je tvrdio da je Lekta gledala i nista
 * nasla, pa je 17 redaka ispalo `samo-katedra`, dakle "Lektina provjera je slijepa". Izmjereno:
 * ondje gdje Lekta tu provjeru DOISTA emitira, brojke se poklapaju s Katedrinima (`adu`: 12 naspram
 * 12), pa je zakljucak o sljepoci bio artefakt usporedbe, a ne nalaz o proizvodu.
 */
export type ComparisonOutcome =
  | 'oba'
  | 'samo-lekta'
  | 'samo-katedra'
  | 'nitko'
  | 'katedra-nije-mjerila'
  | 'lekta-ne-mjeri';

export interface ComparisonRow {
  /** Ime dokumenta nad kojim su OBA alata trcala. */
  dokument: string;
  /** Os koju obje strane mjere, imenovana neovisno o tome kako ju koja strana zove. */
  os: string;
  /**
   * Lektina strana: `1` nalaz postoji, `0` provjera je trcala i bila cista, `null` provjere NEMA na
   * tom profilu.
   *
   * Jedinica je namjerno PRISUTNOST, ne broj stavki, jer Lekta po osi emitira JEDNU provjeru
   * (`reference.uncited` sazima "12 izvora bez pronadjene citatnice" u jedan nalaz), dok Katedrina
   * strana broji stavke. Presuda gleda samo `> 0`, pa asimetrija ne kvari ishod; usporedjivati te
   * dvije brojke po VELICINI bilo bi mjerenje dviju razlicitih jedinica.
   */
  lekta: number | null;
  /** Broj Katedrinih nalaza; `null` znaci da ta strana nije dala odgovor. */
  katedra: number | null;
  ishod: ComparisonOutcome;
}

/**
 * Presuda se IZVODI iz brojki, nikad ne upisuje uz njih. Time zapisani ishod ostaje provjerljiv:
 * gard nad artefaktom ponovno racuna isto i usporedjuje, pa redak koji tvrdi jedno a nosi drugo pada.
 */
export function classifyOutcome(lekta: number | null, katedra: number | null): ComparisonOutcome {
  if (katedra === null) return 'katedra-nije-mjerila';
  // Redoslijed je ugovor: odsutnost NASE provjere se sudi tek kad je druga strana dala odgovor.
  if (lekta === null) return 'lekta-ne-mjeri';
  if (lekta > 0 && katedra > 0) return 'oba';
  if (lekta > 0) return 'samo-lekta';
  if (katedra > 0) return 'samo-katedra';
  return 'nitko';
}

/**
 * Usporedba je VAKUUMSKA kad nijedna os nije dala nalaz ni na jednoj strani.
 *
 * Ovo je glavni razred laznog zelenog u ovom alatu, i nije teorijski. Katedrine skripte vracaju JSON
 * cija polja mogu biti preimenovana ili premjestena; izvlacenje koje promasi polje vraca 0, a ne
 * gresku. Svih 33 redaka tada padne na `nitko`, sto se cita kao "oba alata se slazu da je sve u redu",
 * a znaci "jedna strana vise ne mjeri nista". Prazan skup nalaza zato nije tihi prolaz.
 *
 * Redci u kojima druga strana nije ni odgovorila ne racunaju se kao mjerenje.
 */
export function comparisonIsVacuous(rows: readonly ComparisonRow[]): boolean {
  return !rows.some((r) => r.ishod === 'oba' || r.ishod === 'samo-lekta' || r.ishod === 'samo-katedra');
}

/**
 * Razilazenja su jedini razlog zbog kojeg se dva alata uopce usporedjuju: slaganje se moglo dobiti i
 * jednim alatom. Popis se zato imenuje, ne prebrojava, jer se zbroj zna sacuvati dok se sastav mijenja.
 */
export function divergentRows(rows: readonly ComparisonRow[]): ComparisonRow[] {
  return rows.filter((r) => r.ishod === 'samo-lekta' || r.ishod === 'samo-katedra');
}
