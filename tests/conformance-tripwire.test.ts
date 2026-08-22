/**
 * Conformance tripwire u redovnom `npm run check`: po JEDAN profil za svaku instituciju
 * iz kataloga (deterministicki, leksikografski prvi), uskladjen + neuskladjen sintetski
 * docx, asserti izvedeni iz samih pravila profila (tests/helpers/conformance.ts).
 *
 * Puna matrica preko SVIH profila zivi u tests/conformance/ (zaseban `npm run conformance`
 * + .github/workflows/conformance.yml); ovaj uzorak cuva svaki commit bez produljenja gatea.
 * Timeout 30 s po profilu: 2 analize su tipicno <1,5 s, ali sinteticki testovi znaju
 * flakati pod CPU kontencijom (vidi docx-golden konvenciju).
 */
import { describe, it } from 'vitest';
import { expectConformanceCase, tripwireCases } from './helpers/conformance';

describe('conformance tripwire (1 profil po instituciji)', () => {
  for (const c of tripwireCases()) {
    it(c.id, () => expectConformanceCase(c), 30000);
  }
});
