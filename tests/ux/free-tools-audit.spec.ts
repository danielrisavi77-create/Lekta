import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { FREE_TOOL_PAGES } from './free-tools-pages';

for (const pageSpec of FREE_TOOL_PAGES) {
  test(`${pageSpec.name}: ima jasnu glavnu zonu i primarnu akciju`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(pageSpec.route);

    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator(pageSpec.primarySelector)).toBeVisible();
    await expect(page.locator('#mobileMenuBtn')).toBeVisible();
    await expect(page.locator('#themeBtn')).toBeVisible();

    if (pageSpec.workspaceSelector) {
      await expect(page.locator(pageSpec.workspaceSelector)).toBeVisible();
    }
  });

  test(`${pageSpec.name}: nema critical ili serious accessibility kršenja`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(pageSpec.route);

    const results = await new AxeBuilder({ page }).analyze();
    const seriousViolations = results.violations.filter((violation) =>
      violation.impact === 'critical' || violation.impact === 'serious',
    );

    expect(seriousViolations, seriousViolations.map((violation) => violation.id).join(', ')).toEqual([]);
  });
}

test('premium motion poštuje reduced-motion način rada', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/citat.html');

  const motionState = await page.evaluate(() => {
    const tilt = document.querySelector<HTMLElement>('[data-premium-tilt]');
    return {
      reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      transitionDuration: tilt ? getComputedStyle(tilt).transitionDuration : null,
      animationName: tilt ? getComputedStyle(tilt).animationName : null,
    };
  });

  expect(motionState.reduced).toBe(true);
  expect(motionState.transitionDuration).toBe('0s');
  expect(motionState.animationName).toBe('none');
});

/**
 * KONTRAST U PREGLEDNIKU, ne u CSS izvoru.
 *
 * Zasto ovdje a ne u `tests/a11y-batch-2026-07-18.test.ts`: taj test cita CSS kao TEKST i racuna
 * kontrast nad tokenima koje sam imenuje. Oba kvara koja ova tvrdnja cuva nastala su tako da je
 * pravilo bilo posve ispravno u izvoru, a token se u KONTEKSTU razrijesio na krivu stranu palete.
 * Staticka analiza to po konstrukciji ne vidi; treba stvarni `getComputedStyle`.
 *
 * Izmjereno 2026-08-30, prije popravka:
 *  - `alati.html` hero: naslov 1,05:1. `.premium-paper-stack` listovi su `--paper-2` (svijetli), a
 *    `isolation: isolate` cini da se `z-index:-1` pseudo-element crta IZNAD vlastite pozadine
 *    kartice, pa je svijetli list prekrio tamnu karticu i kremasti tekst je nestao.
 *  - FAQ znak "+": 1,06:1 na SVIH pet alata (hub je bio ispravan, 5,12:1), jer `--muted` na
 *    alatima daje desk ton dok FAQ lezi na papiru.
 */
const CONTRAST_HELPERS = () => {
  const parse = (value: string) => {
    const n = (value.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number);
    return value.startsWith('color(')
      ? { r: n[0] * 255, g: n[1] * 255, b: n[2] * 255, a: n[3] ?? 1 }
      : { r: n[0], g: n[1], b: n[2], a: n[3] ?? 1 };
  };
  const blend = (fg: { r: number; g: number; b: number; a: number }, bg: { r: number; g: number; b: number }) => ({
    r: fg.a * fg.r + (1 - fg.a) * bg.r,
    g: fg.a * fg.g + (1 - fg.a) * bg.g,
    b: fg.a * fg.b + (1 - fg.a) * bg.b,
  });
  const lum = (c: { r: number; g: number; b: number }) => {
    const t = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * t(c.r) + 0.7152 * t(c.g) + 0.0722 * t(c.b);
  };
  return { parse, blend, lum };
};

for (const pageSpec of FREE_TOOL_PAGES.filter((p) => p.workspaceSelector || p.route === '/alati.html')) {
  test(`${pageSpec.name}: FAQ znak za otvaranje je vidljiv na svojoj podlozi`, async ({ page }) => {
    await page.goto(pageSpec.route);
    const ratio = await page.evaluate((helpersSource) => {
      const { parse, blend, lum } = (new Function(`return (${helpersSource})()`))() as ReturnType<typeof CONTRAST_HELPERS>;
      const summary = document.querySelector('.faq details summary');
      if (!summary) return null;
      // Stvarna podloga: prvi predak s neprozirnom pozadinom.
      let node: Element | null = summary;
      let bg = { r: 255, g: 255, b: 255 };
      while (node) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c.a > 0.99) { bg = c; break; }
        node = node.parentElement;
      }
      const after = getComputedStyle(summary, '::after');
      const marker = parse(after.color);
      marker.a *= parseFloat(after.opacity || '1');
      const mixed = blend(marker, bg);
      const [hi, lo] = [lum(mixed), lum(bg)].sort((a, b) => b - a);
      return (hi + 0.05) / (lo + 0.05);
    }, CONTRAST_HELPERS.toString());

    if (ratio === null) test.skip(true, 'stranica nema FAQ blok');
    expect(ratio, `kontrast "+" na ${pageSpec.route}`).toBeGreaterThanOrEqual(4.5);
  });
}

test('alati.html: hero kartica na tamnoj plohi ostaje citljiva', async ({ page }) => {
  await page.goto('/alati.html');
  const ratios = await page.evaluate((helpersSource) => {
    const { parse, blend, lum } = (new Function(`return (${helpersSource})()`))() as ReturnType<typeof CONTRAST_HELPERS>;
    const card = document.querySelector('.premium-tool-index__intro');
    if (!card) return null;
    // Podloga je GORNJI list hrpe, ne pozadina kartice: on se crta iznad nje.
    const bg = parse(getComputedStyle(card, '::after').backgroundColor);
    const ratio = (el: Element | null) => {
      if (!el) return 99;
      const fg = parse(getComputedStyle(el).color);
      const mixed = blend(fg, bg);
      const [hi, lo] = [lum(mixed), lum(bg)].sort((a, b) => b - a);
      return (hi + 0.05) / (lo + 0.05);
    };
    return {
      naslov: ratio(card.querySelector('h2')),
      tekst: ratio(card.querySelector('p')),
      nadnaslov: ratio(card.querySelector('.premium-eyebrow')),
    };
  }, CONTRAST_HELPERS.toString());

  expect(ratios).not.toBeNull();
  expect(ratios!.naslov, 'naslov hero kartice').toBeGreaterThanOrEqual(4.5);
  expect(ratios!.tekst, 'tekst hero kartice').toBeGreaterThanOrEqual(4.5);
  expect(ratios!.nadnaslov, 'nadnaslov hero kartice').toBeGreaterThanOrEqual(4.5);
});
