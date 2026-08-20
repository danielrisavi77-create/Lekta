/**
 * P3-2: kombinacijski gard za fixere koji POMICU indekse odlomaka.
 *
 * `apply-fixers` ima dvofazni model (RE-46/RE-51): fixeri koji mijenjaju BROJ odlomaka izvode se u
 * drugoj fazi, i to od kraja dokumenta prema pocetku, da ne pomaknu tudje mete. Model vrijedi samo
 * ako je skup `INDEX_SHIFTING_FIXERS` potpun. Pojedinacni testovi po fixeru to ne mogu uhvatiti:
 * svaki od njih sam za sebe prolazi, a kvar nastaje tek u PARU.
 *
 * Zato ovdje: (1) invarijanta da je svaki clan skupa i rangiran, (2) stvarni par koji je otkrio
 * propust.
 */
import { describe, expect, it } from 'vitest';
import {
  applyFixers,
  INDEX_SHIFTING_FIXERS,
  INDEX_SHIFTING_ORDER,
  INSERTS_BUT_ANCHOR_BOUND,
} from './apply-fixers';
import { anchorFingerprintForXml } from '../analysis/element-structure';
import { writeZip, readZip } from './zip-codec';

describe('P3-2: skup fixera koji pomicu indekse mora biti potpun i rangiran', () => {
  /**
   * Fixer koji nije naveden u `INDEX_SHIFTING_ORDER` tiho dobiva 0, pa se izvodi MEDJU PRVIMA u
   * strukturnoj fazi - dakle kao da radi na samom kraju dokumenta. Za fixer koji zapravo dira
   * pocetak to je najgori moguci polozaj, a nista to danas ne prijavljuje.
   */
  it('svaki index-shifting fixer ima izricit rang', () => {
    const missing = [...INDEX_SHIFTING_FIXERS].filter((id) => !INDEX_SHIFTING_ORDER.has(id));
    expect(missing, 'fixer bez ranga tiho ide prvi').toEqual([]);
  });

  it('nijedan rang ne pripada fixeru izvan skupa (mrtav unos)', () => {
    const stray = [...INDEX_SHIFTING_ORDER.keys()].filter((id) => !INDEX_SHIFTING_FIXERS.has(id));
    expect(stray).toEqual([]);
  });

  it('rangovi su jedinstveni, inace redoslijed ovisi o ulaznom poretku', () => {
    const ranks = [...INDEX_SHIFTING_ORDER.values()];
    expect(new Set(ranks).size).toBe(ranks.length);
  });
});

describe('P3-2: fixer koji mijenja broj odlomaka mora biti proglasen', () => {
  /**
   * Ovo je invarijanta koju pojedinacni testovi po fixeru ne mogu uhvatiti: svaki od njih provjeri
   * SVOJ ucinak, a nijedan ne pita "smijem li se izvoditi u prvoj fazi". Ovdje se broj odlomaka
   * mjeri prije i poslije, pa se clanstvo u `INDEX_SHIFTING_FIXERS` izvodi iz PONASANJA, ne iz
   * pamcenja onoga tko je fixer pisao.
   */
  const paragraphCount = (xml: string): number => (xml.match(/<w:p[ >]/g) ?? []).length;

  const tableXml = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Podatak</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
  const withTable =
    '<w:document><w:body>' +
    '<w:p><w:r><w:t>Uvod i Tablica 1.</w:t></w:r></w:p>' +
    tableXml +
    '<w:p><w:r><w:t>Izvorni tekst.</w:t></w:r></w:p>' +
    '<w:sectPr/></w:body></w:document>';

  async function tableDocx(): Promise<Uint8Array> {
    const enc = new TextEncoder();
    return writeZip([
      { name: 'word/document.xml', data: enc.encode(withTable) },
      { name: 'word/styles.xml', data: enc.encode('<w:styles><w:style w:styleId="Normal"/></w:styles>') },
    ]);
  }

  it('element-caption-fixer umece odlomke, pa mora biti index-shifting', async () => {
    const target = {
      id: 'element-table-test',
      kind: 'table' as const,
      anchor: { bodyChildIndex: 1, tableIndex: 0 },
      anchorFingerprint: anchorFingerprintForXml('table', tableXml),
      description: 'Rezultati ankete',
      position: 'above' as const,
      replaceManualCaption: true,
      label: 'Tablica',
    };
    const out = await applyFixers(await tableDocx(), [
      {
        ruleId: 'caption',
        fixerId: 'element-caption-fixer',
        params: {
          version: 1,
          elements: [target],
          labels: { table: 'Tablica', figure: 'Slika', chart: 'Grafikon' },
          lists: [{ kind: 'table' as const, title: 'Popis tablica', placement: 'before-intro' as const }],
        },
      },
    ]);

    // Bez ove dvije tvrdnje test bi prosao vakuumski nad neizmijenjenim originalom.
    expect(out.integrityFailure).toBeUndefined();
    expect(out.changelog.length, 'popravak se doista morao primijeniti').toBeGreaterThan(0);

    const entries = await readZip(out.docxBytes);
    const after = new TextDecoder().decode(entries.find((e) => e.name === 'word/document.xml')!.data);
    const added = paragraphCount(after) - paragraphCount(withTable);

    expect(added, 'fixer je umetnuo odlomke; mjerenje je preduvjet tvrdnje ispod').toBeGreaterThan(0);

    /**
     * IZMJERENI SUDAR, ne propust. Fixer umece odlomke, pa bi po RE-46 pripadao u strukturnu fazu,
     * ali je istovremeno anchor-osjetljiv. Premjestanje je izmjereno na
     * `fer-diplomski-puna-struktura.docx` i dalo GORE stanje: primijenjenih popravaka 6 -> 5, a
     * natpisi su tiho ispali iz changeloga jer su ih bibliography i citation-sync prije njega vec
     * prepisali. Nijedan redoslijed ne rjesava sudar (isto kao RE-55).
     *
     * Zato mora biti u tocno jednom od dva skupa, i to izricito: ili proglasen index-shifting, ili
     * zabiljezen kao poznat sudar. Tiho clanstvo ni u jednom je stanje koje je ovaj test otkrio.
     */
    const declared =
      INDEX_SHIFTING_FIXERS.has('element-caption-fixer') || INSERTS_BUT_ANCHOR_BOUND.has('element-caption-fixer');
    expect(
      declared,
      `element-caption-fixer umece ${added} odlomaka; mora biti ili index-shifting ili zabiljezen sudar`,
    ).toBe(true);
    expect(
      INDEX_SHIFTING_FIXERS.has('element-caption-fixer') && INSERTS_BUT_ANCHOR_BOUND.has('element-caption-fixer'),
      'ne smije biti u oba skupa istovremeno',
    ).toBe(false);
  });
});

describe('P3-2b: table-figure-rescue-fixer', () => {
  /**
   * Isti obrazac kao kod `element-caption-fixer`: fixer umece odlomak, pa treba znati smije li se
   * izvoditi u prvoj fazi. Umetanje se dogadja samo u `landscape` grani (rotacija siroke tablice),
   * i to uz izricitu korisnikovu potvrdu, ali jedan umetnut odlomak pomice mete jednako kao deset.
   */
  const tableXml =
    '<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="9000"/></w:tblGrid>' +
    '<w:tr><w:tc><w:tcPr><w:tcW w:w="9000"/></w:tcPr><w:p><w:r><w:t>Podatak</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
  const beforeP = '<w:p><w:r><w:t>Prije tablice.</w:t></w:r></w:p>';
  const afterP = '<w:p><w:r><w:t>Poslije tablice.</w:t></w:r></w:p>';
  const body = `<w:document><w:body>${beforeP}${tableXml}${afterP}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`;

  async function rescueDocx(): Promise<Uint8Array> {
    const enc = new TextEncoder();
    return writeZip([
      { name: 'word/document.xml', data: enc.encode(body) },
      { name: 'word/styles.xml', data: enc.encode('<w:styles><w:style w:styleId="Normal"/></w:styles>') },
    ]);
  }

  it('u landscape grani umece odlomak, pa mora biti izricito svrstan', async () => {
    const paragraphCount = (xml: string): number => (xml.match(/<w:p[ >]/g) ?? []).length;
    const out = await applyFixers(await rescueDocx(), [
      {
        ruleId: 'rescue',
        fixerId: 'table-figure-rescue-fixer',
        params: {
          version: 1,
          tables: [
            {
              id: 't',
              bodyChildIndex: 1,
              anchorFingerprint: anchorFingerprintForXml('table', tableXml),
              landscape: {
                enabled: true,
                confirmed: true,
                beforeFingerprint: anchorFingerprintForXml('figure', beforeP),
                afterFingerprint: anchorFingerprintForXml('figure', afterP),
              },
              actions: {},
            },
          ],
          figures: [],
        },
      },
    ]);

    expect(out.integrityFailure).toBeUndefined();
    expect(out.changelog.length, 'popravak se doista morao primijeniti').toBeGreaterThan(0);

    const entries = await readZip(out.docxBytes);
    const after = new TextDecoder().decode(entries.find((e) => e.name === 'word/document.xml')!.data);
    const added = paragraphCount(after) - paragraphCount(body);
    expect(added, 'landscape grana umece odlomak s portret sekcijom').toBeGreaterThan(0);

    const declared =
      INDEX_SHIFTING_FIXERS.has('table-figure-rescue-fixer') ||
      INSERTS_BUT_ANCHOR_BOUND.has('table-figure-rescue-fixer');
    expect(
      declared,
      `table-figure-rescue-fixer umece ${added} odlomaka; mora biti ili index-shifting ili zabiljezen sudar`,
    ).toBe(true);
  });
});
