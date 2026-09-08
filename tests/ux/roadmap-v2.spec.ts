import { expect, test } from '@playwright/test';
import path from 'node:path';
import { expectInsideFold } from './fold';
import { cekajApp, cekajKorak } from './app-ready';

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

    await cekajApp(page);
    await page.locator('#fileInput').setInputFiles(fixture);
    // Korak 2 dolazi SAM, bez sticky CTA-a "Nastavi na profil": popravljeno 2026-09-08
    // (`usesCompactUploadFlow` je bio vestigalni ostatak stare mobilne staze koji je ovdje jos
    // trazio rucni klik). Provjera fold-vidljivosti tog gumba time otpada: gumb vise ne postoji
    // na ovom putu (nula do jedan tap, isto kao desktop).
    await cekajKorak(page, '2');
  });

}
