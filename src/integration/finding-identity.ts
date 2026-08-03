import type { Check, Issue } from '../scoring/checks';
import type { RuleEntry } from '../profiles/profile-schema';

/**
 * Stable transport identity is deliberately separated from human-facing Croatian
 * labels. Known profile-backed checks map to the authored checkId vocabulary;
 * everything else receives a deterministic `engine:*` id.
 */
const CHECK_ID_ALIASES: Array<{ id: string; patterns: RegExp[] }> = [
  { id: 'font', patterns: [/^dominantni font$/i, /font (?:osnovnog|glavnog) teksta/i] },
  { id: 'font-size', patterns: [/veličina osnovnog teksta/i, /velicina osnovnog teksta/i, /veličina fonta/i] },
  { id: 'line-spacing', patterns: [/prored osnovnog teksta/i, /prored glavnog teksta/i] },
  { id: 'margins', patterns: [/^margine dokumenta$/i, /^margine$/i] },
  { id: 'citation-style', patterns: [/citatni stil/i, /stil citiranja/i] },
  { id: 'required-sections', patterns: [/osnovni dijelovi rada/i, /obvezni dijelovi rada/i, /obavezni dijelovi rada/i] },
  { id: 'reference-count', patterns: [/broj izvora/i, /minimalni broj izvora/i] },
  { id: 'word-count', patterns: [/broj riječi/i, /broj rijeci/i, /opseg.*riječ/i, /opseg.*rijec/i] },
  { id: 'page-count', patterns: [/^broj stranica$/i, /opseg.*stranic/i] },
  { id: 'toc', patterns: [/^sadržaj dokumenta$/i, /^sadrzaj dokumenta$/i, /^automatski sadržaj$/i] },
  { id: 'page-numbers', patterns: [/^brojevi stranica$/i, /^numeriranje stranica$/i] },
  { id: 'paper-size', patterns: [/format papira/i, /veličina papira/i, /velicina papira/i] },
  { id: 'justify', patterns: [/poravnanje osnovnog teksta/i, /obostrano poravnanje/i] },
  { id: 'footnote-font', patterns: [/font fusnota/i] },
  { id: 'footnote-size', patterns: [/veličina fusnota/i, /velicina fusnota/i] },
  { id: 'footnote-spacing', patterns: [/prored fusnota/i] },
  { id: 'heading-rules', patterns: [/hijerarhija naslova/i, /pravila naslova/i, /oblikovanje naslova/i] },
];

function slug(value: string): string {
  return String(value || '')
    .replace(/[Đđ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'check';
}

function hash(value: string): string {
  let out = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    out ^= value.charCodeAt(i);
    out = Math.imul(out, 0x01000193);
  }
  return (out >>> 0).toString(36);
}

export function stableCheckId(category: string, title: string): string {
  const text = String(title || '').trim();
  const known = CHECK_ID_ALIASES.find(entry => entry.patterns.some(pattern => pattern.test(text)));
  if (known) return known.id;
  return `engine:${slug(category || 'other')}:${slug(text)}`;
}

function issueSignature(issue: Pick<Issue, 'category' | 'title' | 'where'>): string {
  return `${issue.category}\u001f${issue.title}\u001f${issue.where || ''}`;
}

function checkIdForIssue(issue: Issue, checks: Check[]): string {
  const signature = issueSignature(issue);
  const parent = checks.find(check => check.issue && issueSignature(check.issue) === signature);
  return parent ? stableCheckId(parent.category, parent.title) : stableCheckId(issue.category, issue.title);
}

function preferredRuleEntry(checkId: string, entries: RuleEntry[]): RuleEntry | undefined {
  const candidates = entries.filter(entry => entry.checkId === checkId);
  if (!candidates.length) return undefined;
  return [...candidates].sort((a, b) => {
    const rank = (entry: RuleEntry) => entry.status === 'verified' ? 0 : entry.status === 'advisory' ? 1 : 2;
    return rank(a) - rank(b) || String(a.ruleId).localeCompare(String(b.ruleId));
  })[0];
}

export interface StableFindingIdentity {
  issue: Issue;
  checkId: string;
  ruleId: string | null;
  issueKey: string;
  fixable: boolean;
  fixerId: string | null;
}

/**
 * Resolves stable logical identities for a complete analysis in one pass.
 * A rule-backed finding is keyed by `ruleId`; an engine-only finding by stable
 * `checkId`. Only when the same logical check emits multiple simultaneous
 * occurrences do we add a deterministic private location suffix.
 */
export function identifyFindings(
  checks: Check[] = [],
  issues: Issue[] = [],
  ruleEntries: RuleEntry[] = [],
): StableFindingIdentity[] {
  const provisional = issues.map(issue => {
    const checkId = checkIdForIssue(issue, checks);
    const rule = preferredRuleEntry(checkId, ruleEntries);
    const ruleId = rule?.ruleId || null;
    const base = ruleId ? `rule:${ruleId}` : `check:${checkId}`;
    return { issue, checkId, rule, ruleId, base };
  });

  const counts = new Map<string, number>();
  for (const item of provisional) counts.set(item.base, (counts.get(item.base) || 0) + 1);

  return provisional.map(item => {
    const duplicate = (counts.get(item.base) || 0) > 1;
    const locationSuffix = duplicate
      ? `:loc:${hash(`${item.issue.where || ''}\u001f${item.issue.title || ''}`)}`
      : '';
    return {
      issue: item.issue,
      checkId: item.checkId,
      ruleId: item.ruleId,
      issueKey: `${item.base}${locationSuffix}`,
      fixable: Boolean(item.rule?.status === 'verified' && item.rule?.autoFixable && item.rule?.fixerId),
      fixerId: item.rule?.status === 'verified' && item.rule?.autoFixable ? (item.rule.fixerId || null) : null,
    };
  });
}