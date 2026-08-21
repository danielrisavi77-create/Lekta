/**
 * DOCX-06: naslov numeriran preko STILA nije se prepoznavao kao numeriran.
 *
 * `auditHeadingRules` racuna `autoNumber = !!h.pProps.num`, a `parseStyles` `num` iz stila UREDNO
 * cita. Gubio se u spajanju: `pProps = merge(defaultP, style.p, directP)`, a `readPPr` vraca `num`
 * kao BOOLEAN (`!!direct(pPr,'w:numPr')`), dakle `false` kad numeriranja na odlomku nema. `merge`
 * je Object.assign, pa je taj `false` gazio `true` iz stila. Naknadna petlja koja nasljedjuje iz
 * stila gleda samo `['line','before','after','align']` i uz uvjet `directP[key] == null`, sto za
 * boolean nikad ne vrijedi.
 *
 * Posljedica: rad kojemu je numeriranje naslova vezano uz Wordov stil (uobicajen nacin, i jedini
 * koji prezivi preuredjivanje poglavlja) kaznjavao se jednako kao rad bez ikakvog numeriranja.
 * Izmjereno prije popravka: `Numeriranje naslova` warn 3/4, isto kao naslov bez broja.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder.ts';
import { analyzeFixture } from '../src/analysis/golden-entry.ts';

const PROFILE = 'pravo-integrirani-diplomski'; // headingRules.numberRequired: true
const TNR = 'Times New Roman';

const DOC_DEFAULTS =
  '<w:docDefaults><w:rPrDefault><w:rPr>' +
  `<w:rFonts w:ascii="${TNR}" w:hAnsi="${TNR}"/><w:sz w:val="24"/>` +
  '</w:rPr></w:rPrDefault></w:docDefaults>';

const styles = (inner: string) =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  DOC_DEFAULTS + inner + '</w:styles>';

const HEADING_PLAIN = styles('<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>');

const HEADING_NUMBERED = styles(
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>' +
    '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr></w:style>',
);

const FMT = { font: TNR, sizePt: 12, spacing15: true as const, jc: 'both' as const };
const body = (n: number): ParaSpec[] =>
  Array.from({ length: n }, () => ({ text: 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada.', ...FMT }));

/** Naslov bez ikakvog broja u tekstu; numeriranje ovisi iskljucivo o stilu. */
const HEADING: ParaSpec = { text: 'UVOD', font: TNR, sizePt: 12, styleId: 'Heading1' };

/** Isti naslov, numeriranje zapisano na ODLOMKU (ovo je radilo i prije). */
const HEADING_NUM_ON_PARAGRAPH: ParaSpec = {
  raw:
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>' +
    '<w:r><w:t xml:space="preserve">UVOD</w:t></w:r></w:p>',
};

async function numberingCheck(paragraphs: ParaSpec[], stylesXml: string) {
  const r: any = await analyzeFixture(buildDocxFile({ paragraphs, stylesXml }), { profileId: PROFILE });
  const c = (r.checks || []).find((x: any) => x.title === 'Numeriranje naslova');
  expect(c, 'provjera "Numeriranje naslova" nije pronadjena').toBeTruthy();
  return c;
}

describe('DOCX-06: numeriranje naslova preko stila', () => {
  it('numeriranje na STILU se priznaje', async () => {
    const c = await numberingCheck([HEADING, ...body(20)], HEADING_NUMBERED);
    expect(c.status).toBe('pass');
    expect(c.earned).toBe(c.max);
  });

  it('numeriranje na ODLOMKU se i dalje priznaje', async () => {
    const c = await numberingCheck([HEADING_NUM_ON_PARAGRAPH, ...body(20)], HEADING_PLAIN);
    expect(c.status).toBe('pass');
  });

  it('naslov bez ijednog oblika numeriranja i dalje pada', async () => {
    const c = await numberingCheck([HEADING, ...body(20)], HEADING_PLAIN);
    expect(c.status).not.toBe('pass');
  });
});
