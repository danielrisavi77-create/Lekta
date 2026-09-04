/**
 * RE-55: dva fixera koja pisu po ISTOM odlomku, a nisu oba u strukturnoj fazi.
 *
 * applyFixers rasporeduje zahtjeve u dvije faze (RE-46): prvo oni koji NE mijenjaju broj
 * odlomaka, pa INDEX_SHIFTING_FIXERS. Model rjesava slucaj "fixer pomakne INDEKSE drugima", ali
 * ne i "fixer promijeni SADRZAJ odlomka koji je necije sidro".
 *
 * link-doi-fixer nije u strukturnoj fazi (ne mijenja broj odlomaka), pa se izvrsi PRVI. Ako je
 * DOI u bibliografskom zapisu, umetanjem <w:hyperlink> promijeni taj odlomak, pa
 * bibliography-repair-fixer u drugoj fazi vise ne prepozna svoj bibliographyAnchorFingerprint i
 * odustane od CIJELOG popravka s 'invalid-params'.
 *
 * Posljedica je bila: student koji u popisu literature ima barem jedan DOI klikne "Popravi sve" i
 * bibliografija se TIHO ne popravi (redoslijed, sufiksi, duplikati ostaju), dok popravak izvijesti
 * o uspjehu jer je link-doi prosao.
 *
 * Redoslijed to NE moze rijesiti: obrnuto poredani, link-doi dobije 'stale-anchor'. Popravak je
 * zato vlasnistvo nad odlomkom: withoutOverlappingLinkDoiOperations u src/repair/apply-fixers.ts
 * izbacuje preklapajuce link-doi operacije, jer bibliography-repair-fixer nad tim istim odlomkom
 * vec radi oboje sto bi link-doi napravio (kanonizacija `doi:` i vanjska poveznica).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { repairEntriesFor , ensureRepairMapHeavy } from '../src/profiles/profile-runtime-maps';

// repair-map je lijen; ucitaj ga prije prvog repairEntriesFor u ovom modulu.
await ensureRepairMapHeavy();
import { bibliographyRepairableItem, linkDoiRepairableItem } from '../src/ui/repair-items';
import { applyFixers, withoutOverlappingLinkDoiOperations, type FixerRequest } from '../src/repair/apply-fixers';
import { readZip } from '../src/repair/zip-codec';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(here, 'fixtures', 'docx', 'fpzg-novinarstvo-bibliografija.docx');
const PROFILE_ID = 'fpzg-novinarstvo-diplomski';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function itemsFor() {
  const bytes = new Uint8Array(readFileSync(FIXTURE));
  const file = new File([bytes], 'anchor-collision.docx', { type: DOCX_MIME });
  const result = await analyzeFixture(file, { profileId: PROFILE_ID });
  const profile = resolveProfile(PROFILE_ID) as Record<string, unknown>;
  profile.ruleEntries = repairEntriesFor(PROFILE_ID);
  const bibliography = bibliographyRepairableItem(result, profile)[0];
  const linkDoi = linkDoiRepairableItem(result, profile)[0];
  expect(bibliography, 'fixture mora nuditi popravak bibliografije').toBeTruthy();
  expect(linkDoi, 'fixture mora nuditi popravak DOI poveznice').toBeTruthy();
  const request = (item: { fixerId: string; params: unknown }): FixerRequest => ({
    fixerId: item.fixerId as FixerRequest['fixerId'],
    ruleId: `${item.fixerId}-rule`,
    params: item.params as Record<string, unknown>,
  });
  return { bytes, bibliography: request(bibliography), linkDoi: request(linkDoi) };
}

describe('RE-55: link-doi i bibliografija pisu po istom odlomku', () => {
  it('svaki sam po sebi mijenja dokument', async () => {
    const { bytes, bibliography, linkDoi } = await itemsFor();
    const bibOnly = await applyFixers(bytes, [bibliography]);
    expect(bibOnly.changelog.length, 'bibliografija sama mora proci').toBeGreaterThan(0);
    const doiOnly = await applyFixers(bytes, [linkDoi]);
    expect(doiOnly.changelog.length, 'link-doi sam mora proci').toBeGreaterThan(0);
  }, 30000);

  /**
   * Popravak: preklapajuca link-doi operacija se izbacuje iz recepta, jer je bibliografija
   * vlasnik svojih zapisa (radi nad njima vise: poredak, sufiksi, duplikati).
   *
   * Nista se time ne gubi, i to je bila odlucujuca mjera prije izmjene:
   * bibliography-repair-fixer nad tim istim odlomkom vec radi OBOJE sto bi link-doi napravio,
   * sto dokazuje treci test nize.
   */
  it('zajedno prolazi bibliografija, bez obzira na ulazni redoslijed (RE-55)', async () => {
    const { bytes, bibliography, linkDoi } = await itemsFor();
    for (const [label, requests] of [
      ['link-doi pa bibliografija', [linkDoi, bibliography]],
      ['bibliografija pa link-doi', [bibliography, linkDoi]],
    ] as const) {
      const applied = await applyFixers(bytes, requests as FixerRequest[]);
      expect(
        applied.skippedReasons['bibliography-repair-fixer-rule'],
        `${label}: bibliografija vise ne smije tiho odustati`,
      ).toBeUndefined();
      expect(applied.changelog.some((entry) => entry.ruleId === 'bibliography-repair-fixer-rule'), label).toBe(true);
    }
  }, 30000);

  it('DOI iz popisa literature svejedno bude kanoniziran i povezan', async () => {
    const { bytes, bibliography, linkDoi } = await itemsFor();
    const applied = await applyFixers(bytes, [linkDoi, bibliography]);
    const documentXml = new TextDecoder().decode(
      (await readZip(applied.docxBytes)).find((entry) => entry.name === 'word/document.xml')!.data,
    );
    // Kratki oblik nestaje, kanonski ostaje, i zapis dobiva vanjsku poveznicu.
    expect(documentXml).not.toContain('doi:10.1234/abcd.2018');
    expect(documentXml).toContain('https://doi.org/10.1234/abcd.2018');
    expect(documentXml).toContain('<w:hyperlink');
  }, 30000);

});

/**
 * VLASNISTVO SE MORA PREPOZNATI PO TEKSTU, JER SE INDEKSI NE MOGU USPOREDJIVATI.
 *
 * Testovi iznad prolaze i bez ovoga, jer u toj fixturi obje strane daju ISTE indekse. Na stvarnim
 * dokumentima ne daju: `link-doi-structure.ts:109` indeksira preko `extractBodyParagraphs`, a
 * bibliografija preko parserovih odlomaka. Izmjereno 2026-09-04 na `local-06-diplomski`:
 *
 *     link-doi salje indekse          204, 205, 207 ... 240
 *     link-doi STVARNO mijenja        519, 520, 522 ... 555     (konstantan pomak 315)
 *     literatura posjeduje            519..559
 *     filtar prijavi preklapanje      0                          (stvarnih: 22 od 22)
 *
 * Posljedica je bila upravo ona koju zaglavlje ove datoteke opisuje kao rijesenu: bibliografija se
 * TIHO ne popravi, a sucelje javi uspjeh jer je link-doi prosao. Pogadjalo je 4 od 38 stvarnih
 * radova, a 0 od 7 commitanih.
 *
 * ZASTO UNIT TEST, a ne jos jedan prolaz kroz `applyFixers`: pokusaj da se razmak PODMETNE
 * pomicanjem indeksa u zahtjevu ne reproducira kvar, jer tada ni `link-doi` ne nadje svoju metu pa
 * bibliografiji nema sto pokvariti. Takav test prolazi i na neispravnom kodu, dakle mjeri nista.
 * Ugovor koji je stvarno promijenjen je filtar, pa se on i provjerava izravno.
 */
describe('withoutOverlappingLinkDoiOperations: vlasnistvo po tekstu', () => {
  const TEKST = 'atkinson adele i messy flore anne 2012 measuring financial literacy';
  const zahtjevi = (opIndex: number): FixerRequest[] => [
    {
      fixerId: 'bibliography-repair-fixer' as FixerRequest['fixerId'],
      ruleId: 'bib',
      params: { version: 1, entries: [{ id: 'bibliography-519', paragraphIndices: [519], anchorFingerprint: 'biblio-x', anchorText: TEKST }] },
    },
    {
      fixerId: 'link-doi-fixer' as FixerRequest['fixerId'],
      ruleId: 'doi',
      params: { version: 1, operations: [{ id: 'op', paragraphIndex: opIndex, anchorText: TEKST, action: 'normalize-doi' }] },
    },
  ];
  const preostaleOperacije = (out: FixerRequest[]) =>
    ((out.find((r) => r.fixerId === 'link-doi-fixer')!.params as { operations: unknown[] }).operations).length;

  it('GRIZE: operacija se izbacuje i kad indeks dolazi iz druge osnove', () => {
    // 204 je indeks iz link-doi osnove; literatura isti odlomak zove 519. Tekst je isti.
    expect(preostaleOperacije(withoutOverlappingLinkDoiOperations(zahtjevi(204)))).toBe(0);
  });

  it('i dalje se izbacuje kad se indeksi SLUCAJNO poklapaju (zatecÐµÐ½Ð¾ ponasanje)', () => {
    expect(preostaleOperacije(withoutOverlappingLinkDoiOperations(zahtjevi(519)))).toBe(0);
  });

  it('NE VRISTI: operacija nad tudjim odlomkom ostaje', () => {
    const drugi = zahtjevi(204);
    (drugi[1].params as { operations: Array<Record<string, unknown>> }).operations[0].anchorText = 'neki posve drugi odlomak tijela rada';
    expect(preostaleOperacije(withoutOverlappingLinkDoiOperations(drugi))).toBe(1);
  });

  it('BASELINE: bez bibliografije se ne dira nista', () => {
    const samoDoi = zahtjevi(204).filter((r) => r.fixerId === 'link-doi-fixer');
    expect(preostaleOperacije(withoutOverlappingLinkDoiOperations(samoDoi))).toBe(1);
  });
});
