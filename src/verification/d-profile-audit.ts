import type { RuleEntry } from '../profiles/profile-schema';

export type DRuleDisposition =
  | 'auto-candidate'
  | 'assisted-candidate'
  | 'advisory-only'
  | 'manual-content'
  | 'unsupported';

export type DProfileDisposition = 'repair-candidate' | 'needs-scored-rule' | 'manual-content-blocked';

export interface DProfileAuditInput {
  profileId: string;
  ruleEntries: readonly RuleEntry[];
}

export interface DRuleAuditItem {
  ruleId: string;
  checkId: string | null;
  label: string | null;
  disposition: DRuleDisposition;
  fixerId: string | null;
  reason: string;
  status: RuleEntry['status'] | null;
  scored: boolean;
  sourceId: string | null;
  sourcePage: string | null;
  quote: string | null;
}

export interface DProfileAudit {
  profileId: string;
  disposition: DProfileDisposition;
  rules: DRuleAuditItem[];
}

const AUTO_FIXERS: Record<string, string> = {
  font: 'font-fixer',
  'font-size': 'font-fixer',
  'line-spacing': 'line-spacing-fixer',
  margins: 'margins-fixer',
  'paper-size': 'paper-size-fixer',
  justify: 'alignment-fixer',
  'paragraph-spacing': 'paragraph-spacing-fixer',
  'footnote-spacing': 'footnote-spacing-fixer',
  'page-number-alignment': 'page-number-alignment-fixer',
};

const ASSISTED_FIXERS: Record<string, string> = {
  toc: 'toc-field-fixer',
  'page-number-start-at-intro': 'page-numbering-fixer',
  'page-number-scheme': 'page-numbering-fixer',
  'required-section-rules': 'required-section-fixer',
  'heading-rules': 'heading-style-fixer',
};

const CONTENT_RULES = new Set(['page-count', 'word-count']);

function auditRule(entry: RuleEntry): DRuleAuditItem {
  const common = {
    ruleId: entry.ruleId,
    checkId: entry.checkId ?? null,
    label: entry.label ?? null,
    status: entry.status ?? null,
    scored: entry.scored === true,
    sourceId: entry.sourceId ?? null,
    sourcePage: entry.sourcePage ?? null,
    quote: entry.quote ?? null,
  };

  if (entry.status === 'advisory' || entry.scored !== true) {
    return {
      ...common,
      disposition: 'advisory-only',
      fixerId: entry.recommendedFixerId ?? null,
      reason: 'pravilo nije bodovano i ne moze samo podici profil na B',
    };
  }

  if (entry.autoFixable === true && entry.fixerId) {
    return {
      ...common,
      disposition: 'auto-candidate',
      fixerId: entry.fixerId,
      reason: 'profil vec ima eksplicitno vezan deterministicki fixer',
    };
  }

  const autoFixer = entry.checkId ? AUTO_FIXERS[entry.checkId] : undefined;
  if (autoFixer) {
    return {
      ...common,
      disposition: 'auto-candidate',
      fixerId: autoFixer,
      reason: 'postoji siguran auto fixer, ali profil ga jos nema vezanog',
    };
  }

  const assistedFixer = entry.checkId ? ASSISTED_FIXERS[entry.checkId] : undefined;
  if (assistedFixer) {
    return {
      ...common,
      disposition: 'assisted-candidate',
      fixerId: assistedFixer,
      reason: 'postoji deterministicki assisted fixer koji trazi potvrdu zahvata',
    };
  }

  if (entry.checkId && CONTENT_RULES.has(entry.checkId)) {
    return {
      ...common,
      disposition: 'manual-content',
      fixerId: null,
      reason: 'pravilo mjeri opseg ili sadrzaj i ne smije se popravljati pisanjem rada',
    };
  }

  return {
    ...common,
    disposition: 'unsupported',
    fixerId: null,
    reason: 'nema sigurnog deterministickog fixera za ovu dimenziju',
  };
}

export function auditDProfile(input: DProfileAuditInput): DProfileAudit {
  const rules = input.ruleEntries.map(auditRule).sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  const hasBlockedRule = rules.some((rule) => rule.disposition === 'manual-content' || rule.disposition === 'unsupported');
  const hasRepairCandidate = rules.some((rule) => rule.disposition === 'auto-candidate' || rule.disposition === 'assisted-candidate');
  return {
    profileId: input.profileId,
    disposition: hasBlockedRule ? 'manual-content-blocked' : hasRepairCandidate ? 'repair-candidate' : 'needs-scored-rule',
    rules,
  };
}
