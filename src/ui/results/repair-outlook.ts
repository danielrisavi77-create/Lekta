import { classifyFixability, classifyFixabilityById, type Fixability } from '../../analysis/check-fixer-map';
import { repairCeiling, type RepairCeilingItem } from '../result-readiness';
import type { Check } from '../../scoring/checks';

/**
 * PRIJE POPRAVKA: sto automatika smije obecati, i sto ostaje tebi.
 *
 * Gumb "Simuliraj popravak" dosad je samo skrolao do panela. Prava simulacija ocjene NE
 * POSTOJI i ne smije se izmisliti: fixer moze zakazati, vrata integriteta mogu odbiti paket,
 * a ponovna analiza je jedini dokaz ishoda (`detectPassRegressions` se izvodi PRIJE nego
 * sucelje preporuci preuzimanje). Zato se ovdje prikazuje samo ono sto je DETERMINISTICKO.
 *
 * STROP JE GORNJA GRANICA, NE PREDVIDJANJE. `repairCeiling` oduzima iskljucivo bodove
 * izgubljene na provjerama razreda `manual`, dakle racuna kao da SVE strojno popravljivo bude
 * popravljeno. To ukljucuje i razred `assisted`, koji trazi tvoju izricitu potvrdu. Zato se
 * asistirane broje ODVOJENO: bez te razlike strop bi tiho obecavao ishod koji ovisi o
 * korisnikovim odlukama koje jos nisu donesene.
 *
 * Sto se NIKAD ne prikazuje: procijenjena ocjena nakon odabranih popravaka. To bi bila
 * projekcija bez determinisicke podloge, a analiza to izricito uvjetuje.
 */

export interface RepairOutlookCounts {
  /** Popravlja se bez ijedne tvoje odluke. */
  auto: number;
  /** Popravljivo, ali trazi izricitu potvrdu. */
  assisted: number;
  /** Samo ti; automatika ovo ne smije dirati. */
  manual: number;
}

export type RepairOutlookModel =
  | { kind: 'unavailable'; reason: string }
  | {
      kind: 'available';
      currentScore: number | null;
      /** Najvise sto automatika moze doseci AKO sve strojno popravljivo uspije. Gornja granica. */
      ceilingScore: number;
      /** ceilingScore - currentScore, kad su oba poznata. Nikad "ocekivana ocjena". */
      headroom: number | null;
      counts: RepairOutlookCounts;
      /** Imenovan popis onoga sto automatika ne smije dirati, s izgubljenim bodovima. */
      manualItems: RepairCeilingItem[];
      /** Koliko je stavki predodabrano kad korisnik samo klikne Popravi. */
      preselected: number;
      /** Strop je dosegnut: automatika vise nema sto ponuditi. */
      atCeiling: boolean;
    };

function fixabilityOf(check: Check): Fixability {
  return (check.id ? classifyFixabilityById(check.id) : classifyFixability(check.title)).fixability;
}

/**
 * @param checks       provjere iz TRENUTNE analize
 * @param score        tekuca ocjena (null kad profil nije bodovan)
 * @param preselected  broj stavki koje `buildDefaultRepairRequests` predodabire
 */
export function buildRepairOutlook(
  checks: readonly Check[] | undefined,
  score: number | null | undefined,
  preselected: number,
): RepairOutlookModel {
  const all = Array.isArray(checks) ? checks : [];
  const scored = all.filter((check) => check.scored && check.max > 0);
  if (!scored.length) {
    return { kind: 'unavailable', reason: 'Ovaj profil nema bodovanih provjera, pa se strop popravka ne moze izracunati.' };
  }

  // Broje se samo provjere koje NISU prosle: prosla provjera nema sto popraviti, pa bi ulazila
  // u brojku kao lazna prilika.
  const open = scored.filter((check) => check.status !== 'pass');
  const counts: RepairOutlookCounts = { auto: 0, assisted: 0, manual: 0 };
  for (const check of open) counts[fixabilityOf(check)] += 1;

  const ceiling = repairCeiling(all);
  const currentScore = typeof score === 'number' && Number.isFinite(score) ? Math.round(score) : null;
  const headroom = currentScore === null ? null : Math.max(0, ceiling.maxScore - currentScore);

  return {
    kind: 'available',
    currentScore,
    ceilingScore: ceiling.maxScore,
    headroom,
    counts,
    manualItems: ceiling.items,
    preselected: Number.isFinite(preselected) && preselected > 0 ? Math.floor(preselected) : 0,
    atCeiling: currentScore !== null && currentScore >= ceiling.maxScore,
  };
}
