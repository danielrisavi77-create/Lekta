/**
 * DOCX-01: status bodovane provjere ne smije lagati.
 *
 * Zatecen kvar (potvrdjen u kodu i u commitanom golden baselineu): `Sadrzaj dokumenta` i
 * `Brojevi stranica` slali su doslovno `profile.requireToc?'pass':'pass'`, odnosno
 * `profile.requirePageNumbers?'pass':'pass'`. Kad je profil trazio sadrzaj a njega nije bilo,
 * rezultat je bio 0/5 bodova + nalaz severityja `error`, ali `status === 'pass'`.
 *
 * Golden snapshoti su taj kvar nosili u 17 blokova. Ovaj test gadja pozivno mjesto (prva brava);
 * druga brava je invarijanta u makeCheck (tests/check-status-invariant.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile } from './helpers/docx-builder.ts';
import { analyzeFixture } from '../src/analysis/golden-entry.ts';

const PROFILE = 'fpzg-politologija-diplomski'; // requireToc + requirePageNumbers

const BODY: Array<{ text: string; font: string; sizePt: number; spacing15: true; jc: 'both' }> = [
  'Uvod',
  'Ovo je tijelo rada koje sluzi kao nosivi tekst za analizu oblikovanja i strukture.',
  'Zakljucak',
  'Literatura',
].map((text) => ({ text, font: 'Times New Roman', sizePt: 12, spacing15: true as const, jc: 'both' as const }));

function findCheck(result: any, title: string) {
  const c = (result.checks || []).find((x: any) => x.title === title);
  expect(c, `provjera "${title}" nije pronadjena`).toBeTruthy();
  return c;
}

describe('DOCX-01: nedostajuci sadrzaj i brojevi stranica ne smiju biti pass', () => {
  it('sadrzaj koji profil trazi, a dokumenta nema, daje fail (ne pass)', async () => {
    const file = buildDocxFile({ paragraphs: BODY, footer: { page: false } });
    const result = await analyzeFixture(file, { profileId: PROFILE });
    const toc = findCheck(result, 'Sadržaj dokumenta');

    expect(toc.max).toBe(5);
    expect(toc.earned).toBe(0);
    expect(toc.status).toBe('fail');
    // Nalaz i status moraju govoriti isto: error uz pass je bio upravo taj kvar.
    expect(toc.issue?.severity).toBe('error');
  });

  it('brojevi stranica koje profil trazi, a dokumenta nema, daju fail (ne pass)', async () => {
    const file = buildDocxFile({ paragraphs: BODY, footer: { page: false } });
    const result = await analyzeFixture(file, { profileId: PROFILE });
    const pages = findCheck(result, 'Brojevi stranica');

    expect(pages.max).toBe(4);
    expect(pages.earned).toBe(0);
    expect(pages.status).toBe('fail');
    expect(pages.issue?.severity).toBe('error');
  });

  it('kad su prisutni, obje provjere i dalje prolaze s punim bodovima', async () => {
    const file = buildDocxFile({
      paragraphs: [
        { text: 'Sadržaj', font: 'Times New Roman', sizePt: 12 },
        {
          raw:
            '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
            String.raw`<w:r><w:instrText xml:space="preserve"> TOC \o "1-3" \h \z \u </w:instrText></w:r>` +
            '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
            '<w:r><w:t xml:space="preserve">Uvod&#9;1</w:t></w:r>' +
            '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>',
        },
        ...BODY,
      ],
      footer: { page: true, align: 'right' },
    });
    const result = await analyzeFixture(file, { profileId: PROFILE });

    const toc = findCheck(result, 'Sadržaj dokumenta');
    expect(toc.earned).toBe(5);
    expect(toc.status).toBe('pass');

    const pages = findCheck(result, 'Brojevi stranica');
    expect(pages.earned).toBe(4);
    expect(pages.status).toBe('pass');
  });

  it('nijedna bodovana provjera ne smije nositi pass uz izgubljene bodove', async () => {
    const file = buildDocxFile({ paragraphs: BODY, footer: { page: false } });
    const result = await analyzeFixture(file, { profileId: PROFILE });

    const lying = (result.checks || []).filter((c: any) => c.max > 0 && c.earned < c.max && c.status === 'pass');
    expect(lying.map((c: any) => `${c.title} ${c.earned}/${c.max}`)).toEqual([]);
  });
});
