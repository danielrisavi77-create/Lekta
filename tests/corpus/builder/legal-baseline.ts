/**
 * PROLAZNA baza za PRAVNI profil (fusnote), za atomske/valid slucajeve legal-citation klastera.
 * Profil `pravo-integrirani-diplomski` ima citationMode 'legal-notes' pa analyzeDocx pokrece
 * buildLegalCitationEngine nad Word fusnotama (spec.footnotes -> word/footnotes.xml, id 1..N).
 *
 * Fusnote su slozene da PROLAZE sve pravne provjere (klasifikacija, potpunost, op. cit., Ibid.,
 * propisi, sudska praksa, veza s bibliografijom). Svaki atomski slucaj kvari tocno jednu.
 * Baza se zasebno dokazuje prolaznom (corpus-legal test setup), kao golden disciplina.
 */
import type { DocSpec, ParaSpec } from '../../helpers/docx-builder';
import { line, heading, body } from './baseline';

export const LEGAL_PROFILE_ID = 'pravo-integrirani-diplomski';

/**
 * Fusnote poredane po id-u (1..6):
 *  1 knjiga (Kovač)          - prvo puno navodjenje, sidro za op. cit.
 *  2 zakon (Zakon o radu)    - propis s punim glasilom i brojem
 *  3 clanak (Horvat)         - prvo puno navodjenje clanka
 *  4 Ibid.                   - odmah iza clanka (razrjesiva prethodna biljeska)
 *  5 sudska praksa (VSRH)    - domaca odluka s oznakom i datumom
 *  6 op. cit. u bilj. 1      - ponovljeni navod knjige, autor se poklapa
 */
export const LEGAL_FOOTNOTES: string[] = [
  'Kovač, A., Ustavno pravo Republike Hrvatske, Školska knjiga, Zagreb, 2019., str. 25.',
  'Zakon o radu, Narodne novine, br. 93/14, 127/17, 98/19.',
  'Horvat, I., Načelo razmjernosti u upravnom pravu, Zbornik Pravnog fakulteta u Zagrebu, vol. 70, br. 2, 2020., str. 45.',
  'Ibid., str. 47.',
  'Vrhovni sud Republike Hrvatske, Rev-123/2019-2, od 5. ožujka 2020.',
  'Kovač, op. cit. u bilj. 1, str. 40.',
];

/** Bibliografske jedinice koje se poklapaju s knjigom i clankom iz fusnota (za Fusnote <-> bibliografija). */
export const LEGAL_REFERENCES: string[] = [
  'Horvat, I., Načelo razmjernosti u upravnom pravu, Zbornik Pravnog fakulteta u Zagrebu, vol. 70, br. 2, 2020.',
  'Kovač, A., Ustavno pravo Republike Hrvatske, Školska knjiga, Zagreb, 2019.',
];

export function legalBaselineSpec(): DocSpec {
  const paragraphs: ParaSpec[] = [
    line('Sveučilište u Zagrebu', { jc: 'center' }),
    line('Pravni fakultet', { jc: 'center' }),
    line('Načelo razmjernosti u upravnom postupku', { jc: 'center', sizePt: 16, bold: true }),
    line('Diplomski rad', { jc: 'center' }),
    heading('Sažetak'),
    line('Rad analizira načelo razmjernosti u hrvatskom upravnom pravu s osvrtom na sudsku praksu.', { jc: 'both' }),
    line('Ključne riječi: razmjernost, upravno pravo, sudska praksa'),
    heading('1. Uvod'),
    ...body(360),
    heading('2. Razrada'),
    ...body(900),
    heading('3. Zaključak'),
    ...body(300),
    heading('Literatura'),
    ...LEGAL_REFERENCES.map((r) => line(r)),
  ];
  return { paragraphs, marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 }, footnotes: [...LEGAL_FOOTNOTES] };
}
