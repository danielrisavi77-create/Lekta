/**
 * Gard nad izvjestajem closed-loop petlje kroz katalog (P4-3 u docs/PLAN_POTPUNA_POKRIVENOST.md).
 *
 * Petlja sama NE ide u `npm run check`: 407 profila je dvije stvarne analize plus popravak po
 * profilu. Ovdje se cuva njezin ISHOD - da se ne moze tiho pogorsati, i da regresija ili pad
 * fixera nikad ne prodju kao "uredno stanje".
 *
 * Osvjezavanje: `npm run closed-loop`, pa upisi nove brojke u data/profiles/closed-loop-ratchet.json.
 */
import { describe, expect, it } from 'vitest';
import report from '../docs/generated/closed-loop.json';
import ratchet from '../data/profiles/closed-loop-ratchet.json';

const count = (outcome: string): number => report.rows.filter((r) => r.outcome === outcome).length;

describe('closed-loop kroz katalog: ishod se ne smije tiho promijeniti', () => {
  it('izvjestaj pokriva cijeli katalog', () => {
    expect(report.profileCount).toBe(ratchet.profileCount);
    expect(report.rows).toHaveLength(ratchet.profileCount);
  });

  /**
   * Regresija znaci da je popravak oborio provjeru koja je prolazila, a error da je fixer bacio ili
   * je paket ispao neispravan. Oboje mora ostati na NULI; to nije ratchet nego tvrda granica.
   */
  it('nijedan profil ne zavrsava regresijom ni greskom', () => {
    expect(count('regression'), 'popravak je oborio provjeru koja je prolazila').toBe(0);
    expect(count('error'), 'fixer je bacio ili je paket ispao neispravan').toBe(0);
  });

  it('broj profila koji prolaze petlju ne smije pasti', () => {
    expect(count('pass')).toBeGreaterThanOrEqual(ratchet.pass);
  });

  /**
   * Os `heading-format` mora biti PREKRSENA I RIJESENA na svakom profilu koji `headingRules`
   * propisuje. Bez ove tvrdnje bi njezin izostanak prosao tiho: `pass` bi ostao isti (os koja se ne
   * krsi ne moze ni pasti), a matrica pokrivenosti bi izgubila 42 celije, po 21 za
   * `heading-format-fixer` i `heading-case-fixer`.
   *
   * Uvedeno 2026-09-09 uz samu os. Brojka nije prepisana nego se racuna iz profila, pa raste sama
   * ako se `headingRules` doda jos kojem profilu; prepisana bi istrunula, kao sto je istrunuo
   * `continuesFrom` u izvozu kvarova.
   */
  it('os oblikovanja naslova je prekrsena i rijesena na svakom profilu koji ga propisuje', () => {
    const sPravilima = report.rows.filter((r) => (r.violated as string[]).includes('heading-format'));
    // Anti-vakuum: prazan skup bi ucinio obje tvrdnje nize istinitima ni nad cim.
    expect(sPravilima.length, 'nijedan profil ne krsi os; generator ju je prestao proizvoditi').toBeGreaterThan(15);
    const nerijeseni = sPravilima
      .filter((r) => !(r.axesResolved as string[]).includes('heading-format'))
      .map((r) => r.profileId);
    expect(nerijeseni, 'os je prekrsena a popravak ju nije zatvorio').toEqual([]);
  });

  /**
   * Os `bibliography` mora ostati PRIMIJENJENA na netrivijalnom broju profila.
   *
   * Ne trazi se `resolved`, i to je izmjereno: `reference.alphabetical` postoji samo na dijelu
   * profila, pa je os prvo ozicena kao bodovana i closed-loop je pao s 372 `pass` na 11, uz 361
   * `partial`. Dokaz je zato `applied`, kroz changelog, i tvrdnja mjeri upravo njega.
   *
   * Bez ove tvrdnje bi nestanak popisa literature iz generatora prosao tiho: `pass` bi ostao 372,
   * a matrica bi izgubila 20 celija `bibliography-repair-fixera`.
   */
  it('popravak literature ostaje primijenjen na netrivijalnom broju profila', () => {
    const primijenjen = report.rows.filter((r) => ((r as { axesApplied?: string[] }).axesApplied ?? []).includes('bibliography'));
    expect(primijenjen.length, 'nijedan profil; generator je prestao proizvoditi popis literature').toBeGreaterThan(5);
  });

  /**
   * GLAVNI prolaz mora zapisati KOJI su fixeri promijenili dokument, ne samo koliko ih je zatrazeno.
   *
   * Do 2026-09-09 je `requested` bio goli BROJ, pa je fixer koji se nudi iz profilnih pravila a nema
   * vlastitu os generatora bio strukturno nedokaziv: nije ga mogla pokriti ni grana po osi ni grana
   * preporuka. Izmjereno tada: `section-surgery-fixer` je na devet FPZG profila gradio stavku, ulazio
   * u zadane zahtjeve i upisivao se u changelog uz `integrityFailure === null`, dok je njegova celija
   * citala `nema-dokaza`. Ista mjera je za `unizd-*` profile postojala kroz prolaz preporuka i bila
   * zapisana; razlika je bila iskljucivo u tome tko se biljezi.
   *
   * Bez ove tvrdnje bi nestanak polja prosao tiho: `pass` bi ostao 372, a matrica bi izgubila
   * 13 celija.
   */
  it('glavni prolaz biljezi koji su fixeri doista promijenili dokument', () => {
    const pass = report.rows.filter((r) => r.outcome === 'pass');
    // Anti-vakuum: prazan skup bi tvrdnju nize ucinio istinitom ni nad cim.
    expect(pass.length, 'nijedan profil ne prolazi petlju').toBeGreaterThan(300);
    const prazni = pass
      .filter((r) => (((r as { fixersChanged?: string[] }).fixersChanged ?? []).length === 0))
      .map((r) => r.profileId);
    expect(prazni, 'profil prolazi petlju, a nijedan fixer nije upisan u changelog').toEqual([]);
  });

  /**
   * `section-surgery-fixer` nema vlastitu bodovanu provjeru ni os generatora, pa mu je changelog
   * glavnog prolaza JEDINI dokaz. Brojka je namjerno niska (izmjereno 11) jer os ovisi o tome koliko
   * profila propisuje `section-surgery-rules` u obliku koji daje operaciju nad prvom sekcijom.
   */
  it('zahvat nad sekcijama ostaje dokazan kroz changelog glavnog prolaza', () => {
    const promijenili = report.rows.filter((r) =>
      ((r as { fixersChanged?: string[] }).fixersChanged ?? []).includes('section-surgery-fixer'),
    );
    expect(promijenili.length, 'nijedan profil; zahvat nad sekcijama se prestao izvoditi').toBeGreaterThan(5);
  });

  /**
   * Os `paragraph-spacing` je UVJETNA: krsi se samo kad profil ima `checkParagraphSpacingZero`.
   *
   * Populacija je zato mala (izmjereno 4), i bas to je cini opasnom. Da uvjet tiho prestane
   * pogadjati (preimenovana zastavica, promijenjen graditelj), `pass` bi ostao 372 jer os koja se ne
   * krsi ne moze ni pasti, a matrica bi izgubila tri celije s dokazom `resolved` i jednu bi vratila
   * s `resolved` na `applied`. Prag je namjerno nizak i izveden iz mjerenja, ne prepisan naslijepo.
   */
  it('os razmaka odlomaka je prekrsena i rijesena na svakom profilu koji ju propisuje', () => {
    const sPravilima = report.rows.filter((r) => (r.violated as string[]).includes('paragraph-spacing'));
    // Anti-vakuum: prazan skup bi obje tvrdnje nize ucinio istinitima ni nad cim.
    expect(sPravilima.length, 'nijedan profil ne krsi os; generator ju je prestao proizvoditi').toBeGreaterThan(2);
    const nerijeseni = sPravilima
      .filter((r) => !(r.axesResolved as string[]).includes('paragraph-spacing'))
      .map((r) => r.profileId);
    expect(nerijeseni, 'os je prekrsena a popravak ju nije zatvorio').toEqual([]);
  });

  it('zatecene kategorije odgovaraju zabiljezenima', () => {
    expect(count('pass'), 'pass').toBe(ratchet.pass);
    expect(count('no-repair'), 'no-repair').toBe(ratchet.noRepair);
    expect(count('no-rules'), 'no-rules').toBe(ratchet.noRules);
    expect(count('unresolved'), 'unresolved').toBe(ratchet.unresolved);
    expect(count('partial'), 'partial').toBe(ratchet.partial);
  });

  /**
   * `unresolved` znaci da je popravak izveden a nijedan nalaz nije nestao. Danas ih nema, i to je
   * tvrda granica: prvi takav profil je ili stvarni kvar popravka ili kriva osnovica u harnessu
   * (vidi `liveProfile` u pogonu - analiza i popravak MORAJU gledati istu, `effectiveRules`
   * osnovicu, inace petlja prijavi proturjecje kojeg u proizvodu nema).
   */
  /**
   * `partial` znaci da je dio prekrsenih osi rijesen, a dio nije - i to je vlastiti ishod, ne
   * `pass`. Prvo mjerenje ih je spajalo (usporedjivalo je BROJ NASLOVA provjera s BROJEM OSI, dvije
   * razlicite jedinice) i time precijenilo pokrivenost za 47 profila.
   *
   * Zatecenih sest su svi na osi `paper-size` i svi u dvije obitelji: profil trazi format papira,
   * ali za tu os nema zapisa s fixerom, pa popravak nije ponudjen. To je podatkovni posao, ne kvar
   * motora - imenovani su da ne utihnu.
   */
  it('zatecenih sest djelomicnih profila ostaje imenovano', () => {
    const partial = report.rows.filter((r) => r.outcome === 'partial').map((r) => r.profileId).sort();
    expect(partial).toEqual([...ratchet.partialProfiles].sort());
    for (const row of report.rows.filter((r) => r.outcome === 'partial')) {
      expect(row.axesRemaining, `${row.profileId}: neocekivana preostala os`).toEqual(['paper-size']);
    }
  });

  it('nijedan profil ne ostaje bez ijednog rijesenog nalaza', () => {
    const unresolved = report.rows.filter((r) => r.outcome === 'unresolved').map((r) => r.profileId);
    expect(unresolved, 'popravak je izveden, a nista nije rijeseno').toEqual([]);
  });
});
