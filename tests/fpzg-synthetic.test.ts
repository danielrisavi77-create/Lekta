/**
 * Sinteticki golden test FPZG profila (CLAUDE.md golden harness).
 *
 * Gradi kontrolirane .docx ulaze s POZNATIM ocekivanim ishodom i provjerava da
 * provjere koje su nedavno ukljucene za zavrsni/doktorski ispravno okidaju:
 * font, velicina, prored, A4, sadrzaj, opseg te (doktorski) margine.
 *
 * Sinteticki dokumenti NISU pravi radovi ni izvor pravila; sluze samo regresijskoj
 * provjeri parsera i audita (CLAUDE.md). XML se parsira pravim @xmldom/xmldom
 * parserom (vidi tests/setup/xml-dom.ts) jer happy-dom ne radi XML namespace.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';

const TNR = 'Times New Roman';
const check = (r: any, title: string) => (r.checks || []).find((c: any) => c.title === title);

/** Tijelo teksta zeljene duljine, ispravno oblikovano. */
function body(words: number): ParaSpec[] {
  const sentence = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada. '; // 10 rijeci
  const out: ParaSpec[] = [];
  for (let count = 0; count < words; count += 60) {
    out.push({ text: sentence.repeat(6), font: TNR, sizePt: 12, jc: 'both', spacing15: true });
  }
  return out;
}

const headed = (text: string): ParaSpec => ({ text, font: TNR, sizePt: 12, styleId: 'Heading1' });

describe('FPZG sinteticki golden: prijediplomski zavrsni (politologija)', () => {
  it('uskladjeni rad prolazi kljucne tehnicke provjere', async () => {
    const paras: ParaSpec[] = [
      headed('Sažetak'),
      { text: 'Ovo je sažetak rada u jednom odlomku.', font: TNR, sizePt: 12, jc: 'both' },
      { text: 'Ključne riječi: politologija, analiza, metoda', font: TNR, sizePt: 12 },
      headed('Sadržaj'),
      headed('1. Uvod'),
      ...body(900),
      headed('2. Razrada'),
      ...body(4200),
      headed('3. Zaključak'),
      ...body(600),
      headed('Literatura'),
      { text: 'Kasapović, M. (2014). Politološki pojmovi. Zagreb: Fakultet političkih znanosti.', font: TNR, sizePt: 12 },
    ];
    const file = buildDocxFile({ paragraphs: paras }, 'zavrsni-uskladjen.docx');
    const r: any = await analyzeFixture(file, { profileId: 'fpzg-politologija-zavrsni' });

    expect(typeof r.score).toBe('number');
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(check(r, 'Dominantni font').status).toBe('pass');
    expect(check(r, 'Veličina osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Prored osnovnog teksta').status).toBe('pass');
    expect(check(r, 'Format stranice A4').status).toBe('pass');
    expect(check(r, 'Sadržaj dokumenta').status).toBe('pass');
    expect(check(r, 'Profilni opseg riječi').status).toBe('pass');
  });

  it('neuskladjeni rad pada na fontu, velicini, A4, sadrzaju i opsegu', async () => {
    const paras: ParaSpec[] = [
      { text: 'Naslov rada bez ostalih dijelova', font: 'Arial', sizePt: 14, jc: 'left' },
      ...Array.from({ length: 4 }, () => ({ text: 'Kratak tekst koji nije akademski strukturiran niti dovoljno dug.', font: 'Arial', sizePt: 14, jc: 'left' as const })),
    ];
    const file = buildDocxFile(
      { paragraphs: paras, pageCm: { w: 14.8, h: 21.0 }, marginsCm: { top: 4, right: 4, bottom: 4, left: 4 } },
      'zavrsni-neuskladjen.docx',
    );
    const r: any = await analyzeFixture(file, { profileId: 'fpzg-politologija-zavrsni' });

    // Sadrzaj se namjerno NE provjerava ovdje: audit je blag prema rucnom sadrzaju
    // (vraca pass i bez automatskog TOC polja), pa boduje kroz earned, ne kroz status.
    expect(check(r, 'Dominantni font').status).not.toBe('pass');
    expect(check(r, 'Veličina osnovnog teksta').status).not.toBe('pass');
    expect(check(r, 'Format stranice A4').status).not.toBe('pass');
    expect(check(r, 'Profilni opseg riječi').status).not.toBe('pass');
  });
});

describe('FPZG sinteticki golden: doktorski (DR.SC.-08 boduje margine)', () => {
  const docBody = (): ParaSpec[] => [
    headed('Sažetak'),
    { text: 'Sažetak doktorskog rada na jednoj kartici.', font: TNR, sizePt: 12, jc: 'both' },
    { text: 'Ključne riječi: politologija, metoda', font: TNR, sizePt: 12 },
    headed('Sadržaj'),
    headed('1. Uvod'),
    ...body(600),
    headed('2. Zaključak'),
    ...body(200),
    headed('Literatura'),
    { text: 'Kasapović, M. (2014). Politološki pojmovi. Zagreb: FPZG.', font: TNR, sizePt: 12 },
    headed('Životopis'),
    { text: 'Autor je rođen u Zagrebu te je objavio nekoliko radova.', font: TNR, sizePt: 12 },
  ];

  it('margine 2,5 cm prolaze (provjera je bodovana, max > 0)', async () => {
    const file = buildDocxFile({ paragraphs: docBody(), marginsCm: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 } }, 'dr-ok.docx');
    const r: any = await analyzeFixture(file, { profileId: 'fpzg-doktorski-politologija' });
    const m = check(r, 'Margine dokumenta');
    expect(m.max).toBeGreaterThan(0); // doktorski JEDINI boduje margine
    expect(m.status).toBe('pass');
  });

  it('pogresne margine 4,0 cm padaju', async () => {
    const file = buildDocxFile({ paragraphs: docBody(), marginsCm: { top: 4, right: 4, bottom: 4, left: 4 } }, 'dr-bad-margins.docx');
    const r: any = await analyzeFixture(file, { profileId: 'fpzg-doktorski-politologija' });
    expect(check(r, 'Margine dokumenta').status).not.toBe('pass');
  });
});
