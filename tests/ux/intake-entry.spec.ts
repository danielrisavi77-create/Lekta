import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * UX SPECOVI ULAZA `/`. Zaseban od `free-tools-audit`, i to nije uredovanje nego posljedica garda.
 *
 * `tests/intake-entry-boundary.test.ts` tvrdi da nijedan spec koji spominje analizator ne smije
 * navigirati na `/` (analizator je nakon reza 2026-09-05 na `/rad/`). Gard mjeri po DATOTECI, jer
 * po testu ne moze bez parsiranja, pa bi tvrdnja o ulazu smjestena u datoteku punu analizatorskih
 * selektora pala iako s analizatorom nema veze. Ulazni specovi zato zive ovdje.
 */

test('ulaz `/` nema vodoravni scroll u uskom prozoru', async ({ page }) => {
  /**
   * MJERI SE U OBICNOM (desktop) KONTEKSTU, NE U MOBILNOJ EMULACIJI, i to je cijela poanta.
   *
   * Prva izvedba ovog garda stajala je u `mobile-chromium` projektu i NIJE MOGLA PASTI: uz
   * mobilnu emulaciju `viewport` meta prosiri vidno polje da sadrzaj stane (izmjereno na 375 px:
   * `innerWidth` postane 385 i izjednaci se sa `scrollWidth`), pa vodoravnog scrolla ondje nema
   * ni kad se sadrzaj prelijeva. Mutacija je zato prosla i izgledala kao da gard ne grize.
   *
   * Stvaran slucaj je USKI PROZOR NA RACUNALU: ondje se prelijevanje vidi kao vodoravna traka.
   * Izmjereno 2026-09-07: `.hero-atmos` (snop lampe) prelijeva izvan roditelja
   * (`inset: -8% -6% -12%`), roditelj ga ne smije rezati jer bi odrezao sjenu papira i listove
   * ispod njega, pa je dokument bio sirok 384 px u prozoru od 375.
   */
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  const mjera = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(mjera.scroll, `dokument je siri od prozora za ${mjera.scroll - mjera.viewport} px`)
    .toBeLessThanOrEqual(mjera.viewport);
});

/**
 * ZIVI LIST (ALIGNMENT Z32, varijanta B). Mjeri se na stvarnoj ruti, u oba projekta (desktop i
 * Pixel 5), jer pribor mijenja mjesto na 900 px, a hover tragova postoji samo uz mis.
 *
 * Postavke (`lekta.preferences.v2`) se podmecu PRIJE ucitavanja (`addInitScript`), jer kartica
 * fakulteta cita isti izvor kao plocica u traci; bez njih predodabira nema, pa kartica kaze da ce
 * fakultet biti prepoznat iz rada. Fakultet NIJE uvjet za ubacivanje (odluka vlasnika
 * 2026-09-27); vrata otvara samo rok.
 */
const DOCX = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');
/**
 * Dokument koji detekcija na `/rad/` prepoznaje kao FPZG (izmjereno 2026-09-27 kroz
 * `detectContextFromText`: fpzg, "Prijediplomski studij Politologija", zavrsni). `DOCX` iznad
 * detekcija NE prepoznaje (null), a `fpzg-novinarstvo-bibliografija.docx` je ispod praga ulaza
 * (`MIN_DOCX_BYTES`), pa ga ulaz odbija prije primopredaje.
 */
const DOCX_FPZG = path.resolve('tests/fixtures/docx/lo-fpzg-zavrsni-uskladjen.docx');
const POSTAVKE = { unit: 'fer', program: 'Računarstvo', workType: 'graduate' };

async function sPostavkama(page: Page): Promise<void> {
  await page.addInitScript((p) => {
    // Samo pri PRVOM ucitavanju kartice: navigacija na /rad/ ne smije ponovno prepisati pohranu.
    if (sessionStorage.getItem('z32-init')) return;
    sessionStorage.setItem('z32-init', '1');
    localStorage.setItem('lekta.preferences.v2', JSON.stringify(p));
  }, POSTAVKE);
}

const gumb = (page: Page) => page.locator('.intake-paper__gumb');

test('Z32: CTA je zatvoren bez roka, "Još ne znam rok" ga otvara i bez potvrde fakulteta', async ({ page }) => {
  await sPostavkama(page);
  await page.goto('/');
  await expect(gumb(page)).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#intakeHint')).toHaveText('Prvo potvrdi rok');
  // Zatvorena vrata: klik na list NE otvara odabir datoteke, nego kaze da rad nije primljen i
  // vodi na rok. Klika se po listu (naslov), ne po gumbu: Playwright odbija kliknuti
  // `aria-disabled` element, a ploha lista vodi isti tok (kontroler slusa cijeli `#intakeDropzone`).
  let otvoren = false;
  page.on('filechooser', () => { otvoren = true; });
  await page.locator('.intake-title').click();
  await expect(page.getByLabel('Rok predaje')).toBeFocused();
  await expect(page.locator('#intakeError')).toHaveText('Rad nije primljen: prvo upiši rok predaje ili označi „Još ne znam rok“.');
  expect(otvoren, 'zatvorena vrata su otvorila odabir datoteke').toBe(false);

  // Predodabir iz postavki se nudi na potvrdu, ali nije uvjet.
  await expect(page.locator('[data-intake-fakultet]')).toHaveText('FER · Računarstvo · Dipl.');
  await expect(page.locator('[data-intake-fakultet-izvor]')).toHaveText(' · prepoznato iz profila');
  await page.getByLabel('Još ne znam rok').check();
  await expect(page.locator('[data-intake-potvrdi]')).toHaveAttribute('aria-pressed', 'false');
  await expect(gumb(page)).toHaveAttribute('aria-disabled', 'false');
  await expect(page.locator('#intakeHint')).toHaveText('ili ispusti dokument ovdje');
  await expect(page.locator('[data-intake-rok-pecat]')).toHaveText('Rok nije zadan');
  await expect(page.locator('#intakeError')).toBeHidden();

  // Otvorena vrata: dodir ili klik lista otvara odabir datoteke (Z32 tocka 4, mobitel).
  const odabir = page.waitForEvent('filechooser');
  await page.locator('.intake-title').click();
  await odabir;
});

test('Z32: upisan rok spusta pecat sa stvarnim datumom i brojem dana', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 23, 12));
  await page.goto('/');
  await page.getByLabel('Rok predaje').fill('2026-10-15');
  await expect(page.locator('[data-intake-rok-pecat]')).toHaveText('Rok 15. 10. · 22 dana');
});

test('Z32: ispustanje bilo gdje upisuje ime u zaglavlje, a pecat prolazi "Čeka provjeru" -> "Čitam"', async ({ page }) => {
  await sPostavkama(page);
  const pecati: string[] = [];
  const imena: string[] = [];
  await page.exposeFunction('z32Biljezi', (vrsta: string, tekst: string) => { (vrsta === 'pecat' ? pecati : imena).push(tekst); });
  await page.goto('/');
  await page.locator('[data-intake-potvrdi]').click();
  await page.getByLabel('Još ne znam rok').check();
  await page.evaluate(() => {
    const w = window as unknown as { z32Biljezi: (v: string, t: string) => void };
    const pecat = document.querySelector('[data-intake-pecat]')!;
    const ime = document.querySelector('[data-intake-ime]')!;
    w.z32Biljezi('pecat', pecat.textContent ?? '');
    new MutationObserver(() => w.z32Biljezi('pecat', pecat.textContent ?? '')).observe(pecat, { childList: true, characterData: true, subtree: true });
    new MutationObserver(() => w.z32Biljezi('ime', ime.textContent ?? '')).observe(ime, { childList: true, characterData: true, subtree: true });
  });
  const bajtovi = [...readFileSync(DOCX)];
  // Povlacenje PODIZE list (dragenter na cijelom ekranu), ispustanje izvan lista ga predaje dalje.
  await page.evaluate((b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'rad.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
    (window as unknown as { z32Podignut: boolean }).z32Podignut = document.getElementById('intakeDropzone')!.classList.contains('is-podignut');
    document.querySelector('.site-footer')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, bajtovi);
  // Primopredaja nastavlja kao i prije Z32: sesija je spremljena i preglednik je na /rad/.
  await page.waitForURL(/\/rad\/#session=/);
  expect(pecati[0]).toBe('Čeka provjeru');
  expect(pecati, 'pecat nije presao u "Čitam"').toContain('Čitam');
  // Ime se upisivalo SLOVO PO SLOVO, pa su medjustanja zabiljezena, a zadnje je cijelo ime.
  expect(imena.length, 'ime nije tipkano nego upisano odjednom').toBeGreaterThan(3);
  expect(imena).toContain('rad');
  expect(imena[imena.length - 1]).toBe('rad.docx');
  // Z32 tocka 7: potvrda je vezana za OVU sesiju, a rok ceka /rad/ kroz sigurni omotac.
  const sesija = new URL(page.url()).hash.replace('#session=', '');
  const zapis = await page.evaluate(() => JSON.parse(localStorage.getItem('lekta.intake.v1') ?? 'null'));
  expect(zapis.rok).toEqual({ datum: null, neznam: true });
  // rokSesije je mapa po id-u sesije (odluka: rok se veze uz rad, ne uz jedini slot).
  expect(zapis.rokSesije, 'rok tog rada za Z34 i Z36').toEqual({ [sesija]: { datum: null, neznam: true } });
  expect(zapis.potvrda).toMatchObject({ unit: 'fer', program: 'Računarstvo', workType: 'graduate', sesija });
});

/** Ispustanje datoteke s diska NA list (`#intakeDropzone`), istim putem kao test iznad. */
async function ispustiNaList(page: Page, datoteka: string, ime: string): Promise<void> {
  const bajtovi = [...readFileSync(datoteka)];
  await page.evaluate(({ b, n }) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], n, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    document.getElementById('intakeDropzone')!.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { b: bajtovi, n: ime });
}

test('Z32: posjetitelj BEZ postavki i linka ubacuje rad nakon "Još ne znam rok"; fakultet se prepoznaje iz rada', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-intake-fakultet-napomena]')).toHaveText('Prepoznat ćemo ga iz rada.');
  await expect(page.locator('[data-intake-potvrdi]')).toBeHidden();
  await expect(page.locator('[data-intake-promijeni]')).toBeHidden();
  // Bez roka: ispustanje na list se odbija s porukom i nigdje ne vodi.
  await ispustiNaList(page, DOCX, 'rad.docx');
  await expect(page.locator('#intakeError')).toHaveText('Rad nije primljen: prvo upiši rok predaje ili označi „Još ne znam rok“.');
  expect(page.url(), 'zatvorena vrata su primila rad').not.toMatch(/\/rad\//);
  await page.getByLabel('Još ne znam rok').check();
  await ispustiNaList(page, DOCX_FPZG, 'rad.docx');
  await page.waitForURL(/\/rad\/#session=/);
  const zapis = await page.evaluate(() => JSON.parse(localStorage.getItem('lekta.intake.v1') ?? 'null'));
  expect(zapis.potvrda ?? null, 'nista nije potvrdjeno').toBeNull();
  // /rad/ radi kao i prije: detekcija iz dokumenta prepoznaje fakultet i to kaze; promjena je na kartici.
  await expect(page.locator('#detectBadge')).toContainText('Prepoznato iz dokumenta', { timeout: 30_000 });
  await expect(page.locator('#unitSelect')).toHaveValue('fpzg');
  await expect(page.locator('#analyzeProfile [data-change-profile]')).toBeVisible({ timeout: 30_000 });
});

test('Z32: fakultet potvrdjen na / (?unit=fer, bez studija) stize na /rad/ potvrdjen i ne trazi se ponovo', async ({ page }) => {
  await page.goto('/?unit=fer');
  await expect(page.locator('[data-intake-fakultet]')).toHaveText('FER');
  await expect(page.locator('[data-intake-fakultet-izvor]')).toHaveText(' · s poveznice');
  await page.locator('[data-intake-potvrdi]').click();
  await expect(page.locator('[data-intake-fakultet-izvor]')).toHaveText(' · potvrđeno');
  await page.getByLabel('Još ne znam rok').check();
  await ispustiNaList(page, DOCX, 'rad.docx');
  await page.waitForURL(/\/rad\/(\?[^#]*)?#session=/);
  const sesija = new URL(page.url()).hash.replace('#session=', '');
  const zapis = await page.evaluate(() => JSON.parse(localStorage.getItem('lekta.intake.v1') ?? 'null'));
  expect(zapis.potvrda).toMatchObject({ unit: 'fer', program: null, sesija });
  // Kartica profila na /rad/ nosi potvrdjeni FER. Ovaj dokument detekcija ne prepoznaje, pa
  // kartica istinito trazi samo STUDIJ (nije ga prepoznala), ne fakultet.
  await expect(page.locator('#analyzeProfile .ap-ustanova')).toHaveText('Fakultet elektrotehnike i računarstva', { timeout: 30_000 });
  await expect(page.locator('#unitSelect')).toHaveValue('fer');
  await expect(page.locator('#analyzeProfile .ap-upozorenje')).toHaveText(/^Nisam prepoznao studij/);
  await expect(page.locator('#detectBadge')).not.toContainText('Prepoznato iz dokumenta');
});

/**
 * IZRAVAN SIGNAL da potvrda s ulaza, a ne detekcija, drzi fakultet: dokument DRUGOG fakulteta
 * (FPZG) uz potvrdjen FER. Kontrola u istom testu: isti tok BEZ klika na "Potvrdi" daje FPZG, pa
 * tvrdnja "ostaje FER" nije prazna.
 */
test('Z32: potvrdjen fakultet s ulaza pobjeduje detekciju drugog fakulteta iz dokumenta', async ({ page }) => {
  // KONTROLA: bez potvrde detekcija prebaci fakultet na onaj iz dokumenta.
  await page.goto('/?unit=fer');
  await page.getByLabel('Još ne znam rok').check();
  await ispustiNaList(page, DOCX_FPZG, 'fpzg.docx');
  await page.waitForURL(/\/rad\/(\?[^#]*)?#session=/);
  await expect(page.locator('#detectBadge')).toContainText('Prepoznato iz dokumenta', { timeout: 30_000 });
  await expect(page.locator('#unitSelect')).toHaveValue('fpzg');

  // S potvrdom: fakultet ostaje FER, a znacka kaze zasto studij nije prepoznat.
  await page.goto('/?unit=fer');
  await page.locator('[data-intake-potvrdi]').click();
  await page.getByLabel('Još ne znam rok').check();
  await ispustiNaList(page, DOCX_FPZG, 'fpzg.docx');
  await page.waitForURL(/\/rad\/(\?[^#]*)?#session=/);
  // Znacka istinito imenuje prepoznati fakultet i nudi oba gumba (Z32: napomenaDrugiFakultet).
  // `#detectBadge` zivi unutar `#profileSheet` (list za promjenu profila), koji ovaj tok ne
  // otvara, pa se ondje provjerava sadrzaj; VIDLJIVOST mjeri napomena izvan lista (test ispod).
  const znacka = page.locator('#detectBadge');
  await expect(znacka).toContainText(NAPOMENA_FPZG_FER, { timeout: 30_000 });
  await expect(znacka.locator('button')).toHaveText(GUMBI_FPZG_FER);
  await expect(page.locator('#unitSelect')).toHaveValue('fer');
});

/**
 * NAPOMENA SE POKAZUJE SAMA (odluka vlasnika 2026-09-27, "Da, sama"). Isti tok kao iznad (FER
 * potvrdjen na `/`, dokument FPZG-a), ali se mjeri VIDLJIVOST bez otvaranja lista profila:
 * napomena stoji u `#facultyConflict` uz karticu profila, s oba gumba. Prvi prolaz: "Zadrži"
 * zatvara napomenu, a FER ostaje. Drugi prolaz (nova sesija): "Prebaci" mijenja profil na FPZG.
 */
const NAPOMENA_FPZG_FER = 'Dokument izgleda kao rad koji pripada fakultetu Fakultet političkih znanosti. Na ulazu je potvrđen Fakultet elektrotehnike i računarstva.';
const GUMBI_FPZG_FER = ['Prebaci na Fakultet političkih znanosti', 'Zadrži Fakultet elektrotehnike i računarstva'];

async function doRadaSPotvrdjenimFer(page: Page): Promise<void> {
  await page.goto('/?unit=fer');
  await page.locator('[data-intake-potvrdi]').click();
  await page.getByLabel('Još ne znam rok').check();
  await ispustiNaList(page, DOCX_FPZG, 'fpzg.docx');
  await page.waitForURL(/\/rad\/(\?[^#]*)?#session=/);
}

test('Z32: napomena o drugom prepoznatom fakultetu vidljiva je sama; "Zadrži" je zatvara, "Prebaci" mijenja profil', async ({ page }) => {
  await doRadaSPotvrdjenimFer(page);
  const napomena = page.getByTestId('faculty-conflict');
  await expect(napomena).toBeVisible({ timeout: 30_000 });
  await expect(napomena).toHaveAttribute('role', 'status');
  await expect(napomena.locator('.fc-tekst')).toHaveText(NAPOMENA_FPZG_FER);
  await expect(napomena.locator('button')).toHaveText(GUMBI_FPZG_FER);
  await expect(napomena.locator('button').first()).toBeVisible();
  await expect(napomena.locator('button').last()).toBeVisible();
  // Bez otvaranja lista profila, i bez otimanja fokusa.
  await expect(page.locator('#profileSheet')).toBeHidden();
  expect(await napomena.evaluate((el) => el.contains(document.activeElement)), 'fokus se ne otima').toBe(false);

  await napomena.getByRole('button', { name: GUMBI_FPZG_FER[1] }).click();
  await expect(napomena).toBeHidden();
  await expect(napomena.locator('button')).toHaveCount(0);
  await expect(page.locator('#unitSelect')).toHaveValue('fer');
  await expect(page.locator('#analyzeProfile .ap-ustanova')).toHaveText('Fakultet elektrotehnike i računarstva');

  await doRadaSPotvrdjenimFer(page);
  await expect(napomena).toBeVisible({ timeout: 30_000 });
  await napomena.getByRole('button', { name: GUMBI_FPZG_FER[0] }).click();
  await expect(napomena).toBeHidden();
  await expect(page.locator('#unitSelect')).toHaveValue('fpzg');
  await expect(page.locator('#analyzeProfile .ap-ustanova')).toHaveText('Fakultet političkih znanosti');
});

/**
 * FOKUS PRI ZATVARANJU NAPOMENE (nalaz pregleda, WCAG 2.4.3). Gumb koji zatvara napomenu nestaje
 * s njom; bez povrata fokus pada na `<body>` i sljedeci Tab krece s vrha stranice. Mjeri se
 * TIPKOVNICOM: Tab do "Zadrži", Enter, pa fokus mora stajati na "Analiziraj dokument", a sljedeci
 * Tab ici dalje od njega. Drugi prolaz isto mjeri za znacku u listu profila (`#detectBadge`):
 * fokus ostaje u listu, na izborniku fakulteta.
 */
test('Z32: tipkovnicom "Zadrži" zatvara napomenu, a fokus se vraca na smislen element', async ({ page }) => {
  await doRadaSPotvrdjenimFer(page);
  const napomena = page.getByTestId('faculty-conflict');
  await expect(napomena).toBeVisible({ timeout: 30_000 });
  const zadrzi = napomena.getByRole('button', { name: GUMBI_FPZG_FER[1] });
  let stigao = false;
  for (let i = 0; i < 150 && !stigao; i += 1) {
    await page.keyboard.press('Tab');
    stigao = await zadrzi.evaluate((el) => el === document.activeElement);
  }
  expect(stigao, 'Tab stize do "Zadrži"').toBe(true);
  await page.keyboard.press('Enter');
  await expect(napomena).toBeHidden();
  await expect(page.locator('#unitSelect')).toHaveValue('fer');
  const nakon = await page.evaluate(() => ({
    body: document.activeElement === document.body,
    id: document.activeElement?.id ?? '',
  }));
  expect(nakon.body, 'fokus nije pao na body').toBe(false);
  expect(nakon.id, 'fokus je na "Analiziraj dokument"').toBe('analyzeBtn');
  await page.keyboard.press('Tab');
  const sljedeci = await page.evaluate(() => {
    const aktivan = document.activeElement;
    const analiziraj = document.getElementById('analyzeBtn')!;
    return {
      body: aktivan === document.body,
      iza: !!aktivan && aktivan !== analiziraj
        && Boolean(analiziraj.compareDocumentPosition(aktivan) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  expect(sljedeci.body, 'sljedeci Tab ne pada na body').toBe(false);
  expect(sljedeci.iza, 'sljedeci Tab ide dalje od "Analiziraj dokument", ne s vrha').toBe(true);

  // Znacka u listu profila: list se otvara s kartice ("Promijeni"), gumb se aktivira Enterom.
  await doRadaSPotvrdjenimFer(page);
  await expect(napomena).toBeVisible({ timeout: 30_000 });
  await page.locator('#analyzeProfile [data-change-profile]').click();
  await expect(page.locator('#profileSheet')).toBeVisible();
  const zadrziUListu = page.locator('#detectBadge').getByRole('button', { name: GUMBI_FPZG_FER[1] });
  await zadrziUListu.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#detectBadge')).toBeHidden();
  const uListu = await page.evaluate(() => ({
    id: document.activeElement?.id ?? '',
    uListu: Boolean(document.activeElement?.closest('#profileSheet')),
  }));
  expect(uListu.id, 'fokus je na izborniku fakulteta').toBe('unitSelect');
  expect(uListu.uListu, 'fokus ostaje u listu profila').toBe(true);
});

/** Tab dok fokus ne stane na `gumb` (najvise 150 koraka); vraca je li stigao. */
async function tabDo(page: Page, gumb: Locator): Promise<boolean> {
  for (let i = 0; i < 150; i += 1) {
    await page.keyboard.press('Tab');
    if (await gumb.evaluate((el) => el === document.activeElement)) return true;
  }
  return false;
}

/** Profil u obrascu i tekst kartice, za usporedbu dvaju tokova nad istim radom. */
const profilObrasca = (page: Page) => page.evaluate(() => ({
  unit: (document.getElementById('unitSelect') as HTMLSelectElement).value,
  program: (document.getElementById('programSelect') as HTMLSelectElement).value,
  workType: (document.getElementById('workType') as HTMLSelectElement).value,
  kartica: document.getElementById('analyzeProfile')?.textContent ?? '',
}));

test('Z32: tipkovnicom "Prebaci" mijenja fakultet, a fokus se vraca na "Analiziraj dokument"', async ({ page }) => {
  await doRadaSPotvrdjenimFer(page);
  const napomena = page.getByTestId('faculty-conflict');
  await expect(napomena).toBeVisible({ timeout: 30_000 });
  expect(await tabDo(page, napomena.getByRole('button', { name: GUMBI_FPZG_FER[0] })), 'Tab stize do "Prebaci"').toBe(true);
  await page.keyboard.press('Enter');
  await expect(napomena).toBeHidden();
  await expect(page.locator('#unitSelect')).toHaveValue('fpzg');
  const nakon = await page.evaluate(() => ({
    body: document.activeElement === document.body,
    id: document.activeElement?.id ?? '',
  }));
  expect(nakon.body, 'fokus nije pao na body').toBe(false);
  expect(nakon.id, 'fokus je na "Analiziraj dokument"').toBe('analyzeBtn');
});

/**
 * NALAZ PREGLEDA (Codex, blocker): potvrdjen CIJELI profil (zapamcene postavke FER · Računarstvo
 * potvrdjene na `/`) preskakao je detekciju prije nego je napomena mogla nastati, pa student koji
 * je potvrdio FER i ubacio rad FPZG-a napomenu nije vidio. Testovi su pokrivali samo `?unit=fer`.
 */
test('Z32: potvrdjen cijeli profil (postavke FER · Računarstvo) uz rad FPZG-a pokazuje napomenu', async ({ page }) => {
  await sPostavkama(page);
  await page.goto('/');
  await expect(page.locator('[data-intake-fakultet]')).toHaveText('FER · Računarstvo · Dipl.');
  await page.locator('[data-intake-potvrdi]').click();
  await page.getByLabel('Još ne znam rok').check();
  await ispustiNaList(page, DOCX_FPZG, 'fpzg.docx');
  await page.waitForURL(/\/rad\/#session=/);
  const napomena = page.getByTestId('faculty-conflict');
  await expect(napomena).toBeVisible({ timeout: 30_000 });
  await expect(napomena.locator('.fc-tekst')).toHaveText(NAPOMENA_FPZG_FER);
  // Potvrdjeni profil stoji dok student ne odluci.
  await expect(page.locator('#unitSelect')).toHaveValue('fer');
  await expect(page.locator('#programSelect')).toHaveValue('Računarstvo');
  // "Prebaci" i ovdje prebacuje (potvrdjen profil sesije vise ne blokira detekciju).
  await napomena.getByRole('button', { name: GUMBI_FPZG_FER[0] }).click();
  await expect(napomena).toBeHidden();
  await expect(page.locator('#unitSelect')).toHaveValue('fpzg', { timeout: 30_000 });
  // Ponovno otvaranje: sesija sada ima vlastiti profil (C4 obnavlja FER), a odluka "Prebaci" se
  // ponovi, pa rad ostaje na FPZG-u, bez napomene.
  await page.reload();
  await expect(page.locator('#analyzeProfile .ap-ustanova')).toHaveText('Fakultet političkih znanosti', { timeout: 30_000 });
  await expect(page.locator('#unitSelect')).toHaveValue('fpzg');
  await expect(napomena).toBeHidden();
});

/**
 * NALAZ PREGLEDA (Codex, major): "Prebaci" je slao `change` obrascu, a `app.ts` na svaki `change`
 * izbornika profila oznaci cijeli profil potvrdjenim, pa je analiza mogla krenuti pod prvim
 * studijem FPZG-a bez ikakve potvrde studija. Sada "Prebaci" primijeni ono sto je detekcija
 * prepoznala, istim putem kao da fakulteta na ulazu nije ni bilo. ORAKL je taj drugi tok: isti rad
 * bez potvrde FER-a mora dati isti obrazac i istu karticu kao potvrda FER-a pa "Prebaci".
 */
test('Z32: "Prebaci" daje profil koji je detekcija prepoznala, ne prvi studij fakulteta', async ({ page }) => {
  await page.goto('/?unit=fer');
  await page.getByLabel('Još ne znam rok').check();
  await ispustiNaList(page, DOCX_FPZG, 'fpzg.docx');
  await page.waitForURL(/\/rad\/(\?[^#]*)?#session=/);
  await expect(page.locator('#detectBadge')).toContainText('Prepoznato iz dokumenta', { timeout: 30_000 });
  await expect(page.locator('#analyzeProfile .ap-ustanova')).toHaveText('Fakultet političkih znanosti', { timeout: 30_000 });
  const detektirano = await profilObrasca(page);

  await doRadaSPotvrdjenimFer(page);
  const napomena = page.getByTestId('faculty-conflict');
  await expect(napomena).toBeVisible({ timeout: 30_000 });
  await napomena.getByRole('button', { name: GUMBI_FPZG_FER[0] }).click();
  await expect(page.locator('#detectBadge'), 'primijenjena je detekcija, ne promjena obrasca').toContainText('Prepoznato iz dokumenta', { timeout: 30_000 });
  await expect(page.locator('#analyzeProfile .ap-ustanova')).toHaveText('Fakultet političkih znanosti');
  expect(await profilObrasca(page)).toEqual(detektirano);
});

/**
 * NALAZ PREGLEDA (Codex, major): "Zadrži" se pamtio samo u memoriji modula, pa je ponovno
 * otvaranje iste sesije (`/rad/#session=...`) napomenu vratilo. Odluka sada zivi uz sesiju, istim
 * mehanizmom kao rok i potvrda (`src/shared/intake-choice.ts`). Tisina se mjeri uz KONTROLU
 * vremena: pri prvom otvaranju mjeri se koliko nakon kartice profila napomena stigne, a poslije
 * ponovnog ucitavanja ceka se trostruko toliko (najmanje 3 s) prije tvrdnje da je nema.
 */
test('Z32: odluka o napomeni pamti se uz sesiju: ponovno otvaranje je ne vraca', async ({ page }) => {
  const kartica = page.locator('#analyzeProfile .ap-ustanova');
  const napomena = page.getByTestId('faculty-conflict');
  await doRadaSPotvrdjenimFer(page);
  await expect(kartica).toHaveText('Fakultet elektrotehnike i računarstva', { timeout: 30_000 });
  const t0 = Date.now();
  await expect(napomena).toBeVisible({ timeout: 30_000 });
  const kasnjenje = Date.now() - t0;
  await napomena.getByRole('button', { name: GUMBI_FPZG_FER[1] }).click();
  await expect(napomena).toBeHidden();
  await page.reload();
  await expect(kartica).toHaveText('Fakultet elektrotehnike i računarstva', { timeout: 30_000 });
  await page.waitForTimeout(Math.max(3_000, 3 * kasnjenje));
  await expect(napomena, '"Zadrži" vrijedi i nakon ponovnog otvaranja sesije').toBeHidden();
  await expect(page.locator('#unitSelect')).toHaveValue('fer');

  // "Prebaci" isto: ponovno otvaranje zadrzava prebaceni fakultet, bez napomene.
  await doRadaSPotvrdjenimFer(page);
  await expect(napomena).toBeVisible({ timeout: 30_000 });
  await napomena.getByRole('button', { name: GUMBI_FPZG_FER[0] }).click();
  await expect(page.locator('#unitSelect')).toHaveValue('fpzg', { timeout: 30_000 });
  await page.reload();
  await expect(kartica).toHaveText('Fakultet političkih znanosti', { timeout: 30_000 });
  await expect(page.locator('#unitSelect')).toHaveValue('fpzg');
  await expect(napomena).toBeHidden();
});

/**
 * NALAZ PREGLEDA (Codex, minor): zamjena dokumenta skrivala je samo znacku u listu, a vidljivi red
 * napomene o STAROM radu ostajao je popunjen (i klikljiv) dok se novi ne slegne; odbijen novi rad
 * ga je ostavljao zauvijek, jer brava pada tek na prihvacen drugi dokument. Mjeri se sinkrono, u
 * istom zadatku u kojem `change` stigne na `#fileInput`.
 */
test('Z32: zamjena dokumenta odmah gasi napomenu o starom radu', async ({ page }) => {
  await doRadaSPotvrdjenimFer(page);
  const napomena = page.getByTestId('faculty-conflict');
  await expect(napomena).toBeVisible({ timeout: 30_000 });
  const zamijeni = (bajtovi: number[], ime: string) => page.evaluate(({ b, n }) => {
    const input = document.getElementById('fileInput') as HTMLInputElement;
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], n, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return document.getElementById('facultyConflict')!.childElementCount;
  }, { b: bajtovi, n: ime });
  // Odbijen novi rad (nije ZIP): napomena ne smije ostati uz rad kojeg vise nema.
  expect(await zamijeni([...Buffer.from('ovo nije docx '.repeat(400))], 'kvar.docx'), 'odmah po odabiru').toBe(0);
  // Odbijanje se ceka po tekstu, ne po vidljivosti: `setFile(null)` vraca carobnjak na prvi korak,
  // pa poruka na sirokom prikazu moze biti u stupcu koji se tada ne crta.
  await expect(page.locator('#dropError')).toContainText('nije pravi .docx', { timeout: 30_000 });
  await expect(napomena).toBeHidden();
  expect(await napomena.evaluate((el) => el.childElementCount)).toBe(0);
});

test('Z32: povlacenje podize list, a napustanje ekrana ga spusta', async ({ page }) => {
  await page.goto('/');
  const podignut = () => page.evaluate(() => document.getElementById('intakeDropzone')!.classList.contains('is-podignut'));
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'rad.docx'));
    document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
  });
  expect(await podignut()).toBe(true);
  // translateY(-10px) je sesti clan matrice (ty); ceka se kraj prijelaza od .22 s.
  const ty = () => page.evaluate(() => {
    const t = getComputedStyle(document.getElementById('intakeDropzone')!).transform;
    return Number(t.match(/matrix\(([^)]+)\)/)?.[1].split(',')[5] ?? NaN);
  });
  await expect.poll(ty).toBeCloseTo(-10, 0);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'rad.docx'));
    document.body.dispatchEvent(new DragEvent('dragleave', { dataTransfer: dt, bubbles: true }));
  });
  expect(await podignut()).toBe(false);
});

test('Z32: 360 px bez preklapanja, pribor ispod lista', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await sPostavkama(page);
  await page.goto('/');
  await page.locator('[data-intake-potvrdi]').click();
  await page.getByLabel('Još ne znam rok').check();
  const kutije = await page.evaluate(() => {
    const k = (s: string) => { const r = document.querySelector(s)!.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
    return {
      scroll: document.documentElement.scrollWidth, viewport: window.innerWidth,
      papir: k('#intakeDropzone'), pribor: k('[data-intake-pribor]'),
      mete: ['.intake-zaglavlje', '.intake-pecat', '.intake-title', '.intake-lead', '.intake-cta', '.intake-hint', '[data-intake-rok-pecat]', '[data-intake-foot]'].map((s) => ({ s, ...k(s) })),
    };
  });
  expect(kutije.scroll, 'vodoravni scroll na 360 px').toBeLessThanOrEqual(kutije.viewport);
  expect(kutije.pribor.y, 'pribor nije ispod lista').toBeGreaterThanOrEqual(kutije.papir.y + kutije.papir.h - 1);
  for (const x of [kutije.papir, kutije.pribor]) expect(x.x + x.w).toBeLessThanOrEqual(kutije.viewport + 0.5);
  // Nijedna meta na listu ne lezi na drugoj (pecati su rotirani, pa se mjeri okvir u toku).
  const sijeku = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
    a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
  const sudari: string[] = [];
  kutije.mete.forEach((a, i) => kutije.mete.slice(i + 1).forEach((b) => {
    if ((a.s === '.intake-cta' && b.s === '.intake-hint') || (a.s === '.intake-hint' && b.s === '.intake-cta')) return;
    if (sijeku(a, b)) sudari.push(`${a.s} x ${b.s}`);
  }));
  expect(sudari).toEqual([]);
});

test('Z32: tragovi olovke jednom pri ucitavanju pa izblijede; pod prigusenim pokretom ih nema', async ({ page }) => {
  await page.goto('/');
  const neprozirnost = () => page.evaluate(() => Number(getComputedStyle(document.querySelector('.intake-tragovi')!).opacity));
  await expect.poll(neprozirnost, { timeout: 2_000 }).toBeGreaterThan(0.9);
  await expect.poll(neprozirnost, { timeout: 6_000 }).toBeLessThan(0.05);
  // Na racunalu se vracaju na hover lista; na dodirnom ekranu hovera nema, pa ni povratka.
  const mis = await page.evaluate(() => matchMedia('(hover:hover) and (pointer:fine)').matches);
  await page.locator('.intake-title').hover();
  if (mis) await expect.poll(neprozirnost).toBeGreaterThan(0.9);
  else expect(await neprozirnost()).toBeLessThan(0.05);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('.intake-tragovi')).toBeHidden();
  await expect(page.locator('.intake-trag').first()).toBeHidden();
});

/**
 * T89: BEZ `VITE_TURNSTILE_SITE_KEY` CAPTCHA NE SMIJE NI POSTOJATI. UX suite dize build bez tog
 * kljuca, pa je ovo tocno stanje produkcije prije ukljucivanja: nijedan zahtjev prema Cloudflareu,
 * nijedan spremnik widgeta, a ulaz predaje rad na /rad/ kao i prije.
 */
test('T89: bez site keyja Turnstile se ne ucitava i ne blokira ulaz', async ({ page }) => {
  const cloudflare: string[] = [];
  page.on('request', (req) => { if (req.url().includes('challenges.cloudflare.com')) cloudflare.push(req.url()); });
  await page.goto('/');
  await page.getByLabel('Još ne znam rok').check();
  await ispustiNaList(page, DOCX, 'rad.docx');
  await page.waitForURL(/\/rad\/#session=/);
  await expect(page.locator('[data-lekta-captcha]')).toHaveCount(0);
  expect(cloudflare, 'build bez kljuca je zvao Turnstile').toEqual([]);
});
