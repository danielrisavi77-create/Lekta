import type {
  ThesisProfile,
  RuleEntry,
  SourceEntry,
  VerificationLedgerEntry,
} from '../profiles/profile-schema';
import { isRuleScored } from './verification-gate';

/**
 * Cisti prijelazi statusa za verifikacijsku konzolu (VERIFICATION_PIPELINE.md sekcije 4,
 * 8 i 9). Konzola je samo tanki DOM nad ovim funkcijama.
 *
 * Covjek je jedini koji proglasava `verified` (sekcija 11). Ove funkcije ne diraju disk
 * ni globalno stanje: vracaju AZURIRANO pravilo plus ledger zapis koji pozivatelj
 * primjenjuje (u klijentu: preuzimanje zakrpe i ledger dodatka dok backend ne postoji).
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

/** Jedan prolaz adversarijalne AI provjere (extract / quote-check / refute). */
export interface AiPassVerdict {
  pass: 'extract' | 'quote-check' | 'refute';
  verdict: 'confirm' | 'mismatch' | 'refute';
  note: string;
}

/** Dokazi 3-prolazne AI provjere za jedno pravilo. */
export interface AiEvidence {
  ruleId: string;
  passes: AiPassVerdict[];
  /** Sva tri prolaza slozna (extract confirm + quote-check confirm + refute nije refutirao). */
  agree: boolean;
  summary: string;
}

export interface BatchApproveResult {
  ok: boolean;
  errors?: string[];
  entry?: RuleEntry;
  /** Dva zapisa: AI potvrda (actor ai-3pass) i ljudsko odobrenje (actor = approver). */
  ledger?: VerificationLedgerEntry[];
}

/**
 * Batch odobrenje pravila koje je AI 3-prolazno potvrdio (opcija C). Covjek je odobravatelj
 * i preuzima akontabilnost (status postaje verified, boduje se), ali trag iskreno biljezi
 * da je citanje izvora radio AI (`confirmedVia: 'ai-3pass-batch'`, ledger action 'ai-confirmed'
 * uz 'verified'). Odbija ako se 3 prolaza ne slazu ili ako pravilo nije sljedivo do izvora.
 */
export function approveFromAi(
  profileId: string,
  entry: RuleEntry,
  source: SourceEntry | undefined,
  input: { approver: string; now: string },
  evidence: AiEvidence,
): BatchApproveResult {
  const errors: string[] = [];
  if (!evidence.agree) errors.push('AI prolazi se ne slazu; pravilo ide na rucnu provjeru, ne batch.');
  if (!OFFICIAL.has(entry.authority)) errors.push('Pravilo nema sluzbeni autoritet.');
  if (entry.sourceId == null) errors.push('Pravilo nema sourceId.');
  else if (!source) errors.push(`Izvor "${entry.sourceId}" ne postoji.`);
  else if (source.snapshotPath == null || source.snapshotHash == null) errors.push(`Izvor "${entry.sourceId}" nije snapshotiran.`);
  if (!entry.sourcePage) errors.push('Pravilo nema sourcePage.');
  if (!entry.quote) errors.push('Pravilo nema quote.');
  if (!input.approver || !input.approver.trim()) errors.push('approver je obvezan (covjek koji odobrava).');
  if (errors.length) return { ok: false, errors };

  const approver = input.approver.trim();
  const updated: RuleEntry = {
    ...entry,
    status: 'verified',
    verifiedBy: approver,
    confirmedVia: 'ai-3pass-batch',
    lastVerified: input.now,
    verifiedHash: source!.snapshotHash,
  };
  const aiLedger: VerificationLedgerEntry = {
    id: ledgerId(entry.ruleId, 'ai-confirmed', input.now),
    ruleId: entry.ruleId,
    profileId,
    action: 'ai-confirmed',
    actor: 'ai-3pass',
    timestamp: input.now,
    sourceId: entry.sourceId ?? null,
    sourcePage: entry.sourcePage ?? null,
    quote: entry.quote ?? null,
    note: `3-prolazna AI provjera: ${evidence.summary}`,
  };
  const humanLedger: VerificationLedgerEntry = {
    id: ledgerId(entry.ruleId, 'verified', input.now),
    ruleId: entry.ruleId,
    profileId,
    action: 'verified',
    actor: approver,
    timestamp: input.now,
    sourceId: entry.sourceId ?? null,
    sourcePage: entry.sourcePage ?? null,
    quote: entry.quote ?? null,
    note: 'Batch odobrenje AI-potvrdjenog pravila; covjek preuzeo akontabilnost (confirmedVia ai-3pass-batch).',
  };
  return { ok: true, entry: updated, ledger: [aiLedger, humanLedger] };
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
