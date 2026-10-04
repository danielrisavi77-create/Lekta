import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function setTheme(page: Page, theme: string): Promise<void> {
  await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
  // WebKit can expose the new custom property before inherited colors are painted.
  // Yield to rendering before polling; keep the same color assertions and deadline.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  // WebKit CI can retain stale computed colors until it paints (the failure
  // screenshot already shows the new color). Paint the full page before reading
  // inherited colors, including headings outside the current viewport.
  await page.screenshot({ fullPage: true });
  // Wait for the inherited ink, not for a guessed delay or a passing axe result.
  await expect.poll(() => page.evaluate(() => {
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--desk-ink').trim();
    const hex = ink.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!hex) return false;
    const expected = `rgb(${hex.slice(1).map(x => parseInt(x, 16)).join(', ')})`;
    return [document.body, ...document.querySelectorAll('h2.sec-h')]
      .every(el => getComputedStyle(el).color === expected);
  })).toBe(true);
}

const tools = [
  ['kartice', '#kt-sample'], ['citat', '#c-sample'],
  ['literatura', '#lit-sample'], ['naslovnica', '#tp-sample'],
] as const;

for (const [route, sample] of tools) {
  test(`${route}: popunjeni CTA stane na uski zaslon`, async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/${route}.html`);
    await page.getByRole('button', { name: 'Samo nužno', exact: true }).click({ timeout: 3000 }).catch(() => {});
    await page.locator(sample).click();
    const link = page.locator('.success-cta a');
    await expect(link).toBeVisible();
    for (const width of [320, 375, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark']) {
        await setTheme(page, theme);
        await link.scrollIntoViewIfNeeded();
        await expect.poll(async () => link.evaluate((el, viewportWidth) => {
          const r = el.getBoundingClientRect();
          return r.left >= 0 && r.right <= viewportWidth + 1 && el.scrollWidth <= el.clientWidth + 1;
        }, width)).toBe(true);
        await page.screenshot({ path: info.outputPath(`${route}-${width}-${theme}.png`) });
      }
    }
  });
}

test('citat: red gumba i dokument ne prelijevaju uski viewport', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/citat.html');
  await page.getByRole('button', { name: 'Samo nužno', exact: true }).click({ timeout: 3000 }).catch(() => {});
  await page.locator('#c-sample').click();
  await expect(page.locator('#copyBtn')).toBeEnabled();
  const bar = page.locator('.out-bar').first();
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await bar.scrollIntoViewIfNeeded();
      await expect.poll(() => bar.evaluate((el, viewportWidth) => {
        const row = el.getBoundingClientRect();
        return document.documentElement.scrollWidth <= viewportWidth + 1
          && Array.from(el.querySelectorAll('button')).every(button => {
            const rect = button.getBoundingClientRect();
            return rect.left >= row.left - 1 && rect.right <= row.right + 1
              && rect.right <= viewportWidth + 1
              && button.scrollWidth <= button.clientWidth + 1;
          });
      }, width)).toBe(true);
      await page.screenshot({ path: info.outputPath(`citat-buttons-${width}-${theme}.png`) });
    }
  }
});

test('izjava: mjesto i datum ostaju citljivi na 320 px', async ({ page }, info) => {
  await page.goto('/izjava.html');
  await page.getByRole('button', { name: 'Samo nužno', exact: true }).click({ timeout: 3000 }).catch(() => {});
  await page.locator('#st-sample').click();
  await page.locator('#st-place').fill('Slavonski Brod');
  await page.locator('#st-date').fill('29. 9. 2026.');
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('#st-date').scrollIntoViewIfNeeded();
    const date = await page.locator('#st-date').boundingBox();
    expect(date).not.toBeNull();
    if (width < 600) expect(date!.width).toBeGreaterThanOrEqual(180);
    expect(date!.x + date!.width).toBeLessThanOrEqual(width);
    await expect(page.locator('#st-date')).toHaveValue('29. 9. 2026.');
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      await page.screenshot({ path: info.outputPath(`izjava-${width}-${theme}.png`) });
    }
  }
});

test('popunjeni mobilni alati: nema serious/critical axe nalaza', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [route, sample] of tools) {
    await page.goto(`/${route}.html`);
    await page.getByRole('button', { name: 'Samo nužno', exact: true }).click({ timeout: 3000 }).catch(() => {});
    await page.locator(sample).click();
    for (const theme of ['light', 'dark']) {
      await setTheme(page, theme);
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.passes.length).toBeGreaterThan(0);
      expect(result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical'), `${route}/${theme}`).toEqual([]);
      if (route === 'citat' && theme === 'dark') {
        // Negative control: stabilization must not hide a genuinely unreadable heading.
        const heading = page.locator('h2.sec-h').first();
        await heading.evaluate(el => { (el as HTMLElement).style.color = '#26221b'; });
        await heading.scrollIntoViewIfNeeded();
        await page.screenshot({ fullPage: true });
        await expect(heading).toHaveCSS('color', 'rgb(38, 34, 27)');
        try {
          const bad = await new AxeBuilder({ page }).analyze();
          expect(bad.violations.some(v => v.id === 'color-contrast' && v.nodes.some(n => n.html.includes('sec-h')))).toBe(true);
        } finally {
          await heading.evaluate(el => { (el as HTMLElement).style.removeProperty('color'); });
        }
      }
    }
  }
});
