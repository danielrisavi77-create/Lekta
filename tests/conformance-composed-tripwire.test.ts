/**
 * Brzi tripwire za SLOZENI (zivi) profil u redovnom `npm run check`; puna uzorkovana matrica je
 * u tests/conformance/composed.test.ts (samo `npm run conformance`).
 *
 * Dva slucaja, oba iz razloga: jedan profil s demotijom (dokazuje da analiza nad slozenim profilom
 * zavrsava i da demotirana dimenzija ne javlja lazan 'pass' uz izgubljene bodove) i jedan s
 * overlayem katedre (jedini sloj koji u pravila UNOSI nove zahtjeve, umjesto da ih gasi).
 */
import { describe, it } from 'vitest';
import { departmentCases, demotionSampleCases, expectComposedConformance } from './helpers/conformance';

const withDemotion = demotionSampleCases().find((c) => c.profileId === 'fpzg-politologija-zavrsni')
  || demotionSampleCases()[0];
const withDepartment = departmentCases()[0];

describe('slozeni profil tripwire (uzorak u check)', () => {
  it(`demotija: ${withDemotion.id}`, () => expectComposedConformance(withDemotion), 30000);
  it(`katedra: ${withDepartment.id}`, () => expectComposedConformance(withDepartment), 30000);
});
