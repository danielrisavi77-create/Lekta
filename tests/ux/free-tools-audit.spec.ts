import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FREE_TOOL_PAGES } from './free-tools-pages';

for (const pageSpec of FREE_TOOL_PAGES) {
  test(`${pageSpec.name}: ima jasnu glavnu zonu i primarnu akciju`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(pageSpec.route);

    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator(pageSpec.primarySelector)).toBeVisible();
    await expect(page.locator('#mobileMenuBtn')).toBeVisible();
    await expect(page.locator('#themeBtn')).toBeVisible();

    if (pageSpec.workspaceSelector) {
      await expect(page.locator(pageSpec.workspaceSelector)).toBeVisible();
    }
  });

  test(`${pageSpec.name}: nema critical ili serious accessibility kršenja`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(pageSpec.route);

    const results = await new AxeBuilder({ page }).analyze();
    const seriousViolations = results.violations.filter((violation) =>
      violation.impact === 'critical' || violation.impact === 'serious',
    );

    expect(seriousViolations, seriousViolations.map((violation) => violation.id).join(', ')).toEqual([]);
  });
}

test('premium motion poštuje reduced-motion način rada', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/citat.html');

  const motionState = await page.evaluate(() => {
    const tilt = document.querySelector<HTMLElement>('[data-premium-tilt]');
    return {
      reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      transitionDuration: tilt ? getComputedStyle(tilt).transitionDuration : null,
      animationName: tilt ? getComputedStyle(tilt).animationName : null,
    };
  });

  expect(motionState.reduced).toBe(true);
  expect(motionState.transitionDuration).toBe('0s');
  expect(motionState.animationName).toBe('none');
});
