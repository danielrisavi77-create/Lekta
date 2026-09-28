import type { ThesisProfile } from './profile-schema';
import { FIXER_IDS } from '../repair/apply-fixers';
import { ACADEMIC_YEAR_RE } from './academic-year';
import { schema2ProviderProblems } from '../verification/ai-evidence-audit';

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
    // pravilu u statusu 'verified' i uz postavljen fixerId. AI-verificiran status dodatno
    // mora nositi strukturirani dokaz; njegov sadrzaj neovisno provjerava AI-evidence validator.
    for (const entry of profile.ruleEntries ?? []) {
      if (entry.confirmedVia === 'ai-evidence-audit') {
        if (entry.status !== 'verified') {
          errors.push({
            profileId: profile.id,
            message: `Pravilo ${entry.ruleId}: confirmedVia ai-evidence-audit zahtijeva status:"verified".`,
          });
        }
        if (!entry.aiEvidence) {
          errors.push({
            profileId: profile.id,
            message: `Pravilo ${entry.ruleId}: confirmedVia ai-evidence-audit bez strukturiranog aiEvidence paketa.`,
          });
        } else if (
          (entry.aiEvidence.schemaVersion !== 1 && entry.aiEvidence.schemaVersion !== 2)
          || entry.aiEvidence.profileId !== profile.id
          || entry.aiEvidence.ruleId !== entry.ruleId
          || entry.aiEvidence.sourceId !== entry.sourceId
          || !/^[a-f0-9]{64}$/.test(entry.aiEvidence.snapshotHash)
          || (entry.aiEvidence.schemaVersion === 2 && schema2ProviderProblems(entry.aiEvidence).length > 0)
        ) {
          errors.push({
            profileId: profile.id,
            message: `Pravilo ${entry.ruleId}: aiEvidence ima nevaljan schema version, identitet ili snapshot hash.`,
          });
        }
      } else if (entry.aiEvidence != null) {
        errors.push({
          profileId: profile.id,
          message: `Pravilo ${entry.ruleId}: aiEvidence zahtijeva confirmedVia:"ai-evidence-audit".`,
        });
      }
      // academicYear (opcionalni override): format "2025./2026." i uzastopne godine,
      // inace bi se u UI-ju prikazala besmislena godina verifikacije.
      if (entry.academicYear != null) {
        const m = ACADEMIC_YEAR_RE.test(entry.academicYear);
        const years = entry.academicYear.match(/^(\d{4})\.\/(\d{4})\.$/);
        if (!m || !years || Number(years[2]) !== Number(years[1]) + 1) {
          errors.push({
            profileId: profile.id,
            message: `Pravilo ${entry.ruleId}: academicYear "${entry.academicYear}" nije oblika "2025./2026." s uzastopnim godinama.`,
          });
        }
      }
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
    // recommendedFixerId (neobavezni "preporuceno" popravak za nebodovano pravilo): isti
    // fixerId-tipfeler rizik kao autoFixable, plus zabrana kombiniranja s autoFixable (dvostruko).
    for (const entry of profile.ruleEntries ?? []) {
      if (!entry.recommendedFixerId) continue;
      if (!(FIXER_IDS as readonly string[]).includes(entry.recommendedFixerId)) {
        errors.push({
          profileId: profile.id,
          message: `Pravilo ${entry.ruleId}: nepoznat recommendedFixerId "${entry.recommendedFixerId}" (poznati: ${FIXER_IDS.join(', ')}).`,
        });
      }
      if (entry.autoFixable === true) {
        errors.push({
          profileId: profile.id,
          message: `Pravilo ${entry.ruleId}: recommendedFixerId i autoFixable:true na istom zapisu (odaberi jedno).`,
        });
      }
    }
  }
  return errors;
}
