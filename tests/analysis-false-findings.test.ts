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
import { ZipReader } from '../src/docx/parser';
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

  it('razlog svakog dopustenog nalaza stoji u samom paketu (Codex #184 F5)', async () => {
    for (const a of ALLOWED_FINDINGS) {
      const bytes = new Uint8Array(readFileSync(join(DIR, `${a.doc}.docx`)));
      const xml = await new ZipReader(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer).text(a.evidence.part);
      expect(xml.length, `${a.doc}: ${a.evidence.part} prazan ili ne postoji`).toBeGreaterThan(0);
      expect(a.evidence.contains ?? a.evidence.lacks, `${a.doc}: dokaz bez tvrdnje`).toBeTruthy();
      if (a.evidence.contains) expect(xml, `${a.doc}|${a.checkId}`).toContain(a.evidence.contains);
      if (a.evidence.lacks) expect(xml, `${a.doc}|${a.checkId}`).not.toContain(a.evidence.lacks);
    }
  });

  // Codex #184 F4: matrica pokriva 11 fixtura s profilom; tvrdnja o stavkama literature mjeri se na
  // svih 14. Heuristika word-styles ne ovisi o profilu, pa se fixturi bez profila vrte sa zadanim.
  it('nijedan od 14 poznato ispravnih fixtura nema kandidata za rucno oblikovan naslov', async () => {
    expect(KNOWN_CORRECT.length).toBeGreaterThanOrEqual(14);
    for (const doc of KNOWN_CORRECT) {
      const profileId = JSON.parse(readFileSync(join(DIR, `${doc}.json`), 'utf8')).profileId as string | null;
      const result: any = await analyzeFixture(new File([readFileSync(join(DIR, `${doc}.docx`))], `${doc}.docx`), profileId ? { profileId } : {});
      const check = result.checks.find((c: any) => c.id === 'structure.heading.word-styles');
      expect(check?.detail, doc).toMatch(/Nisu pronađeni očiti ručno oblikovani naslovi$/);
    }
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

  // Codex #184 F1, F2: clanstvo u zapisima literature nije dovoljno za izuzece.
  it.each([
    ['numerirani podnaslov literature', [heading('Uvod'), body(TEXT), heading('Literatura'), body('1. Knjige'), ...ENTRIES.slice(1).map(body)], '1. Knjige'],
    ['naslov iza zalutalog odlomka Literatura', [heading('Uvod'), body(TEXT), body('Literatura'), body('2. Metodologija istraživanja'), body(TEXT)], '2. Metodologija istraživanja'],
    ['naslov s godinom iza zalutalog odlomka Literatura', [heading('Uvod'), body(TEXT), body('Literatura'), body('2. Razvoj novinarstva od 1990. do 2000. godine'), body(TEXT)], '2. Razvoj novinarstva od 1990. do 2000. godine'],
  ] as const)('%s ostaje kandidat', async (_name, paragraphs, expected) => {
    const check = await wordStyles([...paragraphs]);
    expect([check.status, check.earned, check.detail]).toEqual(['warn', 2, '1 numeriranih kratkih odlomaka bez Heading stila']);
    expect(check.issue.detail).toContain(expected);
  });

  // Codex #184 F3: izvan prepoznate literature nista se ne izuzima; to je zateceno ponasanje, ne popravak.
  it.each([
    ['bez naslova Literatura', [heading('Uvod'), body(TEXT), ...ENTRIES.map(body)]],
    ['iza zavrsnog dijela Prilozi', [heading('Uvod'), body(TEXT), heading('Prilozi'), ...ENTRIES.map(body)]],
    ['iza sljedeceg Heading naslova', [heading('Uvod'), body(TEXT), heading('Literatura'), body('0. Ranić, A. (2019). Mediji i javnost. Zagreb: Naklada.'), heading('Dodatak'), ...ENTRIES.map(body)]],
  ] as const)('granica, %s: numerirane stavke ostaju kandidati (zateceno ponasanje)', async (_name, paragraphs) => {
    const check = await wordStyles([...paragraphs]);
    expect([check.status, check.earned, check.detail]).toEqual(['warn', 2, '3 numeriranih kratkih odlomaka bez Heading stila']);
  });
});
