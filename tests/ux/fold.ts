import { expect, type Page } from '@playwright/test';

/**
 * Tvrdi da je element CIJEL unutar prvog ekrana (bez skrolanja).
 *
 * Dijeljeno izmedju `roadmap-v2.spec.ts` (mobilni ekrani) i `desktop-flow.spec.ts`. Izdvojeno kad
 * je desktop tok odvojen u vlastitu datoteku: dok je helper zivio u jednoj od njih, druga bi pukla
 * s `ReferenceError`, sto je test pretvaralo u pad bez veze sa stanjem proizvoda.
 */
export async function expectInsideFold(page: Page, selector: string, viewportHeight: number) {
  const box = await page.locator(selector).boundingBox();
  expect(box, `${selector} mora biti vidljiv`).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewportHeight);
}
