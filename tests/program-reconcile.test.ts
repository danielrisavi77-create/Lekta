/**
 * Gard za registar studijskih programa i njegovo uskladjivanje s profilima (P1-1, P1-3, P1-4 u
 * docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * Zasto: tvrdnja "Lekta pokriva svaki akademski rad u Hrvatskoj" nije bila ni tocna ni netocna,
 * nego NEDOKAZIVA - jedini zapis o programima bio je uzorak od 35 programa nad dvije jedinice, bez
 * ijednog citatelja u kodu. Ovaj test ne trazi da rupe nema; trazi da je IZMJERENA, IMENOVANA i da
 * se ne moze tiho promijeniti ni na bolje ni na gore.
 *
 * Kad padne zbog napretka: pokreni `npm run reconcile-programs`, pa upisi nove brojke u
 * `data/programs/reconcile-ratchet.json`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  VERIFIED_PROFILES_WITH_DRAFTS,
  LEGAL_DEPARTMENTS_WITH_DRAFTS,
} from '../src/profiles/drafts-runtime';
import { allUnits } from '../src/catalog/catalog-loader';
import { reconcilePrograms } from '../src/programs/reconcile';
import { validateProgramRegistry, type ProgramRegistry } from '../src/programs/program-schema';
import registryJson from '../data/programs/program-registry.json';
import ratchet from '../data/programs/reconcile-ratchet.json';
import baked from '../docs/generated/program-reconcile.json';

const registry = registryJson as unknown as ProgramRegistry;
const profiles = [...VERIFIED_PROFILES_WITH_DRAFTS, ...LEGAL_DEPARTMENTS_WITH_DRAFTS].map((p) => ({
  id: p.id,
  unitId: (p as unknown as { unitId?: string }).unitId ?? null,
}));
const fresh = reconcilePrograms(
  registry,
  profiles,
  allUnits().map((u) => u.id),
);

describe('registar programa: struktura', () => {
  it('prolazi strukturnu validaciju', () => {
    expect(validateProgramRegistry(registry)).toEqual([]);
  });

  /**
   * Sifra iz Upisnika je jedini podatak koji dokazuje sluzbeni identitet programa. Dok registar
   * nije sinkroniziran, nijedan zapis je ne smije nositi - inace bi `official` u completion
   * ledgeru postao stvar formatiranja, a ne dokaza.
   */
  it('nijedan program ne tvrdi sluzbenu sifru dok Upisnik nije sinkroniziran', () => {
    expect(registry.upisnikSynced).toBe(false);
    for (const program of registry.programs) {
      expect(program.officialProgramCode, `${program.id} ima sifru bez sinkroniziranog Upisnika`).toBeNull();
      expect(program.provenance.kind).not.toBe('upisnik');
    }
  });

  it('program bez profila uvijek ima izricit razlog', () => {
    for (const program of registry.programs) {
      if (program.expectedProfileIds.length) continue;
      expect(program.unsupportedReason, `${program.id} nema profil ni razlog`).not.toBeNull();
    }
  });

  it('polja koja zna samo Upisnik ostaju null, a ne pogodjena', () => {
    // Stranica studija ih ne sadrzi; ispuniti ih sada znacilo bi izmisliti podatak koji izgleda
    // sluzbeno. Test cuva da seed nikad ne "popuni" shemu nagadjanjem.
    for (const program of registry.programs) {
      if (program.provenance.kind !== 'faculty-page') continue;
      expect(program.language).toBeNull();
      expect(program.deliveryMode).toBeNull();
      expect(program.subjectCount).toBeNull();
      expect(program.academicYear).toBeNull();
    }
  });
});

describe('uskladjivanje programa i profila', () => {
  it('commitani izvjestaj === svjezi izracun (inace: npm run reconcile-programs)', () => {
    expect(fresh).toEqual(baked as unknown as typeof fresh);
  });

  it('svaki profil je tocno u jednom stanju, i zbroj se slaze', () => {
    const s = fresh.summary;
    const sum = s.byProfileState.linked + s.byProfileState['unit-not-in-registry'] + s.byProfileState['unclaimed-by-program'];
    expect(sum).toBe(s.profileCount);
    expect(s.profileCount).toBe(profiles.length);
  });

  /**
   * Podjela koja cini razliku: "jedinica uopce nije u registru" je rupa u NASEM registru, dok je
   * "nijedan program ne trazi ovaj profil" uzak, stvaran nalaz. Bez te podjele bi se drugi utopio
   * u prvom (danas 6 naspram 384).
   */
  it('profil bez programa razlikuje rupu u registru od stvarno netrazenog profila', () => {
    const unitsWithPrograms = new Set(registry.programs.map((p) => p.componentId));
    for (const row of fresh.profiles) {
      if (row.state !== 'unclaimed-by-program') continue;
      expect(row.unitId).not.toBeNull();
      expect(unitsWithPrograms.has(row.unitId!)).toBe(true);
    }
    for (const row of fresh.profiles) {
      if (row.state !== 'unit-not-in-registry') continue;
      expect(row.unitId == null || !unitsWithPrograms.has(row.unitId)).toBe(true);
    }
  });

  it('jedinice bez programa su IMENOVANE, ne samo prebrojane', () => {
    expect(fresh.unitsWithoutPrograms).toHaveLength(fresh.summary.unitsWithoutPrograms);
    expect(new Set(fresh.unitsWithoutPrograms).size).toBe(fresh.unitsWithoutPrograms.length);
  });
});

describe('ratchet: rupa se ne smije tiho promijeniti', () => {
  it('izmjerene brojke odgovaraju zabiljezenima', () => {
    const s = fresh.summary;
    expect(s.unitsWithoutPrograms, 'jedinice bez programa').toBe(ratchet.unitsWithoutPrograms);
    expect(s.byProfileState['unit-not-in-registry'], 'profili u jedinicama izvan registra').toBe(
      ratchet.profilesUnitNotInRegistry,
    );
    expect(s.profilesUnclaimedInCoveredUnits, 'netrazeni profili u pokrivenim jedinicama').toBe(
      ratchet.profilesUnclaimedInCoveredUnits,
    );
    expect(s.programsPendingPort, 'programi koji cekaju profil').toBe(ratchet.programsPendingPort);
    expect(s.upisnikSynced).toBe(ratchet.upisnikSynced);
  });

  it('zatecenih 6 netrazenih profila ostaje vidljivo dok se ne rijesi', () => {
    const unclaimed = fresh.profiles.filter((p) => p.state === 'unclaimed-by-program').map((p) => p.profileId);
    // Cetiri su OPCI (rezervni) profili: po prirodi ne pripadaju nijednom programu, nego hvataju
    // rad kojem korisnik ne zna tocan studij. Preostala DVA izgledaju kao stvarni studiji kojih u
    // matrici nema, i to je pravi nalaz ovog izvjestaja (P1-5 u planu).
    expect(unclaimed.sort()).toEqual([
      'fpzg-opci-akademski-rad',
      'pravo-opci-pravni-akademski-rad',
      'pravo-socijalne-djelatnosti-doktorski',
      'pravo-socijalne-djelatnosti-specijalisticki',
      'pravo-socijalni-opci-akademski-rad',
      'pravo-specijalisticki-pravni-opci',
    ]);
    expect(unclaimed.filter((id) => id.includes('opci')).length).toBe(4);
  });
});
