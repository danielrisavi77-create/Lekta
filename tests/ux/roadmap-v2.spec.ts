import { expect, test } from '@playwright/test';
import path from 'node:path';
import { expectInsideFold } from './fold';

const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
  test(`mobilni upload stane u prvi ekran ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/rad/');
    // `.lek-head-copy h1` i `.lek-top-lead` bili su naslov i podnaslov marketinskog heroja.
    // Hero je uklonjen 2026-09-07 (`4d4ccb5a`) po brifu vlasnika; test je od tog commita bio
    // slomljen, a nije se vidjelo jer je tada vrtjen samo `workspace-entry`.
    //
    // Preostale tvrdnje SU ono sto naslov testa kaze: upload i njegova primarna akcija bez
    // skrolanja. Dvije uklonjene bile su o marketinskom naslovu, koji vise ne postoji.
    //
    // TRAKA KORAKA NIJE ZAMJENA, iako bi po smislu bila: `.wizard-rail` je ispod 720 px
    // `display:none` i to je ZATECENA odluka (pravilo postoji i u HEAD-u prije ovog rada).
    // Na mobitelu dakle nema pokazatelja polozaja u toku. Zabiljezeno kao nalaz, ne popravljeno
    // ovdje: promjena bi bila UX odluka vlasnika, a ne popravak slomljenog testa.
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
