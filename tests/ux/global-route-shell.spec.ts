import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const ROOT_ROUTE = '/';
const DESKTOP = { width: 1200, height: 800 };
const MOBILE = { width: 390, height: 844 };

async function useTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((selectedTheme) => {
    localStorage.setItem('lekta.theme', selectedTheme);
  }, theme);
}

async function gotoRoot(page: Page, viewport = DESKTOP): Promise<void> {
  await page.setViewportSize(viewport);
  await page.goto(ROOT_ROUTE);
  await expect(page.locator('[data-route-directory-button]')).toBeVisible();
}

async function openDirectory(page: Page, withKeyboard = false): Promise<Locator> {
  const trigger = page.locator('[data-route-directory-button]');
  if (withKeyboard) {
    await trigger.focus();
    await page.keyboard.press('Enter');
  } else {
    await trigger.click();
  }

  const dialog = page.getByRole('dialog', { name: 'Sve mogućnosti' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sve mogućnosti' })).toBeFocused();
  return dialog;
}

function columnCount(value: string): number {
  return value.split(' ').filter(Boolean).length;
}

function seconds(value: string): number {
  return Math.max(...value.split(',').map((part) => Number.parseFloat(part) || 0));
}

async function readMotion(target: Locator): Promise<{
  animationDuration: string;
  animationName: string;
  frameProperties: string[];
  transitionDuration: string;
}> {
  return target.evaluate((node) => {
    const style = getComputedStyle(node);
    const frameProperties = node.getAnimations().flatMap((animation) => {
      const effect = animation.effect;
      if (!(effect instanceof KeyframeEffect)) return [];
      return effect.getKeyframes().flatMap((frame) => Object.keys(frame));
    }).filter((property) => !['offset', 'computedOffset', 'easing', 'composite'].includes(property));
    return {
      animationDuration: style.animationDuration,
      animationName: style.animationName,
      frameProperties: [...new Set(frameProperties)],
      transitionDuration: style.transitionDuration,
    };
  });
}

async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((violation) =>
    violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(serious, serious.map((violation) => violation.id).join(', ')).toEqual([]);
}

test('desktop dialog supports real pointer dismissal, Escape and focus return', async ({ page }) => {
  await useTheme(page, 'light');
  await gotoRoot(page);

  const trigger = page.locator('[data-route-directory-button]');
  const backdrop = page.locator('[data-route-directory-backdrop]');
  await expect(backdrop).toHaveAttribute('hidden', '');
  const dialog = await openDirectory(page);
  await expect(backdrop).not.toHaveAttribute('hidden', '');
  const titleBox = await page.getByRole('heading', { name: 'Sve mogućnosti' }).boundingBox();
  expect(titleBox, 'naslov dijaloga mora imati stvarnu pointer površinu').not.toBeNull();
  await page.mouse.click(titleBox!.x + titleBox!.width / 2, titleBox!.y + titleBox!.height / 2);
  await expect(dialog).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(backdrop).toHaveAttribute('hidden', '');
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(backdrop).not.toHaveAttribute('hidden', '');
  const backdropBox = await backdrop.boundingBox();
  const dialogBox = await dialog.boundingBox();
  expect(backdropBox, 'backdrop mora pokrivati viewport').not.toBeNull();
  expect(dialogBox, 'papir dijaloga mora imati zasebnu površinu').not.toBeNull();
  expect(backdropBox!.width).toBeGreaterThanOrEqual(DESKTOP.width - 1);
  expect(backdropBox!.height).toBeGreaterThanOrEqual(DESKTOP.height - 1);
  expect(dialogBox!.x).toBeGreaterThan(backdropBox!.x + 8);
  await page.mouse.click(backdropBox!.x + 4, backdropBox!.y + 4);
  await expect(dialog).toBeHidden();
  await expect(backdrop).toHaveAttribute('hidden', '');
  await expect(trigger).toBeFocused();
});

test('desktop paper has two columns and mobile paper is a one-column bottom sheet', async ({ page }) => {
  await useTheme(page, 'light');
  await gotoRoot(page, DESKTOP);
  let dialog = await openDirectory(page);
  let layout = await dialog.evaluate((node) => {
    const style = getComputedStyle(node);
    return { columns: style.gridTemplateColumns, overflowY: style.overflowY };
  });
  expect(columnCount(layout.columns)).toBe(2);

  await page.setViewportSize(MOBILE);
  await page.reload();
  dialog = await openDirectory(page);
  layout = await dialog.evaluate((node) => {
    const style = getComputedStyle(node);
    return { columns: style.gridTemplateColumns, overflowY: style.overflowY };
  });
  const box = await dialog.boundingBox();
  expect(columnCount(layout.columns)).toBe(1);
  expect(layout.overflowY).toBe('auto');
  expect(box, 'mobilni sheet mora imati mjerljivu površinu').not.toBeNull();
  expect(Math.abs(box!.y + box!.height - MOBILE.height)).toBeLessThanOrEqual(1);
  expect(box!.width).toBeGreaterThanOrEqual(MOBILE.width - 2);
  const groups = dialog.locator('details[data-route-directory-group]');
  await expect(groups).toHaveCount(4);
  await expect(dialog.locator('details[data-route-directory-group=your-work]')).toHaveAttribute('open', '');
  await expect(dialog.locator('details[data-route-directory-group]:not([open])')).toHaveCount(3);
  expect(await groups.evaluateAll((nodes) => nodes
    .filter((node) => (node as HTMLDetailsElement).open)
    .map((node) => (node as HTMLElement).dataset.routeDirectoryGroup))).toEqual(['your-work']);
});

test('320 px stays free of horizontal overflow with the directory closed and open', async ({ page }) => {
  await useTheme(page, 'light');
  await gotoRoot(page, { width: 320, height: 700 });
  const overflow = () => page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  let width = await overflow();
  expect(width.scrollWidth).toBeLessThanOrEqual(width.clientWidth);
  await openDirectory(page);
  width = await overflow();
  expect(width.scrollWidth).toBeLessThanOrEqual(width.clientWidth);
});

test('mobile header and every visible open-panel control meet 44 px targets', async ({ page }) => {
  await useTheme(page, 'light');
  await gotoRoot(page, MOBILE);
  const dialog = await openDirectory(page);
  const undersized = await page.locator(
    'header a, header button, [data-route-directory] a, [data-route-directory] button, [data-route-directory] summary',
  ).evaluateAll((nodes) => nodes.flatMap((node) => {
    const rect = node.getBoundingClientRect();
    if (!rect.width && !rect.height) return [];
    return rect.width >= 44 && rect.height >= 44
      ? []
      : [{ label: node.textContent?.trim() ?? node.tagName, width: rect.width, height: rect.height }];
  }));

  await expect(dialog).toBeVisible();
  expect(undersized, JSON.stringify(undersized)).toEqual([]);
});

const accessibilityModes = [
  { name: 'explicit light', theme: 'light' as const },
  { name: 'explicit dark', theme: 'dark' as const },
  { name: 'forced colors', theme: 'light' as const, forcedColors: 'active' as const },
  { name: 'reduced motion', theme: 'light' as const, reducedMotion: 'reduce' as const },
];

for (const mode of accessibilityModes) {
  test(`${mode.name} keeps the open panel accessible with an obvious focus ring`, async ({ page }) => {
    await useTheme(page, mode.theme);
    await page.emulateMedia({
      forcedColors: mode.forcedColors,
      reducedMotion: mode.reducedMotion,
    });
    await gotoRoot(page, DESKTOP);
    const dialog = await openDirectory(page, true);
    const title = page.getByRole('heading', { name: 'Sve mogućnosti' });
    const focus = await title.evaluate((node) => {
      const style = getComputedStyle(node);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    expect(focus.outlineStyle).not.toBe('none');
    expect(Number.parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(2);

    if (mode.theme === 'dark') {
      const colors = await dialog.evaluate((node) => {
        const parse = (value: string) => value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
        return {
          paper: parse(getComputedStyle(node).backgroundColor),
          ink: parse(getComputedStyle(node).color),
        };
      });
      expect(Math.min(...colors.paper)).toBeGreaterThan(220);
      expect(Math.max(...colors.ink)).toBeLessThan(80);
    }

    await expectNoSeriousAxeViolations(page);
  });
}

test('opening motion is short and limited to opacity and transform', async ({ page }) => {
  await useTheme(page, 'light');
  await gotoRoot(page, DESKTOP);
  const dialog = await openDirectory(page);
  const backdrop = page.locator('[data-route-directory-backdrop]');
  const paperMotion = await readMotion(dialog);
  const backdropMotion = await readMotion(backdrop);
  for (const motion of [paperMotion, backdropMotion]) {
    expect(seconds(motion.animationDuration)).toBeGreaterThan(0);
    expect(seconds(motion.animationDuration)).toBeLessThanOrEqual(.18);
    expect(motion.animationName).not.toBe('none');
    expect(motion.frameProperties.every((property) => ['opacity', 'transform'].includes(property))).toBe(true);
    expect(seconds(motion.transitionDuration)).toBe(0);
  }
  expect(paperMotion.frameProperties.sort()).toEqual(['opacity', 'transform']);
  expect(backdropMotion.frameProperties).toEqual(['opacity']);

  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDirectory(page);
  const reducedPaper = await readMotion(dialog);
  const reducedBackdrop = await readMotion(backdrop);
  for (const reduced of [reducedPaper, reducedBackdrop]) {
    expect(seconds(reduced.animationDuration)).toBe(0);
    expect(reduced.animationName).toBe('none');
    expect(seconds(reduced.transitionDuration)).toBe(0);
  }
});

test('visual snapshots: desktop and mobile, closed and open', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Chromium is the single snapshot baseline project.');
  await useTheme(page, 'light');
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await gotoRoot(page, DESKTOP);
  await expect(page).toHaveScreenshot('route-shell-desktop-closed.png', { animations: 'disabled' });
  await openDirectory(page);
  await expect(page).toHaveScreenshot('route-shell-desktop-open.png', { animations: 'disabled' });

  await page.setViewportSize(MOBILE);
  await page.reload();
  await expect(page).toHaveScreenshot('route-shell-mobile-closed.png', { animations: 'disabled' });
  await openDirectory(page);
  await expect(page).toHaveScreenshot('route-shell-mobile-open.png', { animations: 'disabled' });
});
