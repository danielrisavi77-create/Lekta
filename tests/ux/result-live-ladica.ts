import { expect, type Page } from '@playwright/test';

/**
 * STOL Z34 (rezultat sve u jednom): zajednicki koraci za specove koji kroz rezultat idu u plan.
 *
 * Ladica plana je fiksna traka koja se pojavi TEK kad presuda izadje iz pogleda, a stol je jos na
 * ekranu (ALIGNMENT Z34, tocka 8). Dok je presuda vidljiva, ladica je `inert`, pa je klik na nju
 * (kao i na `[data-repair-plan-go]` u njoj) nemoguc; zato je spec prvo otvara.
 */
export async function otvoriLadicu(page: Page): Promise<void> {
  await expect(page.locator('#resultCockpit')).toHaveAttribute('data-rl-ready', 'true', { timeout: 30_000 });
  // Traka privole je takodjer fiksna uz dno i lezi IZNAD ladice dok korisnik ne odgovori (F37).
  const odbij = page.locator('#analyticsDecline');
  if (await odbij.isVisible().catch(() => false)) await odbij.click();
  await page.locator('[data-rl-desk]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, 120));
  await expect(page.locator('[data-rl-tray]')).toHaveAttribute('data-open', 'true');
}

/**
 * Sljedeca kartica u hrpi. Kartica se mijenja tek kad stara odleti (0,2 s bez prigusenog pokreta),
 * pa se ceka da se polozaj STVARNO promijeni; `false` kad sljedece nema (navigacija ne omata).
 */
export async function sljedecaKartica(page: Page): Promise<boolean> {
  const kokpit = page.locator('#resultCockpit');
  const brojac = kokpit.locator('[data-rl-card] [data-desk-count]');
  // Prije klika slot mora biti miran: klik usred ulazne animacije prethodne kartice u WebKitu je
  // jednom propao (brojac je ostao "5 od 12"), pa se prelazak ne mjeri nad prijelaznim stanjem.
  await expect(kokpit.locator('[data-rl-slot]')).not.toHaveAttribute('data-anim', /^(out|outR|in|inR)$/);
  const prije = await brojac.textContent();
  const dalje = kokpit.locator('[data-rl-card] .desk-nav__btn--next');
  if (await dalje.isDisabled()) return false;
  await dalje.click();
  await expect(brojac).not.toHaveText(prije ?? '');
  return true;
}

/** Lista hrpu kartica (filtar Sve) do prve kartice kojoj plan nudi zahvat. */
export async function karticaSaZahvatom(page: Page): Promise<void> {
  const kokpit = page.locator('#resultCockpit');
  await expect(kokpit).toHaveAttribute('data-rl-ready', 'true', { timeout: 30_000 });
  for (let i = 0; i < 60; i += 1) {
    if (await kokpit.locator('[data-rl-toggle]').count()) return;
    if (!(await sljedecaKartica(page))) break;
  }
  throw new Error('nijedan nalaz nema zahvat u planu, a fixture ima automatske zahvate');
}
