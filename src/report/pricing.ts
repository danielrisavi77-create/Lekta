/**
 * Cjenovni tierovi i prozori slota (MONETIZATION_AND_ANTI_ABUSE.md sekcije 2 i 5).
 *
 * work_type je dio identiteta slota: slot je vezan na (otisak, work_type). Cijenu i
 * dubinu kontrolira server; ovo je dijeljena konfiguracija koju citaju i klijent (paywall)
 * i Edge Function (window i validacija). Iznosi su u EUR (retail cijene s decimalama,
 * uskladene s landing/usporedba/citat stranicama; MoR provider preracunava po valuti).
 */

/** Naplatne vrste rada (cjenovni tierovi). Razliciti od profilskih WorkType oznaka. */
export type ReportWorkType = 'seminarski' | 'zavrsni' | 'diplomski' | 'doktorski';

export interface WorkTypeTier {
  workType: ReportWorkType;
  label: string;
  priceEur: number;
  /** Prozor slota u danima (koliko dugo re-check istog rada ostaje besplatan). */
  windowDays: number;
  /** Doktorski je cesto na upit i individualna pravila. */
  onRequest?: boolean;
}

export const WORK_TYPE_TIERS: Record<ReportWorkType, WorkTypeTier> = {
  seminarski: { workType: 'seminarski', label: 'Seminarski rad', priceEur: 3.99, windowDays: 7 },
  zavrsni: { workType: 'zavrsni', label: 'Zavrsni rad', priceEur: 5.99, windowDays: 7 },
  diplomski: { workType: 'diplomski', label: 'Diplomski rad', priceEur: 9.99, windowDays: 14 },
  doktorski: { workType: 'doktorski', label: 'Doktorski rad', priceEur: 24.99, windowDays: 14 },
};

export function isReportWorkType(value: unknown): value is ReportWorkType {
  return typeof value === 'string' && value in WORK_TYPE_TIERS;
}

/** Tier za naplatnu vrstu rada, ili undefined. */
export function tierFor(workType: string): WorkTypeTier | undefined {
  return isReportWorkType(workType) ? WORK_TYPE_TIERS[workType] : undefined;
}

/** Prozor slota u danima za vrstu rada (default 7 ako je nepoznata). */
export function windowDaysFor(workType: string): number {
  return tierFor(workType)?.windowDays ?? 7;
}
