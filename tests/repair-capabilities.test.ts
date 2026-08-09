/**
 * Registar sposobnosti popravka: integritet i dokaz da je strop prestao lagati na nize.
 *
 * `check-fixer-map.ts` je do 2026-08-09 rucno nabrajao naslove i poznavao 14 od 31 fixera. Sve
 * ostalo je padalo u 'manual', pa je `repairCeiling` bodove za koje POSTOJI zivi popravak
 * proglasavao trajno izgubljenima i korisniku obecavao nizi maksimum nego sto je stvaran.
 * Klasifikacija se sada IZVODI iz `FIXER_CAPABILITIES`.
 */
import { describe, it, expect } from 'vitest';
import { FIXER_CAPABILITIES, FIXER_BY_CHECK_ID } from '../src/repair/repair-capabilities';
import { FIXER_IDS } from '../src/repair/apply-fixers';
import { REPAIR_SURFACE } from '../src/repair/repair-surface';
import { CHECK_ID_BY_TITLE, allCheckIds } from '../src/scoring/check-ids';
import { classifyFixability } from '../src/analysis/check-fixer-map';
import { repairCeiling } from '../src/ui/result-readiness';
import { makeCheck } from '../src/scoring/checks';

describe('registar sposobnosti popravka', () => {
  it('pokriva SVAKI registrirani fixer (Record<FixerId> to iznuduje, ovo cuva i od praznog objekta)', () => {
    expect(Object.keys(FIXER_CAPABILITIES).sort()).toEqual([...FIXER_IDS].sort());
  });

  it('rollout status i sposobnost pokrivaju isti skup fixera', () => {
    expect(Object.keys(FIXER_CAPABILITIES).sort()).toEqual(Object.keys(REPAIR_SURFACE).sort());
  });

  it('svaki deklarirani checkId je STVARAN kanonski ID (hvata tipfeler koji bi tiho ugasio popravak)', () => {
    const known = new Set(allCheckIds());
    const unknown: string[] = [];
    for (const [fixerId, cap] of Object.entries(FIXER_CAPABILITIES)) {
      for (const id of cap.checkIds) if (!known.has(id)) unknown.push(`${fixerId} -> ${id}`);
    }
    expect(unknown, `nepoznat checkId: ${unknown.join(', ')}`).toEqual([]);
  });

  it('alternativeOf pokazuje na registriran fixer', () => {
    for (const [fixerId, cap] of Object.entries(FIXER_CAPABILITIES)) {
      if (!cap.alternativeOf) continue;
      expect(FIXER_IDS, `${fixerId}.alternativeOf`).toContain(cap.alternativeOf);
    }
  });

  it('safe-auto pobjedjuje nad confirm kad istu provjeru cilja vise fixera', () => {
    // structure.heading.format cilja i heading-format-fixer (safe-auto) i heading-case-fixer (confirm).
    expect(FIXER_BY_CHECK_ID.get('structure.heading.format')).toEqual({
      fixerId: 'heading-format-fixer',
      mode: 'safe-auto',
    });
  });
});

describe('drift koji je strop lazno spustao je zatvoren', () => {
  // Bas ove provjere imaju ZIVI fixer, a klasificirale su se kao 'manual'. Naslov
  // 'Oblikovanje naslova po razinama' je najjasniji primjer: jedino strukturno pravilo koje
  // ga je moglo uhvatiti trazi /razina naslova/i, a u naslovu pise "naslova po razinama".
  const PRIJE_MANUAL = [
    'structure.heading.format',
    'structure.heading.hierarchy',
    'footnote.format',
    'format.typography.consistency',
    'toc.present',
    'toc.field',
    'title.elements',
    'title.order',
    'reference.completeness',
    'element.source',
    'element.link-form',
  ];

  it('nijedna vise nije "manual"', () => {
    const stillManual = PRIJE_MANUAL.filter((id) => classifyFixability(id).fixability === 'manual');
    expect(stillManual, `jos uvijek manual: ${stillManual.join(', ')}`).toEqual([]);
  });

  it('svaka od njih ima imenovan fixer', () => {
    for (const id of PRIJE_MANUAL) expect(classifyFixability(id).fixId, id).toBeTruthy();
  });

  it('repairCeiling vise ne spusta strop dokumentu kojem je jedini problem oblikovanje naslova', () => {
    const checks = [
      makeCheck('formatting', 'Dominantni font', 'pass', 8, 8, ''),
      makeCheck('structure', 'Oblikovanje naslova po razinama', 'fail', 0, 6, ''),
    ];
    const ceiling = repairCeiling(checks);
    // Prije: 'Oblikovanje naslova po razinama' = manual -> hasManualGap, maxScore 57.
    expect(ceiling.hasManualGap).toBe(false);
    expect(ceiling.maxScore).toBe(100);
  });

  it('sadrzajna prosudba OSTAJE manual (registar ne smije obecati ono sto alat ne smije dirati)', () => {
    for (const title of ['Sažeci u samom radu', 'Ključne riječi u samom radu', 'Profilni opseg riječi', 'Osnovni dijelovi rada']) {
      const id = CHECK_ID_BY_TITLE[title];
      expect(id, `${title} nema kanonski ID`).toBeTruthy();
      expect(classifyFixability(id).fixability, title).toBe('manual');
    }
  });
});
