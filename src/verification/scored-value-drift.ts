import type { ThesisProfile, SourceEntry } from '../profiles/profile-schema';
import { computeBaseDemotedAdvisory } from '../profiles/advisory-demotion';
import { computePublishedRules } from './published-rules';
import { citationMeta } from '../citations/citation-meta';
import { findScoredValueFindings, type ScoredValueFinding } from './scored-value-binding';

/**
 * Sastavljanje artefakta `data/verification/scored-value-drift.json`.
 *
 * Odvojeno od skripte koja ga pise (`scripts/generate-scored-value-drift.mts`) iz istog razloga kao
 * `src/repair/recipe.ts`: drift guard mora moci PONOVNO IZRACUNATI isti objekt i usporediti ga s
 * commitanim, inace artefakt tiho zastari.
 *
 * Profili se PREDAJU, ne uvoze: `drafts-runtime` povlaci ~1,3 MB draftova kroz import.meta.glob i
 * nema sto traziti u ovisnostima modula koji zivi u `src/verification/`.
 */

export interface CitationStyleFinding {
  profileId: string;
  ruleId: string | null;
  /**
   * `non-canonical-token`: tvrdnja nosi ljudski opis ("apa", "autor-godina", "fusnote ili uglate
   *   zagrade s brojem") umjesto kanonskog tokena iz citation-meta, pa se uopce ne moze usporediti
   *   s onim sto motor pokrece. Kanonski token je `apa7`, ne `apa`.
   * `value-mismatch`: oba su kanonska, a razlicita.
   * `not-applied`: tvrdnja postoji, a motor nema `recommendedCitation`, pa radi na korisnikovu
   *   zatecenom odabiru stila umjesto na onome sto izvor navodi.
   */
  kind: 'non-canonical-token' | 'value-mismatch' | 'not-applied';
  claimValue: unknown;
  liveValue: unknown;
  scored: boolean;
  sourceId: string | null;
  sourcePage: string | null;
}

export interface ScoredValueDriftArtifact {
  note: string;
  schemaVersion: 1;
  counts: Record<string, number>;
  /** profileId -> checkId-jevi koje demotija gasi zbog raskoraka. Cita ga advisory-demotion.ts. */
  demotedByProfile: Record<string, string[]>;
  findings: ScoredValueFinding[];
  citationStyle: CitationStyleFinding[];
}

/**
 * Kanonski token je onaj koji citation-meta stvarno poznaje. `custom` je fallback pa se ne moze
 * prepoznati usporedbom s fallbackom; provjerava se izricito na pozivnom mjestu.
 */
function isCanonicalToken(value: unknown): value is string {
  return typeof value === 'string' && citationMeta(value).label !== citationMeta('').label;
}

function citationFindings(profile: ThesisProfile, sources: SourceEntry[]): CitationStyleFinding[] {
  const entries = (profile.ruleEntries ?? []).filter((e) => e.checkId === 'citation-style');
  if (!entries.length) return [];
  const live = (profile.rules as Record<string, unknown> | undefined)?.recommendedCitation ?? null;
  const scoredIds = new Set(computePublishedRules(profile, sources).scored.map((e) => e.ruleId));
  const out: CitationStyleFinding[] = [];
  for (const entry of entries) {
    const base = {
      profileId: profile.id,
      ruleId: entry.ruleId ?? null,
      claimValue: entry.value ?? null,
      liveValue: live,
      scored: scoredIds.has(entry.ruleId),
      sourceId: entry.sourceId ?? null,
      sourcePage: entry.sourcePage ?? null,
    };
    if (!isCanonicalToken(entry.value) && entry.value !== 'custom') {
      out.push({ ...base, kind: 'non-canonical-token' });
      continue;
    }
    if (live == null) out.push({ ...base, kind: 'not-applied' });
    else if (String(entry.value) !== String(live)) out.push({ ...base, kind: 'value-mismatch' });
  }
  return out;
}

/**
 * Racuna cijeli artefakt. `unbacked` se namjerno racuna nad OSNOVNOM demotijom
 * (`computeBaseDemotedAdvisory`), bez raskoraka: da se zove puna verzija, ulaz bi se racunao iz
 * vlastitog izlaza i popis bi se u drugom krugu ispraznio, cime bi demotija nestala a kvar se vratio.
 */
export function buildScoredValueDrift(
  profiles: ThesisProfile[],
  sources: SourceEntry[],
): ScoredValueDriftArtifact {
  const findings: ScoredValueFinding[] = [];
  const citationStyle: CitationStyleFinding[] = [];
  for (const profile of profiles) {
    const demoted = computeBaseDemotedAdvisory({ id: profile.id }, profile.ruleEntries, sources);
    findings.push(
      ...findScoredValueFindings(profile, sources, { demotedCheckIds: new Set(demoted) }),
    );
    citationStyle.push(...citationFindings(profile, sources));
  }

  // Demotira se SAMO `drift`: `unapplied` os ionako ne boduje, a `unbacked` nema sto uskladiti.
  const demotedByProfile: Record<string, string[]> = {};
  for (const f of findings) {
    if (f.kind !== 'drift') continue;
    (demotedByProfile[f.profileId] ??= []).push(f.checkId);
  }
  for (const key of Object.keys(demotedByProfile)) demotedByProfile[key].sort();

  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
  for (const c of citationStyle) counts[`citation:${c.kind}`] = (counts[`citation:${c.kind}`] ?? 0) + 1;
  counts.profilesDemoted = Object.keys(demotedByProfile).length;

  return {
    note: 'GENERIRANO. Ne uredjuj rucno. Regeneriraj s `npm run scored-value-drift`.',
    schemaVersion: 1,
    counts,
    demotedByProfile: Object.fromEntries(Object.entries(demotedByProfile).sort()),
    findings,
    citationStyle,
  };
}
