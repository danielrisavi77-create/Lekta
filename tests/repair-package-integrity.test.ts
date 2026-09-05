/**
 * Faza A0 (dokaz zatecenog stanja prije nego se dira ista): zasto postojeci `parseXml` NE SMIJE
 * biti gate za ispravnost .docx paketa.
 *
 * RE-47 je bio: `w:dirty="true"` umetnut IZA kose crte samozatvarajuceg taga
 *
 *     <w:fldChar w:fldCharType="begin"/ w:dirty="true">
 *
 * XML koji vise nije valjan. Prosao je SVE postojece testove, a u produkciji je obarao vlastito
 * brojanje odlomaka (392 -> 71) pa su svi kasniji anchor-osjetljivi fixeri tiho vracali 'no-target'.
 *
 * Ovaj test dokazuje TRI stvari koje odreduju kako se gradi validator:
 *   1. `parseXml` (src/docx/parser.ts) NE baca na tom XML-u. Njegov guard trazi `parsererror` cvor,
 *      sto je PREGLEDNICKA semantika; @xmldom/xmldom taj cvor ne stvara. Kako je xmldom runtime
 *      SVIH testova (tests/setup/xml-dom.ts) i produkcijskog workera, recikliranje `parseXml` kao
 *      gatea dalo bi LAZNO ZELENO tocno na klasi greske zbog koje gate uopce gradimo.
 *   2. Isti xmldom s `onError` kolektorom gresku UREDNO prijavljuje. To je jeftino "drugo misljenje"
 *      koje smije zivjeti u testovima (u Denu, gdje vrti Edge Function, DOMParsera nema).
 *   3. Svih 11 postojecih fixtura je strogo well-formed po svakom dijelu paketa, dakle nema
 *      skrivenog duga: kad gate zazivi, mora biti zelen od prve.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { parseXml } from '../src/docx/parser';
import { readZip } from '../src/repair/zip-codec';
import { scanXmlWellFormed, checkSchemaInvalidContent } from '../src/repair/package-integrity';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(here, 'fixtures', 'docx');

/** Doslovan oblik koji je RE-47 proizvodio: atribut iza kose crte samozatvarajuceg taga. */
const MALFORMED =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
  '<w:p><w:r><w:fldChar w:fldCharType="begin"/ w:dirty="true"></w:r></w:p>' +
  '</w:body></w:document>';

const WELL_FORMED = MALFORMED.replace('/ w:dirty="true">', ' w:dirty="true"/>');

/** xmldom ne baca; greske prijavljuje kroz `onError`. Skupi ih i vrati samo razinu 'error'. */
function xmldomErrors(xml: string): string[] {
  const errors: string[] = [];
  new DOMParser({
    onError: (level: string, message: string) => {
      if (level === 'error' || level === 'fatalError') errors.push(`${level}: ${message}`);
    },
  } as ConstructorParameters<typeof DOMParser>[0]).parseFromString(xml, 'application/xml');
  return errors;
}

describe('A0: parseXml je slijep na RE-47 klasu (zato validator mora biti vlastiti)', () => {
  it('parseXml NE baca na neispravnom samozatvarajucem tagu', () => {
    // Kad bi ovo bacalo, `parseXml` bi bio dovoljan gate i cijeli skener ne bi trebao.
    // Ne baca, pa je ovaj expect namjerno "obrnut": dokumentira slijepu pjegu.
    expect(() => parseXml(MALFORMED, 'RE-47 uzorak')).not.toThrow();
  });

  it('xmldom s onError kolektorom TU gresku prijavljuje', () => {
    const errors = xmldomErrors(MALFORMED);
    expect(errors.length, 'ocekujemo barem jednu prijavljenu gresku').toBeGreaterThan(0);
    expect(errors.join(' ')).toMatch(/closed character|'\/'/i);
  });

  it('ispravan oblik (atribut PRIJE kose crte) ne proizvodi nijednu gresku', () => {
    expect(xmldomErrors(WELL_FORMED)).toEqual([]);
  });
});

describe('A0: baseline - svi postojeci fixturi su strogo well-formed', () => {
  it('svaki XML dio svakog .docx fixturea prolazi bez xmldom greske', async () => {
    const files = readdirSync(FIXTURE_DIR).filter((n) => n.toLowerCase().endsWith('.docx')).sort();
    expect(files.length, 'fixturi moraju postojati').toBeGreaterThan(0);

    const problems: string[] = [];
    for (const name of files) {
      const entries = await readZip(new Uint8Array(readFileSync(join(FIXTURE_DIR, name))));
      for (const entry of entries) {
        if (!/\.(xml|rels)$/i.test(entry.name)) continue;
        const xml = new TextDecoder().decode(entry.data);
        const errors = xmldomErrors(xml);
        if (errors.length) problems.push(`${name} :: ${entry.name} :: ${errors[0]}`);
      }
    }
    expect(problems, `neispravni dijelovi:\n${problems.join('\n')}`).toEqual([]);
  });
});

/**
 * Duplikat atributa je FATALNA XML greska (XML 1.0 sec. 3.1, WFC: Unique Att Spec): Word i lxml
 * takav paket odbijaju. Skener ju dosad nije hvatao jer je ime atributa citao samo za poruku o
 * gresci i nikad ga nije skupljao po elementu. To je tocno oblik kvara koji regex-patcher moze
 * proizvesti: umetne atribut koji vec postoji umjesto da zamijeni postojeci.
 */
describe('A0: duplikat atributa na istom elementu', () => {
  it('odbija dva ista atributa na elementu', () => {
    const xml = '<?xml version="1.0"?><w:p xmlns:w="urn:x" w:id="1" w:id="2"><w:t>x</w:t></w:p>';
    const result = scanXmlWellFormed(xml);
    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/w:id/);
  });

  it('ne prijavljuje lazno kad su imena razlicita', () => {
    const xml = '<?xml version="1.0"?><w:p xmlns:w="urn:x" w:id="1" w:rsid="2"><w:t>x</w:t></w:p>';
    expect(scanXmlWellFormed(xml).ok).toBe(true);
  });

  it('isti atribut na RAZLICITIM elementima je uredan', () => {
    const xml = '<?xml version="1.0"?><w:body xmlns:w="urn:x"><w:p w:id="1"/><w:p w:id="1"/></w:body>';
    expect(scanXmlWellFormed(xml).ok).toBe(true);
  });
});

/**
 * DOBRO OBLIKOVAN, ALI SHEMOM NEVALJAN: razred koji je prosao kroz SVE automatske razine.
 *
 * Izmjereno 2026-09-03: `croatian-typography-fixer` je definicije tab-stopova zamjenjivao tekstom i
 * proizvodio `<w:tabs><w:t xml:space="preserve"> </w:t></w:tabs>`. Word (14.0, `OpenAndRepair=false`)
 * takav dokument ODBIJA otvoriti, a pogodjeno je bilo 6 od 38 stvarnih studentskih radova nakon
 * ZADANOG popravka. Pritom je `scanXmlWellFormed` prolazio, `integrityFailure` je bio `null`, OPC
 * provjere su prolazile i Tier 1 (`lxml`) je paket proglasavao ispravnim.
 *
 * Zato ovaj gard mora imati i dokaz da GRIZE i dokaz da ne vristi na ispravan ulaz: bez drugog bi
 * "prolazio" i gard koji prijavljuje sve.
 */
const zipEntry = (name: string, xml: string) => ({ name, data: new TextEncoder().encode(xml) });
const paragraphWithTabs = (inner: string) =>
  `<?xml version="1.0"?><w:document xmlns:w="urn:x"><w:body><w:p><w:pPr><w:tabs>${inner}</w:tabs></w:pPr><w:r><w:tab/><w:t>Potpis</w:t></w:r></w:p></w:body></w:document>`;

describe('checkSchemaInvalidContent: tekst u <w:tabs>', () => {
  it('GRIZE: <w:t> unutar <w:tabs> se prijavljuje', () => {
    const entries = [zipEntry('word/document.xml', paragraphWithTabs('<w:t xml:space="preserve"> </w:t>'))];
    const issues = checkSchemaInvalidContent(entries);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe('schema-invalid-content');
    expect(issues[0]?.part).toBe('word/document.xml');
    expect(issues[0]?.detail).toContain('w:t');
  });

  it('BASELINE: ispravne definicije tab-stopova ne proizvode nijedan nalaz', () => {
    const entries = [zipEntry('word/document.xml', paragraphWithTabs('<w:tab w:val="right" w:leader="dot" w:pos="4536"/><w:tab w:val="left" w:pos="1134"/>'))];
    expect(checkSchemaInvalidContent(entries)).toHaveLength(0);
  });

  it('BASELINE: prazan <w:tabs> nije nalaz', () => {
    expect(checkSchemaInvalidContent([zipEntry('word/document.xml', paragraphWithTabs(''))])).toHaveLength(0);
  });

  it('NE VRISTI: <w:t> izvan <w:tabs> je posve uredan', () => {
    const xml = '<?xml version="1.0"?><w:document xmlns:w="urn:x"><w:body><w:p><w:r><w:t>obican tekst</w:t></w:r></w:p></w:body></w:document>';
    expect(checkSchemaInvalidContent([zipEntry('word/document.xml', xml)])).toHaveLength(0);
  });

  it('hvata i u fusnotama i u zaglavlju, jer i ondje popravak pise', () => {
    const entries = [
      zipEntry('word/footnotes.xml', paragraphWithTabs('<w:t> </w:t>')),
      zipEntry('word/header1.xml', paragraphWithTabs('<w:t> </w:t>')),
    ];
    expect(checkSchemaInvalidContent(entries).map((i) => i.part).sort()).toEqual(['word/footnotes.xml', 'word/header1.xml']);
  });

  it('OPSEG JE NAMJERNO USKO: dio koji se ne skenira ne prijavljuje se', () => {
    // styles.xml svoje <w:tabs> nosi u definiciji stila; popravak ondje ne pise tekst, pa se ne
    // skenira. Tvrdnja stoji da opseg bude vidljiv, a ne da se slucajno prosiri.
    expect(checkSchemaInvalidContent([zipEntry('word/styles.xml', paragraphWithTabs('<w:t> </w:t>'))])).toHaveLength(0);
  });
});
