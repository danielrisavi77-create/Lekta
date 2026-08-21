/**
 * DOCX-06: `w:cr` i `w:ptab` nisu bili razdjelnici, pa su se rijeci slijepile.
 *
 * `paragraphText` je prevodio `w:tab` u tabulator i `w:br` u novi red, ali `w:cr` (prijelom retka
 * unutar runa) i `w:ptab` (apsolutni tabulator) nije poznavao. Tekst s obje strane takvog elementa
 * spajao se BEZ razmaka, pa su dvije rijeci postajale jedna.
 *
 * Izmjereno prije popravka, isti sadrzaj od 10 rijeci:
 *   w:br (kontrola)  +10 rijeci   ispravno
 *   w:cr              +9          slijepljeno
 *   w:ptab            +9          slijepljeno
 *
 * Steta nije samo u brojci. Slijepljen tekst kvari i prepoznavanje po tekstu: naziv dijela rada
 * ("Uvod" + w:cr + "u temu" -> "Uvodu temu"), citatnice i naslove.
 *
 * Asimetrija koja je kvar drzala skrivenim: popravci (src/repair/fixers.ts) `w:cr`, `w:sym` i
 * `w:ptab` odavno poznaju; analiza ih nije.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder.ts';
import { analyzeFixture } from '../src/analysis/golden-entry.ts';
import { paragraphText, parseXml } from '../src/docx/parser.ts';

const PROFILE = 'fpzg-politologija-diplomski';
const FMT = { font: 'Times New Roman', sizePt: 12, spacing15: true as const, jc: 'both' as const };
const TEN = 'jedan dva tri cetiri pet sest sedam osam devet deset';

const BODY: ParaSpec[] = [
  { text: 'Uvod', ...FMT },
  { text: 'Alfa beta gama delta epsilon zeta eta theta jota kapa lambda mi.', ...FMT },
  { text: 'Zakljucak', ...FMT },
];

/** Isti sadrzaj od 10 rijeci, razdvojen zadanim elementom umjesto razmakom. */
const splitBy = (element: string): ParaSpec => ({
  raw:
    '<w:p><w:r><w:t xml:space="preserve">jedan dva tri</w:t>' +
    element +
    '<w:t xml:space="preserve">cetiri pet sest sedam osam devet deset</w:t></w:r></w:p>',
});

async function words(extra: ParaSpec[]): Promise<number> {
  const r: any = await analyzeFixture(buildDocxFile({ paragraphs: [...BODY, ...extra] }), { profileId: PROFILE });
  return Number(r.stats?.words);
}

describe('DOCX-06: w:cr i w:ptab su razdjelnici', () => {
  it('w:cr ne slijepljuje rijeci', async () => {
    const base = await words([]);
    expect(await words([splitBy('<w:br/>')]) - base, 'kontrola: w:br').toBe(10);
    expect(await words([splitBy('<w:cr/>')]) - base, 'w:cr je slijepio dvije rijeci').toBe(10);
  });

  it('w:ptab ne slijepljuje rijeci', async () => {
    const base = await words([]);
    expect(await words([splitBy('<w:ptab w:alignment="left" w:relativeTo="margin" w:leader="none"/>')]) - base).toBe(10);
  });

  it('paragraphText umece razdjelnik, ne prazninu', () => {
    const xml = (el: string) =>
      parseXml(
        '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
          `<w:r><w:t>Uvod</w:t>${el}<w:t>u temu</w:t></w:r></w:p>`,
        'test',
      ).documentElement;

    // Bez razdjelnika bi ovo bilo "Uvodu temu" i naziv dijela rada se ne bi prepoznao.
    expect(paragraphText(xml('<w:cr/>'))).toBe('Uvod\nu temu');
    expect(paragraphText(xml('<w:ptab/>'))).toBe('Uvod\tu temu');
    // Postojece ponasanje ostaje netaknuto.
    expect(paragraphText(xml('<w:br/>'))).toBe('Uvod\nu temu');
    expect(paragraphText(xml('<w:tab/>'))).toBe('Uvod\tu temu');
  });
});
