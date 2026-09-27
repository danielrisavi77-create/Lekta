/**
 * Stavka G: Word check skripte brisu svoj izlazni direktorij SAMO na uspjehu (exit 0), samo unutar
 * korijena repozitorija, nikad pod tests/fixtures i samo kad ga git ignorira.
 *
 * Dvije razine dokaza:
 *   1. tekstualni gard nad sve cetiri skripte i pomocnom datotekom (Word se u vitestu ne izvodi);
 *      mutacije su ovdje i u tests/gate-mutations.test.ts;
 *   2. na Windowsu STVARNO izvodjenje `Remove-WordVerifyOutDir` nad sintetickim git repozitorijem
 *      (bez Worda), plus PowerShell parser nad svim skriptama.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  WORD_VERIFY_CLEANUP_HELPER,
  WORD_VERIFY_CLEANUP_SCRIPTS,
  wordVerifyCleanupProblems,
  wordVerifyHelperProblems,
} from './helpers/word-verify-cleanup';

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8').replace(/\r/g, '');
const CALL_LINE = 'Remove-WordVerifyOutDir -Dir $OutDir -RepoRoot $root';

describe('word-verify: izlazni direktorij se brise samo na uspjehu (tekstualni gard)', () => {
  it.each(WORD_VERIFY_CLEANUP_SCRIPTS)('%s zadovoljava gard', (rel) => {
    expect(wordVerifyCleanupProblems(read(rel))).toEqual([]);
  });

  it('pomocna datoteka zadovoljava gard', () => {
    expect(wordVerifyHelperProblems(read(WORD_VERIFY_CLEANUP_HELPER))).toEqual([]);
  });

  it('gard hvata brisanje u grani pada (poziv uvucen ispred exit 1)', () => {
    const src = read('scripts/word-verify/check.ps1');
    const mutirano = src
      .replace(`\n${CALL_LINE}\n`, '\n')
      .replace('  exit 1\n', `  ${CALL_LINE}\n  exit 1\n`);
    expect(mutirano).not.toBe(src);
    expect(wordVerifyCleanupProblems(mutirano)).toContain(
      'poziv brisanja nije na vrhu skripte (uvucen je u blok ili ima druge argumente)',
    );
  });

  it('gard hvata brisanje u finally bloku (brise i kad je Word pao)', () => {
    const src = read('scripts/word-verify/check-toc-case.ps1');
    const mutirano = src
      .replace(`\n${CALL_LINE}\n`, '\n')
      .replace('} finally {\n', `} finally {\n  ${CALL_LINE}\n`);
    expect(mutirano).not.toBe(src);
    expect(wordVerifyCleanupProblems(mutirano).length).toBeGreaterThan(0);
  });

  it('gard hvata zakomentiran poziv i izbacen include pomocne datoteke', () => {
    const src = read('scripts/word-verify/check-corpus.ps1');
    const bezPoziva = src.replace(`\n${CALL_LINE}\n`, `\n# ${CALL_LINE}\n`);
    expect(wordVerifyCleanupProblems(bezPoziva)).toContain('ocekivan tocno jedan poziv Remove-WordVerifyOutDir, nadjeno 0');
    const bezIncludea = src.replace(". (Join-Path $PSScriptRoot 'outdir-cleanup.ps1')\n", '');
    expect(bezIncludea).not.toBe(src);
    expect(wordVerifyCleanupProblems(bezIncludea)).toContain('skripta ne ukljucuje outdir-cleanup.ps1 tocno jednom na vrhu');
  });

  it('gard hvata exit 1 bez ispisa putanje koja ostaje', () => {
    const src = read('scripts/word-verify/check-worst-case.ps1');
    const mutirano = src.replace(
      "  Write-Output 'NEUSPJEH: repair.mts nije javio integrityFailure.'\n  Write-Output \"Izlazni direktorij ostavljen za dijagnozu: $OutDir\"\n",
      "  Write-Output 'NEUSPJEH: repair.mts nije javio integrityFailure.'\n",
    );
    expect(mutirano).not.toBe(src);
    expect(wordVerifyCleanupProblems(mutirano).some((p) => p.includes('ne ispisuje putanju'))).toBe(true);
  });

  it('gard hvata rekurzivni Remove-Item u samoj skripti', () => {
    const src = read('scripts/word-verify/check.ps1');
    const mutirano = src.replace(
      "  Write-Output \"Izlazni direktorij ostavljen za dijagnozu: $OutDir\"\n  exit 1\n",
      "  Remove-Item -LiteralPath $OutDir -Recurse -Force\n  Write-Output \"Izlazni direktorij ostavljen za dijagnozu: $OutDir\"\n  exit 1\n",
    );
    expect(mutirano).not.toBe(src);
    expect(wordVerifyCleanupProblems(mutirano)).toContain('rekurzivni Remove-Item izvan pomocne funkcije: 1');
  });

  it('gard pomocne datoteke hvata uklonjenu granicu repozitorija, fixtura i gita', () => {
    const src = read(WORD_VERIFY_CLEANUP_HELPER);
    const bezFixtura = src.replace(
      '$podFixturama = $full.Equals($fixtures, $cmp) -or $full.StartsWith($fixtures + $sep, $cmp)',
      '$podFixturama = $false',
    );
    expect(bezFixtura).not.toBe(src);
    expect(wordVerifyHelperProblems(bezFixtura)).toContain('funkcija ne izuzima tests/fixtures');
    const bezGita = src.replace('if (-not $ignoriran -or $praceno.Count -gt 0) {', 'if ($false) {');
    expect(bezGita).not.toBe(src);
    expect(wordVerifyHelperProblems(bezGita)).toContain(
      'funkcija ne odustaje kad git direktorij ne ignorira ili u njemu prati datoteke',
    );
    const bezReturna = src.replace(/(if \(-not \$uRepou -or \$podFixturama\) \{\n[^\n]*\n) {4}return\n/, '$1');
    expect(bezReturna).not.toBe(src);
    expect(wordVerifyHelperProblems(bezReturna).length).toBeGreaterThan(0);
  });
});

const onWindows = process.platform === 'win32';

function powershell(command: string) {
  return spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    encoding: 'utf8',
    timeout: 60_000,
    windowsHide: true,
  });
}

const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;

describe.skipIf(!onWindows)('word-verify: stvarno izvodjenje na Windowsu', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('PowerShell parser prihvaca sve cetiri skripte i pomocnu datoteku', () => {
    const files = [...WORD_VERIFY_CLEANUP_SCRIPTS, WORD_VERIFY_CLEANUP_HELPER].map((rel) => resolve(process.cwd(), rel));
    const cmd = files
      .map((f) => `$e=$null; [void][System.Management.Automation.Language.Parser]::ParseFile(${psQuote(f)}, [ref]$null, [ref]$e); "PARSE $($e.Count) ${f.replace(/'/g, "''")}"`)
      .join('; ');
    const r = powershell(cmd);
    expect(r.status).toBe(0);
    const rows = r.stdout.replace(/\r/g, '').split('\n').filter((l) => l.startsWith('PARSE '));
    expect(rows).toHaveLength(files.length);
    for (const row of rows) expect(row).toMatch(/^PARSE 0 /);
  });

  it('brise samo ignoriran direktorij bez pracenih datoteka unutar repozitorija', () => {
    const repo = mkdtempSync(join(tmpdir(), 'lekta-word-outdir-repo-'));
    const outside = mkdtempSync(join(tmpdir(), 'lekta-word-outdir-izvan-'));
    dirs.push(repo, outside);
    const git = (...args: string[]) => {
      const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
    };
    git('init', '-q');
    writeFileSync(join(repo, '.gitignore'), '.tmp-word-verify/\n.tmp-pracen/\n');
    const file = (rel: string) => {
      mkdirSync(join(repo, rel, '..'), { recursive: true });
      writeFileSync(join(repo, rel), 'x');
    };
    file('.tmp-word-verify/a-popravljen.docx');
    file('tests/fixtures/docx/a.docx');
    file('tests/fixtures/.tmp-x/a.docx');
    file('docs/a.md');
    file('.tmp-pracen/a.md');
    file('.tmp-nije-ignoriran/a.docx');
    writeFileSync(join(outside, 'a.docx'), 'x');
    git('add', '.gitignore', 'tests', 'docs');
    git('add', '-f', '.tmp-pracen/a.md');

    const cases: Array<[string, boolean]> = [
      ['.tmp-word-verify', true],
      ['tests/fixtures', false],
      ['tests/fixtures/.tmp-x', false],
      ['docs', false],
      ['.tmp-pracen', false],
      ['.tmp-nije-ignoriran', false],
      ['.', false],
    ];
    const helper = resolve(process.cwd(), WORD_VERIFY_CLEANUP_HELPER);
    const targets: Array<[string, boolean]> = [...cases.map(([rel, del]) => [join(repo, rel), del] as [string, boolean]), [outside, false]];
    const cmd = [`. ${psQuote(helper)}`, ...targets.map(([d]) => `Remove-WordVerifyOutDir -Dir ${psQuote(d)} -RepoRoot ${psQuote(repo)}`)].join('; ');
    const r = powershell(cmd);
    expect(r.status, r.stderr).toBe(0);
    const out = r.stdout.replace(/\r/g, '');
    for (const [d, del] of targets) {
      expect(existsSync(d), `${d} ${del ? 'mora biti obrisan' : 'mora ostati'}`).toBe(!del);
    }
    expect(out.match(/obrisan nakon uspjeha/g)).toHaveLength(1);
    expect(out.match(/NIJE obrisan/g)).toHaveLength(targets.length - 1);
    // Baseline: fixtura je stvarno pod gitom i datoteke postoje (odbijanja nisu vakuumska).
    expect(existsSync(join(repo, 'tests/fixtures/docx/a.docx'))).toBe(true);
    expect(existsSync(join(repo, '.tmp-pracen/a.md'))).toBe(true);
  });
});
