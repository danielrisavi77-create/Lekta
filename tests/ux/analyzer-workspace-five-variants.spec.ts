import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const demoRoute = '/prototype/analyzer-workspace-demo.html';
const galleryRoute = '/prototype/analyzer-workspace-variants.html';
const variants = ['editorial', 'blueprint', 'magazine', 'cockpit', 'tactile'] as const;

test('svaka varijanta zadržava upload-first tok i isti demo rezultat', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  for (const variant of variants) {
    await page.goto(`${demoRoute}?variant=${variant}`);
    await expect(page.locator(`main[data-demo-variant="${variant}"]`)).toHaveCount(1);
    await expect(page.locator('#workspaceDropzone')).toBeVisible();
    await expect(page.locator('#workspaceContext')).toBeHidden();

    await page.locator('#workspaceDropzone').click();
    await page.locator('#workspaceStartButton').click();
    await expect(page.locator('#workspaceResult')).toBeVisible();
    await expect(page.locator('.workspace-score-ring strong')).toHaveText('87');
  }
});

test('galerija prikazuje pet smjerova i nema kritična accessibility kršenja', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(galleryRoute);

  await expect(page.locator('main[data-demo-gallery="analyzer-workspace-variants"]')).toHaveCount(1);
  await expect(page.locator('[data-variant-card]')).toHaveCount(5);
  await expect(page.locator('iframe')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const results = await new AxeBuilder({ page }).exclude('iframe').analyze();
  const seriousViolations = results.violations.filter((violation) =>
    violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(seriousViolations, seriousViolations.map((violation) => violation.id).join(', ')).toEqual([]);
});
