import type { Issue } from '../scoring/checks';

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
