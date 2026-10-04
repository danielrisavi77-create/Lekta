import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp } from './app-ready';

/**
 * ANALIZA UZIVO (ALIGNMENT Z33) na `/rad/` s pravim .docx-om: tok, snimke u 0 s, 2 s, 6 s, 12 s i
 * na kraju u obje teme, 360 px bez preklapanja, prigusen pokret i dostupnost rezultata. Od odluke
 * vlasnika 2026-10-04 (F31): otkrivanje traje najvise oko 4 s, "Preskoči" ga zavrsava odmah, a
 * "Napravi plan popravka" vodi u plan popravka; snimka u 6 s smije biti vec zavrsno stanje.
 *
 * Model (istinitost, redoslijed, zavrsno stanje) mjeri `tests/analysis-live.test.ts`; ovdje se
 * mjeri ono sto model ne moze: da ga preglednik stvarno crta, da rezultat stigne i da se nista
 * ne preklapa. Snimke idu u `LEKTA_Z33_SNIMKE` ako je zadan, inace u izlaz testa.
 */
const FIXTURE = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');
// Fixture S AUTOMATSKIM zahvatima (kokpit nudi `repair-safe`, vidi repair-entry-visible.spec.ts); FIXTURE
// ih nema, pa je on kontrola: ondje "Napravi plan popravka" ne smije postojati.
const FIXTURE_POPRAVAK = path.resolve('tests/fixtures/docx/lo-fpzg-zavrsni-neuskladjen.docx');

async function odbijAnalitiku(page: Page): Promise<void> {
  await page.locator('#analyticsDecline').click({ timeout: 3_000 }).catch(() => {});
}

function snimka(info: TestInfo, ime: string): string {
  const dir = process.env.LEKTA_Z33_SNIMKE;
  if (!dir) return info.outputPath(`${ime}.png`);
  mkdirSync(dir, { recursive: true });
  return path.join(dir, `${info.project.name}-${ime}.png`);
}

/** Tema i lazna Notification (broji trazenja dopustenja i obavijesti) prije ucitavanja. */
async function pripremi(page: Page, tema: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((t) => {
    try { localStorage.setItem('lekta.theme', t); } catch { /* privatni prozor */ }
    const w = window as unknown as { __z33: Z33Biljeg; Notification: unknown };
    w.__z33 = { trazeno: 0, obavijesti: [], otkrivanje: 0, rezultat: 0 };
    // Vrijeme se biljezi U STRANICI, ne u testu: pocetak otkrivanja i trenutak kad ekran rezultata
    // postane vidljiv, pa kasnjenje rezultata ne ovisi o tome koliko cesto test gleda.
    const promatrac = new MutationObserver(() => {
      const z = document.querySelector('#progressView .z33');
      if (!w.__z33.otkrivanje && z?.getAttribute('data-phase') === 'revealing') w.__z33.otkrivanje = performance.now();
      const rv = document.getElementById('resultView');
      if (w.__z33.otkrivanje && !w.__z33.rezultat && rv && !rv.classList.contains('hidden') && !rv.hidden) w.__z33.rezultat = performance.now();
    });
    document.addEventListener('DOMContentLoaded', () => {
      promatrac.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-phase', 'class', 'hidden'] });
    });
    class LaznaObavijest {
      static permission: NotificationPermission = 'default';
      static async requestPermission(): Promise<NotificationPermission> {
        w.__z33.trazeno += 1;
        LaznaObavijest.permission = 'granted';
        return 'granted';
      }
      constructor(_naslov: string, opcije?: { body?: string }) { w.__z33.obavijesti.push(opcije?.body ?? ''); }
    }
    w.Notification = LaznaObavijest;
  }, tema);
  // Isti postupak kao `workspace-entry.spec.ts`: sporiji dohvat skripte workera drzi fazu citanja
  // vidljivom dovoljno dugo da se izmjeri. Sama analiza ostaje lokalna i nepromijenjena. 4 s, jer
  // ponuda obavijesti postoji SAMO dok provjera traje, a mobilna snimka u 0 s zna potrositi 1,5 s.
  await page.route('**/analyze-docx.worker*', async (route) => {
    await new Promise((r) => { setTimeout(r, 4_000); });
    await route.continue();
  });
}

async function pokreni(page: Page, datoteka = FIXTURE): Promise<void> {
  await page.goto('/rad/');
  await cekajApp(page);
  await odbijAnalitiku(page);
  await page.locator('#fileInput').setInputFiles(datoteka);
  await expect(page.locator('#analyzeProfile .ap-kartica')).toBeVisible({ timeout: 20_000 });
  await potvrdiProfil(page);
}

const z33 = (page: Page) => page.locator('#progressView .z33');

interface Z33Biljeg { trazeno: number; obavijesti: string[]; otkrivanje: number; rezultat: number }
const biljeg = (page: Page): Promise<Z33Biljeg> => page.evaluate(() => (window as unknown as { __z33: Z33Biljeg }).__z33);
const docekaj = async (page: Page, trenutak: number): Promise<void> => {
  const ostalo = trenutak - Date.now();
  if (ostalo > 0) await page.waitForTimeout(ostalo);
};

for (const tema of ['dark', 'light'] as const) {
  test(`Z33 tok na /rad/ (${tema}): citanje, otkrivanje, presuda, rezultat`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await pripremi(page, tema);
    await pokreni(page);

    await expect(z33(page)).toBeVisible({ timeout: 20_000 });
    const t0 = Date.now();
    await page.screenshot({ path: snimka(info, `${tema}-00s`), fullPage: true });

    // Stari zaslon provjere je zamijenjen, ne nadopunjen.
    await expect(page.locator('#progressView .pscan')).toBeHidden();
    await expect(page.locator('#progressView > h3')).toBeHidden();
    await expect(z33(page).locator('.z33-row')).toHaveCount(8);
    await expect(page.locator('#progressView #cancelAnalysisBtn')).toBeVisible();
    expect(await page.locator('#progressView').innerText(), 'postotak se ne smije vratiti').not.toMatch(/\d+\s*%/);

    // Stupac cedulja postoji samo na sirokom ekranu (>= 980 px).
    const sirok = (page.viewportSize()?.width ?? 0) >= 980;
    if (sirok) await expect(z33(page).locator('.z33-notes')).toBeVisible();
    else await expect(z33(page).locator('.z33-notes')).toBeHidden();

    // Dopustenje za obavijest TEK na klik.
    expect((await biljeg(page)).trazeno).toBe(0);
    await z33(page).locator('[data-z33="notify"]').click();
    await expect(z33(page).locator('[data-z33="notify"]')).toHaveText('Javit ću ti kad bude gotovo ✓');
    expect((await biljeg(page)).trazeno).toBe(1);

    // Snimke po proteklom vremenu od pojave ekrana. "Kraj" (presuda otipkana, prije nego ekran
    // rezultata preuzme) traje oko 1 s, pa ga hvata ZASEBNO cekanje koje tece usporedo sa snimkama
    // u 2, 6 i 12 s; inace bi spora snimka na hladnom posluzitelju znala pojesti cijeli prozor.
    // Snimke tijekom otkrivanja su velicine prozora (brze); cijela stranica je samo rezultat.
    const kraj = z33(page).locator('.z33-verdict[data-meta="true"]');
    let nalazi: string[] = [];
    let presuda = '';
    let obavijestNaKraju: boolean | null = null;
    let planNaKraju: boolean | null = null;
    let stranice = '';
    const krajSnimljen = kraj.waitFor({ state: 'visible', timeout: 60_000 }).then(async () => {
      presuda = await z33(page).locator('[data-z33="verdicttext"]').innerText();
      nalazi = await z33(page).locator('.z33-slot[data-state="filled"] .z33-slot-title').allInnerTexts();
      obavijestNaKraju = await z33(page).locator('[data-z33="notify"]').isVisible();
      planNaKraju = await z33(page).locator('[data-z33="plan"]').isVisible();
      stranice = (await z33(page).locator('[data-z33="s-pages"]').textContent()) ?? '';
      await page.screenshot({ path: snimka(info, `${tema}-kraj`) });
    });
    for (const sekunda of [2, 6, 12]) {
      await docekaj(page, t0 + sekunda * 1000);
      await page.screenshot({ path: snimka(info, `${tema}-${String(sekunda).padStart(2, '0')}s`) });
    }
    await krajSnimljen;

    await expect(page.locator('#resultView')).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: snimka(info, `${tema}-rezultat`), fullPage: true });
    // Rezultat kasni najvise za trajanje otkrivanja (u modelu najvise 4 s), izmjereno u stranici.
    const b = await biljeg(page);
    expect(b.otkrivanje, 'otkrivanje se nije ni pokrenulo').toBeGreaterThan(0);
    expect(b.rezultat - b.otkrivanje, 'rezultat je cekao dulje od otkrivanja').toBeLessThan(5_000);
    // Gotova provjera ne obecaje buducu obavijest; brojac stranica nikad nije prazna oznaka.
    expect(obavijestNaKraju, 'uz gotovu provjeru stoji "Javit ću ti kad bude gotovo"').toBe(false);
    expect(stranice.trim(), 'brojac stranica bez broja').not.toBe('');
    // KONTROLA: ovaj fixture nema automatskih zahvata, pa kokpit nema `repair-safe`, a list presude
    // nema "Napravi plan popravka". Isti uvjet, isti ishod.
    await expect(page.locator('#resultView')).toHaveAttribute('data-result-ready', '1', { timeout: 30_000 });
    expect(await page.locator('#resultCockpit [data-cockpit-action="repair-safe"]').count()).toBe(0);
    expect(planNaKraju, 'gumb plana bez dostupnog popravka').toBe(false);

    // Isto sto je otkrivanje pokazalo stoji i na ekranu rezultata.
    await expect(page.locator('#resultCockpit [data-cockpit-verdict-title]')).toHaveText(presuda);
    expect(nalazi.length).toBeGreaterThan(0);
    expect(b.obavijesti).toHaveLength(1);
    expect(b.obavijesti[0]).toMatch(/^Provjera je gotova: /);
  });
}

test('Z33 na 360 px: nista se ne preklapa i nema vodoravnog skrola', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 360, height: 780 });
  await pripremi(page, 'dark');
  await pokreni(page);
  await expect(z33(page).locator('.z33-verdict[data-meta="true"]')).toBeVisible({ timeout: 60_000 });

  const mjere = await page.evaluate(() => {
    const kutija = (s: string) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { s, l: r.left, t: r.top + scrollY, r: r.right, b: r.bottom + scrollY };
    };
    const blokovi = ['.z33-col', '.z33-profile', '.z33-score', '.z33-rows', '.z33-stats', '.z33-notify', '.z33-verdict-slot', '.z33-cats', '.z33-findings']
      .map(kutija).filter((k): k is NonNullable<typeof k> => !!k);
    const preklapanja: string[] = [];
    for (let i = 0; i < blokovi.length; i += 1) {
      for (let j = i + 1; j < blokovi.length; j += 1) {
        const a = blokovi[i], b = blokovi[j];
        if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) preklapanja.push(`${a.s} x ${b.s}`);
      }
    }
    const izvan = [...document.querySelectorAll('.z33 *')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && !el.closest('.z33-sheet, .z33-under, .z33-flip');
    }).map((el) => el.className);
    // Gumbi lista presude, u istom trenutku kao i blokovi (otkrivanje traje kratko).
    const gumb = (s: string) => {
      const el = document.querySelector<HTMLElement>(s);
      if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    const gumbi = { plan: gumb('.z33 [data-z33="plan"]'), otvori: gumb('.z33 [data-z33="open"]') };
    return { preklapanja, izvan, gumbi, sirina: document.documentElement.scrollWidth, prozor: innerWidth, blokova: blokovi.length };
  });
  expect(mjere.blokova).toBe(9);
  expect(mjere.preklapanja).toEqual([]);
  expect(mjere.izvan).toEqual([]);
  expect(mjere.sirina).toBeLessThanOrEqual(mjere.prozor);
  // Gumbi lista presude stanu u 360 px i ne prelaze jedan drugog.
  const { plan, otvori } = mjere.gumbi;
  expect(otvori).not.toBeNull();
  for (const k of [plan, otvori]) if (k) expect(k.r).toBeLessThanOrEqual(mjere.prozor + 1);
  if (plan && otvori) expect(plan.b <= otvori.t + 1 || plan.r <= otvori.l + 1).toBe(true);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 30_000 });
});

test('Z33 na 360 px: "Preskoči" stane u prozor i radi', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 780 });
  await pripremi(page, 'light');
  await pokreni(page);
  const skip = z33(page).locator('[data-z33="skip"]');
  await expect(skip).toBeVisible({ timeout: 60_000 });
  const k = await skip.boundingBox();
  expect(k).not.toBeNull();
  if (k) {
    expect(k.x).toBeGreaterThanOrEqual(0);
    expect(k.x + k.width).toBeLessThanOrEqual(361);
    expect(k.height, 'cilj dodira najmanje 44 px').toBeGreaterThanOrEqual(44);
  }
  await skip.click();
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 10_000 });
});

test('Z33 "Preskoči" s tipkovnice: odmah zavrsno stanje i rezultat, fokus na presudi', async ({ page }) => {
  test.setTimeout(120_000);
  await pripremi(page, 'dark');
  await pokreni(page);
  const skip = z33(page).locator('[data-z33="skip"]');
  await expect(skip).toBeVisible({ timeout: 60_000 });
  await expect(skip).toHaveText('Preskoči');
  // Tipkovnica, ne mis: fokus na gumb pa Enter.
  await skip.focus();
  await page.keyboard.press('Enter');
  const b0 = Date.now();
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - b0, 'Preskoči mora odmah otvoriti rezultat').toBeLessThan(3_000);
  await expect(page.locator('#progressView .z33')).toHaveAttribute('data-phase', 'final');
  await expect(page.locator('#resultView')).toHaveAttribute('data-result-ready', '1', { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? ''), { message: 'fokus mora stati na presudu rezultata' })
    .toBe('cockpitVerdictTitle');
});

test('Z33 "Napravi plan popravka" otvara rezultat i vodi u plan popravka', async ({ page }) => {
  test.setTimeout(150_000);
  await pripremi(page, 'light');
  await pokreni(page, FIXTURE_POPRAVAK);
  const plan = z33(page).locator('[data-z33="plan"]');
  // Gumb je dohvatljiv tek kad je presuda otipkana (prije toga `visibility: hidden`).
  await expect(plan).toBeVisible({ timeout: 60_000 });
  await expect(plan).toHaveText('Napravi plan popravka');
  await plan.click();
  // Rezultat preuzima ekran, a kad je gotov (i panel popravka montiran), otvara se faza popravka.
  await expect(page.locator('#repairView'), 'plan popravka se mora otvoriti').toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#repairPanelMount')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const m = document.getElementById('repairPanelMount');
    return !!m && !!document.activeElement && m.contains(document.activeElement);
  }), { message: 'fokus mora biti u panelu popravka' }).toBe(true);
  // Isti uvjet kao na ekranu rezultata: kokpit nudi isti natpis na istom ulazu.
  await expect(page.locator('#resultCockpit [data-cockpit-primary][data-cockpit-action="repair-safe"]')).toHaveCount(1);
});

test('Z33 pod prefers-reduced-motion: zavrsno stanje odmah, rezultat ne ceka', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await pripremi(page, 'dark');
  await pokreni(page);
  await expect(z33(page)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 60_000 });
  // Otkrivanje se nije ni pokrenulo: korijen je preskocio `revealing` i stoji u zavrsnom stanju.
  await expect(page.locator('#progressView .z33')).toHaveAttribute('data-phase', 'final');
  const stanje = await page.locator('#progressView .z33').evaluate((root) => ({
    prazna: root.querySelectorAll('.z33-slot[data-state="placeholder"]').length,
    puna: root.querySelectorAll('.z33-slot[data-state="filled"]').length,
    presuda: root.querySelector('[data-z33="verdicttext"]')?.textContent ?? '',
  }));
  expect(stanje.prazna).toBe(0);
  expect(stanje.puna).toBeGreaterThan(0);
  expect(stanje.presuda.length).toBeGreaterThan(0);
});
