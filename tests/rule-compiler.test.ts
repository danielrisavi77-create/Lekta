import { describe, it, expect } from 'vitest';
import { compileEffectiveRules, collectCompileDiagnostics } from '../src/profiles/rule-compiler';
import type { ThesisProfile } from '../src/profiles/profile-schema';

import rawVerified from '../data/profiles/verified-profiles.json';
import rawLegal from '../data/profiles/legal-departments.json';

describe('rule-compiler faithfulness', () => {
  it('effectiveRules deep-equals rules kada nema ruleEntries', () => {
    const profile: ThesisProfile = {
      id: 'fpzg-politologija-diplomski',
      rules: {
        font: ['Times New Roman'],
        size: [12],
        spacing: 1.5,
        requireToc: true,
        requirePageNumbers: true,
      },
      ruleEntries: [],
    };
    expect(compileEffectiveRules(profile)).toEqual(profile.rules);
  });

  it('podprovjere numeriranja imaju svoj checkId, ne samo zastavicu u rules', () => {
    // Do 2026-08-24 su `checkTitlePageNumberSuppression` i `checkPageNumberStartAtIntro` postojali
    // u motoru (3 boda svaki) i u zastiti od demotije, ali ih autorski sloj nije mogao izraziti, pa
    // se odredba "naslovnu stranicu (...) ne numerirati" morala upisivati ravno u `rules`, mimo
    // lanca provenijencije. Ovaj test cuva mapiranje: bez njega kompajler vraca diagnostic i
    // pravilo se TIHO ne primijeni.
    const profile: ThesisProfile = {
      id: 'demo-pn',
      rules: { requirePageNumbers: true },
      ruleEntries: [
        { ruleId: 'r-sup', checkId: 'page-number-title-suppression', value: true },
        { ruleId: 'r-intro', checkId: 'page-number-start-at-intro', value: true },
      ],
    };
    expect(compileEffectiveRules(profile)).toEqual({
      requirePageNumbers: true,
      checkTitlePageNumberSuppression: true,
      checkPageNumberStartAtIntro: true,
    });
    expect(collectCompileDiagnostics([profile])).toEqual([]);
  });

  it('poravnanje fusnota ima svoj checkId, odvojen od poravnanja tijela', () => {
    // `justify` i `footnote-justify` su DVIJE osi iz dvije razlicite odredbe: hks propisuje
    // "tekst mora biti obostrano poravnan" za tijelo i, u zasebnoj natuknici o biljeskama,
    // "prored jednostruk s obostranim poravnanjem". Bez vlastitog checkId-a druga se nije mogla
    // zapisati, pa je odredba postojala u izvoru a nije se provjeravala.
    const profile: ThesisProfile = {
      id: 'demo-fj',
      rules: { justify: true },
      ruleEntries: [{ ruleId: 'r-fj', checkId: 'footnote-justify', value: true }],
    };
    expect(compileEffectiveRules(profile)).toEqual({ justify: true, footnoteJustify: true });
    expect(collectCompileDiagnostics([profile])).toEqual([]);
  });

  it('overlay-a prepoznati ruleEntry preko baseline rules', () => {
    const profile: ThesisProfile = {
      id: 'demo',
      rules: { font: ['Arial'], size: [11] },
      ruleEntries: [
        { ruleId: 'r-font', checkId: 'font', value: ['Times New Roman'] },
        { ruleId: 'r-words', checkId: 'word-count', value: { min: 10000, max: 12000 } },
      ],
    };
    expect(compileEffectiveRules(profile)).toEqual({
      font: ['Times New Roman'],
      size: [11],
      wordMin: 10000,
      wordMax: 12000,
    });
  });

  it('mapira pravne checkId-jeve (fusnote i naslovi) u effectiveRules', () => {
    const profile: ThesisProfile = {
      id: 'pravo-demo',
      rules: { footnoteFont: ['Arial'], footnoteSize: [9], footnoteSpacing: 1.5 },
      ruleEntries: [
        { ruleId: 'r-ff', checkId: 'footnote-font', value: ['Times New Roman'] },
        { ruleId: 'r-fs', checkId: 'footnote-size', value: [10] },
        { ruleId: 'r-fsp', checkId: 'footnote-spacing', value: 1 },
        { ruleId: 'r-hr', checkId: 'heading-rules', value: { size: 12, maxLevel: 3 } },
      ],
    };
    expect(compileEffectiveRules(profile)).toEqual({
      footnoteFont: ['Times New Roman'],
      footnoteSize: [10],
      footnoteSpacing: 1,
      headingRules: { size: 12, maxLevel: 3 },
    });
  });

  it('mapira justify (obostrano poravnanje) u effectiveRules.justify', () => {
    const profile: ThesisProfile = {
      id: 'efzg-zavrsni',
      rules: { checkJustify: true },
      ruleEntries: [{ ruleId: 'r-just', checkId: 'justify', value: true }],
    };
    expect(compileEffectiveRules(profile)).toEqual({ checkJustify: true, justify: true });
    expect(collectCompileDiagnostics([profile])).toHaveLength(0);
  });

  it('mapira paper-size: lista/naziv formata -> paperSizes, boolean -> requireA4', () => {
    const projektni: ThesisProfile = {
      id: 'arh-projekt',
      rules: {},
      ruleEntries: [{ ruleId: 'r-ps', checkId: 'paper-size', value: ['A3', 'A0'] }],
    };
    expect(compileEffectiveRules(projektni)).toEqual({ paperSizes: ['A3', 'A0'] });

    const jedan: ThesisProfile = {
      id: 'arh-a3',
      rules: {},
      ruleEntries: [{ ruleId: 'r-ps1', checkId: 'paper-size', value: 'A3' }],
    };
    expect(compileEffectiveRules(jedan)).toEqual({ paperSizes: ['A3'] });

    const standard: ThesisProfile = {
      id: 'tekst-a4',
      rules: {},
      ruleEntries: [{ ruleId: 'r-ps2', checkId: 'paper-size', value: true }],
    };
    expect(compileEffectiveRules(standard)).toEqual({ requireA4: true });
    expect(collectCompileDiagnostics([projektni, jedan, standard])).toHaveLength(0);
  });

  it('prijavljuje diagnostic za nepoznat checkId i ne mijenja rules', () => {
    const profile: ThesisProfile = {
      id: 'demo',
      rules: { font: ['Arial'] },
      ruleEntries: [{ ruleId: 'r-x', checkId: 'nepoznato', value: 42 }],
    };
    const diagnostics = collectCompileDiagnostics([profile]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.ruleId).toBe('r-x');
    expect(compileEffectiveRules(profile)).toEqual({ font: ['Arial'] });
  });
});

/**
 * Option A invarijanta na STVARNIM podacima (CLAUDE.md: "za trenutne podatke effectiveRules
 * deep-equal rules"). Fan-out arhitektura: ruleEntries zive u zasebnim draft fileovima koje
 * ENGINE ne overlaya (idu samo u verifikacijske/coverage poglede), pa registrirani profili
 * nemaju inline ruleEntries i compile mora biti vjeran prolaz kroz rules. Ovaj test to zakljucava
 * za svih 200+ profila: uhvatio bi slucajno uneseni inline ruleEntry koji tiho promijeni ponasanje
 * enginea vs sirovi rules passthrough. Kad zapocne migracija (inline ruleEntry -> brisanje iz rules),
 * ovaj se test prilagodava po CLAUDE.md backlogu 2.
 */
describe('rule-compiler faithfulness na stvarnim registrima', () => {
  const allProfiles = [...rawVerified, ...rawLegal] as unknown as ThesisProfile[];

  it('registar je netrivijalan (guard protiv vacuous-pass)', () => {
    expect(allProfiles.length).toBeGreaterThan(100);
  });

  it('svaki registrirani profil: effectiveRules deep-equals rules', () => {
    for (const profile of allProfiles) {
      expect(compileEffectiveRules(profile), `profil ${profile.id}`).toEqual(profile.rules ?? {});
    }
  });

  it('nijedan registrirani profil ne proizvodi compile-diagnostic (svi checkId-jevi prepoznati)', () => {
    expect(collectCompileDiagnostics(allProfiles)).toHaveLength(0);
  });
});
