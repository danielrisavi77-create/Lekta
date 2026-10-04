import { expect, test } from '@playwright/test';
import { FREE_TOOL_PAGES } from './free-tools-pages';

/**
 * POLJA I METE ALATA NA MOBITELU (mobilni audit 2026-09-28, PR 4).
 *
 * Tri izravna signala po stranici alata, izmjerena u pregledniku a ne iz CSS teksta:
 *  1. Svako vidljivo tekstualno polje ima slova od barem 16 px. Ispod toga iOS Safari pri dodiru povecava stranicu.
 *  2. Polja u `.row2` (dva u retku) na uskom ekranu stoje jedno ispod drugog, pa se izbornici ne rezu.
 *  3. Pravne poveznice u podnozju su visoke barem 44 px (bilo 24 px).
 */
const ALATI = FREE_TOOL_PAGES.filter((p) => p.workspaceSelector);

for (const alat of ALATI) {
  test(`mobitel: polja i mete na stranici ${alat.name}`, async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-chromium', 'viewport se postavlja izravno; jedan mobilni projekt je dovoljan');
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(alat.route);
    await page.locator(alat.workspaceSelector!).first().waitFor();

    const sitna = await page.evaluate((sel) => [...document.querySelectorAll<HTMLElement>(
      `${sel} :is(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=hidden]),select,textarea)`)]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => ({ id: el.id || el.className || el.tagName, px: parseFloat(getComputedStyle(el).fontSize) }))
      .filter((p) => p.px < 16), alat.workspaceSelector!);
    expect(sitna, 'polja sa slovima ispod 16 px').toEqual([]);

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
      els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(poveznice.length, 'podnozje ima pravne poveznice').toBeGreaterThan(0);
    for (const h of poveznice) expect(h, 'pravna poveznica je meta od barem 44 px').toBeGreaterThanOrEqual(44);
  });
}
