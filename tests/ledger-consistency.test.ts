/**
 * Lagani guard (AUD-44): broj zapisa u data/manifest.json za VERIFICATION_LEDGER
 * mora se slagati sa stvarnim brojem zapisa u data/verification/ledger.json.
 *
 * Drift je prije bio tih (manifest je tvrdio 2736, ledger ih stvarno ima 3119) jer ga
 * nijedan test nije provjeravao: verification-gate.test.ts asertira manifest broj samo za
 * SOURCE_REGISTRY, a data-loaders.test.ts ledger uopce ne dira. Ovaj test lomi check na
 * svakom buducem drifu, isto kao sto SOURCE_REGISTRY vec ima svoj count-assert.
 */
import { describe, it, expect } from 'vitest';

import manifest from '../data/manifest.json';
import ledger from '../data/verification/ledger.json';

describe('manifest <-> ledger konzistentnost (AUD-44)', () => {
  it('VERIFICATION_LEDGER broj u manifestu = stvarni broj zapisa u ledgeru', () => {
    const row = manifest.find((m) => m.name === 'VERIFICATION_LEDGER');
    expect(row, 'manifest nema zapis za VERIFICATION_LEDGER').toBeTruthy();
    expect(Array.isArray(ledger)).toBe(true);
    expect((ledger as unknown[]).length).toBe(row!.entries);
  });
});
