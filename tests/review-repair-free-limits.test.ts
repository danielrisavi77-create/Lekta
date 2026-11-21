// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractRepairFreeLimitDefaults, formatReport } from '../scripts/review-repair-free-limits.mjs';

const REPAIR_SOURCE = readFileSync(
  resolve(process.cwd(), 'supabase/functions/repair-docx/index.ts'),
  'utf8',
);

describe('free repair limits review', () => {
  it('reads defaults and scopes from the repair function source', () => {
    const limits = extractRepairFreeLimitDefaults(REPAIR_SOURCE);

    expect(limits).toEqual([
      {
        name: 'REPAIR_FREE_MODE',
        value: 'isključen osim ako je vrijednost točno true',
        scope: 'Uključuje besplatni put popravka',
      },
      {
        name: 'REPAIR_FREE_DAILY_CAP',
        value: 10,
        scope: 'statusi free i repair_failed po korisniku u pomičnom prozoru od 24 sata',
      },
      {
        name: 'REPAIR_FREE_IP_DAILY_CAP',
        value: 40,
        scope: 'statusi free i repair_failed po IP adresi u pomičnom prozoru od 24 sata',
      },
      {
        name: 'REPAIR_UNCOUNTED_DAILY_CAP',
        value: 30,
        scope: 'ishodi bez potrošnje kvote po korisniku u pomičnom prozoru od 24 sata',
      },
    ]);
  });

  it('fails closed if a limit moves or its environment expression changes', () => {
    const sourceWithoutIpCap = REPAIR_SOURCE.replace(
      "const FREE_IP_DAILY_CAP = Number(Deno.env.get('REPAIR_FREE_IP_DAILY_CAP') ?? '40');",
      '',
    );

    expect(() => extractRepairFreeLimitDefaults(sourceWithoutIpCap)).toThrow('REPAIR_FREE_IP_DAILY_CAP');
  });

  it('labels the report as code defaults and does not claim live values', () => {
    const report = formatReport(extractRepairFreeLimitDefaults(REPAIR_SOURCE));

    expect(report).toContain('a ne žive Supabase vrijednosti');
    expect(report).toContain('Skripta ne čita tajne');
    expect(report).toContain('REPAIR_FREE_DAILY_CAP: 10');
  });
});
