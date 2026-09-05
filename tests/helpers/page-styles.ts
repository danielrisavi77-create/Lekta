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
  // Od 2026-09-05 je list PODIJELJEN (`page-chrome.css` + `page-app.css`, vidi mjerenje ondje).
  // Pomocnik spaja OBA, jer i dalje odgovara na pitanje "sto stranica isporucuje", a ne "koja datoteka".
  const shared = ['page-chrome.css', 'page-app.css']
    .map((ime) => readFileSync(resolve(ROOT, 'src', 'shared', ime), 'utf8')).join('');
  if (shared.trim().length === 0) throw new Error('dijeljeni stil je prazan; gard bi mjerio nista');
  return `${inlineStyles(htmlPath)}\n${shared}`;
}
