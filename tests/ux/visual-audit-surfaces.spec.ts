import { expect, test } from '@playwright/test';

test('audit: glavni odabir rada stane prije neobaveznog roka na malom mobitelu', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Samo nužno', exact: true }).click({ timeout: 3000 }).catch(() => {});
  const date = page.locator('#intakeRok');
  const rok = page.locator('.intake-deadline');
  const upload = page.locator('.intake-paper__gumb');
  await expect(date).toBeVisible();
  const a = await rok.boundingBox(), b = await upload.boundingBox();
  const height = await page.evaluate(() => window.innerHeight);
  expect(b!.y + b!.height).toBeLessThanOrEqual(height);
  expect(b!.y + b!.height).toBeLessThan(a!.y);
  await page.screenshot({ path: info.outputPath('intake-deadline-mobile.png') });
  await date.fill('2026-10-15');
  await expect(upload).toHaveAttribute('aria-disabled', 'false');
  await expect(page.locator('[data-intake-deadline-summary]')).toHaveText(/do roka/);
  await page.locator('[data-intake-rok-clear]').click();
  await expect(date).toHaveValue('');
  await expect(page.locator('[data-intake-deadline-summary]')).toHaveText('Rok još nije unesen');
  await page.goto('/alati.html');
  await page.locator('#mobileMenuBtn').click();
  await page.locator('[data-display-open]:visible').click();
  const labels = page.locator('.ps-seg--svjetlo .ps-seg__tekst');
  await expect(labels).toHaveCount(3);
  for (const label of await labels.all()) {
    await expect(label).toBeVisible();
    expect(await label.evaluate(el => parseFloat(getComputedStyle(el).lineHeight) / parseFloat(getComputedStyle(el).fontSize))).toBeLessThan(1.4);
  }
  for (const text of ['Radna lampa', 'Danje svjetlo']) {
    await page.locator('.ps-seg__opcija').filter({ hasText: text }).click();
    await page.screenshot({ path: info.outputPath(`settings-${text === 'Radna lampa' ? 'dark' : 'light'}.png`) });
  }
  await page.getByRole('button', { name: 'Zatvori postavke prikaza' }).click();
  await expect(page.locator('#mobileMenuBtn')).toBeFocused();
});

test('audit: prazni alati ostaju nacrti nakon ucitavanja fakulteta', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/citat.html');
  await page.getByRole('button', { name: 'Samo nužno', exact: true }).click({ timeout: 3000 }).catch(() => {});
  await page.locator('#f-faculty').selectOption('fpzg');
  await page.locator('#c-clear').click();
  await expect(page.locator('#copyBtn')).toBeDisabled();
  await expect(page.locator('#c-success-cta')).toBeHidden();
  await page.locator('#out').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('citation-empty-mobile.png') });
  await page.goto('/naslovnica.html?fakultet=fpzg');
  await expect(page.locator('#tp-unit')).toHaveValue('fpzg');
  await expect(page.locator('#tp-sheet')).toHaveAttribute('aria-label', 'Prikaz predloška');
  await expect(page.locator('#tp-success-cta')).toBeHidden();
  await page.locator('#tp-sheet').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('title-empty-mobile.png') });
});

test('audit: tekst kartice profila ostaje čitljiv na desktopu', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-chromium');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Samo nužno', exact: true }).click({ timeout: 3000 }).catch(() => {});
  const panel = page.locator('#intakePanelPravila');
  await expect(panel).toBeVisible();
  expect(await panel.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none');
  await page.screenshot({ path: info.outputPath('intake-profile-desktop.png') });
});

test('audit: Kazalo ima jedan pomični popis na desktopu i mobitelu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Samo nužno', exact: true }).click({ timeout: 3000 }).catch(() => {});

  const dialog = page.locator('.site-command-dialog');
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    if (viewport.width < 768) await page.getByRole('button', { name: 'Izbornik' }).click();
    const trigger = page.getByRole('button', { name: 'Kazalo' });
    await trigger.click();
    await expect(dialog).toBeVisible();
    const metrics = await dialog.evaluate((element) => {
      const results = element.querySelector<HTMLElement>('.site-command-dialog__results')!;
      return {
        dialogScrollHeight: element.scrollHeight,
        dialogClientHeight: element.clientHeight,
        dialogOverflowY: getComputedStyle(element).overflowY,
        resultsOverflowY: getComputedStyle(results).overflowY,
      };
    });
    expect(metrics.dialogScrollHeight).toBeLessThanOrEqual(metrics.dialogClientHeight);
    expect(metrics.dialogOverflowY).toBe('hidden');
    expect(metrics.resultsOverflowY).toBe('auto');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    const focusTarget = viewport.width < 768 ? page.getByRole('button', { name: 'Izbornik' }) : trigger;
    await expect(focusTarget).toBeFocused();
  }
});
