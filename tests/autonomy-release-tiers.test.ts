/**
 * Predlozak autonomnog kontrolera trazi iste obvezne razine kao dokaz izdanja.
 * Vidi `tests/helpers/autonomy-release-tiers.ts` za razlog; mutacija je u `tests/gate-mutations.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { requiredTierIds } from '../scripts/release-tiers.mjs';
import { requiredTiersDrift } from './helpers/autonomy-release-tiers';

describe('config/autonomy.example.json requiredReleaseTiers', () => {
  it('jednak je requiredTierIds() iz scripts/release-tiers.mjs', () => {
    const text = readFileSync(resolve(process.cwd(), 'config/autonomy.example.json'), 'utf8');
    const parsed = JSON.parse(text) as { requiredReleaseTiers: string[] };
    expect(parsed.requiredReleaseTiers).toEqual(requiredTierIds());
    expect(requiredTiersDrift(text, requiredTierIds())).toEqual([]);
    // Izravni signal T62: bez ovih razina kontroler bi promovirao kandidata bez Word korpusa i TOC-a.
    expect(parsed.requiredReleaseTiers).toEqual(expect.arrayContaining(['word-corpus', 'word-toc']));
  });
});
