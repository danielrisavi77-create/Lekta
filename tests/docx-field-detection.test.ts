/**
 * DOCX-03: PAGE i TOC se citaju STRUKTURNO iz OOXML polja, ne regexom nad sirovim XML-om.
 *
 * Zatecen kvar: `Brojevi stranica` je postojanje Wordova PAGE polja zakljucivao iz
 * `/\bPAGE\b/i` nad spojenim `document.xml` + zaglavljima + podnozjima, a `Sadrzaj dokumenta`
 * iz `/\bTOC\b/i` nad sirovim `document.xml` ILI iz golog odlomka "Sadrzaj".
 *
 * To nije bio rubni slucaj. Obican prijelom stranice `<w:br w:type="page"/>` zadovoljava
 * `\bPAGE\b` jer navodnici nisu znakovi rijeci, pa je gotovo svaki rad dobivao punih 4 boda za
 * automatsko numeriranje koje nema. Kvar je izasao na vidjelo tek kad je status prestao lagati
 * (DOCX-01): closed-loop test naslovnice je prijavio LAZNU regresiju popravka, jer je fixer
 * uklonio prijelom stranice koji je jedini pravio "prolaz".
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile } from './helpers/docx-builder.ts';
import { analyzeFixture } from '../src/analysis/golden-entry.ts';

const PROFILE = 'fpzg-politologija-diplomski'; // requireToc + requirePageNumbers

const BODY = [
  { text: 'Uvod', font: 'Times New Roman', sizePt: 12, spacing15: true as const, jc: 'both' as const },
  { text: 'Tijelo rada koje sluzi kao nosivi tekst za analizu.', font: 'Times New Roman', sizePt: 12, spacing15: true as const, jc: 'both' as const },
  { text: 'Zakljucak', font: 'Times New Roman', sizePt: 12, spacing15: true as const, jc: 'both' as const },
];

const TOC_FIELD_PARA =
  '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  String.raw`<w:r><w:instrText xml:space="preserve"> TOC \o "1-3" \h \z \u </w:instrText></w:r>` +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
  '<w:r><w:t xml:space="preserve">Uvod&#9;1</w:t></w:r>' +
  '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';

async function checkOf(spec: Parameters<typeof buildDocxFile>[0], title: string) {
  const result: any = await analyzeFixture(buildDocxFile(spec), { profileId: PROFILE });
  const c = (result.checks || []).find((x: any) => x.title === title);
  expect(c, `provjera "${title}" nije pronadjena`).toBeTruthy();
  return c;
}

describe('DOCX-03: PAGE polje se cita strukturno', () => {
  it('prijelom stranice (w:br w:type="page") NIJE PAGE polje', async () => {
    const c = await checkOf(
      { paragraphs: [{ raw: '<w:p><w:r><w:t>Naslovnica</w:t><w:br w:type="page"/></w:r></w:p>' }, ...BODY] },
      'Brojevi stranica',
    );
    expect(c.status).toBe('fail');
    expect(c.earned).toBe(0);
  });

  it('rijec "page" u tekstu NIJE PAGE polje', async () => {
    const c = await checkOf(
      { paragraphs: [{ text: 'See page 12 of the appendix for details.' }, ...BODY] },
      'Brojevi stranica',
    );
    expect(c.status).toBe('fail');
  });

  it('rucno utipkan broj stranice u podnozju NIJE PAGE polje', async () => {
    const c = await checkOf({ paragraphs: BODY, footer: { page: false } }, 'Brojevi stranica');
    expect(c.status).toBe('fail');
  });

  it('pravo PAGE polje u podnozju prolazi s punim bodovima', async () => {
    const c = await checkOf({ paragraphs: BODY, footer: { page: true } }, 'Brojevi stranica');
    expect(c.status).toBe('pass');
    expect(c.earned).toBe(4);
  });

  // `Polozaj broja stranice` postoji samo uz profil koji ga propisuje (pageNumberAlignment).
  it('poravnanje broja stranice se cita iz odlomka SAMOG polja', async () => {
    const withAlign: any = await analyzeFixture(
      buildDocxFile({ paragraphs: BODY, footer: { page: true, align: 'right' } }),
      { profileId: 'pravo-socijalni-rad-diplomski' },
    );
    const c = (withAlign.checks || []).find((x: any) => x.title === 'Položaj broja stranice');
    expect(c, 'provjera "Položaj broja stranice" nije pronadjena').toBeTruthy();
    expect(c.status).toBe('pass');
    expect(c.earned).toBe(3);
  });

  it('lijevo poravnat broj stranice pada kad profil trazi desno', async () => {
    const withAlign: any = await analyzeFixture(
      buildDocxFile({ paragraphs: BODY, footer: { page: true, align: 'left' } }),
      { profileId: 'pravo-socijalni-rad-diplomski' },
    );
    const c = (withAlign.checks || []).find((x: any) => x.title === 'Položaj broja stranice');
    expect(c.status).toBe('warn');
  });
});

describe('DOCX-03: TOC polje se cita strukturno', () => {
  it('goli naslov "Sadrzaj" bez polja NE daje bodove', async () => {
    const c = await checkOf(
      { paragraphs: [{ text: 'Sadržaj', font: 'Times New Roman', sizePt: 12 }, ...BODY] },
      'Sadržaj dokumenta',
    );
    expect(c.status).toBe('fail');
    expect(c.earned).toBe(0);
  });

  it('pravo TOC polje prolazi s punim bodovima', async () => {
    const c = await checkOf(
      { paragraphs: [{ text: 'Sadržaj', font: 'Times New Roman', sizePt: 12 }, { raw: TOC_FIELD_PARA }, ...BODY] },
      'Sadržaj dokumenta',
    );
    expect(c.status).toBe('pass');
    expect(c.earned).toBe(5);
  });

  it('SDT galerija Table of Contents se priznaje kao sadrzaj', async () => {
    const c = await checkOf(
      {
        paragraphs: [
          { raw: '<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Table of Contents"/></w:docPartObj></w:sdtPr><w:sdtContent><w:p><w:r><w:t>Uvod</w:t></w:r></w:p></w:sdtContent></w:sdt>' },
          ...BODY,
        ],
      },
      'Sadržaj dokumenta',
    );
    expect(c.status).toBe('pass');
  });

  it('HYPERLINK cija se meta zavrsava na /toc NE prolazi kao sadrzaj (adversarial K7)', async () => {
    const c = await checkOf(
      {
        paragraphs: [
          {
            raw:
              '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
              '<w:r><w:instrText xml:space="preserve"> HYPERLINK "http://primjer.hr/toc" </w:instrText></w:r>' +
              '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
              '<w:r><w:t>poveznica</w:t></w:r>' +
              '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>',
          },
          ...BODY,
        ],
      },
      'Sadržaj dokumenta',
    );
    expect(c.status).toBe('fail');
  });

  it('rucno utipkan sadrzaj se PRIZNAJE, ali se imenuje kao rucni', async () => {
    const c = await checkOf(
      {
        paragraphs: [
          { text: 'Sadržaj', font: 'Times New Roman', sizePt: 12 },
          { text: '1. Uvod	1' },
          { text: '2. Razrada	4' },
          { text: '3. Zakljucak	9' },
          ...BODY,
        ],
      },
      'Sadržaj dokumenta',
    );
    expect(c.status).toBe('pass');
    expect(c.earned).toBe(5);
    expect(c.detail).toContain('utipkan ručno');
    expect(c.detail).toContain('3 stavki');
  });

  it('stil imena "TOC 1" bez ijednog polja NE prolazi kao sadrzaj', async () => {
    const c = await checkOf(
      { paragraphs: [{ text: 'Sadržaj', styleId: 'TOC1' }, { text: 'Uvod', styleId: 'TOC1' }, ...BODY] },
      'Sadržaj dokumenta',
    );
    expect(c.status).toBe('fail');
  });
});
