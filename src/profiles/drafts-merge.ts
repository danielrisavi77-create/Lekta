import type { RuleEntry } from './profile-schema';

/**
 * Spajanje izvora nacrta u jedan pogled po profilu (Faza D integracija).
 *
 * Dva oblika staging datoteka zive pod data/profiles/<faculty>/drafts/:
 *   - agregirana (npr. law-drafts.json): { profiles: { profileId: RuleEntry[] } }.
 *     Ovo je AUTORITATIVAN staging (Faza C seed, izveden iz `rules`, faithfulness
 *     dokazana: effectiveRules deep-equal rules).
 *   - po profilu/celiji (fan-out iz /draft-batch): { profileId, entries: RuleEntry[] }.
 *     Izvedeno iz snapshota; vrijednosti mogu legitimno odstupati od `rules`.
 *
 * Semantika je GAP-FILL, ne override: agregirani staging pobjeduje za svoj profileId;
 * fan-out datoteka se primjenjuje SAMO na profile koji jos nemaju staging. Time se ne
 * dira faithfulness seedanih profila (effectiveRules ostaje deep-equal rules) i nema
 * dvostrukih pravila. Novi fakultet (bez seeda) automatski dobije svoja pravila iz fan-outa.
 */

export interface AggregatedDraftFile {
  profiles: Record<string, RuleEntry[]>;
}

export interface FanoutDraftFile {
  profileId: string;
  entries: RuleEntry[];
}

export interface MergeResult {
  /** ruleEntries po profileId nakon spajanja. */
  profiles: Record<string, RuleEntry[]>;
  /** profileId-jevi cije su fan-out datoteke preskocene jer agregirani staging vec postoji. */
  ignored: string[];
}

function dedupeByRuleId(entries: RuleEntry[]): RuleEntry[] {
  const byId = new Map<string, RuleEntry>();
  for (const e of entries) byId.set(e.ruleId, e); // zadnji pobjeduje
  return [...byId.values()];
}

/**
 * Spaja agregirane staging mape (autoritativne) s fan-out datotekama (gap-fill).
 * Fan-out datoteke za vec stageani profil idu u `ignored`. Vise fan-out datoteka za
 * isti NOVI profil se nadovezuje (dedup po ruleId).
 */
export function mergeDraftSources(
  aggregated: AggregatedDraftFile[],
  fanout: FanoutDraftFile[],
): MergeResult {
  const profiles: Record<string, RuleEntry[]> = {};
  for (const agg of aggregated) {
    for (const [id, entries] of Object.entries(agg.profiles ?? {})) {
      profiles[id] = entries;
    }
  }

  const ignored: string[] = [];
  const fresh = new Map<string, RuleEntry[]>();
  for (const file of fanout) {
    if (!file || !file.profileId) continue;
    if (profiles[file.profileId]) {
      ignored.push(file.profileId);
      continue;
    }
    const acc = fresh.get(file.profileId) ?? [];
    acc.push(...(file.entries ?? []));
    fresh.set(file.profileId, acc);
  }
  for (const [id, entries] of fresh) profiles[id] = dedupeByRuleId(entries);

  return { profiles, ignored };
}
