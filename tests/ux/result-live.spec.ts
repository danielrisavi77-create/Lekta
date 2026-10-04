import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp } from './app-ready';
import { karticaSaZahvatom, otvoriLadicu, sljedecaKartica } from './result-live-ladica';

/**
 * REZULTAT: SVE U JEDNOM (ALIGNMENT Z34) na `/rad/` s pravim .docx-om: tok rezultata, filtar
 * kategorija, ukljucivanje zahvata, ladica plana, 360 px bez preklapanja, prigusen pokret i snimke
 * u obje teme. Model (istinitost: strop ne ovisi o planu, nema "+N" ni cijene) mjeri
 * `tests/result-live.test.ts`; ovdje se mjeri da ga preglednik stvarno crta i da tok radi.
 * Snimke idu u `LEKTA_Z34_SNIMKE` ako je zadan, inace u izlaz testa.
 */
// Fixture S AUTOMATSKIM zahvatima (plan ima "Sigurne zahvate"; vidi repair-plan-selection.spec.ts).
const FIXTURE = path.resolve('tests/fixtures/docx/lo-fpzg-zavrsni-neuskladjen.docx');

function snimka(info: TestInfo, ime: string): string {
  const dir = process.env.LEKTA_Z34_SNIMKE;
  if (!dir) return info.outputPath(`${ime}.png`);
  mkdirSync(dir, { recursive: true });
  return path.join(dir, `${info.project.name}-${ime}.png`);
}

async function doRezultata(page: Page, opcije: { tema?: 'light' | 'dark'; tiho?: boolean; upit?: string } = {}): Promise<void> {
  if (opcije.tiho !== false) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((t) => {
    try { if (t) localStorage.setItem('lekta.theme', t); } catch { /* privatni prozor */ }
    const st = document.createElement('style');
    st.textContent = 'html,body,*{scroll-behavior:auto!important}';
    document.documentElement.appendChild(st);
  }, opcije.tema ?? null);
  await page.goto(`/rad/${opcije.upit ?? ''}`);
  await cekajApp(page);
  await page.locator('#analyticsDecline').click({ timeout: 3_000 }).catch(() => {});
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 90_000 });
}

const kokpit = (page: Page): Locator => page.locator('#resultCockpit');
const ladica = (page: Page): Locator => page.locator('[data-rl-tray]');

async function cekajZ34(page: Page): Promise<void> {
  await expect(kokpit(page)).toHaveAttribute('data-rl-ready', 'true', { timeout: 30_000 });
}

for (const tema of ['dark', 'light'] as const) {
  test(`Z34 tok rezultata (${tema}): presuda, jezicci, zahvat, ladica, plan`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await doRezultata(page, { tema });
    await cekajZ34(page);

    // Presuda: traka, prsten s dva luka i oznakom stropa, pecat u toku stranice.
    const list = kokpit(page).locator('[data-cockpit-verdict-sheet]');
    await expect(list.locator('[data-rl-trakica]')).toBeVisible();
    const prsten = list.locator('.cockpit-ring');
    const strop = await prsten.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--rl-ceil'));
    const opis = await prsten.getAttribute('aria-label');
    expect(opis ?? '').toMatch(/^Ocjena sada \d+/);
    await expect(list.locator('[data-cockpit-primary]')).toBeVisible();
    await page.screenshot({ path: snimka(info, `${tema}-presuda`), fullPage: false });

    // Jezicci: Sve + cetiri kategorije; prazna je kvacica bez klika; filtar pokazuje "1 od N".
    const tabs = kokpit(page).locator('[data-rl-tab]');
    await expect(tabs).toHaveCount(5);
    for (const key of ['Format', 'Struktura', 'Citati', 'Predaja']) {
      const t = kokpit(page).locator(`[data-rl-tab="${key}"]`);
      const n = (await t.locator('.rl-tab__n').textContent())?.trim() ?? '';
      if (n === '✓') { await expect(t).toBeDisabled(); continue; }
      await t.click();
      await expect(t).toHaveAttribute('aria-selected', 'true');
      await expect(kokpit(page).locator('[data-desk-count]')).toHaveText(`1 od ${n}`);
    }
    await kokpit(page).locator('[data-rl-tab="all"]').click();

    // Ukljucivanje zahvata mijenja broj u ladici, ne ocjenu ni zeleni luk.
    await karticaSaZahvatom(page);
    await otvoriLadicu(page);
    const broj = async (): Promise<number> => Number(await ladica(page).locator('[data-rl-tray-n]').getAttribute('data-rl-tray-n'));
    const prije = await broj();
    const racun = await ladica(page).locator('[data-rl-tray-r]').textContent();
    const gumb = kokpit(page).locator('[data-rl-toggle]');
    await expect(gumb).toHaveText('U planu ✓');
    await gumb.click();
    await expect(gumb).toHaveText('Uključi u plan');
    await expect.poll(broj).toBe(prije - 1);
    expect(await prsten.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--rl-ceil'))).toBe(strop);
    expect(await prsten.getAttribute('aria-label')).toBe(opis);
    expect(await ladica(page).locator('[data-rl-tray-r]').textContent()).toBe(racun);
    const vidljivo = `${await kokpit(page).innerText()} ${await ladica(page).innerText()}`;
    expect(vidljivo, 'bodovi po zahvatu ne postoje').not.toMatch(/\+\s*\d/);
    expect(vidljivo, 'cijena nije u klijentu').not.toContain('€');
    await page.screenshot({ path: snimka(info, `${tema}-stol`), fullPage: true });

    // Ladica salje SVOJ plan: panel popravka dobiva tocno taj broj zahvata.
    await ladica(page).locator('[data-rl-plan-go]').click();
    await expect(page.locator('#repairView')).toBeVisible();
    await expect(page.locator('#repairPanelMount')).toBeVisible();
    await expect(ladica(page)).toHaveAttribute('data-open', 'false');
    const uPanelu = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLInputElement>('.lekta-repair-panel__list input[type="checkbox"][data-idx]')).filter((cb) => cb.checked).length);
    expect(uPanelu).toBe(prije - 1);
  });
}

test('Z34 stol na sirokom zaslonu: stranica rada je sticky i zumira na sidro nalaza', async ({ page }) => {
  test.setTimeout(150_000);
  test.skip((page.viewportSize()?.width ?? 0) < 900, 'stranica rada postoji samo od 900 px');
  await doRezultata(page, { tiho: false });
  await cekajZ34(page);
  await expect(kokpit(page).locator('[data-rl-page]')).toBeVisible();
  const pozicija = await kokpit(page).locator('[data-rl-pagewrap]').evaluate((el) => getComputedStyle(el).position);
  expect(pozicija).toBe('sticky');
  // Trazi nalaz sa sidrom u prikazanom tekstu; bez njega nema zuma (i to je ishod, ne kvar).
  for (let i = 0; i < 40; i += 1) {
    if (await kokpit(page).locator('[data-rl-page][data-rl-sidro]').count()) break;
    if (!(await sljedecaKartica(page))) break;
  }
  const sidro = await kokpit(page).locator('[data-rl-page][data-rl-sidro]').count();
  const zum = kokpit(page).locator('[data-rl-zoom]');
  if (sidro) {
    await expect(kokpit(page).locator('[data-rl-hit]')).toHaveCount(1);
    await expect.poll(() => zum.evaluate((el) => (el as HTMLElement).style.transform)).toContain('scale(');
    expect(await zum.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain('transform');
  } else {
    test.info().annotations.push({ type: 'bez sidra', description: 'fixture nema nalaz sa sidrom u pregledu; zum nije izmjeren' });
    expect(await zum.evaluate((el) => (el as HTMLElement).style.transform)).toBe('');
  }
});

test('Z34 na 360 px: kartice, traka i ladica bez stranice rada; nista se ne preklapa', async ({ page }, info) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 360, height: 780 });
  await doRezultata(page, { tema: 'dark' });
  await cekajZ34(page);
  await expect(kokpit(page).locator('[data-rl-pagecol]')).toHaveCount(0);
  await expect(kokpit(page).locator('[data-rl-card]')).toBeVisible();
  const mjere = await page.evaluate(() => {
    const kutija = (s: string) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { s, l: r.left, t: r.top + scrollY, r: r.right, b: r.bottom + scrollY };
    };
    const blokovi = ['[data-cockpit-verdict-sheet]', '[data-rl-tabs]', '[data-rl-stack]', '[data-rl-strip]', '[data-cockpit-secondary]']
      .map(kutija).filter((k): k is NonNullable<typeof k> => !!k);
    const preklapanja: string[] = [];
    for (let i = 0; i < blokovi.length; i += 1) {
      for (let j = i + 1; j < blokovi.length; j += 1) {
        const a = blokovi[i], b = blokovi[j];
        if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) preklapanja.push(`${a.s} x ${b.s}`);
      }
    }
    const izvan = [...document.querySelectorAll('#resultCockpit [data-rl] *, #resultCockpit [data-rl-trakica] *, #resultCockpit .rl-legend')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && !el.closest('.rl-under');
    }).map((el) => `${el.tagName}.${el.className}`);
    // Gumbi kartice ne prelaze jedan drugog.
    const gumbi = [...document.querySelectorAll('#resultCockpit [data-rl-card] button:not([hidden])')]
      .map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0);
    const gumbPreklapanja = gumbi.flatMap((a, i) => gumbi.slice(i + 1).filter((b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)).length;
    return { preklapanja, izvan, gumbPreklapanja, sirina: document.documentElement.scrollWidth, prozor: innerWidth, blokova: blokovi.length };
  });
  expect(mjere.blokova).toBeGreaterThanOrEqual(4);
  expect(mjere.preklapanja).toEqual([]);
  expect(mjere.izvan).toEqual([]);
  expect(mjere.gumbPreklapanja).toBe(0);
  expect(mjere.sirina).toBeLessThanOrEqual(mjere.prozor);
  await page.screenshot({ path: snimka(info, 'dark-360'), fullPage: true });

  await otvoriLadicu(page);
  const t = await ladica(page).boundingBox();
  expect(t).not.toBeNull();
  expect(t!.x).toBeGreaterThanOrEqual(0);
  expect(t!.x + t!.width).toBeLessThanOrEqual(361);
  const go = await ladica(page).locator('[data-rl-plan-go]').boundingBox();
  expect(go!.x + go!.width).toBeLessThanOrEqual(361);
  await page.screenshot({ path: snimka(info, 'dark-360-ladica') });
});

test('Z34 pod prefers-reduced-motion: bez brojanja, zumiranja i letenja', async ({ page }) => {
  test.setTimeout(150_000);
  await doRezultata(page, { tiho: true });
  await cekajZ34(page);
  const jezgra = kokpit(page).locator('.cockpit-ring__core');
  const konacno = await page.evaluate(() => document.querySelector('.cockpit-ring')?.getAttribute('aria-label')?.match(/Ocjena sada (\d+)/)?.[1] ?? '');
  expect(await jezgra.textContent()).toBe(konacno);
  await expect(kokpit(page).locator('[data-cockpit-stamp]')).toHaveAttribute('data-rl-stamp', 'stoji');
  // Stranica rada (pa i zum) postoji samo od 900 px; na mobitelu nema sto zumirati.
  for (const zum of await kokpit(page).locator('[data-rl-zoom]').all()) {
    expect(await zum.evaluate((el) => (el as HTMLElement).style.transform)).toBe('');
  }
  await karticaSaZahvatom(page);
  const prijeLeta = await page.locator('.rl-fly').count();
  await kokpit(page).locator('[data-rl-toggle]').click();
  await kokpit(page).locator('[data-rl-toggle]').click();
  expect(await page.locator('.rl-fly').count(), 'cedulja ne leti').toBe(prijeLeta);
});

test('Z34 bez prigusenog pokreta: ocjena raste do stvarne, tek onda pada pecat', async ({ page }, info) => {
  test.setTimeout(150_000);
  // Stanje pecata biljezi STRANICA pri svakoj promjeni, uz broj u prstenu u tom trenutku. Gledanje
  // izvana (5 s na "pada") je palo kad je kokpit u medjuvremenu ponovno nacrtan: ponovno crtanje
  // istog rezultata je namjerno odmah zavrsno ("stoji"), pa "pada" vise nije bilo za vidjeti.
  await page.addInitScript(() => {
    const w = window as unknown as { __rlPecat: Array<{ v: string; jezgra: string; cilj: string }> };
    w.__rlPecat = [];
    const o = new MutationObserver((zapisi) => {
      for (const z of zapisi) {
        const el = z.target as HTMLElement;
        if (z.attributeName !== 'data-rl-stamp' || !el.dataset.rlStamp) continue;
        w.__rlPecat.push({
          v: el.dataset.rlStamp,
          jezgra: (document.querySelector('#resultCockpit .cockpit-ring__core')?.textContent ?? '').trim(),
          cilj: document.querySelector('#resultCockpit .cockpit-ring')?.getAttribute('aria-label')?.match(/Ocjena sada (\d+)/)?.[1] ?? '',
        });
      }
    });
    document.addEventListener('DOMContentLoaded', () => {
      o.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-rl-stamp'] });
    });
  });
  await doRezultata(page, { tiho: false });
  await cekajZ34(page);
  const pecat = kokpit(page).locator('[data-cockpit-stamp]');
  if (await pecat.count()) {
    await expect(pecat).not.toHaveAttribute('data-rl-stamp', 'ceka', { timeout: 10_000 });
    const tok = await page.evaluate(() => (window as unknown as { __rlPecat: Array<{ v: string; jezgra: string; cilj: string }> }).__rlPecat);
    expect(tok.some((z) => z.v === 'ceka'), 'ocjena nije ni krenula rasti (pokret je bio ugasen)').toBe(true);
    // Pecat nikad ne padne prije nego ocjena dodje do stvarne.
    for (const z of tok.filter((x) => x.v === 'pada')) expect(z.jezgra, 'pecat je pao prije kraja rasta ocjene').toBe(z.cilj);
    if (!tok.some((z) => z.v === 'pada')) info.annotations.push({ type: 'pecat', description: `rast prekinut ponovnim crtanjem: ${tok.map((z) => z.v).join(' > ')}` });
  }
  const konacno = await page.evaluate(() => document.querySelector('.cockpit-ring')?.getAttribute('aria-label')?.match(/Ocjena sada (\d+)/)?.[1] ?? '');
  await expect(kokpit(page).locator('.cockpit-ring__core')).toHaveText(konacno);
});

test('Z34: ?resultRenderer=legacy zadrzava stari prikaz', async ({ page }) => {
  test.setTimeout(150_000);
  await doRezultata(page, { upit: '?resultRenderer=legacy' });
  await expect(kokpit(page)).toHaveClass(/hidden/);
  await expect(page.locator('[data-rl]')).toHaveCount(0);
  await expect(page.locator('[data-rl-tray]')).toHaveCount(0);
});
