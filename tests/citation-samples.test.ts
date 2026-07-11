import { describe, it, expect } from 'vitest';

import { parseReference, type BulkStyle } from '../src/citations/parse-reference';
import { parseAuthors } from '../src/tools/citation';
import samples from './fixtures/citation-samples.json';

/**
 * CROSS-STYLE KONSENZUS na STVARNIM harvestiranim citatima (Hrcak daje isti clanak u vise
 * stilova). Isti clanak MORA dati ista polja (godina/vol/broj/str/naslov/prezimena) u svakom
 * stilu; ako jedan odstupa, taj parser ima rupu. Ground truth bez ljudskih oznaka (redundancija
 * stilova). Ovo je QA PARSERA (softver), NE proglasavanje pravila (to ostaje ljudsko).
 * Pipeline koji ovo generira: scripts/citation-parser-audit.mjs (+harvest preko web alata).
 */
const norm = (s: string | undefined): string =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
// PRVI autor (svi stilovi ga navode); cijeli skup NE - stilovi legitimno skracuju (et al./i sur./...).
const firstSurname = (a: string | undefined): string => {
  const p = parseAuthors(a || '');
  return p.length ? norm(p[0].last) : '';
};

const FIELDS = ['aut', 'god', 'cas', 'vol', 'broj', 'str', 'nas'] as const;
function proj(f: Record<string, any>): Record<string, string> {
  return {
    aut: firstSurname(f.authors), god: f.year || '', cas: norm(f.container),
    vol: f.volume || '', broj: f.issue || '', str: (f.pages || '').replace(/\s/g, ''), nas: norm(f.title),
  };
}
function mode(vals: string[]): string {
  const c: Record<string, number> = {};
  for (const v of vals) if (v) c[v] = (c[v] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

describe('cross-style konsenzus (stvarni Hrcak citati)', () => {
  for (const art of samples.articles) {
    const styles = art.styles as Record<string, string>;
    const parsed: Record<string, Record<string, string>> = {};
    for (const [style, ref] of Object.entries(styles)) parsed[style] = proj(parseReference(ref, style as BulkStyle).fields);
    const consensus: Record<string, string> = {};
    for (const fld of FIELDS) consensus[fld] = mode(Object.values(parsed).map((p) => p[fld]));

    it(`${art.id}: svi stilovi (${Object.keys(styles).join(', ')}) daju ista polja`, () => {
      for (const [style, p] of Object.entries(parsed)) {
        for (const fld of FIELDS) {
          if (!consensus[fld]) continue;
          // svaki stil mora imati polje i slagati se s konsenzusom
          expect(`${style}.${fld}=${p[fld]}`).toBe(`${style}.${fld}=${consensus[fld]}`);
        }
      }
    });
  }
});
