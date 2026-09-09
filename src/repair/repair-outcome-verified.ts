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
