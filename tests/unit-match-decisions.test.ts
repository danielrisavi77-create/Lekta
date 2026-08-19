/**
 * Gard za ljudske odluke o uparivanju sastavnica (P1-6 u docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * Odluka je autorski sloj: prijedlog stroja se regenerira, odluka ne smije biti pregazena. Test
 * cuva ono sto odluku cini upotrebljivom mjesec dana kasnije - potpis, razlog kad jedinice nema, i
 * vidljivost skupnog odobrenja.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZAGREB_CATALOG } from '../src/catalog/catalog-loader';
import {
  validateDecisions,
  decisionCoverage,
  upsertDecision,
  NO_UNIT_REASONS,
  type DecisionFile,
  type UnitMatchDecision,
} from '../src/programs/unit-match-decisions';
import report from '../docs/generated/upisnik-unit-match.json';

const knownUnitIds = new Set(ZAGREB_CATALOG.flatMap((i) => i.units.map((u) => u.id)));
const knownExecutors = new Set(report.proposals.map((p) => p.executor));

const decision = (over: Partial<UnitMatchDecision> = {}): UnitMatchDecision => ({
  executor: report.proposals[0].executor,
  unitId: [...knownUnitIds][0],
  noUnitReason: null,
  decidedBy: 'Ime Prezime',
  decidedAt: '2026-08-19',
  bulk: false,
  proposed: { unitId: null, confidence: null },
  ...over,
});

describe('odluke o uparivanju: sto se ne smije provuci', () => {
  const base: DecisionFile = { schemaVersion: 1, decisions: [] };

  it('ispravna odluka prolazi', () => {
    const file = upsertDecision(base, decision());
    expect(validateDecisions(file, { knownUnitIds, knownExecutors })).toEqual([]);
  });

  it('odluka bez jedinice mora imati razlog iz zatvorenog skupa', () => {
    const noReason = upsertDecision(base, decision({ unitId: null, noUnitReason: null }));
    expect(validateDecisions(noReason, { knownUnitIds, knownExecutors })[0]).toMatch(/bez razloga/);

    const badReason = upsertDecision(
      base,
      decision({ unitId: null, noUnitReason: 'nismo stigli' as never }),
    );
    expect(validateDecisions(badReason, { knownUnitIds, knownExecutors })[0]).toMatch(/Nepoznat razlog|nepoznat razlog/);
  });

  it('odluka ne smije istovremeno imati jedinicu i razlog zasto je nema', () => {
    const both = upsertDecision(base, decision({ noUnitReason: 'ambiguous' }));
    expect(validateDecisions(both, { knownUnitIds, knownExecutors })[0]).toMatch(/i razlog/);
  });

  it('jedinica mora postojati u katalogu', () => {
    const ghost = upsertDecision(base, decision({ unitId: 'ne-postoji' }));
    expect(validateDecisions(ghost, { knownUnitIds, knownExecutors })[0]).toMatch(/ne postoji u katalogu/);
  });

  /** Izvoditelj preimenovan u Upisniku ne smije tiho zadrzati staru odluku. */
  it('odluka za nepostojeceg izvoditelja se prijavljuje', () => {
    const stale = upsertDecision(base, decision({ executor: 'Nekakvo bivse uciliste' }));
    expect(validateDecisions(stale, { knownUnitIds, knownExecutors })[0]).toMatch(/ne postoji u harvestu/);
  });

  it('odluka uvijek nosi potpis', () => {
    const unsigned = upsertDecision(base, decision({ decidedBy: '  ' }));
    expect(validateDecisions(unsigned, { knownUnitIds, knownExecutors })[0]).toMatch(/nema potpis/);
  });

  it('ponovna odluka za istog izvoditelja zamjenjuje raniju, ne duplicira je', () => {
    const once = upsertDecision(base, decision({ note: 'prva' }));
    const twice = upsertDecision(once, decision({ note: 'druga' }));
    expect(twice.decisions).toHaveLength(1);
    expect(twice.decisions[0].note).toBe('druga');
  });
});

describe('pokrivenost odluka', () => {
  it('broji sto ceka i gdje je covjek odstupio od stroja', () => {
    const withMatch = report.proposals.find((p) => p.match != null)!;
    const file = upsertDecision(
      { schemaVersion: 1, decisions: [] },
      decision({ executor: withMatch.executor, unitId: [...knownUnitIds].find((id) => id !== withMatch.match!.unitId)! }),
    );
    const coverage = decisionCoverage(report.proposals, file);
    expect(coverage.total).toBe(report.proposals.length);
    expect(coverage.decided).toBe(1);
    expect(coverage.pending).toBe(report.proposals.length - 1);
    expect(coverage.overrides, 'odstupanje od prijedloga mora biti vidljivo').toBe(1);
  });

  /**
   * Pouka iz P2-1: worklist je zatekao 38 pravila koja su izgledala potvrdjeno a bila su odobrena
   * skupno. Ako se ta razlika ne zapise u trenutku odluke, kasnije se ne moze rekonstruirati.
   */
  it('skupno odobrenje ostaje vidljivo kao skupno', () => {
    const file = upsertDecision({ schemaVersion: 1, decisions: [] }, decision({ bulk: true }));
    expect(decisionCoverage(report.proposals, file).bulkDecided).toBe(1);
  });
});

describe('commitane odluke (ako postoje)', () => {
  it('prolaze validaciju', () => {
    const path = resolve(process.cwd(), 'data/programs/unit-match-decisions.json');
    if (!existsSync(path)) return; // jos nijedna odluka nije donesena; suite se sam preskace
    const file = JSON.parse(readFileSync(path, 'utf8')) as DecisionFile;
    expect(validateDecisions(file, { knownUnitIds, knownExecutors })).toEqual([]);
    for (const d of file.decisions) {
      if (d.noUnitReason) expect(NO_UNIT_REASONS).toContain(d.noUnitReason);
    }
  });
});
