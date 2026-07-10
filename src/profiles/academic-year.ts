// Akademska godina verifikacije pravila. POSTENA formulacija: izvodimo "u kojoj je
// akademskoj godini pravilo verificirano" iz datuma verifikacije (lastVerified /
// verifiedAt / documentDate), NE tvrdimo "za koju godinu pravilo vrijedi" (to izvor
// cesto ne kaze i ne smijemo nagadjati, CLAUDE.md). Eksplicitno polje academicYear
// na RuleEntry ima prednost kad je godina rucno potvrdjena iz samog izvora.
//
// Granica akademske godine: 1. listopada (1.10.2025. - 30.9.2026. = "2025./2026.").

import type { RuleEntry, VerifiedProfile } from './profile-schema';

export const ACADEMIC_YEAR_RE = /^\d{4}\.\/\d{4}\.$/;

/** "2025./2026." iz ISO datuma; null za prazan/nevaljan ulaz. */
export function academicYearFromDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12
  return month >= 10 ? `${y}./${y + 1}.` : `${y - 1}./${y}.`;
}

/**
 * Efektivna akademska godina verifikacije za pravilo: eksplicitni override na pravilu,
 * inace izvod iz datuma verifikacije pravila, pa profila (verifiedAt, documentDate).
 * Derivacija znaci da 600+ postojecih JSON-ova ne treba rucno uredjivati.
 */
export function effectiveAcademicYear(
  entry: Pick<RuleEntry, 'academicYear' | 'lastVerified'> | null | undefined,
  profile?: Pick<VerifiedProfile, 'verifiedAt' | 'documentDate'> | null,
): string | null {
  if (entry?.academicYear) return entry.academicYear;
  return (
    academicYearFromDate(entry?.lastVerified) ??
    academicYearFromDate(profile?.verifiedAt) ??
    academicYearFromDate(profile?.documentDate)
  );
}
