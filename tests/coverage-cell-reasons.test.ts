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

type Dokaz = { kind?: string; strength?: string; track?: string; artifactId?: string };
type Cell = { profileId: string; fixerId: string; status: string; reason?: string; evidence?: Dokaz };
const izvjestaj = cells as { cells: Cell[]; summary: { authoredCount: number } };
const CELLS = izvjestaj.cells;
const nepokrivene = CELLS.filter((c) => c.status === 'nepokriveno');
const pokrivene = CELLS.filter((c) => c.status === 'pokriveno');

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

/**
 * DOKAZ IZ NASE PROZE mora ostati raspoznatljiv.
 *
 * Traka `authored` je izvor dokaza od 2026-09-09, odlukom vlasnika. Dotad je 12 napisanih radova
 * zatvaralo NULA celija, iako se na njima 21 fixer dokazano izvodi. Dopustenje je uze nego sto
 * zvuci, i te tri tvrdnje su cijela razlika izmedju dopustenja i rupe u zidu dokaza: takav dokaz
 * nikad ne smije nositi traku stvarnog rada, nikad ne smije tvrditi da se provjera prevrnula, i
 * uvijek mora biti prebrojiv odvojeno.
 */
describe('dokaz iz trake `authored` se ne smije stopiti sa stvarnim radom', () => {
  const authored = pokrivene.filter((c) => c.evidence?.kind === 'authored');

  it('nijedan dokaz iz nase proze ne nosi traku stvarnog rada ni jacinu `resolved`', () => {
    // Anti-vakuum: da ih nema nijedne, tvrdnja bi prolazila ni nad cim.
    expect(authored.length, 'nijedna celija ne pociva na nasoj prozi; izvor je otpao').toBeGreaterThan(0);
    const krivo = authored.filter((c) => c.evidence?.track !== 'authored' || c.evidence?.strength !== 'applied');
    expect(krivo.map((c) => `${c.profileId}|${c.fixerId}`)).toEqual([]);
  });

  it('sazetak broji tocno onoliko koliko celija doista pociva na nasoj prozi', () => {
    expect(izvjestaj.summary.authoredCount).toBe(authored.length);
  });

  /**
   * NEGATIVNA KONTROLA: podmetnut dokaz koji se predstavlja kao stvaran rad mora pasti kroz ISTI
   * izraz kojim tvrdnja iznad prolazi.
   */
  it('podmetnut dokaz s trakom stvarnog rada BI bio uhvacen', () => {
    const podmetnut = {
      profileId: 'fpzg-opci-akademski-rad',
      fixerId: 'section-surgery-fixer',
      status: 'pokriveno',
      evidence: { kind: 'authored', strength: 'resolved', track: 'real', artifactId: 'nase.docx' },
    } as unknown as (typeof pokrivene)[number];
    const krivo = [podmetnut].filter(
      (c) => c.evidence?.track !== 'authored' || c.evidence?.strength !== 'applied',
    );
    expect(krivo).toHaveLength(1);
  });
});
