import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const route = '/prototype/analyzer-workspace-comparison.html';

test('comparison artifact prikazuje live i demo iframe istovremeno', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(route);

  await expect(page.locator('main[data-demo-surface="analyzer-comparison"]')).toHaveCount(1);
  await expect(page.locator('iframe[title="Live Lekta analyzer"]')).toBeVisible();
  await expect(page.locator('iframe[title="Novi workspace demo"]')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Live Lekta analyzer"]').locator('main')).toHaveCount(1);
  await expect(page.frameLocator('iframe[title="Novi workspace demo"]').locator('main[data-demo-surface="analyzer-workspace"]')).toHaveCount(1);
});

test('comparison artifact se slaže u jednu kolonu na mobitelu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route);

  const columns = await page.locator('.comparison-grid').evaluate((node) => getComputedStyle(node).gridTemplateColumns);
  expect(columns.split(' ').length).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('comparison artifact nema critical ili serious accessibility kršenja', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(route);

  const results = await new AxeBuilder({ page }).exclude('iframe').analyze();
  const seriousViolations = results.violations.filter((violation) =>
    violation.impact === 'critical' || violation.impact === 'serious',
  );

  expect(seriousViolations, seriousViolations.map((violation) => violation.id).join(', ')).toEqual([]);
});
