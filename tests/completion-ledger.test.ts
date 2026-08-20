/**
 * Gard za completion ledger (docs/generated/completion-ledger.json), P0-3 u
 * docs/PLAN_POTPUNA_POKRIVENOST.md.
 *
 * Ledger je jedini artefakt koji odgovara na pitanje "je li MOJ studij, MOJA vrsta rada dokazano
 * pokrivena i do koje razine". Zato ga cuvaju DVIJE vrste tvrdnji:
 *   1. drift: commitani izlaz === svjezi izracun (kad padne: `npm run completion-ledger`);
 *   2. postenje: nijedan redak ne smije tvrditi vise nego sto njegove osi dokazuju.
 *
 * Druga skupina je vaznija. Drift gard hvata zastarjelost, ali ne bi uhvatio da netko olabavi
 * ljestvicu i tiho promakne 400 profila u razinu B.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import { computeWorklist } from '../src/verification/worklist';
import {
  buildCompletionLedger,
  CLAIM_LADDER,
  type LedgerInputs,
  type CompletionLedger,
} from '../src/verification/completion-ledger';
import baked from '../docs/generated/completion-ledger.json';
import type { ThesisProfile, SourceEntry } from '../src/profiles/profile-schema';

const readJson = <T>(rel: string): T =>
  JSON.parse(readFileSync(resolve(process.cwd(), rel), 'utf8')) as T;

const profiles = [
  ...VERIFIED_PROFILES_WITH_DRAFTS,
  ...LEGAL_DEPARTMENTS_WITH_DRAFTS,
] as unknown as ThesisProfile[];

const inputs: LedgerInputs = {
  registryProfiles: profiles.map((p) => ({
    id: p.id,
    unitId: (p as unknown as { unitId?: string }).unitId ?? null,
    workTypes: (p as unknown as { workTypes?: string[] }).workTypes ?? [],
  })),
  faculties: readJson<{ faculties: LedgerInputs['faculties'] }>('docs/generated/faculty-matrix.json').faculties,
  coverageCells: readJson<{ cells: LedgerInputs['coverageCells'] }>('data/coverage/scored-coverage.json').cells,
  worklistRows: computeWorklist(profiles, SOURCE_REGISTRY as SourceEntry[]).rows,
  repairRows: readJson<{ rows: LedgerInputs['repairRows'] }>('docs/generated/repair-coverage.json').rows,
  programs: readJson<{ programs: LedgerInputs['programs'] }>('data/programs/program-registry.json').programs,
  titleTemplates: readJson<LedgerInputs['titleTemplates']>('data/title-pages/templates-index.json'),
  citationSpecs: readJson<LedgerInputs['citationSpecs']>('data/tools/citation-specs/verified-index.json'),
  declarations: readJson<LedgerInputs['declarations']>('data/declarations/declarations.json'),
  closedLoop: readJson<{ rows: NonNullable<LedgerInputs['closedLoop']> }>('docs/generated/closed-loop.json').rows,
};

const fresh = buildCompletionLedger(inputs);

describe('completion ledger: drift', () => {
  it('commitani izlaz === svjezi izracun (inace: npm run completion-ledger)', () => {
    expect(fresh).toEqual(baked as unknown as CompletionLedger);
  });

  it('pokriva svaki registrirani profil, sa retkom po vrsti rada', () => {
    expect(fresh.summary.profileCount).toBe(profiles.length);
    expect(fresh.summary.rowCount).toBeGreaterThanOrEqual(fresh.summary.profileCount);
  });
});

describe('completion ledger: nijedan redak ne tvrdi vise nego sto dokazuje', () => {
  it('A i B traze ljudski potvrdjena pravila, fakultetski popravak I dokaz na dokumentu', () => {
    for (const row of fresh.rows) {
      if (row.claim !== 'A' && row.claim !== 'B') continue;
      expect(row.rules, `${row.profileId}: razina ${row.claim} bez potpuno verificiranih pravila`).toBe('verified');
      expect(row.repair, `${row.profileId}: razina ${row.claim} bez fakultetskog popravka`).toBe('faculty-specific');
      expect(
        row.claim === 'A' ? 'real-docx-pass' : 'synthetic-pass',
        `${row.profileId}: razina ${row.claim} s dokazom ${row.proof}`,
      ).toBe(row.proof);
    }
  });

  it('samo razina A smije biti bez ijednog razloga blokade', () => {
    for (const row of fresh.rows) {
      if (row.claim === 'A') expect(row.blockedReasons).toEqual([]);
      else expect(row.blockedReasons.length, `${row.profileId} (${row.claim}) nema razlog`).toBeGreaterThan(0);
    }
  });

  it('bulk-pending pravila nikad ne dosezu A ni B', () => {
    for (const row of fresh.rows) {
      if (row.rules === 'bulk-pending') expect(['C', 'D', 'E']).toContain(row.claim);
    }
  });

  it('E znaci doista nula bodovanih pravila, a ne samo slab dokaz', () => {
    for (const row of fresh.rows) {
      if (row.claim === 'E') expect(row.evidence.scoredTotal).toBe(0);
      if (row.evidence.scoredTotal > 0) expect(row.claim).not.toBe('E');
    }
  });

  it('zbirna os pomocnog sadrzaja je NAJSLABIJI clan svoje tri podosi', () => {
    const order = ['exact-official', 'exact-derived', 'reused', 'generic', 'unknown'];
    for (const row of fresh.rows) {
      const worst = Math.max(
        order.indexOf(row.assetDetail.titlePage),
        order.indexOf(row.assetDetail.citation),
        order.indexOf(row.assetDetail.declaration),
      );
      expect(row.assets).toBe(order[worst]);
    }
  });

  it('svaka razina ljestvice ima formulaciju koju smijemo pokazati', () => {
    for (const row of fresh.rows) expect(CLAIM_LADDER[row.claim]).toBeTruthy();
  });
});

describe('completion ledger: nacionalna tvrdnja', () => {
  /**
   * Ovo je poanta cijelog audita pretvorena u test. Dokle god ijedan redak nije na A ili B, ili
   * postoji program bez evidencije, tvrdnja "Lekta provjerava i popravlja svaki akademski rad u
   * Hrvatskoj" je NO-GO. Test NE trazi da blokatora nema (danas ih ima); trazi da su IMENOVANI,
   * pa se stanje ne moze predstaviti kao dovrseno.
   */
  it('blokatori nacionalne tvrdnje su izvedeni iz osi, ne prepricani', () => {
    const s = fresh.summary;
    const unproven = s.byClaim.C + s.byClaim.D + s.byClaim.E;
    expect(s.programGaps).toBe(fresh.rows.filter((r) => r.program === 'missing').length);
    if (s.programGaps > 0 || unproven > 0 || s.programsWithoutProfile.length > 0) {
      expect(s.nationalClaimBlockers.length).toBeGreaterThan(0);
    } else {
      expect(s.nationalClaimBlockers).toEqual([]);
    }
  });

  it('nijedan redak jos nema program iz sluzbenog Upisnika (faza P1 nije izvedena)', () => {
    // Kad P1 zavrsi, ovaj test se mijenja u suprotnu tvrdnju. Dok traje, cuva da nitko ne oznaci
    // program `official` bez stvarne sinkronizacije s Upisnikom.
    expect(fresh.summary.byProgram.official).toBe(0);
  });

  it('zatecena tri evidentirana programa bez profila ostaju vidljiva', () => {
    expect(fresh.summary.programsWithoutProfile).toHaveLength(3);
    expect(fresh.summary.programsWithoutProfile.join(' ')).toContain('Vojno vođenje');
  });
});
