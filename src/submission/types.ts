// src/submission/types.ts

/**
 * Trag auto-provjere (AI visestruka provjera kroz 3 razlicite lece:
 * ekstrakcija, adversarijalno osporavanje, unakrsna/sanity provjera).
 * NE zamjenjuje `confirmed` (ljudska potvrda, zlatni standard) nego je
 * odvojen i iskreno oznacen: auto-provjeren rok smije ici live, ali UI
 * pokazuje da jos ceka zavrsnu rucnu potvrdu.
 */
export interface DeadlineVerification {
  autoVerified: boolean;
  passes: number; // broj leca koje su se slozile (ciljano 3)
  checkedAt: string; // ISO YYYY-MM-DD
  sources: string[]; // URL-ovi / identifikatori dokumenata koristeni u provjeri
  note?: string; // sazetak provjere ili zabiljezeno neslaganje
}

export interface AcademicDeadlineEntry {
  facultyId: string;
  programId?: string | null;
  workType: string;
  academicYear: string;
  deadlineDate: string; // ISO YYYY-MM-DD
  source: string;
  fetchedAt: string; // ISO YYYY-MM-DD
  confirmed: boolean; // ljudska potvrda protiv sluzbenog izvora (zlatni standard)
  verification?: DeadlineVerification | null; // auto-provjera; ide live ali oznaceno
}
