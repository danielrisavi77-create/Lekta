import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { cekajApp } from './app-ready';

const title = 'Downregulation of long noncoding RNA LINC01419 inhibits cell migration, invasion, and tumor growth and promotes autophagy via inactivation of the PI3K/Akt1/mTOR pathway in gastric cancer';
const authors = [{ family: 'Wang', given: 'Lin-Lin' }, { family: 'Zhang', given: 'Lei' }, { family: 'Cui', given: 'Xiao-Feng' }];
const captured = JSON.parse(readFileSync('tests/fixtures/crossref/select-with-authors.json', 'utf8')).response;
const work = captured.message.items.find((x: { DOI: string }) => x.DOI === '10.1177/1758835919874651');

for (const theme of ['dark', 'light'] as const) test(`T98: opt-in, stvarni klik, tri upozorenja i promjena verdikta (${theme})`, async ({ page }, testInfo) => {
  const requests: string[] = [];
  await page.route('https://api.crossref.org/works**', async (route) => {
    const url = new URL(route.request().url()); requests.push(url.href);
    if (url.pathname.endsWith('/10.1%2Fnot-found')) { await route.fulfill({ status: 404, body: '{}' }); return; }
    let response = captured;
    if (!url.search) {
      const doi = decodeURIComponent(url.pathname.slice('/works/'.length));
      const kind = doi === '10.1/partial' ? 'partial_retraction' : doi === '10.1/concern' ? 'expression_of_concern' : 'retraction';
      response = { message: doi === work.DOI ? work : { DOI: doi, 'updated-by': [{ type: kind, source: 'publisher', DOI: '10.1/notice' }] } };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });
  await page.goto('/citat.html');
  await cekajApp(page);
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await page.locator('#tab-bulk').click();
  const common = { type: 'article-journal', author: authors, issued: { 'date-parts': [[2019]] } };
  const references = [
    { ...common, id: 'full', title, DOI: work.DOI },
    { ...common, id: 'partial', title: 'Synthetic partial control', DOI: '10.1/partial' },
    { ...common, id: 'concern', title: 'Synthetic concern control', DOI: '10.1/concern' },
    { ...common, id: 'near', title: title.replace('gastric', 'colon') },
  ];
  await page.locator('#bulk-import').setInputFiles({ name: 'synthetic-controls.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(references)) });
  const cards = page.locator('.bulk-card');
  await expect(cards).toHaveCount(4);
  expect(requests).toHaveLength(0);
  const button = page.locator('#bulk-verify');
  await button.focus(); await expect(button).toBeFocused(); await button.press('Enter');
  await expect(page.locator('#bulk-status')).toContainText('1 povučen rad');
  await expect(page.locator('#bulk-status')).toContainText('1 djelomično povučen rad');
  await expect(page.locator('#bulk-status')).toContainText('1 izraz zabrinutosti');
  await expect(page.locator('.verify-badge')).toHaveCount(7);
  await expect(cards.nth(3).locator('.verify-badge')).toHaveCount(1);
  await expect(button).toBeEnabled(); await expect(button).toBeFocused();
  expect(requests).toHaveLength(4);
  const notice = cards.nth(0).getByRole('link', { name: 'obavijest' });
  await expect(notice).toHaveAttribute('href', 'https://doi.org/10.1177/17588359211061903');
  await expect(notice).toHaveAttribute('rel', 'noopener noreferrer');
  if (testInfo.project.use.isMobile) {
    const rect = await notice.boundingBox();
    expect(rect?.width).toBeGreaterThanOrEqual(44);
    expect(rect?.height).toBeGreaterThanOrEqual(44);
  }
  await notice.focus(); await expect(notice).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('retraction-warnings.png'), fullPage: true });
  await cards.nth(0).screenshot({ path: testInfo.outputPath('retraction-card.png') });
  const axe = await new AxeBuilder({ page }).include('#bulk-entries').analyze();
  expect(axe.passes.length).toBeGreaterThan(0);
  await testInfo.attach('axe-reference-badges', { body: JSON.stringify(axe, null, 2), contentType: 'application/json' });
  expect(axe.violations.filter((v) => ['critical', 'serious', 'moderate'].includes(v.impact || ''))).toEqual([]);
  await button.focus(); await button.press('Enter');
  await expect(button).toBeEnabled();
  await expect(page.locator('.verify-badge')).toHaveCount(7);
  expect(requests).toHaveLength(4);
  await cards.nth(0).locator('input[data-key="doi"]').fill('10.1/not-found');
  await button.focus(); await button.press('Enter');
  await expect(cards.nth(0).locator('.verify-badge')).toHaveCount(1);
  await expect(cards.nth(0)).not.toContainText('Rad je povučen');
  await expect(page.locator('.verify-badge')).toHaveCount(6);
  await expect(page.locator('#bulk-status')).toContainText('1 nije pronađeno');
  expect(requests).toHaveLength(5);
});

// Negativna kontrola izvrsava stvarni Vite modul bez objave spremnosti.
test('T98: marker bez uspjesne objave ne prolazi cekanje spremnosti', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Jedna negativna kontrola stvarnog modula.');
  let mutations = 0;
  await page.route('**/src/tools/citat-page.ts*', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const pattern = /setAttribute\((['"])data-lekta-ready\1,\s*(['"])1\2\)/g;
    const body = source.replace(pattern, () => { mutations++; return "setAttribute('data-lekta-ready', '0')"; });
    await route.fulfill({ response, body });
  });
  await page.goto('/citat.html');
  await expect.poll(() => mutations).toBe(1);
  await expect(page.locator('html')).toHaveAttribute('data-lekta-ready', '0');
  await expect(cekajApp(page, 500)).rejects.toThrow();
});
