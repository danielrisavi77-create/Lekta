import { describe, expect, it } from 'vitest';
import { summarizeRepairOutcome, describeRepairOutcome } from '../src/repair/repair-outcome';
import { buildOutcomeLine } from '../src/ui/repair-panel';

/**
 * NEGATIVNE KONTROLE za istinitost ishoda popravka.
 *
 * Do 2026-08-22 je `tests/real-corpus/harness.ts` racunao ishod tako da `pass` nije bio
 * dostizan (`unresolved ? 'review' : changed ? 'review' : 'no-op'`), a nazivnik ciljanih
 * provjera je dolazio iz `matchKeys` SVIH ponudjenih stavki i korelirao se po hrvatskom
 * naslovu. Ovi testovi drze sva tri svojstva: dostizan `complete`, istinit nazivnik i
 * korelacija po stabilnom `check.id`.
 */
const check = (over: Partial<{ id: string; title: string; status: string; earned: number; max: number }>) => ({
  status: 'fail',
  earned: 0,
  max: 6,
  ...over,
});

describe('summarizeRepairOutcome', () => {
  it('complete: sve sto je ciljano i prije padalo je razrijeseno', () => {
    const out = summarizeRepairOutcome({
      before: [check({ id: 'page.margins' })],
      after: [check({ id: 'page.margins', status: 'pass', earned: 6 })],
      selected: [{ matchKeys: ['Margine dokumenta'] }],
    });
    expect(out.kind).toBe('complete');
    expect(out.targeted).toEqual(['page.margins']);
    expect(out.resolved).toEqual(['page.margins']);
  });

  it('NEGATIVNA KONTROLA: isti ulaz bez razrjesenja NE smije dati complete', () => {
    const out = summarizeRepairOutcome({
      before: [check({ id: 'page.margins' })],
      after: [check({ id: 'page.margins' })],
      selected: [{ matchKeys: ['Margine dokumenta'] }],
    });
    expect(out.kind).toBe('none');
    expect(out.unresolved).toEqual(['page.margins']);
    expect(out.autoUnresolved).toEqual(['page.margins']);
  });

  it('partial: dio ciljanog rijesen, dio nije', () => {
    const out = summarizeRepairOutcome({
      before: [check({ id: 'page.margins' }), check({ id: 'format.font.dominant' })],
      after: [check({ id: 'page.margins', earned: 6 }), check({ id: 'format.font.dominant' })],
      selected: [{ matchKeys: ['Margine dokumenta', 'Dominantni font'] }],
    });
    expect(out.kind).toBe('partial');
    expect(out.resolved).toEqual(['page.margins']);
    expect(out.unresolved).toEqual(['format.font.dominant']);
  });

  it('NAZIVNIK: provjera koja prije NIJE padala ne ulazi u ciljane', () => {
    const out = summarizeRepairOutcome({
      before: [check({ id: 'page.margins', status: 'pass', earned: 6 })],
      after: [check({ id: 'page.margins', status: 'pass', earned: 6 })],
      selected: [{ matchKeys: ['Margine dokumenta'] }],
    });
    expect(out.targeted).toEqual([]);
    expect(out.kind).toBe('nothing-targeted');
  });

  it('NAZIVNIK: `earned < max` uz status "pass" i dalje je pad (page-numbers obrazac)', () => {
    const out = summarizeRepairOutcome({
      before: [check({ id: 'page.numbers.present', status: 'pass', earned: 0, max: 4 })],
      after: [check({ id: 'page.numbers.present', status: 'pass', earned: 4, max: 4 })],
      selected: [{ matchKeys: ['Brojevi stranica'] }],
    });
    // Status ostaje 'pass' u oba smjera; da se gledao status, ovo se ne bi ni brojalo ni rijesilo.
    expect(out.targeted).toEqual(['page.numbers.present']);
    expect(out.kind).toBe('complete');
  });

  it('neregistriran matchKey naslov se IMENUJE, ne broji kao trajno nerijesen', () => {
    const out = summarizeRepairOutcome({
      before: [check({ id: 'page.margins' })],
      after: [check({ id: 'page.margins', earned: 6 })],
      // 'Consistency Engine' je oznaka motora u panelu, ne naslov provjere koju analiza emitira.
      selected: [{ matchKeys: ['Margine dokumenta', 'Consistency Engine'] }],
    });
    expect(out.unmappedMatchKeys).toEqual(['Consistency Engine']);
    expect(out.targeted).toEqual(['page.margins']);
    expect(out.kind).toBe('complete');
  });

  it('KORELACIJA po id-u, ne po naslovu: preimenovan naslov ne razvezuje par', () => {
    const out = summarizeRepairOutcome({
      before: [check({ id: 'page.margins', title: 'Margine dokumenta' })],
      after: [check({ id: 'page.margins', title: 'Margine (nova formulacija)', earned: 6 })],
      selected: [{ matchKeys: ['Margine dokumenta'] }],
    });
    expect(out.kind).toBe('complete');
  });

  it('asistirana stavka se broji odvojeno od automatskog jaza', () => {
    const out = summarizeRepairOutcome({
      before: [check({ id: 'structure.heading.format' })],
      after: [check({ id: 'structure.heading.format' })],
      selected: [{ matchKeys: ['Oblikovanje naslova po razinama'], requiresConfirmation: true }],
    });
    expect(out.autoUnresolved).toEqual([]);
    expect(out.assistedUnresolved).toEqual(['structure.heading.format']);
  });

  it('manualOnly: pad koji nijedna odabrana stavka ne cilja', () => {
    const out = summarizeRepairOutcome({
      before: [check({ id: 'page.margins' }), check({ id: 'scope.words' })],
      after: [check({ id: 'page.margins', earned: 6 }), check({ id: 'scope.words' })],
      selected: [{ matchKeys: ['Margine dokumenta'] }],
    });
    expect(out.manualOnly).toEqual(['scope.words']);
    expect(out.kind).toBe('complete');
  });
});

/**
 * Prikaz ishoda postoji DVAPUT: lokalni panel (`src/ui/repair-panel.ts`, DOM) i serverski put
 * (`src/ui/app.ts`, HTML string). Njihovo razilazenje je vec zabiljezeno kao ponavljajuci kvar
 * (docs/REAL_CORPUS_TESTING.md), pa tvrdnja i brojke moraju dolaziti iz JEDNOG izvora.
 */
describe('describeRepairOutcome (tekst koji vide oba puta)', () => {
  const partial = summarizeRepairOutcome({
    before: [
      { id: 'page.margins', earned: 0, max: 6 },
      { id: 'format.font.dominant', earned: 0, max: 6 },
      { id: 'scope.words', earned: 0, max: 4 },
    ],
    after: [
      { id: 'page.margins', earned: 6, max: 6 },
      { id: 'format.font.dominant', earned: 0, max: 6 },
      { id: 'scope.words', earned: 0, max: 4 },
    ],
    selected: [{ matchKeys: ['Margine dokumenta', 'Dominantni font'] }],
  });

  it('djelomican ishod kaze KOLIKO od KOLIKO, i imenuje rucni ostatak', () => {
    const copy = describeRepairOutcome(partial);
    expect(copy?.headline).toBe('Djelomično popravljeno.');
    expect(copy?.detail).toContain('Razriješeno 1 od 2 ciljanih nalaza');
    expect(copy?.detail).toContain('1 nije uspjelo automatski');
    expect(copy?.detail).toContain('Još 1 nalaz traži ručnu izmjenu');
  });

  it('bez ijedne ciljane provjere nema sto reci (ne izmislja tvrdnju)', () => {
    const nothing = summarizeRepairOutcome({ before: [], after: [], selected: [] });
    expect(describeRepairOutcome(nothing)).toBeNull();
  });

  it('OBA PUTA daju istu tvrdnju: panel (DOM) i serverski omot (HTML)', () => {
    const copy = describeRepairOutcome(partial);
    expect(copy).not.toBeNull();
    // Panel: DOM omot.
    const node = buildOutcomeLine(partial);
    expect(node?.textContent).toBe(`${copy!.headline}${copy!.detail}`);
    // Serverski put: isti izvor, samo escapean u HTML string (zrcali `_ishodHtml` u app.ts).
    const serverHtml = `<p><strong>${copy!.headline}</strong>${copy!.detail}</p>`;
    expect(serverHtml).toContain(copy!.headline);
    expect(serverHtml).toContain(copy!.detail);
  });
});

/**
 * RAZDVAJANJE "primijenjeno pa i dalje pada" od "nije imalo sto primijeniti" (2026-08-29).
 *
 * `assistedUnresolvedCount` je na 74 stvarna FPZG rada iznosio 175, a dio toga su bile stavke koje
 * harness nikad nije stvarno primijenio: `consistency-fixer` (110 ponuda), `citation-bibliography-
 * sync-fixer` (62) i `required-section-fixer` (49) nisu promijenili nijedan od 116 dokumenata, jer
 * im je zadani odabir prazan po konstrukciji. To nije jaz motora nego cekanje covjeka, pa se
 * imenuje umjesto da se broji kao kvar.
 */
describe('summarizeRepairOutcome: cekanje potvrde nije jaz', () => {
  const failing = [check({ id: 'page.margins' })];

  it('stavka s potvrdom i PRAZNIM odabirom ne ulazi u targeted ni u assistedUnresolved', () => {
    const out = summarizeRepairOutcome({
      before: failing,
      after: failing,
      selected: [{ matchKeys: ['Margine dokumenta'], requiresConfirmation: true, params: { version: 1, groups: [], replacements: [] } }],
    });
    expect(out.awaitingConfirmation).toEqual(['page.margins']);
    expect(out.assistedUnresolved).toEqual([]);
    expect(out.targeted).toEqual([]);
    expect(out.kind).toBe('nothing-targeted');
    // Ne smije zavrsiti ni u `manualOnly`: alat to ZNA popraviti cim covjek odabere.
    expect(out.manualOnly).toEqual([]);
  });

  it('NEGATIVNA KONTROLA: ista stavka s NEPRAZNIM odabirom ostaje stvaran jaz', () => {
    const out = summarizeRepairOutcome({
      before: failing,
      after: failing,
      selected: [{ matchKeys: ['Margine dokumenta'], requiresConfirmation: true, params: { version: 1, groups: [{ id: 'g' }], replacements: [{ id: 'r' }] } }],
    });
    expect(out.assistedUnresolved).toEqual(['page.margins']);
    expect(out.awaitingConfirmation).toEqual([]);
    expect(out.targeted).toEqual(['page.margins']);
  });


  /**
   * F5 (2026-08-31), nalaz neovisnog pregleda: opce pravilo je krivo u OBA smjera, a prethodna
   * izvedba ovog testa pribijala je krivu klasifikaciju kao ispravnu.
   *
   * `consistency-fixer` s NEPRAZNIM `groups` i praznim `replacements` vraca `no-target`, dakle
   * ceka covjeka; opce pravilo ga je proglasavalo akcijskim jer je jedan niz neprazan.
   * `field-integrity-fixer` radi posao iz `settings.updateFieldsOnOpen` i kad je `fields` prazan;
   * opce pravilo ga je proglasavalo praznim.
   */
  it('consistency: neprazni `groups` uz prazne `replacements` su CEKANJE, ne jaz', () => {
    const out = summarizeRepairOutcome({
      before: failing,
      after: failing,
      selected: [{ matchKeys: ['Margine dokumenta'], fixerId: 'consistency-fixer', requiresConfirmation: true, params: { version: 1, groups: [{ id: 'g' }], replacements: [] } }],
    });
    expect(out.awaitingConfirmation).toEqual(['page.margins']);
    expect(out.assistedUnresolved).toEqual([]);
  });

  it('field-integrity: prazan `fields` uz djelatan `settings` je STVARAN zahvat, ne cekanje', () => {
    const out = summarizeRepairOutcome({
      before: failing,
      after: failing,
      selected: [{ matchKeys: ['Margine dokumenta'], fixerId: 'field-integrity-fixer', requiresConfirmation: true, params: { version: 1, fields: [], settings: { updateFieldsOnOpen: true } } }],
    });
    expect(out.assistedUnresolved).toEqual(['page.margins']);
    expect(out.awaitingConfirmation).toEqual([]);
  });


  /**
   * DRUGI KRUG PREGLEDA (2026-08-31): `WORK_CARRIERS` je propustio bas fixer koji sam u
   * obrazlozenju F7 naveo kao najjaci primjer. Graditelj mu UVIJEK emitira cetiri niza, a fixer
   * radi posao i iskljucivo iz `settings`, pa je stavka koja doista popravlja bila prijavljena kao
   * "ceka covjeka".
   */
  it('final-document-inspector: prazni nizovi uz djelatan `settings` su STVARAN zahvat', () => {
    const out = summarizeRepairOutcome({
      before: failing,
      after: failing,
      selected: [{
        matchKeys: ['Margine dokumenta'],
        fixerId: 'final-document-inspector-fixer',
        requiresConfirmation: true,
        params: { version: 1, revisions: [], comments: [], metadata: [], hiddenText: [], settings: { removeRevisionIds: true } },
      }],
    });
    expect(out.assistedUnresolved).toEqual(['page.margins']);
    expect(out.awaitingConfirmation).toEqual([]);
  });

  it('final-document-inspector: prazni nizovi BEZ postavki su cekanje', () => {
    const out = summarizeRepairOutcome({
      before: failing,
      after: failing,
      selected: [{
        matchKeys: ['Margine dokumenta'],
        fixerId: 'final-document-inspector-fixer',
        requiresConfirmation: true,
        params: { version: 1, revisions: [], comments: [], metadata: [], hiddenText: [], settings: { removeRevisionIds: false } },
      }],
    });
    expect(out.awaitingConfirmation).toEqual(['page.margins']);
  });


  /**
   * TRECI KRUG PREGLEDA (2026-08-31): suzavanje na per-fixer ocitanje ISPUSTILO je kljuceve koje
   * je opce pravilo tocno klasificiralo. Popravak koji je uzi od pravila koje zamjenjuje je
   * nazadak, pa se ovdje pribijaju bas ti ispusteni oblici.
   */
  it.each([
    ['manualToc', { version: 1, fields: [], manualToc: [{ id: 'm' }] }],
    ['bookmarks', { version: 1, fields: [], bookmarks: [{ id: 'b' }] }],
  ])('field-integrity: %s je STVARAN zahvat, ne cekanje', (_label, params) => {
    const out = summarizeRepairOutcome({
      before: failing,
      after: failing,
      selected: [{ matchKeys: ['Margine dokumenta'], fixerId: 'field-integrity-fixer', requiresConfirmation: true, params }],
    });
    expect(out.assistedUnresolved).toEqual(['page.margins']);
  });

  it('final-document-inspector: `customXml` je STVARAN zahvat', () => {
    const out = summarizeRepairOutcome({
      before: failing,
      after: failing,
      selected: [{
        matchKeys: ['Margine dokumenta'], fixerId: 'final-document-inspector-fixer', requiresConfirmation: true,
        params: { version: 1, revisions: [], comments: [], metadata: [], hiddenText: [], customXml: [{ part: 'x' }] },
      }],
    });
    expect(out.assistedUnresolved).toEqual(['page.margins']);
  });

  /**
   * Postavke se citaju STROGO: fixeri usporedjuju `=== true`, pa istinita vrijednost koja nije
   * `true` (npr. niz `"false"`) ovdje ne smije proci kao posao.
   */
  it('postavka koja nije doslovno `true` nije zahvat', () => {
    const out = summarizeRepairOutcome({
      before: failing,
      after: failing,
      selected: [{
        matchKeys: ['Margine dokumenta'], fixerId: 'field-integrity-fixer', requiresConfirmation: true,
        params: { version: 1, fields: [], settings: { updateFieldsOnOpen: 'false' } },
      }],
    });
    expect(out.awaitingConfirmation).toEqual(['page.margins']);
  });

  it('prazan params objekt NIJE cekanje: empty-paragraph-fixer salje {} i uredno radi', () => {
    const out = summarizeRepairOutcome({
      before: failing,
      after: failing,
      selected: [{ matchKeys: ['Margine dokumenta'], requiresConfirmation: true, params: {} }],
    });
    expect(out.awaitingConfirmation).toEqual([]);
    expect(out.assistedUnresolved).toEqual(['page.margins']);
  });

  it('stavka BEZ potvrde nikad nije cekanje, koliko god params bio prazan', () => {
    const out = summarizeRepairOutcome({
      before: failing,
      after: failing,
      selected: [{ matchKeys: ['Margine dokumenta'], params: { operations: [] } }],
    });
    expect(out.awaitingConfirmation).toEqual([]);
    expect(out.autoUnresolved).toEqual(['page.margins']);
  });

  /**
   * Prednost: kad isti check gadja i prazna i stvarna stavka, stvarna pobjedjuje. Bez toga bi
   * jedna prazna stavka sakrila tudji jaz i mjerenje bi izgledalo bolje nego sto jest.
   */
  it('stvarna stavka ima prednost pred praznom za isti check', () => {
    const out = summarizeRepairOutcome({
      before: failing,
      after: failing,
      selected: [
        { matchKeys: ['Margine dokumenta'], requiresConfirmation: true, params: { operations: [] } },
        { matchKeys: ['Margine dokumenta'], params: {} },
      ],
    });
    expect(out.awaitingConfirmation).toEqual([]);
    expect(out.autoUnresolved).toEqual(['page.margins']);
  });

  it('bez `params` ponasanje je kao prije (pozivatelj koji ih ne salje nista ne gubi)', () => {
    const out = summarizeRepairOutcome({
      before: failing,
      after: failing,
      selected: [{ matchKeys: ['Margine dokumenta'], requiresConfirmation: true }],
    });
    expect(out.awaitingConfirmation).toEqual([]);
    expect(out.assistedUnresolved).toEqual(['page.margins']);
  });
});
