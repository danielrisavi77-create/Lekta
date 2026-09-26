/**
 * Zastavica lokalnog popravka (WordReplica) mora biti SIGURNO ISKLJUCENA na lansiranju.
 *
 * Lansiranje ide bez lokalnog popravka (nema code-signing certifikata za runner), pa je jedino sto
 * stoji izmedju korisnika i ponude bas ovaj boolean. Do 2026-09-22 je zivio kao inline izraz u
 * module-scope konstanti Edge funkcije, dakle nedostupan svakom testu. Ovdje je tablica istine, a
 * `tests/repair-local-edge-flag-source.test.ts` dokazuje da Edge funkcija doista zove nju.
 */
import { describe, expect, it } from 'vitest';

import { localRepairFlagEnabled } from '../src/repair/local-runner/feature-flag.ts';

describe('localRepairFlagEnabled', () => {
  it('sve cetiri kombinacije ENABLED x DISABLED', () => {
    expect(localRepairFlagEnabled({})).toBe(false);
    expect(localRepairFlagEnabled({ REPAIR_LOCAL_ENABLED: 'true' })).toBe(true);
    expect(localRepairFlagEnabled({ REPAIR_LOCAL_DISABLED: 'true' })).toBe(false);
    expect(localRepairFlagEnabled({ REPAIR_LOCAL_ENABLED: 'true', REPAIR_LOCAL_DISABLED: 'true' })).toBe(false);
  });

  it('prazne i nedefinirane vrijednosti drze tok iskljucenim', () => {
    expect(localRepairFlagEnabled({ REPAIR_LOCAL_ENABLED: '', REPAIR_LOCAL_DISABLED: '' })).toBe(false);
    expect(localRepairFlagEnabled({ REPAIR_LOCAL_ENABLED: undefined, REPAIR_LOCAL_DISABLED: undefined })).toBe(false);
    expect(localRepairFlagEnabled({ REPAIR_LOCAL_ENABLED: ' true ' })).toBe(false);
  });

  /**
   * Case-sensitivnost je zatecena semantika, ne previd: usporedba je s nizom 'true'. Da se izdvajanje
   * u funkciju tiho pretvorilo u `toLowerCase()`, produkcijska zastavica bi se ukljucila na
   * vrijednost koju danas ignorira, i to bez ijednog crvenog testa.
   */
  it("'TRUE' velikim slovima NE ukljucuje lokalni popravak", () => {
    expect(localRepairFlagEnabled({ REPAIR_LOCAL_ENABLED: 'TRUE' })).toBe(false);
    expect(localRepairFlagEnabled({ REPAIR_LOCAL_ENABLED: 'True' })).toBe(false);
    expect(localRepairFlagEnabled({ REPAIR_LOCAL_ENABLED: '1' })).toBe(false);
    expect(localRepairFlagEnabled({ REPAIR_LOCAL_ENABLED: 'yes' })).toBe(false);
  });

  /** Kill switch ima prednost samo na tocnu vrijednost 'true' (isti obrazac kao REPAIR_DISABLED). */
  it('kill switch gasi tok samo na tocnu vrijednost', () => {
    expect(localRepairFlagEnabled({ REPAIR_LOCAL_ENABLED: 'true', REPAIR_LOCAL_DISABLED: 'TRUE' })).toBe(true);
    expect(localRepairFlagEnabled({ REPAIR_LOCAL_ENABLED: 'true', REPAIR_LOCAL_DISABLED: '1' })).toBe(true);
    expect(localRepairFlagEnabled({ REPAIR_LOCAL_ENABLED: 'true', REPAIR_LOCAL_DISABLED: 'true' })).toBe(false);
  });
});
