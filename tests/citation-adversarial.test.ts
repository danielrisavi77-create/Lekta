import { describe, it, expect } from 'vitest';

import { parseReference, type BulkStyle } from '../src/citations/parse-reference';
import { parseAuthors } from '../src/tools/citation';
import fixture from './fixtures/citation-adversarial.json';

/**
 * ADVERSARIJALNA regresija: rucno sastavljene teske reference (knjige/monografije/zbornici, svi
 * stilovi) koje je nasao adversarijalni workflow (finder+skeptik) i koje su BILE stvarni bugovi
 * parsera (kriva/prazna vrijednost na CESTOM stvarnom obliku, ne dvosmislenost). Ovo hvata
 * dijeljene bugove i oblike koje round-trip (nas renderer) i cross-style konsenzus ne pokrivaju.
 * Isti projektor polja kao scripts/parse-check.mjs; str se prosiruje (elsevier krati zavrsnu).
 */
const norm = (s: string | undefined): string =>
  (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '');
const firstSurname = (a: string | undefined): string => {
  const p = parseAuthors(a || '');
  return p.length ? norm(p[0].last) : '';
};
function normPages(p: string | undefined): string {
  const m = (p || '').replace(/\s/g, '').match(/^(\d+)[-–](\d+)$/);
  if (!m) return (p || '').replace(/\s/g, '');
  let [, a, b] = m;
  if (b.length < a.length) b = a.slice(0, a.length - b.length) + b;
  return a === b ? a : `${a}-${b}`;
}
function projField(fld: string, f: Record<string, any>): string {
  switch (fld) {
    case 'aut': return firstSurname(f.authors);
    case 'god': return (f.year || '').toString();
    case 'vol': return (f.volume || '').toString();
    case 'broj': return (f.issue || '').toString();
    case 'str': return normPages(f.pages);
    case 'cas': return norm(f.container);
    case 'nas': return norm(f.title);
    case 'mj': return norm(f.place);
    case 'izd': return norm(f.publisher);
    case 'inst': return norm(f.institution);
    case 'ured': return norm(f.editor);
    default: return '';
  }
}
function projExpect(fld: string, v: string): string {
  if (fld === 'str') return normPages(v);
  if (['god', 'vol', 'broj'].includes(fld)) return (v ?? '').toString();
  return norm(v);
}

describe('parseReference: adversarijalne rupe knjige/monografije/zbornici (regresija)', () => {
  for (const [i, c] of (fixture.cases as Array<{ style: string; raw: string; expect: Record<string, string> }>).entries()) {
    it(`#${i} [${c.style}] ${c.raw.slice(0, 60)}...`, () => {
      const r = parseReference(c.raw, c.style as BulkStyle);
      const f = r.fields as Record<string, any>;
      for (const [fld, want] of Object.entries(c.expect)) {
        expect(`${fld}=${projField(fld, f)}`).toBe(`${fld}=${projExpect(fld, want)}`);
      }
    });
  }
});
