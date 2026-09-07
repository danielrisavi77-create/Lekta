import { expect, test } from '@playwright/test';
import path from 'node:path';
import { expectInsideFold } from './fold';

const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test(`mobilni upload stane u prvi ekran ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/rad/');
    await expectInsideFold(page, '.lek-head-copy h1', viewport.height);
    await expectInsideFold(page, '.lek-top-lead', viewport.height);
    await expectInsideFold(page, '#dropzone', viewport.height);
    await expectInsideFold(page, '#browseBtn', viewport.height);

    await page.locator('#fileInput').setInputFiles(fixture);
    await expect(page.locator('#wizardView')).toHaveAttribute('data-step', '1');
    const sticky = page.locator('.lek-stepnav-1');
    await expect(sticky).toBeVisible();
    await expect(sticky.locator('#stepToProfile')).toContainText('Nastavi na profil');
    await expectInsideFold(page, '#stepToProfile', viewport.height);
    await sticky.locator('#stepToProfile').click();
    await expect(page.locator('#wizardView')).toHaveAttribute('data-step', '2');
  });

}
