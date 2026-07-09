import type { ThesisProfile } from './profile-schema';
import { FIXER_IDS } from '../repair/apply-fixers';

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

    // Repair Engine (REPAIR_ENGINE.md sekcija 3): autoFixable:true je dopusteno SAMO na
    // ljudski verificiranom pravilu (status 'verified') i uz postavljen fixerId. Time
    // nijedno neverificirano ili nemapirano pravilo ne moze pisati u korisnikov docx.
    for (const entry of profile.ruleEntries ?? []) {
      if (entry.autoFixable !== true) continue;
      if (!entry.fixerId) {
        errors.push({
          profileId: profile.id,
          message: `Pravilo ${entry.ruleId}: autoFixable:true bez fixerId-a.`,
        });
      } else if (!(FIXER_IDS as readonly string[]).includes(entry.fixerId)) {
        // Tipfeler u fixerId-u bi u runtimeu tiho preskocio placeni popravak.
        errors.push({
          profileId: profile.id,
          message: `Pravilo ${entry.ruleId}: nepoznat fixerId "${entry.fixerId}" (poznati: ${FIXER_IDS.join(', ')}).`,
        });
      }
      if (entry.status !== 'verified') {
        errors.push({
          profileId: profile.id,
          message: `Pravilo ${entry.ruleId}: autoFixable:true na pravilu koje nije status:"verified" (trenutno: ${entry.status ?? 'bez statusa'}).`,
        });
      }
    }
  }
  return errors;
}
