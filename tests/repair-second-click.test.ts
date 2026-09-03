/**
 * DRUGI KLIK NA "POPRAVI".
 *
 * `repair-dispatch-matrix` idempotenciju vec pokriva uzorno: svaki fixer mora imati mutation
 * scenarij i drugi prolaz mora biti no-op, uz tvrdnju potpunosti `seen === FIXER_IDS`. Ali ondje se
 * DRUGI put salju ISTI zahtjevi.
 *
 * Korisnik koji klikne Popravi dvaput ne radi to: njegovi zahtjevi se drugi put IZVODE IZNOVA iz
 * analize POPRAVLJENOG dokumenta. Ta petlja je u ovom repozitoriju vec jednom dala dva razlicita
 * dokumenta (CLAUDE.md, `detectHeadingStructure`, izmjereno na `local-37-zavrsni`), a gard za nju
 * nije postojao.
 *
 * IZMJERENO 2026-09-04 nad 24 commitane fixture: 22 konvergiraju odmah, DVIJE trebaju drugi krug.
 * Nijedna ne raste bez kraja i nijedna ne umnaza tekst; obje miruju u trecem krugu.
 *
 *   grf-diplomski-neuskladjen   `required-section-rules` u 1. krugu vrati `stale-anchor`, jer je
 *                               `section-surgery-fixer` u ISTOJ bateriji pomaknuo indekse i sidro
 *                               izracunato iz analize PRIJE popravka vise ne vrijedi. Tek 2. klik
 *                               umetne "sazetak / abstract" i "kljucne rijeci / keywords".
 *   manual-toc                  `heading-style-fixer` dovrsi naslove tek u 2. krugu, jer se
 *                               detekcija naslova racuna nad dokumentom koji je 1. krug promijenio.
 *
 * To NIJE ostecenje, nego NEPOTPUNOST jednog klika, i tvrdnje nize su pisane da tu razliku cuvaju:
 * duplikat teksta i nekonvergencija su kvar, a "treba drugi krug" je zabiljezeno stanje koje se ne
 * smije POGORSATI. Ako popravite uzrok, popis ispod se smanjuje i test to trazi izricito.
 *
 * DOKAZ DA GRIZE, i STO NE POKRIVA. Provjereno s tri podmetnute mutacije, i samo je JEDNA obarala
 * ovaj test. To ovdje pise jer je granica pokrivenosti dio nalaza, a ne sitnica:
 *
 *   `heading-style-fixer` -> tihi no-op        OBARA ("manual-toc vise NE treba drugi krug")
 *   `dominantDirectRunSize` vracen na stanje
 *     prije 6fa30bfc (dokazano nekonvergentan)  NE OBARA
 *   analiza uvijek javlja sekciju kao
 *     nedostajucu (dakle rizik duplikata)       NE OBARA
 *
 * Druge dvije ne obara jer nijedna od sest fixtura u uzorku nema oblik koji ih pokrece: prva je
 * mjerena na stvarnom radu s 5767 izravnih velicina, druga trazi da fixer stvarno dodje do umetanja.
 * Tvrdnja o UMNAZANJU TEKSTA zato zasad NIJE dokazano griziva; stoji kao zastita za slucaj koji
 * uzorak ne sadrzi, i to je posteno reci umjesto tvrditi pokrivenost koje nema.
 *
 * Prosirenje uzorka na stvarne radove (`tests/fixtures/docx-local`, gitignorirano) obje bi mutacije
 * uhvatilo, ali taj korpus nije commitan.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { applyFixers } from '../src/repair/apply-fixers';
import { buildDefaultRepairRequests } from '../src/repair/default-selection';
import { buildAllRepairableItems } from '../src/ui/repair-item-assembly';
import { draftRuleEntriesFor } from '../src/profiles/drafts-runtime';
import { readZip } from '../src/repair/zip-codec';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PROFILE_ID = 'fpzg-politologija-diplomski';

/** Uzorak: sve Word-autorske fixture plus jedina commitana koja pokazuje `stale-anchor` slucaj. */
const UZORAK: Array<[string, string]> = [
  ['tests/fixtures/docx-word', 'anchor-cases.docx'],
  ['tests/fixtures/docx-word', 'break-and-table.docx'],
  ['tests/fixtures/docx-word', 'manual-toc.docx'],
  ['tests/fixtures/docx-word', 'structure-cases.docx'],
  ['tests/fixtures/docx-word', 'tabstop-and-cs-fonts.docx'],
  ['tests/fixtures/docx', 'grf-diplomski-neuskladjen.docx'],
];

/** Zabiljezeno stanje: ove fixture trebaju DRUGI krug. Popis smije samo padati. */
const TRAZE_DRUGI_KRUG = new Set(['manual-toc.docx', 'grf-diplomski-neuskladjen.docx']);

const MAX_KRUGOVA = 4;

async function odlomci(bytes: Uint8Array): Promise<string[]> {
  const doc = (await readZip(bytes)).find((entry) => entry.name === 'word/document.xml');
  if (!doc) return [];
  const xml = new TextDecoder().decode(doc.data);
  return (xml.match(/<w:p(?:\s[^>]*[^/>])?>[\s\S]*?<\/w:p>/g) ?? [])
    .map((p) => (p.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join('').trim())
    .filter(Boolean);
}

/** Jedan korisnicki klik: analiza -> stavke -> zahtjevi -> popravak. Zahtjevi se IZVODE IZNOVA. */
async function klik(bytes: Uint8Array, ime: string) {
  const profile = resolveProfile(PROFILE_ID) as Record<string, unknown>;
  const result = await analyzeFixture(new File([bytes], ime, { type: DOCX_MIME }), { profileId: PROFILE_ID, profile } as never);
  const items = buildAllRepairableItems({ result, profile, entries: draftRuleEntriesFor(PROFILE_ID) } as never);
  return applyFixers(bytes, buildDefaultRepairRequests(items as never) as never);
}

describe('drugi klik na Popravi: petlja se zatvara i tekst se ne umnaza', () => {
  it.each(UZORAK)('%s/%s', async (dir, ime) => {
    let bytes = new Uint8Array(readFileSync(resolve(dir, ime)));
    let prije = await odlomci(bytes);
    let krugova = 0;

    for (let k = 1; k <= MAX_KRUGOVA; k++) {
      const out = await klik(bytes, ime);
      expect(out.integrityFailure, `${ime}: krug ${k} je pao na vratima integriteta`).toBeUndefined();
      if (out.changelog.length === 0) break;
      krugova = k;
      const poslije = await odlomci(out.docxBytes);

      /**
       * TEKST SE NE SMIJE UMNAZATI. Ovo je granica izmedju "treba jos jedan klik" (podnosivo) i
       * "svaki klik dodaje jos jedan naslov" (kvar koji korisnik vidi). Broji se po POJAVNOSTI, jer
       * `required-section-fixer` umece natpise koje dokument moze vec imati drugdje.
       */
      for (const tekst of new Set(poslije)) {
        const bilo = prije.filter((t) => t === tekst).length;
        const sada = poslije.filter((t) => t === tekst).length;
        if (k > 1) {
          expect(sada, `${ime}: krug ${k} je umnozio odlomak ${JSON.stringify(tekst.slice(0, 40))}`).toBeLessThanOrEqual(Math.max(bilo, 1));
        }
      }
      bytes = out.docxBytes;
      prije = poslije;
    }

    // Petlja MORA stati unutar MAX_KRUGOVA, inace svaki klik mijenja dokument zauvijek.
    expect(krugova, `${ime}: popravak se ne smiruje ni nakon ${MAX_KRUGOVA} krugova`).toBeLessThan(MAX_KRUGOVA);

    const trebaDrugi = krugova > 1;
    expect(
      trebaDrugi,
      trebaDrugi
        ? `${ime}: treba drugi krug, a nije na popisu TRAZE_DRUGI_KRUG (regresija: jedan klik vise ne isporucuje sve)`
        : `${ime}: vise NE treba drugi krug, pa ga makni iz TRAZE_DRUGI_KRUG (popis smije samo padati)`,
    ).toBe(TRAZE_DRUGI_KRUG.has(ime));
  }, 120000);

  it('popis fixtura koje trebaju drugi krug ne raste', () => {
    // Imenovan popis, ne brojka: 2026-08-31 je broj blokatora ostao isti dok se SADRZAJ promijenio,
    // i samo je imenovani popis to uhvatio (CLAUDE.md).
    expect([...TRAZE_DRUGI_KRUG].sort()).toEqual(['grf-diplomski-neuskladjen.docx', 'manual-toc.docx']);
    expect(TRAZE_DRUGI_KRUG.size).toBeLessThanOrEqual(2);
  });
});
