/**
 * STRUKTURA PAKETA, ne samo dobro oblikovan XML (audit DOCX-20).
 *
 * `scanXmlWellFormed` dokazuje da je svaki dirani dio ispravan XML. To je nuzno, ali nije
 * dovoljno: paket moze biti sastavljen od samih besprijekornih XML-ova i svejedno ne biti valjan
 * OPC paket. Dva nacina, oba ih Word prijavi kao "dokument je ostecen":
 *
 *   1. dio postoji u zipu, ali `[Content_Types].xml` ne kaze kojeg je tipa;
 *   2. `.rels` pokazuje na dio kojeg u paketu nema (visece `r:id`).
 *
 * Oboje nastaje kad popravak DODA ili UKLONI dio (K5 footer flow, uklanjanje praznih dijelova),
 * dakle tocno ondje gdje pojedinacni XML skener ne pomaze.
 *
 * Test ide u OBA smjera. Da provjerava samo kvarove, ne bi dokazao ono sto je ovdje najskuplje:
 * da ne odbija ISPRAVNE dokumente. Prva verzija ove provjere imala je upravo takav kvar (regex s
 * literalnim backspace znakom umjesto `\b`), pa je odbijala svaki stvarni docx.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readZip } from '../src/repair/zip-codec';
import {
  checkContentTypes,
  checkRelationshipTargets,
  checkPackageStructure,
} from '../src/repair/package-integrity';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIR = join(root, 'tests/fixtures/docx');
const RICH = join(FIXTURE_DIR, 'fer-diplomski-puna-struktura.docx');

async function entriesOf(file: string) {
  return readZip(new Uint8Array(readFileSync(file)));
}

describe('ISPRAVAN paket prolazi (nema laznih pozitiva)', () => {
  const fixtures = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.docx'));

  it('ima fixtura za provjeru', () => {
    expect(fixtures.length).toBeGreaterThan(3);
  });

  it.each(fixtures)('%s nema strukturnih problema', async (file) => {
    const issues = await entriesOf(join(FIXTURE_DIR, file)).then(checkPackageStructure);
    expect(issues, JSON.stringify(issues)).toEqual([]);
  });
});

describe('checkContentTypes hvata dio bez deklariranog tipa', () => {
  it('dio s nepoznatom ekstenzijom se prijavljuje', async () => {
    const entries = await entriesOf(RICH);
    const issues = checkContentTypes([...entries, { name: 'word/nepoznato.bin', data: new Uint8Array([1, 2, 3]) }]);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('content-type-missing');
    expect(issues[0].part).toBe('word/nepoznato.bin');
  });

  it('paket bez [Content_Types].xml se prijavljuje JEDNIM kvarom, ne po dijelu', async () => {
    const entries = await entriesOf(RICH);
    const issues = checkContentTypes(entries.filter((e) => e.name !== '[Content_Types].xml'));
    expect(issues).toHaveLength(1);
    expect(issues[0].detail).toContain('nema [Content_Types].xml');
  });

  it('_rels dijelovi se ne traze u sadrzaju tipova (nisu ondje ni po specifikaciji)', async () => {
    const entries = await entriesOf(RICH);
    expect(entries.some((e) => e.name.includes('_rels/'))).toBe(true);
    expect(checkContentTypes(entries)).toEqual([]);
  });
});

describe('checkRelationshipTargets hvata visecu relaciju', () => {
  it('uklonjena slika ostavlja relaciju koja pokazuje u prazno', async () => {
    const entries = await entriesOf(RICH);
    expect(entries.some((e) => e.name.startsWith('word/media/'))).toBe(true);
    const issues = checkRelationshipTargets(entries.filter((e) => !e.name.startsWith('word/media/')));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].kind).toBe('dangling-relationship');
    expect(issues[0].detail).toContain('image1.png');
  });

  /**
   * Vanjske veze (hiperlinkovi) NISU dijelovi paketa. Kad bi se i one provjeravale, svaki
   * dokument s poveznicom na web bio bi proglasen neispravnim.
   */
  it('TargetMode="External" se preskace', async () => {
    const entries = await entriesOf(RICH);
    const rels = entries.find((e) => e.name === 'word/_rels/document.xml.rels')!;
    const xml = new TextDecoder().decode(rels.data);
    const withExternal = xml.replace(
      '</Relationships>',
      '<Relationship Id="rIdX" Type="http://x/hyperlink" Target="https://example.com" TargetMode="External"/></Relationships>',
    );
    const patched = entries.map((e) =>
      e.name === rels.name ? { name: e.name, data: new TextEncoder().encode(withExternal) } : e,
    );
    expect(checkRelationshipTargets(patched)).toEqual([]);
  });
});

/**
 * RAZLIKA IZMEDJU ZATECENOG I UVEDENOG KVARA.
 *
 * Vrata isporuke prijavljuju samo strukturne probleme koje je popravak SAM uveo. Dokument koji je
 * stigao s nepotpunim `[Content_Types].xml` takav i odlazi: to je isto pravilo koje gate vec
 * primjenjuje na XML kvarove (`preexisting`), jer kaznjavati korisnika za tudji ulaz znaci odbiti
 * popravak dokumenta koji bismo inace uspjesno popravili.
 *
 * Bez ove razlike gate je odbijao 29 postojecih testnih paketa, sto je bio prvi znak da je
 * prestrog u krivom smjeru.
 */
describe('zatecen kvar nije nas kvar', () => {
  it('problem koji postoji i na ULAZU i na izlazu nije NOV', async () => {
    const entries = await entriesOf(RICH);
    const okrnjen = [...entries, { name: 'word/zateceno.bin', data: new Uint8Array([9]) }];

    const naUlazu = checkPackageStructure(okrnjen);
    expect(naUlazu.length, 'ulaz mora imati problem da bi test nesto dokazivao').toBeGreaterThan(0);

    const kljucevi = new Set(naUlazu.map((i) => `${i.kind}|${i.part}|${i.detail}`));
    const novi = checkPackageStructure(okrnjen).filter((i) => !kljucevi.has(`${i.kind}|${i.part}|${i.detail}`));
    expect(novi, 'isti paket ne smije proizvesti NOVE probleme').toEqual([]);
  });

  it('problem koji se pojavi TEK na izlazu jest nov', async () => {
    const entries = await entriesOf(RICH);
    const kljucevi = new Set(checkPackageStructure(entries).map((i) => `${i.kind}|${i.part}|${i.detail}`));
    expect(kljucevi.size, 'ispravan ulaz nema problema').toBe(0);

    const izlaz = entries.filter((e) => !e.name.startsWith('word/media/'));
    const novi = checkPackageStructure(izlaz).filter((i) => !kljucevi.has(`${i.kind}|${i.part}|${i.detail}`));
    expect(novi.length).toBeGreaterThan(0);
    expect(novi[0].kind).toBe('dangling-relationship');
  });
});
