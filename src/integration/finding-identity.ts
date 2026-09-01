import type { Check, Issue } from '../scoring/checks';
import type { RuleEntry } from '../profiles/profile-schema';
import { dimensionForCheckId } from '../analysis/check-fixer-map';
import { stableCheckId as registryCheckId } from '../scoring/check-id-registry';

/**
 * Supplemental aliases for profile-backed checks that are not represented in
 * check-fixer-map (that module intentionally focuses on repairable dimensions).
 */
const SUPPLEMENTAL_CHECK_ID_ALIASES: Array<{ id: string; patterns: RegExp[] }> = [
  { id: 'citation-style', patterns: [/citatni stil/i, /stil citiranja/i] },
  { id: 'required-sections', patterns: [/osnovni dijelovi rada/i, /obvezni dijelovi rada/i, /obavezni dijelovi rada/i] },
  { id: 'reference-count', patterns: [/broj izvora/i, /minimalni broj izvora/i] },
  { id: 'word-count', patterns: [/broj riječi/i, /broj rijeci/i, /opseg.*riječ/i, /opseg.*rijec/i] },
  { id: 'page-count', patterns: [/^broj stranica$/i, /opseg.*stranic/i] },
  { id: 'toc', patterns: [/^sadržaj dokumenta$/i, /^sadrzaj dokumenta$/i, /^automatski sadržaj$/i] },
  { id: 'page-numbers', patterns: [/^brojevi stranica$/i, /^numeriranje stranica$/i] },
  { id: 'heading-rules', patterns: [/hijerarhija naslova/i, /pravila naslova/i] },
  { id: 'footnote-font', patterns: [/font fusnota/i] },
  { id: 'footnote-size', patterns: [/veličina fusnota/i, /velicina fusnota/i] },
];

/** Detailed runtime checks that are deterministic children of one authored rule. */
const AUTHORED_RULE_EQUIVALENTS: Record<string, string[]> = {
  'heading-format': ['heading-rules'],
  'page-number-start': ['page-numbers'],
  'page-number-scheme': ['page-numbers'],
  'page-number-alignment': ['page-numbers'],
};

/**
 * MOST IZMEDJU DVA IMENSKA PROSTORA, kljucan na STABILNOM registarskom id-u.
 *
 * Vecina autorskih pravila nosi `checkId` u prostoru dimenzija (`font`, `margins`,
 * `line-spacing`), pa se s nalazom spaja izravnom jednakoscu i most im ne treba. Sest
 * pravila zivi u vlastitom prostoru (`*-rules`) jer opisuju SNOP odredbi, a ne jednu
 * dimenziju. Upravo ta pravila nose doslovan navod: od 91 serviranog unosa s citatom,
 * svih 91 je jedan od tih sest tipova. Bez mosta dokazna lupa je u produkciji prazna.
 *
 * KLJUC JE REGISTARSKI ID (`citation.author-year.missing-reference`), ne rezultat
 * `stableCheckId`. Za ove provjere `stableCheckId` pada na `engine:<kategorija>:<slug
 * hrvatskog naslova>`, pa bi most ovisio o tekstu naslova; preimenovanje naslova tiho bi ga
 * raskopcalo. To je tocno kvar koji `stableCheckId` inace izbjegava time sto ide kroz
 * registar, pa ga ovdje ne uvodimo natrag.
 *
 * SVAKI PAR JE IZVEDEN IZ `value` PRAVILA, ne iz citanja proze. `value` je strojno citljiv
 * i imenuje osi koje pravilo uredjuje:
 *
 *   bibliography-rules      {sort:"alphabetical", authorYearSuffixes:true}
 *                           -> reference.alphabetical, citation.author-year.suffix
 *   citation-sync-rules     {mode:"author-year"}, label "Sinkronizacija citata i
 *                           bibliografije" -> oba smjera te sinkronizacije
 *   section-surgery-rules   {frontMatter:{numbering:"roman",
 *                           removePageNumberFromTitlePage:true},
 *                           mainMatter:{numbering:"decimal", startAt:1}}
 *                           -> shema, izuzeta naslovnica, pocetak numeriranja
 *   required-section-rules  {order:["originality-statement","summary-hr","keywords-hr"]}
 *                           -> dijelovi koje propisuje verificirani profil
 *   element-caption-rules   {labels:{...}, captionPosition:{...}, sourceRequired:true}
 *                           -> naslovi tablica i slika te izvor ispod njih
 *
 * `table-figure-rescue-rules` NAMJERNO NEDOSTAJE. Njegov `value` je
 * `{table:{align:"center"}, figure:{align:"center"}}`, dakle poravnanje, a motor poravnanje
 * tablica i slika ne mjeri nijednom provjerom. Njegov citat spominje i legende, pa bi ga bilo
 * lako zakvaciti na naslove tablica; to bi znacilo navod ciji ENKODIRAN propis govori o
 * necemu drugom. Dok provjera poravnanja ne postoji, to pravilo ostaje bez nalaza.
 */
const RULE_EQUIVALENTS_BY_REGISTRY_ID: Record<string, string[]> = {
  'reference.alphabetical': ['bibliography-rules'],
  'citation.author-year.suffix': ['bibliography-rules'],
  'citation.author-year.missing-reference': ['citation-sync-rules'],
  'reference.uncited': ['citation-sync-rules'],
  'page.numbers.scheme': ['section-surgery-rules'],
  'page.numbers.title-suppressed': ['section-surgery-rules'],
  'page.numbers.start': ['section-surgery-rules'],
  'structure.sections.profile': ['required-section-rules'],
  'element.table.caption': ['element-caption-rules'],
  'element.figure.caption': ['element-caption-rules'],
  'element.source': ['element-caption-rules'],
};

/** Citljiv izvoz za gardove: par (registarski id, autorska pravila). */
export const RULE_BRIDGE_BY_REGISTRY_ID: Readonly<Record<string, readonly string[]>> =
  RULE_EQUIVALENTS_BY_REGISTRY_ID;

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

/**
 * Namespace note: this returns a REPAIR DIMENSION key (`margins`, `font`, `paper-size`, ...),
 * not a registry check id (`page.margins`). That is deliberate - `preferredRuleEntry` joins the
 * result against `RuleEntry.checkId`, which lives in the dimension namespace.
 *
 * The title -> dimension step is no longer duplicated here: it goes through the shared registry
 * (`stableCheckId` in scoring) and `dimensionForCheckId`, so renaming a Croatian check title
 * cannot silently desynchronise this module from the rest of the engine.
 */
export function stableCheckId(category: string, title: string): string {
  const text = String(title || '').trim();

  // Existing Repair/Triage source of truth wins. This keeps cross-product
  // identity aligned with the check IDs already used inside Lekta itself.
  const dimension = dimensionForCheckId(registryCheckId(text));
  if (dimension) return dimension;

  const supplemental = SUPPLEMENTAL_CHECK_ID_ALIASES.find(entry =>
    entry.patterns.some(pattern => pattern.test(text)),
  );
  if (supplemental) return supplemental.id;

  return `engine:${slug(category || 'other')}:${slug(text)}`;
}

function issueSignature(issue: Pick<Issue, 'category' | 'title' | 'where'>): string {
  return `${issue.category}\u001f${issue.title}\u001f${issue.where || ''}`;
}

/**
 * Nalaz nosi DVA identiteta i oba su potrebna. `checkId` je prostor dimenzija i ostaje kljuc
 * `issueKey`-ja; `registryId` je stabilan identitet provjere i sluzi ISKLJUCIVO mostu.
 */
function identityForIssue(issue: Issue, checks: Check[]): { checkId: string; registryId: string } {
  const signature = issueSignature(issue);
  const parent = checks.find(check => check.issue && issueSignature(check.issue) === signature);
  const source = parent || issue;
  const declared = typeof (parent as Check | undefined)?.id === 'string' ? String((parent as Check).id).trim() : '';
  return {
    checkId: stableCheckId(source.category, source.title),
    // Provjera nosi stabilan `id` od 2026-08-16; naslov je fallback za jos neregistrirane.
    registryId: declared || registryCheckId(String(source.title || '').trim()) || '',
  };
}

function preferredRuleEntry(checkId: string, registryId: string, entries: RuleEntry[]): RuleEntry | undefined {
  const authoredIds = [
    checkId,
    ...(AUTHORED_RULE_EQUIVALENTS[checkId] || []),
    ...(RULE_EQUIVALENTS_BY_REGISTRY_ID[registryId] || []),
  ];
  const candidates = entries.filter(entry => entry.checkId && authoredIds.includes(entry.checkId));
  if (!candidates.length) return undefined;
  return [...candidates].sort((a, b) => {
    const exactA = a.checkId === checkId ? 0 : 1;
    const exactB = b.checkId === checkId ? 0 : 1;
    const rank = (entry: RuleEntry) => entry.status === 'verified' ? 0 : entry.status === 'advisory' ? 1 : 2;
    return exactA - exactB || rank(a) - rank(b) || String(a.ruleId).localeCompare(String(b.ruleId));
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
 *
 * Direct authored check:
 *   rule:<ruleId>
 * Authored parent rule + more specific runtime child check:
 *   rule:<ruleId>:check:<checkId>
 * Engine-only check:
 *   check:<checkId>
 *
 * The child suffix depends only on schema identity, never on what sibling
 * findings happen to be present in a particular analysis. If the exact same
 * logical rule/check emits multiple occurrences, only then is a private location
 * hash appended.
 */
export function identifyFindings(
  checks: Check[] = [],
  issues: Issue[] = [],
  ruleEntries: RuleEntry[] = [],
): StableFindingIdentity[] {
  const withBase = issues.map(issue => {
    const { checkId, registryId } = identityForIssue(issue, checks);
    const rule = preferredRuleEntry(checkId, registryId, ruleEntries);
    const ruleId = rule?.ruleId || null;
    const isRuntimeChild = Boolean(rule?.checkId && rule.checkId !== checkId);
    const base = ruleId
      ? (isRuntimeChild ? `rule:${ruleId}:check:${checkId}` : `rule:${ruleId}`)
      : `check:${checkId}`;
    return { issue, checkId, rule, ruleId, base };
  });

  const counts = new Map<string, number>();
  for (const item of withBase) counts.set(item.base, (counts.get(item.base) || 0) + 1);

  return withBase.map(item => {
    const duplicateOccurrence = (counts.get(item.base) || 0) > 1;
    const locationSuffix = duplicateOccurrence
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