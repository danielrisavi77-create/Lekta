/**
 * Provjereni ishod popravka: sto je RIJESENO, a ne sto je IZVRSENO (plan T10).
 *
 * `summarizeRepairOutcome` (repair-outcome.ts) opisuje stavke zahvata (primijenjeno, rucno, ceka potvrdu).
 * Ovaj modul odgovara na drugo pitanje: od provjera koje je korisnik ODABRAO popraviti, koje nakon ponovne
 * analize stvarno prolaze. Ulaz je stvarno stanje provjera prije i poslije te zapis izvrsenja; uspjeh se
 * NIKAD ne izvodi iz porasta ocjene.
 *
 * Pravila:
 *  - rijeseno: odabrana provjera koja je prije bila `fail`, a poslije je `pass`;
 *  - nerijeseno: odabrana provjera koja poslije NIJE `pass` (fail, unmeasurable ili je nema); neizmjereno
 *    nikad nije rjesenje;
 *  - preskoceno: zahvat koji motor nije mogao primijeniti (`skippedCheckIds`), zasebno od nerijesenog jer
 *    razlog nije u dokumentu nego u nepodrzanoj strukturi;
 *  - regresija: SVAKA ranije prolazna provjera koja je poslije `fail`, ukljucujuci one izvan odabranog skupa;
 *  - integritet se prenosi kao zaseban status i nikad ne mijesa s brojevima gore.
 *
 * Broj prikazanih zahvata i broj provjera NISU ista velicina: jedan zahvat cilja vise provjera, pa se
 * ovdje broje provjere, a adapter u sucelju vezuje zahvate na provjere koje trebaju rijesiti.
 */

import { checksById, isFailingCheck, summarizeRepairOutcome, type OutcomeCheckLike, type OutcomeItemLike } from './repair-outcome';
import { stableCheckId } from '../scoring/check-id-registry';

export interface VerifiedCheck {
  id: string;
  status: 'pass' | 'fail' | 'unmeasurable';
}

export type RepairIntegrity = 'passed' | 'failed' | 'not-verified';

export interface RepairOutcomeInput {
  selectedCheckIds: string[];
  before: VerifiedCheck[];
  after: VerifiedCheck[];
  skippedCheckIds: string[];
  integrity: RepairIntegrity;
}

export interface VerifiedRepairOutcome {
  resolvedIds: string[];
  unresolvedIds: string[];
  skippedIds: string[];
  regressedIds: string[];
  integrity: RepairIntegrity;
  /** Smije li se popravljena kopija preporuciti kao glavna: bez regresije i s prolaznim integritetom. */
  recommendRepairedCopy: boolean;
}

function byId(checks: VerifiedCheck[]): Map<string, VerifiedCheck['status']> {
  const map = new Map<string, VerifiedCheck['status']>();
  for (const c of checks) map.set(c.id, c.status);
  return map;
}

export function buildRepairOutcome(input: RepairOutcomeInput): VerifiedRepairOutcome {
  const before = byId(input.before);
  const after = byId(input.after);
  const skipped = new Set(input.skippedCheckIds);
  const selected = [...new Set(input.selectedCheckIds)];

  const resolvedIds: string[] = [];
  const unresolvedIds: string[] = [];
  const skippedIds: string[] = [];
  for (const id of selected) {
    if (skipped.has(id)) { skippedIds.push(id); continue; }
    const was = before.get(id);
    const now = after.get(id);
    if (was === 'fail' && now === 'pass') resolvedIds.push(id);
    else if (was === 'pass' && now === 'pass') continue; // nije bilo sto rijesiti; ne broji se ni kao uspjeh
    else unresolvedIds.push(id); // fail, unmeasurable ili nema mjerenja: nije rijeseno
  }
  const regressedIds: string[] = [];
  for (const [id, was] of before) {
    if (was === 'pass' && after.get(id) === 'fail') regressedIds.push(id);
  }
  const sort = (xs: string[]) => [...xs].sort();
  return {
    resolvedIds: sort(resolvedIds),
    unresolvedIds: sort(unresolvedIds),
    skippedIds: sort(skippedIds),
    regressedIds: sort(regressedIds),
    integrity: input.integrity,
    recommendRepairedCopy: input.integrity === 'passed' && regressedIds.length === 0,
  };
}

/**
 * ADAPTER NA POSTOJECE OBLIKE (T10). Ulaz su iste provjere `before`/`after` i iste odabrane stavke koje vec koristi
 * `summarizeRepairOutcome`; ovdje se samo prevode u ugovor `RepairOutcomeInput`:
 *  - provjera je `pass` kad je razrijesena (earned >= max), `fail` kad je bodovana i pada, `unmeasurable` kad to sama
 *    kaze (`status === 'unmeasurable'`) ili je nema u novoj analizi;
 *  - `selectedCheckIds` su CILJANE provjere (padale prije i meta su odabranog zahvata), ne broj zahvata;
 *  - `skippedCheckIds` su provjere koje gadja zahvat koji je motor PRESKOCIO (`result.skipped` po `ruleId`).
 * Time se "zahvat izvrsen" (changelog) i "problem rijesen" (ova funkcija) racunaju odvojeno, kako plan trazi.
 */
export interface VerifiedOutcomeSource {
  before: readonly OutcomeCheckLike[];
  after: readonly OutcomeCheckLike[] | null;
  selected: readonly (OutcomeItemLike & { ruleId?: string })[];
  skippedRuleIds: readonly string[];
  integrity: RepairIntegrity;
}

export function verifiedCheckOf(check: OutcomeCheckLike | undefined, id: string): VerifiedCheck {
  if (!check || check.status === 'unmeasurable') return { id, status: 'unmeasurable' };
  return { id, status: isFailingCheck(check) ? 'fail' : 'pass' };
}

export function verifiedOutcomeFrom(src: VerifiedOutcomeSource): VerifiedRepairOutcome {
  const beforeById = checksById(src.before);
  const afterById = src.after ? checksById(src.after) : new Map<string, OutcomeCheckLike>();
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
  const before = [...ids].map((id) => verifiedCheckOf(beforeById.get(id), id));
  // Bez nove analize nista nije IZMJERENO: sve je `unmeasurable`, pa nista ne moze biti "rijeseno".
  const after = src.after ? [...ids].map((id) => verifiedCheckOf(afterById.get(id), id)) : [...ids].map((id) => ({ id, status: 'unmeasurable' as const }));
  const targeted = summarizeRepairOutcome({ before: src.before, after: src.after ?? [], selected: src.selected }).targeted;
  const skipped = new Set(src.skippedRuleIds);
  const skippedCheckIds: string[] = [];
  for (const item of src.selected) {
    if (!item.ruleId || !skipped.has(item.ruleId)) continue;
    for (const title of item.matchKeys ?? []) {
      const id = stableCheckId(title);
      if (id && targeted.includes(id)) skippedCheckIds.push(id);
    }
  }
  return buildRepairOutcome({
    selectedCheckIds: targeted,
    before,
    after,
    skippedCheckIds,
    integrity: src.after ? src.integrity : (src.integrity === 'failed' ? 'failed' : 'not-verified'),
  });
}
