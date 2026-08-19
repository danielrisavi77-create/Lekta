/**
 * Gard za klasifikaciju "zasto profil nema profilnu repair opciju" (P2-4 u
 * docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * Audit je prijavio 34 takva profila, mjerenje 40. Oba broja spajaju cetiri razlicite pojave s
 * cetiri razlicita ishoda, od kojih dvije uopce nisu kvar. Test cuva bas tu podjelu, jer zbirna
 * brojka vodi na krivi posao: izgleda kao "fali 40 fixera", a fali pet podatkovnih prijevoda.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyRepairGap,
  buildRepairGapReport,
  PROFILE_REPAIR_CHECK_IDS,
  NOT_REPAIRABLE_CHECK_IDS,
  ASSISTED_GATES,
} from '../src/programs/repair-gap';
import baked from '../docs/generated/repair-gap.json';

describe('klasifikacija: cetiri razlicite pojave', () => {
  it('bez bodovanih pravila je POSLJEDICA, ne zaseban kvar', () => {
    expect(classifyRepairGap({ profileId: 'x', scoredCheckIds: [], rules: {} }).kind).toBe('no-scored-rules');
  });

  /**
   * Najvazniji slucaj: profil nosi gate-podatak asistiranog fixera, pa se popravak korisniku
   * NUDI iako ga profilni brojac ne vidi. To je rupa u mjerenju, a ne u proizvodu, i ne smije se
   * planirati kao "fali fixer".
   */
  it('gate-podatak asistiranog fixera znaci da se popravak ipak nudi', () => {
    const toc = classifyRepairGap({ profileId: 'geof', scoredCheckIds: ['toc'], rules: { requireToc: true } });
    expect(toc.kind).toBe('assisted-profile-gated');
    expect(toc.gates).toEqual(['requireToc']);

    const heading = classifyRepairGap({
      profileId: 'gradri',
      scoredCheckIds: ['heading-rules'],
      rules: { headingRules: { maxLevel: 3 } },
    });
    expect(heading.kind).toBe('assisted-profile-gated');
  });

  it('requireToc mora biti tocno true, ne bilo kakva istinita vrijednost', () => {
    const row = classifyRepairGap({ profileId: 'x', scoredCheckIds: ['toc'], rules: { requireToc: 'da' } });
    expect(row.gates).toEqual([]);
  });

  it('opseg rada i citatni stil su ISPRAVNA nula, ne propust', () => {
    expect(classifyRepairGap({ profileId: 'x', scoredCheckIds: ['page-count'], rules: {} }).kind).toBe(
      'not-repairable-by-nature',
    );
    expect(classifyRepairGap({ profileId: 'y', scoredCheckIds: ['citation-style'], rules: {} }).kind).toBe(
      'not-repairable-by-nature',
    );
  });

  /**
   * `required-sections` je slobodan popis naziva; `required-section-fixer` treba kanonske kljuceve
   * (`required-section-rules`). Rjesenje je podatkovno, ne kodno - zato zaseban ishod.
   */
  it('pravilo u neupotrebljivom obliku je podatkovni posao', () => {
    expect(classifyRepairGap({ profileId: 'umas', scoredCheckIds: ['required-sections'], rules: {} }).kind).toBe(
      'rule-shape-unusable',
    );
  });

  it('gate nadjacava "neispravljivo" kad profil ima oboje', () => {
    // vsite ima i page-count i toc: popravak sadrzaja se nudi, pa profil nije "neispravljiv".
    const row = classifyRepairGap({
      profileId: 'vsite',
      scoredCheckIds: ['page-count', 'toc'],
      rules: { requireToc: true },
    });
    expect(row.kind).toBe('assisted-profile-gated');
  });

  it('zbroj po vrstama pokriva sve retke', () => {
    const report = buildRepairGapReport([
      { profileId: 'a', scoredCheckIds: [], rules: {} },
      { profileId: 'b', scoredCheckIds: ['page-count'], rules: {} },
    ]);
    const { total, ...kinds } = report.summary;
    expect(Object.values(kinds).reduce((n, v) => n + v, 0)).toBe(total);
  });
});

describe('commitani izvjestaj', () => {
  it('drift: commitani === svjezi izracun nad istim ulazima (inace: npm run repair-gap)', () => {
    const fresh = buildRepairGapReport(
      baked.rows.map((r) => ({
        profileId: r.profileId,
        scoredCheckIds: r.scoredCheckIds,
        rules: Object.fromEntries(r.gates.map((g) => [g, g === 'requireToc' ? true : {}])),
      })),
    );
    expect(fresh.summary).toEqual(baked.summary);
  });

  /**
   * Zatecena podjela (2026-08-19). Brojke smiju pasti kad se posao odradi, ali ne smiju se tiho
   * promijeniti: 24 su posljedica P2-2/P2-3, 6 je rupa u mjerenju, 5 je ispravna nula, a stvarni
   * P2-4 backlog je pet podatkovnih prijevoda.
   */
  it('zatecena podjela ostaje vidljiva', () => {
    expect(baked.summary.total).toBe(40);
    expect(baked.summary['no-scored-rules']).toBe(24);
    expect(baked.summary['assisted-profile-gated']).toBe(6);
    expect(baked.summary['not-repairable-by-nature']).toBe(5);
    expect(baked.summary['rule-shape-unusable']).toBe(5);
  });

  it('profilna grana pokriva tocno sest osi, i to se ne smije tiho prosiriti', () => {
    expect([...PROFILE_REPAIR_CHECK_IDS].sort()).toEqual([
      'font',
      'font-size',
      'justify',
      'line-spacing',
      'margins',
      'paper-size',
    ]);
    expect(NOT_REPAIRABLE_CHECK_IDS.has('page-count')).toBe(true);
    expect(Object.keys(ASSISTED_GATES)).toHaveLength(3);
  });
});
