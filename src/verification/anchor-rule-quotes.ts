import type { RuleEntry, ThesisProfile, SourceEntry, VerificationLedgerEntry } from '../profiles/profile-schema';
import { stableJson } from './ai-evidence-audit';

export type QuoteAnchorCode = 'anchored' | 'already-literal' | 'ambiguous' | 'not-found' | 'source-unavailable' | 'quote-missing' | 'status-ineligible';
export interface QuoteAnchorPlan {
  profile: ThesisProfile;
  ledger: VerificationLedgerEntry[];
  decisions: Array<{ ruleId: string; code: QuoteAnchorCode }>;
}
type Snapshot = { text: string; sha256: string };
type Sources = Readonly<Record<string, SourceEntry | undefined>>;
type Snapshots = Readonly<Record<string, Snapshot | undefined>>;

interface FoldedText { text: string; spans: Array<{ start: number; end: number }> }

/** Kanonski citat ne ovisi o Windows/macOS/Linux zavrsetku retka. */
function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

/** Search-only normalization. Spans retain exact original offsets for the final quote. */
function fold(value: string): FoldedText {
  const chars: string[] = [];
  const spans: FoldedText['spans'] = [];
  for (let start = 0; start < value.length;) {
    const point = String.fromCodePoint(value.codePointAt(start)!);
    const end = start + point.length;
    const normalized = point
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .normalize('NFD').replace(/\p{M}/gu, '')
      .replace(/[“”„«»]/g, '"').replace(/[‘’‚]/g, "'")
      .replace(/[‐‑‒–—―−]/g, '-');
    if (!normalized && spans.length) spans[spans.length - 1].end = end;
    for (const char of normalized) {
      const space = /\s/u.test(char);
      if (space && chars.at(-1) === ' ') {
        spans[spans.length - 1].end = end;
      } else {
        const emitted = space ? ' ' : char;
        for (let unit = 0; unit < emitted.length; unit++) {
          chars.push(emitted[unit]);
          spans.push({ start, end });
        }
      }
    }
    start = end;
  }
  while (chars[0] === ' ') { chars.shift(); spans.shift(); }
  while (chars.at(-1) === ' ') { chars.pop(); spans.pop(); }
  return { text: chars.join(''), spans };
}

function uniqueLiteralQuote(quote: string, snapshot: string): { code: 'anchored'; quote: string } | { code: 'ambiguous' | 'not-found' } {
  const needle = fold(quote).text;
  if (!needle) return { code: 'not-found' };
  const haystack = fold(snapshot);
  let found = -1;
  for (let at = haystack.text.indexOf(needle); at !== -1; at = haystack.text.indexOf(needle, at + 1)) {
    if (found !== -1) return { code: 'ambiguous' };
    found = at;
  }
  if (found === -1) return { code: 'not-found' };
  const start = haystack.spans[found].start;
  const end = haystack.spans[found + needle.length - 1].end;
  return { code: 'anchored', quote: normalizeLineEndings(snapshot.slice(start, end)) };
}

/** Pure profile transition: never guesses a quote when a normalized match is absent or ambiguous. */
export function anchorRuleQuotes(profile: ThesisProfile, sources: Sources, snapshots: Snapshots, now: string): QuoteAnchorPlan {
  const ledger: VerificationLedgerEntry[] = [];
  const decisions: QuoteAnchorPlan['decisions'] = [];
  const ruleEntries = (profile.ruleEntries ?? []).map((entry): RuleEntry => {
    let code: QuoteAnchorCode;
    const source = entry.sourceId ? sources[entry.sourceId] : undefined;
    const snapshot = entry.sourceId ? snapshots[entry.sourceId] : undefined;
    if (entry.status !== 'verified' && entry.status !== 'draft' && entry.status !== 'needs-recheck') code = 'status-ineligible';
    else if (!entry.quote?.trim()) code = 'quote-missing';
    else if (!source || !snapshot || !source.snapshotHash || source.snapshotHash !== snapshot.sha256) code = 'source-unavailable';
    else if (normalizeLineEndings(snapshot.text).includes(entry.quote)) code = 'already-literal';
    else {
      const match = uniqueLiteralQuote(entry.quote, snapshot.text);
      code = match.code;
      if (match.code === 'anchored') {
        const hadAiEvidence = entry.aiEvidence != null;
        const updated: RuleEntry = hadAiEvidence
          ? { ...entry, quote: match.quote, status: 'needs-recheck', scored: false,
            autoFixable: false, aiEvidence: null, confirmedVia: null,
            aiEvidenceApprovedCanonical: undefined }
          : entry.status === 'verified'
            ? { ...entry, quote: match.quote }
            : { ...entry, quote: match.quote, status: 'needs-recheck', scored: false,
              ...(entry.autoFixable === true ? { autoFixable: false } : {}) };
        ledger.push({
          id: `led-${profile.id}-${entry.ruleId}-quote-anchored-${now}`,
          ruleId: entry.ruleId, profileId: profile.id, action: 'quote-anchored', actor: 'quote-anchor',
          timestamp: now, sourceId: entry.sourceId ?? null, sourcePage: entry.sourcePage ?? null,
          quote: match.quote, oldQuote: entry.quote, newQuote: match.quote, snapshotHash: snapshot.sha256,
          ...(hadAiEvidence ? { note: 'AI dokaz i potvrda uklonjeni; pravilo treba novu provjeru; autoFixable=false.' } : {}),
        });
        decisions.push({ ruleId: entry.ruleId, code });
        return updated;
      }
    }
    decisions.push({ ruleId: entry.ruleId, code });
    return entry;
  });
  return { profile: { ...profile, ruleEntries }, ledger, decisions };
}

/** Independent write guard for the plan, including the append-only ledger and protected claim fields. */
export function validateQuoteAnchorPlan(before: ThesisProfile, plan: QuoteAnchorPlan, sources: Sources, snapshots: Snapshots): string[] {
  const errors: string[] = [];
  const prior = before.ruleEntries ?? [];
  const next = plan.profile.ruleEntries ?? [];
  if (before.id !== plan.profile.id || prior.length !== next.length) return ['profile-shape-changed'];
  const changed = new Set<string>();
  for (let i = 0; i < prior.length; i++) {
    const old = prior[i];
    const current = next[i];
    if (old.ruleId !== current.ruleId) { errors.push(`${old.ruleId}: rule-id-changed`); continue; }
    const { quote: _oldQuote, status: _oldStatus, scored: _oldScored, aiEvidence: _oldEvidence,
      autoFixable: _oldAutoFixable, confirmedVia: _oldConfirmedVia,
      aiEvidenceApprovedCanonical: _oldApprovedCanonical, ...oldProtected } = old;
    const { quote: _newQuote, status: _newStatus, scored: _newScored, aiEvidence: _newEvidence,
      autoFixable: _newAutoFixable, confirmedVia: _newConfirmedVia,
      aiEvidenceApprovedCanonical: _newApprovedCanonical, ...newProtected } = current;
    if (stableJson(oldProtected) !== stableJson(newProtected)) errors.push(`${old.ruleId}: other-field-changed`);
    if (stableJson(old.value) !== stableJson(current.value)
        || old.modality !== current.modality || old.scope !== current.scope || old.sourcePage !== current.sourcePage) {
      errors.push(`${old.ruleId}: protected-claim-changed`);
    }
    if (old.quote === current.quote) {
      if (old.status !== current.status || old.scored !== current.scored
          || old.autoFixable !== current.autoFixable || old.confirmedVia !== current.confirmedVia
          || old.aiEvidenceApprovedCanonical !== current.aiEvidenceApprovedCanonical) {
        errors.push(`${old.ruleId}: unanchored-rule-changed`);
      }
      if (stableJson(old.aiEvidence) !== stableJson(current.aiEvidence)) errors.push(`${old.ruleId}: unanchored-evidence-changed`);
      continue;
    }
    changed.add(old.ruleId);
    const snapshot = old.sourceId ? snapshots[old.sourceId] : undefined;
    const source = old.sourceId ? sources[old.sourceId] : undefined;
    if (!snapshot || !source || snapshot.sha256 !== source.snapshotHash || !current.quote
        || current.quote !== normalizeLineEndings(current.quote)
        || !normalizeLineEndings(snapshot.text).includes(current.quote)
        || fold(old.quote ?? '').text !== fold(current.quote).text) {
      errors.push(`${old.ruleId}: quote-not-anchored-to-source`);
    }
    if (old.aiEvidence != null) {
      if (current.status !== 'needs-recheck' || current.scored !== false) errors.push(`${old.ruleId}: recheck-required`);
      if (current.aiEvidence != null || current.confirmedVia != null
          || current.aiEvidenceApprovedCanonical != null) errors.push(`${old.ruleId}: stale-evidence-retained`);
      if (current.autoFixable !== false) errors.push(`${old.ruleId}: auto-fixable-not-cleared`);
    } else if (old.status === 'verified') {
      if (current.status !== old.status || current.scored !== old.scored) errors.push(`${old.ruleId}: human-status-changed`);
      if (current.autoFixable !== old.autoFixable || current.confirmedVia !== old.confirmedVia
          || current.aiEvidenceApprovedCanonical !== old.aiEvidenceApprovedCanonical
          || stableJson(current.aiEvidence) !== stableJson(old.aiEvidence)) {
        errors.push(`${old.ruleId}: human-confirmation-changed`);
      }
    } else {
      if (current.status !== 'needs-recheck' || current.scored !== false) errors.push(`${old.ruleId}: recheck-required`);
      if (current.autoFixable !== (old.autoFixable === true ? false : old.autoFixable)
          || current.confirmedVia !== old.confirmedVia
          || current.aiEvidenceApprovedCanonical !== old.aiEvidenceApprovedCanonical) {
        errors.push(`${old.ruleId}: other-field-changed`);
      }
      if (stableJson(current.aiEvidence) !== stableJson(old.aiEvidence)) errors.push(`${old.ruleId}: stale-evidence-retained`);
    }
    const events = plan.ledger.filter((event) => event.ruleId === old.ruleId);
    if (events.length !== 1 || events[0].action !== 'quote-anchored' || events[0].profileId !== before.id
        || events[0].sourceId !== (old.sourceId ?? null) || events[0].sourcePage !== (old.sourcePage ?? null)
        || events[0].oldQuote !== old.quote || events[0].newQuote !== current.quote
        || events[0].quote !== current.quote || events[0].snapshotHash !== snapshot?.sha256
        || (old.aiEvidence != null && !events[0].note?.includes('AI'))) {
      errors.push(`${old.ruleId}: anchor-ledger-missing-or-mismatched`);
    }
  }
  if (plan.ledger.some((event) => !changed.has(event.ruleId))) errors.push('unexpected-anchor-ledger');
  return errors;
}
