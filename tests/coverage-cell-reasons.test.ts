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
import { REPAIR_SURFACE } from '../src/repair/repair-surface';
import cells from '../docs/generated/coverage-cells.json';
import { ASSISTED_RULE_GATE, PROFILE_GATE, buildCoverageCells } from './helpers/coverage-cells';
import { buildRepairCoverageMatrix } from './helpers/repair-coverage';
import authoredNet from '../docs/generated/repair-net.json';
import { liveProfile } from './helpers/live-profile';

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

  /**
   * POMOCNI (`dispatch-only`) fixer nosi svoj razlog SAMO ondje gdje profil os propisuje.
   *
   * Redoslijed u lancu dijagnoze je ugovor, ne stil: prva izvedba je provjeru stavila na vrh i time
   * preuzela 407 celija umjesto 4. Za profil koji os ne propisuje istina je i dalje
   * `profil-ne-propisuje-os`; nova oznaka bi tvrdila da je posrijedi svojstvo alata ondje gdje alat
   * nema sto raditi, dakle blaza prica o istom broju.
   */
  it('razlog pomocnog fixera ne preuzima celije profila koji os ne propisuje', () => {
    const pomocni = new Set(
      Object.entries(REPAIR_SURFACE as Record<string, { kind?: string }>)
        .filter(([, v]) => v.kind === 'dispatch-only')
        .map(([k]) => k),
    );
    // Anti-vakuum: bez ijednog pomocnog fixera tvrdnje nize ne mjere nista.
    expect(pomocni.size, 'nijedan `dispatch-only` fixer; je li `REPAIR_SURFACE` promijenjen?').toBeGreaterThan(0);

    const sTimRazlogom = nepokrivene.filter((c) => c.reason === 'pomocni-fixer-dokaz-nosi-pozivatelj');
    for (const c of sTimRazlogom) {
      expect(pomocni, `${c.profileId}/${c.fixerId}: razlog nosi fixer koji nije pomocni`).toContain(c.fixerId);
    }
    // Gornja granica je BROJ PROFILA: vise od toga znaci da je razlog pojeo celije drugih fixera.
    expect(sTimRazlogom.length, 'razlog je preuzeo vise celija nego sto ima profila po fixeru')
      .toBeLessThanOrEqual(pomocni.size * 407);
    // I donja: mora postojati barem jedna, inace razred tiho nestane iz matrice.
    expect(sTimRazlogom.length, 'nijedna celija s tim razlogom; je li lanac dijagnoze promijenjen?').toBeGreaterThan(0);
  });

  /**
   * `profil-ne-propisuje-os` NE SMIJE STAJATI ONDJE GDJE KAPIJA FIXERA PROLAZI.
   *
   * Kapija zrcali doslovan uvjet iz `src/ui/repair-items.ts` pod kojim se stavka uopce gradi. Ako
   * prolazi, profil os propisuje i stavka se korisniku nudi, pa je oznaka ciji tekst glasi "fixer
   * se ne nudi, i nema se sto dokazivati" neistinita u oba dijela.
   *
   * IZMJERENO 2026-09-12: uzrok je bila grana koja zakljucuje iz `paramsForCheck(...) === null`.
   * Za `footnote.format` ta funkcija vraca `null` za SVAKI profil, ukljucujuci
   * `pravo-porezni-prijediplomski`, koji je POKRIVEN, jer `footnoteTypographyRepairableItem` gradi
   * parametre sam i kroz `paramsForCheck` nikad ne prolazi.
   */
  it('`profil-ne-propisuje-os` ne stoji ondje gdje kapija fixera prolazi', () => {
    const sTimRazlogom = nepokrivene.filter((c) => c.reason === 'profil-ne-propisuje-os');
    // Anti-vakuum: prazan skup bi tvrdnju nize ucinio istinitom ni nad cim.
    expect(sTimRazlogom.length, 'nijedna celija s tim razlogom; je li lanac dijagnoze promijenjen?')
      .toBeGreaterThan(0);
    const lazne = sTimRazlogom.filter((c) => {
      const kapija = PROFILE_GATE[c.fixerId];
      if (!kapija) return false;
      const zivi = liveProfile(c.profileId) as Record<string, unknown> | null;
      return Boolean(zivi && kapija(zivi));
    });
    expect(lazne.map((c) => `${c.profileId}/${c.fixerId}`), 'kapija prolazi, a oznaka tvrdi da profil os ne propisuje')
      .toEqual([]);
  });

  it('svaka nepokrivena celija ima razlog iz zatvorenog popisa', () => {
    const dopusteni = new Set([
      'profil-ne-propisuje-os', 'univerzalna-higijena-bez-dokaza', 'closed-loop-nije-rijesio',
      'nema-dokaza', 'ceka-ljudski-odabir', 'trazi-ulaz-izvan-dokumenta',
      // Pomocni (`dispatch-only`) fixer: unos u changelog nosi onaj koji ga zove, pa mu je dokaz
      // kroz `fixersChanged` strukturno nedostizan. Razred se izvodi iz `REPAIR_SURFACE`.
      'pomocni-fixer-dokaz-nosi-pozivatelj',
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

  /**
   * OVA TVRDNJA I ONA O ZBROJU NIZE SU DANAS PRAZNO ISTINITE, i to je svjesno stanje, ne previd.
   *
   * `authoredCount` je u commitanom artefaktu 0, jer je jedinu celiju koja je pocivala na nasoj
   * prozi (`pravo-porezni-prijediplomski / footnote-typography-fixer`) nadglasao JACI dokaz
   * `closed-loop/resolved`. Obje tvrdnje zato filtriraju prazan niz.
   *
   * ZIVI DOKAZ ISTE INVARIJANTE je tvrdnja NIZE, koja lanac vrti nad stvarnim `repair-net.json` uz
   * namjerno prazan closed-loop, pa jace trake ne mogu nadglasati nista. Ove dvije ozive same cim
   * se dokaz iz proze vrati, pa se ne brisu; brisanje bi ostavilo rupu tocno u trenutku kad opet
   * zatreba.
   */
  it('nijedan dokaz iz nase proze ne nosi traku stvarnog rada ni jacinu `resolved`', () => {
    const krivo = authored.filter((c) => c.evidence?.track !== 'authored' || c.evidence?.strength !== 'applied');
    expect(krivo.map((c) => `${c.profileId}|${c.fixerId}`)).toEqual([]);
  });

  /**
   * ANTI-VAKUUM MJERI ULAZ, NE IZLAZ, i to je ispravak iz 2026-09-13.
   *
   * Dotad je ovdje stajalo `expect(authored.length).toBeGreaterThan(0)` nad COMMITANIM artefaktom.
   * Ta tvrdnja mjeri krivu stvar: traka `authored` je ZADNJA u lancu dokaza, pa broj celija koje na
   * njoj ostanu pada cim ju neka jaca traka nadglasa na istom paru. Izmjereno istog dana: uvodjenje
   * osi `footnote-typography` dalo je paru `pravo-porezni-prijediplomski / footnote-typography-fixer`
   * dokaz `closed-loop/resolved`, a to je bila JEDINA celija koja je pocivala na nasoj prozi, pa je
   * `authoredCount` pao 1 -> 0. Gard je time pao na POBOLJSANJU pokrivenosti, sto je kriva presuda.
   *
   * Pitanje koje anti-vakuum treba postaviti je "je li grana ziva i ispravno oznacena", a ne "je li
   * ju netko nadglasao". Zato se lanac vrti nad STVARNIM `repair-net.json`, uz namjerno PRAZAN
   * closed-loop i prazan stvarni korpus: tada jace trake ne mogu nadglasati nijednu celiju, pa se
   * vidi sto traka `authored` doista nosi. Tri tvrdnje iz zaglavlja ostaju netaknute.
   */
  it('grana `authored` je ziva: bez jacih traka i dalje daje dokaz, i to ispravno oznacen', () => {
    const samoProza = buildCoverageCells(
      buildRepairCoverageMatrix(),
      { rows: [] } as unknown as Parameters<typeof buildCoverageCells>[1],
      { results: [] } as unknown as Parameters<typeof buildCoverageCells>[2],
      authoredNet as unknown as Parameters<typeof buildCoverageCells>[3],
    );
    const izProze = samoProza.cells.filter((c) => c.status === 'pokriveno' && c.evidence.kind === 'authored');
    expect(izProze.length, 'traka `authored` ne daje nijedan dokaz; izvor je otpao').toBeGreaterThan(0);
    const krivo = izProze.filter((c) => c.evidence.track !== 'authored' || c.evidence.strength !== 'applied');
    expect(krivo.map((c) => `${c.profileId}|${c.fixerId}`), 'dokaz iz proze nosi krivu traku ili jacinu').toEqual([]);
    // Sazetak mora brojati bas te celije, inace se ovisnost o vlastitom tekstu gubi u zbroju.
    expect(samoProza.summary.authoredCount).toBe(izProze.length);
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
