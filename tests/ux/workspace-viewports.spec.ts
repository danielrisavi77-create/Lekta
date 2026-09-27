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
    // ZNACKA "Lokalno" JE OD Z15 KRUGA POPRAVKA U TIJELU, NE VISE U ZAGLAVLJU. Do ovog kruga je
    // zivjela u pilili `.site-chrome__doc` i na uskom zaslonu je odlazila (`display:none`), jer je
    // dijelila visinu zaglavlja sa stepperom i imenom. Sad je u `#radDocMeta`, ispod trake, gdje
    // visina zaglavlja nije ogranicenje, pa ostaje vidljiva i na 390 px.
    if (w === 390) {
      const znacka = await page.locator('#radDocMeta .local-badge').evaluate((el) => getComputedStyle(el).display);
      expect(znacka, 'znacka u tijelu mora ostati vidljiva i na 390 px').not.toBe('none');

      // LJEPLJIVO ZAGLAVLJE IMA PRORACUN, I TO JE NOVA OSNOVA GARDA (Z15, krug popravka).
      //
      // Do Z15 je tvrdnja bila "okvir `#radDocBar` je unutar okvira `.nav-rad`", jer je `.nav`
      // imao FIKSNU visinu (66 px, `page-chrome.css`), pa je traka dokumenta od 76 px mogla
      // prekoraciti svoj okvir. Traka Z15 je grid BEZ fiksne visine, a `#radDocBar` je njezin
      // potomak u toku: okvir djeteta je tada po konstrukciji unutar okvira roditelja i ta tvrdnja
      // vise ne moze pasti ni za koju visinu zaglavlja. Ista sudbina je i usporedba s
      // `.analyzer-wrap`, koji u toku stoji ispod zaglavlja i pomice se s njim.
      //
      // Zato se mjeri ono sto je kvar stvarno bio: KOLIKO ZASLONA ZAGLAVLJE POJEDE. Proracun je
      // 124 px na 390 px zaslona (16%), a stanja su izmjerena u Chromiumu nad stvarnim zaglavljem
      // `rad/index.html` i stvarnim `site-chrome.css`: 177 px prije popravka (tri reda, lampa i
      // hamburger ispod trake dokumenta), 113 px poslije (dva reda, uz vidljiv gumb "Ucitaj novu
      // verziju"), 110 px nakon skrola, 88 px bez tog gumba. Prag pada na zatecenom stanju, dakle
      // nije vakuumski; razlika do proracuna je rezerva za mjere pisma, koja u toj probi nije bila
      // ucitana.
      const okviri = await page.evaluate(() => {
        const box = (el: Element | null): { top: number; bottom: number; height: number } | null => {
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, height: r.height };
        };
        return {
          bar: box(document.getElementById('radDocBar')),
          zaglavlje: box(document.querySelector('header.site-chrome')),
          burger: box(document.getElementById('mobileMenuBtn')),
          lampa: box(document.getElementById('themeBtn')),
        };
      });
      // SENTINELI: bez visine bi prazan/neiscrtan element lazno prosao svaku usporedbu rubova.
      expect(okviri.bar?.height ?? 0, 'sentinel: #radDocBar nema visinu').toBeGreaterThan(0);
      expect(okviri.zaglavlje?.height ?? 0, 'sentinel: header.site-chrome nema visinu').toBeGreaterThan(0);
      expect(okviri.burger?.height ?? 0, 'sentinel: #mobileMenuBtn nema visinu').toBeGreaterThan(0);
      expect(okviri.lampa?.height ?? 0, 'sentinel: #themeBtn nema visinu').toBeGreaterThan(0);
      expect(
        okviri.zaglavlje!.height,
        `ljepljivo zaglavlje pojede ${Math.round(okviri.zaglavlje!.height)} px od ${h} px zaslona`,
      ).toBeLessThanOrEqual(124);
      // PRVI RED JE LOGO, LAMPA, HAMBURGER (Z15). Kad su lampa i hamburger pali u TRECI red ispod
      // trake dokumenta, ova dva praga su padala: burger.top je bio 136, a doc.top 51.
      expect(
        okviri.burger!.bottom,
        `hamburger (bottom=${okviri.burger!.bottom}) je ispod trake dokumenta (top=${okviri.bar!.top})`,
      ).toBeLessThanOrEqual(okviri.bar!.top + 1);
      expect(
        okviri.lampa!.bottom,
        `lampa (bottom=${okviri.lampa!.bottom}) je ispod trake dokumenta (top=${okviri.bar!.top})`,
      ).toBeLessThanOrEqual(okviri.bar!.top + 1);
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

    if (w === 390) {
      // TANKO STANJE NAKON SKROLA: proracun zaglavlja vrijedi i ondje, a ime dokumenta OSTAJE
      // (Z15). Mjeri se TU, nad nalazom, a ne prije analize: prije nje stranica ne mora biti dulja
      // od zaslona, pa se stanje nakon skrola ne bi dalo izazvati i tvrdnja bi tiho postala prazna.
      const skrolano = await page.evaluate(() => {
        window.scrollTo(0, 240);
        return Math.round(window.scrollY);
      });
      // 40 px je prag tankog stanja (`SITE_CHROME_SCROLL_THRESHOLD` u `src/shared/site-chrome.ts`);
      // ovdje stoji kao broj, jer ovaj list ne uvozi module aplikacije (nijedan `tests/ux/*` ne
      // uvozi `src/`, a uvoz bi vukao JSON i pohranu u Playwrightov transform).
      expect(skrolano, 'sentinel: nalaz se ne da skrolati, tanko stanje se ne da izmjeriti').toBeGreaterThan(40);
      await expect(page.locator('header.site-chrome.site-chrome--scrolled')).toHaveCount(1);
      const poslijeSkrola = await page.evaluate(() => {
        const el = document.querySelector('header.site-chrome');
        return el ? el.getBoundingClientRect().height : 0;
      });
      expect(poslijeSkrola, 'sentinel: zaglavlje nakon skrola nema visinu').toBeGreaterThan(0);
      expect(poslijeSkrola, `zaglavlje nakon skrola pojede ${Math.round(poslijeSkrola)} px`).toBeLessThanOrEqual(124);
      await expect(page.locator('#radDocName')).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
    }

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
