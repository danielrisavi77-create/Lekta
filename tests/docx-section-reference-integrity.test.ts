/**
 * DOCX-06: podnozje se priznaje samo ako ga ZIVA sekcija stvarno referencira.
 *
 * Dva kvara iste obitelji, oba nadjena usporedbom rjecnika: `src/repair/**` poznaje `w:pPrChange`
 * i `w:sectPrChange`, analiza ih nije poznavala.
 *
 * 1. FANTOMSKA REFERENCA. `w:sectPrChange` je revizijski spremnik UNUTAR `w:sectPr` i cuva STARU
 *    kopiju svojstava sekcije. Reference su se citale s `els(sct,'w:footerReference')`, a `els`
 *    vraca sve POTOMKE, pa je stara referenca prolazila kao ziva. Dokument u kojem je podnozje
 *    UKLONJENO uz pracenje promjena i dalje je javljao brojeve stranica.
 *
 *    Isti razred kvara kao `isLiveSectPr`, koji postoji bas zato sto je `els()` hvatao
 *    `sectPrChange` i kvario ocjenu. Filtar je tada pokrio sam `sectPr`, ali ne i reference u njemu.
 *
 * 2. PODNOZJE SIROCE. `Brojevi stranica` je od strukturne detekcije polja (DOCX-03) trazila PAGE
 *    polje po CIJELOM paketu. Word medjutim redovito ostavlja nereferencirane header/footer dijelove
 *    (npr. nakon brisanja sekcije), a takav se dio NIKAD ne prikazuje. Rad bez ijednog vidljivog
 *    broja stranice tako je dobivao punih 4/4.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder.ts';
import { analyzeFixture } from '../src/analysis/golden-entry.ts';

const PROFILE = 'fpzg-politologija-diplomski'; // requirePageNumbers
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const enc = new TextEncoder();

const FOOTER_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p>' +
  '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
  '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>';

const RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  `<Relationship Id="rId100" Type="${REL_NS}/footer" Target="footer1.xml"/></Relationships>`;

/** Podnozje s PAGE poljem POSTOJI u paketu u svim slucajevima; mijenja se samo referencira li ga tko. */
const EXTRA = [
  { name: 'word/footer1.xml', data: enc.encode(FOOTER_XML) },
  { name: 'word/_rels/document.xml.rels', data: enc.encode(RELS) },
];

const FMT = { font: 'Times New Roman', sizePt: 12, spacing15: true as const, jc: 'both' as const };
const line = (t: string): ParaSpec => ({ text: t, ...FMT });
const BODY: ParaSpec[] = [line('Uvod'), line('Tijelo rada koje nosi smislen sadrzaj.'), line('Zakljucak')];

const sectPr = (inner: string): ParaSpec => ({
  raw:
    `<w:p><w:pPr><w:sectPr xmlns:r="${REL_NS}">` +
    inner +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/>' +
    '</w:sectPr></w:pPr></w:p>',
});

/** Referenca je ZIVA. */
const LIVE = sectPr('<w:footerReference w:type="default" r:id="rId100"/>');

/** Referenca postoji SAMO u revizijskom spremniku: Word je prikazuje kao uklonjenu. */
const PHANTOM = sectPr(
  '<w:sectPrChange w:id="9" w:author="M"><w:sectPr>' +
    '<w:footerReference w:type="default" r:id="rId100"/>' +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    '</w:sectPr></w:sectPrChange>',
);

async function pageCheck(extra: ParaSpec[]) {
  const r: any = await analyzeFixture(buildDocxFile({ paragraphs: [...extra, ...BODY] }, 'ref.docx', EXTRA), {
    profileId: PROFILE,
  });
  const c = (r.checks || []).find((x: any) => x.title === 'Brojevi stranica');
  expect(c, 'provjera "Brojevi stranica" nije pronadjena').toBeTruthy();
  return { check: c, sections: r.details?.sections ?? [] };
}

describe('DOCX-06: podnozje mora biti stvarno referencirano', () => {
  it('ziva referenca se priznaje', async () => {
    const { check, sections } = await pageCheck([LIVE]);
    expect(check.status).toBe('pass');
    expect(sections.some((s: any) => s.hasAnyPageField), 'sekcija mora imati polje').toBe(true);
  });

  it('referenca samo u sectPrChange NIJE ziva', async () => {
    const { check, sections } = await pageCheck([PHANTOM]);
    expect(sections.some((s: any) => s.hasAnyPageField), 'stara referenca je procitana kao ziva').toBe(false);
    expect(check.status, 'uklonjeno podnozje ne smije davati bodove').not.toBe('pass');
  });

  it('podnozje koje nijedna sekcija ne referencira se ne priznaje', async () => {
    const { check } = await pageCheck([]);
    expect(check.status, 'nereferencirano podnozje se nigdje ne prikazuje').not.toBe('pass');
  });
});
