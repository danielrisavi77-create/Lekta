import { describe, it, expect } from 'vitest';
import { applyScoredAdvisory, DEMOTABLE_CHECK_IDS } from '../src/profiles/advisory-demotion';
import { draftRuleEntriesFor } from '../src/profiles/drafts-runtime';
import { SOURCE_REGISTRY } from '../src/verification/verification-registry';
import type { SourceEntry } from '../src/profiles/profile-schema';

const SOURCES = SOURCE_REGISTRY as SourceEntry[];
// Sve dimenzije koje engine tvrdo boduje, kao svjez profil prije demotiona.
const freshBase = () => ({
  checkFont: true, checkSize: true, checkSpacing: true, checkMargins: true,
  checkJustify: true, requireA4: true, requireToc: true, requirePageNumbers: true,
} as Record<string, any>);

describe('applyScoredAdvisory: boduje samo verificirani scored skup', () => {
  it('AGR diplomski (scored = toc, page-numbers): sve ostale dimenzije demotirane u informativne', () => {
    const base = freshBase();
    const demoted = applyScoredAdvisory(base, { id: 'agr-diplomski' }, draftRuleEntriesFor('agr-diplomski'), SOURCES);
    // toc i page-numbers ostaju tvrdo bodovani; ostalo demotirano.
    expect([...demoted].sort()).toEqual(['font', 'font-size', 'justify', 'line-spacing', 'margins', 'paper-size']);
    expect(base.requireToc).toBe(true);
    expect(base.requirePageNumbers).toBe(true);
    // Demotirane dimenzije: flag ugasen -> analyzeDocx ih renderira kao informativne (max 0).
    expect(base.checkSize).toBe(false);
    expect(base.checkMargins).toBe(false);
    expect(base.requireA4).toBe(false);
    expect(base.advisoryDimensions).toEqual(demoted);
  });

  it('AGR doktorski (scored = imperativne Postavke stranice): oblikovanje ostaje bodovano', () => {
    const base = freshBase();
    const demoted = applyScoredAdvisory(base, { id: 'agr-doktorski' }, draftRuleEntriesFor('agr-doktorski'), SOURCES);
    // scored ukljucuje font-size, line-spacing, margins, paper-size, toc, page-numbers -> ostaju tvrdi.
    expect([...demoted].sort()).toEqual(['font', 'justify']);
    expect(base.checkSize).toBe(true);
    expect(base.checkSpacing).toBe(true);
    expect(base.checkMargins).toBe(true);
    expect(base.requireA4).toBe(true);
    expect(base.checkFont).toBe(false);
    expect(base.checkJustify).toBe(false);
  });

  it('neverificiran profil (bez ruleEntries): ne dira se nista', () => {
    const base = freshBase();
    const demoted = applyScoredAdvisory(base, { id: 'nepostojeci-profil' }, [], SOURCES);
    expect(demoted).toEqual([]);
    expect(base.checkFont).toBe(true);
    expect(base.requireA4).toBe(true);
    expect(base.advisoryDimensions).toBeUndefined();
  });

  it('demotira samo poznate strojno provjerljive dimenzije', () => {
    expect(DEMOTABLE_CHECK_IDS).toEqual(
      ['font', 'font-size', 'line-spacing', 'margins', 'justify', 'paper-size', 'toc', 'page-numbers'],
    );
  });
});
