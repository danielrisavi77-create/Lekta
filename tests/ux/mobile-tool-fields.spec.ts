import { expect, test, type Page } from '@playwright/test';
import { FREE_TOOL_PAGES } from './free-tools-pages';

/**
 * POLJA I METE ALATA NA MOBITELU (mobilni audit 2026-09-28, PR 4).
 *
 * Tri izravna signala po stranici alata, izmjerena u pregledniku a ne iz CSS teksta:
 *  1. Svako vidljivo tekstualno polje ima slova od barem 16 px. Ispod toga iOS Safari pri dodiru povecava stranicu.
 *  2. Polja u `.row2` (dva u retku) na uskom ekranu stoje jedno ispod drugog, pa se izbornici ne rezu.
 *  3. Pravne poveznice u podnozju su mete od barem 44 x 44 px (bilo 24 px visine; Codex 310-2).
 * Polja se mjere u cijelom `main`, ne samo u `.tool-workspace`: na citat.html kartica "Cijela literatura" stoji
 * izvan radnog prostora, pa test otvara i nju i mjeri polja koja nastanu nakon prepoznavanja (Codex 310-1).
 */
const ALATI = FREE_TOOL_PAGES.filter((p) => p.workspaceSelector);

const POLJA = 'main :is(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=hidden]),select,textarea)';

async function sitnaPolja(page: Page): Promise<Array<{ id: string; px: number }>> {
  return page.evaluate((sel) => [...document.querySelectorAll<HTMLElement>(sel)]
    .filter((el) => el.getBoundingClientRect().width > 0)
    .map((el) => ({ id: el.id || String(el.className) || el.tagName, px: parseFloat(getComputedStyle(el).fontSize) }))
    .filter((p) => p.px < 16), POLJA);
}

for (const alat of ALATI) {
  test(`mobitel: polja i mete na stranici ${alat.name}`, async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-chromium', 'viewport se postavlja izravno; jedan mobilni projekt je dovoljan');
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(alat.route);
    await page.locator(alat.workspaceSelector!).first().waitFor();

    expect(await sitnaPolja(page), 'polja sa slovima ispod 16 px').toEqual([]);

    // Retci s manje od dva vidljiva polja nemaju sto slagati. Namjerni par s inline stupcima (naslovnica: kratka
    // titula `auto` uz ime `1fr`) ostaje u retku, ali ni njegovo dijete ne smije izaci iz retka.
    const redovi = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.row2')]
      .filter((r) => r.getBoundingClientRect().width > 0)
      .map((r) => {
        const rr = r.getBoundingClientRect();
        const djeca = [...r.children].filter((c) => (c as HTMLElement).getBoundingClientRect().width > 0) as HTMLElement[];
        const lijevo = new Set(djeca.map((c) => Math.round(c.getBoundingClientRect().left)));
        const preljev = djeca.some((c) => c.getBoundingClientRect().right > rr.right + 0.5);
        return { djece: djeca.length, stupaca: lijevo.size, namjerniPar: r.style.gridTemplateColumns !== '', preljev };
      }));
    for (const r of redovi) {
      expect(r.preljev, 'nijedno polje ne izlazi iz svog retka').toBe(false);
      if (!r.namjerniPar && r.djece > 1) expect(r.stupaca, 'polja .row2 na uskom ekranu stoje jedno ispod drugog').toBe(1);
    }

    const poveznice = await page.locator('.site-footer__pravno a').evaluateAll((els) =>
      els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => {
        const r = e.getBoundingClientRect();
        return { tekst: (e.textContent || '').trim(), w: Math.round(r.width), h: Math.round(r.height) };
      }));
    expect(poveznice.length, 'podnozje ima pravne poveznice').toBeGreaterThan(0);
    expect(poveznice.filter((v) => v.w < 44 || v.h < 44), 'pravne poveznice su mete od barem 44 x 44 px').toEqual([]);
  });
}

test('mobitel: kartica "Cijela literatura" na citat.html, ulaz i nastala polja imaju 16 px (Codex 310-1)', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile-chromium', 'viewport se postavlja izravno; jedan mobilni projekt je dovoljan');
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/citat.html');
  await page.locator('#tab-bulk').click();
  await expect(page.locator('#panel-bulk')).toBeVisible();
  expect(await page.locator('#bulk-style').isVisible(), 'izbornik stila kartice je vidljiv').toBe(true);
  expect(await sitnaPolja(page), 'ulaz kartice: izbornik stila i polje za lijepljenje').toEqual([]);

  await page.locator('#bulk-input').fill('Kovačić, I. (2020). Naslov knjige. Zagreb: Izdavač.\nHorvat, A. (2019). Naslov članka. Časopis, 28(3), 45-67.');
  await page.locator('#bulk-parse').click();
  const nastala = page.locator('#bulk-entries :is(input, select)');
  await expect.poll(() => nastala.count(), { message: 'prepoznavanje stvara uredjiva polja' }).toBeGreaterThan(1);
  expect(await sitnaPolja(page), 'nastala polja nakon prepoznavanja').toEqual([]);
});
