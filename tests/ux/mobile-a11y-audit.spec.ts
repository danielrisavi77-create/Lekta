import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { cekajApp } from './app-ready';

for (const route of ['/rad/', '/landing_benchmark.html']) {
  test(`mobile audit: ${route} has accessible controls in both themes`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(route);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.passes.length).toBeGreaterThan(0);
      expect(result.violations.filter(v => ['critical', 'serious', 'moderate'].includes(v.impact ?? ''))).toEqual([]);
    }
  });
}

test('upload and remove buttons retain their native keyboard actions', async ({ page }) => {
  await page.goto('/rad/');
  await cekajApp(page);
  await page.locator('#browseBtn').focus();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles('tests/fixtures/docx/lo-fpzg-zavrsni-uskladjen.docx');
  await expect(page.locator('#selectedName')).toContainText('lo-fpzg-zavrsni-uskladjen.docx');
  let reopened = false;
  page.on('filechooser', () => { reopened = true; });
  await page.locator('#removeFile').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#selectedFile')).toBeHidden();
  expect(reopened).toBe(false);
});
