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
 *   4. skripta broji stvarno provjerene dokumente (`$provjereno = 0`, `$provjereno++`) i predaje ih
 *      kao `-CheckedCount $provjereno`;
 *   5. pomocna funkcija (`wordVerifyHelperProblems`) odustaje kad je broj provjerenih 0, kad ime
 *      nije iz allowliste (.tmp-word-verify, .tmp-word-corpus), kad roditelj nije korijen
 *      repozitorija, kad je direktorij ili ista ispod njega reparse point i kad ga git ne ignorira
 *      ili u njemu prati datoteke (Codex nalaz, krug 2: bez allowliste `-OutDir node_modules`).
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

const CALL = /^Remove-WordVerifyOutDir\s+-Dir\s+\$OutDir\s+-RepoRoot\s+\$root\s+-CheckedCount\s+\$provjereno\s*$/;
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

  if (lines.filter((l) => /^\$provjereno = 0\s*$/.test(l)).length !== 1) {
    problems.push('skripta ne inicijalizira $provjereno = 0 tocno jednom na vrhu');
  }
  if (!lines.some((l) => /^\s+\$provjereno\+\+\s*$/.test(l))) {
    problems.push('skripta nigdje ne broji provjereni dokument ($provjereno++)');
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

/** Tocan uvjet (tekst unutar `if (...)`) nakon kojeg funkcija ispise razlog i odustane (`return`). */
function givesUp(code: string, condition: string): boolean {
  const lines = code.split('\n');
  return lines.some((l, i) => l === `  if (${condition}) {` && lines[i + 2] === '    return');
}

/** Allowlista imena koja smiju biti obrisana; sve drugo (npr. node_modules) ostaje. */
export const WORD_VERIFY_ALLOWLIST_LINE = "$dozvoljenaImena = @('.tmp-word-verify', '.tmp-word-corpus')";

/** Prazan popis znaci da pomocna funkcija brise samo provjeren, dopusten direktorij u korijenu. */
export function wordVerifyHelperProblems(ps1: string): string[] {
  const code = executableLines(ps1).join('\n');
  const problems: string[] = [];
  if (!/^function Remove-WordVerifyOutDir \{$/m.test(code)) problems.push('nema funkcije Remove-WordVerifyOutDir');
  if (!code.includes('[Parameter(Mandatory = $true)][int]$CheckedCount')) {
    problems.push('funkcija nema obavezan parametar -CheckedCount');
  }
  if (!givesUp(code, '$CheckedCount -le 0')) {
    problems.push('funkcija ne odustaje kad nijedan dokument nije provjeren (CheckedCount 0)');
  }
  if (!code.includes(WORD_VERIFY_ALLOWLIST_LINE)
    || !code.includes('$dozvoljeno = @($dozvoljenaImena | Where-Object { $_.Equals($ime, $cmp) }).Count -eq 1')
    || !givesUp(code, '-not $dozvoljeno')) {
    problems.push('funkcija nema allowlistu imena (.tmp-word-verify, .tmp-word-corpus)');
  }
  if (!code.includes("$roditelj = (Split-Path -Path $full -Parent).TrimEnd('\\', '/')")
    || !givesUp(code, '-not $roditelj.Equals($korijen, $cmp)')) {
    problems.push('funkcija ne provjerava da je roditelj tocno korijen repozitorija');
  }
  if (!code.includes('$item.Attributes -band [System.IO.FileAttributes]::ReparsePoint')
    || !code.includes('$c.Attributes -band [System.IO.FileAttributes]::ReparsePoint')
    || !givesUp(code, '$null -ne $reparse')) {
    problems.push('funkcija ne odustaje kad je direktorij ili unos ispod njega reparse point');
  }
  if (!code.includes('check-ignore -q -- $full') || !code.includes('ls-files -- $full')
    || !givesUp(code, '-not $ignoriran -or $praceno.Count -gt 0')) {
    problems.push('funkcija ne odustaje kad git direktorij ne ignorira ili u njemu prati datoteke');
  }
  const recursive = code.split('\n').filter((l) => /Remove-Item\b/i.test(l) && /-Recurse\b/i.test(l));
  if (recursive.length !== 1) problems.push(`ocekivan tocno jedan rekurzivni Remove-Item, nadjeno ${recursive.length}`);
  return problems;
}
