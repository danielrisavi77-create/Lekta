/**
 * Naplatne vrste rada na SERVERSKOJ strani (Monetizacija V1, M2).
 *
 * `specijalisticki` je od migracije 0207 prodajna vrsta rada (slot_specijalisticki,
 * pass_specijalisticki). Server koji trosi pravo (generate-report, repair-docx) mora je prihvatiti,
 * inace kupljeno pravo nije moguce potrositi (400 bad_request nakon placanja).
 *
 * Namjerno je ODVOJENO od `src/report/pricing.ts`: taj modul dijele klijent i server i hrani
 * izbornik vrste rada, a izbornik i klijentski cjenik pripadaju M3 (zaseban PR). Zato ovdje nema
 * ni cijene ni prozora: cijenu i prozor server cita iz products (price_eur, slot_window_days), a
 * pravo nosi vlastiti snapshot prozora (entitlements.slot_window_days).
 */
import { WORK_TYPE_ORDER, type ReportWorkType } from './pricing.ts';
import { unambiguousMismatch, type WorkTypeSignals } from './work-type-estimate.ts';

/** Vrsta rada koju server prodaje i trosi. Nadskup klijentskog `ReportWorkType`. */
export type BillableWorkType = ReportWorkType | 'specijalisticki';

/** Redoslijed razine (rastuca cijena), isti kao work_type CHECK u 0207. */
export const BILLABLE_WORK_TYPES: readonly BillableWorkType[] = [
  'seminarski', 'zavrsni', 'diplomski', 'specijalisticki', 'doktorski',
];

export function isBillableWorkType(value: unknown): value is BillableWorkType {
  return typeof value === 'string' && (BILLABLE_WORK_TYPES as readonly string[]).includes(value);
}

function isClientWorkType(value: BillableWorkType): value is ReportWorkType {
  return (WORK_TYPE_ORDER as readonly string[]).includes(value);
}

export interface BillableMismatch {
  block: boolean;
  suggestedWorkType?: BillableWorkType;
}

/**
 * PREKIDAC ZA M3 (krug 4). Klijent (izbornik vrste rada, cjenik u src/report/pricing.ts) do M3 ne
 * nudi `specijalisticki`, pa server do tada ne smije NI predlagati NI blokirati prema toj vrsti:
 * odgovor `tier_mismatch` s prijedlogom koji korisnik ne moze odabrati je slijepa ulica, a blokada
 * seminarskog, zavrsnog ili diplomskog zbog specijalisticke naslovnice mijenja ponasanje kakvo je
 * bilo prije M2. Dok je `false`, billableMismatch za cetiri klijentske vrste radi DOSLOVNO kao prije
 * M2 (unambiguousMismatch). M3 ga u istom PR-u koji dodaje specijalisticki u klijent postavlja na
 * `true`; gard tests/monetizacija-v1-potrosnja.test.ts trazi da prekidac i klijent budu uskladjeni.
 * Server i dalje PRIHVACA i trosi specijalisticko pravo (kupljeno se mora moci potrositi).
 */
export const SPECIALIST_TIER_ENABLED = false;

/** Rang vrste rada po razini (isti redoslijed kao BILLABLE_WORK_TYPES). */
function billableRank(wt: BillableWorkType): number {
  return BILLABLE_WORK_TYPES.indexOf(wt);
}

/**
 * Serverska blokada jeftinije vrste rada (WS-2) prosirena na specijalisticki.
 *
 * ODJELJAK 18 (bez fallbacka specijalisticki -> diplomski), SAMO uz `specialistTier` (M3,
 * SPECIALIST_TIER_ENABLED): naslovnica specijalistickog rada (`specialist`) nedvosmisleno kaze
 * specijalisticki, pa se svaka NIZA vrsta (seminarski, zavrsni, diplomski) blokira i predlaze se
 * `specijalisticki`. Bez prekidaca ta se grana preskace i vrijedi ponasanje prije M2. Dijeljeni `work-type-estimate.ts` tu oznaku i
 * dalje mapira na diplomski, jer njime hrani klijentski izbornik bez specijalistickog (M3); zato se
 * pravilo provodi OVDJE, prije nego dijeljena odluka uopce dodje na red. Bez toga je
 * specijalisticki rad trosio jeftiniji diplomski slot i na kupnji i na popravku.
 *
 * Za cetiri klijentske vrste ostatak odluke je DOSLOVNO postojeca `unambiguousMismatch`. Za
 * specijalisticki opseg teksta nema izvedenog raspona (data/work-type-scope.json ga ne pokriva), pa
 * se, po nacelu modula work-type-estimate (fail-open), blokira SAMO nedvosmislen signal: naslovnica
 * doktorskog rada. Kao i dosad, korisnik koji svjesno potvrdi nizu vrstu (`confirmedMismatch`)
 * prolazi; tu odluku donosi pozivatelj.
 */
export function billableMismatch(
  selected: BillableWorkType,
  signals: WorkTypeSignals,
  suggest: (signals: WorkTypeSignals) => ReportWorkType,
  specialistTier: boolean = SPECIALIST_TIER_ENABLED,
): BillableMismatch {
  if (specialistTier && signals.titleMarker === 'specialist' && billableRank(selected) < billableRank('specijalisticki')) {
    return { block: true, suggestedWorkType: 'specijalisticki' };
  }
  if (isClientWorkType(selected)) {
    return unambiguousMismatch(selected, signals) ? { block: true, suggestedWorkType: suggest(signals) } : { block: false };
  }
  return signals.titleMarker === 'doctoral' ? { block: true, suggestedWorkType: 'doktorski' } : { block: false };
}
