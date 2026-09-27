/**
 * Tekstualni gard nad Word check skriptama (stavka G, odluka vlasnika 2026-09-26): izlazni
 * direktorij (`.tmp-word-verify`, `.tmp-word-corpus` ili `-OutDir`) se brise SAMO na uspjehu.
 *
 * Na padu je taj direktorij jedini dokaz za dijagnozu (popravljeni paketi koje Word nije otvorio),
 * pa skripta koja ga brise i na padu unistava upravo ono sto treba pregledati. Word se u vitestu ne
 * izvodi, pa se tvrdi oblik IZVRSNOG koda (komentari izbaceni, CR normaliziran):
 *   1. skripta ukljucuje `outdir-cleanup.ps1` i poziva `Remove-WordVerifyOutDir` tocno jednom, na
 *      vrhu skripte (bez uvlake, dakle ne u try/catch/finally/trap ni u grani `if`), POSLIJE
 *      svakog `exit 1`, i odmah iza poziva slijedi `exit 0`;
 *   2. u skripti nema rekurzivnog `Remove-Item` (brise samo funkcija iz pomocne datoteke);
 *   3. svaki `exit 1` i trap za iznimke ispisuju putanju koja ostaje ("ostavljen za dijagnozu");
 *   4. pomocna funkcija odustaje izvan korijena repozitorija, pod tests/fixtures i kad git
 *      direktorij ne ignorira ili u njemu prati datoteke (`wordVerifyHelperProblems`).
 */

/** Skripte koje stvaraju izlazni direktorij i nakon uspjeha ga brisu. */
export const WORD_VERIFY_CLEANUP_SCRIPTS = [
  'scripts/word-verify/check.ps1',
  'scripts/word-verify/check-worst-case.ps1',
  'scripts/word-verify/check-corpus.ps1',
  'scripts/word-verify/check-toc-case.ps1',
] as const;

/** Pomocna datoteka s jedinom funkcijom koja brise. */
export const WORD_VERIFY_CLEANUP_HELPER = 'scripts/word-verify/outdir-cleanup.ps1';

const CALL = /^Remove-WordVerifyOutDir\s+-Dir\s+\$OutDir\s+-RepoRoot\s+\$root\s*$/;
const INCLUDE = /^\. \(Join-Path \$PSScriptRoot 'outdir-cleanup\.ps1'\)\s*$/;
const KEPT = 'ostavljen za dijagnozu';

/** Izvrsni retci: bez CR i bez redaka koji su samo komentar. */
function executableLines(ps1: string): string[] {
  return ps1
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'));
}

/** Prazan popis znaci da skripta brise izlazni direktorij samo na uspjehu. */
export function wordVerifyCleanupProblems(ps1: string): string[] {
  const lines = executableLines(ps1);
  const problems: string[] = [];

  if (lines.filter((l) => INCLUDE.test(l)).length !== 1) {
    problems.push('skripta ne ukljucuje outdir-cleanup.ps1 tocno jednom na vrhu');
  }
  if (lines.some((l) => /^\s*function\s+Remove-WordVerifyOutDir\b/i.test(l))) {
    problems.push('skripta definira vlastitu Remove-WordVerifyOutDir umjesto pomocne');
  }
  const recursive = lines.filter((l) => /Remove-Item\b/i.test(l) && /-Recurse\b/i.test(l));
  if (recursive.length > 0) {
    problems.push(`rekurzivni Remove-Item izvan pomocne funkcije: ${recursive.length}`);
  }

  const calls = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => /Remove-WordVerifyOutDir\b/.test(l) && !/^\s*function\b/i.test(l));
  if (calls.length !== 1) {
    problems.push(`ocekivan tocno jedan poziv Remove-WordVerifyOutDir, nadjeno ${calls.length}`);
  }
  const call = calls[0];
  if (call) {
    if (!CALL.test(call.l)) {
      problems.push('poziv brisanja nije na vrhu skripte (uvucen je u blok ili ima druge argumente)');
    }
    const lastExit1 = lines.reduce((acc, l, i) => (/\bexit 1\b/.test(l) ? i : acc), -1);
    if (lastExit1 > call.i) problems.push('poziv brisanja je ispred grane pada (exit 1)');
    const next = lines.slice(call.i + 1).find((l) => l.trim() !== '');
    if (next?.trim() !== 'exit 0') problems.push('iza poziva brisanja ne slijedi exit 0');
  }

  lines.forEach((l, i) => {
    if (!/\bexit 1\b/.test(l)) return;
    const prev = lines.slice(0, i).reverse().find((x) => x.trim() !== '') ?? '';
    if (!l.includes(KEPT) && !prev.includes(KEPT)) {
      problems.push(`exit 1 u retku ${i + 1} ne ispisuje putanju koja ostaje za dijagnozu`);
    }
  });
  if (!lines.some((l) => /^trap \{/.test(l) && l.includes(KEPT) && /\bbreak\b/.test(l))) {
    problems.push('nema trapa za iznimke koji ispisuje putanju i prekida (break)');
  }
  return problems;
}

/** Prazan popis znaci da pomocna funkcija brise samo ignoriran direktorij unutar repozitorija. */
export function wordVerifyHelperProblems(ps1: string): string[] {
  const code = executableLines(ps1).join('\n');
  const problems: string[] = [];
  if (!/^function Remove-WordVerifyOutDir \{$/m.test(code)) problems.push('nema funkcije Remove-WordVerifyOutDir');
  if (!code.includes('$uRepou = $full.StartsWith($korijen + $sep, $cmp)')) {
    problems.push('funkcija ne provjerava da je direktorij unutar korijena repozitorija');
  }
  if (!code.includes("Join-Path $korijen 'tests\\fixtures'")
    || !code.includes('$podFixturama = $full.Equals($fixtures, $cmp) -or $full.StartsWith($fixtures + $sep, $cmp)')) {
    problems.push('funkcija ne izuzima tests/fixtures');
  }
  if (!/^ {2}if \(-not \$uRepou -or \$podFixturama\) \{\n[^\n]*\n {4}return\n/m.test(code)) {
    problems.push('funkcija ne odustaje (return) izvan repozitorija ili pod tests/fixtures');
  }
  if (!code.includes('check-ignore -q -- $full') || !code.includes('ls-files -- $full')
    || !/^ {2}if \(-not \$ignoriran -or \$praceno\.Count -gt 0\) \{\n[^\n]*\n {4}return\n/m.test(code)) {
    problems.push('funkcija ne odustaje kad git direktorij ne ignorira ili u njemu prati datoteke');
  }
  const recursive = code.split('\n').filter((l) => /Remove-Item\b/i.test(l) && /-Recurse\b/i.test(l));
  if (recursive.length !== 1) problems.push(`ocekivan tocno jedan rekurzivni Remove-Item, nadjeno ${recursive.length}`);
  return problems;
}
