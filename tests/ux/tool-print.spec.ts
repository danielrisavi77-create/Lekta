import { expect, test } from '@playwright/test';

for (const [route, prefix] of [['/naslovnica.html', 'tp'], ['/izjava.html', 'st']]) {
  test(`print ${route}: document has no decorative paper or 3D transform`, async ({ page }) => {
    await page.goto(route);
    await page.locator(`#${prefix}-sample`).click();
    await page.emulateMedia({ media: 'print' });
    const style = await page.locator('.tp-sheet-wrap').evaluate(el => ({
      transform: getComputedStyle(el).transform,
      shadow: getComputedStyle(el).boxShadow,
      before: getComputedStyle(el, '::before').display,
      after: getComputedStyle(el, '::after').display,
    }));
    expect(style).toEqual({ transform: 'none', shadow: 'none', before: 'none', after: 'none' });
    const ancestors = await page.locator(`#${prefix}-sheet`).evaluate(el => {
      const found: string[] = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        if (getComputedStyle(node).boxShadow !== 'none') found.push(node.className || node.tagName);
      }
      return found;
    });
    expect(ancestors, 'printed document and every ancestor must be shadow-free').toEqual([]);
    await expect(page.locator(`#${prefix}-sheet`)).toBeVisible();
    await expect(page.locator(`#${prefix}-print`)).toBeHidden();
  });
}
