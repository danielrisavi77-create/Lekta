/**
 * Gard za `npm run orphan-scan`.
 *
 * Skener trazi razred kvara koji je 2026-08-30 u jednom danu ugrizao cetiri puta: COMMITAN OVISNIK
 * uz NECOMMITANU OVISNOST. U dijeljenom radnom stablu se ne vidi, jer stablo ima oboje.
 *
 * MUTACIJA (CLAUDE.md, "gard bez dokaza da grize ne racuna se") podmece TOCNO ta dva stvarna kvara:
 * `buildOutcomeLine` i `dropStaleFieldRegressions` na `141f9848`. Ulaz je pritom SINTETICKI, ne
 * citan iz gita, i to je namjerno: `actions/checkout` u CI-u klonira do dubine 1, pa taj commit
 * ondje ne postoji. Mutacija koja se u CI-u tiho preskoci nije mutacija.
 *
 * BASELINE uz svaku mutaciju: nemutiran ulaz mora biti cist, inace bi "prolazio" i skener koji
 * vristi na sve.
 */
import { describe, it, expect } from 'vitest';
import { parseExports, newlyExported, findOrphans, formatReport } from '../scripts/orphan-scan-core.mjs';

/** Lazan repozitorij: koje commitane datoteke spominju koji simbol. */
const repoOf = (mapa: Record<string, string[]>) => ({
  referencesAtHead: (symbol: string) => mapa[symbol] ?? [],
});

describe('orphan-scan: parseExports', () => {
  it('hvata deklaracije, popise, aliase i default', () => {
    const izvor = [
      'export function buildOutcomeLine(x) {}',
      'export const PRAG = 5;',
      'export async function dohvati() {}',
      'export interface Oblik { a: number }',
      'export { interno as vanjsko, drugo };',
      'export default class Panel {}',
    ].join('\n');
    expect(parseExports(izvor)).toEqual(
      ['PRAG', 'buildOutcomeLine', 'default', 'dohvati', 'drugo', 'vanjsko', 'Oblik'].sort(),
    );
  });

  it('ne pada na rijec "export" koja nije na pocetku retka', () => {
    const izvor = ['// vidi export function lazno', 'const s = "export const takodjerLazno = 1";'].join('\n');
    expect(parseExports(izvor)).toEqual([]);
  });
});

describe('orphan-scan: newlyExported', () => {
  it('vraca samo ono cega u commitanoj verziji nema', () => {
    expect(newlyExported('export const a = 1;\nexport const b = 2;', 'export const a = 1;')).toEqual(['b']);
  });

  it('brisanje exporta NIJE nalaz ovog skenera (to vidi tsc nad radnim stablom)', () => {
    expect(newlyExported('export const a = 1;', 'export const a = 1;\nexport const b = 2;')).toEqual([]);
  });
});

describe('orphan-scan: presuda', () => {
  /** MUTACIJA 1: stvarni kvar iz `141f9848`, `tests/repair-outcome.test.ts`. */
  it('prijavljuje buildOutcomeLine kad ga commitani test trazi', () => {
    const nalazi = findOrphans(
      [{ file: 'src/ui/repair-panel.ts', symbols: ['buildOutcomeLine'] }],
      repoOf({ buildOutcomeLine: ['tests/repair-outcome.test.ts'] }),
    );
    expect(nalazi).toEqual([
      { file: 'src/ui/repair-panel.ts', symbol: 'buildOutcomeLine', referencedBy: ['tests/repair-outcome.test.ts'] },
    ]);
  });

  /** MUTACIJA 2: stvarni kvar iz `141f9848`, `tests/real-corpus/harness.ts`. */
  it('prijavljuje dropStaleFieldRegressions kad ga commitani harness trazi', () => {
    const nalazi = findOrphans(
      [{ file: 'src/analysis/repair-regression.ts', symbols: ['dropStaleFieldRegressions'] }],
      repoOf({ dropStaleFieldRegressions: ['tests/real-corpus/harness.ts'] }),
    );
    expect(nalazi).toHaveLength(1);
    expect(nalazi[0].referencedBy).toEqual(['tests/real-corpus/harness.ts']);
  });

  /**
   * BASELINE, i ujedno najvazniji negativan slucaj: `src/analysis/heading-structure.ts` je isti dan
   * imao 131 nov redak i dva nova exporta, a nije rusio nista, jer su izvor, njegov test i
   * dokumentacija putovali kao necommitana TROJKA. Skener koji bi to prijavio tjerao bi ljude da
   * popravljaju kvar kojeg nema.
   */
  it('suti kad nijedna commitana datoteka ne trazi nov simbol', () => {
    const nalazi = findOrphans(
      [{ file: 'src/analysis/heading-structure.ts', symbols: ['looksLikeBibliographyEntry', 'looksLikeTitlePageLabel'] }],
      repoOf({}),
    );
    expect(nalazi).toEqual([]);
  });

  /** Datoteka koja simbol spominje SAMA SEBE ne dokazuje: u HEAD-u stoji njezina stara verzija. */
  it('izuzima datoteku iz koje simbol potjece', () => {
    const nalazi = findOrphans(
      [{ file: 'src/ui/repair-panel.ts', symbols: ['buildOutcomeLine'] }],
      repoOf({ buildOutcomeLine: ['src/ui/repair-panel.ts'] }),
    );
    expect(nalazi).toEqual([]);
  });
});

describe('orphan-scan: izvjestaj', () => {
  it('prazan nalaz se cita kao uredan ishod, ne kao sutnja', () => {
    expect(formatReport([])).toContain('cisto');
  });

  it('nalaz imenuje i simbol i obje strane', () => {
    const tekst = formatReport([
      { file: 'src/ui/repair-panel.ts', symbol: 'buildOutcomeLine', referencedBy: ['tests/repair-outcome.test.ts'] },
    ]);
    expect(tekst).toContain('buildOutcomeLine');
    expect(tekst).toContain('src/ui/repair-panel.ts');
    expect(tekst).toContain('tests/repair-outcome.test.ts');
  });
});
