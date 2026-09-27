/**
 * T26: nema sustavnog laznog nalaza na poznato ispravnim dokumentima.
 *
 * 1. Matrica: svaki uskladjen ili Word fixture iz tests/fixtures/docx-authored s profilom analizira
 *    se prema svom profilu. Svaki bodovani nalaz (earned < max) mora biti na popisu dopustenih u
 *    tests/helpers/false-findings.ts, s razlogom iz paketa; dopusten nalaz koji vise ne nastaje
 *    takoder rusi test, pa se popis samo steze.
 * 2. Uzrok prvog izmjerenog laznog nalaza: `structure.heading.word-styles` hvatao je numerirane
 *    stavke literature ("1. Aston, E. (1991). ...") kao rucno oblikovane naslove. Izmjereno
 *    2026-09-27: 12 od 14 uskladjenih fixtura, uvijek i samo stavke literature.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder';
import { ALLOWED_FINDINGS, WITHOUT_PROFILE, falseFindingProblems, type FindingKey } from './helpers/false-findings';

const DIR = join(process.cwd(), 'tests', 'fixtures', 'docx-authored');
const KNOWN_CORRECT = readdirSync(DIR).filter((n) => /--(uskladjen|word)\.docx$/.test(n)).map((n) => n.replace(/\.docx$/, '')).sort();

describe('lazni nalazi na poznato ispravnim fixturima (T26)', () => {
  it('uzorak nije prazan i iskljuceni su tocno fixturi bez profila', () => {
    const withoutProfile = KNOWN_CORRECT.filter((d) => !JSON.parse(readFileSync(join(DIR, `${d}.json`), 'utf8')).profileId);
    expect(withoutProfile).toEqual([...WITHOUT_PROFILE].sort());
    expect(KNOWN_CORRECT.length - withoutProfile.length).toBeGreaterThanOrEqual(11);
    for (const a of ALLOWED_FINDINGS) expect(KNOWN_CORRECT, a.doc).toContain(a.doc);
  });

  it('svaki bodovani nalaz je dopusten stvarnim odstupanjem u paketu', async () => {
    const observed = new Set<FindingKey>();
    let analyzed = 0;
    for (const doc of KNOWN_CORRECT) {
      const profileId = JSON.parse(readFileSync(join(DIR, `${doc}.json`), 'utf8')).profileId as string | null;
      if (!profileId) continue;
      const result: any = await analyzeFixture(new File([readFileSync(join(DIR, `${doc}.docx`))], `${doc}.docx`), { profileId });
      const scored = result.checks.filter((c: any) => Number(c.max) > 0);
      expect(scored.length, `${doc}: nijedna bodovana provjera`).toBeGreaterThan(0);
      for (const c of scored) {
        expect(typeof c.id, `${doc}: provjera "${c.title}" bez id-a`).toBe('string');
        if (Number(c.earned) < Number(c.max)) observed.add(`${doc}|${c.id}`);
      }
      analyzed++;
    }
    expect(analyzed).toBe(KNOWN_CORRECT.length - WITHOUT_PROFILE.length);
    expect(falseFindingProblems(observed)).toEqual([]);
  }, 120000);
});

describe('stavke literature nisu rucno oblikovani naslovi (T26)', () => {
  const TNR = 'Times New Roman';
  const body = (text: string): ParaSpec => ({ text, font: TNR, sizePt: 12, jc: 'both', spacingLine: 360 });
  const heading = (text: string): ParaSpec => ({ text, font: TNR, sizePt: 12, styleId: 'Heading1' });
  const ENTRIES = [
    '1. Aston, E. i Savona, G. (1991). Theatre as Sign System. London: Routledge.',
    '2. Barba, E. (2006). A Dictionary of Theatre Anthropology. London: Routledge.',
    '3. Elam, K. (2002). The Semiotics of Theatre and Drama. London: Routledge.',
  ];
  const TEXT = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. '.repeat(6);

  async function wordStyles(paragraphs: ParaSpec[]) {
    const result: any = await analyzeFixture(buildDocxFile({ paragraphs }, 'naslovi.docx'));
    const matches = result.checks.filter((c: any) => c.id === 'structure.heading.word-styles');
    expect(matches).toHaveLength(1);
    return matches[0];
  }

  it('numerirane stavke pod naslovom Literatura ne gube bodove', async () => {
    const check = await wordStyles([heading('Uvod'), body(TEXT), heading('Zaključak'), body(TEXT), heading('Literatura'), ...ENTRIES.map(body)]);
    expect([check.status, check.earned, check.max]).toEqual(['pass', 4, 4]);
  });

  it('rucno oblikovan naslov u tijelu i dalje se hvata, bez stavki literature u popisu', async () => {
    const check = await wordStyles([heading('Uvod'), body(TEXT), body('2. Metodologija istraživanja'), body(TEXT), heading('Literatura'), ...ENTRIES.map(body)]);
    expect([check.status, check.earned]).toEqual(['warn', 2]);
    expect(check.detail).toBe('1 numeriranih kratkih odlomaka bez Heading stila');
    expect(check.issue.detail).toContain('2. Metodologija istraživanja');
    expect(check.issue.detail).not.toContain('Aston');
  });

  it('granica: bez naslova Literatura numerirane stavke ostaju kandidati (zateceno ponasanje)', async () => {
    const check = await wordStyles([heading('Uvod'), body(TEXT), ...ENTRIES.map(body)]);
    expect([check.status, check.earned]).toEqual(['warn', 2]);
    expect(check.detail).toBe('3 numeriranih kratkih odlomaka bez Heading stila');
  });
});
