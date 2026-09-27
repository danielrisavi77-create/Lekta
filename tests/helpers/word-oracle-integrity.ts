/**
 * Tekstualni gard nad Word oracle skriptama (`scripts/word-verify/check*.ps1`).
 *
 * Kad vrata integriteta odbiju popravak, `applyFixers` vraca ULAZNE bajtove bit-identicno. Oracle
 * koji to ne provjerava otvori Wordom ORIGINAL i javi prolaz: lazno zeleno Tier 2 razine.
 * `src/repair/CLAUDE.md` zato trazi izricito `integrityFailure === null`. PowerShell se u vitestu ne
 * izvodi (nema Worda), pa se tvrdi oblik skripte: provjera postoji u IZVRSNOM kodu (komentari se
 * izbacuju) i poruka pada nosi dio i problem.
 */

/** Izbaci CR i retke koji su samo komentar, da zakomentirana provjera ne prolazi kao ziva. */
function executableLines(ps1: string): string {
  return ps1
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');
}

/** Prazan popis znaci da skripta tvrdi `integrityFailure === null` prije mjerenja Wordom. */
export function wordOracleIntegrityProblems(ps1: string): string[] {
  const code = executableLines(ps1);
  const problems: string[] = [];
  if (!code.includes("$res.PSObject.Properties.Name -contains 'integrityFailure'")) {
    problems.push('skripta ne trazi da repair.mts JSON uopce nosi polje integrityFailure');
  }
  if (!/if\s*\(\s*\$null\s+-ne\s+\$res\.integrityFailure\s*\)/.test(code)) {
    problems.push('skripta ne broji integrityFailure != null kao PAD');
  }
  if (!code.includes('VRATA INTEGRITETA ODBILA: $($res.integrityFailure.part): $($res.integrityFailure.problem)')) {
    problems.push("poruka pada nije 'VRATA INTEGRITETA ODBILA: <part>: <problem>'");
  }
  return problems;
}

/** Skripte koje zovu `repair.mts` i parsiraju njegov JSON. */
export const WORD_ORACLE_SCRIPTS = [
  'scripts/word-verify/check.ps1',
  'scripts/word-verify/check-worst-case.ps1',
  'scripts/word-verify/check-corpus.ps1',
] as const;
