import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const route = '/prototype/analyzer-workspace-demo.html';

test('workspace demo počinje uploadom i zatim prelazi u tri faze na mobitelu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(route);

  await expect(page.locator('main[data-demo-surface="analyzer-workspace"]')).toHaveCount(1);
  await expect(page.locator('#workspaceStart')).toBeVisible();
  await expect(page.locator('#workspaceDropzone')).toBeVisible();
  await expect(page.locator('#workspaceContext')).toBeHidden();
  await expect(page.locator('#workspaceStartButton')).toBeHidden();
  await page.locator('#workspaceDropzone').click();
  await expect(page.locator('#workspaceContext')).toBeVisible();
  await expect(page.locator('#workspaceStartButton')).toBeVisible();
  await page.locator('#workspaceStartButton').click();
  await expect(page.locator('#workspaceProgress')).toBeVisible();
  await expect(page.locator('[data-rail-step="document"]')).toHaveClass(/is-active/);
  await expect(page.locator('#workspaceResult')).toBeVisible({ timeout: 6_000 });
  await expect(page.locator('#workspaceResultTitle')).toContainText('Znaš');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('workspace demo ima stvarni prijelaz progress do dashboard rezultata', async ({ page }) => {
  await page.goto(route);

  await page.locator('#workspaceDropzone').click();
  await expect(page.locator('#workspaceContext')).toBeVisible();
  await page.locator('#workspaceStartButton').click();
  await expect(page.locator('#workspaceProgress')).toBeVisible();
  await expect(page.locator('#workspaceProgressValue')).toContainText('%');
  await expect(page.locator('#workspaceResult')).toBeVisible({ timeout: 6_000 });
  await expect(page.locator('.workspace-score-ring strong')).toHaveText('87');

  await page.locator('#workspaceRestart').click();
  await expect(page.locator('#workspaceStart')).toBeVisible();
  // Restart vraca demo na POCETAK (resetDemo -> showView('upload'): "Ucitaj primjer rada",
  // "Ceka upload"), pa je aktivan korak trake 'document', ne 'context'. Ranija tvrdnja je
  // trazila 'context' i time proturjecila vlastitom resetu.
  await expect(page.locator('[data-rail-step="document"]')).toHaveClass(/is-active/);
  await expect(page.locator('[data-rail-step="context"]')).not.toHaveClass(/is-active/);
});

test('workspace demo reduced-motion odmah prikazuje rezultat', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(route);
  await page.locator('#workspaceDropzone').click();
  await page.locator('#workspaceStartButton').click();

  await expect(page.locator('#workspaceResult')).toBeVisible();
  const motion = await page.locator('#workspaceProgress').evaluate((node) => {
    const style = getComputedStyle(node);
    return { transition: style.transitionDuration, animation: style.animationName };
  });
  expect(motion.transition).toBe('0s');
  expect(motion.animation).toBe('none');
});

test('workspace demo nema critical ili serious accessibility kršenja', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(route);

  const results = await new AxeBuilder({ page }).analyze();
  const seriousViolations = results.violations.filter((violation) =>
    violation.impact === 'critical' || violation.impact === 'serious',
  );

  expect(seriousViolations, seriousViolations.map((violation) => violation.id).join(', ')).toEqual([]);
});
