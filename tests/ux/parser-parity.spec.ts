import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

/**
 * PARNOST DVIJU IZVEDBI ANALIZE (T10).
 *
 * Analiza ima dvije putanje koje NISU isti kod: worker parsira preko `@xmldom/xmldom`, a inline
 * fallback (nema Workera ili je pukao) preko NATIVNOG preglednickog `DOMParser`-a. Kod to i sam
 * priznaje u `analyze-docx-client.ts`.
 *
 * Do sada tu razliku nije mjerilo NISTA. `vitest.config.ts` ima
 * `setupFiles: ['./tests/setup/xml-dom.ts']`, koji podmece xmldom kao globalni `DOMParser` u SVIM
 * testovima, pa je postojeci test "bez Workera vraca identican rezultat" usporedjivao xmldom
 * protiv xmldoma. Playwright je jedino okruzenje s pravim preglednikom, a ondje Worker uvijek radi.
 * Nativni `DOMParser` tako nikad nije bio izvrsen nad `.docx` XML-om ni u jednom testu.
 *
 * Ovaj spec gasi `Worker` PRIJE ucitavanja stranice, pa se inline grana stvarno izvede.
 *
 * ZASTO NIJE VAKUUMSKI: sama jednakost rezultata ne bi dokazala nista, jer bi je jednako dobro
 * dala i dva prolaza ISTOM putanjom. Zato se tvrdi i da je biljeg putanje bio razlicit
 * ('worker' pa 'inline'); bez te tvrdnje test bi prosao i da gasenje Workera ne radi.
 */

interface Ishod {
  putanja: string | null;
  fallbackovi: number;
  ocjena: string;
  greske: string;
  nalazi: string[];
}

async function analiziraj(page: Page, bezWorkera: boolean): Promise<Ishod> {
  if (bezWorkera) {
    await page.addInitScript(() => {
      try { delete (window as unknown as Record<string, unknown>).Worker; } catch { /* stariji motori */ }
      if (typeof (window as unknown as Record<string, unknown>).Worker !== 'undefined') {
        (window as unknown as Record<string, unknown>).Worker = undefined;
      }
    });
  }
  // Bez ovoga `setWizardStep(3, true)` ide kroz View Transition pa gumb fizicki putuje dok
  // Playwright provjerava akcijabilnost (isti razlog kao u repair-panel.spec.ts).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // `domcontentloaded`, ne zadani `load`: IZMJERENO na produkcijskom buildu (`vite preview`) da u
  // WebKitu `load` ne okine ni u 90 s, dok ga Chromium okine za 2,9 s. Nije rijec o fontovima
  // (nula odbijenih zahtjeva), ni o dev posluzitelju, ni o `<video>` elementu (provjereno
  // uklanjanjem). Resource Timing pritom prijavljuje NULA nedovrsenih resursa, pa uzrok ostaje
  // neimenovan. Korisnika ne dira, jer nijedan modul ne ceka na `load` (boot ide na
  // `DOMContentLoaded`, 3,7 s u WebKitu); dira samo alat, i objasnjava raniji istek
  // `page.goto` u `mobile-webkit` projektu.
  await page.goto('/rad/', { waitUntil: 'domcontentloaded' });

  if (bezWorkera) {
    expect(await page.evaluate(() => typeof Worker), 'Worker mora doista biti ugasen').toBe('undefined');
  }

  const uploadCta = page.locator('#uploadCtaBtn');
  if (await uploadCta.isVisible().catch(() => false)) await uploadCta.click();
  await page.locator('#fileInput').setInputFiles(fixture);
  const wizard = page.locator('#wizardView');
  if ((await wizard.getAttribute('data-step')) === '1') await page.locator('#stepToProfile').click();
  await expect(wizard).toHaveAttribute('data-step', '2');
  await page.locator('#stepToAnalyze').click();
  await expect(wizard).toHaveAttribute('data-step', '3');
  await expect(page.locator('#analyzeBtn')).toBeEnabled();
  await page.locator('#analyzeBtn').click();
  const confirm = page.locator('[data-confirm-profile]');
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 120_000 });

  // Nalazi zive iza sklopljenog bloka "Napredna provjera"; otvara se onako kako to radi korisnik.
  await page.locator('#resultCockpit [data-cockpit-action="open-findings"]').click();

  return page.evaluate(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    const tekst = (sel: string) => document.querySelector(sel)?.textContent?.trim() ?? '';
    const nalazi = Array.from(document.querySelectorAll('[data-finding-id]'))
      .map((el) => (el as HTMLElement).dataset.findingId ?? '')
      .filter(Boolean)
      .sort();
    return {
      putanja: (g.__lektaAnalysisPath as string) ?? null,
      fallbackovi: (g.__lektaInlineFallbacks as number) ?? 0,
      ocjena: tekst('#scoreValue'),
      greske: tekst('#resultErrorCount'),
      nalazi: Array.from(new Set(nalazi)),
    };
  });
}

test('inline fallback daje isti rezultat kao worker (nativni DOMParser vs xmldom)', async ({ browser }) => {
  // Proracun vremena je podesiv, jer nije isti u svim motorima: Chromium ovdje odradi obje
  // analize za oko 3 min, dok WebKit na opterecenom stroju ne stigne ni u 10. Zadano ostaje
  // 600 s; mjerenje sporijeg motora se pokrece s `LEKTA_PARITY_TIMEOUT_MS`.
  test.setTimeout(Number(process.env.LEKTA_PARITY_TIMEOUT_MS ?? 600_000));

  const sWorkerom = await browser.newPage();
  const a = await analiziraj(sWorkerom, false);
  await sWorkerom.close();

  const bezWorkera = await browser.newPage();
  const b = await analiziraj(bezWorkera, true);
  await bezWorkera.close();

  // Gard protiv vakuumskog prolaza: putanje su MORALE biti razlicite.
  expect(a.putanja, 'prvi prolaz mora ici kroz worker').toBe('worker');
  expect(b.putanja, 'drugi prolaz mora ici kroz inline granu').toBe('inline');
  expect(a.fallbackovi, 'worker prolaz ne smije nista srusiti na inline').toBe(0);
  expect(b.fallbackovi, 'inline prolaz mora imati brojac razlicit od nule').toBeGreaterThan(0);

  // Tek sada usporedba ishoda.
  expect(b.ocjena, 'ocjena se razlikuje izmedju workera i inline putanje').toBe(a.ocjena);
  expect(b.greske, 'broj gresaka se razlikuje izmedju putanja').toBe(a.greske);
  expect(b.nalazi, 'skup nalaza se razlikuje izmedju putanja').toEqual(a.nalazi);
  expect(a.nalazi.length, 'mjerenje nad praznim skupom nalaza ne dokazuje nista').toBeGreaterThan(0);
});
