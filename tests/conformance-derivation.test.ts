/**
 * Invarijanti data-driven conformance derivacije (tests/helpers/conformance.ts),
 * BEZ ijedne analize dokumenta (brzo, u redovnom `npm run check`).
 *
 * Dokazuje: derivacija radi za SVAKI profil registra, builder gradi oba dokumenta,
 * neuskladjene vrijednosti stvarno krse profil (izvan tolerancija engine-a), a
 * tripwire uzorak je deterministican i pokriva svaku instituciju s profilima.
 */
import { describe, it, expect } from 'vitest';
import { buildDocx } from './helpers/docx-builder';
import { normalize, sectionName } from '../src/utils/helpers';
import {
  allConformanceCases,
  allConformanceProfileIds,
  conformanceShardCases,
  deriveConformancePlan,
  tripwireCases,
  type ConformancePlan,
} from './helpers/conformance';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';

const plans = new Map<string, ConformancePlan>();
const planFor = (id: string) => {
  if (!plans.has(id)) plans.set(id, deriveConformancePlan(id));
  return plans.get(id)!;
};

describe('conformance derivacija (invarijanti, bez analiza)', () => {
  it('derivira plan i gradi oba dokumenta za SVAKI profil registra', () => {
    const ids = allConformanceProfileIds();
    expect(ids.length).toBeGreaterThanOrEqual(372);
    for (const id of ids) {
      const plan = planFor(id);
      expect(buildDocx(plan.compliantSpec).length, `${id}: compliant docx`).toBeGreaterThan(0);
      expect(buildDocx(plan.violatingSpec).length, `${id}: violating docx`).toBeGreaterThan(0);
    }
  });

  it('pokrivenost: >=300 profila s assertima i >=300 s barem 5 dimenzija', () => {
    const ids = allConformanceProfileIds();
    const withAsserts = ids.filter((id) => planFor(id).assertions.length > 0);
    const withFive = ids.filter((id) => planFor(id).assertions.length >= 5);
    expect(withAsserts.length).toBeGreaterThanOrEqual(300);
    expect(withFive.length).toBeGreaterThanOrEqual(300);
  });

  it('neuskladjene vrijednosti stvarno krse profil (izvan tolerancija engine-a)', () => {
    for (const id of allConformanceProfileIds()) {
      const plan = planFor(id);
      const p = plan.profile;
      const vPara: any = plan.violatingSpec.paragraphs[0];
      const dims = new Set(plan.assertions.map((a) => a.dim));

      if (dims.has('font')) {
        const set = new Set((p.font || []).map((x: string) => normalize(x)));
        expect(set.has(normalize(vPara.font)), `${id}: violating font "${vPara.font}" je u profilu`).toBe(false);
      }
      if (dims.has('size')) {
        for (const s of p.size) expect(Math.abs(vPara.sizePt - s), `${id}: violating size preblizu ${s}`).toBeGreaterThan(0.1);
      }
      if (dims.has('spacing')) {
        expect(Math.abs(vPara.spacingLine / 240 - p.spacing), `${id}: violating prored preblizu ${p.spacing}`).toBeGreaterThan(0.12);
      }
      if (dims.has('margins')) {
        const vm: any = plan.violatingSpec.marginsCm;
        for (const side of ['top', 'right', 'bottom', 'left'] as const) {
          expect(Math.abs(vm[side] - p.margins[side]), `${id}: violating margina ${side} unutar tolerancije`).toBeGreaterThan(0.36);
        }
      }
      // Neuskladjeni odlomci ne smiju maskirati strukturne provjere:
      for (const para of plan.violatingSpec.paragraphs as any[]) {
        expect(/\b(PAGE|TOC)\b/i.test(para.text || ''), `${id}: violating tekst sadrzi PAGE/TOC`).toBe(false);
        const n = sectionName(para.text || '');
        for (const r of p.requiredSections || []) {
          for (const t of (r.terms || []).map((x: string) => normalize(x)).filter(Boolean)) {
            expect(n === t || n.startsWith(t), `${id}: violating odlomak matcha term "${t}"`).toBe(false);
          }
        }
        expect(['uvod', 'zakljucak', 'literatura', 'sadrzaj'].includes(n), `${id}: violating odlomak izgleda kao dio rada`).toBe(false);
      }
    }
  });

  it('spot-checkovi poznatih profila', () => {
    // arh-diplomski je jedini paperSizes profil: dinamicki naslov checka.
    const arh = planFor('arh-diplomski');
    expect(arh.assertions.find((a) => a.dim === 'paper')?.checkTitle).toBe('Format stranice (A3/A0)');

    // vsite-zavrsni je crash-prone bez guarda (checkFont on, bez font[]): format dimenzije otpadaju.
    const vsite = planFor('vsite-zavrsni');
    const vsiteDims = new Set(vsite.assertions.map((a) => a.dim));
    expect(vsiteDims.has('font')).toBe(false);
    expect(vsiteDims.has('size')).toBe(false);
    expect(vsiteDims.has('margins')).toBe(false);

    // Reprezentativan bogat profil ima barem 5 dimenzija.
    expect(planFor('fpzg-politologija-zavrsni').assertions.length).toBeGreaterThanOrEqual(5);
  });

  it('shardovi particioniraju sve slucajeve bez preklapanja', () => {
    const all = allConformanceCases().map((c) => c.id);
    const union: string[] = [];
    for (let s = 1; s <= 8; s++) union.push(...conformanceShardCases(s, 8).map((c) => c.id));
    expect(union.sort()).toEqual([...all].sort());
    expect(new Set(union).size).toBe(all.length);
  });

  it('matrica pokriva SVAKI par (profil, vrsta rada), ne samo prvu vrstu', () => {
    // Do 2026-08-22 je matrica isla po profilu, a resolveProfile uzima workTypes[0], pa profil sa
    // "seminar+project+article" nikad nije bio analiziran ni kao projektni ni kao clanak.
    const expected = (VERIFIED_PROFILE_REGISTRY as unknown as Array<{ id: string; workTypes?: string[] }>)
      .flatMap((p) => (p.workTypes?.length ? p.workTypes : ['final']).map((w) => `${p.id}|${w}`))
      .sort();
    const actual = allConformanceCases().map((c) => `${c.profileId}|${c.workType}`).sort();
    expect(actual).toEqual(expected);
    expect(actual.length).toBeGreaterThan(allConformanceProfileIds().length);
  });

  it('plan nosi trazenu vrstu rada, a ne prvu iz profila', () => {
    const multi = (VERIFIED_PROFILE_REGISTRY as unknown as Array<{ id: string; workTypes?: string[] }>)
      .find((p) => (p.workTypes?.length || 0) > 1);
    expect(multi, 'registar vise nema profil s vise vrsta rada; provjeri je li to namjerno').toBeTruthy();
    for (const workType of multi!.workTypes!) {
      const plan = deriveConformancePlan(multi!.id, workType);
      expect(plan.workType).toBe(workType);
      expect(plan.profile.selection.workType).toBe(workType);
    }
  });

  it('tripwire: deterministican, bez duplikata, pokriva svaku instituciju s profilima', () => {
    const a = tripwireCases();
    const b = tripwireCases();
    expect(a).toEqual(b);
    expect(new Set(a.map((c) => c.id)).size).toBe(a.length);
    expect(new Set(a.map((c) => c.profileId)).size).toBeGreaterThanOrEqual(35);
    const all = new Set(allConformanceProfileIds());
    for (const c of a) expect(all.has(c.profileId), `tripwire id ${c.profileId} nije u registru`).toBe(true);
  });
});
