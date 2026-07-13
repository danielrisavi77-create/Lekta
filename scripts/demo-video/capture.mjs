// Frame-po-frame snimka scene: 26 s x 60 fps = 1560 PNG-ova na 2560x1440.
// Svaki frame je cist __seek(t) + screenshot, pa je izlaz deterministicki i savrseno gladak.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const FPS = 60, DUR = 26, TOTAL = FPS * DUR;
const framesDir = join(here, 'frames');
mkdirSync(framesDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 2,
});
await page.goto('file://' + join(here, 'scene.html').replaceAll('\\', '/'));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);

const t0 = Date.now();
for (let i = 0; i < TOTAL; i++) {
  const t = i / FPS;
  await page.evaluate((tt) => window.__seek(tt), t);
  await page.screenshot({ path: join(framesDir, String(i).padStart(5, '0') + '.png') });
  if (i % 120 === 0) console.log(`frame ${i}/${TOTAL} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
console.log(`done ${TOTAL} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await browser.close();
