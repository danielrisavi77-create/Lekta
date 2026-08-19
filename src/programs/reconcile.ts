import {
  programNeedsProfile,
  type ProgramRecord,
  type ProgramRegistry,
  type UnsupportedReason,
} from './program-schema';

/**
 * Uparivanje PROGRAM <-> PROFIL (P1-3 u docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * Pitanje na koje odgovara: "postoji li studijski program koji uopce nismo evidentirali, i postoji
 * li profil koji ne pripada nijednom programu". Dok se na to ne moze odgovoriti brojkom, tvrdnja
 * "Lekta pokriva svaki akademski rad u Hrvatskoj" nije ni tocna ni netocna - nedokaziva je.
 *
 * Kljucna razlika koju izvjestaj radi, a naivni "profil nema program" ne bi:
 *   - jedinica UOPCE nije u registru programa  -> rupa je u NASEM registru, ne u profilu;
 *   - jedinica JEST u registru, a profil nijedan program ne trazi -> to je stvaran, uzak nalaz.
 * Danas je prva kategorija ogromna (registar pokriva 2 od 131 jedinice), pa bi bez te podjele
 * druga, korisna kategorija bila nevidljiva u sumu.
 */

export type ProgramState = 'linked' | 'needs-profile' | 'unsupported';
export type ProfileState = 'linked' | 'unit-not-in-registry' | 'unclaimed-by-program';

export interface ProgramReconcileRow {
  programId: string;
  componentId: string;
  name: string;
  state: ProgramState;
  profileIds: string[];
  unsupportedReason: UnsupportedReason | null;
  /** `true` kad program dolazi iz sluzbenog Upisnika (jedini izvor koji nosi sifru). */
  fromUpisnik: boolean;
}

export interface ProfileReconcileRow {
  profileId: string;
  unitId: string | null;
  state: ProfileState;
  programIds: string[];
}

export interface ReconcileSummary {
  programCount: number;
  profileCount: number;
  unitCount: number;
  /** Jedinice bez ijednog zapisa o programu: primarna mjera nepotpunosti registra. */
  unitsWithoutPrograms: number;
  /** Profili u jedinicama koje registar POKRIVA, a nijedan program ih ne trazi. Uzak, ostar nalaz. */
  profilesUnclaimedInCoveredUnits: number;
  /** Programi koji trebaju profil pa ga nemaju (`pending-port`). Jedini koji ulaze u ratchet. */
  programsPendingPort: number;
  byProgramState: Record<ProgramState, number>;
  byProfileState: Record<ProfileState, number>;
  upisnikSynced: boolean;
}

export interface ReconcileReport {
  schemaVersion: number;
  programs: ProgramReconcileRow[];
  profiles: ProfileReconcileRow[];
  /** Imenovane jedinice bez programa; popis, ne samo broj (bez "tihog skracivanja"). */
  unitsWithoutPrograms: string[];
  summary: ReconcileSummary;
}

export interface ReconcileProfileInput {
  id: string;
  unitId?: string | null;
}

function programState(program: ProgramRecord): ProgramState {
  if (program.expectedProfileIds.length) return 'linked';
  return programNeedsProfile(program) ? 'needs-profile' : 'unsupported';
}

export function reconcilePrograms(
  registry: ProgramRegistry,
  profiles: ReconcileProfileInput[],
  /** Sve jedinice iz kataloga; bez toga se ne vidi koliko ih registar UOPCE ne dira. */
  allUnitIds: string[],
): ReconcileReport {
  const programRows: ProgramReconcileRow[] = registry.programs
    .map((program) => ({
      programId: program.id,
      componentId: program.componentId,
      name: program.name,
      state: programState(program),
      profileIds: [...program.expectedProfileIds].sort(),
      unsupportedReason: program.unsupportedReason,
      fromUpisnik: program.provenance.kind === 'upisnik',
    }))
    .sort((a, b) => a.programId.localeCompare(b.programId));

  const unitsWithPrograms = new Set(registry.programs.map((p) => p.componentId));
  const programsByProfile = new Map<string, string[]>();
  for (const program of registry.programs) {
    for (const profileId of program.expectedProfileIds) {
      programsByProfile.set(profileId, [...(programsByProfile.get(profileId) ?? []), program.id]);
    }
  }

  const profileRows: ProfileReconcileRow[] = profiles
    .map((profile) => {
      const programIds = (programsByProfile.get(profile.id) ?? []).sort();
      const unitId = profile.unitId ?? null;
      const state: ProfileState = programIds.length
        ? 'linked'
        : unitId != null && unitsWithPrograms.has(unitId)
          ? 'unclaimed-by-program'
          : 'unit-not-in-registry';
      return { profileId: profile.id, unitId, state, programIds };
    })
    .sort((a, b) => a.profileId.localeCompare(b.profileId));

  const unitsWithoutPrograms = [...new Set(allUnitIds)]
    .filter((unitId) => !unitsWithPrograms.has(unitId))
    .sort();

  const byProgramState: Record<ProgramState, number> = { linked: 0, 'needs-profile': 0, unsupported: 0 };
  for (const row of programRows) byProgramState[row.state] += 1;
  const byProfileState: Record<ProfileState, number> = {
    linked: 0,
    'unit-not-in-registry': 0,
    'unclaimed-by-program': 0,
  };
  for (const row of profileRows) byProfileState[row.state] += 1;

  return {
    schemaVersion: 1,
    programs: programRows,
    profiles: profileRows,
    unitsWithoutPrograms,
    summary: {
      programCount: programRows.length,
      profileCount: profileRows.length,
      unitCount: new Set(allUnitIds).size,
      unitsWithoutPrograms: unitsWithoutPrograms.length,
      profilesUnclaimedInCoveredUnits: byProfileState['unclaimed-by-program'],
      programsPendingPort: programRows.filter((r) => r.state === 'needs-profile').length,
      byProgramState,
      byProfileState,
      upisnikSynced: registry.upisnikSynced,
    },
  };
}
