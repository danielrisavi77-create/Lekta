import type { ThesisProfile } from './profile-schema';

export interface ProfileValidationError {
  profileId: string;
  message: string;
}

/**
 * Strukturna validacija profila. Faza 2: provjera unitId u katalogu, programa,
 * vrsta rada, citatnih stilova i HTTPS izvora (vidi QA konzolu u src/main.ts).
 * Zasad minimalna provjera identiteta.
 */
export function validateProfiles(profiles: ThesisProfile[]): ProfileValidationError[] {
  const errors: ProfileValidationError[] = [];
  const seen = new Set<string>();
  for (const profile of profiles) {
    if (!profile.id) {
      errors.push({ profileId: '(bez id-a)', message: 'Profil nema id.' });
      continue;
    }
    if (seen.has(profile.id)) {
      errors.push({ profileId: profile.id, message: 'Duplikat id-a profila.' });
    }
    seen.add(profile.id);
  }
  return errors;
}
