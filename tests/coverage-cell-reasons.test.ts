/**
 * RAZLOG NEPOKRIVENE CELIJE MORA BITI ISTINIT, ne samo prisutan.
 *
 * Ugovor iz `coverage-cells.ts` trazi da svaka celija ima status i, ako je nepokrivena, razlog iz
 * zatvorenog popisa. Do 2026-08-31 je taj popis bio postovan, a jedan razlog svejedno neistinit.
 *
 * IZMJERENO: svih 78 celija s razlogom `univerzalna-higijena-bez-dokaza` pripadalo je fixerima koji
 * PROLAZE kroz `PROFILE_GATE` ili `ASSISTED_RULE_GATE`, dakle profilima koji os DOISTA propisuju.
 * Uzrok je bio `isGated`, koji ne znaci "ovaj profil propisuje os" nego "fixer se pojavljuje u
 * `repair-coverage` matrici"; ta matrica ima redke za samo sest fixera, pa je za preostalih 25
 * svaka takva celija padala na blagu oznaku.
 *
 * Razlika nije kozmeticka: "univerzalna higijena" zvuci kao rub, a `nema-dokaza` je rupa u
 * pokrivenosti bas ondje gdje fakultet nesto propisuje. Nakon popravka: 78 -> 0, `nema-dokaza`
 * 36 -> 114, ukupan broj nepokrivenih celija NEPROMIJENJEN (7848), sto i dokazuje da je rijec o
 * preimenovanju dijagnoze, a ne o promjeni pokrivenosti.
 */
import { describe, expect, it } from 'vitest';
import cells from '../docs/generated/coverage-cells.json';
import { ASSISTED_RULE_GATE, PROFILE_GATE } from './helpers/coverage-cells';

type Cell = { profileId: string; fixerId: string; status: string; reason?: string };
const CELLS = (cells as { cells: Cell[] }).cells;
const nepokrivene = CELLS.filter((c) => c.status === 'nepokriveno');

const imaKapiju = (fixerId: string) => fixerId in PROFILE_GATE || fixerId in ASSISTED_RULE_GATE;

describe('razlog nepokrivene celije', () => {
  it('BASELINE: artefakt nije prazan i doista sadrzi nepokrivene celije', () => {
    // Bez ovoga svaka tvrdnja nize prolazi vakuumski nad praznim popisom.
    expect(CELLS.length).toBeGreaterThan(10_000);
    expect(nepokrivene.length).toBeGreaterThan(1000);
  });

  it('BASELINE: kapije nisu prazne, inace je invarijanta nize besmislena', () => {
    // Da su mape prazne, `imaKapiju` bi uvijek bio `false` i glavna tvrdnja ne bi nista trazila.
    expect(Object.keys(PROFILE_GATE).length).toBeGreaterThanOrEqual(9);
    expect(Object.keys(ASSISTED_RULE_GATE).length).toBeGreaterThanOrEqual(4);
  });

  /**
   * SRZ. `univerzalna-higijena-bez-dokaza` smije nositi SAMO fixer koji nijedan profil ne propisuje
   * ni zastavicom ni asistiranim pravilom. Cim kapija postoji, profil koji je prosao os propisuje,
   * pa je istinit razlog `nema-dokaza`.
   */
  it('univerzalna higijena ne smije stajati na fixeru koji profil propisuje', () => {
    const krivi = nepokrivene
      .filter((c) => c.reason === 'univerzalna-higijena-bez-dokaza' && imaKapiju(c.fixerId))
      .map((c) => `${c.fixerId} @ ${c.profileId}`);
    expect(krivi, `celije s blagom oznakom, a profil os propisuje: ${krivi.slice(0, 10).join(', ')}`).toEqual([]);
  });

  /**
   * Deset fixera koji su nosili tu oznaku. Imenovani su, ne prebrojani: 2026-08-31 je jedan drugi
   * popis ostao na istom BROJU dok se sadrzaj promijenio, i samo je imenovanje to uhvatilo.
   */
  it.each([
    'bibliography-repair-fixer', 'footer-page-fixer', 'footnote-spacing-fixer',
    'heading-case-fixer', 'heading-format-fixer', 'page-number-alignment-fixer',
    'page-numbering-fixer', 'paragraph-spacing-fixer', 'section-insert-fixer',
    'section-surgery-fixer',
  ])('%s prolazi kroz kapiju, pa mu blaga oznaka nikad ne pripada', (fixerId) => {
    expect(imaKapiju(fixerId), `${fixerId} vise nema kapiju; invarijanta bi ga prestala stititi`).toBe(true);
    const blage = nepokrivene.filter((c) => c.fixerId === fixerId && c.reason === 'univerzalna-higijena-bez-dokaza');
    expect(blage).toEqual([]);
  });

  /**
   * NEGATIVNA KONTROLA: podmetnuta celija mora pasti kroz isti izraz kojim tvrdnja iznad prolazi.
   * Bez ovoga bi tvrdnja mogla biti zelena zato sto izraz ne hvata nista.
   */
  it('podmetnuta celija s blagom oznakom BI bila uhvacena', () => {
    const podmetnuta: Cell = {
      profileId: 'mef-doktorski',
      fixerId: 'page-numbering-fixer',
      status: 'nepokriveno',
      reason: 'univerzalna-higijena-bez-dokaza',
    };
    const uhvaceno = [podmetnuta].filter(
      (c) => c.reason === 'univerzalna-higijena-bez-dokaza' && imaKapiju(c.fixerId),
    );
    expect(uhvaceno).toHaveLength(1);
  });

  it('svaka nepokrivena celija ima razlog iz zatvorenog popisa', () => {
    const dopusteni = new Set([
      'profil-ne-propisuje-os', 'univerzalna-higijena-bez-dokaza', 'closed-loop-nije-rijesio',
      'nema-dokaza', 'ceka-ljudski-odabir', 'trazi-ulaz-izvan-dokumenta',
    ]);
    const nepoznati = [...new Set(nepokrivene.map((c) => c.reason).filter((r) => !r || !dopusteni.has(r)))];
    expect(nepoznati).toEqual([]);
  });
});
