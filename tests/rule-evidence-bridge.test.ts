import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { identifyFindings, RULE_BRIDGE_BY_REGISTRY_ID } from '../src/integration/finding-identity';
import { allCheckIds } from '../src/scoring/check-id-registry';
import { buildExactEvidence } from '../src/ui/results/exact-evidence';
import type { RuleEntry } from '../src/profiles/profile-schema';
import type { Check, Issue } from '../src/scoring/checks';

/**
 * MOST NALAZ -> AUTORSKO PRAVILO.
 *
 * Dokazna lupa je do sada bila prazna u produkciji: svih 91 serviranih unosa s doslovnim
 * citatom nosi `checkId` u prostoru `*-rules`, a nalaz svoj `checkId` izvodi u prostoru
 * dimenzija. Most spaja to dvoje po STABILNOM registarskom id-u.
 *
 * Gardovi su namjerno DVOSMJERNI. Mrtav unos je moguc s obje strane: krivo napisan
 * registarski id (motor tu provjeru nikad ne emitira) i pravilo koje vise ne postoji u
 * podacima. Oba tiho oslabe lupu bez ijednog crvenog testa, isto kao dva mrtva pravila koja
 * je svojedobno nasao `check-fixer-map` gard.
 */

const ROOT = resolve(__dirname, '..');

const servedQuotedCheckIds = (() => {
  const artifact = JSON.parse(
    readFileSync(resolve(ROOT, 'data', 'generated', 'profile-rules-server.json'), 'utf8'),
  ) as { profiles?: Record<string, { repairEntries?: Array<Record<string, unknown>> }> };
  const out = new Set<string>();
  for (const profile of Object.values(artifact.profiles || {})) {
    for (const entry of profile?.repairEntries || []) {
      const quote = typeof entry.quote === 'string' ? entry.quote.trim() : '';
      if (quote && typeof entry.checkId === 'string') out.add(entry.checkId);
    }
  }
  return out;
})();

const CITED_TITLE = 'Citirano → literatura';

function check(over: Partial<Check> = {}): Check {
  return {
    id: 'citation.author-year.missing-reference', category: 'citations', title: CITED_TITLE,
    status: 'warn', earned: 0, max: 4, detail: '', issue: null, scored: true, ...over,
  } as Check;
}
function issue(over: Partial<Issue> = {}): Issue {
  return {
    severity: 'warning', category: 'citations', title: CITED_TITLE,
    detail: 'Dva citata nemaju zapis u popisu literature.', where: 'Popis literature', ...over,
  } as Issue;
}
function rule(over: Partial<RuleEntry> = {}): RuleEntry {
  return {
    ruleId: 'ffri-germanistika-diplomski--citation-sync-rules', checkId: 'citation-sync-rules',
    sourceId: 'ffri-leitfaden', quote: 'Quellen fuer Zitate werden im Text angegeben.',
    sourcePage: 'str. 9 (odjeljak 2.4)', status: 'verified',
    source: { id: 'ffri-leitfaden', title: 'Leitfaden', url: 'https://example.test/l.pdf' },
    ...over,
  } as RuleEntry;
}

describe('most nalaz -> autorsko pravilo', () => {
  it('svaki registarski id u mostu POSTOJI u registru provjera', () => {
    // Krivo napisan id ne bi nikad pogodio nijedan nalaz: most bi izgledao siri nego sto jest.
    const known = new Set(allCheckIds());
    const dead = Object.keys(RULE_BRIDGE_BY_REGISTRY_ID).filter((id) => !known.has(id));
    expect(dead).toEqual([]);
  });

  it('svako autorsko pravilo u mostu POSTOJI u serviranim podacima, i to s citatom', () => {
    // Suprotan smjer mrtvog unosa: pravilo koje se vise ne servira ili je ostalo bez citata.
    const referenced = [...new Set(Object.values(RULE_BRIDGE_BY_REGISTRY_ID).flat())];
    const missing = referenced.filter((id) => !servedQuotedCheckIds.has(id));
    expect(missing).toEqual([]);
  });

  it('most pokriva svaki servirani tip pravila s citatom, osim izricito izuzetog', () => {
    // Bez ovoga bi nov tip pravila s citatom tiho ostao bez dokaza u sucelju.
    const bridged = new Set(Object.values(RULE_BRIDGE_BY_REGISTRY_ID).flat());
    const uncovered = [...servedQuotedCheckIds].filter((id) => !bridged.has(id)).sort();
    // `table-figure-rescue-rules` uredjuje poravnanje, a motor poravnanje ne mjeri nijednom
    // provjerom. Ostaje nepokriven dok ta provjera ne postoji; zakvacen na naslove tablica
    // nosio bi navod ciji enkodiran propis govori o necem drugom.
    expect(uncovered).toEqual(['table-figure-rescue-rules']);
  });

  it('parovi su PRIKOVANI, pa se nijedan ne moze tiho izgubiti', () => {
    // Izmjereno: gard iznad mjeri SKUP tipova pravila, pa brisanje jednog od tri para koji
    // gadjaju isti tip (`element.source` uz `element.table.caption`) prolazi neopazeno. Tri
    // provjere bi tiho ostale bez dokaza, a nijedan test ne bi pocrvenio. Zato se popis
    // prikiva doslovno: svaka izmjena mosta mora biti svjesna.
    expect(RULE_BRIDGE_BY_REGISTRY_ID).toEqual({
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
    });
  });

  it('nalaz koji most pokriva DOBIJE doslovan navod iz sluzbene upute', () => {
    const parent = check({ issue: issue() });
    const map = buildExactEvidence([parent], [issue()], [rule()]);
    const values = Object.values(map);
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({
      verified: true,
      quote: 'Quellen fuer Zitate werden im Text angegeben.',
      title: 'Leitfaden',
      pageLabel: 'str. 9 (odjeljak 2.4)',
    });
  });

  it('nalaz nosi identitet pravila, pa se dokaz vise ne veze uz redni broj', () => {
    const parent = check({ issue: issue() });
    const [identity] = identifyFindings([parent], [issue()], [rule()]);
    expect(identity.ruleId).toBe('ffri-germanistika-diplomski--citation-sync-rules');
    expect(identity.issueKey).toContain('rule:ffri-germanistika-diplomski--citation-sync-rules');
  });

  it('pravilo o DRUGOJ osi se ne lijepi na nalaz', () => {
    // `bibliography-rules` uredjuje abecedni poredak; nalaz govori o citatu bez zapisa.
    const parent = check({ issue: issue() });
    const tudje = rule({ ruleId: 'x--bibliography-rules', checkId: 'bibliography-rules' });
    expect(buildExactEvidence([parent], [issue()], [tudje])).toEqual({});
  });

  it('izuzeto pravilo NE dobiva nalaz, makar nosi citat', () => {
    const elementIssue = issue({ category: 'elements', title: 'Naslovi tablica' });
    const parent = check({ id: 'element.table.caption', category: 'elements', title: 'Naslovi tablica', issue: elementIssue });
    const rescue = rule({ ruleId: 'y--table-figure-rescue-rules', checkId: 'table-figure-rescue-rules' });
    expect(buildExactEvidence([parent], [elementIssue], [rescue])).toEqual({});
  });

  it('bez mosta nalaz ostaje bez dokaza, a ne dobiva pogresan', () => {
    const other = issue({ category: 'structure', title: 'Metodologija' });
    const parent = check({ id: 'method.declared', category: 'structure', title: 'Metodologija', issue: other });
    expect(buildExactEvidence([parent], [other], [rule()])).toEqual({});
  });
});
