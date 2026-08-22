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
  // Prozor u kojem stanje stoji na 'intro' ili 'scanning' traje 1,85 s (vidi timere u
  // prototype/analyzer-hero-demo.ts: scanning na 260 ms, marked na 1850 ms). Na opterecenom
  // stroju poll zna uzeti prvi uzorak tek nakon tog prozora i onda zauvijek vidi samo 'result',
  // pa gate pada bez ijednog kvara u proizvodu. Zato prijelaze BILJEZIMO umjesto da ih lovimo:
  // observer se postavlja PRIJE klika, pa tvrdnja ne ovisi o tome kad je uzorak uzet.
  await page.evaluate(() => {
    const stage = document.getElementById('demoStage');
    if (!stage) return;
    const seen: string[] = [stage.dataset.demoState ?? ''];
    (window as unknown as { __demoStates: string[] }).__demoStates = seen;
    new MutationObserver(() => seen.push(stage.dataset.demoState ?? ''))
      .observe(stage, { attributes: true, attributeFilter: ['data-demo-state'] });
  });
  await page.locator('#demoReplay').click();
  await expect(page.locator('#demoStage')).toHaveAttribute('data-demo-state', 'result', { timeout: 6_000 });
  const seen = await page.evaluate(
    () => (window as unknown as { __demoStates?: string[] }).__demoStates ?? [],
  );
  expect(seen, 'replay mora ponovno proci kroz intro i scanning').toContain('intro');
  expect(seen, 'replay mora ponovno proci kroz intro i scanning').toContain('scanning');

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
