import path from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { cekajApp, cekajKorak } from './app-ready';
import { potvrdiProfil } from './confirm-profile';
import { expectInsideFold } from './fold';

/**
 * RADNI PROSTOR NA TRI SIRINE ZASLONA, KROZ CIJELI TOK (korak D, 2026-09-13).
 *
 * 390 (telefon), 768 (tablet uspravno) i 1440 (radna stanica) px, i to kroz sve faze: dokument,
 * profil, provjera u tijeku, nalaz, popravak, povratak na nalaz. Na svakoj postaji se mjeri isto:
 *  - nema vodoravnog prelijevanja (`scrollWidth <= clientWidth + 1`), i na `html` i na `.analyzer-wrap`;
 *  - traka faza stoji u JEDNOM retku;
 *  - dugo ime datoteke i velik broj nalaza ne guraju kontrole zaglavlja izvan zaslona.
 * Na 390 px se uz to tvrdi da je primarna radnja faze Dokument (`#browseBtn`) vidljiva BEZ skrolanja.
 *
 * VELIK BROJ NALAZA nije pretpostavka nego sentinel: fixture je `word-veliki-neuredan.docx`, koji u
 * goldenu ima najvise nalaza (18, izjednacen s `typografija-i-literatura.docx`), a tvrdnja trazi da ih
 * na ekranu bude vise od 10. Kad bi netko fixture zamijenio urednim radom, spec bi pao ovdje, a ne
 * tiho prolazio nad tri nalaza koja ne mogu nista izgurati.
 *
 * VIEWPORT SE POSTAVLJA U TESTU, pa jedan projekt (chromium) dostaje za sve tri sirine: sirina je ono
 * sto se mjeri, a ne uredaj. Mobilni projekt donosi dodir i `isMobile`, sto je druga os i vec ima
 * `mobile-critical-path`. WebKit i Firefox ulaze kroz allowlistu matrice preglednika.
 *
 * MUTACIJA (izvedena, vidi poruku commita): `min-width:1200px` na `.analyzer-wrap` u
 * `page-app.css` obara tvrdnju o prelijevanju na 390 px.
 */
const FIXTURE = path.resolve('tests/fixtures/docx/word-veliki-neuredan.docx');
const DUGO_IME = 'Diplomski rad - konacna verzija - nakon mentora - ispravljeno - za predaju - v7 FINAL.docx';

const SIRINE: ReadonlyArray<{ w: number; h: number; ime: string }> = [
  { w: 390, h: 844, ime: 'telefon' },
  { w: 768, h: 1024, ime: 'tablet' },
  { w: 1440, h: 900, ime: 'radna stanica' },
];

type Mjera = {
  html: [number, number];
  wrap: [number, number];
  trakaRaspon: number;
  trakaVisina: number;
  trakaKoraka: number;
  lampaDesno: number | null;
};

async function izmjeri(page: Page): Promise<Mjera> {
  return page.evaluate(() => {
    const h = document.documentElement;
    const w = document.querySelector('.analyzer-wrap') as HTMLElement | null;
    const traka = document.querySelector('.wizard-rail') as HTMLElement | null;
    const koraci = traka ? [...traka.querySelectorAll('.rail-step')].map((s) => s.getBoundingClientRect()) : [];
    const lampa = document.getElementById('themeBtn')?.getBoundingClientRect() ?? null;
    const vrh = koraci.length ? Math.min(...koraci.map((r) => r.top)) : 0;
    const dno = koraci.length ? Math.max(...koraci.map((r) => r.bottom)) : 0;
    return {
      html: [h.scrollWidth, h.clientWidth],
      wrap: w ? [w.scrollWidth, w.clientWidth] : [0, 0],
      trakaRaspon: koraci.length ? Math.max(...koraci.map((r) => r.y)) - Math.min(...koraci.map((r) => r.y)) : -1,
      // Visina RETKA FAZA (unija okvira triju koraka), NE cijele trake: izmjereno na 768 px, traka je
      // visoka 76,6 px jer naslov obrasca ("Obrazac LK-01 ...") ispod 900 px NAMJERNO ide u vlastiti
      // red (`.rail-form-title{width:100%}`), a faze ostaju u jednom. Prag nad cijelom trakom bi
      // mjerio taj naslov, dakle dizajn a ne prelom.
      trakaVisina: koraci.length ? dno - vrh : -1,
      trakaKoraka: koraci.length,
      lampaDesno: lampa ? lampa.x + lampa.width : null,
    };
  });
}

async function postaja(page: Page, w: number, gdje: string): Promise<void> {
  const m = await izmjeri(page);
  // SENTINELI: bez njih bi `0 <= 0 + 1` prolazilo nad neiscrtanim elementom.
  expect(m.html[1], `sentinel ${gdje}: html.clientWidth je 0`).toBeGreaterThan(0);
  expect(m.wrap[1], `sentinel ${gdje}: .analyzer-wrap nije iscrtan`).toBeGreaterThan(0);
  expect(m.trakaKoraka, `sentinel ${gdje}: traka nema koraka`).toBe(3);

  expect(m.html[0], `${gdje} @${w}: dokument se vodoravno prelijeva (${m.html[0]} > ${m.html[1]})`).toBeLessThanOrEqual(m.html[1] + 1);
  expect(m.wrap[0], `${gdje} @${w}: obrazac se vodoravno prelijeva (${m.wrap[0]} > ${m.wrap[1]})`).toBeLessThanOrEqual(m.wrap[1] + 1);
  // Jedan redak: razlika u `y` je poravnanje osnovice (izmjereno < 1 px), prelom bi bio ~22 px.
  expect(m.trakaRaspon, `${gdje} @${w}: koraci trake su se prelomili u vise redaka`).toBeLessThan(8);
  expect(m.trakaVisina, `${gdje} @${w}: redak faza je narastao preko jednog retka`).toBeLessThan(40);
  expect(m.lampaDesno, `sentinel ${gdje}: lampa nema polozaj`).not.toBeNull();
  expect(m.lampaDesno!, `${gdje} @${w}: kontrole zaglavlja su izgurane izvan zaslona`).toBeLessThanOrEqual(w);
}

/** Potvrda profila ILI izravni nalaz: za ovaj fixture se ne pretpostavlja koji od ta dva put ide. */
async function pokreniAnalizu(page: Page): Promise<void> {
  const gumb = page.locator('#analyzeBtn');
  await expect(gumb).toBeEnabled({ timeout: 60_000 });
  await gumb.click();
  await expect(page.locator('[data-confirm-profile]:visible, #resultView:visible').first()).toBeVisible({ timeout: 120_000 });
  if ((await page.locator('#resultView:not(.hidden)').count()) === 0) await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 120_000 });
}

for (const { w, h, ime } of SIRINE) {
  test(`${ime} ${w}x${h}: cijeli tok bez prelijevanja, traka u jednom retku, zaglavlje na zaslonu`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: w, height: h });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      const st = document.createElement('style');
      st.textContent = 'html,body,*{scroll-behavior:auto!important}';
      document.documentElement.appendChild(st);
    });
    await page.goto('/rad/');
    await page.locator('#analyticsDecline').click({ timeout: 3_000 }).catch(() => {});
    await cekajApp(page);

    // DOKUMENT. Na telefonu primarna radnja mora biti u prvom ekranu; na sirim je to trivijalno pa
    // se ne tvrdi (tvrdnja koja ne moze pasti nije tvrdnja).
    await postaja(page, w, 'Dokument');
    if (w === 390) {
      await expectInsideFold(page, '#browseBtn', h);
      await expectInsideFold(page, '#dropzone', h);
    }

    // PROFIL, s DUGIM imenom datoteke: isti bajtovi, drugo ime.
    await page.locator('#fileInput').setInputFiles({
      name: DUGO_IME,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: readFileSync(FIXTURE),
    });
    await cekajKorak(page, '2');
    // Rok 20 s, ne zadanih 5: traka se puni iz dogadjaja o prihvacenom dokumentu, a WebKit pod
    // opterecenim strojem do njega stigne kasnije nego do koraka 2 (izmjereno u koraku D: pao na 5 s,
    // dok je sonda 2,5 s poslije uploada traku vec vidjela). Isti rok nosi `workspace-entry` za obnovu.
    await expect(page.locator('#radDocBar')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#radDocName')).toHaveText(DUGO_IME);
    await postaja(page, w, 'Profil');
    // Na uskom zaslonu znacka "Lokalno" u zaglavlju ODLAZI (ista tvrdnja stoji u tijelu): do koraka D je
    // to pravilo gadjalo klasu koje nema (`.rad-doc-local`), pa je znacka bila jedan od cetiri retka
    // kojima je traka dokumenta na 390 px prerasla navigaciju (111 px u 66 px). Mjeri se computed
    // `display`, ne prisutnost pravila.
    if (w === 390) {
      const znacka = await page.locator('.site-chrome__doc .local-badge').evaluate((el) => getComputedStyle(el).display);
      expect(znacka, 'znacka u zaglavlju mora otici na 390 px').toBe('none');

      // TRAKA DOKUMENTA NE PRELAZI SVOJU NAVIGACIJU. Izmjereno u koraku D: `#radDocBar` je bio
      // 76 px visok u navigaciji od 66 px (tri retka: ime, indikator, gumb nove verzije), pocinjao
      // na y=-5 i prelazio na obrazac ispod. Okvir trake mora ostati unutar okvira `.nav-rad`, i
      // ne smije dosegnuti `.analyzer-wrap`.
      const okviri = await page.evaluate(() => {
        const bar = document.getElementById('radDocBar')?.getBoundingClientRect() ?? null;
        const nav = document.querySelector('.site-chrome__bar')?.getBoundingClientRect() ?? null;
        const wrap = document.querySelector('.analyzer-wrap')?.getBoundingClientRect() ?? null;
        return {
          bar: bar ? { top: bar.top, bottom: bar.bottom, height: bar.height } : null,
          nav: nav ? { top: nav.top, bottom: nav.bottom, height: nav.height } : null,
          wrap: wrap ? { top: wrap.top } : null,
        };
      });
      // SENTINELI: bez visine oba okvira bi prazan/neiscrtan element lazno prosao usporedbu rubova.
      expect(okviri.bar?.height ?? 0, 'sentinel: #radDocBar nema visinu').toBeGreaterThan(0);
      expect(okviri.nav?.height ?? 0, 'sentinel: .site-chrome__bar nema visinu').toBeGreaterThan(0);
      expect(
        okviri.bar!.top,
        `traka dokumenta pocinje (top=${okviri.bar!.top}) iznad svoje navigacije (top=${okviri.nav!.top})`,
      ).toBeGreaterThanOrEqual(okviri.nav!.top);
      expect(
        okviri.bar!.bottom,
        `traka dokumenta izlazi (bottom=${okviri.bar!.bottom}) izvan svoje navigacije (bottom=${okviri.nav!.bottom})`,
      ).toBeLessThanOrEqual(okviri.nav!.bottom + 1);
      if (okviri.wrap) {
        expect(
          okviri.bar!.bottom,
          `traka dokumenta (bottom=${okviri.bar!.bottom}) preklapa obrazac (top=${okviri.wrap.top})`,
        ).toBeLessThanOrEqual(okviri.wrap.top + 1);
      }
    }

    // PROVJERA U TIJEKU je prolazna; mjeri se oportunisticki (prikaz zna zavrsiti prije ocitanja),
    // a NALAZ obavezno.
    await pokreniAnalizu(page);
    await postaja(page, w, 'Nalaz');

    // SENTINEL VELIKOG BROJA NALAZA: naslov sazetka nosi broj ("N stvari ..."); mora biti > 10.
    const brojNalaza = await page.evaluate(() => {
      const t = document.querySelector('.fsum-naslov')?.textContent ?? '';
      return Number(t.match(/^\d+/)?.[0] ?? NaN);
    });
    expect(brojNalaza, 'sentinel: fixture mora dati vise od 10 nalaza, inace test velikog broja nalaza nista ne mjeri').toBeGreaterThan(10);

    // POPRAVAK, pa povratak. Jedan od dva CTA-a mora biti omogucen, tihi `if` bi prazninu pretvorio u prolaz.
    const safe = page.locator('#resultCockpit [data-cockpit-action="repair-safe"]');
    const simulate = page.locator('#resultCockpit [data-cockpit-action="simulate-repair"]');
    const safeEnabled = (await safe.count()) > 0 && (await safe.first().isEnabled());
    const simulateEnabled = (await simulate.count()) > 0 && (await simulate.first().isEnabled());
    expect(safeEnabled || simulateEnabled, 'ni repair-safe ni simulate-repair nisu omoguceni').toBe(true);
    await (safeEnabled ? safe : simulate).first().click();
    await expect(page.locator('#repairView')).toBeVisible();
    await postaja(page, w, 'Popravak');

    await page.locator('#repairBackToResults').click();
    await expect(page.locator('#resultView')).toBeVisible();
    await postaja(page, w, 'Povratak na nalaz');
  });
}
