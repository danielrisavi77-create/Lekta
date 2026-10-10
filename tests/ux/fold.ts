import { expect, type Page } from '@playwright/test';

/**
 * Tvrdi da je element CIJEL unutar prvog ekrana (bez skrolanja).
 *
 * Dijeljeno izmedju `roadmap-v2.spec.ts` (mobilni ekrani) i `desktop-flow.spec.ts`. Izdvojeno kad
 * je desktop tok odvojen u vlastitu datoteku: dok je helper zivio u jednoj od njih, druga bi pukla
 * s `ReferenceError`, sto je test pretvaralo u pad bez veze sa stanjem proizvoda.
 */
const FOLD_ZAOKRUZIVANJE_PX = 0.5;

export async function expectInsideFold(page: Page, selector: string, viewportHeight: number) {
  const box = await page.locator(selector).boundingBox();
  expect(box, `${selector} mora biti vidljiv`).not.toBeNull();
  // Tolerancija od pola piksela pokriva samo zaokruzivanje podpiksela (izmjereno y=-0.0625 u CI-ju);
  // element koji stvarno viri izvan prvog ekrana i dalje pada.
  expect(box!.y).toBeGreaterThanOrEqual(-FOLD_ZAOKRUZIVANJE_PX);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewportHeight + FOLD_ZAOKRUZIVANJE_PX);
}
