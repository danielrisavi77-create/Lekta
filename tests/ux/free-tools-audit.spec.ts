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

/**
 * OBJE TEME, ne samo zadana.
 *
 * Prva verzija ovog garda mjerila je samo zadanu (tamnu) temu i zato je propustila REGRESIJU koju
 * je sama uvela: nadnaslov je bio postavljen na `--desk-muted`, token koji se s temom MIJENJA
 * (`rgba(237,231,220,.55)` -> `#655C4B`), dok pozadina kartice `--paper-ink` ne. Izmjereno je tada
 * 4,88:1 u tamnoj i 2,40:1 u svijetloj, dakle gore nego prije popravka.
 *
 * Pouka je opcenitija od jednog retka: token uzet s DRUGE strane palete moze biti ispravan u jednoj
 * temi i pogresan u drugoj, pa gard koji tema ne zanima to po konstrukciji ne vidi.
 */
for (const tema of ['dark', 'light'] as const) {
test(`alati.html: hero kartica ostaje citljiva u temi ${tema}`, async ({ page }) => {
  await page.goto('/alati.html');
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);
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
  // Nijedan element ne smije nedostajati: `ratio(null)` bi inace vratio 99 i tvrdnja bi prosla
  // vakuumski da se selektor ikad preimenuje.
  expect(ratios!.naslov, `naslov hero kartice (${tema})`).toBeLessThan(99);
  expect(ratios!.naslov, `naslov hero kartice (${tema})`).toBeGreaterThanOrEqual(4.5);
  expect(ratios!.tekst, `tekst hero kartice (${tema})`).toBeGreaterThanOrEqual(4.5);
  expect(ratios!.nadnaslov, `nadnaslov hero kartice (${tema})`).toBeGreaterThanOrEqual(4.5);
});
}

/**
 * RITAM NA MOBITELU: alat mora poceti sto ranije, a ne iza dugog uvoda.
 *
 * Izmjereno 2026-08-30 (prije zahvata -> poslije), prva INTERAKTIVNA kontrola alata:
 *   390x844: citat 590->558, kartice 575->550, naslovnica 669->639, literatura 709->677,
 *            izjava 602->576, alati 897->817. Svih sest sada iznad pregiba (prije jedan ispod).
 *   375x667: isti pomaci; cetiri od sest iznad pregiba.
 *
 * POSTENO O GRANICI: na 375x667 `literatura` (698) i `alati` (848) OSTAJU ispod pregiba i to se
 * stilom vise ne da rijesiti. Na 667 px visine zbroj je topbar 67 + hero ~282 + dvije uvodne
 * kartice 427; da prva kartica alata stane, morao bi NESTATI sadrzaj, a to je produktna odluka
 * (sto se na telefonu uopce pokazuje prije alata), ne pitanje CSS-a. Zato ratchet: te dvije smiju
 * samo padati, nikad rasti.
 */
const PRVA_KONTROLA: Record<string, string> = {
  '/citat.html': '#f-faculty',
  '/kartice.html': '#kt-input',
  '/naslovnica.html': '#tp-institution',
  '/literatura.html': '#lit-input',
  '/izjava.html': '#st-author',
  '/alati.html': '.tool-card',
};

/** Zateceni maksimumi na 375x667 za stranice koje pregib jos ne stignu. Smiju samo padati. */
const RATCHET_375: Record<string, number> = { '/literatura.html': 700, '/alati.html': 850 };

async function vrhPrveKontrole(page: import('@playwright/test').Page, selector: string) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    return Math.round(el.getBoundingClientRect().top + window.scrollY);
  }, selector);
}

for (const [route, selector] of Object.entries(PRVA_KONTROLA)) {
  test(`${route}: alat pocinje iznad pregiba na 390x844`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    const top = await vrhPrveKontrole(page, selector);
    expect(top, `prva kontrola na ${route}`).not.toBeNull();
    expect(top!, `prva kontrola na ${route} mora biti iznad 844 px`).toBeLessThan(844);
  });

  test(`${route}: ritam na 375x667 ne smije nazadovati`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(route);
    const top = await vrhPrveKontrole(page, selector);
    expect(top).not.toBeNull();
    // Stranice koje stignu pregib drze pregib; preostale dvije drze zatecenu mjeru.
    const limit = RATCHET_375[route] ?? 667;
    expect(top!, `prva kontrola na ${route} (granica ${limit} px)`).toBeLessThanOrEqual(limit);
  });
}

/**
 * PRVI TEST KOJI ALAT STVARNO KORISTI.
 *
 * Do 2026-08-30 nijedna browser tvrdnja nije KLIKNULA nijedan primarni gumb: `#copyBtn`,
 * `#kt-copy`, `#tp-print`, `#lit-copy` i `#st-print` provjeravali su se samo kao VIDLJIVI. Cijela
 * jezgra je gusto pokrivena jedinicnim testovima, ali nista nije dokazivalo da sklopljeni proizvod
 * radi u pregledniku: bez upisa, bez citanja izlaza, bez preuzimanja.
 *
 * Ovdje se mjeri lanac od tipkanja do potvrde ishoda, ukljucujuci vizualnu potvrdu
 * (`data-lekta-ok`), koja je dodana jer se pri uspjehu dotad mijenjao samo tekst gumba.
 */
test('kartice: upis mijenja brojke, a kopiranje daje vidljivu potvrdu', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/kartice.html');

  // Brojke krecu od nule i kopiranje je onemoguceno dok nema sto kopirati.
  await expect(page.locator('#m-words')).toHaveText('0');
  await expect(page.locator('#kt-copy')).toBeDisabled();

  await page.locator('#kt-input').fill('Ovo je kratak test brojaca kartica.');

  // Sest rijeci, deterministicno; jezgra je pokrivena jedinicnim testom, ovdje se dokazuje da je
  // uopce OZICENA na sucelje.
  await expect(page.locator('#m-words')).toHaveText('6');
  await expect(page.locator('#m-chars')).not.toHaveText('0');
  await expect(page.locator('#kt-copy')).toBeEnabled();

  await page.locator('#kt-copy').click();

  // Tri neovisna dokaza ishoda: natpis, `aria-live` status i vizualna potvrda.
  await expect(page.locator('#kt-copy')).toHaveText(/Kopirano/);
  await expect(page.locator('#kt-copy')).toHaveAttribute('data-lekta-ok', '');
  await expect(page.locator('#kt-copy-status')).not.toBeEmpty();
});

test('citat: ispunjena polja daju citat, a gumb se otkljucava', async ({ page }) => {
  await page.goto('/citat.html');

  await page.locator('#f-authors').fill('Ivić, Ivan');
  await page.locator('#f-title').fill('Naslov probnog djela');
  await page.locator('#f-year').fill('2024');

  // Izlaz mora sadrzavati ono sto je upisano; tocan oblik po stilu pokriva `tests/citation.test.ts`.
  await expect(page.locator('#out-intext')).toContainText('Ivić');
  await expect(page.locator('#copyBtn')).toBeEnabled();
});

test('potvrda ishoda se gasi pod reduced-motion', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/kartice.html');
  await page.locator('#kt-input').fill('Proba.');
  await page.locator('#kt-copy').click();

  const anim = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('#kt-copy')!);
    return { name: cs.animationName, durationMs: parseFloat(cs.animationDuration) * 1000 };
  });

  // Pravilo je i dalje pridruzeno (potvrda ostaje kao stanje), ali TRAJANJE mora biti nemjerljivo:
  // globalni prekidac u `motion.css` gasi svaku animaciju, pa ovdje nema vlastite iznimke.
  expect(anim.name).toBe('lekta-outcome-stamp');
  expect(anim.durationMs).toBeLessThan(1);
});

/**
 * ULAZNA KOREOGRAFIJA SMIJE DIRATI SAMO ONO ISPOD ALATA.
 *
 * Ovo je gard protiv tocno onog kvara zbog kojeg je `49849608` ("unify visual system") vracen isti
 * dan: promjena je sakrila sadrzaj iza dodatnog koraka i trebala je POPUSTANJE postojecih tvrdnji
 * da ostane zelena. Reveal skriva element dok ne dodje u vidno polje, pa bi oznaka na alatu ili
 * njegovoj kontroli znacila da alat pri dolasku na stranicu nije ondje.
 *
 * Zato: nijedan `[data-reveal]` ne smije biti unutar `.tool-workspace` niti sadrzavati primarni
 * gumb, a pod reduced-motion sve mora biti vidljivo bez ijednog skrola.
 */
for (const pageSpec of FREE_TOOL_PAGES.filter((p) => p.workspaceSelector)) {
  test(`${pageSpec.name}: reveal ne dira alat ni primarnu akciju`, async ({ page }) => {
    await page.goto(pageSpec.route);
    const bad = await page.evaluate(([ws, primary]) => {
      const offenders: string[] = [];
      for (const el of document.querySelectorAll('[data-reveal]')) {
        if (el.closest(ws as string)) offenders.push('unutar radne plohe');
        if (el.querySelector(primary as string)) offenders.push('sadrzi primarni gumb');
      }
      return offenders;
    }, [pageSpec.workspaceSelector!, pageSpec.primarySelector]);
    expect(bad, `${pageSpec.route}: reveal je zahvatio alat`).toEqual([]);

    // Alat mora biti vidljiv odmah, bez skrolanja.
    await expect(page.locator(pageSpec.primarySelector)).toBeVisible();
  });
}

test('reduced-motion: sve otkriveno bez skrolanja', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/citat.html');
  const opacities = await page.evaluate(() =>
    [...document.querySelectorAll('[data-reveal]')].map((el) => getComputedStyle(el).opacity));
  expect(opacities.length).toBeGreaterThan(0);
  expect(opacities.every((o) => o === '1'), `neotkriveno: ${opacities.join(', ')}`).toBe(true);
});

/**
 * CSS izlaz za reduced-motion mora vrijediti i BEZ pomoci JS-a.
 *
 * `setupReveal()` pod reduced-motion odmah oznaci sve vidljivim, pa se kvar ne vidi dok god boot
 * prodje do kraja. Ali `.reveal-ready` se dodaje pri evaluaciji modula, a `setupReveal()` je tek
 * treci poziv u `boot()`: sve sto pukne izmedju ostavlja sadrzaj trajno nevidljivim.
 *
 * Zato se ovdje umece SVJEZ `[data-reveal]` element NAKON boota. `setupReveal` ga vise nece
 * dotaknuti (vec je odradio prolaz), pa je jedino sto ga moze uciniti vidljivim upravo CSS pravilo.
 * Bez `@media (prefers-reduced-motion: reduce)` bloka u `motion.css` ovaj element ostaje na 0.
 */
test('reduced-motion: skriveno stanje ne ovisi o tome je li setupReveal stigao', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/citat.html');

  const opacity = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.setAttribute('data-reveal', '');
    probe.setAttribute('data-reveal-mode', 'deferred');
    probe.textContent = 'proba';
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).opacity;
    probe.remove();
    return value;
  });

  expect(opacity, 'nov [data-reveal] pod reduced-motion mora biti vidljiv bez JS pomoci').toBe('1');
});
