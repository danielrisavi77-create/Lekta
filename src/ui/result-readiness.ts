import type { Check, Issue } from '../scoring/checks';
import { classifyFixability } from '../analysis/check-fixer-map';

export type ResultReadinessKind = 'blocked' | 'needs-work' | 'manual-review' | 'clear';

export interface ResultReadiness {
  kind: ResultReadinessKind;
  label: string;
  description: string;
  blockers: number;
  improvements: number;
  manualReviews: number;
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
export function resultReadiness(issues: readonly Issue[] = []): ResultReadiness {
  const blockers = issues.filter((item) => item.severity === 'error').length;
  const improvements = issues.filter((item) => item.severity === 'warning').length;
  const manualReviews = issues.filter((item) => item.severity !== 'error' && item.severity !== 'warning').length;

  if (blockers > 0) {
    return {
      kind: 'blocked',
      label: 'Nije spremno za predaju',
      description: `Pronađen je ${blockers} ${plural(blockers, 'blokator', 'blokatora', 'blokatora')}. Tehnička ocjena ne potvrđuje spremnost za predaju.`,
      blockers,
      improvements,
      manualReviews,
    };
  }
  if (improvements > 0) {
    return {
      kind: 'needs-work',
      label: 'Treba doraditi prije predaje',
      description: `Pronađeno je ${improvements} ${plural(improvements, 'dorada', 'dorade', 'dorada')}. Tehnička ocjena ne zamjenjuje završnu ručnu provjeru.`,
      blockers,
      improvements,
      manualReviews,
    };
  }
  if (manualReviews > 0) {
    return {
      kind: 'manual-review',
      label: 'Potrebna je ručna provjera',
      description: `Nema automatskih blokatora, ali ostale su ${manualReviews} ${plural(manualReviews, 'ručna provjera', 'ručne provjere', 'ručnih provjera')}.`,
      blockers,
      improvements,
      manualReviews,
    };
  }
  return {
    kind: 'clear',
    label: 'Nema automatskih blokatora',
    description: 'Automatska provjera nije pronašla otvoreni blokator. Mentorove i posebne upute i dalje imaju prednost.',
    blockers,
    improvements,
    manualReviews,
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
  const manual = scored.filter((c) => c.status !== 'pass' && classifyFixability(c.id || c.title).fixability === 'manual');
  const lostPoints = manual.reduce((sum, c) => sum + (c.max - c.earned), 0);
  const maxScore = totalMax > 0 ? Math.round(((totalMax - lostPoints) / totalMax) * 100) : 100;
  return {
    hasManualGap: manual.length > 0,
    maxScore,
    items: manual.map((c) => ({ title: c.title, lostPoints: c.max - c.earned })),
  };
}
