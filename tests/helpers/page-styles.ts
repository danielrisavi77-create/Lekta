import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * STIL KOJI STRANICA STVARNO ISPORUCUJE, bez obzira gdje je zapisan.
 *
 * Do 2026-09-03 je sav stil bio jedan inline `<style>` blok u `index.html`, pa su ga testovi
 * ondje i trazili. Izdvajanje u `src/shared/page.css` (nuzno, jer `/rad/` je bez njega bio
 * NESTILIZIRAN) oborilo je tri garda odjednom, iako se nijedno pravilo nije promijenilo: mjerili
 * su DATOTEKU, a tvrde nesto o STRANICI.
 *
 * Pomocnik postoji da se to ne ponovi. Spaja oba izvora, pa selidba pravila izmedju njih vise ne
 * obara gard, a gubitak pravila i dalje obara. Popis datoteka je pritom PRIKOVAN i tvrdi da svaka
 * postoji: da se tiho preskoci nepostojeca, gard bi mjerio prazan niz i prolazio vakuumski.
 */

const ROOT = resolve(__dirname, '..', '..');

/** Inline `<style>` blokovi jedne HTML stranice; prazan niz ako ih nema. */
export function inlineStyles(htmlPath: string): string {
  const html = readFileSync(resolve(ROOT, htmlPath), 'utf8');
  return Array.from(html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g), (m) => m[1]).join('\n');
}

/** Sav CSS koji `/` isporucuje: inline blokovi stranice + izdvojeni dijeljeni list. */
export function pageStyles(htmlPath = 'index.html'): string {
  const shared = readFileSync(resolve(ROOT, 'src', 'shared', 'page.css'), 'utf8');
  if (shared.trim().length === 0) throw new Error('src/shared/page.css je prazan; gard bi mjerio nista');
  return `${inlineStyles(htmlPath)}\n${shared}`;
}
