import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';

/**
 * "Oblik poveznica" na 246 stvarnih radova NIJE pala nijednom (246/246 punih bodova). Takva
 * provjera je KANDIDAT za prazan gard, pa se ne zatvara dojmom nego podmetnutim ulazom.
 *
 * Ishod mjerenja: provjera je ZDRAVA, samo uska. Trazi dva stvarna kvara, oba rijetka u praksi:
 * poveznicu prelomljenu razmakom i poveznicu koja nosi kutne/viticaste zagrade. Ovaj test to
 * dokazuje umjesto da se oslanja na to sto korpus slucajno ne sadrzi.
 *
 * Ne mijenja se nista u motoru; test postoji da se 246/246 vise ne cita kao sumnja.
 */

const TNR = 'Times New Roman';
const p = (text: string): ParaSpec => ({ text, font: TNR, sizePt: 12 });
const linkCheck = (r: any) => (r.checks || []).find((c: any) => c.title === 'Oblik poveznica');

/** Dovoljno tijela da analiza ima sto mjeriti, bez ijedne poveznice. */
function body(): ParaSpec[] {
  const s = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. ';
  return Array.from({ length: 6 }, () => p(s.repeat(6)));
}

describe('Oblik poveznica: gard koji na korpusu nikad nije pao', () => {
  it('BASELINE: uredne poveznice prolaze punim bodovima', async () => {
    const file = buildDocxFile(
      { paragraphs: [...body(), p('Dostupno na https://www.ffzg.unizg.hr/upute.pdf (pristupljeno 1. 5. 2026.).')] },
      'linkovi-uredni.docx',
    );
    const c = linkCheck(await analyzeFixture(file));
    expect(c.earned).toBe(c.max);
  });

  it('poveznica prelomljena razmakom PADA', async () => {
    // Klasican kvar kod kopiranja iz PDF-a: URL se prelomi pa se nastavak cita kao zaseban token.
    const file = buildDocxFile(
      { paragraphs: [...body(), p('Dostupno na https://www.ffzg unizg.hr/upute.pdf danas.')] },
      'linkovi-prelomljeni.docx',
    );
    const c = linkCheck(await analyzeFixture(file));
    expect(c.earned).toBeLessThan(c.max);
    expect(c.detail).toContain('poveznic');
  });

  it('poveznica sa zagradama u adresi PADA', async () => {
    const file = buildDocxFile(
      { paragraphs: [...body(), p('Izvor: https://example.hr/rad<1>.pdf')] },
      'linkovi-zagrade.docx',
    );
    const c = linkCheck(await analyzeFixture(file));
    expect(c.earned).toBeLessThan(c.max);
  });

  it('dokument bez ijedne poveznice se ne kaznjava', async () => {
    // Kontrola u drugom smjeru: odsutnost poveznica nije kvar.
    const c = linkCheck(await analyzeFixture(buildDocxFile({ paragraphs: body() }, 'linkovi-nema.docx')));
    expect(c.earned).toBe(c.max);
  });
});
