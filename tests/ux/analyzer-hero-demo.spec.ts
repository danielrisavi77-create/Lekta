import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const route = '/prototype/analyzer-hero-demo.html';

test('artifact demo ima jasnu kompoziciju i nema horizontalni overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(route);

  await expect(page.locator('main[data-demo-surface="analyzer-hero"]')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('#demoUploadCta')).toBeVisible();
  await expect(page.locator('#demoReplay')).toBeVisible();
  await expect(page.locator('#demoStage')).toBeVisible();
  await expect(page.locator('#demoStage')).toHaveAttribute('data-demo-state', 'result', { timeout: 6_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('artifact demo radi jednokratni motion, replay i fokus prijelaz', async ({ page }) => {
  await page.goto(route);

  await expect(page.locator('#demoStage')).toHaveAttribute('data-demo-state', 'result', { timeout: 6_000 });
  await page.locator('#demoReplay').click();
  await expect.poll(async () => page.locator('#demoStage').getAttribute('data-demo-state'))
    .toMatch(/intro|scanning/);
  await expect(page.locator('#demoStage')).toHaveAttribute('data-demo-state', 'result', { timeout: 6_000 });

  await page.locator('#demoUploadCta').click();
  await expect(page.locator('#demoAnalyzerPreview')).toBeFocused();
  await expect(page.locator('#demoStatus')).toContainText('stvarni upload');
});

test('artifact demo poštuje reduced-motion način rada', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(route);

  await expect(page.locator('#demoStage')).toHaveAttribute('data-demo-state', 'result');
  const motion = await page.locator('#demoStage').evaluate((node) => {
    const style = getComputedStyle(node);
    return { transition: style.transitionDuration, animation: style.animationName };
  });
  expect(motion.transition).toBe('0s');
  expect(motion.animation).toBe('none');
});

test('artifact demo nema critical ili serious accessibility kršenja', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(route);

  const results = await new AxeBuilder({ page }).analyze();
  const seriousViolations = results.violations.filter((violation) =>
    violation.impact === 'critical' || violation.impact === 'serious',
  );

  expect(seriousViolations, seriousViolations.map((violation) => violation.id).join(', ')).toEqual([]);
});
