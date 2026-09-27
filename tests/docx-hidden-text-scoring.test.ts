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
import { readRPr, parseXml, effectiveHidden, paragraphText, ZipReader } from '../src/docx/parser';
import { buildDocx } from './helpers/docx-builder';
import { auditHeadingRules } from '../src/audits/structure';
import { anchorTextOfXml, normalizeAnchorText } from '../src/repair/anchor-text';
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

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

/** Zadani stilovi buildera uz stil odlomka i znakovni stil koji oba ukljucuju w:vanish. */
async function stylesWithVanish(): Promise<string> {
  const base = await new ZipReader(buildDocx({ paragraphs: [{ text: 'x' }] }).buffer as ArrayBuffer).text('word/styles.xml');
  const extra = '<w:style w:type="paragraph" w:styleId="SkriveniOdlomak"><w:name w:val="Skriveni odlomak"/><w:rPr><w:vanish/></w:rPr></w:style>'
    + '<w:style w:type="character" w:styleId="SkriveniZnak"><w:name w:val="Skriveni znak"/><w:rPr><w:vanish/></w:rPr></w:style>'
    + '<w:style w:type="paragraph" w:styleId="IzvedeniBezVanish"><w:name w:val="Izvedeni bez vanish"/><w:basedOn w:val="SkriveniOdlomak"/></w:style>'
    + '<w:style w:type="paragraph" w:styleId="IzvedeniSVanish"><w:name w:val="Izvedeni s vanish"/><w:basedOn w:val="SkriveniOdlomak"/><w:rPr><w:vanish/></w:rPr></w:style>';
  expect(base).toContain('</w:styles>');
  return base.replace('</w:styles>', `${extra}</w:styles>`);
}

async function dominantWithStyles(runProps: string, paragraphStyle = true, styleId = 'SkriveniOdlomak') {
  const pPr = paragraphStyle ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>` : '';
  const raw = `<w:p>${pPr}<w:r><w:rPr>${runProps}<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="40"/></w:rPr><w:t xml:space="preserve">${HIDDEN_TEXT}</w:t></w:r></w:p>`;
  const paras: ParaSpec[] = [paragraphs('')[0], paragraphs('')[1], { text: '', raw }, paragraphs('')[3]];
  const profile = resolveProfile(VERIFIED_PROFILE_REGISTRY[0].id);
  const settings = { profileId: VERIFIED_PROFILE_REGISTRY[0].id, workType: profile.selection.workType, citationStyle: 'fpzg',
    language: 'hr', strictness: 'standard', methodology: 'auto', selectionIds: {} };
  const result: any = await analyzeDocx(buildDocxFile({ paragraphs: paras, stylesXml: await stylesWithVanish() }), profile, settings, () => {});
  return result.stats.dominantFont;
}

describe('toggle pravilo za w:vanish kroz stilove (Codex #17a)', () => {
  it('samo stil odlomka s vanish: skriveno', async () => {
    expect(await dominantWithStyles('')).toBe(TNR);
  });
  it('stil odlomka i znakovni stil s vanish, bez izravnog: dva preokreta, VIDLJIVO', async () => {
    expect(await dominantWithStyles('<w:rStyle w:val="SkriveniZnak"/>')).toBe('Arial');
  });
  it('stil odlomka i izravni vanish: izravno je apsolutno, skriveno', async () => {
    expect(await dominantWithStyles('<w:vanish/>')).toBe(TNR);
  });
  it('stil odlomka i izravni vanish w:val="0": izravno otkriva, vidljivo', async () => {
    expect(await dominantWithStyles('<w:vanish w:val="0"/>')).toBe('Arial');
  });
  it('bez ikakvog vanish: vidljivo (kontrola)', async () => {
    expect(await dominantWithStyles('', false)).toBe('Arial');
  });
  it('basedOn lanac: jedan vanish u roditelju je naslijeden, skriveno (runda 2)', async () => {
    expect(await dominantWithStyles('', true, 'IzvedeniBezVanish')).toBe(TNR);
  });
  it('basedOn lanac: vanish u roditelju i u izvedenom stilu, dva preokreta, VIDLJIVO (runda 2)', async () => {
    expect(await dominantWithStyles('', true, 'IzvedeniSVanish')).toBe('Arial');
  });
  it('effectiveHidden tablica', () => {
    const on = { hidden: true }, off = { hidden: false }, none = {};
    expect(effectiveHidden({ paragraphStyle: on })).toBe(true);
    expect(effectiveHidden({ paragraphStyle: on, runStyle: on })).toBe(false);
    expect(effectiveHidden({ defaults: on, paragraphStyle: on })).toBe(false);
    expect(effectiveHidden({ paragraphStyle: on, runStyle: on, direct: on })).toBe(true);
    expect(effectiveHidden({ paragraphStyle: on, direct: off })).toBe(false);
    expect(effectiveHidden({ paragraphStyle: off, runStyle: none })).toBe(false);
  });
});

describe('odlomak bez vidljivog teksta (Codex #17b)', () => {
  const heading = (hidden: boolean) => ({ headingLevel: 1, text: '1. Uvod', pProps: {},
    runs: [{ text: '1. Uvod', font: 'Arial', size: 9, bold: false, italic: false, hidden }] });
  const rules = { maxLevel: 3, levels: { '1': { size: 14, bold: true } } };

  it('kontrola: vidljiv naslov koji krsi pravilo pada na oblikovanju', () => {
    expect(auditHeadingRules([heading(false)], rules)[0].status).toBe('warn');
  });
  it('potpuno skriven naslov NIJE prolaz: provjera je nebodovana (0/0), ne 6/6 (runda 2)', () => {
    const check = auditHeadingRules([heading(true)], rules)[0];
    expect(check).toMatchObject({ status: 'informational', earned: 0, max: 0 });
    expect(check.issue?.title).toMatch(/Naslovi sadrže samo skriveni tekst/);
  });
  it('prazan naslov bez runova nije skriveni tekst: ostaje dosadasnje ponasanje (runda 3)', () => {
    const empty = { headingLevel: 1, text: '', pProps: {}, runs: [] };
    const check = auditHeadingRules([empty], rules)[0];
    expect(check.issue?.title ?? '').not.toMatch(/skriveni tekst/);
    expect(check.max).toBe(6);
  });
  it('skriveni naslov uz vidljive: ocjenjuju se samo vidljivi, a skriveni se navodi', () => {
    const good = { headingLevel: 1, text: '2. Metode', pProps: {}, runs: [{ text: '2. Metode', font: 'Arial', size: 14, bold: true, italic: false }] };
    const passing = auditHeadingRules([good, heading(true)], rules)[0];
    expect(passing).toMatchObject({ status: 'pass', earned: 6, max: 6 });
    expect(passing.detail).toMatch(/1 naslova odgovara.*1 naslova nema vidljiv tekst/);
    const failing = auditHeadingRules([heading(false), heading(true)], rules)[0];
    expect(failing.status).toBe('warn');
    expect(failing.detail).toMatch(/1 od 1 naslova odstupa/);
  });
});

describe('sidra popravka ostaju ista (Codex #17b)', () => {
  it('tekst analize i sidro popravka ukljucuju skriveni run jednako', () => {
    const xml = `<w:p ${W}><w:r><w:t>Vidljivo </w:t></w:r><w:r><w:rPr><w:vanish/></w:rPr><w:t>skriveno</w:t></w:r></w:p>`;
    const analysis = normalizeAnchorText(paragraphText(parseXml(xml).documentElement));
    const repair = normalizeAnchorText(anchorTextOfXml(xml));
    expect(analysis).toBe(repair);
    expect(analysis).toContain('skriveno');
  });
});
