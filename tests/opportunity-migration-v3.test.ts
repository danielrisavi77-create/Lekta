import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '..', 'supabase/migrations/0206_opportunity_report_v3.sql'),
  'utf8',
);

describe('Opportunity Report V3 migration', () => {
  it('win_v3 cita prethodni win CTE i m cita win_v3, bez samoreferencije', () => {
    const winV3 = SQL.match(/win_v3 as \([\s\S]*?\n  \),\n  m as \(/)?.[0] ?? '';
    expect(winV3).toContain('from win w');
    expect(winV3).not.toContain('from win_v3 w');

    const m = SQL.match(/m as \([\s\S]*?\n  \),\n  shaped as \(/)?.[0] ?? '';
    expect(m).toContain('from win_v3 w');
  });

  it('repair parity pocinje tek od prvog V3 summary eventa u prozoru', () => {
    expect(SQL).toContain("min(e.created_at)");
    expect(SQL).toContain("e.event = 'repair_noop_summary'");
    expect(SQL).toContain('coalesce(w.repair_noop_parity_from, w.t)');
    expect(SQL).toContain('coalesce(repair_noop_parity_from, t)');
  });

  it('T64 ostaje eksplicitno missing dok inspectionCoverage nije implementiran', () => {
    expect(SQL).toContain("'missingSignals', jsonb_build_array('inspection_coverage_global')");
  });
});
