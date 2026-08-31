/**
 * ISHOD POPRAVKA: koliko je od onoga sto je popravak CILJAO stvarno razrijeseno.
 *
 * Zasto postoji kao produkcijski modul: do sada je postojao samo brojac STETE
 * (`detectPassRegressions`), koji po konstrukciji preskace sve sto prije popravka nije bilo
 * `pass`. Provjera koja je prije padala i poslije pada nije se pojavljivala nigdje, pa je
 * sucelje moglo reci samo "Popravljeno (N izmjena)" - tocan opis onoga STO JE UCINJENO, ali ne
 * i ISHODA. Dokument koji razrijesi dvije od sest ciljanih provjera i zadrzi istu ocjenu tako je
 * izgledao dovrseno.
 *
 * Isti izracun koriste i testni harness (`tests/real-corpus/harness.ts`) i sucelje, jer je
 * razilazenje dvaju prikaza istog ishoda vec zabiljezeno kao ponavljajuci kvar
 * (`docs/REAL_CORPUS_TESTING.md`).
 *
 * Korelacija ide po STABILNOM `check.id` (`src/scoring/check-id-registry.ts`), kako trazi
 * AGENTS.md, a ne po hrvatskom naslovu.
 */
import { hasActionableParams } from './default-selection';
import { stableCheckId } from '../scoring/check-id-registry';

/** Provjera onako kako je vraca analiza; labavije od `Check`, da ju mogu koristiti i harnessi. */
export interface OutcomeCheckLike {
  id?: string | null;
  title?: string;
  status?: string;
  earned?: number;
  max?: number;
}

/** Stavka popravka; samo ono sto ovom izracunu treba (vidi `src/ui/repair-items.ts`). */
export interface OutcomeItemLike {
  matchKeys?: string[];
  requiresConfirmation?: boolean;
  /**
   * Parametri kakvi bi bili POSLANI. Sluze samo za razlikovanje "primijenjeno pa i dalje pada" od
   * "nije imalo sto primijeniti"; kad ih pozivatelj ne prosljedi, ponasanje je kao prije.
   */
  params?: Record<string, unknown>;
  /** Potreban da `hasActionableParams` zna kad opce pravilo ne vrijedi (vidi WORK_CARRIERS). */
  fixerId?: string;
}

export type RepairOutcomeKind =
  /** Sve sto je popravak ciljao je razrijeseno. */
  | 'complete'
  /** Dio ciljanog je razrijesen, dio nije. */
  | 'partial'
  /** Ciljalo se, ali nijedan ciljani nalaz nije nestao. */
  | 'none'
  /** Nije bilo nijedne ciljane provjere koja je prije padala (nema se sto mjeriti). */
  | 'nothing-targeted';

export interface RepairOutcome {
  kind: RepairOutcomeKind;
  /** Provjere koje su PRIJE padale i meta su odabrane stavke. */
  targeted: string[];
  resolved: string[];
  unresolved: string[];
  /** Ciljano stavkom BEZ potvrde i dalje pada: stvarni jaz motora. */
  autoUnresolved: string[];
  /**
   * Ciljano stavkom koja u sucelju trazi izricitu potvrdu, i dalje pada.
   *
   * NIJE isto sto i "alat tocno ceka korisnika": kad je stavka primijenjena (kao u harnessu, gdje
   * `violated !== false` ulazi u zahtjev), ovo je stvaran jaz asistiranog fixera. Tek pozivatelj
   * koji zna da stavka NIJE potvrdjena smije to nazvati cekanjem.
   */
  assistedUnresolved: string[];
  /**
   * Ciljano stavkom koja trazi potvrdu, ali cijim su parametrima svi odabiri prazni, pa fixer nije
   * imao STO primijeniti. To NIJE jaz motora nego cekanje ljudskog odabira, i zato ne ulazi ni u
   * `targeted` ni u `assistedUnresolved`.
   *
   * Bez ovog razreda je mjerenje tvrdilo suprotno od istine: `assistedUnresolvedCount` je na 74
   * stvarna FPZG rada iznosio 175, a velik dio toga su bile stavke koje harness nikad nije
   * stvarno primijenio (`consistency`, `citation-bibliography-sync`, `required-section`: 221
   * ponuda, 0 promjena na 116 dokumenata).
   */
  awaitingConfirmation: string[];
  /** Padalo prije popravka, a nijedna odabrana stavka ga ne cilja: izvan granice popravka. */
  manualOnly: string[];
  /**
   * `matchKeys` naslovi koje registar ne poznaje. Takav naslov analiza nikad ne emitira, pa je
   * po korelaciji na naslov bio TRAJNO nerazrijesen i tiho obarao postotak. Imenuje se umjesto
   * da se broji.
   */
  unmappedMatchKeys: string[];
}

/**
 * Je li provjera PALA. Namjerno `earned < max`, ne `status !== 'pass'`: dio provjera zadrzava
 * status `'pass'` uz `earned: 0` (npr. brojevi stranica), pa bi usporedba po statusu propustila
 * stvarni gubitak bodova.
 */
export function isFailingCheck(check: OutcomeCheckLike | undefined): boolean {
  if (!check) return false;
  return (check.max ?? 0) > 0 && (check.earned ?? 0) < (check.max ?? 0);
}

/** Nebodovana provjera se ne moze "razrijesiti"; bodovana je razrijesena kad je earned === max. */
export function isResolvedCheck(check: OutcomeCheckLike | undefined): boolean {
  if (!check) return false;
  return (check.max ?? 0) === 0 || (check.earned ?? 0) >= (check.max ?? 0);
}

/** Indeks provjera po stabilnom id-u; naslov je fallback samo za neregistrirane provjere. */
export function checksById(checks: readonly OutcomeCheckLike[]): Map<string, OutcomeCheckLike> {
  const out = new Map<string, OutcomeCheckLike>();
  for (const check of checks) {
    const id = check.id ?? (check.title ? stableCheckId(check.title) : null);
    if (id && !out.has(id)) out.set(id, check);
  }
  return out;
}

/**
 * Ishod popravka iz analize prije, analize poslije i ODABRANIH stavki.
 *
 * `selected` moraju biti stavke koje su stvarno poslane u popravak
 * (`defaultSelectedItems`), ne sve ponudjene: neprekrsene bodovane stavke nose `matchKeys` a
 * `violated: false` ih izbacuje iz zahtjeva, pa bi inace ulazile u nazivnik i spustale postotak
 * poslom koji nitko nije ni zatrazio.
 */
export function summarizeRepairOutcome(input: {
  before: readonly OutcomeCheckLike[];
  after: readonly OutcomeCheckLike[];
  selected: readonly OutcomeItemLike[];
}): RepairOutcome {
  const beforeById = checksById(input.before);
  const afterById = checksById(input.after);

  const auto = new Set<string>();
  const assisted = new Set<string>();
  const awaiting = new Set<string>();
  const unmapped = new Set<string>();

  for (const item of input.selected) {
    // Stavka koja trazi potvrdu, a nema nijedan odabran zahvat, nije primijenjena nego CEKA.
    const waiting = item.requiresConfirmation === true && !hasActionableParams(item.params, item.fixerId);
    for (const title of item.matchKeys ?? []) {
      const id = stableCheckId(title);
      if (!id) {
        unmapped.add(title);
        continue;
      }
      if (!isFailingCheck(beforeById.get(id))) continue;
      (waiting ? awaiting : item.requiresConfirmation ? assisted : auto).add(id);
    }
  }
  // Stavka bez potvrde ima prednost: isti check moze gadjati i automatski i asistirani fixer.
  for (const id of auto) assisted.delete(id);
  // Isti redoslijed prednosti vrijedi i za cekanje: check koji je BILO STO stvarno primijenilo
  // nije "u cekanju", inace bi jedna prazna stavka sakrila stvaran jaz drugoga.
  for (const id of auto) awaiting.delete(id);
  for (const id of assisted) awaiting.delete(id);

  const targeted = [...auto, ...assisted].sort();
  const resolved = targeted.filter((id) => isResolvedCheck(afterById.get(id)));
  const unresolved = targeted.filter((id) => !isResolvedCheck(afterById.get(id)));
  // `awaiting` se iskljucuje i odavde: takav nalaz NIJE izvan granice popravka (alat ga zna
  // popraviti cim covjek odabere), pa bi ga `manualOnly` krivo prikazao kao rucni posao.
  const manualOnly = [...beforeById.entries()]
    .filter(([id, check]) => isFailingCheck(check) && !auto.has(id) && !assisted.has(id) && !awaiting.has(id))
    .map(([id]) => id)
    .sort();

  const kind: RepairOutcomeKind = targeted.length === 0
    ? 'nothing-targeted'
    : unresolved.length === 0
      ? 'complete'
      : resolved.length === 0
        ? 'none'
        : 'partial';

  return {
    kind,
    targeted,
    resolved,
    unresolved,
    autoUnresolved: [...auto].filter((id) => !isResolvedCheck(afterById.get(id))).sort(),
    assistedUnresolved: [...assisted].filter((id) => !isResolvedCheck(afterById.get(id))).sort(),
    awaitingConfirmation: [...awaiting].filter((id) => !isResolvedCheck(afterById.get(id))).sort(),
    manualOnly,
    unmappedMatchKeys: [...unmapped].sort(),
  };
}

/** Ishod izrecen recenicom, bez ijednog DOM poziva. */
export interface RepairOutcomeCopy {
  /** Podebljani uvod ("Djelomicno popravljeno.") */
  headline: string;
  /** Ostatak recenice; moze biti prazan. */
  detail: string;
}

/** "nalaz / nalaza" - da recenica o ishodu ne bude gramaticki nakaradna. */
function plNalaz(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  return d === 1 && dd !== 11 ? 'nalaz' : 'nalaza';
}

/**
 * Tekst ishoda za sucelje. Zivi UZ izracun, a ne u dva prikaza, jer prikaz ishoda popravka
 * postoji dvaput (lokalni panel u `repair-panel.ts` i serverski put u `app.ts`) i njihovo
 * razilazenje je vec zabiljezeno kao ponavljajuci kvar. Ovako se mogu razici najvise u
 * omotu (HTML), nikad u brojkama ni u tvrdnji.
 *
 * `null` znaci da se nema sto reci (nije bilo nijedne ciljane provjere koja je prije padala).
 */
export function describeRepairOutcome(outcome: RepairOutcome | null): RepairOutcomeCopy | null {
  if (!outcome || outcome.kind === 'nothing-targeted') return null;
  const total = outcome.targeted.length;
  const done = outcome.resolved.length;
  if (outcome.kind === 'complete') {
    return {
      headline: 'Popravljeno u cijelosti.',
      detail: ` Razriješeno je svih ${total} ${plNalaz(total)} koje je automatski popravak ciljao.`,
    };
  }
  const rest: string[] = [];
  if (outcome.autoUnresolved.length) rest.push(`${outcome.autoUnresolved.length} nije uspjelo automatski`);
  if (outcome.assistedUnresolved.length) rest.push(`${outcome.assistedUnresolved.length} traži tvoju potvrdu ili ručnu izmjenu`);
  const restText = rest.length ? ` Od preostalih: ${rest.join(', ')}.` : '';
  const manual = outcome.manualOnly.length
    ? ` Još ${outcome.manualOnly.length} ${plNalaz(outcome.manualOnly.length)} traži ručnu izmjenu (izvan automatskog popravka).`
    : '';
  return outcome.kind === 'none'
    ? {
        headline: 'Nijedan ciljani nalaz nije razriješen.',
        detail: ` Popravak je primijenjen, ali ${total} ${plNalaz(total)} koje je ciljao i dalje stoji.${restText}${manual}`,
      }
    : {
        headline: 'Djelomično popravljeno.',
        detail: ` Razriješeno ${done} od ${total} ciljanih nalaza.${restText}${manual}`,
      };
}
