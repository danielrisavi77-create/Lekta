import { expect, test } from '@playwright/test';

test('audit: rok prije uploada i citljive postavke na mobitelu', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Samo nužno', exact: true }).click({ timeout: 3000 }).catch(() => {});
  const date = page.locator('#intakeRok');
  const upload = page.locator('.intake-paper__gumb');
  await expect(date).toBeVisible();
  const a = await date.boundingBox(), b = await upload.boundingBox();
  expect(a!.y + a!.height).toBeLessThan(b!.y);
  await page.screenshot({ path: info.outputPath('intake-deadline-mobile.png') });
  await page.locator('#intakeRokNeznam').check();
  await expect(upload).toHaveAttribute('aria-disabled', 'false');
  await page.reload();
  await expect(page.locator('#intakeRokNeznam')).toBeChecked();
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
