/**
 * Predikat ozicenja reportera napretka: vraca popis problema (prazan je cisto). Komentari se
 * odbacuju prije provjere, pa komentar ne moze zadovoljiti gard.
 */
const stripComments = (src: string) =>
  src.replace(/\r/g, '').split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');

export function progressWiringProblems(vitestConfig: string, gateWrapper: string): string[] {
  const cfg = stripComments(vitestConfig);
  const wrap = stripComments(gateWrapper);
  const problems: string[] = [];
  if (!/process\.env\.LEKTA_GATE_PROGRESS === '1'/.test(cfg)) problems.push('config ne cita LEKTA_GATE_PROGRESS');
  if (!/reporters: \['default', '\.\/scripts\/vitest-progress-reporter\.mjs'\]/.test(cfg)) {
    problems.push('config ne ucitava reporter napretka uz default');
  }
  if (!/progressEnabled \? \{ reporters:/.test(cfg)) problems.push('reporters se ne postavljaju samo kad je napredak ukljucen');
  if (!/GITHUB_ACTIONS !== 'true'/.test(cfg)) problems.push('napredak nije iskljucen u GitHub Actionsu');
  if (!/childEnv\.LEKTA_GATE_PROGRESS = '1'/.test(wrap)) problems.push('omotac ne postavlja LEKTA_GATE_PROGRESS');
  return problems;
}
