/**
 * DOSEZNI STROP: koliko je bodova na stolu, po razinama.
 *
 * Kljucna razlika prema `repairCeiling`: taj odgovara na jedno usko pitanje (koju ocjenu
 * automatika jamci), a ovaj daje rastav sada / sigurno automatski / uz potvrdu / maksimum, uz
 * imenovan popis onoga sto maksimum drzi ispod 100.
 *
 * Najvazniji test ovdje je onaj o SPOSOBNOSTI NASPRAM DOSTUPNOSTI: strop se racuna iz stvarno
 * ponudjenih stavki, ne iz `FIXER_CAPABILITIES`. Fixer koji zna popraviti provjeru, ali za ovaj
 * dokument nije ponudjen (nedostaje profilno pravilo, nema kandidata), NE SMIJE podici obecanje.
 */
import { describe, it, expect } from 'vitest';
import { reachableCeiling, type OfferedRepairItem } from '../src/ui/result-readiness';
import { makeCheck, type Check } from '../src/scoring/checks';

const check = (title: string, earned: number, max: number): Check =>
  makeCheck('formatting', title, earned === max ? 'pass' : 'fail', earned, max, '');

const item = (fixerId: string, over: Partial<OfferedRepairItem> = {}): OfferedRepairItem => ({ fixerId, ...over });

describe('reachableCeiling: razine', () => {
  it('sve zatvoreno bez pitanja: sve cetiri brojke su 100', () => {
    const checks = [check('Margine dokumenta', 0, 6), check('Dominantni font', 8, 8)];
    const out = reachableCeiling(checks, [item('margins-fixer')])!;
    expect(out.current).toBe(57); // 8 od 14
    expect(out.safeAuto).toBe(100);
    expect(out.confirmed).toBe(100);
    expect(out.blockers).toEqual([]);
  });

  it('stavka koja trazi potvrdu ne ulazi u safeAuto, nego tek u confirmed', () => {
    const checks = [check('Margine dokumenta', 0, 6), check('Elementi naslovne stranice', 0, 4)];
    const out = reachableCeiling(checks, [item('margins-fixer'), item('title-page-fixer', { requiresConfirmation: true })])!;
    expect(out.current).toBe(0);
    expect(out.safeAuto).toBe(60); // samo margine
    expect(out.confirmed).toBe(100);
    expect(out.maximum).toBe(out.confirmed);
  });

  it('preporuceno (opt-in) je takodjer tek na razini potvrde', () => {
    const checks = [check('Margine dokumenta', 0, 6)];
    const out = reachableCeiling(checks, [item('margins-fixer', { recommended: true })])!;
    expect(out.safeAuto).toBe(0);
    expect(out.confirmed).toBe(100);
  });
});

describe('reachableCeiling: sposobnost nije dostupnost', () => {
  it('fixer koji ZNA popraviti, ali NIJE ponudjen, ne podize strop', () => {
    // element-caption-fixer pokriva element.table.caption, ali trazi profilno pravilo koje ima
    // 3 od 368 profila. Bez ponudjene stavke ti bodovi nisu na stolu.
    const checks = [check('Naslovi tablica', 0, 5)];
    const out = reachableCeiling(checks, [])!;
    expect(out.safeAuto).toBe(0);
    expect(out.confirmed).toBe(0);
    expect(out.blockers).toEqual([
      { id: 'element.table.caption', title: 'Naslovi tablica', gain: 5, reason: 'not-offered' },
    ]);
  });

  it('ista provjera S ponudjenom stavkom ide u razinu, ne u blokatore', () => {
    const checks = [check('Naslovi tablica', 0, 5)];
    const out = reachableCeiling(checks, [item('element-caption-fixer', { requiresConfirmation: true })])!;
    expect(out.confirmed).toBe(100);
    expect(out.blockers).toEqual([]);
  });
});

describe('reachableCeiling: blokatori', () => {
  it('sadrzajna prosudba se oznacava kao author-required, ne kao propust ponude', () => {
    const checks = [check('Profilni opseg riječi', 0, 5)];
    const out = reachableCeiling(checks, [])!;
    expect(out.blockers[0].reason).toBe('author-required');
  });

  it('poredani su po velicini jaza (najveci prvi)', () => {
    const checks = [check('Ključne riječi u samom radu', 0, 3), check('Profilni opseg riječi', 0, 5)];
    const out = reachableCeiling(checks, [])!;
    expect(out.blockers.map((b) => b.gain)).toEqual([5, 3]);
  });
});

describe('reachableCeiling: invarijante', () => {
  const scenarios: Array<{ name: string; checks: Check[]; offered: OfferedRepairItem[] }> = [
    { name: 'prazan', checks: [check('Margine dokumenta', 6, 6)], offered: [] },
    { name: 'mjesovit', checks: [check('Margine dokumenta', 0, 6), check('Elementi naslovne stranice', 2, 4), check('Profilni opseg riječi', 1, 5)], offered: [item('margins-fixer'), item('title-page-fixer', { requiresConfirmation: true })] },
    { name: 'sve blokirano', checks: [check('Profilni opseg riječi', 0, 5)], offered: [] },
  ];

  it('current <= safeAuto <= confirmed = maximum', () => {
    for (const s of scenarios) {
      const out = reachableCeiling(s.checks, s.offered)!;
      expect(out.current, s.name).toBeLessThanOrEqual(out.safeAuto);
      expect(out.safeAuto, s.name).toBeLessThanOrEqual(out.confirmed);
      expect(out.maximum, s.name).toBe(out.confirmed);
    }
  });

  it('blokatori zatvaraju TOCNO razliku do 100 (nijedan bod se ne gubi iz racuna)', () => {
    for (const s of scenarios) {
      const out = reachableCeiling(s.checks, s.offered)!;
      const totalMax = s.checks.reduce((sum, c) => sum + c.max, 0);
      const blocked = out.blockers.reduce((sum, b) => sum + b.gain, 0);
      expect(Math.round(((totalMax - blocked) / totalMax) * 100), s.name).toBe(out.maximum);
    }
  });

  it('profil bez bodovanih provjera nema strop', () => {
    expect(reachableCeiling([makeCheck('formatting', 'Dominantni font', 'pass', 0, 0, '')], [])).toBeNull();
    expect(reachableCeiling([], [])).toBeNull();
  });
});
