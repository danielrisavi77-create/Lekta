/**
 * Slozena (ziva) conformance matrica: uskladjen + neuskladjen sintetski docx nad profilom kakav
 * student STVARNO dobije, a ne nad sirovim profilom iz registra.
 *
 * Razlika nije kozmeticka: slaganje (src/profiles/compose-profile.ts) prolazi kroz olaksani
 * baseline, overlay katedre, mentorov override i scored/advisory demotiju, a demotija danas gasi
 * barem jednu bodovanu dimenziju na 383 od 407 profila. Sirova matrica zato dokazuje da engine
 * DETEKTIRA odstupanje, ali ne i da ce ga ocjena mjeriti.
 *
 * Uzorak, ne puna matrica: po jedan profil za svaki razlicit obrazac demotije + sve kombinacije
 * katedre i vrste rada + mentorov override. Profili s istim obrascem prolaze iste grane, pa bi
 * puna slozena matrica udvostrucila CI trosak bez nove informacije. Struktura slaganja (koje
 * dimenzije ostaju bodovane) pokrivena je BEZ analiza u tests/composed-profile.test.ts.
 */
import { describe, it } from 'vitest';
import { composedConformanceCases, expectComposedConformance } from '../helpers/conformance';

const cases = composedConformanceCases();

describe(`slozena conformance matrica (${cases.length} slucajeva)`, () => {
  for (const c of cases) {
    it(c.id, () => expectComposedConformance(c), 30000);
  }
});
