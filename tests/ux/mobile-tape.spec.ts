import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp, cekajKorak } from './app-ready';
import { cekajMirovanjeSkrola } from './stabilan-skrol';

/**
 * TRAKA NE PREKRIVA KORAKE (mobilni audit 2026-09-28, PR 2).
 *
 * Ukrasna traka lista (`.analyzer-wrap::before`, 150 px na sredini lista) na 360 do 430 px pada na traku koraka:
 * prekriva kraj natpisa "Dokument" i kruzice koraka 2 i 3 (na uskom ekranu vidljiv je samo natpis aktivnog koraka).
 * Izravni signal: mreza tocaka svaka 3 px preko cijelog vidljivog `.rail-step` (kruzic i natpis); u svakoj tocki
 * element na vrhu mora biti sam korak. Traku nosi `.analyzer-wrap`, pa `elementFromPoint` ondje vraca list.
 * Sredisnja tocka natpisa nije dovoljna: na masteru je preklapanje samo uz rub natpisa (izmjereno 2026-10-03).
 */
const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

async function prekriveniKoraci(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const korak of document.querySelectorAll<HTMLElement>('.wizard-rail .rail-step')) {
      const r = korak.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > window.innerHeight) continue;
      let prekriveno = 0;
      let vrh = '';
      for (let x = r.left + 1; x < r.right - 1; x += 3) {
        for (let y = r.top + 1; y < r.bottom - 1; y += 3) {
          const el = document.elementFromPoint(x, y);
          if (el && !korak.contains(el)) { prekriveno += 1; vrh = String((el as HTMLElement).className || el.tagName); }
        }
      }
      if (prekriveno) out.push(`${korak.textContent?.trim()}: ${prekriveno} tocaka (na vrhu: ${vrh})`);
    }
    return out;
  });
}

/**
 * Izracunati okvir same trake (Codex R3 na #286). Pseudoelement nema vlastiti `getBoundingClientRect`, pa se okvir
 * slaze iz izracunatog stila `::before` (polozaj je kod apsolutnog elementa izracunat u px) i okvira lista, uz 2 px
 * zalihe za nagib od 2deg. Traka mora biti vidljiva, unutar ekrana, u desnom kutu lista i ne smije prekrivati gumb
 * nove verzije, znacku "Lokalno" ni status spremanja.
 */
async function trakaProblemi(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const wrap = document.querySelector<HTMLElement>('.analyzer-wrap');
    if (!wrap) return ['nema lista'];
    const w = wrap.getBoundingClientRect();
    const cs = getComputedStyle(wrap, '::before');
    const sirina = parseFloat(cs.width);
    const visina = parseFloat(cs.height);
    if (cs.content === 'none' || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || !(sirina > 0) || !(visina > 0)) {
      return ['traka nije vidljiva'];
    }
    const z = 2;
    const left = w.left + wrap.clientLeft + parseFloat(cs.left) - z;
    const top = w.top + wrap.clientTop + parseFloat(cs.top) - z;
    const right = left + sirina + 2 * z;
    const bottom = top + visina + 2 * z;
    const out: string[] = [];
    if (left < 0 || right > window.innerWidth) out.push(`traka izlazi s ekrana (${Math.round(left)}..${Math.round(right)})`);
    if (left < w.left + w.width / 2 || w.right - right > 40) out.push(`traka nije u desnom kutu lista (${Math.round(left)}..${Math.round(right)}, list ${Math.round(w.left)}..${Math.round(w.right)})`);
    for (const sel of ['#radDocNewVersion', '#radDocMeta .local-badge', '#radDocSave']) {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) out.push(`traka prekriva ${sel}`);
    }
    return out;
  });
}

/** Mutant u stranici: stil se dodaje, mjeri i uklanja, pa isti preglednik dokazuje da mjera grize. */
async function sMutantom<T>(page: Page, css: string, mjeri: () => Promise<T>): Promise<T> {
  const h = await page.addStyleTag({ content: css });
  try { return await mjeri(); } finally { await h.evaluate((el) => el.remove()); }
}

async function traka(page: Page): Promise<void> {
  await page.locator('.wizard-rail').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior }));
  await cekajMirovanjeSkrola(page);
  // Codex R5 na #286: mjerenja tek kad su fontovi stigli.
  await page.evaluate(async () => { await document.fonts.ready; });
  const vidljivi = await page.locator('.wizard-rail .rail-step').evaluateAll((els) =>
    els.filter((e) => e.getBoundingClientRect().width > 0).length);
  expect(vidljivi, 'barem dva koraka moraju biti vidljiva, inace mjera ne dokazuje nista').toBeGreaterThan(1);
}

test('mobitel: ukrasna traka ne prekriva korake', async ({ page }) => {
  const vp = page.viewportSize();
  test.skip(!vp || vp.width > 720, 'mobilni raspored vrijedi do 720 px');
  test.setTimeout(Number(process.env.LEKTA_MOBILE_TIMEOUT_MS ?? 300_000));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/rad/');
  const odbij = page.locator('#analyticsDecline');
  if (await odbij.isVisible().catch(() => false)) await odbij.click();
  await cekajApp(page);
  await page.locator('#fileInput').setInputFiles(fixture);
  await cekajKorak(page, '2');

  for (const sirina of [360, 390, 430]) {
    await page.setViewportSize({ width: sirina, height: 800 });
    await traka(page);
    expect(await prekriveniKoraci(page), `korak 2, ${sirina} px: koraci nisu prekriveni`).toEqual([]);
    expect(await trakaProblemi(page), `korak 2, ${sirina} px: traka je vidljiva u desnom kutu`).toEqual([]);
  }
  // Negativna kontrola (Codex R3): traka odgurnuta s ekrana ostavlja korake slobodne, pa je hvata samo mjera trake.
  const mutant = await sMutantom(page, '@media(max-width:720px){.analyzer-wrap::before{right:500px!important}}', async () => ({
    koraci: await prekriveniKoraci(page),
    traka: await trakaProblemi(page),
  }));
  expect(mutant.koraci, 'kontrola: s trakom izvan ekrana koraci su slobodni').toEqual([]);
  expect(mutant.traka.length, 'kontrola: mutant right:500px rusi mjeru trake').toBeGreaterThan(0);

  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 240_000 });
  await traka(page);
  expect(await prekriveniKoraci(page), 'rezultat, 430 px: koraci nisu prekriveni').toEqual([]);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
  await cekajMirovanjeSkrola(page);
  expect(await trakaProblemi(page), 'rezultat, 430 px: traka ne prekriva gumb, znacku ni status').toEqual([]);
});

/**
 * ZBIJENO ZAGLAVLJE RADNOG PROSTORA (mobilni audit 2026-09-28, PR 2; odluka vlasnika 2026-10-03: zbijen redak).
 * Izmjereno na masteru 2026-10-03, 390 px, rezultat: dokumentov red (`#radDocMeta`) zauzimao je 85 px u dva retka,
 * a list je pocinjao na 174 px. Signali: list pocinje do 156 px, "Spremljeno" i znacka "Lokalno" su u istom retku,
 * gumb nove verzije je dodirljiv u pojasu od 44 px, a stranica nema vodoravni preljev.
 * Codex R1 na #286: prosirena meta gumba ne smije oteti dodir znacki ni statusu. Kad se gumb prelomi u novi redak,
 * gornje prosirenje pada u razmak izmedju redaka, ne na redak iznad. Prijelom se izaziva i u testu. Na 360 i 390 px
 * gumb je i prirodno prelomljen, pa razmak od 8 px pomice list sa 146 na 154 px (izmjereno 2026-10-04); prag je
 * zato 156 px, i dalje 20 px manje nego na masteru.
 */
async function oteteTocke(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const sel of ['#radDocSave', '#radDocMeta .local-badge']) {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      for (const y of [r.top + 1, r.bottom - 1]) {
        for (let x = r.left + 2; x < r.right - 2; x += 4) {
          const e = document.elementFromPoint(x, y);
          if (!e || !e.closest(sel)) { out.push(`${sel} (${Math.round(x)},${Math.round(y)}): na vrhu ${e ? e.id || String(e.className) || e.tagName : 'nista'}`); break; }
        }
      }
    }
    return out;
  });
}

async function pogodciGumba(page: Page): Promise<boolean[]> {
  return page.evaluate(() => {
    const b = document.querySelector('#radDocNewVersion')!.getBoundingClientRect();
    const c = b.top + b.height / 2;
    return [-21.5, -15, 0, 15, 21.5].map((d) => {
      const e = document.elementFromPoint(b.left + 20, c + d);
      return !!e && !!e.closest('#radDocNewVersion');
    });
  });
}
for (const sirina of [360, 390, 430]) {
  test(`mobitel ${sirina} px: dokumentov red je zbijen, gumb nove verzije je meta od 44 px`, async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-chromium', 'viewport se postavlja izravno; jedan mobilni projekt je dovoljan');
    test.setTimeout(Number(process.env.LEKTA_MOBILE_TIMEOUT_MS ?? 300_000));
    await page.setViewportSize({ width: sirina, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/rad/');
    const odbij = page.locator('#analyticsDecline');
    if (await odbij.isVisible().catch(() => false)) await odbij.click();
    await cekajApp(page);
    await page.locator('#fileInput').setInputFiles(fixture);
    await cekajKorak(page, '2');
    await potvrdiProfil(page);
    await expect(page.locator('#resultView')).toBeVisible({ timeout: 240_000 });
    await expect(page.locator('#radDocSave')).toBeVisible();
    await expect(page.locator('#radDocNewVersion')).toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
    await cekajMirovanjeSkrola(page);
    await page.evaluate(async () => { await document.fonts.ready; });

    const m = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      return {
        list: r('.analyzer-wrap').top,
        isti: Math.abs(r('#radDocSave').top - r('#radDocMeta .local-badge').top) < 6,
        sw: document.documentElement.scrollWidth,
      };
    });
    const pogodci = await pogodciGumba(page);
    expect(await oteteTocke(page), 'znacka i status primaju vlastiti dodir').toEqual([]);

    // Prijelom: gumb u vlastitom retku ispod znacke. Meta ostaje 44 px, a znacka i status i dalje svoji.
    const prelom = '#radDocMeta .rad-doc-new-version{flex-basis:100%}';
    const prelomljen = await sMutantom(page, prelom, async () => ({
      ispod: await page.evaluate(() => document.querySelector('#radDocNewVersion')!.getBoundingClientRect().top
        >= document.querySelector('#radDocMeta .local-badge')!.getBoundingClientRect().bottom),
      otete: await oteteTocke(page),
      pogodci: await pogodciGumba(page),
    }));
    expect(prelomljen.ispod, 'prijelom: gumb je u retku ispod znacke').toBe(true);
    expect(prelomljen.otete, 'prijelom: prosirena meta ne otima dodir znacki ni statusu').toEqual([]);
    expect(prelomljen.pogodci, 'prijelom: gumb je i dalje meta od 44 px').toEqual([true, true, true, true, true]);
    // Negativna kontrola: bez razmaka izmedju redaka gornje prosirenje pada na znacku i mjera mora pasti.
    const bezRazmaka = await sMutantom(page, `${prelom}#radDocMeta.rad-doc-meta{row-gap:0!important}`, () => oteteTocke(page));
    expect(bezRazmaka.length, 'kontrola: bez razmaka redaka meta otima dodir znacki').toBeGreaterThan(0);
    expect(m.list, 'list pocinje unutar 156 px od vrha').toBeLessThan(156);
    expect(m.isti, '"Spremljeno" i znacka "Lokalno" u istom retku').toBe(true);
    expect(pogodci, 'gumb nove verzije pogodjen u pojasu od 44 px').toEqual([true, true, true, true, true]);
    expect(m.sw, 'stranica nema vodoravni preljev').toBeLessThanOrEqual(sirina);
  });
}
