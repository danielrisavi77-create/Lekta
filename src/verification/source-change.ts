import type { ThesisProfile, RuleEntry, SourceEntry } from '../profiles/profile-schema';

/**
 * Detekcija promjene izvora (VERIFICATION_PIPELINE.md sekcija 5).
 *
 * Periodicki posao ponovno dohvati svaki izvor i usporedi hash. Ako se hash promijenio,
 * sva pravila vezana na taj izvor degradiraju se na `status: needs-recheck`, `scored:
 * false`, i upisuje se ledger zapis `degraded`. Zivi proizvod prestaje bodovati ta
 * pravila dok ih covjek ne reverificira.
 *
 * Ova funkcija je CISTA: ne mijenja ulaz, nego vraca plan degradacije (koja pravila u
 * kojem profilu i zasto). Pozivatelj primjenjuje promjene na profile i ledger.
 */

export interface SourceChange {
  sourceId: string;
  /** Hash zabiljezen u registru u trenutku zadnje verifikacije/snimke. */
  knownHash: string | null;
  /** Hash svjeze dohvacenog izvora. */
  freshHash: string | null;
}

export interface RuleDegradation {
  profileId: string;
  ruleId: string;
  sourceId: string;
  reason: 'source-hash-changed';
  fromStatus: RuleEntry['status'];
}

/** Vraca skup sourceId-jeva ciji se hash promijenio. */
export function changedSourceIds(changes: SourceChange[]): Set<string> {
  const out = new Set<string>();
  for (const c of changes) {
    if (c.knownHash !== c.freshHash) out.add(c.sourceId);
  }
  return out;
}

/**
 * Usporedi svjeze hasheve s registrom i vrati popis pravila koja treba degradirati.
 * Degradiraju se samo pravila koja trenutno doprinose (status verified ili scored).
 */
export function planDegradations(
  profiles: ThesisProfile[],
  registry: SourceEntry[],
  freshHashBySourceId: Map<string, string | null>,
): RuleDegradation[] {
  const changed = new Set<string>();
  for (const src of registry) {
    if (!freshHashBySourceId.has(src.id)) continue;
    const fresh = freshHashBySourceId.get(src.id) ?? null;
    if (src.snapshotHash !== fresh) changed.add(src.id);
  }

  const out: RuleDegradation[] = [];
  for (const profile of profiles) {
    for (const entry of profile.ruleEntries ?? []) {
      if (entry.sourceId == null || !changed.has(entry.sourceId)) continue;
      const contributes = entry.status === 'verified' || entry.scored === true;
      if (!contributes) continue;
      out.push({
        profileId: profile.id,
        ruleId: entry.ruleId,
        sourceId: entry.sourceId,
        reason: 'source-hash-changed',
        fromStatus: entry.status,
      });
    }
  }
  return out;
}
