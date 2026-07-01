import type { ThesisProfile, RuleEntry, SourceEntry } from '../profiles/profile-schema';
import { collectCompileDiagnostics } from '../profiles/rule-compiler';

/**
 * CI vrata verifikacije (VERIFICATION_PIPELINE.md sekcija 6).
 *
 * Profil se ne smije objaviti ako ijedna provjera padne. Vrata su ADITIVNA: ne
 * mijenjaju zivi engine (koji jos boduje preko effectiveRules), nego provjeravaju
 * da nijedno pravilo oznaceno kao bodovano (`scored`) ne laze o svom izvoru. Dok su
 * sva pravila u statusu `draft`/`advisory` (scored:false), vrata prolaze prazno.
 *
 * Izvedeni `scored` je jedini izvor istine; pohranjeni `entry.scored:true` koji se ne
 * moze izvesti je greska (scored-not-derivable). Tako se "bodovano bez izvora" ne moze
 * provuci ni rucnim postavljanjem zastavice.
 *
 * Nije obuhvaceno ovdje (treba snapshot infrastrukturu, pa je zaseban korak): difanje
 * `snapshotHash` kroz vrijeme. Degradaciju na promjenu izvora radi `source-change.ts`.
 */

const OFFICIAL_AUTHORITIES = new Set<RuleEntry['authority']>([
  'binding',
  'program-page',
  'general',
]);

export interface VerificationGateError {
  profileId: string;
  ruleId: string | null;
  code: string;
  message: string;
}

export interface VerificationGateOptions {
  /** Rok valjanosti bodovanog stabilnog pravila u mjesecima (sekcija 6, zadano 24). */
  freshnessMonths?: number;
  /** ISO datum "danas" (za testove); zadano stvarno vrijeme. */
  now?: string;
}

/**
 * Izvedeni `scored` prema sekciji 2: pravilo boduje samo ako je verified, autoritet je
 * sluzbeni (binding | program-page | general), ima sourceId, sourcePage i quote.
 */
export function isRuleScored(entry: RuleEntry): boolean {
  return (
    entry.status === 'verified' &&
    OFFICIAL_AUTHORITIES.has(entry.authority) &&
    entry.sourceId != null &&
    entry.sourcePage != null &&
    entry.quote != null
  );
}

function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return Infinity;
  return (
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth()) +
    (to.getDate() >= from.getDate() ? 0 : -1)
  );
}

/**
 * Pokrece CI vrata nad profilima i source registryjem. Vraca popis gresaka; prazan
 * popis znaci da je objava dopustena.
 */
export function runVerificationGate(
  profiles: ThesisProfile[],
  sources: SourceEntry[],
  options: VerificationGateOptions = {},
): VerificationGateError[] {
  const errors: VerificationGateError[] = [];
  const freshnessMonths = options.freshnessMonths ?? 24;
  const now = options.now ?? new Date().toISOString();
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  const push = (profileId: string, ruleId: string | null, code: string, message: string) =>
    errors.push({ profileId, ruleId, code, message });

  // Svi checkId-jevi moraju biti mapirani (rule-compiler ne smije vratiti diagnostic).
  for (const d of collectCompileDiagnostics(profiles)) {
    push(d.profileId, d.ruleId, 'compiler-diagnostic', d.message);
  }

  for (const profile of profiles) {
    for (const entry of profile.ruleEntries ?? []) {
      const derived = isRuleScored(entry);

      // Pohranjeni scored:true koji se ne moze izvesti je laz o izvoru.
      if (entry.scored === true && !derived) {
        push(
          profile.id,
          entry.ruleId,
          'scored-not-derivable',
          'scored:true, a pravilo ne zadovoljava izvedeni uvjet (verified + sluzbeni autoritet + sourceId + sourcePage + quote).',
        );
      }

      const claimsScored = entry.scored === true || derived;
      if (!claimsScored) continue;

      // Tvrde provjere za svako bodovano pravilo (sekcija 6).
      if (!OFFICIAL_AUTHORITIES.has(entry.authority)) {
        push(profile.id, entry.ruleId, 'scored-authority', 'Bodovano pravilo nema sluzbeni autoritet.');
      }
      if (entry.status !== 'verified') {
        push(profile.id, entry.ruleId, 'scored-not-verified', 'Bodovano pravilo nije u statusu verified.');
      }
      if (entry.sourceId == null) {
        push(profile.id, entry.ruleId, 'scored-no-source', 'Bodovano pravilo nema sourceId.');
      } else if (!sourceById.has(entry.sourceId)) {
        push(profile.id, entry.ruleId, 'orphan-source', `sourceId "${entry.sourceId}" ne postoji u registru.`);
      } else {
        const src = sourceById.get(entry.sourceId)!;
        if (src.snapshotPath == null || src.snapshotHash == null) {
          push(profile.id, entry.ruleId, 'source-no-snapshot', `Izvor "${entry.sourceId}" nema snapshot plus hash.`);
        } else if (entry.verifiedHash != null && entry.verifiedHash !== src.snapshotHash) {
          // Snapshot izvora promijenjen nakon verifikacije: pravilo je verificirano protiv
          // starog teksta i mora na reverifikaciju (sekcija 6, freshness / sekcija 5 degradacija).
          push(
            profile.id,
            entry.ruleId,
            'source-hash-drift',
            `Izvor "${entry.sourceId}" promijenjen nakon verifikacije (verifiedHash se ne slaze sa snapshotHash).`,
          );
        }
      }
      if (entry.sourcePage == null) {
        push(profile.id, entry.ruleId, 'scored-no-page', 'Bodovano pravilo nema sourcePage.');
      }
      if (entry.quote == null) {
        push(profile.id, entry.ruleId, 'scored-no-quote', 'Bodovano pravilo nema quote.');
      }
      if (entry.authority === 'binding' && !entry.reviewedBy) {
        push(profile.id, entry.ruleId, 'binding-no-review', 'Obvezujuce pravilo nema reviewedBy (drugi par ociju).');
      }
      // Freshness: stabilno bodovano pravilo mora biti potvrdeno unutar roka.
      const src = entry.sourceId ? sourceById.get(entry.sourceId) : null;
      const isStable = !src || src.validityClass === 'stable';
      if (isStable) {
        if (!entry.lastVerified) {
          push(profile.id, entry.ruleId, 'scored-no-lastverified', 'Bodovano pravilo nema lastVerified.');
        } else if (monthsBetween(entry.lastVerified, now) > freshnessMonths) {
          push(profile.id, entry.ruleId, 'stale', `Zadnja verifikacija starija od ${freshnessMonths} mjeseci.`);
        }
      }
    }
  }

  return errors;
}
