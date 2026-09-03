/**
 * DOCX-06: tema-font zapisan na RUNU nije nadjacavao izricit font iz stila.
 *
 * `readRPr` postavlja ILI `font` (kad je `w:rFonts w:ascii` izricit) ILI `fontTheme` (kad je
 * zapisan `w:asciiTheme`), nikad oboje. Kaskada se racunala ovako:
 *
 *   rp = merge(defaultR, style.r, rStyle.r, readRPr(run));
 *   if (!rp.font && rp.fontTheme && themeFontMap) rp.font = ...
 *
 * Kad slabija razina (docDefaults ili stil odlomka) postavi `font`, a jaca (run) `fontTheme`,
 * poslije spajanja postoje OBA kljuca, pa je `rp.font` istinit i tema se nikad ne razrjesava.
 * Pobjedjuje font sa SLABIJE razine, iako izravno oblikovanje runa mora biti jace.
 *
 * Posljedica je bila LAZNI PROLAZ: rad pisan u Calibriju preko teme javljao je Times New Roman i
 * punih 8/8 na provjeri koja nosi najvise bodova u sustavu.
 *
 * Popravak razrjesava temu na SVAKOJ razini kaskade prije spajanja, pa `merge` usporedjuje
 * istovrsne vrijednosti.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile, type ParaSpec } from './helpers/docx-builder.ts';
import { analyzeFixture } from '../src/analysis/golden-entry.ts';

const PROFILE = 'fpzg-politologija-diplomski'; // trazi Times New Roman

const THEME_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office">' +
  '<a:themeElements><a:fontScheme name="Office">' +
  '<a:majorFont><a:latin typeface="Cambria"/></a:majorFont>' +
  '<a:minorFont><a:latin typeface="Calibri"/></a:minorFont>' +
  '</a:fontScheme></a:themeElements></a:theme>';

const THEME_FILE = { name: 'word/theme/theme1.xml', data: new TextEncoder().encode(THEME_XML) };

const DEFAULTS_TNR =
  '<w:docDefaults><w:rPrDefault><w:rPr>' +
  '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/>' +
  '</w:rPr></w:rPrDefault></w:docDefaults>';

const STYLE_TNR =
  '<w:style w:type="paragraph" w:styleId="Tijelo"><w:name w:val="Tijelo"/>' +
  '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/></w:rPr></w:style>';

const stylesXml =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  DEFAULTS_TNR +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>' +
  STYLE_TNR +
  '</w:styles>';

const TEXT = 'Ovo je rečenica akademskog teksta koja nosi smislen sadržaj rada.';

/** Odlomak sa stilom "Tijelo" (izricit TNR) i temom zapisanom NA RUNU (Calibri). */
const styleTnrRunTheme = (n: number): ParaSpec[] =>
  Array.from({ length: n }, () => ({
    raw:
      '<w:p><w:pPr><w:pStyle w:val="Tijelo"/></w:pPr>' +
      '<w:r><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/></w:rPr>' +
      `<w:t xml:space="preserve">${TEXT}</w:t></w:r></w:p>`,
  }));

/** Odlomak bez ikakvog rFonts: font dolazi iz docDefaults (TNR). */
const inheritsDefaults = (n: number): ParaSpec[] =>
  Array.from({ length: n }, () => ({ raw: `<w:p><w:r><w:t xml:space="preserve">${TEXT}</w:t></w:r></w:p>` }));

async function fontCheck(paragraphs: ParaSpec[]) {
  const file = buildDocxFile({ paragraphs, stylesXml }, 'tema.docx', [THEME_FILE]);
  const r: any = await analyzeFixture(file, { profileId: PROFILE });
  const c = (r.checks || []).find((x: any) => x.title === 'Dominantni font');
  expect(c, 'provjera "Dominantni font" nije pronadjena').toBeTruthy();
  return c;
}

describe('DOCX-06: kaskada tema-fonta', () => {
  it('tema na RUNU nadjacava izricit font iz stila', async () => {
    const c = await fontCheck(styleTnrRunTheme(20));
    expect(c.detail, 'javljen je font sa slabije razine kaskade').toContain('Calibri');
    expect(c.status, 'rad u Calibriju ne smije proci provjeru koja trazi Times New Roman').not.toBe('pass');
  });

  it('bez teme na runu i dalje vrijedi font iz docDefaults', async () => {
    const c = await fontCheck(inheritsDefaults(20));
    expect(c.detail).toContain('Times New Roman');
    expect(c.status).toBe('pass');
  });
});

/**
 * `w:cs` I `w:eastAsia` NISU FONT LATINICNOG TEKSTA.
 *
 * `w:rFonts` nosi cetiri nezavisna atributa, svaki za svoje pismo:
 *   `w:ascii` i `w:hAnsi`   latinica, dakle ono sto hrvatski rad zapravo koristi
 *   `w:eastAsia`            istocnoazijska pisma
 *   `w:cs`                  slozena pisma (arapsko, hebrejsko), i to samo za runove koji su takvi
 *
 * `readRPr` je font citao lancem `w:ascii || w:hAnsi || w:cs`, pa je runu koji ima SAMO `w:cs`
 * pripisivao taj font kao font tijela rada. Word u istom slucaju latinicu iscrtava fontom iz stila.
 *
 * IZMJERENO 2026-09-03 na stvarnom radu (`local-04-zavrsni`): 57% teksta nosi tocno
 * `<w:rFonts w:eastAsia="Book Antiqua" w:cs="Book Antiqua"/>`, dakle bez `w:ascii` i bez `w:hAnsi`.
 * Nakon popravka fonta stil `Normal` i `docDefaults` glase Times New Roman, i Word taj dokument
 * iscrtava kao 100% Times New Roman (provjereno COM-om, `Range.Font.Name` po odlomcima tijela).
 * Analiza je svejedno javljala `fail` uz "Book Antiqua (57% analiziranog teksta)".
 *
 * Posljedica je bila dvostruka: besplatna provjera je obarala rad koji pravilo POSTUJE, a placeni
 * popravak je tu os prikazivao kao "automatski nerijesenu", iako je popravio sve sto se moglo
 * popraviti. Pogodjeno je 6 od 38 stvarnih radova, a 0 od 19 golden fixtura i 0 od 7 commitanih
 * radova ima ijedan takav run: sinteticki korpus ovaj oblik ne sadrzi.
 */
describe('DOCX-06b: w:cs i w:eastAsia ne odredjuju font latinice', () => {
  /** Stvarni oblik iz Wordovih dokumenata: samo eastAsia i cs, bez ascii i hAnsi. */
  const csOnly = (n: number): ParaSpec[] =>
    Array.from({ length: n }, () => ({
      raw:
        '<w:p><w:r><w:rPr><w:rFonts w:eastAsia="Book Antiqua" w:cs="Book Antiqua"/></w:rPr>' +
        `<w:t xml:space="preserve">${TEXT}</w:t></w:r></w:p>`,
    }));

  /** Kontrola: isti font, ali zapisan na `w:ascii`. Tada JEST font teksta i mora pasti. */
  const asciiBookAntiqua = (n: number): ParaSpec[] =>
    Array.from({ length: n }, () => ({
      raw:
        '<w:p><w:r><w:rPr><w:rFonts w:ascii="Book Antiqua" w:hAnsi="Book Antiqua"/></w:rPr>' +
        `<w:t xml:space="preserve">${TEXT}</w:t></w:r></w:p>`,
    }));

  it('run sa samo w:cs i w:eastAsia nasljeduje latinicu iz docDefaults', async () => {
    const c = await fontCheck(csOnly(20));
    expect(c.detail, 'font slozenih pisama pripisan je latinici').toContain('Times New Roman');
    expect(c.status, 'rad koji pravilo postuje ne smije pasti').toBe('pass');
  });

  it('KONTROLA: isti font na w:ascii i dalje pada (gard nije samo ugasen)', async () => {
    const c = await fontCheck(asciiBookAntiqua(20));
    expect(c.detail).toContain('Book Antiqua');
    expect(c.status).not.toBe('pass');
  });
});
