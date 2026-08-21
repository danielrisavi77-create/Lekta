/**
 * DOCX-06: dubina AUTOMATSKI numeriranih naslova nije se provjeravala.
 *
 * `Dubina decimalnog numeriranja` je gledala iskljucivo TEKST odlomka:
 *
 *   p.text.match(/^\s*(\d+(?:\.\d+)+)\.?\s+/)
 *
 * Kad naslove numerira Word (`w:numPr`), broj NIJE u tekstu, pa provjera nije vidjela nista i
 * dokument je prolazio. Isti dokument s rucno utipkanim brojevima je padao.
 *
 * Ishod je bio naopak: student koji naslove numerira ISPRAVNO (Wordovim viserazinskim
 * numeriranjem, jedini oblik koji prezivi preuredjivanje poglavlja) nije dobivao provjeru, a onaj
 * koji tipka rucno jest. Izmjereno prije popravka: auto ilvl=4 (5. razina) pass 3/3, rucno
 * "2.1.1.1.1." warn 1/3.
 *
 * Dubina se cita iz `numbering.xml`, ne iz same `w:ilvl`: samo DECIMALNE sheme (`decimal`,
 * `decimalZero`) su "decimalno numeriranje". Nabrajanje s tockicama na petoj razini nije krsenje
 * ovog pravila i ne smije se kazniti.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder.ts';
import { analyzeFixture } from '../src/analysis/golden-entry.ts';

const PROFILE = 'fpzg-politologija-diplomski';
const TNR = 'Times New Roman';
const enc = new TextEncoder();

/** numbering.xml: numId 1 = decimalno na svim razinama, numId 2 = nabrajanje (bullet). */
const NUMBERING_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:abstractNum w:abstractNumId="10">' +
  Array.from({ length: 6 }, (_, i) => `<w:lvl w:ilvl="${i}"><w:numFmt w:val="decimal"/></w:lvl>`).join('') +
  '</w:abstractNum>' +
  '<w:abstractNum w:abstractNumId="20">' +
  Array.from({ length: 6 }, (_, i) => `<w:lvl w:ilvl="${i}"><w:numFmt w:val="bullet"/></w:lvl>`).join('') +
  '</w:abstractNum>' +
  '<w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num>' +
  '<w:num w:numId="2"><w:abstractNumId w:val="20"/></w:num>' +
  '</w:numbering>';

const NUMBERING_FILE = { name: 'word/numbering.xml', data: enc.encode(NUMBERING_XML) };

const FMT = { font: TNR, sizePt: 12, spacing15: true as const, jc: 'both' as const };
const body = (n: number): ParaSpec[] =>
  Array.from({ length: n }, () => ({ text: 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada.', ...FMT }));

/** Naslov numeriran automatski; `ilvl` je 0-baziran, pa ilvl=4 znaci PETU razinu. */
const autoHeading = (ilvl: number, numId: number): ParaSpec => ({
  raw:
    `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:outlineLvl w:val="${Math.min(ilvl, 8)}"/>` +
    `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>` +
    '<w:r><w:t xml:space="preserve">Pododjeljak</w:t></w:r></w:p>',
});

async function depthCheck(extra: ParaSpec[]) {
  const file = buildDocxFile({ paragraphs: [...body(20), ...extra] }, 'numeriranje.docx', [NUMBERING_FILE]);
  const r: any = await analyzeFixture(file, { profileId: PROFILE });
  const c = (r.checks || []).find((x: any) => x.title === 'Dubina decimalnog numeriranja');
  expect(c, 'provjera "Dubina decimalnog numeriranja" nije pronadjena').toBeTruthy();
  return c;
}

describe('DOCX-06: dubina automatskog numeriranja', () => {
  it('auto numeriran naslov PREDUBOKO se kaznjava kao i rucni', async () => {
    const c = await depthCheck([autoHeading(4, 1)]); // 5. razina, decimalna shema
    expect(c.status, 'peta decimalna razina mora pasti i kad je numerira Word').not.toBe('pass');
  });

  it('auto numeriran naslov unutar dopustene dubine prolazi', async () => {
    const c = await depthCheck([autoHeading(2, 1)]); // 3. razina
    expect(c.status).toBe('pass');
    expect(c.earned).toBe(c.max);
  });

  it('duboko NABRAJANJE nije decimalno numeriranje i ne kaznjava se', async () => {
    const c = await depthCheck([autoHeading(4, 2)]); // 5. razina, ali bullet shema
    expect(c.status, 'nabrajanje nije decimalna shema').toBe('pass');
  });

  it('rucno utipkana dubina i dalje pada', async () => {
    const manual: ParaSpec = { text: '2.1.1.1.1. Pododjeljak', font: TNR, sizePt: 12, styleId: 'Heading1' };
    const c = await depthCheck([manual]);
    expect(c.status).not.toBe('pass');
  });
});
