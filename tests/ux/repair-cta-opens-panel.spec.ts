import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { potvrdiProfil } from './confirm-profile';
import { cekajApp, cekajKorak } from './app-ready';

/**
 * Glavni poziv na popravak MORA dovesti do VIDLJIVOG panela popravka.
 *
 * Vanjski audit 2026-09-08 (nalaz 2, P1), potvrdjen na origin/master 2438bbd4: klik na "Popravi
 * sigurne stavke" (i "Simuliraj") zvao je samo `scrollToRepairPanel`, koja otkriva `#resultDetails` i
 * `#tabDetails` i prebacuje karticu, ali NE otvara nadredjeni blok `#resultCockpitAdvancedContent`.
 * `ensureResultsCockpitAdvancedShell` u taj blok seli SVE iza cockpita i zadano ga sklapa, pa je panel
 * imao visinu 0: kartica je prebacena, skrol nije imao metu, korisnik je gledao isti ekran i sam morao
 * otvoriti "Naprednu provjeru". Isti kvar je nasljedjivao i novi plan popravka (`[data-repair-plan-go]`
 * u desk-mount.ts), jer i on emitira `repair-safe`.
 *
 * Nijedan Playwright spec nije mjerio vidljivost NAKON klika: `repair-panel.spec.ts` sam otvara
 * `open-findings` pa tek onda dira panel, a jedinicni testovi tvrde samo da je akcija EMITIRANA.
 *
 * DOKAZ DA GARD GRIZE: ovaj spec je 2026-09-09 vrcen nad `src/ui/app.ts` BEZ popravka i pao je na
 * `#repairPanelMount` "hidden" u oba projekta; s popravkom (jedan redak u `scrollToRepairPanel`) prolazi.
 *
 * STO SE PROMIJENILO 2026-09-12 (korak B3): panel je dobio VLASTITU POVRSINU (`#repairView`), a
 * `#repairPanelMount` je izasao iz `innerHTML` kartice "Spremnost za predaju". Time kvar iz audita
 * postaje STRUKTURNO NEMOGUC: nema kartice koju bi trebalo rasklopiti, pa ni visine 0. Tvrdnje o
 * `#resultCockpitAdvancedContent` zato odlaze, jer bi mjerile mehaniku koje vise nema.
 *
 * JAMSTVO OSTAJE ISTO i zato se spec ne brise: glavni poziv na popravak mora dovesti do VIDLJIVOG
 * i fokusiranog panela. Mijenja se samo cime se to mjeri.
 *
 * Tok do rezultata je namjerno isti kao u `repair-panel.spec.ts` (fixture, odbijanje trake privole,
 * reducedMotion, `scroll-behavior:auto`), ali BEZ klika na `open-findings`: bas to stanje korisnik
 * napusta prvim klikom na popravak, i bas ono do sada nije bilo mjereno. Dupliciran je s referencom
 * umjesto izdvojen u helper, da se ne dira spec koji druga sesija upravo mijenja.
 */
const fixture = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

async function analyzeToResult(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const st = document.createElement('style');
    st.textContent = 'html,body,*{scroll-behavior:auto!important}';
    document.documentElement.appendChild(st);
  });
  await page.goto('/rad/');
  const odbij = page.locator('#analyticsDecline');
  if (await odbij.isVisible().catch(() => false)) {
    await odbij.click();
    await expect(page.locator('#consentBanner')).toBeHidden();
  }
  await cekajApp(page);
  await page.locator('#fileInput').setInputFiles(fixture);
  await cekajKorak(page, '2');
  await expect(page.locator('#analyzeBtn')).toBeEnabled();
  await page.locator('#analyzeBtn').click();
  await potvrdiProfil(page);
  await expect(page.locator('#resultView')).toBeVisible({ timeout: 90_000 });
}

test.describe('CTA popravka otvara panel', () => {
  test.setTimeout(300_000);

  test('klik na "Popravi sigurne stavke" (ili "Simuliraj") ostavlja panel VIDLJIV i fokusiran', async ({ page }) => {
    await analyzeToResult(page);

    // BASELINE: prije klika je vidljiv NALAZ, a povrsina popravka je skrivena. Bez ove tvrdnje
    // test bi mogao prolaziti zato sto je panel vec otvoren iz drugog razloga, a ne zbog CTA-a.
    const povrsina = page.locator('#repairView');
    await expect(povrsina, 'povrsina popravka mora biti skrivena prije klika').toBeHidden();
    await expect(page.locator('#resultView')).toBeVisible();

    // Jedan od dva CTA-a MORA biti omogucen; tihi `if` bi ovdje pretvorio nedostatak gumba u prolaz.
    const safe = page.locator('#resultCockpit [data-cockpit-action="repair-safe"]');
    const simulate = page.locator('#resultCockpit [data-cockpit-action="simulate-repair"]');
    const safeEnabled = (await safe.count()) > 0 && (await safe.first().isEnabled());
    const simulateEnabled = (await simulate.count()) > 0 && (await simulate.first().isEnabled());
    expect(safeEnabled || simulateEnabled, 'ni repair-safe ni simulate-repair nisu omoguceni').toBe(true);
    await (safeEnabled ? safe : simulate).first().click();

    await expect(povrsina, 'CTA popravka mora otvoriti fazu popravka').toBeVisible();
    await expect(page.locator('#resultView'), 'nalaz i popravak ne smiju biti vidljivi istovremeno').toBeHidden();
    const mount = page.locator('#repairPanelMount');
    await expect(mount, 'panel popravka mora biti vidljiv nakon CTA').toBeVisible();
    const fokusUnutar = await page.evaluate(() => {
      const m = document.getElementById('repairPanelMount');
      const a = document.activeElement;
      return !!m && !!a && m.contains(a);
    });
    expect(fokusUnutar, 'fokus mora biti unutar panela popravka').toBe(true);

    // POVRATAK NE GUBI ODABIR, i to se MJERI a ne obecava (od C6, 2026-09-12, bez grane
    // "neizmjereno": fixture MORA imati kucicu, inace je tvrdnja prazna i spec pada). Kucica se
    // prvo PREKLOPI kroz ledger, kao korisnik, da se ocuvanje ne mjeri nad zadanim stanjem koje bi
    // i ponovna gradnja panela dala; zatim se ode na nalaz i natrag. Mount je staticki element
    // rute, pa ga nista ne prepisuje.
    const ruleId = await page.evaluate(() => {
      const cb = [...document.querySelectorAll<HTMLInputElement>('#repairPanelMount li.lekta-repair-panel__item input[type="checkbox"]')].find((c) => c.checked);
      return cb?.closest<HTMLElement>('li')?.dataset.ruleId ?? null;
    });
    expect(ruleId, 'panel nema predodabranu kucicu; ocuvanje odabira se ne moze izmjeriti na ovom fixtureu').toBeTruthy();
    const stanje = (id: string) => page.evaluate((rid) => {
      const cb = document.querySelector<HTMLInputElement>(`#repairPanelMount li.lekta-repair-panel__item[data-rule-id="${rid}"] input[type="checkbox"]`);
      return cb ? cb.checked : null;
    }, id);
    await mount.locator('.lekta-repair-trigger__btn').click();
    const ledger = page.locator('.modal-backdrop[data-lekta-repair-ledger-modal]');
    await expect(ledger).toBeVisible();
    await ledger.locator(`.lekta-repair-ledger-row[data-rule-id="${ruleId}"]`).click();
    await page.keyboard.press('Escape');
    await expect(ledger).toBeHidden();
    const prije = await stanje(ruleId!);
    expect(prije, 'preklop kroz ledger mora promijeniti kucicu iz zadanog (oznacenog) stanja').toBe(false);

    await page.locator('#repairBackToResults').click();
    await expect(page.locator('#resultView'), 'povratak mora vratiti na nalaz').toBeVisible();
    await expect(povrsina).toBeHidden();
    await (safeEnabled ? safe : simulate).first().click();
    await expect(povrsina).toBeVisible();
    const poslije = await stanje(ruleId!);
    expect(poslije, 'panel je nestao pri povratku, dakle nesto ga prepisuje').not.toBeNull();
    expect(poslije, 'odabir nije prezivio povratak na nalaz').toBe(prije);
  });

  test('plan popravka (`[data-repair-plan-go]`) vodi na isti vidljiv panel, ako je stol prisutan', async ({ page }) => {
    await analyzeToResult(page);
    const go = page.locator('[data-repair-plan-go]');
    const stol = await page.locator('[data-desk-host]').count();
    if (stol === 0) {
      // Izricito, ne tiho: kad stola nema u ovom fixtureu, spec to KAZE, pa se ne moze citati kao
      // da je put kroz plan izmjeren.
      test.info().annotations.push({ type: 'preskoceno', description: 'fixture nema [data-desk-host]; put kroz plan nije izmjeren' });
      expect(await go.count()).toBe(0);
      return;
    }
    const otvori = page.locator('[data-desk-plan-open]');
    if ((await otvori.count()) > 0) await otvori.first().click();
    await expect(go.first()).toBeVisible();
    await go.first().click();
    await expect(page.locator('#repairView')).toBeVisible();
    await expect(page.locator('#repairPanelMount')).toBeVisible();
  });
});
