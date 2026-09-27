/**
 * T26 / audit 22. 9. nalaz #17: skriveni tekst (w:vanish) ne smije odlucivati o bodovanju
 * oblikovanja. Word ga ne prikazuje ni ne ispisuje, pa rad s vidljivim tijelom u Times New Roman
 * 12 ne smije pasti na fontu zato sto nosi skriveni blok u drugom fontu (npr. ostatak predloska).
 *
 * Namjerno NIJE dirano: tekst odlomka i sidra. Popravak sam racuna tekst odlomka nad XML-om
 * (apply-fixers, section-surgery, sinkronizacija citata), pa bi izbacivanje skrivenog teksta samo
 * u analizi razdvojilo sidra i tiho ugasilo popravak na takvim odlomcima.
 *
 * Mjereno prije ispravka: nijedna od 50 .docx fixtura nema w:vanish, pa ispravak ne mijenja
 * nijedan golden rezultat; zato generator ispod mora sam dokazati da proizvodi skriveni run.
 */
import { describe, expect, it } from 'vitest';
import { buildDocxFile, documentXml, type ParaSpec } from './helpers/docx-builder';
import { analyzeDocx } from '../src/analysis/analyze-docx';
import { resolveProfile } from '../src/analysis/golden-entry';
import { VERIFIED_PROFILE_REGISTRY } from '../src/profiles/profile-registry';
import { readRPr, parseXml } from '../src/docx/parser';
import { runMetrics } from '../src/audits/metrics';

const TNR = 'Times New Roman';
const HIDDEN_TEXT = 'Uputa iz predloska koju autor nije obrisao nego sakrio. '.repeat(40);

function hiddenParagraph(vanish: string): ParaSpec {
  return { text: '', raw: `<w:p><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="40"/>${vanish}</w:rPr><w:t xml:space="preserve">${HIDDEN_TEXT}</w:t></w:r></w:p>` };
}

function paragraphs(vanish: string): ParaSpec[] {
  return [
    { text: 'Uvod', font: TNR, sizePt: 12, styleId: 'Heading1' },
    { text: 'Vidljivi odlomak tijela rada napisan u fontu Times New Roman velicine 12. '.repeat(3), font: TNR, sizePt: 12, jc: 'both', spacingLine: 360 },
    hiddenParagraph(vanish),
    { text: 'Literatura', font: TNR, sizePt: 12, styleId: 'Heading1' },
  ];
}

async function dominant(vanish: string) {
  const profile = resolveProfile(VERIFIED_PROFILE_REGISTRY[0].id);
  const settings = { profileId: VERIFIED_PROFILE_REGISTRY[0].id, workType: profile.selection.workType, citationStyle: 'fpzg',
    language: 'hr', strictness: 'standard', methodology: 'auto', selectionIds: {} };
  const result: any = await analyzeDocx(buildDocxFile({ paragraphs: paragraphs(vanish) }), profile, settings, () => {});
  return { font: result.stats.dominantFont, size: Number(result.stats.dominantSize) };
}

describe('skriveni tekst u bodovanju oblikovanja (nalaz #17)', () => {
  it('generator stvarno proizvodi skriveni run koji nosi vecinu znakova', () => {
    const xml = documentXml({ paragraphs: paragraphs('<w:vanish/>') });
    expect(xml).toContain('<w:vanish/>');
    expect(HIDDEN_TEXT.length).toBeGreaterThan(3 * 'Vidljivi odlomak tijela rada napisan u fontu Times New Roman velicine 12. '.length);
  });

  it('baseline: isti blok BEZ vanish-a s pravom odlucuje o dominantnom fontu', async () => {
    expect(await dominant('')).toEqual({ font: 'Arial', size: 20 });
  });

  it('skriveni blok ne mijenja dominantni font ni velicinu', async () => {
    expect(await dominant('<w:vanish/>')).toEqual({ font: TNR, size: 12 });
  });

  it('w:vanish w:val="0" nije skriven i i dalje se broji', async () => {
    expect(await dominant('<w:vanish w:val="0"/>')).toEqual({ font: 'Arial', size: 20 });
  });

  it('readRPr cita vanish kao toggle; specVanish i webHidden nisu skriveni tekst', () => {
    const rPr = (inner: string) => parseXml(`<w:rPr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${inner}</w:rPr>`).documentElement;
    expect(readRPr(rPr('<w:vanish/>')).hidden).toBe(true);
    expect(readRPr(rPr('<w:vanish w:val="false"/>')).hidden).toBe(false);
    expect(readRPr(rPr('<w:specVanish/>')).hidden).toBeUndefined();
    expect(readRPr(rPr('<w:webHidden/>')).hidden).toBeUndefined();
  });

  it('runMetrics (naslovi, sadrzaj, naslovnica) preskace skrivene runove', () => {
    const m = runMetrics([
      { text: 'Vidljivi naslov', font: TNR, size: 14, bold: true },
      { text: 'skriveni dugi tekst '.repeat(20), font: 'Arial', size: 9, bold: false, hidden: true },
    ]);
    expect(m).toMatchObject({ font: TNR, size: 14, boldShare: 1 });
  });
});
