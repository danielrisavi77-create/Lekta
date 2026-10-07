import { expect, test } from '@playwright/test';
import { cekajApp } from './app-ready';

for (const route of ['citat', 'naslovnica']) {
  test(`audit async: ${route} koristi posljednji unos nakon sporog fakultetskog ucitavanja`, async ({ page }, info) => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    let intercepted = 0;
    const pattern = route === 'citat' ? '**/data/tools/citation-specs/verified/*.json*' : '**/data/title-pages/templates-heavy.json*';
    await page.route(pattern, async request => { intercepted++; await blocked; await request.continue(); });
    await page.goto(`/${route}.html`, { waitUntil: 'domcontentloaded' });
    if (route === 'citat') await cekajApp(page);
    if (route === 'citat') {
      await page.locator('#f-faculty').selectOption('fpzg');
      await page.locator('#f-title').fill('Stari naslov');
      await page.locator('#f-faculty').selectOption('');
      await page.locator('#f-title').fill('Posljednji naslov');
    } else {
      await page.locator('#tp-institution').selectOption('unizg');
      await page.locator('#tp-unit').selectOption('fpzg');
      await page.locator('#tp-title').fill('Stari naslov');
      await expect(page.locator('#tp-docx')).toBeDisabled();
      await page.locator('#tp-unit').selectOption('');
      await page.locator('#tp-title').fill('Posljednji naslov');
    }
    expect(intercepted, 'odgodeni stvarni podatkovni modul mora biti zatrazen').toBeGreaterThan(0);
    release();
    // Wait for delayed module responses and their import callbacks, retaining the route until test teardown.
    await page.waitForLoadState('networkidle');
    const output = page.locator(route === 'citat' ? '#out' : '#tp-sheet');
    await expect(output).toContainText('Posljednji naslov');
    await expect(output).not.toContainText('Stari naslov');
    await expect(page.locator(route === 'citat' ? '#c-success-cta' : '#tp-success-cta')).toBeHidden();
    await output.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`${route}-last-input.png`) });
  });
}

test('audit zoom: CTA i datum ostaju dostupni na dvostrukom povecanju', async ({ page }, info) => {
  // Same reflow model as workspace-a11y: 1440x1000 at 200% = 720x500 CSS px.
  // CSS zoom is not browser zoom: it leaves media-query breakpoints unchanged.
  await page.setViewportSize({ width: 720, height: 500 });
  for (const [route, sample, target] of [['citat', '#c-sample', '.success-cta a'], ['izjava', '#st-sample', '#st-date']]) {
    await page.goto(`/${route}.html`);
    if (route === 'citat') await cekajApp(page);
    await page.getByRole('button', { name: 'Samo nužno', exact: true }).click({ timeout: 2000 }).catch(() => {});
    const sampleControl = page.locator(sample);
    // Zavrsimo pomicanje prije geste: CI trag je pokazao presretanje zaglavljem.
    await sampleControl.evaluate(el => el.scrollIntoView({ behavior: 'instant', block: 'center' }));
    let previousPosition = '';
    let stablePositions = 0;
    await expect.poll(async () => {
      const position = await sampleControl.evaluate(el => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit && el.contains(hit) ? [r.left, r.top, r.width, r.height, scrollY].join(',') : '';
      });
      stablePositions = position && position === previousPosition ? stablePositions + 1 : 0;
      previousPosition = position;
      return stablePositions;
    }).toBeGreaterThanOrEqual(2);
    // Mobilni projekt koristi stvarni touch, a desktop mouse klik.
    if (info.project.use.hasTouch) await sampleControl.tap();
    else await sampleControl.click();
    if (route === 'citat') await expect(page.locator('#f-title')).toHaveValue('Ustavno pravo Republike Hrvatske');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
      const control = page.locator(target);
      await control.scrollIntoViewIfNeeded();
      await control.focus();
      await expect(control).toBeFocused();
      expect(await control.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && el.scrollWidth <= el.clientWidth + 1; })).toBe(true);
      await page.screenshot({ path: info.outputPath(`${route}-zoom-reflow-200-${theme}.png`) });
    }
  }
});
