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
import { parseExports, newlyExported, findOrphans, formatReport, importedNames } from '../scripts/orphan-scan-core.mjs';

/**
 * Lazan repozitorij: staza -> COMMITANI sadrzaj.
 *
 * `referencesAtHead` namjerno radi po tekstu, tocno kao `git grep` u skripti, pa testovi vjezbaju i
 * predfiltar i presudu. Da vraca vec profiltrirane pogotke, lazni nalaz koji je ovaj skener imao ne
 * bi se mogao reproducirati.
 */
const repoOf = (files: Record<string, string>) => ({
  referencesAtHead: (symbol: string) =>
    Object.keys(files).filter((path) => new RegExp(`\\b${symbol}\\b`).test(files[path])),
  sourceAtHead: (path: string) => files[path] ?? '',
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

describe('orphan-scan: importedNames', () => {
  it('hvata imenovani uvoz, ponovni izvoz i destrukturirani dinamicki uvoz', () => {
    const izvor = [
      "import { buildOutcomeLine, druga as lokalna } from '../src/ui/repair-panel';",
      "export { trece } from './x';",
      "const { buildViolatingDocx, VIOLATABLE_CHECK_IDS } = await import('../tests/helpers/violating-docx');",
    ].join('\n');
    expect([...importedNames(izvor)].sort()).toEqual(
      ['VIOLATABLE_CHECK_IDS', 'buildOutcomeLine', 'buildViolatingDocx', 'druga', 'trece'].sort(),
    );
  });

  it('uvoz preko vise redaka nije iznimka', () => {
    expect([...importedNames("import {\n  a,\n  b,\n} from './m';")].sort()).toEqual(['a', 'b']);
  });

  it('ime u nizu ili komentaru NIJE uvoz', () => {
    const izvor = ["const s = ['looksLikeBibliographyEntry'];", '// vidi buildOutcomeLine'].join('\n');
    expect([...importedNames(izvor)]).toEqual([]);
  });
});

describe('orphan-scan: presuda', () => {
  /** MUTACIJA 1: stvarni kvar iz `141f9848`, `tests/repair-outcome.test.ts`. */
  it('prijavljuje buildOutcomeLine kad ga commitani test UVOZI', () => {
    const nalazi = findOrphans(
      [{ file: 'src/ui/repair-panel.ts', symbols: ['buildOutcomeLine'] }],
      repoOf({ 'tests/repair-outcome.test.ts': "import { buildOutcomeLine } from '../src/ui/repair-panel';" }),
    );
    expect(nalazi).toEqual([
      { file: 'src/ui/repair-panel.ts', symbol: 'buildOutcomeLine', referencedBy: ['tests/repair-outcome.test.ts'] },
    ]);
  });

  /** MUTACIJA 2: stvarni kvar iz `141f9848`, `tests/real-corpus/harness.ts`. */
  it('prijavljuje dropStaleFieldRegressions kad ga commitani harness UVOZI', () => {
    const nalazi = findOrphans(
      [{ file: 'src/analysis/repair-regression.ts', symbols: ['dropStaleFieldRegressions'] }],
      repoOf({
        'tests/real-corpus/harness.ts':
          "import { detectPassRegressions, dropStaleFieldRegressions } from '../../src/analysis/repair-regression';",
      }),
    );
    expect(nalazi).toHaveLength(1);
    expect(nalazi[0].referencedBy).toEqual(['tests/real-corpus/harness.ts']);
  });

  /**
   * MUTACIJA 3, i ujedno LAZAN NALAZ koji je ovaj skener stvarno imao (nasla ga druga sesija
   * 2026-08-30, odmah nakon `c60943cc`): `tests/orphan-scan.test.ts` drzi ta dva imena kao NIZOVE u
   * sintetickoj fixturi, a prva verzija je tekstualnu pojavu brojala kao ovisnost. Skener je tako
   * commitanjem VLASTITOG testa sam sebi proizveo ovisnika i prijavio crveno na primjeru odabranom
   * kao dokaz da zna sutjeti.
   */
  it('spominjanje imena u fixturi NIJE ovisnost', () => {
    const nalazi = findOrphans(
      [{ file: 'src/analysis/heading-structure.ts', symbols: ['looksLikeBibliographyEntry', 'looksLikeTitlePageLabel'] }],
      repoOf({
        'tests/orphan-scan.test.ts': [
          "import { findOrphans } from '../scripts/orphan-scan-core.mjs';",
          "const symbols = ['looksLikeBibliographyEntry', 'looksLikeTitlePageLabel'];",
        ].join('\n'),
      }),
    );
    expect(nalazi).toEqual([]);
  });

  /**
   * BASELINE: `src/analysis/heading-structure.ts` je isti dan imao 131 nov redak i dva nova exporta,
   * a nije rusio nista, jer su izvor, njegov test i dokumentacija putovali kao necommitana TROJKA.
   */
  it('suti kad nijedna commitana datoteka ne trazi nov simbol', () => {
    const nalazi = findOrphans(
      [{ file: 'src/analysis/heading-structure.ts', symbols: ['looksLikeBibliographyEntry'] }],
      repoOf({}),
    );
    expect(nalazi).toEqual([]);
  });

  /** Datoteka koja simbol spominje SAMA SEBE ne dokazuje: u HEAD-u stoji njezina stara verzija. */
  it('izuzima datoteku iz koje simbol potjece', () => {
    const nalazi = findOrphans(
      [{ file: 'src/ui/repair-panel.ts', symbols: ['buildOutcomeLine'] }],
      repoOf({ 'src/ui/repair-panel.ts': "import { buildOutcomeLine } from './negdje';" }),
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
