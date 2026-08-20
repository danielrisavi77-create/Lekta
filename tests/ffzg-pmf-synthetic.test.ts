/**
 * Sinteticki golden za ffzg (Filozofski fakultet, odsjecki profili) i pmf (Prirodoslovno-
 * matematicki fakultet). Primarno dokazuje crash-fix: ranije su ovi profili rusili analyzer
 * na stvarnom docx-u (scalar size:12 -> profile.size.some; nedostatak fonta/margina/velicine ->
 * profile.font.some / profile.margins[side] / profile.size.some).
 *
 * Nakon fixa (scalar size -> [12]; checkFont/Size/Spacing/Margins:false gdje izvor ne propisuje)
 * profili se analiziraju bez pucanja i scored/informativne provjere ispravno se ponasaju.
 *
 * NAPOMENA: ffzg je jedan mijesani ZIR namespace preko mnogo odsjeka; per-odsjecko stvarno
 * uzorkovanje nije radjeno pa je fieldValidation synthetic-golden-validated (CLAUDE.md).
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec, TOC_FIELD_PARA } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';

const TNR = 'Times New Roman';
const check = (r: any, title: string) => (r.checks || []).find((c: any) => c.title === title);
const headed = (t: string): ParaSpec => ({ text: t, font: TNR, sizePt: 12, styleId: 'Heading1' });
function body(n: number): ParaSpec[] {
  const s = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. ';
  const out: ParaSpec[] = [];
  for (let c = 0; c < n; c += 60) out.push({ text: s.repeat(6), font: TNR, sizePt: 12, jc: 'both', spacingLine: 360 });
  return out;
}
function doc(): ParaSpec[] {
  return [headed('Sažetak'), { text: 'Ključne riječi: humanistika, prirodoslovlje', font: TNR, sizePt: 12 },
    headed('Sadržaj'),
    TOC_FIELD_PARA, headed('1. Uvod'), ...body(600), headed('2. Razrada'), ...body(400),
    headed('3. Zaključak'), ...body(200), headed('Literatura'),
    { text: 'Prezime, I. (2021). Naslov. Zagreb.', font: TNR, sizePt: 12 }];
}
const M25 = { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 };

const PROFILES = [
  'ffzg-informacijske-zavrsni', 'ffzg-filozofija-diplomski', 'ffzg-psihologija-diplomski',
  'ffzg-sociologija-diplomski', 'ffzg-kroatistika-graduate', 'ffzg-pedagogija-graduate',
  'ffzg-lingvistika-diplomski', 'ffzg-povijest-umjetnosti-diplomski', 'ffzg-arheologija-graduate',
  'ffzg-etnologija-graduate', 'pmf-biologija-graduate', 'pmf-fizika-graduate',
  'pmf-matematika-graduate', 'pmf-geologija-graduate',
];

describe('ffzg/pmf: crash-fix (svi profili se analiziraju bez pucanja)', () => {
  for (const id of PROFILES) {
    it(`${id} se analizira bez pucanja i daje provjere`, async () => {
      const r: any = await analyzeFixture(buildDocxFile({ paragraphs: doc(), marginsCm: M25 }, `${id}.docx`), { profileId: id });
      expect(Array.isArray(r.checks)).toBe(true);
      expect(r.checks.length).toBeGreaterThan(0);
      // velicina 12 i prored 1,5 su univerzalno uskladjeni pa ne smiju biti 'fail'
      expect(check(r, 'Veličina osnovnog teksta')?.status).not.toBe('fail');
      expect(check(r, 'Prored osnovnog teksta')?.status).not.toBe('fail');
    });
  }
});
