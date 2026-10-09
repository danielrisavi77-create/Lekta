import path from 'node:path';
import { mkdirSync, renameSync } from 'node:fs';
import { expect, test, type Page, type Route, type TestInfo } from '@playwright/test';
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

/**
 * Tema i lazna Notification (broji trazenja dopustenja i obavijesti) prije ucitavanja. Vraca
 * `pusti`: skripta workera analize stoji dok je test ne pusti (vidi dolje).
 */
async function pripremi(page: Page, tema: 'light' | 'dark'): Promise<() => void> {
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
  return zadrziWorker(page);
}

/**
 * Skripta workera STOJI dok je test ne pusti, pa je faza citanja vidljiva dok god test u njoj
 * nesto tvrdi. Fiksno kasnjenje (prije 4 s od zahtjeva) je pucalo cim potvrda profila potraje:
 * spekulativna analiza trazi worker vec pri odabiru datoteke, pa je znala zavrsiti prije
 * potvrde i faza citanja nije ni postojala (Codex Z33-08, sonda nad 58cb5091). Sama analiza
 * ostaje lokalna i nepromijenjena. Kasnija ruta ima prednost, pa novi poziv drzi SLJEDECE ucitavanje.
 */
async function zadrziWorker(page: Page): Promise<() => void> {
  let pusti: () => void = () => {};
  const pusten = new Promise<void>((r) => { pusti = r; });
  await page.route('**/analyze-docx.worker*', async (route) => {
    await pusten;
    await route.continue();
  });
  return pusti;
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
interface Kutija { l: number; t: number; r: number; b: number; w: number; h: number }
interface GotovaPresuda { plan: Kutija | null; otvori: Kutija | null; prozor: number; sirina: number; dohvatljiv: boolean }

/**
 * Ceka U STRANICI da list presude bude gotov (gumbi vidljivi) i u ISTOM trenutku mjeri gumbe, a uz
 * `klikni` i klikne plan popravka. Gotov list stoji oko 1,5 s prije nego rezultat preuzme ekran;
 * na opterecenom stroju Playwrightovi koraci izvana znaju potrositi vise od toga, pa je lov na
 * prozor izvana bio nepouzdan (Codex Z33-08, pad na chromium pod opterecenjem). `dohvatljiv`:
 * gumb je u prozoru i na svom sredistu je on, a ne nesto preko njega, kao sto trazi pravi klik.
 */
async function naGotovojPresudi(page: Page, klikni: boolean): Promise<GotovaPresuda> {
  return page.evaluate((klik) => new Promise<GotovaPresuda>((resolve) => {
    const kutija = (s: string): Kutija | null => {
      const el = document.querySelector<HTMLElement>(s);
      if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
    };
    const pokusaj = (): boolean => {
      const list = document.querySelector('#progressView .z33-verdict[data-meta="true"]');
      const gumb = document.querySelector<HTMLButtonElement>('#progressView .z33 [data-z33="plan"]');
      if (!list || !gumb || gumb.hidden || getComputedStyle(gumb).visibility !== 'visible') return false;
      gumb.scrollIntoView({ block: 'center', behavior: 'auto' });
      const r = gumb.getBoundingClientRect();
      const naSredistu = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const dohvatljiv = !!naSredistu && gumb.contains(naSredistu);
      const out = { plan: kutija('.z33 [data-z33="plan"]'), otvori: kutija('.z33 [data-z33="open"]'), prozor: innerWidth, sirina: document.documentElement.scrollWidth, dohvatljiv };
      if (klik && dohvatljiv) gumb.click();
      resolve(out);
      return true;
    };
    if (pokusaj()) return;
    const o = new MutationObserver(() => { if (pokusaj()) o.disconnect(); });
    o.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-meta', 'hidden'] });
  }), klikni);
}

const docekaj = async (page: Page, trenutak: number): Promise<void> => {
  const ostalo = trenutak - Date.now();
  if (ostalo > 0) await page.waitForTimeout(ostalo);
};

/**
 * MJERA U TRENUTKU KRAJA. Zavrsni list (presuda otipkana) stoji najvise `HOLD_SETTLED` (1,5 s), a
 * kad otkrivanje udari u `REVEAL_MAX` i krace, pa ekran rezultata preuzme i `#progressView` se
 * skrije. `expect(...).toBeVisible()` pita stranicu u razmacima do 1 s, a opterecen stroj svaki
 * povratak jos produlji: test koji tek tada mjeri zna zakasniti cijeli prozor i vidi samo skriven
 * cvor (mobile-chromium, Z34 krug 3, 87 pokusaja "hidden"). Zato mjeri STRANICA: MutationObserver
 * na `data-meta` presude radi u mikrozadaci istog kadra u kojem je presuda otipkana, prije nego
 * nastavak otkrivanja preda ekran rezultatu. `mjeri` mora biti samostalna (bez zatvorenih varijabli),
 * jer se prenosi kao izvorni kod.
 */
async function mjeriNaKraju(page: Page, mjeri: () => unknown): Promise<void> {
  await page.addInitScript(`(() => {
    const mjeri = ${mjeri.toString()};
    const w = window;
    const promatrac = new MutationObserver(() => {
      if (w.__z33kraj) return;
      const pv = document.getElementById('progressView');
      const v = document.querySelector('#progressView .z33 .z33-verdict');
      if (!pv || !v || v.hidden || v.getAttribute('data-meta') !== 'true') return;
      if (pv.hidden || pv.classList.contains('hidden')) return;
      w.__z33kraj = mjeri();
      promatrac.disconnect();
    });
    document.addEventListener('DOMContentLoaded', () => {
      promatrac.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-meta'] });
    });
  })()`);
}

/** Ceka mjeru iz `mjeriNaKraju` (presuda se u ovom pokretanju stvarno prikazala) i vraca je. */
async function mjeraKraja<T>(page: Page): Promise<T> {
  await page.waitForFunction(() => (window as unknown as { __z33kraj?: unknown }).__z33kraj != null, null, { timeout: 60_000 });
  return page.evaluate(() => (window as unknown as { __z33kraj: unknown }).__z33kraj) as Promise<T>;
}

interface KrajToka { presuda: string; nalazi: string[]; obavijest: boolean; plan: boolean; stranice: string }

/** Zavrsni list toka, izmjeren u stranici u trenutku kraja (vidi `mjeriNaKraju`). */
function krajToka(): KrajToka {
  const z = document.querySelector('#progressView .z33');
  const tx = (s: string): string => (z?.querySelector(s)?.textContent ?? '').trim();
  // Isto sto Playwrightov `isVisible`: nije skriven, ima kutiju i nije `visibility: hidden`.
  const vidljiv = (s: string): boolean => {
    const el = z?.querySelector<HTMLElement>(s);
    if (!el || el.hidden) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  return {
    presuda: tx('[data-z33="verdicttext"]'),
    nalazi: [...(z?.querySelectorAll('.z33-slot[data-state="filled"] .z33-slot-title') ?? [])].map((n) => (n.textContent ?? '').trim()),
    obavijest: vidljiv('[data-z33="notify"]'),
    plan: vidljiv('[data-z33="plan"]'),
    stranice: tx('[data-z33="s-pages"]'),
  };
}

for (const tema of ['dark', 'light'] as const) {
  test(`Z33 tok na /rad/ (${tema}): citanje, otkrivanje, presuda, rezultat`, async ({ page }, info) => {
    test.setTimeout(180_000);
    const pusti = await pripremi(page, tema);
    await mjeriNaKraju(page, krajToka);
    await pokreni(page);

    await expect(z33(page)).toBeVisible({ timeout: 20_000 });
    await expect(z33(page)).toHaveAttribute('data-phase', 'reading');
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

    // Snimke u 2, 6 i 12 s su slike po proteklom vremenu (tako ih trazi predlozak), ne tvrdnje;
    // sve tvrdnje vezane su uz stanja (Z33-08). Worker se pusta nakon snimke u 2 s, pa je ona jos
    // faza citanja. "Kraj" (presuda otipkana, prije nego ekran rezultata preuzme) traje oko 1 s:
    // njegove vrijednosti mjeri STRANICA u tom trenutku (`krajToka`), a snimku hvata zasebno
    // cekanje usporedo sa snimkama u 2, 6 i 12 s. Snimka vrijedi samo ako ekran rezultata nije
    // preuzeo ni prije ni tijekom nje (Codex Z33-08, runda 2); inace se preimenuje u "-nevaljano".
    // Snimke tijekom otkrivanja su velicine prozora (brze); cijela stranica je samo rezultat.
    const kraj = z33(page).locator('.z33-verdict[data-meta="true"]');
    const krajSnimljen = kraj.waitFor({ state: 'visible', timeout: 60_000 }).then(async () => {
      const put = snimka(info, `${tema}-kraj`);
      await page.screenshot({ path: put });
      if ((await biljeg(page)).rezultat > 0) {
        renameSync(put, put.replace(/-kraj\.png$/, '-kraj-nevaljano.png'));
        info.annotations.push({ type: 'snimka', description: `${tema}-kraj: rezultat je preuzeo ekran prije kraja snimke` });
      }
    });
    for (const sekunda of [2, 6, 12]) {
      await docekaj(page, t0 + sekunda * 1000);
      await page.screenshot({ path: snimka(info, `${tema}-${String(sekunda).padStart(2, '0')}s`) });
      if (sekunda === 2) pusti();
    }
    await krajSnimljen;
    const { presuda, nalazi, obavijest: obavijestNaKraju, plan: planNaKraju, stranice } = await mjeraKraja<KrajToka>(page);

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

type Okvir = Pick<Kutija, 'l' | 't' | 'r' | 'b'>;
interface Mjere360 { preklapanja: string[]; izvan: string[]; gumbi: { plan: Okvir | null; otvori: Okvir | null }; sirina: number; prozor: number; blokova: number }

/** Blokovi i gumbi zavrsnog lista na 360 px, izmjereni u stranici (vidi `mjeriNaKraju`). */
function mjere360(): Mjere360 {
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
}

test('Z33 na 360 px: nista se ne preklapa i nema vodoravnog skrola', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 360, height: 780 });
  const pusti = await pripremi(page, 'dark');
  await mjeriNaKraju(page, mjere360);
  await pokreni(page);
  // Worker stoji dok ga test ne pusti (Z33-08), a zavrsni list mjeri STRANICA u trenutku kraja.
  await expect(z33(page)).toBeVisible({ timeout: 20_000 });
  pusti();
  const mjere = await mjeraKraja<Mjere360>(page);
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

interface GumbPresude { l: number; t: number; r: number; b: number; w: number; h: number; vidljiv: boolean }
interface GumbiPresude { plan: GumbPresude | null; otvori: GumbPresude | null; prozor: number; sirina: number; dohvatljiv: boolean }

/** Gumbi zavrsnog lista presude, izmjereni u stranici (vidi `mjeriNaKraju`). */
function gumbiPresude(): GumbiPresude {
  const gumb = (s: string): GumbPresude | null => {
    const el = document.querySelector<HTMLElement>(s);
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    // Gumb je dohvatljiv tek kad je presuda otipkana (prije toga `visibility: hidden`).
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, vidljiv: getComputedStyle(el).visibility !== 'hidden' && r.width > 0 };
  };
  const izmjereno = { plan: gumb('.z33 [data-z33="plan"]'), otvori: gumb('.z33 [data-z33="open"]'), prozor: innerWidth, sirina: document.documentElement.scrollWidth };
  // Dohvatljiv (Z33-08): u prozoru i na svom sredistu je on, a ne nesto preko njega, kao sto trazi
  // pravi klik. Pomak u prozor ide NAKON mjere polozaja, pa ne mijenja izmjerene kutije.
  const el = document.querySelector<HTMLElement>('.z33 [data-z33="plan"]');
  let dohvatljiv = false;
  if (el && !el.hidden) {
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    const r = el.getBoundingClientRect();
    const naSredistu = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    dohvatljiv = !!naSredistu && el.contains(naSredistu);
  }
  return { ...izmjereno, dohvatljiv };
}

test('Z33 na 360 px s popravljivim nalazima: plan popravka i "Pregledaj nalaze" stanu i ne preklapaju se', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 360, height: 780 });
  const pusti = await pripremi(page, 'dark');
  await mjeriNaKraju(page, gumbiPresude);
  await pokreni(page, FIXTURE_POPRAVAK);
  await expect(z33(page)).toBeVisible({ timeout: 20_000 });
  pusti();
  const mjere = await mjeraKraja<GumbiPresude>(page);
  // Za razliku od FIXTURE-a, ovdje gumb plana MORA postojati, biti vidljiv i dohvatljiv; inace provjera ispod ne mjeri nista.
  expect(mjere.plan?.vidljiv, 'gumb plana mora biti vidljiv na zavrsnom listu').toBe(true);
  expect(mjere.dohvatljiv, 'gumb plana nije dohvatljiv').toBe(true);
  const { plan, otvori } = mjere;
  expect(plan, 'gumb plana mora biti prikazan').not.toBeNull();
  expect(otvori, 'gumb "Pregledaj nalaze" mora biti prikazan').not.toBeNull();
  for (const k of [plan!, otvori!]) {
    expect(k.l).toBeGreaterThanOrEqual(0);
    expect(k.r).toBeLessThanOrEqual(mjere.prozor + 1);
    expect(k.w).toBeGreaterThan(0);
  }
  expect(plan!.b <= otvori!.t + 1 || plan!.r <= otvori!.l + 1 || otvori!.b <= plan!.t + 1 || otvori!.r <= plan!.l + 1, 'gumbi se preklapaju').toBe(true);
  expect(mjere.sirina).toBeLessThanOrEqual(mjere.prozor);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 30_000 });
});

test('Z33 na 360 px: "Preskoči" stane u prozor i radi', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 780 });
  const pusti = await pripremi(page, 'light');
  // "Preskoči" postoji samo dok otkrivanje traje (najvise oko 4 s). Mjera i klik izvana su znali
  // zakasniti cijeli prozor (klik je cekao gumb koji je vec nestao; chromium, Z34 krug 2), pa ih
  // radi STRANICA dok gumb postoji: kutija, dohvatljivost (na sredistu je on, kao sto trazi pravi
  // klik) i klik. Kao Playwrightova provjera radnje, pokusava svaki kadar dok gumb ne postane
  // dohvatljiv ili ne nestane; `na` imenuje sto je bilo na sredistu ako nije on.
  await page.addInitScript(() => {
    type Mjera = { l: number; r: number; h: number; dohvatljiv: boolean; na: string };
    const w = window as unknown as { __z33skip?: Mjera };
    let trazi = false;
    const pokusaj = (): void => {
      if (w.__z33skip) return;
      const b = document.querySelector<HTMLButtonElement>('#progressView .z33 [data-z33="skip"]');
      const pv = document.getElementById('progressView');
      if (!b || b.hidden || !pv || pv.hidden || pv.classList.contains('hidden')) {
        if (trazi) w.__z33skip = { l: 0, r: 0, h: 0, dohvatljiv: false, na: 'gumb je nestao prije nego je bio dohvatljiv' };
        return;
      }
      b.scrollIntoView({ block: 'center', behavior: 'auto' });
      const r = b.getBoundingClientRect();
      const na = r.width > 0 ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
      if (na && b.contains(na)) {
        w.__z33skip = { l: r.left, r: r.right, h: r.height, dohvatljiv: true, na: '' };
        b.click();
        return;
      }
      trazi = true;
      w.__z33skip = undefined;
      (w as unknown as { __z33skipNa?: string }).__z33skipNa = na ? `${na.tagName}.${na.className}` : 'nista';
      requestAnimationFrame(pokusaj);
    };
    const o = new MutationObserver(() => {
      const b = document.querySelector<HTMLButtonElement>('#progressView .z33 [data-z33="skip"]');
      if (b && !b.hidden && !trazi) { o.disconnect(); pokusaj(); }
    });
    document.addEventListener('DOMContentLoaded', () => {
      o.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
    });
  });
  await pokreni(page);
  await expect(z33(page)).toBeVisible({ timeout: 20_000 });
  pusti();
  await page.waitForFunction(() => (window as unknown as { __z33skip?: unknown }).__z33skip != null, null, { timeout: 60_000 });
  const k = await page.evaluate(() => {
    const w = window as unknown as { __z33skip: { l: number; r: number; h: number; dohvatljiv: boolean; na: string }; __z33skipNa?: string };
    return { ...w.__z33skip, na: w.__z33skip.na || w.__z33skipNa || '' };
  });
  expect(k.dohvatljiv, `"Preskoči" nije dohvatljiv: ${k.na}`).toBe(true);
  expect(k.l).toBeGreaterThanOrEqual(0);
  expect(k.r).toBeLessThanOrEqual(361);
  expect(k.h, 'cilj dodira najmanje 44 px').toBeGreaterThanOrEqual(44);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 10_000 });
});

test('Z33 "Preskoči" s tipkovnice: odmah zavrsno stanje i rezultat, fokus na presudi', async ({ page }) => {
  test.setTimeout(120_000);
  const pusti = await pripremi(page, 'dark');
  await pokreni(page);
  await expect(z33(page)).toBeVisible({ timeout: 20_000 });
  pusti();
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
  const pusti = await pripremi(page, 'light');
  await pokreni(page, FIXTURE_POPRAVAK);
  await expect(z33(page)).toBeVisible({ timeout: 20_000 });
  pusti();
  const plan = z33(page).locator('[data-z33="plan"]');
  await expect(plan).toHaveText('Napravi plan popravka');
  // Gumb je dohvatljiv tek kad je presuda otipkana (prije toga `visibility: hidden`); klik ide u
  // tom trenutku, u stranici, nakon provjere da je gumb na svom mjestu vidljiv i nepokriven.
  const stanje = await naGotovojPresudi(page, true);
  expect(stanje.dohvatljiv, 'gumb plana nije dohvatljiv za klik').toBe(true);
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
  const pusti = await pripremi(page, 'dark');
  await pokreni(page);
  await expect(z33(page)).toBeVisible({ timeout: 20_000 });
  pusti();
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

/**
 * Z33-09 (Codex): ISTI DOCX i profil kroz dva toka s ISTIM zavrsnim rendererom. Kontrola je tok bez
 * analize uzivo: dohvat modula Z33 je odbijen, pa ekran provjere ostaje kompaktni popis faza i
 * rezultat se prikazuje odmah (Z33-02). `?resultRenderer=legacy` za to ne valja, jer mijenja i
 * zavrsni renderer. Ekran rezultata mora biti isti, a zavrsno stanje uzivo isto kao on.
 */
const MODUL_Z33 = /\/analysis-live\/analysis-live\.ts(?:\?|$)|\/analysis-live-[\w-]+\.js(?:\?|$)/;

interface EkranRezultata {
  presuda: string; ocjena: string; sazetak: string; auto: string; radnja: string; nalazi: string[];
  /** Z34: oznaka i mjera svake kartice redom, i jezicci kategorija s brojem; uz Z8 prazno. */
  oznake: string[]; mjere: string[]; kategorije: string[];
}

/**
 * Stol Z34 pokazuje JEDNU karticu ("Nalaz 1 od N"), pa se puni popis cita listanjem do kraja
 * (navigacija ne omata). Svaka kartica daje naslov, oznaku ozbiljnosti i mjeru.
 */
async function karticeZ34(page: Page): Promise<{ nalazi: string[]; oznake: string[]; mjere: string[] }> {
  const k = page.locator('#resultCockpit');
  const brojac = k.locator('[data-rl-card] [data-desk-count]');
  const n = Number(/od (\d+)/.exec((await brojac.textContent()) ?? '')?.[1] ?? 0);
  const out = { nalazi: [] as string[], oznake: [] as string[], mjere: [] as string[] };
  for (let i = 1; i <= n; i += 1) {
    await expect(brojac).toHaveText(`${i} od ${n}`);
    const c = await k.locator('[data-rl-card]').evaluate((el) => {
      const t = (s: string): string => (el.querySelector(s)?.textContent ?? '').replace(/\s+/g, ' ').trim();
      return { naslov: t('.rl-card__title'), oznaka: t('.rl-card__eyebrow'), mjera: t('.rl-mr') };
    });
    out.nalazi.push(c.naslov);
    out.oznake.push(c.oznaka);
    out.mjere.push(c.mjera);
    if (i < n) await k.locator('[data-rl-card] .desk-nav__btn--next').click();
  }
  return out;
}

async function ekranRezultata(page: Page): Promise<EkranRezultata> {
  await expect(page.locator('#resultView')).toHaveAttribute('data-result-ready', '1', { timeout: 60_000 });
  const popis = '#resultCockpit .dq-title, #resultCockpit [data-cockpit-priority-card] h3, #resultCockpit .rl-card__title';
  await expect.poll(() => page.locator(popis).count(), { timeout: 20_000, message: 'ekran rezultata nema popis nalaza' }).toBeGreaterThan(0);
  // Z34: ocjena u prstenu raste od 0 do stvarne, a pecat ceka do kraja rasta ("ceka"). Cita se
  // tek kad je stol Z34 spreman i rast zavrsen (stanje, ne kasnjenje); uz Z8 toga nema.
  if (await page.locator('#resultCockpit [data-rl-card]').count() > 0) {
    await expect(page.locator('#resultCockpit')).toHaveAttribute('data-rl-ready', 'true', { timeout: 30_000 });
    await expect(page.locator('#resultCockpit [data-rl-stamp="ceka"]')).toHaveCount(0, { timeout: 10_000 });
  }
  // Z33-09 regresija: pecat se NE crta za needs-work/manual-review. Tada je 'stamp ceka = 0'
  // vakuumski zelen dok prsten Z34 i dalje broji 0 -> konacna ocjena (na CI-u 5 umjesto 72).
  // Ocjena u aria-label ne animira se i daje mjerodavan cilj za stvarnu brojcanu jezgru.
  const scoredRing = page.locator('#resultCockpit .cockpit-ring[data-cockpit-score="scored"]');
  if (await scoredRing.count()) {
    const described = await scoredRing.getAttribute('aria-label');
    const match = /^Tehnička ocjena (\d+) od (\d+)$/.exec(described ?? '');
    expect(match, 'bodovani prsten mora javno izreci mjerodavnu ocjenu i nazivnik').not.toBeNull();
    await expect(scoredRing.locator('.cockpit-ring__core'), 'ocjena se mora dovrsiti prije usporedbe dvaju tokova')
      .toHaveText(match![1], { timeout: 15_000 });
  }
  const osnova = await page.evaluate((sel) => {
    const t = (s: string): string => (document.querySelector(s)?.textContent ?? '').replace(/\s+/g, ' ').trim();
    return {
      presuda: t('#cockpitVerdictTitle'),
      ocjena: t('#resultCockpit .cockpit-ring__core'),
      sazetak: t('#resultCockpit .fsum-naslov'),
      auto: t('#resultCockpit .fsum-auto'),
      radnja: document.querySelector('#resultCockpit [data-cockpit-primary]')?.getAttribute('data-cockpit-action') ?? '',
      nalazi: [...document.querySelectorAll(sel)].map((n) => (n.textContent ?? '').trim()),
      kategorije: [...document.querySelectorAll('#resultCockpit [data-rl-tab]')].map((n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim()),
    };
  }, popis);
  const z34 = await page.locator('#resultCockpit [data-rl-card]').count() > 0;
  return z34 ? { ...osnova, ...(await karticeZ34(page)) } : { ...osnova, oznake: [], mjere: [] };
}

test('Z33-09 isti ulaz: rezultat uz analizu uzivo jednak je rezultatu bez nje, a zavrsno stanje uzivo je isto', async ({ page }) => {
  test.setTimeout(240_000);
  const pusti = await pripremi(page, 'dark');
  pusti();

  // KONTROLA: bez modula Z33.
  let odbijeno = 0;
  const odbij = async (route: Route): Promise<void> => { odbijeno += 1; await route.abort(); };
  await page.route(MODUL_Z33, odbij);
  await pokreni(page, FIXTURE_POPRAVAK);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 60_000 });
  expect(odbijeno, 'kontrola mora stvarno odbiti modul Z33').toBeGreaterThan(0);
  expect(await page.locator('#progressView .z33').count(), 'kontrola je ipak imala analizu uzivo').toBe(0);
  expect(await page.locator('#progressView .pscan').count()).toBe(1);
  const bez = await ekranRezultata(page);

  // Isti ulaz uz analizu uzivo, u svjezem dokumentu i bez zapamcenog stanja.
  await page.unroute(MODUL_Z33, odbij);
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* privatni prozor */ } });
  // Worker stoji dok se prikaz uzivo ne montira; inace spekulativna analiza zna zavrsiti prije
  // nego lijeni modul stigne, pa drugi prolaz ne dosegne `.z33` (Codex Z33-09, runda 2).
  const pustiDrugi = await zadrziWorker(page);
  await pokreni(page, FIXTURE_POPRAVAK);
  await expect(z33(page)).toBeVisible({ timeout: 20_000 });
  pustiDrugi();
  const uz = await ekranRezultata(page);
  await expect(z33(page)).toHaveAttribute('data-phase', 'final');

  expect(uz).toEqual(bez);
  // Zavrsno stanje uzivo (ostaje u skrivenom ekranu provjere) govori isto sto i rezultat.
  const kraj = await z33(page).evaluate((root) => ({
    presuda: (root.querySelector('[data-z33="verdicttext"]')?.textContent ?? '').trim(),
    ocjena: (root.querySelector('[data-z33="ringnum"]')?.textContent ?? '').trim(),
    sazetak: (root.querySelector('[data-z33="summary"]')?.textContent ?? '').trim(),
    nalazi: [...root.querySelectorAll('.z33-slot[data-state="filled"] .z33-slot-title')].map((n) => (n.textContent ?? '').trim()),
    plan: !(root.querySelector<HTMLElement>('[data-z33="plan"]')?.hidden ?? true),
    kategorije: [...root.querySelectorAll('.z33-cat-status')].map((n) => (n.textContent ?? '').trim()),
  }));
  expect(kraj.presuda).toBe(bez.presuda);
  expect(kraj.ocjena).toBe(bez.ocjena);
  expect(kraj.sazetak.startsWith(bez.sazetak + '.'), `${kraj.sazetak} / ${bez.sazetak}`).toBe(true);
  expect(kraj.nalazi.length).toBeGreaterThan(0);
  for (const n of kraj.nalazi) expect(bez.nalazi).toContain(n);
  expect(kraj.plan).toBe(bez.radnja === 'repair-safe');
  // Kategorije (Codex Z33-09, runda 2): zbroj nalaza po kategorijama uzivo jednak je broju
  // otvorenih nalaza rezultata (sazetak, a uz Z34 i jezicak "Sve" i broj kartica na stolu).
  const zbroj = kraj.kategorije.reduce((s, c) => s + (Number(/^(\d+) nalaz/.exec(c)?.[1]) || 0), 0);
  const otvoreno = Number(/^(\d+)/.exec(bez.sazetak)?.[1] ?? 0);
  expect(otvoreno, 'fixture mora imati otvorene nalaze').toBeGreaterThan(0);
  expect(zbroj, `kategorije uzivo: ${kraj.kategorije.join(', ')}`).toBe(otvoreno);
  if (bez.oznake.length) {
    expect(Number(/^Sve\s*(\d+)$/.exec(bez.kategorije[0] ?? '')?.[1]), `jezicak Sve: ${bez.kategorije[0]}`).toBe(otvoreno);
    expect(bez.nalazi).toHaveLength(otvoreno);
  }
});
