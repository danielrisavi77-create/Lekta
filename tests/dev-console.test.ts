import { describe, it, expect } from 'vitest';
// @ts-expect-error .mjs bez tipova (isti obrazac kao ostali scripts/* helperi)
import { resolveDevTools } from '../scripts/dev-console.mjs';

// routes-02: interna QA/verifikacijska konzola smjela je procuriti u dist/ na hostu bez DEPLOY=1.
// Ovaj test zakljucava safe-by-default: build je bez alata osim uz eksplicitni DEV_CONSOLE=1;
// dev server uvijek ima alate; DEPLOY vise NIJE relevantan za tu odluku.

describe('resolveDevTools (routes-02 safe-by-default)', () => {
  it('dev server uvijek ima alate', () => {
    expect(resolveDevTools('serve', {})).toBe(true);
    expect(resolveDevTools('serve', { DEV_CONSOLE: '1' })).toBe(true);
  });

  it('produkcijski build je safe-by-default (bez alata)', () => {
    expect(resolveDevTools('build', {})).toBe(false);
    expect(resolveDevTools('build', { DEPLOY: '1' })).toBe(false); // DEPLOY vise nije relevantan
    expect(resolveDevTools('build', { NODE_ENV: 'production' })).toBe(false);
  });

  it('build ukljucuje alate samo uz eksplicitni DEV_CONSOLE=1', () => {
    expect(resolveDevTools('build', { DEV_CONSOLE: '1' })).toBe(true);
  });
});
