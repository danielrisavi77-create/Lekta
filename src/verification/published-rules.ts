import type { ThesisProfile, RuleEntry, SourceEntry } from '../profiles/profile-schema';
import { isRuleScored } from './verification-gate';
import { compileEffectiveRules, type EffectiveRules } from '../profiles/rule-compiler';

/**
 * Objavljeni bodovani skup (VERIFICATION_PIPELINE.md sekcija 2: "boduje se samo scored:true").
 *
 * Ovo je SPOSOBNOST, ne prekidac: racuna sto bi engine smio bodovati kad bi se oslonio na
 * verificirana pravila umjesto na naslijeden `effectiveRules`. Zivi engine se NE mijenja
 * (i dalje cita `effectiveRules`); kad celija bude verificirana, proizvod moze prijeci na
 * `effectiveScored`. Dok nista nije verificirano, `scored` je prazan i `effectiveScored`
 * je {}, pa je ovo potpuno aditivno i golden ostaje zelen.
 *
 * Pravilo se boduje samo ako je `isRuleScored` (verified + sluzbeni autoritet + sourceId +
 * sourcePage + quote) I izvor je stvarno objavljiv (ima snapshot plus hash). Sve ostalo je
 * advisory i prikazuje se kao savjet s linkom na izvor.
 */

export interface PublishedRules {
  /** Pravila koja smiju bodovati (verified, sljediva, izvor snapshotiran). */
  scored: RuleEntry[];
  /** Sve ostalo (draft, advisory, needs-recheck, retired, ili izvor bez snapshota). */
  advisory: RuleEntry[];
  /** effectiveRules sastavljen ISKLJUCIVO iz bodovanih pravila (prazna baza, bez `rules`). */
  effectiveScored: EffectiveRules;
}

/** Izvor je objavljiv samo ako je snapshotiran (nepromjenjiv PDF plus hash). */
function sourcePublishable(entry: RuleEntry, sourceById: Map<string, SourceEntry>): boolean {
  if (entry.sourceId == null) return false;
  const src = sourceById.get(entry.sourceId);
  return !!src && src.snapshotPath != null && src.snapshotHash != null;
}

/** Racuna objavljeni bodovani skup za jedan profil prema source registryju. */
export function computePublishedRules(profile: ThesisProfile, sources: SourceEntry[]): PublishedRules {
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const scored: RuleEntry[] = [];
  const advisory: RuleEntry[] = [];
  for (const entry of profile.ruleEntries ?? []) {
    if (isRuleScored(entry) && sourcePublishable(entry, sourceById)) scored.push(entry);
    else advisory.push(entry);
  }
  const effectiveScored = compileEffectiveRules({ id: profile.id, rules: {}, ruleEntries: scored });
  return { scored, advisory, effectiveScored };
}

/**
 * Udio bodovano-verificiranih pravila medu strojno provjerljivima (za coverage matricu).
 * Brojnik se filtrira na `machineCheckable`, inace omjer moze preci 100% kad profil ima
 * vise verificiranih ne-strojnih pravila (npr. citation-style) nego strojno provjerljivih -
 * vidi computeCoverageCell u coverage-report.ts (isti obrazac, tamo se stvarno koristi).
 */
export function scoredCoverage(profile: ThesisProfile, sources: SourceEntry[]): {
  scored: number;
  machineCheckable: number;
  ratio: number;
} {
  const { scored } = computePublishedRules(profile, sources);
  const scoredMachineCheckable = scored.filter((e) => e.machineCheckable).length;
  const machineCheckable = (profile.ruleEntries ?? []).filter((e) => e.machineCheckable).length;
  return { scored: scoredMachineCheckable, machineCheckable, ratio: machineCheckable ? scoredMachineCheckable / machineCheckable : 0 };
}
