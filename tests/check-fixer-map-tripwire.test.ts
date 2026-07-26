/**
 * Tripwire za check-fixer-map.ts (RE-43, CLAUDE.md golden harness).
 *
 * CHECK_TITLES mapira checkId -> tocan naslov provjere koji analyzeDocx proizvodi; na njemu
 * pociva isViolated (repair-items.ts) i triage klasifikacija 'auto'. Izmjena naslova na JEDNOJ
 * strani (analyzeDocx/audits/structure.ts ili check-fixer-map.ts) bez azuriranja druge bi tiho
 * otkacila auto-fixer od provjere: repair-items vise ne bi prepoznao prekrsenu dimenziju, a
 * postojeci suite bi ostao zelen jer nijedan test dosad nije provjeravao da MAPIRANI naslov
 * stvarno postoji u zivom rezultatu analize.
 *
 * Ovaj test pokrece STVARNU analizu (analyzeFixture) nad tri registrirana profila, birana da
 * zajedno pokriju sve profilne gateove iza CHECK_TITLES (pravna fusnota + razmak odlomka/fusnota
 * + oblikovanje naslova; poravnanje broja + pocetak numeriranja na Uvodu; shema numeriranja), i
 * provjerava da je SVAKI naslov iz CHECK_TITLES prisutan u barem jednom rezultatu.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type DocSpec } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { CHECK_TITLES, PAPER_SIZE_TITLE_PREFIX, EMPTY_PARAGRAPHS_CHECK_TITLE } from '../src/analysis/check-fixer-map';

const TNR = 'Times New Roman';

// pravo-integrirani-diplomski: jedini profil s legalFootnoteProfile + checkParagraphSpacingZero +
// checkFootnoteParagraphSpacingZero + headingRules ISTODOBNO (provjerено node skriptom nad
// verified-profiles-heavy.json). Naslovi/fusnote ne moraju biti "ispravni": sve cetiri provjere se
// guraju u result.checks cim je odgovarajuca profilna zastavica postavljena, bez obzira na ishod.
const LEGAL_DOC: DocSpec = {
  paragraphs: [
    { text: 'Uvod', styleId: 'Heading1', font: TNR, sizePt: 14, bold: true },
    { text: 'Odlomak teksta rada dovoljne duljine za provjeru oblikovanja i razmaka.', font: TNR, sizePt: 12, jc: 'both' },
  ],
  footnotes: ['Fusnota s tekstom dovoljne duljine za provjeru razmaka i tipografije fusnota.'],
};

// pravo-socijalni-rad-zavrsni: pageNumberAlignment + checkPageNumberStartAtIntro; obje provjere
// trebaju "PAGE" polje negdje u dokumentu (footer s page:true daje pravo instrText polje).
const PAGE_NUMBER_DOC: DocSpec = {
  paragraphs: [
    { text: 'Naslovnica rada', font: TNR, sizePt: 14 },
    { text: 'Uvod', styleId: 'Heading1', font: TNR, sizePt: 14, bold: true },
    { text: 'Odlomak teksta rada.', font: TNR, sizePt: 12, jc: 'both' },
  ],
  footer: { page: true, align: 'left' },
};

// fpzg-politologija-zavrsni: checkPageNumberScheme (rimski + arapski + start=1).
const SCHEME_DOC: DocSpec = {
  paragraphs: [
    { text: 'Uvod', styleId: 'Heading1', font: TNR, sizePt: 14, bold: true },
    { text: 'Odlomak teksta rada.', font: TNR, sizePt: 12, jc: 'both' },
  ],
};

describe('check-fixer-map tripwire (RE-43)', () => {
  it('svaki naslov iz CHECK_TITLES pojavljuje se u result.checks[] barem jednom', async () => {
    const results = await Promise.all([
      analyzeFixture(buildDocxFile(LEGAL_DOC, 'legal.docx'), { profileId: 'pravo-integrirani-diplomski' }),
      analyzeFixture(buildDocxFile(PAGE_NUMBER_DOC, 'page-number.docx'), { profileId: 'pravo-socijalni-rad-zavrsni' }),
      analyzeFixture(buildDocxFile(SCHEME_DOC, 'scheme.docx'), { profileId: 'fpzg-politologija-zavrsni' }),
    ]);
    const titles = new Set<string>(results.flatMap((r: any) => r.checks.map((c: any) => c.title)));

    const missing = Object.entries(CHECK_TITLES).filter(([, title]) => !titles.has(title));
    expect(missing).toEqual([]);

    expect(titles.has(EMPTY_PARAGRAPHS_CHECK_TITLE)).toBe(true);
    expect([...titles].some((t) => t.startsWith(PAPER_SIZE_TITLE_PREFIX))).toBe(true);
  });
});
