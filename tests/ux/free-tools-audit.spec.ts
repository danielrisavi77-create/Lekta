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

  /**
   * Prag je 2026-08-31 spusten sa `serious` na `moderate` i prosiren na OBJE teme.
   *
   * Oboje je moglo tek nakon mjerenja: dotad je `index.html` imao 19 `serious` nalaza (sitni
   * natpisi u prikazu "korektorskog stola", najgori 1,35:1), a mjerila se samo zatecena tema, pa
   * je citava svijetla polovica palete bila NEPROVJERENA. Nakon popravka tokena je zbroj po svih
   * 10 stranica i obje teme NULA, pa ratchet nije potreban: prag je izravno 0.
   *
   * Tema se postavlja atributom jer je to isti prekidac koji koristi proizvod; `prefers-color-scheme`
   * bi mjerio put koji korisnikov odabir teme nadglasa.
   */
  for (const tema of ['dark', 'light'] as const) {
    test(`${pageSpec.name}: nema critical, serious ni moderate a11y kršenja (tema ${tema})`, async ({ page }, testInfo) => {
      // Ovaj skup tvrdo postavlja SIROK viewport, pa bi ga mobilni projekt vrtio s IDENTICNIM
      // mjerenjem: 20 prolaza umjesto 10, bez ijedne nove informacije. Mobilna a11y je zaseban i
      // JOS NEZATVOREN posao (izmjereno na 375x667: `label` na `#fileInput`, `nested-interactive`
      // na `#dropzone`, `heading-order`, i kontrast u demo prikazu), pa se ne smije predstaviti
      // kao pokrivena ovim testom. Zabiljezeno, ne presuceno.
      // POZITIVAN oblik: gasi se tocno MOBILNI projekt. Negativan (`name !== 'chromium'`) bi pri
      // preimenovanju projekta ili dodavanju firefoxa/webkita tiho ugasio SVE i ostavio zelen
      // prazan run.
      testInfo.skip(!!testInfo.project.use.isMobile, 'mjeri se samo na sirokom viewportu');
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(pageSpec.route);
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);

      // Tema se mora POTVRDITI, ne pretpostaviti: `ui-boot.ts` postavlja `data-theme` samo kad ga
      // nema, pa bi buduca promjena tog uvjeta tiho vratila mjerenje na jednu temu, a tvrdnja bi i
      // dalje glasila "obje".
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(tema);

      const results = await new AxeBuilder({ page }).analyze();
      // Netrivijalnost: axe mora stvarno biti pokrenut nad stranicom s pravilima, inace bi
      // prazan `violations` prosao i nad praznim dokumentom.
      expect(results.passes.length, 'axe mora imati ijedno zadovoljeno pravilo').toBeGreaterThan(0);

      const nalazi = results.violations.filter((violation) =>
        violation.impact === 'critical' || violation.impact === 'serious' || violation.impact === 'moderate',
      );
      expect(
        nalazi,
        nalazi.map((v) => `${v.impact}:${v.id}(${v.nodes.length})`).join(', '),
      ).toEqual([]);
    });
  }
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

    // Nestao FAQ blok je PAD, ne preskok: sve stranice ga danas imaju, pa bi `skip` pretvorio
    // uklonjenu afordanciju u tihu sutnju umjesto u nalaz.
    expect(ratio, `${pageSpec.route} nema .faq details summary`).not.toBeNull();
    expect(ratio!, `kontrast "+" na ${pageSpec.route}`).toBeGreaterThanOrEqual(4.5);
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
      const cs = getComputedStyle(el);
      const fg = parse(cs.color);
      // Prigusenje moze doci iz alfe U BOJI ili iz `opacity` ELEMENTA. Nadnaslov koristi ovo
      // drugo (`color: inherit; opacity: .72`), pa je mjerenje bez ovoga slijepo za mehanizam
      // koji popravak zapravo koristi: pokazivalo bi 14,27 umjesto 8,03, i jednako 14,27 da
      // netko spusti opacity na 0,25 (stvarnih 2,18).
      fg.a *= parseFloat(cs.opacity || '1');
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
  // Gornja granica ide na SVA TRI: `ratio(null)` vraca 99, pa bi preimenovan selektor inace
  // prosao tvrdnju. Prva verzija je to imala samo na naslovu, dakle bas nadnaslov (element zbog
  // kojeg ovaj gard postoji) ostao je pokriven sentinelom.
  for (const [ime, vrijednost] of Object.entries(ratios!)) {
    expect(vrijednost, `${ime} hero kartice (${tema}) - element nedostaje?`).toBeLessThan(99);
    expect(vrijednost, `${ime} hero kartice (${tema})`).toBeGreaterThanOrEqual(4.5);
  }
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

/**
 * Zateceni maksimumi na 375x667 za stranice koje pregib jos ne stignu. Smiju samo padati.
 *
 * `/alati.html` je MAKNUT s popisa 2026-08-31: skrivanjem signalne kartice na uskom zaslonu (koja
 * je doslovno ponavljala hero uvod) prva kartica alata je s 848 px pala na 609 px, dakle drzi
 * pregib i vise joj ratchet ne treba.
 *
 * `/literatura.html` OSTAJE, i to je svjesna odluka a ne propust: njezin uvod nosi pet recenica
 * podataka kojih drugdje na stranici nema, pa bi skracivanje micalo informaciju, a ne ponavljanje.
 * 698 px pri pregibu od 667 je jedan kratak pokret prsta.
 */
const RATCHET_375: Record<string, number> = { '/literatura.html': 700 };

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
      const all = document.querySelectorAll('[data-reveal]');
      for (const el of all) {
        if (el.closest(ws as string)) offenders.push('unutar radne plohe');
        if (el.querySelector(primary as string)) offenders.push('sadrzi primarni gumb');
      }
      return { offenders, ukupno: all.length };
    }, [pageSpec.workspaceSelector!, pageSpec.primarySelector]);
    expect(bad.offenders, `${pageSpec.route}: reveal je zahvatio alat`).toEqual([]);
    // Bez ovoga tvrdnja prolazi VAKUUMSKI kad `[data-reveal]` uopce nema: prazan skup nema
    // prekrsitelja, pa bi potpuno vracanje znacajke izgledalo kao uredan prolaz.
    expect(bad.ukupno, `${pageSpec.route}: nijedan [data-reveal], gard nema sto cuvati`).toBeGreaterThan(0);

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

  const rezultat = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.setAttribute('data-reveal', '');
    probe.setAttribute('data-reveal-mode', 'deferred');
    probe.textContent = 'proba';
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).opacity;
    probe.remove();
    return { opacity: value, revealReady: document.documentElement.classList.contains('reveal-ready') };
  });

  // Bez ove tvrdnje mjerenje je dvosmisleno: `1` znaci i "pravilo za reduced-motion radi" i
  // "`.reveal-ready` uopce nema pa skriveno stanje ne vrijedi". Tek uz nju proba mjeri pravilo.
  expect(rezultat.revealReady, '.reveal-ready nije postavljen, proba ne bi nista dokazala').toBe(true);
  expect(rezultat.opacity, 'nov [data-reveal] pod reduced-motion mora biti vidljiv bez JS pomoci').toBe('1');
});

/**
 * Traka o privoli je `position: fixed` uz dno i visoka je 125 px na mobitelu. Do 2026-08-31 `body`
 * NIJE imao rezerviran prostor ispod nje, pa je sadrzaj na dnu stranice stajao POD trakom sve dok
 * korisnik ne odluci o privoli. Izmjereno na `/citat.html` pri 375x667: zadnja poveznica podnozja
 * zavrsava na 647 px, a traka pocinje na 524 px, dakle poveznica se ne moze ni vidjeti ni kliknuti.
 *
 * To potkopava upravo rad na pregibu iznad: prva KONTROLA jest iznad pregiba, ali je primarna
 * RADNJA na dnu i dalje zaklonjena kad se do nje dodje.
 *
 * Mjeri se pogodkom (`elementFromPoint`), ne samo geometrijom: geometrija ne bi vidjela da traka
 * hvata dodir preko `z-index`a, a upravo je taj oblik kvara vec potvrdjen na `index.html`.
 *
 * NAPOMENA O MJERENJU: padding se mora postaviti PRIJE skrolanja i pustiti da se izvede raspored.
 * Postavljanje i skrolanje u istom `evaluate` mjeri stari `scrollHeight`, pa stranica ne stigne do
 * dna i tvrdnja lazno padne.
 */
/**
 * Dvije NEZAVISNE implementacije trake, pa se obje mjere:
 *  - alati dobivaju `.lekta-consent-banner` iz `tool-analytics.ts`;
 *  - naslovnica ima VLASTITU `#consentBanner`, pisanu rucno u `index.html`.
 * Prvi popravak je pokrio samo alate, pa je najvaznija stranica ostala zaklonjena; zato par.
 *
 * Mjere se i OBA praga: ispod 720 px vrijedi mobilna rezerva, iznad desktopska. Bez sirokog
 * viewporta bi se desktopska grana mogla obrisati a suite bi ostao zelen.
 */
const TRAKE = [
  { ruta: '/citat.html', vidljiva: '.lekta-consent-banner.is-visible', traka: '.lekta-consent-banner', odbij: '.lekta-consent-banner [data-consent="deny"]' },
  { ruta: '/index.html', vidljiva: '#consentBanner:not(.hidden)', traka: '#consentBanner', odbij: '#analyticsDecline' },
];
const SIRINE = [
  { ime: 'usko 375x667', width: 375, height: 667 },
  { ime: 'siroko 1440x900', width: 1440, height: 900 },
];

for (const t of TRAKE) {
  for (const v of SIRINE) {
    test(`traka o privoli ne zaklanja dno stranice (${t.ruta}, ${v.ime})`, async ({ page }) => {
      await page.setViewportSize({ width: v.width, height: v.height });
      await page.goto(t.ruta);
      await page.waitForSelector(t.vidljiva);

      // Stranica skrola GLATKO, pa jedan `scrollTo` ne stigne do dna (izmjereno: 3433 od 4683 px).
      // Skrola se dok se polozaj ne umiri, inace tvrdnja mjeri sredinu stranice i lazno padne.
      let zadnjiY = -1;
      for (let i = 0; i < 14; i++) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(250);
        const sad = await page.evaluate(() => Math.round(window.scrollY));
        if (sad === zadnjiY) break;
        zadnjiY = sad;
      }
      const naDnu = await page.evaluate(() => {
        const de = document.documentElement;
        return Math.round(window.scrollY) >= Math.round(de.scrollHeight - de.clientHeight) - 2;
      });
      expect(naDnu, 'mjerenje mora doci do dna stranice').toBe(true);

      const m = await page.evaluate((sel) => {
        const banner = document.querySelector(sel)!.getBoundingClientRect();
        const linkovi = [...document.querySelectorAll('footer a')];
        const zadnji = linkovi[linkovi.length - 1].getBoundingClientRect();
        const pogodak = document.elementFromPoint(zadnji.left + zadnji.width / 2, zadnji.top + zadnji.height / 2);
        return {
          rezerva: parseFloat(getComputedStyle(document.body).paddingBottom),
          visinaTrake: Math.round(banner.height),
          odmakOdDna: Math.round(window.innerHeight - banner.bottom),
          zaklonjena: Math.round(zadnji.bottom) > Math.round(banner.top),
          // `!!pogodak?.closest(...)` je za `null` davao `false`, dakle tvrdnja bi prosla i kad
          // pogodak ne bi bio NISTA (poveznica izvan vidnog polja). Zato ishod od tri stanja.
          pogodakNad: !pogodak ? 'nista'
            : (pogodak.closest(sel) ? 'traka' : (pogodak.closest('footer a') ? 'poveznica' : pogodak.tagName)),
          brojLinkova: linkovi.length,
        };
      }, t.traka);

      // Netrivijalnost: bez podnozja i bez vidljive trake tvrdnje ispod prolaze vakuumski.
      expect(m.brojLinkova, 'podnozje mora imati poveznice').toBeGreaterThan(0);
      expect(m.visinaTrake, 'traka mora biti vidljiva').toBeGreaterThan(40);

      // Traka ima i vlastiti odmak od dna (`bottom:18px`), pa rezerva mora pokriti oboje.
      expect(m.rezerva, 'rezerva mora pokriti visinu trake i njezin odmak od dna')
        .toBeGreaterThanOrEqual(m.visinaTrake + m.odmakOdDna);
      expect(m.zaklonjena, 'zadnja poveznica podnozja zalazi pod traku').toBe(false);
      expect(m.pogodakNad, 'na mjestu zadnje poveznice mora biti bas ona').toBe('poveznica');
    });
  }
}

for (const t of TRAKE) {
  test(`rezerva za traku nestaje kad je privola rijesena (${t.ruta})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(t.ruta);
    await page.waitForSelector(t.vidljiva);
    const prije = await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom));
    expect(prije, 'rezerva mora postojati dok traka stoji').toBeGreaterThan(0);

    await page.click(t.odbij);
    await page.waitForTimeout(400);
    const poslije = await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom));
    expect(poslije, 'rezerva mora nestati nakon odluke').toBe(0);
  });
}

/**
 * Traka o privoli je na mobitelu KRALA dodir na primarni CTA lijevka.
 *
 * Izmjereno (Pixel 5, `#wizardView[data-step="1"]` uz odabran dokument): traka je `fixed`
 * `z-index:240`, sticky navigacija `fixed` `z-index:80`, pa je `elementFromPoint` nad gumbom
 * "Nastavi na profil" vracao TRAKU, a `page.click` je istjecao nakon 4 s. Isti kvar je vec bio
 * zapisan kao otvoren u `playwright.config.ts` (zbog njega je `roadmap-v2.spec.ts` pod mobilnim
 * projektom u `testIgnore`), samo mu uzrok dotad nije bio izmjeren.
 *
 * REZERVA GA NE RJESAVA i to je bila prva pogresna pretpostavka: `padding` ne razdvaja dva `fixed`
 * sloja. Uz to je specificnije wizard pravilo (2,2,1) gasilo rezervu trake (0,2,1) bez obzira na
 * redoslijed. Traka se zato PODIZE iznad navigacije.
 *
 * Odmak je konstanta, jer se sticky navigacija pozicionira unutar pretka koji joj je containing
 * block (njezin `bottom:0` pada na 665 px pri viewportu od 727 px), pa se ne moze izvesti iz
 * viewporta. Bas zato tvrdnja mjeri PREKLOP i POGODAK, ne sam broj: ako konstanta odluta, gard
 * padne.
 */
for (const visina of [667, 727, 900]) {
  test(`traka o privoli ne krade dodir na primarni CTA (mobitel, 393x${visina})`, async ({ page }) => {
    await page.setViewportSize({ width: 393, height: visina });
    await page.goto('/index.html');
    await page.waitForSelector('#consentBanner:not(.hidden)');
    // STVARNA datoteka, ne podmetnuta klasa. Prva verzija ovog testa dodavala je `has-file` rukom,
    // a ta klasa NE prikazuje `#selectedFile` ni ne skriva `#dropEmpty`, pa je analizator bio druge
    // visine i test je mjerio raspored koji nijedan korisnik ne vidi: uz pravu datoteku preklop je
    // bio 70 px, uz podmetnutu klasu nula. To je razred "generator ulaza je i sam neprovjeren".
    await page.setInputFiles('#fileInput', 'tests/fixtures/docx/fer-diplomski-puna-struktura.docx');
    await page.waitForSelector('.lek-stepnav-1 .btn', { state: 'visible' });
    await page.waitForTimeout(400);

    const m = await page.evaluate(() => {
      const ban = document.querySelector('#consentBanner')!.getBoundingClientRect();
      const nav = document.querySelector('.lek-stepnav-1')!;
      const navR = nav.getBoundingClientRect();
      const btn = nav.querySelector('.btn')!.getBoundingClientRect();
      const pogodak = document.elementFromPoint(btn.left + btn.width / 2, btn.top + btn.height / 2);
      return {
        visinaTrake: Math.round(ban.height),
        visinaGumba: Math.round(btn.height),
        navPolozaj: getComputedStyle(nav).position,
        // Pozitivno = slojevi se preklapaju.
        preklop: Math.round(Math.min(ban.bottom, navR.bottom) - Math.max(ban.top, navR.top)),
        trakaIznadRuba: Math.round(ban.top) < 0,
        trakaNaGumbu: !!pogodak?.closest('#consentBanner'),
      };
    });

    // Netrivijalnost: oba sloja moraju postojati i stanje se mora stvarno uspostaviti.
    expect(m.visinaTrake, 'traka mora biti vidljiva').toBeGreaterThan(40);
    expect(m.visinaGumba, 'sticky CTA mora biti vidljiv').toBeGreaterThan(20);
    expect(m.navPolozaj, 'sticky navigacija mora stvarno biti fixed').toBe('fixed');

    expect(m.preklop, 'traka se preklapa sa sticky navigacijom').toBeLessThanOrEqual(0);
    expect(m.trakaIznadRuba, 'traka je odletjela iznad gornjeg ruba').toBe(false);
    expect(m.trakaNaGumbu, 'traka presrece dodir nad CTA').toBe(false);
  });
}
