/**
 * T102 gard: zastavica prijave Googleom ne smije biti ukljucena kroz netlify.toml dok vlasnik ne
 * odluci, a .env.example je dokumentira kao [klijent] s praznom vrijednoscu. Mutacije su u
 * tests/gate-mutations.test.ts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { googleAuthEnabled } from '../src/auth/google-flag';
import { googleFlagProblems } from './helpers/google-auth-flag';

describe('T102 zastavica VITE_AUTH_GOOGLE_ENABLED', () => {
  it('netlify.toml je ne postavlja, a .env.example je dokumentira iskljucenu', () => {
    expect(googleFlagProblems(readFileSync('netlify.toml', 'utf8').replace(/\r\n/g, '\n'), readFileSync('.env.example', 'utf8').replace(/\r\n/g, '\n'))).toEqual([]);
  });

  it.each([
    ['', false],
    ['false', false],
    ['0', false],
    ['true', true],
    ['1', true],
    [' TRUE ', true],
  ])('runtime flag mapira %j u %j', (raw, expected) => {
    expect(googleAuthEnabled({ VITE_AUTH_GOOGLE_ENABLED: raw })).toBe(expected);
  });

  it('legal modal i staticke pravne stranice prate iste opt-in vrijednosti', () => {
    const app = readFileSync('src/ui/app.ts', 'utf8');
    const generator = readFileSync('scripts/generate-legal-pages.mjs', 'utf8');
    expect(app).toContain('googleSignIn:googleAuthEnabled()');
    expect(generator).toContain("const googleSignIn = ['true', '1'].includes(String(buildEnv.VITE_AUTH_GOOGLE_ENABLED ?? '').trim().toLowerCase())");
    expect(generator).toContain('googleSignIn,');
  });
});