// Probni kadrovi scene na kljucnim t vrijednostima (brza vizualna kontrola prije pune snimke).
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const times = [2.0, 5.2, 7.6, 9.2, 14.5, 18.2, 21.0, 23.1, 25.5];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.goto('file://' + join(here, 'scene.html').replaceAll('\\', '/'));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
for (const t of times) {
  await page.evaluate((tt) => window.__seek(tt), t);
  await page.screenshot({ path: join(here, 'probe-' + t.toFixed(1).replace('.', '_') + '.png') });
}
await browser.close();
console.log('ok');
