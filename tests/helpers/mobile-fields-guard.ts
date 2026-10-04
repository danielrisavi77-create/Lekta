/**
 * Gard za polja i mete na mobitelu (mobilni audit 2026-09-28, PR 4). Cista funkcija nad tekstom CSS listova,
 * pa se smije mutirati u `tests/gate-mutations.test.ts`. Izravni dokaz u pregledniku je
 * `tests/ux/mobile-tool-fields.spec.ts`.
 */
const bezKomentara = (css: string) => css.replace(/\r/g, '').replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Tijela svih `@media (max-width: Npx) { ... }` blokova za zadani N (jednorazinska gnijezda). */
function mediaBlokovi(css: string, px: number): string[] {
  const out: string[] = [];
  const re = new RegExp(`@media\\s*\\(max-width:\\s*${px}px\\)\\s*\\{`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    let dubina = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < css.length && dubina > 0) {
      if (css[i] === '{') dubina += 1;
      else if (css[i] === '}') dubina -= 1;
      i += 1;
    }
    out.push(css.slice(start, i - 1));
  }
  return out;
}

export function mobileFieldsProblems(toolCss: string, chromeCss: string): string[] {
  const tool = bezKomentara(toolCss);
  const chrome = bezKomentara(chromeCss);
  const problemi: string[] = [];
  const m720 = mediaBlokovi(tool, 720).join('\n');
  if (!/\.tool-workspace\s+:is\(input[^{]*\)\s*\{[^}]*font-size:\s*16px/.test(m720)) problemi.push('polja alata nemaju 16 px na uskom ekranu');
  const m480 = mediaBlokovi(tool, 480).join('\n');
  if (!/\.tool-workspace\s+\.row2\s*\{[^}]*grid-template-columns:\s*1fr\s*[;}]/.test(m480)) problemi.push('.row2 ostaje u dva stupca na uskom ekranu');
  const c720 = mediaBlokovi(chrome, 720).join('\n');
  const meta = /\.site-footer__pravno\s+a\s*\{[^}]*min-height:\s*(\d+)px/.exec(c720);
  if (!meta || Number(meta[1]) < 44) problemi.push('pravne poveznice u podnozju nisu mete od 44 px na uskom ekranu');
  return problemi;
}
