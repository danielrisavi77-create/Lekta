/**
 * DOCX-06: sekcija bez vlastitog podnozja NASLJEDJUJE ga od prethodne.
 *
 * U OOXML-u `w:footerReference` nije obavezan po sekciji: sekcija koja ga nema preuzima podnozje
 * prethodne. Word tako i prikazuje, i tako Wordovi vlastiti alati generiraju dvosekcijski rad
 * (prednja rimska numeracija, glavni tekst decimalna od 1) - podnozje se postavi jednom.
 *
 * Analiza je citala ISKLJUCIVO eksplicitni `footerReference` po sekciji, pa je `hasAnyPageField`
 * za naslijedjenu sekciju bio `false`. Posljedica je bio LAZNI PAD na ISPRAVNOM radu: provjera
 * `Numeriranje od prve stranice Uvoda` ostajala je `warn 2/4` iako dokument radi tocno ono sto
 * profil trazi.
 *
 * Ogranicenje je bilo poznato i zabiljezeno (tests/repair-closed-loop-structural.test.ts uz
 * `exemptFromRegression`), ali nije bilo izmjereno na ispravnom dokumentu ni popravljeno.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder.ts';
import { analyzeFixture } from '../src/analysis/golden-entry.ts';

const PROFILE = 'pravo-socijalni-rad-zavrsni';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const enc = new TextEncoder();

const FOOTER_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p>' +
  '<w:pPr><w:jc w:val="right"/></w:pPr>' +
  '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
  '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>';

const RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  `<Relationship Id="rId100" Type="${REL_NS}/footer" Target="footer1.xml"/></Relationships>`;

const EXTRA = [
  { name: 'word/footer1.xml', data: enc.encode(FOOTER_XML) },
  { name: 'word/_rels/document.xml.rels', data: enc.encode(RELS) },
];

const FMT = { font: 'Times New Roman', sizePt: 12, spacing15: true as const, jc: 'both' as const };
const line = (t: string): ParaSpec => ({ text: t, ...FMT });

/** sectPr PREDNJE sekcije (u pPr zadnjeg njezinog odlomka): rimska numeracija + titlePg. */
const frontSection = (withFooter: boolean): ParaSpec => ({
  raw:
    `<w:p><w:pPr><w:sectPr xmlns:r="${REL_NS}">` +
    (withFooter ? '<w:footerReference w:type="default" r:id="rId100"/>' : '') +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/>' +
    '<w:titlePg/><w:pgNumType w:fmt="lowerRoman" w:start="1"/>' +
    '</w:sectPr></w:pPr></w:p>',
});

const FRONT: ParaSpec[] = [line('Naslovna stranica'), line('Sazetak rada u jednom odlomku.')];
const BODY: ParaSpec[] = [
  line('Uvod'),
  line('Tijelo rada koje nosi smislen sadrzaj i dovoljno je dugo za analizu.'),
  line('Zakljucak'),
];

/** Glavna sekcija (dokument-level sectPr) NEMA footerReference: nasljedjuje ga od prednje. */
async function numberingCheck(withFooterOnFront: boolean, extras: typeof EXTRA | []) {
  const file = buildDocxFile(
    { paragraphs: [...FRONT, frontSection(withFooterOnFront), ...BODY], pageNumberStart: 1 },
    'sekcije.docx',
    extras,
  );
  const r: any = await analyzeFixture(file, { profileId: PROFILE });
  // Provjera je uvjetovana postojanjem PAGE polja; bez njega se uopce ne emitira.
  return (r.checks || []).find((x: any) => x.title === 'Numeriranje od prve stranice Uvoda') ?? null;
}

describe('DOCX-06: nasljedjivanje podnozja medju sekcijama', () => {
  it('glavna sekcija nasljedjuje podnozje prednje, pa numeriranje od Uvoda prolazi', async () => {
    const c = await numberingCheck(true, EXTRA);
    expect(c, 'provjera nije emitirana').toBeTruthy();
    expect(c.status, 'ispravan dvosekcijski rad ne smije pasti').toBe('pass');
    expect(c.earned).toBe(c.max);
  });

  it('kad podnozja nema NIGDJE, provjera i dalje ne prolazi', async () => {
    const c = await numberingCheck(false, []);
    // Bez ijednog PAGE polja provjera se ne emitira; to je jednako valjan ishod kao warn.
    expect(c === null || c.status !== 'pass', 'rad bez podnozja ne smije proci').toBe(true);
  });
});
