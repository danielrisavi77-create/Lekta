/**
 * Zasto profil nema NIJEDNU profilnu repair opciju (P2-4 u docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * Audit je prijavio "34 profila bez fakultetski specificnog popravka"; mjerenje je dalo 40. Oba
 * broja mjere ISTU, preusku stvar: `offeredOptionCount` broji samo PROFILNU granu
 * (`buildRepairableItems`), koja pokriva sest osi - font, velicinu, prored, format papira,
 * poravnanje i margine. Asistirane stavke (sadrzaj, oblikovanje naslova, obvezni dijelovi) ulaze
 * kroz vlastite ulazne tocke i u tom brojacu se NE VIDE, iako su profilno gejtane i korisniku se
 * doista nude.
 *
 * Zato "0 opcija" nije jedna pojava nego cetiri razlicite, s cetiri razlicita ishoda. Ovaj modul
 * ih razdvaja iz PODATAKA, da se posao ne planira po zbirnoj brojci koja spaja nespojivo.
 */

export type RepairGapKind =
  /** Nema nijednog bodovanog pravila; izostanak popravka je posljedica, ne zaseban kvar. */
  | 'no-scored-rules'
  /**
   * Profil nosi podatke koji GEJTAJU asistirani fixer (`requireToc`, `headingRules`,
   * `requiredSectionRules`), pa se popravak korisniku nudi iako ga profilni brojac ne vidi.
   * Ovo je rupa u MJERENJU, ne u proizvodu.
   */
  | 'assisted-profile-gated'
  /**
   * Jedina bodovana pravila su ona koja alat ne smije ni pokusati popraviti: opseg rada
   * (`page-count`) se ne postize oblikovanjem, a citatni stil se ne izmislja. Ispravna nula.
   */
  | 'not-repairable-by-nature'
  /**
   * Pravilo postoji, ali u obliku koji ne moze voditi fixer: `required-sections` je slobodan
   * popis naziva, dok `required-section-fixer` treba kanonske kljuceve (`required-section-rules`).
   * Rjesenje je podatkovno (prevesti pravilo), ne kodno.
   */
  | 'rule-shape-unusable';

export interface RepairGapRow {
  profileId: string;
  kind: RepairGapKind;
  /** checkId-jevi bodovanih, strojno provjerljivih pravila tog profila. */
  scoredCheckIds: string[];
  /** Koja gate-polja profil nosi (za `assisted-profile-gated`). */
  gates: string[];
}

export interface RepairGapReport {
  rows: RepairGapRow[];
  summary: Record<RepairGapKind, number> & { total: number };
}

/** Osi koje profilna grana popravka pokriva; sve ostalo pada u neku od gornjih kategorija. */
export const PROFILE_REPAIR_CHECK_IDS = new Set([
  'font',
  'font-size',
  'line-spacing',
  'paper-size',
  'justify',
  'margins',
]);

/** Pravila koja alat NE SMIJE popravljati, ma koliko bila uredno verificirana. */
export const NOT_REPAIRABLE_CHECK_IDS = new Set(['page-count', 'citation-style', 'reference-count']);

/** Polje u profilu -> asistirani fixer koji ono gejta. */
export const ASSISTED_GATES: Record<string, string> = {
  requireToc: 'toc-field-fixer',
  headingRules: 'heading-format-fixer',
  requiredSectionRules: 'required-section-fixer',
};

export interface RepairGapInput {
  profileId: string;
  /** checkId-jevi bodovanih i strojno provjerljivih pravila. */
  scoredCheckIds: string[];
  /** Kompajlirana pravila profila (effectiveRules ili rules). */
  rules: Record<string, unknown> | null | undefined;
}

export function classifyRepairGap(input: RepairGapInput): RepairGapRow {
  const gates = Object.keys(ASSISTED_GATES).filter((key) => {
    const value = input.rules?.[key];
    return key === 'requireToc' ? value === true : value != null && typeof value === 'object';
  });

  const scored = input.scoredCheckIds;
  const kind: RepairGapKind = !scored.length
    ? 'no-scored-rules'
    : gates.length
      ? 'assisted-profile-gated'
      : scored.every((id) => NOT_REPAIRABLE_CHECK_IDS.has(id))
        ? 'not-repairable-by-nature'
        : 'rule-shape-unusable';

  return { profileId: input.profileId, kind, scoredCheckIds: [...scored].sort(), gates: gates.sort() };
}

export function buildRepairGapReport(inputs: RepairGapInput[]): RepairGapReport {
  const rows = inputs
    .map(classifyRepairGap)
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.profileId.localeCompare(b.profileId));

  const summary = {
    'no-scored-rules': 0,
    'assisted-profile-gated': 0,
    'not-repairable-by-nature': 0,
    'rule-shape-unusable': 0,
    total: rows.length,
  } as RepairGapReport['summary'];
  for (const row of rows) summary[row.kind] += 1;

  return { rows, summary };
}
