/**
 * Regresijski testovi za engine korektnosne popravke iz audita 2026-07-16.
 * Svaki test bi PAO na kodu prije popravka (dokaz zatecenog buga), sada prolazi.
 *
 * AUD-01: prored 'exact'/'atLeast' (apsolutne tocke) NE smije se usporedjivati s profilnim
 *         omjerom (1.5) jer daje lazni pad; readPPr za takve slucajeve vraca line=null.
 * AUD-04: dokument u zadanoj temi (Calibri) ima samo w:asciiTheme, pa readRPr biljezi fontTheme,
 *         a parseThemeFonts ga razrjesava iz theme1.xml (inace font ostaje null -> lazni prolaz).
 * AUD-09: narativna autor-godina citatnica s prezimenom na dijakritiku (Covic) mora se prepoznati
 *         (JS \b je ASCII pa je prije promasivao granicu ispred C/C/S/Z/Dj).
 */
import { describe, it, expect } from 'vitest';
import { parseXml, readPPr, readRPr, parseThemeFonts, headingLevel } from '../src/docx/parser';
import { extractCitations } from '../src/citations/author-year';
import { parseReference } from '../src/citations/parse-reference';
import { buildLegalCitationEngine } from '../src/citations/legal-citation';
import { normalize } from '../src/utils/helpers';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const el = (xml: string) => parseXml(xml).documentElement as any;

describe('AUD-01: prored exact/atLeast', () => {
  it('lineRule=auto se cita kao visekratnik (480/240 = 2.0)', () => {
    const pPr = el(`<w:pPr ${W}><w:spacing w:line="480" w:lineRule="auto"/></w:pPr>`);
    expect(readPPr(pPr).line).toBeCloseTo(2.0, 5);
  });
  it('lineRule=exact NE daje omjer nego null (ne usporedjuje se s 1.5)', () => {
    const pPr = el(`<w:pPr ${W}><w:spacing w:line="480" w:lineRule="exact"/></w:pPr>`);
    const r = readPPr(pPr);
    expect(r.line).toBeNull();
    expect(r.lineRule).toBe('exact');
  });
  it('lineRule=atLeast takodjer daje null', () => {
    const pPr = el(`<w:pPr ${W}><w:spacing w:line="360" w:lineRule="atLeast"/></w:pPr>`);
    expect(readPPr(pPr).line).toBeNull();
  });
});

describe('AUD-04: tema-fontovi', () => {
  it('readRPr biljezi fontTheme kad nema eksplicitnog w:ascii', () => {
    const rPr = el(`<w:rPr ${W}><w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/></w:rPr>`);
    const out = readRPr(rPr);
    expect(out.font).toBeUndefined();
    expect(out.fontTheme).toBe('minorHAnsi');
  });
  it('eksplicitni w:ascii ima prednost i ne postavlja fontTheme', () => {
    const rPr = el(`<w:rPr ${W}><w:rFonts w:ascii="Times New Roman" w:asciiTheme="minorHAnsi"/></w:rPr>`);
    const out = readRPr(rPr);
    expect(out.font).toBe('Times New Roman');
    expect(out.fontTheme).toBeUndefined();
  });
  it('parseThemeFonts razrjesava minor (tijelo) i major (naslovi) latin', () => {
    const theme = `<a:theme ${A}><a:themeElements><a:fontScheme><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`;
    const map = parseThemeFonts(theme);
    expect(map).toEqual({ minor: 'Calibri', major: 'Calibri Light' });
  });
  it('parseThemeFonts vraca null bez teme (fallback na "font nije eksplicitan")', () => {
    expect(parseThemeFonts(null)).toBeNull();
    expect(parseThemeFonts('<x/>')).toBeNull();
  });
});

describe('AUD-06: outlineLvl razina naslova', () => {
  it('outline 0-8 -> razine 1-9', () => {
    expect(headingLevel('', { outline: 0 })).toBe(1);
    expect(headingLevel('', { outline: 8 })).toBe(9);
  });
  it('outline 9 ("Body Text") NIJE naslov -> null', () => {
    expect(headingLevel('', { outline: 9 })).toBeNull();
  });
  it('ime stila i dalje ima prednost', () => {
    expect(headingLevel('Heading 2', { outline: 9 })).toBe(2);
    expect(headingLevel('Naslov 3', {})).toBe(3);
  });
});

describe('AUD-09: narativna citatnica s dijakritikom', () => {
  const cite = (text: string) => extractCitations([{ text }]);
  it('prepoznaje "proveo Covic (2019)" (prezime na dijakritiku C)', () => {
    const found = cite('Istrazivanje je proveo Čović (2019) na uzorku studenata.');
    expect(found.some((c: any) => c.kind === 'narrative' && c.year === '2019' && /Čović/.test(c.author))).toBe(true);
  });
  it('kontrola: ASCII prezime "Markovic (2019)" i dalje radi (bez regresije)', () => {
    const found = cite('Istrazivanje je proveo Marković (2019) na uzorku studenata.');
    expect(found.some((c: any) => c.kind === 'narrative' && c.year === '2019' && /Marković/.test(c.author))).toBe(true);
  });
  it('parentetski oblik "(Čović, 2019)" i dalje radi', () => {
    const found = cite('Rezultati su slicni (Čović, 2019).');
    expect(found.some((c: any) => c.year === '2019' && /Čović/.test(c.author))).toBe(true);
  });
});

describe('AUD-10: bulk parser referenci ne zamrzava na dugom ulazu bez terminatora', () => {
  it('parseReference na ~42000 znakova bez .?! zavrsi (bez kvadratnog hanga)', () => {
    // Da je O(n^2) i dalje prisutan, ovaj test bi istekao (vitest timeout), a ne prosao.
    const blob = 'ab '.repeat(14000);
    const r = parseReference(blob, 'apa');
    expect(r).toBeTruthy();
  });
});

describe('AUD-11: legal engine ne oznacava rimske brojeve i ceste akronime', () => {
  it('XIV, OECD, ISBN, ECLI nisu "neuvedena kratica"', () => {
    const footnotes = [
      { id: 1, text: 'Vidi Zbornik radova, vol. XIV, str. 45.' },
      { id: 2, text: 'OECD, Report 2019, str. 10.' },
      { id: 3, text: 'Knjiga, ISBN 978-953-123, str. 5.' },
      { id: 4, text: 'Presuda ECLI:EU:C:2019:325.' },
    ];
    const engine = buildLegalCitationEngine(footnotes, [], []);
    const acr = engine.problems.filter((p: any) => p.kind === 'lawAcronym').map((p: any) => p.message).join(' ');
    expect(acr).not.toMatch(/XIV|OECD|ISBN|ECLI/);
  });
  it('stvarna neuvedena kratica (ZOO) i dalje se oznacava', () => {
    const engine = buildLegalCitationEngine([{ id: 1, text: 'Prema čl. 5. ZOO, str. 12.' }], [], []);
    expect(engine.problems.some((p: any) => p.kind === 'lawAcronym' && /ZOO/.test(p.message))).toBe(true);
  });
});

describe('AUD-12: normalize() dosljedno presloži đ/Đ na d/D (ne briše ga)', () => {
  it('normalize("Đurić") daje "duric", ne "uric" (đ nema NFD dekompoziciju pa je prije nestajao)', () => {
    expect(normalize('Đurić')).toBe('duric');
  });
  it('"Đurić" i "Jurić" se vise ne poklapaju nakon normalizacije', () => {
    expect(normalize('Đurić')).not.toBe(normalize('Jurić'));
  });
});

describe('AUD-13: narativna citatnica s "i sur."/"et al." se prepoznaje', () => {
  const cite = (text: string) => extractCitations([{ text }]);
  it('"Petrović i sur. (2020)" prepoznaje Petrović 2020', () => {
    const found = cite('Prema istraživanju, Petrović i sur. (2020) navode drugačije rezultate.');
    expect(found.some((c: any) => c.kind === 'narrative' && c.year === '2020' && /Petrović/.test(c.author))).toBe(true);
  });
  it('"Petrović et al. (2020)" prepoznaje Petrović 2020', () => {
    const found = cite('Prema istraživanju, Petrović et al. (2020) navode drugačije rezultate.');
    expect(found.some((c: any) => c.kind === 'narrative' && c.year === '2020' && /Petrović/.test(c.author))).toBe(true);
  });
});

describe('AUD-14: veliko-pisan pocetak recenice ne guta susjednu narativnu citatnicu', () => {
  const cite = (text: string) => extractCitations([{ text }]);
  it('"Prema Horvat (2020)..." prepoznaje Horvat 2020 (prije se gubilo jer "Prema" izgleda kao ime)', () => {
    const found = cite('Prema Horvat (2020), rezultati se razlikuju od očekivanih.');
    expect(found.some((c: any) => c.kind === 'narrative' && c.year === '2020' && /Horvat/.test(c.author))).toBe(true);
  });
  it('kontrola: sredin-recenicno "prema Ivan Horvat (2020)" i dalje se ne dvostruko parsira', () => {
    const found = cite('Kako navodi, prema Ivan Horvat (2020), rezultati se razlikuju.');
    const narrative = found.filter((c: any) => c.kind === 'narrative' && c.year === '2020');
    expect(narrative.length).toBe(0);
  });
});
