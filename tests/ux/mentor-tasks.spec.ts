import { expect, test } from '@playwright/test';
import path from 'node:path';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp, cekajKorak } from './app-ready';

/**
 * T13 (plan razvoja): student vidi izvorni komentar mentora i SVOJ status rada; sucelje ne tvrdi da je sadrzajna
 * primjedba automatski rijesena. Fixture `synthetic-mentor-komentari.docx` nosi dva klasicna komentara i jednu nit
 * (komentar + odgovor; nepodrzano, oznaceno). Sve se cita lokalno iz paketa; nista ne odlazi s uredjaja.
 */
const fixture = path.resolve('tests/fixtures/docx/synthetic-mentor-komentari.docx');

test.describe('T13: mentorovi komentari kao lokalni zadaci', () => {
  test.setTimeout(300_000);

  test('komentari su vidljivi s izvornim tekstom; "obradjeno" je korisnikov zapis, ne strojna potvrda', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/rad/');
    const odbij = page.locator('#analyticsDecline');
    if (await odbij.isVisible().catch(() => false)) {
      await odbij.click();
      await expect(page.locator('#consentBanner')).toBeHidden();
    }
    await cekajApp(page);
    await page.locator('#fileInput').setInputFiles(fixture);
    await cekajKorak(page, '2');
    await expect(page.locator('#analyzeBtn')).toBeEnabled();
    await page.locator('#analyzeBtn').click();
    await potvrdiProfil(page);
    await expect(page.locator('#resultView')).toBeVisible({ timeout: 90_000 });

    const tasks = page.getByTestId('mentor-tasks');
    await expect(tasks).toBeVisible({ timeout: 30_000 });
    await expect(tasks).toContainText('Komentari mentora u dokumentu (4)');
    await expect(tasks).toContainText('Prored osnovnog teksta mora biti 1,5; ovdje je jednostruki.');
    await expect(tasks).toContainText('Argument u ovom odlomku nije potkrijepljen izvorom');

    const sadrzajni = tasks.locator('[data-mentor-task]').nth(1);
    await expect(sadrzajni).toHaveAttribute('data-user-status', 'open');
    await sadrzajni.locator('[data-mentor-address]').click();
    const nakon = tasks.locator('[data-mentor-task]').nth(1);
    await expect(nakon).toHaveAttribute('data-user-status', 'addressed');
    await expect(nakon, 'sadrzajna primjedba nikad nije strojno potvrdjena').toHaveAttribute('data-verification', 'not-verified');
    await expect(nakon).toContainText('može potvrditi samo mentor');
    // Odgovor u niti je prikazan, ali oznacen kao nepodrzan i bez gumba za obradu.
    const odgovor = tasks.locator('[data-mentor-task]').nth(3);
    await expect(odgovor).toHaveAttribute('data-unsupported', 'da');
    await expect(odgovor.locator('[data-mentor-address]')).toHaveCount(0);
  });
});
