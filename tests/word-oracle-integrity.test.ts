/**
 * T62 nastavak: Word oracle ne smije lazno proci kad vrata integriteta odbiju popravak.
 *
 * `scripts/word-verify/repair.mts` je do sada UVIJEK zapisivao `result.docxBytes`, a u JSON nije
 * upisivao `integrityFailure`. Kad vrata odbiju isporuku, ti su bajtovi ULAZ bit-identicno, pa je
 * `check-corpus.ps1` Wordom otvarao original i razina je prolazila. Ovdje se dokazuje:
 *  1. JSON izvjestaj (isti koji `repair.mts` ispisuje) nosi polje `integrityFailure` i nad pravim
 *     malim fixtureom ono je `null` (kljuc prezivi JSON.stringify, dakle nije `undefined`);
 *  2. odbijen popravak se prenosi kao `{part, problem}`;
 *  3. sve tri PowerShell skripte koje parsiraju taj JSON tvrde `integrityFailure === null`.
 * Mutacija koja uklanja provjeru iz `check-corpus.ps1` je u `tests/gate-mutations.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildRepairReport, runOracleRepair } from '../scripts/word-verify/repair-core.mts';
import { readZip } from '../src/repair/zip-codec';
import { WORD_ORACLE_SCRIPTS, wordOracleIntegrityProblems } from './helpers/word-oracle-integrity';

const FIXTURE = 'tests/fixtures/docx/synthetic-hrvatski-naslov1-heading.docx';

describe('Word oracle: integrityFailure u izvjestaju repair.mts', () => {
  it('nad malim fixtureom JSON nosi integrityFailure: null i popravak je stvarno primijenjen', async () => {
    const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), FIXTURE)));
    const { report } = await runOracleRepair(bytes, FIXTURE);
    // Parsira se ono sto bi PowerShell dobio, ne objekt u memoriji: `undefined` bi tu nestao.
    const parsed = JSON.parse(JSON.stringify(report)) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(parsed, 'integrityFailure')).toBe(true);
    expect(parsed.integrityFailure).toBeNull();
    // Bez ovoga bi null mogao znaciti i "nista nije ni pokusano".
    expect((parsed.primijenjeno as string[]).length).toBeGreaterThan(0);
  }, 60000);

  it('odbijen popravak prenosi se kao {part, problem}', async () => {
    const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), FIXTURE)));
    const entries = await readZip(bytes);
    const report = buildRepairReport({
      inPath: FIXTURE,
      before: entries,
      // Upravo ono sto applyFixers vrati pri odbijanju: ulazni paket, prazan changelog.
      after: entries,
      assisted: [],
      result: {
        docxBytes: bytes,
        changelog: [],
        skipped: ['font'],
        skippedReasons: {},
        integrityFailure: { part: 'word/document.xml', problem: 'neuparen w:p', offset: 12 },
      },
    });
    const parsed = JSON.parse(JSON.stringify(report)) as Record<string, unknown>;
    expect(parsed.integrityFailure).toEqual({ part: 'word/document.xml', problem: 'neuparen w:p' });
    // Izlaz je bit-identican ulazu: bez polja integrityFailure ovo bi izgledalo kao "sve cisto".
    expect(parsed.izgubljeniDijelovi).toEqual([]);
    expect(parsed.bitIdenticnih).toBe(entries.length);
  });
});

describe('Word oracle: PowerShell skripte tvrde integrityFailure === null', () => {
  it.each(WORD_ORACLE_SCRIPTS)('%s', (path) => {
    const text = readFileSync(resolve(process.cwd(), path), 'utf8');
    expect(wordOracleIntegrityProblems(text)).toEqual([]);
  });

  it('check-corpus.ps1 broji odbijen popravak kao pad (Greska), ne kao red za Word', () => {
    const text = readFileSync(resolve(process.cwd(), 'scripts/word-verify/check-corpus.ps1'), 'utf8').replace(/\r/g, '');
    const blok = /if \(\$null -ne \$res\.integrityFailure\) \{\n([\s\S]*?)\n {2}\}/.exec(text)?.[1] ?? '';
    expect(blok).toContain('Greska = "VRATA INTEGRITETA ODBILA:');
    expect(blok).toContain('continue');
  });

  it('zakomentirana provjera ne prolazi kao ziva', () => {
    const text = readFileSync(resolve(process.cwd(), 'scripts/word-verify/check-corpus.ps1'), 'utf8').replace(/\r/g, '');
    const zakomentirano = text
      .split('\n')
      .map((line) => (line.includes('integrityFailure') ? `# ${line}` : line))
      .join('\n');
    expect(wordOracleIntegrityProblems(zakomentirano).length).toBe(3);
  });
});
