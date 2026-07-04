/**
 * Smoke: modul src/ui/app.ts mora se moci EVALUIRATI u okruzenju bez #analyzer DOM-a
 * (init() je ogradjen na dnu modula). Hvata runtime-only greske koje tsc ne vidi:
 * TDZ / cirkularne importe nakon splita monolita i greske u module-level kodu
 * (migracija localStorage, konstante, IIFE). Bez ovoga bi pokvaren import redoslijed
 * prosao check i pao tek u pregledniku.
 */
import { describe, it, expect } from 'vitest';

describe('ui/app modul', () => {
  it('evaluira se bez greske u happy-dom okruzenju bez #analyzer', async () => {
    const mod = await import('../src/ui/app');
    expect(mod).toBeTruthy();
  }, 30000); // velik graf modula (katalog + registri + data JSON-i), transform zna trajati
});
