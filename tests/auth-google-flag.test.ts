/**
 * T102 gard: zastavica prijave Googleom ne smije biti ukljucena kroz netlify.toml dok vlasnik ne
 * odluci, a .env.example je dokumentira kao [klijent] s praznom vrijednoscu. Mutacije su u
 * tests/gate-mutations.test.ts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { googleFlagProblems } from './helpers/google-auth-flag';

describe('T102 zastavica VITE_AUTH_GOOGLE_ENABLED', () => {
  it('netlify.toml je ne postavlja, a .env.example je dokumentira iskljucenu', () => {
    expect(googleFlagProblems(readFileSync('netlify.toml', 'utf8').replace(/\r\n/g, '\n'), readFileSync('.env.example', 'utf8').replace(/\r\n/g, '\n'))).toEqual([]);
  });
});
