// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { opportunityMeasurementHealth } from '../src/admin/opportunity-ranking';
import type { OpportunityBucket } from '../src/admin/admin-types';
import { opportunitySqlScopeProblems } from './helpers/opportunity-wiring';

const SQL = readFileSync(
  join(__dirname, '..', 'supabase/migrations/0208_opportunity_report_v3.sql'),
  'utf8',
);

type Ev = [event: string, data: Record<string, unknown>, hoursAgo: number];

/** Stvarno izvrsava 0208 nad minimalnom analytics_events tablicom i vraca current bucket. */
async function current(events: Ev[]): Promise<OpportunityBucket> {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;
      create table public.analytics_events (
        id bigint generated always as identity primary key,
        event text not null,
        data jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
    `);
    await db.exec(SQL);
    for (const [event, data, hoursAgo] of events) {
      await db.query(
        `insert into public.analytics_events (event, data, created_at)
         values ($1, $2::jsonb, now() - make_interval(hours => $3))`,
        [event, JSON.stringify(data), hoursAgo],
      );
    }
    const res = await db.query<{ j: { current: OpportunityBucket } }>(
      `select public.admin_opportunity_stats(now() - interval '1 day', now()) as j`,
    );
    return res.rows[0].j.current;
  } finally {
    await db.close();
  }
}

const A = { profileId: 'A', workType: 'diplomski' };
const B = { profileId: 'B', workType: 'diplomski' };

describe('Opportunity Report V3 migracija 0208 (izvrsena u PGlite)', () => {
  it('staticki obuhvat: V3 repair od globalne epohe, ostalo od pocetka prozora, bez samoreferencije', () => {
    expect(opportunitySqlScopeProblems(SQL)).toEqual([]);
  });

  it('zdrav prozor: ukupna i scoped parity se slazu', async () => {
    const b = await current([
      ['analysis_completed', {}, 2],
      ['opportunity_summary', { ...A, structureGaps: 2 }, 2],
      ['analysis_structure_gap', { ...A, category: 'typography', kind: 'other', count: 2 }, 2],
      ['repair_result_ok', A, 1],
      ['repair_noop_summary', { ...A, count: 1 }, 1],
      ['repair_noop_reason', { ...A, kind: 'already-ok', count: 1 }, 1],
    ]);
    expect(b.scopeParityMismatches).toEqual([]);
    expect(b.repairAttemptEvents).toBe(1);
    expect(opportunityMeasurementHealth(b).kind).toBe('healthy');
  });

  it('V3-01: isti ukupni zbroj s krivim profilom je partial', async () => {
    const b = await current([
      ['analysis_completed', {}, 2],
      ['opportunity_summary', { ...A, structureGaps: 1 }, 2],
      ['analysis_structure_gap', { ...B, category: 'typography', kind: 'other', count: 1 }, 2],
      ['repair_result_ok', A, 1],
      ['repair_noop_summary', { ...A, count: 1 }, 1],
      ['repair_noop_reason', { ...B, kind: 'no-target', count: 1 }, 1],
    ]);
    expect(b.structureGapItems).toBe(b.structureBreakdownItems);
    expect(b.repairNoOpSummaryItems).toBe(b.repairNoOpItems);
    expect(b.scopeParityMismatches.map((m) => `${m.surface}:${m.profileId}`).sort()).toEqual([
      'repair_noop_items:A', 'repair_noop_items:B', 'structure:A', 'structure:B',
    ]);
    expect(opportunityMeasurementHealth(b).kind).toBe('partial');
  });

  it('V3-02: uspjesan repair bez summaryja u prozoru je partial, i kad je epoha ranije', async () => {
    const b = await current([
      // Epoha: prvi V3 dogadjaj ikad, izvan trenutnog prozora.
      ['repair_result_ok', A, 40],
      ['repair_noop_summary', { ...A, count: 0 }, 40],
      ['analysis_completed', {}, 2],
      ['opportunity_summary', { ...A, structureGaps: 0 }, 2],
      ['repair_completed', { count: 1, total: 1, kind: 'recommended' }, 1],
      ['repair_result_ok', A, 1],
    ]);
    expect(b.repairAttemptEvents).toBe(1);
    expect(b.repairNoOpSummaryEvents).toBe(0);
    expect(opportunityMeasurementHealth(b)).toMatchObject({ kind: 'partial', repair: 'partial', repairAttemptDelta: -1 });
  });

  it('prije V3 epohe stari V2 repair_noop_reason ne stvara lazni partial', async () => {
    const b = await current([
      ['repair_noop_reason', { kind: 'already-ok', count: 3 }, 5],
      ['repair_result_ok', A, 1],
      ['repair_noop_summary', { ...A, count: 0 }, 1],
    ]);
    expect(b.repairNoOpItems).toBe(0);
    expect(b.repairNoOpReasons).toEqual([]);
    expect(opportunityMeasurementHealth(b).repair).toBe('healthy');
  });

  it('V3-03: repair-only prozor s count=0 nema analiticki signal ni stopu', async () => {
    const b = await current([
      ['repair_result_ok', A, 1],
      ['repair_noop_summary', { ...A, count: 0 }, 1],
    ]);
    const health = opportunityMeasurementHealth(b);
    expect(health).toMatchObject({ analysis: 'no-data', repair: 'healthy' });
    expect(b.opportunities.every((row) => row.ratePct === null)).toBe(true);
  });

  it('T64 ostaje eksplicitno missing dok inspectionCoverage nije implementiran', () => {
    expect(SQL).toContain("'missingSignals', jsonb_build_array('inspection_coverage_global')");
  });

  it('izvrsavanje ostaje samo za service_role', () => {
    expect(SQL).toContain('revoke all on function admin_opportunity_stats(timestamptz, timestamptz) from public, anon, authenticated;');
    expect(SQL).toContain('grant execute on function admin_opportunity_stats(timestamptz, timestamptz) to service_role;');
  });
});
