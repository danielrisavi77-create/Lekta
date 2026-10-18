import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp } from './app-ready';

/**
 * FAKSIMIL: SVE U JEDNOM (ALIGNMENT Z35) na `/rad/` s pravim .docx-om, otvoren s presude Z34.
 * Mjeri ono sto model ne moze: raspored na 360, 768, 1180 i 1440 px (Z37 ima prednost), da kartica
 * nalaza i kartica objasnjenja ne prekrivaju stranicu, da se povecalo ne pojavljuje nad marginom, da
 * je na dodiru (`hover: none`) sve sto se otvara misem otvoreno dodirom i da su mete barem 44 px,
 * da pecat pada tek kad su prekrizeni svi nalazi i da smanjen pokret nista ne mice.
 * Snimke idu u `LEKTA_Z35_SNIMKE` ako je zadan, inace u izlaz testa.
 */
const FIXTURE = path.resolve('tests/fixtures/docx/lo-fpzg-zavrsni-neuskladjen.docx');
const SIRINE = [360, 768, 1180, 1440] as const;

function snimka(info: TestInfo, ime: string): string {
  const dir = process.env.LEKTA_Z35_SNIMKE;
  if (!dir) return info.outputPath(`${ime}.png`);
  mkdirSync(dir, { recursive: true });
  return path.join(dir, `${info.project.name}-${ime}.png`);
}

async function doFaksimila(page: Page, opcije: { tema?: 'light' | 'dark'; tiho?: boolean } = {}): Promise<Locator> {
  if (opcije.tiho !== false) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((t) => {
    try { if (t) localStorage.setItem('lekta.theme', t); } catch { /* privatni prozor */ }
  }, opcije.tema ?? null);
  await page.goto('/rad/');
  await cekajApp(page);
  await page.locator('#analyticsDecline').click({ timeout: 3_000 }).catch(() => {});
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('#resultCockpit')).toHaveAttribute('data-rl-ready', 'true', { timeout: 30_000 });
  const ulaz = page.locator('[data-rl-fax]');
  await ulaz.scrollIntoViewIfNeeded();
  await ulaz.click();
  const fl = page.locator('[data-fl]');
  await expect(fl).toHaveAttribute('data-fl-ready', 'true', { timeout: 30_000 });
  return fl;
}

interface Kutija { x: number; y: number; w: number; h: number }
const sijeku = (a: Kutija, b: Kutija): boolean =>
  a.w > 0 && a.h > 0 && b.w > 0 && b.h > 0 && a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

async function kutija(l: Locator): Promise<Kutija> {
  return l.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
}

/** Raspored jedne sirine: Z37 (biljeske popis ispod 900 px), kartica uz stranicu i sticky od 1180 px. */
async function provjeriRaspored(page: Page, fl: Locator, sirina: number): Promise<void> {
  await page.setViewportSize({ width: sirina, height: sirina < 600 ? 780 : 900 });
  await page.waitForTimeout(150);
  const stranica = fl.locator('[data-fl-page]');
  const kartica = fl.locator('[data-fl-card]');
  await expect(stranica).toBeVisible();
  await expect(kartica).toBeVisible();
  // Nema vodoravnog skrola sloja.
  const prelijeva = await fl.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(prelijeva, `${sirina}px: vodoravni skrol`).toBeLessThanOrEqual(1);
  const sp = await kutija(stranica);
  const kp = await kutija(kartica);
  expect(sijeku(sp, kp), `${sirina}px: kartica prekriva stranicu`).toBe(false);
  const pozicija = await kartica.evaluate((el) => getComputedStyle(el).position);
  if (sirina >= 1180) {
    expect(kp.x, `${sirina}px: kartica je uz stranicu`).toBeGreaterThanOrEqual(sp.x + sp.w);
    expect(pozicija).toBe('sticky');
  } else {
    expect(kp.y, `${sirina}px: kartica je ispod stranice`).toBeGreaterThanOrEqual(sp.y + sp.h);
    expect(pozicija).not.toBe('sticky');
  }
  const uz = fl.locator('[data-fl-notes]');
  const popis = fl.locator('[data-fl-list]');
  if (sirina >= 900) {
    await expect(uz).toBeVisible();
    await expect(popis).toBeHidden();
    const up = await kutija(uz);
    expect(up.x, `${sirina}px: biljeske su izvan stranice`).toBeGreaterThanOrEqual(sp.x + sp.w);
  } else {
    await expect(uz).toBeHidden();
    if (await popis.locator('li').count()) {
      const lp = await kutija(popis);
      expect(lp.y, `${sirina}px: popis biljeski je ispod stranice`).toBeGreaterThanOrEqual(sp.y + sp.h);
    }
  }
  // Nijedan blok se ne preklapa s drugim (360 px posebno, ali vrijedi za sve sirine).
  const blokovi = await fl.evaluate((el) => ['.fl-head', '.fl-layers', '[data-fl-tipbar]', '.fl-pagecol', '[data-fl-list]', '[data-fl-card]', '[data-fl-queue]']
    .map((s) => { const n = el.querySelector(s); const r = n?.getBoundingClientRect(); return { s, x: r?.left ?? 0, y: r?.top ?? 0, w: r?.width ?? 0, h: r?.height ?? 0 }; }));
  for (let i = 0; i < blokovi.length; i += 1) {
    for (let j = i + 1; j < blokovi.length; j += 1) {
      expect(sijeku(blokovi[i], blokovi[j]), `${sirina}px: ${blokovi[i].s} preko ${blokovi[j].s}`).toBe(false);
    }
  }
  // Na 360 px nijedna meta ne izlazi preko ruba prozora.
  if (sirina === 360) {
    const izvan = await fl.evaluate((el) => [...el.querySelectorAll<HTMLElement>('button')]
      .filter((b) => b.offsetParent !== null && !b.closest('.fl-page'))
      .filter((b) => { const r = b.getBoundingClientRect(); return r.left < -0.5 || r.right > window.innerWidth + 0.5; })
      .map((b) => b.textContent?.trim() ?? b.className));
    expect(izvan).toEqual([]);
  }
}

for (const tema of ['dark', 'light'] as const) {
  test(`Z35 raspored po sirini (${tema}): 360, 768, 1180, 1440 i snimke`, async ({ page }, info) => {
    test.setTimeout(240_000);
    const fl = await doFaksimila(page, { tema });
    for (const sirina of SIRINE) {
      await provjeriRaspored(page, fl, sirina);
      await fl.evaluate((el) => el.scrollTo(0, 0));
      await page.screenshot({ path: snimka(info, `${tema}-${sirina}`), fullPage: false });
    }
    // Vidljiv tekst nema cijene; gumb plana i red cekanja nemaju bodova po zahvatu (F37). Mjere
    // nalaza smiju nositi "+" (npr. "+ 0 riječi u fusnotama"), pa se +N mjeri samo na kontrolama plana.
    expect(await fl.innerText()).not.toContain('€');
    const plan = await fl.evaluate((el) => [...el.querySelectorAll('[data-fl-res], [data-fl-count], [data-fl-done]')].map((n) => n.textContent).join(' '));
    expect(plan).not.toMatch(/\+\s*\d/);
  });
}

test('Z35 objasnjenje sloja ne prekriva stranicu na 1180 i 1440 px', async ({ page }) => {
  test.setTimeout(180_000);
  const fl = await doFaksimila(page);
  for (const sirina of [1180, 1440]) {
    await page.setViewportSize({ width: sirina, height: 900 });
    for (const sloj of ['notes', 'dots', 'rulers', 'ghost']) {
      const gumb = fl.locator(`[data-fl-layer="${sloj}"]`);
      if (!(await gumb.isVisible())) continue;
      await gumb.focus();
      const tip = fl.locator(`[data-fl-tip="${sloj}"]`);
      await expect(tip).toBeVisible();
      expect(sijeku(await kutija(tip), await kutija(fl.locator('[data-fl-page]'))), `${sirina}px ${sloj}`).toBe(false);
      expect(sijeku(await kutija(tip), await kutija(fl.locator('[data-fl-card]'))), `${sirina}px ${sloj} preko kartice`).toBe(false);
    }
    await fl.locator('[data-fl-back]').focus();
  }
});

test('Z35 povecalo: mjera nad tekstom, nikad nad marginom; na dodiru nema lampe ni prstena', async ({ page }) => {
  test.setTimeout(180_000);
  const fl = await doFaksimila(page);
  const dodir = await page.evaluate(() => matchMedia('(hover: none)').matches);
  const ocitanje = fl.locator('[data-fl-readout-t]');
  const prsten = fl.locator('[data-fl-ring]');
  if (dodir) {
    // (hover: none): lampa i povecalo se ne prikazuju; objasnjenje sloja otvara se dodirom.
    await expect(ocitanje).toContainText('povuci prstom');
    const gumb = fl.locator('[data-fl-layer="notes"]');
    await gumb.tap();
    await expect(fl.locator('[data-fl-tip="notes"]')).toBeVisible();
    await expect(fl.locator('[data-fl-tip]')).toHaveCount(0, { timeout: 6_000 });
    expect(await prsten.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    // Mete dodira: svaki vidljivi gumb u faksimilu je barem 44 x 44 px.
    const male = await fl.evaluate((el) => [...el.querySelectorAll<HTMLElement>('button')]
      .filter((b) => b.offsetParent !== null && getComputedStyle(b).pointerEvents !== 'none')
      .filter((b) => { const r = b.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; })
      .map((b) => `${b.className}:${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`));
    expect(male).toEqual([]);
    return;
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const odlomak = fl.locator('[data-fl-text="now"] [data-fx-par]').first();
  await odlomak.scrollIntoViewIfNeeded();
  const o = await kutija(odlomak);
  await page.mouse.move(o.x + o.w / 2, o.y + Math.min(o.h, 20) / 2);
  await page.mouse.move(o.x + o.w / 2 + 1, o.y + Math.min(o.h, 20) / 2);
  await expect(ocitanje).toHaveText(/^Ispod miša: /, { timeout: 3_000 });
  await expect.poll(() => prsten.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  // Lijeva margina: ista visina, x unutar margine stranice (lijevo od teksta).
  const s = await kutija(fl.locator('[data-fl-page]'));
  const lijevo = s.x + Math.max(2, (o.x - s.x) / 2);
  expect(o.x - s.x, 'tekst ima lijevu marginu').toBeGreaterThan(8);
  await page.mouse.move(lijevo, o.y + Math.min(o.h, 20) / 2);
  await page.waitForTimeout(800);
  await expect(ocitanje).not.toHaveText(/^Ispod miša: /);
  expect(await prsten.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');

  // Tocka stoji uz STVARNI redak sidrenog odlomka, a nit ide od tocke do biljeske izvan stranice.
  for (let i = 0; i < 80 && !(await fl.locator('[data-fl-dot]').count()); i += 1) {
    const dalje = fl.locator('[data-fl-flip="1"]');
    if (await dalje.isDisabled()) break;
    await dalje.click();
  }
  const tocke = await fl.locator('[data-fl-dot]').count();
  if (!tocke) {
    test.info().annotations.push({ type: 'bez sidra', description: 'fixture nema nalaz sa sidrom u pregledu; tocka i nit nisu izmjerene u pregledniku' });
    return;
  }
  const mjera = await fl.evaluate((el) => [...el.querySelectorAll<HTMLElement>('[data-fl-dot]')].map((d) => {
    const p = el.querySelector<HTMLElement>(`[data-fl-text="now"] [data-fl-p="${d.dataset.flZa}"]`)!.getBoundingClientRect();
    const r = d.getBoundingClientRect();
    const nit = el.querySelector(`[data-fl-thread="${d.dataset.flDot}"]`);
    const biljeska = el.querySelector<HTMLElement>(`[data-fl-notes] [data-fl-note="${d.dataset.flDot}"]`)?.getBoundingClientRect();
    const stranica = el.querySelector<HTMLElement>('[data-fl-page]')!.getBoundingClientRect();
    return { y: r.top + r.height / 2, od: p.top, do: p.bottom, nit: !!nit, izvan: biljeska ? biljeska.left >= stranica.right : null };
  }));
  for (const m of mjera) {
    expect(m.y, 'tocka je u visini svog odlomka').toBeGreaterThanOrEqual(m.od - 1);
    expect(m.y).toBeLessThanOrEqual(m.do + 1);
    expect(m.nit, 'tocka ima nit do biljeske').toBe(true);
    expect(m.izvan, 'biljeska je izvan stranice').toBe(true);
  }
});

test('Z35 pecat "Plan spreman" pada tek kad su prekrizeni svi nalazi', async ({ page }) => {
  test.setTimeout(180_000);
  const fl = await doFaksimila(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const stavke = fl.locator('[data-fl-q]');
  const n = await stavke.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i += 1) {
    await expect(fl.locator('[data-fl-stamp]')).toHaveCount(0);
    await fl.locator(`[data-fl-q="${i}"]`).click();
    const gumb = fl.locator('[data-fl-res]');
    if ((await gumb.count()) && (await gumb.getAttribute('aria-pressed')) === 'false') await gumb.click();
  }
  await expect(fl.locator('[data-fl-count]')).toHaveText(`RED ČEKANJA · ${n} / ${n}`);
  await expect(fl.locator('[data-fl-stamp]')).toHaveText('Plan spreman');
  // Natrag na presudu: plan je zajednicki, faksimil se zatvara.
  await fl.locator('[data-fl-back]').click();
  await expect(fl).toHaveCount(0);
});

test('Z35 smanjen pokret: listanje i objasnjenje bez animacije; bez prigusenja list se okrece', async ({ page }) => {
  test.setTimeout(240_000);
  const fl = await doFaksimila(page, { tiho: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  const dalje = fl.locator('[data-fl-flip="1"]');
  const natrag = fl.locator('[data-fl-flip="-1"]');
  expect(await dalje.isEnabled() || await natrag.isEnabled(), 'fixture ima vise listova').toBe(true);
  const gumb = (await dalje.isEnabled()) ? dalje : natrag;
  await gumb.click();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await fl.locator('[data-fl-layer="notes"]').focus();
  await expect(fl.locator('[data-fl-tip]')).toBeVisible();
  expect(await fl.locator('[data-fl-tip]').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  // KONTROLA: bez prigusenja isto listanje pokrece okretanje lista (WAAPI, transform i opacity).
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const fl2 = await doFaksimila(page, { tiho: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  const g2 = (await fl2.locator('[data-fl-flip="1"]').isEnabled()) ? fl2.locator('[data-fl-flip="1"]') : fl2.locator('[data-fl-flip="-1"]');
  await g2.click();
  const svojstva = await page.evaluate(() => document.getAnimations()
    .map((a) => ((a.effect as KeyframeEffect | null)?.getKeyframes() ?? []).flatMap((k) => Object.keys(k).filter((x) => !['offset', 'easing', 'composite', 'computedOffset'].includes(x)))).flat());
  expect(svojstva.length).toBeGreaterThan(0);
  expect([...new Set(svojstva)].every((s) => ['transform', 'opacity'].includes(s))).toBe(true);
});

/**
 * Rad s nalazom sa sidrom (isti kao `desktop-flow.spec.ts`), jer vodic nudi "Otvori označeno mjesto
 * u dokumentu" (`#guideOpenPreview`, ulaz u pregled) samo uz takav nalaz. `legacy` je postojeci
 * prekidac `?resultRenderer=legacy`.
 */
const FIXTURE_SIDRO = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

async function doPresude(page: Page, legacy: boolean): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(legacy ? '/rad/?resultRenderer=legacy' : '/rad/');
  await cekajApp(page);
  await page.locator('#analyticsDecline').click({ timeout: 3_000 }).catch(() => {});
  await page.locator('#fileInput').setInputFiles(FIXTURE_SIDRO);
  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 90_000 });
}

test('Z35 ruta: kartica "Faksimil" u pregledu otvara Z35 (plan presude Z34), ne stari Z9', async ({ page }, info) => {
  test.setTimeout(240_000);
  await doPresude(page, false);
  const kokpit = page.locator('#resultCockpit');
  await expect(kokpit).toHaveAttribute('data-rl-ready', 'true', { timeout: 30_000 });
  // Ulaz stola Z8 se ne vidi uz presudu Z34; Z34 nosi vlastiti.
  await expect(page.locator('[data-cockpit-fax]')).toBeHidden();
  await expect(page.locator('[data-rl-fax]')).toBeVisible();
  await kokpit.locator('[data-cockpit-action="open-findings"]').click();
  const pregled = page.locator('#guideOpenPreview');
  await pregled.scrollIntoViewIfNeeded();
  await pregled.click();
  await expect(page.locator('#previewModal')).toBeVisible();
  const kartica = page.locator('#previewModeFaksimil');
  const mjera = await kartica.boundingBox();
  expect(mjera?.height ?? 0, 'kartica Faksimil je meta').toBeGreaterThan(0);
  await kartica.click();
  const fl = page.locator('[data-fl]');
  await expect(fl).toHaveAttribute('data-fl-ready', 'true', { timeout: 30_000 });
  await expect(page.locator('#previewModal')).toBeHidden();
  await expect(page.locator('#previewZoomBar')).toHaveCount(0);
  await expect(page.locator('.lekta-fac, .is-facsimile')).toHaveCount(0);
  await page.screenshot({ path: snimka(info, 'ruta-iz-pregleda'), fullPage: false });
  // Stanje je presude Z34, ne kopija: "Napravit ću sam" oznacen u faksimilu iz pregleda ostaje i
  // kad se faksimil ponovno otvori gumbom presude (samostalni faksimil bi krenuo od nule).
  const res = fl.locator('[data-fl-res]');
  const red = fl.locator('[data-fl-q]');
  const brojac = fl.locator('[data-fl-count]');
  let rucni = false;
  for (let i = 0; i < await red.count() && !rucni; i += 1) {
    await red.nth(i).click();
    rucni = (await res.count()) > 0 && (await res.textContent()) === 'Napravit ću sam';
  }
  expect(rucni, 'fixture ima nalaz koji radis sam').toBe(true);
  const prije = await brojac.textContent();
  await res.click();
  await expect(brojac).not.toHaveText(prije ?? '');
  const poslije = await brojac.textContent();
  await fl.locator('[data-fl-back]').click();
  await expect(fl).toHaveCount(0);
  const ulaz = page.locator('[data-rl-fax]');
  await ulaz.scrollIntoViewIfNeeded();
  await ulaz.click();
  await expect(fl).toHaveAttribute('data-fl-ready', 'true', { timeout: 30_000 });
  await expect(brojac).toHaveText(poslije ?? '');
});

test('Z35 ruta: iza ?resultRenderer=legacy kartica "Faksimil" crta stari Z9 s alatnim redom', async ({ page }) => {
  test.setTimeout(240_000);
  await doPresude(page, true);
  const pregled = page.locator('#guideOpenPreview');
  await pregled.scrollIntoViewIfNeeded();
  await pregled.click();
  await page.locator('#previewModeFaksimil').click();
  const alati = page.locator('#previewZoomBar');
  await expect(alati).toBeVisible();
  await expect(alati).toContainText('Prilagodi širini');
  await expect(alati).toContainText('Cijela stranica');
  const prije = await alati.locator('.lekta-fac-zoomval').textContent();
  await alati.getByRole('button', { name: 'Povećaj' }).click();
  await expect(alati.locator('.lekta-fac-zoomval')).not.toHaveText(prije ?? '');
  await expect(page.locator('[data-fl]')).toHaveCount(0);
  await page.locator('#previewModeCitljivo').click();
  await expect(page.locator('#previewZoomBar')).toHaveCount(0);
});
