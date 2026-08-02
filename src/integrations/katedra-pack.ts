/**
 * Katedra coach-pack: kompaktna, informativna projekcija Lektinih verificiranih profila
 * za sestrinski proizvod Katedra (AI coach za pisanje). Vidi CLAUDE.md "Lekta nikad ne
 * generira niti ne prepravlja sadrzaj rada": ovo je JEDNOSMJERAN izvoz (Lekta -> Katedra),
 * cisto informativan, nikad autoritativan. Katedra ne smije tvrditi formalnu uskladenost
 * na temelju ovog paketa, mjerodavna provjera ostaje Lekta.
 *
 * Cista funkcija namjerno: koristi je i scripts/generate-katedra-pack.mts (pisanje na disk)
 * i tests/katedra-pack.test.ts (drift guard), bez duplicirane logike.
 */
import type { CatalogInstitution, VerifiedProfile } from '../profiles/profile-schema';

export const KATEDRA_PACK_SCHEMA_VERSION = 1;

/** Profili u ovim statusima idu u pack; ostali (research/generic) nemaju dovoljno
 * potvrdenih pravila da vrijedi izvoziti ih kao coach-podatak. */
const PACK_STATUSES = new Set(['verified', 'partial']);

export interface KatedraPackProfile {
  id: string;
  unitId: string;
  label: string;
  status: string;
  workTypes: string[];
  verifiedAt?: string;
  citation?: unknown;
  wordMin?: number;
  wordMax?: number;
  pageMin?: number;
  pageMax?: number;
  minReferences?: number;
  font?: unknown;
  size?: unknown;
  spacing?: unknown;
  sections?: string[];
  facts?: string[];
  manualChecks?: string[];
  submissionFacts?: string[];
  sources?: Array<{ t: string; u: string }>;
}

export interface KatedraPackUnit {
  id: string;
  name: string;
  inst?: string;
  profiles: string[];
}

export interface KatedraPack {
  meta: {
    schemaVersion: number;
    source: string;
    counts: { units: number; profiles: number };
    statusLabels: Record<string, string>;
    note: string;
  };
  units: KatedraPackUnit[];
  profiles: KatedraPackProfile[];
}

function trim<T>(arr: T[] | undefined, n: number): T[] | undefined {
  return Array.isArray(arr) ? arr.slice(0, n) : undefined;
}

function clean<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)),
  ) as T;
}

export function buildKatedraPack(
  profiles: VerifiedProfile[],
  catalog: CatalogInstitution[],
  statusLabels: Record<string, { label: string }>,
): KatedraPack {
  const unitName = new Map<string, { name: string; inst: string }>();
  for (const inst of catalog) {
    for (const u of inst.units) unitName.set(u.id, { name: u.name, inst: inst.name });
  }

  const packProfiles: KatedraPackProfile[] = profiles
    .filter((p) => PACK_STATUSES.has(p.status))
    .map((p) => {
      const r = (p.rules ?? {}) as Record<string, any>;
      return clean({
        id: p.id,
        unitId: p.unitId,
        label: p.profileLabel,
        status: p.status,
        workTypes: p.workTypes,
        verifiedAt: p.verifiedAt,
        citation: r.recommendedCitation,
        wordMin: r.wordMin,
        wordMax: r.wordMax,
        pageMin: r.pageMin,
        pageMax: r.pageMax,
        minReferences: r.minReferences,
        font: Array.isArray(r.font) ? r.font[0] : r.font,
        size: Array.isArray(r.size) ? r.size[0] : r.size,
        spacing: r.spacing,
        sections: trim((r.requiredSections ?? []).map((s: any) => s.label), 12),
        facts: trim(p.facts, 8),
        manualChecks: trim(r.manualChecks, 8),
        submissionFacts: trim(p.submissionFacts, 4),
        sources: trim((p.sources ?? []).map((s) => ({ t: s.title, u: s.url })), 5),
      }) as unknown as KatedraPackProfile;
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const unitsInPack = [...new Set(packProfiles.map((p) => p.unitId))].sort();
  const units: KatedraPackUnit[] = unitsInPack.map((id) =>
    clean({
      id,
      name: unitName.get(id)?.name ?? id.toUpperCase(),
      inst: unitName.get(id)?.inst,
      profiles: packProfiles.filter((p) => p.unitId === id).map((p) => p.id),
    }) as unknown as KatedraPackUnit,
  );

  return {
    meta: {
      schemaVersion: KATEDRA_PACK_SCHEMA_VERSION,
      source: 'lekta data/profiles/verified-profiles.json',
      counts: { units: units.length, profiles: packProfiles.length },
      statusLabels: Object.fromEntries(Object.entries(statusLabels).map(([k, v]) => [k, v.label])),
      note: 'Katedra coach-pack. Pravila su informativni sazetak, mjerodavna provjera je Lekta.',
    },
    units,
    profiles: packProfiles,
  };
}
