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

      // ANIMACIJE SE GASE PRIJE MJERENJA, inace gate nije determinističan. Izmjereno 2026-09-01:
      // `.ks-priv-dokp b` je `#2B579A` na bijelom (uredno), ali element FADEA (`ksPrivCross`), pa
      // axe zna uhvatiti kadar u kojem je boja izracunata kao `#dcdede` na `#f8f5eb`, dakle 1,23:1.
      // Isti test je u jednom prolazu bio zelen, a u sljedecem crven, bez ijedne izmjene koda.
      // Gasenjem animacija mjeri se MIRNO stanje, koje je ujedno ono sto vidi korisnik s
      // `prefers-reduced-motion`. Stvarna krsenja u mirnom stanju i dalje padaju.
      await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
      await page.waitForTimeout(120);

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

  // `data-lekta-ok` je PROLAZNO stanje: `tool-ui.ts` ga postavi pa ukloni nakon 1600 ms. Citanje
  // odmah nakon klika je zato utrka izmedju dva procesa: dok Playwright posalje `evaluate` i dobije
  // odgovor, prozor moze isteci i `animationName` vrati `none`. Izmjereno 2026-09-06: test je pao u
  // punom `release:check` prolazu na opterecenom stroju, a u izolaciji prolazi 6/6, dakle mjerio je
  // opterecenje a ne ponasanje.
  //
  // `waitForFunction` ceka atribut i cita stil U ISTOM TIKU unutar stranice, pa obilaska nema.
  const anim = await page.waitForFunction(() => {
    const el = document.querySelector('#kt-copy');
    if (!el || !el.hasAttribute('data-lekta-ok')) return null;
    const cs = getComputedStyle(el);
    return { name: cs.animationName, durationMs: parseFloat(cs.animationDuration) * 1000 };
  }).then((handle) => handle.jsonValue() as Promise<{ name: string; durationMs: number }>);

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
  { ruta: '/rad/', vidljiva: '#consentBanner:not(.hidden)', traka: '#consentBanner', odbij: '#analyticsDecline' },
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
/**
 * Traka o privoli je na mobitelu KRALA dodir na primarni CTA lijevka (klik je istjecao nakon 4 s).
 * Isti kvar je bio zapisan kao otvoren u `playwright.config.ts`, zbog njega `roadmap-v2.spec.ts`
 * stoji u `testIgnore`, ali mu uzrok dotad nije bio izmjeren.
 *
 * UZROK: sticky navigacija je `fixed` UNUTAR `.analyzer-wrap`, koji ima `transform` i time joj je
 * containing block, pa PUTUJE s dokumentom i njezin pojas presijeca cijeli viewport. Dva `fixed`
 * sloja se zato ne mogu razmaknuti nikakvim pozicioniranjem, i to je izmjereno dvaput: odmak uz dno
 * bio je cist samo oko jedne visine, a vezanje trake uz vrh je pokrilo `.topbar` (dakle
 * `#mobileMenuBtn`, JEDINU navigaciju ispod 720 px) i samo preselilo kradju na skrolane polozaje.
 *
 * Rjesenje je gasenje jednog sloja: dok traka stoji, navigacija se vraca U TOK.
 *
 * STO SE OVDJE TVRDI, a sto ne: ne tvrdi se da CTA nikad nije prekriven. U toku, na niskim
 * zaslonima, pri vrhu stranice traka moze lezati preko njega. Tvrdi se ono sto je stvarna steta
 * bila: da navigacija nije suparnicki `fixed` sloj, da traka NIKAD ne krade `.topbar`, i da je CTA
 * DOSTIZAN skrolanjem. `page.click` se namjerno NE koristi kao dokaz: Playwright prije klika sam
 * doskrola element, pa prolazi i kad je zaklonjen, dakle ne bi grizao.
 */
for (const [sirina, visina] of [[360, 667], [393, 727], [393, 900], [430, 844]] as const) {
  test(`traka o privoli ne blokira navigaciju ni CTA (mobitel ${sirina}x${visina})`, async ({ page }) => {
    await page.setViewportSize({ width: sirina, height: visina });
    await page.goto('/rad/');
    await page.waitForSelector('#consentBanner:not(.hidden)');
    // STVARNA datoteka, ne podmetnuta klasa: `has-file` ne prikazuje `#selectedFile` ni ne skriva
    // `#dropEmpty`, pa daje raspored koji nijedan korisnik ne vidi (izmjereno: preklop 0 umjesto 70 px).
    await page.setInputFiles('#fileInput', 'tests/fixtures/docx/fer-diplomski-puna-struktura.docx');
    await page.waitForSelector('.lek-stepnav-1 .btn', { state: 'visible' });
    await page.waitForTimeout(300);

    const mjere: Array<{ sy: number; navPos: string; cta: string; meni: string; tema: string }> = [];
    for (const sy of [0, 150, 300, 450, 600, 900]) {
      await page.evaluate((y) => window.scrollTo(0, y), sy);
      await page.waitForTimeout(120);
      mjere.push(await page.evaluate((y) => {
        const nav = document.querySelector('.lek-stepnav-1');
        const pogodak = (el: Element | null) => {
          if (!el) return 'nema';
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) return 'izvan';
          const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return e ? (e.closest('#consentBanner') ? 'traka' : 'ok') : 'null';
        };
        return {
          sy: y,
          navPos: nav ? getComputedStyle(nav).position : 'nema',
          cta: pogodak(nav?.querySelector('.btn') ?? null),
          meni: pogodak(document.querySelector('#mobileMenuBtn')),
          tema: pogodak(document.querySelector('#themeBtn')),
        };
      }, sy));
    }

    // Netrivijalnost: stanje se mora stvarno uspostaviti, inace sve tvrdnje ispod prolaze prazno.
    expect(mjere.length).toBe(6);
    expect(mjere.every((m) => m.navPos !== 'nema'), 'sticky navigacija mora postojati').toBe(true);

    // MEHANIZAM: dok traka stoji, navigacija NE SMIJE biti suparnicki `fixed` sloj.
    expect(mjere.map((m) => m.navPos).filter((v, i, a) => a.indexOf(v) === i))
      .toEqual(['static']);

    // Traka nikad ne smije ukrasti `.topbar`: ispod 720 px je `#mobileMenuBtn` jedina navigacija.
    const ukradenaNav = mjere.filter((m) => m.meni === 'traka' || m.tema === 'traka');
    expect(ukradenaNav, `traka krade navigaciju na ${JSON.stringify(ukradenaNav)}`).toEqual([]);

    // CTA mora biti DOSTIZAN: barem jedan polozaj skrola na kojem ga nista ne zaklanja.
    const dostizan = mjere.filter((m) => m.cta === 'ok');
    expect(dostizan.length, `CTA nedostizan na svim polozajima: ${JSON.stringify(mjere)}`)
      .toBeGreaterThan(0);
  });
}

/**
 * `/404.html` NIJE u `FREE_TOOL_PAGES` i nikad nije bila skenirana, a imala je 6 `serious`
 * nalaza kontrasta. Uzrok je token koji se okrece s temom nad podlogom koja se NE okrece: u temi
 * "korektorski stol" panel ostaje svijetli papir (#F7F3E8) dok `--brand` prelazi na #E4573D,
 * boju za TAMNU podlogu, sto daje 3,3:1 pri 14,7 px.
 *
 * Mjere se SVA TRI stanja teme, jer stranica ima tri odvojena bloka tokena i kvar je bio samo u
 * trecem: zadano svijetlo, `prefers-color-scheme: dark`, i izricit `data-theme="dark"`. Skeniranje
 * samo zatecenog stanja bi ga promasilo, sto je i bio razlog zasto je prezivio.
 */
for (const [ime, dataTheme, scheme] of [
  ['zadano', null, 'light'],
  ['prefers-color-scheme dark', null, 'dark'],
  ['data-theme dark', 'dark', 'light'],
] as const) {
  test(`404: nema critical, serious ni moderate a11y krsenja (${ime})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/404.html');
    if (dataTheme) await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), dataTheme);

    const results = await new AxeBuilder({ page }).analyze();
    // Netrivijalnost: axe mora stvarno imati sto mjeriti na ovoj stranici.
    expect(results.passes.length, 'axe mora imati ijedno zadovoljeno pravilo').toBeGreaterThan(0);
    const nalazi = results.violations.filter((v) =>
      v.impact === 'critical' || v.impact === 'serious' || v.impact === 'moderate');
    expect(nalazi, nalazi.map((v) => `${v.impact}:${v.id}(${v.nodes.length})`).join(', ')).toEqual([]);
  });
}

/**
 * MJERENJE IZA SLIJEPE TOCKE AXEA.
 *
 * `body` na naslovnici nosi ukrasnu `radial-gradient` teksturu papira. axe za svaki element nad
 * gradijentom vraca `incomplete` (`messageKey: bgGradient`), NE `violation`, jer efektivnu podlogu
 * ne moze razrijesiti. Posljedica je bila da obicni axe prolaz u svijetloj temi mjeri samo POLOVICU
 * stranice: 163 `incomplete` naspram 163 `pass`, dakle 50 % cvorova nikad nije provjereno, a
 * tvrdnja "nula krsenja" bila je istinita kako je mjerena i istovremeno poluslijepa.
 *
 * Izmjereno 2026-09-01: kad se tekstura neutralizira, axe odjednom vidi 23 STVARNA kontrastna
 * krsenja u svijetloj temi (svijetli `--desk-faint` 2,2:1, `--pass` 3,51:1, brand `--red` ondje
 * gdje ide `--red-on-desk`, i prigusenje `.85` koje svaki token spusti ispod praga). Sva su
 * popravljena; ovaj gard postoji da se ne vrate neprimijeceno.
 *
 * OGRANICENJE, izricito: mjeri se protiv OSNOVNE boje teksture, ne protiv njezinih najtamnijih
 * tocaka. Tockice su `rgba(69,58,45,.14)` nad `#DFD8C6`, pa lokalno mogu potamniti podlogu do
 * `#C9C2B1`; tekst tocno na tocki bio bi do ~0,9 omjera losiji. Kontrast nad teksturom je i u
 * WCAG-u dvosmislen (zato axe i odustaje), pa ovaj gard NE tvrdi da ga pokriva.
 */
/**
 * REZ NASLOVNICE (2026-09-05): `/` je cisti ulaz (35 axe cvorova), a stara naslovnica sa svim
 * sadrzajem je sada `/rad/` (118 cvorova). Gard zato mjeri OBJE stranice, svaku sa vlastitim
 * pragom netrivijalnosti izmjerenim na dan reza; jedan prag za obje bio bi ili nedostizan za ulaz
 * ili vakuumski za radnu povrsinu.
 */
const KONTRAST_STRANICE = [
  { ruta: '/rad/', prag: 90 },        // izmjereno 118 neutralizirano; tekstura u svijetloj temi ~65
  { ruta: '/index.html', prag: 25 },  // izmjereno 35 i s teksturom i bez nje: ulaz nema teksta preko teksture,
                                      // pa je prag ovdje samo provjera da stranica nije ostala prazna
] as const;
for (const { ruta, prag } of KONTRAST_STRANICE) for (const tema of ['light', 'dark'] as const) {
  test(`${ruta}: iza gradijenta nema skrivenih kontrastnih krsenja (tema ${tema})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(ruta);
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);
    // Neutralizacija teksture je JEDINI nacin da axe uopce izmjeri ove cvorove.
    await page.addStyleTag({ content: 'body{background-image:none!important}' });
    await page.waitForTimeout(300);

    const r = await new AxeBuilder({ page }).analyze();
    const mjereno = r.passes.filter((x) => x.id === 'color-contrast')
      .reduce((a, x) => a + x.nodes.length, 0);
    // NETRIVIJALNOST: bez ovoga bi gard prosao i da tekstura ostane, kad axe ne mjeri gotovo nista.
    //
    // PRAG PREKALIBRIRAN 2026-09-04, jer je stranica legitimno postala manja: `/` je izgubilo deset
    // landing sekcija (85 -> 52,5 KB), koje sada zive na `/saznaj-vise/`. Stari prag (220) bio je
    // kalibriran na stari landing i postao je NEDOSTIZAN, pa je gard padao bez ijednog kontrastnog
    // krsenja. To nije regresija pristupacnosti nego gard cija je pretpostavka istekla.
    //
    // Izmjereno na novoj stranici (chromium, 1440x1000), oba stanja:
    //
    //     tema    s teksturom   neutralizirano   krsenja
    //     light        65            102            0
    //     dark        102            102            0
    //
    // Prag 90 razdvaja tocno ono zbog cega gard postoji: u svijetloj temi neneutralizirana tekstura
    // daje 65, a neutralizirana 102. U TAMNOJ temi tekstura axe uopce ne ometa (102 u oba stanja),
    // pa ondje prag radi samo kao provjera da stranica nije ostala prazna.
    expect(mjereno, `axe mora izmjeriti bitno vise cvorova nego s teksturom (${mjereno})`)
      .toBeGreaterThan(prag);

    const nalazi = r.violations.filter((v) => v.id === 'color-contrast');
    const opis = nalazi.flatMap((v) => v.nodes.map((n) =>
      (n.failureSummary || '').replace(/\s+/g, ' ').match(/contrast of [\d.]+[^)]*\)/)?.[0] ?? n.target.join(' ')));
    expect(opis, opis.slice(0, 6).join(' | ')).toEqual([]);
  });
}
