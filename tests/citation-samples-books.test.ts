import { describe, it, expect } from 'vitest';

import { parseReference, type BulkStyle } from '../src/citations/parse-reference';
import { parseAuthors } from '../src/tools/citation';
import samples from './fixtures/citation-samples-books.json';

/**
 * CROSS-STYLE KONSENZUS na STVARNIM harvestiranim citatima KNJIGA / MONOGRAFIJA / POGLAVLJA /
 * ZBORNIKA (rad u zborniku). Hrcak daje samo clanke; ovdje koristimo doi.org content negotiation
 * (nezavisni CSL procesor): isti DOI u vise stilova = ground truth BEZ ljudskih oznaka. Stil->parser:
 * apa->apa, ieee->ieee, elsevier-vancouver->vancouver. Isti clanak MORA dati ista polja
 * (prvi autor/godina/container/str/naslov) u svakom stilu; ako jedan odstupa, taj parser ima rupu.
 * Ovo je QA PARSERA (softver), NE proglasavanje pravila (koji fakultet trazi koji stil = ljudsko).
 * Pipeline koji ovo generira: scripts/harvest-doi-citations.mjs (+audit citation-parser-audit.mjs).
 */
const norm = (s: string | undefined): string =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
// PRVI autor (svi stilovi ga navode); cijeli skup NE - stilovi legitimno skracuju (et al./i sur./...).
const firstSurname = (a: string | undefined): string => {
  const p = parseAuthors(a || '');
  return p.length ? norm(p[0].last) : '';
};
// Raspon stranica: elsevier krati zavrsnu ("84-9" = 84-89, "11-11" = 11); prosiri prije usporedbe.
function normPages(p: string | undefined): string {
  const m = (p || '').replace(/\s/g, '').match(/^(\d+)[-–](\d+)$/);
  if (!m) return (p || '').replace(/\s/g, '');
  let [, a, b] = m;
  if (b.length < a.length) b = a.slice(0, a.length - b.length) + b;
  return a === b ? a : `${a}-${b}`;
}

const FIELDS = ['aut', 'god', 'cas', 'vol', 'broj', 'str', 'nas'] as const;
function proj(f: Record<string, any>): Record<string, string> {
  return {
    aut: firstSurname(f.authors), god: f.year || '', cas: norm(f.container),
    vol: f.volume || '', broj: f.issue || '', str: normPages(f.pages), nas: norm(f.title),
  };
}
function mode(vals: string[]): string {
  const c: Record<string, number> = {};
  for (const v of vals) if (v) c[v] = (c[v] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

describe('cross-style konsenzus knjige/poglavlja/zbornici (stvarni doi.org/CSL citati)', () => {
  for (const art of samples.articles) {
    const styles = art.styles as Record<string, string>;
    const parsed: Record<string, Record<string, string>> = {};
    for (const [style, ref] of Object.entries(styles)) parsed[style] = proj(parseReference(ref, style as BulkStyle).fields);
    const consensus: Record<string, string> = {};
    for (const fld of FIELDS) consensus[fld] = mode(Object.values(parsed).map((p) => p[fld]));

    it(`${art.id} (${art.type}): svi stilovi (${Object.keys(styles).join(', ')}) daju ista polja`, () => {
      for (const [style, p] of Object.entries(parsed)) {
        for (const fld of FIELDS) {
          if (!consensus[fld]) continue;
          expect(`${style}.${fld}=${p[fld]}`).toBe(`${style}.${fld}=${consensus[fld]}`);
        }
      }
    });
  }
});
