import type { Check, Issue } from '../scoring/checks';
import { classifyFixability, classifyFixabilityById } from '../analysis/check-fixer-map';

export type ResultReadinessKind = 'blocked' | 'needs-work' | 'manual-review' | 'clear';

export interface ResultReadiness {
  kind: ResultReadinessKind;
  label: string;
  description: string;
  blockers: number;
  improvements: number;
  manualReviews: number;
  /**
   * Stoji li iza nalaza VERIFICIRAN sluzbeni izvor fakulteta.
   *
   * `false` ne znaci da je nalaz pogresan, nego da za njega nemamo potvrdjeno fakultetsko pravilo
   * (genericki profil ili profil u istrazivanju), pa se ne smije zvati "blokatorom".
   */
  authoritative: boolean;
}

/** Autoritet pravila iza rezultata; isti izvor koji `ruleConfidence` u report.ts vec cita. */
export interface ReadinessAuthority {
  /** `profile.statusKey` ('verified' | 'partial' | 'research' | 'generic'). */
  profileStatus?: string | null;
  /** `details.ruleAuthority` ('official-source' | 'official-source-with-currency-caveat' | 'generic'). */
  ruleAuthority?: string | null;
}

/**
 * Smije li se nalaz nad ovim profilom nazvati blokatorom.
 *
 * Do 2026-08-16 je `resultReadiness` primao SAMO `Issue[]` i brojao severity, pa je upozorenje iz
 * generickog fallbacka davalo isti verdikt "Nije spremno za predaju" kao prekrsaj verificiranog
 * pravila fakulteta. Autoritet je pritom vec postojao u podacima (`details.ruleAuthority`,
 * `profileStatus`), ali je zivio izolirano u placenom izvjestaju (report.ts `ruleConfidence`).
 */
function isAuthoritative(authority?: ReadinessAuthority): boolean {
  if (!authority) return true; // stariji pozivatelj bez podatka: zadrzi zatecenu formulaciju
  if (authority.profileStatus != null && authority.profileStatus !== 'verified') return false;
  return authority.ruleAuthority !== 'generic';
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
}

/**
 * Spremnost za predaju nije isto sto i tehnicka ocjena. Ova projekcija namjerno
 * cita samo vec postojeci rezultat analize i ne mijenja bodovanje ni parser.
 */
export function resultReadiness(issues: readonly Issue[] = [], authority?: ReadinessAuthority): ResultReadiness {
  const blockers = issues.filter((item) => item.severity === 'error').length;
  const improvements = issues.filter((item) => item.severity === 'warning').length;
  const manualReviews = issues.filter((item) => item.severity !== 'error' && item.severity !== 'warning').length;
  const authoritative = isAuthoritative(authority);
  const counts = { blockers, improvements, manualReviews, authoritative };

  if (blockers > 0) {
    // "Blokator" je tvrdnja o fakultetovom pravilu, ne o nasoj heuristici. Bez verificiranog izvora
    // ista se cinjenica iznosi kao odstupanje koje treba provjeriti, jer nemamo cime tvrditi vise.
    return authoritative
      ? {
          kind: 'blocked',
          label: 'Nije spremno za predaju',
          description: `Pronađen je ${blockers} ${plural(blockers, 'blokator', 'blokatora', 'blokatora')}. Tehnička ocjena ne potvrđuje spremnost za predaju.`,
          ...counts,
        }
      : {
          kind: 'blocked',
          label: 'Provjeri prije predaje',
          description: `Pronađeno je ${blockers} ${plural(blockers, 'moguće odstupanje', 'moguća odstupanja', 'mogućih odstupanja')}. Za ovaj profil pravila nisu potvrđena prema službenom izvoru, pa ovo nije nalaz o pravilu tvog fakulteta nego opća tehnička provjera.`,
          ...counts,
        };
  }
  if (improvements > 0) {
    return {
      kind: 'needs-work',
      label: authoritative ? 'Treba doraditi prije predaje' : 'Provjeri prije predaje',
      description: authoritative
        ? `Pronađeno je ${improvements} ${plural(improvements, 'dorada', 'dorade', 'dorada')}. Tehnička ocjena ne zamjenjuje završnu ručnu provjeru.`
        : `Pronađeno je ${improvements} ${plural(improvements, 'moguće odstupanje', 'moguća odstupanja', 'mogućih odstupanja')}. Za ovaj profil pravila nisu potvrđena prema službenom izvoru, pa provjeri i s uputama svojeg studija.`,
      ...counts,
    };
  }
  if (manualReviews > 0) {
    return {
      kind: 'manual-review',
      label: 'Potrebna je ručna provjera',
      description: `Nema automatskih blokatora, ali ostale su ${manualReviews} ${plural(manualReviews, 'ručna provjera', 'ručne provjere', 'ručnih provjera')}.`,
      ...counts,
    };
  }
  return {
    kind: 'clear',
    label: 'Nema automatskih blokatora',
    description: authoritative
      ? 'Automatska provjera nije pronašla otvoreni blokator. Mentorove i posebne upute i dalje imaju prednost.'
      : 'Opća tehnička provjera nije pronašla otvoreno odstupanje. Pravila ovog profila nisu potvrđena prema službenom izvoru, pa upute studija i mentora imaju prednost.',
    ...counts,
  };
}

/** Jedna bodovana provjera koju automatski popravak strukturno ne smije dirati (sadrzajna prosudba). */
export interface RepairCeilingItem {
  title: string;
  lostPoints: number;
}

export interface RepairCeiling {
  /** Ima li provjera koje ostaju otvorene JER zahtijevaju rucnu (sadrzajnu) provjeru. */
  hasManualGap: boolean;
  /** Maksimalna ocjena koju automatski popravak realno moze jamciti za ovaj dokument
   *  (100 kad nema manualnog jaza; inace manje, srazmjerno bodovima izgubljenim na manualnim
   *  provjerama). Nije profilno svojstvo - racuna se iz TRENUTNOG stanja provjera. */
  maxScore: number;
  items: RepairCeilingItem[];
}

/**
 * Zasto ocjena nakon popravka ne mora biti 100: neke bodovane provjere (npr. tocnost citata,
 * potpunost popisa literature, sadrzaj naslova tablica) zahtijevaju sadrzajnu prosudbu koju
 * alat namjerno ne smije automatski mijenjati (vidi classifyFixability - 'manual'). Ova
 * projekcija racuna koliko je to realno najvise sto automatski popravak moze jamciti, da se
 * to jasno komunicira korisniku umjesto da "97" izgleda kao nedovrsen posao.
 */
export function repairCeiling(checks: readonly Check[] = []): RepairCeiling {
  const scored = checks.filter((c) => c.scored && c.max > 0);
  const totalMax = scored.reduce((sum, c) => sum + c.max, 0);
  const manual = scored.filter(
    (c) => c.status !== 'pass' && (c.id ? classifyFixabilityById(c.id) : classifyFixability(c.title)).fixability === 'manual',
  );
  const lostPoints = manual.reduce((sum, c) => sum + (c.max - c.earned), 0);
  const maxScore = totalMax > 0 ? Math.round(((totalMax - lostPoints) / totalMax) * 100) : 100;
  return {
    hasManualGap: manual.length > 0,
    maxScore,
    items: manual.map((c) => ({ title: c.title, lostPoints: c.max - c.earned })),
  };
}
