/**
 * Gard za polja i mete na mobitelu (mobilni audit 2026-09-28, PR 4). Cista funkcija nad tekstom CSS listova,
 * pa se smije mutirati u `tests/gate-mutations.test.ts`. Izravni dokaz u pregledniku je
 * `tests/ux/mobile-tool-fields.spec.ts`.
 *
 * Pravilo za 16 px mora obuhvatiti sve tri vrste polja (input, select, textarea) i oba nacina unosa
 * (cijeli `main` stranice alata i `#panel-bulk`), a nijedno kasnije pravilo u listu ne smije poljima vratiti manja slova
 * (Codex 310-1 i 310-3). Pravne poveznice su mete od 44 px u obje dimenzije (310-2).
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
  const pravilo = [...m720.matchAll(/([^{}]*)\{([^}]*)\}/g)].find((r) => /font-size:\s*16px/.test(r[2]) && /\binput\b/.test(r[1]));
  if (!pravilo) problemi.push('polja alata nemaju 16 px na uskom ekranu');
  else {
    const sel = pravilo[1];
    if (!/[,(]\s*select\s*[,)]/.test(sel)) problemi.push('pravilo od 16 px ne obuhvaca select');
    if (!/[,(]\s*textarea\s*[,)]/.test(sel)) problemi.push('pravilo od 16 px ne obuhvaca textarea');
    if (!sel.includes('main:has(.tool-workspace)')) problemi.push('pravilo od 16 px ne obuhvaca cijeli sadrzaj stranice alata');
    if (!sel.includes('#panel-bulk')) problemi.push('pravilo od 16 px ne obuhvaca karticu Cijela literatura');
    const iza = tool.slice(tool.indexOf(pravilo[0]) + pravilo[0].length);
    for (const r of iza.matchAll(/([^{}]*)\{([^}]*)\}/g)) {
      const vel = /font-size:\s*([\d.]+)px/.exec(r[2]);
      if (vel && Number(vel[1]) < 16 && /\b(input|select|textarea)\b/.test(r[1])) {
        problemi.push('kasnije pravilo vraca poljima slova manja od 16 px');
        break;
      }
    }
  }
  const m480 = mediaBlokovi(tool, 480).join('\n');
  if (!/\.tool-workspace\s+\.row2\s*\{[^}]*grid-template-columns:\s*1fr\s*[;}]/.test(m480)) problemi.push('.row2 ostaje u dva stupca na uskom ekranu');
  const c720 = mediaBlokovi(chrome, 720).join('\n');
  const meta = /\.site-footer__pravno\s+a\s*\{([^}]*)\}/.exec(c720)?.[1] ?? '';
  const visina = /min-height:\s*(\d+)px/.exec(meta);
  const sirina = /min-width:\s*(\d+)px/.exec(meta);
  if (!visina || Number(visina[1]) < 44) problemi.push('pravne poveznice u podnozju nisu mete od 44 px na uskom ekranu');
  if (!sirina || Number(sirina[1]) < 44) problemi.push('pravne poveznice u podnozju su uze od 44 px na uskom ekranu');
  return problemi;
}
