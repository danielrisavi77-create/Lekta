/**
 * Drift-guard: landing_usporedba.html hardkodira najavljene cijene (nakon bete) kao literalni
 * tekst, jer statichke marketing stranice nemaju build-time uvoz iz src/report/pricing.ts
 * (WORK_TYPE_TIERS je jedini izvor istine; vidi header komentar tog fajla). Ovaj test ne
 * uklanja duplikaciju, samo je cini vidljivom: ako se WORK_TYPE_TIERS promijeni bez azuriranja
 * stranice, test pada umjesto da stranica tiho ostane netocna.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WORK_TYPE_TIERS } from '../src/report/pricing';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function eurHr(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

describe('cijene na landing_usporedba.html su u skladu s WORK_TYPE_TIERS', () => {
  const html = readFileSync(join(root, 'landing_usporedba.html'), 'utf8');

  it.each(Object.values(WORK_TYPE_TIERS))('$workType: $priceEur EUR spomenuto u stranici', (tier) => {
    expect(html).toContain(`${eurHr(tier.priceEur)} EUR`);
  });
});
