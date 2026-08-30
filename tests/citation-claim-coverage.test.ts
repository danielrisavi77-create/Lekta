/**
 * Gard nad tim koliko je citatni stil profila POTKRIJEPLJEN tvrdnjom (T3).
 *
 * ZASTO OVA OS ZASLUZUJE VLASTITI GARD. `rules.recommendedCitation` izgleda kao oznaka, a nije:
 * preko `citationMeta().mode` bira KOJI citatni motor radi, pa time i koje se provjere boduju.
 * Izmjereno na `fpzg-novinarstvo-bibliografija.docx`, mijenjanjem SAMO tokena:
 *
 *     apa7 -> autor-godina:  ocjena 72, 26 bodovanih provjera, 126 bodova u nazivniku
 *     ieee -> brojcani:      ocjena 70, 21 bodovana provjera,  100 bodova u nazivniku
 *
 * Pet bodovanih provjera i 26 bodova ovisi o vrijednosti koju 178 od 218 profila nosi BEZ
 * verificirane tvrdnje. Ta os pritom nije u `DEMOTABLE_CHECK_IDS`, pa `advisory` status na njoj
 * ne gasi nista.
 *
 * Ovaj test NE mijenja bodovanje i ne trazi da se promijeni. On samo ne da da sutnja tiho raste,
 * jednako kao sto se radilo s 82 osi bez tvrdnje: brojevi smiju samo u korist dokaza.
 */
import { describe, it, expect } from 'vitest';
import artifact from '../docs/generated/citation-claim-coverage.json';
import registry from '../data/profiles/verified-profiles.json';

interface Row {
  profileId: string;
  token: string;
  claim: 'verified' | 'advisory' | 'none';
  claimedValue: string | null;
  authority: string | null;
}

const art = artifact as unknown as {
  counts: Record<string, number>;
  contradictedCount: number;
  contradicted: Row[];
  unknownTokenCount: number;
  unknownToken: Row[];
  styleNotInQuoteCount: number;
  styleNotInQuote: Row[];
  rows: Row[];
};

/**
 * Ratchet, u korist dokaza. `verified` smije samo rasti, `none` i `advisory` samo padati.
 *
 * Povijest praga `none`: 155 (pri uvodjenju) -> 162. Rast NIJE popustanje garda nego posljedica
 * commita 888526c9, koji je dodao sedam novih profila s citatnim tokenom i bez ijedne tvrdnje:
 * kifos-{diplomski,zavrsni}, securus-zavrsni, vsig-{diplomski,zavrsni}, vss-{diplomski,zavrsni}.
 * Prag se dize IMENOVANO da se tocno ti profili mogu zatvoriti; svako sljedece dizanje trazi isti
 * obrazac (tko, kojim commitom, koji profili).
 *
 * `contradicted` je s 3 spusten na 0 nakon normalizacije u kanonski token i vise se ne vraca.
 */
const MIN_VERIFIED = 40;
const MAX_ADVISORY = 23;
const MAX_NONE = 162;
const MAX_CONTRADICTED = 0;

/**
 * Token kojeg motor NE POZNAJE tisi je od svega ostalog: `citationMeta` na nepoznat token pada na
 * `custom`, pa profil koji je htio APA autor-godina dobije granu "bez stila" i izgubi pet bodovanih
 * provjera i 26 bodova nazivnika (izmjereno). Zateceno: pet profila nosi `"apa"` umjesto kanonskog
 * `apa7`. Prijelaz na `apa7` je tvrdnja o IZDANJU standarda i ceka vlasnika, pa se ovdje samo drzi
 * da broj ne raste.
 */
const MAX_UNKNOWN_TOKEN = 5;

/**
 * Tvrdnja IMENUJE stil, a njezin vlastiti citat to ime nikad ne izgovara. Takva tvrdnja je
 * ZAKLJUCAK, ne prijepis odredbe, i to je tocno razred koji je FER pilot otkrio: cetiri od pet
 * tvrdnji ondje nije palo na krivom prijepisu nego na TUMACENJU.
 *
 * Zatecено 2026-08-30: 13 profila (33 tvrdnje, od cega 14 sa statusom `verified`). Primjeri koji
 * najbolje pokazuju razred: `chicago-notes` na citatu koji kaze samo "citati se pisu u fusnoti"
 * (fusnota nije Chicago), `harvard` na citatu o velicini stranice i marginama (druga os posve),
 * `apa7` na "po propozicijama casopisa" (delegiranje, ne propis).
 *
 * Ne mijenja se bodovanje niti se tvrdnje diraju: presuda po tvrdnji je vlasnikova. Ovdje se samo
 * drzi da broj ne raste.
 */
const MAX_STYLE_NOT_IN_QUOTE = 13;

describe('citatni token: koliko ih tvrdnja potkrepljuje', () => {
  it('artefakt pokriva svaki profil koji postavlja citatni token', () => {
    const expected = (registry as Array<{ id: string; rules?: { recommendedCitation?: string } }>)
      .filter((p) => p.rules?.recommendedCitation)
      .map((p) => p.id)
      .sort();
    expect(art.rows.map((r) => r.profileId).sort()).toEqual(expected);
  });

  it('brojaci u artefaktu odgovaraju retcima', () => {
    const counts: Record<string, number> = {};
    for (const r of art.rows) counts[r.claim] = (counts[r.claim] ?? 0) + 1;
    expect(art.counts).toEqual(counts);
    expect(art.contradictedCount).toBe(art.contradicted.length);
  });

  it('ratchet: dokaz smije samo rasti, sutnja samo padati', () => {
    expect(art.counts.verified ?? 0, 'verificiranih tvrdnji je manje nego prije').toBeGreaterThanOrEqual(MIN_VERIFIED);
    expect(art.counts.advisory ?? 0, 'vise profila samo sa savjetodavnom tvrdnjom').toBeLessThanOrEqual(MAX_ADVISORY);
    expect(art.counts.none ?? 0, 'vise profila bez ijedne tvrdnje').toBeLessThanOrEqual(MAX_NONE);
    expect(art.contradictedCount, 'vise tvrdnji koje proturjece tokenu').toBeLessThanOrEqual(MAX_CONTRADICTED);
    expect(art.unknownTokenCount, 'vise tokena koje motor ne poznaje').toBeLessThanOrEqual(MAX_UNKNOWN_TOKEN);
    expect(
      art.styleNotInQuoteCount,
      'vise tvrdnji koje imenuju stil sto ga njihov citat ne spominje',
    ).toBeLessThanOrEqual(MAX_STYLE_NOT_IN_QUOTE);
  });

  it('svaka tvrdnja bez imena stila u citatu je imenovana, ne samo prebrojana', () => {
    expect(art.styleNotInQuote.length).toBe(art.styleNotInQuoteCount);
    for (const r of art.styleNotInQuote) {
      expect(r.profileId.length, 'zapis bez profila nije upotrebljiv').toBeGreaterThan(0);
    }
  });

  it('svaki motoru nepoznat token je imenovan, ne samo prebrojan', () => {
    expect(art.unknownToken.length).toBe(art.unknownTokenCount);
    for (const r of art.unknownToken) {
      expect(r.profileId.length, 'zapis bez profila nije upotrebljiv').toBeGreaterThan(0);
      expect(r.token.length).toBeGreaterThan(0);
    }
  });

  /**
   * Presudjeno 2026-08-29 (data/verification/known-findings.json): token `ieee` maknut je sa svih
   * 26 profila jer ga nijedan izvor ne propisuje. Pretrazena su sva 24 citljiva vrela u punom
   * opsegu; rijec "IEEE" pojavljuje se u tocno jednom, i to kao ime casopisa u primjeru literature
   * ("IEEE Trans. Ind. Electron."). Izvori propisuju BROJCANO navodjenje, a grad izricito prepusta
   * izbor stila autoru ("u skladu s odabranim stilom navodjenja").
   *
   * Ovo NIJE prazna tvrdnja: pada cim netko vrati imenovan stil bez verificirane tvrdnje.
   */
  it('imenovan medjunarodni stil ne vraca se bez verificirane tvrdnje', () => {
    const bezDokaza = art.rows.filter((r) => r.token === 'ieee' && r.claim !== 'verified');
    expect(bezDokaza.map((r) => r.profileId), 'ieee je presudjen 2026-08-29 i ne vraca se bez izvora').toEqual([]);
  });

  /**
   * Gard bez dokaza da grize se ne racuna. Podmece se tocno kvar zbog kojeg gard postoji:
   * profil dobije citatni token, a tvrdnje nema. Obje grane su dokazane.
   */
  it('gard na nepotkrijepljen token stvarno grize', () => {
    const brojNepotkrijepljenih = (rows: Row[]) => rows.filter((r) => r.claim === 'none').length;
    expect(brojNepotkrijepljenih(art.rows), 'baseline je izmjeren, ne pretpostavljen').toBe(art.counts.none ?? 0);

    const mutiran: Row[] = [
      ...art.rows,
      { profileId: 'izmisljen-profil', token: 'ieee', claim: 'none', claimedValue: null, authority: null },
    ];
    expect(brojNepotkrijepljenih(mutiran)).toBe((art.counts.none ?? 0) + 1);
    expect(brojNepotkrijepljenih(mutiran)).toBeGreaterThan(MAX_NONE);

    // Ista mutacija mora pasti i na presudi o imenovanom stilu, ne samo na brojacu.
    const vraceniIeee = mutiran.filter((r) => r.token === 'ieee' && r.claim !== 'verified');
    expect(vraceniIeee.map((r) => r.profileId)).toEqual(['izmisljen-profil']);
  });
});
