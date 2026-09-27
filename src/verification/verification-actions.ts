import type {
  ThesisProfile,
  RuleEntry,
  SourceEntry,
  VerificationLedgerEntry,
} from '../profiles/profile-schema';
import { isRuleScored } from './verification-gate';
import { hashString } from '../profiles/profile-fingerprint';
import {
  auditAiEvidence,
  stableJson,
  type AiEvidenceAudit,
  type AiEvidenceAuditPass,
  type AiEvidenceExecutionManifest,
} from './ai-evidence-audit';

/**
 * Cisti prijelazi statusa za verifikacijsku konzolu (VERIFICATION_PIPELINE.md sekcije 4,
 * 8 i 9). Konzola je samo tanki DOM nad ovim funkcijama.
 *
 * Funkcije ne diraju disk ni globalno stanje: vracaju AZURIRANO pravilo plus ledger zapis koji
 * pozivatelj primjenjuje. `confirmVerification` je legacy ljudski put; `approveFromAi` prihvaca
 * status verified samo nakon potpunog deterministickog AI-evidence audita.
 *
 * `confirmVerification` forsira ugovor iz sekcije 2: bez sluzbenog autoriteta, sourceId
 * sa snapshotom, sourcePage i quote ne moze postaviti `verified`. Obvezujuca pravila
 * traze drugi par ociju (reviewedBy razlicit od verifiedBy). Time pravilo proizvedeno
 * ovdje uvijek prolazi i CI vrata (verification-gate).
 */

const OFFICIAL = new Set<RuleEntry['authority']>(['binding', 'program-page', 'general']);

/** Pravilo koje ceka covjeka (draft ili needs-recheck), uz svoj profil. */
export interface PendingRule {
  profileId: string;
  entry: RuleEntry;
}

/** Vraca sva pravila u statusu draft ili needs-recheck, redom po profilu. */
export function pendingRules(profiles: ThesisProfile[]): PendingRule[] {
  const out: PendingRule[] = [];
  for (const profile of profiles) {
    for (const entry of profile.ruleEntries ?? []) {
      if (entry.status === 'draft' || entry.status === 'needs-recheck') {
        out.push({ profileId: profile.id, entry });
      }
    }
  }
  return out;
}

/** Ulaz koji covjek unosi pri potvrdi pravila uz otvoren snapshot izvora. */
export interface ConfirmInput {
  sourcePage: string;
  quote: string;
  verifiedBy: string;
  /** Obvezno za `binding` pravila (drugi par ociju, razlicit od verifiedBy). */
  reviewedBy?: string | null;
  /** ISO datum potvrde. */
  now: string;
  /** Tko upisuje radnju u ledger (zadano verifiedBy). */
  actor?: string;
}

export type ActionResult =
  | { ok: true; entry: RuleEntry; ledger: VerificationLedgerEntry }
  | { ok: false; errors: string[] };

function ledgerId(ruleId: string, action: string, now: string): string {
  return `led-${ruleId}-${action}-${now}`;
}

/**
 * Potvrda pravila kao `verified` (sekcija 4, korak 5). Stampa `verifiedHash` iz trenutnog
 * snapshota izvora pa kasniji drift vrata ulove. Vraca gresku ako ugovor nije zadovoljen;
 * tada se status NE mijenja.
 */
export function confirmVerification(
  profileId: string,
  entry: RuleEntry,
  source: SourceEntry | undefined,
  input: ConfirmInput,
): ActionResult {
  const errors: string[] = [];
  if (!OFFICIAL.has(entry.authority)) {
    errors.push('Pravilo nema sluzbeni autoritet (binding, program-page ili general); koristi advisory.');
  }
  if (entry.sourceId == null) {
    errors.push('Pravilo nema sourceId.');
  } else if (!source) {
    errors.push(`Izvor "${entry.sourceId}" ne postoji u registru.`);
  } else if (source.snapshotPath == null || source.snapshotHash == null) {
    errors.push(`Izvor "${entry.sourceId}" nema nepromjenjiv snapshot plus hash.`);
  }
  if (!input.sourcePage || !input.sourcePage.trim()) errors.push('sourcePage je obvezan i ne nagada se.');
  if (!input.quote || !input.quote.trim()) errors.push('quote (doslovni citat ili lokator) je obvezan.');
  if (!input.verifiedBy || !input.verifiedBy.trim()) errors.push('verifiedBy je obvezan.');
  if (entry.authority === 'binding') {
    const reviewer = input.reviewedBy?.trim();
    if (!reviewer) errors.push('Obvezujuce pravilo trazi reviewedBy (drugi par ociju).');
    else if (reviewer === input.verifiedBy.trim()) errors.push('reviewedBy mora biti razlicit od verifiedBy.');
  }
  if (errors.length) return { ok: false, errors };

  const verifiedBy = input.verifiedBy.trim();
  const updated: RuleEntry = {
    ...entry,
    status: 'verified',
    sourcePage: input.sourcePage.trim(),
    quote: input.quote.trim(),
    verifiedBy,
    reviewedBy: entry.authority === 'binding' ? input.reviewedBy!.trim() : entry.reviewedBy ?? null,
    lastVerified: input.now,
    verifiedHash: source!.snapshotHash,
  };
  const ledger: VerificationLedgerEntry = {
    id: ledgerId(entry.ruleId, 'verified', input.now),
    ruleId: entry.ruleId,
    profileId,
    action: 'verified',
    actor: (input.actor ?? verifiedBy).trim(),
    timestamp: input.now,
    sourceId: entry.sourceId ?? null,
    sourcePage: updated.sourcePage ?? null,
    quote: updated.quote ?? null,
    note: 'Covjek potvrdio uz otvoren snapshot izvora; verifiedHash zabiljezen.',
  };
  return { ok: true, entry: updated, ledger };
}

/** Pojedinačni prolaz i potpuni dokazni paket koji validator deterministički provjerava. */
export type AiPassVerdict = AiEvidenceAuditPass;
export type AiEvidence = AiEvidenceAudit;

export interface BatchApproveResult {
  ok: boolean;
  errors?: string[];
  entry?: RuleEntry;
  /** Jedan append-only zapis AI-evidence potvrde; nema ljudskog verified zapisa. */
  ledger?: VerificationLedgerEntry[];
}

/**
 * Potvrđuje pravilo samo ako deterministički audit veže profil, izvor, snapshot, citat, vrijednost,
 * opseg, modalitet i razriješeni izvršni manifest. Nepotpun dokaz ostaje neverified bez ljudskog reda.
 */
export function approveFromAi(
  profileId: string,
  entry: RuleEntry,
  source: SourceEntry | undefined,
  input: { now: string; snapshotBytes: Uint8Array; snapshotSha256?: string; currentRepairSourceHash?: string;
    ruleValueSha256?: string; snapshotText: string; manifest: AiEvidenceExecutionManifest | null },
  evidence: AiEvidence | undefined,
): BatchApproveResult {
  const errors: string[] = [];
  const legacyBatch = entry.status === 'verified'
    && (
      entry.verifiedBy === 'owner-bulk-approval'
      || entry.confirmedVia === 'ai-1pass-batch'
      || entry.confirmedVia === 'ai-3pass-batch'
    );
  const individuallyHumanVerified = entry.status === 'verified' && entry.confirmedVia === 'human';
  const alreadyAiVerified = entry.status === 'verified' && entry.confirmedVia === 'ai-evidence-audit';
  if (entry.status !== 'draft' && entry.status !== 'needs-recheck' && entry.status !== 'ai-confirmed'
      && !legacyBatch && !individuallyHumanVerified && !alreadyAiVerified) {
    errors.push('rule-not-pending: samo draft, needs-recheck, pojedinačno ljudski potvrđeno ili prepoznato legacy batch pravilo može proći novi AI audit.');
  }
  const audit = auditAiEvidence({
    profileId,
    rule: entry,
    source,
    snapshotBytes: input.snapshotBytes,
    snapshotSha256: input.snapshotSha256,
    currentRepairSourceHash: input.currentRepairSourceHash,
    ruleValueSha256: input.ruleValueSha256,
    snapshotText: input.snapshotText,
    evidence,
    manifest: input.manifest,
  });
  if (!audit.valid) errors.push(...audit.reasons.map((reason) => `${reason.code}: ${reason.message}`));
  if (errors.length || !evidence) return { ok: false, errors };
  const canonicalEvidence = stableJson(evidence);
  if (alreadyAiVerified && (entry.aiEvidenceApprovedCanonical === canonicalEvidence
      || (entry.aiEvidenceApprovedCanonical == null && evidence.schemaVersion === 1))) {
    return { ok: true, entry, ledger: [] };
  }

  const updated: RuleEntry = {
    ...entry,
    status: 'verified',
    verifiedBy: 'ai-evidence-audit',
    reviewedBy: null,
    confirmedVia: 'ai-evidence-audit',
    aiEvidence: evidence,
    aiEvidenceApprovedCanonical: canonicalEvidence,
    modalitySource: 'ai-evidence-audit',
    lastVerified: input.now,
    verifiedHash: source!.snapshotHash,
  };
  updated.scored = isRuleScored(updated);
  const ledger: VerificationLedgerEntry = {
    id: alreadyAiVerified
      ? `${ledgerId(entry.ruleId, 'ai-confirmed', input.now)}-${hashString(canonicalEvidence)}`
      : ledgerId(entry.ruleId, 'ai-confirmed', input.now),
    ruleId: entry.ruleId,
    profileId,
    action: 'ai-confirmed',
    actor: 'ai-evidence-audit',
    timestamp: input.now,
    sourceId: entry.sourceId ?? null,
    sourcePage: entry.sourcePage ?? null,
    quote: entry.quote ?? null,
    note: `Deterministički AI-evidence audit; manifest ${evidence.execution.manifestId}: ${evidence.summary}`,
  };
  return { ok: true, entry: updated, ledger: [ledger] };
}

/** Oznaka pravila kao advisory (savjet s linkom, ne boduje se). */
export function makeAdvisory(
  profileId: string,
  entry: RuleEntry,
  input: { actor: string; now: string; note?: string },
): ActionResult {
  const updated: RuleEntry = { ...entry, status: 'advisory' };
  const ledger: VerificationLedgerEntry = {
    id: ledgerId(entry.ruleId, 'advisory', input.now),
    ruleId: entry.ruleId,
    profileId,
    action: 'advisory',
    actor: input.actor,
    timestamp: input.now,
    sourceId: entry.sourceId ?? null,
    sourcePage: entry.sourcePage ?? null,
    quote: entry.quote ?? null,
    note: input.note ?? 'Bez sljedivog izvora; prikazuje se kao savjet s linkom.',
  };
  return { ok: true, entry: updated, ledger };
}

/** Povlacenje pravila iz upotrebe. */
export function retireRule(
  profileId: string,
  entry: RuleEntry,
  input: { actor: string; now: string; note?: string },
): ActionResult {
  const updated: RuleEntry = { ...entry, status: 'retired' };
  const ledger: VerificationLedgerEntry = {
    id: ledgerId(entry.ruleId, 'retired', input.now),
    ruleId: entry.ruleId,
    profileId,
    action: 'retired',
    actor: input.actor,
    timestamp: input.now,
    sourceId: entry.sourceId ?? null,
    sourcePage: entry.sourcePage ?? null,
    quote: entry.quote ?? null,
    note: input.note ?? 'Pravilo povuceno.',
  };
  return { ok: true, entry: updated, ledger };
}

/** Brza provjera: hoce li potvrdeno pravilo stvarno bodovati (izvedeni scored). */
export function willScore(entry: RuleEntry): boolean {
  return isRuleScored(entry);
}
