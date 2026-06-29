import type { ThesisProfile } from './profile-schema';
import { compileProfile } from './rule-compiler';

/**
 * Tanak loader profila. Faza 2: hidrira tipizirani data/** u registar profila i
 * kompilira effectiveRules. Zasad samo prolaz kroz rule-compiler nad danim profilima.
 */
export function loadProfiles(raw: ThesisProfile[]) {
  return raw.map((profile) => compileProfile(profile));
}
