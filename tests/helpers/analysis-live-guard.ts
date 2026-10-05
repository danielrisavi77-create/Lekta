/**
 * Gardovi za ANALIZU UZIVO (ALIGNMENT Z33). Ciste funkcije nad tekstom, pa ih
 * `tests/gate-mutations.test.ts` moze hraniti podmetnutim kvarom bez pisanja po disku.
 *
 *   motionCssProblems     Z31: animira se samo transform, opacity i clip-path; nema backdrop-filter.
 *   liveBoundaryProblems  kod Z33 ulazi u preglednik SAMO dinamickim uvozom, nikad statickim, jer
 *                         je ulaz `/rad/` tik ispod bundle-guarda (960 KB u vite.config.ts).
 *   copyProblems          natpis svakog gumba u kosturu Z33 je DOSLOVNO iz predloska
 *                         (`design/templates/analysis/Analysis.dc.html`), osim odstupanja zapisanih
 *                         u F31 (`docs/agents/orchestrator-backlog.md`).
 */

const DOPUSTENO = new Set(['transform', 'opacity', 'clip-path']);

const bezKomentara = (css: string): string => css.replace(/\r/g, '').replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Dijeli vrijednost po zarezima izvan zagrada (`cubic-bezier(.5, 0, .2, 1)` ostaje cijel). */
function dijelovi(vrijednost: string): string[] {
  const out: string[] = [];
  let dubina = 0;
  let tekuci = '';
  for (const z of vrijednost) {
    if (z === '(') dubina += 1;
    if (z === ')') dubina -= 1;
    if (z === ',' && dubina === 0) { out.push(tekuci); tekuci = ''; } else tekuci += z;
  }
  out.push(tekuci);
  return out.map((d) => d.trim()).filter(Boolean);
}

/** Tijela svih `@keyframes` blokova, s uparenim zagradama. */
function keyframes(css: string): Array<{ ime: string; tijelo: string }> {
  const out: Array<{ ime: string; tijelo: string }> = [];
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    let dubina = 1;
    let i = re.lastIndex;
    while (i < css.length && dubina > 0) {
      if (css[i] === '{') dubina += 1;
      if (css[i] === '}') dubina -= 1;
      i += 1;
    }
    out.push({ ime: m[1], tijelo: css.slice(re.lastIndex, i - 1) });
  }
  return out;
}

export function motionCssProblems(cssSirov: string): string[] {
  const css = bezKomentara(cssSirov);
  const problemi: string[] = [];
  if (/backdrop-filter/i.test(css)) problemi.push('backdrop-filter je zabranjen (Z31)');
  for (const k of keyframes(css)) {
    for (const p of k.tijelo.matchAll(/([a-z-]+)\s*:/gi)) {
      if (!DOPUSTENO.has(p[1].toLowerCase())) problemi.push(`@keyframes ${k.ime} animira ${p[1]}`);
    }
  }
  for (const t of css.matchAll(/(?:^|[;{\s])(transition(?:-property)?)\s*:\s*([^;}]+)/g)) {
    for (const d of dijelovi(t[2])) {
      const prvi = d.split(/\s+/)[0].toLowerCase();
      if (prvi === 'none') continue;
      if (!DOPUSTENO.has(prvi)) problemi.push(`${t[1]} mijenja ${prvi}`);
    }
  }
  return problemi;
}

/**
 * `izvori` je karta putanja -> tekst. `shim` je jedina datoteka koja smije znati za modul, i to
 * samo dinamickim uvozom; nijedan izvor ga ne smije uvesti staticki (`import type` je dopusten,
 * jer nestaje pri prevodjenju).
 */
export function liveBoundaryProblems(izvori: Readonly<Record<string, string>>, shim: string): string[] {
  const problemi: string[] = [];
  for (const [ime, src] of Object.entries(izvori)) {
    const kod = src.replace(/\r/g, '');
    for (const m of kod.matchAll(/^\s*import\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
      if (/analysis-live\/analysis-live(?:\.ts)?$/.test(m[1])) problemi.push(`${ime}: staticki uvoz ${m[1]}`);
    }
  }
  const shimKod = izvori[shim] ?? '';
  if (!/import\(\s*['"]\.\/analysis-live\/analysis-live['"]\s*\)/.test(shimKod)) {
    problemi.push(`${shim}: nema dinamickog uvoza ./analysis-live/analysis-live`);
  }
  return problemi;
}

/**
 * `modul` je izvor kostura (`analysis-live.ts`), `predlozak` HTML predloska. Natpis gumba koji nije
 * u predlosku smije postojati samo kao zapisano odstupanje; odstupanje koje JE u predlosku nije
 * odstupanje i obara gard, da popis ne postane tiha iznimka za bilo sto.
 */
export function copyProblems(modul: string, predlozak: string, odstupanja: readonly string[]): string[] {
  const kod = modul.replace(/\r/g, '');
  const html = predlozak.replace(/\r/g, '');
  const problemi: string[] = [];
  const natpisi = [...kod.matchAll(/<button\b[^>]*>([^<]+)<\/button>/g)].map((m) => m[1].trim());
  if (!natpisi.length) problemi.push('kostur nema nijedan gumb');
  for (const natpis of natpisi) {
    if (odstupanja.includes(natpis)) continue;
    if (!html.includes(natpis)) problemi.push(`natpis "${natpis}" nije u predlosku`);
  }
  for (const o of odstupanja) {
    if (html.includes(o)) problemi.push(`"${o}" je u predlosku, nije odstupanje`);
    if (!natpisi.includes(o)) problemi.push(`odstupanje "${o}" nema gumba u kosturu`);
  }
  return problemi;
}
