import path from 'node:path';
import { expect, test } from '@playwright/test';

const FIXTURE = path.resolve('tests/fixtures/docx/fer-diplomski-prazni-odlomci.docx');

/**
 * UX SPECOVI RADNOG PROSTORA `/rad/`. Zaseban od `intake-entry`, jer gard u
 * `tests/intake-entry-boundary.test.ts` brani `goto('/')` svakoj datoteci koja spominje
 * analizatorske selektore, a mjeri po DATOTECI (po testu ne moze bez parsiranja). Tvrdnje o ulazu
 * i tvrdnje o radnom prostoru zato ne smiju dijeliti datoteku.
 */

test('/rad/: radni prostor je vidljiv ODMAH, bez ijednog klika', async ({ page }) => {
  /**
   * Na `/rad/` korisnik dolazi S DOKUMENTOM, pa nema sto otkljucavati. Do reza je ondje stajao
   * marketinski hero (naslov, demo papir, post-it, ocjena, "Ucitaj rad"), a carobnjak je bio
   * `display:none` iza `.lek-col-form:not(.lek-engaged) .analyzer-wrap`, gdje `.lek-engaged`
   * postavlja ISKLJUCIVO JS na klik tog papira.
   *
   * ZASTO OVA TVRDNJA POSTOJI: cetiri postojeca UX speca (`desktop-flow`, `a11y-states`,
   * `parser-parity`, `repair-panel`) kliknu cover PRIJE nego bilo sto provjere, pa bi svi ostali
   * zeleni i da je carobnjak nevidljiv. Mjere put starog korisnika, ne stanje ekrana.
   */
  await page.goto('/rad/');
  await expect(page.locator('#wizardView')).toBeVisible();
  await expect(page.locator('#dropzone')).toBeVisible();
});

test('/rad/ korak Pravila: potvrda je ekran, kontrole cekaju iza Promijeni', async ({ page }) => {
  /**
   * `UX_PRINCIPLES.md` odjeljak 2 trazi: "jedan redak s popunjenim defaultom, primarna akcija
   * Potvrdi, promjena sekundarna i skrivena iza promijeni, cilj nula do jedan tap". Do
   * 2026-09-07 je bilo obrnuto: devet selectova kao glavni sadrzaj, kartica profila ispod njih,
   * a pokretanje provjere tek na SLJEDECEM koraku.
   *
   * Koraci 2 i 3 su spojeni: potvrda JEST pokretanje, pa `lek-stepnav-2` ("Nastavi na provjeru")
   * vise ne postoji kao treci gumb za istu radnju.
   *
   * PISE SE KAO TEST, NE KAO RUCNO MJERENJE, i to je nauceno danas: rucno uzorkovanje preko
   * `waitForTimeout` dalo je pet razlicitih ocitanja istog stanja, ovisno o tome je li `app.ts`
   * stigao zavrsiti boot. `expect(locator)` ponavlja dok ne istekne, pa mjeri stanje a ne trenutak.
   */
  await page.goto('/rad/');
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  // Korak 2 dolazi SAM kad je detekcija pouzdana (`isConfidentDetection`), bez klika na
  // "Nastavi na profil". To je i smisao "nula do jedan tap": kad je studij prepoznat iz
  // dokumenta, korisniku preostaje samo potvrda.
  await expect(page.locator('#wizardView')).toHaveAttribute('data-step', '2');

  // Kartica je ekran: vidi se profil i obje akcije.
  // Duzi rok NIJE skrivanje sporosti: kartica se crta u `updateProfile`, koji CEKA pravila
  // profila (`ensureProfileRules`, mrezni dohvat). Na hladnom posluzitelju to premasi zadanih
  // 5 s, pa bi kraci rok mjerio brzinu prvog prevodjenja modula, a ne postojanje kartice.
  await expect(page.locator('#analyzeProfile .ap-kartica')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-confirm-profile]')).toBeVisible();
  await expect(page.locator('[data-change-profile]')).toBeVisible();
  // Provjera se pokrece s OVOG koraka: spajanje 2 i 3.
  await expect(page.locator('#analyzeBtn')).toBeVisible();

  // Kontrole cekaju iza "Promijeni".
  // Stupac profila ima DVA obrasca (ustanova/fakultet/studij, pa vrsta rada), pa se broji
  // koliko ih je vidljivo umjesto da se bira jedan: tvrdnja nad `.first()` bi prosla i da je
  // drugi ostao na ekranu.
  await expect(page.locator('.wizard-col-profile .form-grid:visible')).toHaveCount(0);
  await page.locator('[data-change-profile]').click();
  const vidljivi = await page.locator('.wizard-col-profile .form-grid:visible').count();
  expect(vidljivi, 'nakon Promijeni moraju se otvoriti SVI obrasci profila').toBeGreaterThan(1);
  await expect(page.locator('#institutionSelect')).toBeFocused();
});

test('/rad/ zaglavlje: identitet, ucitani dokument i gdje se obraduje, bez marketinga', async ({ page }) => {
  /**
   * Brif vlasnika: "Marketing je zavrsio onog trenutka kada je student ubacio svoj diplomski."
   * Do 2026-09-07 je zaglavlje radne povrsine nosilo 12 marketinskih poveznica i CTA "Provjeri
   * rad" koji vodi na stranicu na kojoj korisnik vec jest.
   *
   * ZASTO SE MJERI VIDLJIVOST, A NE POSTOJANJE U HTML-u: stara navigacija se na uskom zaslonu
   * krila CSS-om (`.nav-links{display:none}`) i selila u `#mobileNav`. Tvrdnja "nema ih u
   * izvoru" bi zato bila zelena i da su samo premjestene, sto je upravo ono sto se ne zeli.
   */
  await page.goto('/rad/');
  const zaglavlje = page.locator('header.topbar');
  await expect(zaglavlje.getByRole('link', { name: 'Lekta' })).toBeVisible();
  await expect(zaglavlje.locator('a[href*="landing_benchmark"], a[href*="landing_usporedba"], a[href*="#pricing"], a[href*="#faq"]')).toHaveCount(0);
  await expect(zaglavlje.getByRole('link', { name: 'Provjeri rad' })).toHaveCount(0);

  // Bez dokumenta traka NE tvrdi nista: prazno ime uz znacku "Lokalno" bi izgledalo kao da je
  // nesto ucitano. Ovo je stanje korisnika koji dodje izravno na `/rad/`.
  await expect(page.locator('#radDocBar')).toBeHidden();

  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await expect(page.locator('#radDocBar')).toBeVisible();
  await expect(page.locator('#radDocName')).toHaveText(path.basename(FIXTURE));
  await expect(page.locator('.rad-doc-local')).toBeVisible();

  // Traka ostaje kroz KORAKE, jer je zaglavlje, a ne dio jednog prikaza. Postojeci
  // `#stepFileName` i `#resultFileName` zive svaki u svom pogledu; da traka bila cetvrti takav
  // pisac, razisla bi se s njima cim se koji pogled preskoci.
  await expect(page.locator('#wizardView')).toHaveAttribute('data-step', '2');
  await expect(page.locator('#radDocName')).toHaveText(path.basename(FIXTURE));
});

test('/rad/ zaglavlje: dugo ime datoteke se skracuje, a ne gura kontrole s ekrana', async ({ page }) => {
  /**
   * STVARAN RIZIK, IZMJEREN: `.rad-doc` je flex stavka, a flex stavka se po zadanome NE SMIJE
   * stisnuti ispod sirine svog sadrzaja (`min-width:auto`). Bez `min-width:0` dugo ime gurne
   * lampu i prijavu izvan zaslona umjesto da se skrati.
   *
   * SIRINA SE POSTAVLJA OVDJE, i to je popravak vlastite greske od danas. Prva verzija je mjerila
   * na zadanih 1280 px i imala `test.skip` za sve osim chromiuma. Ondje traka ima 890 px a ime
   * treba 516, dakle pritiska nema i `min-width:0` se nikad ne aktivira: obje mutacije (bez
   * roditeljskog, bez djetetovog, bez oba) PROSLE su zeleno. Isti razred kao gard nad
   * `scroll-margin` ranije danas: tvrdnja postavljena ondje gdje ne moze pasti.
   *
   * Izmjereno na 390 px, s istim dugim imenom:
   *     s `min-width:0`   ime 93 px (skraceno), desni rub lampe 378   <= 390  ispravno
   *     bez               ime 516 px,           desni rub lampe 801   >  390  kvar
   */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/rad/');
  await page.locator('#fileInput').setInputFiles({
    name: 'Diplomski rad - konacna verzija - nakon mentora - ispravljeno - za predaju.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: (await import('node:fs')).readFileSync(FIXTURE),
  });
  await expect(page.locator('#radDocBar')).toBeVisible();

  const lampa = await page.locator('#themeBtn').boundingBox();
  expect(lampa, 'lampa mora imati mjerljiv polozaj').toBeTruthy();
  expect(lampa!.x + lampa!.width, 'lampa je izgurana izvan zaslona dugim imenom').toBeLessThanOrEqual(390);

  // Ime se mora STVARNO skratiti, a ne samo stati slucajno: bez ove tvrdnje bi prosla i izvedba
  // koja ime prelomi u vise redaka ili ga sakrije, sto nije isto sto i skracivanje.
  const skraceno = await page.locator('#radDocName').evaluate((e) => e.scrollWidth > e.clientWidth + 1);
  expect(skraceno, 'ime mora biti skraceno s trotockom, a ne stati u cijelosti').toBe(true);
});

test('/rad/ zaglavlje: preziviljava obnovu sesije, jer se pretplacuje prije nje', async ({ page }) => {
  /**
   * OVO JE TVRDNJA KOJU KOMENTAR U `workspace/main.ts` DAJE, pa mora biti mjerena, ne vjerovana.
   *
   * `wireDocumentBar()` mora stajati prije nego `restoreDocument` pozove `loadAnalyzerDocument`.
   * `emitAnalyzerDocumentSettled` obavjescuje nad KOPIJOM skupa pretplatnika, izricito zato da
   * pretplatnik dodan TIJEKOM obavijesti ne dobije taj isti dogadjaj; posljedica u drugom smjeru
   * je da pretplatnik dodan POSLIJE propusta prijem obnovljenog dokumenta, pa zaglavlje ostaje
   * prazno iznad uredno ucitanog rada, sto je gore od nepostojece trake.
   *
   * Mutacijom izmjereno gdje je granica STVARNO, jer ju je prvi opis promasio: pomak tik prije
   * `openWorkspace` test NE obara (taj je poziv await-an, pa je ucitavanje i dalje iza njega),
   * a pomak iza `restoreDocument` ga obara. Tvrdnja bez te druge mutacije bila bi vakuumska.
   */
  await page.goto('/rad/');
  await page.locator('#fileInput').setInputFiles(FIXTURE);
  await expect(page.locator('#radDocBar')).toBeVisible();
  // Sesija je zapisana tek kad se fragment pojavi u URL-u; bez tog cekanja bi ponovno ucitavanje
  // otislo na golu `/rad/` i test bi mjerio prvi dolazak, ne obnovu.
  await expect(page).toHaveURL(/#session=/, { timeout: 20_000 });

  await page.reload();
  await expect(page.locator('#radDocBar')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#radDocName')).toHaveText(path.basename(FIXTURE));
});
