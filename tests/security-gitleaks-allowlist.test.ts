import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const PUBLIC_OR_SYNTHETIC_FINDINGS = [
  'lekta-prod-2026-01',
  '5cd252fb0ce8932436faf8ccd1040981b89ee4ad6b9fe9e2a2b7e71aacb27cd3',
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEaxfR8uEsQkf4vOblY6RA8ncDfYEt6zOg9KE5RdiYwpZP40Li_hp_m47n60p8D54WK84zV2sxXs7LtkBoN79R9Q',
  '__79_Pv6-fj39vX08_Lx8O_u7ezr6uno5-bl5OPi4eA',
  'pi_123_secret_abc',
] as const;

describe('gitleaks allowlist za repair release fixturu', () => {
  const workflow = readFileSync(
    join(import.meta.dirname, '..', '.github', 'workflows', 'security-audit.yml'),
    'utf8',
  );

  it.each(PUBLIC_OR_SYNTHETIC_FINDINGS)(
    'dopusta samo tocno adjudicirani javni ili sinteticni literal %s',
    (literal) => {
      expect(workflow).toContain(`'''${literal}'''`);
    },
  );

  it('ne izuzima testne putanje ni privatni PKCS8 format', () => {
    const paths = workflow.match(/paths = \[([\s\S]*?)\]/)?.[1] ?? '';

    expect(paths).not.toMatch(/tests/i);
    expect(workflow).not.toContain("'''MIGHAgEAMBMGByqGSM49");
  });

  it('allowlista naziv localStorage kljuca lekta.orders.v1 kao literal, ne putanju', () => {
    expect(workflow).toContain("'''lekta\\.orders\\.v1'''");

    const regexesBlock = workflow.match(/regexes = \[([\s\S]*?)\n\s*\]/)?.[1] ?? '';
    const pathsBlock = workflow.match(/paths = \[([\s\S]*?)\n\s*\]/)?.[1] ?? '';

    expect(regexesBlock).toContain('lekta\\.orders\\.v1');
    expect(pathsBlock).not.toContain('lekta.orders.v1');
  });

  it('regex za lekta.orders.v1 iz konfiguracije pogadja tocan literal, ne slicne varijante', () => {
    const raw = workflow.match(/'''(lekta\\\.orders\\\.v1)'''/)?.[1];
    expect(raw).toBeDefined();

    const pattern = new RegExp(raw as string);

    expect(pattern.test('lekta.orders.v1')).toBe(true);
    expect(pattern.test('lekta.ordersXv1')).toBe(false);
  });
});
