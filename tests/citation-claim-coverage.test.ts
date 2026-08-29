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
  rows: Row[];
};

/**
 * Ratchet, u korist dokaza. `verified` smije samo rasti, `none` i `advisory` samo padati.
 * Zatecено stanje 2026-08-29: 40 / 23 / 155, uz 3 profila cija tvrdnja proturjeci tokenu.
 */
const MIN_VERIFIED = 40;
const MAX_ADVISORY = 23;
const MAX_NONE = 155;
const MAX_CONTRADICTED = 3;

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
  });

  it('nijedan ieee profil se ne predstavlja kao verificiran dok to nije', () => {
    // Obrazac koji je na FER-u vec opovrgnut (2c214fd7: ieee -> custom) zivi jos na 26 profila.
    const ieee = art.rows.filter((r) => r.token === 'ieee');
    expect(ieee.length).toBeGreaterThan(0);
    const laznoVerificirani = ieee.filter((r) => r.claim === 'verified').map((r) => r.profileId);
    expect(laznoVerificirani, 'ako je ijedan stvarno verificiran, makni ga iz ovog popisa').toEqual([]);
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
  });
});
