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
 * Posljedica na pravom radu: student koji u popisu literature ima barem jedan DOI klikne
 * "Popravi sve" i bibliografija se TIHO ne popravi (redoslijed, sufiksi, duplikati ostaju),
 * dok popravak izvijesti o uspjehu jer je link-doi prosao.
 *
 * Ulazni redoslijed zahtjeva to NE moze rijesiti: sortiranje po fazama ga nadjacava (izmjereno).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { repairEntriesFor } from '../src/profiles/profile-runtime-maps';
import { bibliographyRepairableItem, linkDoiRepairableItem } from '../src/ui/repair-items';
import { applyFixers, type FixerRequest } from '../src/repair/apply-fixers';

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
   * ZATECENO STANJE, ne zeljeno. Test postoji da se sudar vidi i da se ne moze tiho pogorsati;
   * kad popravak stigne, ovaj test se obrce u "oba moraju proci".
   *
   * Izmjereno je da problem NIJE redoslijed, nego to sto oba fixera pisu po ISTOM odlomku:
   *   - link-doi pa bibliografija -> bibliografija 'invalid-params',
   *   - bibliografija pa link-doi -> link-doi 'stale-anchor'.
   * Vrijedi i kad se pozovu u dva odvojena applyFixers poziva, dakle nijedan poredak ne pomaze.
   *
   * Popravak nije jednoredan i zato ne ide uz ovaj commit: bibliography-repair-fixer bi morao
   * preskociti POJEDINACAN zapis kojem sidro vise ne odgovara (danas obara cijeli popravak), a
   * to povlaci i preslagivanje `params.order` s rupama. Alternativa je da klijent u
   * linkDoiRepairableItem izostavi pojave unutar bibliografskih zapisa kad profil ima
   * bibliography-rules, jer bibliography-repair-fixer za takve zapise DOI hyperlink ionako radi
   * sam (grana `hyperlink: 'doi'` u buildParams).
   */
  it('zatecen sudar: jedan od dva popravka uvijek tiho odustane (RE-55)', async () => {
    const { bytes, bibliography, linkDoi } = await itemsFor();

    const doiFirst = await applyFixers(bytes, [linkDoi, bibliography]);
    expect(doiFirst.skippedReasons['bibliography-repair-fixer-rule']).toBe('invalid-params');
    expect(doiFirst.changelog.length).toBe(1);

    // Obrnut ULAZNI redoslijed ne mijenja nista: applyFixers svejedno sortira po fazama
    // (link-doi nije index-shifting pa ide prvi), sto je i poanta nalaza.
    const bibFirst = await applyFixers(bytes, [bibliography, linkDoi]);
    expect(bibFirst.skippedReasons['bibliography-repair-fixer-rule']).toBe('invalid-params');

    // A kad se bibliografija stvarno izvede prva, u zasebnom prolazu, padne link-doi.
    const step1 = await applyFixers(bytes, [bibliography]);
    expect(step1.changelog.length).toBe(1);
    const step2 = await applyFixers(step1.docxBytes, [linkDoi]);
    expect(step2.skippedReasons['link-doi-fixer-rule']).toBe('stale-anchor');
  }, 30000);
});
