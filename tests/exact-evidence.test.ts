import { describe, expect, it } from 'vitest';
import { buildExactEvidence } from '../src/ui/results/exact-evidence';
import type { RuleEntry } from '../src/profiles/profile-schema';
import type { Check, Issue } from '../src/scoring/checks';

/**
 * DOKAZNA LUPA. Do uspostave veze izvor-pravilo `exactEvidence` je bio tip BEZ proizvodjaca:
 * `app.ts` je slao `exactEvidence: false` i nikad nije punio mapu. Ovi gardovi cuvaju da
 * dokaz nikad ne bude potpuniji nego sto podaci dopustaju.
 */

const issue: Issue = {
  severity: 'warning', category: 'formatting', title: 'Margine dokumenta',
  detail: 'Lijeva margina 2,0 cm', where: 'Postavke stranice',
};
const check: Check = {
  id: 'page.margins', category: 'formatting', title: 'Margine dokumenta', status: 'warn',
  earned: 2, max: 6, detail: '2,0 cm', issue, scored: true,
};

function entry(over: Partial<RuleEntry> = {}): RuleEntry {
  return {
    ruleId: 'test--margins', checkId: 'margins', sourceId: 'test-upute',
    quote: 'Margine su 3 cm sa svih strana.',
    sourcePage: 'str. 9 (odjeljak 2.4, tocke 1 i 2)',
    source: { id: 'test-upute', title: 'Sluzbene upute', url: 'https://example.test/u.pdf' },
    ...over,
  } as RuleEntry;
}

const only = (map: Record<string, unknown>) => Object.values(map)[0] as Record<string, unknown>;

describe('dokazna lupa: proizvodjac dokaza', () => {
  it('potpun unos daje dokaz s doslovnim navodom i izvorom', () => {
    const map = buildExactEvidence([check], [issue], [entry()]);
    expect(Object.keys(map)).toHaveLength(1);
    expect(only(map)).toMatchObject({
      verified: true,
      sourceId: 'test-upute',
      title: 'Sluzbene upute',
      url: 'https://example.test/u.pdf',
      quote: 'Margine su 3 cm sa svih strana.',
    });
  });

  it('STRANICA SE NE IZVODI IZ SLOBODNOG TEKSTA: page ostaje null, formulacija se prenosi', () => {
    // `sourcePage` je proza, ne broj. Parsiranje u cijeli broj izgubilo bi odjeljak i tocke,
    // a izmisljanje broja je zabranjeno.
    const got = only(buildExactEvidence([check], [issue], [entry()]));
    expect(got.page).toBeNull();
    expect(got.pageLabel).toBe('str. 9 (odjeljak 2.4, tocke 1 i 2)');
  });

  it('bez doslovnog citata nema dokaza', () => {
    expect(buildExactEvidence([check], [issue], [entry({ quote: null })])).toEqual({});
    expect(buildExactEvidence([check], [issue], [entry({ quote: '   ' })])).toEqual({});
  });

  it('bez RAZRIJESENOG izvora nema dokaza, makar citat postoji', () => {
    // Citat bez atribucije tvrdi vise nego sto zna: ne zna se iz kojeg dokumenta dolazi.
    expect(buildExactEvidence([check], [issue], [entry({ source: null })])).toEqual({});
    expect(buildExactEvidence([check], [issue], [entry({ source: { id: 'x', title: '', url: 'https://a' } as never })])).toEqual({});
    expect(buildExactEvidence([check], [issue], [entry({ source: { id: 'x', title: 'T', url: '' } as never })])).toEqual({});
    expect(buildExactEvidence([check], [issue], [entry({ sourceId: null })])).toEqual({});
  });

  it('bez ucitanih pravila mapa je prazna, a ne izmisljena', () => {
    expect(buildExactEvidence([check], [issue], [])).toEqual({});
    expect(buildExactEvidence([check], [issue], undefined)).toEqual({});
  });

  it('nedostajuca stranica ne izmislja se, nego ostaje null', () => {
    const got = only(buildExactEvidence([check], [issue], [entry({ sourcePage: null })]));
    expect(got.pageLabel).toBeNull();
    expect(got.page).toBeNull();
  });

  /**
   * MOST MEDJU IMENSKIM PROSTORIMA, uspostavljen 2026-09-01. `checkId` na nalazu zivi u
   * prostoru dimenzija (`margins`), a na pravilu u autorskom (`citation-sync-rules`). Spaja ih
   * `RULE_EQUIVALENTS_BY_REGISTRY_ID` po STABILNOM registarskom id-u provjere; svaki par je
   * izveden iz `value` pravila, koji strojno imenuje osi koje pravilo uredjuje.
   *
   * Ovaj slucaj ostaje PRAZAN i mora ostati: `citation-sync-rules` uredjuje sinkronizaciju
   * citata i popisa literature, a nalaz govori o marginama. Most nije "spoji sto se da", nego
   * popis izvedenih parova; kriv par znaci navod iz sluzbene upute uz nalaz koji taj navod ne
   * opravdava, sto je najgori kvar za funkciju ciji je smisao povjerenje.
   *
   * Parove i njihovu izvedivost cuva `tests/rule-evidence-bridge.test.ts`.
   */
  it('pravilo koje ne uredjuje ovu os NE dobiva nalaz, makar most postoji', () => {
    const pravilo = entry({ ruleId: 'p--citation-sync-rules', checkId: 'citation-sync-rules' });
    expect(buildExactEvidence([check], [issue], [pravilo])).toEqual({});
  });

  it('nalaz bez pravila ne dobiva tudji dokaz', () => {
    const drugi = entry({ ruleId: 'test--font', checkId: 'format.font' });
    const map = buildExactEvidence([check], [issue], [drugi]);
    // Pravilo se odnosi na font, nalaz na margine: dokaz se NE smije zalijepiti.
    for (const value of Object.values(map)) {
      expect((value as { quote?: string }).quote).not.toBe(drugi.quote);
    }
  });
});
