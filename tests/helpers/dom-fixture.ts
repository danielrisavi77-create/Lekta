import fs from 'node:fs';
import path from 'node:path';

/**
 * Podmetni PRAVI `index.html` u happy-dom prije nego se uveze `src/ui/app.ts`.
 *
 * ZASTO PRAVI, a ne rucno slozen kostur: `init()` je ogradjen na `#analyzer`, a `initLegacy`
 * bezuvjetno dohvaca pet korijena (`checkGrid`, `pricingGrid`, `orderModal`, `historyModal`,
 * `legalModal`). Rucni kostur bi se raziso sa stranicom cim netko doda sesti, i test bi mjerio
 * izmisljeno stanje. Isti obrazac vec koristi `dev-only-strip.test.ts`.
 *
 * Skripte se NE prenose: happy-dom bi ih pokusao izvrsiti, a modul se ionako uvozi rucno.
 */
export function ubaciStranicu(): void {
  const put = path.resolve(__dirname, '..', '..', 'rad', 'index.html');
  const html = fs.readFileSync(put, 'utf8');
  const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  if (!m) throw new Error('index.html nema <body>; fixtura ne moze nastati');
  document.body.innerHTML = m[1].replace(/<script[\s\S]*?<\/script>/gi, '');
}
