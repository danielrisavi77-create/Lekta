/**
 * Rutiranje odabira u profil: za SVAKU kataloski ponudjenu trojku (jedinica, program, vrsta rada)
 * dokazuje da carobnjak dobije determinirani ishod, i da nijedan profil registra nije nedostizan.
 *
 * Zasto podatkovni test, a ne jos analiza: program NE mijenja pravila (pravila nosi profil), nego
 * samo bira KOJI profil vrijedi. Puna conformance matrica zato ostaje po profilu, a ovdje se za
 * cijenu milisekundi pokriva ~4.800 trojki koje bi kroz analizu trajale satima.
 *
 * Kvar koji ovo hvata je tih po prirodi: promasen ili nedostizan profil ne baca gresku nego
 * posluzi opci baseline, pa student iz fakulteta koji JE portan dobije genericku provjeru.
 *
 * Koristi ISTE funkcije koje zove src/ui/app.ts (work-selection), ne vlastito zrcalo logike.
 */
import { describe, it, expect } from 'vitest';
import {
  visibleProgramsForUnit,
  eligibleDefinitionsFor,
  resolveDefinition,
  WORK_TYPE_PRIORITY,
  type RoutableProfile,
  type UnitLike,
} from '../src/ui/work-selection';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';
import catalog from '../data/catalog/zagreb-catalog.json';

const REGISTRY = VERIFIED_PROFILE_REGISTRY as unknown as RoutableProfile[];
const WORK_TYPES = [...WORK_TYPE_PRIORITY];

/** Sve jedinice kataloga, s institucijom radi citljive poruke. */
function allUnits(): Array<{ institutionId: string; unit: UnitLike }> {
  return (catalog as Array<{ id: string; units?: UnitLike[] }>).flatMap((inst) =>
    (inst.units || []).map((unit) => ({ institutionId: inst.id, unit })),
  );
}

/** Sve trojke koje carobnjak stvarno moze proizvesti (vidljivi programi x sve vrste rada). */
function allTriples(): Array<{ unitId: string; program: string; workType: string }> {
  const out: Array<{ unitId: string; program: string; workType: string }> = [];
  for (const { unit } of allUnits()) {
    for (const program of visibleProgramsForUnit(REGISTRY, unit)) {
      for (const workType of WORK_TYPES) out.push({ unitId: unit.id, program, workType });
    }
  }
  return out;
}

/**
 * Nijedan profil ne smije biti nedostizan. Popis je prazan i takav mora ostati: do 2026-08-22 je
 * ovdje stajao adu-opci-diplomski, kojemu je krovni program bio sakriven jer svih 7 ADU smjerova
 * ima vlastiti profil, pa se profil brojao u pokrivenosti a nijedan ga student nije mogao dobiti.
 * Popravljeno u visibleProgramsForUnit: krovni se unos skriva samo kad je stvarno redundantan.
 */
const UNREACHABLE_KNOWN: Record<string, string> = {};

describe('rutiranje: kataloska trojka -> profil', () => {
  it('svaka trojka ima determiniran ishod (nikad dva profila bez varijante)', () => {
    const ambiguous: string[] = [];
    for (const { unitId, program, workType } of allTriples()) {
      const defs = eligibleDefinitionsFor(REGISTRY, unitId, program, workType);
      const withoutVariant = defs.filter((d) => !d.variant);
      if (withoutVariant.length > 1) {
        ambiguous.push(`${unitId} | ${program} | ${workType} -> ${withoutVariant.map((d) => d.id).join(', ')}`);
      }
    }
    // Vise od jednog kandidata bez varijante znaci da ishod ovisi o poretku u registru, a poredak
    // je artefakt generatora: isti student bi dobio druga pravila nakon obicnog re-generiranja.
    expect(ambiguous).toEqual([]);
  });

  it('nijedan profil nije nedostizan iz carobnjaka (osim dokumentiranog duga)', () => {
    const reachable = new Set<string>();
    for (const { unitId, program, workType } of allTriples()) {
      for (const d of eligibleDefinitionsFor(REGISTRY, unitId, program, workType)) reachable.add(d.id);
    }
    const unreachable = REGISTRY.filter((p) => !reachable.has(p.id)).map((p) => p.id).sort();
    expect(unreachable).toEqual(Object.keys(UNREACHABLE_KNOWN).sort());
  });

  it('svaki profil pripada jedinici koja postoji u katalogu', () => {
    const unitIds = new Set(allUnits().map(({ unit }) => unit.id));
    const orphans = REGISTRY.filter((p) => !unitIds.has(p.unitId)).map((p) => `${p.id} -> ${p.unitId}`);
    expect(orphans).toEqual([]);
  });

  it('varijanta bira svoj profil, a "default" uvijek profil bez varijante', () => {
    const withVariant = REGISTRY.filter((d) => d.variant);
    // Dvije varijante zavrsnog rada na ALU (tekstualni/audiovizualni) su jedini takav par danas;
    // test ne ovisi o tom broju nego o svojstvu, pa vrijedi i kad varijanti bude vise.
    expect(withVariant.length).toBeGreaterThan(0);
    for (const target of withVariant) {
      for (const program of target.programs) {
        for (const workType of target.workTypes || []) {
          const defs = eligibleDefinitionsFor(REGISTRY, target.unitId, program, workType);
          expect(resolveDefinition(defs, String(target.variant))?.id, `${target.id} | ${program} | ${workType}`).toBe(target.id);
          const fallback = resolveDefinition(defs, 'default');
          if (fallback) expect(fallback.variant, `${target.id}: "default" ne smije vratiti varijantu`).toBeFalsy();
        }
      }
    }
  });

  it('svaki program profila postoji u katalogu', () => {
    // Niz koji ne postoji u katalogu je mrtav: rutiranje ga nikad ne moze pogoditi. Dok profil ima
    // i drugi, kataloski niz, to je samo balast, ali isti oblik greske (npr. dijakritika u jedinom
    // nizu) ucinio bi profil nedostiznim, a to se ne vidi ni u jednom drugom testu. Pet takvih
    // nizova na SOiS-FT profilima uklonjeno je 2026-08-22.
    const byUnit = new Map<string, string[]>();
    for (const { unit } of allUnits()) {
      byUnit.set(unit.id, unit.programs?.length ? unit.programs : ['Opći profil ustanove']);
    }
    const dead: string[] = [];
    for (const p of REGISTRY) {
      const known = byUnit.get(p.unitId) || [];
      for (const program of p.programs) if (!known.includes(program)) dead.push(`${p.id} -> ${program}`);
    }
    expect(dead).toEqual([]);
  });

  it('krovni program se skriva samo kad je redundantan', () => {
    const units = new Map(allUnits().map(({ unit }) => [unit.id, unit]));
    // ADU: krovni profil ne navodi nijedan konkretan smjer, pa krovni program mora ostati u ponudi.
    expect(visibleProgramsForUnit(REGISTRY, units.get('adu')!)).toContain('Opći profil akademije');
    // FSB i GEOF: njihovi krovni profili navode i konkretne studije, pa su dostizni i bez krovnog
    // unosa; nudjenje krovnog uz svaki smjer bila bi suvisna odluka za studenta.
    for (const unitId of ['fsb', 'geof']) {
      expect(visibleProgramsForUnit(REGISTRY, units.get(unitId)!)).not.toContain('Opći profil fakulteta');
    }
  });

  it('trojka bez profila vraca null (opci baseline), ne slucajan profil druge jedinice', () => {
    // Domovinska sigurnost (SOiS-FT) je takav slucaj danas: program postoji u katalogu, profil jos ne.
    const defs = eligibleDefinitionsFor(REGISTRY, 'sois-ft', 'Domovinska sigurnost (poslijediplomski specijalisticki, zajednicki sa Sveucilistem u Zagrebu)', 'specialist');
    expect(defs).toEqual([]);
    expect(resolveDefinition(defs, 'default')).toBeNull();
  });
});

describe('rutiranje: pokrivenost ponude', () => {
  it('svaka jedinica s profilom nudi barem jedan program koji vodi u profil', () => {
    const unitsWithProfiles = new Set(REGISTRY.map((p) => p.unitId));
    const broken: string[] = [];
    for (const { unit } of allUnits()) {
      if (!unitsWithProfiles.has(unit.id)) continue;
      const programs = visibleProgramsForUnit(REGISTRY, unit);
      const anyHit = programs.some((program) =>
        WORK_TYPES.some((workType) => eligibleDefinitionsFor(REGISTRY, unit.id, program, workType).length > 0),
      );
      if (!anyHit) broken.push(unit.id);
    }
    // Jedinica koja ima profile, a nijedan njezin ponudjeni program ih ne dohvaca, znaci da se
    // nazivi studija u profilu i katalogu razilaze (npr. dijakritika ili preimenovan studij).
    expect(broken).toEqual([]);
  });
});
