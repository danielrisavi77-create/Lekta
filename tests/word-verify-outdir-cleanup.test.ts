// @vitest-environment node
/**
 * Stavka G: Word check skripte brisu svoj izlazni direktorij SAMO na uspjehu (exit 0) i samo kad je
 * Word provjerio barem jedan dokument, ime je .tmp-word-verify ili .tmp-word-corpus, roditelj je
 * korijen repozitorija, nije junction i git ga ignorira (Codex nalaz, krug 2: node_modules).
 *
 * Dvije razine dokaza:
 *   1. tekstualni gard nad sve cetiri skripte i pomocnom datotekom (Word se u vitestu ne izvodi);
 *      mutacije su ovdje i u tests/gate-mutations.test.ts;
 *   2. na Windowsu STVARNO izvodjenje `Remove-WordVerifyOutDir` nad sintetickim git repozitorijem
 *      (bez Worda), plus PowerShell parser nad svim skriptama.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
const CALL_LINE = 'Remove-WordVerifyOutDir -Dir $OutDir -RepoRoot $root -CheckedCount $provjereno';

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

  it('gard pomocne datoteke hvata uklonjenu granicu korijena, gita i odustajanje', () => {
    const src = read(WORD_VERIFY_CLEANUP_HELPER);
    const bezKorijena = src.replace('if (-not $roditelj.Equals($korijen, $cmp)) {', 'if ($false) {');
    expect(bezKorijena).not.toBe(src);
    expect(wordVerifyHelperProblems(bezKorijena)).toContain('funkcija ne provjerava da je roditelj tocno korijen repozitorija');
    const bezGita = src.replace('if (-not $ignoriran -or $praceno.Count -gt 0) {', 'if ($false) {');
    expect(bezGita).not.toBe(src);
    expect(wordVerifyHelperProblems(bezGita)).toContain(
      'funkcija ne odustaje kad git direktorij ne ignorira ili u njemu prati datoteke',
    );
    const bezReturna = src.replace(/(if \(-not \$roditelj\.Equals\(\$korijen, \$cmp\)\) \{\n[^\n]*\n) {4}return\n/, '$1');
    expect(bezReturna).not.toBe(src);
    expect(wordVerifyHelperProblems(bezReturna).length).toBeGreaterThan(0);
  });

  it('Codex krug 2: gard pomocne datoteke hvata uklonjenu allowlistu, CheckedCount i reparse provjeru', () => {
    const src = read(WORD_VERIFY_CLEANUP_HELPER);
    expect(wordVerifyHelperProblems(src)).toEqual([]);
    const bezAllowliste = src.replace('if (-not $dozvoljeno) {', 'if ($false) {');
    expect(bezAllowliste).not.toBe(src);
    expect(wordVerifyHelperProblems(bezAllowliste)).toContain('funkcija nema allowlistu imena (.tmp-word-verify, .tmp-word-corpus)');
    const siraAllowlista = src.replace("@('.tmp-word-verify', '.tmp-word-corpus')", "@('.tmp-word-verify', '.tmp-word-corpus', 'node_modules')");
    expect(siraAllowlista).not.toBe(src);
    expect(wordVerifyHelperProblems(siraAllowlista)).toContain('funkcija nema allowlistu imena (.tmp-word-verify, .tmp-word-corpus)');
    const bezBroja = src.replace('if ($CheckedCount -le 0) {', 'if ($false) {');
    expect(bezBroja).not.toBe(src);
    expect(wordVerifyHelperProblems(bezBroja)).toContain('funkcija ne odustaje kad nijedan dokument nije provjeren (CheckedCount 0)');
    const neobavezan = src.replace('[Parameter(Mandatory = $true)][int]$CheckedCount', '[int]$CheckedCount = 1');
    expect(neobavezan).not.toBe(src);
    expect(wordVerifyHelperProblems(neobavezan)).toContain('funkcija nema obavezan parametar -CheckedCount');
    const bezReparsea = src.replace('if ($null -ne $reparse) {', 'if ($false) {');
    expect(bezReparsea).not.toBe(src);
    expect(wordVerifyHelperProblems(bezReparsea)).toContain('funkcija ne odustaje kad je direktorij ili unos ispod njega reparse point');
  });

  it('Codex krug 2: gard skripte hvata poziv bez stvarnog broja provjerenih dokumenata', () => {
    for (const rel of WORD_VERIFY_CLEANUP_SCRIPTS) {
      const src = read(rel);
      const nula = src.replace(`\n${CALL_LINE}\n`, '\nRemove-WordVerifyOutDir -Dir $OutDir -RepoRoot $root -CheckedCount 1\n');
      expect(nula, rel).not.toBe(src);
      expect(wordVerifyCleanupProblems(nula), rel).toContain(
        'poziv brisanja nije na vrhu skripte (uvucen je u blok ili ima druge argumente)',
      );
      const bezBrojanja = src.replace(/\n\s+\$provjereno\+\+\n/, '\n');
      expect(bezBrojanja, rel).not.toBe(src);
      expect(wordVerifyCleanupProblems(bezBrojanja), rel).toContain('skripta nigdje ne broji provjereni dokument ($provjereno++)');
    }
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
    // Ime iz allowliste u korijenu, ali ga git NE ignorira: zaustavlja ga git provjera, ne allowlista.
    file('.tmp-word-corpus/a.docx');
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
      ['.tmp-word-corpus', false],
      ['.', false],
    ];
    const helper = resolve(process.cwd(), WORD_VERIFY_CLEANUP_HELPER);
    const targets: Array<[string, boolean]> = [...cases.map(([rel, del]) => [join(repo, rel), del] as [string, boolean]), [outside, false]];
    const cmd = [`. ${psQuote(helper)}`, ...targets.map(([d]) => `Remove-WordVerifyOutDir -Dir ${psQuote(d)} -RepoRoot ${psQuote(repo)} -CheckedCount 1`)].join('; ');
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

  /** Sinteticki git repozitorij s .gitignore koji ignorira i node_modules i allowlist imena. */
  function ignoredRepo(prefix: string): { repo: string; file: (rel: string) => string } {
    const repo = mkdtempSync(join(tmpdir(), prefix));
    dirs.push(repo);
    const r = spawnSync('git', ['-C', repo, 'init', '-q'], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    writeFileSync(
      join(repo, '.gitignore'),
      'node_modules/\n.tmp-word-verify/\n.tmp-word-corpus/\n.tmp-corpus/\nsub/\n',
    );
    const file = (rel: string) => {
      const full = join(repo, rel);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, 'x');
      return full;
    };
    return { repo, file };
  }

  const gitIgnored = (repo: string, rel: string) =>
    spawnSync('git', ['-C', repo, 'check-ignore', '-q', '--', rel], { encoding: 'utf8' }).status === 0;
  const gitTracked = (repo: string, rel: string) =>
    (spawnSync('git', ['-C', repo, 'ls-files', '--', rel], { encoding: 'utf8' }).stdout ?? '').trim() !== '';

  it('Codex krug 2 (B1): node_modules oblik, CheckedCount 0, krivo ime i dublji roditelj se NE brisu', () => {
    const { repo, file } = ignoredRepo('lekta-word-outdir-b1-');
    file('node_modules/paket/index.js');
    file('.tmp-word-corpus/a-popravljen.docx');
    file('.tmp-corpus/a-popravljen.docx');
    file('sub/.tmp-word-verify/a-popravljen.docx');
    file('.tmp-word-verify/a-popravljen.docx');
    // Generator proizvodi ciljanu klasu ulaza: node_modules je ignoriran i bez pracenih datoteka,
    // dakle prolazi granicu repozitorija i git provjeru, pa ga zaustavlja samo allowlista.
    expect(gitIgnored(repo, 'node_modules')).toBe(true);
    expect(gitTracked(repo, 'node_modules')).toBe(false);
    expect(gitIgnored(repo, '.tmp-word-corpus')).toBe(true);

    const helper = resolve(process.cwd(), WORD_VERIFY_CLEANUP_HELPER);
    const calls: Array<[string, number, boolean]> = [
      ['node_modules', 5, false],
      ['.tmp-word-corpus', 0, false],
      ['.tmp-corpus', 5, false],
      ['sub/.tmp-word-verify', 5, false],
      ['.tmp-word-verify', 5, true],
    ];
    const cmd = [
      `. ${psQuote(helper)}`,
      ...calls.map(([rel, n]) => `Remove-WordVerifyOutDir -Dir ${psQuote(join(repo, rel))} -RepoRoot ${psQuote(repo)} -CheckedCount ${n}`),
    ].join('; ');
    const r = powershell(cmd);
    expect(r.status, r.stderr).toBe(0);
    const out = r.stdout.replace(/\r/g, '');
    for (const [rel, , del] of calls) {
      expect(existsSync(join(repo, rel)), `${rel} ${del ? 'mora biti obrisan' : 'mora ostati'}`).toBe(!del);
    }
    expect(existsSync(join(repo, 'node_modules/paket/index.js'))).toBe(true);
    expect(out).toContain("ime 'node_modules' nije .tmp-word-verify ni .tmp-word-corpus");
    expect(out).toContain('provjereno 0 dokumenata');
    expect(out).toContain('roditelj nije korijen repozitorija');
    expect(out.match(/obrisan nakon uspjeha \(5 provjerenih dokumenata\)/g)).toHaveLength(1);
  });

  it('Codex krug 2 (B1): junction kao izlazni direktorij i junction unutar njega se NE brisu, ni kroz njih', () => {
    const { repo, file } = ignoredRepo('lekta-word-outdir-b1j-');
    const cilj = mkdtempSync(join(tmpdir(), 'lekta-word-outdir-cilj-'));
    const cilj2 = mkdtempSync(join(tmpdir(), 'lekta-word-outdir-cilj2-'));
    dirs.push(cilj, cilj2);
    writeFileSync(join(cilj, 'tudje.docx'), 'x');
    writeFileSync(join(cilj2, 'tudje.docx'), 'x');
    symlinkSync(cilj, join(repo, '.tmp-word-verify'), 'junction');
    file('.tmp-word-corpus/a-popravljen.docx');
    symlinkSync(cilj2, join(repo, '.tmp-word-corpus', 'veza'), 'junction');
    // Generator: oba su stvarno reparse pointi (Node junction prijavljuje kao simbolicku vezu).
    expect(lstatSync(join(repo, '.tmp-word-verify')).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(repo, '.tmp-word-corpus', 'veza')).isSymbolicLink()).toBe(true);

    const helper = resolve(process.cwd(), WORD_VERIFY_CLEANUP_HELPER);
    const cmd = [
      `. ${psQuote(helper)}`,
      `Remove-WordVerifyOutDir -Dir ${psQuote(join(repo, '.tmp-word-verify'))} -RepoRoot ${psQuote(repo)} -CheckedCount 5`,
      `Remove-WordVerifyOutDir -Dir ${psQuote(join(repo, '.tmp-word-corpus'))} -RepoRoot ${psQuote(repo)} -CheckedCount 5`,
    ].join('; ');
    const r = powershell(cmd);
    expect(r.status, r.stderr).toBe(0);
    const out = r.stdout.replace(/\r/g, '');
    expect(existsSync(join(repo, '.tmp-word-verify'))).toBe(true);
    expect(existsSync(join(cilj, 'tudje.docx'))).toBe(true);
    expect(existsSync(join(repo, '.tmp-word-corpus', 'a-popravljen.docx'))).toBe(true);
    expect(existsSync(join(cilj2, 'tudje.docx'))).toBe(true);
    expect(out).toContain('direktorij je junction ili simbolicka veza');
    expect(out).toContain('sadrzi junction ili simbolicku vezu');
    expect(out).not.toMatch(/obrisan nakon uspjeha/);
  });

  it('Codex krug 2 (B1): -CheckedCount je obavezan; poziv bez njega nista ne brise', () => {
    const { repo, file } = ignoredRepo('lekta-word-outdir-b1m-');
    file('.tmp-word-verify/a-popravljen.docx');
    const helper = resolve(process.cwd(), WORD_VERIFY_CLEANUP_HELPER);
    const r = powershell(
      `. ${psQuote(helper)}; Remove-WordVerifyOutDir -Dir ${psQuote(join(repo, '.tmp-word-verify'))} -RepoRoot ${psQuote(repo)}`,
    );
    expect(r.status).not.toBe(0);
    expect(existsSync(join(repo, '.tmp-word-verify', 'a-popravljen.docx'))).toBe(true);
  });
});
